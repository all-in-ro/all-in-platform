/** Real PostgreSQL integration test. REFUSES the production URL and any non-empty/test-named database. */
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {ensureAifShopifyWarehouseSchema,reconcileAifShopifyWarehouseOrder as processOrder,receiveAifShopifyReturn as receive,resolveAifShopifyQuarantine as resolve} from '../api/lib/aifShopifyWarehouse.js';
const url=process.env.AIF_SHOPIFY_TEST_DATABASE_URL;
if(!url||url===process.env.DATABASE_URL||process.env.AIF_SHOPIFY_TEST_CONFIRM!=='EMPTY_TEST_DB')throw Error('Külön üres tesztadatbázis kell: AIF_SHOPIFY_TEST_DATABASE_URL és AIF_SHOPIFY_TEST_CONFIRM=EMPTY_TEST_DB. DATABASE_URL használata tiltott.');
const databaseName=decodeURIComponent(new URL(url).pathname.slice(1));
if(!/^aif_shopify_test(?:_|$)/.test(databaseName))throw Error('A tesztadatbázis neve aif_shopify_test vagy aif_shopify_test_… kell legyen.');
for(const k of Object.keys(process.env))if(k.startsWith('SHOPIFY_')||k.startsWith('AIF_LOCATION_'))delete process.env[k];
process.env.SHOPIFY_WAREHOUSE_AUTOMATION_ENABLED='true';process.env.SHOPIFY_WAREHOUSE_LIFECYCLE_ENABLED='true';
globalThis.fetch=()=>{throw Error('TESZT: külső hálózati művelet tiltott.');};
const pool=new pg.Pool({connectionString:url,connectionTimeoutMillis:10000,max:4});
const SOURCE='10000000-0000-4000-8000-000000000001',TARGET='10000000-0000-4000-8000-000000000002';
const VARIANT='20000000-0000-4000-8000-000000000001',MODEL='30000000-0000-4000-8000-000000000001';
const ORDER='gid://shopify/Order/9900000000001',LINE='gid://shopify/LineItem/9900000000002';
async function state(){const r=await pool.query('SELECT location_id,qty,reserved_qty FROM aif_stock WHERE variant_id=$1',[VARIANT]);const s=id=>r.rows.find(x=>x.location_id===id);return [s(SOURCE)?.qty||0,s(TARGET)?.qty||0,s(TARGET)?.reserved_qty||0,s(SOURCE)?.reserved_qty||0];}
try{
 const db=await pool.connect();
 try{
  const result=await db.query("SELECT current_database() AS name,to_regclass('public.aif_stock') AS existing");
  assert.equal(result.rows[0].name,databaseName);if(result.rows[0].existing)throw Error('A tesztadatbázis nem üres: aif_stock már létezik. Nem módosítom.');
  await db.query('BEGIN');
  await db.query(await readFile(new URL('../tests/staging-base.sql',import.meta.url),'utf8'));
  await ensureAifShopifyWarehouseSchema(db);
  await db.query('INSERT INTO aif_locations(id,code,name) VALUES($1,\'main_warehouse\',\'TESZT FORRAS\'),($2,\'shopify\',\'TESZT Shopify Raktar\')',[SOURCE,TARGET]);
  await db.query('INSERT INTO aif_product_models(id,title_ro,model_code) VALUES($1,\'TESZT TERMEK\',\'test:TEST001\')',[MODEL]);
  await db.query('INSERT INTO aif_product_variants(id,model_id,barcode,internal_sku,size,sell_price,buy_price) VALUES($1,$2,\'TEST001\',\'TEST001-L\',\'L\',100,40)',[VARIANT,MODEL]);
  await db.query('INSERT INTO aif_stock(location_id,variant_id,qty) VALUES($1,$2,10)',[SOURCE,VARIANT]);
  await db.query('INSERT INTO aif_stock_retail_book(location_id,variant_id,qty,book_value) VALUES($1,$2,10,1000)',[SOURCE,VARIANT]);
  await db.query(`INSERT INTO aif_shopify_orders(shopify_order_id,shopify_order_legacy_id,order_name,status,financial_status,customer_name,shopify_created_at,raw) VALUES($1,'9900000000001','AIF-LIFE-TEST','open','paid','TESZT VEVŐ',now(),'{}'::jsonb||jsonb_build_object('refunds','[]'::jsonb))`,[ORDER]);
  await db.query('INSERT INTO aif_shopify_order_lines(shopify_line_item_id,shopify_order_id,aif_variant_id,sku,title,quantity,current_quantity,unit_price) VALUES($1,$2,$3,\'TEST001\',\'TESZT TERMEK\',3,3,100)',[LINE,ORDER,VARIANT]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 await processOrder(pool,ORDER,{apply:true});assert.deepEqual(await state(),[7,3,3,0]);console.log('OK 1: eredeti átadás');
 await pool.query('INSERT INTO aif_shopify_fulfillments(shopify_fulfillment_id,shopify_order_id,status,raw) VALUES($1,$2,\'success\',$3::jsonb)',['gid://shopify/Fulfillment/99001',ORDER,JSON.stringify({id:'99001',status:'success',line_items:[{id:'9900000000002',quantity:1}]})]);
 await processOrder(pool,ORDER,{apply:true});assert.deepEqual(await state(),[7,2,2,0]);console.log('OK 2: részleges feladás');
 await pool.query("UPDATE aif_shopify_orders SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE shopify_order_id=$1",[ORDER]);
 await processOrder(pool,ORDER,{dryRun:true});assert.deepEqual(await state(),[7,2,2,0]);console.log('OK 3: ROLLBACK próba');
 await processOrder(pool,ORDER,{apply:true});assert.deepEqual(await state(),[9,0,0,0]);
 await processOrder(pool,ORDER,{apply:true});assert.deepEqual(await state(),[9,0,0,0]);console.log('OK 4: lemondás és ismétlés');
 const body={idempotencyKey:'test-receipt-0000000001',physicallyReceived:true,locationId:SOURCE,note:'TESZT sérült visszáru',lines:[{lineId:LINE,quantity:1,condition:'quarantine'}]};
 await receive(pool,ORDER,body,{actor:'TEST',admin:true});assert.deepEqual(await state(),[10,0,0,1]);
 const repeat=await receive(pool,ORDER,body,{actor:'TEST',admin:true});assert.equal(repeat.duplicate,true);assert.deepEqual(await state(),[10,0,0,1]);console.log('OK 5: sérült átvétel, ismétlés nélkül');
 await assert.rejects(receive(pool,ORDER,{...body,idempotencyKey:'test-receipt-0000000002'},{actor:'TEST',admin:true}),/meghaladja/);console.log('OK 6: túlvisszavétel tiltva');
 const q=(await pool.query('SELECT id FROM aif_shopify_return_quarantine WHERE shopify_order_id=$1',[ORDER])).rows[0];
 await resolve(pool,q.id,{idempotencyKey:'test-quarantine-000001',quantity:1,action:'restock',note:'TESZT ellenőrizve'},{actor:'TEST',admin:true});assert.deepEqual(await state(),[10,0,0,0]);
 const sum=(await pool.query('SELECT sum(book_value) AS total FROM aif_stock_retail_book WHERE variant_id=$1',[VARIANT])).rows[0];assert.equal(Number(sum.total),1000);console.log('OK 7: elkülönítés feloldva, értékegyezőség');
 console.table((await pool.query('SELECT document_number,status,total_qty,total_value FROM aif_stock_transfer_documents ORDER BY created_at,document_number')).rows);
 console.log('POSTGRESQL TESZT SIKERES. Csak a külön tesztadatbázis tartalmaz új TESZT-adatokat.');
}catch(e){console.error('POSTGRESQL TESZT LEÁLLT:',e.message);process.exitCode=1;}
finally{await pool.end();}
