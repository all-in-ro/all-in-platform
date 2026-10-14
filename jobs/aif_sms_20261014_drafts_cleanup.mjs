/**
 * One-time cleanup of the six unlaunched attempts seen in the SMS log.
 * Default: READ ONLY. --apply --confirm=6: permanent, audited transaction.
 * Only targets Csíkszereda's 2026-10-14 22:20–22:40 ADMIN arrival campaigns.
 * If any candidate is launched, tested, sent, or count differs, NOTHING is deleted.
 */
import pg from 'pg';
import { discardPreparedSmsCampaigns, discardableSmsPreparationSql } from '../api/routes/aif/sms/cleanup.js';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--confirm=6');
const EXPECTED = 6;
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max:1});
const q = `
  SELECT c.id::text, c.title,c.status,c.mode,c.created_by,
         (c.created_at AT TIME ZONE 'Europe/Bucharest')::text AS helyi_idopont,
         c.recipient_count AS cimzettek,c.segment_count AS becsult_sms_resz,
         ${discardableSmsPreparationSql('c')} AS torolheto
  FROM aif_sms_campaigns c
  WHERE c.location_code='main_warehouse'
    AND c.kind='arrival'
    AND lower(c.created_by)='admin'
    AND (c.created_at AT TIME ZONE 'Europe/Bucharest')::date=DATE '2026-10-14'
    AND (c.created_at AT TIME ZONE 'Europe/Bucharest')::time>=TIME '22:20:00'
    AND (c.created_at AT TIME ZONE 'Europe/Bucharest')::time<TIME '22:40:00'
  ORDER BY c.created_at,c.id`;
let db;
try {
  db = await pool.connect();
  await db.query('BEGIN READ ONLY');
  const rows=(await db.query(q)).rows;
  await db.query('ROLLBACK');
  db.release();db=null;
  console.log('\n=== SMS KISÉRLETEK · ELLENŐRZÉS ===');
  console.table(rows);
  const safe = rows.length===EXPECTED && rows.every(row=>row.torolheto===true);
  if (!safe) {
    console.error(`STOP: pontosan ${EXPECTED} biztonságosan törölhető, soha el nem indított előkészítés szükséges. Talált: ${rows.length}.`);
    process.exitCode=1;
  } else if (!apply) {
    console.log(`ELŐNÉZET KÉSZ: ${EXPECTED} biztonságosan törölhető előkészítés. Az adatbázis nem változott.`);
    console.log('Törlés csak kifejezett döntés után: node jobs/aif_sms_20261014_drafts_cleanup.mjs --apply --confirm=6');
  } else if (!confirmed) {
    console.error('A végleges törléshez --confirm=6 szükséges. NEM történt módosítás.');
    process.exitCode=1;
  } else {
    const result=await discardPreparedSmsCampaigns(pool,rows.map(x=>x.id),'ADMIN · Render Shell · 2026-10-14',EXPECTED);
    console.log('SIKER: kitakarítva',result.deleted,'nem indított előkészítés,',result.removedRecipients,'függő címzettsor.');
    console.log('SMSLink-kredit, már kiküldött SMS, meglévő kézbesítési napló: változatlan.');
    console.log('Törlési tény és darabszám az Admin auditnaplóban megőrizve.');
  }
} catch (error) {
  if(db){try{await db.query('ROLLBACK');}catch{}db.release();}
  console.error('STOP: nincs részleges törlés:',error.message);
  process.exitCode=1;
} finally { await pool.end(); }
