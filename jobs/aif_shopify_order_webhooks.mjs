import { shopifyGraphql } from "../api/lib/aifShopify.js";

function text(value) {
  return String(value ?? "").trim();
}

function callbackUrl() {
  const explicit = text(process.env.SHOPIFY_ORDER_WEBHOOK_URL);
  if (explicit) return explicit;
  const base = text(process.env.RENDER_EXTERNAL_URL).replace(/\/+$/, "");
  if (!base) {
    throw new Error("Hiányzik a RENDER_EXTERNAL_URL vagy a SHOPIFY_ORDER_WEBHOOK_URL ENV.");
  }
  return `${base}/api/aif/shopify/webhooks/orders`;
}

const TOPICS = [
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "ORDERS_PAID",
  "ORDERS_FULFILLED",
  "ORDERS_PARTIALLY_FULFILLED",
  "REFUNDS_CREATE",
];

const apply = process.argv.includes("--apply");
const uri = callbackUrl();

const currentResponse = await shopifyGraphql(`query AifOrderWebhookSubscriptions {
  webhookSubscriptions(first: 250) {
    nodes { id topic uri format }
  }
}`);
const all = currentResponse.data?.webhookSubscriptions?.nodes || [];

const plan = TOPICS.map((topic) => {
  const matches = all.filter((row) => row.topic === topic);
  const exact = matches.find((row) => row.uri === uri);
  return {
    topic,
    action: exact ? "unchanged" : matches.length ? "update" : "create",
    exact: exact || null,
    current: matches,
  };
});

if (!apply) {
  console.log(JSON.stringify({
    dryRun: true,
    callbackUrl: uri,
    plan: plan.map((item) => ({
      topic: item.topic,
      action: item.action,
      current: item.current,
    })),
  }, null, 2));
  console.log("Mentéshez: node jobs/aif_shopify_order_webhooks.mjs --apply");
  process.exit(0);
}

const results = [];
for (const item of plan) {
  if (item.action === "unchanged") {
    results.push({ topic: item.topic, action: "unchanged", subscription: item.exact });
    continue;
  }

  if (item.action === "update") {
    const target = item.current[0];
    const response = await shopifyGraphql(`mutation AifOrderWebhookUpdate($id: ID!, $input: WebhookSubscriptionInput!) {
      webhookSubscriptionUpdate(id: $id, webhookSubscription: $input) {
        webhookSubscription { id topic uri format }
        userErrors { field message }
      }
    }`, {
      id: target.id,
      input: { uri, format: "JSON" },
    });
    const payload = response.data?.webhookSubscriptionUpdate;
    if (payload?.userErrors?.length) {
      throw new Error(`${item.topic}: ${payload.userErrors.map((row) => row.message).join(" | ")}`);
    }
    results.push({
      topic: item.topic,
      action: "updated",
      subscription: payload?.webhookSubscription || null,
      duplicateTopicSubscriptions: item.current.slice(1),
    });
    continue;
  }

  const response = await shopifyGraphql(`mutation AifOrderWebhookCreate($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) {
      webhookSubscription { id topic uri format }
      userErrors { field message }
    }
  }`, {
    topic: item.topic,
    input: { uri, format: "JSON" },
  });
  const payload = response.data?.webhookSubscriptionCreate;
  if (payload?.userErrors?.length) {
    throw new Error(`${item.topic}: ${payload.userErrors.map((row) => row.message).join(" | ")}`);
  }
  results.push({
    topic: item.topic,
    action: "created",
    subscription: payload?.webhookSubscription || null,
  });
}

console.log(JSON.stringify({
  dryRun: false,
  callbackUrl: uri,
  results,
}, null, 2));
