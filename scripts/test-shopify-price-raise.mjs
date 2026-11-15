import assert from 'node:assert/strict';
import {cents,money,buildPlan,wrapPlan,validatePlan,applyOne,allRemote} from './shopify-price-raise.mjs';
export function fixture() {
  const local={variant_id:'00000000-0000-4000-8000-000000000001',barcode:'196885576171',internal_sku:'1382727-001-M',
    size:'M',color_code:'001',sell_price:'239.50',variant_status:'active',model_status:'active',title:'Test nadrág',mapped_sku:'196885576171',
    shopify_product_id:'gid://shopify/Product/100',shopify_variant_id:'gid://shopify/ProductVariant/200',shopify_inventory_item_id:'gid://shopify/InventoryItem/300'};
  const remote={id:local.shopify_variant_id,sku:local.barcode,barcode:local.barcode,price:'229.50',compareAtPrice:null,
    product:{id:local.shopify_product_id,title:local.title,status:'ACTIVE'}};
  const calls=[],journal=[];
  const db={query:async(q)=>{
    calls.push({sql:q});
    if(q.includes('count(*)'))return {rows:[{n:0}]};
    if(q.includes('SELECT v.id'))return {rows:[structuredClone(local)]};
    return {rows:[]};
  }};
  const api={shopifyGraphql:async(q,args)=>{
    calls.push({query:q,args});
    if(q.includes('mutation')){
      assert.deepEqual(Object.keys(args).sort(),['productId','variants']);
      assert.deepEqual(Object.keys(args.variants[0]).sort(),['id','price']);
      assert(q.includes('allowPartialUpdates:false'));remote.price=args.variants[0].price;
      return {data:{productVariantsBulkUpdate:{userErrors:[],productVariants:[{id:remote.id,price:remote.price,compareAtPrice:remote.compareAtPrice}]}}};
    }
    return {data:{productVariant:structuredClone(remote),productVariants:{nodes:[{id:remote.id,sku:remote.sku,product:remote.product}],pageInfo:{hasNextPage:false}}}};
  }};
  return {local,remote,calls,db,api,journal,log:async(e)=>journal.push(e)};
}
const item=f=>buildPlan([f.local],[f.remote],'test.myshopify.com').items[0];
assert.equal(cents('239.5000'),23950);assert.equal(money(cents('0.01')),'0.01');
for(const invalid of [null,undefined,'','NaN','-1','1.001','1e3','Infinity'])assert.throws(()=>cents(invalid));
let f=fixture();let p=buildPlan([f.local],[f.remote],'test.myshopify.com');
assert.equal(p.items.length,1);assert.equal(p.items[0].to,'239.50');
assert.equal(validatePlan(wrapPlan(p),'test.myshopify.com').items.length,1);
assert.throws(()=>validatePlan(wrapPlan(p),'other.myshopify.com'));
const broken=wrapPlan(p);broken.plan.items[0].to='240.00';assert.throws(()=>validatePlan(broken,'test.myshopify.com'));
p=buildPlan([f.local],[f.remote],'test.myshopify.com',new Date(Date.now()-90000000));
assert.throws(()=>validatePlan(wrapPlan(p),'test.myshopify.com'));
for(const [price,key]of [['239.50','equal'],['249.50','internalLower']]){
  f=fixture();f.remote.price=price;p=buildPlan([f.local],[f.remote],'test.myshopify.com');assert.equal(p.items.length,0);assert.equal(p.counts[key],1);
}
for(const change of [
  f=>f.remote.sku='wrong',f=>f.remote.barcode='wrong',f=>f.local.shopify_variant_id=null,
  f=>f.remote.product.status='ARCHIVED',f=>f.local.variant_status='archived',
  f=>f.remote.compareAtPrice='239.50',f=>f.remote.compareAtPrice='230.00',f=>f.local.sell_price='0',
]){f=fixture();change(f);assert.equal(buildPlan([f.local],[f.remote],'test.myshopify.com').items.length,0);}
f=fixture();assert.equal(buildPlan([f.local],[f.remote,{...f.remote,id:'gid://shopify/ProductVariant/201'}],'test.myshopify.com').items.length,0);
f=fixture();assert.equal(buildPlan([f.local],[f.remote,{...f.remote,id:'gid://shopify/ProductVariant/201',product:{...f.remote.product,status:'ARCHIVED'}}],'test.myshopify.com').items.length,1);
f=fixture();assert.equal(buildPlan([f.local,{...f.local,variant_id:'another'}],[f.remote],'test.myshopify.com').items.length,0);
f=fixture();let planned=item(f);assert.equal(await applyOne(f.db,f.api,planned,f.log),'updated');
assert.equal(f.remote.price,'239.50');assert.equal(f.remote.compareAtPrice,null);assert.deepEqual(f.journal.map(x=>x.status),['before','verified']);
assert.equal(await applyOne(f.db,f.api,planned,f.log),'already_correct');assert.equal(f.calls.filter(c=>c.query?.includes('mutation')).length,1);
f=fixture();f.remote.compareAtPrice='299.50';planned=item(f);await applyOne(f.db,f.api,planned,f.log);assert.equal(f.remote.compareAtPrice,'299.50');
for(const change of [
  f=>f.local.sell_price='249.50',f=>f.remote.price='250.00',f=>f.remote.price='230.00',
  f=>f.remote.compareAtPrice='299.50',f=>f.local.shopify_product_id='gid://shopify/Product/999',
  f=>f.remote.sku='wrong',f=>f.remote.barcode='wrong',
]){f=fixture();planned=item(f);change(f);await assert.rejects(applyOne(f.db,f.api,planned,f.log));assert(!f.calls.some(c=>c.query?.includes('mutation')));}
f=fixture();planned=item(f);await assert.rejects(applyOne(f.db,f.api,planned,async()=>{throw Error('disk full');}));assert(!f.calls.some(c=>c.query?.includes('mutation')));
f=fixture();planned=item(f);const graph=f.api.shopifyGraphql;
f.api.shopifyGraphql=async(q,a)=>q.includes('mutation')?{data:{productVariantsBulkUpdate:{userErrors:[{message:'denied'}]}}}:graph(q,a);
await assert.rejects(applyOne(f.db,f.api,planned,f.log));assert.equal(f.journal.at(-1).status,'needs_recheck');
f=fixture();planned=item(f);const real=f.api.shopifyGraphql;
f.api.shopifyGraphql=async(q,a)=>{const r=await real(q,a);if(q.includes('mutation'))return {data:{}};return r;};
await assert.rejects(applyOne(f.db,f.api,planned,f.log));assert.equal(f.remote.price,'239.50');assert.equal(await applyOne(f.db,f.api,planned,f.log),'already_correct');
await assert.rejects(allRemote({shopifyGraphql:async()=>({data:{}})}));
f=fixture();const catalog=await allRemote({shopifyGraphql:async()=>({data:{productVariants:{nodes:[f.remote],pageInfo:{hasNextPage:false}}}})});assert.equal(catalog.length,1);
console.log('OK: csak áremelés; SKU/párosítás/deviza-terv védelem; duplikációk; akciós árütközés; elavult terv; kizárólag price mező írása; visszaolvasás; újrafuttatás; API- és mentési hibák. Csak szimulált Shopify és DB.');
