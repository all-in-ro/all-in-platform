import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  Boxes,
  CheckCircle2,
  Clock3,
  Edit3,
  Eye,
  EyeOff,
  Filter,
  Home,
  ImagePlus,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";
import ShopifyStatusIcon, { isShopifyExportPending, isShopifyMappedItem, shopifyMappingHasError } from "../components/ShopifyStatusIcon";

type Props = {
  apiBase?: string;
  actor?: string;
  role?: string;
  shopId?: string;
  onLogout?: () => void;
};

type MetaItem = {
  id: string;
  code?: string | null;
  name?: string | null;
  name_ro?: string | null;
  name_hu?: string | null;
  parent_id?: string | null;
  parentId?: string | null;
  aliases?: string[] | null;
  is_active?: boolean;
};

type GenderType = { code: string; name: string; aliases?: string[] | null; is_active?: boolean };

type ColorType = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  name_en?: string | null;
  name_de?: string | null;
  aliases?: string[] | null;
  hex?: string | null;
  is_active?: boolean;
};

type SizeType = { id: string; code?: string; name?: string; name_hu?: string | null; aliases?: string[] | null; is_active?: boolean };

type StockItem = {
  variant_id: string;
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  qty?: number | string | null;
  reserved_qty?: number | string | null;
  available_qty?: number | string | null;
  updated_at?: string | null;
};

type InventoryItem = {
  variant_id: string;
  id?: string | null;
  internal_sku?: string | null;
  barcode?: string | null;
  display_barcode?: string | null;
  supplier_product_code?: string | null;
  supplierProductCode?: string | null;
  product_code?: string | null;
  productCode?: string | null;
  supplier_codes?: string | null;
  sn_cod?: string | null;
  snCod?: string | null;
  customs_tariff_code?: string | null;
  customsTariffCode?: string | null;
  hs_code?: string | null;
  attributes?: Record<string, unknown> | null;
  image_url?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  model_id?: string | null;
  model_code?: string | null;
  title_ro?: string | null;
  title_hu?: string | null;
  description_ro?: string | null;
  shopify_title?: string | null;
  gender?: string | null;
  product_type?: string | null;
  season?: string | null;
  material?: string | null;
  model_status?: string | null;
  category_code?: string | null;
  category_name_ro?: string | null;
  category_name_hu?: string | null;
  subcategory_id?: string | null;
  subcategory_code?: string | null;
  subcategory_name_ro?: string | null;
  subcategory_name_hu?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  size?: string | null;
  buy_price?: string | number | null;
  sell_price?: string | number | null;
  compare_at_price?: string | number | null;
  variant_status?: string | null;
  status?: string | null;
  total_qty?: number | string | null;
  total_reserved_qty?: number | string | null;
  available_qty?: number | string | null;
  last_stock_movement_at?: string | null;
  last_incoming_at?: string | null;
  shopify_mapped?: boolean | null;
  shopify_sync_status?: string | null;
  shopify_outbox_status?: string | null;
  shopify_product_id?: string | null;
  shopify_variant_id?: string | null;
  shopify_inventory_item_id?: string | null;
  shopify_product_title?: string | null;
  shopify_variant_title?: string | null;
  shopify_product_status?: string | null;
  shopify_last_synced_at?: string | null;
  shopify_last_error?: string | null;
  shopify_outbox_error?: string | null;
  shopify_export_id?: string | null;
  shopify_export_item_status?: string | null;
  shopify_export_status?: string | null;
  shopify_exported_at?: string | null;
  shopify_export_reconciled_at?: string | null;
  shopify_export_errors?: string[] | null;
  shopify_export_warnings?: string[] | null;
  shopify_export_pending?: boolean | null;
};

type DetailResponse = { item: InventoryItem & Record<string, any>; stock?: StockItem[]; supplierCodes?: any[]; movements?: any[] };

type MobileBarcodeConflictInfo = {
  barcode: string;
  conflictVariantId: string;
  title?: string | null;
  modelCode?: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  variantStatus?: string | null;
  modelStatus?: string | null;
  message?: string | null;
};

function barcodeConflictInfoFromApi(value: unknown): MobileBarcodeConflictInfo | null {
  const source = value && typeof value === "object" ? value as Record<string, any> : {};
  const conflict = source.conflict && typeof source.conflict === "object" ? source.conflict as Record<string, any> : {};
  const barcode = cleanScannedBarcode(source.barcode || conflict.barcode || "");
  const conflictVariantId = String(conflict.variantId || source.conflictVariantId || "").trim();
  if (!barcode || !conflictVariantId) return null;
  return {
    barcode,
    conflictVariantId,
    title: firstText(conflict.title) || null,
    modelCode: firstText(conflict.modelCode) || null,
    brand: firstText(conflict.brand) || null,
    color: firstText(conflict.color) || null,
    size: firstText(conflict.size) || null,
    variantStatus: firstText(conflict.variantStatus) || null,
    modelStatus: firstText(conflict.modelStatus) || null,
    message: firstText(source.error, source.message) || null,
  };
}

function mobileBarcodeConflictInfoFromItem(item: InventoryItem, barcode: string): MobileBarcodeConflictInfo {
  return {
    barcode: cleanScannedBarcode(barcode || item.barcode || ""),
    conflictVariantId: selectedVariantIdFromItem(item as any),
    title: firstText(item.title_ro, item.shopify_title, item.title_hu) || null,
    modelCode: firstText(item.model_code) || null,
    brand: firstText(item.brand_name, item.brand_code) || null,
    color: firstText(item.color_name, item.color_code) || null,
    size: firstText(item.size) || null,
    variantStatus: firstText(item.variant_status, item.status) || null,
    modelStatus: firstText(item.model_status) || null,
  };
}

function MobileBarcodeConflictNotice({
  info,
  onOpen,
}: {
  info: MobileBarcodeConflictInfo;
  onOpen?: (() => void) | null;
}) {
  const meta = [info.brand, info.color, info.size].map((value) => String(value || "").trim()).filter(Boolean).join(" • ");
  const archived = String(info.variantStatus || "").toLowerCase() === "archived" || String(info.modelStatus || "").toLowerCase() === "archived";
  return (
    <div className="rounded-2xl border border-rose-300/40 bg-rose-500/12 p-3 text-rose-50 shadow-[0_0_0_1px_rgba(244,63,94,0.08)]">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-200/35 bg-rose-500/20 text-rose-100">
          <AlertTriangle size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">Ez az SKU már használatban van</p>
          <p className="mt-0.5 text-xs leading-relaxed text-rose-100/78">
            A <span className="font-semibold text-white">{info.barcode}</span> kód már egy másik termékvariánshoz tartozik, ezért ezt az SKU-t a rendszer nem fogadja el.
          </p>
        </div>
      </div>
      <div className="mt-2.5 rounded-xl border border-white/12 bg-black/15 px-3 py-2">
        <p className="truncate text-sm text-white" title={info.title || info.modelCode || info.conflictVariantId}>
          {info.title || info.modelCode || "Már létező termék"}
        </p>
        <p className="mt-0.5 text-xs text-rose-100/70">{meta || `Variáns: ${info.conflictVariantId}`}{archived ? " • archivált" : ""}</p>
      </div>
      <p className="mt-2 text-xs text-rose-100/72">Az SKU nem lett elmentve. Minden variánsnak egyedi Vonalkód / Shopify SKU szükséges.</p>
      {onOpen && info.conflictVariantId ? (
        <button className={`${softBtn} mt-2 w-full`} type="button" onClick={onOpen}>
          <Eye size={14} /> Termék megnyitása
        </button>
      ) : null}
    </div>
  );
}

type VariantHistoryEvent = {
  id: string;
  created_at?: string | null;
  event_type?: string | null;
  direction?: "in" | "out" | "adjust" | string | null;
  movement_type?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  qty_delta?: number | string | null;
  qty_before?: number | string | null;
  qty_after?: number | string | null;
  raw?: Record<string, any> | null;
  location_name?: string | null;
  from_location_name?: string | null;
  to_location_name?: string | null;
  effective_buy_price?: number | string | null;
  effective_sell_price?: number | string | null;
  invoice_number?: string | null;
  source_file_name?: string | null;
  supplier_name?: string | null;
};

type VariantHistorySummary = {
  currentQty?: number | string | null;
  availableQty?: number | string | null;
  totalIncomingQty?: number | string | null;
  totalOutgoingQty?: number | string | null;
  totalTransferredQty?: number | string | null;
  avgBuyPrice?: number | string | null;
  lastBuyPrice?: number | string | null;
  lastSellPrice?: number | string | null;
  marginWithoutTva?: number | string | null;
};

type VariantHistoryResponse = {
  item?: InventoryItem & Record<string, any>;
  stock?: StockItem[];
  summary?: VariantHistorySummary;
  events?: VariantHistoryEvent[];
};

type EditForm = {
  titleRo: string;
  titleHu: string;
  descriptionRo: string;
  gender: string;
  productType: string;
  season: string;
  material: string;
  shopifyTitle: string;
  modelStatus: string;
  brandCode: string;
  categoryCode: string;
  subCategoryCode: string;
  barcode: string;
  supplierProductCode: string;
  snCod: string;
  customsTariffCode: string;
  colorCode: string;
  colorName: string;
  size: string;
  buyPrice: string;
  sellPrice: string;
  compareAtPrice: string;
  imageUrl: string;
  variantStatus: string;
};


type SortMode = "name" | "brand" | "stock_desc" | "stock_asc" | "value_desc" | "incoming_desc" | "missing";
type StockFilter = "all" | "available" | "out" | "reserved" | "missing" | "inactive" | "watch";
type ImageFilter = "all" | "with" | "missing";
type ShopifyFilter = "all" | "mapped" | "exported" | "unmapped" | "error";

const WAREHOUSE_SALES_TVA_RATE_PERCENT = 21;
const page = "min-h-screen bg-[#4b5362] pb-28 text-white font-normal";
const sheetPanel = "fixed inset-x-0 bottom-0 z-[70] max-h-[86vh] overflow-auto rounded-t-[28px] border border-white/18 bg-[#303a4c] p-4 shadow-2xl shadow-black/50";
const input = "h-11 w-full rounded-2xl border border-white/16 bg-[#263246] px-3 text-sm text-white outline-none placeholder:text-white/42 focus:border-[#7bd7d4]/65";
const select = `${input} pr-8`;
const label = "grid gap-1.5 text-[11px] uppercase tracking-[0.06em] text-white/62";
const primaryBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[#7bd7d4]/45 bg-[#2a8d8b] px-3 text-xs font-medium text-white shadow-[0_10px_24px_rgba(42,141,139,0.22)] transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50";
const softBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/16 bg-white/[0.08] px-3 text-xs font-medium text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50";
const iconBtn = "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/16 bg-white/[0.08] text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50";
const headerIconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/16 bg-white/[0.08] text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50";
const headerIconBtnActive = "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/45 bg-[#2a8d8b] text-white shadow-[0_8px_18px_rgba(42,141,139,0.20)] transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50";
const selectedProductsStorageKey = "allinfashion:warehouse:selectedVariants:v1";
const stockMovesChangedStorageKey = "allinfashion:stockMoves:changed:v1";
const stockMovesChangedEventName = "aif:stock-moves-changed";
const warehouseShowAllAfterIncomingStorageKey = "allinfashion:warehouse:showAllAfterIncoming:v1";
const warehouseShowAllAfterIncomingEventName = "aif:warehouse-show-all-after-incoming";
const WAREHOUSE_BARCODE_SCAN_FORMATS = [
  "code_128",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_39",
  "code_93",
  "itf",
  "codabar",
  "qr_code",
  "data_matrix",
];
const WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};
const WAREHOUSE_ZXING_BROWSER_CDN = "https://unpkg.com/@zxing/browser@0.1.5";
let warehouseZxingBrowserPromise: Promise<any | null> | null = null;

function cleanScannedBarcode(value: unknown) {
  return String(value ?? "").replace(/[\r\n\t]+/g, "").trim();
}

function zxingResultText(result: unknown) {
  const r = result as any;
  if (!r) return "";
  if (typeof r.getText === "function") return cleanScannedBarcode(r.getText());
  return cleanScannedBarcode(r.text || r.rawValue || "");
}

