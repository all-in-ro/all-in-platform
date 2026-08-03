import { randomUUID } from "node:crypto";
import {
  enqueueAifShopifyVariant,
  ensureAifShopifyTables,
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
  return `${lines.join("\r\n")}\r\n`;
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
  if (["men", "male", "masculin", "barbati", "barbat", "ferfi", "boys", "boy", "baieti", "baiat", "fiuk", "fiu"].includes(key)) return "male";
  if (["women", "female", "feminin", "femei", "femeie", "noi", "no", "girls", "girl", "fete", "fata", "lany", "lanyok"].includes(key)) return "female";
  return "unisex";
}

function shopifyAgeGroup(value) {
  const key = normalizeKey(value);
  return ["kids", "kid", "copii", "copil", "gyerek", "junior", "youth", "children", "boys", "boy", "girls", "girl", "baieti", "baiat", "fete", "fata", "fiuk", "lanyok"].includes(key)
    ? "kids"
    : "adult";
}

function shopifyAudience(value) {
  if (shopifyAgeGroup(value) === "kids") return "Copii";
  const gender = shopifyGender(value);
  if (gender === "female") return "Femei";
  if (gender === "male") return "Bărbați";
  return "Unisex";
}

function shopifyStyle(row) {
  const brand = normalizeKey(row?.brand_name || row?.brand_code);
  const sportBrands = [
    "4f", "under armour", "adidas", "nike", "puma", "reebok", "asics",
    "new balance", "salomon", "joma", "kappa", "fila", "champion",
  ];
  if (sportBrands.some((candidate) => brand === candidate || brand.includes(candidate))) return "Sport";

  const haystack = normalizeKey([
    row?.shopify_title,
    row?.title_ro,
    row?.category_name_ro,
    row?.category_name_hu,
    row?.category_code,
    row?.subcategory_name_ro,
    row?.subcategory_name_hu,
    row?.subcategory_code,
    row?.product_type,
  ].filter(Boolean).join(" "));

  return /sport|training|fitness|running|runner|alerg|football|fotbal|tenis|tennis|gym|yoga|baschet|basket|ski|outdoor|performance|athletic/.test(haystack)
    ? "Sport"
    : "Fashion";
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
  if (/baseball[ _-]?cap|sapca|șapcă|sepci|blitzing/.test(haystack)) {
    return "Apparel & Accessories > Clothing Accessories > Hats > Baseball Caps";
  }
  if (/beanie|caciul|căciul/.test(haystack)) {
    return "Apparel & Accessories > Clothing Accessories > Hats > Beanies";
  }
  if (/cap|hat|sapka|kalap/.test(haystack)) {
    return "Apparel & Accessories > Clothing Accessories > Hats";
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
  const normalizedTags = [
    "allinfashion",
    row.brand_name,
    row.category_name_ro,
    row.subcategory_name_ro,
    row.product_type,
    row.gender,
    row.season,
    row.color_name,
  ].map(tagValue).filter(Boolean);

  // A Shopifyban a technikai gender címke mellett az emberi, román címke is kell.
  // Így a women/female adatból automatikusan Femei lesz, és az automata kollekciók
  // nem kénytelenek angol-magyar-román találós kérdést játszani.
  return unique([
    shopifyAudience(row.gender),
    shopifyStyle(row),
    ...normalizedTags,
  ]).join(", ");
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

function cleanGroupingMode(value) {
  return text(value) === "model_colors" ? "model_colors" : "product_code";
}

function modelGroupCode(row) {
  const rawModelCode = text(row.model_code);
  if (rawModelCode) {
    const cleanModelCode = rawModelCode.includes(":") ? rawModelCode.split(":").pop() || rawModelCode : rawModelCode;
    if (text(cleanModelCode)) return text(cleanModelCode);
  }
  return text(row.shopify_title || row.title_ro || row.model_id);
}

// Két használható Shopify-csoportosítás:
// - model_colors: egy AllIn modell egy Shopify-termék, a szín és a méret variánsopció.
// - product_code: minden beszállítói termékkód külön Shopify-termék.
// Az első kell például a DOGGY POLO ciklam / roz / turcoaz színeihez, a második
// megmarad azokhoz a márkákhoz, ahol a színkódos cikkszám tényleg külön termék.
function productGroupCode(row, groupingMode = "product_code") {
  if (cleanGroupingMode(groupingMode) === "model_colors") return modelGroupCode(row);

  const supplierProductCode = text(row.supplier_product_code);
  if (supplierProductCode) return supplierProductCode;

  const baseModelCode = text(row.model_code);
  const supplierColorCode = text(row.supplier_color_code);
  const colorCode = text(row.color_code);
  const colorName = text(row.color_name);
  if (baseModelCode && supplierColorCode) return `${baseModelCode}-${supplierColorCode}`;
  if (baseModelCode && colorCode) return `${baseModelCode}-${colorCode}`;
  if (baseModelCode && colorName) return `${baseModelCode}-${colorName}`;
  return baseModelCode || text(row.model_id);
}

function productGroupKey(row, groupingMode = "product_code") {
  const mode = cleanGroupingMode(groupingMode);
  if (mode === "model_colors") {
    return `model::${text(row.model_id) || normalizeKey(modelGroupCode(row))}`;
  }
  return `${text(row.model_id)}::${normalizeKey(productGroupCode(row, mode))}`;
}

function variantOptionCombinationKey(row) {
  return `${normalizeKey(row.color_name || row.color_code)}::${normalizeKey(row.size)}`;
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

  // A lekérdezés mindkét exportmódban ugyanazt az egyetlen SQL-paramétert használja.
  // Korábban az all_model_variants ág csak $2-t hivatkozott, miközben $1 is átadásra került.
  // PostgreSQL ezért nem tudta meghatározni a nem használt $1 típusát.
  const where = selectionMode === "selected_variants"
    ? `v.id::text = ANY($1::text[])`
    : `v.model_id = ANY($1::uuid[])`;
  const whereValues = selectionMode === "selected_variants" ? [ids] : [modelIds];

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
    whereValues
  );
  return result.rows;
}

function handlesForRows(rows, groupingMode = "product_code") {
  const handleByGroup = new Map();
  const used = new Set();
  for (const row of rows) {
    const groupKey = text(row.product_group_key) || productGroupKey(row, groupingMode);
    if (handleByGroup.has(groupKey)) continue;
    const groupCode = text(row.product_group_code) || productGroupCode(row, groupingMode);
    let handle = slug([row.brand_name, groupCode || row.shopify_title || row.title_ro].filter(Boolean).join("-"));
    if (!handle) handle = `allin-${text(row.model_id).slice(0, 8)}`;
    if (used.has(handle)) {
      const modelSuffix = text(row.model_id).replace(/-/g, "").slice(0, 8) || "product";
      handle = `${handle}-${modelSuffix}`.slice(0, 180);
    }
    used.add(handle);
    handleByGroup.set(groupKey, handle);
  }
  return handleByGroup;
}

async function prepareExport(client, options = {}) {
  await ensureAifShopifyExportSchema(client);
  const selectionMode = options.selectionMode === "selected_variants" ? "selected_variants" : "all_model_variants";
  const productStatus = options.productStatus === "active" ? "active" : "draft";
  const groupingMode = cleanGroupingMode(options.groupingMode || options.grouping_mode);
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

  const productImageByGroup = new Map();
  for (const row of rows) {
    const image = imageFromRow(row);
    const groupKey = productGroupKey(row, groupingMode);
    if (image && !productImageByGroup.has(groupKey)) productImageByGroup.set(groupKey, image);
  }
  const exportRows = rows.map((row) => {
    const groupKey = productGroupKey(row, groupingMode);
    return {
      ...row,
      grouping_mode: groupingMode,
      product_group_key: groupKey,
      product_group_code: productGroupCode(row, groupingMode),
      image_url: imageFromRow(row) || productImageByGroup.get(groupKey) || "",
    };
  });

  const handles = handlesForRows(exportRows, groupingMode);
  const skuCounts = new Map();
  const optionCombinationCounts = new Map();
  const groupMappingState = new Map();
  for (const row of exportRows) {
    const sku = normalizeKey(variantSku(row));
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);

    const optionKey = `${row.product_group_key}::${variantOptionCombinationKey(row)}`;
    optionCombinationCounts.set(optionKey, (optionCombinationCounts.get(optionKey) || 0) + 1);

    const mappingState = groupMappingState.get(row.product_group_key) || { mapped: 0, unmapped: 0 };
    if (row.shopify_mapped) mappingState.mapped += 1;
    else mappingState.unmapped += 1;
    groupMappingState.set(row.product_group_key, mappingState);
  }

  let items = exportRows.map((row) => {
    const validation = validationForRow(row);
    const sku = variantSku(row);
    if (sku && (skuCounts.get(normalizeKey(sku)) || 0) > 1) {
      validation.errors.push("A kijelölt exportban ez a Shopify SKU többször szerepel.");
    }

    const optionKey = `${row.product_group_key}::${variantOptionCombinationKey(row)}`;
    if ((optionCombinationCounts.get(optionKey) || 0) > 1) {
      validation.errors.push("Ebben a Shopify-termékben ugyanaz a szín + méret kombináció többször szerepel.");
    }

    const mappingState = groupMappingState.get(row.product_group_key) || { mapped: 0, unmapped: 0 };
    if (
      groupingMode === "model_colors" &&
      !includeMapped &&
      !row.shopify_mapped &&
      mappingState.mapped > 0 &&
      mappingState.unmapped > 0
    ) {
      validation.errors.push("A modell egyik színe már Shopifyhoz van kapcsolva. A teljes színválaszték újraépítéséhez kapcsold be a „Már összekötötteket is exportálja” opciót.");
    }

    const skippedMapped = Boolean(row.shopify_mapped && !includeMapped);
    return {
      ...row,
      handle: handles.get(row.product_group_key),
      sku,
      image_url: imageFromRow(row),
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      export_state: skippedMapped ? "skipped_mapped" : validation.errors.length ? "invalid" : "valid",
    };
  });

  if (groupingMode === "model_colors") {
    const invalidGroups = new Set(
      items
        .filter((item) => item.export_state === "invalid")
        .map((item) => item.product_group_key)
        .filter(Boolean)
    );
    items = items.map((item) => {
      if (item.export_state !== "valid" || !invalidGroups.has(item.product_group_key)) return item;
      return {
        ...item,
        validation_errors: [
          ...item.validation_errors,
          "A modell egyik szín- vagy méretvariánsa hibás, ezért a teljes Shopify-terméket visszatartottam. Javítsd a hibás sort, majd exportáld újra a teljes modellt.",
        ],
        export_state: "invalid",
      };
    });
  }

  const validItems = items.filter((item) => item.export_state === "valid");
  const invalidItems = items.filter((item) => item.export_state === "invalid");
  const skippedItems = items.filter((item) => item.export_state === "skipped_mapped");
  const allInModelCount = new Set(items.map((item) => item.model_id)).size;
  const modelCount = new Set(items.map((item) => item.product_group_key || productGroupKey(item, groupingMode))).size;
  const validModelCount = new Set(validItems.map((item) => item.product_group_key || productGroupKey(item, groupingMode))).size;
  const warningCount = items.reduce((sum, item) => sum + item.validation_warnings.length, 0);
  const totalAvailableQty = validItems.reduce((sum, item) => sum + integer(item.export_available_qty, 0), 0);

  return {
    selectionMode,
    productStatus,
    groupingMode,
    includeMapped,
    location: { id: locationId, name: locationName },
    items,
    validItems,
    invalidItems,
    skippedItems,
    summary: {
      selectedVariantCount: unique(options.variantIds || []).length,
      groupingMode,
      allInModelCount,
      modelCount,
      productCount: modelCount,
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
  const byProduct = new Map();
  for (const item of items) {
    const groupKey = item.product_group_key || productGroupKey(item);
    const list = byProduct.get(groupKey) || [];
    list.push(item);
    byProduct.set(groupKey, list);
  }

  const productRows = [];
  const byVariant = new Map();
  for (const modelItems of byProduct.values()) {
    const sortedItems = modelItems.slice().sort((a, b) => {
      const colorCompare = text(a.color_name || a.color_code).localeCompare(text(b.color_name || b.color_code), "ro", { sensitivity: "base" });
      if (colorCompare !== 0) return colorCompare;
      return text(a.size).localeCompare(text(b.size), "ro", { numeric: true, sensitivity: "base" });
    });
    const firstImage = sortedItems.map((item) => item.image_url).find(Boolean) || "";
    sortedItems.forEach((item, index) => {
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
        // A szín itt normál termékopcióként megy át. A Shopify kategória-színmező
        // metaobjektum-hivatkozást várhat, ezért nyers színnevet nem töltünk bele.
        "Color (product.metafields.shopify.color-pattern)": "",
        "Google Shopping / Google product category": first
          ? (/Hats(?: >|$)/.test(category) ? "2396" : category)
          : "",
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
    groupingMode: prepared.groupingMode,
    location: prepared.location,
    items: prepared.items.map((item) => ({
      variantId: item.variant_id,
      modelId: item.model_id,
      productGroupCode: item.product_group_code || productGroupCode(item, prepared.groupingMode),
      handle: item.handle,
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
          null,
          JSON.stringify({
            title: item.shopify_title || item.title_ro,
            brand: item.brand_name,
            brandCode: item.brand_code,
            gender: item.gender,
            audience: shopifyAudience(item.gender),
            style: shopifyStyle(item),
            categoryNameRo: item.category_name_ro,
            categoryNameHu: item.category_name_hu,
            categoryCode: item.category_code,
            subcategoryNameRo: item.subcategory_name_ro,
            subcategoryNameHu: item.subcategory_name_hu,
            subcategoryCode: item.subcategory_code,
            productType: item.product_type,
            tags: buildTags(item),
            productCode: item.product_group_code || productGroupCode(item, prepared.groupingMode),
            productGroupKey: item.product_group_key || productGroupKey(item, prepared.groupingMode),
            groupingMode: prepared.groupingMode,
            handle: item.handle,
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
    fileName: `allinfashion_shopify_products_${new Date().toISOString().slice(0, 10)}_${exportId.slice(0, 8)}.csv`,
    downloadUrl: `/api/aif/shopify/product-exports/${encodeURIComponent(exportId)}/download`,
    summary: prepared.summary,
    location: prepared.location,
    productRows: productRows.length,
    inventoryRows: 0,
    stockMode: "pair_then_sync",
  };
}

export async function getAifShopifyProductExportCsv(client, exportId) {
  await ensureAifShopifyExportSchema(client);
  const exportResult = await client.query(`SELECT * FROM aif_shopify_product_exports WHERE id::text=$1 LIMIT 1`, [text(exportId)]);
  if (!exportResult.rowCount) return null;
  const exportRow = exportResult.rows[0];
  const items = await client.query(
    `SELECT * FROM aif_shopify_product_export_items
     WHERE export_id=$1
     ORDER BY handle, created_at, variant_id`,
    [exportRow.id]
  );

  // Shopify a termék első CSV-sorában kötelezően várja a Title mezőt.
  // Az export létrehozásakor csak egy variánssor kap termékcímet, de az adatbázisból
  // történő későbbi visszaolvasás variant_id szerint átrendezhette a sorokat. Ettől egy
  // üres Title-os variáns kerülhetett a modell első sorába, amit a Shopify jogosan
  // elutasított. Handle szerint csoportosítunk, és mindig a termékadatokat
  // tartalmazó sort tesszük elsőnek. A régebbi mentett exportokat is automatikusan
  // kijavítjuk letöltéskor.
  const exportableItems = items.rows
    .filter((row) => ["exported_pending", "mapped", "error"].includes(String(row.item_status)) && row.product_row);
  const grouped = new Map();
  for (const item of exportableItems) {
    const productRow = { ...(item.product_row || {}) };
    // Régi export újraletöltésekor se küldjünk nyers színnevet a kategória metaobjektum mezőbe.
    productRow["Color (product.metafields.shopify.color-pattern)"] = "";
    const groupKey = text(productRow["URL handle"] || item.handle || item.model_id || item.variant_id);
    const list = grouped.get(groupKey) || [];
    list.push({ item, productRow });
    grouped.set(groupKey, list);
  }

  const productRows = [];
  for (const group of grouped.values()) {
    const titleIndex = group.findIndex(({ productRow }) => text(productRow["Title"]));
    if (titleIndex > 0) {
      const [titleRow] = group.splice(titleIndex, 1);
      group.unshift(titleRow);
    }
    if (group.length && !text(group[0].productRow["Title"])) {
      const fallbackTitle = text(group[0].item?.snapshot?.title);
      if (fallbackTitle) group[0].productRow["Title"] = fallbackTitle;
    }
    productRows.push(...group.map(({ productRow }) => productRow));
  }
  const fileName = `allinfashion_shopify_products_${new Date(exportRow.created_at).toISOString().slice(0, 10)}_${String(exportRow.id).slice(0, 8)}.csv`;
  const csv = Buffer.from(csvFromRows(PRODUCT_HEADERS, productRows), "utf8");
  await client.query(
    `UPDATE aif_shopify_product_exports
     SET status=CASE WHEN status='prepared' THEN 'downloaded' ELSE status END,
         downloaded_at=COALESCE(downloaded_at,now()), updated_at=now()
     WHERE id=$1`,
    [exportRow.id]
  );
  return { fileName, csv, itemCount: productRows.length, export: exportRow };
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
        product { id title status handle category { id name fullName } }
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


async function activateShopifyProduct(productId, vendor) {
  const mutation = `mutation AifActivateImportedProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id status vendor }
      userErrors { field message }
    }
  }`;
  const response = await shopifyGraphql(mutation, {
    product: {
      id: text(productId),
      status: "ACTIVE",
      ...(text(vendor) ? { vendor: text(vendor) } : {}),
    },
  });
  const payload = response.data?.productUpdate;
  if (payload?.userErrors?.length) {
    throw Object.assign(new Error(payload.userErrors.map((row) => row.message).join(" | ")), {
      code: "shopify_product_activate_failed",
      payload,
    });
  }
  return payload?.product || null;
}

async function onlineStorePublicationId() {
  const query = `query AifOnlineStorePublication {
    publications(first: 50) {
      nodes {
        id
        supportsFuturePublishing
        catalog { id title }
      }
    }
  }`;
  let response;
  try {
    response = await shopifyGraphql(query);
  } catch (error) {
    const message = error?.message || String(error);
    throw Object.assign(
      new Error(`${message} Az Online áruház automatikus közzétételéhez a Shopify alkalmazásnak read_publications és write_publications jogosultság kell.`),
      { code: "shopify_publication_scope_missing", cause: error }
    );
  }
  const publications = response.data?.publications?.nodes || [];
  const byTitle = publications.find((row) => normalizeKey(row?.catalog?.title).includes("online store"));
  const futureCapable = publications.find((row) => row?.supportsFuturePublishing === true);
  const found = byTitle || futureCapable || null;
  if (!found?.id) {
    throw Object.assign(new Error("A Shopify Online Store publication nem található."), {
      code: "shopify_online_store_publication_missing",
      publications,
    });
  }
  return text(found.id);
}

async function publishShopifyProductToOnlineStore(productId, publicationId) {
  const mutation = `mutation AifPublishImportedProduct($id: ID!, $publicationId: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable { publishedOnPublication(publicationId: $publicationId) }
      userErrors { field message }
    }
  }`;
  const response = await shopifyGraphql(mutation, {
    id: text(productId),
    publicationId: text(publicationId),
    input: [{ publicationId: text(publicationId) }],
  });
  const payload = response.data?.publishablePublish;
  if (payload?.userErrors?.length) {
    throw Object.assign(new Error(payload.userErrors.map((row) => row.message).join(" | ")), {
      code: "shopify_online_store_publish_failed",
      payload,
    });
  }
  return Boolean(payload?.publishable?.publishedOnPublication);
}

function isBrandDefinition(definition) {
  const name = normalizeKey(definition?.name).replace(/[^a-z0-9]+/g, "_");
  const key = normalizeKey(definition?.key).replace(/[^a-z0-9]+/g, "_");
  return ["brand", "marka", "marca"].includes(name) || ["brand", "marka", "marca"].includes(key);
}

async function applicableProductMetafieldDefinitions(categoryId) {
  const category = text(categoryId);
  const query = `query AifProductMetafieldDefinitions($constraint: MetafieldDefinitionConstraintSubtypeIdentifier) {
    allDefinitions: metafieldDefinitions(ownerType: PRODUCT, first: 250) {
      nodes { name namespace key type { name } validations { name value } }
    }
    categoryDefinitions: metafieldDefinitions(ownerType: PRODUCT, first: 250, constraintSubtype: $constraint) {
      nodes { name namespace key type { name } validations { name value } }
    }
  }`;
  const response = await shopifyGraphql(query, {
    constraint: category ? { key: "category", value: category } : null,
  });
  const combined = [
    ...(response.data?.categoryDefinitions?.nodes || []),
    ...(response.data?.allDefinitions?.nodes || []),
  ];
  const seen = new Set();
  return combined.filter((row) => {
    const id = `${text(row?.namespace)}.${text(row?.key)}`;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function metafieldDefinitionScore(definition, aliases, preferredNamespaces = []) {
  const name = normalizeKey(definition?.name);
  const key = normalizeKey(definition?.key).replace(/[_-]+/g, " ");
  const namespace = normalizeKey(definition?.namespace);
  const normalizedAliases = (aliases || []).map((value) => normalizeKey(value).replace(/[_-]+/g, " ")).filter(Boolean);
  const preferred = new Set((preferredNamespaces || []).map(normalizeKey).filter(Boolean));
  let score = 0;
  for (const alias of normalizedAliases) {
    if (name === alias) score = Math.max(score, 100);
    if (key === alias) score = Math.max(score, 95);
    if (name.includes(alias) || alias.includes(name)) score = Math.max(score, 55);
    if (key.includes(alias) || alias.includes(key)) score = Math.max(score, 50);
  }
  if (preferred.has(namespace)) score += 20;
  return score;
}

function findProductMetafieldDefinition(definitions, aliases, preferredNamespaces = []) {
  return (definitions || [])
    .map((definition) => ({ definition, score: metafieldDefinitionScore(definition, aliases, preferredNamespaces) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.definition || null;
}

function definitionChoiceValues(definition) {
  const choices = [];
  for (const validation of definition?.validations || []) {
    if (normalizeKey(validation?.name) !== "choices") continue;
    const raw = text(validation?.value);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) choices.push(...parsed.map(text).filter(Boolean));
    } catch {
      choices.push(...raw.split(/[|;,]+/).map(text).filter(Boolean));
    }
  }
  return unique(choices);
}

function resolvedMetafieldChoice(definition, candidates) {
  const cleanCandidates = unique((candidates || []).map(text).filter(Boolean));
  if (!cleanCandidates.length) return "";
  const allowed = definitionChoiceValues(definition);
  if (!allowed.length) return cleanCandidates[0];
  for (const candidate of cleanCandidates) {
    const key = normalizeKey(candidate);
    const exact = allowed.find((value) => normalizeKey(value) === key);
    if (exact) return exact;
  }
  return "";
}

function metafieldTextValue(definition, candidates) {
  const typeName = text(definition?.type?.name);
  const value = resolvedMetafieldChoice(definition, candidates);
  if (!value) return null;
  if (["single_line_text_field", "multi_line_text_field"].includes(typeName)) return value;
  if (typeName === "list.single_line_text_field") return JSON.stringify([value]);
  return null;
}

function audienceCandidates(value) {
  const audience = text(value);
  if (normalizeKey(audience) === "femei") return ["Femei", "Feminin", "Women", "Female"];
  if (normalizeKey(audience) === "barbati") return ["Bărbați", "Barbati", "Masculin", "Men", "Male"];
  if (normalizeKey(audience) === "copii") return ["Copii", "Junior", "Kids", "Children"];
  return [audience || "Unisex", "Unisex"];
}

function styleCandidates(value) {
  return normalizeKey(value) === "sport"
    ? ["Sport", "Sports"]
    : ["Fashion", "Lifestyle"];
}

async function setShopifyProductMetadata({ productId, categoryId, brand, audience, style, definitionCache }) {
  const product = text(productId);
  if (!product) return { updatedFields: [], skippedFields: [{ field: "all", reason: "missing_product" }] };

  const cacheKey = text(categoryId) || "__all__";
  let definitions = definitionCache?.get(cacheKey);
  if (!definitions) {
    definitions = await applicableProductMetafieldDefinitions(categoryId);
    definitionCache?.set(cacheKey, definitions);
  }

  const fields = [
    {
      field: "brand",
      value: text(brand),
      aliases: ["Brand", "Marcă", "Marca", "Márka"],
      preferredNamespaces: ["shopify"],
      candidates: [text(brand)],
    },
    {
      field: "audience",
      value: text(audience),
      aliases: ["Public", "Audience", "Public țintă", "Target audience"],
      preferredNamespaces: ["custom"],
      candidates: audienceCandidates(audience),
    },
    {
      field: "style",
      value: text(style),
      aliases: ["Stil", "Style"],
      preferredNamespaces: ["custom"],
      candidates: styleCandidates(style),
    },
  ];

  const inputs = [];
  const inputFields = [];
  const skippedFields = [];
  for (const field of fields) {
    if (!field.value) {
      skippedFields.push({ field: field.field, reason: "missing_value" });
      continue;
    }
    const definition = findProductMetafieldDefinition(definitions, field.aliases, field.preferredNamespaces);
    if (!definition) {
      skippedFields.push({ field: field.field, reason: "definition_missing" });
      continue;
    }
    const value = metafieldTextValue(definition, field.candidates);
    if (value === null) {
      skippedFields.push({
        field: field.field,
        reason: definitionChoiceValues(definition).length ? "choice_not_allowed" : "definition_type_unsupported",
        definition: { name: definition.name, namespace: definition.namespace, key: definition.key, type: text(definition.type?.name) },
      });
      continue;
    }
    inputs.push({
      ownerId: product,
      namespace: text(definition.namespace),
      key: text(definition.key),
      type: text(definition.type?.name),
      value,
    });
    inputFields.push(field.field);
  }

  if (!inputs.length) return { updatedFields: [], skippedFields };

  const mutation = `mutation AifSetImportedProductMetadata($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value type }
      userErrors { field message code }
    }
  }`;
  const response = await shopifyGraphql(mutation, { metafields: inputs });
  const payload = response.data?.metafieldsSet;
  if (payload?.userErrors?.length) {
    throw Object.assign(new Error(payload.userErrors.map((row) => row.message).join(" | ")), {
      code: "shopify_product_metadata_set_failed",
      payload,
      inputs,
    });
  }

  return {
    updatedFields: inputFields,
    skippedFields,
    metafields: payload?.metafields || [],
  };
}

async function enqueueInitialMiercureaProductExportStock(client, variantId, quantity, reason = "product_export_reconcile") {
  await ensureAifShopifyTables(client);
  const desiredMiercureaQty = Math.max(0, integer(quantity, 0));
  const idempotencyKey = randomUUID();
  await client.query(
    `INSERT INTO aif_shopify_sync_outbox (
       variant_id, desired_csikszereda_qty, desired_kezdi_qty, reason,
       status, attempts, idempotency_key, next_attempt_at, locked_at, last_error, created_at, updated_at
     ) VALUES ($1::uuid,$2,0,$3,'pending',0,$4,now(),NULL,NULL,now(),now())
     ON CONFLICT (variant_id) DO UPDATE SET
       desired_csikszereda_qty=EXCLUDED.desired_csikszereda_qty,
       desired_kezdi_qty=0,
       reason=EXCLUDED.reason,
       status='pending',
       attempts=0,
       idempotency_key=EXCLUDED.idempotency_key,
       next_attempt_at=now(),
       locked_at=NULL,
       last_error=NULL,
       updated_at=now()`,
    [text(variantId), desiredMiercureaQty, text(reason) || "product_export_reconcile", idempotencyKey]
  );
  return { queued: true, csikszereda: desiredMiercureaQty, kezdi: 0, idempotencyKey };
}

export async function reconcileAifShopifyProductExport(client, exportId, options = {}) {
  await ensureAifShopifyExportSchema(client);
  const exportResult = await client.query(`SELECT * FROM aif_shopify_product_exports WHERE id::text=$1 LIMIT 1`, [text(exportId)]);
  if (!exportResult.rowCount) return null;
  const exportRow = exportResult.rows[0];
  const itemsResult = await client.query(
    `SELECT * FROM aif_shopify_product_export_items
     WHERE export_id=$1 AND item_status IN ('exported_pending','error','mapped')
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
  const productTasks = new Map();
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
        await enqueueInitialMiercureaProductExportStock(client, item.variant_id, item.snapshot?.availableQty, "product_export_reconcile");
      }
      const taskData = {
        productId,
        modelId: item.model_id,
        brand: text(item.snapshot?.brand),
        audience: text(item.snapshot?.audience) || (text(item.snapshot?.gender) ? shopifyAudience(item.snapshot?.gender) : ""),
        style: text(item.snapshot?.style),
        categoryId: text(variant.product?.category?.id),
        categoryName: text(variant.product?.category?.fullName || variant.product?.category?.name),
        currentStatus: text(variant.product?.status),
      };
      const existingTask = productTasks.get(productId);
      productTasks.set(productId, existingTask ? {
        ...existingTask,
        brand: existingTask.brand || taskData.brand,
        audience: existingTask.audience || taskData.audience,
        style: existingTask.style || taskData.style,
        categoryId: existingTask.categoryId || taskData.categoryId,
        categoryName: existingTask.categoryName || taskData.categoryName,
      } : taskData);
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

  let activatedProducts = 0;
  let publishedProducts = 0;
  let brandUpdatedProducts = 0;
  let brandSkippedProducts = 0;
  let audienceUpdatedProducts = 0;
  let audienceSkippedProducts = 0;
  let styleUpdatedProducts = 0;
  let styleSkippedProducts = 0;
  let metadataUpdatedProducts = 0;
  const productErrors = [];
  const productWarnings = [];
  const metadataDefinitionCache = new Map();
  let onlinePublicationId = "";

  if (exportRow.product_status === "active" && productTasks.size) {
    try {
      onlinePublicationId = await onlineStorePublicationId();
    } catch (error) {
      productErrors.push({
        scope: "publication",
        error: error?.message || String(error),
        code: error?.code || null,
      });
    }
  }

  for (const task of productTasks.values()) {
    try {
      if (exportRow.product_status === "active") {
        await activateShopifyProduct(task.productId, task.brand);
        activatedProducts += 1;
        if (onlinePublicationId) {
          const published = await publishShopifyProductToOnlineStore(task.productId, onlinePublicationId);
          if (published) publishedProducts += 1;
        }
      }

      const metadataResult = await setShopifyProductMetadata({
        ...task,
        definitionCache: metadataDefinitionCache,
      });
      if (metadataResult.updatedFields.length) metadataUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("brand")) brandUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("audience")) audienceUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("style")) styleUpdatedProducts += 1;

      for (const skipped of metadataResult.skippedFields || []) {
        if (skipped.field === "brand") brandSkippedProducts += 1;
        if (skipped.field === "audience") audienceSkippedProducts += 1;
        if (skipped.field === "style") styleSkippedProducts += 1;
        productWarnings.push({
          scope: skipped.field,
          productId: task.productId,
          category: task.categoryName || task.categoryId || null,
          reason: skipped.reason,
          definition: skipped.definition || null,
        });
      }
    } catch (error) {
      productErrors.push({
        scope: "product_finalize",
        productId: task.productId,
        error: error?.message || String(error),
        code: error?.code || null,
      });
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
  const productErrorCount = productErrors.length;
  const finalStatus = Number(totals.pending || 0) === 0 && Number(totals.errors || 0) === 0 && productErrorCount === 0 ? "mapped" : "partially_mapped";
  const reconciliation = {
    mapped,
    errors,
    totals,
    activatedProducts,
    publishedProducts,
    brandUpdatedProducts,
    brandSkippedProducts,
    audienceUpdatedProducts,
    audienceSkippedProducts,
    styleUpdatedProducts,
    styleSkippedProducts,
    metadataUpdatedProducts,
    productErrors,
    productWarnings,
    onlinePublicationId: onlinePublicationId || null,
    at: new Date().toISOString(),
  };
  await client.query(
    `UPDATE aif_shopify_product_exports
     SET status=$2, reconciled_at=now(), updated_at=now(),
         summary=COALESCE(summary,'{}'::jsonb) || $3::jsonb
     WHERE id=$1`,
    [exportRow.id, finalStatus, JSON.stringify({ reconciliation })]
  );

  return {
    ok: true,
    exportId: exportRow.id,
    status: finalStatus,
    mapped,
    errors: errors + productErrorCount,
    mappingErrors: errors,
    productErrorCount,
    errorItems,
    productErrors,
    productWarnings,
    activatedProducts,
    publishedProducts,
    brandUpdatedProducts,
    brandSkippedProducts,
    audienceUpdatedProducts,
    audienceSkippedProducts,
    styleUpdatedProducts,
    styleSkippedProducts,
    metadataUpdatedProducts,
    totals,
  };
}

export async function listAifShopifyProductExports(client, options = {}) {
  await ensureAifShopifyExportSchema(client);
  const limit = Math.min(500, Math.max(1, integer(options.limit, 50)));
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


function compactRemoteVariantForMapping(variant) {
  return {
    id: text(variant?.id),
    sku: text(variant?.sku),
    barcode: text(variant?.barcode),
    title: text(variant?.title),
    inventoryItemId: text(variant?.inventoryItem?.id),
    productId: text(variant?.product?.id),
    productTitle: text(variant?.product?.title),
    productStatus: text(variant?.product?.status),
    productHandle: text(variant?.product?.handle),
  };
}

async function loadMappingsForRefresh(client, options = {}) {
  await ensureAifShopifyTables(client);
  const limit = Math.min(1000, Math.max(1, integer(options.limit, 1000)));
  const variantIds = unique((options.variantIds || []).map(text)).filter(Boolean);
  const where = variantIds.length ? "WHERE m.variant_id::text = ANY($2::text[])" : "";
  const values = variantIds.length ? [limit, variantIds] : [limit];
  const result = await client.query(
    `SELECT
       m.variant_id::text,
       m.sku AS mapped_sku,
       m.shopify_product_id,
       m.shopify_variant_id,
       m.shopify_inventory_item_id,
       m.shopify_product_title,
       m.shopify_variant_title,
       m.shopify_product_status,
       m.sync_status,
       m.last_synced_csikszereda_qty,
       m.last_synced_kezdi_qty,
       m.last_synced_at,
       m.last_error,
       m.updated_at,
       NULLIF(trim(v.barcode),'') AS current_sku,
       v.internal_sku,
       v.size,
       v.color_code,
       v.color_name,
       pm.title_ro,
       pm.model_code,
       b.name AS brand_name
     FROM aif_shopify_variant_map m
     JOIN aif_product_variants v ON v.id=m.variant_id
     JOIN aif_product_models pm ON pm.id=v.model_id
     LEFT JOIN aif_brands b ON b.id=pm.brand_id
     ${where}
     ORDER BY m.updated_at DESC
     LIMIT $1`,
    values
  );
  return result.rows;
}


export async function decorateAifShopifyMappings(client, mappings = []) {
  await ensureAifShopifyExportSchema(client);
  const rows = Array.isArray(mappings) ? mappings : [];
  const variantIds = unique(rows.map((row) => text(row?.variant_id)).filter(Boolean));
  if (!variantIds.length) return rows;

  const details = await client.query(
    `SELECT
       v.id::text AS variant_id,
       v.model_id::text AS model_id,
       v.status AS variant_status,
       pm.status AS model_status,
       pm.title_ro,
       pm.model_code,
       b.name AS brand_name,
       NULLIF(trim(v.barcode),'') AS current_sku,
       COALESCE(st.total_stock,0)::int AS total_stock,
       COALESCE(st.available_stock,0)::int AS available_stock,
       COALESCE(st.stock_location_count,0)::int AS stock_location_count
     FROM aif_product_variants v
     JOIN aif_product_models pm ON pm.id=v.model_id
     LEFT JOIN aif_brands b ON b.id=pm.brand_id
     LEFT JOIN LATERAL (
       SELECT
         COALESCE(sum(COALESCE(s.qty,0)),0)::int AS total_stock,
         COALESCE(sum(GREATEST(COALESCE(s.qty,0)-COALESCE(s.reserved_qty,0),0)),0)::int AS available_stock,
         count(DISTINCT s.location_id) FILTER (WHERE COALESCE(s.qty,0) > 0)::int AS stock_location_count
       FROM aif_stock s
       WHERE s.variant_id=v.id
     ) st ON true
     WHERE v.id::text = ANY($1::text[])`,
    [variantIds]
  );
  const byVariant = new Map(details.rows.map((row) => [text(row.variant_id), row]));

  return rows.map((row) => {
    const extra = byVariant.get(text(row?.variant_id)) || {};
    const syncStatus = normalizeKey(row?.sync_status);
    const outboxStatus = normalizeKey(row?.outbox_status);
    const isBroken = Boolean(text(row?.last_error) || text(row?.outbox_error))
      || ["error", "failed", "blocked"].includes(syncStatus)
      || ["error", "failed", "blocked"].includes(outboxStatus);
    const isArchived = normalizeKey(extra.variant_status) === "archived"
      || normalizeKey(extra.model_status) === "archived";
    const totalStock = integer(extra.total_stock, 0);
    const safeCleanup = isArchived || (isBroken && totalStock <= 0);
    const cleanupReason = isArchived
      ? "archived"
      : isBroken && totalStock <= 0
        ? "zero_stock_broken"
        : null;

    return {
      ...row,
      ...extra,
      barcode: text(extra.current_sku) || row?.barcode || row?.sku || null,
      total_stock: totalStock,
      available_stock: integer(extra.available_stock, 0),
      stock_location_count: integer(extra.stock_location_count, 0),
      allin_product_key: text(extra.model_id) || text(row?.shopify_product_id) || text(row?.variant_id),
      safe_cleanup: safeCleanup,
      cleanup_reason: cleanupReason,
      reexport_ready: Boolean(isBroken && !isArchived && totalStock > 0),
    };
  });
}

export async function cleanupAifShopifyMappings(client, options = {}) {
  await ensureAifShopifyExportSchema(client);
  const variantIds = unique((options.variantIds || []).map(text)).filter(Boolean);
  const includeArchived = options.includeArchived !== false;
  const includeZeroStockBroken = options.includeZeroStockBroken !== false;
  const predicates = [];

  if (includeArchived) {
    predicates.push(`(
      COALESCE(v.status,'active')='archived'
      OR COALESCE(pm.status,'active')='archived'
    )`);
  }
  if (includeZeroStockBroken) {
    predicates.push(`(
      COALESCE(st.total_stock,0) <= 0
      AND (
        COALESCE(m.sync_status,'') IN ('error','failed','blocked')
        OR NULLIF(trim(COALESCE(m.last_error,'')),'') IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM aif_shopify_sync_outbox o
          WHERE o.variant_id=m.variant_id
            AND (
              COALESCE(o.status,'') IN ('error','failed','blocked')
              OR NULLIF(trim(COALESCE(o.last_error,'')),'') IS NOT NULL
            )
        )
      )
    )`);
  }
  if (!predicates.length) {
    return {
      ok: true,
      deleted: 0,
      archived: 0,
      zeroStockBroken: 0,
      productCount: 0,
      variantIds: [],
      stockUntouched: true,
      productsUntouched: true,
    };
  }

  const args = [];
  let idFilter = "";
  if (variantIds.length) {
    args.push(variantIds);
    idFilter = `AND m.variant_id::text = ANY($${args.length}::text[])`;
  }

  const candidates = await client.query(
    `SELECT
       m.variant_id::text AS variant_id,
       v.model_id::text AS model_id,
       COALESCE(v.status,'active') AS variant_status,
       COALESCE(pm.status,'active') AS model_status,
       COALESCE(st.total_stock,0)::int AS total_stock
     FROM aif_shopify_variant_map m
     JOIN aif_product_variants v ON v.id=m.variant_id
     JOIN aif_product_models pm ON pm.id=v.model_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(sum(COALESCE(s.qty,0)),0)::int AS total_stock
       FROM aif_stock s
       WHERE s.variant_id=m.variant_id
     ) st ON true
     WHERE (${predicates.join(" OR ")})
       ${idFilter}
     ORDER BY m.updated_at DESC
     FOR UPDATE OF m`,
    args
  );

  const ids = unique(candidates.rows.map((row) => text(row.variant_id)).filter(Boolean));
  if (!ids.length) {
    return {
      ok: true,
      deleted: 0,
      archived: 0,
      zeroStockBroken: 0,
      productCount: 0,
      variantIds: [],
      stockUntouched: true,
      productsUntouched: true,
    };
  }

  await client.query(
    `DELETE FROM aif_shopify_sync_outbox
     WHERE variant_id::text = ANY($1::text[])`,
    [ids]
  );
  const deleted = await client.query(
    `DELETE FROM aif_shopify_variant_map
     WHERE variant_id::text = ANY($1::text[])
     RETURNING variant_id::text`,
    [ids]
  );

  const archived = candidates.rows.filter((row) =>
    normalizeKey(row.variant_status) === "archived" || normalizeKey(row.model_status) === "archived"
  ).length;
  const zeroStockBroken = candidates.rows.length - archived;
  const productCount = new Set(candidates.rows.map((row) => text(row.model_id)).filter(Boolean)).size;

  return {
    ok: true,
    deleted: deleted.rowCount,
    archived,
    zeroStockBroken,
    productCount,
    variantIds: deleted.rows.map((row) => text(row.variant_id)),
    stockUntouched: true,
    productsUntouched: true,
  };
}

export async function detachAifShopifyMappingsForReexport(client, variantIds = []) {
  await ensureAifShopifyExportSchema(client);
  const ids = unique((variantIds || []).map(text)).filter(Boolean).slice(0, 1000);
  if (!ids.length) {
    return {
      ok: true,
      detached: 0,
      productCount: 0,
      variantIds: [],
      items: [],
      skipped: 0,
      stockUntouched: true,
      productsUntouched: true,
    };
  }

  const candidates = await client.query(
    `SELECT
       m.variant_id::text AS variant_id,
       v.model_id::text AS model_id,
       pm.title_ro,
       pm.model_code,
       b.name AS brand_name,
       NULLIF(trim(v.barcode),'') AS sku,
       COALESCE(st.total_stock,0)::int AS total_stock
     FROM aif_shopify_variant_map m
     JOIN aif_product_variants v ON v.id=m.variant_id
     JOIN aif_product_models pm ON pm.id=v.model_id
     LEFT JOIN aif_brands b ON b.id=pm.brand_id
     LEFT JOIN LATERAL (
       SELECT COALESCE(sum(COALESCE(s.qty,0)),0)::int AS total_stock
       FROM aif_stock s
       WHERE s.variant_id=m.variant_id
     ) st ON true
     LEFT JOIN aif_shopify_sync_outbox o ON o.variant_id=m.variant_id
     WHERE m.variant_id::text = ANY($1::text[])
       AND COALESCE(v.status,'active') <> 'archived'
       AND COALESCE(pm.status,'active') <> 'archived'
       AND COALESCE(st.total_stock,0) > 0
       AND (
         COALESCE(m.sync_status,'') IN ('error','failed','blocked')
         OR NULLIF(trim(COALESCE(m.last_error,'')),'') IS NOT NULL
         OR COALESCE(o.status,'') IN ('error','failed','blocked')
         OR NULLIF(trim(COALESCE(o.last_error,'')),'') IS NOT NULL
       )
     ORDER BY pm.title_ro, v.color_code, v.size
     FOR UPDATE OF m`,
    [ids]
  );

  const detachedIds = unique(candidates.rows.map((row) => text(row.variant_id)).filter(Boolean));
  if (detachedIds.length) {
    await client.query(
      `DELETE FROM aif_shopify_sync_outbox
       WHERE variant_id::text = ANY($1::text[])`,
      [detachedIds]
    );
    await client.query(
      `DELETE FROM aif_shopify_variant_map
       WHERE variant_id::text = ANY($1::text[])`,
      [detachedIds]
    );
  }

  return {
    ok: true,
    detached: detachedIds.length,
    productCount: new Set(candidates.rows.map((row) => text(row.model_id)).filter(Boolean)).size,
    variantIds: detachedIds,
    items: candidates.rows,
    skipped: Math.max(0, ids.length - detachedIds.length),
    stockUntouched: true,
    productsUntouched: true,
  };
}

async function markMappingBroken(client, mapping, message, details = {}) {
  const cleanMessage = text(message).slice(0, 1000) || "A Shopify kapcsolat megszakadt.";
  await client.query(
    `UPDATE aif_shopify_variant_map
     SET sync_status='error',
         last_error=$2,
         raw=COALESCE(raw,'{}'::jsonb) || $3::jsonb,
         updated_at=now()
     WHERE variant_id=$1::uuid`,
    [
      mapping.variant_id,
      cleanMessage,
      JSON.stringify({
        source: "mapping_refresh",
        brokenAt: new Date().toISOString(),
        ...details,
      }),
    ]
  );
  await client.query(
    `UPDATE aif_shopify_sync_outbox
     SET status='blocked',
         locked_at=NULL,
         last_error=$2,
         updated_at=now()
     WHERE variant_id=$1::uuid`,
    [mapping.variant_id, cleanMessage]
  );
}

async function upsertMappingFromRemote(client, mapping, remote) {
  const remoteInfo = compactRemoteVariantForMapping(remote);
  const expectedSku = text(mapping.current_sku || mapping.mapped_sku);
  const changed =
    text(mapping.shopify_variant_id) !== remoteInfo.id ||
    text(mapping.shopify_product_id) !== remoteInfo.productId ||
    text(mapping.shopify_inventory_item_id) !== remoteInfo.inventoryItemId;

  await client.query(
    `INSERT INTO aif_shopify_variant_map (
       variant_id, sku, shopify_product_id, shopify_variant_id, shopify_inventory_item_id,
       shopify_product_title, shopify_variant_title, shopify_product_status,
       sync_status, last_error, raw, updated_at
     ) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10::jsonb,now())
     ON CONFLICT (variant_id) DO UPDATE SET
       sku=EXCLUDED.sku,
       shopify_product_id=EXCLUDED.shopify_product_id,
       shopify_variant_id=EXCLUDED.shopify_variant_id,
       shopify_inventory_item_id=EXCLUDED.shopify_inventory_item_id,
       shopify_product_title=EXCLUDED.shopify_product_title,
       shopify_variant_title=EXCLUDED.shopify_variant_title,
       shopify_product_status=EXCLUDED.shopify_product_status,
       sync_status=CASE WHEN $11::boolean THEN 'mapped' ELSE aif_shopify_variant_map.sync_status END,
       last_synced_csikszereda_qty=CASE WHEN $11::boolean THEN NULL ELSE aif_shopify_variant_map.last_synced_csikszereda_qty END,
       last_synced_kezdi_qty=CASE WHEN $11::boolean THEN NULL ELSE aif_shopify_variant_map.last_synced_kezdi_qty END,
       last_synced_at=CASE WHEN $11::boolean THEN NULL ELSE aif_shopify_variant_map.last_synced_at END,
       last_error=NULL,
       raw=COALESCE(aif_shopify_variant_map.raw,'{}'::jsonb) || EXCLUDED.raw,
       updated_at=now()`,
    [
      mapping.variant_id,
      expectedSku || remoteInfo.sku || null,
      remoteInfo.productId,
      remoteInfo.id,
      remoteInfo.inventoryItemId,
      remoteInfo.productTitle,
      remoteInfo.title,
      remoteInfo.productStatus,
      changed ? "mapped" : text(mapping.sync_status || "mapped"),
      JSON.stringify({
        source: "mapping_refresh",
        refreshedAt: new Date().toISOString(),
        repaired: changed,
        previous: {
          productId: mapping.shopify_product_id,
          variantId: mapping.shopify_variant_id,
          inventoryItemId: mapping.shopify_inventory_item_id,
        },
        shopify: remoteInfo,
      }),
      changed,
    ]
  );
  return { changed, remote: remoteInfo };
}

export async function refreshAifShopifyMappings(client, options = {}) {
  await ensureAifShopifyExportSchema(client);
  // Archivált AllIn variánsokhoz nincs értelme élő Shopify kapcsolatot őrizni.
  // Ezeket minden ellenőrzés elején automatikusan takarítjuk; készlethez és termékhez nem nyúlunk.
  const cleanup = await cleanupAifShopifyMappings(client, {
    includeArchived: true,
    includeZeroStockBroken: false,
  });
  const syncAll = bool(options.sync, false);
  const syncRepaired = options.syncRepaired !== false;
  const mappings = await loadMappingsForRefresh(client, options);
  const shopifyVariants = await loadAllShopifyVariants();

  const byId = new Map();
  const bySku = new Map();
  for (const variant of shopifyVariants) {
    const id = text(variant?.id);
    if (id) byId.set(id, variant);
    const sku = normalizeKey(variant?.sku);
    if (!sku) continue;
    const list = bySku.get(sku) || [];
    list.push(variant);
    bySku.set(sku, list);
  }

  let valid = 0;
  let repaired = 0;
  let broken = 0;
  let queued = 0;
  let unchanged = 0;
  const items = [];

  for (const mapping of mappings) {
    const expectedSku = text(mapping.current_sku || mapping.mapped_sku);
    let remote = byId.get(text(mapping.shopify_variant_id)) || null;
    let matchedBy = remote ? "stored_id" : "";

    if (remote && expectedSku && normalizeKey(remote?.sku) !== normalizeKey(expectedSku)) {
      remote = null;
      matchedBy = "";
    }

    if (!remote && expectedSku) {
      const matches = bySku.get(normalizeKey(expectedSku)) || [];
      if (matches.length === 1) {
        remote = matches[0];
        matchedBy = "sku";
      } else {
        const message = matches.length > 1
          ? `A Shopifyban ${matches.length} variáns használja ezt az SKU-t: ${expectedSku}.`
          : `A Shopify variáns nem található ehhez az SKU-hoz: ${expectedSku}.`;
        await markMappingBroken(client, mapping, message, {
          expectedSku,
          storedShopifyVariantId: mapping.shopify_variant_id,
          matchCount: matches.length,
        });
        broken += 1;
        items.push({
          variantId: mapping.variant_id,
          sku: expectedSku,
          state: "broken",
          repaired: false,
          queued: false,
          error: message,
        });
        continue;
      }
    }

    if (!remote) {
      const message = "A tárolt Shopify variáns már nem létezik, és nincs használható SKU az újrakereséshez.";
      await markMappingBroken(client, mapping, message, {
        expectedSku,
        storedShopifyVariantId: mapping.shopify_variant_id,
      });
      broken += 1;
      items.push({
        variantId: mapping.variant_id,
        sku: expectedSku,
        state: "broken",
        repaired: false,
        queued: false,
        error: message,
      });
      continue;
    }

    const updated = await upsertMappingFromRemote(client, mapping, remote);
    if (updated.changed) repaired += 1;
    else unchanged += 1;
    valid += 1;

    let queueResult = null;
    if (syncAll || (updated.changed && syncRepaired)) {
      queueResult = await enqueueAifShopifyVariant(
        client,
        mapping.variant_id,
        updated.changed ? "mapping_repaired_resync" : "manual_mapping_resync"
      );
      if (queueResult?.queued) queued += 1;
    }

    items.push({
      variantId: mapping.variant_id,
      sku: expectedSku || updated.remote.sku,
      state: updated.changed ? "repaired" : "valid",
      repaired: updated.changed,
      queued: Boolean(queueResult?.queued),
      matchedBy,
      shopifyProductId: updated.remote.productId,
      shopifyVariantId: updated.remote.id,
      inventoryItemId: updated.remote.inventoryItemId,
      productTitle: updated.remote.productTitle,
      variantTitle: updated.remote.title,
      queue: queueResult,
    });
  }

  return {
    ok: true,
    checked: mappings.length,
    valid,
    unchanged,
    repaired,
    broken,
    queued,
    cleanup,
    syncRequested: syncAll,
    syncRepaired,
    items,
    generatedAt: new Date().toISOString(),
  };
}

export async function deleteAifShopifyProductExports(client, exportIds = []) {
  await ensureAifShopifyExportSchema(client);
  const ids = unique((exportIds || []).map(text)).filter(Boolean).slice(0, 500);
  if (!ids.length) return { ok: true, deleted: 0, deletedItems: 0, ids: [] };

  const itemCount = await client.query(
    `SELECT count(*)::int AS count
     FROM aif_shopify_product_export_items
     WHERE export_id::text = ANY($1::text[])`,
    [ids]
  );
  const deleted = await client.query(
    `DELETE FROM aif_shopify_product_exports
     WHERE id::text = ANY($1::text[])
     RETURNING id::text`,
    [ids]
  );
  return {
    ok: true,
    deleted: deleted.rowCount,
    deletedItems: integer(itemCount.rows[0]?.count, 0),
    ids: deleted.rows.map((row) => row.id),
    mappingsUntouched: true,
    stockUntouched: true,
  };
}

export async function deleteAifShopifyProductExport(client, exportId) {
  const result = await deleteAifShopifyProductExports(client, [exportId]);
  return result.deleted ? result : null;
}
