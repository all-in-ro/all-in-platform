import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ensureAifShopifyTables, shopifyGraphql } from "./aifShopify.js";

function text(value) {
  return String(value ?? "").trim();
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on", "igen"].includes(text(value).toLowerCase());
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function headerValue(headers, name) {
  if (!headers) return "";
  const wanted = name.toLowerCase();
  const direct = headers[wanted] ?? headers[name] ?? headers[name.toUpperCase()];
  if (Array.isArray(direct)) return text(direct[0]);
  if (direct !== undefined) return text(direct);
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) {
      return Array.isArray(value) ? text(value[0]) : text(value);
    }
  }
  return "";
}

function gid(type, value) {
  const raw = text(value);
  if (!raw) return "";
  if (raw.startsWith("gid://shopify/")) return raw;
  return `gid://shopify/${type}/${raw}`;
}

async function ensureInboundSchema(client) {
  await ensureAifShopifyTables(client);
  await client.query(`ALTER TABLE aif_shopify_webhook_events
    ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS locked_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS result jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_webhook_events_work_idx
    ON aif_shopify_webhook_events (topic, status, next_attempt_at, received_at)`);
}

function envConfig() {
  const syncEnabled = bool(process.env.SHOPIFY_SYNC_ENABLED, false);
  return {
    enabled: bool(process.env.SHOPIFY_INBOUND_ENABLED, syncEnabled),
    secret: text(process.env.SHOPIFY_CLIENT_SECRET),
    shopifyCsikszeredaLocationId: text(process.env.SHOPIFY_LOCATION_CSIKSZEREDA_ID),
    shopifyKezdiLocationId: text(process.env.SHOPIFY_LOCATION_KEZDI_ID),
    aifCsikszeredaLocationId: text(process.env.AIF_LOCATION_CSIKSZEREDA_ID),
    aifKezdiLocationId: text(process.env.AIF_LOCATION_KEZDI_ID),
  };
}

export function verifyAifShopifyWebhook(rawBody, headers, secret = process.env.SHOPIFY_CLIENT_SECRET) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "");
  const received = headerValue(headers, "x-shopify-hmac-sha256");
  const cleanSecret = text(secret);
  if (!cleanSecret || !received || !body.length) return false;

  const expected = createHmac("sha256", cleanSecret).update(body).digest("base64");
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function receiveAifShopifyInventoryWebhook(pool, { rawBody, payload, headers }) {
  const config = envConfig();
  if (!verifyAifShopifyWebhook(rawBody, headers, config.secret)) {
    return { accepted: false, statusCode: 401, error: "invalid_shopify_hmac" };
  }

  const topic = headerValue(headers, "x-shopify-topic").toLowerCase();
  if (topic !== "inventory_levels/update") {
    return { accepted: false, statusCode: 400, error: "unsupported_shopify_topic", topic };
  }

  const shopifyWebhookId = headerValue(headers, "x-shopify-webhook-id")
    || createHash("sha256").update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "")).digest("hex");
  const shopDomain = headerValue(headers, "x-shopify-shop-domain") || null;
  const client = await pool.connect();
  try {
    await ensureInboundSchema(client);
    const result = await client.query(
      `INSERT INTO aif_shopify_webhook_events (
         shopify_webhook_id, topic, shop_domain, status, payload, error,
         received_at, processed_at, updated_at, attempts, next_attempt_at, locked_at, result
       )
       VALUES ($1,$2,$3,'received',$4::jsonb,NULL,now(),NULL,now(),0,now(),NULL,'{}'::jsonb)
       ON CONFLICT (shopify_webhook_id) DO NOTHING
       RETURNING shopify_webhook_id`,
      [shopifyWebhookId, topic, shopDomain, JSON.stringify(payload || {})]
    );
    return {
      accepted: true,
      duplicate: !result.rowCount,
      webhookId: shopifyWebhookId,
      topic,
      inboundEnabled: config.enabled,
    };
  } finally {
    client.release();
  }
}

async function fetchCurrentAvailable(inventoryItemId, locationId) {
  const response = await shopifyGraphql(
    `query AifInboundInventoryLevel($id: ID!) {
      inventoryItem(id: $id) {
        id
        inventoryLevels(first: 100) {
          nodes {
            location { id name }
            quantities(names: ["available"]) { name quantity }
          }
        }
      }
    }`,
    { id: inventoryItemId }
  );
  const item = response.data?.inventoryItem;
  if (!item) {
    throw Object.assign(new Error("A Shopify inventory item nem található."), { code: "shopify_inventory_item_missing" });
  }
  const level = (item.inventoryLevels?.nodes || []).find((row) => text(row?.location?.id) === locationId);
  if (!level) {
    throw Object.assign(new Error("A Shopify inventory level nem található a webhook helyszínén."), { code: "shopify_inventory_level_missing" });
  }
  const quantity = (level.quantities || []).find((row) => row?.name === "available")?.quantity;
  return {
    available: Math.max(0, integer(quantity, 0)),
    rawAvailable: integer(quantity, 0),
    locationName: text(level.location?.name) || null,
  };
}

