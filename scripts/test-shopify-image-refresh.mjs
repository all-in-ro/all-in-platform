import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source = await fs.readFile(new URL('../api/lib/aifShopifyImageRefresh.js', import.meta.url),'utf8');
// Isolated tests: no production DB connection and no Shopify request.
const isolated = source.replace(/^import .*;\n/gm,'');
const api = await import('data:text/javascript;base64,'+Buffer.from(`const shopifyGraphql=()=>{throw Error('Unexpected network access')};\n`+isolated).toString('base64'));
const sku='198632608616';
const remote={id:'gid://shopify/ProductVariant/1',sku,inventoryItem:{id:'gid://shopify/InventoryItem/1'},product:{id:'gid://shopify/Product/1'}};
const result=nodes=>async()=>({data:{productVariants:{nodes,pageInfo:{hasNextPage:false}}}});
assert.equal((await api.findImageRefreshVariant(sku,result([remote]))).id,remote.id);
await assert.rejects(api.findImageRefreshVariant(sku,result([])),/Nem található élő/);
await assert.rejects(api.findImageRefreshVariant(sku,result([remote,{...remote,id:'second'}])),/Több Shopify/);
await assert.rejects(api.findImageRefreshVariant(sku,result([{...remote,sku:sku+'0'}])),/Nem található élő/);
await assert.rejects(api.findImageRefreshVariant('',result([])),/Hiányzik/);
await assert.rejects(api.findImageRefreshVariant(sku,async()=>({errors:[{message:'denied'}]})),/nem ellenőrizhetők/);
await assert.rejects(api.findImageRefreshVariant(sku,async()=>({data:{productVariants:{nodes:[remote],pageInfo:{hasNextPage:true}}}})),/nem ellenőrizhetők/);
await assert.rejects(api.findImageRefreshVariant(sku,result([{...remote,inventoryItem:null}])),/Hiányos/);
await assert.rejects(api.getImageRefreshStatus({},'bad-id'),/Érvénytelen/);
const routes=[];const auth=()=>{};
api.registerImageRefreshRoutes({get:(...args)=>routes.push(args),post:(...args)=>routes.push(args)}, {}, auth);
assert.equal(routes.length,2);assert.ok(routes.every(route=>route[1]===auth));
assert.ok(!/processAifShopifyOutboxBatch|enqueueAifShopifyVariant|productCreate|inventorySet|price:/.test(source));
// Older imports may put an internal SKU in Shopify and the EAN in barcode.
const legacy={...remote,sku:'UA-1290261-090-M',barcode:sku};
assert.equal((await api.findImageRefreshVariant({barcode:sku,internal_sku:'UA-1290261-090-M'},result([legacy]))).id,remote.id);
assert.equal((await api.findImageRefreshVariant({barcode:sku},result([legacy]))).id,remote.id);
assert.equal((await api.findImageRefreshVariant({internal_sku:legacy.sku},result([legacy]))).id,remote.id);
await assert.rejects(api.findImageRefreshVariant({barcode:sku,internal_sku:legacy.sku},result([{...legacy,barcode:'DIFFERENT'}])),/vonalkódja eltér/);
let calls=0;
const byId=async(query,variables)=>{calls++;assert.match(query,/productVariant\(id:/);assert.equal(variables.id,remote.id);return {data:{productVariant:legacy}};};
assert.equal((await api.findImageRefreshVariant({barcode:sku,shopify_variant_id:remote.id},byId)).id,remote.id);assert.equal(calls,1);
await assert.rejects(api.findImageRefreshVariant({barcode:sku,shopify_variant_id:remote.id},async()=>({data:{productVariant:null}})),/már nem található/);
let page=0;
assert.equal((await api.findImageRefreshVariant({barcode:sku},async(_q,v)=>{
 page++;if(page===1){assert.equal(v.after,null);return {data:{productVariants:{nodes:[],pageInfo:{hasNextPage:true,endCursor:'next'}}}};}
 assert.equal(v.after,'next');return {data:{productVariants:{nodes:[legacy],pageInfo:{hasNextPage:false}}}};
})).id,remote.id);
console.log('OK: Shopify ID, régi SKU, vonalkódmező, lapozás, ütközések, hiányzó találat, API-hibák és jogosultság. Nincs élő adat- vagy Shopify-módosítás.');
