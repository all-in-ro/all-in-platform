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


function canonicalCatalogTag(value) {
  const key = tagValue(value);
  if (!key) return "";

  const compact = key.replace(/-/g, "");

  // Lábbeli elírás / alias
  if (
    [
      "incaltaminte",
      "incaltaminmte"
    ].includes(compact)
  ) {
    return "incaltaminte";
  }

  // Kötött / téli sapka aliasok
  if (
    [
      "caciula",
      "caciuli",
      "beanie",
      "beanies"
    ].includes(compact)
  ) {
    return "caciula";
  }

  // Papucs aliasok
  if (
    [
      "papuc",
      "papuci",
      "slap",
      "slapi",
      "flipflop",
      "flipflops",
      "slide",
      "slides"
    ].includes(compact)
  ) {
    return "papuci";
  }

  return key;
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

function audienceSignalText(row) {
  if (!row || typeof row !== "object") return normalizeKey(row);
  return normalizeKey([
    row?.gender,
    row?.brand_name,
    row?.brand,
    row?.brand_code,
    row?.shopify_title,
    row?.title_ro,
    row?.title_hu,
    row?.title,
    row?.model_code,
    row?.productCode,
    row?.product_code,
    row?.supplier_product_code,
    row?.supplier_variant_code,
    row?.internal_sku,
    row?.category_name_ro,
    row?.category_name_hu,
    row?.category_code,
    row?.subcategory_name_ro,
    row?.subcategory_name_hu,
    row?.subcategory_code,
    row?.product_type,
  ].filter(Boolean).join(" "))
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function brandSpecificAudienceProfile(row) {
  if (!row || typeof row !== "object") return { ageGroup: "", gender: "" };

  const brand = normalizeKey(row?.brand_name || row?.brand || row?.brand_code);
  const sources = [
    row?.shopify_title,
    row?.title_ro,
    row?.title_hu,
    row?.title,
    row?.model_code,
    row?.productCode,
    row?.product_code,
    row?.supplier_product_code,
    row?.supplier_variant_code,
    row?.internal_sku,
  ].map((value) => normalizeKey(value)).filter(Boolean);
  const codeText = sources.join(" ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const padded = ` ${codeText} `;

  // Under Armour naming is highly regular in the legacy catalog:
  // UA M = men, UA W = women, UA B = boys, UA G = girls, UA Y = youth.
  // These short prefixes are much stronger than an empty / wrong legacy gender field.
  if (brand.includes("under armour") || padded.includes(" ua ")) {
    if (/\bua\s+b\b/.test(codeText)) return { ageGroup: "kids", gender: "male" };
    if (/\bua\s+g\b/.test(codeText)) return { ageGroup: "kids", gender: "female" };
    if (/\bua\s+y\b/.test(codeText)) return { ageGroup: "kids", gender: "unisex" };
    if (/\bua\s+w\b/.test(codeText)) return { ageGroup: "adult", gender: "female" };
    if (/\bua\s+m\b/.test(codeText)) return { ageGroup: "adult", gender: "male" };
  }

  // 4F product codes need two layers of interpretation.
  // 4FJ... is the junior line, while M/F/U in the model suffix indicates
  // boy / girl / unisex inside that junior line. This junior marker MUST win
  // before the generic adult M/F/U rule, otherwise codes such as
  // 4FJ...M520 are incorrectly classified as adult men.
  if (brand === "4f" || brand.startsWith("4f ")) {
    const junior4f = sources.some((source) => /(?:^|[^a-z0-9])4fj/i.test(source) || /^4fj/i.test(source));

    let modelToken = "";
    for (const source of sources) {
      const match = source.match(/(?:^|[^a-z0-9])([mfu])\s*0*\d{2,4}(?:[^a-z0-9]|$)/i);
      if (!match) continue;
      modelToken = normalizeKey(match[1]);
      break;
    }

    if (junior4f) {
      if (modelToken === "f") return { ageGroup: "kids", gender: "female" };
      if (modelToken === "m") return { ageGroup: "kids", gender: "male" };
      return { ageGroup: "kids", gender: "unisex" };
    }

    // Adult 4F legacy model names use M/F/U directly before the model number.
    // Only apply this rule to 4F so a random letter+number in another brand cannot
    // silently change the audience.
    if (modelToken === "f") return { ageGroup: "adult", gender: "female" };
    if (modelToken === "m") return { ageGroup: "adult", gender: "male" };
    if (modelToken === "u") return { ageGroup: "adult", gender: "unisex" };

    for (const source of sources) {
      const juniorToken = source.match(/(?:^|[^a-z0-9])j\s*0*\d{2,4}(?:[^a-z0-9]|$)/i);
      if (juniorToken) return { ageGroup: "kids", gender: "unisex" };
    }
  }

  return { ageGroup: "", gender: "" };
}

function hasAudienceToken(haystack, tokens) {
  const padded = ` ${text(haystack)} `;
  return (tokens || []).some((token) => padded.includes(` ${normalizeKey(token)} `));
}

function shopifyAudienceProfile(value) {
  if (!value || typeof value !== "object") {
    const ageGroup = shopifyAgeGroup(value);
    const gender = shopifyGender(value);
    return {
      ageGroup,
      gender,
      audience: ageGroup === "kids"
        ? "Copii"
        : gender === "female"
          ? "Femei"
          : gender === "male"
            ? "Bărbați"
            : "Unisex",
    };
  }

  const haystack = audienceSignalText(value);
  const rawGender = text(value?.gender);
  const rawGenderNormalized = shopifyGender(rawGender);
  const brandProfile = brandSpecificAudienceProfile(value);

  const explicitChildSignal = hasAudienceToken(haystack, [
    "copii", "copil", "copila", "copilasi", "junior", "kids", "kid", "children", "child",
    "boys", "boy", "girls", "girl", "baieti", "baiat", "fete", "fata",
    "gyerek", "gyermek", "fiuk", "fiu", "lanyok", "lany", "youth",
  ]);

  const femaleSignal = hasAudienceToken(haystack, [
    "women", "woman", "female", "femei", "femeie", "feminin", "dama", "doamne",
    "lady", "ladies", "noi", "no", "girls", "girl", "fete", "fata", "lany", "lanyok",
  ]);

  const maleSignal = hasAudienceToken(haystack, [
    "men", "man", "male", "barbati", "barbat", "masculin", "ferfi", "ferfiak",
    "boys", "boy", "baieti", "baiat", "fiuk", "fiu",
  ]);

  // Human-readable title/category wording wins. If the legacy title is neutral,
  // brand-specific model conventions are the next strongest signal; raw gender is last.
  let gender = rawGenderNormalized;
  if (femaleSignal && !maleSignal) gender = "female";
  else if (maleSignal && !femaleSignal) gender = "male";
  else if (brandProfile.gender) gender = brandProfile.gender;
  else if (femaleSignal && maleSignal && rawGenderNormalized === "unisex") gender = "unisex";

  const ageGroup = explicitChildSignal || shopifyAgeGroup(rawGender) === "kids" || brandProfile.ageGroup === "kids"
    ? "kids"
    : "adult";
  const audience = ageGroup === "kids"
    ? "Copii"
    : gender === "female"
      ? "Femei"
      : gender === "male"
        ? "Bărbați"
        : "Unisex";

  return { ageGroup, gender, audience };
}

function shopifyGenderForRow(row) {
  return shopifyAudienceProfile(row).gender;
}

function shopifyAgeGroupForRow(row) {
  return shopifyAudienceProfile(row).ageGroup;
}

function shopifyAudience(value) {
  return shopifyAudienceProfile(value).audience;
}

function audienceTechnicalTag(value) {
  const audience = shopifyAudience(value);
  if (audience === "Bărbați") return "audience-barbati";
  if (audience === "Femei") return "audience-femei";
  if (audience === "Copii") return "audience-copii";
  return "audience-unisex";
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
  /*
   * AIF_PRODUCT_TYPE_TAXONOMY_V1
   *
   * Saját AllIn product_type elsőbbséget élvez a legacy / supplier
   * kategóriákkal és a termékcímben előforduló véletlen szavakkal szemben.
   */
  const productTypeKey = text(row.product_type)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const productTitleKey = [
    row.shopify_title,
    row.title_ro,
    row.title,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (productTypeKey === "tricouri") {
    return "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts";
  }

  if (productTypeKey === "pantaloni") {
    return "Apparel & Accessories > Clothing > Pants";
  }

  if (productTypeKey === "pantaloni scurti") {
    return "Apparel & Accessories > Clothing > Shorts";
  }

  if (productTypeKey === "colanti") {
    return "Apparel & Accessories > Clothing > Pants > Leggings";
  }

  if (productTypeKey === "jachete") {
    return "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets";
  }

  if (productTypeKey === "bluza") {
    return "Apparel & Accessories > Clothing > Clothing Tops";
  }

  if (productTypeKey === "sorturi de baie") {
    return "Apparel & Accessories > Clothing > Swimwear > Swim Shorts";
  }

  if (productTypeKey === "papuci") {
    return "Apparel & Accessories > Shoes > Slippers";
  }

  if (productTypeKey === "pantofi sport") {
    return "Apparel & Accessories > Shoes";
  }

  if (productTypeKey === "caciula") {
    return "Apparel & Accessories > Clothing Accessories > Hats > Beanies";
  }

  if (productTypeKey === "sepci") {
    return "Apparel & Accessories > Clothing Accessories > Hats > Baseball Caps";
  }

  if (productTypeKey === "sosete") {
    return "Apparel & Accessories > Clothing > Socks";
  }

  if (productTypeKey === "boxeri") {
    return "Apparel & Accessories > Clothing > Men's Undergarments > Men's Underwear > Boxer Briefs";
  }

  if (productTypeKey === "genti") {
    return "Apparel & Accessories > Handbags, Wallets & Cases";
  }

  if (productTypeKey === "bentita") {
    return "Apparel & Accessories > Clothing Accessories";
  }

  if (productTypeKey === "hanorac") {
    const hasHood =
      /\bhoodie\b/.test(productTitleKey) ||
      /\bgluga\b/.test(productTitleKey);

    return hasHood
      ? "Apparel & Accessories > Clothing > Clothing Tops > Hoodies"
      : "Apparel & Accessories > Clothing > Clothing Tops > Sweatshirts";
  }

  if (productTypeKey === "veste") {
    return "Apparel & Accessories > Clothing > Outerwear > Vests";
  }

  if (productTypeKey === "polar") {
    const hasHood =
      /\bhoodie\b/.test(productTitleKey) ||
      /\bgluga\b/.test(productTitleKey);

    return hasHood
      ? "Apparel & Accessories > Clothing > Clothing Tops > Hoodies"
      : "Apparel & Accessories > Clothing > Clothing Tops > Sweatshirts";
  }

  if (productTypeKey === "treninguri") {
    return "Apparel & Accessories > Clothing > Activewear";
  }

  const structuredHaystack = normalizeKey([
    row.category_name_ro,
    row.category_name_hu,
    row.category_code,
    row.subcategory_name_ro,
    row.subcategory_name_hu,
    row.subcategory_code,
    row.product_type,
  ].filter(Boolean).join(" "));

  // Strong outerwear classification must win before an accidentally
  // inherited Dress category from legacy / supplier catalog data.
  //
  // Important: generic "veste" alone is NOT enough, because Veste has its
  // own storefront category. A vest is treated as jacket only when the
  // product title clearly says Jacket / Down / Softshell / Puffer etc.
  const titleHaystack = normalizeKey([
    row.shopify_title,
    row.title_ro,
    row.title,
  ].filter(Boolean).join(" "));

  const structuredOuterwear =
    /jacket|jacheta|jachete|geaca|geci|dzseki|kab[aá]t|palton|outerwear|softshell|puffer|parka/.test(structuredHaystack) ||
    (
      /(^|\s)(vest|vesta|veste)(\s|$)/.test(structuredHaystack) &&
      /jacket|down|softshell|puffer|parka/.test(titleHaystack)
    );

  if (structuredOuterwear) {
    return "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets";
  }

  // Strong structured T-Shirt classification must win over an incorrectly
  // inherited Dress category from legacy / supplier catalog data.
  const structuredTshirt =
    /\bt-?shirt\b|\btricou(?:ri)?\b/.test(structuredHaystack);

  if (structuredTshirt) {
    return "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts";
  }

  // Explicit Dress classification wins over incidental title words,
  // unless our own structured product data already identified a T-Shirt.
  if (/dress|ruha|rochie/.test(structuredHaystack)) {
    return "Apparel & Accessories > Clothing > Dresses";
  }
  if (/sock|zokni|soset|șoset/.test(structuredHaystack)) {
    return "Apparel & Accessories > Clothing > Socks";
  }
  if (/boxer|boxeri|boxer brief|boxer-brief|alsonadrag|alsónadrág|chiloti|chiloți/.test(structuredHaystack)) {
    return "Apparel & Accessories > Clothing > Men's Undergarments > Men's Underwear > Boxer Briefs";
  }

  const haystack = normalizeKey([
    row.shopify_title,
    row.title_ro,
    row.title,
    structuredHaystack,
  ].filter(Boolean).join(" "));

  // Papuci / Slapi / Flipflop / Slides
  // Az általános Shoes szabály előtt kell eldönteni.
  if (/papuc|slapi|flip[\s_-]?flop|slides?/.test(haystack)) {
    return "Apparel & Accessories > Shoes > Slippers";
  }

  if (/shoe|shoes|cip[oő]|pantof|incalt|incălț|sneaker|sportcip/.test(haystack)) {
    return "Apparel & Accessories > Shoes";
  }
  if (/jacket|jacheta|jachete|dzseki|kab[aá]t|geaca|geci|palton|outerwear|softshell|puffer|parka/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets";
  }
  if (/\bt-?shirt\b|p[oó]l[oó]|\btricou(?:ri)?\b/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts";
  }
  if (/shirt|bluz|top|fels[oő]|camasa|cămaș/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Clothing Tops";
  }
  if (/short|pantaloni[ _-]?scurti|r[oö]vidnadr[aá]g/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Shorts";
  }
  if (/pants|trouser|nadr[aá]g|pantalon/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Pants";
  }
  if (/dress|ruha|rochie/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Dresses";
  }
  if (/skirt|szoknya|fusta|fustă/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Skirts";
  }
  if (/sock|zokni|soset|șoset/.test(haystack)) {
    // Shopify 2026 taxonomy: the old "Underwear & Socks > Socks" path is archived.
    return "Apparel & Accessories > Clothing > Socks";
  }
  if (/boxer|boxeri|boxer brief|boxer-brief|alsonadrag|alsónadrág|chiloti|chiloți/.test(haystack)) {
    return "Apparel & Accessories > Clothing > Men's Undergarments > Men's Underwear > Boxer Briefs";
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


function derivedCatalogTags(row) {
  /*
   * AIF_DERIVED_CATALOG_TAGS_V2
   *
   * Fontos:
   * row.product_type a nyers AllIn / supplier típus.
   * Pl. GEACA, GEACA SOFTSHELL, Training, BOXER,
   * RUCSAC, BORSETA.
   *
   * A storefront fő terméktípus elsődleges forrása ezért
   * subcategory_name_ro, ugyanúgy, ahogy az export többi
   * részében is.
   */

  const normalize = (value) =>
    text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const catalogTypeKey =
    normalize(
      row?.subcategory_name_ro ||
      row?.product_type
    );

  const rawTypeKey =
    normalize(
      row?.product_type
    );

  const titleKey =
    normalize([
      row?.shopify_title,
      row?.title_ro,
      row?.title,
    ]
      .map(text)
      .filter(Boolean)
      .join(" "));

  const tags = [];

  /*
   * JACHETE
   */

  if (
    catalogTypeKey === "jachete" &&
    (
      rawTypeKey.includes("softshell") ||
      /\bsoftshell\b/.test(titleKey)
    )
  ) {
    tags.push(
      "jachete-softshell"
    );
  }

  if (
    catalogTypeKey === "jachete" &&
    (
      /\bdown jacket\b/.test(titleKey) ||
      /\bpuffer\b/.test(titleKey) ||
      /\bwinter\b/.test(titleKey) ||
      /\biarna\b/.test(titleKey)
    )
  ) {
    tags.push(
      "jachete-iarna"
    );
  }

  if (
    catalogTypeKey === "jachete" &&
    (
      /\btechnical\b/.test(titleKey) ||
      /\btehnic/.test(titleKey) ||
      /\bwindbreaker\b/.test(titleKey) ||
      /\bwind\b/.test(titleKey) ||
      /\bvant\b/.test(titleKey)
    )
  ) {
    tags.push(
      "jachete-tehnice"
    );
  }

  /*
   * PANTALONI TRENING
   *
   * A nyers type=Training fontos a 4F TROUSERS
   * modelleknél, ahol a cím nem mondja ki, hogy trening.
   */

  if (
    catalogTypeKey === "pantaloni" &&
    (
      rawTypeKey === "training" ||
      /trening/.test(titleKey) ||
      /\bjogger/.test(titleKey) ||
      /sweatpant/.test(titleKey) ||
      /track pant/.test(titleKey)
    )
  ) {
    tags.push(
      "pantaloni-trening"
    );
  }

  /*
   * LENJERIE
   */

  if (
    [
      "boxeri",
      "chiloti",
      "tanga",
      "sutiene",
    ].includes(catalogTypeKey) ||
    [
      "boxer",
      "boxeri",
      "chiloti",
      "tanga",
      "sutien",
      "sutiene",
    ].includes(rawTypeKey)
  ) {
    tags.push(
      "lenjerie-intima"
    );
  }

  /*
   * GENȚI
   */

  if (catalogTypeKey === "genti") {
    if (
      rawTypeKey === "rucsac" ||
      /rucsac|backpack|sackpack/.test(
        titleKey
      )
    ) {
      tags.push(
        "rucsacuri"
      );
    }

    if (
      rawTypeKey === "borseta" ||
      /borset|crossbody|xbody|waist bag|bum bag/.test(
        titleKey
      )
    ) {
      tags.push(
        "borsete"
      );
    }
  }

  return unique(tags);
}

function buildTags(row) {
  const profile = shopifyAudienceProfile(row);

  /*
   * Az audience tagek kizárólag a normalizált profile-ból jöhetnek.
   * Így junior / Fete / Băieți / Copii termék nem csúszhat vissza
   * Bărbați vagy Femei alá egy nyers gender mező miatt.
   */
  const reservedAudienceTags = new Set([
    "barbati", "barbat", "men", "male", "masculin",
    "femei", "femeie", "women", "female", "feminin", "dama",
    "copii", "copil", "kids", "kid", "children", "child", "junior",
    "boys", "boy", "baieti", "baiat",
    "girls", "girl", "fete", "fata",
    "unisex",
  ]);

  /*
   * A katalógus tageket kanonizáljuk:
   * incaltaminmte -> incaltaminte
   * caciuli / beanie -> caciula
   * slapi / flipflop / slides -> papuci
   */
  const normalizedTags = [
    "allinfashion",
    row.brand_name,
    row.category_name_ro,
    row.subcategory_name_ro,
    row.product_type,
    row.season,
    resolvedRowColorName(row),
  ]
    .map(canonicalCatalogTag)
    .filter(
      (value) =>
        value &&
        !reservedAudienceTags.has(normalizeKey(value))
    );

  const derivedTags =
    derivedCatalogTags(row);

  return unique([
    profile.audience,
    audienceTechnicalTag(row),
    `age-${profile.ageGroup}`,
    `gender-${profile.gender}`,
    shopifyStyle(row),
    ...normalizedTags,
    ...derivedTags,
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
  if (row?.shopify_option_mode === "size_only" || row?.color_required === false) {
    return `size::${normalizeKey(row.size)}`;
  }
  return `${normalizeKey(row.color_name)}::${normalizeKey(row.size)}`;
}


function canonicalHumanColorName(value) {
  const raw = text(value);
  if (!raw) return "";

  const key = normalizeKey(raw)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // Csak biztos legacy elírásokat normalizálunk. Ismeretlen színt nem találunk ki.
  const aliases = new Map([
    ["albastu", "albastru"],
    ["albastr", "albastru"],
    ["rosu", "roșu"],
  ]);

  return aliases.get(key) || raw;
}

function humanColorLabel(values) {
  const source = unique(
    (Array.isArray(values) ? values : [values])
      .map(canonicalHumanColorName)
      .filter(Boolean)
  );
  return source.find((value) => !isLikelySupplierColorCode(value)) || "";
}

function resolvedRowColorName(row) {
  return humanColorLabel([
    row?.color_name,
    row?.supplier_color_name,
    row?.mapped_color_name,
  ]);
}

/*
 * AIF_SHOPIFY_EXPORT_OPTION_NORMALIZATION_V2
 *
 * - live emberi színnév > supplier színnév > brand-color mapping
 * - ha egy product-code csoportban pontosan egy emberi szín ismert,
 *   az üres legacy variánsok azt biztonságosan öröklik
 * - ha az egész csoport szín nélküli, csak Méret opcióval exportálunk
 * - több ismert szín mellett egy üres szín továbbra is valódi hiba
 */
function normalizeExportRowsForOptions(rows, groupingMode = "product_code") {
  const baseRows = (rows || []).map((row) => ({
    ...row,
    color_name: resolvedRowColorName(row),
  }));

  const grouped = new Map();
  for (const row of baseRows) {
    const groupKey = productGroupKey(row, groupingMode);
    const list = grouped.get(groupKey) || [];
    list.push(row);
    grouped.set(groupKey, list);
  }

  const normalized = [];
  for (const [groupKey, groupRows] of grouped.entries()) {
    const groupColors = unique(
      groupRows
        .map((row) => resolvedRowColorName(row))
        .map(canonicalHumanColorName)
        .filter(Boolean)
    );

    const singleKnownColor = groupColors.length === 1 ? groupColors[0] : "";
    const colorRequired = groupColors.length > 0;

    for (const row of groupRows) {
      const directColor = resolvedRowColorName(row);
      const inheritedColor = !directColor && singleKnownColor ? singleKnownColor : "";
      const finalColor = directColor || inheritedColor;

      normalized.push({
        ...row,
        color_name: finalColor,
        color_required: colorRequired,
        color_inherited_from_group: Boolean(inheritedColor),
        shopify_option_mode: colorRequired ? "color_size" : "size_only",
        product_group_key: groupKey,
      });
    }
  }

  return normalized;
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
  if (row.color_required !== false && !text(row.color_name)) {
    errors.push("Hiányzik a használható színnév. Többszínű termékcsoportban a szín nem hagyható üresen.");
  }
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
  if (row.shopify_option_mode === "size_only") {
    warnings.push("Nincs használható színadat; a Shopify-termék csak Méret opcióval exportálódik.");
  }
  if (row.color_inherited_from_group && text(row.color_name)) {
    warnings.push(`A hiányzó színnév a termékcsoport egységes színéből öröklődött: ${text(row.color_name)}.`);
  }
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
       sc.supplier_color_name,
       sc.supplier_size,
       cc.mapped_color_name,
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
       SELECT supplier_product_code, supplier_variant_code, supplier_color_code, supplier_color_name, supplier_size
       FROM aif_variant_supplier_codes sc
       WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
       ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
       LIMIT 1
     ) sc ON true
     LEFT JOIN LATERAL (
       SELECT COALESCE(
         NULLIF(trim(ct.name_ro),''),
         NULLIF(trim(ct.name_hu),''),
         NULLIF(trim(ct.code),'')
       ) AS mapped_color_name
       FROM aif_brand_color_codes bcc
       JOIN aif_color_types ct ON ct.id=bcc.color_type_id
       WHERE bcc.brand_id=m.brand_id
         AND lower(trim(bcc.color_code)) = lower(trim(COALESCE(
           NULLIF(sc.supplier_color_code,''),
           NULLIF(v.color_code,''),
           ''
         )))
         AND COALESCE(bcc.is_active,true)=true
       ORDER BY bcc.updated_at DESC NULLS LAST, bcc.created_at DESC NULLS LAST
       LIMIT 1
     ) cc ON true
     LEFT JOIN aif_stock s ON s.variant_id=v.id
     LEFT JOIN aif_locations l ON l.id=s.location_id
     LEFT JOIN aif_shopify_variant_map svm ON svm.variant_id=v.id
     WHERE ${where}
       AND lower(COALESCE(v.status,'active')) = 'active'
       AND lower(COALESCE(m.status,'active')) = 'active'
     GROUP BY v.id, m.id, b.id, c.id, subc.id,
              sc.supplier_product_code, sc.supplier_variant_code, sc.supplier_color_code, sc.supplier_color_name, sc.supplier_size,
              cc.mapped_color_name,
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
  // A Shopify felé csak ember által olvasható színnév mehet.
  // A normalizáló a live színnév, supplier színnév és brand-color mapping alapján
  // dolgozik; teljesen szín nélküli product-code csoportnál csak Méret opciót használ.
  const normalizedRows = normalizeExportRowsForOptions(rows, groupingMode);
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
  for (const row of normalizedRows) {
    const image = imageFromRow(row);
    const groupKey = text(row.product_group_key) || productGroupKey(row, groupingMode);
    if (image && !productImageByGroup.has(groupKey)) productImageByGroup.set(groupKey, image);
  }
  const exportRows = normalizedRows.map((row) => {
    const groupKey = text(row.product_group_key) || productGroupKey(row, groupingMode);
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


function googleProductCategoryForShopifyCategory(category) {
  const key = normalizedCategoryPath(category);

  // A Shopify és a Google terméktaxonómia nem ugyanaz.
  // Google-nél inkább a stabil numerikus ID-t küldjük, és csak olyan
  // kategóriákra adunk explicit override-ot, amelyeket biztosan ismerünk.
  if (key === normalizedCategoryPath("Apparel & Accessories > Clothing > Socks")) return "209";
  if (key === normalizedCategoryPath("Apparel & Accessories > Shoes")) return "187";
  if (key === normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses")) return "2271";
  if (key === normalizedCategoryPath("Apparel & Accessories > Clothing > Pants")) return "204";
  if (key === normalizedCategoryPath("Apparel & Accessories > Clothing > Shorts")) return "207";
  if (key === normalizedCategoryPath("Apparel & Accessories > Clothing > Skirts")) return "1581";
  if (key === normalizedCategoryPath("Apparel & Accessories > Clothing > Outerwear > Coats & Jackets")) return "5598";
  if (
    key === normalizedCategoryPath("Apparel & Accessories > Clothing > Clothing Tops") ||
    key === normalizedCategoryPath("Apparel & Accessories > Clothing > Clothing Tops > T-Shirts")
  ) return "212";
  if (key === normalizedCategoryPath("Apparel & Accessories > Clothing > Men's Undergarments > Men's Underwear > Boxer Briefs")) return "2562";
  if (
    key === normalizedCategoryPath("Apparel & Accessories > Clothing Accessories > Hats") ||
    key === normalizedCategoryPath("Apparel & Accessories > Clothing Accessories > Hats > Baseball Caps") ||
    key === normalizedCategoryPath("Apparel & Accessories > Clothing Accessories > Hats > Beanies")
  ) return "173";

  // Az attribútum opcionális. Ismeretlen Shopify-kategóriánál jobb üresen
  // hagyni és a Google automatikus besorolására bízni, mint Shopify-útvonalat
  // küldeni egy másik taxonómiába.
  return "";
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
    const usesColorOption = modelItems.some((item) =>
      item?.shopify_option_mode !== "size_only" && Boolean(text(item.color_name))
    );
    const sortedItems = modelItems.slice().sort((a, b) => {
      if (usesColorOption) {
        const colorCompare = text(a.color_name).localeCompare(text(b.color_name), "ro", { sensitivity: "base" });
        if (colorCompare !== 0) return colorCompare;
      }
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
        "Option1 name": usesColorOption ? "Culoare" : "Mărime",
        "Option1 value": usesColorOption ? text(item.color_name) : text(item.size),
        "Option1 Linked To": "",
        "Option2 name": usesColorOption ? "Mărime" : "",
        "Option2 value": usesColorOption ? text(item.size) : "",
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
        "Image alt text": first && firstImage
          ? `${title} ${usesColorOption ? text(item.color_name) : ""} ${text(item.size)}`.trim().slice(0, 125)
          : "",
        "Variant image URL": item.image_url,
        "Gift card": "FALSE",
        "SEO title": first ? title.slice(0, 70) : "",
        "SEO description": first ? seoDescription : "",
        // A szín itt normál termékopcióként megy át. A Shopify kategória-színmező
        // metaobjektum-hivatkozást várhat, ezért nyers színnevet nem töltünk bele.
        "Color (product.metafields.shopify.color-pattern)": "",
        "Google Shopping / Google product category": first
          ? googleProductCategoryForShopifyCategory(category)
          : "",
        "Google Shopping / Gender": first ? shopifyGenderForRow(item) : "",
        "Google Shopping / Age group": first ? shopifyAgeGroupForRow(item) : "",
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
  const groupUsesColor = new Map();

  for (const item of items || []) {
    const groupKey = item.product_group_key || productGroupKey(item);
    if (!groupUsesColor.has(groupKey)) groupUsesColor.set(groupKey, false);
    if (item?.shopify_option_mode !== "size_only" && text(item.color_name)) {
      groupUsesColor.set(groupKey, true);
    }
  }

  for (const item of items) {
    const groupKey = item.product_group_key || productGroupKey(item);
    const usesColorOption = Boolean(groupUsesColor.get(groupKey));
    const row = {
      "Handle": item.handle,
      "Title": text(item.shopify_title || item.title_ro),
      "Option1 Name": usesColorOption ? "Culoare" : "Mărime",
      "Option1 Value": usesColorOption ? text(item.color_name) : text(item.size),
      "Option2 Name": usesColorOption ? "Mărime" : "",
      "Option2 Value": usesColorOption ? text(item.size) : "",
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
    "Szín": item.color_name || "",
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
      color: item.color_name || "",
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
            audience: shopifyAudience(item),
            audienceProfile: shopifyAudienceProfile(item),
            style: shopifyStyle(item),
            categoryNameRo: item.category_name_ro,
            categoryNameHu: item.category_name_hu,
            categoryCode: item.category_code,
            subcategoryNameRo: item.subcategory_name_ro,
            subcategoryNameHu: item.subcategory_name_hu,
            subcategoryCode: item.subcategory_code,
            productType: item.product_type,
            material: item.material,
            season: item.season,
            productCategory: productCategory(item),
            tags: buildTags(item),
            productCode: item.product_group_code || productGroupCode(item, prepared.groupingMode),
            productGroupKey: item.product_group_key || productGroupKey(item, prepared.groupingMode),
            groupingMode: prepared.groupingMode,
            handle: item.handle,
            color: item.color_name || "",
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

function shopifyVariantIdentity(variant) {
  const variantId = text(variant?.id);
  if (variantId) return `variant:${variantId}`;
  const inventoryItemId = text(variant?.inventoryItem?.id);
  if (inventoryItemId) return `inventory:${inventoryItemId}`;
  const productId = text(variant?.product?.id);
  const sku = normalizeKey(variant?.sku);
  const title = normalizeKey(variant?.title);
  return productId || sku || title ? `fallback:${productId}:${sku}:${title}` : "";
}

function dedupeShopifyVariants(variants = []) {
  const uniqueByIdentity = new Map();
  for (const variant of variants || []) {
    const identity = shopifyVariantIdentity(variant);
    if (!identity) continue;
    const previous = uniqueByIdentity.get(identity);
    uniqueByIdentity.set(identity, previous ? {
      ...previous,
      ...variant,
      inventoryItem: variant?.inventoryItem || previous?.inventoryItem || null,
      product: {
        ...(previous?.product || {}),
        ...(variant?.product || {}),
      },
    } : variant);
  }
  return Array.from(uniqueByIdentity.values());
}

function indexShopifyVariantsBySku(variants = []) {
  const bucketBySku = new Map();
  for (const variant of dedupeShopifyVariants(variants)) {
    const sku = normalizeKey(variant?.sku);
    if (!sku) continue;
    const identity = shopifyVariantIdentity(variant);
    if (!identity) continue;
    const bucket = bucketBySku.get(sku) || new Map();
    bucket.set(identity, variant);
    bucketBySku.set(sku, bucket);
  }
  return new Map(
    Array.from(bucketBySku.entries()).map(([sku, bucket]) => [sku, Array.from(bucket.values())])
  );
}

function shopifyExactSkuSearchQuery(value) {
  const clean = text(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return clean ? `sku:"${clean}"` : "";
}

async function loadShopifyVariantsByExactSku(skuValue) {
  const sku = text(skuValue);
  if (!sku) return [];
  const query = `query AifProductExportVariantsBySku($query: String!) {
    productVariants(first: 50, query: $query) {
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
  const response = await shopifyGraphql(query, { query: shopifyExactSkuSearchQuery(sku) });
  const wanted = normalizeKey(sku);
  return dedupeShopifyVariants(response.data?.productVariants?.nodes || [])
    .filter((variant) => normalizeKey(variant?.sku) === wanted);
}

async function resolveShopifySkuMatches(bySku, skuValue, exactSkuCache) {
  const sku = text(skuValue);
  const key = normalizeKey(sku);
  if (!key) return [];
  const bulkMatches = bySku.get(key) || [];
  if (bulkMatches.length === 1) return bulkMatches;
  if (exactSkuCache?.has(key)) return exactSkuCache.get(key);
  const exactMatches = await loadShopifyVariantsByExactSku(sku);
  exactSkuCache?.set(key, exactMatches);
  return exactMatches;
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
  const seenCursors = new Set();
  let after = null;
  for (let page = 0; page < 200; page += 1) {
    const response = await shopifyGraphql(query, { first: 250, after });
    const connection = response.data?.productVariants;
    variants.push(...(connection?.nodes || []));
    if (!connection?.pageInfo?.hasNextPage) break;
    const nextCursor = text(connection?.pageInfo?.endCursor);
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    after = nextCursor;
  }
  return dedupeShopifyVariants(variants);
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
  const rows = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let after = null;

  const query = category
    ? `query AifApplicableProductMetafieldDefinitions($constraint: MetafieldDefinitionConstraintSubtypeIdentifier!, $after: String) {
        definitions: metafieldDefinitions(
          ownerType: PRODUCT,
          first: 250,
          after: $after,
          constraintSubtype: $constraint,
          constraintStatus: CONSTRAINED_AND_UNCONSTRAINED
        ) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            name
            namespace
            key
            type { name }
            validations { name value }
          }
        }
      }`
    : `query AifUnconstrainedProductMetafieldDefinitions($after: String) {
        definitions: metafieldDefinitions(
          ownerType: PRODUCT,
          first: 250,
          after: $after,
          constraintStatus: UNCONSTRAINED_ONLY
        ) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            name
            namespace
            key
            type { name }
            validations { name value }
          }
        }
      }`;

  for (let page = 0; page < 30; page += 1) {
    const variables = category
      ? { constraint: { key: "category", value: category }, after }
      : { after };
    const response = await shopifyGraphql(query, variables);
    const connection = response.data?.definitions;

    for (const row of connection?.nodes || []) {
      const id = text(row?.id) || `${text(row?.namespace)}.${text(row?.key)}`;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      rows.push(row);
    }

    if (!connection?.pageInfo?.hasNextPage) break;
    const next = text(connection?.pageInfo?.endCursor);
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    after = next;
  }

  return rows;
}



async function applicableDefinitionByIdentifier({ namespace, key, categoryId, cache }) {
  const ns = text(namespace);
  const defKey = text(key);
  const category = text(categoryId);
  if (!ns || !defKey) return null;

  const cacheKey = `applicable::${category || "__all__"}::${ns}.${defKey}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  try {
    if (category) {
      const query = `query AifApplicableDefinitionByIdentifier(
        $namespace: String!,
        $key: String!,
        $constraint: MetafieldDefinitionConstraintSubtypeIdentifier!
      ) {
        definitions: metafieldDefinitions(
          ownerType: PRODUCT,
          first: 10,
          namespace: $namespace,
          key: $key,
          constraintSubtype: $constraint,
          constraintStatus: CONSTRAINED_AND_UNCONSTRAINED
        ) {
          nodes {
            id
            name
            namespace
            key
            type { name }
            validations { name value }
          }
        }
      }`;

      const response = await shopifyGraphql(query, {
        namespace: ns,
        key: defKey,
        constraint: { key: "category", value: category },
      });

      const row = response.data?.definitions?.nodes?.[0] || null;
      cache?.set(cacheKey, row);
      return row;
    }

    const query = `query AifDefinitionByIdentifier($identifier: MetafieldDefinitionIdentifierInput!) {
      metafieldDefinition(identifier: $identifier) {
        id
        name
        namespace
        key
        type { name }
        validations { name value }
      }
    }`;

    const response = await shopifyGraphql(query, {
      identifier: {
        ownerType: "PRODUCT",
        namespace: ns,
        key: defKey,
      },
    });

    const row = response.data?.metafieldDefinition || null;
    cache?.set(cacheKey, row);
    return row;
  } catch {
    cache?.set(cacheKey, null);
    return null;
  }
}

async function exactProductMetafieldDefinition(definition, cache) {
  const namespace = text(definition?.namespace);
  const key = text(definition?.key);
  if (!namespace || !key) return definition || null;

  const cacheKey = `${text(definition?.id) || "no-id"}::${namespace}.${key}`;
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  const query = `query AifExactProductMetafieldDefinition($identifier: MetafieldDefinitionIdentifierInput!) {
    metafieldDefinition(identifier: $identifier) {
      id
      name
      namespace
      key
      type { name }
      validations { name value }
      standardTemplate {
        id
        name
        namespace
        key
        type { name }
        validations { name value }
      }
    }
  }`;

  try {
    const response = await shopifyGraphql(query, {
      identifier: {
        ownerType: "PRODUCT",
        namespace,
        key,
      },
    });
    const exact = response.data?.metafieldDefinition || null;
    const mergeValidations = (...groups) => {
      const seen = new Set();
      const rows = [];
      for (const group of groups) {
        for (const validation of Array.isArray(group) ? group : []) {
          const name = text(validation?.name);
          const value = text(validation?.value);
          const key = `${name}::${value}`;
          if (!name || seen.has(key)) continue;
          seen.add(key);
          rows.push(validation);
        }
      }
      return rows;
    };
    const hydrated = exact
      ? {
          ...definition,
          ...exact,
          type: exact.type || exact.standardTemplate?.type || definition?.type || null,
          // Shopify category metafieldeknél a metaobject cél-definition sokszor
          // a standard template validációjában van, miközben az aktivált
          // definíció saját validations tömbje üres. Mindkettőt meg kell tartani.
          validations: mergeValidations(
            exact.validations,
            exact.standardTemplate?.validations,
            definition?.validations,
            definition?.standardTemplate?.validations,
          ),
        }
      : definition || null;
    cache?.set(cacheKey, hydrated);
    return hydrated;
  } catch {
    // A listából kapott definíció még mindig jobb, mint a semmi.
    cache?.set(cacheKey, definition || null);
    return definition || null;
  }
}

function metafieldDefinitionScore(definition, aliases, preferredNamespaces = []) {
  const name = normalizeKey(definition?.name).replace(/[_-]+/g, " ");
  const key = normalizeKey(definition?.key).replace(/[_-]+/g, " ");
  const namespace = normalizeKey(definition?.namespace);
  const normalizedAliases = (aliases || [])
    .map((value) => normalizeKey(value).replace(/[_-]+/g, " "))
    .filter(Boolean);
  const preferred = new Set((preferredNamespaces || []).map(normalizeKey).filter(Boolean));

  let semanticScore = 0;
  for (const alias of normalizedAliases) {
    if (name === alias) semanticScore = Math.max(semanticScore, 200);
    if (key === alias) semanticScore = Math.max(semanticScore, 190);

    // Partial matching is only useful for meaningful multi-character names.
    // It must not turn "Public" into Brand or "Color" into Size just because
    // both happen to live in a preferred namespace.
    if (alias.length >= 4 && name.length >= 4 && (name.includes(alias) || alias.includes(name))) {
      semanticScore = Math.max(semanticScore, 110);
    }
    if (alias.length >= 4 && key.length >= 4 && (key.includes(alias) || alias.includes(key))) {
      semanticScore = Math.max(semanticScore, 100);
    }
  }

  if (semanticScore <= 0) return 0;
  return semanticScore + (preferred.has(namespace) ? 20 : 0);
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
  const cleanCandidates = unique((candidates || []).map(text).filter(Boolean));
  if (!cleanCandidates.length) return null;
  if (["single_line_text_field", "multi_line_text_field"].includes(typeName)) {
    const value = resolvedMetafieldChoice(definition, cleanCandidates);
    return value || null;
  }
  if (typeName === "list.single_line_text_field") {
    const allowed = definitionChoiceValues(definition);
    const values = allowed.length
      ? cleanCandidates.map((candidate) => allowed.find((value) => normalizeKey(value) === normalizeKey(candidate))).filter(Boolean)
      : cleanCandidates;
    return values.length ? JSON.stringify(unique(values)) : null;
  }
  return null;
}

function isTaxonomyReferenceType(typeName) {
  return ["product_taxonomy_value_reference", "list.product_taxonomy_value_reference"].includes(text(typeName));
}

function taxonomyAttributeMatchScore(attribute, definition, aliases = [], preferredAttributeHandles = []) {
  const attributeName = normalizeKey(attribute?.name).replace(/[^a-z0-9]+/g, " ").trim();
  if (!attributeName) return 0;

  const preferred = unique(preferredAttributeHandles)
    .map((value) => normalizeKey(value).replace(/[_-]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim())
    .filter(Boolean);

  // The metaobject field validation is authoritative. Example:
  // shopify--fabric -> product_taxonomy_attribute_handle = "fabric".
  for (const handle of preferred) {
    if (attributeName === handle) return 1000;
  }

  const candidates = unique([
    definition?.name,
    definition?.key,
    ...aliases,
    ...validationValues(definition, ["product_taxonomy_attribute_handle"]),
  ]).map((value) => normalizeKey(value).replace(/[_-]+/g, " ").replace(/[^a-z0-9]+/g, " ").trim()).filter(Boolean);

  let score = 0;
  for (const candidate of candidates) {
    if (attributeName === candidate) score = Math.max(score, 200);
    else if (
      candidate.length >= 4 &&
      attributeName.length >= 4 &&
      (attributeName.includes(candidate) || candidate.includes(attributeName))
    ) {
      score = Math.max(score, 90);
    }
  }
  return score;
}

async function loadTaxonomyCategoryAttributes(categoryId, cache) {
  const id = text(categoryId);
  if (!id) return [];
  if (cache?.has(id)) return cache.get(id);
  const query = `query AifTaxonomyCategoryAttributes($id: ID!) {
    node(id: $id) {
      ... on TaxonomyCategory {
        id
        name
        fullName
        attributes(first: 100) {
          nodes {
            __typename
            ... on TaxonomyChoiceListAttribute { id name }
          }
        }
      }
    }
  }`;
  const response = await shopifyGraphql(query, { id });
  const attributes = (response.data?.node?.attributes?.nodes || [])
    .filter((row) => row?.__typename === "TaxonomyChoiceListAttribute" && text(row?.id));
  cache?.set(id, attributes);
  return attributes;
}

async function loadTaxonomyAttributeValues(attributeId, cache) {
  const id = text(attributeId);
  if (!id) return [];
  if (cache?.has(id)) return cache.get(id);
  const query = `query AifTaxonomyAttributeValues($id: ID!, $after: String) {
    node(id: $id) {
      ... on TaxonomyChoiceListAttribute {
        id
        name
        values(first: 250, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id name }
        }
      }
    }
  }`;
  const values = [];
  const seen = new Set();
  let after = null;
  for (let page = 0; page < 60; page += 1) {
    const response = await shopifyGraphql(query, { id, after });
    const connection = response.data?.node?.values;
    for (const row of connection?.nodes || []) {
      const valueId = text(row?.id);
      if (!valueId || seen.has(valueId)) continue;
      seen.add(valueId);
      values.push({ id: valueId, name: text(row?.name) });
    }
    if (!connection?.pageInfo?.hasNextPage) break;
    const next = text(connection?.pageInfo?.endCursor);
    if (!next || next === after) break;
    after = next;
  }
  cache?.set(id, values);
  return values;
}

function taxonomyValueMatchScore(value, candidateKeys) {
  const raw = text(value?.name);
  const key = metaobjectMatchKey(raw);
  if (!key) return 0;
  if (candidateKeys.has(key)) return 300;

  // Shopify size taxonomy values are often human labels such as
  // "Medium (M)" / "Extra large (XL)". The AllIn side correctly stores M / XL,
  // so the code in parentheses must count as an exact taxonomy match.
  const parenthetical = Array.from(raw.matchAll(/\(([^)]+)\)/g))
    .flatMap((match) => String(match[1] || "").split(/[\/,;|]+/))
    .map(metaobjectMatchKey)
    .filter(Boolean);
  if (parenthetical.some((part) => candidateKeys.has(part))) return 280;

  // A few Shopify labels contain the short value as a standalone word.
  // Keep this conservative so numeric sizes don't accidentally hit each other.
  for (const candidate of candidateKeys) {
    if (!candidate || candidate.length < 2) continue;
    if (candidate.length >= 4 && (key.startsWith(candidate) || key.endsWith(candidate))) return 120;
  }
  return 0;
}


async function resolveTaxonomyValuesForCandidates({
  definition,
  categoryId,
  candidates,
  aliases,
  preferredAttributeHandles = [],
  taxonomyCategoryAttributesCache,
  taxonomyAttributeValuesCache,
}) {
  const cleanCandidates = unique((candidates || []).map(text).filter(Boolean));
  if (!cleanCandidates.length) return { selected: [], reason: "missing_value" };
  if (!text(categoryId)) return { selected: [], reason: "missing_category" };

  const attributes = await loadTaxonomyCategoryAttributes(categoryId, taxonomyCategoryAttributesCache);
  const attribute = attributes
    .map((row) => ({
      row,
      score: taxonomyAttributeMatchScore(row, definition, aliases, preferredAttributeHandles),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.row || null;

  if (!attribute?.id) {
    return {
      selected: [],
      reason: "taxonomy_attribute_missing",
      availableAttributes: attributes.slice(0, 60).map((row) => ({ id: text(row.id), name: text(row.name) })),
    };
  }

  const entries = await loadTaxonomyAttributeValues(attribute.id, taxonomyAttributeValuesCache);
  const selected = [];
  for (const candidate of cleanCandidates) {
    const candidateKeys = new Set([metaobjectMatchKey(candidate)].filter(Boolean));
    const match = entries
      .map((entry) => ({ entry, score: taxonomyValueMatchScore(entry, candidateKeys) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.entry || null;
    if (match?.id && !selected.some((row) => row.id === match.id)) selected.push(match);
  }

  if (!selected.length) {
    // Shopify apparel taxonomy does not contain every supplier sizing system
    // (for example height sizes such as 152). The exact variant option remains
    // "152"; the category metafield can honestly use Shopify's "Other" value
    // instead of staying blank.
    const definitionKey = normalizeKey(definition?.key).replace(/[^a-z0-9]+/g, "");
    // Shopify uses several standard size metafields depending on category
    // (size, accessory-size, etc.). Supplier range sizes such as 39-42 or
    // 35-38 often have no exact taxonomy value. Preserve the exact variant
    // option, and use Shopify's honest "Other" bucket for the category metafield.
    if (definitionKey === "size" || definitionKey.endsWith("size")) {
      const other = entries.find((entry) => metaobjectMatchKey(entry?.name) === "other");
      if (other?.id) {
        selected.push(other);
        return {
          selected,
          reason: null,
          fallback: "other",
          taxonomyAttribute: { id: text(attribute.id), name: text(attribute.name) },
        };
      }
    }

    return {
      selected: [],
      reason: "taxonomy_value_missing",
      taxonomyAttribute: { id: text(attribute.id), name: text(attribute.name) },
      availableEntries: entries.slice(0, 120).map((entry) => ({ id: text(entry.id), displayName: text(entry.name) })),
    };
  }

  return {
    selected,
    reason: null,
    taxonomyAttribute: { id: text(attribute.id), name: text(attribute.name) },
  };
}

async function taxonomyMetafieldValueForDefinition({
  definition,
  categoryId,
  candidates,
  aliases,
  taxonomyCategoryAttributesCache,
  taxonomyAttributeValuesCache,
}) {
  const typeName = text(definition?.type?.name);
  const resolved = await resolveTaxonomyValuesForCandidates({
    definition,
    categoryId,
    candidates,
    aliases,
    taxonomyCategoryAttributesCache,
    taxonomyAttributeValuesCache,
  });
  if (!resolved.selected?.length) return resolved;

  const ids = resolved.selected.map((entry) => text(entry.id)).filter(Boolean);
  return {
    value: typeName === "list.product_taxonomy_value_reference" ? JSON.stringify(ids) : ids[0],
    reason: null,
    taxonomyAttribute: resolved.taxonomyAttribute || null,
    taxonomyValues: resolved.selected.map((entry) => ({ id: text(entry.id), name: text(entry.name) })),
  };
}

function validationValues(definition, names = []) {
  const wanted = new Set(
    (names || [])
      .map((value) => normalizeKey(value).replace(/[^a-z0-9]+/g, "_"))
      .filter(Boolean)
  );
  const values = [];
  for (const validation of definition?.validations || []) {
    const key = normalizeKey(validation?.name).replace(/[^a-z0-9]+/g, "_");
    if (!wanted.has(key)) continue;
    const raw = text(validation?.value);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) values.push(...parsed.map(text).filter(Boolean));
      else if (parsed !== null && parsed !== undefined) values.push(text(parsed));
    } catch {
      values.push(raw);
    }
  }
  return unique(values);
}


function isMetaobjectReferenceType(typeName) {
  return ["metaobject_reference", "list.metaobject_reference"].includes(text(typeName));
}

function metaobjectMatchKey(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "");
}

function inferredMetaobjectTypeForMetafield(definition) {
  const namespace = normalizeKey(definition?.namespace);
  const key = text(definition?.key)
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!key) return "";
  if (namespace === "shopify") return `shopify--${key}`;
  if (namespace === "custom") return `custom--${key}`;
  return "";
}

async function loadMetaobjectDefinitions(cache) {
  const cacheKey = "__all__";
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  const query = `query AifMetaobjectDefinitions($first: Int!, $after: String) {
    metaobjectDefinitions(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        type
        displayNameKey
        standardTemplate { name type }
        fieldDefinitions {
          key
          name
          required
          type { name }
        }
      }
    }
  }`;

  const rows = [];
  const seenCursors = new Set();
  let after = null;
  for (let page = 0; page < 20; page += 1) {
    const response = await shopifyGraphql(query, { first: 250, after });
    const connection = response.data?.metaobjectDefinitions;
    rows.push(...(connection?.nodes || []));
    if (!connection?.pageInfo?.hasNextPage) break;
    const next = text(connection?.pageInfo?.endCursor);
    if (!next || seenCursors.has(next)) break;
    seenCursors.add(next);
    after = next;
  }

  cache?.set(cacheKey, rows);
  return rows;
}

function metaobjectDefinitionMatchScore(row, definition, inferredType = "") {
  const rowType = text(row?.type);
  const templateType = text(row?.standardTemplate?.type);
  if (inferredType && (rowType === inferredType || templateType === inferredType)) return 1000;

  const candidates = unique([
    definition?.name,
    definition?.key,
    inferredType,
    inferredType.replace(/^shopify--|^custom--/, ""),
  ]).map(metaobjectMatchKey).filter(Boolean);

  let score = 0;
  const rowValues = [
    row?.name,
    row?.type,
    row?.standardTemplate?.name,
    row?.standardTemplate?.type,
  ].map(metaobjectMatchKey).filter(Boolean);

  for (const candidate of candidates) {
    for (const value of rowValues) {
      if (candidate === value) score = Math.max(score, 220);
      else if (candidate && value && (candidate.includes(value) || value.includes(candidate))) score = Math.max(score, 120);
    }
  }
  return score;
}

async function metaobjectDefinitionByType(type) {
  const cleanType = text(type);
  if (!cleanType) return null;
  const query = `query AifMetaobjectDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      name
      type
      displayNameKey
      standardTemplate {
        name
        type
        displayNameKey
        fieldDefinitions {
          key
          name
          required
          type { name }
          validations { name value }
        }
      }
      fieldDefinitions {
        key
        name
        required
        type { name }
        validations { name value }
      }
    }
  }`;
  const response = await shopifyGraphql(query, { type: cleanType });
  return response.data?.metaobjectDefinitionByType || null;
}

async function enableStandardMetaobjectDefinition(type) {
  const cleanType = text(type);
  if (!cleanType || !cleanType.startsWith("shopify--")) return null;
  const mutation = `mutation AifEnableStandardMetaobjectDefinition($type: String!) {
    standardMetaobjectDefinitionEnable(type: $type) {
      metaobjectDefinition {
        id
        name
        type
        displayNameKey
        standardTemplate {
          name
          type
          displayNameKey
          fieldDefinitions {
            key
            name
            required
            type { name }
            validations { name value }
          }
        }
        fieldDefinitions {
          key
          name
          required
          type { name }
          validations { name value }
        }
      }
      userErrors { field message code }
    }
  }`;
  const response = await shopifyGraphql(mutation, { type: cleanType });
  const payload = response.data?.standardMetaobjectDefinitionEnable;
  if (payload?.userErrors?.length) {
    throw Object.assign(
      new Error(payload.userErrors.map((row) => row.message).join(" | ")),
      { code: "shopify_standard_metaobject_enable_failed", payload, type: cleanType }
    );
  }
  return payload?.metaobjectDefinition || null;
}

function hydratedMetaobjectDefinition(definition) {
  if (!definition) return null;
  const liveFields = Array.isArray(definition.fieldDefinitions) ? definition.fieldDefinitions : [];
  const templateFields = Array.isArray(definition.standardTemplate?.fieldDefinitions)
    ? definition.standardTemplate.fieldDefinitions
    : [];
  return {
    ...definition,
    displayNameKey: text(definition.displayNameKey || definition.standardTemplate?.displayNameKey) || null,
    fieldDefinitions: liveFields.length ? liveFields : templateFields,
  };
}

async function metaobjectDefinitionForMetafield(definition, definitionTypeCache, metaobjectDefinitionsCache) {
  const targetDefinitionIds = validationValues(definition, [
    "metaobject_definition_id",
    "metaobject_definition_ids",
  ]);
  const targetDefinitionId = targetDefinitionIds[0] || "";
  const cacheKey = `${targetDefinitionId || "no-target"}::${text(definition?.namespace)}.${text(definition?.key)}`;
  const cached = definitionTypeCache?.get(cacheKey);
  if (cached && typeof cached === "object") return cached;

  // Shopify GraphQLnál a metaobject_reference és list.metaobject_reference
  // hivatalos célmeghatározása a metafield definition validationje.
  // Ez az elsődleges igazság, nem a namespace/key-ből kitalált type.
  const definitionId = targetDefinitionId;

  if (definitionId) {
    const query = `query AifTargetMetaobjectDefinition($id: ID!) {
      metaobjectDefinition(id: $id) {
        id
        name
        type
        displayNameKey
        fieldDefinitions {
          key
          name
          required
          type { name }
          validations { name value }
        }
      }
    }`;
    const response = await shopifyGraphql(query, { id: definitionId });
    const resolved = hydratedMetaobjectDefinition(response.data?.metaobjectDefinition || null);
    if (resolved?.type) {
      definitionTypeCache?.set(cacheKey, resolved);
      return resolved;
    }
  }

  // Egyes definíciók type validationt adhatnak ID helyett.
  const directTypes = validationValues(definition, [
    "metaobject_definition_type",
    "metaobject_definition_types",
  ]);
  for (const directType of directTypes) {
    if (!directType) continue;
    const resolved = hydratedMetaobjectDefinition(await metaobjectDefinitionByType(directType));
    if (resolved?.type) {
      definitionTypeCache?.set(cacheKey, resolved);
      return resolved;
    }
  }

  // Csak valódi custom fallback. A korábbi shopify--size / shopify--fabric
  // találgatás Record not found hibát okozott, ezért itt már NEM próbálunk
  // standard definíciót vakon engedélyezni.
  let definitions = [];
  try {
    definitions = await loadMetaobjectDefinitions(metaobjectDefinitionsCache);
  } catch {
    definitions = [];
  }

  const found = hydratedMetaobjectDefinition(
    definitions
      .map((row) => ({ row, score: metaobjectDefinitionMatchScore(row, definition, "") }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.row || null
  );

  if (found) definitionTypeCache?.set(cacheKey, found);
  return found;
}

async function metaobjectDefinitionTypeForMetafield(definition, definitionTypeCache, metaobjectDefinitionsCache) {
  const resolved = await metaobjectDefinitionForMetafield(definition, definitionTypeCache, metaobjectDefinitionsCache);
  return text(resolved?.type || resolved?.standardTemplate?.type);
}

function parseReferenceIds(value) {
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
    if (parsed !== null && parsed !== undefined) return [text(parsed)].filter(Boolean);
  } catch {}
  return [raw];
}

function entryReferencesTaxonomyValue(entry, taxonomyValueId) {
  const wanted = text(taxonomyValueId);
  if (!wanted) return false;
  return (entry?.fields || []).some((field) => parseReferenceIds(field?.value).includes(wanted));
}

function metaobjectHandlePart(value) {
  const raw = normalizeKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return raw || "value";
}

async function upsertMetaobjectEntry({ type, handle, fields }) {
  const cleanType = text(type);
  const cleanHandle = text(handle);
  if (!cleanType || !cleanHandle || !fields?.length) {
    return { metaobject: null, reason: "metaobject_upsert_input_missing" };
  }

  const mutation = `mutation AifMetaobjectUpsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        type
        handle
        displayName
        fields { key value }
      }
      userErrors { field message code }
    }
  }`;

  const response = await shopifyGraphql(mutation, {
    handle: { type: cleanType, handle: cleanHandle },
    metaobject: { fields },
  });
  const payload = response.data?.metaobjectUpsert;
  if (payload?.userErrors?.length) {
    return {
      metaobject: null,
      reason: "metaobject_upsert_failed",
      errors: payload.userErrors,
    };
  }
  return { metaobject: payload?.metaobject || null, reason: null };
}

function taxonomyFieldForMetaobjectDefinition(metaDefinition, metafieldDefinition) {
  const fields = Array.isArray(metaDefinition?.fieldDefinitions) ? metaDefinition.fieldDefinitions : [];
  const taxonomyFields = fields.filter((field) =>
    ["product_taxonomy_value_reference", "list.product_taxonomy_value_reference"].includes(text(field?.type?.name))
  );
  if (!taxonomyFields.length) return null;

  const hint = normalizeKey(metafieldDefinition?.key).replace(/[^a-z0-9]+/g, "");
  const nameHint = normalizeKey(metafieldDefinition?.name).replace(/[^a-z0-9]+/g, "");
  return taxonomyFields
    .map((field) => {
      const key = normalizeKey(field?.key).replace(/[^a-z0-9]+/g, "");
      const name = normalizeKey(field?.name).replace(/[^a-z0-9]+/g, "");
      let score = 0;
      if (hint && (key.includes(hint) || hint.includes(key))) score += 100;
      if (nameHint && (name.includes(nameHint) || nameHint.includes(name))) score += 80;
      if (key.includes("color") && hint.includes("color")) score += 120;
      if (key === "taxonomyreference" || key.endsWith("taxonomyreference")) score += 40;
      return { field, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.field || taxonomyFields[0];
}

function textFieldForMetaobjectDefinition(metaDefinition) {
  const fields = Array.isArray(metaDefinition?.fieldDefinitions) ? metaDefinition.fieldDefinitions : [];
  const displayKey = text(metaDefinition?.displayNameKey);
  if (displayKey) {
    const display = fields.find((field) => text(field?.key) === displayKey);
    if (display && ["single_line_text_field", "multi_line_text_field"].includes(text(display?.type?.name))) return display;
  }
  return fields.find((field) => {
    const key = normalizeKey(field?.key);
    const typeName = text(field?.type?.name);
    return ["label", "name", "title", "value"].some((token) => key.includes(token))
      && ["single_line_text_field", "multi_line_text_field"].includes(typeName);
  }) || fields.find((field) =>
    field?.required && ["single_line_text_field", "multi_line_text_field"].includes(text(field?.type?.name))
  ) || fields.find((field) =>
    ["single_line_text_field", "multi_line_text_field"].includes(text(field?.type?.name))
  ) || null;
}

async function loadMetaobjectsByType(type, metaobjectEntriesCache) {
  const cleanType = text(type);
  if (!cleanType) return [];
  if (metaobjectEntriesCache?.has(cleanType)) return metaobjectEntriesCache.get(cleanType);

  const query = `query AifMetaobjectsByType($type: String!, $first: Int!, $after: String) {
    metaobjects(type: $type, first: $first, after: $after, sortKey: "display_name") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        type
        handle
        displayName
        fields { key value }
      }
    }
  }`;
  const entries = [];
  const seenCursors = new Set();
  let after = null;
  for (let page = 0; page < 20; page += 1) {
    const response = await shopifyGraphql(query, { type: cleanType, first: 250, after });
    const connection = response.data?.metaobjects;
    entries.push(...(connection?.nodes || []));
    if (!connection?.pageInfo?.hasNextPage) break;
    const nextCursor = text(connection?.pageInfo?.endCursor);
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  metaobjectEntriesCache?.set(cleanType, entries);
  return entries;
}

function metaobjectMatchScore(entry, candidateKeys) {
  let score = 0;
  const displayNameKey = metaobjectMatchKey(entry?.displayName);
  const handleKey = metaobjectMatchKey(entry?.handle);
  if (displayNameKey && candidateKeys.has(displayNameKey)) score = Math.max(score, 120);
  if (handleKey && candidateKeys.has(handleKey)) score = Math.max(score, 110);
  for (const field of entry?.fields || []) {
    const valueKey = metaobjectMatchKey(field?.value);
    if (valueKey && candidateKeys.has(valueKey)) score = Math.max(score, 100);
  }
  return score;
}



function standardTaxonomyMetaobjectFields({
  metaobjectType,
  metaDefinition,
  taxonomyField,
  taxonomyValue,
  displayField,
}) {
  const taxonomyFieldType = text(taxonomyField?.type?.name);
  const fields = [{
    key: text(taxonomyField.key),
    value: taxonomyFieldType === "list.product_taxonomy_value_reference"
      ? JSON.stringify([text(taxonomyValue.id)])
      : text(taxonomyValue.id),
  }];

  if (displayField && text(displayField.key) !== text(taxonomyField.key)) {
    fields.push({ key: text(displayField.key), value: text(taxonomyValue.name) });
  }

  // Shopify's standard color-pattern metaobject requires both the color taxonomy
  // reference and a pattern taxonomy reference. "Solid" is TaxonomyValue/2874.
  // Without this field metaobjectUpsert fails even for otherwise valid Black/Gray/Navy.
  if (metaobjectType === "shopify--color-pattern") {
    const fieldDefinitions = Array.isArray(metaDefinition?.fieldDefinitions)
      ? metaDefinition.fieldDefinitions
      : [];

    const colorField = fieldDefinitions.find((field) => text(field?.key) === "color_taxonomy_reference");
    const patternField = fieldDefinitions.find((field) => text(field?.key) === "pattern_taxonomy_reference");

    if (colorField && !fields.some((row) => row.key === "color_taxonomy_reference")) {
      fields.push({
        key: "color_taxonomy_reference",
        value: text(colorField?.type?.name) === "list.product_taxonomy_value_reference"
          ? JSON.stringify([text(taxonomyValue.id)])
          : text(taxonomyValue.id),
      });
    }

    if (patternField && !fields.some((row) => row.key === "pattern_taxonomy_reference")) {
      fields.push({
        key: "pattern_taxonomy_reference",
        value: text(patternField?.type?.name) === "list.product_taxonomy_value_reference"
          ? JSON.stringify(["gid://shopify/TaxonomyValue/2874"])
          : "gid://shopify/TaxonomyValue/2874",
      });
    }
  }

  // Fill any remaining required simple text fields with the taxonomy display name.
  for (const field of metaDefinition?.fieldDefinitions || []) {
    const fieldKey = text(field?.key);
    if (!field?.required || !fieldKey || fields.some((row) => row.key === fieldKey)) continue;
    const typeName = text(field?.type?.name);
    if (["single_line_text_field", "multi_line_text_field"].includes(typeName)) {
      fields.push({ key: fieldKey, value: text(taxonomyValue.name) });
    }
  }

  return fields;
}

async function ensureTaxonomyBackedMetaobjects({
  definition,
  metaDefinition,
  metaobjectType,
  categoryId,
  candidates,
  aliases,
  metaobjectEntriesCache,
  taxonomyCategoryAttributesCache,
  taxonomyAttributeValuesCache,
}) {
  const taxonomyField = taxonomyFieldForMetaobjectDefinition(metaDefinition, definition);
  if (!taxonomyField) {
    return {
      ids: [],
      reason: "metaobject_taxonomy_field_missing",
      metaobjectType,
    };
  }

  const preferredAttributeHandles = validationValues(taxonomyField, [
    "product_taxonomy_attribute_handle",
  ]);

  const taxonomy = await resolveTaxonomyValuesForCandidates({
    definition,
    categoryId,
    candidates,
    aliases,
    preferredAttributeHandles,
    taxonomyCategoryAttributesCache,
    taxonomyAttributeValuesCache,
  });

  if (!taxonomy.selected?.length) return {
    ids: [],
    reason: taxonomy.reason,
    taxonomyAttribute: taxonomy.taxonomyAttribute || null,
    preferredAttributeHandles,
    availableAttributes: taxonomy.availableAttributes,
    availableEntries: taxonomy.availableEntries,
  };

  let entries = await loadMetaobjectsByType(metaobjectType, metaobjectEntriesCache);
  const displayField = textFieldForMetaobjectDefinition(metaDefinition);
  const ids = [];
  const created = [];

  for (const taxonomyValue of taxonomy.selected) {
    let existing = entries.find((entry) => entryReferencesTaxonomyValue(entry, taxonomyValue.id)) || null;

    if (!existing) {
      const fields = standardTaxonomyMetaobjectFields({
        metaobjectType,
        metaDefinition,
        taxonomyField,
        taxonomyValue,
        displayField,
      });

      const handle = `aif-${metaobjectHandlePart(text(taxonomyValue.name))}-${text(taxonomyValue.id).split("/").pop() || "taxonomy"}`.slice(0, 190);
      const upserted = await upsertMetaobjectEntry({
        type: metaobjectType,
        handle,
        fields,
      });

      if (!upserted.metaobject?.id) {
        return {
          ids,
          reason: upserted.reason || "metaobject_upsert_failed",
          metaobjectType,
          taxonomyAttribute: taxonomy.taxonomyAttribute || null,
          preferredAttributeHandles,
          errors: upserted.errors || null,
        };
      }

      existing = upserted.metaobject;
      created.push(existing);
      entries = [...entries, existing];
      metaobjectEntriesCache?.set(metaobjectType, entries);
    }

    const id = text(existing?.id);
    if (id && !ids.includes(id)) ids.push(id);
  }

  return {
    ids,
    reason: ids.length ? null : "metaobject_entry_missing",
    metaobjectType,
    preferredAttributeHandles,
    taxonomyAttribute: taxonomy.taxonomyAttribute || null,
    taxonomyValues: taxonomy.selected.map((entry) => ({ id: text(entry.id), name: text(entry.name) })),
    createdMetaobjects: created.map((entry) => ({
      id: text(entry.id),
      handle: text(entry.handle),
      displayName: text(entry.displayName),
    })),
  };
}

async function ensureSimpleMetaobject({
  definition,
  metaDefinition,
  metaobjectType,
  candidates,
  metaobjectEntriesCache,
}) {
  const cleanCandidates = unique((candidates || []).map(text).filter(Boolean));
  if (!cleanCandidates.length) return { ids: [], reason: "missing_value" };

  let entries = await loadMetaobjectsByType(metaobjectType, metaobjectEntriesCache);
  const matches = [];

  for (const candidate of cleanCandidates) {
    const candidateKeys = new Set([metaobjectMatchKey(candidate)].filter(Boolean));
    const match = entries
      .map((entry) => ({ entry, score: metaobjectMatchScore(entry, candidateKeys) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.entry || null;
    if (match?.id && !matches.some((row) => text(row.id) === text(match.id))) matches.push(match);
  }

  if (matches.length) {
    return { ids: matches.map((entry) => text(entry.id)).filter(Boolean), reason: null, metaobjectType };
  }

  const displayField = textFieldForMetaobjectDefinition(metaDefinition);
  if (!displayField) {
    return { ids: [], reason: "metaobject_display_field_missing", metaobjectType };
  }

  const value = cleanCandidates[0];
  const fields = [{ key: text(displayField.key), value }];

  for (const field of metaDefinition?.fieldDefinitions || []) {
    const fieldKey = text(field?.key);
    if (!field?.required || !fieldKey || fields.some((row) => row.key === fieldKey)) continue;
    const typeName = text(field?.type?.name);
    if (["single_line_text_field", "multi_line_text_field"].includes(typeName)) {
      fields.push({ key: fieldKey, value });
    }
  }

  const upserted = await upsertMetaobjectEntry({
    type: metaobjectType,
    handle: `aif-${metaobjectHandlePart(value)}`.slice(0, 190),
    fields,
  });
  if (!upserted.metaobject?.id) {
    return {
      ids: [],
      reason: upserted.reason || "metaobject_upsert_failed",
      metaobjectType,
      errors: upserted.errors || null,
    };
  }

  entries = [...entries, upserted.metaobject];
  metaobjectEntriesCache?.set(metaobjectType, entries);
  return {
    ids: [text(upserted.metaobject.id)],
    reason: null,
    metaobjectType,
    createdMetaobjects: [{
      id: text(upserted.metaobject.id),
      handle: text(upserted.metaobject.handle),
      displayName: text(upserted.metaobject.displayName),
    }],
  };
}

async function metafieldValueForDefinition({
  definition,
  categoryId,
  candidates,
  aliases,
  definitionTypeCache,
  metaobjectDefinitionsCache,
  metaobjectEntriesCache,
  taxonomyCategoryAttributesCache,
  taxonomyAttributeValuesCache,
}) {
  const typeName = text(definition?.type?.name);
  const textValue = metafieldTextValue(definition, candidates);
  if (textValue !== null) return { value: textValue, reason: null };

  if (["single_line_text_field", "multi_line_text_field", "list.single_line_text_field"].includes(typeName)) {
    return {
      value: null,
      reason: definitionChoiceValues(definition).length ? "choice_not_allowed" : "text_value_not_resolved",
    };
  }

  if (isTaxonomyReferenceType(typeName)) {
    return taxonomyMetafieldValueForDefinition({
      definition,
      categoryId,
      candidates,
      aliases,
      taxonomyCategoryAttributesCache,
      taxonomyAttributeValuesCache,
    });
  }

  if (!isMetaobjectReferenceType(typeName)) {
    return { value: null, reason: "definition_type_unsupported" };
  }

  const metaDefinition = await metaobjectDefinitionForMetafield(
    definition,
    definitionTypeCache,
    metaobjectDefinitionsCache,
  );
  const metaobjectType = text(metaDefinition?.type);

  if (!metaobjectType) {
    return {
      value: null,
      reason: "metaobject_definition_missing",
      metafieldValidations: definition?.validations || [],
      standardTemplate: definition?.standardTemplate
        ? {
            id: text(definition.standardTemplate.id),
            namespace: text(definition.standardTemplate.namespace),
            key: text(definition.standardTemplate.key),
            type: text(definition.standardTemplate.type?.name),
            validations: definition.standardTemplate.validations || [],
          }
        : null,
    };
  }

  let ensured;
  if (metaobjectType.startsWith("shopify--") && text(categoryId)) {
    ensured = await ensureTaxonomyBackedMetaobjects({
      definition,
      metaDefinition,
      metaobjectType,
      categoryId,
      candidates,
      aliases,
      metaobjectEntriesCache,
      taxonomyCategoryAttributesCache,
      taxonomyAttributeValuesCache,
    });
  } else {
    ensured = await ensureSimpleMetaobject({
      definition,
      metaDefinition,
      metaobjectType,
      candidates,
      metaobjectEntriesCache,
    });
  }

  const ids = unique((ensured?.ids || []).map(text).filter(Boolean));
  if (!ids.length) {
    return {
      value: null,
      reason: ensured?.reason || "metaobject_entry_missing",
      metaobjectType,
      taxonomyAttribute: ensured?.taxonomyAttribute || null,
      taxonomyValues: ensured?.taxonomyValues || null,
      preferredAttributeHandles: ensured?.preferredAttributeHandles || null,
      availableAttributes: ensured?.availableAttributes,
      availableEntries: ensured?.availableEntries,
      errors: ensured?.errors || null,
    };
  }

  return {
    value: typeName === "list.metaobject_reference" ? JSON.stringify(ids) : ids[0],
    reason: null,
    metaobjectType,
    preferredAttributeHandles: ensured?.preferredAttributeHandles || null,
    taxonomyAttribute: ensured?.taxonomyAttribute || null,
    taxonomyValues: ensured?.taxonomyValues || null,
    createdMetaobjects: ensured?.createdMetaobjects || null,
  };
}

function audienceCandidates(value) {
  const audience = text(value);
  if (normalizeKey(audience) === "femei") return ["Femei", "Feminin", "Women", "Female"];
  if (normalizeKey(audience) === "barbati") return ["Bărbați", "Barbati", "Masculin", "Men", "Male"];
  if (normalizeKey(audience) === "copii") return ["Copii", "Junior", "Kids", "Children"];
  if (!audience || normalizeKey(audience) === "unisex") return ["Bărbați", "Femei"];
  return [audience];
}

function styleCandidates(value) {
  return normalizeKey(value) === "sport"
    ? ["Sport", "Sports"]
    : ["Fashion", "Lifestyle"];
}

function targetGenderCandidates(value) {
  const key = shopifyGender(value);
  if (key === "female") return ["Female", "Women", "Femei", "Feminin", "Női", "Noi"];
  if (key === "male") return ["Male", "Men", "Bărbați", "Barbati", "Masculin", "Férfi", "Ferfi"];
  return ["Unisex", "Gender neutral", "Gender-neutral"];
}

function ageGroupCandidates(value) {
  return shopifyAgeGroup(value) === "kids"
    ? ["Kids", "Children", "Copii", "Junior", "Youth", "Gyerek"]
    : ["Adult", "Adults", "Adulți", "Adulti", "Felnőtt", "Felnott"];
}

const SHOPIFY_COLOR_CANDIDATES = {
  negru: ["Black", "Negru", "Fekete"],
  alb: ["White", "Alb", "Fehér", "Feher"],
  rosu: ["Red", "Roșu", "Rosu", "Piros"],
  albastru: ["Blue", "Albastru", "Kék", "Kek"],
  bleumarin: ["Navy", "Navy blue", "Bleumarin", "Sötétkék", "Sotetkek"],
  verde: ["Green", "Verde", "Zöld", "Zold"],
  galben: ["Yellow", "Galben", "Sárga", "Sarga"],
  gri: ["Gray", "Grey", "Gri", "Szürke", "Szurke"],
  portocaliu: ["Orange", "Portocaliu", "Narancs"],
  maro: ["Brown", "Maro", "Barna"],
  bej: ["Beige", "Bej", "Bézs", "Bezs"],
  mov: ["Purple", "Violet", "Mov", "Lila"],
  violet: ["Violet", "Purple", "Mov", "Lila"],
  roz: ["Pink", "Roz", "Rózsaszín", "Rozsaszin"],
  auriu: ["Gold", "Auriu", "Arany"],
  argintiu: ["Silver", "Argintiu", "Ezüst", "Ezust"],
  crem: ["Cream", "Crem"],
  turcoaz: ["Turquoise", "Turcoaz"],
  kaki: ["Khaki", "Kaki"],
  multicolor: ["Multicolor", "Multi-color", "Multicolour"],
};

function colorCandidates(values) {
  const source = Array.isArray(values) ? values : [values];
  const out = [];
  const phraseRules = [
    [/off[\s_-]*white|ivory|cream|crem/, ["White"]],
    [/black|negru|fekete/, ["Black"]],
    [/navy|bleumarin|sotetkek|sötétkék/, ["Navy"]],
    [/denim|cobalt|royal[\s_-]*blue|albastru|blue|kek|kék/, ["Blue"]],
    [/petrol|olive|khaki|kaki|verde|green|zold|zöld/, ["Green"]],
    [/steel|charcoal|graphite|gunmetal|anthracite|antracit|grey|gray|gri|szurke|szürke|melange/, ["Gray"]],
    [/multicolou?r|multi[\s_-]*colour|multi[\s_-]*color/, ["Multicolor"]],
    [/burgundy|maroon|wine|bordo|bordó|red|rosu|roșu|piros/, ["Red"]],
    [/pink|roz|rozsaszin|rózsaszín/, ["Pink"]],
    [/purple|violet|mov|lila/, ["Purple"]],
    [/orange|portocaliu|narancs/, ["Orange"]],
    [/yellow|galben|sarga|sárga/, ["Yellow"]],
    [/brown|maro|barna/, ["Brown"]],
    [/beige|bej|bezs|bézs/, ["Beige"]],
    [/gold|auriu|arany/, ["Gold"]],
    [/silver|argintiu|ezust|ezüst/, ["Silver"]],
  ];

  for (const value of source) {
    const raw = text(value);
    if (!raw) continue;
    out.push(raw);
    const normalizedRaw = normalizeKey(raw);
    const parts = normalizedRaw.split(/[\/,+&]+/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts.length ? parts : [normalizedRaw]) {
      out.push(...(SHOPIFY_COLOR_CANDIDATES[part] || []));
    }
    for (const [pattern, candidates] of phraseRules) {
      if (pattern.test(normalizedRaw)) out.push(...candidates);
    }
  }
  return unique(out);
}

function sizeCandidates(values) {
  const source = Array.isArray(values) ? values : [values];
  const out = [];
  for (const value of source) {
    const raw = text(value);
    if (!raw) continue;
    const key = normalizeKey(raw).replace(/\s+/g, "");
    out.push(raw);
    if (["osfm", "onesizefitsmost"].includes(key)) out.push("One size fits most", "One size");
    if (["osfa", "onesizefitsall"].includes(key)) out.push("One size fits all", "One size");
    if (["onesize", "uni", "universal"].includes(key)) out.push("One size");
    if (key === "2xl") out.push("XXL");
    if (key === "3xl") out.push("XXXL");
  }
  return unique(out);
}

function materialCandidates(values) {
  const source = Array.isArray(values) ? values : [values];
  const out = [];
  const rules = [
    [/bumbac|cotton|pamut/, ["Cotton", "Bumbac", "Pamut"]],
    [/poliester|polyester|poliészter|polieszter|polister/, ["Polyester", "Poliester"]],
    [/elastan|elastane|spandex|elasztan/, ["Elastane", "Spandex", "Elastan"]],
    [/nylon|poliamid|polyamide/, ["Nylon", "Polyamide", "Poliamidă", "Poliamida"]],
    [/vascoza|viscoza|viscose|rayon/, ["Viscose", "Rayon", "Viscoză", "Viscoza"]],
    [/lana|wool|gyapju/, ["Wool", "Lână", "Lana", "Gyapjú", "Gyapju"]],
    [/in|linen|len/, ["Linen", "In"]],
    [/piele|leather|bor/, ["Leather", "Piele", "Bőr", "Bor"]],
    [/acril|acrylic|akril/, ["Acrylic", "Acril"]],
  ];
  for (const value of source) {
    const raw = text(value);
    if (!raw) continue;
    out.push(raw);
    const key = normalizeKey(raw);
    for (const [pattern, candidates] of rules) if (pattern.test(key)) out.push(...candidates);
  }
  return unique(out);
}


function normalizedCategoryPath(value) {
  return normalizeKey(value)
    .replace(/\s*>\s*/g, " > ")
    .replace(/\s+/g, " ")
    .trim();
}

async function taxonomyCategoryByPath(path, cache) {
  const wanted = text(path);
  if (!wanted) return null;
  const cacheKey = normalizedCategoryPath(wanted);
  if (cache?.has(cacheKey)) return cache.get(cacheKey);

  const leaf = wanted.split(">").map((part) => part.trim()).filter(Boolean).pop() || wanted;
  const query = `query AifTaxonomyCategorySearch($search: String!) {
    taxonomy {
      categories(first: 100, search: $search) {
        nodes {
          id
          name
          fullName
          isArchived
          isLeaf
        }
      }
    }
  }`;

  const searches = unique([wanted, leaf]);
  let candidates = [];
  for (const search of searches) {
    const response = await shopifyGraphql(query, { search });
    candidates.push(...(response.data?.taxonomy?.categories?.nodes || []));
  }

  const deduped = Array.from(
    new Map(candidates.map((row) => [text(row?.id), row])).values()
  ).filter((row) => text(row?.id) && !row?.isArchived);

  const wantedKey = normalizedCategoryPath(wanted);
  const exact = deduped.find((row) => normalizedCategoryPath(row?.fullName) === wantedKey);

  const suffix = exact || deduped
    .filter((row) => normalizeKey(row?.name) === normalizeKey(leaf))
    .sort((a, b) => {
      const aPath = normalizedCategoryPath(a?.fullName);
      const bPath = normalizedCategoryPath(b?.fullName);
      const aScore = aPath.endsWith(`> ${normalizeKey(leaf)}`) ? 1 : 0;
      const bScore = bPath.endsWith(`> ${normalizeKey(leaf)}`) ? 1 : 0;
      return bScore - aScore;
    })[0] || null;

  cache?.set(cacheKey, suffix);
  return suffix;
}


function shouldRepairExistingShopifyCategory(task) {
  const currentId = text(task?.categoryId);
  const currentName = text(task?.categoryName);
  const desired = text(task?.desiredCategoryPath);

  if (!desired) return false;

  // Empty category: safe to set.
  if (!currentId && !currentName) return true;

  // Archived Shopify taxonomy IDs must be migrated.
  if (/\/archived-/i.test(currentId)) return true;

  // Very broad Clothing Accessories is safe to refine only when the product is
  // unmistakably underwear/boxer from our own catalog data.
  if (
    normalizedCategoryPath(currentName) === normalizedCategoryPath("Apparel & Accessories > Clothing Accessories") &&
    /boxer briefs$/i.test(desired)
  ) {
    return true;
  }

  // A broad Shoes kategória biztonságosan finomítható Slippersre,
  // ha az AllIn adat egyértelműen Papuci / Slapi / Flipflop.
  if (
    normalizedCategoryPath(currentName) ===
      normalizedCategoryPath("Apparel & Accessories > Shoes") &&
    normalizedCategoryPath(desired) ===
      normalizedCategoryPath("Apparel & Accessories > Shoes > Slippers")
  ) {
    return true;
  }

  // Legacy / supplier classification can incorrectly leave an unmistakable
  // jacket in Dresses. If productCategory() now confidently resolves the
  // product as Coats & Jackets, this specific correction is safe.
  if (
    normalizedCategoryPath(currentName) ===
      normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") &&
    normalizedCategoryPath(desired) ===
      normalizedCategoryPath("Apparel & Accessories > Clothing > Outerwear > Coats & Jackets")
  ) {
    return true;
  }

  // Legacy / supplier classification can also leave a real T-Shirt in Dresses.
  // If productCategory() confidently resolves it as T-Shirts, repair it.
  if (
    normalizedCategoryPath(currentName) ===
      normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") &&
    normalizedCategoryPath(desired) ===
      normalizedCategoryPath("Apparel & Accessories > Clothing > Clothing Tops > T-Shirts")
  ) {
    return true;
  }

  /*
   * AIF_SAFE_CATEGORY_REPAIRS_V1
   *
   * Ezeknél a desired kategória már a saját product_type alapján készült,
   * ezért a régi hibás Dresses / Pants besorolás biztonságosan javítható.
   */
  const currentKey = normalizedCategoryPath(currentName);
  const desiredKey = normalizedCategoryPath(desired);

  const safeRepairs = new Set([
    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Clothing Tops > T-Shirts"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Clothing Tops > Hoodies"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Clothing Tops > Sweatshirts"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Clothing Tops"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Pants"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Pants > Leggings"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Shorts"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Swimwear > Swim Shorts"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Outerwear > Coats & Jackets"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Pants") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Shorts"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Outerwear > Vests"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Outerwear > Coats & Jackets") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Outerwear > Vests"),

    normalizedCategoryPath("Apparel & Accessories > Clothing > Dresses") + "=>" +
      normalizedCategoryPath("Apparel & Accessories > Clothing > Activewear")
  ]);

  if (safeRepairs.has(currentKey + "=>" + desiredKey)) {
    return true;
  }

  // Never auto-reclassify an already valid, specific category unless one of
  // the explicit safe repair rules above applies.
  return false;
}

async function updateShopifyProductCategory(productId, categoryId) {
  const product = text(productId);
  const category = text(categoryId);
  if (!product || !category) return null;

  const mutation = `mutation AifRepairProductCategory($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        category {
          id
          name
          fullName
          isArchived
        }
      }
      userErrors { field message }
    }
  }`;

  const response = await shopifyGraphql(mutation, {
    product: {
      id: product,
      category,
      deleteConflictingConstrainedMetafields: true,
    },
  });

  const payload = response.data?.productUpdate;
  if (payload?.userErrors?.length) {
    throw Object.assign(
      new Error(payload.userErrors.map((row) => row.message).join(" | ")),
      {
        code: "shopify_product_category_update_failed",
        payload,
        productId: product,
        categoryId: category,
      }
    );
  }

  return payload?.product?.category || null;
}


const AIF_DISPLAY_METAFIELD_DEFINITIONS = [
  {
    field: "brand",
    name: "Brand",
    namespace: "custom",
    key: "allin_brand",
    type: "single_line_text_field",
    description: "AllInFashion admin megjelenítés – márka.",
  },
  {
    field: "color",
    name: "Szín",
    namespace: "custom",
    key: "allin_color",
    type: "list.single_line_text_field",
    description: "AllInFashion admin megjelenítés – termék színei.",
  },
  {
    field: "size",
    name: "Méret",
    namespace: "custom",
    key: "allin_size",
    type: "list.single_line_text_field",
    description: "AllInFashion admin megjelenítés – termék méretei.",
  },
  {
    field: "fabric",
    name: "Szövet",
    namespace: "custom",
    key: "allin_fabric",
    type: "list.single_line_text_field",
    description: "AllInFashion admin megjelenítés – anyag / szövet.",
  },
  {
    field: "ageGroup",
    name: "Korosztály",
    namespace: "custom",
    key: "allin_age_group",
    type: "single_line_text_field",
    description: "AllInFashion admin megjelenítés – korosztály.",
  },
  {
    field: "targetGender",
    name: "Célzott nem",
    namespace: "custom",
    key: "allin_target_gender",
    type: "single_line_text_field",
    description: "AllInFashion admin megjelenítés – célzott nem.",
  },
];

function isLikelySupplierColorCode(value) {
  const raw = text(value).trim().toUpperCase();
  if (!raw) return true;
  return /^\d{2,4}[A-Z]?$/.test(raw) || (/^[A-Z0-9]{2,5}$/.test(raw) && /\d/.test(raw));
}

function displayColorValues(values) {
  const source = unique((Array.isArray(values) ? values : [values]).map(text).filter(Boolean));
  // A 035/449 jellegű beszállítói kód nem színnév. Ha nincs olvasható név,
  // inkább maradjon üres a megjelenítési metafield, mint hogy kód kerüljön bele.
  return source.filter((value) => !isLikelySupplierColorCode(value));
}

function displayTextList(values) {
  return unique((Array.isArray(values) ? values : [values]).map(text).filter(Boolean));
}

async function ensureAllInDisplayMetafieldDefinitions(cache) {
  const results = [];

  for (const spec of AIF_DISPLAY_METAFIELD_DEFINITIONS) {
    const cacheKey = `${spec.namespace}.${spec.key}`;
    if (cache?.has(cacheKey)) {
      results.push(cache.get(cacheKey));
      continue;
    }

    const query = `query AifDisplayMetafieldDefinition($identifier: MetafieldDefinitionIdentifierInput!) {
      metafieldDefinition(identifier: $identifier) {
        id
        name
        namespace
        key
        pinnedPosition
        type { name }
      }
    }`;

    let response = await shopifyGraphql(query, {
      identifier: {
        ownerType: "PRODUCT",
        namespace: spec.namespace,
        key: spec.key,
      },
    });

    let definition = response.data?.metafieldDefinition || null;

    if (!definition) {
      const mutation = `mutation AifCreateDisplayMetafieldDefinition($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition {
            id
            name
            namespace
            key
            pinnedPosition
            type { name }
          }
          userErrors { field message code }
        }
      }`;

      const created = await shopifyGraphql(mutation, {
        definition: {
          name: spec.name,
          namespace: spec.namespace,
          key: spec.key,
          description: spec.description,
          type: spec.type,
          ownerType: "PRODUCT",
        },
      });

      const payload = created.data?.metafieldDefinitionCreate;
      if (payload?.userErrors?.length) {
        throw Object.assign(
          new Error(payload.userErrors.map((row) => row.message).join(" | ")),
          {
            code: "shopify_display_metafield_definition_create_failed",
            field: spec.field,
            payload,
          }
        );
      }
      definition = payload?.createdDefinition || null;
    }

    if (definition?.id && (definition.pinnedPosition === null || definition.pinnedPosition === undefined)) {
      const pinMutation = `mutation AifPinDisplayMetafieldDefinition($id: ID!) {
        metafieldDefinitionPin(definitionId: $id) {
          pinnedDefinition {
            id
            name
            namespace
            key
            pinnedPosition
            type { name }
          }
          userErrors { field message code }
        }
      }`;

      const pinned = await shopifyGraphql(pinMutation, { id: definition.id });
      const payload = pinned.data?.metafieldDefinitionPin;

      if (payload?.userErrors?.length) {
        throw Object.assign(
          new Error(payload.userErrors.map((row) => row.message).join(" | ")),
          {
            code: "shopify_display_metafield_definition_pin_failed",
            field: spec.field,
            payload,
          }
        );
      }

      definition = payload?.pinnedDefinition || definition;
    }

    const result = { ...spec, definition };
    cache?.set(cacheKey, result);
    results.push(result);
  }

  return results;
}

async function setShopifyDisplayMetafields({
  productId,
  brand,
  colors = [],
  sizes = [],
  materials = [],
  ageGroup,
  gender,
  definitions,
}) {
  const product = text(productId);
  if (!product) return { updatedFields: [], skippedFields: [] };

  const values = {
    brand: text(brand),
    color: displayColorValues(colors),
    size: displayTextList(sizes),
    fabric: displayTextList(materials),
    ageGroup: text(ageGroup),
    targetGender: text(gender),
  };

  const inputs = [];
  const inputFields = [];
  const skippedFields = [];

  for (const entry of definitions || []) {
    const spec = entry || {};
    const value = values[spec.field];

    if (spec.type === "list.single_line_text_field") {
      const list = displayTextList(value);
      if (!list.length) {
        skippedFields.push({ field: spec.field, reason: "missing_value" });
        continue;
      }
      inputs.push({
        ownerId: product,
        namespace: spec.namespace,
        key: spec.key,
        type: spec.type,
        value: JSON.stringify(list),
      });
      inputFields.push(spec.field);
      continue;
    }

    const scalar = text(value);
    if (!scalar) {
      skippedFields.push({ field: spec.field, reason: "missing_value" });
      continue;
    }

    inputs.push({
      ownerId: product,
      namespace: spec.namespace,
      key: spec.key,
      type: spec.type,
      value: scalar,
    });
    inputFields.push(spec.field);
  }

  if (!inputs.length) return { updatedFields: [], skippedFields };

  const mutation = `mutation AifSetDisplayProductMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value type }
      userErrors { field message code }
    }
  }`;

  const response = await shopifyGraphql(mutation, { metafields: inputs });
  const payload = response.data?.metafieldsSet;

  if (payload?.userErrors?.length) {
    throw Object.assign(
      new Error(payload.userErrors.map((row) => row.message).join(" | ")),
      {
        code: "shopify_display_metafields_set_failed",
        payload,
        productId: product,
      }
    );
  }

  return {
    updatedFields: inputFields,
    skippedFields,
    metafields: payload?.metafields || [],
  };
}

async function setShopifyProductMetadata({
  productId,
  categoryId,
  brand,
  colors = [],
  sizes = [],
  materials = [],
  gender,
  ageGroup,
  audience,
  style,
  definitionCache,
  exactMetafieldDefinitionCache,
  metaobjectDefinitionTypeCache,
  metaobjectDefinitionsCache,
  metaobjectEntriesCache,
  taxonomyCategoryAttributesCache,
  taxonomyAttributeValuesCache,
}) {
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
      exactNamespace: "custom",
      exactKey: "brand",
      aliases: ["Brand", "Brand name", "Marcă", "Marca", "Márka"],
      preferredNamespaces: ["custom", "shopify"],
      candidates: unique([text(brand)]),
    },
    {
      field: "color",
      exactNamespace: "shopify",
      exactKey: "color-pattern",
      aliases: ["Color", "Colour", "Color pattern", "color-pattern", "Culoare", "Szín"],
      preferredNamespaces: ["shopify"],
      candidates: colorCandidates(colors),
    },
    {
      field: "size",
      exactNamespace: "shopify",
      exactKey: "size",
      aliases: ["Size", "Clothing size", "Accessory size", "Sock size", "Hat size", "Mărime", "Marime", "Méret"],
      preferredNamespaces: ["shopify"],
      candidates: sizeCandidates(sizes),
    },
    {
      field: "fabric",
      exactNamespace: "shopify",
      exactKey: "fabric",
      aliases: ["Fabric", "Material", "Composition", "Compoziție", "Compozitie", "Țesătură", "Tesatura", "Szövet", "Anyag"],
      preferredNamespaces: ["shopify"],
      candidates: materialCandidates(materials),
    },
    {
      field: "targetGender",
      exactNamespace: "shopify",
      exactKey: "target-gender",
      aliases: ["Target gender", "Gender", "Célzott nem", "Nem", "Gen", "Sex"],
      preferredNamespaces: ["shopify"],
      candidates: targetGenderCandidates(gender || audience),
    },
    {
      field: "ageGroup",
      exactNamespace: "shopify",
      exactKey: "age-group",
      aliases: ["Age group", "Korosztály", "Grupă de vârstă", "Grupa de varsta"],
      preferredNamespaces: ["shopify"],
      candidates: ageGroupCandidates(ageGroup || gender || audience),
    },
    {
      field: "audience",
      exactNamespace: "custom",
      exactKey: "public",
      aliases: ["Public", "Audience", "Public țintă", "Target audience"],
      preferredNamespaces: ["custom"],
      candidates: audienceCandidates(audience),
    },
    {
      field: "style",
      aliases: ["Stil", "Style"],
      preferredNamespaces: ["custom"],
      candidates: styleCandidates(style),
    },
  ];

  const inputs = [];
  const inputFields = [];
  const skippedFields = [];
  const resolvedFields = [];
  for (const field of fields) {
    const cleanCandidates = unique((field.candidates || []).map(text).filter(Boolean));
    if (!cleanCandidates.length) {
      skippedFields.push({ field: field.field, reason: "missing_value" });
      continue;
    }
    let listedDefinition = findProductMetafieldDefinition(definitions, field.aliases, field.preferredNamespaces);

    if (!listedDefinition && field.exactNamespace && field.exactKey) {
      listedDefinition = await applicableDefinitionByIdentifier({
        namespace: field.exactNamespace,
        key: field.exactKey,
        categoryId,
        cache: exactMetafieldDefinitionCache,
      });
    }

    if (!listedDefinition) {
      skippedFields.push({
        field: field.field,
        reason: "definition_missing",
        expectedDefinition: field.exactNamespace && field.exactKey
          ? `${field.exactNamespace}.${field.exactKey}`
          : null,
      });
      continue;
    }

    const definition = await exactProductMetafieldDefinition(listedDefinition, exactMetafieldDefinitionCache);

    let resolved;
    try {
      resolved = await metafieldValueForDefinition({
        definition,
        categoryId,
        candidates: cleanCandidates,
        aliases: field.aliases,
        definitionTypeCache: metaobjectDefinitionTypeCache,
        metaobjectDefinitionsCache,
        metaobjectEntriesCache,
        taxonomyCategoryAttributesCache,
        taxonomyAttributeValuesCache,
      });
    } catch (error) {
      skippedFields.push({
        field: field.field,
        reason: "reference_lookup_failed",
        error: error?.message || String(error),
        code: error?.code || null,
        definition: {
          name: definition.name,
          namespace: definition.namespace,
          key: definition.key,
          type: text(definition.type?.name),
        },
      });
      continue;
    }

    if (resolved.value === null) {
      skippedFields.push({
        field: field.field,
        reason: resolved.reason || (definitionChoiceValues(definition).length ? "choice_not_allowed" : "definition_type_unsupported"),
        definition: {
          name: definition.name,
          namespace: definition.namespace,
          key: definition.key,
          type: text(definition.type?.name),
        },
        metaobjectType: resolved.metaobjectType || null,
        taxonomyAttribute: resolved.taxonomyAttribute || null,
        taxonomyValues: resolved.taxonomyValues || null,
        preferredAttributeHandles: resolved.preferredAttributeHandles || undefined,
        availableAttributes: resolved.availableAttributes || undefined,
        availableEntries: resolved.availableEntries || undefined,
        errors: resolved.errors || undefined,
        metafieldValidations: resolved.metafieldValidations || undefined,
        standardTemplate: resolved.standardTemplate || undefined,
        candidates: cleanCandidates,
      });
      continue;
    }

    inputs.push({
      ownerId: product,
      namespace: text(definition.namespace),
      key: text(definition.key),
      type: text(definition.type?.name),
      value: resolved.value,
    });
    inputFields.push(field.field);
    resolvedFields.push({
      field: field.field,
      definition: {
        namespace: text(definition.namespace),
        key: text(definition.key),
        type: text(definition.type?.name),
      },
      metaobjectType: resolved.metaobjectType || null,
      metaobject: resolved.metaobject || null,
      metaobjects: resolved.metaobjects || null,
      createdMetaobjects: resolved.createdMetaobjects || null,
      taxonomyAttribute: resolved.taxonomyAttribute || null,
      taxonomyValues: resolved.taxonomyValues || null,
    });
  }

  if (!inputs.length) return { updatedFields: [], skippedFields, resolvedFields };

  const mutation = `mutation AifSetImportedProductMetadata($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value type }
      userErrors { field message code }
    }
  }`;
  const response = await shopifyGraphql(mutation, { metafields: inputs });
  const payload = response.data?.metafieldsSet;

  if (!payload?.userErrors?.length) {
    return {
      updatedFields: inputFields,
      skippedFields,
      resolvedFields,
      metafields: payload?.metafields || [],
    };
  }

  // Shopify treats metafieldsSet as atomic. One category-constrained field can make
  // the whole product batch fail. Retry each field separately so Brand / Color /
  // Gender etc. still get saved even if one field is invalid for that category.
  const updatedFields = [];
  const metafields = [];
  const batchErrors = payload.userErrors || [];

  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const fieldName = inputFields[index] || `${input.namespace}.${input.key}`;
    const singleResponse = await shopifyGraphql(mutation, { metafields: [input] });
    const singlePayload = singleResponse.data?.metafieldsSet;

    if (singlePayload?.userErrors?.length) {
      skippedFields.push({
        field: fieldName,
        reason: "metafield_set_failed",
        definition: {
          namespace: input.namespace,
          key: input.key,
          type: input.type,
        },
        errors: singlePayload.userErrors,
        candidates: null,
      });
      continue;
    }

    updatedFields.push(fieldName);
    metafields.push(...(singlePayload?.metafields || []));
  }

  return {
    updatedFields,
    skippedFields,
    resolvedFields,
    metafields,
    batchErrors,
  };
}

async function enqueueInitialMiercureaProductExportStock(client, variantId, quantity, reason = "product_export_reconcile") {
  // A termékexport nem találhat ki külön készletet.
  // Mindkét Shopify location mindig az AllIn aktuális, valós készletét kapja.
  return enqueueAifShopifyVariant(
    client,
    variantId,
    text(reason) || "product_export_reconcile"
  );
}

export async function reconcileAifShopifyProductExport(client, exportId, options = {}) {
  await ensureAifShopifyExportSchema(client);
  const metadataOnly = bool(options.metadataOnly, false);
  const exportResult = await client.query(`SELECT * FROM aif_shopify_product_exports WHERE id::text=$1 LIMIT 1`, [text(exportId)]);
  if (!exportResult.rowCount) return null;
  const exportRow = exportResult.rows[0];
  const itemsResult = await client.query(
    `SELECT
       e.*,
       b.name AS live_brand_name,
       b.code AS live_brand_code,
       v.color_name AS live_color_name,
       v.color_code AS live_color_code,
       sc.supplier_color_name AS live_supplier_color_name,
       sc.supplier_color_code AS live_supplier_color_code,
       sc.supplier_product_code AS live_supplier_product_code,
       sc.supplier_variant_code AS live_supplier_variant_code,
       v.size AS live_size,
       v.internal_sku AS live_internal_sku,
       m.model_code AS live_model_code,
       m.gender AS live_gender,
       m.material AS live_material,
       m.product_type AS live_product_type,
       c.name_ro AS live_category_name_ro,
       subc.name_ro AS live_subcategory_name_ro
     FROM aif_shopify_product_export_items e
     JOIN aif_product_variants v ON v.id=e.variant_id
     JOIN aif_product_models m ON m.id=v.model_id
     LEFT JOIN aif_brands b ON b.id=m.brand_id
     LEFT JOIN aif_categories c ON c.id=m.category_id
     LEFT JOIN aif_categories subc ON subc.id=m.subcategory_id
     LEFT JOIN LATERAL (
       SELECT supplier_color_code, supplier_color_name, supplier_product_code, supplier_variant_code
       FROM aif_variant_supplier_codes sc
       WHERE sc.variant_id=v.id AND COALESCE(sc.is_active,true)=true
       ORDER BY sc.updated_at DESC NULLS LAST, sc.created_at DESC NULLS LAST
       LIMIT 1
     ) sc ON true
     WHERE e.export_id=$1 AND e.item_status IN ('exported_pending','error','mapped')
     ORDER BY e.created_at`,
    [exportRow.id]
  );
  const shopifyVariants = await loadAllShopifyVariants();
  // A Shopify lapozott listája ritkán ugyanazt a variáns-ID-t több oldalon is
  // visszaadhatja. SKU-hibát csak különböző Shopify variánsazonosítók alapján jelzünk.
  const bySku = indexShopifyVariantsBySku(shopifyVariants);
  const exactSkuCache = new Map();

  let mapped = 0;
  let errors = 0;
  const errorItems = [];
  const productTasks = new Map();
  for (const item of itemsResult.rows) {
    const sku = normalizeKey(item.sku);
    // A teljes katalógus lapozott listája időnként régi vagy átmeneti találatot adhat.
    // Ha ott nem pontosan egy variáns van, az SKU-t külön, friss Shopify kereséssel ellenőrizzük.
    const matches = await resolveShopifySkuMatches(bySku, item.sku, exactSkuCache);
    if (matches.length !== 1) {
      const message = !sku
        ? "Hiányzik a Shopify SKU."
        : matches.length
          ? `A Shopifyban ${matches.length} különböző variáns használja ezt az SKU-t.`
          : "Az SKU még nem található a Shopifyban.";
      await client.query(
        `UPDATE aif_shopify_product_export_items
         SET item_status='error', mapped_at=NULL, validation_errors=ARRAY[$3]::text[], updated_at=now()
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
      await client.query(
        `UPDATE aif_shopify_product_export_items
         SET item_status='error', mapped_at=NULL, validation_errors=ARRAY[$3]::text[], updated_at=now()
         WHERE export_id=$1 AND variant_id=$2`,
        [exportRow.id, item.variant_id, message]
      );
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
      if (!metadataOnly && options.enqueueStock !== false) {
        await enqueueInitialMiercureaProductExportStock(client, item.variant_id, item.snapshot?.availableQty, "product_export_reconcile");
      }
      const taskData = {
        productId,
        modelId: item.model_id,
        brand: text(item.snapshot?.brand || item.live_brand_name || item.live_brand_code),
        colors: displayColorValues([
          text(item.snapshot?.color),
          text(item.live_color_name),
          text(item.live_supplier_color_name),
        ]),
        sizes: unique([text(item.snapshot?.size), text(item.live_size)]),
        materials: unique([text(item.snapshot?.material), text(item.live_material)]),
        genders: unique([
          shopifyGenderForRow({
            gender: text(item.snapshot?.gender || item.live_gender),
            shopify_title: text(item.snapshot?.title),
            title_ro: text(item.snapshot?.title),
            category_name_ro: text(item.snapshot?.categoryNameRo || item.live_category_name_ro),
            category_name_hu: text(item.snapshot?.categoryNameHu),
            category_code: text(item.snapshot?.categoryCode),
            subcategory_name_ro: text(item.snapshot?.subcategoryNameRo || item.live_subcategory_name_ro),
            subcategory_name_hu: text(item.snapshot?.subcategoryNameHu),
            subcategory_code: text(item.snapshot?.subcategoryCode),
            product_type: text(item.snapshot?.productType || item.live_product_type),
            brand_name: text(item.snapshot?.brand || item.live_brand_name),
            brand_code: text(item.snapshot?.brandCode || item.live_brand_code),
            model_code: text(item.live_model_code),
            productCode: text(item.snapshot?.productCode),
            supplier_product_code: text(item.live_supplier_product_code),
            supplier_variant_code: text(item.live_supplier_variant_code),
            internal_sku: text(item.live_internal_sku),
          }),
        ]),
        ageGroups: unique([
          shopifyAgeGroupForRow({
            gender: text(item.snapshot?.gender || item.live_gender),
            shopify_title: text(item.snapshot?.title),
            title_ro: text(item.snapshot?.title),
            category_name_ro: text(item.snapshot?.categoryNameRo || item.live_category_name_ro),
            category_name_hu: text(item.snapshot?.categoryNameHu),
            category_code: text(item.snapshot?.categoryCode),
            subcategory_name_ro: text(item.snapshot?.subcategoryNameRo || item.live_subcategory_name_ro),
            subcategory_name_hu: text(item.snapshot?.subcategoryNameHu),
            subcategory_code: text(item.snapshot?.subcategoryCode),
            product_type: text(item.snapshot?.productType || item.live_product_type),
            brand_name: text(item.snapshot?.brand || item.live_brand_name),
            brand_code: text(item.snapshot?.brandCode || item.live_brand_code),
            model_code: text(item.live_model_code),
            productCode: text(item.snapshot?.productCode),
            supplier_product_code: text(item.live_supplier_product_code),
            supplier_variant_code: text(item.live_supplier_variant_code),
            internal_sku: text(item.live_internal_sku),
          }),
        ]),
        audience: shopifyAudience({
          gender: text(item.snapshot?.gender || item.live_gender),
          shopify_title: text(item.snapshot?.title),
          title_ro: text(item.snapshot?.title),
          category_name_ro: text(item.snapshot?.categoryNameRo || item.live_category_name_ro),
          category_name_hu: text(item.snapshot?.categoryNameHu),
          category_code: text(item.snapshot?.categoryCode),
          subcategory_name_ro: text(item.snapshot?.subcategoryNameRo || item.live_subcategory_name_ro),
          subcategory_name_hu: text(item.snapshot?.subcategoryNameHu),
          subcategory_code: text(item.snapshot?.subcategoryCode),
          product_type: text(item.snapshot?.productType || item.live_product_type),
          brand_name: text(item.snapshot?.brand || item.live_brand_name),
          brand_code: text(item.snapshot?.brandCode || item.live_brand_code),
          model_code: text(item.live_model_code),
          productCode: text(item.snapshot?.productCode),
          supplier_product_code: text(item.live_supplier_product_code),
          supplier_variant_code: text(item.live_supplier_variant_code),
          internal_sku: text(item.live_internal_sku),
        }),
        style: text(item.snapshot?.style) || shopifyStyle({
          brand_name: item.live_brand_name,
          category_name_ro: item.live_category_name_ro,
          subcategory_name_ro: item.live_subcategory_name_ro,
          product_type: item.live_product_type,
        }),
        desiredCategoryPath: productCategory({
          shopify_title: text(item.snapshot?.title),
          title_ro: text(item.snapshot?.title),
          category_name_ro: text(item.snapshot?.categoryNameRo || item.live_category_name_ro),
          category_name_hu: text(item.snapshot?.categoryNameHu),
          category_code: text(item.snapshot?.categoryCode),
          subcategory_name_ro: text(item.snapshot?.subcategoryNameRo || item.live_subcategory_name_ro),
          subcategory_name_hu: text(item.snapshot?.subcategoryNameHu),
          subcategory_code: text(item.snapshot?.subcategoryCode),
          product_type: text(item.snapshot?.productType || item.live_product_type),
        }) || text(item.snapshot?.productCategory),
        categoryId: text(variant.product?.category?.id),
        categoryName: text(variant.product?.category?.fullName || variant.product?.category?.name),
        currentStatus: text(variant.product?.status),
      };
      const existingTask = productTasks.get(productId);
      productTasks.set(productId, existingTask ? {
        ...existingTask,
        brand: existingTask.brand || taskData.brand,
        colors: unique([...(existingTask.colors || []), ...taskData.colors]),
        sizes: unique([...(existingTask.sizes || []), ...taskData.sizes]),
        materials: unique([...(existingTask.materials || []), ...taskData.materials]),
        genders: unique([...(existingTask.genders || []), ...taskData.genders]),
        ageGroups: unique([...(existingTask.ageGroups || []), ...taskData.ageGroups]),
        audience: existingTask.audience || taskData.audience,
        style: existingTask.style || taskData.style,
        desiredCategoryPath: existingTask.desiredCategoryPath || taskData.desiredCategoryPath,
        categoryId: existingTask.categoryId || taskData.categoryId,
        categoryName: existingTask.categoryName || taskData.categoryName,
      } : taskData);
      mapped += 1;
    } catch (error) {
      const message = error?.message || String(error);
      await client.query(
        `UPDATE aif_shopify_product_export_items
         SET item_status='error', mapped_at=NULL, validation_errors=ARRAY[$3]::text[], updated_at=now()
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
  let colorUpdatedProducts = 0;
  let colorSkippedProducts = 0;
  let sizeUpdatedProducts = 0;
  let sizeSkippedProducts = 0;
  let fabricUpdatedProducts = 0;
  let fabricSkippedProducts = 0;
  let targetGenderUpdatedProducts = 0;
  let targetGenderSkippedProducts = 0;
  let ageGroupUpdatedProducts = 0;
  let ageGroupSkippedProducts = 0;
  let audienceUpdatedProducts = 0;
  let audienceSkippedProducts = 0;
  let styleUpdatedProducts = 0;
  let styleSkippedProducts = 0;
  let metadataUpdatedProducts = 0;
  let displayMetadataUpdatedProducts = 0;
  let displayMetadataSkippedProducts = 0;
  let categoryUpdatedProducts = 0;
  let categorySkippedProducts = 0;
  const productErrors = [];
  const productWarnings = [];
  const metadataDefinitionCache = new Map();
  const exactMetafieldDefinitionCache = new Map();
  const metaobjectDefinitionTypeCache = new Map();
  const metaobjectDefinitionsCache = new Map();
  const metaobjectEntriesCache = new Map();
  const taxonomyCategoryAttributesCache = new Map();
  const taxonomyAttributeValuesCache = new Map();
  const taxonomyCategorySearchCache = new Map();
  const displayMetafieldDefinitionCache = new Map();
  let displayMetafieldDefinitions = [];
  let onlinePublicationId = "";

  if (productTasks.size) {
    try {
      displayMetafieldDefinitions = await ensureAllInDisplayMetafieldDefinitions(
        displayMetafieldDefinitionCache,
      );
    } catch (error) {
      productWarnings.push({
        scope: "displayMetadataDefinitions",
        reason: "display_definition_setup_failed",
        error: error?.message || String(error),
        code: error?.code || null,
      });
    }
  }

  if (!metadataOnly && exportRow.product_status === "active" && productTasks.size) {
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
      if (!metadataOnly && exportRow.product_status === "active") {
        await activateShopifyProduct(task.productId, task.brand);
        activatedProducts += 1;
        if (onlinePublicationId) {
          const published = await publishShopifyProductToOnlineStore(task.productId, onlinePublicationId);
          if (published) publishedProducts += 1;
        }
      }

      // Repair obsolete / overly broad Shopify categories before resolving
      // category metafields. This is required for archived taxonomy IDs such as
      // the old Socks category and for products that were exported into a broad
      // parent category even though the model/title clearly identifies a leaf.
      if (task.desiredCategoryPath && shouldRepairExistingShopifyCategory(task)) {
        try {
          const oldCategoryId = text(task.categoryId);
          const desiredCategory = await taxonomyCategoryByPath(
            task.desiredCategoryPath,
            taxonomyCategorySearchCache,
          );

          if (desiredCategory?.id && text(desiredCategory.id) !== oldCategoryId) {
            const updatedCategory = await updateShopifyProductCategory(
              task.productId,
              desiredCategory.id,
            );
            task.categoryId = text(updatedCategory?.id || desiredCategory.id);
            task.categoryName = text(updatedCategory?.fullName || desiredCategory.fullName);
            categoryUpdatedProducts += 1;

            // A category changed, so applicable metafield definitions must be
            // resolved fresh for both the old and the new category keys.
            if (oldCategoryId) metadataDefinitionCache.delete(oldCategoryId);
            if (task.categoryId) metadataDefinitionCache.delete(task.categoryId);
          } else if (!desiredCategory?.id) {
            categorySkippedProducts += 1;
            productWarnings.push({
              scope: "category",
              productId: task.productId,
              category: task.categoryName || task.categoryId || null,
              reason: "taxonomy_category_not_found",
              desiredCategoryPath: task.desiredCategoryPath,
            });
          }
        } catch (error) {
          categorySkippedProducts += 1;
          productWarnings.push({
            scope: "category",
            productId: task.productId,
            category: task.categoryName || task.categoryId || null,
            reason: "category_update_failed",
            desiredCategoryPath: task.desiredCategoryPath,
            error: error?.message || String(error),
            code: error?.code || null,
          });
        }
      }

      const metadataResult = await setShopifyProductMetadata({
        ...task,
        colors: task.colors || [],
        sizes: task.sizes || [],
        materials: task.materials || [],
        gender: (task.genders || [])[0] || "",
        ageGroup: (task.ageGroups || [])[0] || "",
        definitionCache: metadataDefinitionCache,
        exactMetafieldDefinitionCache,
        metaobjectDefinitionTypeCache,
        metaobjectDefinitionsCache,
        metaobjectEntriesCache,
        taxonomyCategoryAttributesCache,
        taxonomyAttributeValuesCache,
      });
      if (metadataResult.updatedFields.length) metadataUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("brand")) brandUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("color")) colorUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("size")) sizeUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("fabric")) fabricUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("targetGender")) targetGenderUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("ageGroup")) ageGroupUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("audience")) audienceUpdatedProducts += 1;
      if (metadataResult.updatedFields.includes("style")) styleUpdatedProducts += 1;

      for (const skipped of metadataResult.skippedFields || []) {
        if (skipped.field === "brand") brandSkippedProducts += 1;
        if (skipped.field === "color") colorSkippedProducts += 1;
        if (skipped.field === "size") sizeSkippedProducts += 1;
        if (skipped.field === "fabric") fabricSkippedProducts += 1;
        if (skipped.field === "targetGender") targetGenderSkippedProducts += 1;
        if (skipped.field === "ageGroup") ageGroupSkippedProducts += 1;
        if (skipped.field === "audience") audienceSkippedProducts += 1;
        if (skipped.field === "style") styleSkippedProducts += 1;
        productWarnings.push({
          scope: skipped.field,
          productId: task.productId,
          category: task.categoryName || task.categoryId || null,
          reason: skipped.reason,
          definition: skipped.definition || null,
          expectedDefinition: skipped.expectedDefinition || null,
          metaobjectType: skipped.metaobjectType || null,
          preferredAttributeHandles: skipped.preferredAttributeHandles || null,
          availableAttributes: skipped.availableAttributes || null,
          availableEntries: skipped.availableEntries || null,
          errors: skipped.errors || null,
          candidates: skipped.candidates || null,
          error: skipped.error || null,
          code: skipped.code || null,
        });
      }


      if (displayMetafieldDefinitions.length) {
        try {
          const displayResult = await setShopifyDisplayMetafields({
            productId: task.productId,
            brand: task.brand,
            colors: task.colors || [],
            sizes: task.sizes || [],
            materials: task.materials || [],
            ageGroup: (task.ageGroups || [])[0] || "",
            gender: (task.genders || [])[0] || task.audience || "",
            definitions: displayMetafieldDefinitions,
          });

          if (displayResult.updatedFields.length) displayMetadataUpdatedProducts += 1;
          if (displayResult.skippedFields?.length) displayMetadataSkippedProducts += 1;
        } catch (error) {
          displayMetadataSkippedProducts += 1;
          productWarnings.push({
            scope: "displayMetadata",
            productId: task.productId,
            category: task.categoryName || task.categoryId || null,
            reason: "display_metafields_set_failed",
            error: error?.message || String(error),
            code: error?.code || null,
          });
        }
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
  // A párosítási állapot a variánsmappinget jelenti. A közzétételi vagy metaadat-hibák
  // külön a reconciliation összegzésben maradnak, és nem tartják hamisan részlegesnek az exportot.
  const finalStatus = Number(totals.pending || 0) === 0 && Number(totals.errors || 0) === 0 ? "mapped" : "partially_mapped";
  const reconciliation = {
    mapped,
    errors,
    remoteVariantCount: shopifyVariants.length,
    indexedSkuCount: bySku.size,
    totals,
    activatedProducts,
    publishedProducts,
    brandUpdatedProducts,
    brandSkippedProducts,
    colorUpdatedProducts,
    colorSkippedProducts,
    sizeUpdatedProducts,
    sizeSkippedProducts,
    fabricUpdatedProducts,
    fabricSkippedProducts,
    targetGenderUpdatedProducts,
    targetGenderSkippedProducts,
    ageGroupUpdatedProducts,
    ageGroupSkippedProducts,
    audienceUpdatedProducts,
    audienceSkippedProducts,
    styleUpdatedProducts,
    styleSkippedProducts,
    metadataUpdatedProducts,
    displayMetadataUpdatedProducts,
    displayMetadataSkippedProducts,
    categoryUpdatedProducts,
    categorySkippedProducts,
    metadataOnly,
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
    remoteVariantCount: shopifyVariants.length,
    indexedSkuCount: bySku.size,
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
    colorUpdatedProducts,
    colorSkippedProducts,
    sizeUpdatedProducts,
    sizeSkippedProducts,
    fabricUpdatedProducts,
    fabricSkippedProducts,
    targetGenderUpdatedProducts,
    targetGenderSkippedProducts,
    ageGroupUpdatedProducts,
    ageGroupSkippedProducts,
    audienceUpdatedProducts,
    audienceSkippedProducts,
    styleUpdatedProducts,
    styleSkippedProducts,
    metadataUpdatedProducts,
    displayMetadataUpdatedProducts,
    displayMetadataSkippedProducts,
    categoryUpdatedProducts,
    categorySkippedProducts,
    metadataOnly,
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
  for (const variant of shopifyVariants) {
    const id = text(variant?.id);
    if (id) byId.set(id, variant);
  }
  const bySku = indexShopifyVariantsBySku(shopifyVariants);
  const exactSkuCache = new Map();

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
      const matches = await resolveShopifySkuMatches(bySku, expectedSku, exactSkuCache);
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
