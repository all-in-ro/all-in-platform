import pg from 'pg';
import { randomUUID } from 'node:crypto';
const apply = process.argv.includes('--apply');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await db.connect();
  await db.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='60s'");
  if (apply) {
    // Prevent changes to prices and stock while taking the before/after snapshot.
    await db.query('LOCK TABLE aif_product_variants, aif_stock, aif_stock_retail_book IN SHARE ROW EXCLUSIVE MODE');
  }
  const invalid = await db.query(`SELECT count(*)::int AS count FROM aif_stock s
    JOIN aif_product_variants v ON v.id=s.variant_id
    WHERE s.qty<0 OR (s.qty>0 AND (v.sell_price IS NULL OR v.sell_price<0))`);
  if (invalid.rows[0].count) throw new Error(`${invalid.rows[0].count} hibás/hiányos készlet- vagy áradat. Nem történt módosítás.`);
  const result = await db.query(`SELECT s.location_id,s.variant_id,s.qty,
    rb.qty AS old_qty,rb.book_value AS old_value,
    round(GREATEST(s.qty,0)::numeric * COALESCE(v.sell_price,0)::numeric,2) AS new_value
    FROM aif_stock s JOIN aif_product_variants v ON v.id=s.variant_id
    LEFT JOIN aif_stock_retail_book rb ON rb.location_id=s.location_id AND rb.variant_id=s.variant_id
    WHERE rb.qty IS DISTINCT FROM s.qty OR rb.book_value IS DISTINCT FROM
      round(GREATEST(s.qty,0)::numeric * COALESCE(v.sell_price,0)::numeric,2)
    ORDER BY s.location_id,s.variant_id`);
  const groups = new Map();
  for (const r of result.rows) {
    const g=groups.get(r.location_id)||{location:r.location_id,rows:0,before:0,after:0};
    g.rows++;g.before+=Number(r.old_value||0);g.after+=Number(r.new_value);groups.set(r.location_id,g);
  }
  console.log(JSON.stringify({mode:apply?'APPLY':'READ ONLY',rows:result.rowCount,locations:[...groups.values()]},null,2));
  if (apply && result.rowCount) {
    const id=randomUUID();
    await db.query(`CREATE TABLE IF NOT EXISTS aif_retail_value_reconcile_audit (
      id uuid PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),reason text NOT NULL,changes jsonb NOT NULL)`);
    await db.query('INSERT INTO aif_retail_value_reconcile_audit(id,reason,changes) VALUES($1,$2,$3::jsonb)',
      [id,'current_retail_price_20261111',JSON.stringify(result.rows)]);
    await db.query(`INSERT INTO aif_stock_retail_book(location_id,variant_id,qty,book_value,seeded,updated_at)
      SELECT location_id,variant_id,qty,new_value,false,now()
      FROM jsonb_to_recordset($1::jsonb) AS r(location_id uuid,variant_id uuid,qty numeric,new_value numeric)
      ON CONFLICT(location_id,variant_id) DO UPDATE SET qty=EXCLUDED.qty,book_value=EXCLUDED.book_value,seeded=false,updated_at=now()`,[JSON.stringify(result.rows)]);
    console.log('AUDIT:',id);
  }
  await db.query(apply?'COMMIT':'ROLLBACK');
  console.log(apply?'Készletérték egyeztetve. Termékár, darabszám, foglalás és lezárt bizonylat nem változott.':'Csak ellenőrzés történt.');
} catch(e) { try { await db.query('ROLLBACK'); } catch {} console.error(e.message);process.exitCode=1; }
finally { await db.end(); }
