import { shopifyGraphql } from "../api/lib/aifShopify.js";

function text(value) {
  return String(value ?? "").trim();
}

function callbackUrl() {
  const explicit = text(process.env.SHOPIFY_INVENTORY_WEBHOOK_URL);
  if (explicit) return explicit;
  const base = text(process.env.RENDER_EXTERNAL_URL).replace(/\/+$/, "");
  if (!base) {
    throw new Error("Hiányzik a RENDER_EXTERNAL_URL vagy a SHOPIFY_INVENTORY_WEBHOOK_URL ENV.");
  }
  return `${base}/api/aif/shopify/webhooks/inventory-levels-update`;
}

const apply = process.argv.includes("--apply");
const uri = callbackUrl();

const currentResponse = await shopifyGraphql(`query AifWebhookSubscriptions {
  webhookSubscriptions(first: 100) {
    nodes { id topic uri format }
  }
}`);
const all = currentResponse.data?.webhookSubscriptions?.nodes || [];
const matchingTopic = all.filter((row) => row.topic === "INVENTORY_LEVELS_UPDATE");
const exact = matchingTopic.find((row) => row.uri === uri);

if (!apply) {
  console.log(JSON.stringify({
    dryRun: true,
    callbackUrl: uri,
    exactSubscriptionExists: Boolean(exact),
    current: matchingTopic,
  }, null, 2));
  console.log("Mentéshez: node jobs/aif_shopify_webhooks.mjs --apply");
  process.exit(0);
}

if (exact) {
  console.log(JSON.stringify({
    dryRun: false,
    action: "unchanged",
    callbackUrl: uri,
    subscription: exact,
  }, null, 2));
  process.exit(0);
}

let result;
if (matchingTopic.length) {
  const target = matchingTopic[0];
  result = await shopifyGraphql(`mutation AifWebhookUpdate($id: ID!, $input: WebhookSubscriptionInput!) {
    webhookSubscriptionUpdate(id: $id, webhookSubscription: $input) {
      webhookSubscription { id topic uri format }
      userErrors { field message }
    }
  }`, {
    id: target.id,
    input: { uri, format: "JSON" },
  });
  const payload = result.data?.webhookSubscriptionUpdate;
  if (payload?.userErrors?.length) {
    throw new Error(payload.userErrors.map((row) => row.message).join(" | "));
  }
  console.log(JSON.stringify({
    dryRun: false,
    action: "updated",
    callbackUrl: uri,
    subscription: payload?.webhookSubscription || null,
    duplicateTopicSubscriptions: matchingTopic.slice(1),
  }, null, 2));
} else {
  result = await shopifyGraphql(`mutation AifWebhookCreate($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) {
      webhookSubscription { id topic uri format }
      userErrors { field message }
    }
  }`, {
    topic: "INVENTORY_LEVELS_UPDATE",
    input: { uri, format: "JSON" },
  });
  const payload = result.data?.webhookSubscriptionCreate;
  if (payload?.userErrors?.length) {
    throw new Error(payload.userErrors.map((row) => row.message).join(" | "));
  }
  console.log(JSON.stringify({
    dryRun: false,
    action: "created",
    callbackUrl: uri,
    subscription: payload?.webhookSubscription || null,
  }, null, 2));
}
