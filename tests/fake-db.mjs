import {randomUUID} from 'node:crypto';
const compact=s=>s.replace(/\s+/g,' ').trim();
function split(input){let out=[],part='',depth=0,quote=false;for(let i=0;i<input.length;i++){const c=input[i];if(c==="'"){if(quote&&input[i+1]==="'"){part+="''";i++;continue;}quote=!quote;}if(!quote){if(c==='(')depth++;if(c===')')depth--;if(c===','&&depth===0){out.push(part.trim());part='';continue;}}part+=c;}if(part.trim())out.push(part.trim());return out;}
function evalValue(s,args){s=s.trim();const p=s.match(/^\$(\d+)(::\w+)?$/);if(p){let v=args[Number(p[1])-1];if(p[2]==='::jsonb'&&typeof v==='string')return JSON.parse(v);return v;}if(s==='NULL')return null;if(s==='true'||s==='false')return s==='true';if(/^\d+$/.test(s))return Number(s);if(s.startsWith("'"))return s.replace(/^'|'(::\w+)?$/g,'');if(s.includes('now()'))return '2026-10-28T12:00:00.000Z';throw Error('unhandled expression '+s);}
function insertParts(sql,args){const head=sql.match(/^INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(/i);if(!head)return null;let start=head[0].length,depth=1,quote=false,end=start;for(;end<sql.length;end++){const c=sql[end];if(c==="'")quote=!quote;if(!quote){if(c==='(')depth++;if(c===')'&&--depth===0)break;}}const values=split(sql.slice(start,end));const cols=split(head[2]);if(cols.length!==values.length)throw Error(`SQL INSERT count mismatch ${head[1]} ${cols.length}/${values.length}`);const obj=Object.fromEntries(cols.map((c,i)=>[c,evalValue(values[i],args)]));return {table:head[1],obj};}
export class FakePool{
 constructor(){
  const source='10000000-0000-4000-8000-000000000001',target='10000000-0000-4000-8000-000000000002',variant='20000000-0000-4000-8000-000000000001';
  this.source=source;this.target=target;this.variant=variant;this.orderId='gid://shopify/Order/900001';this.lineId='gid://shopify/LineItem/900002';
  this.state={seq:1,series:{},stock:[{location_id:source,variant_id:variant,qty:10,reserved_qty:0}],book:[{location_id:source,variant_id:variant,qty:10,book_value:1000}],documents:[],documentLines:[],warehouse:[],warehouseLines:[],movements:[],events:[],quarantine:[],fulfillments:[],refunds:[],locations:[{id:source,code:'main_warehouse',name:'Csíkszereda',is_active:true},{id:target,code:'shopify',name:'Shopify Raktár',is_active:true}],products:[{id:variant,title_ro:'TESZT TERMEK',barcode:'TEST001',internal_sku:'T-1',model_code:'brand:T1',brand_name:'TEST',category_name:'Ruha',sell_price:100,buy_price:40,size:'L'}],orders:[{shopify_order_id:this.orderId,shopify_order_legacy_id:'900001',order_name:'AIF-LIFE-TEST',customer_name:'Teszt Vevő',status:'open',financial_status:'paid',fulfillment_status:null,shopify_created_at:'2026-10-28T09:00:00.000Z',updated_at:'2026-10-28T09:00:00.000Z',raw:{refunds:[]}}],lines:[{shopify_order_id:this.orderId,shopify_line_item_id:this.lineId,aif_variant_id:variant,sku:'TEST001',title:'TESZT TERMEK',quantity:3,current_quantity:3,is_active:true,unit_price:100}]};this.log=[];this.failOn=null;
 }
 async connect(){return {query:(...args)=>this.query(...args),release(){}};}
 async end(){}
 async query(raw,args=[]){const sql=compact(raw);this.log.push(sql);const numbered=[...sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]));if((Math.max(0,...numbered))!==args.length)throw Error(`SQL binding count ${Math.max(0,...numbered)}/${args.length}: ${sql}`);if(this.failOn&&this.failOn(sql))throw Error('SIMULATED_DB_FAILURE');
  const rows=(r=[])=>({rows:structuredClone(r),rowCount:r.length});const one=r=>rows(r?[r]:[]);const st=this.state;
  if(sql==='BEGIN'){this.snapshot=structuredClone(st);return rows();}if(sql==='COMMIT'){this.snapshot=null;return rows();}if(sql==='ROLLBACK'){if(this.snapshot)this.state=this.snapshot;this.snapshot=null;return rows();}
  if(/^(CREATE |ALTER |DO |SET LOCAL)/.test(sql))return rows();
  if(sql.includes('pg_try_advisory_lock'))return one({locked:true});if(sql.includes('pg_advisory'))return rows();
  if(sql.includes('to_regclass'))return one({docs:true,lines:true,movements:true,retail:true,t:true,w:true});
  const ins=insertParts(sql,args);
  if(ins){const {table,obj}=ins;
   if(table==='aif_shopify_aviz_sequence')return rows();if(table==='aif_shopify_warehouse_activation')return rows();
   if(table==='aif_shopify_lifecycle_sequences'){st.series[obj.series]??=1;return rows();}
   const tableMap={aif_stock:'stock',aif_stock_retail_book:'book',aif_stock_transfer_documents:'documents',aif_stock_transfer_document_lines:'documentLines',aif_stock_movements:'movements',aif_shopify_warehouse_orders:'warehouse',aif_shopify_warehouse_lines:'warehouseLines',aif_shopify_lifecycle_events:'events',aif_shopify_return_quarantine:'quarantine'};
   const name=tableMap[table];if(!name)throw Error('INSERT unhandled '+sql);
   const arr=st[name];let old;
   if(name==='stock'||name==='book')old=arr.find(x=>x.location_id===obj.location_id&&x.variant_id===obj.variant_id);
   if(name==='warehouseLines')old=arr.find(x=>x.shopify_line_item_id===obj.shopify_line_item_id);
   if(old){if(name==='book')Object.assign(old,obj);if(name==='warehouseLines')old.allocated_qty+=obj.allocated_qty;return one(old);}
   const created={id:randomUUID(),created_at:'2026-10-28T12:00:00.000Z',...obj};
   if(name==='warehouseLines')Object.assign(created,{shipped_qty:0,released_qty:0,returned_qty:0,shipped_book_value:0,returned_book_value:0,valuation_known:false});
   if(name==='quarantine')Object.assign(created,{resolved_qty:0,resolved_value:0});
   arr.push(created);return one(created);
  }
  if(sql.startsWith('SELECT next_number FROM aif_shopify_aviz_sequence'))return one({next_number:st.seq});
  if(sql.startsWith('UPDATE aif_shopify_aviz_sequence')){st.seq=args[0];return rows();}
  if(sql.startsWith('SELECT next_number FROM aif_shopify_lifecycle_sequences'))return one({next_number:st.series[args[0]]});
  if(sql.startsWith('UPDATE aif_shopify_lifecycle_sequences')){st.series[args[0]]=args[1];return rows();}
  if(sql.startsWith('SELECT')&&sql.includes('FROM aif_locations')){return rows(sql.includes('WHERE id=')?st.locations.filter(l=>l.id===args[0]):st.locations);}
  if(sql.startsWith('SELECT v.id,v.barcode'))return one(st.products.find(p=>p.id===args[0]));
  if(sql.startsWith('SELECT id FROM aif_stock_movements'))return rows();
  if(sql.startsWith('SELECT raw FROM aif_shopify_orders'))return one(st.orders.find(o=>o.shopify_order_id===args[0]));
  if(sql.startsWith('SELECT')&&/FROM aif_shopify_orders WHERE/.test(sql))return one(st.orders.find(o=>[o.shopify_order_id,o.order_name,o.shopify_order_legacy_id].includes(args[0])));
  if(sql.startsWith('SELECT')&&sql.includes('FROM aif_shopify_order_lines WHERE'))return rows(st.lines.filter(l=>l.shopify_order_id===args[0]));
  if(sql.startsWith('SELECT')&&sql.includes('FROM aif_shopify_warehouse_orders WHERE'))return one(st.warehouse.find(w=>w.shopify_order_id===args[0]));
  if(sql.startsWith('SELECT')&&sql.includes('FROM aif_shopify_refund_lines'))return rows(st.refunds);
  if(sql.startsWith('SELECT')&&sql.includes('FROM aif_shopify_fulfillments'))return rows(st.fulfillments);
  if(sql.startsWith('SELECT COALESCE(sum(allocated_qty')){const ls=st.warehouseLines.filter(l=>l.shopify_order_id===args[0]);return one({held:ls.reduce((n,l)=>n+l.allocated_qty-l.shipped_qty-l.released_qty,0),shipped:ls.reduce((n,l)=>n+l.shipped_qty,0),released:ls.reduce((n,l)=>n+l.released_qty,0),returned:ls.reduce((n,l)=>n+l.returned_qty,0)});}
  if(sql.startsWith('SELECT')&&sql.includes('FROM aif_shopify_warehouse_lines WHERE'))return rows(st.warehouseLines.filter(l=>l.shopify_order_id===args[0]));
  if(sql.startsWith('SELECT')&&sql.includes('FROM aif_shopify_lifecycle_events WHERE'))return rows(st.events.filter(e=>e.shopify_order_id===args[0]&&e.event_key===args[1]));
  if(sql.startsWith('SELECT')&&sql.includes('FROM aif_shopify_return_quarantine WHERE'))return one(st.quarantine.find(q=>q.id===args[0]));
  if(sql.startsWith('SELECT')&&(sql.includes('FROM aif_stock ')||sql.includes('FROM aif_stock_retail_book '))){const arr=sql.includes('FROM aif_stock_retail_book ')?st.book:st.stock;let items;
   if(sql.includes('ANY($2::uuid[])'))items=arr.filter(r=>r.variant_id===args[0]&&args[1].includes(r.location_id));
   else if(sql.includes('location_id=$1'))items=arr.filter(r=>r.location_id===args[0]&&r.variant_id===args[1]);
   else items=arr.filter(r=>r.variant_id===args[0]&&r.location_id===args[1]);return rows(items);
  }
  if(sql.startsWith('UPDATE aif_stock SET')||sql.startsWith('UPDATE aif_stock_retail_book SET')){const arr=sql.startsWith('UPDATE aif_stock SET')?st.stock:st.book;const loc=Number(sql.match(/WHERE.*?location_id=\$(\d+)/)?.[1]),variant=Number(sql.match(/WHERE.*?variant_id=\$(\d+)/)?.[1]);const row=arr.find(r=>r.location_id===args[loc-1]&&r.variant_id===args[variant-1]);if(!row)throw Error('UPDATE stock missing row');for(const col of ['qty','reserved_qty','book_value']){const m=sql.match(new RegExp(`(?:SET |,)${col}=\\$(\\d+)`));if(m)row[col]=args[Number(m[1])-1];}return one(row);}
  if(sql.startsWith('UPDATE aif_shopify_warehouse_lines SET')){const row=st.warehouseLines.find(l=>l.shopify_line_item_id===args[0]);if(!row)throw Error('missing warehouse line');const knownBefore=row.valuation_known||row.shipped_qty===0;for(const col of ['shipped_qty','released_qty','returned_qty','shipped_book_value','returned_book_value']){const m=sql.match(new RegExp(`${col}=${col}\\+\\$(\\d+)`));if(m)row[col]+=args[Number(m[1])-1];}if(sql.includes('valuation_known=(valuation_known OR shipped_qty=0)'))row.valuation_known=knownBefore;return one(row);}
  if(sql.startsWith('UPDATE aif_shopify_warehouse_orders SET')){const row=st.warehouse.find(w=>w.shopify_order_id===args[0]);row.state=args[1];row.raw={...row.raw,...JSON.parse(args[2])};return one(row);}
  if(sql.startsWith('UPDATE aif_stock_transfer_documents SET total_value=')){const row=st.documents.find(d=>d.id===args[0]);row.total_value=st.documentLines.filter(l=>l.document_id===row.id).reduce((n,l)=>n+Number(l.line_total),0);row.price_basis='retail_book';return one(row);}
  if(sql.startsWith('UPDATE aif_stock_transfer_documents SET raw=')){const row=st.documents.find(d=>d.id===args[0]);row.raw={...row.raw,...JSON.parse(args[1])};return one(row);}
  if(sql.startsWith('UPDATE aif_shopify_return_quarantine')){const q=st.quarantine.find(q=>q.id===args[0]);q.resolved_qty+=args[1];q.resolved_value+=args[2];return one(q);}
  if(sql.startsWith('UPDATE aif_shopify_warehouse_failures')||sql.startsWith('DELETE FROM aif_shopify_warehouse_failures'))return rows();
  throw Error('UNHANDLED SQL '+sql);
 }
}
