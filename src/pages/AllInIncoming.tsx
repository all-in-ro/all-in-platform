import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Barcode,
  Building2,
  CheckCircle,
  Camera,
  Edit3,
  FileSpreadsheet,
  FileText,
  Download,
  Home,
  Keyboard,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  ShoppingCart,
  Trash2,
  UploadCloud,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  AifCurrency,
  AifReceptionSummary,
  AifReceptionDetail,
  AifImportBatchSummary,
  AifLocation,
  AifLocationType,
  AifParsedRow,
  AifSupplier,
  AifBrandColorCode,
  AifColorType,
  AifPurchaseOrderDetail,
  AifPurchaseOrderSummary,
  apiAifCommitImportBatch,
  apiAifAppendImportRows,
  apiAifDeleteImportBatchHistory,
  apiAifCreateCurrency,
  apiAifCreateFullImportBatch,
  apiAifCreateLocation,
  apiAifCreateLocationType,
  apiAifDeleteCurrency,
  apiAifDeleteLocation,
  apiAifDeleteLocationType,
  apiAifListCurrencies,
  apiAifListReceptions,
  apiAifGetReception,
  apiAifGetPurchaseOrder,
  apiAifListPurchaseOrders,
  apiAifListLocationTypes,
  apiAifUpdateLocation,
  apiAifUpdateLocationType,
  apiAifListImportBatches,
  apiAifMeta,
  apiAifGetSalesTvaSettings,
  apiAifSaveSalesTvaSettings,
  apiAifUpdateCurrency,
} from "../lib/aif/api";
import {
  AIF_COLUMN_FIELD_OPTIONS,
  AifColumnField,
  AifWorkbookAnalysis,
  aifRowErrors as baseAifRowErrors,
  applyAifColumnMapping,
  readAifWorkbookWithAnalysis,
} from "../lib/aif/xls";

type Props = { onLogout?: () => void };

type LocationType = string;
type IncomingWorkflowStep = "reception" | "source" | "import" | "manual" | "review";
type IncomingInputMode = "" | "import" | "manual";
type InvoiceDifferenceMode = "distributed" | "kept";
type SellPriceCurrencyMode = "invoice" | "ron";
type InvoiceDifferencePrompt = {
  currentGoodsValue: number;
  targetGoodsValue: number;
  targetNewRowsValue: number;
  difference: number;
  adjustmentFactor: number;
  canDistribute: boolean;
  extremeDifference: boolean;
  selectedRowsCount: number;
};


type IncomingInventoryLookupItem = {
  variant_id?: string | null;
  internal_sku?: string | null;
  barcode?: string | null;
  supplier_product_code?: string | null;
  supplierProductCode?: string | null;
  product_code?: string | null;
  productCode?: string | null;
  model_code?: string | null;
  sn_cod?: string | null;
  snCod?: string | null;
  customs_tariff_code?: string | null;
  customsTariffCode?: string | null;
  hs_code?: string | null;
  title_ro?: string | null;
  description_ro?: string | null;
  image_url?: string | null;
  material?: string | null;
  product_type?: string | null;
  brand_code?: string | null;
  brand_name?: string | null;
  category_code?: string | null;
  category_name_ro?: string | null;
  category_name_hu?: string | null;
  subcategory_code?: string | null;
  subcategory_name_ro?: string | null;
  subcategory_name_hu?: string | null;
  gender?: string | null;
  color_name?: string | null;
  color_code?: string | null;
  size?: string | null;
  buy_price?: string | number | null;
  sell_price?: string | number | null;
  variant_status?: string | null;
  model_status?: string | null;
};

type IncomingDetectedBarcode = { rawValue?: string; format?: string };
type IncomingBarcodeDetectorInstance = { detect(source: CanvasImageSource): Promise<IncomingDetectedBarcode[]> };
type IncomingBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): IncomingBarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};
type IncomingZxingControls = { stop?: () => void };
type IncomingZxingResult = { getText?: () => string; text?: string; rawValue?: string };
type IncomingZxingReader = {
  decodeFromConstraints?: (
    constraints: MediaStreamConstraints,
    previewElem: HTMLVideoElement,
    callbackFn: (result?: IncomingZxingResult | null, error?: unknown, controls?: IncomingZxingControls) => void
  ) => Promise<IncomingZxingControls> | IncomingZxingControls;
};
type IncomingZxingBrowserGlobal = {
  BrowserMultiFormatReader?: new () => IncomingZxingReader;
  BrowserMultiFormatOneDReader?: new () => IncomingZxingReader;
};

const AIF_INCOMING_BARCODE_FORMATS = [
  "code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39", "code_93", "itf", "codabar", "qr_code", "data_matrix",
];
const AIF_INCOMING_BARCODE_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};
const AIF_INCOMING_ZXING_CDN = "https://unpkg.com/@zxing/browser@0.1.5";
let aifIncomingZxingPromise: Promise<IncomingZxingBrowserGlobal | null> | null = null;

function cleanIncomingBarcode(value: unknown) {
  return String(value ?? "").replace(/[\r\n\t]+/g, "").trim();
}

function incomingBarcodeLookupKey(value: unknown) {
  return cleanIncomingBarcode(value).toLowerCase();
}

function incomingZxingResultText(result: unknown) {
  const row = result as IncomingZxingResult | null | undefined;
  if (!row) return "";
  if (typeof row.getText === "function") return cleanIncomingBarcode(row.getText());
  return cleanIncomingBarcode(row.text || row.rawValue || "");
}

