import pg from "pg";
import { processAifShopifyOutboxBatch } from "../api/lib/aifShopify.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
let stopped = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("AIF Shopify sync worker started", new Date().toISOString());
  while (!stopped) {
    try {
      const result = await processAifShopifyOutboxBatch(pool, { limit: 20 });
      if (!result.enabled) {
        await sleep(30_000);
        continue;
      }
      if (result.processed) console.log("AIF Shopify sync batch", JSON.stringify(result));
      await sleep(result.processed ? 500 : 2_000);
    } catch (error) {
      console.error("AIF Shopify sync worker error", error);
      await sleep(15_000);
    }
  }
  await pool.end();
}

process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });

await run();