function loadWarehouseZxingBrowser(): Promise<any | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  const existingGlobal = (window as any).ZXingBrowser;
  if (existingGlobal?.BrowserMultiFormatReader || existingGlobal?.BrowserMultiFormatOneDReader) return Promise.resolve(existingGlobal);
  if (warehouseZxingBrowserPromise) return warehouseZxingBrowserPromise;

  warehouseZxingBrowserPromise = new Promise((resolve) => {
    const finish = () => resolve((window as any).ZXingBrowser || null);
    const existing = document.querySelector<HTMLScriptElement>('script[data-aif-zxing-browser="true"]');
    if (existing) {
      if (existing.dataset.loaded === "true") {
        finish();
        return;
      }
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = WAREHOUSE_ZXING_BROWSER_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.aifZxingBrowser = "true";
    script.onload = () => {
      script.dataset.loaded = "true";
      finish();
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return warehouseZxingBrowserPromise;
}

function n(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return "-";
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return String(value);
  return parsed.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qty(value: unknown) {
  return Math.floor(n(value)).toLocaleString("hu-HU");
}

function priceNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function sellPriceWithoutTva(value: unknown, tvaRatePercent = WAREHOUSE_SALES_TVA_RATE_PERCENT) {
  const gross = priceNumber(value);
  if (gross === null) return null;
  const divisor = 1 + Math.max(0, Number(tvaRatePercent) || 0) / 100;
  const net = gross / divisor;
  return Number.isFinite(net) ? net : null;
}

function priceMarkupPercentValue(buyPrice: unknown, sellPrice: unknown) {
  const buy = priceNumber(buyPrice);
  const sellNet = sellPriceWithoutTva(sellPrice);
  if (!buy || buy <= 0 || sellNet === null) return null;
  const percent = ((sellNet - buy) / buy) * 100;
  return Number.isFinite(percent) ? percent : null;
}

function priceMarkupPercentText(buyPrice: unknown, sellPrice: unknown) {
  const percent = priceMarkupPercentValue(buyPrice, sellPrice);
  if (percent === null) return "";
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toLocaleString("hu-HU", { maximumFractionDigits: 0 })}%`;
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function firstCsvText(value: unknown) {
  return String(value ?? "").split(",").map((x) => x.trim()).find(Boolean) || "";
}

function splitCsv(value: unknown) {
  return String(value ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

function dateTimeMs(value: unknown) {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function dateShort(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ro-RO");
}

function latestIncomingMs(item: Partial<InventoryItem>) {
  return Math.max(dateTimeMs(item.last_incoming_at), dateTimeMs(item.last_stock_movement_at));
}

function categoryParentId(row?: Partial<MetaItem> | null) {
  return String(row?.parent_id || row?.parentId || "").trim();
}

function isMainCategory(row?: Partial<MetaItem> | null) {
  return !categoryParentId(row);
}

function categoryLabel(row?: Partial<MetaItem> | null) {
  if (!row) return "-";
  return firstText(row.name_hu, row.name_ro, row.name, row.code, row.id) || "-";
}

function metaValues(row?: Partial<MetaItem> | null) {
  if (!row) return [];
  return [row.id, row.code, row.name, row.name_ro, row.name_hu, ...(Array.isArray(row.aliases) ? row.aliases : [])]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function metaMatches(row: Partial<MetaItem> | null | undefined, value: unknown) {
  const key = normalizeSearch(value);
  return Boolean(row && key && metaValues(row).some((x) => normalizeSearch(x) === key));
}

function itemProductCode(item: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (item || {}) as Record<string, any>;
  const direct = firstText(
    source.supplier_product_code,
    source.supplierProductCode,
    source.product_code,
    source.productCode,
    source.import_supplier_product_code,
    source.importSupplierProductCode,
    firstCsvText(source.supplier_codes),
  );
  if (direct) return direct;
  const barcodeLike = firstText(source.display_barcode, source.barcode);
  const internal = firstText(source.internal_sku, source.internalSku);
  if (barcodeLike && barcodeLike !== internal && !/^AIF[-_]/i.test(barcodeLike) && /[-_/]/.test(barcodeLike)) return barcodeLike;
  const model = firstText(source.model_code, source.modelCode);
  if (!model) return "";
  return model.includes(":") ? (model.split(":").pop() || model).trim() : model;
}

function visibleWarehouseBarcode(item: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (item || {}) as Record<string, any>;
  const raw = firstText(source.barcode, source.display_barcode);
  if (!raw) return "";
  const internal = firstText(source.internal_sku, source.internalSku);
  const productCode = itemProductCode(source);
  if (internal && raw === internal) return "";
  if (productCode && normalizeSearch(raw) === normalizeSearch(productCode)) return "";
  if (/^AIF[-_]/i.test(raw)) return "";
  return raw;
}

function itemMatchesScannedBarcode(item: InventoryItem, scannedBarcode: unknown) {
  const q = normalizeSearch(cleanScannedBarcode(scannedBarcode));
  if (!q) return false;
  const values = [
    visibleWarehouseBarcode(item),
    item.barcode,
    item.display_barcode,
    item.internal_sku,
    item.model_code,
    itemProductCode(item),
    item.supplier_product_code,
    item.supplierProductCode,
    item.product_code,
    item.productCode,
    item.sn_cod,
    item.snCod,
    itemCustomsTariffCode(item),
    item.supplier_codes,
    ...splitCsv(item.supplier_codes),
  ];
  return values
    .map((value) => normalizeSearch(cleanScannedBarcode(value)))
    .filter(Boolean)
    .some((value) => value === q);
}

function itemCustomsTariffCode(item: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (item || {}) as Record<string, any>;
  const attrs = source.attributes && typeof source.attributes === "object" ? source.attributes as Record<string, unknown> : {};
  return firstText(
    source.customs_tariff_code,
    source.customsTariffCode,
    source.hs_code,
    attrs.customsTariffCode,
    attrs.customs_tariff_code,
    attrs.hsCode,
    attrs.hs_code,
    attrs.tariffCode,
    attrs.tariff_code,
  );
}

function itemTitle(item: Partial<InventoryItem>) {
  return firstText(item.title_ro, item.shopify_title, item.title_hu, item.model_code, itemProductCode(item)) || "Névtelen termék";
}

function itemMainCategory(item: Partial<InventoryItem>) {
  return firstText(item.category_name_hu, item.category_name_ro, item.category_code) || "-";
}

function itemSubCategory(item: Partial<InventoryItem>) {
  return firstText(item.subcategory_name_hu, item.subcategory_name_ro, item.subcategory_code, item.product_type);
}

function itemStatus(item: Partial<InventoryItem>) {
  return String(item.variant_status || item.status || "active").toLowerCase();
}

function modelStatus(item: Partial<InventoryItem>) {
  return String(item.model_status || "active").toLowerCase();
}

function needsAttention(item: Partial<InventoryItem>) {
  return !item.image_url || !visibleWarehouseBarcode(item) || !item.buy_price || !item.sell_price || !item.title_ro || !item.size || itemStatus(item) !== "active" || modelStatus(item) !== "active";
}

function colorKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function colorValues(row?: Partial<ColorType> | null) {
  if (!row) return [];
  return [row.id, row.code, row.name_ro, row.name_hu, row.name_en, row.name_de, ...(Array.isArray(row.aliases) ? row.aliases : [])]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

const COLOR_RO_MAP: Record<string, string> = {
  black: "negru", fekete: "negru", negru: "negru",
  white: "alb", feher: "alb", fehér: "alb", alb: "alb",
  blue: "albastru", kek: "albastru", kék: "albastru", albastru: "albastru",
  green: "verde", zold: "verde", zöld: "verde", verde: "verde",
  red: "roșu", rosu: "roșu", roșu: "roșu", piros: "roșu",
  grey: "gri", gray: "gri", szurke: "gri", szürke: "gri", gri: "gri",
  yellow: "galben", sarga: "galben", sárga: "galben", galben: "galben",
  orange: "portocaliu", narancs: "portocaliu", portocaliu: "portocaliu",
  brown: "maro", barna: "maro", maro: "maro",
  beige: "bej", bezs: "bej", bézs: "bej", bej: "bej",
  pink: "roz", roz: "roz", purple: "mov", lila: "mov", mov: "mov",
};

function officialColorRo(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return COLOR_RO_MAP[colorKey(raw)] || raw;
}

function findColorTypeByValue(colors: ColorType[], value: unknown) {
  const key = colorKey(value);
  if (!key) return null;
  return colors.find((row) => colorValues(row).some((candidate) => colorKey(candidate) === key)) || null;
}

function officialColorFromTypes(value: unknown, colors: ColorType[]) {
  const found = findColorTypeByValue(colors, value);
  return found?.name_ro || officialColorRo(value);
}

function normalizeSize(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[\s._-]+/g, "");
  if (["OSF", "OSFM", "ONESIZEFITSMOST"].includes(key)) return "OSFM";
  if (["OSFA", "ONESIZEFITSALL"].includes(key)) return "OSFA";
  if (["ONESIZE", "UNIVERSAL", "UNI"].includes(key)) return "ONE SIZE";
  return raw.toUpperCase();
}

function normalizeColor(value: unknown) {
  return officialColorRo(value);
}

function goHome() {
  window.location.hash = "#allin";
}


function notifyStockMovesChanged(detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = { at: new Date().toISOString(), ...detail };
  try { window.localStorage.setItem(stockMovesChangedStorageKey, JSON.stringify(payload)); } catch {}
  try { window.dispatchEvent(new CustomEvent(stockMovesChangedEventName, { detail: payload })); } catch {}
}

function selectedVariantIdFromItem(item: Partial<InventoryItem> & Record<string, any>) {
  return String(item.variant_id || item.selected_variant_id || item.variantId || item.id || "").trim();
}

function readSavedSelectedVariants() {
  if (typeof window === "undefined") return {} as Record<string, boolean>;
  try {
    const raw = window.localStorage.getItem(selectedProductsStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.reduce<Record<string, boolean>>((acc, id) => { const key = String(id || "").trim(); if (key) acc[key] = true; return acc; }, {});
    if (parsed && typeof parsed === "object") return Object.entries(parsed).reduce<Record<string, boolean>>((acc, [id, value]) => { if (value) acc[String(id)] = true; return acc; }, {});
  } catch {}
  return {};
}

function saveSelectedVariants(selected: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  const ids = Object.keys(selected).filter((id) => selected[id]);
  if (!ids.length) window.localStorage.removeItem(selectedProductsStorageKey);
  else window.localStorage.setItem(selectedProductsStorageKey, JSON.stringify(ids));
}

function emptyForm(): EditForm {
  return {
    titleRo: "",
    titleHu: "",
    descriptionRo: "",
    gender: "unisex",
    productType: "",
    season: "",
    material: "",
    shopifyTitle: "",
    modelStatus: "active",
    brandCode: "",
    categoryCode: "",
    subCategoryCode: "",
    barcode: "",
    supplierProductCode: "",
    snCod: "",
    customsTariffCode: "",
    colorCode: "",
    colorName: "",
    size: "",
    buyPrice: "",
    sellPrice: "",
    compareAtPrice: "",
    imageUrl: "",
    variantStatus: "active",
  };
}


function fieldValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function formFromItem(item: Partial<InventoryItem> & Record<string, any>): EditForm {
  const cleanModelStatus = String(item.model_status || item.modelStatus || "active").trim().toLowerCase();
  const storedVariantStatus = String(item.variant_status || item.variantStatus || item.status || "active").trim().toLowerCase();
  const cleanVariantStatus = cleanModelStatus !== "active" && storedVariantStatus === "active" ? "inactive" : storedVariantStatus;
  return {
    titleRo: fieldValue(item.title_ro),
    titleHu: fieldValue(item.title_hu),
    descriptionRo: fieldValue(item.description_ro),
    gender: fieldValue(item.gender || "unisex"),
    productType: fieldValue(item.product_type),
    season: fieldValue(item.season),
    material: fieldValue(item.material),
    shopifyTitle: fieldValue(item.shopify_title),
    modelStatus: fieldValue(cleanModelStatus),
    brandCode: fieldValue(item.brand_code || item.brandCode),
    categoryCode: fieldValue(item.category_code || item.categoryCode),
    subCategoryCode: fieldValue(item.subcategory_code || item.subCategoryCode),
    barcode: visibleWarehouseBarcode(item),
    supplierProductCode: itemProductCode(item),
    snCod: fieldValue(item.sn_cod || item.snCod),
    customsTariffCode: itemCustomsTariffCode(item),
    colorCode: fieldValue(item.color_code || item.colorCode),
    colorName: fieldValue(item.color_name || item.colorName),
    size: fieldValue(item.size),
    buyPrice: fieldValue(item.buy_price),
    sellPrice: fieldValue(item.sell_price),
    compareAtPrice: fieldValue(item.compare_at_price),
    imageUrl: fieldValue(item.image_url),
    variantStatus: fieldValue(cleanVariantStatus),
  };
}

function ProductImage({ src, alt, onPreview, size = "normal" }: { src?: string | null; alt?: string; onPreview?: () => void; size?: "normal" | "large" }) {
  const clean = String(src || "").trim();
  const cls = size === "large" ? "h-28 w-24" : "h-[92px] w-[74px]";
  return (
    <button
      type="button"
      onClick={clean ? onPreview : undefined}
      disabled={!clean}
      className={`${cls} grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/20 bg-white text-slate-400 shadow-sm disabled:cursor-default`}
      aria-label={clean ? "Termékkép nagyítása" : "Nincs termékkép"}
    >
      {clean ? <img src={clean} alt={alt || ""} className="h-full w-full object-contain p-1" loading="lazy" /> : <ImagePlus size={24} />}
    </button>
  );
}

function MobileBackdrop({ onClose }: { onClose: () => void }) {
  return <button type="button" aria-label="Bezárás" className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm" onClick={onClose} />;
}


function historyDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("hu-HU", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function historyPercent(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return "-";
  const x = Number(value);
  if (!Number.isFinite(x)) return "-";
  return `${x > 0 ? "+" : ""}${x.toLocaleString("hu-HU", { maximumFractionDigits: 0 })}%`;
}

function historyQty(value: unknown, signed = false) {
  const x = Math.trunc(n(value));
  return `${signed && x > 0 ? "+" : ""}${x.toLocaleString("hu-HU")} db`;
}

function historyEventBadge(event: VariantHistoryEvent) {
  const type = String(event.event_type || "").toLowerCase();
  const direction = String(event.direction || "").toLowerCase();
  if (type === "transfer") return { label: "Áthelyezés", cls: "border-sky-300/35 bg-sky-500/16 text-sky-50" };
  if (type === "inventory") return { label: "Leltár", cls: "border-violet-300/35 bg-violet-500/16 text-violet-50" };
  if (type === "incoming" || direction === "in") return { label: "Bevételezés", cls: "border-[#7bd7d4]/35 bg-[#2a8d8b]/24 text-[#d7fffd]" };
  if (type === "outgoing" || direction === "out") return { label: "Kimenő", cls: "border-rose-300/35 bg-rose-500/16 text-rose-50" };
  return { label: "Korrekció", cls: "border-amber-300/35 bg-amber-500/16 text-amber-50" };
}

function MobileHistorySheet({
  target,
  history,
  loading,
  error,
  pricesVisible,
  onClose,
  onReload,
}: {
  target: InventoryItem | null;
  history: VariantHistoryResponse | null;
  loading: boolean;
  error: string;
  pricesVisible: boolean;
  onClose: () => void;
  onReload: () => void;
}) {
  if (!target) return null;
  const item = { ...(target as any), ...(history?.item || {}) } as InventoryItem & Record<string, any>;
  const summary = history?.summary || {};
  const events = history?.events || [];
  return (
    <>
      <MobileBackdrop onClose={onClose} />
      <section className={`${sheetPanel} z-[75] space-y-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/70">Termék életút</p>
            <h2 className="mt-1 line-clamp-2 text-lg leading-tight text-white">{itemTitle(item)}</h2>
            <p className="mt-1 text-xs text-white/55">{item.brand_name || "-"} • {officialColorRo(firstText(item.color_name, item.color_code)) || "-"} • {item.size || "-"}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button className={iconBtn} onClick={onReload} disabled={loading} type="button" aria-label="Frissítés"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
            <button className={iconBtn} onClick={onClose} type="button" aria-label="Bezárás"><X size={16} /></button>
          </div>
        </div>

        <div className="flex gap-3 rounded-3xl border border-white/12 bg-white/[0.06] p-3">
          <ProductImage src={item.image_url} alt={itemTitle(item)} size="large" />
          <div className="min-w-0 flex-1 text-xs text-white/65">
            <div className="rounded-full border border-[#5bd0cc]/30 bg-[#203f49] px-2 py-1 text-[#cffffd]">Termékkód: {itemProductCode(item) || "-"}</div>
            {visibleWarehouseBarcode(item) ? <div className="mt-1 rounded-full border border-white/12 bg-white/[0.07] px-2 py-1">Vonalkód: {visibleWarehouseBarcode(item)}</div> : null}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div><span className="block text-white/40">Készlet</span><strong className="text-white">{historyQty(summary.currentQty ?? item.total_qty)}</strong></div>
              <div><span className="block text-white/40">Elérhető</span><strong className="text-white">{historyQty(summary.availableQty ?? item.available_qty)}</strong></div>
            </div>
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-rose-300/25 bg-rose-500/12 px-3 py-2 text-sm text-rose-50">{error}</div> : null}
        {loading && !history ? <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 text-center text-sm text-white/62">Életút betöltése...</div> : null}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl border border-white/12 bg-[#263246] p-3"><p className="text-white/46">Bejött</p><p className="mt-1 text-lg text-white">{historyQty(summary.totalIncomingQty)}</p></div>
          <div className="rounded-2xl border border-white/12 bg-[#263246] p-3"><p className="text-white/46">Kiment</p><p className="mt-1 text-lg text-white">{historyQty(summary.totalOutgoingQty)}</p></div>
          <div className="rounded-2xl border border-white/12 bg-[#263246] p-3"><p className="text-white/46">Átmozgatva</p><p className="mt-1 text-lg text-white">{historyQty(summary.totalTransferredQty)}</p></div>
          <div className="rounded-2xl border border-white/12 bg-[#263246] p-3"><p className="text-white/46">Haszon TVA nélkül</p><p className="mt-1 text-lg text-[#cffffd]">{pricesVisible ? historyPercent(summary.marginWithoutTva) : "••••"}</p></div>
        </div>

        <div className="rounded-3xl border border-white/12 bg-white/[0.05]">
          <div className="border-b border-white/10 px-3 py-2 text-sm text-white">Idővonal</div>
          <div className="divide-y divide-white/10">
            {events.map((event) => {
              const badge = historyEventBadge(event);
              const route = event.from_location_name || event.to_location_name
                ? `${event.from_location_name || event.location_name || "-"} → ${event.to_location_name || event.location_name || "-"}`
                : event.location_name || "-";
              return (
                <div key={event.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${badge.cls}`}>{badge.label}</span>
                    <span className="text-xs text-white/50">{historyDateTime(event.created_at)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs text-white/62">
                      <p className="truncate">{route}</p>
                      {event.supplier_name ? <p className="truncate">Beszállító: {event.supplier_name}</p> : null}
                      {event.invoice_number ? <p className="truncate">Számla: {event.invoice_number}</p> : null}
                      {event.source_file_name ? <p className="truncate">{event.source_file_name}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg leading-none text-white">{historyQty(event.qty_delta, true)}</p>
                      <p className="mt-1 text-[11px] text-white/46">{historyQty(event.qty_before)} → {historyQty(event.qty_after)}</p>
                    </div>
                  </div>
                  <div className="mt-2 rounded-2xl border border-white/10 bg-[#202838] px-3 py-2 text-[11px] text-white/62">
                    <div className="flex justify-between gap-3"><span>Vételár</span><strong className="text-white">{pricesVisible ? money(event.effective_buy_price) : "••••"}</strong></div>
                    <div className="mt-1 flex justify-between gap-3"><span>Eladási ár</span><strong className="text-white">{money(event.effective_sell_price)}</strong></div>
                    <div className="mt-1 flex justify-between gap-3"><span>Haszon TVA nélkül</span><strong className="text-[#cffffd]">{pricesVisible ? priceMarkupPercentText(event.effective_buy_price, event.effective_sell_price) || "-" : "••••"}</strong></div>
                  </div>
                </div>
              );
            })}
            {!events.length && !loading ? <div className="p-6 text-center text-sm text-white/55">Még nincs naplózott esemény ennél a terméknél.</div> : null}
          </div>
        </div>
      </section>
    </>
  );
}

export default function AllInWarehouseMobile({ apiBase = "/api" }: Props) {
  const aifBase = `${apiBase.replace(/\/$/, "")}/aif`;
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stockRows, setStockRows] = useState<StockItem[]>([]);
  const [brands, setBrands] = useState<MetaItem[]>([]);
  const [categories, setCategories] = useState<MetaItem[]>([]);
  const [genderTypes, setGenderTypes] = useState<GenderType[]>([]);
  const [colorTypes, setColorTypes] = useState<ColorType[]>([]);
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [locations, setLocations] = useState<MetaItem[]>([]);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");
  const [subCategory, setSubCategory] = useState("all");
  const [gender, setGender] = useState("all");
  const [color, setColor] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [shopifyFilter, setShopifyFilter] = useState<ShopifyFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buyPricesVisible, setBuyPricesVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [duplicateSkuOpen, setDuplicateSkuOpen] = useState(false);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [edit, setEdit] = useState<EditForm>(emptyForm());
  const [editBarcodeConflict, setEditBarcodeConflict] = useState<MobileBarcodeConflictInfo | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<InventoryItem | null>(null);
  const [variantHistory, setVariantHistory] = useState<VariantHistoryResponse | null>(null);
  const [variantHistoryBusy, setVariantHistoryBusy] = useState(false);
  const [variantHistoryError, setVariantHistoryError] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stockEditorTarget, setStockEditorTarget] = useState<InventoryItem | null>(null);
  const [stockEditorRows, setStockEditorRows] = useState<Record<string, string>>({});
  const [stockEditorAllowTotalChange, setStockEditorAllowTotalChange] = useState(false);
  const [stockEditorReasonCode, setStockEditorReasonCode] = useState("");
  const [stockEditorReasonText, setStockEditorReasonText] = useState("");
  const [stockEditorNote, setStockEditorNote] = useState("");
  const [stockEditorWarning, setStockEditorWarning] = useState("");
  const [imagePreview, setImagePreview] = useState<{ src: string; title: string } | null>(null);
  const [focusVariantIds, setFocusVariantIds] = useState<string[]>([]);
  const [focusLabel, setFocusLabel] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, boolean>>(() => readSavedSelectedVariants());
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [barcodeScannerStatus, setBarcodeScannerStatus] = useState("");
  const [barcodeScannerManualValue, setBarcodeScannerManualValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeVideoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeStreamRef = useRef<MediaStream | null>(null);
  const barcodeZxingControlsRef = useRef<any | null>(null);
  const barcodeScanRafRef = useRef<number | null>(null);
  const barcodeScannerHandlingRef = useRef(false);
  const stockEditorSaveLockRef = useRef(false);

  async function fetchAifJSON<T>(path: string, init?: RequestInit): Promise<T> {
    const method = String(init?.method || "GET").toUpperCase();
    const res = await fetch(`${aifBase}${path}`, {
      credentials: "include",
      cache: method === "GET" ? "no-store" : "default",
      headers: init?.body instanceof FormData ? { ...(init?.headers || {}) } : { "Content-Type": "application/json", ...(init?.headers || {}) },
      ...init,
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const error = new Error(String((data && (data.error || data.message)) || `${res.status} ${res.statusText}`)) as Error & Record<string, any>;
      error.status = res.status;
      if (data && typeof data === "object") Object.assign(error, data);
      throw error;
    }
    return data as T;
  }

  async function apiInventory(onProgress?: (items: InventoryItem[], done: boolean) => void) {
    const pageSize = 2500;
    const maxRows = 30000;
    const items: InventoryItem[] = [];
    const seenVariantIds = new Set<string>();

    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const page = await fetchAifJSON<{
        items: InventoryItem[];
        hasMore?: boolean;
        returned?: number;
        fastPage?: boolean;
      }>(`/inventory?limit=${pageSize}&offset=${offset}&includeZero=1&fastPage=1&_=${Date.now()}`);

      const rows = Array.isArray(page.items) ? page.items : [];
      let added = 0;
      for (const item of rows) {
        const id = selectedVariantIdFromItem(item as any) || String(item.variant_id || "").trim();
        if (!id || seenVariantIds.has(id)) continue;
        seenVariantIds.add(id);
        items.push(item);
        added += 1;
      }

      const done = rows.length < pageSize || page.hasMore === false;
      onProgress?.(items.slice(), done);
      if (done) break;

      if (offset > 0 && added === 0) {
        throw new Error("A szerveren még nem a gyorsított inventory API fut. Cseréld az aif.js fájlt is a mostani csomagból.");
      }
    }

    return { items };
  }

  async function apiMeta() {
    return fetchAifJSON<{
      suppliers?: MetaItem[];
      brands?: MetaItem[];
      categories?: MetaItem[];
      genderTypes?: GenderType[];
      colorTypes?: ColorType[];
      sizeTypes?: SizeType[];
      locations?: MetaItem[];
    }>(`/meta?_=${Date.now()}`);
  }

  async function apiStock() {
    return fetchAifJSON<{ items: StockItem[] }>(`/stock?_=${Date.now()}`);
  }

  async function apiVariantDetail(id: string) {
    return fetchAifJSON<DetailResponse>(`/variants/${encodeURIComponent(id)}`);
  }

  async function apiVariantHistory(id: string) {
    return fetchAifJSON<VariantHistoryResponse>(`/variants/${encodeURIComponent(id)}/history?limit=700`);
  }

  async function apiVariantUpdate(id: string, payload: Record<string, unknown>) {
    return fetchAifJSON<{ ok: true }>(`/variants/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  async function apiBarcodeConflictCheck(barcode: string, excludeVariantId = "") {
    const cleanBarcode = cleanScannedBarcode(barcode);
    if (!cleanBarcode) return { ok: true as const, barcode: "", conflict: null as Record<string, any> | null };
    const qs = new URLSearchParams();
    qs.set("barcode", cleanBarcode);
    if (excludeVariantId) qs.set("excludeVariantId", excludeVariantId);
    qs.set("_", String(Date.now()));
    return fetchAifJSON<{ ok: true; barcode: string; conflict: Record<string, any> | null }>(`/barcode-conflict?${qs.toString()}`);
  }

  async function apiVariantStockUpdate(
    id: string,
    rows: Array<{ locationId?: string; locationCode?: string; qty: number; reservedQty?: number }>,
    options: { allowTotalChange: boolean; reasonCode?: string; reasonText?: string; note?: string },
  ) {
    return fetchAifJSON<{ ok: true; stock?: StockItem[] }>(`/variants/${encodeURIComponent(id)}/stock`, {
      method: "PATCH",
      body: JSON.stringify({
        rows,
        mode: options.allowTotalChange ? "correction" : "redistribute",
        allowTotalChange: options.allowTotalChange,
        reasonCode: options.reasonCode || null,
        reasonText: options.reasonText || null,
        note: options.note || null,
      }),
    });
  }

  async function apiStockTransfer(payload: {
    title: string;
    note?: string;
    idempotencyKey: string;
    lines: Array<{ variantId: string; fromLocationId: string; toLocationId: string; qty: number }>;
  }) {
    return fetchAifJSON<{
      ok: true;
      duplicate?: boolean;
      transferId?: string | null;
      documentId?: string | null;
      documentNumber?: string | null;
      documentTotalValue?: number | string | null;
      documents?: Array<{ documentNumber?: string | null; transferId?: string | null; documentTotalValue?: number | string | null }>;
    }>(`/stock-transfers`, {
      method: "POST",
      headers: { "Idempotency-Key": payload.idempotencyKey },
      body: JSON.stringify(payload),
    });
  }

  async function uploadImage(file: File, variantId: string) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", `products/${variantId}`);
    fd.append("name", file.name);
    const uploadBase = apiBase.replace(/\/$/, "");
    const res = await fetch(`${uploadBase}/uploads/r2`, { method: "POST", credentials: "include", body: fd });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Nem sikerült feltölteni a képet.");
    return data as { key: string; url: string };
  }

  const editBarcodeMatches = useMemo(() => {
    const currentVariantId = String(detail?.item?.id || detail?.item?.variant_id || "").trim();
    const barcode = cleanScannedBarcode(edit.barcode);
    if (!currentVariantId || !barcode) return [] as InventoryItem[];
    const key = barcode.toLowerCase();
    return items
      .filter((item) => selectedVariantIdFromItem(item as any) !== currentVariantId)
      .filter((item) => cleanScannedBarcode(item.barcode || "").toLowerCase() === key)
      .slice(0, 4);
  }, [detail?.item?.id, detail?.item?.variant_id, edit.barcode, items]);

  const effectiveEditBarcodeConflict = useMemo(
    () => editBarcodeConflict || (editBarcodeMatches[0] ? mobileBarcodeConflictInfoFromItem(editBarcodeMatches[0], edit.barcode) : null),
    [editBarcodeConflict, editBarcodeMatches, edit.barcode],
  );

  useEffect(() => {
    const currentVariantId = String(detail?.item?.id || detail?.item?.variant_id || "").trim();
    if (!detailOpen || !currentVariantId) {
      setEditBarcodeConflict(null);
      return;
    }
    const barcode = cleanScannedBarcode(edit.barcode);
    if (!barcode) {
      setEditBarcodeConflict(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void apiBarcodeConflictCheck(barcode, currentVariantId)
        .then((result) => {
          if (cancelled) return;
          setEditBarcodeConflict(result.conflict ? barcodeConflictInfoFromApi({ barcode: result.barcode, conflict: result.conflict }) : null);
        })
        .catch(() => {
          // Mentés előtt ugyanaz az ellenőrzés kötelezően újra lefut.
        });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [detailOpen, detail?.item?.id, detail?.item?.variant_id, edit.barcode]);

  function stockRowsForVariant(variantId?: string | null) {
    return stockRows.filter((row) => String(row.variant_id || "") === String(variantId || ""));
  }

  function locationKey(location: MetaItem) {
    return String(location.id || location.code || location.name || "");
  }

  function stockForLocation(rows: StockItem[], location: MetaItem) {
    const lid = String(location.id || "");
    const lcode = String(location.code || "");
    const lname = String(location.name || "");
    return rows.find((row) =>
      (lid && String(row.location_id || "") === lid) ||
      (lcode && String(row.location_code || "") === lcode) ||
      (lname && String(row.location_name || "") === lname)
    ) || null;
  }

  const stockLocationRows = useMemo(() => {
    return locations
      .filter((row) => row.is_active !== false)
      .slice()
      .sort((a, b) => String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""), "hu", { sensitivity: "base" }));
  }, [locations]);

  const duplicateSkuGroups = useMemo(() => {
    const groups = new Map<string, { sku: string; items: InventoryItem[] }>();
    for (const item of items) {
      const sku = cleanScannedBarcode(firstText(item.barcode, item.display_barcode));
      if (!sku || /^AIF[-_]/i.test(sku)) continue;
      const key = sku.toLowerCase();
      const current = groups.get(key) || { sku, items: [] };
      if (!current.items.some((row) => selectedVariantIdFromItem(row as any) === selectedVariantIdFromItem(item as any))) {
        current.items.push(item);
      }
      groups.set(key, current);
    }
    return Array.from(groups.values())
      .filter((group) => group.items.length > 1)
      .sort((a, b) => b.items.length - a.items.length || a.sku.localeCompare(b.sku, "hu", { numeric: true, sensitivity: "base" }));
  }, [items]);

  const duplicateSkuVariantCount = useMemo(
    () => duplicateSkuGroups.reduce((sum, group) => sum + group.items.length, 0),
    [duplicateSkuGroups],
  );

  const activationTodoItems = useMemo(
    () => items.filter((item) => n(item.total_qty) > 0 && (itemStatus(item) !== "active" || modelStatus(item) !== "active")),
    [items],
  );

  function stockBackedInventoryItems(inventoryItems: InventoryItem[], stockItems: StockItem[]) {
    const aggregate = new Map<string, { total: number; reserved: number; available: number; updatedAt: string }>();
    for (const row of stockItems || []) {
      const id = String(row.variant_id || "");
      if (!id) continue;
      const current = aggregate.get(id) || { total: 0, reserved: 0, available: 0, updatedAt: "" };
      current.total += n(row.qty);
      current.reserved += n(row.reserved_qty);
      current.available += row.available_qty !== undefined && row.available_qty !== null ? n(row.available_qty) : Math.max(0, n(row.qty) - n(row.reserved_qty));
      if (row.updated_at && dateTimeMs(row.updated_at) > dateTimeMs(current.updatedAt)) current.updatedAt = String(row.updated_at);
      aggregate.set(id, current);
    }
    return (inventoryItems || []).map((item) => {
      const id = selectedVariantIdFromItem(item as any) || String(item.variant_id || "");
      const ag = aggregate.get(id);
      return ag ? { ...item, variant_id: id, total_qty: ag.total, total_reserved_qty: ag.reserved, available_qty: ag.available, last_stock_movement_at: item.last_stock_movement_at || ag.updatedAt } : { ...item, variant_id: id };
    });
  }

  async function load(showSuccess = false) {
    setBusy(true);
    setMessage("");
    try {
      const [meta, stock] = await Promise.all([apiMeta(), apiStock()]);
      setBrands((meta.brands || []).filter((x) => x.is_active !== false));
      setCategories((meta.categories || []).filter((x) => x.is_active !== false));
      setGenderTypes((meta.genderTypes || []).filter((x) => x.is_active !== false));
      setColorTypes((meta.colorTypes || []).filter((x) => x.is_active !== false));
      setSizeTypes((meta.sizeTypes || []).filter((x) => x.is_active !== false));
      setLocations((meta.locations || []).filter((x) => x.is_active !== false));
      setStockRows(stock.items || []);

      await apiInventory((partialItems, done) => {
        setItems(
          stockBackedInventoryItems(partialItems, stock.items || [])
            .filter((item) => itemStatus(item) !== "archived" && modelStatus(item) !== "archived")
        );
        if (!done) setMessage(`Raktár betöltése: ${partialItems.length.toLocaleString("hu-HU")} variáns már használható…`);
      });

      if (showSuccess) setMessage("Raktár frissítve.");
      else setMessage("");
    } catch (error: any) {
      setMessage(error?.message || "A raktár betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!duplicateSkuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDuplicateSkuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [duplicateSkuOpen]);

  useEffect(() => {
    saveSelectedVariants(selectedVariants);
  }, [selectedVariants]);

  useEffect(() => {
    const refresh = () => void load(false);
    window.addEventListener(stockMovesChangedEventName, refresh as EventListener);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(stockMovesChangedEventName, refresh as EventListener);
      window.removeEventListener("focus", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onIncoming = () => {
      void load(false).then(() => focusLatestIncoming(false));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === warehouseShowAllAfterIncomingStorageKey && event.newValue) onIncoming();
    };
    window.addEventListener(warehouseShowAllAfterIncomingEventName, onIncoming as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(warehouseShowAllAfterIncomingEventName, onIncoming as EventListener);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => stopBarcodeScanner(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mainCategories = useMemo(() => categories.filter(isMainCategory), [categories]);
  const subCategories = useMemo(() => categories.filter((row) => !isMainCategory(row)), [categories]);
  const categoryOptions = mainCategories.length ? mainCategories : categories;
  const subCategoryOptions = useMemo(() => {
    if (category === "all") return subCategories;
    const parent = categoryOptions.find((row) => metaMatches(row, category));
    if (!parent) return subCategories;
    return subCategories.filter((row) => categoryParentId(row) === String(parent.id));
  }, [category, categoryOptions, subCategories]);

  const hasActiveFilters = Boolean(
    search.trim() || brand !== "all" || category !== "all" || subCategory !== "all" || gender !== "all" || color !== "all" || stockFilter !== "all" || imageFilter !== "all" || shopifyFilter !== "all" || focusVariantIds.length
  );

  function colorLabel(item: Partial<InventoryItem>) {
    return officialColorFromTypes(firstText(item.color_name, item.color_code), colorTypes) || "-";
  }

  function colorHex(item: Partial<InventoryItem>) {
    const visible = colorLabel(item);
    const colorType = findColorTypeByValue(colorTypes, visible) || findColorTypeByValue(colorTypes, item.color_name) || findColorTypeByValue(colorTypes, item.color_code);
    return firstText(colorType?.hex, item.color_hex);
  }

  function itemMatchesMeta(values: unknown[], selected: string, rows: MetaItem[]) {
    if (selected === "all") return true;
    const selectedRow = rows.find((row) => metaMatches(row, selected));
    const allowed = new Set([normalizeSearch(selected), ...metaValues(selectedRow).map(normalizeSearch)].filter(Boolean));
    return values.map(normalizeSearch).filter(Boolean).some((value) => allowed.has(value));
  }

  function itemMatchesColor(item: InventoryItem) {
    if (color === "all") return true;
    const selectedColor = findColorTypeByValue(colorTypes, color);
    const allowed = new Set([colorKey(color), ...colorValues(selectedColor).map(colorKey)].filter(Boolean));
    const itemValues = [item.color_name, item.color_code, officialColorFromTypes(item.color_name, colorTypes), officialColorFromTypes(item.color_code, colorTypes)].map(colorKey).filter(Boolean);
    return itemValues.some((value) => allowed.has(value));
  }

  const filteredItems = useMemo(() => {
    const q = normalizeSearch(search);
    const focusSet = new Set(focusVariantIds.map(String));
    return items
      .filter((item) => {
        if (focusSet.size && !focusSet.has(String(item.variant_id))) return false;
        if (q) {
          const haystack = [
            itemTitle(item), item.brand_name, item.brand_code, itemSupplierText(item), item.supplier_codes, item.internal_sku,
            visibleWarehouseBarcode(item), item.sn_cod, item.snCod, itemCustomsTariffCode(item), item.model_code,
            itemMainCategory(item), itemSubCategory(item), item.color_name, item.color_code, item.size, itemProductCode(item),
          ].map(normalizeSearch).join(" ");
          if (!haystack.includes(q)) return false;
        }
        if (!itemMatchesMeta([item.brand_code, item.brand_name], brand, brands)) return false;
        if (!itemMatchesMeta([item.category_code, item.category_name_ro, item.category_name_hu], category, categoryOptions)) return false;
        if (!itemMatchesMeta([item.subcategory_id, item.subcategory_code, item.subcategory_name_ro, item.subcategory_name_hu, item.product_type], subCategory, subCategories)) return false;
        if (gender !== "all" && normalizeSearch(item.gender) !== normalizeSearch(gender)) return false;
        if (!itemMatchesColor(item)) return false;
        if (imageFilter === "with" && !item.image_url) return false;
        if (imageFilter === "missing" && item.image_url) return false;
        if (shopifyFilter === "mapped" && !isShopifyMappedItem(item)) return false;
        if (shopifyFilter === "exported" && !isShopifyExportPending(item)) return false;
        if (shopifyFilter === "unmapped" && (isShopifyMappedItem(item) || isShopifyExportPending(item))) return false;
        if (shopifyFilter === "error" && !shopifyMappingHasError(item)) return false;
        if (stockFilter === "available" && n(item.available_qty ?? item.total_qty) <= 0) return false;
        if (stockFilter === "out" && n(item.total_qty) > 0) return false;
        if (stockFilter === "reserved" && n(item.total_reserved_qty) <= 0) return false;
        if (stockFilter === "missing" && !needsAttention(item)) return false;
        if (stockFilter === "inactive" && itemStatus(item) === "active" && modelStatus(item) === "active") return false;
        if (stockFilter === "watch" && !(n(item.total_qty) > 0 && (itemStatus(item) !== "active" || modelStatus(item) !== "active"))) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortMode === "stock_desc") return n(b.total_qty) - n(a.total_qty);
        if (sortMode === "stock_asc") return n(a.total_qty) - n(b.total_qty);
        if (sortMode === "value_desc") return n(b.total_qty) * n(b.buy_price) - n(a.total_qty) * n(a.buy_price);
        if (sortMode === "incoming_desc") return latestIncomingMs(b) - latestIncomingMs(a);
        if (sortMode === "missing") return Number(needsAttention(b)) - Number(needsAttention(a));
        if (sortMode === "brand") return firstText(a.brand_name, a.brand_code).localeCompare(firstText(b.brand_name, b.brand_code), "hu", { sensitivity: "base" }) || itemTitle(a).localeCompare(itemTitle(b), "hu", { sensitivity: "base" });
        return itemTitle(a).localeCompare(itemTitle(b), "hu", { sensitivity: "base" });
      });
  }, [items, focusVariantIds, search, brand, brands, category, categoryOptions, subCategory, subCategories, gender, color, colorTypes, stockFilter, imageFilter, shopifyFilter, sortMode]);

  function itemSupplierText(item: InventoryItem) {
    return firstText((item as any).supplier_names, splitCsv((item as any).supplier_codes).join(" "));
  }

  const totals = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      acc.qty += n(item.total_qty);
      acc.available += n(item.available_qty ?? item.total_qty);
      acc.value += n(item.total_qty) * n(item.buy_price);
      acc.missing += needsAttention(item) ? 1 : 0;
      return acc;
    }, { qty: 0, available: 0, value: 0, missing: 0 });
  }, [filteredItems]);

  const pageItems = filteredItems.slice(0, visibleCount);

  function resetFilters(showMsg = true) {
    setSearch("");
    setBrand("all");
    setCategory("all");
    setSubCategory("all");
    setGender("all");
    setColor("all");
    setStockFilter("all");
    setImageFilter("all");
    setShopifyFilter("all");
    setFocusVariantIds([]);
    setFocusLabel("");
    setVisibleCount(40);
    if (showMsg) setMessage("Szűrők törölve.");
  }

  async function focusLatestIncoming(showMessage = true) {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      qs.set("direction", "in");
      qs.set("limit", "400");
      qs.set("_", String(Date.now()));
      const data = await fetchAifJSON<{ items?: Array<Record<string, any>> }>(`/stock-movements?${qs.toString()}`);
      const rows = (data.items || [])
        .filter((row) => n(row.qty_delta) > 0)
        .filter((row) => {
          const sourceType = normalizeSearch(row.source_type || "");
          const reason = normalizeSearch(row.raw?.reason || "");
          const importBatchId = firstText(
            row.raw?.importBatchId,
            row.raw?.import_batch_id,
            sourceType.includes("import_batch") ? row.source_id : "",
          );
          const sourceKey = normalizeSearch(firstText(row.source_id, importBatchId));
          if (sourceType.includes("stock_table_audit") || sourceKey.startsWith("stock audit") || reason.includes("stock audit")) return false;
          return sourceType.includes("import_batch") || reason.includes("import_batch") || Boolean(importBatchId);
        })
        .sort((a, b) => dateTimeMs(b.created_at) - dateTimeMs(a.created_at));
      if (!rows.length) {
        setFocusVariantIds([]);
        setFocusLabel("");
        setMessage("Nem találtam friss bejövő import mozgást.");
        return;
      }
      const latest = rows[0];
      const latestSourceType = normalizeSearch(latest.source_type || "");
      const sourceId = firstText(
        latest.raw?.importBatchId,
        latest.raw?.import_batch_id,
        latestSourceType.includes("import_batch") ? latest.source_id : "",
      );
      const latestMinute = Math.floor(dateTimeMs(latest.created_at) / 60000);
      const group = rows.filter((row) => {
        const rowSourceType = normalizeSearch(row.source_type || "");
        const rowSourceId = firstText(
          row.raw?.importBatchId,
          row.raw?.import_batch_id,
          rowSourceType.includes("import_batch") ? row.source_id : "",
        );
        if (sourceId && rowSourceId) return rowSourceId === sourceId;
        return Math.floor(dateTimeMs(row.created_at) / 60000) === latestMinute;
      });
      const ids = Array.from(new Set(group.map((row) => String(row.variant_id || row.variantId || "").trim()).filter(Boolean)));
      setFocusVariantIds(ids);
      setSortMode("incoming_desc");
      setVisibleCount(40);
      const labelText = `Utolsó import: ${ids.length} variáns, ${group.reduce((sum, row) => sum + Math.abs(n(row.qty_delta)), 0)} db`;
      setFocusLabel(labelText);
      if (showMessage) setMessage(labelText);
    } catch (error: any) {
      setMessage(error?.message || "Az utolsó import betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(item: InventoryItem) {
    const id = String(item.variant_id || item.id || "").trim();
    if (!id) return;
    setDetailOpen(true);
    setEditBarcodeConflict(null);
    setDetailBusy(true);
    setDetail(null);
    setEdit(formFromItem(item as any));
    setMessage("");
    try {
      const data = await apiVariantDetail(id);
      const nextForm = formFromItem({ ...(item as any), ...(data.item || {}) });
      if (!nextForm.brandCode) nextForm.brandCode = findBrandCodeForName(data.item?.brand_name || item.brand_name || "");
      setDetail(data);
      setEdit(nextForm);
    } catch (error: any) {
      setMessage(error?.message || "A termék adatlapja nem tölthető be.");
    } finally {
      setDetailBusy(false);
    }
  }

  async function openHistory(item: InventoryItem) {
    const id = String(item.variant_id || item.id || "").trim();
    if (!id) return;
    setHistoryTarget(item);
    setVariantHistory(null);
    setVariantHistoryError("");
    setVariantHistoryBusy(true);
    try {
      const data = await apiVariantHistory(id);
      setVariantHistory(data);
    } catch (error: any) {
      setVariantHistoryError(error?.message || "A terméktörténet betöltése nem sikerült.");
    } finally {
      setVariantHistoryBusy(false);
    }
  }

  async function reloadHistory() {
    if (!historyTarget) return;
    await openHistory(historyTarget);
  }

  function findBrandCodeForName(name: unknown) {
    const key = normalizeSearch(name);
    if (!key) return "";
    const found = brands.find((row) => normalizeSearch(row.name || row.name_ro || row.code) === key || normalizeSearch(row.code) === key);
    return found ? String(found.code || found.id || "") : "";
  }

  async function saveDetail() {
    const id = String(detail?.item?.id || detail?.item?.variant_id || "").trim();
    if (!id) return;
    if (!edit.titleRo.trim()) {
      setMessage("A terméknév kötelező.");
      return;
    }
    if (effectiveEditBarcodeConflict) {
      setEditBarcodeConflict(effectiveEditBarcodeConflict);
      setMessage("");
      return;
    }

    const previousModelStatus = String(detail?.item?.model_status || "active").trim().toLowerCase();
    const previousVariantStatus = String(detail?.item?.variant_status || detail?.item?.status || "active").trim().toLowerCase();
    const nextModelStatus = String(edit.modelStatus || "active").trim().toLowerCase();
    const nextVariantStatus = String(edit.variantStatus || "active").trim().toLowerCase();
    const explicitlyActivatingVariant = nextVariantStatus === "active" && (previousVariantStatus !== "active" || previousModelStatus !== "active");
    if (explicitlyActivatingVariant) {
      const missing: string[] = [];
      if (!String(edit.imageUrl || "").trim()) missing.push("kép");
      if (!cleanScannedBarcode(edit.barcode)) missing.push("vonalkód / SKU");
      if (!String(edit.titleRo || "").trim()) missing.push("terméknév");
      if (!String(edit.size || "").trim()) missing.push("méret");
      if (priceNumber(edit.buyPrice) === null) missing.push("vételár");
      if (priceNumber(edit.sellPrice) === null) missing.push("eladási ár");
      if (missing.length) {
        setMessage(`Ezt a konkrét variánst még nem lehet aktiválni. Hiányzik: ${missing.join(", ")}. A termékkód nem helyettesíti az egyedi SKU-t.`);
        return;
      }
    }

    setSaving(true);
    setMessage("");
    try {
      const requestedBarcode = cleanScannedBarcode(edit.barcode);
      if (requestedBarcode) {
        const barcodeCheck = await apiBarcodeConflictCheck(requestedBarcode, id);
        const conflictInfo = barcodeCheck.conflict
          ? barcodeConflictInfoFromApi({ barcode: barcodeCheck.barcode, conflict: barcodeCheck.conflict })
          : null;
        if (conflictInfo) {
          setEditBarcodeConflict(conflictInfo);
          return;
        }
        setEditBarcodeConflict(null);
      }

      const normalizedEditColor = normalizeColor(edit.colorName);
      const normalizedEditSize = normalizeSize(edit.size);
      const activatingSharedModel = previousModelStatus !== "active" && nextModelStatus === "active";
      if (activatingSharedModel) {
        const currentModelId = firstText(detail?.item?.model_id, detail?.item?.modelId);
        if (currentModelId) {
          const siblingIds = Array.from(new Set(
            items
              .filter((item) => selectedVariantIdFromItem(item as any) !== id)
              .filter((item) => firstText(item.model_id, (item as any).modelId) === currentModelId)
              .filter((item) => itemStatus(item) === "active")
              .map((item) => selectedVariantIdFromItem(item as any))
              .filter(Boolean)
          ));
          for (const siblingId of siblingIds) {
            await apiVariantUpdate(siblingId, { status: "inactive" });
          }
        }
      }

      const supplierVariantCode = firstText(
        detail?.item?.supplier_variant_code,
        detail?.item?.supplierVariantCode,
        [edit.supplierProductCode, normalizedEditColor || edit.colorCode, normalizedEditSize].filter(Boolean).join("::"),
      );

      await apiVariantUpdate(id, {
        titleRo: edit.titleRo,
        titleHu: edit.titleHu,
        descriptionRo: edit.descriptionRo,
        gender: edit.gender,
        productType: edit.productType,
        season: edit.season,
        material: edit.material,
        shopifyTitle: edit.shopifyTitle,
        modelStatus: edit.modelStatus,
        brandCode: edit.brandCode || null,
        categoryCode: edit.categoryCode || null,
        subCategoryCode: edit.subCategoryCode || null,
        barcode: edit.barcode,
        supplierId: detail?.item?.supplier_id || detail?.item?.supplierId || null,
        supplierProductCode: edit.supplierProductCode,
        productCode: edit.supplierProductCode,
        supplierVariantCode: supplierVariantCode || null,
        supplierColorCode: edit.colorCode || normalizedEditColor || null,
        supplierSize: normalizedEditSize || null,
        snCod: edit.snCod,
        customsTariffCode: edit.customsTariffCode,
        colorCode: edit.colorCode,
        colorName: normalizedEditColor,
        size: normalizedEditSize,
        buyPrice: edit.buyPrice,
        sellPrice: edit.sellPrice,
        compareAtPrice: edit.compareAtPrice,
        imageUrl: edit.imageUrl,
        status: edit.variantStatus || "active",
      });
      const data = await apiVariantDetail(id);
      setDetail(data);
      setEdit(formFromItem(data.item || {}));
      setEditBarcodeConflict(null);
      await load(false);
      setMessage("Termékadatok mentve.");
    } catch (error: any) {
      const conflictInfo = barcodeConflictInfoFromApi(error);
      if (conflictInfo) {
        setEditBarcodeConflict(conflictInfo);
        setMessage("");
      } else {
        setMessage(error?.message || "Nem sikerült menteni a terméket.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onImageSelected(file: File | null) {
    const id = String(detail?.item?.id || detail?.item?.variant_id || "").trim();
    if (!file || !id) return;
    setSaving(true);
    try {
      const uploaded = await uploadImage(file, id);
      setEdit((current) => ({ ...current, imageUrl: uploaded.url }));
      setMessage("Kép feltöltve. Mentés után kerül a termékhez.");
    } catch (error: any) {
      setMessage(error?.message || "Nem sikerült feltölteni a képet.");
    } finally {
      setSaving(false);
    }
  }

  function openStockEditor(item: InventoryItem) {
    const rows = stockRowsForVariant(item.variant_id);
    const next: Record<string, string> = {};
    for (const loc of stockLocationRows) {
      const row = stockForLocation(rows, loc);
      next[locationKey(loc)] = String(Math.max(0, Math.floor(n(row?.qty))));
    }
    setStockEditorTarget(item);
    setStockEditorRows(next);
    setStockEditorAllowTotalChange(false);
    setStockEditorReasonCode("");
    setStockEditorReasonText("");
    setStockEditorNote("");
    setStockEditorWarning("");
  }

  function stockEditorReservedQty(location: MetaItem) {
    if (!stockEditorTarget?.variant_id) return 0;
    const row = stockForLocation(stockRowsForVariant(stockEditorTarget.variant_id), location);
    return Math.max(0, Math.floor(n(row?.reserved_qty)));
  }

  function stockEditorOriginalQty(location: MetaItem) {
    if (!stockEditorTarget?.variant_id) return 0;
    return Math.max(0, Math.floor(n(stockForLocation(stockRowsForVariant(stockEditorTarget.variant_id), location)?.qty)));
  }

  function stockEditorOriginalTotal() {
    if (!stockEditorTarget?.variant_id) return 0;
    return stockLocationRows.reduce((sum, loc) => sum + stockEditorOriginalQty(loc), 0);
  }

  function stockEditorTransferLines() {
    if (!stockEditorTarget?.variant_id) return [] as Array<{ variantId: string; fromLocationId: string; toLocationId: string; qty: number }>;
    const donors = stockLocationRows
      .map((loc) => {
        const before = stockEditorOriginalQty(loc);
        const desired = Math.max(stockEditorReservedQty(loc), Math.floor(n(stockEditorRows[locationKey(loc)])));
        return { loc, qty: Math.max(0, before - desired) };
      })
      .filter((row) => row.qty > 0);
    const receivers = stockLocationRows
      .map((loc) => {
        const before = stockEditorOriginalQty(loc);
        const desired = Math.max(stockEditorReservedQty(loc), Math.floor(n(stockEditorRows[locationKey(loc)])));
        return { loc, qty: Math.max(0, desired - before) };
      })
      .filter((row) => row.qty > 0);
    const lines: Array<{ variantId: string; fromLocationId: string; toLocationId: string; qty: number }> = [];
    let donorIndex = 0;
    let receiverIndex = 0;
    while (donorIndex < donors.length && receiverIndex < receivers.length) {
      const donor = donors[donorIndex];
      const receiver = receivers[receiverIndex];
      const moved = Math.min(donor.qty, receiver.qty);
      if (moved > 0) {
        lines.push({
          variantId: String(stockEditorTarget.variant_id),
          fromLocationId: String(donor.loc.id || ""),
          toLocationId: String(receiver.loc.id || ""),
          qty: moved,
        });
        donor.qty -= moved;
        receiver.qty -= moved;
      }
      if (donor.qty <= 0) donorIndex += 1;
      if (receiver.qty <= 0) receiverIndex += 1;
    }
    const remainder = donors.reduce((sum, row) => sum + row.qty, 0) + receivers.reduce((sum, row) => sum + row.qty, 0);
    if (remainder > 0) throw new Error("A készletáthelyezés forrás- és célmennyisége nem egyezik.");
    return lines;
  }

  function createStockTransferIdempotencyKey() {
    if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `warehouse-mobile-transfer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function stockEditorDraftTotal(rows: Record<string, string> = stockEditorRows) {
    return stockLocationRows.reduce((sum, loc) => sum + Math.max(stockEditorReservedQty(loc), Math.floor(n(rows[locationKey(loc)]))), 0);
  }

  function setStockEditorQty(location: MetaItem, value: string) {
    const key = locationKey(location);
    const minQty = stockEditorReservedQty(location);
    const cleaned = Math.max(minQty, Math.floor(n(value.replace(/[^0-9]/g, ""))));
    const next = { ...stockEditorRows, [key]: String(cleaned) };
    setStockEditorRows(next);
    const delta = stockEditorDraftTotal(next) - stockEditorOriginalTotal();
    setStockEditorWarning(delta !== 0 ? `A teljes készlet ${delta > 0 ? "+" : ""}${delta} db-bal változik. Korrekció mód kell hozzá.` : "");
  }

  async function saveStockEditor() {
    if (!stockEditorTarget?.variant_id || stockEditorSaveLockRef.current) return;
    const totalDelta = stockEditorDraftTotal() - stockEditorOriginalTotal();
    if (totalDelta !== 0 && !stockEditorAllowTotalChange) {
      setStockEditorWarning("A teljes készlet megváltozna. Kapcsold be a készletkorrekció módot, ha ez szándékos.");
      return;
    }
    if (stockEditorAllowTotalChange && totalDelta !== 0 && !stockEditorReasonCode) {
      setStockEditorWarning("A készletkorrekció okának kiválasztása kötelező.");
      return;
    }
    if (stockEditorAllowTotalChange && totalDelta !== 0 && stockEditorReasonCode === "other" && !stockEditorReasonText.trim()) {
      setStockEditorWarning("Az Egyéb készletkorrekció okát szövegesen is add meg.");
      return;
    }

    stockEditorSaveLockRef.current = true;
    setSaving(true);
    setMessage("");
    try {
      const rows = stockLocationRows.map((loc) => ({
        locationId: String(loc.id || ""),
        locationCode: String(loc.code || ""),
        qty: Math.max(stockEditorReservedQty(loc), Math.floor(n(stockEditorRows[locationKey(loc)]))),
        reservedQty: stockEditorReservedQty(loc),
      }));

      let resultMessage = "";
      if (stockEditorAllowTotalChange) {
        await apiVariantStockUpdate(stockEditorTarget.variant_id, rows, {
          allowTotalChange: true,
          reasonCode: stockEditorReasonCode,
          reasonText: stockEditorReasonText.trim(),
          note: stockEditorNote.trim(),
        });
        resultMessage = `Készletkorrekció mentve: ${totalDelta > 0 ? "+" : ""}${totalDelta} db.`;
        notifyStockMovesChanged({ variantId: stockEditorTarget.variant_id, source: "warehouse_mobile_stock_correction" });
      } else {
        const transferLines = stockEditorTransferLines();
        if (!transferLines.length) {
          setMessage("Nem változott a készlet elosztása, ezért nincs mentendő készletmozgatás.");
          return;
        }
        const transfer = await apiStockTransfer({
          title: "Aviz intern de transfer stoc",
          note: stockEditorNote.trim(),
          idempotencyKey: createStockTransferIdempotencyKey(),
          lines: transferLines,
        });
        const documentNumber = (transfer.documents || [])
          .map((entry) => String(entry.documentNumber || entry.transferId || "").trim())
          .filter(Boolean)
          .join(", ") || String(transfer.documentNumber || transfer.transferId || "").trim();
        const documentValue = Math.max(
          n(transfer.documentTotalValue),
          ...(transfer.documents || []).map((entry) => n(entry.documentTotalValue)),
        );
        resultMessage = `${transfer.duplicate ? "Az ismételt mentést a rendszer felismerte; nem mozgatta meg újra a készletet." : "Készlet áthelyezve és PV-előkészítéshez adva."}${documentNumber ? ` ${documentNumber}.` : ""}${documentValue >= 10000 ? ` Figyelem: az előkészítés értéke ${money(documentValue)} RON, UIT szükséges.` : ""}`;
        notifyStockMovesChanged({ variantId: stockEditorTarget.variant_id, source: "warehouse_mobile_transfer", transferId: transfer.transferId || null });
      }

      setStockEditorTarget(null);
      setStockEditorRows({});
      setStockEditorReasonCode("");
      setStockEditorReasonText("");
      setStockEditorNote("");
      await load(false);
      setMessage(resultMessage);
    } catch (error: any) {
      setMessage(error?.message || "Nem sikerült menteni a készletet.");
    } finally {
      stockEditorSaveLockRef.current = false;
      setSaving(false);
    }
  }





  function toggleSelected(item: InventoryItem) {
    const id = String(item.variant_id || "");
    if (!id) return;
    setSelectedVariants((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }


  function stopBarcodeScanner(clearStatus = true) {
    if (barcodeScanRafRef.current !== null) {
      window.cancelAnimationFrame(barcodeScanRafRef.current);
      barcodeScanRafRef.current = null;
    }
    if (barcodeZxingControlsRef.current?.stop) {
      try { barcodeZxingControlsRef.current.stop(); } catch {}
      barcodeZxingControlsRef.current = null;
    }
    if (barcodeStreamRef.current) {
      barcodeStreamRef.current.getTracks().forEach((track) => track.stop());
      barcodeStreamRef.current = null;
    }
    if (barcodeVideoRef.current) barcodeVideoRef.current.srcObject = null;
    setBarcodeScannerOpen(false);
    if (clearStatus) setBarcodeScannerStatus("");
  }

  function applyScannedBarcode(rawCode: unknown, _source: "camera" | "manual" = "camera") {
    const code = cleanScannedBarcode(rawCode);
    if (!code) return;
    if (barcodeScannerHandlingRef.current) return;
    barcodeScannerHandlingRef.current = true;
    window.setTimeout(() => { barcodeScannerHandlingRef.current = false; }, 700);

    const exactMatches = items.filter((item) => itemMatchesScannedBarcode(item, code));
    setSearch(code);
    setVisibleCount(40);
    setFocusVariantIds([]);
    setFocusLabel("");
    setBarcodeScannerManualValue("");
    setMessage(exactMatches.length
      ? `Vonalkód beolvasva: ${code} • ${exactMatches.length} találat.`
      : `Vonalkód beolvasva: ${code}. Ha nincs találat, ellenőrizd a kódot vagy a törzsadatot.`
    );
    stopBarcodeScanner(false);
    window.setTimeout(() => searchInputRef.current?.focus(), 120);
  }

  async function startBarcodeScanner() {
    setBarcodeScannerOpen(true);
    setBarcodeScannerStatus("Kamera indítása...");
    setBarcodeScannerManualValue("");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setBarcodeScannerStatus("Ezen a böngészőn nem érhető el a kamera. Írd be kézzel vagy használj bluetooth olvasót.");
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 90));
    const video = barcodeVideoRef.current;
    if (!video) {
      setBarcodeScannerStatus("A kamera nézet még nem készült el. Zárd be és indítsd újra a scannert.");
      return;
    }

    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (BarcodeDetectorCtor) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS);
        barcodeStreamRef.current = stream;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => undefined);

        let detector: any;
        try {
          detector = new BarcodeDetectorCtor({ formats: WAREHOUSE_BARCODE_SCAN_FORMATS });
        } catch {
          detector = new BarcodeDetectorCtor();
        }

        const tick = async () => {
          if (!barcodeStreamRef.current || !barcodeVideoRef.current || !detector) return;
          if (barcodeVideoRef.current.readyState >= 2 && !barcodeScannerHandlingRef.current) {
            try {
              const detected = await detector.detect(barcodeVideoRef.current);
              const first = detected?.[0];
              const raw = first?.rawValue || first?.raw_value || first?.displayValue;
              if (raw) {
                applyScannedBarcode(raw, "camera");
                return;
              }
            } catch {
              // Egy kamera frame hibája nem ok arra, hogy feladjuk. Sajnos ezt is nekünk kell elviselni.
            }
          }
          barcodeScanRafRef.current = window.requestAnimationFrame(tick);
        };

        barcodeScanRafRef.current = window.requestAnimationFrame(tick);
        setBarcodeScannerStatus("Kamera aktív. Irányítsd a vonalkódra, a keresés automatikusan indul.");
        return;
      } catch (error: any) {
        setBarcodeScannerStatus(error?.message || "A kamera indítása nem sikerült. Próbáld kézi beírással.");
        return;
      }
    }

    const zxing = await loadWarehouseZxingBrowser();
    const Reader = zxing?.BrowserMultiFormatReader || zxing?.BrowserMultiFormatOneDReader;
    if (Reader) {
      try {
        const reader = new Reader();
        const controls = await reader.decodeFromConstraints(
          WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS,
          video,
          (result: unknown, _error: unknown, controlsFromCallback?: any) => {
            if (controlsFromCallback && !barcodeZxingControlsRef.current) barcodeZxingControlsRef.current = controlsFromCallback;
            const text = zxingResultText(result);
            if (text) applyScannedBarcode(text, "camera");
          }
        );
        if (controls) barcodeZxingControlsRef.current = controls;
        setBarcodeScannerStatus("Kamera aktív. Irányítsd a vonalkódra, a keresés automatikusan indul.");
        return;
      } catch (error: any) {
        setBarcodeScannerStatus(error?.message || "A kamera scanner nem indult el. Írd be kézzel vagy használj bluetooth olvasót.");
        return;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS);
      barcodeStreamRef.current = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => undefined);
      setBarcodeScannerStatus("A kamera megy, de ez a böngésző nem ad automata vonalkódolvasót. Írd be kézzel vagy használj bluetooth olvasót.");
    } catch (error: any) {
      setBarcodeScannerStatus(error?.message || "A kamera indítása nem sikerült. Próbáld kézi beírással.");
    }
  }

  function submitManualBarcode() {
    applyScannedBarcode(barcodeScannerManualValue, "manual");
  }

  function PriceDetails({ item }: { item: Partial<InventoryItem> }) {
    const sellNet = sellPriceWithoutTva(item.sell_price);
    const markup = priceMarkupPercentText(item.buy_price, item.sell_price);
    if (!buyPricesVisible) return <span className="text-white/48">Haszonkulcs rejtve</span>;
    return (
      <div className="grid gap-1 text-[11px] text-white/66">
        <div className="flex justify-between gap-3"><span>Vételi ár:</span><strong className="text-white">{money(item.buy_price)}</strong></div>
        <div className="flex justify-between gap-3"><span>Eladási ár TVA nélkül:</span><strong className="text-white">{sellNet === null ? "-" : money(sellNet)}</strong></div>
        <div className="flex justify-between gap-3"><span>Eladási ár TVA-val:</span><strong className="text-white">{money(item.sell_price)}</strong></div>
        <div className="flex justify-between gap-3"><span>Haszonkulcs TVA nélkül:</span><strong className="text-[#cffffd]">{markup || "-"}</strong></div>
      </div>
    );
  }

  function ColorBadge({ item }: { item: InventoryItem }) {
    const hex = colorHex(item);
    const code = firstText(item.color_code);
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#5bd0cc]/35 bg-[#203f49] px-2 py-1 text-[11px] font-semibold leading-none text-[#cffffd]">
        <span className="h-3 w-3 shrink-0 rounded-full border border-white/35 bg-white/15" style={hex ? { backgroundColor: hex } : undefined} />
        <span className="truncate">{colorLabel(item)}</span>
        {code ? <span className="rounded-full bg-[#2a8d8b]/45 px-1.5 py-0.5 text-[10px]">{code}</span> : null}
      </span>
    );
  }

  return (
    <main className={page}>
      <header className="sticky top-0 z-50 bg-[#303a4c]/96 px-3 pb-2 pt-2 shadow-[0_14px_28px_rgba(15,23,42,0.28)] backdrop-blur">
        <div className="rounded-b-[22px] border border-white/12 bg-[#303a4c]/92 p-2.5 shadow-inner shadow-white/[0.03]">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 border-l-4 border-[#7bd7d4] pl-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/70">AllInFashion</p>
              <h1 className="mt-0.5 truncate text-lg leading-tight text-white">Raktár mobil</h1>
              <p className="mt-0.5 text-[11px] text-white/58">{filteredItems.length} találat • {qty(totals.qty)} db</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button className={buyPricesVisible ? headerIconBtnActive : headerIconBtn} onClick={() => setBuyPricesVisible((x) => !x)} type="button" aria-label="Vételár mutatása">
                {buyPricesVisible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
              <button className={headerIconBtnActive} onClick={() => load(true)} disabled={busy} type="button" aria-label="Frissítés">
                <RefreshCw size={17} className={busy ? "animate-spin" : ""} />
              </button>
              <button className={headerIconBtn} onClick={goHome} type="button" aria-label="Kezdőlap"><Home size={17} /></button>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/42" size={17} />
              <input
                ref={searchInputRef}
                className={`${input} pl-10 pr-9`}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setVisibleCount(40); }}
                placeholder="Név, márka, vonalkód, szín, méret"
              />
              {search && <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-white/45 hover:bg-white/10 hover:text-white" type="button" onClick={() => setSearch("")}><X size={15} /></button>}
            </div>
            <button className={headerIconBtn} onClick={() => void startBarcodeScanner()} type="button" aria-label="Vonalkód scanner"><Barcode size={17} /></button>
          </div>
        </div>
      </header>

      <div className="space-y-3 px-3 pt-3">
        {message ? <div className="rounded-2xl border border-[#7bd7d4]/30 bg-[#203f49] px-3 py-2 text-sm text-[#d7fffd]">{message}</div> : null}

        {duplicateSkuGroups.length > 0 ? (
          <button
            type="button"
            className="w-full rounded-2xl border border-rose-300/35 bg-[#d31126] px-3 py-2.5 text-left text-sm text-white shadow-[0_10px_24px_rgba(120,8,24,.28)]"
            onClick={() => setDuplicateSkuOpen(true)}
          >
            <AlertTriangle className="mr-2 inline" size={15} /> {duplicateSkuGroups.length} dupla SKU • {duplicateSkuVariantCount} érintett termék
          </button>
        ) : null}

        {activationTodoItems.length > 0 ? (
          <button
            type="button"
            className="w-full rounded-2xl border border-amber-200/30 bg-amber-400/12 px-3 py-2.5 text-left text-sm text-amber-50"
            onClick={() => {
              setStockFilter("watch");
              setFiltersOpen(false);
              setVisibleCount(40);
              setFocusVariantIds([]);
              setFocusLabel("");
              setMessage(`${activationTodoItems.length} aktiválandó készletes variánst mutatok.`);
            }}
          >
            <AlertTriangle className="mr-2 inline" size={15} /> {activationTodoItems.length} aktiválandó készleten lévő variáns
          </button>
        ) : null}

        {(hasActiveFilters || focusLabel) && (
          <div className="rounded-2xl border border-[#7bd7d4]/25 bg-[#203f49]/75 px-3 py-2 text-xs text-[#d7fffd]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">Aktív nézet</p>
                <p className="mt-0.5 text-[#d7fffd]/72">{focusLabel || "Szűrők / keresés alapján szűrt lista"}</p>
              </div>
              <button className="shrink-0 rounded-xl border border-white/14 bg-white/[0.08] px-2 py-1" onClick={() => resetFilters()} type="button">Szűrők törlése</button>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {pageItems.map((item) => {
            const markup = buyPricesVisible ? priceMarkupPercentText(item.buy_price, item.sell_price) : "";
            return (
              <article key={item.variant_id} className="rounded-[24px] border border-white/14 bg-white/[0.07] p-3 shadow-lg shadow-slate-950/12">
                <div className="flex gap-3">
                  <ProductImage src={item.image_url} alt={itemTitle(item)} onPreview={() => setImagePreview({ src: String(item.image_url), title: itemTitle(item) })} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9fe5e2]">{item.brand_name || item.brand_code || "Márka nélkül"}</p>
                        <div className="mt-1 flex items-start gap-1.5">
                          <h2 className="min-w-0 flex-1 line-clamp-2 text-base leading-tight text-white">{itemTitle(item)}</h2>
                          <ShopifyStatusIcon item={item} size="sm" />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-[#5bd0cc]/30 bg-[#203f49] px-2 py-1 text-[11px] text-[#cffffd]">Termékkód: {itemProductCode(item) || "-"}</span>
                      {visibleWarehouseBarcode(item) ? <span className="rounded-full border border-white/12 bg-white/[0.07] px-2 py-1 text-[11px] text-white/72"><Barcode className="mr-1 inline" size={11} />{visibleWarehouseBarcode(item)}</span> : null}
                      {needsAttention(item) ? <span className="rounded-full border border-amber-200/35 bg-amber-300/15 px-2 py-1 text-[11px] text-amber-50"><AlertTriangle className="mr-1 inline" size={11} />Javítandó</span> : null}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-2xl border border-white/12 bg-[#263246] p-2">
                    <p className="text-white/46">Kategória</p>
                    <p className="mt-1 leading-tight text-white">{itemMainCategory(item)}{itemSubCategory(item) ? <span className="block text-white/55">{itemSubCategory(item)}</span> : null}</p>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-[#263246] p-2">
                    <p className="text-white/46">Szín / méret</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5"><ColorBadge item={item} /><span className="rounded-full bg-white/[0.08] px-2 py-1 text-[11px] text-white">{item.size || "-"}</span></div>
                  </div>
                  <button className="rounded-2xl border border-[#7bd7d4]/30 bg-[#203f49] p-2 text-left" onClick={() => openStockEditor(item)} type="button">
                    <p className="text-[#cffffd]/60">Készlet</p>
                    <p className="mt-1 text-lg leading-none text-white">{qty(item.total_qty)} <span className="text-xs text-[#cffffd]/70">db</span></p>
                    <p className="mt-1 text-[11px] text-white/52">{stockRowsForVariant(item.variant_id).filter((row) => n(row.qty) > 0).length || 0} helyen</p>
                  </button>
                  <div className="rounded-2xl border border-white/12 bg-[#263246] p-2">
                    <p className="text-white/46">Eladási ár</p>
                    <p className="mt-1 text-base leading-none text-white">{money(item.sell_price)}</p>
                    {markup ? <p className="mt-1 text-[11px] font-semibold text-[#cffffd]">{markup} TVA nélkül</p> : buyPricesVisible ? <p className="mt-1 text-[11px] text-white/42">Nincs haszonkulcs</p> : null}
                  </div>
                </div>

                {buyPricesVisible ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-[#202838] px-3 py-2">
                    <PriceDetails item={item} />
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button className={softBtn} onClick={() => openHistory(item)} type="button"><Clock3 size={15} /> Történet</button>
                  <button className={softBtn} onClick={() => openDetail(item)} type="button"><Edit3 size={15} /> Adatok</button>
                  <button className={softBtn} onClick={() => openStockEditor(item)} type="button"><Boxes size={15} /> Készlet</button>
                </div>
              </article>
            );
          })}
        </div>

        {!pageItems.length ? (
          <div className="rounded-[24px] border border-white/14 bg-white/[0.06] px-4 py-8 text-center text-sm text-white/62">
            Nincs találat.
          </div>
        ) : null}

        {visibleCount < filteredItems.length ? (
          <button className="w-full rounded-2xl border border-white/16 bg-white/[0.08] px-3 py-3 text-sm text-white" type="button" onClick={() => setVisibleCount((x) => x + 40)}>
            További termékek betöltése ({filteredItems.length - visibleCount})
          </button>
        ) : null}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/12 bg-[#263246]/96 px-3 pb-3 pt-2 shadow-[0_-16px_34px_rgba(15,23,42,0.38)] backdrop-blur">
        <div className="grid grid-cols-3 gap-2">
          <button className={softBtn} onClick={() => setFiltersOpen(true)} type="button"><Filter size={16} /> Szűrő</button>
          <button className={softBtn} onClick={() => focusLatestIncoming(true)} disabled={busy} type="button"><PackageCheck size={16} /> Utolsó</button>
          <button className={softBtn} onClick={() => { searchInputRef.current?.focus(); }} type="button"><Search size={16} /> Keresés</button>
        </div>
      </nav>

      {historyTarget && (
        <MobileHistorySheet
          target={historyTarget}
          history={variantHistory}
          loading={variantHistoryBusy}
          error={variantHistoryError}
          pricesVisible={buyPricesVisible}
          onReload={reloadHistory}
          onClose={() => { setHistoryTarget(null); setVariantHistory(null); setVariantHistoryError(""); }}
        />
      )}

      {filtersOpen && (
        <>
          <MobileBackdrop onClose={() => setFiltersOpen(false)} />
          <div className={sheetPanel}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#cffffd]/70">Szűrés</p>
                <h2 className="text-lg text-white">Raktár nézet</h2>
              </div>
              <button className={iconBtn} onClick={() => setFiltersOpen(false)} type="button"><X size={18} /></button>
            </div>
            <div className="grid gap-3">
              <label className={label}>Márka<select className={select} value={brand} onChange={(e) => { setBrand(e.target.value); setVisibleCount(40); }}><option value="all">Összes</option>{brands.map((row) => <option key={row.id} value={row.code || row.id}>{row.name || row.name_ro || row.code}</option>)}</select></label>
              <label className={label}>Főkategória<select className={select} value={category} onChange={(e) => { setCategory(e.target.value); setSubCategory("all"); setVisibleCount(40); }}><option value="all">Összes</option>{categoryOptions.map((row) => <option key={row.id} value={row.code || row.id}>{categoryLabel(row)}</option>)}</select></label>
              <label className={label}>Alkategória<select className={select} value={subCategory} onChange={(e) => { setSubCategory(e.target.value); setVisibleCount(40); }}><option value="all">Összes</option>{subCategoryOptions.map((row) => <option key={row.id} value={row.code || row.id}>{categoryLabel(row)}</option>)}</select></label>
              <label className={label}>Nem<select className={select} value={gender} onChange={(e) => { setGender(e.target.value); setVisibleCount(40); }}><option value="all">Összes</option>{genderTypes.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}</select></label>
              <label className={label}>Szín<select className={select} value={color} onChange={(e) => { setColor(e.target.value); setVisibleCount(40); }}><option value="all">Összes</option>{colorTypes.map((row) => <option key={row.id} value={row.code || row.name_ro}>{row.name_ro}</option>)}</select></label>
              <label className={label}>Készlet<select className={select} value={stockFilter} onChange={(e) => { setStockFilter(e.target.value as StockFilter); setVisibleCount(40); }}><option value="all">Összes</option><option value="available">Van elérhető</option><option value="out">Nulla készlet</option><option value="reserved">Van foglalás</option><option value="missing">Hiányzó adat</option><option value="inactive">Inaktív termékek</option><option value="watch">Aktiválandó készlet</option></select></label>
              <label className={label}>Kép<select className={select} value={imageFilter} onChange={(e) => { setImageFilter(e.target.value as ImageFilter); setVisibleCount(40); }}><option value="all">Összes</option><option value="with">Van kép</option><option value="missing">Nincs kép</option></select></label>
              <label className={label}>Shopify<select className={select} value={shopifyFilter} onChange={(e) => { setShopifyFilter(e.target.value as ShopifyFilter); setVisibleCount(40); }}><option value="all">Összes</option><option value="mapped">Összekötve</option><option value="exported">Exportálva, párosításra vár</option><option value="unmapped">Nincs Shopifyon</option><option value="error">Szinkronhiba</option></select></label>
              <label className={label}>Sorrend<select className={select} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}><option value="name">Terméknév</option><option value="brand">Márka</option><option value="stock_desc">Készlet csökkenő</option><option value="stock_asc">Készlet növekvő</option><option value="value_desc">Érték</option><option value="incoming_desc">Utolsó bevételezés</option><option value="missing">Javítandók előre</option></select></label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className={softBtn} onClick={() => resetFilters()} type="button">Alaphelyzet</button>
              <button className={primaryBtn} onClick={() => setFiltersOpen(false)} type="button">Alkalmaz</button>
            </div>
          </div>
        </>
      )}

      {duplicateSkuOpen && (
        <>
          <MobileBackdrop onClose={() => setDuplicateSkuOpen(false)} />
          <section className={`${sheetPanel} z-[82]`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-rose-100/70">Adatellenőrzés</p>
                <h2 className="mt-1 text-lg text-white">Dupla Vonalkód / Shopify SKU</h2>
                <p className="mt-1 text-xs text-white/58">{duplicateSkuGroups.length} ütköző kód • {duplicateSkuVariantCount} konkrét termék</p>
              </div>
              <button className={iconBtn} onClick={() => setDuplicateSkuOpen(false)} type="button"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {duplicateSkuGroups.map((group) => (
                <div key={group.sku} className="overflow-hidden rounded-2xl border border-rose-200/22 bg-white/[0.05]">
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-rose-950/20 px-3 py-2">
                    <span className="font-mono text-sm text-white">{group.sku}</span>
                    <span className="rounded-full bg-[#d31126] px-2 py-1 text-[10px] text-white">{group.items.length} termék</span>
                  </div>
                  <div className="divide-y divide-white/10">
                    {group.items.map((item) => (
                      <button
                        key={item.variant_id}
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.05]"
                        onClick={() => {
                          setDuplicateSkuOpen(false);
                          void openDetail(item);
                        }}
                      >
                        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/14 bg-white text-slate-400">
                          {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-contain p-0.5" /> : <ImagePlus size={17} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-white">{itemTitle(item)}</span>
                          <span className="mt-0.5 block truncate text-xs text-white/55">{item.brand_name || "-"} • {officialColorRo(firstText(item.color_name, item.color_code)) || "-"} • {item.size || "-"}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-[#cffffd]/68">Termékkód: {itemProductCode(item) || "-"} • {qty(item.total_qty)} db</span>
                        </span>
                        <Eye size={16} className="shrink-0 text-white/70" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {detailOpen && (
        <>
          <MobileBackdrop onClose={() => { setDetailOpen(false); setEditBarcodeConflict(null); }} />
          <div className={sheetPanel}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#cffffd]/70">Termékadatlap</p>
                <h2 className="mt-1 line-clamp-2 text-lg text-white">{edit.titleRo || itemTitle(detail?.item || {})}</h2>
                {detailBusy ? <p className="mt-1 text-xs text-white/50">Betöltés...</p> : null}
              </div>
              <button className={iconBtn} onClick={() => { setDetailOpen(false); setEditBarcodeConflict(null); }} type="button"><X size={18} /></button>
            </div>

            <div className="grid gap-3">
              <div className="flex gap-3 rounded-2xl border border-white/12 bg-white/[0.06] p-3">
                <ProductImage src={edit.imageUrl} alt={edit.titleRo} size="large" onPreview={() => edit.imageUrl && setImagePreview({ src: edit.imageUrl, title: edit.titleRo })} />
                <div className="grid min-w-0 flex-1 gap-2 text-xs">
                  <PriceDetails item={{ buy_price: edit.buyPrice, sell_price: edit.sellPrice }} />
                  <label className="mt-1 inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/16 bg-white/[0.08] px-3 text-xs text-white">
                    <ImagePlus size={14} /> Kép feltöltése
                    <input className="hidden" type="file" accept="image/*" onChange={(e) => void onImageSelected(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>

              <label className={label}>Terméknév románul<input className={input} value={edit.titleRo} onChange={(e) => setEdit((x) => ({ ...x, titleRo: e.target.value }))} /></label>
              <label className={label}>Terméknév magyarul<input className={input} value={edit.titleHu} onChange={(e) => setEdit((x) => ({ ...x, titleHu: e.target.value }))} /></label>
              <label className={label}>Márka<select className={select} value={edit.brandCode} onChange={(e) => setEdit((x) => ({ ...x, brandCode: e.target.value }))}><option value="">Nincs</option>{brands.map((row) => <option key={row.id} value={row.code || row.id}>{row.name || row.name_ro || row.code}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Főkategória<select className={select} value={edit.categoryCode} onChange={(e) => setEdit((x) => ({ ...x, categoryCode: e.target.value, subCategoryCode: "" }))}><option value="">Nincs</option>{categoryOptions.map((row) => <option key={row.id} value={row.code || row.id}>{categoryLabel(row)}</option>)}</select></label>
                <label className={label}>Alkategória<select className={select} value={edit.subCategoryCode} onChange={(e) => setEdit((x) => ({ ...x, subCategoryCode: e.target.value }))}><option value="">Nincs</option>{subCategories.map((row) => <option key={row.id} value={row.code || row.id}>{categoryLabel(row)}</option>)}</select></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Nem<select className={select} value={edit.gender} onChange={(e) => setEdit((x) => ({ ...x, gender: e.target.value }))}><option value="unisex">Unisex</option>{genderTypes.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}</select></label>
                <label className={label}>Méret<input className={input} value={edit.size} onChange={(e) => setEdit((x) => ({ ...x, size: e.target.value }))} list="warehouse-mobile-size-options" /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Szín<input className={input} value={edit.colorName} onChange={(e) => setEdit((x) => ({ ...x, colorName: e.target.value }))} list="warehouse-mobile-color-options" /></label>
                <label className={label}>Színkód<input className={input} value={edit.colorCode} onChange={(e) => setEdit((x) => ({ ...x, colorCode: e.target.value }))} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Vételár<input className={input} value={edit.buyPrice} onChange={(e) => setEdit((x) => ({ ...x, buyPrice: e.target.value }))} inputMode="decimal" /></label>
                <label className={label}>Eladási ár TVA-val<input className={input} value={edit.sellPrice} onChange={(e) => setEdit((x) => ({ ...x, sellPrice: e.target.value }))} inputMode="decimal" /></label>
              </div>
              <label className={label}>Fotó URL<input className={input} value={edit.imageUrl} onChange={(e) => setEdit((x) => ({ ...x, imageUrl: e.target.value }))} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Termékkód<input className={input} value={edit.supplierProductCode} onChange={(e) => setEdit((x) => ({ ...x, supplierProductCode: e.target.value }))} /></label>
                <label className={label}>Vonalkód / Shopify SKU<input className={input} value={edit.barcode} onChange={(e) => { setEditBarcodeConflict(null); setEdit((x) => ({ ...x, barcode: e.target.value })); }} /></label>
              </div>
              {effectiveEditBarcodeConflict ? (
                <MobileBarcodeConflictNotice
                  info={effectiveEditBarcodeConflict}
                  onOpen={effectiveEditBarcodeConflict.conflictVariantId ? () => {
                    const conflictItem = items.find((item) => selectedVariantIdFromItem(item as any) === effectiveEditBarcodeConflict.conflictVariantId);
                    void openDetail((conflictItem || { variant_id: effectiveEditBarcodeConflict.conflictVariantId }) as InventoryItem);
                  } : null}
                />
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>S/N/COD<input className={input} value={edit.snCod} onChange={(e) => setEdit((x) => ({ ...x, snCod: e.target.value }))} /></label>
                <label className={label}>Vámtarifa kód<input className={input} value={edit.customsTariffCode} onChange={(e) => setEdit((x) => ({ ...x, customsTariffCode: e.target.value }))} /></label>
              </div>
              <label className={label}>Anyag / összetétel<input className={input} value={edit.material} onChange={(e) => setEdit((x) => ({ ...x, material: e.target.value }))} /></label>
              <label className={label}>Leírás<textarea className={`${input} h-24 py-3`} value={edit.descriptionRo} onChange={(e) => setEdit((x) => ({ ...x, descriptionRo: e.target.value }))} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Modell állapot<select className={select} value={edit.modelStatus} onChange={(e) => setEdit((x) => ({ ...x, modelStatus: e.target.value }))}><option value="draft">Előkészítés</option><option value="active">Aktív</option><option value="archived">Archivált</option></select></label>
                <label className={label}>Variáns állapot<select className={select} value={edit.variantStatus} onChange={(e) => { const value = e.target.value; setEdit((x) => ({ ...x, variantStatus: value, modelStatus: value === "active" && ["draft", "inactive"].includes(String(x.modelStatus || "").toLowerCase()) ? "active" : x.modelStatus })); }}><option value="inactive">Inaktív</option><option value="active">Aktív</option><option value="archived">Archivált</option></select></label>
              </div>
              <div className="grid gap-2 pt-1">
                <button className={softBtn} onClick={() => detail?.item && openStockEditor(detail.item)} type="button"><Boxes size={15} /> Készlet</button>
              </div>
              <button className={`${primaryBtn} h-12`} onClick={saveDetail} disabled={saving || detailBusy || Boolean(effectiveEditBarcodeConflict)} title={effectiveEditBarcodeConflict ? "Ez az SKU már egy másik termékhez tartozik. Adj meg másik egyedi SKU-t." : undefined} type="button"><Save size={16} /> {saving ? "Mentés..." : "Mentés"}</button>
            </div>
          </div>
        </>
      )}

      {stockEditorTarget && (
        <>
          <MobileBackdrop onClose={() => setStockEditorTarget(null)} />
          <div className={sheetPanel}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#cffffd]/70">Készlet</p>
                <h2 className="line-clamp-2 text-lg text-white">{itemTitle(stockEditorTarget)}</h2>
                <p className="mt-1 text-xs text-white/52">Eredeti összesen: {qty(stockEditorOriginalTotal())} db • Új összesen: {qty(stockEditorDraftTotal())} db</p>
              </div>
              <button className={iconBtn} onClick={() => setStockEditorTarget(null)} type="button"><X size={18} /></button>
            </div>
            <div className="grid gap-2">
              {stockLocationRows.map((loc) => {
                const key = locationKey(loc);
                const reserved = stockEditorReservedQty(loc);
                return (
                  <div key={key} className="rounded-2xl border border-white/12 bg-white/[0.06] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm text-white">{loc.name || loc.code}</p>
                      {reserved > 0 ? <span className="rounded-full bg-white/[0.08] px-2 py-1 text-[11px] text-white/58">foglalt {reserved}</span> : null}
                    </div>
                    <div className="grid grid-cols-[44px_1fr_44px] gap-2">
                      <button className={softBtn} type="button" onClick={() => setStockEditorQty(loc, String(Math.max(reserved, n(stockEditorRows[key]) - 1)))}>-</button>
                      <input className={`${input} text-center text-lg`} value={stockEditorRows[key] || "0"} inputMode="numeric" onChange={(e) => setStockEditorQty(loc, e.target.value)} />
                      <button className={softBtn} type="button" onClick={() => setStockEditorQty(loc, String(n(stockEditorRows[key]) + 1))}>+</button>
                    </div>
                  </div>
                );
              })}
              {stockEditorWarning ? <div className="rounded-2xl border border-amber-200/28 bg-amber-300/12 px-3 py-2 text-sm text-amber-50">{stockEditorWarning}</div> : null}
              <label className="flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-3 text-sm text-white/78">
                <input type="checkbox" className="h-4 w-4 accent-[#2a8d8b]" checked={stockEditorAllowTotalChange} onChange={(e) => { setStockEditorAllowTotalChange(e.target.checked); if (!e.target.checked) { setStockEditorReasonCode(""); setStockEditorReasonText(""); } }} />
                Készletkorrekció mód, a teljes darabszám változhat
              </label>
              {stockEditorAllowTotalChange && stockEditorDraftTotal() !== stockEditorOriginalTotal() ? (
                <div className="rounded-2xl border border-amber-200/25 bg-amber-300/10 p-3">
                  <p className="text-sm text-amber-50">Korrekció oka</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-100/65">Kötelező, ha a teljes darabszám változik. Ez bekerül a készletmozgás naplójába.</p>
                  <label className={`${label} mt-3`}>
                    Ok
                    <select className={select} value={stockEditorReasonCode} onChange={(e) => { setStockEditorReasonCode(e.target.value); if (e.target.value !== "other") setStockEditorReasonText(""); }}>
                      <option value="">Válassz okot</option>
                      <option value="inventory_difference">Leltáreltérés</option>
                      <option value="incorrect_reception">Téves bevételezés</option>
                      <option value="invoice_correction">Számlakorrekció</option>
                      <option value="damaged_or_lost">Sérült vagy elveszett termék</option>
                      <option value="admin_correction">Adminisztrációs javítás</option>
                      <option value="other">Egyéb</option>
                    </select>
                  </label>
                  {stockEditorReasonCode === "other" ? <label className={`${label} mt-3`}>Egyéb ok<input className={input} value={stockEditorReasonText} onChange={(e) => setStockEditorReasonText(e.target.value)} placeholder="Miért szükséges a korrekció?" /></label> : null}
                </div>
              ) : null}
              <label className={label}>Megjegyzés <span className="text-white/38">(opcionális)</span><input className={input} value={stockEditorNote} onChange={(e) => setStockEditorNote(e.target.value)} placeholder={stockEditorAllowTotalChange ? "Korrekció belső megjegyzése" : "Átadás / PV belső megjegyzése"} /></label>
              <button className={`${primaryBtn} h-12`} onClick={saveStockEditor} disabled={saving || (stockEditorAllowTotalChange && stockEditorDraftTotal() !== stockEditorOriginalTotal() && (!stockEditorReasonCode || (stockEditorReasonCode === "other" && !stockEditorReasonText.trim())))} type="button"><Save size={16} /> {stockEditorAllowTotalChange ? "Készletkorrekció mentése" : "Áthelyezés mentése"}</button>
            </div>
          </div>
        </>
      )}

      {barcodeScannerOpen && (
        <>
          <MobileBackdrop onClose={() => stopBarcodeScanner()} />
          <div className={sheetPanel}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#cffffd]/70">Vonalkód scanner</p>
                <h2 className="text-lg text-white">Keresés telefon kamerával</h2>
                <p className="mt-1 text-xs leading-5 text-white/58">Olvasás után a kód automatikusan bekerül a keresőbe.</p>
              </div>
              <button className={iconBtn} onClick={() => stopBarcodeScanner()} type="button"><X size={18} /></button>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/14 bg-black/35">
              <video ref={barcodeVideoRef} className="aspect-video w-full bg-black object-cover" muted playsInline />
              <div className="border-t border-white/10 px-3 py-2 text-xs text-white/58">Tartsd stabilan a kamerát, és igazítsd a vonalkódot a kép közepére. Igen, a technika ennyit kér az emberiségtől.</div>
            </div>

            {barcodeScannerStatus ? <div className="mt-3 rounded-2xl border border-[#7bd7d4]/25 bg-[#203f49] px-3 py-2 text-sm text-[#d7fffd]">{barcodeScannerStatus}</div> : null}

            <form className="mt-3 grid grid-cols-[1fr_auto] gap-2" onSubmit={(event) => { event.preventDefault(); submitManualBarcode(); }}>
              <input
                className={input}
                value={barcodeScannerManualValue}
                onChange={(event) => setBarcodeScannerManualValue(event.target.value)}
                placeholder="Kézi / bluetooth vonalkód"
                inputMode="numeric"
                autoComplete="off"
              />
              <button className={primaryBtn} disabled={!barcodeScannerManualValue.trim()} type="submit"><Search size={16} /> Keres</button>
            </form>
          </div>
        </>
      )}

      {imagePreview && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/72 p-4 backdrop-blur-sm" onClick={() => setImagePreview(null)}>
          <div className="w-full max-w-sm rounded-[28px] border border-white/40 bg-white p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={imagePreview.src} alt="" className="max-h-[70vh] w-full rounded-2xl bg-white object-contain" />
            <div className="mt-2 flex items-center justify-between gap-2"><p className="line-clamp-2 text-sm text-slate-800">{imagePreview.title}</p><button className="rounded-xl bg-slate-900 px-3 py-2 text-xs text-white" onClick={() => setImagePreview(null)} type="button">Bezárás</button></div>
          </div>
        </div>
      )}

      <datalist id="warehouse-mobile-size-options">{sizeTypes.map((row) => <option key={row.id} value={row.name || row.code}>{row.name_hu || row.code}</option>)}</datalist>
      <datalist id="warehouse-mobile-color-options">{colorTypes.map((row) => <option key={row.id} value={row.name_ro}>{row.name_hu || row.code}</option>)}</datalist>
    </main>
  );
}
