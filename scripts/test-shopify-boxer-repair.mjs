import assert from 'node:assert/strict';
import {runRepair, validateProducts, verify, KEEP, OLD, ITEMS} from './repair-shopify-boxer-25uushj083.mjs';
const gid=id=>`gid://shopify/ProductVariant/${id}`;
const config={enabled:true,missing:[],shopDomain:'test.myshopify.com',aifLocations:{csikszereda:{id:'ciuc'},kezdi:{id:'kezdi'}},
  shopifyLocations:{csikszereda:'location-ciuc',kezdi:'location-kezdi'}};
export function fixture() {
  const products=[KEEP,...OLD].map((id,i)=>({id,title:'Boxer test',status:'ACTIVE',variants:{pageInfo:{hasNextPage:false},nodes:
    (i===1?ITEMS.filter(x=>x.size==='M'):ITEMS).map(x=>({id:gid(i===0?x.target:i===1?'55023007826247':x.duplicate),
      sku:x.sku,barcode:x.sku,title:`negru / ${x.size}`,selectedOptions:[{value:'negru'},{value:x.size}],inventoryItem:{
        id:`inventory-${i}-${x.size}`,tracked:true,inventoryLevels:{pageInfo:{hasNextPage:false},nodes:
          ['ciuc','kezdi'].map(l=>({location:{id:`location-${l}`},quantities:[{name:'available',quantity:4},{name:'committed',quantity:0}]}))}
      }}))}}));
  const state={variants:ITEMS.map(x=>({id:x.id,barcode:x.sku,status:'active',model_status:'active'})),
    maps:ITEMS.map(x=>({variant_id:x.id,sku:x.sku,shopify_product_id:x.size==='M'?OLD[0]:KEEP,
      shopify_variant_id:gid(x.size==='M'?'55023007826247':x.target),shopify_inventory_item_id:`inventory-${x.size==='M'?1:0}-${x.size}`,
      sync_status:'synced',last_synced_at:'2026-11-15',last_synced_csikszereda_qty:4,last_synced_kezdi_qty:4})),
    stock:ITEMS.map(x=>({variant_id:x.id,ciuc:4,kezdi:4})),outbox:ITEMS.map(x=>({variant_id:x.id,status:'done',desired_csikszereda_qty:4,desired_kezdi_qty:4}))};
  const calls=[], sql=[];
  let saved;
  const db={query:async(q,p)=>{
    sql.push(q);
    if(q.startsWith('BEGIN')) {saved=structuredClone(state);return {rows:[]};}
    if(q==='ROLLBACK') {Object.assign(state,saved);return {rows:[]};}
    if(q.includes('UPDATE aif_shopify_variant_map')) {
      const m=state.maps.find(m=>m.variant_id===p[0] && m.shopify_variant_id===p[7]);
      if(!m)return {rows:[],rowCount:0};
      Object.assign(m,{shopify_product_id:p[1],shopify_variant_id:p[2],shopify_inventory_item_id:p[3],sync_status:'mapped',last_synced_at:null});
      return {rows:[m],rowCount:1};
    }
    if(q.includes('FROM aif_product_variants v JOIN')) return {rows:state.variants};
    if(q.includes('FROM aif_shopify_variant_map WHERE')) return {rows:state.maps};
    if(q.includes('FROM aif_stock WHERE')) return {rows:state.stock};
    if(q.includes('FROM aif_shopify_sync_outbox WHERE')) return {rows:state.outbox};
    if(q==='COMMIT' || q.startsWith('SET LOCAL') || q.startsWith('LOCK TABLE'))return {rows:[]};
    throw new Error('Unexpected SQL: '+q);
  }};
  const api={getAifShopifyPublicConfig:()=>config,getAifShopifySyncBlockers:async()=>({global:false,variantIds:[]}),
    enqueueAifShopifyVariant:async(db,id,reason,opts)=>{
      assert.equal(opts.schemaReady,true);calls.push({enqueue:id});
      state.outbox.find(o=>o.variant_id===id).status='pending';return {queued:true,syncEnabled:true};
    },shopifyGraphql:async(q,args)=>{
      if(q.includes('mutation')) {
        calls.push({archive:args.product.id});const p=products.find(p=>p.id===args.product.id);p.status='ARCHIVED';
        return {data:{productUpdate:{product:{id:p.id,status:p.status},userErrors:[]}}};
      }
      return {data:{product:structuredClone(products.find(p=>p.id===args.id))}};
    }};
  const backup=async()=>{calls.push({backup:true});};
  return {state,products,db,api,calls,sql,backup};
}
export function finish(f) {
  f.state.maps.forEach(m=>{const x=ITEMS.find(x=>x.id===m.variant_id);Object.assign(m,{shopify_product_id:KEEP,
    shopify_variant_id:gid(x.target),shopify_inventory_item_id:`inventory-0-${x.size}`,sync_status:'synced',last_synced_at:'2026-11-15'});});
  f.state.outbox.forEach(o=>o.status='done');
}

