import pg from 'pg';
import { hourlyRange, loadHourlySales } from '../api/lib/aifHourlySales.js';
const args = Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')&&a.includes('=')).map(a=>a.slice(2).split('=')));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let db;
try {
  const range = hourlyRange(args);
  db = await pool.connect();
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout = '20s'");
  const result = await loadHourlySales(db, range);
  console.log(`Óránkénti eladások – ${range.from} → ${range.to}, ${result.timezone}`);
  for (const s of result.shops) {
    console.log(`\n${s.name}: ${s.days.length} adatos nap${s.available?'':' – a hely nem található'}`);
    const rows=Array.from({length:24},(_,hour)=>{
      const values=s.days.flatMap(d=>d.hours.filter(h=>h.hour===hour));
      const purchases=values.reduce((n,h)=>n+h.purchases,0);
      return { ora: `${String(hour).padStart(2,'0')}:00`, vasarlas:purchases, hiteles:values.reduce((n,h)=>n+h.credit,0), darab:values.reduce((n,h)=>n+h.units,0), ertek:values.reduce((n,h)=>n+h.value,0).toFixed(2), atlag:s.days.length?(purchases/s.days.length).toFixed(3):'nincs adat' };
    });
    console.table(rows.filter(r=>r.vasarlas>0));
    // Independent total query (without line joins) guards against duplicated receipts.
    const direct = await db.query(`SELECT count(*)::int AS count, COALESCE(sum(s.total),0)::numeric AS value
      FROM aif_shop_sales s JOIN aif_locations l ON l.id=s.location_id
      WHERE l.code=$3 AND s.status IN ('completed','refunded') AND s.sale_type IN ('sale','credit')
      AND s.sold_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Bucharest')
      AND s.sold_at < (($2::date+1)::timestamp AT TIME ZONE 'Europe/Bucharest')`, [range.from,range.to,s.code]);
    const count=rows.reduce((n,r)=>n+r.vasarlas,0),value=rows.reduce((n,r)=>n+Number(r.ertek),0);
    if(count!==Number(direct.rows[0].count)||Math.abs(value-Number(direct.rows[0].value))>.011) throw new Error(`${s.name}: az órás és teljes összesítés eltér!`);
    console.log(`OK: ${count} vásárlás, ${value.toFixed(2)} RON; az órás bontás egyezik a bizonylatokkal.`);
  }
  await db.query('COMMIT');
  console.log('\nKÉSZ – csak olvasás történt, nincs adat- vagy készletmódosítás.');
} catch(e) {
  if(db) await db.query('ROLLBACK').catch(()=>{});
  console.error(e.message); process.exitCode=1;
} finally { db?.release(); await pool.end(); }
