import crypto from "node:crypto";
import pg from "pg";

const SKU = process.argv.find((arg) => arg.startsWith("--sku="))?.split("=", 2)[1] || "198632995440";
const WAIT_MS = 12000;

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Hiányzik a ${name} ENV.`);
  return value;
}

function money(value) {
  return Number(value || 0);
}

const pool = new pg.Pool({
  connectionString: requiredEnv("DATABASE_URL"),
});

async function sendWebhook({ topic, payload, webhookId }) {
  const rawBody = JSON.stringify(payload);
  const hmac = crypto
    .createHmac("sha256", requiredEnv("SHOPIFY_CLIENT_SECRET"))
    .update(rawBody)
    .digest("base64");

  const baseUrl = String(
    process.env.RENDER_EXTERNAL_URL || "https://all-in-platform.onrender.com",
  ).replace(/\/+$/, "");

  const response = await fetch(`${baseUrl}/api/aif/shopify/webhooks/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": String(
        process.env.SHOPIFY_SHOP_DOMAIN || "allinfashion-2.myshopify.com",
      ),
      "x-shopify-webhook-id": webhookId,
    },
    body: rawBody,
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${topic} webhook HTTP ${response.status}: ${body}`);
  }

  return { topic, status: response.status, body };
}

try {
  const { rows: [mapping] } = await pool.query(
    `SELECT
       m.variant_id,
       m.shopify_variant_id,
       m.shopify_product_id,
       COALESCE(sum(CASE WHEN l.code='main_warehouse' THEN s.qty ELSE 0 END),0)::numeric AS csik_qty,
       COALESCE(sum(CASE WHEN l.code='magazin_targu_secuiesc' THEN s.qty ELSE 0 END),0)::numeric AS kezdi_qty
     FROM aif_shopify_variant_map m
     LEFT JOIN aif_stock s ON s.variant_id=m.variant_id
     LEFT JOIN aif_locations l ON l.id=s.location_id
     WHERE m.sku=$1
     GROUP BY m.variant_id, m.shopify_variant_id, m.shopify_product_id`,
    [SKU],
  );

  if (!mapping) {
    throw new Error(`Az SKU nincs összekötve a Shopifyjal: ${SKU}`);
  }

  const base = Date.now();
  const orderLegacyId = String(base);
  const lineLegacyId = String(base + 1);
  const refundLegacyId = String(base + 2);
  const refundLineLegacyId = String(base + 3);
  const orderName = `#AIF-LIFE-${orderLegacyId.slice(-6)}`;
  const createdAt = new Date().toISOString();

  const commonOrder = {
    id: orderLegacyId,
    admin_graphql_api_id: `gid://shopify/Order/${orderLegacyId}`,
    name: orderName,
    order_number: Number(orderLegacyId.slice(-6)),
    confirmation_number: `LIFE${orderLegacyId.slice(-8)}`,
    currency: "RON",
    subtotal_price: "99.00",
    total_price: "99.00",
    total_tax: "17.18",
    total_discounts: "0.00",
    total_shipping_price_set: {
      shop_money: {
        amount: "0.00",
        currency_code: "RON",
      },
    },
    email: "lifecycle-test@allinfashion.ro",
    phone: "+40000000000",
    source_name: "aif_order_lifecycle_test",
    note: "Automatikus Shopify rendelési életciklus teszt",
    tags: "AIF TEST, LIFECYCLE",
    customer: {
      first_name: "Teszt",
      last_name: "Életciklus",
      email: "lifecycle-test@allinfashion.ro",
      phone: "+40000000000",
    },
    shipping_address: {
      name: "Teszt Életciklus",
      city: "Miercurea Ciuc",
      country: "Romania",
      phone: "+40000000000",
    },
    billing_address: {
      name: "Teszt Életciklus",
      city: "Miercurea Ciuc",
      country: "Romania",
      phone: "+40000000000",
    },
    created_at: createdAt,
    processed_at: createdAt,
  };

  const line = {
    id: lineLegacyId,
    admin_graphql_api_id: `gid://shopify/LineItem/${lineLegacyId}`,
    variant_id: mapping.shopify_variant_id,
    product_id: mapping.shopify_product_id,
    sku: SKU,
    title: "AIF Shopify életciklus teszt",
    variant_title: "Teszt variáns",
    vendor: "AllInFashion",
    quantity: 1,
    current_quantity: 1,
    fulfillable_quantity: 1,
    fulfillment_status: null,
    price: "99.00",
    total_discount: "0.00",
    grams: 200,
    requires_shipping: true,
    taxable: true,
  };

  const steps = [
    {
      topic: "orders/create",
      payload: {
        ...commonOrder,
        updated_at: new Date(base + 10).toISOString(),
        financial_status: "paid",
        fulfillment_status: null,
        line_items: [{ ...line }],
      },
    },
    {
      topic: "orders/partially_fulfilled",
      payload: {
        ...commonOrder,
        updated_at: new Date(base + 20).toISOString(),
        financial_status: "paid",
        fulfillment_status: "partial",
        line_items: [{
          ...line,
          fulfillable_quantity: 0,
          fulfillment_status: "fulfilled",
        }],
      },
    },
    {
      topic: "orders/fulfilled",
      payload: {
        ...commonOrder,
        updated_at: new Date(base + 30).toISOString(),
        financial_status: "paid",
        fulfillment_status: "fulfilled",
        line_items: [{
          ...line,
          fulfillable_quantity: 0,
          fulfillment_status: "fulfilled",
        }],
      },
    },
    {
      topic: "orders/cancelled",
      payload: {
        ...commonOrder,
        updated_at: new Date(base + 40).toISOString(),
        financial_status: "paid",
        fulfillment_status: "fulfilled",
        cancelled_at: new Date(base + 40).toISOString(),
        cancel_reason: "customer",
        line_items: [{
          ...line,
          fulfillable_quantity: 0,
          fulfillment_status: "fulfilled",
        }],
      },
    },
    {
      topic: "refunds/create",
      payload: {
        id: refundLegacyId,
        admin_graphql_api_id: `gid://shopify/Refund/${refundLegacyId}`,
        order_id: orderLegacyId,
        created_at: new Date(base + 50).toISOString(),
        note: "AIF automatikus refund teszt",
        restock: true,
        currency: "RON",
        transactions: [{
          id: String(base + 4),
          amount: "99.00",
          currency: "RON",
          kind: "refund",
          status: "success",
        }],
        refund_line_items: [{
          id: refundLineLegacyId,
          admin_graphql_api_id: `gid://shopify/RefundLineItem/${refundLineLegacyId}`,
          line_item_id: lineLegacyId,
          quantity: 1,
          subtotal: "81.82",
          total_tax: "17.18",
          restock_type: "return",
          location_id: String(process.env.SHOPIFY_LOCATION_KEZDI_ID || "").split("/").pop() || null,
        }],
      },
    },
  ];

  const webhookIds = [];
  const responses = [];

  for (const step of steps) {
    const webhookId = crypto.randomUUID();
    webhookIds.push(webhookId);
    responses.push(await sendWebhook({
      topic: step.topic,
      payload: step.payload,
      webhookId,
    }));
  }

  await new Promise((resolve) => setTimeout(resolve, WAIT_MS));

  const { rows: events } = await pool.query(
    `SELECT shopify_webhook_id, topic, status, attempts, error, result
     FROM aif_shopify_webhook_events
     WHERE shopify_webhook_id = ANY($1::text[])
     ORDER BY received_at ASC`,
    [webhookIds],
  );

  const { rows: [order] } = await pool.query(
    `SELECT
       o.shopify_order_id,
       o.order_name,
       o.status,
       o.financial_status,
       o.fulfillment_status,
       o.refunded_amount,
       o.cancel_reason,
       o.cancelled_at,
       o.last_event_topic,
       l.sku,
       l.quantity,
       l.current_quantity,
       l.fulfillable_quantity,
       l.fulfillment_status AS line_fulfillment_status,
       l.aif_variant_id,
       l.is_active
     FROM aif_shopify_orders o
     JOIN aif_shopify_order_lines l
       ON l.shopify_order_id=o.shopify_order_id
     WHERE o.shopify_order_legacy_id=$1
     LIMIT 1`,
    [orderLegacyId],
  );

  const { rows: [refund] } = await pool.query(
    `SELECT
       r.shopify_refund_legacy_id,
       r.amount,
       r.currency_code,
       r.restock,
       rl.quantity,
       rl.restock_type,
       rl.shopify_location_id
     FROM aif_shopify_refunds r
     JOIN aif_shopify_refund_lines rl
       ON rl.shopify_refund_id=r.shopify_refund_id
     WHERE r.shopify_refund_legacy_id=$1
     LIMIT 1`,
    [refundLegacyId],
  );

  const { rows: [stockAfter] } = await pool.query(
    `SELECT
       COALESCE(sum(CASE WHEN l.code='main_warehouse' THEN s.qty ELSE 0 END),0)::numeric AS csik_qty,
       COALESCE(sum(CASE WHEN l.code='magazin_targu_secuiesc' THEN s.qty ELSE 0 END),0)::numeric AS kezdi_qty
     FROM aif_stock s
     JOIN aif_locations l ON l.id=s.location_id
     WHERE s.variant_id=$1`,
    [mapping.variant_id],
  );

  const allEventsProcessed = events.length === steps.length
    && events.every((event) => (
      event.status === "processed"
      && Number(event.attempts || 0) >= 1
      && !event.error
      && event.result?.stockChangedByOrderProcessor === false
    ));

  const stockUnchanged = money(mapping.csik_qty) === money(stockAfter?.csik_qty)
    && money(mapping.kezdi_qty) === money(stockAfter?.kezdi_qty);

  const ok = Boolean(
    allEventsProcessed
    && order?.order_name === orderName
    && order?.status === "cancelled"
    && order?.financial_status === "paid"
    && order?.fulfillment_status === "fulfilled"
    && order?.cancel_reason === "customer"
    && money(order?.refunded_amount) === 99
    && order?.last_event_topic === "refunds/create"
    && order?.sku === SKU
    && Number(order?.quantity || 0) === 1
    && Number(order?.current_quantity || 0) === 1
    && Number(order?.fulfillable_quantity || 0) === 0
    && order?.line_fulfillment_status === "fulfilled"
    && order?.aif_variant_id
    && order?.is_active === true
    && money(refund?.amount) === 99
    && refund?.currency_code === "RON"
    && refund?.restock === true
    && Number(refund?.quantity || 0) === 1
    && refund?.restock_type === "return"
    && stockUnchanged
  );

  console.log(JSON.stringify({
    ok,
    orderName,
    webhookResponses: responses,
    events,
    order: order || null,
    refund: refund || null,
    stock: {
      before: {
        csikszereda: money(mapping.csik_qty),
        kezdi: money(mapping.kezdi_qty),
      },
      after: {
        csikszereda: money(stockAfter?.csik_qty),
        kezdi: money(stockAfter?.kezdi_qty),
      },
      unchanged: stockUnchanged,
    },
  }, null, 2));

  if (!ok) process.exitCode = 1;
} finally {
  await pool.end();
}
