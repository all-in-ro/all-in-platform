import pg from "pg";
import { auditAifShopifySkus, ensureAifShopifyTables, getAifShopifyStatus } from "../api/lib/aifShopify.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await ensureAifShopifyTables(client);
  const status = await getAifShopifyStatus(client);
  const audit = await auditAifShopifySkus(client, { sampleLimit: 10 });
  console.log("=== SHOPIFY KAPCSOLAT ===");
  console.log(JSON.stringify({
    ok: status.ok,
    enabled: status.config?.enabled,
    shop: status.shop,
    scope: status.scope,
    locations: status.locations,
    database: status.database,
    missingEnv: status.config?.missing,
  }, null, 2));
  console.log("\n=== SKU AUDIT ÖSSZESÍTÉS ===");
  console.log(JSON.stringify(audit.counts, null, 2));
  console.log("\n=== MINTÁK ===");
  console.log(JSON.stringify(audit.samples, null, 2));
} finally {
  client.release();
  await pool.end();
}
