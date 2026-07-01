import * as XLSX from "xlsx";
import type { AifParsedRow, AifSupplier } from "./api";

export type AifColumnField =
  | "ignore"
  | "brand"
  | "productCode"
  | "variantCode"
  | "name"
  | "colorCode"
  | "colorName"
  | "size"
  | "qty"
  | "buyPrice"
  | "sellPrice"
  | "barcode"
  | "category"
  | "subCategory"
  | "gender"
  | "season"
  | "productType"
  | "composition"
  | "country"
  | "customsCode"
  | "weightGrams"
  | "imageUrl"
  | "webshop"
  | "active";

export type AifColumnAnalysis = {
  index: number;
  header: string;
  field: AifColumnField;
  label: string;
  confidence: number;
  samples: string[];
  warnings: string[];
};

export type AifWorkbookAnalysis = {
  sheetName: string;
  headerRow: number;
  dataRowCount: number;
  overallConfidence: number;
  detectedProfile: string;
  columns: AifColumnAnalysis[];
  warnings: string[];
};

export type AifWorkbookParseResult = {
  rows: AifParsedRow[];
  analysis: AifWorkbookAnalysis;
};

type RawRow = Record<string, unknown>;

type FieldRule = {
  field: AifColumnField;
  label: string;
  aliases: string[];
  sampleScore?: (values: string[]) => number;
};

const FIELD_LABELS: Record<AifColumnField, string> = {
  ignore: "Kihagyás",
  brand: "Márka",
  productCode: "Termékkód",
  variantCode: "Variáns kód",
  name: "Terméknév",
  colorCode: "Színkód",
  colorName: "Szín",
  size: "Méret",
  qty: "Darab",
  buyPrice: "Vételár",
  sellPrice: "Eladási ár",
  barcode: "Vonalkód",
  category: "Kategória",
  subCategory: "Alkategória",
  gender: "Nem",
  season: "Szezon",
  productType: "Terméktípus",
  composition: "Összetétel",
  country: "Származási ország",
  customsCode: "Vámtarifa",
  weightGrams: "Súly",
  imageUrl: "Kép",
  webshop: "Webshop",
  active: "Aktív",
};

export const AIF_COLUMN_FIELD_OPTIONS: Array<{ value: AifColumnField; label: string }> = [
  { value: "ignore", label: FIELD_LABELS.ignore },
  { value: "barcode", label: FIELD_LABELS.barcode },
  { value: "brand", label: FIELD_LABELS.brand },
  { value: "productCode", label: FIELD_LABELS.productCode },
  { value: "variantCode", label: FIELD_LABELS.variantCode },
  { value: "name", label: FIELD_LABELS.name },
  { value: "colorCode", label: FIELD_LABELS.colorCode },
  { value: "colorName", label: FIELD_LABELS.colorName },
  { value: "size", label: FIELD_LABELS.size },
  { value: "qty", label: FIELD_LABELS.qty },
  { value: "buyPrice", label: FIELD_LABELS.buyPrice },
  { value: "sellPrice", label: FIELD_LABELS.sellPrice },
  { value: "category", label: FIELD_LABELS.category },
  { value: "subCategory", label: FIELD_LABELS.subCategory },
  { value: "gender", label: FIELD_LABELS.gender },
  { value: "season", label: FIELD_LABELS.season },
  { value: "productType", label: FIELD_LABELS.productType },
  { value: "composition", label: FIELD_LABELS.composition },
  { value: "country", label: FIELD_LABELS.country },
  { value: "customsCode", label: FIELD_LABELS.customsCode },
  { value: "weightGrams", label: FIELD_LABELS.weightGrams },
  { value: "imageUrl", label: FIELD_LABELS.imageUrl },
  { value: "webshop", label: FIELD_LABELS.webshop },
  { value: "active", label: FIELD_LABELS.active },
];

function clean(v: unknown): string {
  return String(v ?? "").replace(/\u00a0/g, " ").trim();
}

