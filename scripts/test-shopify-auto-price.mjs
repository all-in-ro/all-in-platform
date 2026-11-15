import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAifShopifyPriceSync,priceCents} from '../api/lib/aifShopifyPriceSync.js';
export function fixture(){
 const source={price:'239.50',barcode:'196885576171',internalSku:'1382727-001-M',variantStatus:'active',modelStatus:'active',
 productId:'gid://shopify/Product/100',variantId:'gid://shopify/ProductVariant/200',inventoryItemId:'gid://shopify/InventoryItem/300'};
 const row={variant_id:'00000000-0000-4000-8000-000000000001',source:structuredClone(source),status:'pending',attempts:0};
 const v={id:source.variantId,sku:source.barcode,barcode:source.barcode,price:'229.50',compareAtPrice:null,product:{id:source.productId,status:'ACTIVE'}};
 const state={source,row,audit:[],v,mutations:[],queries:[],duplicates:0,remoteDuplicates:false,missingPayload:false,failedReadback:false};let saved;
 const db={release(){},query:async(q,p=[])=>{
   state.queries.push(q);
   if(q==='BEGIN'){saved={row:structuredClone(state.row),audit:structuredClone(state.audit)};return {rows:[]};}
   if(q==='ROLLBACK'){if(saved){state.row=saved.row;state.audit=saved.audit;}return {rows:[]};}
   if(q==='COMMIT'||q.startsWith('SET LOCAL'))return {rows:[]};
   if(q.includes('SELECT v.id::text AS id'))return {rows:[{id:row.variant_id,source:structuredClone(state.source)}]};
   if(q.includes('count(*)'))return {rows:[{n:state.duplicates}]};
   if(q.startsWith('INSERT INTO aif_shopify_price_sync_audit')){const id=state.audit.length+1;state.audit.push({id,status:'prepared',from:p[4],to:p[5]});return {rows:[{id}]};}
   if(q.startsWith('UPDATE aif_shopify_price_sync_audit')){
     if(q.includes("status='recovered'"))state.audit.filter(a=>['prepared','uncertain'].includes(a.status)).forEach(a=>a.status='recovered');
     else {const a=state.audit.find(a=>a.id===p[0]);a.status=q.includes("status='verified'")?'verified':p[1];a.error=p[2];}return {rows:[]};
   }
   if(q.startsWith('UPDATE aif_shopify_price_sync_state')){
     if(q.includes('SET source=')){state.row.source=JSON.parse(p[1]);state.row.status='pending';state.row.attempts=0;}
     else {state.row.status=p[1];if(q.includes('attempts=attempts+1')){state.row.attempts++;state.row.delay=p[3];}}
     return {rows:[]};
   }
   throw Error('Unexpected SQL: '+q);
 }};
 const api={getAifShopifyPublicConfig:()=>({enabled:true}),acquireAifShopifyProcessLock:async()=>({locked:true,release:async()=>{}}),
 shopifyGraphql:async(q,p)=>{
   if(q.includes('mutation')){
     assert.deepEqual(Object.keys(p).sort(),['productId','variants']);assert.deepEqual(Object.keys(p.variants[0]).sort(),['id','price']);
     state.mutations.push(p);v.price=p.variants[0].price;
     if(state.missingPayload)return {data:{}};
     return {data:{productVariantsBulkUpdate:{productVariants:[{id:v.id,price:v.price}],userErrors:[]}}};
   }
   if(state.failedReadback && state.mutations.length)throw Error('network');
   const nodes=[{id:v.id,sku:v.sku,product:v.product}];if(state.remoteDuplicates)nodes.push({...nodes[0],id:'gid://shopify/ProductVariant/999'});
   return {data:{productVariant:structuredClone(v),productVariants:{nodes,pageInfo:{hasNextPage:false}}}};
 }};
 return {state,db,api,engine:createAifShopifyPriceSync(api)};
}
const warn=console.warn;console.warn=()=>{};
try{
 assert.equal(priceCents('239.5000'),23950);for(const x of ['',null,'1.001','-1','NaN'])assert.throws(()=>priceCents(x));
 let f=fixture();assert.equal(await f.engine.processRow(f.db,f.state.row),'updated');assert.equal(f.state.row.status,'done');assert.equal(f.state.audit[0].status,'verified');assert.equal(f.state.v.price,'239.50');
 assert.equal(await f.engine.processRow(f.db,f.state.row),'equal');assert.equal(f.state.mutations.length,1);
 f=fixture();f.state.v.price='249.50';assert.equal(await f.engine.processRow(f.db,f.state.row),'skipped');assert.equal(f.state.mutations.length,0);
 f=fixture();f.state.source.price='249.50';assert.equal(await f.engine.processRow(f.db,f.state.row),'superseded');assert.equal(f.state.row.source.price,'249.50');assert.equal(f.state.mutations.length,0);
 for(const change of [f=>f.state.v.sku='wrong',f=>f.state.v.barcode='wrong',f=>f.state.remoteDuplicates=true,
   f=>f.state.duplicates=1,f=>f.state.v.compareAtPrice='239.50',f=>f.state.v.product.status='ARCHIVED']){
   f=fixture();change(f);assert.equal(await f.engine.processRow(f.db,f.state.row),'blocked');assert.equal(f.state.mutations.length,0);assert.equal(f.state.row.delay,3600);
 }
 f=fixture();f.state.v.compareAtPrice='299.50';assert.equal(await f.engine.processRow(f.db,f.state.row),'updated');assert.equal(f.state.v.compareAtPrice,'299.50');
 f=fixture();f.state.missingPayload=true;assert.equal(await f.engine.processRow(f.db,f.state.row),'retry');assert.equal(f.state.audit[0].status,'uncertain');assert.equal(f.state.row.delay,15);
 assert.equal(await f.engine.processRow(f.db,f.state.row),'equal');assert.equal(f.state.mutations.length,1);assert.equal(f.state.audit[0].status,'recovered');
 f=fixture();f.state.failedReadback=true;assert.equal(await f.engine.processRow(f.db,f.state.row),'retry');assert.equal(f.state.audit[0].status,'uncertain');
 f=fixture();const query=f.db.query;f.db.query=async(q,p)=>{if(q.startsWith('INSERT INTO aif_shopify_price_sync_audit'))throw Error('disk full');return query(q,p);};
 assert.equal(await f.engine.processRow(f.db,f.state.row),'retry');assert.equal(f.state.mutations.length,0);
 f=fixture();const old=f.api.shopifyGraphql;let reads=0;f.api.shopifyGraphql=async(q,p)=>{if(!q.includes('mutation')&&++reads===1)f.state.source.price='249.50';return old(q,p);};
 assert.equal(await f.engine.processRow(f.db,f.state.row),'retry');assert.equal(f.state.mutations.length,0);assert.equal(f.state.audit[0].status,'cancelled');
 f=fixture();f.state.source.variantStatus='archived';f.state.row.source=structuredClone(f.state.source);assert.equal(await f.engine.processRow(f.db,f.state.row),'skipped');assert.equal(f.state.mutations.length,0);
 const previous=process.env.SHOPIFY_PRICE_SYNC_ENABLED;process.env.SHOPIFY_PRICE_SYNC_ENABLED='false';
 assert.equal((await fixture().engine.runBatch({})).enabled,false);
 if(previous===undefined)delete process.env.SHOPIFY_PRICE_SYNC_ENABLED;else process.env.SHOPIFY_PRICE_SYNC_ENABLED=previous;
 // Verify the actual embedded worker calls price sync after stock sync and contains its failures.
 let code=await readFile(new URL('../api/lib/aifShopifyEmbeddedWorker.js',import.meta.url),'utf8');
 code=code.replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'').replace(/export /g,'');
 const order=[];const stubs={randomUUID:()=> 'test',recordAifShopifyWorkerHealth:async()=>{},getAifShopifySyncHealth:async()=>({ok:true,queue:{},warnings:[],safety:{global:false,variantIds:[],orderIds:[]}}),
 enqueueAifShopifyImageBacklog:async()=>({}),processAifShopifyImageOutboxBatch:async()=>({}),
 processAifShopifyInboundBatch:async()=>({enabled:true}),processAifShopifyOrderBatch:async()=>({enabled:true}),processAifShopifyWarehouseBatch:async()=>({}),
 processAifShopifyOutboxBatch:async()=>{order.push('stock');return {enabled:true};},
 processAifShopifyPriceSyncBatch:async()=>{order.push('price');throw Error('test failure');},
 syncAifShopifyNewness:async()=>({}),syncAifShopifyNewnessVisibility:async()=>({}),setTimeout:()=>({unref(){}}),clearTimeout:()=>{}};
 const tick=new Function(...Object.keys(stubs),code+'; return tick;')(...Object.values(stubs));
 const ce=console.error;console.error=()=>{};
 const state={stopped:false,running:false,pool:{},imageBacklogSeeded:true,lastHealthCheck:Date.now(),lastNewnessSyncAt:Date.now(),newnessIntervalMs:3600000,lastPriceSyncAt:0,idleDelayMs:2000,errorDelayMs:15000};
 try{await tick(state);}finally{console.error=ce;}
 assert.deepEqual(order,['stock','price']);assert.equal(state.tickOutcome.phase,'idle');assert.equal(state.running,false);
}finally{console.warn=warn;}
console.log('OK: csak áremelés; SKU/árütközések; mentés és visszaellenőrzés; tartós hibastátusz; újrafuttatás; kikapcsolás; worker bekötés és hibaszigetelés. Csak szimulált API/DB.');
