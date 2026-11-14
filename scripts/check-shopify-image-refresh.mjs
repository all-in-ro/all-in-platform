import pg from 'pg';
import { findImageRefreshVariant } from '../api/lib/aifShopifyImageRefresh.js';

const barcode=process.argv.find(arg=>arg.startsWith('--barcode='))?.slice(10)?.trim();
if (!barcode) { console.error('Használat: node scripts/check-shopify-image-refresh.mjs --barcode=5905700368809'); process.exit(1); }
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try {
  const result=await pool.query(`SELECT v.id::text,v.barcode,v.internal_sku,v.size,v.color_code,
    m.sku AS mapped_sku,m.shopify_variant_id,m.shopify_product_id
    FROM aif_product_variants v LEFT JOIN aif_shopify_variant_map m ON m.variant_id=v.id
    WHERE btrim(v.barcode)=$1`,[barcode]);
  if (!result.rows.length) throw new Error('Ezzel a vonalkóddal nincs belső termék.');
  for (const row of result.rows) {
    console.log('\nBELSŐ TERMÉK'); console.table([row]);
    try {
      const remote=await findImageRefreshVariant(row);
      console.log('ÉLŐ SHOPIFY-TALÁLAT');
      console.table([{sku:remote.sku,barcode:remote.barcode,variant:remote.title,product:remote.product.title,variantId:remote.id,productId:remote.product.id}]);
    } catch(error) {console.log('EREDMÉNY:',error.message);process.exitCode=1;}
  }
  console.log('\nCsak olvasás történt. Nincs párosítás, képfeltöltés vagy készletmódosítás.');
} catch(error) {console.error(error.message);process.exitCode=1;}
finally {await pool.end();}
