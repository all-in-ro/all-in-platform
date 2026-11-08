// Read-only local health diagnostics. No Shopify API write or queue processing.
import pg from 'pg';
import {getAifShopifySyncHealth} from '../api/lib/aifShopify.js';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
  await db.connect();
  await db.query('BEGIN READ ONLY');
  await db.query("SET LOCAL statement_timeout='30s'");
  console.log(JSON.stringify(await getAifShopifySyncHealth(db),null,2));
  await db.query('COMMIT');
} catch(error) {
  try {await db.query('ROLLBACK');}catch{}
  console.error(error.message);process.exitCode=1;
} finally {await db.end();}
