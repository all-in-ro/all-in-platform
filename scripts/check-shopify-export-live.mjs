import pg from 'pg';
import { shopifyGraphql } from '../api/lib/aifShopify.js';

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:20000});
const text=v=>String(v??'').trim();
try {
  const {rows}=await pool.query(`WITH latest AS (
    SELECT DISTINCT ON (ei.variant_id) ei.variant_id,ei.sku,ei.item_status,ei.validation_errors
    FROM aif_shopify_product_export_items ei
    JOIN aif_shopify_product_exports ex ON ex.id=ei.export_id
    ORDER BY ei.variant_id,ex.created_at DESC,ei.export_id DESC
  ) SELECT l.*,v.model_id,v.barcode,v.internal_sku,v.size,v.color_code,v.color_name,
    m.shopify_variant_id,m.shopify_product_id
    FROM latest l JOIN aif_product_variants v ON v.id=l.variant_id
    LEFT JOIN aif_shopify_variant_map m ON m.variant_id=l.variant_id
    WHERE l.item_status IN ('invalid','error')`);
  const affected=rows.filter(r=>(r.validation_errors||[]).some(e=>
    /Az SKU még nem található a Shopifyban|A Shopifyban \d+ különböző variáns használja ezt az SKU-t/.test(e)));
  console.log(`ÉLŐ SHOPIFY-ELLENŐRZÉS: ${affected.length} belső variáns`);
  let failures=0;
  for(const local of affected) {
    console.log('\nBELSŐ VARIÁNS:',local.variant_id);
    console.table([{export_sku:local.sku,vonalkod:local.barcode,belso_sku:local.internal_sku,szin:local.color_name,meret:local.size,tarolt_shopify_id:local.shopify_variant_id}]);
    try {
      const keys=[...new Set([local.sku,local.barcode,local.internal_sku].map(text).filter(Boolean))];
      if(!keys.length)throw new Error('Nincs kereshető azonosító.');
      const query=keys.flatMap(key=>[`sku:${JSON.stringify(key)}`,`barcode:${JSON.stringify(key)}`]).join(' OR ');
      const matches=new Map();let cursor=null,complete=false;
      for(let page=0;page<10;page++) {
        const response=await shopifyGraphql(`query AifExportLiveAudit($query:String!,$after:String) {
          productVariants(first:100,query:$query,after:$after) {
            nodes { id sku barcode title selectedOptions { name value }
              product { id title handle status } }
            pageInfo { hasNextPage endCursor }
          }
        }`,{query,after:cursor});
        if(response.errors?.length)throw new Error(response.errors.map(e=>e.message).join(' | '));
        const result=response.data?.productVariants;
        if(!Array.isArray(result?.nodes))throw new Error('Hiányos Shopify-válasz.');
        for(const remote of result.nodes) {
          if(keys.includes(text(remote.sku))||keys.includes(text(remote.barcode)))matches.set(remote.id,remote);
        }
        if(!result.pageInfo?.hasNextPage){complete=true;break;}
        if(!result.pageInfo.endCursor||cursor===result.pageInfo.endCursor)break;
        cursor=result.pageInfo.endCursor;
      }
      if(!complete)throw new Error('A találati lista nem teljes; nem minősíthető.');
      console.log('PONTOS SKU / VONALKÓD TALÁLATOK:',matches.size);
      console.table([...matches.values()].map(r=>({
        tarolt_parositas:r.id===local.shopify_variant_id?'IGEN':'',
        sku:r.sku,vonalkod:r.barcode,termek:r.product?.title,allapot:r.product?.status,
        opciok:(r.selectedOptions||[]).map(o=>`${o.name}: ${o.value}`).join(' | '),
        variant_id:r.id,product_id:r.product?.id,handle:r.product?.handle
      })));
    } catch(error){failures++;console.error('ELLENŐRZÉSI HIBA:',error.message);}
  }
  const collisions=rows.filter(r=>(r.validation_errors||[]).some(e=>/ugyanaz a szín \+ méret kombináció/.test(e)));
  const models=[...new Set(collisions.map(r=>r.model_id))];
  if(models.length){
    const {rows:siblings}=await pool.query(`SELECT v.id::text,v.model_id::text,p.model_code,p.title_ro,
      v.status,v.barcode,v.internal_sku,v.size,v.color_code,v.color_name,
      m.shopify_variant_id
      FROM aif_product_variants v JOIN aif_product_models p ON p.id=v.model_id
      LEFT JOIN aif_shopify_variant_map m ON m.variant_id=v.id
      WHERE v.model_id=ANY($1::uuid[])
      ORDER BY p.model_code,v.color_code,v.size,v.id`,[models]);
    const flagged=new Set(collisions.map(r=>r.variant_id));
    console.log('\nSZÍN–MÉRET ÜTKÖZÉSEK: az érintett modellek összes jelenlegi variánsa');
    console.table(siblings.map(r=>({regi_exportban_hibas:flagged.has(r.id)?'IGEN':'',...r})));
  }
  console.log(`\nKÉSZ: ${affected.length} élő vizsgálat, ${failures} lekérési hiba. Csak olvasás; nincs párosítás, törlés, készlet- vagy képmódosítás.`);
  if(failures)process.exitCode=1;
} catch(error){console.error(error.code||'',error.message);process.exitCode=1;}
finally {await pool.end();}
