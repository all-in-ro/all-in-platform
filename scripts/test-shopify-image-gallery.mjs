import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
// Actual image worker code, isolated from the live DB and Shopify transport.
const source=(await fs.readFile(new URL('../api/lib/aifShopifyImages.js',import.meta.url),'utf8'))
  .replace(/^import .* from '\.\/.*;\n/gm,'');
const prefix=`const aifImageGallery=(images,primary)=>[...new Set([primary,...(Array.isArray(images)?images:[])].filter(Boolean))];
const shopifyGraphql=(q,v)=>globalThis.__aifGalleryTest(q,v);
const ensureAifShopifyTables=async()=>{};const getAifShopifyPublicConfig=()=>({enabled:true});\n`;
const worker=await import('data:text/javascript;base64,'+Buffer.from(prefix+source+'\nexport {syncProductImages};').toString('base64'));
const urls=Array.from({length:5},(_,i)=>`https://images.example.com/photo-${i+1}.jpg`);
let media=[],uploads=[],variantUpdates=[];const links=new Map();
globalThis.__aifGalleryTest=async(query,variables)=>{
  if(query.includes('query AifGalleryRead')) return {data:{product:{id:'product',title:'Test product',media:{nodes:media,pageInfo:{hasNextPage:false}}}}};
  if(query.includes('mutation AifGalleryAdd')) {
    uploads.push(...variables.media);
    for(const item of variables.media) media.push({id:`media-${media.length+1}`,alt:item.alt,mediaContentType:'IMAGE',status:'READY'});
    return {data:{productUpdate:{product:{id:'product'},userErrors:[]}}};
  }
  if(query.includes('mutation AifGalleryVariantImage')) {variantUpdates.push(...variables.variants);return {data:{productVariantsBulkUpdate:{userErrors:[]}}};}
  throw new Error('Unexpected Shopify operation: '+query);
};
const db={query:async(query,args)=>{
  if(query.includes('FROM aif_shopify_variant_map')) return {rows:[{variant_id:'local',shopify_variant_id:'variant',title:'Test product',images:urls,image_url:urls[0]}]};
  if(query.startsWith('SELECT source_url')) return {rows:[...links.values()]};
  if(query.startsWith('INSERT INTO aif_shopify_image_links')) {links.set(args[1],{source_url:args[1],media_id:args[2],managed:args[3]});return {rows:[]};}
  if(query.startsWith('DELETE FROM aif_shopify_image_links')) return {rows:[]};
  throw new Error('Unexpected DB operation: '+query);
}};
try {
  const first=await worker.syncProductImages(db,{shopify_product_id:'product',bootstrap_urls:[]});
  assert.equal(first.desiredImages,5);assert.equal(first.uploaded,5);
  assert.deepEqual(uploads.map(item=>item.originalSource),urls);
  assert.deepEqual(variantUpdates,[{id:'variant',mediaId:'media-1'}]);
  const second=await worker.syncProductImages(db,{shopify_product_id:'product',bootstrap_urls:[]});
  assert.equal(second.desiredImages,5);assert.equal(second.uploaded,0);assert.equal(uploads.length,5);
  console.log('OK: mind az 5 galériakép feltöltése, főképkapcsolat, ismételt frissítésnél nincs duplázás. Csak szimulált Shopify és adatbázis.');
} finally {delete globalThis.__aifGalleryTest;}
