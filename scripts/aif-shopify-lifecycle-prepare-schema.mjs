/** Additive schema preparation only. No order processing, stock writes or network. */
import pg from 'pg';
import {ensureAifShopifyWarehouseSchema} from '../api/lib/aifShopifyWarehouse.js';
if(!process.argv.includes('--prepare-schema'))throw new Error('Tartós sémamódosításhoz szükséges: --prepare-schema. Előtte adatbázismentés.');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL hiányzik.');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000});
const prior=process.env.SHOPIFY_WAREHOUSE_AUTOMATION_ENABLED;
process.env.SHOPIFY_WAREHOUSE_AUTOMATION_ENABLED='false';
globalThis.fetch=()=>{throw new Error('SCHEMA_ONLY: külső hálózati hívás tiltva.');};
let tx=false;
try{
 await db.connect();await db.query('BEGIN');tx=true;
 await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='30000ms'");
 await ensureAifShopifyWarehouseSchema(db);
 await db.query('COMMIT');tx=false;
 console.log('SÉMA ELŐKÉSZÍTVE. Nincs készletmozgás, Aviz-kiállítás, AWB, refund vagy Shopify-hívás.');
 console.log('Az automatizmus aktiválási dátumát ez a parancs nem hozta létre és nem módosította.');
}catch(e){if(tx)await db.query('ROLLBACK').catch(()=>{});console.error('SÉMA NEM MENTVE:',e.message);process.exitCode=1;}
finally{if(prior===undefined)delete process.env.SHOPIFY_WAREHOUSE_AUTOMATION_ENABLED;else process.env.SHOPIFY_WAREHOUSE_AUTOMATION_ENABLED=prior;await db.end();}
