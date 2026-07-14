import pg from "pg";
import { processAifShopifyOutboxBatch } from "../api/lib/aifShopify.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
let stopped = false;

const args = process.argv.slice(2);
const once = args.includes("--once");
const drain = args.includes("--drain");
const limitArg = args.find((item) => item.startsWith("--limit="));
const limit = Math.min(100, Math.max(1, Number(limitArg?.split("=")[1] || 20)));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOneBatch() {
  const result = await processAifShopifyOutboxBatch(pool, { limit });
  console.log("AIF Shopify sync batch", JSON.stringify(result));
  return result;
}

async function run() {
  console.log("AIF Shopify sync worker started", JSON.stringify({
    at: new Date().toISOString(),
    mode: once ? "once" : drain ? "drain" : "watch",
    limit,
  }));

  if (once) {
    await runOneBatch();
    await pool.end();
    return;
  }

  if (drain) {
    while (!stopped) {
      const result = await runOneBatch();
      if (!result.enabled || result.processed === 0) break;
      await sleep(300);
    }
    await pool.end();
    return;
  }

  while (!stopped) {
    try {
      const result = await processAifShopifyOutboxBatch(pool, { limit });
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