function loadIncomingZxingBrowser(): Promise<IncomingZxingBrowserGlobal | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  const current = (window as any).ZXingBrowser as IncomingZxingBrowserGlobal | undefined;
  if (current?.BrowserMultiFormatReader || current?.BrowserMultiFormatOneDReader) return Promise.resolve(current);
  if (aifIncomingZxingPromise) return aifIncomingZxingPromise;

  aifIncomingZxingPromise = new Promise((resolve) => {
    const finish = () => resolve(((window as any).ZXingBrowser || null) as IncomingZxingBrowserGlobal | null);
    const existing = document.querySelector<HTMLScriptElement>('script[data-aif-incoming-zxing="true"]');
    if (existing) {
      if (existing.dataset.loaded === "true") return finish();
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = AIF_INCOMING_ZXING_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.aifIncomingZxing = "true";
    script.onload = () => { script.dataset.loaded = "true"; finish(); };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return aifIncomingZxingPromise;
}

async function apiIncomingInventoryLookupItems() {
  const response = await fetch(`/api/aif/inventory?limit=5000&_=${Date.now()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return (Array.isArray(payload?.items) ? payload.items : []) as IncomingInventoryLookupItem[];
}

const warehouseShowAllAfterIncomingStorageKey = "allinfashion:warehouse:showAllAfterIncoming:v1";
const warehouseShowAllAfterIncomingEventName = "aif:warehouse-show-all-after-incoming";
const AIF_PURCHASE_ORDER_RECEIVE_HANDOFF_KEY = "allinfashion:purchase-order-receive:v1";

function notifyWarehouseShowAllAfterIncoming(detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = { at: new Date().toISOString(), source: "incoming_commit", ...detail };
  try {
    window.localStorage.setItem(warehouseShowAllAfterIncomingStorageKey, JSON.stringify(payload));
  } catch {
    // A localStorage hiba nem akadályozza a készletre vételt.
  }
  try {
    window.dispatchEvent(new CustomEvent(warehouseShowAllAfterIncomingEventName, { detail: payload }));
  } catch {
    // Nem kritikus. A raktár oldal belépéskor a localStorage jelből is észreveszi.
  }
}
type EditableImportField =
  | "supplierProductCode"
  | "snCod"
  | "customsTariffCode"
  | "titleRo"
  | "brandCode"
  | "categoryCode"
  | "subCategoryCode"
  | "productType"
  | "descriptionRo"
  | "material"
  | "imageUrl"
  | "barcode"
  | "gender"
  | "colorName"
  | "colorCode"
  | "size"
  | "qty"
  | "buyPrice"
  | "sellPrice";

type AifBrandOption = { id: string; code?: string; name?: string; is_active?: boolean };
type AifCategoryOption = { id: string; code?: string; parent_id?: string | null; parentId?: string | null; name_ro?: string; name_hu?: string | null; name?: string; aliases?: string[] | null; sort_order?: number | string | null; is_active?: boolean };
type AifGenderOption = { code: string; name: string; aliases?: string[] | null; sort_order?: number | string | null; is_active?: boolean };
type AifSupplierBrandLink = { id: string; supplier_id: string; brand_id: string; supplier_name?: string; brand_name?: string; is_preferred?: boolean; is_active?: boolean };

const SN_COD_FIELD = "snCod" as AifColumnField;
const CUSTOMS_TARIFF_FIELD = "customsTariffCode" as AifColumnField;
const DESCRIPTION_FIELD = "descriptionRo" as AifColumnField;
const IMAGE_URL_FIELD = "imageUrl" as AifColumnField;
const BARCODE_FIELD = "barcode" as AifColumnField;
const MATERIAL_FIELD = "material" as AifColumnField;
const TITLE_RO_FIELD = "titleRo" as AifColumnField;
const PRODUCT_TYPE_FIELD = "productType" as AifColumnField;
const SUB_CATEGORY_FIELD = "subCategoryCode" as AifColumnField;
const COLOR_CODE_FIELD = "colorCode" as AifColumnField;
const BUY_PRICE_FIELD = "buyPrice" as AifColumnField;
const SELL_PRICE_FIELD = "sellPrice" as AifColumnField;
const IGNORE_FIELD = "ignore" as AifColumnField;
const SN_COD_HEADER_KEYS = new Set([
  "s_n_cod", "sn_cod", "s_n", "sn", "s_n_ev_honap", "sn_ev_honap", "s_n_ev_hónap",
  "s_n_c_o_d", "serial_code", "cod_serial", "cod_serie", "cod_intern", "internal_code", "internal_id", "client_code"
]);
const CUSTOMS_TARIFF_HEADER_ALIASES = [
  "Vámtarifa kód", "VAMTARIFA KOD", "VAMTARIFA", "VÁMTARIFA", "Vamtarifa", "VTSZ",
  "Cod vamal", "COD VAMAL", "Cod tarifar", "COD TARIFAR", "Cod tarifar vamal", "COD TARIFAR VAMAL",
  "Tarif vamal", "TARIF VAMAL", "Tarif code", "TARIFF CODE", "Customs tariff", "CUSTOMS TARIFF",
  "Customs code", "CUSTOMS CODE", "HS CODE", "HSCode", "HS", "TARIC", "TARIC CODE",
  "CN", "Cod CN", "COD CN", "CN CODE", "NC", "Cod NC", "COD NC", "NC CODE",
  "Commodity code", "Intrastat code", "Intrastat"
];
const CUSTOMS_TARIFF_HEADER_KEYS = new Set(CUSTOMS_TARIFF_HEADER_ALIASES.map((x) => snCodHeaderKey(x)));
const DESCRIPTION_HEADER_ALIASES = [
  "DESCRIERE", "DESCRIERE PRODUS", "DESCRIERE LUNGA", "DESCRIERE LUNGĂ", "DESCRIERE RO", "DESCR_RO", "RODESCRIPTION",
  "LONG DESCRIPTION", "DESCRIPTION", "PRODUCT DESCRIPTION", "LEÍRÁS", "LEIRAS"
];
const IMAGE_URL_HEADER_ALIASES = [
  "IMAGE", "IMAGE URL", "IMG", "PHOTO", "PHOTO URL", "FOTO", "FOTO URL", "POZA", "POZĂ", "URL POZA", "URL POZĂ",
  "KÉP", "KEP", "KÉP URL", "KEP URL", "PICTURE", "PICTURE URL"
];
const BARCODE_HEADER_ALIASES = ["BARCODE", "BARKOD", "BÁRKÓD", "VONALKOD", "VONALKÓD", "EAN", "EAN13", "EAN-13", "COD EAN", "Cod EAN", "UPC", "GTIN", "COD BARE", "COD DE BARE", "SKU", "SHOPIFY SKU"];
const MATERIAL_HEADER_ALIASES = ["COMPOZITIE", "COMPOZIȚIE", "COMPOSITION", "MATERIAL", "MATERIAL COMPOSITION", "FABRIC", "ANYAG", "ÖSSZETÉTEL", "OSSZETETEL"];
const TITLE_HEADER_ALIASES = ["ARTICOL", "ARTICLE", "DENUMIRE", "DENUMIRE PRODUS", "DENUMIRE_PRODUS", "NUME PRODUS", "PRODUCT NAME", "PRODUCT", "ITEM", "ITEM NAME", "TITLE", "NÉV", "NEV", "MEGNEVEZÉS", "MEGNEVEZES"];
const PRODUCT_TYPE_HEADER_ALIASES = ["RODESCR", "RO DESCR", "RO_DESCR", "TIP PRODUS", "PRODUCT TYPE", "TERMÉKTÍPUS", "TERMEKTIPUS", "TYPE", "MODEL TYPE"];
const SUBCATEGORY_HEADER_ALIASES = ["COLECTIE", "COLECȚIE", "COLECTIA", "COLECȚIA", "COLECTIE PRODUS", "COLECȚIE PRODUS", "COLLECTION", "PRODUCT COLLECTION", "SUBCATEGORIE", "SUB CATEGORY", "SUBCATEGORY", "ALCATEGORIE", "ALCATEGORIA", "ALKATEGORIA", "ALKATEGÓRIA"];
const BUY_PRICE_HEADER_ALIASES = ["PRET DE ACHIZITIE", "PREȚ DE ACHIZIȚIE", "PRET ACHIZITIE", "PRET ACHIZIȚIE", "PRET CUMPARARE", "PREȚ CUMPĂRARE", "PURCHASE PRICE", "BUY PRICE", "COST PRICE", "VÉTELÁR", "VETELAR"];
const SELL_PRICE_HEADER_ALIASES = ["PRET DE VINZARE", "PRET DE VANZARE", "PREȚ DE VÂNZARE", "PRET VANZARE", "PRET VINZARE", "PRET VANZARE TVA", "PRET VANZARE CU TVA", "SELL PRICE", "SALE PRICE", "SHOPIFY PRICE", "PRICE RON", "PRET RON", "ELADÁSI ÁR", "ELADASI AR"];
const COLOR_CODE_HEADER_ALIASES = [
  "COD CULOARE", "COD CULOARE PRODUS", "COD DE CULOARE", "NR CULOARE", "NR. CULOARE", "NR_CULOARE",
  "NUMAR CULOARE", "NUMĂR CULOARE", "NUMĂR DE CULOARE", "NUMAR DE CULOARE",
  "COLOR CODE", "COLOUR CODE", "COLOR NO", "COLOR NO.", "COLOUR NO", "COLOUR NO.", "COLOR NUMBER", "COLOUR NUMBER",
  "SZÍNKÓD", "SZINKOD", "SZÍN KÓD", "SZIN KOD"
];
const IGNORE_HEADER_ALIASES = [
  "U.m.", "UM", "U.M.", "U M", "UNIT", "UNITS", "UNITATE", "UNITATE MASURA", "UNITATE MĂSURĂ",
  "UNITATE DE MASURA", "UNITATE DE MĂSURĂ", "MEASURE UNIT", "MEASUREMENT UNIT", "UNIT OF MEASURE", "UOM", "U.O.M."
];
const AIF_COLUMN_FIELD_OPTIONS_WITH_SN = (() => {
  const base = AIF_COLUMN_FIELD_OPTIONS as Array<{ value: AifColumnField; label: string }>;
  const out = base.map((opt) => ({ ...opt }));
  const ensureOption = (value: AifColumnField, label: string) => {
    const found = out.find((opt) => String(opt.value) === String(value));
    if (found) found.label = label;
    else out.push({ value, label });
  };
  ensureOption(IGNORE_FIELD, "Kihagyás");
  ensureOption(TITLE_RO_FIELD, "Terméknév");
  ensureOption(SN_COD_FIELD, "S/N/COD");
  ensureOption(CUSTOMS_TARIFF_FIELD, "Vámtarifa kód");
  ensureOption(BARCODE_FIELD, "Vonalkód");
  ensureOption(COLOR_CODE_FIELD, "Színkód");
  ensureOption(IMAGE_URL_FIELD, "Fotó URL");
  ensureOption(DESCRIPTION_FIELD, "Leírás / DESCRIERE");
  ensureOption(MATERIAL_FIELD, "Összetétel");
  ensureOption(PRODUCT_TYPE_FIELD, "Import terméktípus / RODESCR");
  ensureOption(SUB_CATEGORY_FIELD, "Alkategória / terméktípus");
  ensureOption(BUY_PRICE_FIELD, "Vételár");
  ensureOption(SELL_PRICE_FIELD, "Eladási ár");
  return out.slice().sort((a, b) =>
    String(a.label || "").localeCompare(String(b.label || ""), "hu", { sensitivity: "base" }) ||
    String(a.value || "").localeCompare(String(b.value || ""), "hu", { sensitivity: "base" })
  );
})();;
function snCodHeaderKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function isSnCodHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  if (!key) return false;
  return SN_COD_HEADER_KEYS.has(key) || (key.includes("sn") && key.includes("cod"));
}
function isCustomsTariffHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  if (!key) return false;
  return CUSTOMS_TARIFF_HEADER_KEYS.has(key) ||
    key.includes("vamtarifa") ||
    key.includes("vtsz") ||
    key.includes("taric") ||
    key.includes("intrastat") ||
    key.includes("commodity_code") ||
    ((key.includes("tarif") || key.includes("tariff") || key.includes("vamal") || key.includes("customs")) && key.includes("cod")) ||
    key === "hs" || key === "hscode" || key === "hs_code" ||
    key === "cn" || key === "nc" || key === "cod_cn" || key === "cod_nc" ||
    key === "cn_code" || key === "nc_code";
}
function headerMatchesAny(value: unknown, aliases: string[]) {
  const key = snCodHeaderKey(value);
  return Boolean(key && aliases.some((alias) => snCodHeaderKey(alias) === key));
}
function isDescriptionHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  return headerMatchesAny(value, DESCRIPTION_HEADER_ALIASES) || (key.includes("descr") && !key.includes("rodescr"));
}
function isImageUrlHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  return headerMatchesAny(value, IMAGE_URL_HEADER_ALIASES) || (key.includes("image") || key.includes("foto") || key.includes("poza") || key.includes("picture")) && key.includes("url");
}
function isBarcodeHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  return headerMatchesAny(value, BARCODE_HEADER_ALIASES) || key === "ean" || key === "ean13" || key === "cod_ean" || key.includes("barcode") || key.includes("vonal");
}
function isColorCodeHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  if (!key) return false;
  return headerMatchesAny(value, COLOR_CODE_HEADER_ALIASES) ||
    key === "nr_culoare" ||
    key === "numar_culoare" ||
    key === "numar_de_culoare" ||
    ((key.includes("culoare") || key.includes("color") || key.includes("colour")) &&
      (key.includes("cod") || key.includes("code") || key.includes("nr") || key.includes("no") || key.includes("number") || key.includes("numar"))) ||
    key.includes("szinkod");
}
function isIgnoredImportHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  if (!key) return false;
  return headerMatchesAny(value, IGNORE_HEADER_ALIASES) ||
    key === "u_m" ||
    key === "um" ||
    key === "uom" ||
    key === "unit" ||
    key === "units" ||
    key === "unitate" ||
    key === "unitate_masura" ||
    key === "unitate_de_masura" ||
    key === "measure_unit" ||
    key === "measurement_unit" ||
    key === "unit_of_measure";
}
function isMaterialHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  return headerMatchesAny(value, MATERIAL_HEADER_ALIASES) || key.includes("compoz") || key.includes("composition") || key.includes("material");
}
function isTitleHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  return headerMatchesAny(value, TITLE_HEADER_ALIASES) || key === "articol" || key.includes("denumire") || key.includes("product_name");
}
function isProductTypeHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  return headerMatchesAny(value, PRODUCT_TYPE_HEADER_ALIASES) || key === "rodescr" || key.includes("product_type") || key.includes("tip_produs");
}
function isSubCategoryHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  return headerMatchesAny(value, SUBCATEGORY_HEADER_ALIASES) || key === "colectie" || key === "colectia" || key === "colectie_produs" || key === "collection" || key === "product_collection";
}
function isBuyPriceHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  return headerMatchesAny(value, BUY_PRICE_HEADER_ALIASES) || (key.includes("pret") && key.includes("achiz")) || key.includes("purchase_price") || key.includes("buy_price") || key.includes("vetelar");
}
function isSellPriceHeader(value: unknown) {
  const key = snCodHeaderKey(value);
  return headerMatchesAny(value, SELL_PRICE_HEADER_ALIASES) || ((key.includes("pret") || key.includes("price")) && (key.includes("vanz") || key.includes("vinz") || key.includes("sell") || key.includes("sale")));
}
function rawValueByExactHeader(raw: Record<string, unknown> | undefined | null, header: unknown) {
  if (!raw || typeof raw !== "object") return "";
  const wanted = snCodHeaderKey(header);
  for (const [key, value] of Object.entries(raw)) {
    if (snCodHeaderKey(key) === wanted) return String(value ?? "").trim();
  }
  return "";
}
function assignCustomsTariffCode(normalized: Record<string, any>, value: unknown) {
  const code = String(value ?? "").trim();
  if (!code) return normalized;
  normalized.customsTariffCode = code;
  normalized.customs_tariff_code = code;
  normalized.tariffCode = code;
  normalized.tariff_code = code;
  normalized.hsCode = code;
  normalized.hs_code = code;
  return normalized;
}
function customsTariffCodeFromRow(row: any) {
  const normalized = row?.normalized || row || {};
  return firstNonEmptyText(
    normalized.customsTariffCode,
    normalized.customs_tariff_code,
    normalized.tariffCode,
    normalized.tariff_code,
    normalized.hsCode,
    normalized.hs_code,
    normalized.taricCode,
    normalized.taric_code,
    row?.customs_tariff_code,
    row?.customsTariffCode,
    row?.tariff_code,
    row?.tariffCode,
    row?.hs_code,
    row?.hsCode,
    rawValueByHeader(row, CUSTOMS_TARIFF_HEADER_ALIASES)
  );
}
function withSnCodWorkbookAnalysis(analysis: AifWorkbookAnalysis): AifWorkbookAnalysis {
  return {
    ...analysis,
    columns: (analysis.columns || []).map((col) => {
      if (isIgnoredImportHeader(col.header)) return { ...col, field: IGNORE_FIELD, label: "Kihagyás", confidence: Math.max(Number(col.confidence || 0), 100), warnings: [] };
      if (isTitleHeader(col.header)) return { ...col, field: TITLE_RO_FIELD, label: "Terméknév", confidence: Math.max(Number(col.confidence || 0), 100), warnings: [] };
      if (isCustomsTariffHeader(col.header)) return { ...col, field: CUSTOMS_TARIFF_FIELD, label: "Vámtarifa kód", confidence: Math.max(Number(col.confidence || 0), 100), warnings: [] };
      if (isSnCodHeader(col.header)) return { ...col, field: SN_COD_FIELD, label: "S/N/COD", confidence: Math.max(Number(col.confidence || 0), 100), warnings: [] };
      if (isBuyPriceHeader(col.header)) return { ...col, field: BUY_PRICE_FIELD, label: "Vételár", confidence: Math.max(Number(col.confidence || 0), 100), warnings: [] };
      if (isSellPriceHeader(col.header)) return { ...col, field: SELL_PRICE_FIELD, label: "Eladási ár", confidence: Math.max(Number(col.confidence || 0), 100), warnings: [] };
      if (isBarcodeHeader(col.header)) return { ...col, field: BARCODE_FIELD, label: "Vonalkód", confidence: Math.max(Number(col.confidence || 0), 96), warnings: [] };
      if (isColorCodeHeader(col.header)) return { ...col, field: COLOR_CODE_FIELD, label: "Színkód", confidence: Math.max(Number(col.confidence || 0), 100), warnings: [] };
      if (isImageUrlHeader(col.header)) return { ...col, field: IMAGE_URL_FIELD, label: "Fotó URL", confidence: Math.max(Number(col.confidence || 0), 96), warnings: [] };
      if (isSubCategoryHeader(col.header)) return { ...col, field: SUB_CATEGORY_FIELD, label: "Alkategória / terméktípus", confidence: Math.max(Number(col.confidence || 0), 100), warnings: [] };
      if (isProductTypeHeader(col.header)) return { ...col, field: PRODUCT_TYPE_FIELD, label: "Import terméktípus / RODESCR", confidence: Math.max(Number(col.confidence || 0), 100), warnings: [] };
      if (isDescriptionHeader(col.header)) return { ...col, field: DESCRIPTION_FIELD, label: "Leírás / DESCRIERE", confidence: Math.max(Number(col.confidence || 0), 96), warnings: [] };
      if (isMaterialHeader(col.header)) return { ...col, field: MATERIAL_FIELD, label: "Összetétel", confidence: Math.max(Number(col.confidence || 0), 92), warnings: [] };
      return col;
    }),
  };
}
function applySnCodColumnMapping(rows: AifParsedRow[], analysis: AifWorkbookAnalysis | null): AifParsedRow[] {
  const snColumn = (analysis?.columns || []).find((col) => String(col.field) === String(SN_COD_FIELD));
  if (!snColumn) return rows;
  return rows.map((row) => {
    const raw = (row.raw || {}) as Record<string, unknown>;
    const value = rawValueByExactHeader(raw, snColumn.header);
    if (!value) return row;
    return { ...row, normalized: { ...(row.normalized || {}), snCod: value, sn_cod: value } };
  });
}
function applyCustomsTariffColumnMapping(rows: AifParsedRow[], analysis: AifWorkbookAnalysis | null): AifParsedRow[] {
  const tariffColumn = (analysis?.columns || []).find((col) => String(col.field) === String(CUSTOMS_TARIFF_FIELD));
  if (!tariffColumn) return rows;
  return rows.map((row) => {
    const raw = (row.raw || {}) as Record<string, unknown>;
    const value = rawValueByExactHeader(raw, tariffColumn.header);
    if (!value) return row;
    const normalized = assignCustomsTariffCode({ ...(row.normalized || {}) }, value);
    return { ...row, normalized };
  });
}
function applyExtraManualImportColumnMapping(rows: AifParsedRow[], analysis: AifWorkbookAnalysis | null): AifParsedRow[] {
  const columns = analysis?.columns || [];
  const fieldByHeader = (field: AifColumnField) => columns.find((col) => String(col.field) === String(field));
  const titleColumn = fieldByHeader(TITLE_RO_FIELD);
  const subCategoryColumn = fieldByHeader(SUB_CATEGORY_FIELD);
  const productTypeColumn = fieldByHeader(PRODUCT_TYPE_FIELD);
  const buyPriceColumn = fieldByHeader(BUY_PRICE_FIELD);
  const sellPriceColumn = fieldByHeader(SELL_PRICE_FIELD);
  const barcodeColumn = fieldByHeader(BARCODE_FIELD);
  const colorCodeColumn = fieldByHeader(COLOR_CODE_FIELD);
  const imageColumn = fieldByHeader(IMAGE_URL_FIELD);
  const descriptionColumn = fieldByHeader(DESCRIPTION_FIELD);
  const materialColumn = fieldByHeader(MATERIAL_FIELD);
  if (!titleColumn && !subCategoryColumn && !productTypeColumn && !buyPriceColumn && !sellPriceColumn && !barcodeColumn && !colorCodeColumn && !imageColumn && !descriptionColumn && !materialColumn) return rows;
  return rows.map((row) => {
    const raw = (row.raw || {}) as Record<string, unknown>;
    const normalized = { ...(row.normalized || {}) } as Record<string, any>;
    if (titleColumn) {
      const value = rawValueByExactHeader(raw, titleColumn.header);
      if (value) { normalized.titleRo = value; normalized.productName = value; }
    }
    if (subCategoryColumn) {
      const value = rawValueByExactHeader(raw, subCategoryColumn.header);
      if (value) {
        normalized.subCategoryCode = normalized.subCategoryCode || value;
        normalized.subcategoryCode = normalized.subcategoryCode || value;
        normalized.subCategoryName = normalized.subCategoryName || value;
        normalized.subcategoryName = normalized.subcategoryName || value;
        normalized.sourceSubCategory = normalized.sourceSubCategory || value;
      }
    }
    if (productTypeColumn) {
      const value = rawValueByExactHeader(raw, productTypeColumn.header);
      if (value) {
        normalized.productType = value;
        normalized.product_type = value;
        normalized.sourceProductType = normalized.sourceProductType || value;
      }
    }
    if (buyPriceColumn) {
      const value = rawValueByExactHeader(raw, buyPriceColumn.header);
      if (value) normalized.buyPrice = toNumber(value);
    }
    if (sellPriceColumn) {
      const value = rawValueByExactHeader(raw, sellPriceColumn.header);
      if (value) normalized.sellPrice = toNumber(value);
    }
    if (barcodeColumn) {
      const value = rawValueByExactHeader(raw, barcodeColumn.header);
      if (value) { normalized.barcode = value; normalized.supplierBarcode = value; }
    }
    if (colorCodeColumn) {
      const value = rawValueByExactHeader(raw, colorCodeColumn.header);
      if (value) {
        normalized.colorCode = value;
        normalized.supplierColorCode = normalized.supplierColorCode || value;
      }
    }
    if (imageColumn) {
      const value = rawValueByExactHeader(raw, imageColumn.header);
      if (value) { normalized.imageUrl = value; normalized.image_url = value; }
    }
    if (descriptionColumn) {
      const value = rawValueByExactHeader(raw, descriptionColumn.header);
      if (value) { normalized.descriptionRo = value; normalized.description_ro = value; }
    }
    if (materialColumn) {
      const value = rawValueByExactHeader(raw, materialColumn.header);
      if (value) { normalized.material = value; normalized.composition = value; }
    }
    return { ...row, normalized };
  });
}
function applyAifColumnMappingWithSnCod(rows: AifParsedRow[], analysis: AifWorkbookAnalysis, supplier?: AifSupplier | null) {
  return applyExtraManualImportColumnMapping(
    applyCustomsTariffColumnMapping(
      applySnCodColumnMapping(applyAifColumnMapping(rows, analysis, supplier || undefined), analysis),
      analysis
    ),
    analysis
  );
}

const AIF_IMPORT_CHUNK_MAX_ROWS = 15;
const AIF_IMPORT_CHUNK_TARGET_BYTES = 55_000;

function aifJsonByteSize(value: unknown) {
  const json = JSON.stringify(value ?? null);
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(json).length;
  return json.length;
}

function compactAifImportRowForSave(row: AifParsedRow): AifParsedRow {
  const normalized = row?.normalized && typeof row.normalized === "object" ? row.normalized : {};
  const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
  const keepKeys = [
    "supplierProductCode", "supplier_product_code", "modelCode", "model_code", "productCode", "product_code",
    "supplierVariantCode", "supplier_variant_code", "supplierColorCode", "supplier_color_code", "supplierSize", "supplier_size",
    "snCod", "sn_cod", "customsTariffCode", "customs_tariff_code", "tariffCode", "tariff_code", "hsCode", "hs_code",
    "titleRo", "title_ro", "productName", "product_name", "brandCode", "brand_code", "brandName", "brand_name",
    "categoryCode", "category_code", "categoryName", "category_name", "parentCategoryCode", "parent_category_code", "parentCategoryName", "parent_category_name",
    "subCategoryCode", "sub_category_code", "subcategoryCode", "subcategory_code", "subCategoryName", "sub_category_name", "subcategoryName", "subcategory_name",
    "sourceCategory", "sourceCategoryCode", "sourceCategoryName", "sourceSubCategory", "sourceSubCategoryCode", "sourceSubCategoryName",
    "gender", "genderRaw", "productType", "product_type", "season", "collection", "colectie",
    "descriptionRo", "description_ro", "description", "material", "composition", "imageUrl", "image_url", "barcode", "supplierBarcode",
    "colorCode", "color_code", "supplierColorCode", "colorName", "color_name", "colorHex", "color_hex", "brandColorCodeId", "colorTypeCode",
    "size", "sizeTypeCode", "brandSizeCodeId", "qty", "quantity", "buyPrice", "buy_price", "sellPrice", "sell_price",
    "sellPriceGrossRon", "sell_price_gross_ron", "sellPriceRon", "sell_price_ron", "sellPriceCurrencyMode", "sell_price_currency_mode", "sellPriceCurrency", "sell_price_currency", "sellPriceIsRon", "sell_price_is_ron",
    "sellPriceIncludesTva", "sell_price_includes_tva", "salesPriceIncludesTva", "salesTvaRate", "sales_tva_rate", "saleTvaRate", "sale_tva_rate",
    "compareAtPrice", "compare_at_price", "weightGrams", "weight_grams", "attributes",
    "purchaseOrderId", "purchase_order_id", "purchaseOrderNumber", "purchase_order_number",
    "purchaseOrderLineId", "purchase_order_line_id", "orderedQty", "ordered_qty", "remainingQty", "remaining_qty"
  ];
  const nextNormalized: Record<string, unknown> = {};
  for (const key of keepKeys) {
    const value = (normalized as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === "") continue;
    nextNormalized[key] = value;
  }

  const rawRowNo = (raw as Record<string, unknown>).__rowNo || (raw as Record<string, unknown>).rowNo || row.rowNo;
  return {
    rowNo: row.rowNo,
    raw: {
      source: "aif_compact_import",
      __rowNo: rawRowNo,
    },
    normalized: nextNormalized,
  };
}

function buildAifImportRowChunks(rows: AifParsedRow[]) {
  const chunks: AifParsedRow[][] = [];
  let current: AifParsedRow[] = [];
  for (const row of rows) {
    const candidate = [...current, row];
    const tooManyRows = candidate.length > AIF_IMPORT_CHUNK_MAX_ROWS;
    const tooLarge = aifJsonByteSize({ rows: candidate }) > AIF_IMPORT_CHUNK_TARGET_BYTES;
    if (current.length && (tooManyRows || tooLarge)) {
      chunks.push(current);
      current = [row];
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

const page = "min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-5 sm:py-6";
const wrap = "mx-auto max-w-7xl space-y-4";
const topCard = "sticky top-2 z-50 rounded-2xl border border-white/20 bg-[#303a4c]/95 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.05] backdrop-blur";
const card = "rounded-2xl border border-white/18 bg-[#4d5869] p-3 shadow-lg shadow-slate-950/15 sm:p-4 font-normal";
const sectionHeader = "flex w-full items-center justify-between gap-3 rounded-xl border border-white/22 border-l-4 border-l-emerald-300 bg-[#303b4e] px-3 py-2.5 text-left shadow-sm shadow-slate-950/20 font-normal";
const label = "grid gap-1.5 text-xs uppercase tracking-[0.05em] text-white/86 font-normal";
const input = "h-9 rounded-lg border border-white/24 bg-[#303b4e] px-3 text-sm text-white caret-white outline-none transition placeholder:text-white/50 selection:bg-emerald-300/35 focus:border-[#67d4d1]/80 focus:ring-1 focus:ring-[#67d4d1]/30 [color-scheme:dark] font-normal";
const selectInput = `${input} aif-native-select [color-scheme:dark]`;
const optionStyle = { backgroundColor: "#303b4e", color: "#ffffff" };
const mutedOptionStyle = { backgroundColor: "#303b4e", color: "#a9b3c7" };
const btnBase = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs text-white transition disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = `${btnBase} border-[#67d4d1]/45 bg-[#208d8b] shadow-sm shadow-[#208d8b]/20 hover:bg-[#249b99] active:bg-[#1a7270]`;
const compactPrimaryBtn = "inline-flex h-7 items-center justify-center gap-1 rounded-md border border-[#67d4d1]/45 bg-[#208d8b] px-2 text-[11px] text-white shadow-sm shadow-[#208d8b]/20 transition hover:bg-[#249b99] active:bg-[#1a7270] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/18 bg-[#354153] px-2.5 text-[11px] text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtnSoft = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.08] px-2.5 text-[11px] text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerPrimaryBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-2.5 text-[11px] text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const neutralBtn = `${btnBase} border-white/24 bg-[#354153] hover:bg-[#3e4d63]`;
const tinyBtn = "inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/20 bg-[#354153] px-2 text-[11px] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const dangerBtn = `${btnBase} border-red-300/24 bg-[#c90d22] hover:bg-[#a90c1d]`;
const fileBtn = `${btnBase} border-red-300/24 bg-[#c90d22] hover:bg-[#a90c1d] h-9 px-3`;
const statCard = "rounded-xl border border-white/12 bg-[#354153] px-3 py-2.5";
const compactFieldLabel = "block w-full truncate text-center text-[8px] uppercase tracking-[0.035em] text-white/36 whitespace-nowrap leading-[9px] font-normal";
const compactInput = "h-7 min-w-0 rounded-md border border-white/18 bg-[#303b4e] px-2 text-[11px] text-white outline-none placeholder:text-white/38 focus:border-emerald-200/65 focus:ring-1 focus:ring-emerald-200/20 font-normal";
const compactSelect = `${compactInput} aif-native-select pr-6`;
const previewField = "grid min-w-0 content-start gap-[1px]";
const previewInput = "h-[28px] min-w-0 rounded-md border border-white/18 bg-[#303b4e] px-2 text-[12px] leading-[16px] text-white outline-none placeholder:text-white/44 focus:border-emerald-200/65 focus:ring-1 focus:ring-emerald-200/20 font-normal";
const previewSelect = `${previewInput} aif-native-select pr-6`;
const previewTopGrid = "grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-[42px_minmax(0,0.9fr)_minmax(0,0.95fr)_minmax(0,0.9fr)_minmax(0,2.8fr)_minmax(0,1.05fr)] lg:items-end";
const previewTopHeaderGrid = "hidden";
const previewMiddleGrid = "mt-[2px] grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-[42px_minmax(0,1.65fr)_minmax(0,1.85fr)_minmax(0,0.65fr)_minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,0.65fr)] lg:items-end";
const previewBottomGrid = "mt-[2px] grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-[42px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,3fr)_minmax(0,0.6fr)_minmax(0,0.75fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.05fr)] lg:items-end";
const modalBackdrop = "fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/78 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6";
const modalCard = "my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-white/22 bg-[#4b5566] p-4 text-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]";
const wizardStepBase = "rounded-2xl border px-3 py-3 transition shadow-sm";
const wizardStepActive = `${wizardStepBase} border-[#67d4d1]/65 bg-[#208d8b]/22 text-white shadow-[#208d8b]/10`;
const wizardStepDone = `${wizardStepBase} border-[#7bd7d4]/90 bg-[#208d8b] text-white shadow-[0_0_0_1px_rgba(123,215,212,0.28),0_14px_30px_rgba(32,141,139,0.32)] ring-1 ring-[#7bd7d4]/35 hover:bg-[#249b99]`;
const wizardStepIdle = `${wizardStepBase} border-white/14 bg-[#354153]`;
const wizardStepLocked = `${wizardStepBase} border-white/10 bg-[#303b4e]/60 opacity-70`;
const sourceChoiceCard = "group rounded-2xl border border-white/16 bg-[#354153] p-4 text-left shadow-sm transition hover:border-[#67d4d1]/55 hover:bg-[#3b485c] disabled:cursor-not-allowed disabled:opacity-55";

function goHome() {
  window.location.hash = "#allin";
}

function cell(v: unknown) {
  const s = String(v ?? "").trim();
  return s || "-";
}

function valueString(v: unknown) {
  return String(v ?? "");
}

function toNumber(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || String(v).trim() === "") return 0;

  let raw = String(v)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^0-9,.'+\-eE]/g, "")
    .replace(/'/g, "");

  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;

  if (commaCount && dotCount) {
    const decimalSeparator = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    raw = raw.split(thousandsSeparator).join("");
    if (decimalSeparator === ",") raw = raw.replace(/,/g, ".");
  } else if (commaCount) {
    const parts = raw.split(",");
    if (commaCount > 1) {
      const decimalPart = parts.pop() || "";
      raw = `${parts.join("")}.${decimalPart}`;
    } else {
      raw = raw.replace(",", ".");
    }
  } else if (dotCount > 1) {
    const parts = raw.split(".");
    const decimalPart = parts.pop() || "";
    raw = `${parts.join("")}.${decimalPart}`;
  }

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function calculateReceptionAmounts(goodsValue: number, shippingValue: number, tvaMode: string, tvaRate: number) {
  const goodsPlusShipping = Math.max(0, toNumber(goodsValue)) + Math.max(0, toNumber(shippingValue));
  const vatFactor = 1 + Math.max(0, toNumber(tvaRate)) / 100;

  if (tvaMode === "without_tva") {
    const net = goodsPlusShipping;
    const gross = net * vatFactor;
    return { net, vat: gross - net, gross };
  }

  if (tvaMode === "with_tva") {
    const gross = goodsPlusShipping;
    const net = vatFactor > 0 ? gross / vatFactor : gross;
    return { net, vat: gross - net, gross };
  }

  return { net: goodsPlusShipping, vat: 0, gross: goodsPlusShipping };
}

function invoiceGoodsTarget(invoiceAmount: number, shippingValue: number) {
  // A megadott számlaösszeg mindig ugyanabban az ár-alapban értendő, mint a sorok:
  // nettó soroknál nettó, bruttó soroknál bruttó, TVA nélküli soroknál változatlan.
  // A korábbi logika nettó módnál még egyszer elosztotta 1 + TVA-val az összeget,
  // ezért például 7 747,59-ből tévesen 6 402,97 lett.
  const amount = Math.max(0, toNumber(invoiceAmount));
  const shipping = Math.max(0, toNumber(shippingValue));
  return Math.max(0, amount - shipping);
}

function isRonCurrencyCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase() === "RON";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(v?: string | null) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function receptionStatusLabel(value?: string | null) {
  const v = String(value || "").toLowerCase();
  if (v === "committed") return "Készletre vett";
  if (v === "parsed") return "Ellenőrizve";
  if (v === "needs_review") return "Ellenőrzendő";
  if (v === "draft") return "Folyamatban";
  if (v === "cancelled") return "Törölt";
  return value || "-";
}

function receivablePurchaseOrderStatusLabel(value?: string | null) {
  const v = String(value || "").toLowerCase();
  if (v === "ordered") return "Rendelve";
  if (v === "partially_received") return "Részben beérkezett";
  return value || "-";
}

function moneyText(value: number, currency = "") {
  const n = Number.isFinite(value) ? value : 0;
  return `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}

function pdfEscape(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fileSafe(v: unknown) {
  return String(v ?? "receptie")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "receptie";
}

function pdfNumber(v: unknown, digits = 2) {
  const x = toNumber(v);
  return x.toLocaleString("ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pdfDate(v?: string | null) {
  const s = dateOnly(v);
  return s || "-";
}

function normPdfKey(v: unknown) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function rowCheckSku(row: any) {
  const normalized = row?.normalized || {};
  return cell(row?.supplier_product_code || normalized.supplierProductCode || normalized.modelCode || row?.supplier_variant_code || normalized.supplierVariantCode);
}

function buildReceptionVerificationHtml(detail: AifReceptionDetail, categories: AifCategoryOption[] = [], genderTypes: AifGenderOption[] = []) {
  const item: any = detail.item || {};
  const rows = (detail.rows || []).filter((row: any) => row.status !== "ignored");
  const title = `Fisa verificare marfa ${item.invoice_number || item.id || ""}`;
  const today = new Date().toLocaleDateString("ro-RO");
  const lines = rows.map((row: any, index: number) => {
    const normalized = row.normalized || {};
    const rawCategory = normalized.categoryName || normalized.categoryCode;
    const rawGender = normalized.gender;
    const qty = toNumber(row.qty ?? normalized.qty);
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td>${pdfEscape(rowCheckSku(row))}</td>
        <td>${pdfEscape(cell(row.sn_cod || normalized.snCod || normalized.sn_cod))}</td>
        <td>${pdfEscape(cell(normalized.titleRo || normalized.productName || row.supplier_product_code))}</td>
        <td>${pdfEscape(cell(normalized.brandName || normalized.brandCode))}</td>
        <td>${pdfEscape(categoryDisplay(rawCategory, categories))}</td>
        <td>${pdfEscape(genderLabel(rawGender, genderTypes))}</td>
        <td>${pdfEscape(cell(normalized.colorName))}</td>
        <td>${pdfEscape(cell(row.supplier_color_code || normalized.colorCode))}</td>
        <td>${pdfEscape(cell(normalizeAifSizeValue(row.supplier_size || normalized.size)))}</td>
        <td class="num">${pdfNumber(qty, 0)}</td>
        <td class="num">${pdfNumber(row.sell_price_ron ?? normalized.sellPriceGrossRon ?? normalized.sellPrice ?? row.sell_price, 2)}</td>
        <td class="num">${pdfNumber(normalized.salesTvaRate ?? normalized.saleTvaRate ?? item.raw_meta?.salesTvaRate ?? item.tva_rate, 0)}%</td>
        <td class="write"></td>
        <td class="check"></td>
        <td class="write"></td>
        <td class="write wide"></td>
      </tr>`;
  }).join("");
  const totalQty = rows.reduce((sum: number, row: any) => sum + toNumber(row.qty ?? row.normalized?.qty), 0);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${pdfEscape(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 9px; }
    .doc { width: 100%; }
    .header { display: grid; grid-template-columns: 1.15fr 1fr; gap: 14px; border-bottom: 2px solid #111827; padding-bottom: 7px; margin-bottom: 8px; }
    .company { font-size: 9px; line-height: 1.42; }
    .company-name { font-size: 14px; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 2px; }
    .title { text-align: right; }
    .title h1 { margin: 0 0 5px; font-size: 20px; letter-spacing: .05em; text-transform: uppercase; }
    .title .sub { font-size: 10px; border: 1px solid #111827; display: inline-block; padding: 3px 8px; margin-top: 3px; }
    .meta { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; margin-bottom: 8px; }
    .box { border: 1px solid #9ca3af; border-radius: 4px; padding: 4px 5px; min-height: 30px; }
    .box .label { color: #6b7280; text-transform: uppercase; font-size: 7px; letter-spacing: .05em; margin-bottom: 2px; }
    .box .value { font-size: 9px; }
    .note { border: 1px solid #f59e0b; background: #fffbeb; padding: 5px 7px; margin: 7px 0 8px; line-height: 1.35; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th { background: #111827; color: #fff; font-weight: 400; text-transform: uppercase; font-size: 7px; letter-spacing: .02em; padding: 4px 3px; border: 1px solid #111827; }
    td { padding: 3px; border: 1px solid #d1d5db; vertical-align: top; font-size: 8px; line-height: 1.18; overflow-wrap: anywhere; min-height: 18px; }
    tbody tr:nth-child(even) td { background: #f9fafb; }
    .num { text-align: right; white-space: nowrap; }
    .write { min-height: 20px; background: #fff; }
    .wide { min-width: 56px; }
    .check::before { content: ''; display: block; width: 12px; height: 12px; border: 1.5px solid #111827; margin: 0 auto; }
    .totals td { border-top: 2px solid #111827; background: #f3f4f6; font-size: 9px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 16px; font-size: 9px; }
    .sig { padding-top: 20px; border-top: 1px solid #111827; }
    .footer { margin-top: 8px; color: #6b7280; font-size: 7px; display: flex; justify-content: space-between; }
    .screen-actions { margin: 0 0 8px; display: flex; gap: 8px; }
    .screen-actions button { border: 1px solid #111827; background: #111827; color: #fff; border-radius: 6px; padding: 7px 10px; cursor: pointer; }
    @media print { .screen-actions { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="screen-actions">
    <button onclick="window.print()">Tiparire / Salvare PDF</button>
    <button onclick="window.close()">Inchide</button>
  </div>
  <div class="doc">
    <div class="header">
      <div class="company">
        <div class="company-name">SC TITAN EURO-COM SRL</div>
        <div>Cod Fiscal: RO17495362</div>
        <div>Nr. Reg. Com.: J19/420/2005</div>
        <div>Miercurea Ciuc, Jud. Harghita, Str. Mihail Sadoveanu 33/c/17</div>
      </div>
      <div class="title">
        <h1>Fisa verificare marfa</h1>
        <div>Data: ${pdfEscape(pdfDate(item.reception_date) || today)}</div>
        <div class="sub">Document cu pret vanzare</div>
      </div>
    </div>
    <div class="meta">
      <div class="box"><div class="label">Furnizor</div><div class="value">${pdfEscape(item.supplier_name || "-")}</div></div>
      <div class="box"><div class="label">Factura</div><div class="value">${pdfEscape(item.invoice_number || "-")}</div></div>
      <div class="box"><div class="label">Data factura</div><div class="value">${pdfEscape(pdfDate(item.invoice_date))}</div></div>
      <div class="box"><div class="label">Gestiune</div><div class="value">${pdfEscape(item.location_name || "-")}</div></div>
      <div class="box"><div class="label">Total factura</div><div class="value">${pdfNumber(totalQty, 0)} buc.</div></div>
    </div>
    <div class="note">Lista pentru verificarea fizica a marfii primite. Pretul de vanzare este TVA inclus, in RON. Completeaza cantitatea receptionata, bifeaza OK sau noteaza problema si observatiile.</div>
    <table>
      <colgroup>
        <col style="width: 3%" />
        <col style="width: 7%" />
        <col style="width: 17%" />
        <col style="width: 8%" />
        <col style="width: 8%" />
        <col style="width: 5%" />
        <col style="width: 7%" />
        <col style="width: 6%" />
        <col style="width: 5%" />
        <col style="width: 5%" />
        <col style="width: 7%" />
        <col style="width: 4%" />
        <col style="width: 6%" />
        <col style="width: 4%" />
        <col style="width: 6%" />
        <col style="width: 7%" />
      </colgroup>
      <thead>
        <tr>
          <th>Nr.</th>
          <th>Cod produs</th>
          <th>Denumire produs</th>
          <th>Brand</th>
          <th>Categorie principala</th>
          <th>Gen</th>
          <th>Culoare</th>
          <th>Cod culoare</th>
          <th>Marime</th>
          <th>Cant. factura</th>
          <th>Pret vanzare RON</th>
          <th>TVA vanz.</th>
          <th>Cant. receptionata</th>
          <th>OK</th>
          <th>Lipsa / problema</th>
          <th>Observatii</th>
        </tr>
      </thead>
      <tbody>
        ${lines || `<tr><td colspan="16" style="text-align:center;padding:18px;">Nu exista linii de verificat.</td></tr>`}
      </tbody>
      <tfoot>
        <tr class="totals"><td colspan="9">TOTAL</td><td class="num">${pdfNumber(totalQty, 0)}</td><td colspan="6"></td></tr>
      </tfoot>
    </table>
    <div class="signatures">
      <div class="sig">Verificat de</div>
      <div class="sig">Semnatura</div>
      <div class="sig">Data</div>
    </div>
    <div class="footer">
      <span>SC TITAN EURO-COM SRL - fisa verificare marfa</span>
      <span>Generat: ${pdfEscape(today)}</span>
    </div>
  </div>
</body>
</html>`;
}

function openReceptionVerificationPdf(detail: AifReceptionDetail, categories: AifCategoryOption[] = [], genderTypes: AifGenderOption[] = []) {
  const fileName = `verificare_marfa_${fileSafe((detail.item as any)?.invoice_number || (detail.item as any)?.id)}.pdf`;
  const html = buildReceptionVerificationHtml(detail, categories, genderTypes).replace(
    "</head>",
    `<script>
      document.title=${JSON.stringify(fileName)};
      window.addEventListener('load', function () {
        setTimeout(function () {
          try { window.focus(); window.print(); } catch (e) {}
        }, 450);
      });
    </script></head>`
  );
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "width=1200,height=850,scrollbars=yes,resizable=yes");
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Browserul a blocat fereastra PDF. Permite ferestre pop-up pentru aceasta pagina.");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function confidenceText(value: number) {
  if (value >= 85) return "Magas";
  if (value >= 60) return "Közepes";
  if (value > 0) return "Alacsony";
  return "Nincs";
}

function confidenceClass(value: number) {
  if (value >= 85) return "text-emerald-100";
  if (value >= 60) return "text-amber-100";
  if (value > 0) return "text-red-100";
  return "text-white/55";
}

function locationTypeLabel(v: string) {
  const map: Record<string, string> = {
    warehouse: "Raktár",
    shop: "Üzlet / helyszín",
    online: "Online",
    reserved: "Foglalás",
    other: "Egyéb",
  };
  return map[v] || "Egyéb";
}

function categoryLabel(c: AifCategoryOption) {
  return c.name_hu || c.name_ro || c.name || c.code || "-";
}

function categoryAliasValues(c: AifCategoryOption) {
  return [c.code, c.id, c.name_ro, c.name_hu, c.name, ...(Array.isArray(c.aliases) ? c.aliases : [])]
    .filter(Boolean)
    .map((x) => String(x));
}

function normMatchKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const sourceCategoryAliases: Record<string, string[]> = {
  apparel: ["imbracaminte", "îmbrăcăminte", "haine", "ruhazat", "ruházat", "ruha", "clothing", "apparel"],
  tricou: ["tricou", "tricouri", "trikó", "triko", "póló", "polo", "poló", "polouri", "t shirt", "t-shirt", "tshirt", "t shirts", "t-shirts", "tee", "tees", "training tee"],
  tricouri: ["tricou", "tricouri", "trikó", "triko", "póló", "polo", "poló", "polouri", "t shirt", "t-shirt", "tshirt", "t shirts", "t-shirts", "tee", "tees"],
  pantaloni: ["pantaloni", "nadrag", "nadrág", "pants", "trousers"],
  shorts: ["shorts", "shorts cas", "short cas", "shorts fnk", "bermuda", "sorturi", "șorturi", "pantaloni scurti", "pantaloni scurți", "rövidnadrág", "rovidnadrag"],
  hanorac: ["hanorac", "hoodie", "pulover", "sweatshirt", "kapucnis", "pulóver", "puloverek"],
  jacheta: ["jacheta", "jachetă", "geaca", "geacă", "jacket", "kabát", "dzseki"],
  vesta: ["vesta", "vestă", "vest", "melleny", "mellény"],
  incaltaminte: ["incaltaminte", "încălțăminte", "pantofi", "adidasi", "adidași", "shoes", "sneakers", "cipő", "cipo"],
  rochie: ["rochie", "rochii", "dress", "ruha"],
  fusta: ["fusta", "fustă", "fuste", "skirt", "szoknya"],
  geanta: ["geanta", "geantă", "genti", "genți", "bag", "táska", "taska"],
  curea: ["curea", "belt", "öv", "ov"],
  sosete: ["sosete", "șosete", "socks", "zokni"],
};

const sourceCategoryAliasIndex: Record<string, string[]> = (() => {
  const index: Record<string, string[]> = {};
  const addGroup = (key: string, aliases: string[]) => {
    const group = Array.from(new Set([key, ...(aliases || [])].map(normMatchKey).filter(Boolean)));
    for (const item of group) {
      index[item] = Array.from(new Set([...(index[item] || []), ...group]));
    }
  };
  Object.entries(sourceCategoryAliases).forEach(([key, aliases]) => addGroup(key, aliases));
  return index;
})();

function categoryAliasPhraseMatches(raw: string, alias: string) {
  if (!raw || !alias || alias.length < 4) return false;
  const rawPhrase = ` ${raw} `;
  const aliasPhrase = ` ${alias} `;
  return rawPhrase.includes(aliasPhrase) || aliasPhrase.includes(rawPhrase);
}

function categorySearchKeys(value: unknown) {
  const raw = normMatchKey(value);
  if (!raw) return [];
  const direct = sourceCategoryAliasIndex[raw] || [];
  const byToken = raw.split(" ").flatMap((token) => sourceCategoryAliasIndex[token] || []);
  const byPhrase = Object.entries(sourceCategoryAliasIndex).flatMap(([alias, group]) =>
    categoryAliasPhraseMatches(raw, alias) ? group : []
  );
  return Array.from(new Set([raw, ...direct, ...byToken, ...byPhrase].map(normMatchKey).filter(Boolean)));
}

function categoryMatchScore(c: AifCategoryOption, value: unknown) {
  const raw = normMatchKey(value);
  const sourceKeys = categorySearchKeys(value);
  if (!raw || !sourceKeys.length) return 0;
  const optionKeys = categoryAliasValues(c).map(normMatchKey).filter(Boolean);
  let best = 0;
  for (const sourceKey of sourceKeys) {
    for (const optionKey of optionKeys) {
      if (!sourceKey || !optionKey) continue;
      if (optionKey === sourceKey) {
        const exactRawBonus = sourceKey === raw ? 40 : 0;
        best = Math.max(best, 100 + exactRawBonus + Math.min(20, sourceKey.length));
        continue;
      }
      if (sourceKey.length < 4 || optionKey.length < 4) continue;
      const sourceHasSpace = sourceKey.includes(" ");
      const optionHasSpace = optionKey.includes(" ");
      if (optionKey.startsWith(sourceKey)) {
        best = Math.max(best, (sourceHasSpace ? 76 : 42) + Math.min(16, sourceKey.length));
      } else if (sourceKey.startsWith(optionKey)) {
        best = Math.max(best, (optionHasSpace ? 72 : 40) + Math.min(16, optionKey.length));
      }
    }
  }
  return best;
}

function categoryMatches(c: AifCategoryOption, value: unknown) {
  return categoryMatchScore(c, value) > 0;
}

function rawValueByHeader(row: any, headers: string[]) {
  const raw = row?.raw;
  if (!raw || typeof raw !== "object") return "";
  const wanted = headers.map(normMatchKey);
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = normMatchKey(key);
    if (wanted.includes(normalizedKey)) return value;
  }
  return "";
}

const AIF_DESCRIPTION_HEADERS = ["DESCRIERE", "DESCRIERE RO", "DESCRIERE PRODUS", "DESCRIERE LUNGA", "DESCRIERE LUNGĂ", "DESCR", "DESCR_RO", "DESCRIPTION", "LONG DESCRIPTION", "PRODUCT DESCRIPTION", "TERMÉK LEÍRÁS", "TERMEK LEIRAS", "LEÍRÁS", "LEIRAS"];
const AIF_IMAGE_HEADERS = ["FOTO", "FOTÓ", "FOTO URL", "LINK FOTO", "URL FOTO", "POZA", "POZĂ", "POZA URL", "LINK POZA", "URL POZA", "PHOTO", "PHOTO URL", "IMAGE", "IMAGE URL", "IMAGE LINK", "IMAGINE", "IMAGINE URL", "PICTURE", "PICTURE URL", "KÉP", "KEP", "KÉP URL", "KEP URL", "IMG"];
const AIF_COLLECTION_SUBCATEGORY_HEADERS = ["COLECTIE", "COLECȚIE", "COLECTIA", "COLECȚIA", "COLECTIE PRODUS", "COLECȚIE PRODUS", "COLLECTION", "PRODUCT COLLECTION"];
const AIF_EXPLICIT_SUBCATEGORY_HEADERS = ["SUBCATEGORIE", "SUB CATEGORY", "SUBCATEGORY", "ALKATEGORIA", "ALKATEGÓRIA", "ALCATEGORIE"];
const AIF_RODESCR_HEADERS = ["RODESCR", "RO DESCR", "RO_DESCR"];
const AIF_SUBCATEGORY_HEADERS = [...AIF_COLLECTION_SUBCATEGORY_HEADERS, ...AIF_EXPLICIT_SUBCATEGORY_HEADERS, ...AIF_RODESCR_HEADERS];
const AIF_PRODUCT_TYPE_HEADERS = ["TIP PRODUS", "PRODUCT TYPE", "TERMÉKTÍPUS", "TERMEKTIPUS", "TYPE", ...AIF_RODESCR_HEADERS];

function rawDescriptionValue(row: any) {
  return firstNonEmptyText(rawValueByHeader(row, AIF_DESCRIPTION_HEADERS));
}

function rawImageValue(row: any) {
  return firstNonEmptyText(rawValueByHeader(row, AIF_IMAGE_HEADERS));
}

function rawSubCategoryValue(row: any) {
  return firstNonEmptyText(
    rawValueByHeader(row, AIF_COLLECTION_SUBCATEGORY_HEADERS),
    rawValueByHeader(row, AIF_EXPLICIT_SUBCATEGORY_HEADERS),
    rawValueByHeader(row, AIF_RODESCR_HEADERS)
  );
}

function rawProductTypeValue(row: any) {
  return firstNonEmptyText(rawValueByHeader(row, AIF_PRODUCT_TYPE_HEADERS));
}

const AIF_SIZE_OPTIONS = [
  "XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL", "6XL",
  "XXS/XS", "XS/S", "S/M", "M/L", "L/XL", "XL/XXL", "XXL/XXXL", "XXL/3XL", "2XL/3XL", "3XL/4XL",
  "OSF", "OSFM", "OSFA", "OS", "ONE SIZE", "UNI",
  "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48",
];
const AIF_SIZE_COMBO_BY_KEY: Record<string, string> = {
  XSS: "XS/S",
  SM: "S/M",
  ML: "M/L",
  LXL: "L/XL",
  XLXXL: "XL/XXL",
  XXLXXXL: "XXL/XXXL",
  XXL3XL: "XXL/3XL",
  TWOXL3XL: "2XL/3XL",
  _2XL3XL: "2XL/3XL",
  THREEXL4XL: "3XL/4XL",
  _3XL4XL: "3XL/4XL",
};

const AIF_ACCEPTED_SIZE_CODES = new Set(AIF_SIZE_OPTIONS.map((x) => String(x).toUpperCase()));

function normalizeAifSizeKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s._/-]+/g, "");
}

function normalizeAifSizeValue(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = normalizeAifSizeKey(raw);
  if (["OSF", "OSFM", "ONESIZEFITSMOST", "ONESIZEFITMOST", "ONESIZEFM"].includes(key)) return "OSFM";
  if (["OSFA", "ONESIZEFITSALL", "ONESIZEFITALL"].includes(key)) return "OSFA";
  if (AIF_SIZE_COMBO_BY_KEY[key]) return AIF_SIZE_COMBO_BY_KEY[key];
  if (["ONESIZE", "UNIVERSAL", "UNIVERSALA", "UNIVERZALIS", "UNISEXONESIZE"].includes(key)) return "ONE SIZE";
  if (["UNI", "UNIV", "UNISIZE"].includes(key)) return "UNI";
  if (/^\d+XL$/.test(key)) return key;
  if (["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"].includes(key)) return key;
  if (/^\d+(?:[.,]5)?$/.test(raw)) return raw.replace(",", ".");

  // Csak tényleges perjeles méretnél bontunk részekre.
  // Korábban minden ismeretlen értéknél lefutott a split+rekurzió, ami például
  // egy sima, törzsadatból jövő új méretnél ugyanazzal az értékkel hívta újra magát.
  // Ennek lett az eredménye: Maximum call stack size exceeded.
  if (raw.includes("/")) {
    const slashParts = raw
      .split(/[\s-]*\/[\s-]*/)
      .map((part) => normalizeAifSizeValue(part))
      .filter(Boolean);
    if (slashParts.length >= 2) return slashParts.join("/");
  }

  return raw.toUpperCase();
}

function sizeValueForRow(row: any) {
  return (
    row?.supplier_size ??
    row?.size ??
    row?.normalized?.supplierSize ??
    row?.normalized?.size ??
    rawValueByHeader(row, ["MARIME", "MĂRIME", "SIZE", "MÉRET", "MERET", "TAILLE", "GRÖSSE"])
  );
}

function normalizeAifRowSize<T extends any>(row: T): T {
  const nextSize = normalizeAifSizeValue(sizeValueForRow(row));
  if (!nextSize) return row;
  const source: any = row || {};
  const normalized = { ...(source.normalized || {}), size: nextSize };
  const raw = source.raw && typeof source.raw === "object" ? { ...source.raw } : source.raw;
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      if (["marime", "size", "meret", "taille", "grosse"].includes(normMatchKey(key))) {
        (raw as any)[key] = normalizeAifSizeValue(value) || value;
      }
    }
  }
  return {
    ...source,
    raw,
    supplier_size: source.supplier_size ? normalizeAifSizeValue(source.supplier_size) : source.supplier_size,
    normalized,
  };
}

type AifSizeTypeLike = { id?: string; code?: string | null; name?: string | null; name_hu?: string | null; aliases?: string[] | null; is_active?: boolean };
type AifBrandSizeCodeLike = { id?: string; brand_id?: string | null; brand_code?: string | null; brand_name?: string | null; size_code?: string | null; size_name?: string | null; size_type_code?: string | null; is_active?: boolean };

function sizeTypeValues(size: AifSizeTypeLike) {
  return [size.code, size.name, size.name_hu, ...(Array.isArray(size.aliases) ? size.aliases : [])].filter(Boolean);
}

function brandSizeCodeValues(item: AifBrandSizeCodeLike) {
  return [item.size_code, item.size_name, item.size_type_code].filter(Boolean);
}

function isAcceptedAifSize(value: unknown, sizeTypes: AifSizeTypeLike[] = [], brandSizeCodes: AifBrandSizeCodeLike[] = []) {
  const normalized = normalizeAifSizeValue(value);
  if (!normalized) return false;
  const upper = String(normalized).toUpperCase();
  const key = normalizeAifSizeKey(normalized);
  if (AIF_ACCEPTED_SIZE_CODES.has(upper)) return true;
  if (/^\d+(?:\.5)?$/.test(String(normalized))) return true;
  const parts = upper.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.every((part) => AIF_ACCEPTED_SIZE_CODES.has(part) || /^\d+(?:\.5)?$/.test(part))) return true;
  if ((sizeTypes || []).filter((item) => item?.is_active !== false).some((item) => sizeTypeValues(item).some((candidate) => normalizeAifSizeKey(candidate) === key))) return true;
  if ((brandSizeCodes || []).filter((item) => item?.is_active !== false).some((item) => brandSizeCodeValues(item).some((candidate) => normalizeAifSizeKey(candidate) === key))) return true;
  return false;
}

function isSizeValidationError(error: unknown) {
  const text = String(error ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(size|marime|meret)\b/.test(text);
}

function aifRowErrors(row: AifParsedRow, sizeTypes: AifSizeTypeLike[] = [], brandSizeCodes: AifBrandSizeCodeLike[] = []): string[] {
  const normalizedRow = normalizeAifRowSize(row) as AifParsedRow;
  const errors = (baseAifRowErrors(normalizedRow) || []) as string[];
  if (!isAcceptedAifSize(sizeValueForRow(normalizedRow), sizeTypes, brandSizeCodes)) return errors;
  return errors.filter((error: unknown) => !isSizeValidationError(error));
}

function firstNonEmptyText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function savedRowRawObject(row: any) {
  const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
  const rawMeta = row?.raw_meta && typeof row.raw_meta === "object" ? row.raw_meta : {};
  return { ...rawMeta, ...raw };
}

function mainCategoryRawValue(row: any) {
  return firstNonEmptyText(rawValueByHeader(row, ["CATEGORIE", "CATEGORY", "CATEGORIA", "CATEGORIE PRODUS", "PRODUCT CATEGORY"]));
}

function categoryParentId(c?: AifCategoryOption | null) {
  return String((c as any)?.parent_id || (c as any)?.parentId || "").trim();
}

function isSubcategoryOption(c: AifCategoryOption) {
  return Boolean(categoryParentId(c));
}

function findCategoryByCandidates(candidates: unknown[], categories: AifCategoryOption[]) {
  let best: AifCategoryOption | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    if (!String(candidate ?? "").trim()) continue;
    for (const category of categories) {
      const score = categoryMatchScore(category, candidate);
      if (score > bestScore) {
        best = category;
        bestScore = score;
      }
    }
  }
  return best;
}

function mainCategoryCandidatesForRow(row: any) {
  const normalized = row?.normalized || row || {};
  return [
    (normalized as any).parentCategoryCode,
    (normalized as any).parent_category_code,
    (normalized as any).parentCategoryName,
    (normalized as any).parent_category_name,
    (normalized as any).sourceCategory,
    (normalized as any).sourceCategoryCode,
    (normalized as any).sourceCategoryName,
    mainCategoryRawValue(row),
    (normalized as any).categoryCode,
    (normalized as any).categoryName,
  ].filter((x) => String(x ?? "").trim());
}

function subCategoryCandidatesForRow(row: any) {
  const normalized = row?.normalized || row || {};
  return [
    (normalized as any).subCategoryCode,
    (normalized as any).subcategoryCode,
    (normalized as any).sub_category_code,
    (normalized as any).subCategoryName,
    (normalized as any).subcategoryName,
    (normalized as any).sub_category_name,
    (normalized as any).sourceSubCategory,
    (normalized as any).sourceSubCategoryCode,
    (normalized as any).sourceSubCategoryName,
    rawSubCategoryValue(row),
    (normalized as any).productType,
    (normalized as any).product_type,
    rawProductTypeValue(row),
    // Régi előnézeti sorból jöhetett alkategória a categoryCode alatt, ezt még felismerjük, de csak alkategóriák között.
    (normalized as any).categoryCode,
    (normalized as any).categoryName,
  ].filter((x) => String(x ?? "").trim());
}

function categoryCandidatesForRow(row: any) {
  return [...subCategoryCandidatesForRow(row), ...mainCategoryCandidatesForRow(row)];
}

function categoryColumnAsSubCategoryCandidatesForRow(row: any, categories: AifCategoryOption[]) {
  const mainCategories = categories.filter((c) => !isSubcategoryOption(c));
  return mainCategoryCandidatesForRow(row).filter((candidate) => {
    if (!String(candidate ?? "").trim()) return false;
    // Ha a Categorie/CATEGORY oszlop tényleg főkategória, nem használjuk alkategóriának.
    // Ha viszont beszállítói terméktípus, pl. SHORTS CAS, akkor segít visszatenni a jó helyre.
    return !findCategoryByCandidates([candidate], mainCategories);
  });
}

function findMainCategoryForRow(row: any, categories: AifCategoryOption[]) {
  const mainCategories = categories.filter((c) => !isSubcategoryOption(c));
  const subCategories = categories.filter(isSubcategoryOption);
  const directMain = findCategoryByCandidates(mainCategoryCandidatesForRow(row), mainCategories);
  if (directMain) return directMain;

  const subCandidates = [...subCategoryCandidatesForRow(row), ...categoryColumnAsSubCategoryCandidatesForRow(row, categories)];
  const subMatch = findCategoryByCandidates(subCandidates, subCategories);
  const parentId = categoryParentId(subMatch);
  if (parentId) return categories.find((c) => String(c.id) === parentId) || null;
  return null;
}

function findSubCategoryForRow(row: any, categories: AifCategoryOption[]) {
  const subCategories = categories.filter(isSubcategoryOption);
  const main = findMainCategoryForRow(row, categories);
  const mainId = main?.id ? String(main.id) : "";
  const candidates = [...subCategoryCandidatesForRow(row), ...categoryColumnAsSubCategoryCandidatesForRow(row, categories)];
  const scoped = mainId ? subCategories.filter((c) => categoryParentId(c) === mainId) : subCategories;
  return findCategoryByCandidates(candidates, scoped) || findCategoryByCandidates(candidates, subCategories);
}

function findCategoryForRow(row: any, categories: AifCategoryOption[]) {
  return findSubCategoryForRow(row, categories) || findMainCategoryForRow(row, categories);
}

function categoryDisplay(value: unknown, categories: AifCategoryOption[]) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const found = categories.find((c) => categoryMatches(c, raw));
  return found ? categoryLabel(found) : raw;
}

function genderAliasValues(g: AifGenderOption) {
  return [g.code, g.name, ...(Array.isArray(g.aliases) ? g.aliases : [])]
    .filter(Boolean)
    .map((x) => String(x).trim().toLowerCase());
}

function genderLabel(code: unknown, items: AifGenderOption[]) {
  const key = String(code ?? "").trim().toLowerCase();
  return items.find((g) => genderAliasValues(g).some((x) => x === key))?.name || String(code || "-");
}

function rowStatusText(value?: string | null) {
  const v = String(value || "").toLowerCase();
  if (v === "committed") return "Készleten";
  if (v === "parsed") return "Feldolgozható";
  if (v === "error") return "Javítandó";
  if (v === "ignored") return "Kihagyva";
  if (v === "draft") return "Vázlat";
  return value || "-";
}

function normValue(row: any, key: string, fallback?: unknown) {
  return cell((row?.normalized || {})[key] ?? fallback);
}

function SectionTitle(props: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className={sectionHeader}>
      <div className="flex items-center gap-2 text-sm uppercase tracking-[0.11em] text-white/94">
        {props.icon}
        <span>{props.title}</span>
      </div>
      {props.right}
    </div>
  );
}


function rowKey(row: AifParsedRow, index: number) {
  return `${row.rowNo || index + 1}-${index}`;
}

function splitCodProdus(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { fullCode: "", modelCode: "", colorCode: "" };
  const match = raw.match(/^(.+)-([A-Za-z0-9]{1,16})$/);
  if (!match) return { fullCode: raw, modelCode: raw, colorCode: "" };
  return { fullCode: raw, modelCode: match[1].trim(), colorCode: match[2].trim() };
}

function sameLoose(a: unknown, b: unknown) {
  return normMatchKey(a) === normMatchKey(b);
}

function colorCodeKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

type AifImportBarcodeConflict = {
  barcode: string;
  rows: Array<{ rowNo: number | string; label: string; identity: string }>;
};

function importBarcodeIdentity(row: AifParsedRow) {
  const normalized = (row?.normalized || {}) as Record<string, unknown>;
  const productCode = firstNonEmptyText(
    normalized.supplierProductCode,
    normalized.productCode,
    normalized.modelCode,
    (row as any)?.supplier_product_code,
    (row as any)?.product_code,
    (row as any)?.model_code
  );
  const split = splitCodProdus(productCode);
  const color = firstNonEmptyText(
    split.colorCode,
    normalized.supplierColorCode,
    normalized.colorCode,
    (row as any)?.supplier_color_code,
    (row as any)?.color_code
  );
  const size = normalizeAifSizeValue(firstNonEmptyText(
    normalized.supplierSize,
    normalized.size,
    (row as any)?.supplier_size,
    (row as any)?.size
  ));
  const codeKey = normMatchKey(split.fullCode || productCode || split.modelCode);
  const colorKey = normMatchKey(color);
  const sizeKey = normMatchKey(size);
  return {
    key: `${codeKey}|${colorKey}|${sizeKey}`,
    label: [split.fullCode || productCode || "kód nélkül", color || "szín nélkül", size || "méret nélkül"].join(" / "),
  };
}

function findImportBarcodeConflicts(inputRows: AifParsedRow[]): AifImportBarcodeConflict[] {
  const byBarcode = new Map<string, Map<string, Array<{ rowNo: number | string; label: string; identity: string }>>>();
  inputRows.forEach((row, index) => {
    const barcode = cleanIncomingBarcode((row?.normalized as any)?.barcode || (row as any)?.barcode);
    if (!barcode) return;
    const identity = importBarcodeIdentity(row);
    const barcodeKey = incomingBarcodeLookupKey(barcode);
    const identities = byBarcode.get(barcodeKey) || new Map();
    const entries = identities.get(identity.key) || [];
    entries.push({ rowNo: row.rowNo || index + 1, label: identity.label, identity: identity.key });
    identities.set(identity.key, entries);
    byBarcode.set(barcodeKey, identities);
  });

  const conflicts: AifImportBarcodeConflict[] = [];
  for (const [barcode, identities] of byBarcode.entries()) {
    if (identities.size <= 1) continue;
    conflicts.push({ barcode, rows: Array.from(identities.values()).flat() });
  }
  return conflicts;
}

function importBarcodeConflictMessage(conflicts: AifImportBarcodeConflict[]) {
  const first = conflicts[0];
  if (!first) return "";
  const examples = first.rows.slice(0, 4).map((row) => `${row.rowNo}. sor: ${row.label}`).join(" • ");
  const more = conflicts.length > 1 ? ` További ütköző vonalkódok: ${conflicts.length - 1}.` : "";
  return `Vonalkód ütközés: a ${first.barcode} több külön termékvariánshoz került. ${examples}.${more} Javítsd a vonalkód-oszlop társítását vagy a hibás sorokat mentés előtt.`;
}

export default function AllInIncoming(_props: Props) {
  const [suppliers, setSuppliers] = useState<AifSupplier[]>([]);
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [locationTypes, setLocationTypes] = useState<AifLocationType[]>([]);
  const [currencies, setCurrencies] = useState<AifCurrency[]>([]);
  const [brands, setBrands] = useState<AifBrandOption[]>([]);
  const [categories, setCategories] = useState<AifCategoryOption[]>([]);
  const [genderTypes, setGenderTypes] = useState<AifGenderOption[]>([]);
  const [supplierBrands, setSupplierBrands] = useState<AifSupplierBrandLink[]>([]);
  const [brandColorCodes, setBrandColorCodes] = useState<AifBrandColorCode[]>([]);
  const [colorTypes, setColorTypes] = useState<AifColorType[]>([]);
  const [sizeTypes, setSizeTypes] = useState<AifSizeTypeLike[]>([]);
  const [brandSizeCodes, setBrandSizeCodes] = useState<AifBrandSizeCodeLike[]>([]);
  const [defaultBrandCode, setDefaultBrandCode] = useState("");
  const [defaultCategoryCode, setDefaultCategoryCode] = useState("");
  const [defaultGender, setDefaultGender] = useState("");
  const [receptions, setReceptions] = useState<AifReceptionSummary[]>([]);
  const [selectedReceptionId, setSelectedReceptionId] = useState("");
  const [receptionPickerId, setReceptionPickerId] = useState("");
  const [loadedReception, setLoadedReception] = useState<AifReceptionDetail | null>(null);
  const [purchaseOrderSource, setPurchaseOrderSource] = useState<AifPurchaseOrderDetail | null>(null);
  const [purchaseOrderPickerOpen, setPurchaseOrderPickerOpen] = useState(false);
  const [purchaseOrderPickerLoading, setPurchaseOrderPickerLoading] = useState(false);
  const [purchaseOrderPickerError, setPurchaseOrderPickerError] = useState("");
  const [receivablePurchaseOrders, setReceivablePurchaseOrders] = useState<AifPurchaseOrderSummary[]>([]);
  const [receptionListOpen, setReceptionListOpen] = useState(false);
  const [batches, setBatches] = useState<AifImportBatchSummary[]>([]);
  const [deleteImportBatchTarget, setDeleteImportBatchTarget] = useState<AifImportBatchSummary | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [receptionOpen, setReceptionOpen] = useState(true);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [receptionDate, setReceptionDate] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [exchangeRateToRon, setExchangeRateToRon] = useState("");
  const [tvaMode, setTvaMode] = useState<"" | "without_tva" | "with_tva" | "no_tva">("");
  const [tvaRate, setTvaRate] = useState("");
  const [salesTvaRate, setSalesTvaRate] = useState("21");
  const [salesPriceIncludesTva, setSalesPriceIncludesTva] = useState(true);
  const [sellPriceCurrencyMode, setSellPriceCurrencyMode] = useState<SellPriceCurrencyMode>("invoice");
  const [salesTvaModalOpen, setSalesTvaModalOpen] = useState(false);
  const [salesTvaSettingsLoading, setSalesTvaSettingsLoading] = useState(false);
  const [salesTvaSettingsSaving, setSalesTvaSettingsSaving] = useState(false);
  const [salesTvaUpdatedAt, setSalesTvaUpdatedAt] = useState<string | null>(null);
  const [salesTvaUpdatedBy, setSalesTvaUpdatedBy] = useState<string | null>(null);
  const [shippingCost, setShippingCost] = useState("");
  const [invoiceGross, setInvoiceGross] = useState("");
  const [newCurrencyCode, setNewCurrencyCode] = useState("");
  const [newCurrencyName, setNewCurrencyName] = useState("");
  const [newCurrencySymbol, setNewCurrencySymbol] = useState("");
  const [editingCurrencyCode, setEditingCurrencyCode] = useState("");
  const [editCurrencyName, setEditCurrencyName] = useState("");
  const [editCurrencySymbol, setEditCurrencySymbol] = useState("");
  const [deleteCurrencyTarget, setDeleteCurrencyTarget] = useState<AifCurrency | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<AifParsedRow[]>([]);
  const [workbench, setWorkbench] = useState<AifWorkbookAnalysis | null>(null);
  const [workbenchOpen, setWorkbenchOpen] = useState(true);
  const [previewLimit, setPreviewLimit] = useState(25);
  const [approvedRows, setApprovedRows] = useState<Record<string, boolean>>({});
  const [manualProductCode, setManualProductCode] = useState("");
  const [manualSnCod, setManualSnCod] = useState("");
  const [manualCustomsTariffCode, setManualCustomsTariffCode] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [manualBarcodeScannerOpen, setManualBarcodeScannerOpen] = useState(false);
  const [manualBarcodeScannerStatus, setManualBarcodeScannerStatus] = useState("");
  const [manualBarcodeScannerValue, setManualBarcodeScannerValue] = useState("");
  const [manualBarcodeLookupBusy, setManualBarcodeLookupBusy] = useState(false);
  const manualBarcodeVideoRef = useRef<HTMLVideoElement | null>(null);
  const manualBarcodeStreamRef = useRef<MediaStream | null>(null);
  const manualBarcodeZxingControlsRef = useRef<IncomingZxingControls | null>(null);
  const manualBarcodeScanRafRef = useRef<number | null>(null);
  const manualBarcodeHandlingRef = useRef(false);
  const manualBarcodeHardwareInputRef = useRef<HTMLInputElement | null>(null);
  const manualBarcodeInventoryCacheRef = useRef<{ loadedAt: number; items: IncomingInventoryLookupItem[] }>({ loadedAt: 0, items: [] });
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualMaterial, setManualMaterial] = useState("");
  const [manualProductType, setManualProductType] = useState("");
  const [manualBrandCode, setManualBrandCode] = useState("");
  const [manualCategoryCode, setManualCategoryCode] = useState("");
  const [manualSubCategoryCode, setManualSubCategoryCode] = useState("");
  const [manualGender, setManualGender] = useState("");
  const [manualColorName, setManualColorName] = useState("");
  const [manualColorCode, setManualColorCode] = useState("");
  const [manualSize, setManualSize] = useState("");
  const [manualQty, setManualQty] = useState("");
  const [manualBuyPrice, setManualBuyPrice] = useState("");
  const [manualSellPrice, setManualSellPrice] = useState("");
  const [manualRowsOpen, setManualRowsOpen] = useState(true);
  const [incomingStep, setIncomingStep] = useState<IncomingWorkflowStep>("reception");
  const [incomingInputMode, setIncomingInputMode] = useState<IncomingInputMode>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [invoiceDifferencePrompt, setInvoiceDifferencePrompt] = useState<InvoiceDifferencePrompt | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationType, setNewLocationType] = useState<LocationType>("warehouse");
  const [newLocationTypeName, setNewLocationTypeName] = useState("");
  const [editingLocationTypeId, setEditingLocationTypeId] = useState("");
  const [editLocationTypeName, setEditLocationTypeName] = useState("");
  const [deleteLocationTypeTarget, setDeleteLocationTypeTarget] = useState<AifLocationType | null>(null);
  const [editingLocationId, setEditingLocationId] = useState("");
  const [editLocationName, setEditLocationName] = useState("");
  const [editLocationType, setEditLocationType] = useState<LocationType>("warehouse");
  const [deleteLocationTarget, setDeleteLocationTarget] = useState<AifLocation | null>(null);

  useEffect(() => {
    const anyModalOpen = Boolean(invoiceDifferencePrompt || salesTvaModalOpen || locationModalOpen || currencyModalOpen || manualBarcodeScannerOpen || purchaseOrderPickerOpen);
    if (!anyModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeTopModal = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();

      if (purchaseOrderPickerOpen) setPurchaseOrderPickerOpen(false);
      else if (manualBarcodeScannerOpen) closeManualBarcodeScanner();
      else if (invoiceDifferencePrompt) setInvoiceDifferencePrompt(null);
      else if (salesTvaModalOpen) setSalesTvaModalOpen(false);
      else if (locationModalOpen) setLocationModalOpen(false);
      else if (currencyModalOpen) setCurrencyModalOpen(false);
    };

    document.addEventListener("keydown", closeTopModal, true);
    return () => {
      document.removeEventListener("keydown", closeTopModal, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [invoiceDifferencePrompt, salesTvaModalOpen, locationModalOpen, currencyModalOpen, manualBarcodeScannerOpen, purchaseOrderPickerOpen]);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId]
  );

  const activeBrands = useMemo(() => brands.filter((b) => b.is_active !== false), [brands]);
  const activeCategories = useMemo(
    () => categories
      .filter((c) => c.is_active !== false)
      .slice()
      .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "hu", { sensitivity: "base" })),
    [categories]
  );

  const mainCategories = useMemo(
    () => activeCategories.filter((c) => !String((c as any).parent_id || (c as any).parentId || "").trim()),
    [activeCategories]
  );
  const subCategories = useMemo(
    () => activeCategories.filter((c) => String((c as any).parent_id || (c as any).parentId || "").trim()),
    [activeCategories]
  );
  const subCategoriesForManualCategory = useMemo(() => {
    const parentKey = String(manualCategoryCode || defaultCategoryCode || "").trim();
    if (!parentKey) return subCategories;
    const parent = activeCategories.find((c) => String(c.code || c.id) === parentKey || String(c.id) === parentKey);
    const parentId = parent?.id ? String(parent.id) : "";
    return subCategories.filter((c) => {
      const pid = String((c as any).parent_id || (c as any).parentId || "").trim();
      return !pid || !parentId || pid === parentId;
    });
  }, [activeCategories, subCategories, manualCategoryCode, defaultCategoryCode]);
  const activeGenderTypes = useMemo(() => genderTypes.filter((g) => g.is_active !== false), [genderTypes]);
  const sizeDatalistOptions = useMemo(() => {
    const values = new Set<string>();
    const add = (value: unknown) => {
      const raw = String(value ?? "").trim();
      if (!raw) return;
      values.add(normalizeAifSizeValue(raw) || raw);
    };
    AIF_SIZE_OPTIONS.forEach(add);
    sizeTypes.filter((item) => item.is_active !== false).forEach((item) => {
      sizeTypeValues(item).forEach(add);
    });
    brandSizeCodes.filter((item) => item.is_active !== false).forEach((item) => {
      brandSizeCodeValues(item).forEach(add);
    });
    return Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b, "hu", { numeric: true, sensitivity: "base" }));
  }, [sizeTypes, brandSizeCodes]);
  const brandOptionsForSupplier = useMemo(() => {
    if (!supplierId) return activeBrands;
    const linkedBrandIds = new Set(
      supplierBrands
        .filter((link) => link.is_active !== false && String(link.supplier_id) === String(supplierId))
        .map((link) => String(link.brand_id))
    );
    if (!linkedBrandIds.size) return activeBrands;
    return activeBrands.filter((brand) => linkedBrandIds.has(String(brand.id)));
  }, [activeBrands, supplierBrands, supplierId]);

  const selectedReceptionSummary = useMemo(
    () => receptions.find((r) => String(r.id) === String(selectedReceptionId)) || loadedReception?.item || null,
    [receptions, selectedReceptionId, loadedReception]
  );

  const loadedReceptionRows = useMemo(
    () => (loadedReception?.rows || []).map((row: any) => savedReceptionRowWithLatestMeta(row)),
    [loadedReception, activeBrands, activeCategories, activeGenderTypes, brandColorCodes, brandSizeCodes, colorTypes, sizeTypes]
  );
  const loadedReceptionRowTotals = useMemo(() => {
    return loadedReceptionRows.reduce(
      (acc: { total: number; committed: number; remaining: number; qty: number; value: number }, row: any) => {
        acc.total += 1;
        if (row.status === "committed") acc.committed += 1;
        else if (row.status !== "ignored") acc.remaining += 1;
        if (row.status !== "ignored") {
          acc.qty += toNumber(row.qty ?? row.normalized?.qty);
          acc.value += toNumber(row.qty ?? row.normalized?.qty) * toNumber(row.buy_price ?? row.normalized?.buyPrice);
        }
        return acc;
      },
      { total: 0, committed: 0, remaining: 0, qty: 0, value: 0 }
    );
  }, [loadedReceptionRows]);

  const activeLocationTypes = useMemo(() => locationTypes.filter((t) => t.is_active), [locationTypes]);
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.is_active), [currencies]);
  const isRonCurrency = isRonCurrencyCode(currencyCode);
  const exchangeRateRequired = Boolean(currencyCode && !isRonCurrency);
  const sellPriceSourceCurrency = sellPriceCurrencyMode === "ron"
    ? "RON"
    : (String(currencyCode || "").trim().toUpperCase() || "RON");
  const sellPriceSourceIsRon = isRonCurrencyCode(sellPriceSourceCurrency);
  const locationTypeOptions = useMemo(() => {
    if (activeLocationTypes.length) return activeLocationTypes;
    return [{ id: "warehouse", code: "warehouse", name: "Raktár", is_active: true } as AifLocationType];
  }, [activeLocationTypes]);

  function typeLabel(code: string) {
    return locationTypes.find((t) => t.code === code)?.name || locationTypeLabel(code);
  }

  function handleCurrencyCodeChange(nextCurrencyCode: string) {
    setCurrencyCode(nextCurrencyCode);
    if (String(nextCurrencyCode || "").trim().toUpperCase() === "RON") {
      setExchangeRateToRon("");
    }
  }

  function sellPriceRonFromSource(value: unknown) {
    const amount = toNumber(value);
    if (!amount) return amount;
    if (sellPriceSourceIsRon) return roundMoney(amount, 2);
    const rate = exchangeRateToRon.trim() ? toNumber(exchangeRateToRon) : 0;
    return rate > 0 ? roundMoney(amount * rate, 2) : 0;
  }

  function sellPriceCurrencyModeLabel() {
    if (sellPriceCurrencyMode === "ron") return "RON, már kész eladási végár";
    return `A számla pénzneme (${sellPriceSourceCurrency})`;
  }

  async function loadSalesTvaSettings(showMessage = false) {
    setSalesTvaSettingsLoading(true);
    try {
      const response = await apiAifGetSalesTvaSettings();
      const item = response.item || response.settings || {};
      setSalesTvaRate(String(item.salesTvaRate ?? 21));
      setSalesPriceIncludesTva((item.salesPriceIncludesTva ?? item.sellPriceIncludesTva) !== false);
      setSalesTvaUpdatedAt(item.updatedAt || item.updated_at || null);
      setSalesTvaUpdatedBy(item.updatedBy || item.updated_by || null);
      if (showMessage) setMessage("Központi eladási TVA beállítás betöltve.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Az eladási TVA központi beállítás betöltése nem sikerült.");
    } finally {
      setSalesTvaSettingsLoading(false);
    }
  }

  useEffect(() => {
    loadSalesTvaSettings(false);
  }, []);

  useEffect(() => {
    if (!isRonCurrency || !exchangeRateToRon.trim()) return;
    setExchangeRateToRon("");
  }, [isRonCurrency, exchangeRateToRon]);

  useEffect(() => {
    if (defaultBrandCode && !brandOptionsForSupplier.some((b) => (b.code || b.id) === defaultBrandCode)) {
      setDefaultBrandCode("");
    }
  }, [brandOptionsForSupplier, defaultBrandCode]);

  function brandForNormalized(n: Record<string, unknown>) {
    const raw = String(n.brandCode || n.brandName || "").trim();
    if (!raw) return null;
    return activeBrands.find((b) =>
      sameLoose(b.code, raw) || sameLoose(b.id, raw) || sameLoose(b.name, raw)
    ) || null;
  }

  function brandColorCodeForNormalized(n: Record<string, unknown>) {
    const brand = brandForNormalized(n);
    const code = colorCodeKey(n.colorCode || (n as any).supplierColorCode);
    if (!brand || !code) return null;
    return brandColorCodes.find((item: any) =>
      item.is_active !== false &&
      String(item.brand_id) === String(brand.id) &&
      colorCodeKey(item.color_code) === code
    ) || null;
  }

  function brandSizeCodeForNormalized(n: Record<string, unknown>) {
    const brand = brandForNormalized(n);
    const sizeCode = String((n as any).supplierSize || (n as any).supplier_size || (n as any).size || "").trim();
    if (!brand || !sizeCode) return null;
    return brandSizeCodes.find((item: any) =>
      item.is_active !== false &&
      String(item.brand_id) === String(brand.id) &&
      sameLoose(item.size_code, sizeCode)
    ) || null;
  }

  function applyProductCodeAndBrandColor(row: AifParsedRow) {
    const normalized = { ...(row.normalized || {}) } as any;
    const rawProductCode = rawValueByHeader(row, ["CODPRODUS", "COD PRODUS", "COD_PRODUS", "Cod produs", "product code"]);
    const rawSellPrice = rawValueByHeader(row, [
      "ELADASI AR", "ELADÁSI ÁR", "PRET DE VINZARE", "PRET DE VANZARE", "PRET VANZARE", "PRET VINZARE", "PRET VANZARE TVA", "PRET VANZARE CU TVA",
      "SELL PRICE", "SALE PRICE", "SHOPIFY PRICE", "PRICE RON", "PRET RON"
    ]);
    if ((normalized.sellPrice === null || normalized.sellPrice === undefined || normalized.sellPrice === "") && String(rawSellPrice ?? "").trim()) {
      normalized.sellPrice = toNumber(rawSellPrice);
    }

    const rawDescription = rawDescriptionValue(row);
    if (rawDescription && !String(normalized.descriptionRo || normalized.description || "").trim()) normalized.descriptionRo = rawDescription;
    const rawImage = rawImageValue(row);
    if (rawImage && !String(normalized.imageUrl || normalized.image_url || "").trim()) normalized.imageUrl = rawImage;
    const rawProductType = rawProductTypeValue(row);
    if (rawProductType && !String(normalized.productType || normalized.product_type || "").trim()) normalized.productType = rawProductType;
    const rawSubCategory = rawSubCategoryValue(row);
    if (rawSubCategory && !String(normalized.sourceSubCategory || normalized.subCategoryName || normalized.subCategoryCode || "").trim()) normalized.sourceSubCategory = rawSubCategory;
    const rawMaterial = rawValueByHeader(row, ["COMPOZITIE", "COMPOZIȚIE", "COMPOSITION", "MATERIAL", "MATERIAL COMPOSITION", "FABRIC", "ÖSSZETÉTEL", "OSSZETETEL"]);
    if (rawMaterial && !String(normalized.material || normalized.composition || "").trim()) normalized.material = String(rawMaterial).trim();
    const rawBarcode = rawValueByHeader(row, ["BARCODE", "BARKOD", "BÁRKÓD", "VONALKOD", "VONALKÓD", "EAN", "EAN13", "COD BARE", "COD DE BARE"]);
    if (rawBarcode && !String(normalized.barcode || "").trim()) normalized.barcode = String(rawBarcode).trim();
    const sourceProductCode = normalized.supplierProductCode || normalized.productCode || normalized.modelCode || rawProductCode;
    const split = splitCodProdus(sourceProductCode);
    if (split.fullCode) normalized.supplierProductCode = normalized.supplierProductCode || split.fullCode;
    if (split.modelCode && (!normalized.modelCode || String(normalized.modelCode) === String(split.fullCode))) normalized.modelCode = split.modelCode;
    const suffixIsSupplierColor = /^\d{1,4}$/.test(String(split.colorCode || ""));
    if (split.colorCode && (!normalized.colorCode || suffixIsSupplierColor)) normalized.colorCode = split.colorCode;
    if (split.colorCode && (!normalized.supplierColorCode || suffixIsSupplierColor)) normalized.supplierColorCode = split.colorCode;

    const rawColorCode = rawValueByHeader(row, COLOR_CODE_HEADER_ALIASES);
    if (rawColorCode && !String(normalized.colorCode || "").trim()) normalized.colorCode = String(rawColorCode).trim();
    if (rawColorCode && !String(normalized.supplierColorCode || "").trim()) normalized.supplierColorCode = String(rawColorCode).trim();

    const brandColor = brandColorCodeForNormalized(normalized) as any;
    if (brandColor) {
      normalized.colorName = brandColor.color_name_ro || normalized.colorName || "";
      normalized.colorHex = brandColor.color_hex || normalized.colorHex || "";
      normalized.brandColorCodeId = brandColor.id;
      normalized.colorTypeCode = brandColor.color_type_code || normalized.colorTypeCode || "";
    } else if (normalized.colorName) {
      const rawColor = String(normalized.colorName || "").trim();
      const found = colorTypes.find((c) => {
        const aliases = Array.isArray(c.aliases) ? c.aliases : [];
        return [c.code, c.name_ro, c.name_hu, c.name_en, c.name_de, ...aliases].filter(Boolean).some((x) => sameLoose(x, rawColor));
      });
      if (found?.name_ro) {
        normalized.colorName = found.name_ro;
        normalized.colorHex = found.hex || normalized.colorHex || "";
        normalized.colorTypeCode = found.code || normalized.colorTypeCode || "";
      }
    }
    const sourceSize = firstNonEmptyText(normalized.supplierSize, normalized.supplier_size, normalized.size, (row as any).supplier_size);
    const brandSize = brandSizeCodeForNormalized({ ...normalized, size: sourceSize, supplierSize: sourceSize }) as any;
    if (brandSize?.size_name) {
      normalized.supplierSize = normalized.supplierSize || sourceSize;
      normalized.size = normalizeAifSizeValue(brandSize.size_name);
      normalized.brandSizeCodeId = brandSize.id;
      normalized.sizeTypeCode = brandSize.size_type_code || normalized.sizeTypeCode || "";
    }
    const tariffCode = customsTariffCodeFromRow({ ...row, normalized });
    if (tariffCode) assignCustomsTariffCode(normalized, tariffCode);
    const normalizedSize = normalizeAifSizeValue(normalized.size || sourceSize || (row as any).supplier_size);
    if (normalizedSize) normalized.size = normalizedSize;
    return { ...row, normalized };
  }

  function brandColorMissingHint(row: AifParsedRow) {
    const n = row.normalized || {};
    const brand = brandForNormalized(n);
    const code = String((n as any).colorCode || (n as any).supplierColorCode || "").trim();
    if (!brand || !code) return "";
    if (brandColorCodeForNormalized(n)) return "";
    return `${brand.name || brand.code} / ${code}`;
  }


  function loadedRowCategoryText(row: any) {
    const main = findMainCategoryForRow(row, activeCategories);
    const sub = findSubCategoryForRow(row, activeCategories);
    if (main && sub) return `${categoryLabel(main)} / ${categoryLabel(sub)}`;
    if (main) return categoryLabel(main);
    if (sub) return categoryLabel(sub);
    const n = row?.normalized || {};
    return categoryDisplay(firstNonEmptyText(n.categoryCode, n.categoryName, n.sourceCategory, mainCategoryRawValue({ raw: savedRowRawObject(row) })), activeCategories);
  }

  function loadedRowColorText(row: any) {
    const n = {
      ...(row?.normalized || {}),
      brandCode: firstNonEmptyText(row?.normalized?.brandCode, row?.brand_code, row?.brandCode),
      brandName: firstNonEmptyText(row?.normalized?.brandName, row?.brand_name, row?.brandName),
      colorCode: firstNonEmptyText(row?.normalized?.colorCode, row?.normalized?.supplierColorCode, row?.supplier_color_code, row?.color_code, row?.colorCode),
      colorName: firstNonEmptyText(row?.normalized?.colorName, row?.color_name, row?.colorName),
    } as Record<string, unknown>;

    const brandColor = brandColorCodeForNormalized(n) as any;
    if (brandColor) return cell(brandColor.color_name_ro || brandColor.color_name || n.colorName || n.colorCode);

    const rawColor = String(n.colorName || "").trim();
    if (rawColor) {
      const found = colorTypes.find((c) => {
        const aliases = Array.isArray(c.aliases) ? c.aliases : [];
        return [c.code, c.name_ro, c.name_hu, c.name_en, c.name_de, ...aliases]
          .filter(Boolean)
          .some((x) => sameLoose(x, rawColor));
      });
      return cell(found?.name_ro || rawColor);
    }

    return cell(n.colorCode);
  }

  function savedReceptionRowWithLatestMeta(row: any) {
    const raw = savedRowRawObject(row);
    const existing = row?.normalized || {};
    const normalized = { ...existing } as Record<string, any>;

    const supplierProductCode = firstNonEmptyText(
      normalized.supplierProductCode,
      normalized.productCode,
      normalized.modelCode,
      row?.supplier_product_code,
      row?.supplierProductCode,
      row?.product_code,
      row?.model_code,
      rawValueByHeader({ raw }, ["CODPRODUS", "COD PRODUS", "COD_PRODUS", "Cod produs", "PRODUCT CODE"])
    );
    if (supplierProductCode) normalized.supplierProductCode = supplierProductCode;

    const snCod = firstNonEmptyText(normalized.snCod, normalized.sn_cod, row?.sn_cod, row?.snCod, rawValueByHeader({ raw }, ["SNCOD", "SN COD", "SN_COD"]));
    if (snCod) {
      normalized.snCod = snCod;
      normalized.sn_cod = snCod;
    }

    const customsTariffCode = customsTariffCodeFromRow({ ...row, raw, normalized });
    if (customsTariffCode) assignCustomsTariffCode(normalized, customsTariffCode);

    const brandCode = firstNonEmptyText(normalized.brandCode, row?.brand_code, row?.brandCode);
    const brandName = firstNonEmptyText(normalized.brandName, row?.brand_name, row?.brandName);
    if (brandCode) normalized.brandCode = brandCode;
    if (brandName) normalized.brandName = brandName;

    const sourceCategory = firstNonEmptyText(
      normalized.sourceCategory,
      normalized.sourceCategoryCode,
      normalized.sourceCategoryName,
      normalized.categoryCode,
      normalized.categoryName,
      row?.category_code,
      row?.categoryCode,
      row?.category_name,
      row?.categoryName,
      rawValueByHeader({ raw }, ["CATEGORIE", "CATEGORY", "CATEGORIA", "CATEGORIE PRODUS", "PRODUCT CATEGORY"])
    );
    if (sourceCategory) normalized.sourceCategory = sourceCategory;

    const sourceSubCategory = firstNonEmptyText(
      normalized.sourceSubCategory,
      normalized.sourceSubCategoryCode,
      normalized.sourceSubCategoryName,
      normalized.subCategoryCode,
      normalized.subcategoryCode,
      normalized.subCategoryName,
      normalized.subcategoryName,
      rawSubCategoryValue({ raw })
    );
    if (sourceSubCategory) {
      normalized.sourceSubCategory = sourceSubCategory;
      normalized.subCategoryName = normalized.subCategoryName || sourceSubCategory;
      normalized.subcategoryName = normalized.subcategoryName || sourceSubCategory;
    }

    const gender = firstNonEmptyText(normalized.gender, row?.gender, row?.gender_code, row?.genderCode, rawValueByHeader({ raw }, ["GEN", "GENDER", "NEM", "SEX"]));
    if (gender) normalized.gender = gender;

    const colorCode = firstNonEmptyText(
      normalized.colorCode,
      normalized.supplierColorCode,
      row?.supplier_color_code,
      row?.color_code,
      row?.colorCode,
      rawValueByHeader({ raw }, COLOR_CODE_HEADER_ALIASES)
    );
    if (colorCode) {
      normalized.colorCode = normalized.colorCode || colorCode;
      normalized.supplierColorCode = normalized.supplierColorCode || colorCode;
    }

    const colorName = firstNonEmptyText(normalized.colorName, row?.color_name, row?.colorName, rawValueByHeader({ raw }, ["CULOARE", "COLOR", "COLOUR", "SZÍN", "SZIN"]));
    if (colorName) normalized.colorName = colorName;

    const titleRo = firstNonEmptyText(normalized.titleRo, normalized.title, row?.title_ro, row?.title, row?.name, rawValueByHeader({ raw }, ["DENUMIRE", "DENUMIRE PRODUS", "PRODUCT NAME", "TITLE", "MEGNEVEZÉS", "MEGNEVEZES"]));
    if (titleRo) normalized.titleRo = titleRo;

    const descriptionRo = firstNonEmptyText(normalized.descriptionRo, normalized.description, row?.description_ro, row?.description, rawDescriptionValue({ raw }));
    if (descriptionRo) normalized.descriptionRo = descriptionRo;
    const imageUrl = firstNonEmptyText(normalized.imageUrl, normalized.image_url, row?.image_url, row?.imageUrl, rawImageValue({ raw }));
    if (imageUrl) normalized.imageUrl = imageUrl;
    const productType = firstNonEmptyText(normalized.productType, normalized.product_type, row?.product_type, row?.productType, rawProductTypeValue({ raw }));
    if (productType) normalized.productType = productType;
    const material = firstNonEmptyText(normalized.material, normalized.composition, row?.material, row?.composition, rawValueByHeader({ raw }, ["COMPOZITIE", "COMPOZIȚIE", "COMPOSITION", "MATERIAL", "MATERIAL COMPOSITION", "FABRIC", "ÖSSZETÉTEL", "OSSZETETEL"]));
    if (material) normalized.material = material;
    const barcode = firstNonEmptyText(normalized.barcode, row?.barcode, row?.supplier_barcode, rawValueByHeader({ raw }, ["BARCODE", "BARKOD", "BÁRKÓD", "VONALKOD", "VONALKÓD", "EAN", "EAN13", "COD BARE", "COD DE BARE"]));
    if (barcode) normalized.barcode = barcode;

    const qty = firstNonEmptyText(normalized.qty, row?.qty, row?.quantity, rawValueByHeader({ raw }, ["QTY", "QUANTITY", "CANTITATE", "DARAB", "DB"]));
    if (qty) normalized.qty = qty;

    const buyPrice = firstNonEmptyText(normalized.buyPrice, row?.buy_price, row?.buyPrice, rawValueByHeader({ raw }, ["PRET DE ACHIZITIE", "PREȚ DE ACHIZIȚIE", "PRET ACHIZITIE", "PRET ACHIZIȚIE", "PURCHASE PRICE", "BUY PRICE", "VÉTELÁR", "VETELAR"]));
    if (buyPrice) normalized.buyPrice = buyPrice;

    const sellPrice = firstNonEmptyText(normalized.sellPrice, normalized.sellPriceGrossRon, row?.sell_price_ron, row?.sell_price, row?.sellPrice, rawValueByHeader({ raw }, ["ELADASI AR", "ELADÁSI ÁR", "PRET DE VINZARE", "PRET DE VANZARE", "PRET VANZARE", "PRET VINZARE", "SELL PRICE", "SALE PRICE", "PRICE RON"]));
    if (sellPrice) normalized.sellPrice = sellPrice;

    const size = normalizeAifSizeValue(firstNonEmptyText(
      normalized.size,
      normalized.supplierSize,
      row?.supplier_size,
      row?.size,
      rawValueByHeader({ raw }, ["MARIME", "MĂRIME", "SIZE", "MÉRET", "MERET", "TAILLE", "GRÖSSE"])
    ));
    if (size) normalized.size = size;

    const rowForMeta = normalizeAifRowSize({
      ...row,
      raw,
      supplier_size: size || row?.supplier_size,
      normalized,
    }) as AifParsedRow;

    const mapped = normalizeImportedRowsWithMeta([rowForMeta])[0] || rowForMeta;
    return { ...row, ...mapped };
  }

  function brandValueForRow(n: Record<string, unknown>) {
    const raw = String(n.brandCode || n.brandName || "").trim();
    if (!raw) return "";
    const rawLower = raw.toLowerCase();
    const match = brandOptionsForSupplier.find((b) =>
      String(b.code || "").toLowerCase() === rawLower ||
      String(b.id || "").toLowerCase() === rawLower ||
      String(b.name || "").toLowerCase() === rawLower
    );
    return match ? String(match.code || match.id) : raw;
  }

  function mainCategoryValueForRow(rowOrNormalized: AifParsedRow | Record<string, unknown>) {
    const row = (rowOrNormalized as any)?.normalized ? rowOrNormalized : { normalized: rowOrNormalized };
    const match = findMainCategoryForRow(row, activeCategories);
    return match ? String(match.code || match.id) : "";
  }

  function subCategoryValueForRow(rowOrNormalized: AifParsedRow | Record<string, unknown>) {
    const row = (rowOrNormalized as any)?.normalized ? rowOrNormalized : { normalized: rowOrNormalized };
    const match = findSubCategoryForRow(row, activeCategories);
    return match ? String(match.code || match.id) : "";
  }

  function subCategoriesForParentValue(parentValue: string) {
    const parent = activeCategories.find((c) => String(c.code || c.id) === String(parentValue) || String(c.id) === String(parentValue));
    const parentId = parent?.id ? String(parent.id) : "";
    if (!parentId) return subCategories;
    return subCategories.filter((c) => categoryParentId(c) === parentId);
  }

  function importedMainCategoryHint(row: AifParsedRow) {
    const raw = mainCategoryCandidatesForRow(row).find((x) => String(x ?? "").trim());
    return String(raw ?? "").trim();
  }

  function importedSubCategoryHint(row: AifParsedRow) {
    const raw = subCategoryCandidatesForRow(row).find((x) => String(x ?? "").trim());
    return String(raw ?? "").trim();
  }

  function normalizeImportedRowsWithMeta(inputRows: AifParsedRow[]) {
    return inputRows.map((row) => {
      const rowWithSize = normalizeAifRowSize(row) as AifParsedRow;
      const rowWithCode = applyProductCodeAndBrandColor(rowWithSize);
      const normalized = { ...(rowWithCode.normalized || {}) } as any;
      const nextSize = normalizeAifSizeValue(normalized.size || (rowWithCode as any).supplier_size);
      if (nextSize) normalized.size = nextSize;

      const mainCategoryRaw = firstNonEmptyText(mainCategoryRawValue(rowWithCode), normalized.parentCategoryCode, normalized.parentCategoryName);
      if (mainCategoryRaw) {
        normalized.sourceCategory = normalized.sourceCategory || mainCategoryRaw;
        normalized.parentCategoryName = normalized.parentCategoryName || mainCategoryRaw;
      }

      const subCategoryRaw = firstNonEmptyText(rawSubCategoryValue(rowWithCode), normalized.sourceSubCategory, normalized.subCategoryName, normalized.subcategoryName, normalized.productType, normalized.product_type);
      if (subCategoryRaw) {
        const manualSubCategory = Boolean(normalized._manualSubCategory);
        normalized.sourceSubCategory = manualSubCategory ? (normalized.sourceSubCategory || subCategoryRaw) : subCategoryRaw;
        normalized.sourceSubCategoryName = manualSubCategory ? (normalized.sourceSubCategoryName || subCategoryRaw) : subCategoryRaw;
        if (!manualSubCategory) {
          normalized.subCategoryCode = "";
          normalized.subcategoryCode = "";
          normalized.subCategoryName = subCategoryRaw;
          normalized.subcategoryName = subCategoryRaw;
        } else {
          normalized.subCategoryName = normalized.subCategoryName || subCategoryRaw;
          normalized.subcategoryName = normalized.subcategoryName || subCategoryRaw;
        }
        normalized.productType = normalized.productType || subCategoryRaw;
        normalized.product_type = normalized.product_type || subCategoryRaw;
      }

      const rowForMatching = { ...rowWithCode, normalized };
      const subMatch = findSubCategoryForRow(rowForMatching, activeCategories);
      let mainMatch = findMainCategoryForRow(rowForMatching, activeCategories);
      if (!mainMatch && subMatch) {
        const parentId = categoryParentId(subMatch);
        if (parentId) mainMatch = activeCategories.find((c) => String(c.id) === parentId) || null;
      }

      if (mainMatch) {
        normalized.categoryCode = String(mainMatch.code || mainMatch.id);
        normalized.categoryName = categoryLabel(mainMatch);
        normalized.parentCategoryCode = String(mainMatch.code || mainMatch.id);
        normalized.parentCategoryName = categoryLabel(mainMatch);
      } else if (String(normalized.categoryCode || normalized.categoryName || "").trim()) {
        normalized.sourceCategory = normalized.sourceCategory || normalized.categoryCode || normalized.categoryName;
        normalized.categoryCode = "";
        normalized.categoryName = "";
      }

      if (subMatch) {
        normalized.subCategoryCode = String(subMatch.code || subMatch.id);
        normalized.subcategoryCode = String(subMatch.code || subMatch.id);
        normalized.subCategoryName = categoryLabel(subMatch);
        normalized.subcategoryName = categoryLabel(subMatch);
        normalized.productType = normalized.productType || categoryLabel(subMatch);
        normalized.product_type = normalized.product_type || categoryLabel(subMatch);
        const parentId = categoryParentId(subMatch);
        if (parentId) {
          normalized.parentCategoryId = parentId;
          const parent = activeCategories.find((c) => String(c.id) === parentId);
          if (parent) {
            normalized.categoryCode = String(parent.code || parent.id);
            normalized.categoryName = categoryLabel(parent);
            normalized.parentCategoryCode = String(parent.code || parent.id);
            normalized.parentCategoryName = categoryLabel(parent);
          }
        }
      }

      return normalizeAifRowSize({ ...rowWithCode, normalized }) as AifParsedRow;
    });
  }

  useEffect(() => {
    if (!rows.length) return;
    setRows((current) => normalizeImportedRowsWithMeta(current));
  }, [activeBrands, activeCategories, activeGenderTypes, brandColorCodes, brandSizeCodes, colorTypes, sizeTypes]);

  const preview = useMemo(() => rows.slice(0, previewLimit), [rows, previewLimit]);
  const rowProblems = useMemo(() => rows.filter((r) => aifRowErrors(r, sizeTypes, brandSizeCodes).length > 0).length, [rows, sizeTypes, brandSizeCodes]);
  const approvedRowList = useMemo(() => rows.filter((row, index) => approvedRows[rowKey(row, index)]), [rows, approvedRows]);
  const approvedProblems = useMemo(() => approvedRowList.filter((r) => aifRowErrors(r, sizeTypes, brandSizeCodes).length > 0).length, [approvedRowList, sizeTypes, brandSizeCodes]);
  const approvedBarcodeConflicts = useMemo(() => findImportBarcodeConflicts(approvedRowList), [approvedRowList]);
  const approvedCount = approvedRowList.length;
  const excludedCount = Math.max(0, rows.length - approvedCount);
  const approvedGoodsValue = useMemo(() => approvedRowList.reduce((sum, row) => {
    const n = row.normalized || {};
    return sum + toNumber(n.qty) * toNumber(n.buyPrice);
  }, 0), [approvedRowList]);
  const approvedQty = useMemo(() => approvedRowList.reduce((sum, row) => sum + toNumber(row.normalized?.qty), 0), [approvedRowList]);
  const importedTotalQty = useMemo(() => rows.reduce((sum, row: any) => sum + toNumber(row?.normalized?.qty ?? row?.qty ?? row?.quantity), 0), [rows]);
  const savedReceptionGoodsValue = selectedReceptionId ? loadedReceptionRowTotals.value : 0;
  const totalReceptionGoodsValue = savedReceptionGoodsValue + approvedGoodsValue;
  const rateValue = exchangeRateRequired && exchangeRateToRon.trim() ? toNumber(exchangeRateToRon) : 0;
  const exchangeRateToRonForPayload = exchangeRateRequired ? rateValue : null;
  const shippingValue = shippingCost.trim() ? toNumber(shippingCost) : 0;
  const vatRateValue = tvaMode && tvaMode !== "no_tva" && tvaRate.trim() ? toNumber(tvaRate) : 0;
  const invoiceGrossProvided = invoiceGross.trim().length > 0;
  const invoiceGrossValue = invoiceGrossProvided ? toNumber(invoiceGross) : 0;
  const tvaRateRequired = tvaMode === "with_tva" || tvaMode === "without_tva";
  const requiredMissing = {
    invoiceNumber: !invoiceNumber.trim(),
    invoiceDate: !invoiceDate,
    receptionDate: !receptionDate,
    currencyCode: !currencyCode,
    exchangeRateToRon: exchangeRateRequired && (!exchangeRateToRon.trim() || rateValue <= 0),
    tvaMode: !tvaMode,
    tvaRate: tvaRateRequired && (!tvaRate.trim() || vatRateValue <= 0),
    invoiceGross: !invoiceGrossProvided || invoiceGrossValue <= 0,
  };
  const computedReception = useMemo(
    () => calculateReceptionAmounts(totalReceptionGoodsValue, shippingValue, tvaMode, vatRateValue),
    [totalReceptionGoodsValue, shippingValue, tvaMode, vatRateValue]
  );
  const linePriceBasisTotal = totalReceptionGoodsValue + shippingValue;
  const invoiceDifference = invoiceGrossProvided ? invoiceGrossValue - linePriceBasisTotal : 0;
  const invoiceTargetGoodsValue = invoiceGrossProvided
    ? invoiceGoodsTarget(invoiceGrossValue, shippingValue)
    : totalReceptionGoodsValue;
  const invoiceAmountLabel = tvaMode === "without_tva"
    ? "Számla nettó összege"
    : tvaMode === "with_tva"
      ? "Számla bruttó összege"
      : "Számla összege";
  const invoiceAmountPlaceholder = tvaMode === "without_tva"
    ? "A számla nettó összege"
    : tvaMode === "with_tva"
      ? "A számla bruttó végösszege"
      : "A számla összege";
  const receptionBaseValue = invoiceGrossProvided ? invoiceGrossValue : linePriceBasisTotal;
  const receptionRonValue = isRonCurrency ? receptionBaseValue : receptionBaseValue * rateValue;
  const receptionReady = Boolean(
    invoiceNumber.trim() &&
    invoiceDate &&
    receptionDate &&
    currencyCode &&
    (!exchangeRateRequired || rateValue > 0) &&
    tvaMode &&
    (!tvaRateRequired || vatRateValue > 0) &&
    invoiceGrossProvided &&
    invoiceGrossValue > 0
  );
  const receptionHeaderMissing = {
    supplier: !supplierId,
    location: !locationId,
    ...requiredMissing,
  };
  const receptionHeaderReady = Boolean(supplierId && locationId && receptionReady);
  const missingReceptionFieldLabels = [
    receptionHeaderMissing.supplier ? "beszállító" : "",
    receptionHeaderMissing.location ? "cél hely" : "",
    receptionHeaderMissing.invoiceNumber ? "számlaszám" : "",
    receptionHeaderMissing.invoiceDate ? "számla dátuma" : "",
    receptionHeaderMissing.receptionDate ? "receptió dátuma" : "",
    receptionHeaderMissing.currencyCode ? "pénznem" : "",
    receptionHeaderMissing.exchangeRateToRon ? "RON árfolyam" : "",
    receptionHeaderMissing.tvaMode ? "TVA kezelés" : "",
    receptionHeaderMissing.tvaRate ? "TVA %" : "",
    receptionHeaderMissing.invoiceGross ? "számla végösszeg" : "",
  ].filter(Boolean);
  const requiredInput = (missing: boolean) => `${input} w-full ${missing ? "border-red-300/90 bg-[#c90d22]/22 text-white placeholder:text-red-100/60 shadow-[0_0_0_1px_rgba(201,13,34,0.22)] focus:border-red-200 focus:ring-1 focus:ring-red-200/35" : ""}`;
  const requiredSelectInput = (missing: boolean) => `${selectInput} w-full ${missing ? "border-red-300/90 bg-[#c90d22]/22 text-white shadow-[0_0_0_1px_rgba(201,13,34,0.22)] focus:border-red-200 focus:ring-1 focus:ring-red-200/35" : ""}`;
  const disabledExchangeRateInput = "h-9 w-full cursor-not-allowed rounded-lg border border-white/14 bg-[#303b4e]/55 px-3 text-sm text-white/45 caret-transparent outline-none opacity-70 transition placeholder:text-transparent focus:border-white/14 focus:ring-0 [color-scheme:dark] font-normal";
  const canSaveApprovedRows = Boolean(supplierId && locationId && approvedCount > 0 && approvedProblems === 0 && approvedBarcodeConflicts.length === 0 && receptionReady);
  const columnWarnings = useMemo(() => {
    if (!workbench) return 0;
    return workbench.columns.reduce((sum, c) => sum + c.warnings.length + (c.field !== "ignore" && c.confidence < 60 ? 1 : 0), 0) + workbench.warnings.length;
  }, [workbench]);

  function updateColumnField(index: number, field: AifColumnField) {
    if (!workbench) return;
    const next: AifWorkbookAnalysis = {
      ...workbench,
      columns: workbench.columns.map((col) => (col.index === index ? { ...col, field, label: AIF_COLUMN_FIELD_OPTIONS_WITH_SN.find((x) => x.value === field)?.label || col.label } : col)),
    };
    setWorkbench(next);
    setRows((current) => normalizeImportedRowsWithMeta(applyAifColumnMappingWithSnCod(current, next, selectedSupplier)));
  }

  function updateRowField(index: number, field: EditableImportField, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const normalized = { ...(row.normalized || {}) } as any;
        if (field === "qty") normalized[field] = value === "" ? null : toNumber(value);
        else if (field === "buyPrice" || field === "sellPrice") normalized[field] = value === "" ? null : toNumber(value);
        else if (field === "size") normalized[field] = normalizeAifSizeValue(value);
        else normalized[field] = value;

        if (field === "brandCode") {
          const brand = activeBrands.find((b) => (b.code || b.id) === value);
          normalized.brandName = brand?.name || "";
        }

        if (field === "categoryCode") {
          normalized._manualCategory = Boolean(value);
          const category = mainCategories.find((c) => (c.code || c.id) === value) || activeCategories.find((c) => (c.code || c.id) === value);
          if (value && category) {
            normalized.categoryCode = String(category.code || category.id);
            normalized.categoryName = categoryLabel(category);
            normalized.parentCategoryCode = String(category.code || category.id);
            normalized.parentCategoryName = categoryLabel(category);
          } else {
            normalized.categoryCode = "";
            normalized.categoryName = "";
            normalized.parentCategoryCode = "";
            normalized.parentCategoryName = "";
          }

          const currentSub = activeCategories.find((c) => (c.code || c.id) === normalized.subCategoryCode || (c.code || c.id) === normalized.subcategoryCode);
          const parentId = category?.id ? String(category.id) : "";
          if (currentSub && parentId && categoryParentId(currentSub) && categoryParentId(currentSub) !== parentId) {
            normalized.subCategoryCode = "";
            normalized.subcategoryCode = "";
            normalized.subCategoryName = "";
            normalized.subcategoryName = "";
          }
        }

        if (field === "subCategoryCode") {
          normalized._manualSubCategory = Boolean(value);
          const subCategory = subCategories.find((c) => (c.code || c.id) === value) || activeCategories.find((c) => (c.code || c.id) === value);
          if (value && subCategory) {
            normalized.subCategoryCode = String(subCategory.code || subCategory.id);
            normalized.subcategoryCode = String(subCategory.code || subCategory.id);
            normalized.subCategoryName = categoryLabel(subCategory);
            normalized.subcategoryName = categoryLabel(subCategory);
            normalized.sourceSubCategory = categoryLabel(subCategory);
            normalized.sourceSubCategoryCode = String(subCategory.code || subCategory.id);
            normalized.sourceSubCategoryName = categoryLabel(subCategory);
            if (!String(normalized.productType || normalized.product_type || "").trim()) normalized.productType = categoryLabel(subCategory);

            const parent = activeCategories.find((c) => String(c.id) === categoryParentId(subCategory));
            if (parent) {
              normalized.categoryCode = String(parent.code || parent.id);
              normalized.categoryName = categoryLabel(parent);
              normalized.parentCategoryCode = String(parent.code || parent.id);
              normalized.parentCategoryName = categoryLabel(parent);
            }
          } else {
            normalized.subCategoryCode = "";
            normalized.subcategoryCode = "";
            normalized.subCategoryName = "";
            normalized.subcategoryName = "";
          }
        }

        if (field === "supplierProductCode") normalized.modelCode = value || normalized.modelCode;
        if (field === "customsTariffCode") assignCustomsTariffCode(normalized as Record<string, any>, value);
        const updatedRow = applyProductCodeAndBrandColor({ ...row, normalized });
        return field === "productType" ? (normalizeImportedRowsWithMeta([updatedRow])[0] || updatedRow) : updatedRow;
      })
    );
  }

  function rowWithSalesMeta(row: AifParsedRow): AifParsedRow {
    const enrichedRow = applyProductCodeAndBrandColor(row);
    const normalized = { ...(enrichedRow.normalized || {}) } as any;
    const rate = salesTvaRate.trim() ? toNumber(salesTvaRate) : 0;
    normalized.sellPriceCurrencyMode = sellPriceCurrencyMode;
    normalized.sellPriceCurrency = sellPriceSourceCurrency;
    normalized.sellPriceIsRon = sellPriceSourceIsRon;
    normalized.sellPriceIncludesTva = salesPriceIncludesTva;
    normalized.salesPriceIncludesTva = salesPriceIncludesTva;
    normalized.salesTvaRate = rate;
    normalized.saleTvaRate = rate;
    if (normalized.sellPrice !== undefined && normalized.sellPrice !== null && normalized.sellPrice !== "") {
      normalized.sellPriceGrossRon = sellPriceRonFromSource(normalized.sellPrice);
      normalized.sellPriceRon = normalized.sellPriceGrossRon;
    }
    const tariffCode = customsTariffCodeFromRow(row);
    if (tariffCode) assignCustomsTariffCode(normalized, tariffCode);
    const normalizedSize = normalizeAifSizeValue(normalized.size || (row as any).supplier_size);
    if (normalizedSize) normalized.size = normalizedSize;

    const rowWithCategoryMeta = normalizeImportedRowsWithMeta([{ ...enrichedRow, normalized } as AifParsedRow])[0] || { ...enrichedRow, normalized };
    return normalizeAifRowSize(rowWithCategoryMeta) as AifParsedRow;
  }

  async function saveSalesTvaSettings() {
    const parsedRate = toNumber(salesTvaRate);
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 100) {
      setMessage("Az eladási TVA százalék 0 és 100 közötti szám legyen.");
      return null;
    }
    setSalesTvaSettingsSaving(true);
    try {
      const response = await apiAifSaveSalesTvaSettings({
        salesTvaRate: parsedRate,
        salesPriceIncludesTva,
        sellPriceIncludesTva: salesPriceIncludesTva,
      });
      const item = response.item || response.settings || {};
      setSalesTvaRate(String(item.salesTvaRate ?? parsedRate));
      setSalesPriceIncludesTva((item.salesPriceIncludesTva ?? item.sellPriceIncludesTva) !== false);
      setSalesTvaUpdatedAt(item.updatedAt || item.updated_at || null);
      setSalesTvaUpdatedBy(item.updatedBy || item.updated_by || null);
      setSalesTvaModalOpen(false);
      setMessage("Eladási TVA központi alapbeállítás mentve. A pénznemet továbbra is receptiónként választod ki.");
      return item;
    } catch (e: any) {
      setMessage(e?.message || "Az eladási TVA központi beállítás mentése nem sikerült.");
      return null;
    } finally {
      setSalesTvaSettingsSaving(false);
    }
  }

  function applyImportDefaults(scope: "missing" | "approved" | "all") {
    if (!rows.length) {
      setMessage("Nincs beolvasott sor.");
      return;
    }
    const hasAnyDefault = Boolean(defaultBrandCode || defaultCategoryCode || defaultGender);
    if (!hasAnyDefault) {
      setMessage("Nincs kiválasztott alap besorolás.");
      return;
    }
    let changed = 0;
    setRows((current) =>
      current.map((row, index) => {
        if (scope === "approved" && !approvedRows[rowKey(row, index)]) return row;
        const normalized = { ...(row.normalized || {}) };
        let touched = false;
        const assign = (key: "brandCode" | "categoryCode" | "gender", value: string) => {
          if (!value) return;
          if (scope === "missing" && normalized[key]) return;
          if (normalized[key] === value) return;
          normalized[key] = value;
          touched = true;
        };
        assign("brandCode", defaultBrandCode);
        assign("categoryCode", defaultCategoryCode);
        assign("gender", defaultGender);
        if (defaultBrandCode && normalized.brandCode === defaultBrandCode) {
          normalized.brandName = activeBrands.find((b) => (b.code || b.id) === defaultBrandCode)?.name || normalized.brandName;
        }
        if (defaultCategoryCode && normalized.categoryCode === defaultCategoryCode) {
          const category = activeCategories.find((c) => (c.code || c.id) === defaultCategoryCode);
          normalized.categoryName = category ? categoryLabel(category) : normalized.categoryName;
        }
        if (touched) changed += 1;
        return touched ? { ...row, normalized } : row;
      })
    );
    if (scope === "approved") setMessage(`${changed} kijelölt sor besorolása frissítve.`);
    else if (scope === "all") setMessage(`${changed} beolvasott sor besorolása frissítve.`);
    else setMessage(`${changed} sor hiányzó besorolása kitöltve.`);
  }

  function toggleApprovedRow(index: number, checked: boolean) {
    const row = rows[index];
    if (!row) return;
    const key = rowKey(row, index);
    setApprovedRows((current) => ({ ...current, [key]: checked }));
  }

  function selectAllRows() {
    if (!rows.length) {
      setMessage("Nincs beolvasott sor kijelöléshez.");
      return;
    }
    const next: Record<string, boolean> = {};
    let problemCount = 0;
    rows.forEach((row, index) => {
      next[rowKey(row, index)] = true;
      if (aifRowErrors(row, sizeTypes, brandSizeCodes).length > 0) problemCount += 1;
    });
    setApprovedRows(next);
    setPreviewLimit((current) => Math.max(current, rows.length));
    setMessage(
      problemCount
        ? `Az összes ${rows.length} sor kijelölve. ${problemCount} sor még javítandó, ezeket mentés előtt rendezni kell.`
        : `Az összes ${rows.length} sor kijelölve mentésre.`
    );
  }

  function selectCleanRows() {
    if (!rows.length) {
      setMessage("Nincs beolvasott sor kijelöléshez.");
      return;
    }
    const next: Record<string, boolean> = {};
    rows.forEach((row, index) => {
      if (aifRowErrors(row, sizeTypes, brandSizeCodes).length === 0) next[rowKey(row, index)] = true;
    });
    setApprovedRows(next);
    setPreviewLimit((current) => Math.max(current, rows.length));
    setMessage(`A hibátlan sorok ki lettek jelölve: ${Object.keys(next).length} / ${rows.length}. Mentés előtt ellenőrizd az előnézetet.`);
  }

  function clearApprovedRows() {
    setApprovedRows({});
    setMessage("A kijelölés törölve. A beolvasott adatok továbbra is csak előnézetben vannak.");
  }

  function stopManualBarcodeScannerCamera() {
    if (manualBarcodeScanRafRef.current !== null) {
      window.cancelAnimationFrame(manualBarcodeScanRafRef.current);
      manualBarcodeScanRafRef.current = null;
    }
    try { manualBarcodeZxingControlsRef.current?.stop?.(); } catch {}
    manualBarcodeZxingControlsRef.current = null;
    if (manualBarcodeStreamRef.current) {
      manualBarcodeStreamRef.current.getTracks().forEach((track) => track.stop());
      manualBarcodeStreamRef.current = null;
    }
    const video = manualBarcodeVideoRef.current;
    if (video?.srcObject && typeof (video.srcObject as MediaStream).getTracks === "function") {
      (video.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  }

  function closeManualBarcodeScanner() {
    stopManualBarcodeScannerCamera();
    manualBarcodeHandlingRef.current = false;
    setManualBarcodeScannerOpen(false);
    setManualBarcodeScannerStatus("");
    setManualBarcodeScannerValue("");
  }

  function openManualBarcodeScanner() {
    stopManualBarcodeScannerCamera();
    manualBarcodeHandlingRef.current = false;
    setManualBarcodeScannerValue(cleanIncomingBarcode(manualBarcode));
    setManualBarcodeScannerStatus("Kamera indítása. USB-s olvasónál csak szkenneld be a kódot, majd az Enter azonosítja a terméket.");
    setManualBarcodeScannerOpen(true);
    window.setTimeout(() => {
      const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
      if (!isTouch) manualBarcodeHardwareInputRef.current?.focus();
    }, 120);
  }

  function manualLookupBrandValue(item: IncomingInventoryLookupItem) {
    const rawValues = [item.brand_code, item.brand_name].map((value) => String(value || "").trim()).filter(Boolean);
    const found = activeBrands.find((brand) => rawValues.some((value) => sameLoose(value, brand.code) || sameLoose(value, brand.id) || sameLoose(value, brand.name)));
    return String(found?.code || found?.id || item.brand_code || "").trim();
  }

  function manualLookupCategoryValues(item: IncomingInventoryLookupItem) {
    const sub = findCategoryByCandidates(
      [item.subcategory_code, item.subcategory_name_ro, item.subcategory_name_hu, item.product_type],
      subCategories,
    );
    let main = findCategoryByCandidates(
      [item.category_code, item.category_name_ro, item.category_name_hu],
      mainCategories.length ? mainCategories : activeCategories.filter((row) => !isSubcategoryOption(row)),
    );
    if (!main && sub) {
      const parentId = categoryParentId(sub);
      if (parentId) main = activeCategories.find((row) => String(row.id) === parentId) || null;
    }
    return {
      mainValue: String(main?.code || main?.id || item.category_code || "").trim(),
      subValue: String(sub?.code || sub?.id || item.subcategory_code || "").trim(),
      productType: firstNonEmptyText(item.product_type, sub ? categoryLabel(sub) : ""),
    };
  }

  function applyManualLookupItem(item: IncomingInventoryLookupItem, scannedCode: string) {
    const categories = manualLookupCategoryValues(item);
    setManualProductCode(firstNonEmptyText(item.supplier_product_code, item.supplierProductCode, item.product_code, item.productCode, item.model_code));
    setManualBarcode(firstNonEmptyText(item.barcode, scannedCode));
    setManualSnCod(firstNonEmptyText(item.sn_cod, item.snCod));
    setManualCustomsTariffCode(firstNonEmptyText(item.customs_tariff_code, item.customsTariffCode, item.hs_code));
    setManualTitle(firstNonEmptyText(item.title_ro));
    setManualImageUrl(firstNonEmptyText(item.image_url));
    setManualDescription(firstNonEmptyText(item.description_ro));
    setManualMaterial(firstNonEmptyText(item.material));
    setManualProductType(categories.productType);
    setManualBrandCode(manualLookupBrandValue(item));
    setManualCategoryCode(categories.mainValue);
    setManualSubCategoryCode(categories.subValue);
    setManualGender(firstNonEmptyText(item.gender));
    setManualColorName(firstNonEmptyText(item.color_name));
    setManualColorCode(firstNonEmptyText(item.color_code));
    setManualSize(normalizeAifSizeValue(item.size));
    setManualQty((current) => current.trim() || "1");
    setManualBuyPrice(item.buy_price === null || item.buy_price === undefined ? "" : String(item.buy_price));
    setManualSellPrice(item.sell_price === null || item.sell_price === undefined ? "" : String(item.sell_price));
  }

  async function identifyManualBarcode(rawValue: unknown, options: { closeOnFound?: boolean } = {}) {
    const code = cleanIncomingBarcode(rawValue);
    if (!code) {
      setManualBarcodeScannerStatus("Nincs beolvasott kód. Tartsd a címkét a kamera elé, vagy szkenneld be az USB-s olvasóval.");
      setMessage("A termék azonosításához szükség van vonalkódra.");
      return false;
    }
    if (manualBarcodeLookupBusy) return false;

    setManualBarcode(code);
    setManualBarcodeScannerValue(code);
    setManualBarcodeLookupBusy(true);
    setManualBarcodeScannerStatus(`Termék keresése: ${code}`);
    try {
      const cache = manualBarcodeInventoryCacheRef.current;
      let inventoryItems = cache.items;
      if (!inventoryItems.length || Date.now() - cache.loadedAt > 30000) {
        inventoryItems = await apiIncomingInventoryLookupItems();
        manualBarcodeInventoryCacheRef.current = { loadedAt: Date.now(), items: inventoryItems };
      }

      const activeItems = inventoryItems.filter((item) =>
        String(item.variant_status || "active").toLowerCase() !== "archived" &&
        String(item.model_status || "active").toLowerCase() !== "archived"
      );
      const key = incomingBarcodeLookupKey(code);
      const barcodeMatches = activeItems.filter((item) => incomingBarcodeLookupKey(item.barcode) === key);
      const fallbackMatches = activeItems.filter((item) => [
        item.internal_sku,
        item.sn_cod,
        item.snCod,
        item.supplier_product_code,
        item.supplierProductCode,
        item.product_code,
        item.productCode,
        item.model_code,
      ].some((value) => incomingBarcodeLookupKey(value) === key));
      const matches = barcodeMatches.length ? barcodeMatches : fallbackMatches;

      if (!matches.length) {
        setManualBarcodeScannerStatus(`A ${code} kód nincs még az AllIn terméktörzsében. A vonalkódot beírtam, a többi adat kézzel tölthető.`);
        setMessage(`A ${code} vonalkódhoz nem találtam meglévő terméket. A kód bekerült a manuális sorba, új termékként folytathatod.`);
        return false;
      }

      const item = matches[0];
      applyManualLookupItem(item, code);
      const title = firstNonEmptyText(item.title_ro, item.supplier_product_code, item.model_code, code);
      setManualBarcodeScannerStatus(`Azonosítva: ${title}`);
      setMessage(
        matches.length > 1
          ? `A vonalkód több sorhoz is illeszkedett; a pontos vonalkód-egyezés első variánsát töltöttem be: ${title}. Ellenőrizd a méretet és a színt.`
          : `Termék azonosítva és a manuális mezők kitöltve: ${title}. A darabszám 1, a vételárat pedig ellenőrizd az aktuális számla alapján.`
      );
      if (options.closeOnFound !== false) closeManualBarcodeScanner();
      return true;
    } catch (error: any) {
      setManualBarcodeScannerStatus(error?.message || "A termékazonosítás nem sikerült.");
      setMessage(error?.message || "A vonalkód alapján nem sikerült betölteni a terméket.");
      return false;
    } finally {
      manualBarcodeHandlingRef.current = false;
      setManualBarcodeLookupBusy(false);
    }
  }

  useEffect(() => {
    if (!manualBarcodeScannerOpen) return;
    let cancelled = false;

    async function attachPreviewOnly(status: string) {
      const stream = await navigator.mediaDevices.getUserMedia(AIF_INCOMING_BARCODE_VIDEO_CONSTRAINTS);
      if (cancelled) return stream.getTracks().forEach((track) => track.stop());
      manualBarcodeStreamRef.current = stream;
      const video = manualBarcodeVideoRef.current;
      if (!video) return stream.getTracks().forEach((track) => track.stop());
      video.srcObject = stream;
      await video.play();
      setManualBarcodeScannerStatus(status);
    }

    async function useDetectedCode(value: unknown) {
      const code = cleanIncomingBarcode(value);
      if (!code || manualBarcodeHandlingRef.current || cancelled) return;
      manualBarcodeHandlingRef.current = true;
      stopManualBarcodeScannerCamera();
      await identifyManualBarcode(code, { closeOnFound: true });
    }

    async function startZxing() {
      setManualBarcodeScannerStatus("ZXing vonalkódolvasó betöltése...");
      const zxing = await loadIncomingZxingBrowser();
      if (cancelled) return;
      const Reader = zxing?.BrowserMultiFormatReader || zxing?.BrowserMultiFormatOneDReader;
      const video = manualBarcodeVideoRef.current;
      if (!Reader || !video) {
        await attachPreviewOnly("A kamera aktív, de az automatikus olvasó nem érhető el. USB-s olvasóval vagy kézi beírással továbbra is azonosítható.");
        return;
      }
      const reader = new Reader();
      if (typeof reader.decodeFromConstraints !== "function") {
        await attachPreviewOnly("A kamera aktív, de ez a böngésző nem ad folyamatos dekódolást. Használd az USB-s olvasót vagy a kézi mezőt.");
        return;
      }
      const controls = await reader.decodeFromConstraints(
        AIF_INCOMING_BARCODE_VIDEO_CONSTRAINTS,
        video,
        async (result) => {
          const code = incomingZxingResultText(result);
          if (code) await useDetectedCode(code);
        },
      );
      if (cancelled) return controls?.stop?.();
      manualBarcodeZxingControlsRef.current = controls || null;
      setManualBarcodeScannerStatus("Kamera aktív. Tartsd a címke vonalkódját a keretbe. USB-s olvasó is használható.");
    }

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setManualBarcodeScannerStatus("Ezen az eszközön nincs webes kamera-hozzáférés. Az USB-s vonalkódolvasó vagy a kézi mező használható.");
          return;
        }
        const Detector = (window as any).BarcodeDetector as IncomingBarcodeDetectorConstructor | undefined;
        if (!Detector) return startZxing();
        const stream = await navigator.mediaDevices.getUserMedia(AIF_INCOMING_BARCODE_VIDEO_CONSTRAINTS);
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        manualBarcodeStreamRef.current = stream;
        const video = manualBarcodeVideoRef.current;
        if (!video) return stream.getTracks().forEach((track) => track.stop());
        video.srcObject = stream;
        await video.play();
        const supported = await Detector.getSupportedFormats?.().catch(() => []);
        const formats = Array.isArray(supported) && supported.length
          ? AIF_INCOMING_BARCODE_FORMATS.filter((format) => supported.includes(format))
          : AIF_INCOMING_BARCODE_FORMATS;
        const detector = new Detector(formats.length ? { formats } : undefined);
        setManualBarcodeScannerStatus("Kamera aktív. Tartsd a címke vonalkódját a keretbe. USB-s olvasó is használható.");
        const scanFrame = async () => {
          if (cancelled || manualBarcodeHandlingRef.current) return;
          const currentVideo = manualBarcodeVideoRef.current;
          if (currentVideo && currentVideo.readyState >= 2) {
            try {
              const detected = await detector.detect(currentVideo);
              const first = detected.find((row) => cleanIncomingBarcode(row.rawValue));
              if (first?.rawValue) return useDetectedCode(first.rawValue);
            } catch {}
          }
          if (!cancelled && !manualBarcodeHandlingRef.current) manualBarcodeScanRafRef.current = window.requestAnimationFrame(scanFrame);
        };
        manualBarcodeScanRafRef.current = window.requestAnimationFrame(scanFrame);
      } catch (error: any) {
        const name = String(error?.name || "");
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setManualBarcodeScannerStatus("A kamera nincs engedélyezve. Engedélyezd a böngészőben, vagy használd az USB-s vonalkódolvasót.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setManualBarcodeScannerStatus("Nem található kamera. Az USB-s vonalkódolvasó és a kézi beírás továbbra is működik.");
        } else {
          setManualBarcodeScannerStatus(error?.message || "A kamera nem indítható. Használd az USB-s vonalkódolvasót vagy a kézi mezőt.");
        }
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      stopManualBarcodeScannerCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualBarcodeScannerOpen]);

  useEffect(() => () => stopManualBarcodeScannerCamera(), []);

  function resetManualRowForm() {
    setManualProductCode("");
    setManualSnCod("");
    setManualCustomsTariffCode("");
    setManualTitle("");
    setManualBarcode("");
    setManualImageUrl("");
    setManualDescription("");
    setManualMaterial("");
    setManualProductType("");
    setManualBrandCode(defaultBrandCode);
    setManualCategoryCode(defaultCategoryCode);
    setManualSubCategoryCode("");
    setManualGender(defaultGender);
    setManualColorName("");
    setManualColorCode("");
    setManualSize("");
    setManualQty("");
    setManualBuyPrice("");
    setManualSellPrice("");
  }

  function clearImportedRows() {
    setFileName("");
    setRows([]);
    setWorkbench(null);
    setApprovedRows({});
    setPreviewLimit(25);
    setInvoiceDifferencePrompt(null);
  }

  function startNewEmptyReception(showMessage = true) {
    if (showMessage && typeof window !== "undefined") {
      try { window.sessionStorage.removeItem(AIF_PURCHASE_ORDER_RECEIVE_HANDOFF_KEY); } catch {}
    }
    setPurchaseOrderSource(null);
    setSelectedReceptionId("");
    setReceptionPickerId("");
    setLoadedReception(null);
    setSupplierId("");
    setLocationId("");
    setNote("");
    setInvoiceNumber("");
    setInvoiceDate("");
    setReceptionDate("");
    setCurrencyCode("");
    setExchangeRateToRon("");
    setTvaMode("");
    setTvaRate("");
    setSellPriceCurrencyMode("invoice");
    setShippingCost("");
    setInvoiceGross("");
    setDefaultBrandCode("");
    setDefaultCategoryCode("");
    setDefaultGender("");
    clearImportedRows();
    resetManualRowForm();
    setManualRowsOpen(true);
    setReceptionOpen(true);
    setWorkbenchOpen(false);
    setIncomingStep("reception");
    setIncomingInputMode("");
    if (showMessage) setMessage("Új üres bevételezés indítva. Töltsd ki a receptió fejadatait, majd válaszd ki a terméksor forrását.");
  }

  function fillReceptionHeader(detail: AifReceptionDetail, options: { clearDraftRows?: boolean } = {}) {
    const clearDraftRows = options.clearDraftRows !== false;
    const item = detail.item;
    setInvoiceDifferencePrompt(null);
    const rowsWithSize = (detail.rows || []).map((row: any) => normalizeAifRowSize(row));
    setSelectedReceptionId(item.id);
    setReceptionPickerId(item.id);
    setLoadedReception({ ...detail, rows: rowsWithSize });
    setSupplierId(String(item.supplier_id || ""));
    setLocationId(String(item.target_location_id || ""));
    setInvoiceNumber(String(item.invoice_number || ""));
    setInvoiceDate(dateOnly(item.invoice_date));
    setReceptionDate(dateOnly(item.reception_date));
    const nextCurrencyCode = String(item.currency_code || "");
    setCurrencyCode(nextCurrencyCode);
    setExchangeRateToRon(String(nextCurrencyCode || "").trim().toUpperCase() === "RON" ? "" : String(item.exchange_rate_to_ron || ""));
    setTvaMode((String(item.tva_mode || "") as any) || "");
    setTvaRate(String(item.tva_rate ?? ""));
    setShippingCost(String(item.shipping_cost ?? ""));
    setInvoiceGross(String(item.invoice_gross ?? ""));
    setNote(String((item as any).note || ""));
    const purchaseOrderId = String((item as any).purchase_order_id || "").trim();
    if (purchaseOrderId) {
      void apiAifGetPurchaseOrder(purchaseOrderId)
        .then((orderDetail) => setPurchaseOrderSource(orderDetail))
        .catch(() => setPurchaseOrderSource(null));
    } else {
      setPurchaseOrderSource(null);
    }
    const rawMeta = (item as any).raw_meta || {};
    const storedSellPriceMode = String(rawMeta.sellPriceCurrencyMode || rawMeta.sell_price_currency_mode || "").trim().toLowerCase();
    setSellPriceCurrencyMode(
      storedSellPriceMode === "ron" || storedSellPriceMode === "invoice"
        ? storedSellPriceMode as SellPriceCurrencyMode
        : (String(nextCurrencyCode || "").trim().toUpperCase() === "RON" ? "ron" : "invoice")
    );
    if (rawMeta.salesTvaRate !== undefined || rawMeta.saleTvaRate !== undefined) setSalesTvaRate(String(rawMeta.salesTvaRate ?? rawMeta.saleTvaRate ?? "21"));
    if (rawMeta.salesPriceIncludesTva !== undefined || rawMeta.sellPriceIncludesTva !== undefined) setSalesPriceIncludesTva(Boolean(rawMeta.salesPriceIncludesTva ?? rawMeta.sellPriceIncludesTva));
    if (clearDraftRows) {
      clearImportedRows();
      resetManualRowForm();
      setManualRowsOpen(true);
      setWorkbenchOpen(false);
    }
    setReceptionOpen(true);
  }

  async function loadReceptionIntoWorkspace(id?: string) {
    const rid = id || receptionPickerId;
    if (!rid) {
      setMessage("Válassz receptiót a listából.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await loadMeta();
      const [detail] = await Promise.all([
        apiAifGetReception(rid),
        loadBatches(),
        loadReceptions(),
      ]);
      fillReceptionHeader(detail);
      setIncomingStep("source");
      setIncomingInputMode("");
      const remaining = Number((detail.item as any).remaining_rows || 0);
      setMessage(`Receptió és törzsadatok betöltve: ${detail.item.invoice_number || "számlaszám nélkül"}. ${remaining ? `${remaining} még dolgozandó sor van benne.` : "Új sorokat is hozzáadhatsz ehhez a receptióhoz."}`);
    } catch (e: any) {
      setMessage(e?.message || "A receptió betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }


  async function reloadOpenedReceptionAndMeta() {
    const rid = selectedReceptionId || receptionPickerId;
    if (!rid) {
      setMessage("Nincs megnyitott receptió az újratöltéshez.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await loadMeta();
      const [detail] = await Promise.all([
        apiAifGetReception(rid),
        loadBatches(),
        loadReceptions(),
      ]);
      fillReceptionHeader(detail, { clearDraftRows: false });
      setRows((current) => (current.length ? normalizeImportedRowsWithMeta(current) : current));
      const remaining = Number((detail.item as any).remaining_rows || 0);
      setMessage(`Receptió lista és törzsadatok újratöltve: ${detail.item.invoice_number || "számlaszám nélkül"}. ${remaining ? `${remaining} még dolgozandó sor van benne.` : "Az újonnan felvett színek, főkategóriák / alkategóriák, standard méretek és márkaméretek is frissültek a listában."}`);
    } catch (e: any) {
      setMessage(e?.message || "A receptió és a törzsadatok újratöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function addManualRow() {
    const nextRowNo = rows.length + 1;
    const brandCode = manualBrandCode || defaultBrandCode;
    const parentCategoryCode = manualCategoryCode || defaultCategoryCode;
    const subCategoryCode = manualSubCategoryCode;
    const categoryCode = parentCategoryCode;
    const gender = manualGender || defaultGender;
    const brand = activeBrands.find((b) => (b.code || b.id) === brandCode);
    const category = activeCategories.find((c) => (c.code || c.id) === categoryCode);
    const parentCategory = activeCategories.find((c) => (c.code || c.id) === parentCategoryCode);
    const manualSubCategory = activeCategories.find((c) => (c.code || c.id) === subCategoryCode);
    const qty = manualQty.trim() ? toNumber(manualQty) : null;
    const buyPrice = manualBuyPrice.trim() ? toNumber(manualBuyPrice) : null;
    const sellPrice = manualSellPrice.trim() ? toNumber(manualSellPrice) : null;
    const normalizedManualSize = normalizeAifSizeValue(manualSize);

    const manualRow: AifParsedRow = {
      rowNo: nextRowNo,
      raw: {
        source: "manual",
        productCode: manualProductCode,
        snCod: manualSnCod,
        sn_cod: manualSnCod,
        customsTariffCode: manualCustomsTariffCode,
        customs_tariff_code: manualCustomsTariffCode,
        tariffCode: manualCustomsTariffCode,
        tariff_code: manualCustomsTariffCode,
        hsCode: manualCustomsTariffCode,
        hs_code: manualCustomsTariffCode,
        title: manualTitle,
        barcode: manualBarcode,
        imageUrl: manualImageUrl,
        image_url: manualImageUrl,
        descriptionRo: manualDescription,
        description_ro: manualDescription,
        descriere: manualDescription,
        material: manualMaterial,
        composition: manualMaterial,
        productType: manualProductType,
        product_type: manualProductType,
        parentCategoryCode,
        parentCategoryName: parentCategory ? categoryLabel(parentCategory) : "",
        subCategoryCode,
        subCategoryName: subCategoryCode ? (manualSubCategory ? categoryLabel(manualSubCategory) : "") : "",
        brandCode,
        categoryCode,
        gender,
        colorName: manualColorName,
        colorCode: manualColorCode,
        size: normalizedManualSize,
        qty,
        buyPrice,
        sellPrice,
        sellPriceCurrencyMode,
        sellPriceCurrency: sellPriceSourceCurrency,
        sellPriceIsRon: sellPriceSourceIsRon,
        sellPriceIncludesTva: salesPriceIncludesTva,
        salesTvaRate: salesTvaRate.trim() ? toNumber(salesTvaRate) : 0,
      },
      normalized: {
        supplierProductCode: manualProductCode.trim(),
        modelCode: manualProductCode.trim(),
        snCod: manualSnCod.trim(),
        sn_cod: manualSnCod.trim(),
        customsTariffCode: manualCustomsTariffCode.trim(),
        customs_tariff_code: manualCustomsTariffCode.trim(),
        tariffCode: manualCustomsTariffCode.trim(),
        tariff_code: manualCustomsTariffCode.trim(),
        hsCode: manualCustomsTariffCode.trim(),
        hs_code: manualCustomsTariffCode.trim(),
        titleRo: manualTitle.trim(),
        barcode: manualBarcode.trim(),
        imageUrl: manualImageUrl.trim(),
        image_url: manualImageUrl.trim(),
        descriptionRo: manualDescription.trim(),
        description_ro: manualDescription.trim(),
        material: manualMaterial.trim(),
        composition: manualMaterial.trim(),
        productType: manualProductType.trim(),
        product_type: manualProductType.trim(),
        parentCategoryCode,
        parentCategoryName: parentCategory ? categoryLabel(parentCategory) : "",
        subCategoryCode,
        subCategoryName: subCategoryCode ? (manualSubCategory ? categoryLabel(manualSubCategory) : "") : "",
        brandCode,
        brandName: brand?.name || "",
        categoryCode,
        categoryName: category ? categoryLabel(category) : "",
        gender,
        colorName: manualColorName.trim(),
        colorCode: manualColorCode.trim(),
        size: normalizedManualSize,
        qty,
        buyPrice,
        sellPrice,
        sellPriceCurrencyMode,
        sellPriceCurrency: sellPriceSourceCurrency,
        sellPriceIsRon: sellPriceSourceIsRon,
        sellPriceIncludesTva: salesPriceIncludesTva,
        salesTvaRate: salesTvaRate.trim() ? toNumber(salesTvaRate) : 0,
        source: "manual",
      },
    };

    const mappedManualRow = rowWithSalesMeta(applyProductCodeAndBrandColor(manualRow));
    const errors = aifRowErrors(mappedManualRow, sizeTypes, brandSizeCodes);
    const rowIndex = rows.length;
    const key = rowKey(mappedManualRow, rowIndex);
    setRows((current) => [...current, mappedManualRow]);
    setFileName((current) => current || "Manuális bevételezés");
    setIncomingInputMode("manual");
    setIncomingStep("manual");
    setWorkbenchOpen(false);
    setPreviewLimit((current) => Math.max(current, rowIndex + 1));
    setApprovedRows((current) => ({ ...current, [key]: errors.length === 0 }));
    resetManualRowForm();
    setMessage(errors.length ? "A manuális sor hozzáadva előnézethez, de javítás szükséges." : "A manuális sor hozzáadva és mentésre kijelölve.");
  }

  async function loadMeta() {
    const [meta, typeData, currencyData] = await Promise.all([
      apiAifMeta(),
      apiAifListLocationTypes({ includeInactive: true }),
      apiAifListCurrencies({ includeInactive: true }),
    ]);
    const activeSuppliers = meta.suppliers.filter((x) => x.is_active);
    const activeLocations = meta.locations.filter((x) => x.is_active);
    const allTypes = typeData.items || meta.locationTypes || [];
    const activeTypes = allTypes.filter((x) => x.is_active);
    setSuppliers(activeSuppliers);
    setLocations(activeLocations);
    setLocationTypes(allTypes);
    setCurrencies(currencyData.items || meta.currencies || []);
    setBrands((meta as any).brands || []);
    setCategories((meta as any).categories || []);
    setGenderTypes((meta as any).genderTypes || []);
    setSupplierBrands((meta as any).supplierBrands || []);
    setBrandColorCodes((meta as any).brandColorCodes || []);
    setColorTypes((meta as any).colorTypes || []);
    setSizeTypes((meta as any).sizeTypes || []);
    setBrandSizeCodes((meta as any).brandSizeCodes || []);
    setNewLocationType((current) => {
      if (current && activeTypes.some((t) => t.code === current)) return current;
      return activeTypes[0]?.code || "warehouse";
    });
    setSupplierId((current) => (current && activeSuppliers.some((s) => s.id === current) ? current : ""));
    setLocationId((current) => (current && activeLocations.some((l) => l.id === current) ? current : ""));
    setCurrencyCode((current) => {
      const active = (currencyData.items || meta.currencies || []).filter((c) => c.is_active);
      if (current && active.some((c) => c.code === current)) return current;
      return "";
    });
  }

  function receptionHasImportHistory(item: AifReceptionSummary) {
    const x: any = item || {};
    return (
      Number(x.import_batches || 0) > 0 ||
      Number(x.import_rows || 0) > 0 ||
      Number(x.committed_rows || 0) > 0 ||
      Number(x.remaining_rows || 0) > 0 ||
      Number(x.error_rows || 0) > 0
    );
  }

  async function loadBatches() {
    const data = await apiAifListImportBatches(25);
    setBatches(data.items || []);
  }

  async function loadReceptions() {
    const data = await apiAifListReceptions({ limit: 25 });
    const next = (data.items || []).filter(receptionHasImportHistory);
    setReceptions(next);

    setReceptionPickerId((current) =>
      current && !next.some((r) => String(r.id) === String(current)) ? "" : current
    );

    return next;
  }


  function purchaseOrderLineToIncomingRow(
    line: NonNullable<AifPurchaseOrderDetail["lines"]>[number],
    index: number,
    order: AifPurchaseOrderDetail["item"]
  ): AifParsedRow {
    const remainingQty = Math.max(0, toNumber(line.qty_remaining ?? (toNumber(line.qty_ordered) - toNumber(line.qty_received))));
    const supplierCode = firstNonEmptyText(line.supplier_product_code, line.model_code, line.barcode, `PO-${index + 1}`);
    const normalized = {
      purchaseOrderId: order.id,
      purchase_order_id: order.id,
      purchaseOrderNumber: order.order_number,
      purchase_order_number: order.order_number,
      purchaseOrderLineId: line.id,
      purchase_order_line_id: line.id,
      orderedQty: toNumber(line.qty_ordered),
      ordered_qty: toNumber(line.qty_ordered),
      remainingQty,
      remaining_qty: remainingQty,
      supplierProductCode: supplierCode,
      supplierVariantCode: line.supplier_variant_code || "",
      modelCode: firstNonEmptyText(line.model_code, line.supplier_product_code, line.barcode, supplierCode),
      titleRo: line.product_title || "",
      brandName: line.brand_name || "",
      categoryName: line.category_name || "",
      productType: line.product_type || line.category_name || "",
      gender: line.gender || "",
      descriptionRo: line.description_ro || "",
      material: line.material || "",
      imageUrl: line.image_url || "",
      barcode: line.barcode || "",
      snCod: line.sn_cod || "",
      sn_cod: line.sn_cod || "",
      customsTariffCode: line.customs_tariff_code || "",
      customs_tariff_code: line.customs_tariff_code || "",
      colorName: line.color_name || "",
      colorCode: line.color_code || "",
      size: normalizeAifSizeValue(line.size || ""),
      qty: remainingQty,
      buyPrice: line.unit_price === null || line.unit_price === undefined ? null : toNumber(line.unit_price),
      sellPrice: line.sell_price === null || line.sell_price === undefined ? null : toNumber(line.sell_price),
      source: "purchase_order",
    } as Record<string, unknown>;
    return {
      rowNo: index + 1,
      raw: {
        source: "purchase_order",
        purchaseOrderId: order.id,
        purchaseOrderNumber: order.order_number,
        purchaseOrderLineId: line.id,
      },
      normalized,
    };
  }

  async function applyPurchaseOrderToIncoming(detail: AifPurchaseOrderDetail) {
    const remainingLines = (detail.lines || []).filter((line) =>
      Math.max(0, toNumber(line.qty_remaining ?? (toNumber(line.qty_ordered) - toNumber(line.qty_received)))) > 0
    );
    if (!remainingLines.length) {
      setPurchaseOrderSource(detail);
      setPurchaseOrderPickerOpen(false);
      setMessage(`${detail.item.order_number}: nincs hátralévő bevételezendő terméksor.`);
      return false;
    }

    startNewEmptyReception(false);
    setPurchaseOrderSource(detail);
    setSupplierId(String(detail.item.supplier_id || ""));
    setLocationId(String(detail.item.target_location_id || ""));
    setCurrencyCode(String(detail.item.currency_code || "RON"));
    setSellPriceCurrencyMode(String(detail.item.currency_code || "RON").toUpperCase() === "RON" ? "ron" : "invoice");
    setInvoiceDate(todayIso());
    setReceptionDate(todayIso());
    setNote(`Kapcsolódó beszerzési rendelés: ${detail.item.order_number}${detail.item.note ? ` • ${detail.item.note}` : ""}`);
    setFileName(`Rendelés ${detail.item.order_number}`);
    const orderRows = remainingLines.map((line, index) => purchaseOrderLineToIncomingRow(line, index, detail.item));
    setRows(orderRows);
    const selected: Record<string, boolean> = {};
    orderRows.forEach((row, index) => { selected[rowKey(row, index)] = true; });
    setApprovedRows(selected);
    setPreviewLimit(Math.max(25, orderRows.length));
    setIncomingInputMode("manual");
    setIncomingStep("reception");
    setManualRowsOpen(false);
    setWorkbenchOpen(false);
    setPurchaseOrderPickerOpen(false);
    setMessage(`${detail.item.order_number} betöltve: ${remainingLines.length} terméksor, ${remainingLines.reduce((sum, line) => sum + Math.max(0, toNumber(line.qty_remaining ?? (toNumber(line.qty_ordered) - toNumber(line.qty_received)))), 0)} db vár bevételezésre. Töltsd ki a számla adatait, majd mentsd a receptiót.`);
    return true;
  }

  async function loadReceivablePurchaseOrders() {
    setPurchaseOrderPickerLoading(true);
    setPurchaseOrderPickerError("");
    try {
      const response = await apiAifListPurchaseOrders({ limit: 1000 });
      const next = (response.items || [])
        .filter((order) => ["ordered", "partially_received"].includes(String(order.status || "")))
        .filter((order) => toNumber(order.remaining_qty) > 0)
        .sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
      setReceivablePurchaseOrders(next);
      return next;
    } catch (error: any) {
      setPurchaseOrderPickerError(error?.message || "A bevételezhető rendelések nem tölthetők be.");
      return [];
    } finally {
      setPurchaseOrderPickerLoading(false);
    }
  }

  async function openPurchaseOrderPicker() {
    setPurchaseOrderPickerOpen(true);
    await loadReceivablePurchaseOrders();
  }

  async function choosePurchaseOrderForReception(orderId: string) {
    setPurchaseOrderPickerLoading(true);
    setPurchaseOrderPickerError("");
    try {
      const detail = await apiAifGetPurchaseOrder(orderId);
      await applyPurchaseOrderToIncoming(detail);
    } catch (error: any) {
      setPurchaseOrderPickerError(error?.message || "A rendelés nem tölthető be bevételezéshez.");
    } finally {
      setPurchaseOrderPickerLoading(false);
    }
  }

  async function loadPurchaseOrderHandoff() {
    if (typeof window === "undefined") return false;
    let stored = "";
    try { stored = window.sessionStorage.getItem(AIF_PURCHASE_ORDER_RECEIVE_HANDOFF_KEY) || ""; } catch {}
    if (!stored) return false;
    let orderId = stored;
    try {
      const parsed = JSON.parse(stored);
      orderId = String(parsed?.id || parsed?.purchaseOrderId || parsed?.orderId || stored).trim();
    } catch {}
    if (!orderId) return false;

    const detail = await apiAifGetPurchaseOrder(orderId);
    await applyPurchaseOrderToIncoming(detail);
    return true;
  }

  async function reloadAll() {
    setBusy(true);
    setMessage("");
    try {
      await loadMeta();
      const [, nextReceptions] = await Promise.all([loadBatches(), loadReceptions()]);
      setRows((current) => (current.length ? normalizeImportedRowsWithMeta(current) : current));
      const rid = selectedReceptionId || receptionPickerId;
      if (rid && nextReceptions.some((r) => String(r.id) === String(rid))) {
        const detail = await apiAifGetReception(rid);
        fillReceptionHeader(detail, { clearDraftRows: false });
      }
      setMessage("Lista és törzsadatok frissítve. Az újonnan felvett színek, főkategóriák / alkategóriák, standard méretek és márkaméretek is újraellenőrizve.");
    } catch (e: any) {
      setMessage(e?.message || "Az újratöltés nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadMeta();
        if (alive) {
          await Promise.all([loadBatches(), loadReceptions()]);
          const loadedPurchaseOrder = await loadPurchaseOrderHandoff();
          if (!loadedPurchaseOrder) startNewEmptyReception(false);
        }
      } catch (e: any) {
        if (alive) setMessage(e.message || "Nem sikerült betölteni az adatokat.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onFileChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const parsed = await readAifWorkbookWithAnalysis(file, selectedSupplier);
      const analysisWithSnCod = withSnCodWorkbookAnalysis(parsed.analysis);
      const normalizedRows = normalizeImportedRowsWithMeta(applyAifColumnMappingWithSnCod(parsed.rows, analysisWithSnCod, selectedSupplier));
      setFileName(file.name);
      setRows(normalizedRows);
      setWorkbench(analysisWithSnCod);
      setIncomingInputMode("import");
      setSellPriceCurrencyMode(isRonCurrency ? "ron" : "invoice");
      setIncomingStep("import");
      setWorkbenchOpen(true);
      setPreviewLimit(25);
      setApprovedRows({});
      const barcodeConflicts = findImportBarcodeConflicts(normalizedRows);
      setMessage(
        barcodeConflicts.length
          ? `${normalizedRows.length} sor beolvasva. ${importBarcodeConflictMessage(barcodeConflicts)}`
          : `${normalizedRows.length} sor beolvasva előnézetre. Importáláshoz előbb jelöld ki a valóban használható sorokat.`
      );
    } catch (e: any) {
      setRows([]);
      setWorkbench(null);
      setApprovedRows({});
      setMessage(e.message || "Nem sikerült beolvasni az XLS/XLSX fájlt.");
    } finally {
      setBusy(false);
    }
  }

  function approvedRowsFrom(sourceRows: AifParsedRow[]) {
    return sourceRows.filter((row, index) => approvedRows[rowKey(row, index)]);
  }

  function createInvoiceDifferencePrompt(sourceRows: AifParsedRow[]): InvoiceDifferencePrompt | null {
    if (!invoiceGrossProvided || !tvaMode) return null;
    const selectedRows = approvedRowsFrom(sourceRows);
    if (!selectedRows.length) return null;

    const currentNewRowsValue = selectedRows.reduce((sum, row) => {
      const normalized = row.normalized || {};
      return sum + toNumber(normalized.qty) * toNumber(normalized.buyPrice);
    }, 0);
    const currentGoodsValue = savedReceptionGoodsValue + currentNewRowsValue;
    const targetGoodsValue = invoiceTargetGoodsValue;
    const targetNewRowsValue = targetGoodsValue - savedReceptionGoodsValue;
    const difference = targetGoodsValue - currentGoodsValue;
    const adjustmentFactor = currentNewRowsValue > 0 ? targetNewRowsValue / currentNewRowsValue : 0;
    const extremeDifference = adjustmentFactor > 0 && (adjustmentFactor < 0.01 || adjustmentFactor > 100);
    const canDistribute = Boolean(
      Math.abs(difference) > 0.01 &&
      currentNewRowsValue > 0 &&
      targetNewRowsValue > 0 &&
      adjustmentFactor > 0 &&
      !extremeDifference
    );

    return {
      currentGoodsValue,
      targetGoodsValue,
      targetNewRowsValue,
      difference,
      adjustmentFactor,
      canDistribute,
      extremeDifference,
      selectedRowsCount: selectedRows.length,
    };
  }

  function distributeDifferenceAcrossApprovedRows(sourceRows: AifParsedRow[], prompt: InvoiceDifferencePrompt) {
    const selectedIndexes = sourceRows
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => approvedRows[rowKey(row, index)])
      .filter(({ row }) => toNumber(row.normalized?.qty) > 0 && toNumber(row.normalized?.buyPrice) >= 0);

    if (!selectedIndexes.length || !prompt.canDistribute) return null;

    const adjustedPrices = new Map<number, number>();
    for (const { row, index } of selectedIndexes) {
      const oldPrice = toNumber(row.normalized?.buyPrice);
      adjustedPrices.set(index, roundMoney(oldPrice * prompt.adjustmentFactor, 2));
    }

    const adjustedRowsValue = () => selectedIndexes.reduce((sum, { row, index }) => {
      return sum + toNumber(row.normalized?.qty) * toNumber(adjustedPrices.get(index));
    }, 0);

    let residual = roundMoney(prompt.targetNewRowsValue - adjustedRowsValue(), 2);
    if (Math.abs(residual) >= 0.01) {
      const residualTarget = selectedIndexes
        .slice()
        .sort((a, b) => {
          const aQty = toNumber(a.row.normalized?.qty);
          const bQty = toNumber(b.row.normalized?.qty);
          const aQtyOne = Math.abs(aQty - 1) < 0.000001 ? 1 : 0;
          const bQtyOne = Math.abs(bQty - 1) < 0.000001 ? 1 : 0;
          if (aQtyOne !== bQtyOne) return bQtyOne - aQtyOne;
          const aValue = aQty * toNumber(a.row.normalized?.buyPrice);
          const bValue = bQty * toNumber(b.row.normalized?.buyPrice);
          return bValue - aValue;
        })[0];

      if (residualTarget) {
        const qty = Math.max(0.000001, toNumber(residualTarget.row.normalized?.qty));
        const currentPrice = toNumber(adjustedPrices.get(residualTarget.index));
        const precision = Math.abs(qty - 1) < 0.000001 ? 2 : 6;
        adjustedPrices.set(residualTarget.index, Math.max(0, roundMoney(currentPrice + residual / qty, precision)));
      }
    }

    residual = prompt.targetNewRowsValue - adjustedRowsValue();
    if (Math.abs(residual) > 0.000001) {
      const fallback = selectedIndexes[0];
      if (fallback) {
        const qty = Math.max(0.000001, toNumber(fallback.row.normalized?.qty));
        const currentPrice = toNumber(adjustedPrices.get(fallback.index));
        adjustedPrices.set(fallback.index, Math.max(0, roundMoney(currentPrice + residual / qty, 8)));
      }
    }

    return sourceRows.map((row, index) => {
      if (!adjustedPrices.has(index)) return row;
      return {
        ...row,
        normalized: {
          ...(row.normalized || {}),
          buyPrice: adjustedPrices.get(index),
        },
      } as AifParsedRow;
    });
  }

  async function performSaveDraft(sourceRows: AifParsedRow[], differenceMode?: InvoiceDifferenceMode) {
    const selectedRows = approvedRowsFrom(sourceRows);
    const selectedProblems = selectedRows.filter((row) => aifRowErrors(row, sizeTypes, brandSizeCodes).length > 0).length;
    const selectedBarcodeConflicts = findImportBarcodeConflicts(selectedRows);
    const selectedGoodsValue = selectedRows.reduce((sum, row) => {
      const normalized = row.normalized || {};
      return sum + toNumber(normalized.qty) * toNumber(normalized.buyPrice);
    }, 0);
    const selectedQty = selectedRows.reduce((sum, row) => sum + toNumber(row.normalized?.qty), 0);
    const selectedCount = selectedRows.length;
    const localExcludedCount = Math.max(0, sourceRows.length - selectedCount);
    const localComputedReception = calculateReceptionAmounts(
      savedReceptionGoodsValue + selectedGoodsValue,
      shippingValue,
      tvaMode,
      vatRateValue
    );

    if (!selectedCount) {
      setMessage("Nincs kijelölt sor. Beolvasás után csak a kijelölt sorok menthetők importként.");
      return;
    }
    if (selectedProblems > 0) {
      setMessage("A kijelölt sorok között hibás vagy hiányos adat van. Javítás vagy kizárás után menthető.");
      return;
    }
    if (selectedBarcodeConflicts.length) {
      setMessage(importBarcodeConflictMessage(selectedBarcodeConflicts));
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const rowsForSave = selectedRows
        .map(rowWithSalesMeta)
        .map(compactAifImportRowForSave);
      const chunks = buildAifImportRowChunks(rowsForSave);
      if (!chunks.length) {
        setMessage("Nincs menthető terméksor. Jelölj ki legalább egy hibátlan sort.");
        return;
      }

      const basePayload: any = {
        supplierId,
        targetLocationId: locationId,
        sourceFileName: fileName || "Manuális bevételezés",
        sourceFormat: purchaseOrderSource ? "purchase_order" : (fileName && fileName !== "Manuális bevételezés" ? "xls" : "manual"),
        purchaseOrderId: purchaseOrderSource?.item.id || null,
        note,
        reception: {
          invoiceNumber,
          invoiceDate,
          receptionDate,
          currencyCode,
          exchangeRateToRon: exchangeRateToRonForPayload,
          tvaMode,
          tvaRate: vatRateValue,
          shippingCost: shippingValue,
          goodsValue: selectedGoodsValue,
          invoiceNet: localComputedReception.net,
          invoiceVat: localComputedReception.vat,
          invoiceGross: invoiceGrossValue,
          lineCount: selectedCount,
          totalQty: selectedQty,
          note,
          purchaseOrderId: purchaseOrderSource?.item.id || null,
          salesTvaRate: salesTvaRate.trim() ? toNumber(salesTvaRate) : 0,
          salesPriceIncludesTva,
          sellPriceCurrencyMode,
          sellPriceCurrency: sellPriceSourceCurrency,
          sellPriceIsRon: sellPriceSourceIsRon,
        },
      };
      if (selectedReceptionId) basePayload.receptionId = selectedReceptionId;

      setMessage(`Mentés folyamatban: ${selectedCount} sor ${chunks.length} kisebb csomagban.`);
      const saved = await apiAifCreateFullImportBatch({ ...basePayload, rows: chunks[0] });
      let savedRowCount = Number(saved.rowCount || chunks[0].length);
      let savedErrorCount = Number(saved.errorCount || 0);

      for (let chunkIndex = 1; chunkIndex < chunks.length; chunkIndex++) {
        const alreadySent = chunks.slice(0, chunkIndex).reduce((sum, chunk) => sum + chunk.length, 0);
        setMessage(`Mentés folyamatban: ${alreadySent} / ${selectedCount} sor elküldve. Csomag ${chunkIndex + 1} / ${chunks.length}.`);
        const part = await apiAifAppendImportRows(saved.id, chunks[chunkIndex]);
        savedRowCount = Number(part.rowCount || savedRowCount + chunks[chunkIndex].length);
        savedErrorCount = Number(part.errorCount || 0);
      }

      clearImportedRows();
      resetManualRowForm();
      await Promise.all([loadBatches(), loadReceptions()]);
      const savedReceptionId = selectedReceptionId || saved.receptionId;
      if (savedReceptionId) {
        const detail = await apiAifGetReception(savedReceptionId);
        fillReceptionHeader(detail, { clearDraftRows: false });
      }
      setIncomingStep("review");
      if (purchaseOrderSource && typeof window !== "undefined") {
        try { window.sessionStorage.removeItem(AIF_PURCHASE_ORDER_RECEIVE_HANDOFF_KEY); } catch {}
      }
      const differenceText = differenceMode === "distributed"
        ? " A számlaeltérés arányosan szét lett osztva a kijelölt vételárak között."
        : differenceMode === "kept"
          ? " A vételárak változatlanul maradtak a számlaeltérés ellenére."
          : "";
      setMessage(`${selectedReceptionId ? "Receptió folytatása mentve" : "Új receptió mentve"}: ${savedRowCount} kijelölt sor, ellenőrzendő sor: ${savedErrorCount}. Kizárt sorok: ${localExcludedCount}. ${chunks.length > 1 ? `${chunks.length} kisebb csomagban mentve.` : ""}${differenceText}`);
    } catch (e: any) {
      const isPayloadTooLarge = Number(e?.status || e?.statusCode || 0) === 413 || /413|payload too large|túl nagy|tul nagy/i.test(String(e?.message || ""));
      setMessage(isPayloadTooLarge
        ? "A mentés még így is túl nagy csomagot ért el. A sorok már darabolva mennek, ezért ilyenkor jellemzően egy extrém hosszú leírás vagy beágyazott adat okozza. Próbáld a problémás sort javítani vagy szólj, és tovább szűkítjük a csomagméretet."
        : e.message || "Nem sikerült menteni az importot.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!supplierId || !locationId) {
      setIncomingStep("reception");
      setMessage(`A receptió kötelező mezői hiányoznak: ${missingReceptionFieldLabels.join(", ") || "beszállító / cél hely"}.`);
      return;
    }
    if (!rows.length) {
      setIncomingStep("source");
      setMessage("Nincs menthető terméksor. Válassz XLS importot vagy adj hozzá manuális sort.");
      return;
    }
    if (!approvedRowList.length) {
      setMessage("Nincs kijelölt sor. Beolvasás után csak a kijelölt sorok menthetők importként.");
      return;
    }
    if (approvedProblems > 0) {
      setMessage("A kijelölt sorok között hibás vagy hiányos adat van. Javítás vagy kizárás után menthető.");
      return;
    }
    if (approvedBarcodeConflicts.length) {
      setMessage(importBarcodeConflictMessage(approvedBarcodeConflicts));
      return;
    }
    if (!receptionHeaderReady) {
      setIncomingStep("reception");
      setMessage(`A receptió kötelező mezőit ki kell tölteni: ${missingReceptionFieldLabels.join(", ") || "hiányzó adat"}.`);
      return;
    }

    const prompt = createInvoiceDifferencePrompt(rows);
    if (prompt && Math.abs(prompt.difference) > 0.01) {
      setInvoiceDifferencePrompt(prompt);
      return;
    }

    await performSaveDraft(rows);
  }

  async function keepInvoicePricesAndSave() {
    setInvoiceDifferencePrompt(null);
    await performSaveDraft(rows, "kept");
  }

  async function distributeInvoiceDifferenceAndSave() {
    const prompt = invoiceDifferencePrompt;
    if (!prompt) return;
    const adjustedRows = distributeDifferenceAcrossApprovedRows(rows, prompt);
    if (!adjustedRows) {
      setInvoiceDifferencePrompt(null);
      setMessage("A különbözet nem osztható szét biztonságosan. Ellenőrizd a számla végösszegét, a pénznemet, az árfolyamot és a kijelölt sorok vételárát.");
      return;
    }
    setRows(adjustedRows);
    setInvoiceDifferencePrompt(null);
    await performSaveDraft(adjustedRows, "distributed");
  }

  async function commitBatch(batch: AifImportBatchSummary) {
    if (!batch?.id) return;
    if (Number(batch.row_count || 0) <= 0) {
      setMessage("A készletre vétel nem indítható: ehhez az importhoz nincs mentett terméksor.");
      return;
    }
    if (Number(batch.error_count || 0) > 0) {
      setMessage("A készletre vétel nem indítható: az importban ellenőrzendő vagy hibás sor van.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const committedReceptionId = String((batch as any).reception_id || (batch as any).receptionId || selectedReceptionId || receptionPickerId || "").trim();
      const result = await apiAifCommitImportBatch(batch.id);
      const committedRows = Array.isArray((result as any).committedRowResults)
        ? (result as any).committedRowResults
        : Array.isArray((result as any).committedRows)
          ? (result as any).committedRows
          : [];
      const committedVariantIds = Array.isArray((result as any).variantIds)
        ? (result as any).variantIds
        : Array.isArray((result as any).committedVariantIds)
          ? (result as any).committedVariantIds
          : committedRows.map((row: any) => row?.variantId || row?.variant_id).filter(Boolean);
      const committedTotalQty = Number((result as any).committedTotalQty || committedRows.reduce((sum: number, row: any) => sum + toNumber(row?.qty), 0) || 0);
      notifyWarehouseShowAllAfterIncoming({
        importBatchId: batch.id,
        receptionId: (batch as any).reception_id || selectedReceptionId || null,
        committed: (result as any).committed ?? null,
        failedCount: (result as any).failedCount ?? null,
        variantIds: Array.from(new Set(committedVariantIds.map((id: unknown) => String(id || "").trim()).filter(Boolean))),
        committedRows: committedRows.length || Number((result as any).committedRows || (result as any).committed || 0),
        committedRowResults: committedRows,
        rowCount: committedRows.length || Number((result as any).committed || 0),
        totalQty: committedTotalQty || null,
      });
      await Promise.all([loadBatches(), loadReceptions()]);
      if (committedReceptionId) {
        try {
          const detail = await apiAifGetReception(committedReceptionId);
          fillReceptionHeader(detail, { clearDraftRows: false });
          setIncomingStep("review");
        } catch {
          // A készletre vétel már sikerült. Ha a friss részletlista nem jön vissza, a következő frissítés behozza.
        }
      }
      const failedCount = Number((result as any).failedCount || (result as any).failedRows?.length || 0);
      if (failedCount > 0) {
        const firstError = (result as any).failedRows?.[0]?.error || (result as any).warning || "Néhány sor nem került készletre.";
        setMessage(`Készletre vétel részben kész. Sikeres: ${result.committed ?? 0}, hibás: ${failedCount}. ${firstError}`);
      } else {
        setMessage(`Készletre vétel kész. Létrehozott vagy frissített variánsok: ${result.committed ?? 0}.`);
      }
    } catch (e: any) {
      await Promise.all([loadBatches(), loadReceptions()]).catch(() => undefined);
      setMessage(e.message || "A készletre vétel nem sikerült. Ellenőrizd az import sorokat.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteImportBatchHistory() {
    if (!deleteImportBatchTarget?.id) return;
    const target = deleteImportBatchTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifDeleteImportBatchHistory(target.id);
      setDeleteImportBatchTarget(null);

      const [, nextReceptions] = await Promise.all([loadBatches(), loadReceptions()]);
      const targetReceptionId = String(target.reception_id || "");
      const receptionStillVisible = Boolean(
        targetReceptionId && nextReceptions.some((r) => String(r.id) === targetReceptionId)
      );

      if (targetReceptionId && !receptionStillVisible) {
        setReceptions((current) => current.filter((r) => String(r.id) !== targetReceptionId));
        setReceptionPickerId((current) => (String(current) === targetReceptionId ? "" : current));
      }

      if (targetReceptionId && String(selectedReceptionId) === targetReceptionId) {
        if (!receptionStillVisible) {
          startNewEmptyReception(false);
        } else {
          try {
            const detail = await apiAifGetReception(targetReceptionId);
            fillReceptionHeader(detail);
          } catch {
            startNewEmptyReception(false);
          }
        }
      }

      setMessage(
        receptionStillVisible
          ? `Import előzmény törölve. A kapcsolódó receptióban maradt másik import sor. Termék/készlet nem lett módosítva. Törölt sorok: ${result.deletedRows}.`
          : `Import előzmény törölve. A kapcsolódó receptió kikerült a kiválasztási listából. Termék/készlet nem lett módosítva. Törölt sorok: ${result.deletedRows}.`
      );
    } catch (e: any) {
      setMessage(e.message || "Az import előzmény törlése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }


  async function createLocation() {
    if (!newLocationName.trim()) {
      setMessage("A cél hely neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiAifCreateLocation({ name: newLocationName, locationType: newLocationType });
      setNewLocationName("");
      setNewLocationType(locationTypeOptions[0]?.code || "warehouse");
      await loadMeta();
      setLocationId(created.item.id);
      setMessage("Cél hely mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a cél helyet.");
    } finally {
      setBusy(false);
    }
  }

  async function createLocationType() {
    if (!newLocationTypeName.trim()) {
      setMessage("A típus neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiAifCreateLocationType({ name: newLocationTypeName });
      setNewLocationTypeName("");
      await loadMeta();
      setNewLocationType(created.item.code);
      setMessage("Típus mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a típust.");
    } finally {
      setBusy(false);
    }
  }

  function startEditLocationType(type: AifLocationType) {
    setDeleteLocationTypeTarget(null);
    setEditingLocationTypeId(type.id);
    setEditLocationTypeName(type.name || "");
  }

  function cancelEditLocationType() {
    setEditingLocationTypeId("");
    setEditLocationTypeName("");
  }

  async function saveLocationTypeEdit() {
    if (!editingLocationTypeId) return;
    if (!editLocationTypeName.trim()) {
      setMessage("A típus neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateLocationType(editingLocationTypeId, { name: editLocationTypeName });
      await loadMeta();
      cancelEditLocationType();
      setMessage("Típus módosítva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a típust.");
    } finally {
      setBusy(false);
    }
  }

  async function activateLocationType(type: AifLocationType) {
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateLocationType(type.id, { is_active: true });
      await loadMeta();
      setMessage("Típus aktiválva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült aktiválni a típust.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteLocationType() {
    if (!deleteLocationTypeTarget) return;
    const target = deleteLocationTypeTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifDeleteLocationType(target.id);
      setDeleteLocationTypeTarget(null);
      await loadMeta();
      setMessage(result.mode === "deleted" ? "Típus törölve." : "Típus inaktiválva, mert már használatban van.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a típust.");
    } finally {
      setBusy(false);
    }
  }

  function startEditLocation(location: AifLocation) {
    setDeleteLocationTarget(null);
    setEditingLocationId(location.id);
    setEditLocationName(location.name || "");
    setEditLocationType((location.location_type as LocationType) || "warehouse");
  }

  function cancelEditLocation() {
    setEditingLocationId("");
    setEditLocationName("");
    setEditLocationType("warehouse");
  }

  async function saveLocationEdit() {
    if (!editingLocationId) return;
    if (!editLocationName.trim()) {
      setMessage("A cél hely neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiAifUpdateLocation(editingLocationId, {
        name: editLocationName,
        locationType: editLocationType,
      });
      await loadMeta();
      setLocationId((current) => current || updated.item.id);
      cancelEditLocation();
      setMessage("Cél hely módosítva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a cél helyet.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteLocation() {
    if (!deleteLocationTarget) return;
    const target = deleteLocationTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifDeleteLocation(target.id);
      setDeleteLocationTarget(null);
      await loadMeta();
      setMessage(result.mode === "deleted" ? "Cél hely törölve." : "Cél hely inaktiválva, mert már kapcsolódik hozzá adat.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a cél helyet.");
    } finally {
      setBusy(false);
    }
  }


  async function createCurrency() {
    const code = newCurrencyCode.trim().toUpperCase();
    if (!code || !newCurrencyName.trim()) {
      setMessage("A pénznem kódja és neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiAifCreateCurrency({ code, name: newCurrencyName, symbol: newCurrencySymbol });
      setNewCurrencyCode("");
      setNewCurrencyName("");
      setNewCurrencySymbol("");
      await loadMeta();
      handleCurrencyCodeChange(String(created.item.code || ""));
      setMessage("Pénznem mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a pénznemet.");
    } finally {
      setBusy(false);
    }
  }

  function startEditCurrency(currency: AifCurrency) {
    setDeleteCurrencyTarget(null);
    setEditingCurrencyCode(currency.code);
    setEditCurrencyName(currency.name || "");
    setEditCurrencySymbol(currency.symbol || "");
  }

  function cancelEditCurrency() {
    setEditingCurrencyCode("");
    setEditCurrencyName("");
    setEditCurrencySymbol("");
  }

  async function saveCurrencyEdit() {
    if (!editingCurrencyCode) return;
    if (!editCurrencyName.trim()) {
      setMessage("A pénznem neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateCurrency(editingCurrencyCode, { name: editCurrencyName, symbol: editCurrencySymbol });
      await loadMeta();
      cancelEditCurrency();
      setMessage("Pénznem módosítva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a pénznemet.");
    } finally {
      setBusy(false);
    }
  }

  async function activateCurrency(currency: AifCurrency) {
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateCurrency(currency.code, { is_active: true });
      await loadMeta();
      setMessage("Pénznem aktiválva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült aktiválni a pénznemet.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteCurrency() {
    if (!deleteCurrencyTarget) return;
    const target = deleteCurrencyTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifDeleteCurrency(target.code);
      setDeleteCurrencyTarget(null);
      await loadMeta();
      setMessage(result.mode === "deleted" ? "Pénznem törölve." : "Pénznem inaktiválva, mert már használatban van.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a pénznemet.");
    } finally {
      setBusy(false);
    }
  }


  async function saveOpenedReceptionHeader() {
    if (!selectedReceptionId) {
      setMessage("Új receptió fejadatai a kijelölt sorok mentésekor jönnek létre.");
      return;
    }
    if (!invoiceNumber.trim() || !invoiceDate || !receptionDate || !currencyCode || (exchangeRateRequired && rateValue <= 0) || !tvaMode || (tvaRateRequired && vatRateValue <= 0) || !invoiceGrossProvided || invoiceGrossValue <= 0) {
      setMessage("A mentéshez töltsd ki a receptió kötelező mezőit. Külföldi pénznemnél az árfolyam is kell.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/aif/receptions/${encodeURIComponent(selectedReceptionId)}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reception: {
            invoiceNumber,
            invoiceDate,
            receptionDate,
            currencyCode,
            exchangeRateToRon: exchangeRateToRonForPayload,
            tvaMode,
            tvaRate: tvaMode === "no_tva" ? 0 : vatRateValue,
            shippingCost: shippingValue,
            invoiceGross: invoiceGrossValue,
            note,
            salesTvaRate: salesTvaRate.trim() ? toNumber(salesTvaRate) : 0,
            salesPriceIncludesTva,
            sellPriceCurrencyMode,
            sellPriceCurrency: sellPriceSourceCurrency,
            sellPriceIsRon: sellPriceSourceIsRon,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "A receptió fejadatai nem menthetők.");
      await Promise.all([loadReceptions(), loadBatches()]);
      await loadReceptionIntoWorkspace(selectedReceptionId);
      setMessage("A megnyitott receptió fejadatai mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A receptió fejadatai nem menthetők.");
    } finally {
      setBusy(false);
    }
  }

  async function exportOpenedReceptionCheckPdf() {
    if (!selectedReceptionId) {
      setMessage("Előbb válassz vagy ments receptiót az ellenőrző PDF-hez.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const detail = loadedReception || await apiAifGetReception(selectedReceptionId);
      openReceptionVerificationPdf(detail, activeCategories, activeGenderTypes);
    } catch (e: any) {
      setMessage(e?.message || "Az ellenőrző PDF export nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function goToReceptionStep() {
    setIncomingStep("reception");
  }

  function goToSourceStep() {
    if (!receptionHeaderReady) {
      setIncomingStep("reception");
      setMessage(`Előbb töltsd ki a kötelező receptió mezőket: ${missingReceptionFieldLabels.join(", ") || "hiányzó adat"}.`);
      return;
    }
    setIncomingStep("source");
    setMessage("");
  }

  function chooseIncomingMode(mode: IncomingInputMode) {
    if (!receptionHeaderReady) {
      goToSourceStep();
      return;
    }
    if (!mode) return;
    setIncomingInputMode(mode);
    setIncomingStep(mode);
    if (mode === "manual") {
      if (!rows.length) setSellPriceCurrencyMode("ron");
      setManualRowsOpen(true);
      setWorkbenchOpen(false);
    }
    if (mode === "import") {
      if (!rows.length) setSellPriceCurrencyMode(isRonCurrency ? "ron" : "invoice");
      setWorkbenchOpen(Boolean(workbench));
    }
    setMessage(mode === "import" ? "Import mód kiválasztva. Válaszd ki az XLS/XLSX fájlt, majd ellenőrizd az oszloptársítást." : "Manuális mód kiválasztva. Töltsd ki a terméksort, majd add hozzá az előnézethez.");
  }

  function workflowStepCard(step: IncomingWorkflowStep, done = false, locked = false) {
    if (locked) return wizardStepLocked;
    if (done) return wizardStepDone;
    if (incomingStep === step) return wizardStepActive;
    return wizardStepIdle;
  }

  function workflowStepBadge(step: IncomingWorkflowStep, done = false, locked = false) {
    if (locked) return "border-white/12 bg-white/5 text-white/45";
    if (done) return "border-white/80 bg-white text-[#208d8b] font-semibold shadow-[0_0_12px_rgba(255,255,255,0.28)]";
    if (incomingStep === step) return "border-[#67d4d1]/60 bg-[#208d8b] text-white";
    return "border-white/18 bg-[#303b4e] text-white/70";
  }

  function workflowStepTitleClass(done = false, locked = false) {
    if (locked) return "mt-2 text-sm uppercase tracking-[0.08em] text-white/45";
    return `mt-2 text-sm uppercase tracking-[0.08em] ${done ? "text-white font-semibold" : "text-white"}`;
  }

  function workflowStepDescriptionClass(done = false, locked = false) {
    if (locked) return "mt-1 text-xs leading-5 text-white/42";
    return `mt-1 text-xs leading-5 ${done ? "text-white/90" : "text-white/62"}`;
  }

  function workflowStepStatusClass(done = false, locked = false, warning = false) {
    if (locked) return "mt-2 text-xs text-white/42";
    if (done) return "mt-2 text-xs font-semibold text-white";
    if (warning) return "mt-2 text-xs text-red-100";
    return "mt-2 text-xs text-white/58";
  }

  function renderWorkflowWizard() {
    const summary: any = selectedReceptionSummary || {};
    const currentReceptionId = String(selectedReceptionId || summary.id || "").trim();
    const currentReceptionBatches = currentReceptionId
      ? batches.filter((batch: any) => String(batch.reception_id || batch.receptionId || "") === currentReceptionId)
      : [];
    const savedRowsInReception = Number(loadedReceptionRowTotals.total || 0);
    const committedRowsInReception = Number(loadedReceptionRowTotals.committed || 0);
    const summarySavedRows = Number(summary.line_count || summary.import_rows || summary.row_count || 0);
    const summaryCommittedRows = Number(summary.committed_rows || 0);
    const currentBatchRows = currentReceptionBatches.reduce((sum: number, batch: any) => sum + Number(batch.row_count || 0), 0);
    const currentCommittedBatchRows = currentReceptionBatches.reduce((sum: number, batch: any) =>
      String(batch.status || "").toLowerCase() === "committed" ? sum + Number(batch.row_count || 0) : sum,
      0
    );
    const savedRowsDone = savedRowsInReception > 0 || summarySavedRows > 0 || currentBatchRows > 0;
    const committedRowsDone = committedRowsInReception > 0 || summaryCommittedRows > 0 || currentCommittedBatchRows > 0 || String(summary.status || "").toLowerCase() === "committed";
    const sourceDone = incomingInputMode === "import" || incomingInputMode === "manual" || rows.length > 0 || savedRowsDone;
    const rowsDone = rows.length > 0 || savedRowsDone;
    const reviewDone = savedRowsDone || committedRowsDone;
    const rowsStepTarget: IncomingWorkflowStep = incomingInputMode === "manual" ? "manual" : incomingInputMode === "import" ? "import" : "review";
    const savedRowsCount = savedRowsInReception || summarySavedRows || currentBatchRows;
    const committedRowsCount = committedRowsInReception || summaryCommittedRows || currentCommittedBatchRows;
    const sourceStatus = incomingInputMode === "import" ? "XLS import" : incomingInputMode === "manual" ? "Manuális bevitel" : savedRowsDone ? "Mentett terméksorok" : "Nincs kiválasztva";
    const rowsStatus = rows.length
      ? `${rows.length} sor előnézetben`
      : committedRowsDone
        ? `${committedRowsCount || savedRowsCount} sor készletre véve`
        : savedRowsDone
          ? `${savedRowsCount} mentett sor`
          : "Még nincs sor";
    const reviewStatus = committedRowsDone
      ? `${committedRowsCount || savedRowsCount} sor készletre véve`
      : savedRowsDone
        ? `${savedRowsCount} mentett sor`
        : approvedCount
          ? `${approvedCount} kijelölt sor`
          : "Nincs kijelölt sor";
    return (
      <section className={card}>
        <SectionTitle
          icon={<FileSpreadsheet size={16} />}
          title="Bevételezés lépései"
          right={<span className="text-xs text-white/60">Előbb fejadatai, utána terméksorok</span>}
        />

        <div className="mt-3 grid gap-3 lg:grid-cols-4">
          <button className={`${workflowStepCard("reception", receptionHeaderReady)} text-left`} onClick={goToReceptionStep} type="button">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs ${workflowStepBadge("reception", receptionHeaderReady)}`}>1</span>
            <p className={workflowStepTitleClass(receptionHeaderReady)}>Receptió adatai</p>
            <p className={workflowStepDescriptionClass(receptionHeaderReady)}>Beszállító, cél hely, számla, pénznem és TVA.</p>
            <p className={workflowStepStatusClass(receptionHeaderReady, false, !receptionHeaderReady)}>
              {receptionHeaderReady ? "Kitöltve" : `${missingReceptionFieldLabels.length} mező hiányzik`}
            </p>
          </button>

          <button className={`${workflowStepCard("source", sourceDone, !receptionHeaderReady)} text-left`} onClick={goToSourceStep} disabled={!receptionHeaderReady} type="button">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs ${workflowStepBadge("source", sourceDone, !receptionHeaderReady)}`}>2</span>
            <p className={workflowStepTitleClass(sourceDone, !receptionHeaderReady)}>Sorforrás</p>
            <p className={workflowStepDescriptionClass(sourceDone, !receptionHeaderReady)}>Választás: XLS import vagy kézi terméksor.</p>
            <p className={workflowStepStatusClass(sourceDone, !receptionHeaderReady)}>{sourceStatus}</p>
          </button>

          <button className={`${workflowStepCard(rowsStepTarget, rowsDone, !receptionHeaderReady || !sourceDone)} text-left`} onClick={() => sourceDone ? setIncomingStep(rowsStepTarget) : goToSourceStep()} disabled={!receptionHeaderReady || !sourceDone} type="button">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs ${workflowStepBadge(rowsStepTarget, rowsDone, !receptionHeaderReady || !sourceDone)}`}>3</span>
            <p className={workflowStepTitleClass(rowsDone, !receptionHeaderReady || !sourceDone)}>Terméksorok</p>
            <p className={workflowStepDescriptionClass(rowsDone, !receptionHeaderReady || !sourceDone)}>Oszloptársítás, kézi sor, előnézet és kijelölés.</p>
            <p className={workflowStepStatusClass(rowsDone, !receptionHeaderReady || !sourceDone)}>{rowsStatus}</p>
          </button>

          <button className={`${workflowStepCard("review", reviewDone, !rowsDone)} text-left`} onClick={() => rowsDone ? setIncomingStep("review") : undefined} disabled={!rowsDone} type="button">
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs ${workflowStepBadge("review", reviewDone, !rowsDone)}`}>4</span>
            <p className={workflowStepTitleClass(reviewDone, !rowsDone)}>Mentés</p>
            <p className={workflowStepDescriptionClass(reviewDone, !rowsDone)}>Csak kijelölt, hibátlan sorok kerülnek receptióba.</p>
            <p className={workflowStepStatusClass(reviewDone, !rowsDone)}>{reviewStatus}</p>
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/14 bg-[#354153] p-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_2fr_auto] lg:items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-white/58">Aktuális receptió</p>
              <p className="mt-1 text-sm text-white">{selectedReceptionId ? "Meglévő receptió folytatása" : "Új üres bevételezés"}</p>
              {selectedReceptionSummary && (
                <p className="mt-1 text-xs text-white/62">
                  {selectedReceptionSummary.invoice_number || "Számlaszám nélkül"} • {receptionStatusLabel(selectedReceptionSummary.status)} • {moneyText(toNumber(selectedReceptionSummary.invoice_gross), selectedReceptionSummary.currency_code || "")}
                </p>
              )}
            </div>
            <label className={label}>
              Meglévő receptió folytatása
              <select className={`${selectInput} w-full`} value={receptionPickerId} onChange={(e) => setReceptionPickerId(e.target.value)}>
                <option style={mutedOptionStyle} value="">Válassz meglévő receptiót</option>
                {receptions.filter(receptionHasImportHistory).map((r) => (
                  <option style={optionStyle} key={r.id} value={r.id}>
                    {r.invoice_number || "Számlaszám nélkül"} • {r.supplier_name || "-"} • {receptionStatusLabel(r.status)} • {moneyText(toNumber(r.invoice_gross), r.currency_code || "")}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button className={primaryBtn} onClick={() => loadReceptionIntoWorkspace()} disabled={busy || !receptionPickerId} type="button">
                <Edit3 size={14} /> Betöltés
              </button>
              <button className={neutralBtn} onClick={startNewEmptyReception} disabled={busy} type="button">
                <Plus size={14} /> Új üres
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderSourceChooser() {
    return (
      <section className={card}>
        <SectionTitle
          icon={<UploadCloud size={16} />}
          title="Hogyan kerüljenek be a terméksorok?"
          right={<span className="text-xs text-white/60">A receptió fejadatai rendben vannak</span>}
        />

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <button className={sourceChoiceCard} onClick={() => chooseIncomingMode("import")} disabled={!receptionHeaderReady} type="button">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-300/35 bg-[#c90d22] text-white shadow-sm shadow-[#c90d22]/20">
                <FileSpreadsheet size={20} />
              </span>
              <div>
                <p className="text-base text-white">XLS / XLSX import</p>
                <p className="mt-1 text-sm leading-6 text-white/68">Fájl beolvasás, Excel oszlopok társítása, soronkénti előnézet és kijelölés.</p>
                <p className="mt-3 inline-flex rounded-full border border-white/14 bg-white/8 px-2.5 py-1 text-xs text-white/76">Ajánlott beszállítói listához</p>
              </div>
            </div>
          </button>

          <button className={sourceChoiceCard} onClick={() => chooseIncomingMode("manual")} disabled={!receptionHeaderReady} type="button">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#67d4d1]/45 bg-[#208d8b] text-white shadow-sm shadow-[#208d8b]/20">
                <Plus size={20} />
              </span>
              <div>
                <p className="text-base text-white">Manuális terméksor</p>
                <p className="mt-1 text-sm leading-6 text-white/68">Egy termék gyors felvitele fotóval, leírással, összetétellel, bárkóddal és készlettel.</p>
                <p className="mt-3 inline-flex rounded-full border border-white/14 bg-white/8 px-2.5 py-1 text-xs text-white/76">Ajánlott egyedi sorhoz</p>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <button className={neutralBtn} onClick={goToReceptionStep} type="button">
            <ArrowLeft size={14} /> Fejadatok módosítása
          </button>
          {rows.length > 0 && (
            <button className={primaryBtn} onClick={() => setIncomingStep("review")} type="button">
              <CheckCircle size={14} /> Előnézet és mentés
            </button>
          )}
        </div>
      </section>
    );
  }

  function renderReceptionHeaderEditor() {
    return (
      <section className={card}>
        <SectionTitle
          icon={<FileSpreadsheet size={16} />}
          title={selectedReceptionId ? "Megnyitott receptió adatai" : "Új receptió adatai"}
          right={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button className={neutralBtn} onClick={() => setSalesTvaModalOpen(true)} type="button">
                Eladási ár / TVA • {salesTvaRate || "0"}%
              </button>
              {selectedReceptionId ? (
                <>
                  <button className={neutralBtn} onClick={exportOpenedReceptionCheckPdf} disabled={busy} type="button">
                    <FileText size={14} /> Ellenőrző PDF
                  </button>
                  <button className={primaryBtn} onClick={saveOpenedReceptionHeader} disabled={busy} type="button">
                    <Save size={14} /> Fejadatok mentése
                  </button>
                </>
              ) : (
                <span className="text-xs text-white/60">Új receptió a kijelölt sorok mentésekor jön létre</span>
              )}
              {selectedReceptionId && (
                <button className={neutralBtn} onClick={() => (window.location.hash = "#allinreceptions")} type="button">
                  Receptió részletei
                </button>
              )}
            </div>
          }
        />

        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-white/14 bg-[#354153] px-3 py-2 text-sm text-white/76">
            Itt van a megnyitott receptió fejrésze. Előbb ezt ellenőrizd, utána jöhet XLS import vagy kézi terméksor.
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr]">
            <label className={label}>
              Beszállító
              <select className={requiredSelectInput(receptionHeaderMissing.supplier)} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option style={mutedOptionStyle} value="">Beszállító kiválasztása</option>
                {suppliers.map((s) => (
                  <option style={optionStyle} key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className={label}>
              Cél hely
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select className={requiredSelectInput(receptionHeaderMissing.location)} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option style={mutedOptionStyle} value="">Cél hely kiválasztása</option>
                  {locations.map((l) => (
                    <option style={optionStyle} key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <button className={neutralBtn} onClick={() => setLocationModalOpen(true)} type="button" title="Cél helyek kezelése">
                  <MapPin size={14} /> Kezelés
                </button>
              </div>
            </label>

            <label className={label}>
              Megjegyzés
              <input className={`${input} w-full`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="pl. Under Armour új lista" />
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            <label className={label}>
              Számlaszám
              <input className={requiredInput(requiredMissing.invoiceNumber)} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Számla száma" />
            </label>
            <label className={label}>
              Számla dátuma
              <input className={requiredInput(requiredMissing.invoiceDate)} type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </label>
            <label className={label}>
              Receptió dátuma
              <input className={requiredInput(requiredMissing.receptionDate)} type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} />
            </label>
            <label className={label}>
              Pénznem
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select
                  className={requiredSelectInput(requiredMissing.currencyCode)}
                  value={currencyCode}
                  onChange={(e) => handleCurrencyCodeChange(e.target.value)}
                >
                  <option style={mutedOptionStyle} value="">Pénznem kiválasztása</option>
                  {activeCurrencies.map((c) => (
                    <option style={optionStyle} key={c.code} value={c.code}>{c.code} • {c.name}</option>
                  ))}
                </select>
                <button className={neutralBtn} onClick={() => setCurrencyModalOpen(true)} type="button">
                  Kezelés
                </button>
              </div>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            <label className={label}>
              Árfolyam RON
              <input
                className={isRonCurrency ? disabledExchangeRateInput : requiredInput(requiredMissing.exchangeRateToRon)}
                value={isRonCurrency ? "" : exchangeRateToRon}
                onChange={(e) => {
                  if (!isRonCurrency) setExchangeRateToRon(e.target.value);
                }}
                disabled={isRonCurrency}
                placeholder={isRonCurrency ? "" : "pl. 4.97"}
                aria-disabled={isRonCurrency}
                title={isRonCurrency ? "RON pénznemnél nincs szükség árfolyamra." : undefined}
              />
            </label>
            <label className={label}>
              TVA kezelés
              <select className={requiredSelectInput(requiredMissing.tvaMode)} value={tvaMode} onChange={(e) => { const next = e.target.value as any; setTvaMode(next); if (next === "no_tva") setTvaRate("0"); else if (!tvaRate.trim() || toNumber(tvaRate) <= 0) setTvaRate("21"); }}>
                <option style={mutedOptionStyle} value="">TVA kezelés kiválasztása</option>
                <option style={optionStyle} value="without_tva">Árak nettóban • TVA hozzáadódik</option>
                <option style={optionStyle} value="with_tva">Árak bruttóban • TVA benne van</option>
                <option style={optionStyle} value="no_tva">TVA nélkül</option>
              </select>
            </label>
            <label className={label}>
              TVA %
              <input className={`${requiredInput(tvaMode === "no_tva" || !tvaMode ? false : requiredMissing.tvaRate)} ${tvaMode === "no_tva" || !tvaMode ? "opacity-70 cursor-not-allowed" : ""}`} value={tvaMode === "no_tva" ? "0" : tvaRate} onChange={(e) => setTvaRate(e.target.value)} disabled={tvaMode === "no_tva" || !tvaMode} placeholder={tvaMode === "no_tva" || !tvaMode ? "Nem szükséges" : "pl. 21"} />
            </label>
            <label className={label}>
              Szállítás
              <input className={`${input} w-full`} value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} placeholder="ha nincs, hagyd üresen" />
            </label>
            <label className={label}>
              {invoiceAmountLabel}
              <input className={requiredInput(requiredMissing.invoiceGross)} value={invoiceGross} onChange={(e) => setInvoiceGross(e.target.value)} placeholder={invoiceAmountPlaceholder} />
            </label>
          </div>

          <div className="rounded-xl border border-[#67d4d1]/28 bg-[#208d8b]/10 px-3 py-2.5 text-sm text-white/82">
            <div className="grid gap-3 lg:grid-cols-[1fr_300px_auto] lg:items-end">
              <div>
                <p className="text-xs uppercase tracking-[0.06em] text-white/62">Eladási ár kezelése</p>
                <p className="mt-1 text-white">
                  {sellPriceCurrencyMode === "invoice" && !sellPriceSourceIsRon
                    ? `Az XLS eladási ára ${sellPriceSourceCurrency}. Mentéskor a ${exchangeRateToRon || "hiányzó"} RON árfolyammal RON-ra váltjuk.`
                    : "Az eladási ár már kész RON végárként kerül mentésre."}
                </p>
                <p className="mt-1 text-xs text-white/58">
                  {salesPriceIncludesTva ? `TVA-val együtt (${salesTvaRate || "0"}%)` : `TVA nélkül (${salesTvaRate || "0"}%)`}
                  {rows.length && toNumber(rows[0]?.normalized?.sellPrice) > 0
                    ? ` • Példa: ${moneyText(toNumber(rows[0]?.normalized?.sellPrice), sellPriceSourceCurrency)} → ${moneyText(sellPriceRonFromSource(rows[0]?.normalized?.sellPrice), "RON")}`
                    : ""}
                </p>
              </div>
              <label className={label}>
                Eladási ár pénzneme
                <select
                  className={`${selectInput} w-full`}
                  value={sellPriceCurrencyMode}
                  onChange={(e) => setSellPriceCurrencyMode(e.target.value as SellPriceCurrencyMode)}
                >
                  <option style={optionStyle} value="invoice">{`Számla pénzneme (${currencyCode || "nincs kiválasztva"})`}</option>
                  <option style={optionStyle} value="ron">RON, már kész végár</option>
                </select>
              </label>
              <button className={neutralBtn} onClick={() => setSalesTvaModalOpen(true)} type="button">TVA beállítás</button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Mentett sorok</p>
              <p className="mt-1 text-sm text-white">{moneyText(savedReceptionGoodsValue, currencyCode)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Új kijelölt sorok</p>
              <p className="mt-1 text-sm text-white">{moneyText(approvedGoodsValue, currencyCode)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Sorok összesen</p>
              <p className="mt-1 text-sm text-white">{moneyText(totalReceptionGoodsValue, currencyCode)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Számított számlaérték</p>
              <p className="mt-1 text-sm text-white">{moneyText(linePriceBasisTotal, currencyCode)}</p>
              {tvaMode === "without_tva" && computedReception.vat > 0 && (
                <p className="mt-1 text-[11px] text-white/55">TVA-val számított bruttó: {moneyText(computedReception.gross, currencyCode)}</p>
              )}
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Eltérés</p>
              <p className={`mt-1 text-sm ${invoiceGrossProvided && Math.abs(invoiceDifference) > 0.01 ? "text-amber-100" : "text-white"}`}>{invoiceGrossProvided ? moneyText(invoiceDifference, currencyCode) : "-"}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Érték RON</p>
              <p className="mt-1 text-sm text-white">{currencyCode && (!exchangeRateRequired || rateValue > 0) ? moneyText(receptionRonValue, "RON") : "-"}</p>
              {computedReception.vat > 0 && <p className="mt-1 text-[11px] text-white/55">TVA: {moneyText(computedReception.vat, currencyCode)}</p>}
            </div>
          </div>

          {invoiceGrossProvided && approvedCount > 0 && Math.abs(invoiceDifference) > 0.01 && (
            <div className="rounded-xl border border-amber-200/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-50">
              A megadott számlaösszeg és a sorok azonos ár-alapú összege eltér. A kijelölt sorok mentésekor a rendszer rákérdez, hogy arányosan szétossza-e a különbözetet, vagy változatlanul hagyja a vételárakat.
            </div>
          )}

          {!receptionHeaderReady && (
            <div className="rounded-xl border border-red-300/35 bg-[#c90d22]/16 px-3 py-2 text-sm text-red-50">
              Kötelező mezők: {missingReceptionFieldLabels.join(", ") || "hiányzó adat"}. A pirossal jelölt mezők hiányoznak vagy hibásak.
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-white/14 bg-[#354153] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-white/58">Következő lépés</p>
              <p className="mt-1 text-sm text-white/78">{receptionHeaderReady ? "A fejadatai rendben vannak, jöhet a terméksor forrása." : "Töltsd ki a piros mezőket, utána nyílik a következő oldal."}</p>
            </div>
            <button className={receptionHeaderReady ? primaryBtn : dangerBtn} onClick={goToSourceStep} disabled={!receptionHeaderReady} type="button">
              Tovább a terméksorokhoz <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  function renderLoadedReceptionContent() {
    if (!loadedReception) return null;
    return (
      <section className={card}>
        <SectionTitle
          icon={<CheckCircle size={16} />}
          title="Betöltött receptió tartalma"
          right={<span className="text-xs text-white/60">A már mentett sorok áttekintése</span>}
        />
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/58">Összes sor</p><p className="mt-1 text-sm text-white">{loadedReceptionRowTotals.total}</p></div>
          <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/58">Készleten</p><p className="mt-1 text-sm text-white">{loadedReceptionRowTotals.committed}</p></div>
          <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/58">Még dolgozandó</p><p className="mt-1 text-sm text-white">{loadedReceptionRowTotals.remaining}</p></div>
          <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/58">Darab / érték</p><p className="mt-1 text-sm text-white">{loadedReceptionRowTotals.qty} db • {moneyText(loadedReceptionRowTotals.value, loadedReception.item?.currency_code || currencyCode)}</p></div>
        </div>
        <div className="mt-3 overflow-auto rounded-xl border border-white/14">
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="bg-[#303b4e] text-xs uppercase tracking-[0.07em] text-white/76">
              <tr>
                <th className="px-3 py-2 font-normal">Állapot</th>
                <th className="px-3 py-2 font-normal">Termékkód</th>
                <th className="px-3 py-2 font-normal">S/N/COD</th>
                <th className="px-3 py-2 font-normal">Név</th>
                <th className="px-3 py-2 font-normal">Márka</th>
                <th className="px-3 py-2 font-normal">Főkategória</th>
                <th className="px-3 py-2 font-normal">Nem</th>
                <th className="px-3 py-2 font-normal">Szín</th>
                <th className="px-3 py-2 font-normal">Méret</th>
                <th className="px-3 py-2 text-right font-normal">Darab</th>
                <th className="px-3 py-2 text-right font-normal">Vételár</th>
                <th className="px-3 py-2 text-right font-normal">Eladási ár</th>
              </tr>
            </thead>
            <tbody className="space-y-[2px]">
              {loadedReceptionRows.map((row: any) => (
                <tr key={row.id || `${row.batch_id}-${row.row_no}`} className={row.status === "committed" ? "bg-emerald-400/10" : row.status === "error" ? "bg-red-500/10" : "bg-[#445064]"}>
                  <td className="px-3 py-2.5 text-xs text-white/80">{rowStatusText(row.status)}</td>
                  <td className="px-3 py-2.5 text-white/88">{cell(row.supplier_product_code || row.normalized?.supplierProductCode || row.normalized?.modelCode)}</td>
                  <td className="px-3 py-2.5 text-white/82">{cell((row as any).sn_cod || row.normalized?.snCod || row.normalized?.sn_cod)}</td>
                  <td className="px-3 py-2.5 text-white">{normValue(row, "titleRo")}</td>
                  <td className="px-3 py-2.5 text-white/82">{normValue(row, "brandName", row.normalized?.brandCode)}</td>
                  <td className="px-3 py-2.5 text-white/82">{loadedRowCategoryText(row)}</td>
                  <td className="px-3 py-2.5 text-white/82">{genderLabel(row.normalized?.gender, activeGenderTypes)}</td>
                  <td className="px-3 py-2.5 text-white/82">{loadedRowColorText(row)}</td>
                  <td className="px-3 py-2.5 text-white/82">{cell(normalizeAifSizeValue(row.supplier_size || row.normalized?.size))}</td>
                  <td className="px-3 py-2.5 text-right text-white/88">{cell(row.qty || row.normalized?.qty)}</td>
                  <td className="px-3 py-2.5 text-right text-white/88">{moneyText(toNumber(row.buy_price || row.normalized?.buyPrice), loadedReception.item?.currency_code || currencyCode)}</td>
                  <td className="px-3 py-2.5 text-right text-white/88">{moneyText(toNumber(row.sell_price_ron || row.normalized?.sellPriceGrossRon || row.normalized?.sellPrice || row.sell_price), "RON")}</td>
                </tr>
              ))}
              {!loadedReceptionRows.length && (
                <tr>
                  <td className="px-3 py-6 text-center text-white/60" colSpan={12}>Ebben a receptióban még nincs mentett terméksor.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button className={neutralBtn} onClick={exportOpenedReceptionCheckPdf} disabled={busy || !selectedReceptionId} type="button"><FileText size={14} /> Ellenőrző PDF</button>
          <button className={neutralBtn} onClick={() => (window.location.hash = "#allinreceptions")} type="button">Receptió részletei</button>
          <button className={neutralBtn} onClick={reloadOpenedReceptionAndMeta} disabled={busy || !(selectedReceptionId || receptionPickerId)} title="Receptió lista, mentett sorok és törzsadatok frissítése" type="button"><RefreshCw size={14} /> Újratöltés</button>
        </div>
      </section>
    );
  }

  return (
    <main className={page}>
      <style>{`
        select.aif-native-select,
        select.aif-native-select option,
        select.aif-native-select optgroup {
          background-color: #303b4e !important;
          color: #ffffff !important;
          color-scheme: dark;
        }
        select.aif-native-select option:disabled {
          background-color: #303b4e !important;
          color: rgba(255, 255, 255, 0.45) !important;
        }
        select.aif-native-select option:checked {
          background-color: #3b4658 !important;
          color: #ffffff !important;
        }
      `}</style>
      <datalist id="aif-size-options">
        {sizeDatalistOptions.map((size) => <option key={size} value={size} />)}
      </datalist>
      {purchaseOrderPickerOpen && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="purchase-order-picker-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !purchaseOrderPickerLoading) setPurchaseOrderPickerOpen(false);
          }}
        >
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/22 bg-[#4b5566] text-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b border-white/14 bg-[#303b4e] px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67d4d1]/40 bg-[#2a8d8b] text-white"><ShoppingCart size={19} /></span>
                <div><p id="purchase-order-picker-title" className="text-lg">Bevételezés beszerzési rendelésből</p><p className="mt-1 text-xs text-white/58">Csak a Rendelve vagy Részben beérkezett, még nyitott mennyiséget tartalmazó rendelések látszanak.</p></div>
              </div>
              <div className="flex gap-2"><button className={neutralBtn} type="button" onClick={() => void loadReceivablePurchaseOrders()} disabled={purchaseOrderPickerLoading}><RefreshCw size={14} className={purchaseOrderPickerLoading ? "animate-spin" : ""} /> Frissítés</button><button className={neutralBtn} type="button" onClick={() => setPurchaseOrderPickerOpen(false)} disabled={purchaseOrderPickerLoading}><X size={14} /> Bezárás</button></div>
            </div>
            <div className="space-y-2 p-4">
              {purchaseOrderPickerError && <div className="rounded-xl border border-red-300/30 bg-red-500/12 px-3 py-2 text-sm text-red-50">{purchaseOrderPickerError}</div>}
              {receivablePurchaseOrders.map((order) => (
                <article key={order.id} className="grid gap-3 rounded-2xl border border-white/14 bg-[#354153] p-3 md:grid-cols-[1.2fr_1fr_120px_120px_auto] md:items-center">
                  <div><p className="text-sm text-white">{order.order_number}</p><p className="mt-1 text-xs text-white/50">{order.supplier_name || "-"} • {order.location_name || "Nincs célhely"}</p></div>
                  <div><p className="text-xs text-white/45">Rendelés / várható</p><p className="mt-1 text-xs text-white/80">{dateOnly(order.order_date) || "-"} • {dateOnly(order.expected_date) || "-"}</p></div>
                  <div className="rounded-xl border border-white/12 bg-[#303b4e] px-3 py-2 text-center"><p className="text-[9px] uppercase text-white/45">Hátralévő</p><p className="mt-1 text-sm text-white">{toNumber(order.remaining_qty)} db</p></div>
                  <div className="rounded-xl border border-sky-200/20 bg-sky-400/10 px-3 py-2 text-center text-xs text-sky-50">{receivablePurchaseOrderStatusLabel(order.status)}</div>
                  <button className={primaryBtn} type="button" onClick={() => void choosePurchaseOrderForReception(order.id)} disabled={purchaseOrderPickerLoading}><ShoppingCart size={14} /> Bevételezés</button>
                </article>
              ))}
              {!purchaseOrderPickerLoading && !receivablePurchaseOrders.length && !purchaseOrderPickerError && <div className="rounded-2xl border border-white/14 bg-[#354153] px-4 py-10 text-center text-sm text-white/55">Nincs bevételezhető beszerzési rendelés.</div>}
              {purchaseOrderPickerLoading && <div className="rounded-2xl border border-white/14 bg-[#354153] px-4 py-10 text-center text-sm text-white/55"><RefreshCw size={20} className="mx-auto mb-2 animate-spin" /> Rendelések betöltése...</div>}
            </div>
          </div>
        </div>
      )}
      {manualBarcodeScannerOpen && (
        <div
          className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-950/82 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-barcode-scanner-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !manualBarcodeLookupBusy) closeManualBarcodeScanner();
          }}
        >
          <div className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/22 bg-[#4b5566] text-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-white/12 bg-[#303b4e] px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#67d4d1]/45 bg-[#208d8b] text-white"><Barcode size={20} /></span>
                <div>
                  <p id="manual-barcode-scanner-title" className="text-lg">Termék azonosítása vonalkóddal</p>
                  <p className="mt-1 text-sm text-white/62">Telefonon kamera, számítógépen USB-s vonalkódolvasó vagy kézi beírás.</p>
                </div>
              </div>
              <button className={neutralBtn} onClick={closeManualBarcodeScanner} disabled={manualBarcodeLookupBusy} type="button"><X size={14} /> Bezárás</button>
            </div>

            <div className="grid gap-3 p-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="relative min-h-[250px] overflow-hidden rounded-2xl border border-white/16 bg-[#202838]">
                <video ref={manualBarcodeVideoRef} className="h-[300px] w-full object-cover" muted playsInline />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-28 w-[82%] rounded-2xl border-2 border-[#7bd7d4]/90 shadow-[0_0_0_999px_rgba(2,6,23,0.26)]" />
                </div>
                <div className="absolute bottom-2 left-2 right-2 rounded-xl border border-white/12 bg-slate-950/72 px-3 py-2 text-xs leading-5 text-white/82">
                  <Camera size={14} className="mr-1.5 inline" /> {manualBarcodeScannerStatus || "Kamera előkészítése..."}
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-white/14 bg-[#354153] p-3">
                  <div className="flex items-center gap-2 text-sm text-white"><Keyboard size={16} /> USB-s olvasó / kézi kód</div>
                  <p className="mt-1 text-xs leading-5 text-white/56">Az olvasó ide írja a kódot. A legtöbb eszköz Entert is küld, ekkor az azonosítás azonnal elindul.</p>
                  <input
                    ref={manualBarcodeHardwareInputRef}
                    className={`${input} mt-3 w-full font-mono tracking-wide`}
                    value={manualBarcodeScannerValue}
                    onChange={(event) => setManualBarcodeScannerValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      void identifyManualBarcode(event.currentTarget.value, { closeOnFound: true });
                    }}
                    placeholder="EAN / barcode"
                    inputMode="text"
                    autoComplete="off"
                  />
                  <button
                    className={`${primaryBtn} mt-3 w-full`}
                    onClick={() => void identifyManualBarcode(manualBarcodeScannerValue, { closeOnFound: true })}
                    disabled={manualBarcodeLookupBusy || !cleanIncomingBarcode(manualBarcodeScannerValue)}
                    type="button"
                  >
                    {manualBarcodeLookupBusy ? <RefreshCw size={14} className="animate-spin" /> : <Barcode size={14} />}
                    {manualBarcodeLookupBusy ? "Azonosítás..." : "Termék azonosítása"}
                  </button>
                </div>

                <div className="rounded-2xl border border-[#67d4d1]/24 bg-[#208d8b]/10 px-3 py-2.5 text-xs leading-5 text-white/76">
                  Találat esetén a termékkód, név, márka, kategória, szín, méret, kép, leírás, összetétel és az ármezők automatikusan kitöltődnek. A darabszám alapból 1. A vételárat mindig ellenőrizd az aktuális számlán.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {invoiceDifferencePrompt && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="invoice-difference-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setInvoiceDifferencePrompt(null);
          }}
        >
          <div className={modalCard} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="invoice-difference-title" className="text-lg font-normal">A számla és a vételárak nem egyeznek</p>
                <p className="mt-1 text-sm leading-6 text-white/70">
                  Mentés előtt döntsd el, hogy a rendszer arányosan korrigálja a kijelölt vételárakat, vagy hagyja őket pontosan úgy, ahogy az XLS-ben szerepelnek. Az összehasonlítás nettó soroknál nettóval, bruttó soroknál bruttóval történik.
                </p>
              </div>
              <button className={neutralBtn} onClick={() => setInvoiceDifferencePrompt(null)} disabled={busy} type="button">
                <X size={14} /> Bezárás
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className={statCard}>
                <p className="text-xs uppercase tracking-[0.06em] text-white/58">Sorok jelenlegi vételára</p>
                <p className="mt-1 text-base text-white">{moneyText(invoiceDifferencePrompt.currentGoodsValue, currencyCode)}</p>
              </div>
              <div className={statCard}>
                <p className="text-xs uppercase tracking-[0.06em] text-white/58">Számla alapján, azonos ár-alapon</p>
                <p className="mt-1 text-base text-white">{moneyText(invoiceDifferencePrompt.targetGoodsValue, currencyCode)}</p>
              </div>
              <div className={statCard}>
                <p className="text-xs uppercase tracking-[0.06em] text-white/58">Különbözet</p>
                <p className={`mt-1 text-base ${Math.abs(invoiceDifferencePrompt.difference) > 0.01 ? "text-amber-100" : "text-white"}`}>
                  {moneyText(invoiceDifferencePrompt.difference, currencyCode)}
                </p>
              </div>
              <div className={statCard}>
                <p className="text-xs uppercase tracking-[0.06em] text-white/58">Arányos korrekció</p>
                <p className="mt-1 text-base text-white">
                  {(invoiceDifferencePrompt.adjustmentFactor * 100).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%
                </p>
              </div>
            </div>

            {exchangeRateRequired && rateValue > 0 && (
              <div className="mt-3 rounded-xl border border-[#67d4d1]/24 bg-[#208d8b]/10 px-3 py-2 text-sm text-white/82">
                A számla szerinti célérték RON-ban: {moneyText(invoiceDifferencePrompt.targetGoodsValue * rateValue, "RON")} • árfolyam: 1 {currencyCode} = {rateValue.toLocaleString("ro-RO", { maximumFractionDigits: 6 })} RON.
              </div>
            )}

            {invoiceDifferencePrompt.extremeDifference ? (
              <div className="mt-3 rounded-xl border border-red-300/40 bg-[#c90d22]/18 px-3 py-2 text-sm leading-6 text-red-50">
                A különbség extrém nagy. Ez többnyire elírt számlaösszeget, rossz pénznemet vagy rossz vételár-oszlopot jelent. Az automatikus szétosztás ezért biztonsági okból le van tiltva.
              </div>
            ) : !invoiceDifferencePrompt.canDistribute ? (
              <div className="mt-3 rounded-xl border border-amber-200/30 bg-amber-400/10 px-3 py-2 text-sm leading-6 text-amber-50">
                A különbözet most nem osztható szét biztonságosan. Ilyen akkor fordul elő, ha a már mentett sorok önmagukban meghaladják a számla célértékét, vagy nincs pozitív kijelölt vételár.
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-emerald-200/24 bg-emerald-400/10 px-3 py-2 text-sm leading-6 text-emerald-50">
                Szétosztáskor a {invoiceDifferencePrompt.selectedRowsCount} kijelölt sor vételára arányosan változik. A maradék kerekítési különbözet a legnagyobb alkalmas sorra kerül, így a sorösszeg és a számla egyezni fog.
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[11px] text-white/45">Bezárás: ESC vagy kattintás a sötét háttérre</span>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className={neutralBtn} onClick={() => setInvoiceDifferencePrompt(null)} disabled={busy} type="button">Mégse, vissza az ellenőrzéshez</button>
              <button className={neutralBtn} onClick={keepInvoicePricesAndSave} disabled={busy} type="button">Árak maradjanak változatlanul</button>
              <button className={primaryBtn} onClick={distributeInvoiceDifferenceAndSave} disabled={busy || !invoiceDifferencePrompt.canDistribute} type="button">
                Különbözet arányos szétosztása
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {salesTvaModalOpen && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sales-tva-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSalesTvaModalOpen(false);
          }}
        >
          <div className={modalCard} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="sales-tva-title" className="text-lg font-normal">Eladási ár / TVA beállítás</p>
                <p className="mt-1 text-sm text-white/70">Ez csak az eladási TVA kezelés központi alapja. A pénznemet receptiónként külön választod ki: {sellPriceCurrencyModeLabel()}.</p>
              </div>
              <button className={neutralBtn} onClick={() => setSalesTvaModalOpen(false)} type="button">
                <X size={14} /> Bezárás
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={label}>
                Eladási TVA %
                <input className={`${input} w-full`} value={salesTvaRate} onChange={(e) => setSalesTvaRate(e.target.value)} placeholder="pl. 21" />
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-white/14 bg-[#354153] px-3 py-2 text-sm text-white/82">
                <input className="h-4 w-4 accent-[#208d8b]" type="checkbox" checked={salesPriceIncludesTva} onChange={(e) => setSalesPriceIncludesTva(e.target.checked)} />
                Az eladási ár TVA-val együtt értendő
              </label>
            </div>

            <div className="mt-3 rounded-xl border border-[#67d4d1]/24 bg-[#208d8b]/10 px-3 py-2 text-sm text-white/82">
              Központi TVA alapbeállítás. Mentés után minden gépen, telefonon és böngészőben ez lesz az érvényes.
            </div>

            <div className="mt-4 rounded-xl border border-white/14 bg-[#354153] px-3 py-2 text-sm text-white/70">
              A pénznem nem globális beállítás. Külföldi számlánál kiválaszthatod, hogy az XLS eladási ára a számla pénznemében van-e és árfolyammal váltandó, vagy már eleve RON végár.
              {salesTvaUpdatedAt && <span className="mt-1 block text-white/45">Utolsó központi mentés: {String(salesTvaUpdatedAt).slice(0, 16).replace("T", " ")}{salesTvaUpdatedBy ? ` • ${salesTvaUpdatedBy}` : ""}</span>}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className={neutralBtn} onClick={() => setSalesTvaModalOpen(false)} type="button">Mégse</button>
              <button className={primaryBtn} onClick={saveSalesTvaSettings} disabled={salesTvaSettingsSaving || salesTvaSettingsLoading} type="button">
                <Save size={14} /> {salesTvaSettingsSaving ? "Mentés..." : "Központi beállítás mentése"}
              </button>
            </div>
          </div>
        </div>
      )}
      {locationModalOpen && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="locations-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setLocationModalOpen(false);
          }}
        >
          <div className={modalCard} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="locations-title" className="text-lg font-normal">Cél helyek kezelése</p>
                <p className="mt-1 text-sm text-white/70">Raktárak, üzletek és egyéb cél helyek felvétele vagy törlése.</p>
              </div>
              <button className={neutralBtn} onClick={() => setLocationModalOpen(false)} type="button">
                <X size={14} /> Bezárás
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/14 bg-[#435064] p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <label className={label}>
                  Név
                  <input
                    className={`${input} w-full`}
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="pl. Csíkszereda üzlet"
                  />
                </label>
                <label className={label}>
                  Típus
                  <select className={`${selectInput} w-full`} value={newLocationType} onChange={(e) => setNewLocationType(e.target.value as LocationType)}>
                    {locationTypeOptions.map((t) => (
                      <option style={optionStyle} key={t.id} value={t.code}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <button className={primaryBtn} onClick={createLocation} disabled={busy} type="button">
                  <Save size={14} /> Mentés
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/14 bg-[#435064] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <label className={label}>
                  Cél hely típus hozzáadása
                  <input
                    className={`${input} w-full sm:w-[280px]`}
                    value={newLocationTypeName}
                    onChange={(e) => setNewLocationTypeName(e.target.value)}
                    placeholder="pl. Bemutatóterem"
                  />
                </label>
                <button className={primaryBtn} onClick={createLocationType} disabled={busy} type="button">
                  <Plus size={14} /> Típus mentése
                </button>
              </div>

              <div className="mt-3 grid gap-2">
                {locationTypes.map((t) => {
                  const isEditingType = editingLocationTypeId === t.id;
                  return (
                    <div key={t.id} className="rounded-lg border border-white/10 bg-[#354153] p-2.5">
                      {isEditingType ? (
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                          <label className={label}>
                            Típus neve
                            <input
                              className={`${input} w-full`}
                              value={editLocationTypeName}
                              onChange={(e) => setEditLocationTypeName(e.target.value)}
                              placeholder="Típus neve"
                            />
                          </label>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button className={primaryBtn} onClick={saveLocationTypeEdit} disabled={busy} type="button">
                              <Save size={14} /> Mentés
                            </button>
                            <button className={neutralBtn} onClick={cancelEditLocationType} disabled={busy} type="button">
                              <X size={14} /> Mégse
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm text-white">{t.name}</p>
                            {!t.is_active && <p className="mt-1 text-xs text-white/58">Inaktív</p>}
                          </div>
                          {deleteLocationTypeTarget?.id === t.id ? (
                            <div className="flex flex-wrap gap-2">
                              <button className={neutralBtn} onClick={() => setDeleteLocationTypeTarget(null)} disabled={busy} type="button">
                                <X size={14} /> Mégse
                              </button>
                              <button className={dangerBtn} onClick={confirmDeleteLocationType} disabled={busy} type="button">
                                <Trash2 size={14} /> Törlés
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              <button className={neutralBtn} onClick={() => startEditLocationType(t)} disabled={busy} type="button">
                                <Edit3 size={14} /> Módosítás
                              </button>
                              {t.is_active ? (
                                <button className={dangerBtn} onClick={() => { cancelEditLocationType(); setDeleteLocationTypeTarget(t); }} disabled={busy} type="button">
                                  <Trash2 size={14} /> Törlés
                                </button>
                              ) : (
                                <button className={primaryBtn} onClick={() => activateLocationType(t)} disabled={busy} type="button">
                                  <CheckCircle size={14} /> Aktiválás
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!locationTypes.length && <p className="rounded-lg border border-white/10 bg-[#354153] px-3 py-3 text-sm text-white/70">Nincs cél hely típus.</p>}
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {locations.map((l) => {
                const isEditing = editingLocationId === l.id;
                return (
                  <div key={l.id} className="rounded-xl border border-white/12 bg-[#354153] p-3">
                    {isEditing ? (
                      <div className="grid gap-3 lg:grid-cols-[1fr_180px_auto] lg:items-end">
                        <label className={label}>
                          Név
                          <input
                            className={`${input} w-full`}
                            value={editLocationName}
                            onChange={(e) => setEditLocationName(e.target.value)}
                            placeholder="Cél hely neve"
                          />
                        </label>
                        <label className={label}>
                          Típus
                          <select
                            className={`${selectInput} w-full`}
                            value={editLocationType}
                            onChange={(e) => setEditLocationType(e.target.value as LocationType)}
                          >
                            {locationTypeOptions.map((t) => (
                              <option style={optionStyle} key={t.id} value={t.code}>{t.name}</option>
                            ))}
                          </select>
                        </label>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <button className={primaryBtn} onClick={saveLocationEdit} disabled={busy} type="button">
                            <Save size={14} /> Mentés
                          </button>
                          <button className={neutralBtn} onClick={cancelEditLocation} disabled={busy} type="button">
                            <X size={14} /> Mégse
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm text-white">{l.name}</p>
                          <p className="mt-1 text-xs text-white/60">{typeLabel(l.location_type)}</p>
                        </div>
                        {deleteLocationTarget?.id === l.id ? (
                          <div className="flex flex-wrap gap-2">
                            <button className={neutralBtn} onClick={() => setDeleteLocationTarget(null)} disabled={busy} type="button">
                              <X size={14} /> Mégse
                            </button>
                            <button className={dangerBtn} onClick={confirmDeleteLocation} disabled={busy} type="button">
                              <Trash2 size={14} /> Törlés
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button className={neutralBtn} onClick={() => startEditLocation(l)} disabled={busy} type="button">
                              <Edit3 size={14} /> Módosítás
                            </button>
                            <button className={dangerBtn} onClick={() => { cancelEditLocation(); setDeleteLocationTarget(l); }} disabled={busy} type="button">
                              <Trash2 size={14} /> Törlés
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!locations.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-4 text-sm text-white/70">Nincs aktív cél hely.</p>}
            </div>
          </div>
        </div>
      )}

      {currencyModalOpen && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="currencies-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setCurrencyModalOpen(false);
          }}
        >
          <div className={modalCard} onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="currencies-title" className="text-lg font-normal">Pénznemek kezelése</p>
                <p className="mt-1 text-sm text-white/70">A receptió és import árfolyamaihoz használt pénznemek.</p>
              </div>
              <button className={neutralBtn} onClick={() => setCurrencyModalOpen(false)} type="button">
                <X size={14} /> Bezárás
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/14 bg-[#435064] p-3">
              <div className="grid gap-3 sm:grid-cols-[110px_1fr_120px_auto] sm:items-end">
                <label className={label}>
                  Kód
                  <input className={`${input} w-full uppercase`} value={newCurrencyCode} onChange={(e) => setNewCurrencyCode(e.target.value.toUpperCase())} placeholder="EUR" maxLength={8} />
                </label>
                <label className={label}>
                  Név
                  <input className={`${input} w-full`} value={newCurrencyName} onChange={(e) => setNewCurrencyName(e.target.value)} placeholder="Euro" />
                </label>
                <label className={label}>
                  Jel
                  <input className={`${input} w-full`} value={newCurrencySymbol} onChange={(e) => setNewCurrencySymbol(e.target.value)} placeholder="€" />
                </label>
                <button className={primaryBtn} onClick={createCurrency} disabled={busy} type="button">
                  <Save size={14} /> Mentés
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {currencies.map((c) => {
                const isEditing = editingCurrencyCode === c.code;
                return (
                  <div key={c.code} className="rounded-xl border border-white/12 bg-[#354153] p-3">
                    {isEditing ? (
                      <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                        <label className={label}>
                          Név
                          <input className={`${input} w-full`} value={editCurrencyName} onChange={(e) => setEditCurrencyName(e.target.value)} />
                        </label>
                        <label className={label}>
                          Jel
                          <input className={`${input} w-full`} value={editCurrencySymbol} onChange={(e) => setEditCurrencySymbol(e.target.value)} />
                        </label>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <button className={primaryBtn} onClick={saveCurrencyEdit} disabled={busy} type="button"><Save size={14} /> Mentés</button>
                          <button className={neutralBtn} onClick={cancelEditCurrency} disabled={busy} type="button"><X size={14} /> Mégse</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm text-white">{c.code} • {c.name}{c.symbol ? ` • ${c.symbol}` : ""}</p>
                          {!c.is_active && <p className="mt-1 text-xs text-white/58">Inaktív</p>}
                        </div>
                        {deleteCurrencyTarget?.code === c.code ? (
                          <div className="flex flex-wrap gap-2">
                            <button className={neutralBtn} onClick={() => setDeleteCurrencyTarget(null)} disabled={busy} type="button"><X size={14} /> Mégse</button>
                            <button className={dangerBtn} onClick={confirmDeleteCurrency} disabled={busy} type="button"><Trash2 size={14} /> Törlés</button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button className={neutralBtn} onClick={() => startEditCurrency(c)} disabled={busy} type="button"><Edit3 size={14} /> Módosítás</button>
                            {c.is_active ? (
                              <button className={dangerBtn} onClick={() => { cancelEditCurrency(); setDeleteCurrencyTarget(c); }} disabled={busy || c.code === "RON"} type="button"><Trash2 size={14} /> Törlés</button>
                            ) : (
                              <button className={primaryBtn} onClick={() => activateCurrency(c)} disabled={busy} type="button"><CheckCircle size={14} /> Aktiválás</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!currencies.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-4 text-sm text-white/70">Nincs pénznem.</p>}
            </div>
          </div>
        </div>
      )}

      <div className={wrap}>
        <header className={topCard}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] border-l-4 border-[#7bd7d4]/70 pl-3">
              <p className="text-[11px] uppercase tracking-[0.18em] leading-none text-[#cffffd]/70">AllInFashion</p>
              <h1 className="mt-1 text-xl leading-tight tracking-tight text-white">Áru bevételezés</h1>
              <p className="mt-0.5 text-[11px] leading-snug text-white/52">Beszállító, receptió, XLS import és készletre vétel</p>
            </div>
            <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
              <button className={headerPrimaryBtn} onClick={() => startNewEmptyReception()} disabled={busy} type="button">
                <Plus size={15} /> Új üres
              </button>
              <button className={headerBtn} onClick={() => void openPurchaseOrderPicker()} disabled={busy} type="button">
                <ShoppingCart size={15} /> Rendelésből
              </button>
              <button className={headerBtnSoft} onClick={reloadAll} disabled={busy} type="button">
                <RefreshCw size={15} /> Frissítés
              </button>
              <button className={`${headerBtn} ml-2 border-white/30 bg-[#263246] px-3`} onClick={goHome} type="button" title="Kezdőlap">
                <Home size={15} /> Kezdőlap
              </button>
            </div>
          </div>
        </header>

        {purchaseOrderSource && (
          <section className="rounded-2xl border border-[#7bd7d4]/45 bg-[#173f48] px-4 py-3 shadow-lg shadow-slate-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#bff8f5]/70">Beszerzési rendelésből indított bevételezés</p>
                <p className="mt-1 text-base text-white">{purchaseOrderSource.item.order_number} • {purchaseOrderSource.item.supplier_name || "-"}</p>
                <p className="mt-1 text-xs text-white/65">A sorokból csak a még hátralévő mennyiség került az előnézetbe. Készletre vétel után a rendelés automatikusan részben vagy teljesen beérkezett állapotba vált.</p>
              </div>
              <button className={neutralBtn} onClick={() => (window.location.hash = "#allinorderhistory")} type="button">
                <ArrowLeft size={14} /> Rendelések
              </button>
            </div>
          </section>
        )}

        {message && <div className="rounded-xl border border-emerald-200/30 bg-emerald-400/12 px-3 py-2 text-sm text-white/92">{message}</div>}

        {renderWorkflowWizard()}

        {incomingStep === "reception" && renderReceptionHeaderEditor()}

        {incomingStep === "source" && renderSourceChooser()}

        {incomingStep === "import" && (
        <section className={card}>
          <SectionTitle icon={<FileSpreadsheet size={16} />} title="XLS import és sormentés" right={<span className="text-xs text-white/60">Fájl, kijelölés, mentés</span>} />

          <div className="mt-3 rounded-xl border border-white/12 bg-[#354153] px-3 py-2 text-sm text-white/72">
            Az XLS vagy kézi sorok mindig a fenti receptió fejadataihoz kerülnek. Beszállítót, cél helyet és számlaadatokat fent módosíts.
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className={fileBtn}>
              <FileSpreadsheet size={15} /> XLS / XLSX kiválasztás
              <input className="hidden" type="file" accept=".xls,.xlsx,.csv" onChange={onFileChange} />
            </label>
            <button className={neutralBtn} onClick={selectAllRows} disabled={busy || !rows.length || approvedCount === rows.length} type="button">
              <CheckCircle size={14} /> Összes sor kijelölése
            </button>
            <button className={neutralBtn} onClick={selectCleanRows} disabled={busy || !rows.length} type="button">
              <CheckCircle size={14} /> Hibátlan sorok kijelölése
            </button>
            <button className={neutralBtn} onClick={clearApprovedRows} disabled={busy || !rows.length || !approvedCount} type="button">
              <X size={14} /> Kijelölés törlése
            </button>
            <button className={primaryBtn} onClick={saveDraft} disabled={busy || !canSaveApprovedRows} type="button">
              <UploadCloud size={15} /> Kijelölt sorok mentése
            </button>
            <button className={neutralBtn} onClick={reloadAll} disabled={busy} type="button">
              <RefreshCw size={14} /> Frissítés
            </button>
            <button className={neutralBtn} onClick={() => (window.location.hash = "#allinsuppliers")} type="button">
              <Building2 size={14} /> Beszállítók
            </button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Fájl</p>
              <p className="mt-1 truncate text-sm">{fileName || "-"}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Beolvasott sorok</p>
              <p className="mt-1 text-lg font-normal">{rows.length}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Termék összesen</p>
              <p className="mt-1 text-lg font-normal">{importedTotalQty.toLocaleString("hu-HU")} db</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Kijelölt sorok</p>
              <p className="mt-1 text-lg font-normal">{approvedCount}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Kizárt sorok</p>
              <p className="mt-1 text-lg font-normal">{excludedCount}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Ellenőrzendő</p>
              <p className="mt-1 text-lg font-normal">{rowProblems}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/14 bg-[#354153] p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.09em] text-white/90">Import besorolás</p>
                <p className="mt-1 text-xs text-white/62">Márka, főkategória és nem az AIF törzsadatokból. Ezek az értékek a mentett sorokkal együtt kerülnek tovább.</p>
              </div>
              <button className={tinyBtn} onClick={() => (window.location.hash = "#allinwarehouse")} type="button">Törzsadatok</button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <label className={label}>
                Márka
                <select className={`${selectInput} w-full`} value={defaultBrandCode} onChange={(e) => setDefaultBrandCode(e.target.value)}>
                  <option style={mutedOptionStyle} value="">Nincs alapértelmezett márka</option>
                  {brandOptionsForSupplier.map((b) => (
                    <option style={optionStyle} key={b.id} value={b.code || b.id}>{b.name || b.code}</option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Főkategória
                <select className={`${selectInput} w-full`} value={defaultCategoryCode} onChange={(e) => setDefaultCategoryCode(e.target.value)}>
                  <option style={mutedOptionStyle} value="">Nincs alapértelmezett főkategória</option>
                  {(mainCategories.length ? mainCategories : activeCategories).map((c) => (
                    <option style={optionStyle} key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Nem
                <select className={`${selectInput} w-full`} value={defaultGender} onChange={(e) => setDefaultGender(e.target.value)}>
                  <option style={mutedOptionStyle} value="">Nincs alapértelmezett nem</option>
                  {activeGenderTypes.map((g) => (
                    <option style={optionStyle} key={g.code} value={g.code}>{g.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={neutralBtn} onClick={() => applyImportDefaults("missing")} disabled={busy || !rows.length} type="button">Hiányzó besorolás kitöltése</button>
              <button className={neutralBtn} onClick={() => applyImportDefaults("approved")} disabled={busy || !approvedCount} type="button">Kijelölt sorokra</button>
              <button className={neutralBtn} onClick={() => applyImportDefaults("all")} disabled={busy || !rows.length} type="button">Minden beolvasott sorra</button>
            </div>
            {supplierId && !brandOptionsForSupplier.length ? (
              <p className="mt-2 rounded-lg border border-amber-200/24 bg-amber-400/10 px-3 py-2 text-xs text-amber-50">A kiválasztott beszállítóhoz nincs aktív márka kapcsolat. Előbb a beszállítói márkakapcsolatot kell beállítani.</p>
            ) : null}
          </div>

          {rows.length ? (
            <div className="mt-3 rounded-xl border border-amber-200/24 bg-amber-400/10 px-3 py-2 text-sm text-amber-50">
              A beolvasás csak előnézet. Importként kizárólag a kijelölt és hibátlan sorok menthetők.
            </div>
          ) : null}
        </section>
        )}

        {incomingStep === "manual" && (
        <section className={card}>
          <SectionTitle
            icon={<Plus size={16} />}
            title="Manuális terméksor"
            right={
              <button className={tinyBtn} onClick={() => setManualRowsOpen((v) => !v)} type="button">
                {manualRowsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {manualRowsOpen ? "Bezárás" : "Megnyitás"}
              </button>
            }
          />

          {manualRowsOpen && (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-white/14 bg-[#354153] px-3 py-2 text-sm text-white/74">
                Manuális bevételezéshez tölts ki egy terméksort, majd add hozzá az előnézethez. Mentés előtt ugyanúgy ellenőrizhető és kijelölhető, mint az importált sor.
              </div>
              <div className="grid gap-3 lg:grid-cols-6">
                <label className={label}>Termékkód
                  <input className={`${input} w-full`} value={manualProductCode} onChange={(e) => setManualProductCode(e.target.value)} placeholder="pl. UA-123" />
                </label>
                <label className={label}>Vonalkód / bárkód
                  <div className="relative">
                    <input
                      className={`${input} w-full pr-12 font-mono`}
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        void identifyManualBarcode(event.currentTarget.value, { closeOnFound: false });
                      }}
                      placeholder="EAN / barcode"
                      autoComplete="off"
                    />
                    <button
                      className="absolute right-1.5 top-1 inline-flex h-7 w-9 items-center justify-center rounded-lg border border-[#67d4d1]/45 bg-[#208d8b] text-white shadow-sm transition hover:bg-[#249b99] focus:outline-none focus:ring-2 focus:ring-[#67d4d1]/35"
                      onClick={openManualBarcodeScanner}
                      type="button"
                      title="Kamera vagy USB-s vonalkódolvasó megnyitása"
                      aria-label="Vonalkód beolvasása"
                    >
                      <Barcode size={15} />
                    </button>
                  </div>
                </label>
                <label className={label}>S/N/COD
                  <input className={`${input} w-full`} value={manualSnCod} onChange={(e) => setManualSnCod(e.target.value)} placeholder="belső azonosító" />
                </label>
                <label className={label}>Vámtarifa kód
                  <input className={`${input} w-full`} value={manualCustomsTariffCode} onChange={(e) => setManualCustomsTariffCode(e.target.value)} placeholder="pl. 61102091" />
                </label>
                <label className={`${label} lg:col-span-2`}>Terméknév
                  <input className={`${input} w-full`} value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Termék megnevezése" />
                </label>
              </div>
              <div className="grid gap-3 lg:grid-cols-6">
                <label className={label}>Márka
                  <select className={`${selectInput} w-full`} value={manualBrandCode || defaultBrandCode} onChange={(e) => setManualBrandCode(e.target.value)}>
                    <option style={mutedOptionStyle} value="">Nincs</option>
                    {brandOptionsForSupplier.map((b) => <option style={optionStyle} key={b.id} value={b.code || b.id}>{b.name || b.code}</option>)}
                  </select>
                </label>
                <label className={label}>Főkategória
                  <select className={`${selectInput} w-full`} value={manualCategoryCode || defaultCategoryCode} onChange={(e) => { const value = e.target.value; const found = (mainCategories.length ? mainCategories : activeCategories).find((c) => String(c.code || c.id) === value); setManualCategoryCode(value); setManualSubCategoryCode(""); if (found) setManualProductType((current) => current || categoryLabel(found)); }}>
                    <option style={mutedOptionStyle} value="">Nincs</option>
                    {(mainCategories.length ? mainCategories : activeCategories).map((c) => <option style={optionStyle} key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}
                  </select>
                </label>
                <label className={label}>Alkategória / terméktípus
                  <select className={`${selectInput} w-full`} value={manualSubCategoryCode} onChange={(e) => { const value = e.target.value; const found = subCategoriesForManualCategory.find((c) => String(c.code || c.id) === value); setManualSubCategoryCode(value); if (found) setManualProductType((current) => current || categoryLabel(found)); }}>
                    <option style={mutedOptionStyle} value="">Nincs</option>
                    {subCategoriesForManualCategory.map((c) => <option style={optionStyle} key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}
                  </select>
                </label>
                <label className={label}>Import terméktípus / RODESCR
                  <input className={`${input} w-full`} value={manualProductType} onChange={(e) => setManualProductType(e.target.value)} placeholder="pl. tricou, hoodie" />
                </label>
                <label className={label}>Nem
                  <select className={`${selectInput} w-full`} value={manualGender || defaultGender} onChange={(e) => setManualGender(e.target.value)}>
                    <option style={mutedOptionStyle} value="">Nincs</option>
                    {activeGenderTypes.map((g) => <option style={optionStyle} key={g.code} value={g.code}>{g.name}</option>)}
                  </select>
                </label>
                <label className={label}>Fotó URL
                  <input className={`${input} w-full`} value={manualImageUrl} onChange={(e) => setManualImageUrl(e.target.value)} placeholder="https://..." />
                </label>
              </div>
              <div className="grid gap-3 lg:grid-cols-7">
                <label className={label}>Szín
                  <input className={`${input} w-full`} value={manualColorName} onChange={(e) => setManualColorName(e.target.value)} placeholder="pl. fekete" />
                </label>
                <label className={label}>Színkód
                  <input className={`${input} w-full`} value={manualColorCode} onChange={(e) => setManualColorCode(e.target.value)} placeholder="pl. 001" />
                </label>
                <label className={label}>Méret
                  <input className={`${input} w-full`} list="aif-size-options" value={manualSize} onChange={(e) => setManualSize(e.target.value)} placeholder="pl. M, 42 vagy OSFM" />
                </label>
                <label className={label}>Darab
                  <input className={`${input} w-full`} value={manualQty} onChange={(e) => setManualQty(e.target.value)} placeholder="pl. 1" />
                </label>
                <label className={label}>Vételár
                  <input className={`${input} w-full`} value={manualBuyPrice} onChange={(e) => setManualBuyPrice(e.target.value)} placeholder="pénznemben" />
                </label>
                <label className={label}>Eladási ár RON
                  <input className={`${input} w-full`} value={manualSellPrice} onChange={(e) => setManualSellPrice(e.target.value)} placeholder="TVA-s ár" />
                </label>
                <label className={label}>Termék összetétele
                  <input className={`${input} w-full`} value={manualMaterial} onChange={(e) => setManualMaterial(e.target.value)} placeholder="pl. 100% bumbac" />
                </label>
              </div>
              <div className="grid gap-3 lg:grid-cols-1">
                <label className={label}>Termék leírás / DESCRIERE
                  <textarea className="min-h-[82px] rounded-lg border border-white/24 bg-[#303b4e] px-3 py-2 text-sm text-white caret-white outline-none placeholder:text-white/50 focus:border-[#67d4d1]/80 focus:ring-1 focus:ring-[#67d4d1]/30 font-normal" value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} placeholder="DESCRIERE / hosszú termékleírás" />
                </label>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button className={neutralBtn} onClick={resetManualRowForm} type="button">Mezők törlése</button>
                <button className={primaryBtn} onClick={addManualRow} type="button"><Plus size={14} /> Sor hozzáadása</button>
              </div>
            </div>
          )}
        </section>
        )}

        {incomingStep === "reception" && !selectedReceptionId && (
        <section className={card}>
          <SectionTitle
            icon={<FileSpreadsheet size={16} />}
            title="Receptió gyorslista"
            right={
              <div className="flex items-center gap-2">
                <button className={tinyBtn} onClick={() => (window.location.hash = "#allinreceptions")} type="button">Összes receptió</button>
                <button className={tinyBtn} onClick={() => setReceptionListOpen((v) => !v)} type="button">
                  {receptionListOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {receptionListOpen ? "Bezárás" : "Megnyitás"}
                </button>
              </div>
            }
          />
          {receptionListOpen && (
            <div className="mt-3 grid gap-2">
              {receptions.map((r) => (
                <div key={r.id} className={`rounded-xl border px-3 py-2 ${String(r.id) === String(selectedReceptionId) ? "border-emerald-200/35 bg-emerald-400/12" : "border-white/12 bg-[#354153]"}`}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-white">{r.invoice_number || "Számlaszám nélkül"}</p>
                      <p className="mt-1 text-xs text-white/62">{r.supplier_name || "-"} • {r.location_name || "-"} • {r.currency_code || "-"}</p>
                    </div>
                    <div className="grid gap-2 text-xs md:grid-cols-3 md:min-w-[360px]">
                      <div className="rounded-lg bg-[#303b4e] px-2 py-1.5"><span className="text-white/55">Terméksor</span><p className="text-white">{r.line_count || 0}</p></div>
                      <div className="rounded-lg bg-[#303b4e] px-2 py-1.5"><span className="text-white/55">Érték</span><p className="text-white">{moneyText(toNumber(r.invoice_gross), r.currency_code || "")}</p></div>
                      <div className="rounded-lg bg-[#303b4e] px-2 py-1.5"><span className="text-white/55">Állapot</span><p className="text-white">{receptionStatusLabel(r.status)}</p></div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button className={tinyBtn} onClick={() => loadReceptionIntoWorkspace(r.id)} disabled={busy} type="button"><Edit3 size={13} /> Betöltés</button>
                      <button className={tinyBtn} onClick={() => (window.location.hash = "#allinreceptions")} type="button"><Download size={13} /> Részletek</button>
                    </div>
                  </div>
                </div>
              ))}
              {!receptions.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-4 text-sm text-white/70">Még nincs receptió.</p>}
            </div>
          )}
        </section>

        )}

        {incomingStep === "import" && (
        <section className={card}>
          <SectionTitle
            icon={<AlertTriangle size={16} />}
            title="Import ellenőrzés"
            right={
              <button className={tinyBtn} onClick={() => setWorkbenchOpen((v) => !v)} type="button">
                {workbenchOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {workbenchOpen ? "Bezárás" : "Megnyitás"}
              </button>
            }
          />

          {workbenchOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 md:grid-cols-4">
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Munkalap</p>
                  <p className="mt-1 truncate text-sm">{workbench?.sheetName || "-"}</p>
                </div>
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Fejléc sora</p>
                  <p className="mt-1 text-lg font-normal">{workbench?.headerRow || "-"}</p>
                </div>
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Felismerés</p>
                  <p className={`mt-1 text-lg font-normal ${confidenceClass(workbench?.overallConfidence || 0)}`}>{workbench?.overallConfidence ?? 0}%</p>
                </div>
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Ellenőrzések</p>
                  <p className="mt-1 text-lg font-normal">{columnWarnings + rowProblems}</p>
                </div>
              </div>

              {workbench?.warnings?.length ? (
                <div className="rounded-xl border border-amber-200/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-50">
                  {workbench.warnings.map((w, i) => (
                    <p key={`${w}-${i}`}>{w}</p>
                  ))}
                </div>
              ) : null}

              <div className="overflow-auto rounded-xl border border-white/14">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#303b4e] text-xs uppercase tracking-[0.07em] text-white/76">
                    <tr>
                      <th className="px-3 py-2 font-normal">Excel oszlop</th>
                      <th className="px-3 py-2 font-normal">Felismert mező</th>
                      <th className="px-3 py-2 font-normal">Biztonság</th>
                      <th className="px-3 py-2 font-normal">Minták</th>
                      <th className="px-3 py-2 font-normal">Megjegyzés</th>
                    </tr>
                  </thead>
                  <tbody className="space-y-[2px]">
                    {(workbench?.columns || []).map((c) => {
                      const isIgnored = c.field === "ignore";
                      return (
                      <tr
                        key={`${c.index}-${c.header}`}
                        className={isIgnored ? "bg-red-500/16 hover:bg-red-500/22 ring-1 ring-inset ring-red-300/20" : "bg-[#445064] hover:bg-[#4b596f]"}
                      >
                        <td className="px-3 py-2.5 text-white/90">{c.header}</td>
                        <td className="px-3 py-2.5">
                          <select className={`${selectInput} h-8 w-[190px]`} value={c.field} onChange={(e) => updateColumnField(c.index, e.target.value as AifColumnField)}>
                            {AIF_COLUMN_FIELD_OPTIONS_WITH_SN.map((opt) => (
                              <option style={optionStyle} key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          {c.field === "ignore" && <div className="mt-1 inline-flex rounded-full border border-red-300/30 bg-red-500/16 px-2 py-0.5 text-[10px] text-red-50">Kihagyott oszlop</div>}
                        </td>
                        <td className={`px-3 py-2.5 ${confidenceClass(c.confidence)}`}>{confidenceText(c.confidence)} • {c.confidence}%</td>
                        <td className="px-3 py-2.5 text-white/70">{c.samples.length ? c.samples.join(" | ") : "-"}</td>
                        <td className="px-3 py-2.5 text-white/70">{c.warnings.length ? c.warnings.join(" ") : "-"}</td>
                      </tr>
                      );
                    })}
                    {!workbench?.columns?.length && (
                      <tr>
                        <td className="px-3 py-6 text-center text-white/60" colSpan={5}>Nincs beolvasott oszlop.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
        )}

        {rows.length > 0 && (incomingStep === "import" || incomingStep === "manual" || incomingStep === "review") && (
        <section className={card}>
          <SectionTitle
            icon={<FileSpreadsheet size={16} />}
            title="Soronkénti előnézet"
            right={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/16 bg-[#354153] px-2 text-[11px] text-white/82">
                  <input
                    className="h-3.5 w-3.5 accent-[#208d8b]"
                    type="checkbox"
                    checked={rows.length > 0 && approvedCount === rows.length}
                    onChange={(e) => (e.target.checked ? selectAllRows() : clearApprovedRows())}
                  />
                  Összes sor
                </label>
                <span className="text-xs text-white/60">Kompakt, oldalirányú görgetés nélkül</span>
                {approvedCount > 0 && (
                  <button
                    className={compactPrimaryBtn}
                    onClick={saveDraft}
                    disabled={busy || !canSaveApprovedRows}
                    title={!canSaveApprovedRows ? "A mentéshez legyen kitöltve a receptió és ne legyen hibás kijelölt sor." : "Kijelölt sorok mentése"}
                    type="button"
                  >
                    <UploadCloud size={13} /> Kijelölt sorok mentése
                  </button>
                )}
              </div>
            }
          />
          <div className="mt-3 overflow-hidden rounded-xl border border-white/14">
            <div className={previewTopHeaderGrid}>
              <div>Import</div>
              <div>Kód</div>
              <div>S/N/COD</div>
              <div>Vámkód</div>
              <div>Név</div>
              <div>Márka</div>
              <div>Főkategória</div>
              <div>Alkat. / típus</div>
            </div>
            <div className="space-y-[3px] bg-[#303b4e]/35 p-[3px]">
              {preview.map((r, idx) => {
                const globalIndex = idx;
                const n = r.normalized || {};
                const errors = aifRowErrors(r, sizeTypes, brandSizeCodes);
                const key = rowKey(r, globalIndex);
                const approved = Boolean(approvedRows[key]);
                const rowState = errors.length ? "Ellenőrizni" : "Rendben";
                const mainCategoryValue = mainCategoryValueForRow(r);
                const subCategoryValue = subCategoryValueForRow(r);
                const subCategoryOptions = subCategoriesForParentValue(mainCategoryValue);
                const mainCategoryHint = importedMainCategoryHint(r);
                const subCategoryHint = importedSubCategoryHint(r);
                const colorMissingHint = brandColorMissingHint(r);
                const rowMessage = errors.length ? errors.join(" ") : rowState;
                const isDimmedPreviewRow = idx % 2 === 1;
                const previewRowClass = errors.length
                  ? isDimmedPreviewRow
                    ? "rounded-md border border-red-300/[0.10] bg-red-500/[0.075] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.02),inset_0_0_0_9999px_rgba(0,0,0,0.025)] transition-colors hover:bg-red-500/[0.12]"
                    : "rounded-md border border-red-300/20 bg-red-500/10 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors hover:bg-red-500/20"
                  : approved
                    ? isDimmedPreviewRow
                      ? "rounded-md border border-[#67d4d1]/[0.13] bg-[#208d8b]/[0.12] px-2 py-1 ring-1 ring-inset ring-[#67d4d1]/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.02),inset_0_0_0_9999px_rgba(0,0,0,0.025)] transition-colors hover:bg-[#208d8b]/[0.18]"
                      : "rounded-md border border-[#67d4d1]/20 bg-[#208d8b]/18 px-2 py-1 ring-1 ring-inset ring-[#67d4d1]/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors hover:bg-[#208d8b]/[0.24]"
                    : isDimmedPreviewRow
                      ? "rounded-md border border-white/[0.07] bg-[#3f4a5d] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.018),inset_0_0_0_9999px_rgba(0,0,0,0.025)] transition-colors hover:bg-[#465368]"
                      : "rounded-md border border-white/[0.10] bg-[#465267] px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition-colors hover:bg-[#4b596f]";
                return (
                  <div
                    key={`${r.rowNo || idx}-${idx}`}
                    className={previewRowClass}
                  >
                    <div className={previewTopGrid}>
                      <div className="flex h-[28px] items-center justify-between gap-1 rounded-md border border-white/10 bg-black/10 px-1.5 lg:block lg:h-auto lg:border-0 lg:bg-transparent lg:px-0">
                        <div className="flex items-center gap-1">
                          <input className="h-3.5 w-3.5 accent-[#208d8b]" type="checkbox" checked={approved} onChange={(e) => toggleApprovedRow(globalIndex, e.target.checked)} aria-label="Sor kijelölése importhoz" />
                          <span className="text-[11px] text-white/50">#{r.rowNo || idx + 1}</span>
                        </div>
                        <div className={errors.length ? "text-[10px] text-amber-100/82 lg:mt-1" : "text-[10px] text-emerald-100/78 lg:mt-1"}>{rowState}</div>
                      </div>

                      <label className={previewField}>
                        <span className={compactFieldLabel}>Kód</span>
                        <input className={`${previewInput} w-full`} value={valueString(n.supplierProductCode || n.modelCode)} onChange={(e) => updateRowField(globalIndex, "supplierProductCode", e.target.value)} />
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>S/N/COD</span>
                        <input className={`${previewInput} w-full`} value={valueString((n as any).snCod || (n as any).sn_cod)} onChange={(e) => updateRowField(globalIndex, "snCod", e.target.value)} />
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>Vámkód</span>
                        <input className={`${previewInput} w-full`} value={valueString((n as any).customsTariffCode || (n as any).customs_tariff_code || (n as any).tariffCode || (n as any).hsCode)} onChange={(e) => updateRowField(globalIndex, "customsTariffCode", e.target.value)} />
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>Név</span>
                        <input className={`${previewInput} w-full`} value={valueString(n.titleRo)} onChange={(e) => updateRowField(globalIndex, "titleRo", e.target.value)} title={valueString(n.titleRo)} />
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>Márka</span>
                        <select className={`${previewSelect} w-full`} value={brandValueForRow(n)} onChange={(e) => updateRowField(globalIndex, "brandCode", e.target.value)}>
                          <option style={mutedOptionStyle} value="">Nincs</option>
                          {brandOptionsForSupplier.map((b) => <option style={optionStyle} key={b.id} value={b.code || b.id}>{b.name || b.code}</option>)}
                        </select>
                      </label>
                    </div>

                    <div className={previewMiddleGrid}>
                      <div className="hidden lg:block" />
                      <label className={previewField}>
                        <span className={compactFieldLabel} title="Főkategória">Főkategória</span>
                        <select className={`${previewSelect} w-full min-w-0 truncate`} value={mainCategoryValue} onChange={(e) => updateRowField(globalIndex, "categoryCode", e.target.value)} title={mainCategoryValue || mainCategoryHint || "Főkategória"}>
                          <option style={mutedOptionStyle} value="">Nincs</option>
                          {(mainCategories.length ? mainCategories : activeCategories.filter((c) => !isSubcategoryOption(c))).map((c) => <option style={optionStyle} key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}
                        </select>
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel} title="Alkategória / terméktípus">Alkat. / típus</span>
                        <select className={`${previewSelect} w-full min-w-0 truncate`} value={subCategoryValue} onChange={(e) => updateRowField(globalIndex, "subCategoryCode", e.target.value)} title={subCategoryValue || subCategoryHint || "Alkategória / terméktípus"}>
                          <option style={mutedOptionStyle} value="">Nincs</option>
                          {subCategoryOptions.map((c) => <option style={optionStyle} key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}
                        </select>
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>Nem</span>
                        <select className={`${previewSelect} w-full`} value={valueString(n.gender)} onChange={(e) => updateRowField(globalIndex, "gender", e.target.value)}>
                          <option style={mutedOptionStyle} value="">Nincs</option>
                          {activeGenderTypes.map((g) => <option style={optionStyle} key={g.code} value={g.code}>{g.name}</option>)}
                        </select>
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>Szín</span>
                        <input className={`${previewInput} w-full`} value={valueString(n.colorName)} onChange={(e) => updateRowField(globalIndex, "colorName", e.target.value)} />
                      </label>
                      <label className={previewField}>
                        <span className={`${compactFieldLabel} inline-flex items-center justify-center gap-1`}>
                          Színkód
                          {colorMissingHint ? (
                            <span className="group relative inline-flex">
                              <span
                                className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-yellow-300 text-[10px] leading-none text-black shadow-sm ring-1 ring-yellow-100/70"
                                title={`Nincs mapping: ${colorMissingHint}`}
                              >
                                !
                              </span>
                              <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 hidden w-max max-w-[240px] -translate-x-1/2 rounded-md border border-yellow-200/70 bg-slate-950 px-2 py-1 text-[10px] normal-case leading-snug tracking-normal text-yellow-50 shadow-xl group-hover:block">
                                Nincs mapping: {colorMissingHint}
                              </span>
                            </span>
                          ) : null}
                        </span>
                        <input className={`${previewInput} w-full`} value={valueString(n.colorCode)} onChange={(e) => updateRowField(globalIndex, "colorCode", e.target.value)} />
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>Méret</span>
                        <input className={`${previewInput} w-full`} list="aif-size-options" value={valueString(n.size)} onChange={(e) => updateRowField(globalIndex, "size", e.target.value)} placeholder="OSFM" />
                      </label>
                    </div>

                    <div className={previewBottomGrid}>
                      <div className="hidden lg:block" />
                      <label className={previewField}>
                        <span className={compactFieldLabel}>Vonalkód</span>
                        <input className={`${previewInput} w-full`} value={valueString((n as any).barcode)} onChange={(e) => updateRowField(globalIndex, "barcode", e.target.value)} />
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>Fotó URL</span>
                        <input className={`${previewInput} w-full`} value={valueString((n as any).imageUrl || (n as any).image_url)} onChange={(e) => updateRowField(globalIndex, "imageUrl", e.target.value)} title={valueString((n as any).imageUrl || (n as any).image_url)} />
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>DESCRIERE / Leírás</span>
                        <input
                          className={`${previewInput} w-full`}
                          value={valueString((n as any).descriptionRo || (n as any).description_ro)}
                          onChange={(e) => updateRowField(globalIndex, "descriptionRo", e.target.value)}
                          title={valueString((n as any).descriptionRo || (n as any).description_ro)}
                        />
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>Darab</span>
                        <input className={`${previewInput} w-full text-right`} value={valueString(n.qty)} onChange={(e) => updateRowField(globalIndex, "qty", e.target.value)} title={valueString(n.qty)} />
                      </label>
                      <label className={previewField}>
                        <span className={compactFieldLabel}>Vételár</span>
                        <input className={`${previewInput} w-full text-right`} value={valueString(n.buyPrice)} onChange={(e) => updateRowField(globalIndex, "buyPrice", e.target.value)} title={valueString(n.buyPrice)} />
                      </label>
                      <label className={previewField}>
                        <span
                          className={compactFieldLabel}
                          title={`Mentett RON végár: ${moneyText(sellPriceRonFromSource(n.sellPrice), "RON")}`}
                        >
                          Eladás {sellPriceSourceCurrency}
                        </span>
                        <input
                          className={`${previewInput} w-full text-right`}
                          value={valueString(n.sellPrice)}
                          onChange={(e) => updateRowField(globalIndex, "sellPrice", e.target.value)}
                          title={`${valueString(n.sellPrice)} ${sellPriceSourceCurrency} → ${moneyText(sellPriceRonFromSource(n.sellPrice), "RON")}`}
                        />
                      </label>
                      <div className={previewField}>
                        <span className={compactFieldLabel}>Állapot</span>
                        <div className={errors.length ? "h-[28px] truncate rounded-md border border-amber-200/25 bg-amber-400/10 px-2 py-1 text-[12px] leading-[18px] text-amber-50" : "h-[28px] truncate rounded-md border border-emerald-200/20 bg-emerald-400/10 px-2 py-1 text-[12px] leading-[18px] text-emerald-50"} title={rowMessage}>
                          {rowMessage}
                        </div>
                      </div>
                      <div className={previewField}>
                        <span className={compactFieldLabel}>Mentés</span>
                        <div className="grid grid-cols-[1fr_auto] gap-1">
                          <div className={approved ? "h-[28px] truncate rounded-md border border-[#67d4d1]/35 bg-[#208d8b]/18 px-2 py-1 text-center text-[12px] leading-[18px] text-white" : "h-[28px] truncate rounded-md border border-white/10 bg-black/10 px-2 py-1 text-center text-[12px] leading-[18px] text-white/55"}>
                            {approved ? "Kijelölve" : "Kizárva"}
                          </div>
                          {approved && (
                            <button
                              className="inline-flex h-[28px] items-center justify-center rounded-md border border-[#67d4d1]/45 bg-[#208d8b] px-2 text-[12px] text-white transition hover:bg-[#249b99] disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={saveDraft}
                              disabled={busy || !canSaveApprovedRows}
                              title={!canSaveApprovedRows ? "A mentéshez legyen kitöltve a receptió és ne legyen hibás kijelölt sor." : "Kijelölt sorok mentése"}
                              type="button"
                            >
                              Mentés
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!preview.length && (
                <div className="px-3 py-8 text-center text-white/60">Nincs beolvasott sor.</div>
              )}
            </div>
          </div>
          {rows.length > preview.length && (
            <div className="mt-3 flex justify-end">
              <button className={neutralBtn} onClick={() => setPreviewLimit((n) => Math.min(n + 25, rows.length))} type="button">
                További sorok
              </button>
            </div>
          )}
        </section>
        )}

        {incomingStep !== "reception" && (
        <section className={card}>
          <SectionTitle icon={<CheckCircle size={16} />} title="Import előzmények" right={<span className="text-xs text-white/60">Legutóbbi bevételezések</span>} />
          <div className="mt-3 grid gap-2">
            {batches.map((b) => (
              <div key={b.id} className="flex flex-col gap-3 rounded-xl border border-white/12 bg-[#354153] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-white">{b.supplier_name} • {b.source_file_name || "import"}</p>
                  <p className="mt-1 text-xs text-white/60">
                    {new Date(b.created_at).toLocaleString()} • {b.location_name || "-"} • terméksor: {b.row_count || 0} • ellenőrzendő: {b.error_count || 0} • {b.status}
                  </p>
                  {deleteImportBatchTarget?.id === b.id && (
                    <p className="mt-2 max-w-xl rounded-lg border border-amber-200/30 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-50">
                      Csak az import előzmény és a mentett import sorok törlődnek. A már létrehozott termékekhez, variánsokhoz és készlethez nem nyúl.
                    </p>
                  )}
                </div>
                {deleteImportBatchTarget?.id === b.id ? (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <button className={neutralBtn} onClick={() => setDeleteImportBatchTarget(null)} disabled={busy} type="button">
                      <X size={14} /> Mégse
                    </button>
                    <button className={dangerBtn} onClick={confirmDeleteImportBatchHistory} disabled={busy} type="button">
                      <Trash2 size={14} /> Előzmény törlése
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <button
                      className={primaryBtn}
                      disabled={busy || b.status === "committed" || Number(b.row_count || 0) <= 0 || Number(b.error_count || 0) > 0}
                      onClick={() => commitBatch(b)}
                      title={Number(b.row_count || 0) <= 0 ? "Nincs mentett terméksor ehhez az importhoz." : Number(b.error_count || 0) > 0 ? "Az importban ellenőrzendő vagy hibás sor van." : ""}
                      type="button"
                    >
                      <CheckCircle size={14} /> Készletre vétel
                    </button>
                    <button
                      className={dangerBtn}
                      disabled={busy}
                      onClick={() => setDeleteImportBatchTarget(b)}
                      title="Csak az import előzmény törlése. Termék/készlet marad."
                      type="button"
                    >
                      <Trash2 size={14} /> Törlés
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!batches.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-4 text-sm text-white/70">Még nincs import előzmény.</p>}
          </div>
        </section>
        )}
        {incomingStep !== "reception" && renderLoadedReceptionContent()}
      </div>
    </main>
  );
}
