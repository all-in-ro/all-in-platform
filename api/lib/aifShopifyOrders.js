import { createHash } from "node:crypto";
import { ensureAifShopifyTables } from "./aifShopify.js";
import { verifyAifShopifyWebhook } from "./aifShopifyInbound.js";

const ORDER_TOPICS = new Set([
  "orders/create",
  "orders/updated",
  "orders/cancelled",
  "orders/paid",
  "orders/fulfilled",
  "orders/partially_fulfilled",
  "refunds/create",
]);

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

function decimal(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableDecimal(value) {
  if (value === undefined || value === null || text(value) === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
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
  if (!raw) return null;
  if (raw.startsWith("gid://shopify/")) return raw;
  return `gid://shopify/${type}/${raw}`;
}

function isoOrNull(value) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function json(value, fallback = {}) {
  return value && typeof value === "object" ? value : fallback;
}

function stringArray(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function moneyFromSet(setValue, fallbackValue = null) {
  const amount = setValue?.shop_money?.amount
    ?? setValue?.presentment_money?.amount
    ?? setValue?.shopMoney?.amount
    ?? setValue?.presentmentMoney?.amount
    ?? fallbackValue;
  return nullableDecimal(amount);
}

function currencyFromSet(setValue, fallbackValue = null) {
  return text(
    setValue?.shop_money?.currency_code
    ?? setValue?.presentment_money?.currency_code
    ?? setValue?.shopMoney?.currencyCode
    ?? setValue?.presentmentMoney?.currencyCode
    ?? fallbackValue
  ) || null;
}

function customerName(payload) {
  const customer = json(payload?.customer, {});
  const first = text(customer.first_name || customer.firstName);
  const last = text(customer.last_name || customer.lastName);
  return [first, last].filter(Boolean).join(" ")
    || text(payload?.billing_address?.name)
    || text(payload?.shipping_address?.name)
    || text(payload?.email)
    || null;
}

function orderStatus(payload) {
  if (payload?.cancelled_at) return "cancelled";
  if (payload?.closed_at) return "closed";
  return "open";
}

function orderLegacyId(payload) {
  return text(payload?.id) || null;
}

function orderGid(payload) {
  return gid("Order", payload?.admin_graphql_api_id || payload?.id);
}

function refundOrderLegacyId(payload) {
  return text(payload?.order_id || payload?.order?.id) || null;
}

function refundOrderGid(payload) {
  return gid("Order", payload?.order?.admin_graphql_api_id || payload?.order_id || payload?.order?.id);
}

function lineGid(line) {
  return gid("LineItem", line?.admin_graphql_api_id || line?.id);
}

function variantGid(line) {
  return gid("ProductVariant", line?.variant_id || line?.variant?.id);
}

function productGid(line) {
  return gid("Product", line?.product_id || line?.product?.id);
}

function config() {
  const syncEnabled = bool(process.env.SHOPIFY_SYNC_ENABLED, false);
  const inboundEnabled = bool(process.env.SHOPIFY_INBOUND_ENABLED, syncEnabled);
  return {
    enabled: bool(process.env.SHOPIFY_ORDER_SYNC_ENABLED, inboundEnabled),
    secret: text(process.env.SHOPIFY_CLIENT_SECRET),
  };
}

export async function ensureAifShopifyOrderSchema(client) {
  await ensureAifShopifyTables(client);

  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_orders (
    shopify_order_id text PRIMARY KEY,
    shopify_order_legacy_id text UNIQUE,
    order_name text NULL,
    order_number bigint NULL,
    confirmation_number text NULL,
    status text NOT NULL DEFAULT 'open',
    financial_status text NULL,
    fulfillment_status text NULL,
    currency_code text NULL,
    subtotal_price numeric NULL,
    total_price numeric NULL,
    total_tax numeric NULL,
    total_discounts numeric NULL,
    total_shipping numeric NULL,
    refunded_amount numeric NOT NULL DEFAULT 0,
    customer_name text NULL,
    customer_email text NULL,
    customer_phone text NULL,
    source_name text NULL,
    note text NULL,
    tags text[] NOT NULL DEFAULT '{}'::text[],
    shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
    billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
    cancel_reason text NULL,
    shopify_created_at timestamptz NULL,
    shopify_updated_at timestamptz NULL,
    processed_at timestamptz NULL,
    cancelled_at timestamptz NULL,
    closed_at timestamptz NULL,
    last_event_topic text NULL,
    last_webhook_id text NULL,
    raw jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);

  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_orders_date_idx
    ON aif_shopify_orders (shopify_created_at DESC NULLS LAST, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_orders_status_idx
    ON aif_shopify_orders (status, financial_status, fulfillment_status)`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_orders_name_idx
    ON aif_shopify_orders (order_name)`);

  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_order_lines (
    shopify_line_item_id text PRIMARY KEY,
    shopify_order_id text NOT NULL REFERENCES aif_shopify_orders(shopify_order_id) ON DELETE CASCADE,
    shopify_variant_id text NULL,
    shopify_product_id text NULL,
    aif_variant_id uuid NULL REFERENCES aif_product_variants(id) ON DELETE SET NULL,
    sku text NULL,
    title text NULL,
    variant_title text NULL,
    vendor text NULL,
    quantity integer NOT NULL DEFAULT 0,
    current_quantity integer NOT NULL DEFAULT 0,
    fulfillable_quantity integer NULL,
    fulfillment_status text NULL,
    unit_price numeric NULL,
    total_discount numeric NULL,
    grams integer NULL,
    requires_shipping boolean NULL,
    taxable boolean NULL,
    is_active boolean NOT NULL DEFAULT true,
    raw jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);

  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_order_lines_order_idx
    ON aif_shopify_order_lines (shopify_order_id, is_active, created_at)`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_order_lines_sku_idx
    ON aif_shopify_order_lines (sku)`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_order_lines_aif_variant_idx
    ON aif_shopify_order_lines (aif_variant_id)`);

  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_refunds (
    shopify_refund_id text PRIMARY KEY,
    shopify_order_id text NOT NULL REFERENCES aif_shopify_orders(shopify_order_id) ON DELETE CASCADE,
    shopify_refund_legacy_id text UNIQUE,
    amount numeric NOT NULL DEFAULT 0,
    currency_code text NULL,
    note text NULL,
    restock boolean NULL,
    shopify_created_at timestamptz NULL,
    raw jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);

  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_refunds_order_idx
    ON aif_shopify_refunds (shopify_order_id, shopify_created_at DESC NULLS LAST)`);

  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_refund_lines (
    shopify_refund_line_id text PRIMARY KEY,
    shopify_refund_id text NOT NULL REFERENCES aif_shopify_refunds(shopify_refund_id) ON DELETE CASCADE,
    shopify_line_item_id text NULL,
    quantity integer NOT NULL DEFAULT 0,
    subtotal numeric NULL,
    total_tax numeric NULL,
    restock_type text NULL,
    shopify_location_id text NULL,
    raw jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);

  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_refund_lines_refund_idx
    ON aif_shopify_refund_lines (shopify_refund_id)`);

  // Minimális törlési napló. Nem tárol kliens- vagy rendelési adatot, csak azt akadályozza meg,
  // hogy egy később beérkező Shopify webhook újra létrehozza a végleg törölt AllIn rekordot.
  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_order_deletions (
    shopify_order_id text PRIMARY KEY,
    shopify_order_legacy_id text NULL,
    order_name text NULL,
    deleted_by text NULL,
    delete_reason text NULL,
    is_test boolean NOT NULL DEFAULT false,
    deleted_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_order_deletions_legacy_idx
    ON aif_shopify_order_deletions (shopify_order_legacy_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_order_deletions_name_idx
    ON aif_shopify_order_deletions (order_name)`);

  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_order_event_work_idx
    ON aif_shopify_webhook_events (status, next_attempt_at, received_at)
    WHERE topic IN (
      'orders/create','orders/updated','orders/cancelled','orders/paid',
      'orders/fulfilled','orders/partially_fulfilled','refunds/create'
    )`);
}

export async function receiveAifShopifyOrderWebhook(pool, { rawBody, payload, headers }) {
  const settings = config();
  if (!verifyAifShopifyWebhook(rawBody, headers, settings.secret)) {
    return { accepted: false, statusCode: 401, error: "invalid_shopify_hmac" };
  }

  const topic = headerValue(headers, "x-shopify-topic").toLowerCase();
  if (!ORDER_TOPICS.has(topic)) {
    return { accepted: false, statusCode: 400, error: "unsupported_shopify_topic", topic };
  }

  const shopifyWebhookId = headerValue(headers, "x-shopify-webhook-id")
    || createHash("sha256").update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "")).digest("hex");
  const shopDomain = headerValue(headers, "x-shopify-shop-domain") || null;

  const client = await pool.connect();
  try {
    await ensureAifShopifyOrderSchema(client);
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
      orderSyncEnabled: settings.enabled,
    };
  } finally {
    client.release();
  }
}

async function claimOrderEvents(pool, limit) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureAifShopifyOrderSchema(client);
    const result = await client.query(
      `WITH picked AS (
         SELECT shopify_webhook_id
         FROM aif_shopify_webhook_events
         WHERE topic IN (
           'orders/create','orders/updated','orders/cancelled','orders/paid',
           'orders/fulfilled','orders/partially_fulfilled','refunds/create'
         )
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

async function findDeletedOrder(client, { orderId = null, legacyId = null, orderName = null } = {}) {
  const values = [text(orderId), text(legacyId), text(orderName)];
  if (!values.some(Boolean)) return null;
  const result = await client.query(
    `SELECT shopify_order_id, shopify_order_legacy_id, order_name, deleted_by, delete_reason, is_test, deleted_at
     FROM aif_shopify_order_deletions
     WHERE ($1::text <> '' AND shopify_order_id=$1)
        OR ($2::text <> '' AND shopify_order_legacy_id=$2)
        OR ($3::text <> '' AND order_name=$3)
     ORDER BY deleted_at DESC
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

async function ensureOrderPlaceholder(client, orderId, orderLegacyId, event) {
  if (!orderId) return null;
  await client.query(
    `INSERT INTO aif_shopify_orders (
       shopify_order_id, shopify_order_legacy_id, status, last_event_topic,
       last_webhook_id, raw, updated_at
     )
     VALUES ($1,$2,'open',$3,$4,$5::jsonb,now())
     ON CONFLICT (shopify_order_id) DO UPDATE SET
       shopify_order_legacy_id=COALESCE(EXCLUDED.shopify_order_legacy_id, aif_shopify_orders.shopify_order_legacy_id),
       last_event_topic=EXCLUDED.last_event_topic,
       last_webhook_id=EXCLUDED.last_webhook_id,
       updated_at=now()`,
    [orderId, orderLegacyId, event.topic, event.shopify_webhook_id, JSON.stringify(event.payload || {})]
  );
  return orderId;
}

async function upsertOrder(client, event) {
  const payload = json(event.payload, {});
  const shopifyOrderId = orderGid(payload);
  const legacyId = orderLegacyId(payload);
  if (!shopifyOrderId) {
    await markEvent(client, event.shopify_webhook_id, "ignored", { reason: "order_id_missing", topic: event.topic });
    return { status: "ignored", reason: "order_id_missing" };
  }

  const deletedOrder = await findDeletedOrder(client, {
    orderId: shopifyOrderId,
    legacyId,
    orderName: text(payload.name) || null,
  });
  if (deletedOrder) {
    const result = {
      reason: "order_permanently_deleted_in_allin",
      topic: event.topic,
      orderId: shopifyOrderId,
      orderLegacyId: legacyId,
      orderName: text(payload.name) || null,
      deletedAt: deletedOrder.deleted_at || null,
      stockChangedByOrderProcessor: false,
    };
    await markEvent(client, event.shopify_webhook_id, "ignored", result);
    return { status: "ignored", ...result };
  }

  const currency = text(payload.currency || payload.presentment_currency)
    || currencyFromSet(payload.current_total_price_set || payload.total_price_set)
    || null;
  const subtotal = moneyFromSet(payload.current_subtotal_price_set || payload.subtotal_price_set, payload.current_subtotal_price ?? payload.subtotal_price);
  const total = moneyFromSet(payload.current_total_price_set || payload.total_price_set, payload.current_total_price ?? payload.total_price);
  const tax = moneyFromSet(payload.current_total_tax_set || payload.total_tax_set, payload.current_total_tax ?? payload.total_tax);
  const discounts = moneyFromSet(payload.current_total_discounts_set || payload.total_discounts_set, payload.current_total_discounts ?? payload.total_discounts);
  const shipping = moneyFromSet(payload.total_shipping_price_set, payload.total_shipping_price);

  await client.query(
    `INSERT INTO aif_shopify_orders (
       shopify_order_id, shopify_order_legacy_id, order_name, order_number,
       confirmation_number, status, financial_status, fulfillment_status,
       currency_code, subtotal_price, total_price, total_tax, total_discounts,
       total_shipping, customer_name, customer_email, customer_phone, source_name,
       note, tags, shipping_address, billing_address, cancel_reason,
       shopify_created_at, shopify_updated_at, processed_at, cancelled_at, closed_at,
       last_event_topic, last_webhook_id, raw, updated_at
     )
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
       $19,$20::text[],$21::jsonb,$22::jsonb,$23,$24,$25,$26,$27,$28,$29,$30,$31::jsonb,now()
     )
     ON CONFLICT (shopify_order_id) DO UPDATE SET
       shopify_order_legacy_id=COALESCE(EXCLUDED.shopify_order_legacy_id, aif_shopify_orders.shopify_order_legacy_id),
       order_name=COALESCE(EXCLUDED.order_name, aif_shopify_orders.order_name),
       order_number=COALESCE(EXCLUDED.order_number, aif_shopify_orders.order_number),
       confirmation_number=COALESCE(EXCLUDED.confirmation_number, aif_shopify_orders.confirmation_number),
       status=EXCLUDED.status,
       financial_status=COALESCE(EXCLUDED.financial_status, aif_shopify_orders.financial_status),
       fulfillment_status=COALESCE(EXCLUDED.fulfillment_status, aif_shopify_orders.fulfillment_status),
       currency_code=COALESCE(EXCLUDED.currency_code, aif_shopify_orders.currency_code),
       subtotal_price=COALESCE(EXCLUDED.subtotal_price, aif_shopify_orders.subtotal_price),
       total_price=COALESCE(EXCLUDED.total_price, aif_shopify_orders.total_price),
       total_tax=COALESCE(EXCLUDED.total_tax, aif_shopify_orders.total_tax),
       total_discounts=COALESCE(EXCLUDED.total_discounts, aif_shopify_orders.total_discounts),
       total_shipping=COALESCE(EXCLUDED.total_shipping, aif_shopify_orders.total_shipping),
       customer_name=COALESCE(EXCLUDED.customer_name, aif_shopify_orders.customer_name),
       customer_email=COALESCE(EXCLUDED.customer_email, aif_shopify_orders.customer_email),
       customer_phone=COALESCE(EXCLUDED.customer_phone, aif_shopify_orders.customer_phone),
       source_name=COALESCE(EXCLUDED.source_name, aif_shopify_orders.source_name),
       note=EXCLUDED.note,
       tags=EXCLUDED.tags,
       shipping_address=EXCLUDED.shipping_address,
       billing_address=EXCLUDED.billing_address,
       cancel_reason=COALESCE(EXCLUDED.cancel_reason, aif_shopify_orders.cancel_reason),
       shopify_created_at=COALESCE(EXCLUDED.shopify_created_at, aif_shopify_orders.shopify_created_at),
       shopify_updated_at=COALESCE(EXCLUDED.shopify_updated_at, aif_shopify_orders.shopify_updated_at),
       processed_at=COALESCE(EXCLUDED.processed_at, aif_shopify_orders.processed_at),
       cancelled_at=COALESCE(EXCLUDED.cancelled_at, aif_shopify_orders.cancelled_at),
       closed_at=COALESCE(EXCLUDED.closed_at, aif_shopify_orders.closed_at),
       last_event_topic=EXCLUDED.last_event_topic,
       last_webhook_id=EXCLUDED.last_webhook_id,
       raw=EXCLUDED.raw,
       updated_at=now()`,
    [
      shopifyOrderId,
      legacyId,
      text(payload.name) || null,
      payload.order_number === undefined || payload.order_number === null ? null : integer(payload.order_number, 0),
      text(payload.confirmation_number) || null,
      orderStatus(payload),
      text(payload.financial_status) || null,
      text(payload.fulfillment_status) || null,
      currency,
      subtotal,
      total,
      tax,
      discounts,
      shipping,
      customerName(payload),
      text(payload.email || payload.contact_email || payload.customer?.email) || null,
      text(payload.phone || payload.customer?.phone || payload.shipping_address?.phone || payload.billing_address?.phone) || null,
      text(payload.source_name) || null,
      text(payload.note) || null,
      stringArray(payload.tags),
      JSON.stringify(json(payload.shipping_address, {})),
      JSON.stringify(json(payload.billing_address, {})),
      text(payload.cancel_reason) || null,
      isoOrNull(payload.created_at),
      isoOrNull(payload.updated_at),
      isoOrNull(payload.processed_at),
      isoOrNull(payload.cancelled_at),
      isoOrNull(payload.closed_at),
      event.topic,
      event.shopify_webhook_id,
      JSON.stringify(payload),
    ]
  );

  await client.query(
    `UPDATE aif_shopify_order_lines
     SET is_active=false, updated_at=now()
     WHERE shopify_order_id=$1`,
    [shopifyOrderId]
  );

  let mappedLines = 0;
  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
  for (const line of lineItems) {
    const shopifyLineItemId = lineGid(line);
    if (!shopifyLineItemId) continue;
    const shopifyVariantId = variantGid(line);
    const sku = text(line.sku) || null;
    const mapped = await client.query(
      `SELECT variant_id
       FROM aif_shopify_variant_map
       WHERE ($1::text IS NOT NULL AND shopify_variant_id=$1)
          OR ($2::text IS NOT NULL AND sku=$2)
       ORDER BY CASE WHEN shopify_variant_id=$1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [shopifyVariantId, sku]
    );
    const aifVariantId = mapped.rows[0]?.variant_id || null;
    if (aifVariantId) mappedLines += 1;

    await client.query(
      `INSERT INTO aif_shopify_order_lines (
         shopify_line_item_id, shopify_order_id, shopify_variant_id, shopify_product_id,
         aif_variant_id, sku, title, variant_title, vendor, quantity, current_quantity,
         fulfillable_quantity, fulfillment_status, unit_price, total_discount, grams,
         requires_shipping, taxable, is_active, raw, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true,$19::jsonb,now())
       ON CONFLICT (shopify_line_item_id) DO UPDATE SET
         shopify_order_id=EXCLUDED.shopify_order_id,
         shopify_variant_id=EXCLUDED.shopify_variant_id,
         shopify_product_id=EXCLUDED.shopify_product_id,
         aif_variant_id=EXCLUDED.aif_variant_id,
         sku=EXCLUDED.sku,
         title=EXCLUDED.title,
         variant_title=EXCLUDED.variant_title,
         vendor=EXCLUDED.vendor,
         quantity=EXCLUDED.quantity,
         current_quantity=EXCLUDED.current_quantity,
         fulfillable_quantity=EXCLUDED.fulfillable_quantity,
         fulfillment_status=EXCLUDED.fulfillment_status,
         unit_price=EXCLUDED.unit_price,
         total_discount=EXCLUDED.total_discount,
         grams=EXCLUDED.grams,
         requires_shipping=EXCLUDED.requires_shipping,
         taxable=EXCLUDED.taxable,
         is_active=true,
         raw=EXCLUDED.raw,
         updated_at=now()`,
      [
        shopifyLineItemId,
        shopifyOrderId,
        shopifyVariantId,
        productGid(line),
        aifVariantId,
        sku,
        text(line.title || line.name) || null,
        text(line.variant_title) || null,
        text(line.vendor) || null,
        Math.max(0, integer(line.quantity, 0)),
        Math.max(0, integer(line.current_quantity ?? line.quantity, 0)),
        line.fulfillable_quantity === undefined || line.fulfillable_quantity === null ? null : Math.max(0, integer(line.fulfillable_quantity, 0)),
        text(line.fulfillment_status) || null,
        nullableDecimal(line.price),
        nullableDecimal(line.total_discount),
        line.grams === undefined || line.grams === null ? null : integer(line.grams, 0),
        line.requires_shipping === undefined ? null : Boolean(line.requires_shipping),
        line.taxable === undefined ? null : Boolean(line.taxable),
        JSON.stringify(line),
      ]
    );
  }

  const result = {
    orderId: shopifyOrderId,
    orderLegacyId: legacyId,
    orderName: text(payload.name) || null,
    topic: event.topic,
    lineCount: lineItems.length,
    mappedLines,
    status: orderStatus(payload),
    financialStatus: text(payload.financial_status) || null,
    fulfillmentStatus: text(payload.fulfillment_status) || null,
    stockChangedByOrderProcessor: false,
  };

  await markEvent(client, event.shopify_webhook_id, "processed", result);
  return { status: "processed", ...result };
}

function refundAmount(payload) {
  const transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
  if (transactions.length) {
    return transactions.reduce((sum, row) => sum + Math.abs(decimal(row?.amount, 0)), 0);
  }
  const lines = Array.isArray(payload?.refund_line_items) ? payload.refund_line_items : [];
  return lines.reduce((sum, row) => {
    const subtotal = moneyFromSet(row?.subtotal_set, row?.subtotal) || 0;
    const tax = moneyFromSet(row?.total_tax_set, row?.total_tax) || 0;
    return sum + subtotal + tax;
  }, 0);
}

async function upsertRefund(client, event) {
  const payload = json(event.payload, {});
  const shopifyRefundId = gid("Refund", payload.admin_graphql_api_id || payload.id);
  const shopifyOrderId = refundOrderGid(payload);
  const orderLegacyId = refundOrderLegacyId(payload);
  if (!shopifyRefundId || !shopifyOrderId) {
    await markEvent(client, event.shopify_webhook_id, "ignored", { reason: "refund_ids_missing", topic: event.topic });
    return { status: "ignored", reason: "refund_ids_missing" };
  }

  const deletedOrder = await findDeletedOrder(client, {
    orderId: shopifyOrderId,
    legacyId: orderLegacyId,
    orderName: text(payload?.order?.name) || null,
  });
  if (deletedOrder) {
    const result = {
      reason: "order_permanently_deleted_in_allin",
      topic: event.topic,
      orderId: shopifyOrderId,
      orderLegacyId,
      refundId: shopifyRefundId,
      deletedAt: deletedOrder.deleted_at || null,
      stockChangedByOrderProcessor: false,
    };
    await markEvent(client, event.shopify_webhook_id, "ignored", result);
    return { status: "ignored", ...result };
  }

  await ensureOrderPlaceholder(client, shopifyOrderId, orderLegacyId, event);

  const amount = refundAmount(payload);
  const currency = text(payload.currency)
    || currencyFromSet(payload.transactions?.[0]?.amount_set)
    || null;

  await client.query(
    `INSERT INTO aif_shopify_refunds (
       shopify_refund_id, shopify_order_id, shopify_refund_legacy_id,
       amount, currency_code, note, restock, shopify_created_at, raw, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
     ON CONFLICT (shopify_refund_id) DO UPDATE SET
       shopify_order_id=EXCLUDED.shopify_order_id,
       shopify_refund_legacy_id=COALESCE(EXCLUDED.shopify_refund_legacy_id, aif_shopify_refunds.shopify_refund_legacy_id),
       amount=EXCLUDED.amount,
       currency_code=COALESCE(EXCLUDED.currency_code, aif_shopify_refunds.currency_code),
       note=EXCLUDED.note,
       restock=EXCLUDED.restock,
       shopify_created_at=COALESCE(EXCLUDED.shopify_created_at, aif_shopify_refunds.shopify_created_at),
       raw=EXCLUDED.raw,
       updated_at=now()`,
    [
      shopifyRefundId,
      shopifyOrderId,
      text(payload.id) || null,
      amount,
      currency,
      text(payload.note) || null,
      payload.restock === undefined ? null : Boolean(payload.restock),
      isoOrNull(payload.created_at),
      JSON.stringify(payload),
    ]
  );

  const refundLines = Array.isArray(payload.refund_line_items) ? payload.refund_line_items : [];
  for (const row of refundLines) {
    const refundLineId = gid("RefundLineItem", row.admin_graphql_api_id || row.id)
      || `${shopifyRefundId}:line:${text(row.line_item_id || row.line_item?.id || Math.random())}`;
    await client.query(
      `INSERT INTO aif_shopify_refund_lines (
         shopify_refund_line_id, shopify_refund_id, shopify_line_item_id,
         quantity, subtotal, total_tax, restock_type, shopify_location_id, raw, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now())
       ON CONFLICT (shopify_refund_line_id) DO UPDATE SET
         shopify_refund_id=EXCLUDED.shopify_refund_id,
         shopify_line_item_id=EXCLUDED.shopify_line_item_id,
         quantity=EXCLUDED.quantity,
         subtotal=EXCLUDED.subtotal,
         total_tax=EXCLUDED.total_tax,
         restock_type=EXCLUDED.restock_type,
         shopify_location_id=EXCLUDED.shopify_location_id,
         raw=EXCLUDED.raw,
         updated_at=now()`,
      [
        refundLineId,
        shopifyRefundId,
        lineGid(row.line_item || { id: row.line_item_id }),
        Math.max(0, integer(row.quantity, 0)),
        moneyFromSet(row.subtotal_set, row.subtotal),
        moneyFromSet(row.total_tax_set, row.total_tax),
        text(row.restock_type) || null,
        gid("Location", row.location_id),
        JSON.stringify(row),
      ]
    );
  }

  await client.query(
    `UPDATE aif_shopify_orders o
     SET refunded_amount=COALESCE((
       SELECT sum(r.amount)
       FROM aif_shopify_refunds r
       WHERE r.shopify_order_id=o.shopify_order_id
     ),0),
         last_event_topic=$2,
         last_webhook_id=$3,
         updated_at=now()
     WHERE o.shopify_order_id=$1`,
    [shopifyOrderId, event.topic, event.shopify_webhook_id]
  );

  const result = {
    orderId: shopifyOrderId,
    refundId: shopifyRefundId,
    amount,
    currency,
    refundLineCount: refundLines.length,
    stockChangedByOrderProcessor: false,
  };
  await markEvent(client, event.shopify_webhook_id, "processed", result);
  return { status: "processed", ...result };
}

async function processOrderEvent(pool, event) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureAifShopifyOrderSchema(client);
    const result = event.topic === "refunds/create"
      ? await upsertRefund(client, event)
      : await upsertOrder(client, event);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function processAifShopifyOrderBatch(pool, options = {}) {
  const settings = config();
  if (!settings.enabled) {
    return { enabled: false, claimed: 0, processed: 0, ignored: 0, errors: 0, errorItems: [] };
  }
  if (!settings.secret) {
    throw Object.assign(new Error("Hiányzik a SHOPIFY_CLIENT_SECRET ENV."), { code: "shopify_order_config_missing" });
  }

  const rows = await claimOrderEvents(pool, options.limit || 20);
  let processed = 0;
  let ignored = 0;
  const errors = [];

  for (const event of rows) {
    try {
      const result = await processOrderEvent(pool, event);
      if (result.status === "processed") processed += 1;
      else ignored += 1;
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
      errors.push({ webhookId: event.shopify_webhook_id, topic: event.topic, error: message, code: error?.code || null, retryInSeconds: delay });
    }
  }

  return {
    enabled: true,
    claimed: rows.length,
    processed,
    ignored,
    errors: errors.length,
    errorItems: errors,
  };
}

export async function listAifShopifyOrders(client, options = {}) {
  await ensureAifShopifyOrderSchema(client);
  const limit = Math.min(500, Math.max(1, integer(options.limit, 100)));
  const search = text(options.search);
  const status = text(options.status);
  const financialStatus = text(options.financialStatus || options.financial_status);
  const fulfillmentStatus = text(options.fulfillmentStatus || options.fulfillment_status);
  const from = text(options.from);
  const to = text(options.to);
  const onlyProblems = bool(options.onlyProblems ?? options.only_problems, false);
  const testMode = text(options.testMode || options.test_mode).toLowerCase();
  const args = [];
  const where = [];

  if (search) {
    args.push(`%${search}%`);
    const p = `$${args.length}`;
    where.push(`(
      COALESCE(o.order_name,'') ILIKE ${p}
      OR COALESCE(o.customer_name,'') ILIKE ${p}
      OR COALESCE(o.customer_email,'') ILIKE ${p}
      OR COALESCE(o.customer_phone,'') ILIKE ${p}
      OR COALESCE(o.shipping_address->>'company','') ILIKE ${p}
      OR COALESCE(o.billing_address->>'company','') ILIKE ${p}
      OR EXISTS (
        SELECT 1 FROM aif_shopify_order_lines l
        WHERE l.shopify_order_id=o.shopify_order_id
          AND (
            COALESCE(l.sku,'') ILIKE ${p}
            OR COALESCE(l.title,'') ILIKE ${p}
            OR COALESCE(l.variant_title,'') ILIKE ${p}
          )
      )
    )`);
  }
  if (status) {
    args.push(status);
    where.push(`o.status=$${args.length}`);
  }
  if (financialStatus) {
    args.push(financialStatus);
    where.push(`COALESCE(o.financial_status,'')=$${args.length}`);
  }
  if (fulfillmentStatus) {
    args.push(fulfillmentStatus);
    where.push(`COALESCE(o.fulfillment_status,'unfulfilled')=$${args.length}`);
  }
  if (from) {
    args.push(from);
    where.push(`COALESCE(o.shopify_created_at, o.created_at) >= $${args.length}::date`);
  }
  if (to) {
    args.push(to);
    where.push(`COALESCE(o.shopify_created_at, o.created_at) < ($${args.length}::date + interval '1 day')`);
  }
  if (onlyProblems) {
    where.push(`EXISTS (
      SELECT 1 FROM aif_shopify_order_lines problem_line
      WHERE problem_line.shopify_order_id=o.shopify_order_id
        AND problem_line.is_active=true
        AND problem_line.aif_variant_id IS NULL
    )`);
  }
  if (testMode === "test") {
    where.push(`(COALESCE(o.raw->>'test','false')='true' OR COALESCE(o.order_name,'') ~* '^#?AIF-(TEST|LIFE)-')`);
  } else if (testMode === "real") {
    where.push(`NOT (COALESCE(o.raw->>'test','false')='true' OR COALESCE(o.order_name,'') ~* '^#?AIF-(TEST|LIFE)-')`);
  }

  args.push(limit);
  const result = await client.query(
    `SELECT
       o.*,
       count(l.shopify_line_item_id) FILTER (WHERE l.is_active=true)::int AS line_count,
       COALESCE(sum(l.quantity) FILTER (WHERE l.is_active=true),0)::int AS item_qty,
       count(l.shopify_line_item_id) FILTER (WHERE l.is_active=true AND l.aif_variant_id IS NOT NULL)::int AS mapped_line_count,
       count(l.shopify_line_item_id) FILTER (WHERE l.is_active=true AND l.aif_variant_id IS NULL)::int AS unmapped_line_count,
       (SELECT count(*)::int FROM aif_shopify_refunds r WHERE r.shopify_order_id=o.shopify_order_id) AS refund_count,
       COALESCE((SELECT sum(r.amount) FROM aif_shopify_refunds r WHERE r.shopify_order_id=o.shopify_order_id),0)::numeric AS refund_total
     FROM aif_shopify_orders o
     LEFT JOIN aif_shopify_order_lines l ON l.shopify_order_id=o.shopify_order_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY o.shopify_order_id
     ORDER BY COALESCE(o.shopify_created_at, o.created_at) DESC
     LIMIT $${args.length}`,
    args
  );
  return result.rows;
}

export async function getAifShopifyOrder(client, id) {
  await ensureAifShopifyOrderSchema(client);
  const key = text(id);
  const order = await client.query(
    `SELECT *
     FROM aif_shopify_orders
     WHERE shopify_order_id=$1
        OR shopify_order_legacy_id=$1
        OR order_name=$1
     LIMIT 1`,
    [key]
  );
  if (!order.rowCount) return null;
  const item = order.rows[0];
  const [lines, refunds, events] = await Promise.all([
    client.query(
      `SELECT
         l.*,
         m.title_ro AS aif_title,
         m.shopify_title AS aif_shopify_title,
         v.internal_sku AS aif_internal_sku,
         v.barcode AS aif_barcode,
         v.color_name AS aif_color,
         v.color_code AS aif_color_code,
         v.size AS aif_size,
         v.image_url AS aif_image_url,
         b.name AS aif_brand,
         COALESCE(st.total_qty,0)::numeric AS aif_total_qty,
         COALESCE(st.reserved_qty,0)::numeric AS aif_reserved_qty,
         COALESCE(st.available_qty,0)::numeric AS aif_available_qty,
         COALESCE(st.locations,'[]'::jsonb) AS aif_stock_locations
       FROM aif_shopify_order_lines l
       LEFT JOIN aif_product_variants v ON v.id=l.aif_variant_id
       LEFT JOIN aif_product_models m ON m.id=v.model_id
       LEFT JOIN aif_brands b ON b.id=m.brand_id
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(sum(s.qty),0) AS total_qty,
           COALESCE(sum(s.reserved_qty),0) AS reserved_qty,
           COALESCE(sum(s.qty-s.reserved_qty),0) AS available_qty,
           COALESCE(jsonb_agg(
             jsonb_build_object(
               'locationId', loc.id,
               'locationCode', loc.code,
               'locationName', loc.name,
               'qty', s.qty,
               'reservedQty', s.reserved_qty,
               'availableQty', s.qty-s.reserved_qty,
               'updatedAt', s.updated_at
             ) ORDER BY loc.name
           ) FILTER (WHERE loc.id IS NOT NULL),'[]'::jsonb) AS locations
         FROM aif_stock s
         JOIN aif_locations loc ON loc.id=s.location_id
         WHERE s.variant_id=l.aif_variant_id
       ) st ON true
       WHERE l.shopify_order_id=$1
       ORDER BY l.is_active DESC, l.created_at ASC`,
      [item.shopify_order_id]
    ),
    client.query(
      `SELECT r.*,
              COALESCE((
                SELECT jsonb_agg(rl ORDER BY rl.created_at ASC)
                FROM aif_shopify_refund_lines rl
                WHERE rl.shopify_refund_id=r.shopify_refund_id
              ),'[]'::jsonb) AS lines
       FROM aif_shopify_refunds r
       WHERE r.shopify_order_id=$1
       ORDER BY r.shopify_created_at DESC NULLS LAST, r.created_at DESC`,
      [item.shopify_order_id]
    ),
    client.query(
      `SELECT shopify_webhook_id, topic, shop_domain, status, result, error,
              attempts, received_at, processed_at, updated_at
       FROM aif_shopify_webhook_events
       WHERE topic IN (
         'orders/create','orders/updated','orders/cancelled','orders/paid',
         'orders/fulfilled','orders/partially_fulfilled','refunds/create'
       )
         AND (
           result->>'orderId'=$1
           OR ($2::text IS NOT NULL AND payload->>'id'=$2)
           OR ($2::text IS NOT NULL AND payload->>'order_id'=$2)
           OR ($2::text IS NOT NULL AND payload->'order'->>'id'=$2)
           OR ($3::text IS NOT NULL AND payload->>'name'=$3)
         )
       ORDER BY received_at DESC
       LIMIT 100`,
      [item.shopify_order_id, item.shopify_order_legacy_id, item.order_name]
    ),
  ]);
  return { item, lines: lines.rows, refunds: refunds.rows, events: events.rows };
}

export async function deleteAifShopifyOrder(client, id, options = {}) {
  await ensureAifShopifyOrderSchema(client);
  const key = text(id);
  const actor = text(options.actor || "system") || "system";
  const reason = text(options.reason || "Végleges törlés az AllIn rendelési felületéről") || null;

  const orderResult = await client.query(
    `SELECT *
     FROM aif_shopify_orders
     WHERE shopify_order_id=$1
        OR shopify_order_legacy_id=$1
        OR order_name=$1
     LIMIT 1
     FOR UPDATE`,
    [key]
  );

  if (!orderResult.rowCount) {
    const deleted = await findDeletedOrder(client, { orderId: key, legacyId: key, orderName: key });
    if (deleted) {
      return {
        ok: true,
        alreadyDeleted: true,
        mode: "permanently_deleted",
        orderId: deleted.shopify_order_id,
        orderName: deleted.order_name || null,
        stockChanged: false,
      };
    }
    return null;
  }

  const order = orderResult.rows[0];
  const isTest = bool(order.raw?.test, false) || /#?AIF-(TEST|LIFE)-/i.test(text(order.order_name));

  const counts = await client.query(
    `SELECT
       (SELECT count(*)::int FROM aif_shopify_order_lines l WHERE l.shopify_order_id=$1) AS lines,
       (SELECT count(*)::int FROM aif_shopify_refunds r WHERE r.shopify_order_id=$1) AS refunds,
       (SELECT count(*)::int
          FROM aif_shopify_refund_lines rl
          JOIN aif_shopify_refunds r ON r.shopify_refund_id=rl.shopify_refund_id
         WHERE r.shopify_order_id=$1) AS refund_lines`,
    [order.shopify_order_id]
  );

  // Csak ellenőrző összesítés. A rendelés törlése egyetlen készletsort vagy készletmozgást sem módosít.
  const stockSnapshot = await client.query(
    `WITH variants AS (
       SELECT DISTINCT aif_variant_id AS variant_id
       FROM aif_shopify_order_lines
       WHERE shopify_order_id=$1 AND aif_variant_id IS NOT NULL
     )
     SELECT
       count(v.variant_id)::int AS mapped_variants,
       COALESCE(sum(s.qty),0)::numeric AS stock_qty,
       COALESCE(sum(s.reserved_qty),0)::numeric AS reserved_qty,
       COALESCE(sum(s.qty-s.reserved_qty),0)::numeric AS available_qty
     FROM variants v
     LEFT JOIN aif_stock s ON s.variant_id=v.variant_id`,
    [order.shopify_order_id]
  );

  await client.query(
    `INSERT INTO aif_shopify_order_deletions (
       shopify_order_id, shopify_order_legacy_id, order_name,
       deleted_by, delete_reason, is_test, deleted_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (shopify_order_id) DO UPDATE SET
       shopify_order_legacy_id=COALESCE(EXCLUDED.shopify_order_legacy_id, aif_shopify_order_deletions.shopify_order_legacy_id),
       order_name=COALESCE(EXCLUDED.order_name, aif_shopify_order_deletions.order_name),
       deleted_by=EXCLUDED.deleted_by,
       delete_reason=EXCLUDED.delete_reason,
       is_test=EXCLUDED.is_test,
       deleted_at=now()`,
    [
      order.shopify_order_id,
      order.shopify_order_legacy_id,
      order.order_name,
      actor,
      reason,
      isTest,
    ]
  );

  const deletedEvents = await client.query(
    `DELETE FROM aif_shopify_webhook_events
     WHERE topic IN (
       'orders/create','orders/updated','orders/cancelled','orders/paid',
       'orders/fulfilled','orders/partially_fulfilled','refunds/create'
     )
       AND (
         result->>'orderId'=$1
         OR ($2::text IS NOT NULL AND payload->>'id'=$2)
         OR ($2::text IS NOT NULL AND payload->>'order_id'=$2)
         OR ($2::text IS NOT NULL AND payload->'order'->>'id'=$2)
         OR ($3::text IS NOT NULL AND payload->>'name'=$3)
       )`,
    [order.shopify_order_id, order.shopify_order_legacy_id, order.order_name]
  );

  const deletedOrder = await client.query(
    `DELETE FROM aif_shopify_orders
     WHERE shopify_order_id=$1
     RETURNING shopify_order_id`,
    [order.shopify_order_id]
  );

  return {
    ok: true,
    mode: "permanently_deleted",
    orderId: order.shopify_order_id,
    orderLegacyId: order.shopify_order_legacy_id || null,
    orderName: order.order_name || null,
    isTest,
    deleted: {
      orders: deletedOrder.rowCount,
      lines: Number(counts.rows[0]?.lines || 0),
      refunds: Number(counts.rows[0]?.refunds || 0),
      refundLines: Number(counts.rows[0]?.refund_lines || 0),
      webhookEvents: deletedEvents.rowCount,
    },
    stockChanged: false,
    stockSnapshot: {
      mappedVariants: Number(stockSnapshot.rows[0]?.mapped_variants || 0),
      qty: Number(stockSnapshot.rows[0]?.stock_qty || 0),
      reservedQty: Number(stockSnapshot.rows[0]?.reserved_qty || 0),
      availableQty: Number(stockSnapshot.rows[0]?.available_qty || 0),
    },
  };
}

export async function deleteAifShopifyOrders(client, ids, options = {}) {
  const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map(text).filter(Boolean))).slice(0, 200);
  const items = [];
  for (const id of uniqueIds) {
    const result = await deleteAifShopifyOrder(client, id, options);
    if (result) items.push(result);
  }
  return {
    ok: true,
    requested: uniqueIds.length,
    deleted: items.filter((item) => !item.alreadyDeleted).length,
    alreadyDeleted: items.filter((item) => item.alreadyDeleted).length,
    notFound: Math.max(0, uniqueIds.length - items.length),
    stockChanged: false,
    items,
  };
}

export async function listAifShopifyOrderEvents(client, options = {}) {
  await ensureAifShopifyOrderSchema(client);
  const limit = Math.min(200, Math.max(1, integer(options.limit, 50)));
  const result = await client.query(
    `SELECT shopify_webhook_id, topic, shop_domain, status, payload, result, error,
            attempts, received_at, processed_at, updated_at
     FROM aif_shopify_webhook_events
     WHERE topic IN (
       'orders/create','orders/updated','orders/cancelled','orders/paid',
       'orders/fulfilled','orders/partially_fulfilled','refunds/create'
     )
     ORDER BY received_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
