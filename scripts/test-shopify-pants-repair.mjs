import assert from 'node:assert/strict';
import {runRepair, validateProducts, verify, KEEP, OLD, ITEMS as SPEC} from './repair-shopify-pants-1382727.mjs';
const ITEMS=SPEC.map((x,i)=>({...x,id:x.id||`00000000-0000-4000-8000-00000000000${i}`,target:x.target||String(99000+i)}));
const gid=id=>`gid://shopify/ProductVariant/${id}`;
const config={enabled:true,missing:[],shopDomain:'test.myshopify.com',aifLocations:{csikszereda:{id:'ciuc'},kezdi:{id:'kezdi'}},
  shopifyLocations:{csikszereda:'location-ciuc',kezdi:'location-kezdi'}};
export function fixture() {
  const products=[KEEP,...OLD].map((id,i)=>({id,title:'Boxer test',status:'ACTIVE',variants:{pageInfo:{hasNextPage:false},nodes:
    (i===1?ITEMS.filter(x=>x.old):ITEMS).map(x=>({id:gid(i===0?x.target:x.old),
      sku:x.sku,barcode:x.sku,price:i===0?'239.50':'229.50',title:`negru / ${x.size}`,selectedOptions:[{value:'negru'},{value:x.size}],inventoryItem:{
        id:`inventory-${i}-${x.size}`,tracked:true,inventoryLevels:{pageInfo:{hasNextPage:false},nodes:
          ['ciuc','kezdi'].map(l=>({location:{id:`location-${l}`},quantities:[{name:'available',quantity:4},{name:'committed',quantity:0}]}))}
      }}))}}));
  const state={variants:ITEMS.map(x=>({id:x.id,barcode:x.sku,status:'active',model_status:'active',size:x.size,model_id:'test-model',sell_price:'239.50'})),
    maps:ITEMS.map(x=>({variant_id:x.id,sku:x.sku,shopify_product_id:x.old?OLD[0]:KEEP,
      shopify_variant_id:gid(x.old||x.target),shopify_inventory_item_id:`inventory-${x.old?1:0}-${x.size}`,
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

const log=console.log,table=console.table,error=console.error;
console.log=console.table=console.error=()=>{};
try {
  let f=fixture();await runRepair(f.db,f.api,'check',f.backup);assert.equal(f.calls.length,0);
  const unchanged=structuredClone(f.state.maps.slice(3));
  await runRepair(f.db,f.api,'apply',f.backup);
  assert(f.state.maps.every(m=>m.shopify_product_id===KEEP));
  assert.deepEqual(f.state.maps.slice(3),unchanged,'L/XL mapping must remain unchanged');
  assert.equal(f.calls.filter(c=>c.enqueue).length,5);
  assert.equal(f.sql.filter(q=>q.includes('UPDATE aif_shopify_variant_map')).length,3);
  await assert.rejects(runRepair(f.db,f.api,'archive',f.backup),/szinkron még nem kész/);
  await runRepair(f.db,f.api,'apply',f.backup);
  assert.equal(f.sql.filter(q=>q.includes('UPDATE aif_shopify_variant_map')).length,3);
  finish(f);await runRepair(f.db,f.api,'verify',f.backup);
  await runRepair(f.db,f.api,'archive',f.backup);await runRepair(f.db,f.api,'archive',f.backup);
  assert.equal(f.calls.filter(c=>c.archive).length,1);
  for(const change of [
    f=>f.state.variants[0].sell_price='229.50',
    f=>f.state.variants[3].sell_price=null,
    f=>f.state.variants[4].model_id='different',
    f=>f.state.variants.push({...f.state.variants[4],id:'extra'}),
    f=>f.state.maps[3].shopify_variant_id='wrong',
    f=>f.state.maps.push({...f.state.maps[4],variant_id:'other'}),
    f=>f.products[0].variants.nodes[3].sku='other',
    f=>f.products[0].variants.pageInfo.hasNextPage=true,
    f=>f.products[0].variants.nodes[3].selectedOptions[1].value='S',
    f=>f.products[0].variants.nodes[0].inventoryItem.inventoryLevels.nodes[0].quantities=[],
  ]) {
    f=fixture();change(f);await assert.rejects(runRepair(f.db,f.api,'apply',f.backup));assert.equal(f.calls.length,0);
  }
  f=fixture();f.products[0].variants.nodes[0].inventoryItem.inventoryLevels.nodes.pop();
  await runRepair(f.db,f.api,'check',f.backup);await runRepair(f.db,f.api,'apply',f.backup);finish(f);
  await assert.rejects(runRepair(f.db,f.api,'archive',f.backup),/Hiányzó Shopify-helyszín/);
  f=fixture();let n=0;f.api.enqueueAifShopifyVariant=async()=>({queued:++n<3,syncEnabled:true});
  await assert.rejects(runRepair(f.db,f.api,'apply',f.backup),/sorba/);
  assert(f.state.maps.slice(0,3).every(m=>m.shopify_product_id===OLD[0]),'All three remaps must roll back');
  f=fixture();await assert.rejects(runRepair(f.db,f.api,'apply',async()=>{throw Error('backup failed');}),/backup failed/);
  assert.equal(f.calls.length,0);
  f=fixture();f.api.getAifShopifySyncBlockers=async()=>({global:true,variantIds:[],reason:'pending'});
  await assert.rejects(runRepair(f.db,f.api,'apply',f.backup),/blokkolja/);
  f=fixture();finish(f);f.products[0].variants.nodes[4].inventoryItem.inventoryLevels.nodes[0].quantities[0].quantity=99;
  await assert.rejects(runRepair(f.db,f.api,'archive',f.backup),/készlete még eltér/);
  f=fixture();finish(f);f.products[1].variants.nodes[0].inventoryItem.inventoryLevels.nodes[0].quantities[1].quantity=1;
  await assert.rejects(runRepair(f.db,f.api,'archive',f.backup),/Foglalt/);assert(!f.calls.some(c=>c.archive));
  f=fixture();finish(f);const graph=f.api.shopifyGraphql;
  f.api.shopifyGraphql=async(q,a)=>q.includes('mutation')?{data:{}}:graph(q,a);
  await assert.rejects(runRepair(f.db,f.api,'archive',f.backup),/nem igazolt/);
}finally{console.log=log;console.table=table;console.error=error;}
console.log('OK: 3 párosítás javítása, L/XL megőrzése, 5 méret készlete, ár- és azonosítóvédelem, hiányzó helyszín, rollback, archiválás és újrafuttatás. Csak szimulált DB és Shopify.');
