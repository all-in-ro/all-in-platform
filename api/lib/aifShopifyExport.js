import { randomUUID } from "node:crypto";
import {
  ensureAifShopifyTables,
  enqueueAifShopifyVariant,
  getAifShopifyStatus,
  shopifyGraphql,
} from "./aifShopify.js";

const PRODUCT_HEADERS = [
  "Title",
  "URL handle",
  "Description",
  "Vendor",
  "Product category",
  "Type",
  "Tags",
  "Published on online store",
  "Status",
  "SKU",
  "Barcode",
  "Option1 name",
  "Option1 value",
  "Option1 Linked To",
  "Option2 name",
  "Option2 value",
  "Option2 Linked To",
  "Option3 name",
  "Option3 value",
  "Option3 Linked To",
  "Price",
  "Compare-at price",
  "Cost per item",
  "Charge tax",
  "Tax code",
  "Unit price total measure",
  "Unit price total measure unit",
  "Unit price base measure",
  "Unit price base measure unit",
  "Inventory tracker",
  "Inventory quantity",
  "Continue selling when out of stock",
  "Weight value (grams)",
  "Weight unit for display",
  "Requires shipping",
  "Fulfillment service",
  "Product image URL",
  "Image position",
  "Image alt text",
  "Variant image URL",
  "Gift card",
  "SEO title",
  "SEO description",
  "Color (product.metafields.shopify.color-pattern)",
  "Google Shopping / Google product category",
  "Google Shopping / Gender",
  "Google Shopping / Age group",
  "Google Shopping / Manufacturer part number (MPN)",
  "Google Shopping / Ad group name",
  "Google Shopping / Ads labels",
  "Google Shopping / Condition",
  "Google Shopping / Custom product",
  "Google Shopping / Custom label 0",
  "Google Shopping / Custom label 1",
  "Google Shopping / Custom label 2",
  "Google Shopping / Custom label 3",
  "Google Shopping / Custom label 4",
  "Collection",
];

let exportSchemaEnsured = false;
let exportSchemaPromise = null;

const INVENTORY_HEADERS = [
  "Handle",
  "Title",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "SKU",
  "HS Code",
  "COO",
  "Location",
  "Bin name",
  "Incoming (not editable)",
  "Unavailable (not editable)",
  "Committed (not editable)",
  "Available (not editable)",
  "On hand (current)",
  "On hand (new)",
];

