import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:20000});
try {
 const {rows}=await pool.query(`WITH latest AS (
   SELECT DISTINCT ON (ei.variant_id) ei.variant_id,ei.sku,ei.item_status,ei.validation_errors
   FROM aif_shopify_product_export_items ei
   JOIN aif_shopify_product_exports ex ON ex.id=ei.export_id
   ORDER BY ei.variant_id,ex.created_at DESC,ei.export_id DESC
 ) SELECT l.*,v.status AS current_status,v.barcode,v.internal_sku,v.image_url,v.images,
   m.shopify_variant_id,m.shopify_product_id
 FROM latest l JOIN aif_product_variants v ON v.id=l.variant_id
 LEFT JOIN aif_shopify_variant_map m ON m.variant_id=l.variant_id
 WHERE l.item_status IN ('invalid','error')`);
 const groups=new Map();
 const hasImage=r=>[r.image_url,...(Array.isArray(r.images)?r.images:[])].some(u=>typeof u==='string' && /^https:\/\//i.test(u.trim()));
 for(const row of rows) {
   for(const error of new Set(row.validation_errors?.length?row.validation_errors:['Nincs tárolt hiba'])) {
    const key=error;const g=groups.get(key)||{korabbi_hiba:error,varians:0,most_aktiv:0,most_van_https_kep:0,tarolt_parositas:0};
    g.varians++;if(row.current_status==='active')g.most_aktiv++;if(hasImage(row))g.most_van_https_kep++;
    if(row.shopify_variant_id && row.shopify_product_id)g.tarolt_parositas++;
    groups.set(key,g);
   }
 }
 console.log('KORÁBBI EXPORTEREDMÉNY ÉS JELENLEGI BELSŐ ADATOK');
 console.table([...groups.values()].sort((a,b)=>b.varians-a.varians));
 console.log('SKU / SZÍN-MÉRET ÜTKÖZÉSEK ÉS HIÁNYZÓ SHOPIFY-TALÁLATOK');
 console.table(rows.filter(r=>(r.validation_errors||[]).some(e=>/SKU|kombináció/.test(e)&&!/Már Shopifyhoz párosított/.test(e))).map(r=>({
  variant:r.variant_id,export_sku:r.sku,vonalkod:r.barcode,belso_sku:r.internal_sku,
  shopify_variant:r.shopify_variant_id,hiba:(r.validation_errors||[]).join(' | ')
 })));
 console.log(`Összesen ${rows.length} különböző variáns. Egy variáns több hibacsoportba is tartozhat.`);
 console.log('Csak olvasás. A HTTPS-cím meglétét vizsgálja, nem a letölthetőségét. Tárolt párosítás nem jelent élő Shopify-ellenőrzést.');
} catch(error){console.error(error.code,error.message);process.exitCode=1;}
finally {await pool.end();}
