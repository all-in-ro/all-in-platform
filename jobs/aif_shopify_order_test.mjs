import crypto from "node:crypto";
import pg from "pg";

const SKU = process.argv.find((arg) => arg.startsWith("--sku="))?.split("=", 2)[1] || "198632995440";
const WAIT_MS = 8000;

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Hiányzik a ${name} ENV.`);
  return value;
}

const pool = new pg.Pool({
  connectionString: requiredEnv("DATABASE_URL"),
});

try {
  const { rows: [mapping] } = await pool.query(
    `SELECT shopify_variant_id, shopify_product_id
     FROM aif_shopify_variant_map
     WHERE sku=$1`,
    [SKU],
  );

  if (!mapping) {
    throw new Error(`Az SKU nincs összekötve a Shopifyjal: ${SKU}`);
  }

  const now = new Date().toISOString();
  const orderLegacyId = String(Date.now());
  const lineLegacyId = String(Date.now() + 1);
  const orderName = `#AIF-TEST-${orderLegacyId.slice(-6)}`;
  const webhookId = crypto.randomUUID();

  const payload = {
    id: orderLegacyId,
    admin_graphql_api_id: `gid://shopify/Order/${orderLegacyId}`,
    name: orderName,
    order_number: Number(orderLegacyId.slice(-6)),
    confirmation_number: `AIF${orderLegacyId.slice(-8)}`,
    financial_status: "paid",
    fulfillment_status: null,
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
    email: "test@allinfashion.ro",
    phone: "+40000000000",
    source_name: "aif_webhook_test",
    note: "Automatikus Shopify rendelési webhook teszt",
    tags: "AIF TEST",
    customer: {
      first_name: "Teszt",
      last_name: "Vásárló",
      email: "test@allinfashion.ro",
      phone: "+40000000000",
    },
    shipping_address: {
      name: "Teszt Vásárló",
      city: "Miercurea Ciuc",
      country: "Romania",
      phone: "+40000000000",
    },
    billing_address: {
      name: "Teszt Vásárló",
      city: "Miercurea Ciuc",
      country: "Romania",
      phone: "+40000000000",
    },
    created_at: now,
    updated_at: now,
    processed_at: now,
    line_items: [{
      id: lineLegacyId,
      admin_graphql_api_id: `gid://shopify/LineItem/${lineLegacyId}`,
      variant_id: mapping.shopify_variant_id,
      product_id: mapping.shopify_product_id,
      sku: SKU,
      title: "AIF Shopify rendelési teszt",
      variant_title: "Teszt variáns",
      vendor: "AllInFashion",
      quantity: 1,
      current_quantity: 1,
      fulfillable_quantity: 1,
      price: "99.00",
      total_discount: "0.00",
      grams: 200,
      requires_shipping: true,
      taxable: true,
    }],
  };

  const rawBody = JSON.stringify(payload);
  const hmac = crypto
    .createHmac("sha256", requiredEnv("SHOPIFY_CLIENT_SECRET"))
    .update(rawBody)
    .digest("base64");

  const baseUrl = String(
    process.env.RENDER_EXTERNAL_URL || "https://all-in-platform.onrender.com",
  ).replace(/\/+$/, "");

  const response = await fetch(
    `${baseUrl}/api/aif/shopify/webhooks/orders`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-hmac-sha256": hmac,
        "x-shopify-topic": "orders/create",
        "x-shopify-shop-domain": String(
          process.env.SHOPIFY_SHOP_DOMAIN || "allinfashion-2.myshopify.com",
        ),
        "x-shopify-webhook-id": webhookId,
      },
      body: rawBody,
    },
  );

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Webhook HTTP ${response.status}: ${responseText}`);
  }

  await new Promise((resolve) => setTimeout(resolve, WAIT_MS));

  const { rows: [event] } = await pool.query(
    `SELECT status, attempts, error, result
     FROM aif_shopify_webhook_events
     WHERE shopify_webhook_id=$1`,
    [webhookId],
  );

  const { rows: [order] } = await pool.query(
    `SELECT
       o.order_name,
       o.status,
       o.financial_status,
       o.fulfillment_status,
       o.total_price,
       o.customer_name,
       o.last_event_topic,
       l.sku,
       l.quantity,
       l.aif_variant_id,
       l.is_active
     FROM aif_shopify_orders o
     JOIN aif_shopify_order_lines l
       ON l.shopify_order_id=o.shopify_order_id
     WHERE o.shopify_order_legacy_id=$1
     LIMIT 1`,
    [orderLegacyId],
  );

  const ok = Boolean(
    event?.status === "processed"
    && Number(event?.attempts || 0) >= 1
    && !event?.error
    && event?.result?.stockChangedByOrderProcessor === false
    && order?.order_name === orderName
    && order?.financial_status === "paid"
    && order?.sku === SKU
    && Number(order?.quantity || 0) === 1
    && order?.aif_variant_id
    && order?.is_active === true,
  );

  console.log(JSON.stringify({
    ok,
    webhookResponse: {
      status: response.status,
      body: responseText,
    },
    event: event || null,
    order: order || null,
  }, null, 2));

  if (!ok) process.exitCode = 1;
} finally {
  await pool.end();
}