function norm(v: unknown): string {
  return clean(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function compactNorm(v: unknown): string {
  return norm(v).replace(/_/g, "");
}

function money(v: unknown): number | null {
  const s = clean(v).replace(/\s+/g, "").replace(/,/g, ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function qty(v: unknown): number | null {
  const s = clean(v).replace(/\s+/g, "").replace(/,/g, ".");
  if (!s) return null;
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? n : null;
}

function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function isMoneyLike(v: string) {
  const s = v.replace(/\s+/g, "").replace(/,/g, ".");
  return /^-?\d+(\.\d{1,4})?$/.test(s);
}

function isIntegerLike(v: string) {
  return /^-?\d+$/.test(v.replace(/\s+/g, ""));
}

function isSizeLike(v: string) {
  const s = norm(v);
  if (!s) return false;
  if (/^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|xxxxl)$/.test(s)) return true;
  if (/^(one_size|onesize|uni|universal|os)$/.test(s)) return true;
  if (/^\d{1,2}(\.5)?$/.test(s)) return true;
  if (/^\d{2}_\d{2}$/.test(s)) return true;
  return false;
}

function isColorLike(v: string) {
  const s = norm(v);
  if (!s) return false;
  if (isSizeLike(v)) return false;
  if (/^\d{1,2}$/.test(s)) return false;
  if (/^(black|white|blue|navy|red|green|grey|gray|pink|purple|yellow|orange|brown|beige|silver|gold|multicolor|fekete|feher|kek|piros|zold|szurke|rozsaszin|lila|sarga|narancs|barna|alb|negru|rosu|verde|gri|galben|maro|albastru)$/.test(s)) return true;
  return /^[a-z0-9_\-\s\/]{3,30}$/i.test(v) && /[a-zA-Z]/.test(v);
}

function isBarcodeLike(v: string) {
  const s = v.replace(/\D/g, "");
  return s.length === 8 || s.length === 12 || s.length === 13 || s.length === 14;
}

function sampleScore(values: string[], predicate: (value: string) => boolean): number {
  const nonEmpty = values.map(clean).filter(Boolean).slice(0, 80);
  if (!nonEmpty.length) return 0;
  return percent(nonEmpty.filter(predicate).length, nonEmpty.length);
}

const RULES: FieldRule[] = [
  { field: "barcode", label: FIELD_LABELS.barcode, aliases: ["barcode", "bar code", "ean", "ean13", "gtin", "cod bare", "codbare", "cod de bare", "vonalkod", "vonalkód"], sampleScore: (v) => sampleScore(v, isBarcodeLike) },
  { field: "brand", label: FIELD_LABELS.brand, aliases: ["brand", "marca", "márka", "manufacturer", "producator"] },
  { field: "productCode", label: FIELD_LABELS.productCode, aliases: ["product code", "cod produs", "codprodus", "cod", "model", "style", "style code", "item", "item no", "article", "articol", "sku", "cod model"] },
  { field: "variantCode", label: FIELD_LABELS.variantCode, aliases: ["variant code", "cod varianta", "variant", "sku varianta", "size sku", "cod marime", "sku"] },
  { field: "name", label: FIELD_LABELS.name, aliases: ["name", "product name", "denumire", "denumire produs", "nume", "descriere", "description", "megnevezes", "megnevezés", "termen nev", "termek nev", "termék név", "produs"] },
  { field: "colorCode", label: FIELD_LABELS.colorCode, aliases: ["color code", "colour code", "cod culoare", "cod culoare furnizor", "szin cod", "szin kod", "szín kód", "szinkod", "színkód", "culoare cod"] },
  { field: "colorName", label: FIELD_LABELS.colorName, aliases: ["color", "colour", "culoare", "nume culoare", "szin", "szín", "color name", "colour name", "szin nev", "szín név"], sampleScore: (v) => sampleScore(v, isColorLike) },
  { field: "size", label: FIELD_LABELS.size, aliases: ["size", "marime", "mărime", "méret", "meret", "taille", "numar", "nr"], sampleScore: (v) => sampleScore(v, isSizeLike) },
  { field: "qty", label: FIELD_LABELS.qty, aliases: ["qty", "quantity", "cantitate", "stoc", "stock", "buc", "bucati", "pcs", "db", "menge", "cant"], sampleScore: (v) => sampleScore(v, isIntegerLike) },
  { field: "buyPrice", label: FIELD_LABELS.buyPrice, aliases: ["buy price", "pret achizitie", "preț achiziție", "pretachiz", "pret achiz", "pret furnizor", "cost", "net price", "purchase price", "whs ron", "whs euro", "whs usd", "whs ft", "whs"], sampleScore: (v) => sampleScore(v, isMoneyLike) },
  { field: "sellPrice", label: FIELD_LABELS.sellPrice, aliases: ["sell price", "pret vanzare", "preț vânzare", "pretvanz", "price", "pret", "rrp", "retail price", "prp"], sampleScore: (v) => sampleScore(v, isMoneyLike) },
  { field: "category", label: FIELD_LABELS.category, aliases: ["category", "categorie", "kategoria", "kategória", "product type", "tip produs", "clasificare"] },
  { field: "subCategory", label: FIELD_LABELS.subCategory, aliases: ["subcategory", "sub category", "subcategorie", "subcategorie produs", "subkategoria", "subcategorie"] },
  { field: "gender", label: FIELD_LABELS.gender, aliases: ["gender", "gen", "sex", "departament", "department", "category gender"] },
  { field: "season", label: FIELD_LABELS.season, aliases: ["season", "sezon", "szezon"] },
  { field: "productType", label: FIELD_LABELS.productType, aliases: ["activitate", "activity", "sport", "product line", "linie", "collection", "colectie"] },
  { field: "composition", label: FIELD_LABELS.composition, aliases: ["composition", "compozitie", "compoziție", "összetétel", "osszetetel", "material", "materiale"] },
  { field: "country", label: FIELD_LABELS.country, aliases: ["tara", "țara", "country", "country of origin", "origine", "szarmazasi orszag", "származási ország"] },
  { field: "customsCode", label: FIELD_LABELS.customsCode, aliases: ["coduri vamale", "cod vamal", "hs code", "taric", "customs code", "vamtarifa", "vámtarifa"] },
  { field: "weightGrams", label: FIELD_LABELS.weightGrams, aliases: ["gramaj", "weight", "greutate", "suly", "súly", "weight grams"], sampleScore: (v) => sampleScore(v, isMoneyLike) },
  { field: "imageUrl", label: FIELD_LABELS.imageUrl, aliases: ["image", "image url", "poza", "imagine", "url imagine", "photo", "picture", "kep", "kép"] },
  { field: "webshop", label: FIELD_LABELS.webshop, aliases: ["webshop", "web shop", "online", "shopify", "site"] },
  { field: "active", label: FIELD_LABELS.active, aliases: ["active", "activ", "active_pda", "status"] },
];

function aliasScore(header: string, rule: FieldRule): number {
  const h = norm(header);
  const hc = compactNorm(header);
  if (!h && !hc) return 0;
  for (const alias of rule.aliases) {
    const a = norm(alias);
    const ac = compactNorm(alias);
    if (h === a || hc === ac) return 100;
    if (h.includes(a) || a.includes(h) || hc.includes(ac) || ac.includes(hc)) return 82;
  }
  return 0;
}

function bestFieldForColumn(header: string, values: string[]): AifColumnAnalysis {
  let best: AifColumnAnalysis = {
    index: 0,
    header: clean(header) || "Oszlop",
    field: "ignore",
    label: FIELD_LABELS.ignore,
    confidence: 0,
    samples: values.map(clean).filter(Boolean).slice(0, 5),
    warnings: [],
  };

  for (const rule of RULES) {
    const aScore = aliasScore(header, rule);
    const sScore = rule.sampleScore ? rule.sampleScore(values) : 0;
    const combined = Math.max(aScore, Math.round(aScore * 0.75 + sScore * 0.25), sScore >= 92 && aScore >= 35 ? 70 : 0);
    if (combined > best.confidence) {
      best = {
        ...best,
        field: rule.field,
        label: rule.label,
        confidence: combined,
      };
    }
  }

  if (best.confidence < 45) {
    best.field = "ignore";
    best.label = FIELD_LABELS.ignore;
  }

  if (best.field === "size") {
    const colorish = sampleScore(values, isColorLike);
    if (colorish > 45) best.warnings.push("A mező méretként lett felismerve, de több érték színnek tűnik.");
  }
  if (best.field === "colorName") {
    const sizeish = sampleScore(values, isSizeLike);
    if (sizeish > 45) best.warnings.push("A mező színként lett felismerve, de több érték méretnek tűnik.");
  }
  if (best.field === "qty") {
    const numeric = sampleScore(values, isIntegerLike);
    if (numeric < 70) best.warnings.push("A darab mezőben nem csak egész számok vannak.");
  }
  if ((best.field === "buyPrice" || best.field === "sellPrice") && sampleScore(values, isMoneyLike) < 60) {
    best.warnings.push("Az ár mezőben több nem számszerű érték van.");
  }

  return best;
}

function headerCandidateScore(row: unknown[]): number {
  const values = row.map(clean).filter(Boolean);
  if (!values.length) return 0;
  const aliasHits = values.reduce((acc, value) => {
    const hit = RULES.some((rule) => aliasScore(value, rule) >= 82);
    return acc + (hit ? 1 : 0);
  }, 0);
  const texty = values.filter((value) => /[a-zA-ZÀ-ž]/.test(value)).length;
  const unique = new Set(values.map(norm)).size;
  return aliasHits * 20 + texty * 2 + unique;
}

function findHeaderRow(matrix: unknown[][]): number {
  let bestIndex = 0;
  let bestScore = -1;
  const limit = Math.min(matrix.length, 30);
  for (let i = 0; i < limit; i++) {
    const score = headerCandidateScore(matrix[i] || []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function headerName(value: unknown, index: number): string {
  const h = clean(value);
  return h || `Oszlop ${index + 1}`;
}

function makeUniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h, idx) => {
    const base = headerName(h, idx);
    const key = norm(base) || `oszlop_${idx + 1}`;
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
}

function matrixToRows(matrix: unknown[][], headerRowIndex: number): RawRow[] {
  const headers = makeUniqueHeaders((matrix[headerRowIndex] || []).map((x, i) => headerName(x, i)));
  const rows: RawRow[] = [];
  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const arr = matrix[i] || [];
    const row: RawRow = {};
    let nonEmpty = 0;
    headers.forEach((header, colIdx) => {
      const value = arr[colIdx] ?? "";
      if (clean(value)) nonEmpty++;
      row[header] = value;
    });
    if (nonEmpty) rows.push({ ...row, __rowNo: i + 1 });
  }
  return rows;
}

function analyzeColumns(headers: string[], rows: RawRow[]): AifColumnAnalysis[] {
  return headers.map((header, index) => {
    const values = rows.map((row) => clean(row[header])).filter(Boolean).slice(0, 80);
    return { ...bestFieldForColumn(header, values), index, header, samples: values.slice(0, 5) };
  });
}

function valueByField(row: RawRow, columns: AifColumnAnalysis[], field: AifColumnField): string {
  const col = columns.find((c) => c.field === field);
  if (!col) return "";
  return clean(row[col.header]);
}

function normalizeGender(value: string): "men" | "women" | "kids" | "unisex" {
  const g = norm(value);
  if (["barbati", "barbat", "men", "mens", "male", "masculin", "m"].includes(g)) return "men";
  if (["femei", "femeie", "dama", "dame", "women", "womens", "female", "feminin", "f"].includes(g)) return "women";
  if (["copii", "copil", "kids", "children", "junior", "juniors", "youth", "baieti", "fete"].includes(g)) return "kids";
  return "unisex";
}

function guessCategory(value: string): string | null {
  const c = norm(value);
  if (!c) return null;
  if (c.includes("pantof") || c.includes("incalt") || c.includes("shoe") || c.includes("sneaker") || c.includes("cip") || c.includes("boot")) return "incaltaminte";
  if (c.includes("acces") || c.includes("geanta") || c.includes("rucsac") || c.includes("sapca") || c.includes("caciula") || c.includes("belt") || c.includes("curea")) return "accesorii";
  if (c.includes("outlet")) return "outlet";
  if (c.includes("imbrac") || c.includes("ruha") || c.includes("shirt") || c.includes("tricou") || c.includes("pantal") || c.includes("hanorac") || c.includes("jacheta") || c.includes("rochie")) return "imbracaminte";
  return c;
}

function buildNormalized(row: RawRow, columns: AifColumnAnalysis[], supplier?: AifSupplier | null) {
  const supplierCode = supplier?.code || "";
  const brandRaw = valueByField(row, columns, "brand");
  const categoryRaw = valueByField(row, columns, "category") || valueByField(row, columns, "subCategory");
  const productCode = valueByField(row, columns, "productCode");
  const variantCode = valueByField(row, columns, "variantCode");
  const colorCode = valueByField(row, columns, "colorCode");
  const colorName = valueByField(row, columns, "colorName");
  const size = valueByField(row, columns, "size");
  const name = valueByField(row, columns, "name");
  const q = qty(valueByField(row, columns, "qty"));
  const buy = money(valueByField(row, columns, "buyPrice"));
  const sell = money(valueByField(row, columns, "sellPrice"));
  const barcode = valueByField(row, columns, "barcode").replace(/\.0$/, "");

  return {
    brandCode: brandRaw,
    brandName: brandRaw,
    categoryCode: guessCategory(categoryRaw),
    modelCode: productCode || variantCode,
    titleRo: name,
    gender: normalizeGender(valueByField(row, columns, "gender")),
    productType: valueByField(row, columns, "productType"),
    season: valueByField(row, columns, "season"),
    composition: valueByField(row, columns, "composition"),
    country: valueByField(row, columns, "country"),
    customsCode: valueByField(row, columns, "customsCode"),
    weightGrams: qty(valueByField(row, columns, "weightGrams")),
    colorCode,
    colorName,
    size,
    barcode,
    buyPrice: buy,
    sellPrice: sell,
    imageUrl: valueByField(row, columns, "imageUrl"),
    supplierProductCode: productCode,
    supplierVariantCode: variantCode,
    supplierColorCode: colorCode,
    supplierSize: size,
    qty: q,
    sourceSupplier: supplierCode,
    webshop: valueByField(row, columns, "webshop"),
    active: valueByField(row, columns, "active"),
  };
}

function rowErrors(normalized: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!clean(normalized.titleRo)) errors.push("Hiányzik a terméknév.");
  if (!clean(normalized.size)) errors.push("Hiányzik a méret.");
  const q = qty(normalized.qty);
  if (q === null || q <= 0) errors.push("A darab mező hibás vagy hiányzik.");
  if (!clean(normalized.modelCode) && !clean(normalized.supplierProductCode)) errors.push("Hiányzik a termékkód vagy modellkód.");
  if (clean(normalized.size) && !isSizeLike(clean(normalized.size))) errors.push("A méret mező gyanús.");
  return errors;
}

export function applyAifColumnMapping(rows: AifParsedRow[], analysis: AifWorkbookAnalysis, supplier?: AifSupplier | null): AifParsedRow[] {
  return rows.map((row, index) => {
    const raw = (row.raw || {}) as RawRow;
    const normalized = buildNormalized(raw, analysis.columns, supplier);
    return {
      ...row,
      rowNo: Number(raw.__rowNo || row.rowNo || index + analysis.headerRow + 1),
      normalized,
    };
  });
}

export function aifRowErrors(row: AifParsedRow): string[] {
  return rowErrors(row.normalized || {});
}

export async function readAifWorkbookWithAnalysis(file: File, supplier?: AifSupplier | null): Promise<AifWorkbookParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      analysis: { sheetName: "", headerRow: 0, dataRowCount: 0, overallConfidence: 0, detectedProfile: "Ismeretlen", columns: [], warnings: ["A fájl nem tartalmaz munkalapot."] },
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
  const headerIndex = findHeaderRow(matrix);
  const headers = makeUniqueHeaders((matrix[headerIndex] || []).map((x, i) => headerName(x, i)));
  const rawRows = matrixToRows(matrix, headerIndex);
  const columns = analyzeColumns(headers, rawRows);
  const warnings: string[] = [];

  const required = ["name", "size", "qty"] as AifColumnField[];
  for (const field of required) {
    if (!columns.some((c) => c.field === field && c.confidence >= 45)) warnings.push(`Nem biztos a következő mező felismerése: ${FIELD_LABELS[field]}.`);
  }

  const fieldConfidence = columns.filter((c) => c.field !== "ignore").map((c) => c.confidence);
  const overallConfidence = fieldConfidence.length ? Math.round(fieldConfidence.reduce((a, b) => a + b, 0) / fieldConfidence.length) : 0;
  const detectedProfile = columns.some((c) => ["CodBare", "CODPRODUS", "SZIN COD", "MARIME", "TERMEK NEV"].includes(c.header))
    ? "ForIT legacy terméktörzs"
    : supplier?.name || "Általános XLS";

  const analysis: AifWorkbookAnalysis = {
    sheetName,
    headerRow: headerIndex + 1,
    dataRowCount: rawRows.length,
    overallConfidence,
    detectedProfile,
    columns,
    warnings,
  };

  const rows = applyAifColumnMapping(
    rawRows.map((raw, index) => ({ rowNo: Number(raw.__rowNo || index + headerIndex + 2), raw, normalized: {} })),
    analysis,
    supplier
  ).filter((row) => {
    const n = row.normalized || {};
    return Boolean(clean(n.titleRo) || clean(n.modelCode) || clean(n.supplierProductCode) || clean(n.size) || clean(n.qty));
  });

  return { rows, analysis: { ...analysis, dataRowCount: rows.length } };
}

export async function readAifWorkbook(file: File, supplier?: AifSupplier | null): Promise<AifParsedRow[]> {
  const result = await readAifWorkbookWithAnalysis(file, supplier);
  return result.rows;
}
