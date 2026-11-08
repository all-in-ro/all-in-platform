import pg from 'pg';
const db = new pg.Client({connectionString: process.env.DATABASE_URL});
try {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  await db.query("SET LOCAL statement_timeout = '30s'");
  const {rows} = await db.query(`
    SELECT sm.created_at, v.barcode, v.size,
           sm.movement_type, sm.source_type, sm.qty_delta,
           sm.qty_before, sm.qty_after,
           sm.raw->>'reason' AS reason,
           sm.raw->>'source' AS origin,
           sm.raw->'changedFields' AS changed_fields
    FROM aif_stock_movements sm
    LEFT JOIN aif_product_variants v ON v.id=sm.variant_id
    WHERE sm.qty_delta=0
    ORDER BY sm.created_at DESC, sm.id DESC LIMIT 30
  `);
  console.log(JSON.stringify(rows,null,2));
  await db.query('ROLLBACK');
  console.log('Csak ellenőrzés: adatváltoztatás nem történt.');
} catch(error) {
  try {await db.query('ROLLBACK');} catch {}
  console.error(error.message);
  process.exitCode=1;
} finally {await db.end();}
