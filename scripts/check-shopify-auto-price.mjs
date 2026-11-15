import pg from 'pg';
import {getAifShopifyPublicConfig} from '../api/lib/aifShopify.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000});
try {
  const c=getAifShopifyPublicConfig();
  console.log('Master Shopify szinkron:',c.enabled,'Árszinkron ENV:',process.env.SHOPIFY_PRICE_SYNC_ENABLED??'nincs megadva → bekapcsolva');
  console.log('Beágyazott worker ENV:',process.env.SHOPIFY_EMBEDDED_WORKER_ENABLED??'nincs megadva → bekapcsolva');
  const {rows}=await pool.query("SELECT to_regclass('public.aif_shopify_price_sync_state') AS state, to_regclass('public.aif_shopify_price_sync_audit') AS audit, to_regclass('public.aif_shopify_price_sync_meta') AS meta");
  if(!rows[0]?.state || !rows[0]?.audit || !rows[0]?.meta) {
    console.log('Az automatikus árszinkron táblái még nem készültek el. Ellenőrizd a deployt és a worker naplóját.');
  }else{
    console.table((await pool.query('SELECT * FROM aif_shopify_price_sync_meta')).rows);
    console.table((await pool.query(`SELECT status,count(*)::int AS darab,min(next_attempt_at)::text AS kovetkezo
      FROM aif_shopify_price_sync_state GROUP BY status ORDER BY status`)).rows);
    console.table((await pool.query(`SELECT v.barcode AS sku,v.size AS meret,v.sell_price AS belso_ar,q.last_remote_price AS Shopify_ar,
      q.status,q.attempts AS probalkozas,q.last_error AS hiba,q.next_attempt_at::text AS kovetkezo
      FROM aif_shopify_price_sync_state q JOIN aif_product_variants v ON v.id=q.variant_id
      WHERE q.status IN ('retry','blocked') ORDER BY q.updated_at DESC LIMIT 30`)).rows);
    console.table((await pool.query(`SELECT id,sku,old_price AS regi_ar,new_price AS uj_ar,status,error,created_at,finished_at
      FROM aif_shopify_price_sync_audit ORDER BY id DESC LIMIT 20`)).rows);
  }
  console.log('Csak olvasás történt.');
}catch(e){console.error('ELLENŐRZÉSI HIBA:',e.message);process.exitCode=1;}finally{await pool.end();}