const log=console.log, table=console.table, error=console.error;
console.log=console.table=console.error=()=>{};
try {
  let f=fixture();
  await runRepair(f.db,f.api,'check',f.backup);
  assert.equal(f.calls.length,0);assert(f.sql.at(-1)==='ROLLBACK');
  await runRepair(f.db,f.api,'apply',f.backup);
  assert.equal(f.calls.filter(c=>c.enqueue).length,4);assert(f.calls[0].backup);
  assert.equal(f.state.maps.find(m=>m.variant_id===ITEMS[1].id).shopify_product_id,KEEP);
  await assert.rejects(runRepair(f.db,f.api,'archive',f.backup),/szinkron még nem kész/);
  finish(f);await runRepair(f.db,f.api,'verify',f.backup);
  await runRepair(f.db,f.api,'archive',f.backup);
  assert.equal(f.calls.filter(c=>c.archive).length,2);
  await runRepair(f.db,f.api,'archive',f.backup);
  assert.equal(f.calls.filter(c=>c.archive).length,2,'Archive retry must be idempotent');
  for (const breakIt of [
    f=>f.products[0].variants.nodes[0].sku='WRONG',
    f=>f.products[0].variants.pageInfo.hasNextPage=true,
    f=>f.products[1].variants.nodes.push(structuredClone(f.products[1].variants.nodes[0])),
    f=>f.state.maps.push({...f.state.maps[0],variant_id:'unexpected'}),
    f=>f.products[0].variants.nodes[0].inventoryItem.inventoryLevels.pageInfo.hasNextPage=true,
    f=>f.products[0].variants.nodes[0].selectedOptions[0].value='red',
    f=>f.state.maps[0].shopify_inventory_item_id='wrong',
  ]) {
    f=fixture();breakIt(f);await assert.rejects(runRepair(f.db,f.api,'apply',f.backup));
    assert.equal(f.calls.length,0);
  }
  f=fixture();f.api.getAifShopifySyncBlockers=async()=>({global:true,variantIds:[],reason:'pending orders'});
  await assert.rejects(runRepair(f.db,f.api,'apply',f.backup),/blokkolja/);assert.equal(f.calls.length,0);
  f=fixture();f.api.enqueueAifShopifyVariant=async()=>({queued:false});
  await assert.rejects(runRepair(f.db,f.api,'apply',f.backup),/sorba/);
  assert.equal(f.state.maps[1].shopify_product_id,OLD[0],'Failed queue must roll back mapping');
  f=fixture();await assert.rejects(runRepair(f.db,f.api,'apply',async()=>{throw Error('backup failed');}),/backup failed/);
  assert.equal(f.calls.length,0);
  f=fixture();finish(f);f.products[0].variants.nodes[0].inventoryItem.inventoryLevels.nodes[0].quantities[0].quantity=99;
  await assert.rejects(runRepair(f.db,f.api,'archive',f.backup),/készlete még eltér/);assert.equal(f.calls.length,0);
  f=fixture();finish(f);f.products[1].variants.nodes[0].inventoryItem.inventoryLevels.nodes[0].quantities[1].quantity=1;
  await assert.rejects(runRepair(f.db,f.api,'archive',f.backup),/Foglalt/);assert(!f.calls.some(c=>c.archive));
  f=fixture();finish(f);const graph=f.api.shopifyGraphql;
  f.api.shopifyGraphql=async(q,a)=>q.includes('mutation') && a.product.id===OLD[1]?{data:{}}:graph(q,a);
  await assert.rejects(runRepair(f.db,f.api,'archive',f.backup),/nem igazolt/);
  assert.equal(f.products[1].status,'ARCHIVED');assert.equal(f.products[2].status,'ACTIVE');
  f.api.shopifyGraphql=graph;await runRepair(f.db,f.api,'archive',f.backup);
  assert.equal(f.calls.filter(c=>c.archive===OLD[0]).length,1,'Partial retry must skip completed product');
} finally {console.log=log;console.table=table;console.error=error;}
console.log('OK: pontos azonosítók, SKU és szín/méret; hiányos válasz; idegen párosítás; mentési és sorbaállítási hiba; rollback; készletellenőrzés; foglalás; ismételt és részleges archiválás. Csak szimulált DB és Shopify.');
