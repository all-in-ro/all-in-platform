import { phoneNumber, withinSendHours, segmentInfo, messageSettingsMatch, ARRIVAL_ONE_PART_POLICY, isArrivalOnePart } from './domain.js';
import { settingsFrom, audit } from './schema.js';
import { providerConfig } from './provider.js';
const workers=new WeakMap();
export function startSmsWorker(pool,{ensure,provider}) {
  if(workers.has(pool))return workers.get(pool);
  let busy=false;
  async function tick(){
    if(busy)return;busy=true;let db,locked=false;
    try{
      await ensure();db=await pool.connect();
      locked=(await db.query(`SELECT pg_try_advisory_lock(hashtext('aif_sms_dispatch_v1')::bigint) AS locked`)).rows[0].locked;
      if(!locked)return;
      // A crashed process may have sent the message before losing the HTTP response.
      // Never auto-retry this ambiguous state: manual provider verification is mandatory.
      const stale=await db.query(`UPDATE aif_sms_recipients SET status='unknown',reason='A küldő folyamat megszakadt; SMSLink-ellenőrzés szükséges.',updated_at=now() WHERE status='sending' AND send_started_at<now()-interval '2 minutes' RETURNING id,campaign_id`);
      for(const r of stale.rows)await audit(db,{campaignId:r.campaign_id,actor:'sms-worker',event:'send_unknown',payload:{recipientId:r.id}});
      // Delivery reports can arrive before the gateway acceptance response is persisted.
      const receivedReports=await db.query(`UPDATE aif_sms_recipients r SET status=CASE WHEN d.status=1 THEN 'delivered' ELSE 'undelivered' END,delivered_at=CASE WHEN d.status=1 THEN d.reported_at ELSE NULL END,updated_at=now()
        FROM aif_sms_dlr d WHERE r.provider_id=d.provider_id AND r.status IN('accepted','unknown') RETURNING r.id,r.campaign_id,r.customer_id,r.status,r.provider_id`);
      for(const r of receivedReports.rows)await audit(db,{campaignId:r.campaign_id,customerId:r.customer_id,actor:'smslink-dlr',event:r.status==='delivered'?'delivery_confirmed':'delivery_failed',payload:{recipientId:r.id,providerId:r.provider_id,buffered:true}});
      const finished=await db.query(`UPDATE aif_sms_campaigns c SET status='finished',finished_at=now(),updated_at=now()
        WHERE c.status IN('sending','queued') AND NOT EXISTS(SELECT 1 FROM aif_sms_recipients r WHERE r.campaign_id=c.id AND r.status IN('pending','sending')) RETURNING c.id,c.location_id`);
      for(const c of finished.rows)await audit(db,{campaignId:c.id,locationId:c.location_id,actor:'sms-worker',event:'campaign_finished'});
      const c=(await db.query(`SELECT * FROM aif_sms_campaigns WHERE status IN('queued','sending') ORDER BY launched_at,id LIMIT 1`)).rows[0];
      if(!c)return;
      const s=await settingsFrom(db);
      const pause=async reason=>{await db.query(`UPDATE aif_sms_campaigns SET status='paused',note=$2,updated_at=now() WHERE id=$1 AND status IN('queued','sending')`,[c.id,reason]);await audit(db,{campaignId:c.id,locationId:c.location_id,actor:'sms-worker',event:'campaign_auto_paused',payload:{reason}});};
      if(c.mode==='live'&&(!s.unsubscribePhone||c.definition?.unsubscribePhone!==s.unsubscribePhone)){
        await pause('A leiratkozási kapcsolattartó telefonszáma hiányzik vagy megváltozott. A címzettüzeneteket új kampányban kell elkészíteni.');return;
      }
      if(c.mode==='live'&&!messageSettingsMatch(c.definition,s,c.location_code)){
        await pause('Az SMS fejléce, az üzlet neve/címe, a webáruház címe vagy a leiratkozási mód megváltozott. Új kampányt kell előkészíteni.');return;
      }
      if(c.mode==='live'&&(!s.liveEnabled||!providerConfig().enabled)){await pause('Az éles küldés kikapcsolva.');return;}
      if(c.mode==='live'&&!withinSendHours(s)){await pause('Küldési csendidő. Nyitvatartási időben kézzel folytatható.');return;}
      const r=(await db.query(`SELECT * FROM aif_sms_recipients WHERE campaign_id=$1 AND status='pending' ORDER BY id LIMIT 1`,[c.id])).rows[0];
      if(!r)return;
      let reason='';
      const p=(await db.query(`SELECT p.*,c.phone AS current_phone,c.is_active,c.location_id,
        EXISTS(SELECT 1 FROM aif_sms_suppressions x WHERE x.phone=$2) AS suppressed
        FROM aif_sms_preferences p JOIN aif_shop_customers c ON c.id=p.customer_id WHERE p.customer_id=$1`,[r.customer_id,r.phone])).rows[0];
      if(!p||!p.is_active||String(p.location_id)!==String(c.location_id))reason='A kliens már nem aktív ebben az üzletben';
      else if(p.suppressed||!p.consent||!p[c.kind==='arrival'?'arrivals':'promotions'])reason='A kliens közben leiratkozott';
      else if(phoneNumber(p.current_phone)!==r.phone||p.phone!==r.phone)reason='A telefonszám megváltozott';
      else if(Number(p.version)!==Number(r.preference_version))reason='A kliens beállítása megváltozott az előnézet óta';
      if(!reason&&c.mode==='live'&&s.frequencyHours){
        const recent=(await db.query(`SELECT 1 FROM aif_sms_recipients r JOIN aif_sms_campaigns c ON c.id=r.campaign_id
          WHERE r.phone=$1 AND r.id<>$2 AND c.mode='live' AND r.status IN('sending','accepted','delivered','undelivered','unknown')
            AND r.send_started_at>now()-($3*interval '1 hour') LIMIT 1`,[r.phone,r.id,s.frequencyHours])).rowCount;
        if(recent)reason='Időközben másik kampányból már kapott SMS-t';
      }
      const coupon=(await db.query(`SELECT id,rules FROM aif_sms_coupons WHERE recipient_id=$1`,[r.id])).rows[0];
      if(coupon){const today=(await db.query(`SELECT ((now() AT TIME ZONE 'Europe/Bucharest')::date)::text AS date`)).rows[0].date;if(coupon.rules.validUntil<today)reason='A kupon lejárt a küldés előtt';}
      if(reason){await db.query(`UPDATE aif_sms_recipients SET status='skipped',reason=$2,updated_at=now() WHERE id=$1 AND status='pending'`,[r.id,reason]);await audit(db,{campaignId:c.id,customerId:r.customer_id,locationId:c.location_id,actor:'sms-worker',event:'recipient_skipped',payload:{recipientId:r.id,reason}});return;}
      let parts;
      try{parts=segmentInfo(r.message);}catch(e){await pause('Az SMS kodolasa vagy karakterkeszlete ervenytelen.');return;}
      if(parts.segments>s.maxSegments||parts.segments!==Number(r.segments)){
        await pause('Az üzenet hossza nem egyezik a jóváhagyott SMS-szel.');return;
      }
      if(c.kind==='arrival'&&c.mode==='live'&&(
        c.definition?.onePartPolicy!==ARRIVAL_ONE_PART_POLICY ||
        !isArrivalOnePart(r.message,r.segments)
      )){
        await pause('Egyrészes SMS-védelem: ez a kampány régi vagy több részből álló üzenetet tartalmaz. Készíts új kampányt.');return;
      }
      if(c.mode==='live'){
        const spent=(await db.query(`SELECT COALESCE(sum(r.segments),0)::int AS n FROM aif_sms_recipients r JOIN aif_sms_campaigns c ON c.id=r.campaign_id
          WHERE c.mode='live' AND r.status IN('sending','accepted','delivered','undelivered','unknown') AND (r.send_started_at AT TIME ZONE 'Europe/Bucharest')::date=(now() AT TIME ZONE 'Europe/Bucharest')::date`)).rows[0].n;
        if(spent+r.segments>s.dailySegmentLimit){await pause('Elértük a napi SMS-keretet.');return;}
        try{if((await provider.credit()).credit<r.segments){await pause('Nincs elegendő SMS-kredit.');return;}}catch{await pause('Az SMSLink-egyenleg nem ellenőrizhető.');return;}
      }
      // Atomically claim the recipient only while the campaign is still running.
      const claimed=await db.query(`UPDATE aif_sms_recipients SET status='sending',send_started_at=now(),updated_at=now() WHERE id=$1 AND status='pending'
        AND EXISTS(SELECT 1 FROM aif_sms_campaigns WHERE id=$2 AND status IN('queued','sending')) RETURNING id`,[r.id,c.id]);
      if(!claimed.rowCount)return;
      await db.query(`UPDATE aif_sms_campaigns SET status='sending',updated_at=now() WHERE id=$1 AND status='queued'`,[c.id]);
      await audit(db,{campaignId:c.id,customerId:r.customer_id,locationId:c.location_id,actor:c.launched_by,event:'send_started',payload:{recipientId:r.id,phone:r.phone,mode:c.mode}});
      try{
        if(c.mode==='test'){
          await db.query(`UPDATE aif_sms_recipients SET status='simulated',reason='Próbamód: nem történt hálózati SMS-küldés',updated_at=now() WHERE id=$1`,[r.id]);
          await audit(db,{campaignId:c.id,locationId:c.location_id,actor:'sms-worker',event:'send_simulated',payload:{recipientId:r.id}});return;
        }
        const result=await provider.send({phone:r.phone,message:r.message,sender:c.definition.sender,test:false});
        await db.query('BEGIN');
        await db.query(`UPDATE aif_sms_recipients SET status='accepted',provider_id=$2,provider_response=$3,accepted_at=now(),updated_at=now() WHERE id=$1`,[r.id,result.providerId,result.response]);
        await db.query(`UPDATE aif_sms_coupons SET status='active' WHERE recipient_id=$1 AND status='inactive' AND mode='live'`,[r.id]);
        await audit(db,{campaignId:c.id,customerId:r.customer_id,locationId:c.location_id,actor:c.launched_by,event:'provider_accepted',payload:{recipientId:r.id,providerId:result.providerId}});
        await db.query('COMMIT');
      }catch(e){
        await db.query('ROLLBACK').catch(()=>{});
        await db.query(`UPDATE aif_sms_recipients SET status=$2,reason=$3,provider_response=$4,updated_at=now() WHERE id=$1`,[r.id,e.definitive?'failed':'unknown',String(e.message||'Ismeretlen küldési hiba').slice(0,500),e.providerResponse||null]);
        await audit(db,{campaignId:c.id,customerId:r.customer_id,locationId:c.location_id,actor:'sms-worker',event:e.definitive?'send_failed':'send_unknown',payload:{recipientId:r.id,code:e.code||'unknown'}});
        await pause('A szolgáltatói küldés hibát jelzett. Ellenőrzés szükséges; nincs automatikus újraküldés.');
      }
    }catch(e){console.error('AIF SMS worker:',e.code||'error',e.message);}finally{
      if(db){if(locked)await db.query(`SELECT pg_advisory_unlock(hashtext('aif_sms_dispatch_v1')::bigint)`).catch(()=>{});db.release();}busy=false;
    }
  }
  const timer=setInterval(()=>void tick(),3000);timer.unref?.();
  const control={tick,stop:()=>clearInterval(timer)};workers.set(pool,control);return control;
}
