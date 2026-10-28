import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const file=new URL('../api/lib/aifShopifyOrders.js',import.meta.url);
let code=await readFile(file,'utf8');
code=code.replace(/from\s+(["'])(\.\/.+?)\1/g,(_,q,path)=>`from ${JSON.stringify(new URL(path,file).href)}`);
code+='\nexport {refundAmount,upsertRelatedEvent,upsertOrder};';
const {refundAmount,upsertRelatedEvent,upsertOrder}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const reply=rows=>({rows,rowCount:rows.length});
const id='gid://shopify/Order/12345';
test('refund counts only successful refund transactions',()=>assert.equal(refundAmount({transactions:[{kind:'refund',status:'success',amount:'10.50'},{kind:'refund',status:'pending',amount:'30'},{kind:'refund',status:'failure',amount:'90'},{kind:'sale',status:'success',amount:'20'}]}),10.5));
test('refund line subtotal alone is not confirmed repayment',()=>assert.equal(refundAmount({refund_line_items:[{subtotal:'50'}]}),0));
test('stale order webhook is ignored before any line replacement',async()=>{
 const log=[];const client={query:async(sql,args=[])=>{log.push(sql);if(sql.includes('FROM aif_shopify_order_deletions'))return reply([]);if(sql.startsWith('SELECT shopify_updated_at'))return reply([{shopify_updated_at:'2026-10-28T10:00:00Z'}]);if(sql.startsWith('UPDATE aif_shopify_webhook_events'))return reply([]);throw Error('Unexpected query '+sql);}};
 const r=await upsertOrder(client,{topic:'orders/updated',shopify_webhook_id:'stale',payload:{id:12345,updated_at:'2026-10-28T09:00:00Z',line_items:[]}});
 assert.equal(r.reason,'stale_order_snapshot');assert.equal(log.some(s=>s.includes('UPDATE aif_shopify_order_lines')),false);
});
test('incomplete order webhook cannot erase prior lines',async()=>{const client={query:async(sql)=>{if(sql.includes('FROM aif_shopify_order_deletions'))return reply([]);if(sql.startsWith('SELECT shopify_updated_at'))return reply([]);throw Error('Unexpected query '+sql);}};await assert.rejects(upsertOrder(client,{payload:{id:12345},topic:'orders/updated',shopify_webhook_id:'bad'}),/nincs line_items/);});
test('return update without order id is resolved from stored return, with no stock writes',async()=>{
 const queries=[];const client={query:async(sql,args=[])=>{queries.push({sql,args});if(sql.startsWith('SELECT shopify_order_id FROM aif_shopify_returns'))return reply([{shopify_order_id:id}]);if(sql.includes('FROM aif_shopify_order_deletions'))return reply([]);return reply([]);}};
 const r=await upsertRelatedEvent(client,{topic:'returns/update',received_at:'2026-10-28T11:00:00Z',shopify_webhook_id:'ret-update',payload:{admin_graphql_api_id:'gid://shopify/Return/9876',return_line_items:{removals:[]}}});
 assert.equal(r.orderId,id);assert.equal(r.stockChangedByOrderProcessor,false);assert.equal(queries.some(({sql})=>/INSERT INTO aif_stock|UPDATE aif_stock/.test(sql)),false);assert.ok(queries.some(({sql})=>sql.includes('pg_advisory_xact_lock')));
});
test('unresolved return update is retried rather than assigned to another order',async()=>{const client={query:async()=>reply([])};await assert.rejects(upsertRelatedEvent(client,{topic:'returns/update',payload:{admin_graphql_api_id:'gid://shopify/Return/9876'}}),/még nem azonosítható/);});

test('same-timestamp conflicting quantities require review rather than overwriting',async()=>{
 const client={query:async(sql)=>{if(sql.includes('FROM aif_shopify_order_deletions'))return reply([]);if(sql.startsWith('SELECT shopify_updated_at'))return reply([{shopify_updated_at:'2026-10-28T10:00:00Z',raw:{line_items:[{id:100,variant_id:200,quantity:3,current_quantity:3}]}}]);throw Error('Unexpected '+sql);}};
 await assert.rejects(upsertOrder(client,{topic:'orders/updated',shopify_webhook_id:'conflict',payload:{id:12345,updated_at:'2026-10-28T10:00:00Z',line_items:[{id:100,variant_id:200,quantity:3,current_quantity:2}]}}),/Azonos Shopify időbélyeg/);
});
