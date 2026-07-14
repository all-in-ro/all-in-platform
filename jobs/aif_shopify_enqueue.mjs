import pg from "pg";
import {
  enqueueAifShopifyVariant,
  enqueueAllMappedAifShopifyVariants,
} from "../api/lib/aifShopify.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const all = args.includes("--all");
const skuArg = args.find((item) => item.startsWith("--sku="));
const sku = String(skuArg?.slice("--sku=".length) || "").trim();

const client = await pool.connect();
try {
  if (!all && !sku) {
    throw new Error("Adj meg egy SKU-t (--sku=...) vagy használd a --all kapcsolót.");
  }

  if (all) {
    const count = await client.query(`SELECT count(*)::int AS count FROM aif_shopify_variant_map`);
    if (!apply) {
      console.log(JSON.stringify({
        dryRun: true,
        wouldQueue: Number(count.rows[0]?.count || 0),
        mode: "all",
      }, null, 2));
      console.log("Mentéshez: node jobs/aif_shopify_enqueue.mjs --all --apply");
    } else {
      const result = await enqueueAllMappedAifShopifyVariants(client, "manual_enqueue_all");
      console.log(JSON.stringify({ dryRun: false, mode: "all", ...result }, null, 2));
    }
  } else {
    const mapping = await client.query(
      `SELECT m.variant_id::text, m.sku, pm.title_ro, v.size, v.color_name
       FROM aif_shopify_variant_map m
       JOIN aif_product_variants v ON v.id=m.variant_id
       JOIN aif_product_models pm ON pm.id=v.model_id
       WHERE lower(m.sku)=lower($1)
       LIMIT 1`,
      [sku]
    );
    if (!mapping.rowCount) throw new Error(`Nincs Shopify-térkép ehhez az SKU-hoz: ${sku}`);
    const item = mapping.rows[0];

    const quantities = await client.query(
      `SELECT
         COALESCE(sum(CASE WHEN l.code='main_warehouse' THEN GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0) ELSE 0 END),0)::int AS csikszereda,
         COALESCE(sum(CASE WHEN l.code='magazin_targu_secuiesc' THEN GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0) ELSE 0 END),0)::int AS kezdi
       FROM aif_stock s
       LEFT JOIN aif_locations l ON l.id=s.location_id
       WHERE s.variant_id=$1`,
      [item.variant_id]
    );

    if (!apply) {
      console.log(JSON.stringify({
        dryRun: true,
        mode: "sku",
        item: {
          sku: item.sku,
          title: item.title_ro,
          color: item.color_name,
          size: item.size,
        },
        quantities: quantities.rows[0] || { csikszereda: 0, kezdi: 0 },
      }, null, 2));
      console.log(`Mentéshez: node jobs/aif_shopify_enqueue.mjs --sku=${item.sku} --apply`);
    } else {
      const result = await enqueueAifShopifyVariant(client, item.variant_id, "manual_enqueue_one");
      console.log(JSON.stringify({ dryRun: false, mode: "sku", sku: item.sku, ...result }, null, 2));
    }
  }
} finally {
  client.release();
  await pool.end();
}
