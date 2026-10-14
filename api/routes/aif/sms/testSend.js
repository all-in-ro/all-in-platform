import { fail, phoneNumber, segmentInfo, withinSendHours, messageSettingsMatch } from './domain.js';
import { settingsFrom, audit } from './schema.js';
import { providerConfig } from './provider.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sends one real, exactly personalized, already prepared SMS exclusively to the
 * server-stored manager test number. Never changes campaign recipient/coupon rows.
 * Only the authenticated administrator may call the corresponding API route.
 */
export function createSmsTestSender(pool, provider) {
  return {
    async send({campaignId,recipientId,actor}) {
      if(!UUID.test(String(campaignId))||!UUID.test(String(recipientId)))
        throw fail('Válassz egy előkészített kampányt és annak egyik címzettjét.');
      const conf=providerConfig();
      if(!conf.enabled||!conf.id||!conf.password)
        throw fail('Valódi teszt-SMS-hez SMSLink hozzáférés és AIF_SMS_ALLOW_LIVE=true szükséges. A teljes kampányküldés ettől még külön kikapcsolva maradhat.','sms_test_not_configured',403);
      const settings=await settingsFrom(pool);
      const phone=phoneNumber(settings.testPhone);
      if(!phone)throw fail('A Vezérlőpultban előbb állítsd be és mentsd el a főnöki teszttelefonszámot.','sms_test_phone');
      if(!withinSendHours(settings))throw fail(`Teszt-SMS is csak ${settings.sendFromHour}:00 és ${settings.sendUntilHour}:00 között küldhető, romániai idő szerint.`, 'sms_quiet_hours');

      const db=await pool.connect();
      let row,parts;
      try {
        await db.query('BEGIN');
        // Transactional throttling across concurrent Render instances and browsers.
        await db.query(`SELECT pg_advisory_xact_lock(hashtext('aif_sms_real_test_sends_v1')::bigint)`);
        row=(await db.query(`SELECT r.id AS recipient_id,r.message,r.segments,r.customer_name,
            c.id AS campaign_id,c.status AS campaign_status,c.location_id,c.location_code,c.definition
          FROM aif_sms_recipients r JOIN aif_sms_campaigns c ON c.id=r.campaign_id
          WHERE c.id=$1 AND r.id=$2`,[campaignId,recipientId])).rows[0];
        if(!row)throw fail('A kiválasztott kampányüzenet nem található.','sms_test_recipient',404);
        if(!['draft','awaiting_approval','approved'].includes(row.campaign_status))
          throw fail('Teszt-SMS csak indítás előtt, az előkészített kampányból küldhető.','sms_test_state',409);
        if(!messageSettingsMatch(row.definition,settings,row.location_code))
          throw fail('Az SMS beállításai megváltoztak. Készíts új előnézetet a tesztküldés előtt.','sms_test_stale',409);
        parts=segmentInfo(row.message);
        if(parts.segments>settings.maxSegments||parts.segments!==Number(row.segments))
          throw fail('A kész SMS hossza időközben nem egyezik a beállításokkal.','sms_test_message_changed',409);
        const counts=(await db.query(`SELECT
            count(*) FILTER(WHERE (created_at AT TIME ZONE 'Europe/Bucharest')::date=(now() AT TIME ZONE 'Europe/Bucharest')::date)::int AS today,
            count(*) FILTER(WHERE created_at>now()-interval '90 seconds')::int AS recent
          FROM aif_sms_audit WHERE event='sms_test_attempt'`,[])).rows[0];
        if(counts.recent>0)throw fail('A legutóbbi tesztküldés óta várj legalább 90 másodpercet. Így elkerüljük a véletlen duplázást.','sms_test_throttle',429);
        if(counts.today>=10)throw fail('Elérted a napi 10 főnöki teszt-SMS korlátot.','sms_test_daily_limit',429);
        const credit=await provider.credit();
        if(credit.credit<parts.segments)throw fail('Nincs elegendő SMSLink-kredit a tesztküldéshez.','sms_credit_low');
        // Reserve BEFORE the gateway call. Unknown network outcomes must never auto-retry.
        await audit(db,{campaignId:row.campaign_id,locationId:row.location_id,actor,event:'sms_test_attempt',payload:{recipientId:row.recipient_id,testPhone:phone,segments:parts.segments}});
        await db.query('COMMIT');
      } catch(e) {await db.query('ROLLBACK').catch(()=>{});throw e;}
      finally {db.release();}

      try {
        // This is a PHYSICAL paid SMS, not the provider's simulation test=1 mode.
        const result=await provider.send({phone,message:row.message,sender:row.definition.sender,test:false});
        await audit(pool,{campaignId:row.campaign_id,locationId:row.location_id,actor,event:'sms_test_accepted',payload:{recipientId:row.recipient_id,testPhone:phone,segments:parts.segments,providerId:result.providerId}});
        return {ok:true,phone,segments:parts.segments,providerId:result.providerId,message:'Az SMSLink átvette a főnöki tesztüzenetet. A tényleges kézbesítést ellenőrizd a telefonodon.'};
      } catch(e) {
        const unknown=!e.definitive;
        try {
          await audit(pool,{campaignId:row.campaign_id,locationId:row.location_id,actor,event:unknown?'sms_test_unknown':'sms_test_failed',payload:{recipientId:row.recipient_id,testPhone:phone,code:e.code||'unknown'}});
        } catch(auditError) {console.error('AIF SMS test-send audit:',auditError.message);}
        if(unknown)throw fail('A teszt-SMS kimenetele bizonytalan. Lehet, hogy megérkezett: ellenőrizd a telefonodon és az SMSLink naplójában, ne ismételd azonnal.','sms_test_unknown',502);
        throw e;
      }
    }
  };
}