async function claimInboundEvents(pool, limit) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureInboundSchema(client);
    const result = await client.query(
      `WITH picked AS (
         SELECT shopify_webhook_id
         FROM aif_shopify_webhook_events
         WHERE topic='inventory_levels/update'
           AND (
             (status IN ('received','error') AND next_attempt_at <= now())
             OR (status='processing' AND locked_at < now() - interval '10 minutes')
           )
         ORDER BY received_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE aif_shopify_webhook_events e
       SET status='processing',
           attempts=e.attempts+1,
           locked_at=now(),
           error=NULL,
           updated_at=now()
       FROM picked
       WHERE e.shopify_webhook_id=picked.shopify_webhook_id
       RETURNING e.*`,
      [Math.min(100, Math.max(1, integer(limit, 20)))]
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function retryDelaySeconds(attempts) {
  return Math.min(3600, Math.max(15, 15 * (2 ** Math.min(8, Math.max(0, integer(attempts, 1) - 1)))));
}

async function markEvent(client, webhookId, status, result = {}, error = null) {
  await client.query(
    `UPDATE aif_shopify_webhook_events
     SET status=$2,
         result=$3::jsonb,
         error=$4,
         locked_at=NULL,
         processed_at=CASE WHEN $2 IN ('processed','ignored') THEN now() ELSE processed_at END,
         updated_at=now()
     WHERE shopify_webhook_id=$1`,
    [webhookId, status, JSON.stringify(result || {}), error]
  );
}

async function insertInboundMovement(client, {
  webhookId,
  variantId,
  locationId,
  qtyBefore,
  qtyAfter,
  qtyDelta,
  raw,
}) {
  await client.query(
    `INSERT INTO aif_stock_movements (
       movement_type, source_type, source_id, location_id, variant_id,
       qty_delta, qty_before, qty_after, actor, raw
     )
     VALUES ($1,'shopify_inventory_webhook',$2,$3,$4,$5,$6,$7,'shopify',$8::jsonb)`,
    ["shopify_adjustment", text(webhookId).slice(0, 64), locationId, variantId, qtyDelta, qtyBefore, qtyAfter, JSON.stringify(raw || {})]
  );
}

async function processInboundEvent(pool, event, config) {
  const payload = event.payload || {};
  const inventoryItemId = gid("InventoryItem", payload.inventory_item_id);
  const shopifyLocationId = gid("Location", payload.location_id);

  if (!inventoryItemId || !shopifyLocationId) {
    const client = await pool.connect();
    try {
      await markEvent(client, event.shopify_webhook_id, "ignored", { reason: "payload_missing_ids", payload });
    } finally {
      client.release();
    }
    return { status: "ignored", reason: "payload_missing_ids" };
  }

  let aifLocationId = "";
  let locationCode = "";
  if (shopifyLocationId === config.shopifyCsikszeredaLocationId) {
    aifLocationId = config.aifCsikszeredaLocationId;
    locationCode = "main_warehouse";
  } else if (shopifyLocationId === config.shopifyKezdiLocationId) {
    aifLocationId = config.aifKezdiLocationId;
    locationCode = "magazin_targu_secuiesc";
  } else {
    const client = await pool.connect();
    try {
      await markEvent(client, event.shopify_webhook_id, "ignored", {
        reason: "unmanaged_shopify_location",
        inventoryItemId,
        shopifyLocationId,
      });
    } finally {
      client.release();
    }
    return { status: "ignored", reason: "unmanaged_shopify_location" };
  }

  const level = await fetchCurrentAvailable(inventoryItemId, shopifyLocationId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const mapping = await client.query(
      `SELECT variant_id, sku
       FROM aif_shopify_variant_map
       WHERE shopify_inventory_item_id=$1
       LIMIT 1`,
      [inventoryItemId]
    );
    if (!mapping.rowCount) {
      await markEvent(client, event.shopify_webhook_id, "ignored", {
        reason: "mapping_missing",
        inventoryItemId,
        shopifyLocationId,
        shopifyAvailable: level.available,
      });
      await client.query("COMMIT");
      return { status: "ignored", reason: "mapping_missing" };
    }

    const map = mapping.rows[0];
    const stock = await client.query(
      `SELECT qty, reserved_qty
       FROM aif_stock
       WHERE location_id=$1 AND variant_id=$2
       FOR UPDATE`,
      [aifLocationId, map.variant_id]
    );
    const qtyBefore = stock.rowCount ? integer(stock.rows[0].qty, 0) : 0;
    const reservedQty = stock.rowCount ? Math.max(0, integer(stock.rows[0].reserved_qty, 0)) : 0;
    const availableBefore = Math.max(0, qtyBefore - reservedQty);
    const qtyAfter = reservedQty + level.available;
    const qtyDelta = qtyAfter - qtyBefore;

    if (availableBefore !== level.available) {
      await client.query(
        `INSERT INTO aif_stock (location_id, variant_id, qty, reserved_qty, updated_at)
         VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (location_id, variant_id)
         DO UPDATE SET qty=EXCLUDED.qty, reserved_qty=EXCLUDED.reserved_qty, updated_at=now()`,
        [aifLocationId, map.variant_id, qtyAfter, reservedQty]
      );

      await insertInboundMovement(client, {
        webhookId: event.shopify_webhook_id,
        variantId: map.variant_id,
        locationId: aifLocationId,
        qtyBefore,
        qtyAfter,
        qtyDelta,
        raw: {
          reason: "shopify_inventory_level_update",
          sku: map.sku,
          inventoryItemId,
          shopifyLocationId,
          locationCode,
          locationName: level.locationName,
          webhookAvailable: payload.available,
          shopifyAvailable: level.available,
          shopifyAvailableRaw: level.rawAvailable,
          reservedQty,
          availableBefore,
          availableAfter: level.available,
          webhookUpdatedAt: payload.updated_at || null,
        },
      });
    }

    const result = {
      sku: map.sku,
      variantId: map.variant_id,
      inventoryItemId,
      shopifyLocationId,
      aifLocationId,
      locationCode,
      locationName: level.locationName,
      changed: availableBefore !== level.available,
      availableBefore,
      availableAfter: level.available,
      qtyBefore,
      qtyAfter,
      reservedQty,
    };
    await markEvent(client, event.shopify_webhook_id, "processed", result);
    await client.query("COMMIT");
    return { status: "processed", ...result };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function processAifShopifyInboundBatch(pool, options = {}) {
  const config = envConfig();
  if (!config.enabled) {
    return { enabled: false, processed: 0, changed: 0, ignored: 0, errors: 0, errorItems: [] };
  }

  const missing = [
    ["SHOPIFY_CLIENT_SECRET", config.secret],
    ["SHOPIFY_LOCATION_CSIKSZEREDA_ID", config.shopifyCsikszeredaLocationId],
    ["SHOPIFY_LOCATION_KEZDI_ID", config.shopifyKezdiLocationId],
    ["AIF_LOCATION_CSIKSZEREDA_ID", config.aifCsikszeredaLocationId],
    ["AIF_LOCATION_KEZDI_ID", config.aifKezdiLocationId],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw Object.assign(new Error(`Hiányzó Shopify inbound ENV: ${missing.join(", ")}`), { code: "shopify_inbound_config_missing" });
  }

  const rows = await claimInboundEvents(pool, options.limit || 20);
  let processed = 0;
  let changed = 0;
  let ignored = 0;
  const errors = [];

  for (const event of rows) {
    try {
      const result = await processInboundEvent(pool, event, config);
      if (result.status === "processed") {
        processed += 1;
        if (result.changed) changed += 1;
      } else {
        ignored += 1;
      }
    } catch (error) {
      const message = error?.message || String(error);
      const delay = retryDelaySeconds(event.attempts);
      const client = await pool.connect();
      try {
        await client.query(
          `UPDATE aif_shopify_webhook_events
           SET status='error',
               error=$2,
               locked_at=NULL,
               next_attempt_at=now()+($3::text || ' seconds')::interval,
               updated_at=now()
           WHERE shopify_webhook_id=$1`,
          [event.shopify_webhook_id, message.slice(0, 4000), delay]
        );
      } finally {
        client.release();
      }
      errors.push({ webhookId: event.shopify_webhook_id, error: message, code: error?.code || null, retryInSeconds: delay });
    }
  }

  return {
    enabled: true,
    claimed: rows.length,
    processed,
    changed,
    ignored,
    errors: errors.length,
    errorItems: errors,
  };
}

export async function listAifShopifyInboundEvents(client, options = {}) {
  const limit = Math.min(200, Math.max(1, integer(options.limit, 50)));
  await ensureInboundSchema(client);
  const result = await client.query(
    `SELECT shopify_webhook_id, topic, shop_domain, status, payload, result, error,
            attempts, received_at, processed_at, updated_at
     FROM aif_shopify_webhook_events
     WHERE topic='inventory_levels/update'
     ORDER BY received_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
