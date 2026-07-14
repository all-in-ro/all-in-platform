import { randomUUID } from "node:crypto";

const tokenCache = new Map();

function text(value) {
  return String(value ?? "").trim();
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on", "igen"].includes(text(value).toLowerCase());
}

function clampInt(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function signedInt(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.trunc(parsed);
}

function normalizeSku(value) {
  return text(value).toLowerCase();
}

function envConfig() {
  return {
    enabled: bool(process.env.SHOPIFY_SYNC_ENABLED, false),
    shopDomain: text(process.env.SHOPIFY_SHOP_DOMAIN).replace(/^https?:\/\//i, "").replace(/\/$/, ""),
    clientId: text(process.env.SHOPIFY_CLIENT_ID),
    clientSecret: text(process.env.SHOPIFY_CLIENT_SECRET),
    apiVersion: text(process.env.SHOPIFY_API_VERSION || "2026-07"),
    shopifyCsikszeredaLocationId: text(process.env.SHOPIFY_LOCATION_CSIKSZEREDA_ID),
    shopifyKezdiLocationId: text(process.env.SHOPIFY_LOCATION_KEZDI_ID),
    aifCsikszeredaLocationId: text(process.env.AIF_LOCATION_CSIKSZEREDA_ID),
    aifKezdiLocationId: text(process.env.AIF_LOCATION_KEZDI_ID),
    aifCsikszeredaLocationCode: text(process.env.AIF_LOCATION_CSIKSZEREDA_CODE || "main_warehouse"),
    aifKezdiLocationCode: text(process.env.AIF_LOCATION_KEZDI_CODE || "magazin_targu_secuiesc"),
  };
}

function missingConfig(config = envConfig()) {
  const required = [
    ["SHOPIFY_SHOP_DOMAIN", config.shopDomain],
    ["SHOPIFY_CLIENT_ID", config.clientId],
    ["SHOPIFY_CLIENT_SECRET", config.clientSecret],
    ["SHOPIFY_API_VERSION", config.apiVersion],
    ["SHOPIFY_LOCATION_CSIKSZEREDA_ID", config.shopifyCsikszeredaLocationId],
    ["SHOPIFY_LOCATION_KEZDI_ID", config.shopifyKezdiLocationId],
    ["AIF_LOCATION_CSIKSZEREDA_ID", config.aifCsikszeredaLocationId],
    ["AIF_LOCATION_KEZDI_ID", config.aifKezdiLocationId],
  ];
  return required.filter(([, value]) => !value).map(([name]) => name);
}

export function getAifShopifyPublicConfig() {
  const config = envConfig();
  return {
    enabled: config.enabled,
    shopDomain: config.shopDomain,
    apiVersion: config.apiVersion,
    shopifyLocations: {
      csikszereda: config.shopifyCsikszeredaLocationId,
      kezdi: config.shopifyKezdiLocationId,
    },
    aifLocations: {
      csikszereda: {
        id: config.aifCsikszeredaLocationId,
        code: config.aifCsikszeredaLocationCode,
      },
      kezdi: {
        id: config.aifKezdiLocationId,
        code: config.aifKezdiLocationCode,
      },
    },
    missing: missingConfig(config),
  };
}

async function getAccessToken() {
  const config = envConfig();
  const missing = missingConfig(config).filter((name) => !name.startsWith("SHOPIFY_LOCATION_") && !name.startsWith("AIF_LOCATION_"));
  if (missing.length) {
    throw Object.assign(new Error(`Hiányzó Shopify ENV: ${missing.join(", ")}`), { code: "shopify_config_missing" });
  }

  const cacheKey = `${config.shopDomain}:${config.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const response = await fetch(`https://${config.shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token) {
    throw Object.assign(new Error(body?.error_description || body?.error || `Shopify token HTTP ${response.status}`), {
      code: "shopify_token_failed",
      statusCode: response.status,
    });
  }

  const expiresIn = Math.max(300, Number(body.expires_in || 86_400));
  const token = {
    accessToken: body.access_token,
    scope: text(body.scope),
    expiresAt: Date.now() + expiresIn * 1000,
  };
  tokenCache.set(cacheKey, token);
  return token;
}

export async function shopifyGraphql(query, variables = {}) {
  const config = envConfig();
  const token = await getAccessToken();
  const response = await fetch(`https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": token.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(body?.errors?.[0]?.message || `Shopify GraphQL HTTP ${response.status}`), {
      code: "shopify_graphql_http_error",
      statusCode: response.status,
      payload: body,
    });
  }
  if (Array.isArray(body?.errors) && body.errors.length) {
    throw Object.assign(new Error(body.errors.map((item) => item?.message || String(item)).join(" | ")), {
      code: "shopify_graphql_error",
      payload: body,
    });
  }
  return { data: body?.data || {}, extensions: body?.extensions || null, scope: token.scope };
}

export async function ensureAifShopifyTables(client) {
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_variant_map (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id uuid NOT NULL UNIQUE REFERENCES aif_product_variants(id) ON DELETE CASCADE,
    sku text NOT NULL,
    shopify_product_id text NOT NULL,
    shopify_variant_id text NOT NULL UNIQUE,
    shopify_inventory_item_id text NOT NULL UNIQUE,
    shopify_product_title text NULL,
    shopify_variant_title text NULL,
    shopify_product_status text NULL,
    sync_status text NOT NULL DEFAULT 'mapped',
    last_synced_csikszereda_qty integer NULL,
    last_synced_kezdi_qty integer NULL,
    last_synced_at timestamptz NULL,
    last_error text NULL,
    raw jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS aif_shopify_variant_map_sku_lower_uidx ON aif_shopify_variant_map (lower(sku))`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_variant_map_status_idx ON aif_shopify_variant_map (sync_status, updated_at DESC)`);

  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_sync_outbox (
    variant_id uuid PRIMARY KEY REFERENCES aif_product_variants(id) ON DELETE CASCADE,
    desired_csikszereda_qty integer NOT NULL DEFAULT 0,
    desired_kezdi_qty integer NOT NULL DEFAULT 0,
    reason text NULL,
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    idempotency_key text NOT NULL DEFAULT gen_random_uuid()::text,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    locked_at timestamptz NULL,
    last_error text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (status IN ('pending','processing','done','error','blocked'))
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_sync_outbox_work_idx ON aif_shopify_sync_outbox (status, next_attempt_at, updated_at)`);

  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_webhook_events (
    shopify_webhook_id text PRIMARY KEY,
    topic text NOT NULL,
    shop_domain text NULL,
    status text NOT NULL DEFAULT 'received',
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    error text NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_webhook_events_status_idx ON aif_shopify_webhook_events (status, received_at)`);

  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_sync_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type text NOT NULL,
    status text NOT NULL DEFAULT 'running',
    item_count integer NOT NULL DEFAULT 0,
    success_count integer NOT NULL DEFAULT 0,
    error_count integer NOT NULL DEFAULT 0,
    summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz NULL
  )`);
  return true;
}

async function loadAllInVariants(client) {
  const result = await client.query(`
    SELECT
      v.id::text AS variant_id,
      NULLIF(trim(v.barcode), '') AS sku,
      v.internal_sku,
      v.size,
      v.color_code,
      v.color_name,
      v.status AS variant_status,
      m.id::text AS model_id,
      m.model_code,
      m.title_ro,
      m.status AS model_status,
      b.name AS brand_name
    FROM aif_product_variants v
    JOIN aif_product_models m ON m.id=v.model_id
    LEFT JOIN aif_brands b ON b.id=m.brand_id
    WHERE COALESCE(v.status,'active') <> 'archived'
      AND COALESCE(m.status,'active') <> 'archived'
    ORDER BY b.name ASC NULLS LAST, m.title_ro ASC, v.color_name ASC NULLS LAST, v.size ASC
  `);
  return result.rows;
}

async function loadAllShopifyVariants() {
  const query = `query AifShopifyVariants($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        sku
        barcode
        title
        updatedAt
        inventoryItem { id }
        product { id title status }
      }
    }
  }`;

  const variants = [];
  let after = null;
  for (let page = 0; page < 200; page += 1) {
    const response = await shopifyGraphql(query, { first: 250, after });
    const connection = response.data?.productVariants;
    variants.push(...(connection?.nodes || []));
    if (!connection?.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) break;
  }
  return variants;
}

function groupBySku(rows, skuGetter) {
  const map = new Map();
  for (const row of rows || []) {
    const sku = text(skuGetter(row));
    if (!sku) continue;
    const key = normalizeSku(sku);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function compactAllInVariant(row) {
  return {
    variantId: row.variant_id,
    sku: row.sku,
    title: row.title_ro,
    brand: row.brand_name,
    modelCode: row.model_code,
    color: row.color_name || row.color_code || null,
    size: row.size,
    variantStatus: row.variant_status,
    modelStatus: row.model_status,
  };
}

function compactShopifyVariant(row) {
  return {
    variantId: row.id,
    inventoryItemId: row.inventoryItem?.id || null,
    productId: row.product?.id || null,
    sku: text(row.sku),
    barcode: text(row.barcode) || null,
    title: row.title,
    productTitle: row.product?.title || null,
    productStatus: row.product?.status || null,
  };
}

export async function auditAifShopifySkus(client, options = {}) {
  await ensureAifShopifyTables(client);
  const sampleLimit = Math.min(200, Math.max(1, Number(options.sampleLimit || 30)));
  const [allInVariants, shopifyVariants, mapped] = await Promise.all([
    loadAllInVariants(client),
    loadAllShopifyVariants(),
    client.query(`SELECT variant_id::text, sku, shopify_variant_id, shopify_inventory_item_id, sync_status, last_synced_at, last_error FROM aif_shopify_variant_map ORDER BY updated_at DESC`),
  ]);

  const allInWithSku = allInVariants.filter((row) => text(row.sku));
  const shopifyWithSku = shopifyVariants.filter((row) => text(row.sku));
  const allInBySku = groupBySku(allInWithSku, (row) => row.sku);
  const shopifyBySku = groupBySku(shopifyWithSku, (row) => row.sku);

  const allInDuplicates = [];
  const shopifyDuplicates = [];
  const matches = [];
  const missingInShopify = [];
  const shopifyOnly = [];
  const caseMismatches = [];

  for (const [key, rows] of allInBySku.entries()) {
    if (rows.length > 1) {
      allInDuplicates.push({ sku: rows[0]?.sku || key, items: rows.map(compactAllInVariant) });
      continue;
    }
    const shopRows = shopifyBySku.get(key) || [];
    if (!shopRows.length) {
      missingInShopify.push(compactAllInVariant(rows[0]));
      continue;
    }
    if (shopRows.length > 1) continue;
    const allInRow = rows[0];
    const shopifyRow = shopRows[0];
    if (text(allInRow.sku) !== text(shopifyRow.sku)) {
      caseMismatches.push({ allIn: compactAllInVariant(allInRow), shopify: compactShopifyVariant(shopifyRow) });
    }
    matches.push({ allIn: compactAllInVariant(allInRow), shopify: compactShopifyVariant(shopifyRow) });
  }

  for (const [key, rows] of shopifyBySku.entries()) {
    if (rows.length > 1) {
      shopifyDuplicates.push({ sku: rows[0]?.sku || key, items: rows.map(compactShopifyVariant) });
      continue;
    }
    if (!allInBySku.has(key)) shopifyOnly.push(compactShopifyVariant(rows[0]));
  }

  const matchedKeysBlockedByShopifyDuplicate = new Set(shopifyDuplicates.map((row) => normalizeSku(row.sku)));
  const safeMatches = matches.filter((row) => !matchedKeysBlockedByShopifyDuplicate.has(normalizeSku(row.allIn.sku)));

  return {
    generatedAt: new Date().toISOString(),
    config: getAifShopifyPublicConfig(),
    counts: {
      allInVariants: allInVariants.length,
      allInWithSku: allInWithSku.length,
      allInWithoutSku: allInVariants.length - allInWithSku.length,
      shopifyVariants: shopifyVariants.length,
      shopifyWithSku: shopifyWithSku.length,
      shopifyWithoutSku: shopifyVariants.length - shopifyWithSku.length,
      safeMatches: safeMatches.length,
      allInDuplicateSkus: allInDuplicates.length,
      shopifyDuplicateSkus: shopifyDuplicates.length,
      missingInShopify: missingInShopify.length,
      shopifyOnly: shopifyOnly.length,
      caseMismatches: caseMismatches.length,
      mappedRows: mapped.rowCount,
    },
    safeMatches,
    samples: {
      allInWithoutSku: allInVariants.filter((row) => !text(row.sku)).slice(0, sampleLimit).map(compactAllInVariant),
      allInDuplicates: allInDuplicates.slice(0, sampleLimit),
      shopifyDuplicates: shopifyDuplicates.slice(0, sampleLimit),
      missingInShopify: missingInShopify.slice(0, sampleLimit),
      shopifyOnly: shopifyOnly.slice(0, sampleLimit),
      caseMismatches: caseMismatches.slice(0, sampleLimit),
      mapped: mapped.rows.slice(0, sampleLimit),
    },
  };
}

export async function mapAifShopifyVariants(client, options = {}) {
  const dryRun = options.dryRun !== false;
  const audit = await auditAifShopifySkus(client, options);
  if (dryRun) {
    return {
      dryRun: true,
      mapped: 0,
      wouldMap: audit.safeMatches.length,
      audit,
    };
  }

  let mapped = 0;
  const errors = [];
  await client.query("BEGIN");
  try {
    for (const pair of audit.safeMatches) {
      const allIn = pair.allIn;
      const shopify = pair.shopify;
      if (!shopify.inventoryItemId || !shopify.productId || !shopify.variantId) {
        errors.push({ sku: allIn.sku, error: "Hiányzó Shopify product/variant/inventoryItem ID." });
        continue;
      }
      try {
        await client.query(
          `INSERT INTO aif_shopify_variant_map (
             variant_id, sku, shopify_product_id, shopify_variant_id, shopify_inventory_item_id,
             shopify_product_title, shopify_variant_title, shopify_product_status,
             sync_status, last_error, raw, updated_at
           )
           VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,'mapped',NULL,$9::jsonb,now())
           ON CONFLICT (variant_id) DO UPDATE SET
             sku=EXCLUDED.sku,
             shopify_product_id=EXCLUDED.shopify_product_id,
             shopify_variant_id=EXCLUDED.shopify_variant_id,
             shopify_inventory_item_id=EXCLUDED.shopify_inventory_item_id,
             shopify_product_title=EXCLUDED.shopify_product_title,
             shopify_variant_title=EXCLUDED.shopify_variant_title,
             shopify_product_status=EXCLUDED.shopify_product_status,
             sync_status='mapped',
             last_error=NULL,
             raw=EXCLUDED.raw,
             updated_at=now()`,
          [
            allIn.variantId,
            allIn.sku,
            shopify.productId,
            shopify.variantId,
            shopify.inventoryItemId,
            shopify.productTitle,
            shopify.title,
            shopify.productStatus,
            JSON.stringify({ allIn, shopify }),
          ]
        );
        mapped += 1;
      } catch (error) {
        errors.push({ sku: allIn.sku, error: error?.message || String(error), code: error?.code || null });
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  }

  return {
    dryRun: false,
    mapped,
    errors,
    audit,
  };
}

async function readAifStockQuantities(client, variantId, config = envConfig()) {
  const result = await client.query(
    `SELECT
       COALESCE(sum(CASE WHEN s.location_id::text=$2 THEN GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0) ELSE 0 END),0)::int AS csikszereda_qty,
       COALESCE(sum(CASE WHEN s.location_id::text=$3 THEN GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0) ELSE 0 END),0)::int AS kezdi_qty
     FROM aif_product_variants v
     LEFT JOIN aif_stock s ON s.variant_id=v.id
     WHERE v.id::text=$1`,
    [text(variantId), config.aifCsikszeredaLocationId, config.aifKezdiLocationId]
  );
  const row = result.rows[0] || {};
  return {
    csikszereda: clampInt(row.csikszereda_qty),
    kezdi: clampInt(row.kezdi_qty),
  };
}

export async function enqueueAifShopifyVariant(client, variantId, reason = "stock_change", _options = {}) {
  const config = envConfig();
  const missing = missingConfig(config);
  if (missing.length) return { queued: false, reason: "config_missing", missing };
  await ensureAifShopifyTables(client);

  const mapping = await client.query(`SELECT 1 FROM aif_shopify_variant_map WHERE variant_id::text=$1 LIMIT 1`, [text(variantId)]);
  if (!mapping.rowCount) return { queued: false, reason: "mapping_missing" };

  const quantities = await readAifStockQuantities(client, variantId, config);
  const idempotencyKey = randomUUID();
  await client.query(
    `INSERT INTO aif_shopify_sync_outbox (
       variant_id, desired_csikszereda_qty, desired_kezdi_qty, reason,
       status, attempts, idempotency_key, next_attempt_at, locked_at, last_error, created_at, updated_at
     )
     VALUES ($1::uuid,$2,$3,$4,'pending',0,$5,now(),NULL,NULL,now(),now())
     ON CONFLICT (variant_id) DO UPDATE SET
       desired_csikszereda_qty=EXCLUDED.desired_csikszereda_qty,
       desired_kezdi_qty=EXCLUDED.desired_kezdi_qty,
       reason=EXCLUDED.reason,
       status='pending',
       attempts=0,
       idempotency_key=EXCLUDED.idempotency_key,
       next_attempt_at=now(),
       locked_at=NULL,
       last_error=NULL,
       updated_at=now()`,
    [text(variantId), quantities.csikszereda, quantities.kezdi, text(reason) || "stock_change", idempotencyKey]
  );
  return { queued: true, quantities, idempotencyKey, syncEnabled: config.enabled };
}

export async function enqueueAllMappedAifShopifyVariants(client, reason = "full_sync") {
  const config = envConfig();
  await ensureAifShopifyTables(client);
  if (missingConfig(config).length) {
    return { queued: 0, missing: missingConfig(config) };
  }

  const result = await client.query(
    `INSERT INTO aif_shopify_sync_outbox (
       variant_id, desired_csikszereda_qty, desired_kezdi_qty, reason,
       status, attempts, idempotency_key, next_attempt_at, locked_at, last_error, created_at, updated_at
     )
     SELECT
       m.variant_id,
       COALESCE(sum(CASE WHEN s.location_id::text=$1 THEN GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0) ELSE 0 END),0)::int,
       COALESCE(sum(CASE WHEN s.location_id::text=$2 THEN GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0) ELSE 0 END),0)::int,
       $3,
       'pending',
       0,
       gen_random_uuid()::text,
       now(),
       NULL,
       NULL,
       now(),
       now()
     FROM aif_shopify_variant_map m
     LEFT JOIN aif_stock s ON s.variant_id=m.variant_id
     GROUP BY m.variant_id
     ON CONFLICT (variant_id) DO UPDATE SET
       desired_csikszereda_qty=EXCLUDED.desired_csikszereda_qty,
       desired_kezdi_qty=EXCLUDED.desired_kezdi_qty,
       reason=EXCLUDED.reason,
       status=EXCLUDED.status,
       attempts=0,
       idempotency_key=EXCLUDED.idempotency_key,
       next_attempt_at=now(),
       locked_at=NULL,
       last_error=EXCLUDED.last_error,
       updated_at=now()
     RETURNING variant_id`,
    [config.aifCsikszeredaLocationId, config.aifKezdiLocationId, text(reason) || "full_sync"]
  );
  return { queued: result.rowCount, status: "pending", syncEnabled: config.enabled };
}

async function inventoryLevels(inventoryItemId) {
  const query = `query AifInventoryLevels($id: ID!) {
    inventoryItem(id: $id) {
      id
      inventoryLevels(first: 100) {
        nodes {
          id
          location { id name }
          quantities(names: ["available"]) { name quantity }
        }
      }
    }
  }`;
  const response = await shopifyGraphql(query, { id: inventoryItemId });
  return response.data?.inventoryItem?.inventoryLevels?.nodes || [];
}

async function activateMissingLocations(inventoryItemId, requiredLocationIds) {
  const levels = await inventoryLevels(inventoryItemId);
  const existing = new Set(levels.map((row) => text(row.location?.id)).filter(Boolean));
  const missing = requiredLocationIds.filter((id) => id && !existing.has(id));
  if (!missing.length) return levels;

  const mutation = `mutation AifInventoryActivate($inventoryItemId: ID!, $updates: [InventoryBulkToggleActivationInput!]!) {
    inventoryBulkToggleActivation(inventoryItemId: $inventoryItemId, inventoryItemUpdates: $updates) {
      inventoryItem { id }
      inventoryLevels { id location { id name } quantities(names: ["available"]) { name quantity } }
      userErrors { field message code }
    }
  }`;
  const response = await shopifyGraphql(mutation, {
    inventoryItemId,
    updates: missing.map((locationId) => ({ locationId, activate: true })),
  });
  const payload = response.data?.inventoryBulkToggleActivation;
  if (payload?.userErrors?.length) {
    throw Object.assign(new Error(payload.userErrors.map((row) => row.message).join(" | ")), {
      code: "shopify_inventory_activation_failed",
      payload,
    });
  }
  return inventoryLevels(inventoryItemId);
}

function availableQuantity(level) {
  const item = (level?.quantities || []).find((row) => row?.name === "available");
  return signedInt(item?.quantity);
}

async function setInventoryQuantities({ inventoryItemId, csikszeredaQty, kezdiQty, idempotencyKey, referenceId }) {
  const config = envConfig();
  const locationIds = [config.shopifyCsikszeredaLocationId, config.shopifyKezdiLocationId];
  const levels = await activateMissingLocations(inventoryItemId, locationIds);
  const byLocation = new Map(levels.map((row) => [text(row.location?.id), row]));
  const quantities = [
    {
      inventoryItemId,
      locationId: config.shopifyCsikszeredaLocationId,
      quantity: clampInt(csikszeredaQty),
      changeFromQuantity: availableQuantity(byLocation.get(config.shopifyCsikszeredaLocationId)),
    },
    {
      inventoryItemId,
      locationId: config.shopifyKezdiLocationId,
      quantity: clampInt(kezdiQty),
      changeFromQuantity: availableQuantity(byLocation.get(config.shopifyKezdiLocationId)),
    },
  ];

  const mutation = `mutation AifInventorySet($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      inventoryAdjustmentGroup { createdAt reason referenceDocumentUri changes { name delta quantityAfterChange } }
      userErrors { field message code }
    }
  }`;
  const response = await shopifyGraphql(mutation, {
    input: {
      name: "available",
      reason: "correction",
      referenceDocumentUri: `gid://allinfashion/InventorySync/${referenceId}`,
      quantities,
    },
    idempotencyKey,
  });
  const payload = response.data?.inventorySetQuantities;
  if (payload?.userErrors?.length) {
    throw Object.assign(new Error(payload.userErrors.map((row) => row.message).join(" | ")), {
      code: "shopify_inventory_set_failed",
      payload,
    });
  }
  return { payload, quantities };
}

async function claimOutboxRows(pool, limit) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureAifShopifyTables(client);
    const result = await client.query(
      `WITH picked AS (
         SELECT variant_id
         FROM aif_shopify_sync_outbox
         WHERE (
           (status IN ('pending','error') AND next_attempt_at <= now())
           OR
           (status='processing' AND locked_at < now() - interval '10 minutes')
         )
         ORDER BY updated_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE aif_shopify_sync_outbox o
       SET status='processing',
           locked_at=now(),
           attempts=o.attempts+1,
           idempotency_key=CASE
             WHEN o.status='processing' THEN gen_random_uuid()::text
             ELSE o.idempotency_key
           END,
           updated_at=now()
       FROM picked
       WHERE o.variant_id=picked.variant_id
       RETURNING o.*`,
      [Math.min(100, Math.max(1, Number(limit || 20)))]
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
  return Math.min(3600, Math.max(15, 15 * (2 ** Math.min(8, Math.max(0, Number(attempts || 1) - 1)))));
}

export async function processAifShopifyOutboxBatch(pool, options = {}) {
  const config = envConfig();
  if (!config.enabled) return { enabled: false, processed: 0, success: 0, errors: 0, message: "SHOPIFY_SYNC_ENABLED=false" };
  const missing = missingConfig(config);
  if (missing.length) throw Object.assign(new Error(`Hiányzó Shopify ENV: ${missing.join(", ")}`), { code: "shopify_config_missing" });

  const rows = await claimOutboxRows(pool, options.limit || 20);
  let success = 0;
  let superseded = 0;
  const errors = [];

  for (const row of rows) {
    const client = await pool.connect();
    try {
      const mapping = await client.query(
        `SELECT * FROM aif_shopify_variant_map WHERE variant_id=$1 LIMIT 1`,
        [row.variant_id]
      );
      if (!mapping.rowCount) throw Object.assign(new Error("Nincs Shopify variánstérkép ehhez az AllIn variánshoz."), { code: "shopify_mapping_missing" });
      const map = mapping.rows[0];
      const result = await setInventoryQuantities({
        inventoryItemId: map.shopify_inventory_item_id,
        csikszeredaQty: row.desired_csikszereda_qty,
        kezdiQty: row.desired_kezdi_qty,
        idempotencyKey: row.idempotency_key,
        referenceId: row.idempotency_key,
      });

      await client.query("BEGIN");
      const completed = await client.query(
        `UPDATE aif_shopify_sync_outbox
         SET status='done', locked_at=NULL, last_error=NULL, updated_at=now()
         WHERE variant_id=$1
           AND idempotency_key=$2
           AND status='processing'
         RETURNING variant_id`,
        [row.variant_id, row.idempotency_key]
      );
      if (completed.rowCount) {
        await client.query(
          `UPDATE aif_shopify_variant_map
           SET last_synced_csikszereda_qty=$2,
               last_synced_kezdi_qty=$3,
               last_synced_at=now(),
               sync_status='synced',
               last_error=NULL,
               raw=COALESCE(raw,'{}'::jsonb) || $4::jsonb,
               updated_at=now()
           WHERE variant_id=$1`,
          [row.variant_id, row.desired_csikszereda_qty, row.desired_kezdi_qty, JSON.stringify({ lastInventorySet: result })]
        );
        success += 1;
      } else {
        superseded += 1;
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      const message = error?.message || String(error);
      const delay = retryDelaySeconds(row.attempts);
      const failed = await client.query(
        `UPDATE aif_shopify_sync_outbox
         SET status='error',
             locked_at=NULL,
             last_error=$3,
             idempotency_key=gen_random_uuid()::text,
             next_attempt_at=now()+($4::text || ' seconds')::interval,
             updated_at=now()
         WHERE variant_id=$1
           AND idempotency_key=$2
           AND status='processing'
         RETURNING variant_id`,
        [row.variant_id, row.idempotency_key, message.slice(0, 4000), delay]
      );
      if (failed.rowCount) {
        await client.query(
          `UPDATE aif_shopify_variant_map
           SET sync_status='error', last_error=$2, updated_at=now()
           WHERE variant_id=$1`,
          [row.variant_id, message.slice(0, 4000)]
        );
        errors.push({ variantId: row.variant_id, error: message, code: error?.code || null, retryInSeconds: delay });
      } else {
        superseded += 1;
      }
    } finally {
      client.release();
    }
  }

  return {
    enabled: true,
    processed: rows.length,
    success,
    errors: errors.length,
    superseded,
    errorItems: errors,
  };
}

export async function getAifShopifyStatus(client) {
  await ensureAifShopifyTables(client);
  const config = envConfig();
  const publicConfig = getAifShopifyPublicConfig();
  const [db, remote] = await Promise.all([
    client.query(`SELECT
      (SELECT count(*)::int FROM aif_shopify_variant_map) AS mapped,
      (SELECT count(*)::int FROM aif_shopify_sync_outbox WHERE status='pending') AS pending,
      (SELECT count(*)::int FROM aif_shopify_sync_outbox WHERE status='processing') AS processing,
      (SELECT count(*)::int FROM aif_shopify_sync_outbox WHERE status='error') AS errors,
      (SELECT count(*)::int FROM aif_shopify_sync_outbox WHERE status='blocked') AS blocked,
      (SELECT count(*)::int FROM aif_shopify_sync_outbox WHERE status='done') AS done,
      (SELECT count(*)::int FROM aif_shopify_sync_outbox WHERE status='processing' AND locked_at < now() - interval '10 minutes') AS stale_processing,
      (SELECT EXISTS(
         SELECT 1
         FROM pg_trigger
         WHERE tgname='aif_shopify_stock_outbox_trg'
           AND NOT tgisinternal
       )) AS stock_trigger_installed,
      (SELECT EXISTS(
         SELECT 1
         FROM pg_trigger
         WHERE tgname='aif_shopify_variant_map_outbox_trg'
           AND NOT tgisinternal
       )) AS mapping_trigger_installed`),
    publicConfig.missing.length
      ? Promise.resolve(null)
      : shopifyGraphql(`query AifShopifyStatus {
          shop { id name myshopifyDomain }
          locations(first: 50) { nodes { id name isActive address { city address1 } } }
        }`),
  ]);

  const locationById = new Map((remote?.data?.locations?.nodes || []).map((row) => [text(row.id), row]));
  return {
    ok: publicConfig.missing.length === 0 && Boolean(remote?.data?.shop),
    config: publicConfig,
    shop: remote?.data?.shop || null,
    scope: remote?.scope || null,
    locations: {
      csikszereda: locationById.get(config.shopifyCsikszeredaLocationId) || null,
      kezdi: locationById.get(config.shopifyKezdiLocationId) || null,
      all: remote?.data?.locations?.nodes || [],
    },
    database: db.rows[0] || {},
  };
}

export async function listAifShopifyMappings(client, options = {}) {
  await ensureAifShopifyTables(client);
  const limit = Math.min(1000, Math.max(1, Number(options.limit || 200)));
  const result = await client.query(
    `SELECT m.*, v.barcode, v.size, v.color_code, v.color_name,
            pm.title_ro, pm.model_code, b.name AS brand_name,
            o.desired_csikszereda_qty, o.desired_kezdi_qty,
            o.status AS outbox_status, o.attempts, o.next_attempt_at, o.last_error AS outbox_error
     FROM aif_shopify_variant_map m
     JOIN aif_product_variants v ON v.id=m.variant_id
     JOIN aif_product_models pm ON pm.id=v.model_id
     LEFT JOIN aif_brands b ON b.id=pm.brand_id
     LEFT JOIN aif_shopify_sync_outbox o ON o.variant_id=m.variant_id
     ORDER BY m.updated_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
