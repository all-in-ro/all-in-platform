/** Read-only production audit. Does not import schema initializers or workers. */
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const ref=process.argv[2]||'AIF-1003';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL hiányzik.');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const show=(title,rows)=>{console.log('\n=== '+title+' ===');if(rows.length)console.table(rows);else console.log('Nincs találat.');};
let transaction=false;
try{
  await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
  await db.query("SET LOCAL statement_timeout='15000ms'");
  console.log('OLVASÁSI AUDIT:',ref);
  for(const name of ['SHOPIFY_SYNC_ENABLED','SHOPIFY_WAREHOUSE_AUTOMATION_ENABLED','SHOPIFY_WAREHOUSE_LIFECYCLE_ENABLED'])console.log(name,process.env[name]||'(nincs megadva)');
  for(const name of ['aifShopifyWarehouse.js','aifShopifyOrders.js','aifShopifyLifecyclePlan.js']){
    try{const content=await readFile(new URL('../api/lib/'+name,import.meta.url));console.log(name,'SHA256',createHash('sha256').update(content).digest('hex'));}catch{console.log(name,'HIÁNYZIK');}
  }
  const tableNames=['aif_shopify_orders','aif_shopify_warehouse_orders','aif_shopify_warehouse_lines','aif_shopify_fulfillments','aif_shopify_returns','aif_shopify_lifecycle_events','aif_shopify_return_quarantine'];
  const tables=await db.query('SELECT name,to_regclass(\'public.\'||name)::text AS relation FROM unnest($1::text[]) name',[tableNames]);show('SÉMA',tables.rows);
  if(tables.rows.some(r=>!r.relation))console.log('Hiányzó új táblák: az új séma még nem teljes. Ez az audit nem hozza létre őket.');
  const has=n=>tables.rows.find(r=>r.name===n)?.relation;
  if(has('aif_shopify_warehouse_orders')){
    const orders=await db.query(`SELECT o.shopify_order_id,o.order_name,o.status,o.financial_status,o.fulfillment_status,o.updated_at,
      w.document_number,w.state,w.source_location_id,w.target_location_id,w.raw
      FROM aif_shopify_orders o LEFT JOIN aif_shopify_warehouse_orders w ON w.shopify_order_id=o.shopify_order_id
      WHERE o.order_name=$1 OR o.shopify_order_id=$1 OR o.shopify_order_legacy_id=$1`,[ref]);show('RENDELÉS',orders.rows);
    const id=orders.rows[0]?.shopify_order_id;
    if(id){
      const lines=await db.query('SELECT * FROM aif_shopify_warehouse_lines WHERE shopify_order_id=$1 ORDER BY shopify_line_item_id',[id]);show('TÉTELENKÉNTI ELSZÁMOLÁS',lines.rows);
      const variants=[...new Set(lines.rows.map(l=>String(l.variant_id)))];
      const stocks=await db.query(`SELECT l.code,s.variant_id,s.qty,s.reserved_qty,s.qty-s.reserved_qty AS available,
        b.qty AS book_qty,b.book_value,CASE WHEN b.qty=s.qty THEN 'OK' ELSE 'ELLENŐRIZENDŐ' END AS quantity_match
        FROM aif_stock s JOIN aif_locations l ON l.id=s.location_id LEFT JOIN aif_stock_retail_book b ON b.location_id=s.location_id AND b.variant_id=s.variant_id
        WHERE s.variant_id=ANY($1::uuid[]) ORDER BY s.variant_id,l.code`,[variants]);show('KÉSZLET / ÉRTÉK',stocks.rows);
      const docs=await db.query(`SELECT document_number,document_type,status,total_qty,total_value,from_location_summary,to_location_summary,
        raw->>'shopifyOperation' AS operation,raw->>'originalAviz' AS original_aviz
        FROM aif_stock_transfer_documents WHERE raw->>'shopifyOrderId'=$1 ORDER BY created_at,document_number`,[id]);show('BIZONYLATOK',docs.rows);
      if(has('aif_shopify_lifecycle_events'))show('ELSZÁMOLT ESEMÉNYEK',(await db.query('SELECT kind,actor,payload,created_at FROM aif_shopify_lifecycle_events WHERE shopify_order_id=$1 ORDER BY created_at',[id])).rows);
      if(has('aif_shopify_return_quarantine'))show('ELKÜLÖNÍTETT VISSZÁRU',(await db.query('SELECT variant_id,location_id,qty,resolved_qty,note FROM aif_shopify_return_quarantine WHERE shopify_order_id=$1',[id])).rows);
    }
  }
  const fail=await db.query("SELECT to_regclass('public.aif_shopify_warehouse_failures') AS present");
  if(fail.rows[0]?.present)show('FELDOLGOZÁSI HIBÁK',(await db.query('SELECT shopify_order_id,error,attempts,retry_after FROM aif_shopify_warehouse_failures ORDER BY updated_at DESC LIMIT 20')).rows);
}catch(e){console.error('AUDIT HIBA:',e.message);process.exitCode=1;}
finally{if(transaction)await db.query('ROLLBACK').catch(()=>{});await db.end();console.log('\nKÉSZ: tartós adat- vagy készletmódosítás nem történt.');}
