import pg from 'pg';
import assert from 'node:assert/strict';
import { creditSettlementStatisticsJoins } from '../api/routes/aif/creditSettlementStatistics.js';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
try {
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout='30s'");
  const {rows} = await db.query(`
    SELECT s.sale_number,sl.product_title,sl.brand_name,
      (p.paid_at AT TIME ZONE 'Europe/Bucharest')::date::text AS befizetes_napja,
      credit_stats.amount AS statisztikai_osszeg,credit_stats.qty AS statisztikai_darab
    FROM aif_shop_sale_payments p
    JOIN aif_shop_sales s ON s.id=p.sale_id
    JOIN aif_shop_sale_lines sl ON sl.sale_id=s.id
    ${creditSettlementStatisticsJoins()}
    WHERE s.id=$1 AND sl.id=$2 AND s.status='completed' AND s.sale_type='credit'
      AND p.customer_payment_id IS NOT NULL AND p.method<>'credit' AND p.amount>0
    ORDER BY p.paid_at,p.id`,[
      '6cc4d825-58e3-4616-af94-fda23e589017','52e12cdf-13a3-4fc2-8e97-8634a1c4a1bc'
    ]);
  console.table(rows);
  const target=rows.filter(r=>r.befizetes_napja==='2026-11-03');
  assert.equal(target.reduce((n,r)=>n+Number(r.statisztikai_darab),0),1);
  assert.equal(Math.round(target.reduce((n,r)=>n+Number(r.statisztikai_osszeg),0)*100),28453);
  assert.equal(rows.reduce((n,r)=>n+Number(r.statisztikai_darab),0),1);
  console.log('OK: Wichita / Fundango, 2026-11-03: 1 db, 284,53 RON. Nincs duplázott darab.');
} catch(e) {
  console.error('ELLENŐRZÉS SIKERTELEN:',e.message);
  process.exitCode=1;
} finally {
  await db.query('ROLLBACK').catch(()=>{});
  db.release();await pool.end();
}