function text(value) {
  return String(value ?? "").trim();
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function decimal(value) {
  if (value === undefined || value === null || text(value) === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on", "igen", "da"].includes(text(value).toLowerCase());
}

function normalizeKey(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slug(value) {
  return normalizeKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function csvCell(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function csvFromRows(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row?.[header] ?? "")).join(","));
  }
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

function htmlEscape(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainText(value) {
  return text(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const clean = text(value);
    if (!clean) continue;
    const key = normalizeKey(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function tagValue(value) {
  return normalizeKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function price(value) {
  const parsed = decimal(value);
  return parsed === null ? "" : parsed.toFixed(2);
}

function shopifyGender(value) {
  const key = normalizeKey(value);
  if (["men", "male", "masculin", "barbati", "barbat", "ferfi"].includes(key)) return "male";
  if (["women", "female", "feminin", "femei", "femeie", "noi", "no"].includes(key)) return "female";
  return "unisex";
}

function shopifyAgeGroup(value) {
  const key = normalizeKey(value);
  return ["kids", "kid", "copii", "copil", "gyerek", "junior", "youth", "children"].includes(key)
    ? "kids"
    : "adult";
}

function productCategory(row) {
  const haystack = normalizeKey([
    row.category_name_ro,
    row.category_name_hu,
    row.category_code,
    row.subcategory_name_ro,
    row.subcategory_name_hu,
    row.subcategory_code,
    row.product_type,
  ].filter(Boolean).join(" "));

  if (/shoe|shoes|cip[oő]|pantof|incalt|incălț|sneaker|sportcip/.test(haystack)) {
    return "Apparel & Accessories > Shoes";
  }
  if (/jacket|dzseki|kab[aá]t|geaca|palton|outerwear/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets";
  }
  if (/t-?shirt|p[oó]l[oó]|tricou/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts";
  }
  if (/shirt|bluz|top|fels[oő]|camasa|cămaș/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Clothing Tops";
  }
  if (/pants|trouser|nadr[aá]g|pantalon/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Pants";
  }
  if (/short|r[oö]vidnadr[aá]g/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Shorts";
  }
  if (/dress|ruha|rochie/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Dresses";
  }
  if (/skirt|szoknya|fusta|fustă/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Skirts";
  }
  if (/sock|zokni|soset|șoset/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Underwear & Socks > Socks";
  }
  if (/cap|hat|sapka|kalap|caciul|căciul/.test(haystack)) {
    return "Apparel & Accessories > Clothing Accessories > Headwear";
  }
  if (/bag|taska|t[aá]ska|geant|rucsac/.test(haystack)) {
    return "Apparel & Accessories > Handbags, Wallets & Cases";
  }
  if (/accessor|kieg[eé]sz[ií]t/.test(haystack)) {
    return "Apparel & Accessories > Clothing Accessories";
  }
  if (/clothing|ruhazat|ruh[aá]zat|imbracaminte|îmbrăcăminte/.test(haystack)) {
    return "Apparel & Accessories > Clothing";
  }
  return "";
}

function descriptionHtml(row) {
  const blocks = [];
  if (text(row.description_ro)) {
    blocks.push(`<div>${htmlEscape(row.description_ro).replace(/\r?\n/g, "<br>")}</div>`);
  }
  const details = [];
  if (text(row.material)) details.push(`<li><strong>Compoziție:</strong> ${htmlEscape(row.material)}</li>`);
  if (text(row.season)) details.push(`<li><strong>Sezon:</strong> ${htmlEscape(row.season)}</li>`);
  if (text(row.product_type)) details.push(`<li><strong>Tip produs:</strong> ${htmlEscape(row.product_type)}</li>`);
  if (details.length) blocks.push(`<ul>${details.join("")}</ul>`);
  return blocks.join("\n");
}

function buildTags(row) {
  return unique([
    "allinfashion",
    row.brand_name,
    row.category_name_ro,
    row.subcategory_name_ro,
    row.product_type,
    row.gender,
    row.season,
    row.color_name,
  ].map(tagValue).filter(Boolean)).join(", ");
}

function imageFromRow(row) {
  const direct = text(row.image_url);
  if (direct) return direct;
  const images = row.images;
  if (Array.isArray(images)) {
    const found = images.map((item) => typeof item === "string" ? item : item?.url || item?.src).find((item) => text(item));
    return text(found);
  }
  if (images && typeof images === "object") {
    return text(images.url || images.src || images[0]);
  }
  return "";
}

function variantSku(row) {
  return text(row.barcode);
}

function productCode(row) {
  return text(row.supplier_product_code || row.model_code || row.internal_sku);
}

function validationForRow(row) {
  const errors = [];
  const warnings = [];
  const sku = variantSku(row);
  const title = text(row.shopify_title || row.title_ro);
  const image = imageFromRow(row);
  const sellPrice = decimal(row.sell_price);

  if (!title) errors.push("Hiányzik a román terméknév / Shopify cím.");
  if (!sku) errors.push("Hiányzik a vonalkód, amely a Shopify SKU alapja.");
  if (!text(row.size)) errors.push("Hiányzik a méret.");
  if (!text(row.color_name || row.color_code)) errors.push("Hiányzik a szín.");
  if (sellPrice === null || sellPrice <= 0) errors.push("Hiányzik vagy hibás az eladási ár.");
  if (!image) errors.push("Hiányzik a nyilvános kép URL.");
  if (!/^https:\/\//i.test(image)) errors.push("A kép URL-nek nyilvános HTTPS címnek kell lennie.");
  if (normalizeKey(row.variant_status || "active") !== "active") errors.push("A variáns nem aktív.");
  if (normalizeKey(row.model_status || "active") !== "active") errors.push("A modell nem aktív.");

  if (!text(row.description_ro)) warnings.push("Nincs román leírás.");
  if (!text(row.material)) warnings.push("Nincs anyagösszetétel.");
  if (!text(row.brand_name)) warnings.push("Nincs márka.");
  if (!text(row.category_name_ro || row.category_code)) warnings.push("Nincs főkategória.");
  if (!text(row.subcategory_name_ro || row.product_type)) warnings.push("Nincs alkategória / terméktípus.");
  if (decimal(row.buy_price) === null) warnings.push("Nincs vételár / Cost per item.");
  if (!text(row.customs_tariff_code)) warnings.push("Nincs vámtarifa / HS kód.");
  if (integer(row.export_available_qty, 0) <= 0) warnings.push("A jelenlegi elérhető készlet 0.");
  if (row.shopify_mapped) warnings.push("A variáns már Shopifyhoz van kapcsolva.");

  return { errors, warnings };
}

export async function ensureAifShopifyExportSchema(client) {
  if (exportSchemaEnsured) return true;
  if (exportSchemaPromise) return exportSchemaPromise;

  exportSchemaPromise = (async () => {
  await ensureAifShopifyTables(client);
  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_product_exports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status text NOT NULL DEFAULT 'prepared',
    selection_mode text NOT NULL DEFAULT 'all_model_variants',
    product_status text NOT NULL DEFAULT 'draft',
    shopify_location_id text NULL,
    shopify_location_name text NULL,
    model_count integer NOT NULL DEFAULT 0,
    variant_count integer NOT NULL DEFAULT 0,
    valid_variant_count integer NOT NULL DEFAULT 0,
    invalid_variant_count integer NOT NULL DEFAULT 0,
    warning_count integer NOT NULL DEFAULT 0,
    created_by text NULL,
    summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    downloaded_at timestamptz NULL,
    reconciled_at timestamptz NULL,
    CHECK (status IN ('prepared','downloaded','partially_mapped','mapped','error')),
    CHECK (selection_mode IN ('selected_variants','all_model_variants')),
    CHECK (product_status IN ('draft','active'))
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_product_exports_created_idx
    ON aif_shopify_product_exports (created_at DESC)`);
  await client.query(`CREATE TABLE IF NOT EXISTS aif_shopify_product_export_items (
    export_id uuid NOT NULL REFERENCES aif_shopify_product_exports(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES aif_product_variants(id) ON DELETE CASCADE,
    model_id uuid NOT NULL REFERENCES aif_product_models(id) ON DELETE CASCADE,
    handle text NOT NULL,
    sku text NULL,
    item_status text NOT NULL DEFAULT 'exported_pending',
    validation_errors text[] NOT NULL DEFAULT '{}'::text[],
    validation_warnings text[] NOT NULL DEFAULT '{}'::text[],
    product_row jsonb NULL,
    inventory_row jsonb NULL,
    snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    mapped_at timestamptz NULL,
    PRIMARY KEY (export_id, variant_id),
    CHECK (item_status IN ('exported_pending','invalid','mapped','error','skipped_mapped'))
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_product_export_items_variant_idx
    ON aif_shopify_product_export_items (variant_id, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS aif_shopify_product_export_items_status_idx
    ON aif_shopify_product_export_items (item_status, created_at DESC)`);

  // A régi adatbázisokon a constraint neve eltérhet. A két gyakori nevet levesszük,
  // majd egyetlen, stabil constraintet rakunk vissza.
  await client.query(`ALTER TABLE IF EXISTS aif_user_selected_variants
    DROP CONSTRAINT IF EXISTS aif_user_selected_variants_action_check`);
  await client.query(`ALTER TABLE IF EXISTS aif_user_selected_variants
    DROP CONSTRAINT IF EXISTS aif_user_selected_variants_check`);
  try {
    await client.query(`ALTER TABLE IF EXISTS aif_user_selected_variants
      ADD CONSTRAINT aif_user_selected_variants_action_check
      CHECK (action IS NULL OR action IN ('label','order','move','shopify'))`);
  } catch (error) {
    if (error?.code !== "42710") throw error;
  }
    exportSchemaEnsured = true;
    return true;
  })().finally(() => {
    exportSchemaPromise = null;
  });

  return exportSchemaPromise;
}

async function loadExportCandidates(client, variantIds, selectionMode) {
  const ids = unique((variantIds || []).map(text)).slice(0, 1000);
  if (!ids.length) return [];

  const selectedModels = await client.query(
    `SELECT DISTINCT model_id
     FROM aif_product_variants
     WHERE id::text = ANY($1::text[])`,
    [ids]
  );
  const modelIds = selectedModels.rows.map((row) => row.model_id).filter(Boolean);
  if (!modelIds.length) return [];

  const where = selectionMode === "selected_variants"
    ? `v.id::text = ANY($1::text[])`
    : `v.model_id = ANY($2::uuid[])`;

  const result = await client.query(
    `SELECT
       v.id::text AS variant_id,
       v.model_id::text AS model_id,
       v.internal_sku,
       NULLIF(trim(v.barcode),'') AS barcode,
       v.sn_cod,
       v.color_code,
       v.color_name,
       v.color_hex,
       v.size,
       v.buy_price,
       v.sell_price,
       v.compare_at_price,
       v.weight_grams,
       v.image_url,
       v.images,
       v.attributes,
       v.status AS variant_status,
       m.model_code,
       m.title_ro,
       m.title_hu,
       m.description_ro,
       m.gender,
       m.product_type,
       m.season,
       m.material,
       m.shopify_title,
       m.status AS model_status,
       b.name AS brand_name,
       b.code AS brand_code,
       c.name_ro AS category_name_ro,
       c.name_hu AS category_name_hu,
       c.code AS category_code,
       subc.name_ro AS subcategory_name_ro,
       subc.name_hu AS subcategory_name_hu,
       subc.code AS subcategory_code,
       sc.supplier_product_code,
       sc.supplier_variant_code,
       sc.supplier_color_code,
       sc.supplier_size,
       COALESCE(
         v.attributes->>'customsTariffCode',
         v.attributes->>'customs_tariff_code',
         v.attributes->>'tariffCode',
         v.attributes->>'tariff_code',
         v.attributes->>'hsCode',
         v.attributes->>'hs_code'
       ) AS customs_tariff_code,
       COALESCE(sum(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0))
         FILTER (WHERE COALESCE(l.code,'') <> 'online_shop'),0)::int AS export_available_qty,
       COALESCE(sum(COALESCE(s.qty,0)) FILTER (WHERE COALESCE(l.code,'') <> 'online_shop'),0)::int AS total_qty,
       COALESCE(sum(COALESCE(s.reserved_qty,0)) FILTER (WHERE COALESCE(l.code,'') <> 'online_shop'),0)::int AS reserved_qty,
       (svm.variant_id IS NOT NULL) AS shopify_mapped,
       svm.shopify_product_id,
       svm.shopify_variant_id,
       svm.shopify_inventory_item_id,
       svm.shopify_product_title,
       svm.shopify_variant_title,
       svm.sync_status AS shopify_sync_status
     FROM aif_product_variants v
     JOIN aif_product_models m ON m.id=v.model_id
     LEFT JOIN aif_brands b ON b.id=m.brand_id
     LEFT JOIN aif_categories c ON c.id=m.category_id
     LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
     LEFT JOIN LATERAL (
       SELECT supplier_product_code, supplier_variant_code, supplier_color_code, supplier_size
       FROM aif_variant_supplier_codes sc
       WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
       ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
       LIMIT 1
     ) sc ON true
     LEFT JOIN aif_stock s ON s.variant_id=v.id
     LEFT JOIN aif_locations l ON l.id=s.location_id
     LEFT JOIN aif_shopify_variant_map svm ON svm.variant_id=v.id
     WHERE ${where}
       AND COALESCE(v.status,'active') <> 'archived'
       AND COALESCE(m.status,'active') <> 'archived'
     GROUP BY v.id, m.id, b.id, c.id, subc.id,
              sc.supplier_product_code, sc.supplier_variant_code, sc.supplier_color_code, sc.supplier_size,
              svm.variant_id, svm.shopify_product_id, svm.shopify_variant_id, svm.shopify_inventory_item_id,
              svm.shopify_product_title, svm.shopify_variant_title, svm.sync_status
     ORDER BY COALESCE(b.name,''), m.title_ro, v.color_name, v.size`,
    [ids, modelIds]
  );
  return result.rows;
}

function handlesForRows(rows) {
  const baseByModel = new Map();
  const used = new Set();
  for (const row of rows) {
    if (baseByModel.has(row.model_id)) continue;
    let handle = slug([row.brand_name, productCode(row) || row.model_code || row.shopify_title || row.title_ro].filter(Boolean).join("-"));
    if (!handle) handle = `allin-${text(row.model_id).slice(0, 8)}`;
    if (used.has(handle)) handle = `${handle}-${text(row.model_id).replace(/-/g, "").slice(0, 8)}`;
    used.add(handle);
    baseByModel.set(row.model_id, handle);
  }
  return baseByModel;
}

async function prepareExport(client, options = {}) {
  await ensureAifShopifyExportSchema(client);
  const selectionMode = options.selectionMode === "selected_variants" ? "selected_variants" : "all_model_variants";
  const productStatus = options.productStatus === "active" ? "active" : "draft";
  const includeMapped = bool(options.includeMapped, false);
  const rows = await loadExportCandidates(client, options.variantIds, selectionMode);
  const status = await getAifShopifyStatus(client);
  const location = status?.locations?.csikszereda || null;
  const locationName = text(location?.name);
  const locationId = text(location?.id || status?.config?.shopifyLocations?.csikszereda);
  if (!locationName) {
    throw Object.assign(new Error("A Shopify Miercurea Ciuc helyszín pontos neve nem kérdezhető le."), {
      code: "shopify_location_name_missing",
    });
  }

  const modelImageById = new Map();
  for (const row of rows) {
    const image = imageFromRow(row);
    if (image && !modelImageById.has(row.model_id)) modelImageById.set(row.model_id, image);
  }
  const exportRows = rows.map((row) => ({
    ...row,
    image_url: imageFromRow(row) || modelImageById.get(row.model_id) || "",
  }));

  const handles = handlesForRows(exportRows);
  const skuCounts = new Map();
  for (const row of exportRows) {
    const sku = normalizeKey(variantSku(row));
    if (!sku) continue;
    skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
  }

  const items = exportRows.map((row) => {
    const validation = validationForRow(row);
    const sku = variantSku(row);
    if (sku && (skuCounts.get(normalizeKey(sku)) || 0) > 1) {
      validation.errors.push("A kijelölt exportban ez a Shopify SKU többször szerepel.");
    }
    const skippedMapped = Boolean(row.shopify_mapped && !includeMapped);
    return {
      ...row,
      handle: handles.get(row.model_id),
      sku,
      image_url: imageFromRow(row),
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      export_state: skippedMapped ? "skipped_mapped" : validation.errors.length ? "invalid" : "valid",
    };
  });

  const validItems = items.filter((item) => item.export_state === "valid");
  const invalidItems = items.filter((item) => item.export_state === "invalid");
  const skippedItems = items.filter((item) => item.export_state === "skipped_mapped");
  const modelCount = new Set(items.map((item) => item.model_id)).size;
  const validModelCount = new Set(validItems.map((item) => item.model_id)).size;
  const warningCount = items.reduce((sum, item) => sum + item.validation_warnings.length, 0);
  const totalAvailableQty = validItems.reduce((sum, item) => sum + integer(item.export_available_qty, 0), 0);

  return {
    selectionMode,
    productStatus,
    includeMapped,
    location: { id: locationId, name: locationName },
    items,
    validItems,
    invalidItems,
    skippedItems,
    summary: {
      selectedVariantCount: unique(options.variantIds || []).length,
      modelCount,
      validModelCount,
      variantCount: items.length,
      validVariantCount: validItems.length,
      invalidVariantCount: invalidItems.length,
      skippedMappedCount: skippedItems.length,
      warningCount,
      totalAvailableQty,
      locationId,
      locationName,
    },
  };
}

function productRowsForItems(items, productStatus) {
  const byModel = new Map();
  for (const item of items) {
    const list = byModel.get(item.model_id) || [];
    list.push(item);
    byModel.set(item.model_id, list);
  }

  const productRows = [];
  const byVariant = new Map();
  for (const modelItems of byModel.values()) {
    const colors = unique(modelItems.map((item) => item.color_name || item.color_code));
    const firstImage = modelItems.map((item) => item.image_url).find(Boolean) || "";
    modelItems.forEach((item, index) => {
      const first = index === 0;
      const title = text(item.shopify_title || item.title_ro);
      const category = productCategory(item);
      const type = text(item.subcategory_name_ro || item.product_type || item.category_name_ro);
      const description = descriptionHtml(item);
      const seoDescription = plainText([item.description_ro, item.material].filter(Boolean).join(" ")).slice(0, 320);
      const row = {
        "Title": first ? title : "",
        "URL handle": item.handle,
        "Description": first ? description : "",
        "Vendor": first ? text(item.brand_name) : "",
        "Product category": first ? category : "",
        "Type": first ? type : "",
        "Tags": first ? buildTags(item) : "",
        "Published on online store": first ? (productStatus === "active" ? "TRUE" : "FALSE") : "",
        "Status": first ? productStatus : "",
        "SKU": item.sku,
        "Barcode": item.sku,
        "Option1 name": "Culoare",
        "Option1 value": text(item.color_name || item.color_code),
        "Option1 Linked To": "",
        "Option2 name": "Mărime",
        "Option2 value": text(item.size),
        "Option2 Linked To": "",
        "Option3 name": "",
        "Option3 value": "",
        "Option3 Linked To": "",
        "Price": price(item.sell_price),
        "Compare-at price": price(item.compare_at_price),
        "Cost per item": price(item.buy_price),
        "Charge tax": "TRUE",
        "Tax code": "",
        "Unit price total measure": "",
        "Unit price total measure unit": "",
        "Unit price base measure": "",
        "Unit price base measure unit": "",
        "Inventory tracker": "shopify",
        "Inventory quantity": "",
        "Continue selling when out of stock": "deny",
        "Weight value (grams)": integer(item.weight_grams, 0) > 0 ? integer(item.weight_grams, 0) : "",
        "Weight unit for display": "g",
        "Requires shipping": "TRUE",
        "Fulfillment service": "manual",
        "Product image URL": first ? firstImage : "",
        "Image position": first && firstImage ? 1 : "",
        "Image alt text": first && firstImage ? `${title} ${text(item.color_name || item.color_code)} ${text(item.size)}`.trim().slice(0, 125) : "",
        "Variant image URL": item.image_url,
        "Gift card": "FALSE",
        "SEO title": first ? title.slice(0, 70) : "",
        "SEO description": first ? seoDescription : "",
        "Color (product.metafields.shopify.color-pattern)": first ? colors.join("; ") : "",
        "Google Shopping / Google product category": first ? category : "",
        "Google Shopping / Gender": first ? shopifyGender(item.gender) : "",
        "Google Shopping / Age group": first ? shopifyAgeGroup(item.gender) : "",
        "Google Shopping / Manufacturer part number (MPN)": productCode(item),
        "Google Shopping / Ad group name": "",
        "Google Shopping / Ads labels": "",
        "Google Shopping / Condition": "new",
        "Google Shopping / Custom product": "FALSE",
        "Google Shopping / Custom label 0": first ? tagValue(item.category_name_ro) : "",
        "Google Shopping / Custom label 1": first ? tagValue(item.subcategory_name_ro || item.product_type) : "",
        "Google Shopping / Custom label 2": first ? tagValue(item.gender) : "",
        "Google Shopping / Custom label 3": first ? tagValue(item.season) : "",
        "Google Shopping / Custom label 4": first ? tagValue(item.brand_name) : "",
        "Collection": first ? text(item.subcategory_name_ro || item.category_name_ro) : "",
      };
      productRows.push(row);
      byVariant.set(item.variant_id, row);
    });
  }
  return { productRows, byVariant };
}

function inventoryRowsForItems(items, locationName) {
  const rows = [];
  const byVariant = new Map();
  for (const item of items) {
    const row = {
      "Handle": item.handle,
      "Title": text(item.shopify_title || item.title_ro),
      "Option1 Name": "Culoare",
      "Option1 Value": text(item.color_name || item.color_code),
      "Option2 Name": "Mărime",
      "Option2 Value": text(item.size),
      "Option3 Name": "",
      "Option3 Value": "",
      "SKU": item.sku,
      "HS Code": text(item.customs_tariff_code),
      "COO": "",
      "Location": locationName,
      "Bin name": "",
      "Incoming (not editable)": "",
      "Unavailable (not editable)": "",
      "Committed (not editable)": "",
      "Available (not editable)": "",
      "On hand (current)": "",
      "On hand (new)": Math.max(0, integer(item.export_available_qty, 0)),
    };
    rows.push(row);
    byVariant.set(item.variant_id, row);
  }
  return { inventoryRows: rows, byVariant };
}

function reportRowsForItems(items) {
  return items.map((item) => ({
    "Állapot": item.export_state,
    "Modell": item.shopify_title || item.title_ro,
    "Márka": item.brand_name,
    "Termékkód": productCode(item),
    "Szín": item.color_name || item.color_code,
    "Méret": item.size,
    "Shopify SKU": item.sku,
    "AllIn belső SKU": item.internal_sku,
    "Elérhető készlet": item.export_available_qty,
    "Már Shopifyhoz kapcsolva": item.shopify_mapped ? "igen" : "nem",
    "Hibák": item.validation_errors.join(" | "),
    "Figyelmeztetések": item.validation_warnings.join(" | "),
  }));
}

const REPORT_HEADERS = [
  "Állapot",
  "Modell",
  "Márka",
  "Termékkód",
  "Szín",
  "Méret",
  "Shopify SKU",
  "AllIn belső SKU",
  "Elérhető készlet",
  "Már Shopifyhoz kapcsolva",
  "Hibák",
  "Figyelmeztetések",
];

export async function previewAifShopifyProductExport(client, options = {}) {
  const prepared = await prepareExport(client, options);
  return {
    ok: true,
    summary: prepared.summary,
    selectionMode: prepared.selectionMode,
    productStatus: prepared.productStatus,
    location: prepared.location,
    items: prepared.items.map((item) => ({
      variantId: item.variant_id,
      modelId: item.model_id,
      title: item.shopify_title || item.title_ro,
      brand: item.brand_name,
      color: item.color_name || item.color_code,
      size: item.size,
      sku: item.sku,
      imageUrl: item.image_url,
      availableQty: item.export_available_qty,
      mapped: Boolean(item.shopify_mapped),
      state: item.export_state,
      errors: item.validation_errors,
      warnings: item.validation_warnings,
    })),
  };
}

export async function createAifShopifyProductExport(client, options = {}) {
  const prepared = await prepareExport(client, options);
  if (!prepared.validItems.length) {
    throw Object.assign(new Error("Nincs exportálható, hibamentes variáns a kijelölésben."), {
      code: "shopify_export_no_valid_items",
      preview: await previewAifShopifyProductExport(client, options),
    });
  }

  const { productRows, byVariant: productByVariant } = productRowsForItems(prepared.validItems, prepared.productStatus);
  const { inventoryRows, byVariant: inventoryByVariant } = inventoryRowsForItems(prepared.validItems, prepared.location.name);
  const reportRows = reportRowsForItems(prepared.items);
  const exportId = randomUUID();
  const actor = text(options.actor || "system") || "system";

  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO aif_shopify_product_exports (
         id, status, selection_mode, product_status, shopify_location_id, shopify_location_name,
         model_count, variant_count, valid_variant_count, invalid_variant_count, warning_count,
         created_by, summary, created_at, updated_at
       ) VALUES ($1,'prepared',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,now(),now())`,
      [
        exportId,
        prepared.selectionMode,
        prepared.productStatus,
        prepared.location.id || null,
        prepared.location.name,
        prepared.summary.modelCount,
        prepared.summary.variantCount,
        prepared.summary.validVariantCount,
        prepared.summary.invalidVariantCount,
        prepared.summary.warningCount,
        actor,
        JSON.stringify({ ...prepared.summary, reportRows }),
      ]
    );

    for (const item of prepared.items) {
      const itemStatus = item.export_state === "valid"
        ? "exported_pending"
        : item.export_state === "skipped_mapped"
          ? "skipped_mapped"
          : "invalid";
      await client.query(
        `INSERT INTO aif_shopify_product_export_items (
           export_id, variant_id, model_id, handle, sku, item_status,
           validation_errors, validation_warnings, product_row, inventory_row, snapshot, created_at, updated_at
         ) VALUES ($1,$2::uuid,$3::uuid,$4,$5,$6,$7::text[],$8::text[],$9::jsonb,$10::jsonb,$11::jsonb,now(),now())`,
        [
          exportId,
          item.variant_id,
          item.model_id,
          item.handle,
          item.sku || null,
          itemStatus,
          item.validation_errors,
          item.validation_warnings,
          productByVariant.has(item.variant_id) ? JSON.stringify(productByVariant.get(item.variant_id)) : null,
          inventoryByVariant.has(item.variant_id) ? JSON.stringify(inventoryByVariant.get(item.variant_id)) : null,
          JSON.stringify({
            title: item.shopify_title || item.title_ro,
            brand: item.brand_name,
            color: item.color_name || item.color_code,
            size: item.size,
            internalSku: item.internal_sku,
            sku: item.sku,
            imageUrl: item.image_url,
            availableQty: item.export_available_qty,
            mapped: Boolean(item.shopify_mapped),
          }),
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  }

  return {
    ok: true,
    exportId,
    fileName: `allinfashion_shopify_export_${new Date().toISOString().slice(0, 10)}_${exportId.slice(0, 8)}.zip`,
    downloadUrl: `/api/aif/shopify/product-exports/${encodeURIComponent(exportId)}/download`,
    summary: prepared.summary,
    location: prepared.location,
    productRows: productRows.length,
    inventoryRows: inventoryRows.length,
  };
}

function crc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crc32Table();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function zipFiles(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function readmeForExport(exportRow, itemCount) {
  return `AllInFashion -> Shopify termékexport\n\n` +
    `Export ID: ${exportRow.id}\n` +
    `Létrehozva: ${new Date(exportRow.created_at).toLocaleString("hu-HU")}\n` +
    `Termékállapot: ${exportRow.product_status}\n` +
    `Variánsok: ${itemCount}\n` +
    `Induló Shopify helyszín: ${exportRow.shopify_location_name}\n\n` +
    `IMPORT SORREND\n` +
    `1. Shopify Admin -> Products -> Import. Töltsd fel a 01_shopify_products.csv fájlt.\n` +
    `2. Új termékeknél NE jelöld be az "Overwrite products with matching handles" opciót.\n` +
    `3. Várd meg, amíg a termékimport befejeződik.\n` +
    `4. Shopify Admin -> Products -> Inventory -> Import. Töltsd fel a 02_shopify_inventory_miercurea_ciuc.csv fájlt.\n` +
    `5. Az AllIn Raktárban nyisd meg a Shopify export listát és kattints az "Import elkészült, párosítás" gombra.\n\n` +
    `FONTOS\n` +
    `- A Shopify SKU és Barcode mező az AllIn mentett vonalkódját használja.\n` +
    `- A készlet teljes elérhető mennyisége induláskor a ${exportRow.shopify_location_name} helyre kerül.\n` +
    `- Az online_shop AllIn hely nincs beleszámítva.\n` +
    `- A párosítás után a készletmozgásokat már kizárólag az AllIn rendszerben kezeld.\n` +
    `- A 03_export_report.csv tartalmazza a kihagyott és hibás sorokat is.\n`;
}

export async function getAifShopifyProductExportArchive(client, exportId) {
  await ensureAifShopifyExportSchema(client);
  const exportResult = await client.query(`SELECT * FROM aif_shopify_product_exports WHERE id::text=$1 LIMIT 1`, [text(exportId)]);
  if (!exportResult.rowCount) return null;
  const exportRow = exportResult.rows[0];
  const items = await client.query(
    `SELECT * FROM aif_shopify_product_export_items
     WHERE export_id=$1
     ORDER BY model_id, created_at, variant_id`,
    [exportRow.id]
  );
  const productRows = items.rows.filter((row) => row.item_status === "exported_pending" && row.product_row).map((row) => row.product_row);
  const inventoryRows = items.rows.filter((row) => row.item_status === "exported_pending" && row.inventory_row).map((row) => row.inventory_row);
  const reportRows = reportRowsForItems(items.rows.map((row) => ({
    ...(row.snapshot || {}),
    export_state: row.item_status,
    shopify_title: row.snapshot?.title,
    title_ro: row.snapshot?.title,
    brand_name: row.snapshot?.brand,
    color_name: row.snapshot?.color,
    size: row.snapshot?.size,
    sku: row.sku,
    internal_sku: row.snapshot?.internalSku,
    export_available_qty: row.snapshot?.availableQty,
    shopify_mapped: row.snapshot?.mapped,
    validation_errors: row.validation_errors || [],
    validation_warnings: row.validation_warnings || [],
  })));
  const fileName = `allinfashion_shopify_export_${new Date(exportRow.created_at).toISOString().slice(0, 10)}_${String(exportRow.id).slice(0, 8)}.zip`;
  const archive = zipFiles([
    { name: "01_shopify_products.csv", data: csvFromRows(PRODUCT_HEADERS, productRows) },
    { name: "02_shopify_inventory_miercurea_ciuc.csv", data: csvFromRows(INVENTORY_HEADERS, inventoryRows) },
    { name: "03_export_report.csv", data: csvFromRows(REPORT_HEADERS, reportRows) },
    { name: "README.txt", data: readmeForExport(exportRow, productRows.length) },
  ]);
  await client.query(
    `UPDATE aif_shopify_product_exports
     SET status=CASE WHEN status='prepared' THEN 'downloaded' ELSE status END,
         downloaded_at=COALESCE(downloaded_at,now()), updated_at=now()
     WHERE id=$1`,
    [exportRow.id]
  );
  return { fileName, archive, itemCount: productRows.length, export: exportRow };
}

async function loadAllShopifyVariants() {
  const query = `query AifProductExportVariants($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        sku
        barcode
        title
        inventoryItem { id }
        product { id title status handle }
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

export async function reconcileAifShopifyProductExport(client, exportId, options = {}) {
  await ensureAifShopifyExportSchema(client);
  const exportResult = await client.query(`SELECT * FROM aif_shopify_product_exports WHERE id::text=$1 LIMIT 1`, [text(exportId)]);
  if (!exportResult.rowCount) return null;
  const exportRow = exportResult.rows[0];
  const itemsResult = await client.query(
    `SELECT * FROM aif_shopify_product_export_items
     WHERE export_id=$1 AND item_status IN ('exported_pending','error')
     ORDER BY created_at`,
    [exportRow.id]
  );
  const shopifyVariants = await loadAllShopifyVariants();
  const bySku = new Map();
  for (const variant of shopifyVariants) {
    const sku = normalizeKey(variant.sku);
    if (!sku) continue;
    const list = bySku.get(sku) || [];
    list.push(variant);
    bySku.set(sku, list);
  }

  let mapped = 0;
  let errors = 0;
  const errorItems = [];
  for (const item of itemsResult.rows) {
    const sku = normalizeKey(item.sku);
    const matches = bySku.get(sku) || [];
    if (matches.length !== 1) {
      const message = matches.length ? `A Shopifyban ${matches.length} variáns használja ezt az SKU-t.` : "Az SKU még nem található a Shopifyban.";
      await client.query(
        `UPDATE aif_shopify_product_export_items
         SET item_status='error', validation_errors=array_append(COALESCE(validation_errors,'{}'::text[]),$3), updated_at=now()
         WHERE export_id=$1 AND variant_id=$2`,
        [exportRow.id, item.variant_id, message]
      );
      errors += 1;
      errorItems.push({ variantId: item.variant_id, sku: item.sku, error: message });
      continue;
    }

    const variant = matches[0];
    const inventoryItemId = text(variant.inventoryItem?.id);
    const productId = text(variant.product?.id);
    const variantId = text(variant.id);
    if (!inventoryItemId || !productId || !variantId) {
      const message = "A Shopify variánsazonosítók hiányosak.";
      errors += 1;
      errorItems.push({ variantId: item.variant_id, sku: item.sku, error: message });
      continue;
    }

    try {
      await client.query(
        `INSERT INTO aif_shopify_variant_map (
           variant_id, sku, shopify_product_id, shopify_variant_id, shopify_inventory_item_id,
           shopify_product_title, shopify_variant_title, shopify_product_status,
           sync_status, last_error, raw, updated_at
         ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,'mapped',NULL,$9::jsonb,now())
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
          item.variant_id,
          item.sku,
          productId,
          variantId,
          inventoryItemId,
          text(variant.product?.title),
          text(variant.title),
          text(variant.product?.status),
          JSON.stringify({ source: "product_export_reconcile", exportId: exportRow.id, shopify: variant }),
        ]
      );
      await client.query(
        `UPDATE aif_shopify_product_export_items
         SET item_status='mapped', mapped_at=now(), validation_errors='{}'::text[], updated_at=now()
         WHERE export_id=$1 AND variant_id=$2`,
        [exportRow.id, item.variant_id]
      );
      if (options.enqueueStock !== false) {
        await enqueueAifShopifyVariant(client, item.variant_id, "product_export_reconcile");
      }
      mapped += 1;
    } catch (error) {
      const message = error?.message || String(error);
      await client.query(
        `UPDATE aif_shopify_product_export_items
         SET item_status='error', validation_errors=array_append(COALESCE(validation_errors,'{}'::text[]),$3), updated_at=now()
         WHERE export_id=$1 AND variant_id=$2`,
        [exportRow.id, item.variant_id, message.slice(0, 1000)]
      );
      errors += 1;
      errorItems.push({ variantId: item.variant_id, sku: item.sku, error: message });
    }
  }

  const state = await client.query(
    `SELECT
       count(*) FILTER (WHERE item_status='mapped')::int AS mapped,
       count(*) FILTER (WHERE item_status='exported_pending')::int AS pending,
       count(*) FILTER (WHERE item_status='error')::int AS errors
     FROM aif_shopify_product_export_items
     WHERE export_id=$1`,
    [exportRow.id]
  );
  const totals = state.rows[0] || {};
  const finalStatus = Number(totals.pending || 0) === 0 && Number(totals.errors || 0) === 0 ? "mapped" : "partially_mapped";
  await client.query(
    `UPDATE aif_shopify_product_exports
     SET status=$2, reconciled_at=now(), updated_at=now(),
         summary=COALESCE(summary,'{}'::jsonb) || $3::jsonb
     WHERE id=$1`,
    [exportRow.id, finalStatus, JSON.stringify({ reconciliation: { mapped, errors, totals, at: new Date().toISOString() } })]
  );

  return { ok: true, exportId: exportRow.id, status: finalStatus, mapped, errors, errorItems, totals };
}

export async function listAifShopifyProductExports(client, options = {}) {
  await ensureAifShopifyExportSchema(client);
  const limit = Math.min(100, Math.max(1, integer(options.limit, 20)));
  const result = await client.query(
    `SELECT id, status, selection_mode, product_status, shopify_location_id, shopify_location_name,
            model_count, variant_count, valid_variant_count, invalid_variant_count, warning_count,
            created_by, summary, created_at, updated_at, downloaded_at, reconciled_at
     FROM aif_shopify_product_exports
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
