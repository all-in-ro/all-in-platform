import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { txt, unique, fail, validateBlocks, cleanCouponRules, renderMessage, genderKey, withinSendHours, couponTerms } from './domain.js';
import { settingsFrom, audit } from './schema.js';
import { metadata, sourceProducts, audienceFor } from './data.js';
import { publicBase, providerConfig } from './provider.js';
export function createCampaignService(pool,provider) {
  async function detail(db,id,locationId=null) {
    const campaign=(await db.query(`SELECT * FROM aif_sms_campaigns WHERE id::text=$1 AND ($2::uuid IS NULL OR location_id=$2)`,[id,locationId])).rows[0];
    if(!campaign)throw fail('A kampány nem található ebben az üzletben.','sms_campaign',404);
    const recipients=(await db.query(`SELECT r.*,c.code AS coupon_code,c.status AS coupon_status,c.used_at,c.used_by,c.used_sale_id,c.discount_amount FROM aif_sms_recipients r LEFT JOIN aif_sms_coupons c ON c.recipient_id=r.id WHERE r.campaign_id=$1 ORDER BY r.customer_name,r.phone`,[campaign.id])).rows;
    return {campaign,recipients};
  }
  async function build(db,input,location,settings,mode) {
    const kind=input.kind;
    if(!['arrival','promotion'].includes(kind))throw fail('Válassz újáru- vagy promóciós kampányt.');
    const title=txt(input.title).slice(0,120);
    if(title.length<3)throw fail('Adj legalább 3 karakteres kampánynevet.');
    const blocks=validateBlocks(input.blocks,kind),language=input.language==='ro'?'ro':'hu';
    const filters={brands:unique(input.filters?.brands),genders:unique(input.filters?.genders),categories:unique(input.filters?.categories)};
    const meta=await metadata(db);
    if(filters.brands.some(id=>!meta.brands.some(b=>b.id===id))||filters.categories.some(id=>!meta.categories.some(c=>c.id===id))||filters.genders.some(id=>!meta.genders.some(g=>g.id===id)))throw fail('Ismeretlen célcsoportszűrő.');
    const coupon=kind==='promotion'?cleanCouponRules(input.coupon):null;
    if(coupon){const today=(await db.query(`SELECT ((now() AT TIME ZONE 'Europe/Bucharest')::date)::text AS date`)).rows[0].date;if(coupon.validUntil<today)throw fail('A promóció nem járhatott már le.');}
    const loaded=kind==='arrival'?await sourceProducts(db,location.id,input.sources):{products:[],sources:[],unknownGender:0};
    const products=loaded.products.filter(p=>(!filters.brands.length||filters.brands.includes(p.brand_id))&&(!filters.genders.length||filters.genders.includes(genderKey(p.gender)))&&(!filters.categories.length||filters.categories.includes(p.category_id)||filters.categories.includes(p.subcategory_id)));
    if(kind==='arrival'&&!products.length)throw fail('A szállítmányból nincs aktív, készleten lévő termék a kiválasztott szűrésben.');
    const definition={kind,title,language,filters,blocks,coupon,sources:unique(input.sources)};
    const audience=await audienceFor(db,location.id,definition,products,settings,mode);
    if(!audience.eligible.length)throw fail('Nincs megfelelő, SMS-hez hozzájárult kliens ebben az üzletben. Ellenőrizd az érdeklődéseket, nyelvet és küldési korlátot.','sms_empty_audience');
    if(audience.eligible.length>settings.maxRecipients)throw fail(`A kampány ${audience.eligible.length} címzettje meghaladja a ${settings.maxRecipients} fős korlátot.`);
    const base=publicBase(),recipients=[];
    for(const person of audience.eligible){
      const code=coupon?'AIF-'+randomBytes(8).toString('hex').toUpperCase():null;
      const values={name:person.name,store:settings.shopNames[location.code]||location.name,
        brands:unique(person.matched.map(p=>p.brand)).join(', ')||meta.brands.filter(b=>filters.brands.includes(b.id)).map(b=>b.name).join(', ')||(language==='ro'?'selectia AllInFashion':'AllInFashion valogatas'),
        categories:unique(person.matched.map(p=>p.category)).join(', ')||(language==='ro'?'produse selectate':'valogatott termekek'),
        coupon:code,discount:coupon?`${coupon.value}${coupon.type==='percent'?'%':' RON'}`:'',expiry:coupon?.validUntil?.split('-').reverse().join('.')||''};
      const rendered=renderMessage(blocks,values,`${base}/api/aif/sms/u/${person.token}`,language,coupon?couponTerms(coupon,language):'');
      if(rendered.segments>settings.maxSegments)throw fail(`${person.name}: az üzenet ${rendered.segments} SMS-részből állna. A korlát ${settings.maxSegments}. Rövidítsd a szöveget.`,'sms_too_long');
      recipients.push({...person,id:randomUUID(),couponCode:code,...rendered});
    }
    const segments=recipients.reduce((n,r)=>n+r.segments,0);
    if(segments>settings.campaignSegmentLimit)throw fail('Az összes SMS-rész meghaladja a kampánykeretet.');
    return {definition:{...definition,excluded:audience.excluded,unknownGender:loaded.unknownGender,sender:settings.sender},recipients,segments,sources:loaded.sources};
  }
  return {
    detail,
    async create(input,location,actor) {
      const key=txt(input.requestKey);
      if(key.length<12||key.length>150)throw fail('Hiányzik a kampány biztonsági azonosítója.');
      const hash=createHash('sha256').update(JSON.stringify({...input,requestKey:undefined,locationId:location.id,actor})).digest('hex');
      const db=await pool.connect();
      try{
        await db.query('BEGIN');
        await db.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`,['sms-draft:'+key]);
        const old=(await db.query('SELECT id,request_hash FROM aif_sms_campaigns WHERE request_key=$1',[key])).rows[0];
        if(old){if(old.request_hash!==hash)throw fail('Azonos kéréshez eltérő kampányadat érkezett.','sms_idempotency',409);await db.query('COMMIT');return detail(pool,old.id,location.id);}
        const settings=await settingsFrom(db),mode=providerConfig().enabled&&settings.liveEnabled?'live':'test';
        const built=await build(db,input,location,settings,mode),id=randomUUID();
        await db.query(`INSERT INTO aif_sms_campaigns(id,request_key,request_hash,title,kind,location_id,location_code,mode,definition,source_snapshot,recipient_count,segment_count,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)`,[id,key,hash,built.definition.title,built.definition.kind,location.id,location.code,mode,JSON.stringify(built.definition),JSON.stringify(built.sources),built.recipients.length,built.segments,actor]);
        for(const r of built.recipients){
          await db.query(`INSERT INTO aif_sms_recipients(id,campaign_id,customer_id,customer_name,phone,message,segments,matched,preference_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,[r.id,id,r.customerId,r.name,r.phone,r.message,r.segments,JSON.stringify(r.matched),r.pref.version]);
          if(r.couponCode)await db.query(`INSERT INTO aif_sms_coupons(id,campaign_id,recipient_id,customer_id,phone,location_id,code,rules,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,[randomUUID(),id,r.id,r.customerId,r.phone,location.id,r.couponCode,JSON.stringify(built.definition.coupon),mode]);
        }
        await audit(db,{campaignId:id,locationId:location.id,actor,event:'campaign_prepared',payload:{mode,recipients:built.recipients.length,segments:built.segments,excluded:built.definition.excluded.length}});
        await db.query('COMMIT');return detail(pool,id,location.id);
      }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
    },
    async action(id,action,input,scope,actor,isAdmin) {
      const db=await pool.connect();
      try{
        await db.query('BEGIN');
        await db.query(`SELECT pg_advisory_xact_lock(hashtext('aif-sms-launch')::bigint)`);
        const c=(await db.query(`SELECT * FROM aif_sms_campaigns WHERE id::text=$1 AND ($2::uuid IS NULL OR location_id=$2) FOR UPDATE`,[id,scope])).rows[0];
        if(!c)throw fail('A kampány nem található.','sms_campaign',404);
        if(!isAdmin&&c.created_by!==actor)throw fail('Csak a saját kampányodat indíthatod vagy állíthatod le.','sms_forbidden',403);
        const s=await settingsFrom(db);
        if(action==='approve'){
          if(!isAdmin)throw fail('Jóváhagyás csak adminnak engedélyezett.','sms_forbidden',403);
          if(!['draft','awaiting_approval'].includes(c.status))throw fail('Ez a kampány már nem vár jóváhagyásra.','sms_state',409);
          await db.query(`UPDATE aif_sms_campaigns SET status='approved',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1`,[c.id,actor]);
        }else if(action==='launch'){
          if(['queued','sending','finished'].includes(c.status)){await db.query('COMMIT');return detail(pool,id,scope);}
          if(!['draft','awaiting_approval','approved','paused'].includes(c.status))throw fail('Ez a kampány nem indítható.','sms_state',409);
          if(!isAdmin&&!s.sellersCanSend)throw fail('Az admin kikapcsolta az eladói küldést.','sms_forbidden',403);
          if(!isAdmin&&s.requireApproval&&!c.approved_at){
            await db.query(`UPDATE aif_sms_campaigns SET status='awaiting_approval',updated_at=now() WHERE id=$1`,[c.id]);
            await audit(db,{campaignId:c.id,locationId:c.location_id,actor,event:'approval_requested'});
            await db.query('COMMIT');return detail(pool,id,scope);
          }
          if(Number(input.confirmCount)!==c.recipient_count)throw fail('A címzettszám visszaigazolása nem egyezik az előnézettel.');
          if(c.mode==='live'){
            if(!s.liveEnabled||!providerConfig().enabled)throw fail('Az éles SMS-küldés nincs engedélyezve.','sms_live_disabled',403);
            if(providerConfig().secret.length<32)throw fail('Az SMS-visszaigazolásokhoz legalább 32 karakteres webhook-titok szükséges.');
            if(!withinSendHours(s))throw fail(`Most küldési csendidő van. Küldési időszak: ${s.sendFromHour}:00–${s.sendUntilHour}:00 (romániai idő).`,'sms_quiet_hours');
            if(c.recipient_count>s.maxRecipients||c.segment_count>s.campaignSegmentLimit)throw fail('A kampány meghaladja a jelenlegi keretet.');
            const pending=(await db.query(`SELECT COALESCE(sum(segments),0)::int AS n FROM aif_sms_recipients WHERE campaign_id=$1 AND status='pending'`,[c.id])).rows[0].n;
            const credit=await provider.credit(true);if(credit.credit<pending)throw fail('Nincs elegendő SMS-kredit.','sms_credit_low');
          }
          await db.query(`UPDATE aif_sms_campaigns SET status='queued',launched_by=$2,launched_at=COALESCE(launched_at,now()),updated_at=now(),note=NULL WHERE id=$1`,[c.id,actor]);
        }else if(action==='pause'){
          if(!['queued','sending'].includes(c.status))throw fail('Csak folyamatban lévő kampány állítható meg.');
          await db.query(`UPDATE aif_sms_campaigns SET status='paused',note='Kézzel szüneteltetve',updated_at=now() WHERE id=$1`,[c.id]);
        }else if(action==='cancel'){
          if(c.status==='finished')throw fail('Befejezett kampány nem vonható vissza. A már elküldött SMS nem hívható vissza.');
          await db.query(`UPDATE aif_sms_campaigns SET status='cancelled',updated_at=now() WHERE id=$1`,[c.id]);
          await db.query(`UPDATE aif_sms_recipients SET status='cancelled',reason='Kampány leállítva',updated_at=now() WHERE campaign_id=$1 AND status='pending'`,[c.id]);
          await db.query(`UPDATE aif_sms_coupons SET status='revoked' WHERE campaign_id=$1 AND status='inactive' AND recipient_id IN(SELECT id FROM aif_sms_recipients WHERE campaign_id=$1 AND status='cancelled')`,[c.id]);
        }else throw fail('Ismeretlen kampányművelet.');
        await audit(db,{campaignId:c.id,locationId:c.location_id,actor,event:'campaign_'+action,payload:{previousStatus:c.status}});
        await db.query('COMMIT');return detail(pool,id,scope);
      }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
    }
  };
}
