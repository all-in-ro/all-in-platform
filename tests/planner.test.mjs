import test from 'node:test';
import assert from 'node:assert/strict';
import { planAifShopifyLifecycle as plan } from '../api/lib/aifShopifyLifecyclePlan.js';
const ID='gid://shopify/LineItem/100', V='11111111-1111-4111-8111-111111111111';
const base=()=>({order:{status:'open',financial_status:'paid',raw:{refunds:[]}},lines:[{shopify_line_item_id:ID,aif_variant_id:V,sku:'TEST',quantity:3,current_quantity:3,is_active:true}],warehouseLines:[{shopify_line_item_id:ID,variant_id:V,allocated_qty:3,shipped_qty:0,released_qty:0,returned_qty:0}],fulfillments:[],refunds:[]});
const fulfilled=(n,status='success',id='F1')=>({id,status,line_items:[{id:'100',quantity:n}]});
const refund=(kind,n)=>({id:`r-${kind}`,shopify_line_item_id:ID,quantity:n,restock_type:kind});
function totals(p){return [p.add,p.ship,p.release,p.pending];}
test('unchanged allocated order does not write stock',()=>assert.deepEqual(totals(plan(base())),[0,0,0,3]));
test('full cancellation releases only allocated pieces',()=>{const x=base();x.order.status='cancelled';assert.deepEqual(totals(plan(x)),[0,0,3,0]);});
test('partial cancellation',()=>{const x=base();x.lines[0].current_quantity=2;assert.deepEqual(totals(plan(x)),[0,0,1,2]);});
test('cancel refund before order snapshot is reduced',()=>{const x=base();x.refunds=[refund('cancel',1)];assert.deepEqual(totals(plan(x)),[0,0,1,2]);});
test('refund and reduced current quantity never double release',()=>{const x=base();x.lines[0].current_quantity=2;x.refunds=[refund('cancel',1)];assert.deepEqual(totals(plan(x)),[0,0,1,2]);});
test('no-restock refund does not release physical goods',()=>{const x=base();x.lines[0].current_quantity=2;x.refunds=[refund('no_restock',1)];assert.deepEqual(totals(plan(x)),[0,0,0,3]);});
test('financial refund before revised snapshot still does not add',()=>{const x=base();x.refunds=[refund('no_restock',1)];assert.deepEqual(totals(plan(x)),[0,0,0,3]);});
test('return refund is not physical receipt',()=>{const x=base();x.warehouseLines[0].shipped_qty=3;x.fulfillments=[fulfilled(3)];x.lines[0].current_quantity=2;x.refunds=[refund('return',1)];assert.deepEqual(totals(plan(x)),[0,0,0,0]);assert.equal(plan(x).lines[0].expectedReturn,1);});
test('partial fulfillment',()=>{const x=base();x.fulfillments=[fulfilled(1)];assert.deepEqual(totals(plan(x)),[0,1,0,2]);});
test('all fulfilled',()=>{const x=base();x.fulfillments=[fulfilled(3)];assert.deepEqual(totals(plan(x)),[0,3,0,0]);});
test('pending fulfillment / AWB does not issue stock',()=>{const x=base();x.fulfillments=[fulfilled(3,'pending')];assert.deepEqual(totals(plan(x)),[0,0,0,3]);});
test('failed fulfillment does not issue stock',()=>{const x=base();x.fulfillments=[fulfilled(3,'failure')];assert.deepEqual(totals(plan(x)),[0,0,0,3]);});
test('multiple shipments sum exactly once by fulfillment id',()=>{const x=base();x.fulfillments=[fulfilled(1),fulfilled(1),fulfilled(2,'success','F2')];assert.deepEqual(totals(plan(x)),[0,3,0,0]);});
test('duplicate refund line id counted once',()=>{const x=base();x.refunds=[refund('cancel',1),refund('cancel',1)];assert.deepEqual(totals(plan(x)),[0,0,1,2]);});
test('repeat fulfillment does not deduct twice',()=>{const x=base();x.fulfillments=[fulfilled(1)];x.warehouseLines[0].shipped_qty=1;assert.deepEqual(totals(plan(x)),[0,0,0,2]);});
test('cancel after partial fulfillment releases remainder only',()=>{const x=base();x.order.status='cancelled';x.fulfillments=[fulfilled(1)];x.warehouseLines[0].shipped_qty=1;assert.deepEqual(totals(plan(x)),[0,0,2,0]);});
test('cancel and shipment seen together accounts shipment first',()=>{const x=base();x.order.status='cancelled';x.fulfillments=[fulfilled(1)];assert.deepEqual(totals(plan(x)),[0,1,2,0]);});
test('cancel after full fulfillment does not restock',()=>{const x=base();x.order.status='cancelled';x.fulfillments=[fulfilled(3)];x.warehouseLines[0].shipped_qty=3;assert.deepEqual(totals(plan(x)),[0,0,0,0]);});
test('increase adds a supplementary allocation',()=>{const x=base();x.lines[0].quantity=5;x.lines[0].current_quantity=5;assert.deepEqual(totals(plan(x)),[2,0,0,5]);});
test('increase after a previous reduction uses cumulative counters correctly',()=>{const x=base();x.warehouseLines[0].released_qty=1;assert.deepEqual(totals(plan(x)),[1,0,0,3]);});
test('removed line releases only its unshipped remainder',()=>{const x=base();x.lines[0].is_active=false;x.warehouseLines[0].shipped_qty=1;x.fulfillments=[fulfilled(1)];assert.deepEqual(totals(plan(x)),[0,0,2,0]);});
test('same variant in separate order lines is not conflated',()=>{const x=base();x.lines.push({...x.lines[0],shopify_line_item_id:'gid://shopify/LineItem/101',quantity:1,current_quantity:1});assert.deepEqual(totals(plan(x)),[1,0,0,4]);});
test('cancelled fulfillment is held for physical verification',()=>{const x=base();x.fulfillments=[fulfilled(1,'cancelled')];x.warehouseLines[0].shipped_qty=1;assert.throws(()=>plan(x),/visszavontak/);});
test('physically returned canceled fulfillment cannot create another unit',()=>{const x=base();x.fulfillments=[fulfilled(3,'cancelled')];x.warehouseLines[0].shipped_qty=3;x.warehouseLines[0].returned_qty=3;x.order.status='cancelled';assert.deepEqual(totals(plan(x)),[0,0,0,0]);});
test('historical fulfillment disappearance is not silently assumed safe',()=>{const x=base();x.warehouseLines[0].shipped_qty=1;assert.throws(()=>plan(x),/előzmény/);});
test('missing archived order line fails closed',()=>{const x=base();x.lines=[];assert.throws(()=>plan(x),/korábbi rendelési sor hiányzik/);});
test('changed variant mapping fails closed',()=>{const x=base();x.lines[0].aif_variant_id='different';assert.throws(()=>plan(x),/párosítás/);});
test('fractional quantities rejected',()=>{const x=base();x.lines[0].current_quantity=1.5;assert.throws(()=>plan(x),/darabszám/);});
test('negative quantities rejected',()=>{const x=base();x.lines[0].quantity=-1;assert.throws(()=>plan(x),/darabszám/);});
test('over-fulfillment rejected',()=>{const x=base();x.fulfillments=[fulfilled(4)];assert.throws(()=>plan(x),/meghaladja/);});
test('unknown refund type is not silently restocked',()=>{const x=base();x.refunds=[refund('unexpected',1)];assert.throws(()=>plan(x),/nem ismert/);});
test('legacy restock requires review',()=>{const x=base();x.refunds=[refund('legacy_restock',1)];assert.throws(()=>plan(x),/nem egyértelmű/);});
test('fulfilled flag without line evidence is insufficient',()=>{const x=base();x.lines[0].fulfillment_status='fulfilled';assert.throws(()=>plan(x),/bizonyíték/);});
test('missing refund information blocks ambiguous reduction',()=>{const x=base();delete x.order.raw.refunds;x.lines[0].current_quantity=2;assert.throws(()=>plan(x),/refund-adatok/);});
test('unmapped physical product is blocked',()=>{const x=base();x.warehouseLines=[];x.lines[0].aif_variant_id=null;assert.throws(()=>plan(x),/párosítás/);});
test('gift card is not a physical warehouse product',()=>{const x=base();x.warehouseLines=[];x.lines[0].aif_variant_id=null;x.lines[0].raw={gift_card:true};assert.deepEqual(totals(plan(x)),[0,0,0,0]);});
test('replayed lifecycle snapshots preserve quantity conservation over 400 combinations',()=>{
 for(let original=1;original<=12;original++)for(let shipped=0;shipped<=original;shipped++)for(let keep=shipped;keep<=original;keep++){
   const x=base();Object.assign(x.lines[0],{quantity:original,current_quantity:keep});Object.assign(x.warehouseLines[0],{allocated_qty:original,shipped_qty:shipped});x.fulfillments=shipped?[fulfilled(shipped)]:[];
   const p=plan(x);assert.equal(p.add,0);assert.equal(p.ship,0);assert.equal(p.pending+shipped+p.release,original);
   x.warehouseLines[0].released_qty=p.release;const replay=plan(x);assert.equal(replay.release,0);assert.equal(replay.ship,0);assert.equal(replay.add,0);
 }
});

test('canceled dispatched fulfillment followed by a new shipment is not silently netted',()=>{const x=base();x.warehouseLines[0].shipped_qty=1;x.warehouseLines[0].returned_qty=1;x.fulfillments=[fulfilled(1,'cancelled'),fulfilled(1,'success','F2')];assert.throws(()=>plan(x),/új teljesítés/);});
