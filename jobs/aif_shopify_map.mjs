import pg from "pg";
import { ensureAifShopifyTables, mapAifShopifyVariants } from "../api/lib/aifShopify.js";

const apply = process.argv.includes("--apply");
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await ensureAifShopifyTables(client);
  const result = await mapAifShopifyVariants(client, { dryRun: !apply, sampleLimit: 20 });
  console.log(JSON.stringify({
    dryRun: result.dryRun,
    mapped: result.mapped,
    wouldMap: result.wouldMap,
    errors: result.errors,
    counts: result.audit?.counts,
  }, null, 2));
  if (!apply) console.log("\nEz csak próba volt. Mentéshez: node jobs/aif_shopify_map.mjs --apply");
} finally {
  client.release();
  await pool.end();
}
