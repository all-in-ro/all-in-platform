import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Barcode,
  Boxes,
  CheckCircle2,
  ChevronDown,
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
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import ShopifyStatusIcon, { isShopifyExportPending, isShopifyMappedItem, shopifyMappingHasError } from "../components/ShopifyStatusIcon";
import ShopifySyncCenterModal from "../components/ShopifySyncCenterModal";

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
  sort_order?: number | string | null;
  is_active?: boolean;
};

type GenderType = { code: string; name: string; aliases?: string[] | null; sort_order?: number | string | null; is_active?: boolean };

type ColorGroup = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  hex?: string | null;
  sort_order?: number | string | null;
  is_active?: boolean;
};

type ColorType = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  name_en?: string | null;
  name_de?: string | null;
  aliases?: string[] | null;
  hex?: string | null;
  color_group_id?: string | null;
  sort_order?: number | string | null;
  is_active?: boolean;
};

type BrandColorCode = {
  id: string;
  brand_id: string;
  brand_code?: string | null;
  brand_name?: string | null;
  color_code: string;
  color_type_id: string;
  color_type_code?: string | null;
  color_name_ro?: string | null;
  color_name_hu?: string | null;
  color_hex?: string | null;
  is_active?: boolean;
};

type SizeType = { id: string; code?: string; name?: string; name_hu?: string | null; aliases?: string[] | null; sort_order?: number | string | null; is_active?: boolean };

type SupplierBrandLink = { id: string; supplier_id: string; brand_id: string; is_preferred?: boolean; is_active?: boolean };

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
  supplier_source_codes?: string | null;
  supplier_names?: string | null;
  supplier_ids?: string | null;
  suppliers?: Array<{ id?: string; code?: string; name?: string }> | null;
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
  shopify_mapped_at?: string | null;
  shopify_connected_at?: string | null;
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
  old_buy_price?: number | string | null;
  new_buy_price?: number | string | null;
  old_sell_price?: number | string | null;
  new_sell_price?: number | string | null;
  old_compare_at_price?: number | string | null;
  new_compare_at_price?: number | string | null;
  price_change_fields?: string[] | null;
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
  supplierId: string;
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

type NewProductForm = EditForm & {
  supplierId: string;
  supplierVariantCode: string;
  supplierColorCode: string;
  supplierSize: string;
};


type SortMode = "name" | "brand" | "stock_desc" | "stock_asc" | "value_desc" | "incoming_desc" | "incoming_asc" | "shopify_connected_desc" | "missing";
type StockFilter = "all" | "available" | "out" | "reserved" | "missing" | "inactive" | "watch";
type ImageFilter = "all" | "with" | "missing";
type ShopifyFilter = "all" | "mapped" | "recent_mapped" | "exported" | "unmapped" | "error";

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
const MOBILE_WAREHOUSE_INITIAL_PAGE_SIZE = 300;
const MOBILE_WAREHOUSE_BACKGROUND_PAGE_SIZE = 2200;
const MOBILE_WAREHOUSE_MAX_ROWS = 10000;
const MOBILE_WAREHOUSE_CACHE_TTL_MS = 120_000;
const MOBILE_WAREHOUSE_INACTIVE_CACHE_TTL_MS = 300_000;
const MOBILE_WAREHOUSE_FOCUS_REFRESH_AFTER_MS = 60_000;
let warehouseZxingBrowserPromise: Promise<any | null> | null = null;
let mobileWarehouseInactiveCache: { items: InventoryItem[]; loadedAt: number } | null = null;

type MobileWarehouseMetaResponse = {
  suppliers?: MetaItem[];
  brands?: MetaItem[];
  categories?: MetaItem[];
  genderTypes?: GenderType[];
  colorGroups?: ColorGroup[];
  colorTypes?: ColorType[];
  brandColorCodes?: BrandColorCode[];
  sizeTypes?: SizeType[];
  locations?: MetaItem[];
  supplierBrands?: SupplierBrandLink[];
};

type MobileWarehouseInvoiceIndexItem = {
  key: string;
  reception_id?: string | null;
  invoice_number: string;
  supplier_id?: string | null;
  supplier_code?: string | null;
  supplier_name?: string | null;
  invoice_date?: string | null;
  reception_date?: string | null;
  imported_at?: string | null;
  variant_ids?: string[] | null;
};

type MobileWarehouseBootstrapCache = {
  meta: MobileWarehouseMetaResponse;
  stock: StockItem[];
  items: InventoryItem[];
  invoices: MobileWarehouseInvoiceIndexItem[];
  loadedAt: number;
};

let mobileWarehouseBootstrapCache: MobileWarehouseBootstrapCache | null = null;

function mobileWarehouseBootstrapCacheFresh() {
  return Boolean(
    mobileWarehouseBootstrapCache &&
    Date.now() - mobileWarehouseBootstrapCache.loadedAt <= MOBILE_WAREHOUSE_CACHE_TTL_MS
  );
}

function mobileWarehouseYieldToBrowser() {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

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

function looksLikeMobileWarehouseExactIdentifier(value: unknown) {
  const clean = cleanScannedBarcode(value);
  if (clean.length < 6 || clean.length > 80) return false;
  return /^[A-Za-z0-9._:/\-]+$/.test(clean);
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

function mobileWarehouseProductFamilyCode(item: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (item || {}) as Record<string, any>;
  const colorCode = firstText(source.color_code, source.colorCode, source.supplier_color_code, source.supplierColorCode);
  const productCode = firstText(itemProductCode(source));
  const modelCode = firstText(source.model_code, source.modelCode);
  const withoutColorSuffix = (value: string) => {
    const cleanValue = String(value || "").trim();
    const cleanColor = String(colorCode || "").trim();
    if (!cleanValue || !cleanColor) return cleanValue;
    const escaped = cleanColor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return cleanValue.replace(new RegExp(`(?:[-_./:\\s]+)?${escaped}$`, "i"), "").replace(/[-_./:\\s]+$/g, "").trim() || cleanValue;
  };
  return withoutColorSuffix(productCode) || withoutColorSuffix(modelCode.includes(":") ? modelCode.split(":").pop() || modelCode : modelCode) || firstText(source.title_ro, source.shopify_title, source.internal_sku);
}

function mobileWarehouseVariantSizeSortRank(value: unknown) {
  const key = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  const rank = MOBILE_WAREHOUSE_ALPHA_SIZE_RANK.get(key);
  if (rank !== undefined) return rank;
  const numeric = mobileWarehouseSizeSortDescriptor(value);
  return numeric.group * 10000 + numeric.primary * 10 + numeric.secondary;
}

function compareMobileWarehouseVariantPresentation(a: InventoryItem, b: InventoryItem) {
  const compareText = (left: unknown, right: unknown) => String(left || "").localeCompare(String(right || ""), "hu", { numeric: true, sensitivity: "base" });
  const byTitle = compareText(a.title_ro || a.shopify_title, b.title_ro || b.shopify_title);
  if (byTitle !== 0) return byTitle;
  const byFamily = compareText(mobileWarehouseProductFamilyCode(a), mobileWarehouseProductFamilyCode(b));
  if (byFamily !== 0) return byFamily;
  const byColor = compareText(firstText(a.color_code, a.color_name), firstText(b.color_code, b.color_name));
  if (byColor !== 0) return byColor;
  const aSizeRank = mobileWarehouseVariantSizeSortRank(a.size);
  const bSizeRank = mobileWarehouseVariantSizeSortRank(b.size);
  if (aSizeRank !== bSizeRank) return aSizeRank - bSizeRank;
  const bySize = compareMobileWarehouseSizeLabels(a.size, b.size);
  if (bySize !== 0) return bySize;
  return compareText(a.variant_id, b.variant_id);
}

function supplierMatches(item: InventoryItem, selected: string) {
  if (!selected || selected === "all") return true;
  const key = normalizeSearch(selected);
  const values = [
    ...splitCsv(item.supplier_ids),
    ...splitCsv(item.supplier_source_codes),
    ...splitCsv(item.supplier_codes),
    ...splitCsv(item.supplier_names),
    ...(item.suppliers || []).flatMap((row) => [row.id, row.code, row.name]),
  ].map(normalizeSearch);
  return values.some((value) => value === key);
}

function shopifyConnectionMs(item: Partial<InventoryItem>) {
  if (!isShopifyMappedItem(item)) return 0;
  return Math.max(dateTimeMs(item.shopify_mapped_at), dateTimeMs(item.shopify_connected_at));
}

function mobileWarehouseSameColorSizeSibling(a: Partial<InventoryItem> | Record<string, any>, b: Partial<InventoryItem> | Record<string, any>) {
  const aId = selectedVariantIdFromItem(a as any);
  const bId = selectedVariantIdFromItem(b as any);
  if (!aId || !bId || aId === bId) return false;

  const aModelId = firstText((a as any).model_id, (a as any).modelId);
  const bModelId = firstText((b as any).model_id, (b as any).modelId);
  const sameModel = aModelId && bModelId
    ? aModelId === bModelId
    : normalizeSearch(firstText((a as any).model_code, itemProductCode(a))) === normalizeSearch(firstText((b as any).model_code, itemProductCode(b))) &&
      normalizeSearch(firstText((a as any).brand_code, (a as any).brand_name)) === normalizeSearch(firstText((b as any).brand_code, (b as any).brand_name));
  if (!sameModel) return false;

  const aColorCode = firstText((a as any).color_code, (a as any).colorCode);
  const bColorCode = firstText((b as any).color_code, (b as any).colorCode);
  if (aColorCode && bColorCode && normalizeSearch(aColorCode) !== normalizeSearch(bColorCode)) return false;

  const aColorName = firstText((a as any).color_name, (a as any).colorName);
  const bColorName = firstText((b as any).color_name, (b as any).colorName);
  if ((!aColorCode || !bColorCode) && aColorName && bColorName && colorKey(aColorName) !== colorKey(bColorName)) return false;

  const aSize = normalizeSearch((a as any).size);
  const bSize = normalizeSearch((b as any).size);
  return Boolean(aSize && bSize && aSize !== bSize);
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

function colorTypeLabel(row?: Partial<ColorType> | null) {
  if (!row) return "-";
  return firstText(row.name_hu, row.name_ro, row.name_en, row.name_de, row.code) || "-";
}

function colorGroupLabel(row?: Partial<ColorGroup> | null) {
  if (!row) return "-";
  return firstText(row.name_hu, row.name_ro, row.code) || "-";
}

function colorFilterGroupValue(row?: Partial<ColorGroup> | null) {
  const id = String(row?.id || "").trim();
  return id ? `group:${id}` : "";
}

function colorFilterTypeValue(row?: Partial<ColorType> | null) {
  const id = String(row?.id || "").trim();
  return id ? `color:${id}` : "";
}

function colorGroupFromFilterValue(groups: ColorGroup[], value: unknown) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("group:")) return null;
  const id = raw.slice(6);
  return groups.find((row) => String(row.id || "") === id) || null;
}

function colorTypeFromFilterValue(colors: ColorType[], value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || raw === "all" || raw.startsWith("group:")) return null;
  const id = raw.startsWith("color:") ? raw.slice(6) : raw;
  return colors.find((row) => String(row.id || "") === id) || findColorTypeByValue(colors, id);
}

function officialSizeFromTypes(value: unknown, sizes: SizeType[]) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = colorKey(raw);
  const found = (sizes || []).find((row) => [row.code, row.name, row.name_hu, ...(Array.isArray(row.aliases) ? row.aliases : [])]
    .filter(Boolean)
    .some((candidate) => colorKey(candidate) === key));
  return found?.name || raw.toUpperCase();
}

function sizeTypeLabel(row?: Partial<SizeType> | null) {
  if (!row) return "-";
  return firstText(row.name_hu, row.name, row.code) || "-";
}

const MOBILE_WAREHOUSE_ALPHA_SIZE_ORDER = [
  "XXXS", "3XS", "XXS", "2XS", "XS", "XS/S", "S", "S/M", "M", "M/L", "L", "L/XL",
  "XL", "XL/XXL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL", "ST", "MT", "LT", "XLT",
];
const MOBILE_WAREHOUSE_ALPHA_SIZE_RANK = new Map(MOBILE_WAREHOUSE_ALPHA_SIZE_ORDER.map((value, index) => [value, index]));
const MOBILE_WAREHOUSE_ONE_SIZE_KEYS = new Set(["OSFM", "OSFA", "OSFW", "ONE SIZE", "ONESIZE", "ONE-SIZE", "OS", "UNI", "UNIVERSAL", "TU"]);

function mobileWarehouseSizeSortDescriptor(value: unknown) {
  const display = String(value ?? "").trim().replace(/,/g, ".");
  const upper = display.toUpperCase().replace(/\s+/g, " ").trim();
  const compact = upper.replace(/\s+/g, "");
  const alphaRank = MOBILE_WAREHOUSE_ALPHA_SIZE_RANK.get(compact);
  if (alphaRank !== undefined) return { group: 0, primary: alphaRank, secondary: 0, display };
  const alphaNumeric = compact.match(/^([A-Z0-9]+)\/(\d+(?:\.\d+)?)$/);
  if (alphaNumeric) {
    const rank = MOBILE_WAREHOUSE_ALPHA_SIZE_RANK.get(alphaNumeric[1]);
    if (rank !== undefined) return { group: 0, primary: rank, secondary: Number(alphaNumeric[2]) || 0, display };
  }
  if (MOBILE_WAREHOUSE_ONE_SIZE_KEYS.has(upper) || MOBILE_WAREHOUSE_ONE_SIZE_KEYS.has(compact)) return { group: 1, primary: 0, secondary: 0, display };
  const numericSource = upper.replace(/^EU\s*/, "");
  const simpleNumber = numericSource.match(/^(\d+(?:\.\d+)?)$/);
  if (simpleNumber) return { group: 2, primary: Number(simpleNumber[1]), secondary: 0, display };
  const mixedFraction = numericSource.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedFraction) {
    const denominator = Number(mixedFraction[3]) || 1;
    return { group: 2, primary: Number(mixedFraction[1]) + Number(mixedFraction[2]) / denominator, secondary: 0.1, display };
  }
  const range = numericSource.match(/^(\d+(?:\.\d+)?)\s*[-/]\s*(\d+(?:\.\d+)?)$/);
  if (range) return { group: 3, primary: Number(range[1]), secondary: Number(range[2]), display };
  const numericPrefix = numericSource.match(/^(\d+(?:\.\d+)?)/);
  if (numericPrefix) return { group: 4, primary: Number(numericPrefix[1]), secondary: 0, display };
  return { group: 5, primary: 0, secondary: 0, display };
}

function compareMobileWarehouseSizeLabels(leftValue: unknown, rightValue: unknown) {
  const left = mobileWarehouseSizeSortDescriptor(leftValue);
  const right = mobileWarehouseSizeSortDescriptor(rightValue);
  if (left.group !== right.group) return left.group - right.group;
  if (left.primary !== right.primary) return left.primary - right.primary;
  if (left.secondary !== right.secondary) return left.secondary - right.secondary;
  return left.display.localeCompare(right.display, "hu", { numeric: true, sensitivity: "base" });
}

function compareMobileWarehouseSizeTypes(left: SizeType, right: SizeType) {
  return compareMobileWarehouseSizeLabels(sizeTypeLabel(left), sizeTypeLabel(right));
}

function mobileSelectedSizeMatchKeys(selected: string[], rows: SizeType[]) {
  const selectedExact = new Set((selected || []).map((value) => String(value || "").trim()).filter(Boolean));
  const selectedKeys = new Set((selected || []).map(colorKey).filter(Boolean));
  const allowed = new Set<string>();
  for (const row of rows || []) {
    if (row.is_active === false) continue;
    const values = [row.id, row.code, row.name, row.name_hu, ...(Array.isArray(row.aliases) ? row.aliases : [])]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (!selectedExact.has(String(row.id || "")) && !values.some((value) => selectedKeys.has(colorKey(value)))) continue;
    values.forEach((value) => { const key = colorKey(value); if (key) allowed.add(key); });
  }
  selected.forEach((value) => { const key = colorKey(value); if (key) allowed.add(key); });
  return allowed;
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

function mergeMobileInventoryItems(baseItems: InventoryItem[], extraItems: InventoryItem[]) {
  const map = new Map<string, InventoryItem>();
  for (const item of baseItems || []) {
    const id = selectedVariantIdFromItem(item as any);
    if (id) map.set(id, { ...item, variant_id: id });
  }
  for (const item of extraItems || []) {
    const id = selectedVariantIdFromItem(item as any);
    if (!id) continue;
    map.set(id, { ...(map.get(id) || {}), ...item, variant_id: id });
  }
  return Array.from(map.values());
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
    supplierId: "",
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


function emptyNewProductForm(): NewProductForm {
  return {
    ...emptyForm(),
    supplierId: "",
    supplierVariantCode: "",
    supplierColorCode: "",
    supplierSize: "",
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
    supplierId: fieldValue(item.supplier_id || item.supplierId),
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

const mobileEditComparableKeys: Array<keyof EditForm> = [
  "titleRo", "titleHu", "descriptionRo", "gender", "productType", "season", "material", "shopifyTitle",
  "modelStatus", "brandCode", "categoryCode", "subCategoryCode", "barcode", "supplierId", "supplierProductCode", "snCod",
  "customsTariffCode", "colorCode", "colorName", "size", "buyPrice", "sellPrice", "compareAtPrice", "imageUrl", "variantStatus",
];

function mobileEditFormsEqual(a: EditForm, b: EditForm) {
  return mobileEditComparableKeys.every((key) => String(a[key] ?? "").trim() === String(b[key] ?? "").trim());
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

type MobileSelectOption = {
  value: string;
  label: string;
  hint?: string;
  swatch?: string;
  depth?: number;
  disabled?: boolean;
};

function MobileSingleSelect({
  labelText,
  value,
  options,
  onChange,
  emptyValue = "all",
  emptyText = "Összes",
  showEmptyOption = true,
  disabled = false,
}: {
  labelText: string;
  value: string;
  options: MobileSelectOption[];
  onChange: (value: string) => void;
  emptyValue?: string;
  emptyText?: string;
  showEmptyOption?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const selected = options.find((option) => String(option.value) === String(value)) || null;
  const isEmpty = showEmptyOption && String(value) === String(emptyValue);
  const summary = isEmpty ? emptyText : selected?.label || emptyText;
  const searchable = options.length > 8;
  const pickerSearchKey = normalizeSearch(pickerSearch);
  const visibleOptions = pickerSearchKey
    ? options.filter((option) => normalizeSearch(`${option.label} ${option.hint || ""}`).includes(pickerSearchKey))
    : options;

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closePicker() {
    setOpen(false);
    setPickerSearch("");
  }

  const picker = open && typeof document !== "undefined" ? createPortal(
    <>
      <button type="button" aria-label="Választó bezárása" className="fixed inset-0 z-[88] bg-black/68 backdrop-blur-[2px]" onClick={closePicker} />
      <section
        className="fixed inset-x-2 z-[89] flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/20 bg-[#303a4c] shadow-[0_28px_90px_rgba(0,0,0,.62)]"
        style={{ top: "max(8px, env(safe-area-inset-top))", bottom: "max(8px, env(safe-area-inset-bottom))", color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        <div className="shrink-0 border-b border-white/10 bg-[#354153] px-3 pb-2.5 pt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#cffffd]/65">Kiválasztás</p>
              <h3 className="mt-0.5 truncate text-[17px] font-medium text-white">{labelText}</h3>
              <p className="mt-0.5 text-[11px] text-white/45">{options.length} választható érték</p>
            </div>
            <button className={iconBtn} type="button" onClick={closePicker} aria-label="Bezárás"><X size={18} /></button>
          </div>
          {searchable ? (
            <div className="relative mt-2.5">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/42" />
              <input
                className={`${input} h-10 pl-9 pr-9 !text-white`}
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff", caretColor: "#ffffff" }}
                value={pickerSearch}
                onChange={(event) => setPickerSearch(event.target.value)}
                placeholder={`Keresés: ${labelText.toLowerCase()}`}
                autoFocus
              />
              {pickerSearch ? <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-white/48 hover:bg-white/10 hover:text-white" onClick={() => setPickerSearch("")}><X size={14} /></button> : null}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-gutter:stable]">
          {showEmptyOption ? (
            <button
              type="button"
              className={`mb-1 flex min-h-11 w-full items-center gap-2 rounded-2xl border px-3 text-left text-sm !text-white transition ${isEmpty ? "border-[#7bd7d4]/55 bg-[#1f7775]" : "border-white/10 bg-[#293548] hover:bg-[#334158]"}`}
              style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              onClick={() => { onChange(emptyValue); closePicker(); }}
            >
              <span className="min-w-0 flex-1 truncate">{emptyText}</span>
              {isEmpty ? <CheckCircle2 size={16} className="shrink-0 text-[#d7fffd]" /> : null}
            </button>
          ) : null}

          <div className="grid gap-1.5">
            {visibleOptions.map((option) => {
              const active = String(option.value) === String(value);
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm !text-white transition ${active ? "border-[#7bd7d4]/55 bg-[#1f7775]" : "border-white/[0.07] bg-[#293548] hover:bg-[#334158]"} disabled:cursor-not-allowed disabled:opacity-40`}
                  style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
                  onClick={() => { if (!option.disabled) { onChange(option.value); closePicker(); } }}
                  title={option.hint || option.label}
                >
                  <span style={{ width: `${Math.max(0, Number(option.depth || 0)) * 13}px` }} className="shrink-0" />
                  {option.swatch ? <span className="h-4 w-4 shrink-0 rounded-full border border-white/40 bg-white/10 shadow-[0_0_0_2px_rgba(255,255,255,.035)]" style={{ backgroundColor: option.swatch }} /> : null}
                  <span className="min-w-0 flex-1 truncate font-medium !text-white" style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}>{option.label}</span>
                  {option.hint ? <span className="max-w-[42%] shrink-0 truncate text-[10px] !text-white/65" style={{ color: "rgba(255,255,255,0.68)", WebkitTextFillColor: "rgba(255,255,255,0.68)" }}>{option.hint}</span> : null}
                  {active ? <CheckCircle2 size={16} className="shrink-0 text-[#d7fffd]" /> : null}
                </button>
              );
            })}
          </div>

          {!visibleOptions.length ? <div className="grid min-h-36 place-items-center px-4 text-center text-sm text-white/48">Nincs találat erre a keresésre.</div> : null}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#2b3546] p-3">
          <button className={`${primaryBtn} h-11 w-full !text-white`} style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }} type="button" onClick={closePicker}>Kész</button>
        </div>
      </section>
    </>,
    document.body,
  ) : null;

  return (
    <div className={label}>
      {labelText}
      <button
        type="button"
        disabled={disabled}
        className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-2xl border border-white/16 bg-[#263246] px-3 text-left text-sm !text-white outline-none transition hover:bg-[#2e3b50] focus:border-[#7bd7d4]/65 disabled:cursor-not-allowed disabled:opacity-45"
        style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
        onClick={() => { setPickerSearch(""); setOpen(true); }}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected?.swatch ? <span className="h-4 w-4 shrink-0 rounded-full border border-white/35" style={{ backgroundColor: selected.swatch }} /> : null}
          <span className="min-w-0 flex-1 truncate !text-white" style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}>{summary}</span>
        </span>
        <ChevronDown size={16} className="shrink-0 text-white/48" />
      </button>
      {picker}
    </div>
  );
}

function MobileMultiSelect({
  labelText,
  values,
  options,
  onChange,
  emptyText = "Összes",
}: {
  labelText: string;
  values: string[];
  options: MobileSelectOption[];
  onChange: (values: string[]) => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const selectedSet = useMemo(() => new Set((values || []).map(String)), [values]);
  const selectedRows = options.filter((option) => selectedSet.has(String(option.value)));
  const summary = !selectedRows.length ? emptyText : selectedRows.length <= 2 ? selectedRows.map((row) => row.label).join(" + ") : `${selectedRows.length} kiválasztva`;
  const searchable = options.length > 10;
  const pickerSearchKey = normalizeSearch(pickerSearch);
  const visibleOptions = pickerSearchKey
    ? options.filter((option) => normalizeSearch(`${option.label} ${option.hint || ""}`).includes(pickerSearchKey))
    : options;

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closePicker() {
    setOpen(false);
    setPickerSearch("");
  }

  const toggle = (value: string) => {
    const next = new Set((values || []).map(String));
    if (next.has(String(value))) next.delete(String(value)); else next.add(String(value));
    onChange(Array.from(next));
  };

  function selectVisible() {
    const next = new Set((values || []).map(String));
    for (const option of visibleOptions) if (!option.disabled) next.add(String(option.value));
    onChange(Array.from(next));
  }

  const picker = open && typeof document !== "undefined" ? createPortal(
    <>
      <button type="button" aria-label="Választó bezárása" className="fixed inset-0 z-[88] bg-black/68 backdrop-blur-[2px]" onClick={closePicker} />
      <section
        className="fixed inset-x-2 z-[89] flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/20 bg-[#303a4c] shadow-[0_28px_90px_rgba(0,0,0,.62)]"
        style={{ top: "max(8px, env(safe-area-inset-top))", bottom: "max(8px, env(safe-area-inset-bottom))", color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        <div className="shrink-0 border-b border-white/10 bg-[#354153] px-3 pb-2.5 pt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#cffffd]/65">Több érték</p>
              <h3 className="mt-0.5 truncate text-[17px] font-medium text-white">{labelText}</h3>
              <p className="mt-0.5 text-[11px] text-white/45">{selectedRows.length ? `${selectedRows.length} kijelölve • ` : ""}{options.length} választható</p>
            </div>
            <button className={iconBtn} type="button" onClick={closePicker} aria-label="Bezárás"><X size={18} /></button>
          </div>
          {searchable ? (
            <div className="relative mt-2.5">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/42" />
              <input
                className={`${input} h-10 pl-9 pr-9 !text-white`}
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff", caretColor: "#ffffff" }}
                value={pickerSearch}
                onChange={(event) => setPickerSearch(event.target.value)}
                placeholder={`Keresés: ${labelText.toLowerCase()}`}
                autoFocus
              />
              {pickerSearch ? <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-white/48 hover:bg-white/10 hover:text-white" onClick={() => setPickerSearch("")}><X size={14} /></button> : null}
            </div>
          ) : null}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-white/10 bg-[#2f394a] px-3 py-2.5">
          <button className={`${softBtn} h-9 !text-white`} style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }} type="button" onClick={() => onChange([])}>Összes</button>
          <button className={`${softBtn} h-9 !text-white`} style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }} type="button" onClick={selectVisible} disabled={!visibleOptions.some((option) => !option.disabled)}>{pickerSearchKey ? "Találatok kijelölése" : "Mind kijelölése"}</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-gutter:stable]">
          <div className="grid gap-1.5">
            {visibleOptions.map((option) => {
              const active = selectedSet.has(String(option.value));
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm !text-white transition ${active ? "border-[#7bd7d4]/55 bg-[#1f7775]" : "border-white/[0.07] bg-[#293548] hover:bg-[#334158]"} disabled:cursor-not-allowed disabled:opacity-40`}
                  style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
                  onClick={() => !option.disabled && toggle(option.value)}
                  title={option.hint || option.label}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${active ? "border-[#7bd7d4]/70 bg-[#2a8d8b]" : "border-white/28 bg-[#202b3b]"}`}>{active ? <CheckCircle2 size={14} /> : null}</span>
                  {option.swatch ? <span className="h-4 w-4 shrink-0 rounded-full border border-white/40" style={{ backgroundColor: option.swatch }} /> : null}
                  <span className="min-w-0 flex-1 truncate font-medium !text-white" style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}>{option.label}</span>
                  {option.hint ? <span className="max-w-[42%] shrink-0 truncate text-[10px] !text-white/65" style={{ color: "rgba(255,255,255,0.68)", WebkitTextFillColor: "rgba(255,255,255,0.68)" }}>{option.hint}</span> : null}
                </button>
              );
            })}
          </div>
          {!visibleOptions.length ? <div className="grid min-h-36 place-items-center px-4 text-center text-sm text-white/48">Nincs találat erre a keresésre.</div> : null}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[#2b3546] p-3">
          <button className={`${primaryBtn} h-11 w-full !text-white`} style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }} type="button" onClick={closePicker}>Kész{selectedRows.length ? ` • ${selectedRows.length} kijelölve` : ""}</button>
        </div>
      </section>
    </>,
    document.body,
  ) : null;

  return (
    <div className={label}>
      {labelText}
      <button type="button" className="flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-white/16 bg-[#263246] px-3 text-left text-sm !text-white" style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }} onClick={() => { setPickerSearch(""); setOpen(true); }}>
        <span className="min-w-0 flex-1 truncate !text-white" style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}>{summary}</span>
        <span className="flex shrink-0 items-center gap-1.5">{selectedRows.length ? <span className="rounded-full bg-[#2a8d8b]/35 px-1.5 py-0.5 text-[10px] text-[#d7fffd]">{selectedRows.length}</span> : null}<ChevronDown size={16} className="text-white/48" /></span>
      </button>
      {picker}
    </div>
  );
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

function historyIsPriceEvent(event: VariantHistoryEvent) {
  const type = String(event.event_type || "").toLowerCase();
  const source = String(event.source_type || "").toLowerCase();
  const movement = String(event.movement_type || "").toLowerCase();
  return type === "price" || type === "price_change" || source.includes("price") || movement.includes("price");
}

function mobileHistoryPriceRows(event: VariantHistoryEvent) {
  const rawRows = Array.isArray(event.raw?.priceChanges) ? event.raw?.priceChanges as Array<Record<string, unknown>> : [];
  if (rawRows.length) return rawRows.map((row) => ({ label: firstText(row.label, row.key) || "Ár", oldValue: row.oldValue, newValue: row.newValue }));
  const rows = [
    { label: "Vételár", oldValue: event.old_buy_price, newValue: event.new_buy_price },
    { label: "Eladási ár", oldValue: event.old_sell_price, newValue: event.new_sell_price },
    { label: "Akció előtti ár", oldValue: event.old_compare_at_price, newValue: event.new_compare_at_price },
  ].filter((row) => String(row.oldValue ?? "") !== String(row.newValue ?? ""));
  return rows.length ? rows : (event.price_change_fields || []).map((label) => ({ label, oldValue: null, newValue: null }));
}

function historyEventBadge(event: VariantHistoryEvent) {
  const type = String(event.event_type || "").toLowerCase();
  const direction = String(event.direction || "").toLowerCase();
  if (historyIsPriceEvent(event)) return { label: "Árváltozás", cls: "border-amber-300/35 bg-amber-500/16 text-amber-50" };
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
              const isPrice = historyIsPriceEvent(event);
              const priceRows = isPrice ? mobileHistoryPriceRows(event) : [];
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
                      <p className="truncate">{isPrice ? `Módosított mező: ${priceRows.map((row) => row.label).join(", ") || "Ár"}` : route}</p>
                      {event.supplier_name ? <p className="truncate">Beszállító: {event.supplier_name}</p> : null}
                      {event.invoice_number ? <p className="truncate">Számla: {event.invoice_number}</p> : null}
                      {event.source_file_name ? <p className="truncate">{event.source_file_name}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg leading-none text-white">{isPrice ? "Ár" : historyQty(event.qty_delta, true)}</p>
                      {!isPrice ? <p className="mt-1 text-[11px] text-white/46">{historyQty(event.qty_before)} → {historyQty(event.qty_after)}</p> : null}
                    </div>
                  </div>
                  {isPrice ? (
                    <div className="mt-2 rounded-2xl border border-amber-200/15 bg-amber-500/10 px-3 py-2 text-[11px] text-white/70">
                      {priceRows.length ? priceRows.map((row, index) => (
                        <div key={`${row.label}-${index}`} className="mt-1 flex justify-between gap-3 first:mt-0">
                          <span>{row.label}</span>
                          <strong className="text-white">{row.label === "Vételár" && !pricesVisible ? "•••• → ••••" : `${money(row.oldValue)} → ${money(row.newValue)}`}</strong>
                        </div>
                      )) : <span>Ár módosítva.</span>}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-2xl border border-white/10 bg-[#202838] px-3 py-2 text-[11px] text-white/62">
                      <div className="flex justify-between gap-3"><span>Vételár</span><strong className="text-white">{pricesVisible ? money(event.effective_buy_price) : "••••"}</strong></div>
                      <div className="mt-1 flex justify-between gap-3"><span>Eladási ár</span><strong className="text-white">{money(event.effective_sell_price)}</strong></div>
                      <div className="mt-1 flex justify-between gap-3"><span>Haszon TVA nélkül</span><strong className="text-[#cffffd]">{pricesVisible ? priceMarkupPercentText(event.effective_buy_price, event.effective_sell_price) || "-" : "••••"}</strong></div>
                    </div>
                  )}
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
  const [catalogSearchItems, setCatalogSearchItems] = useState<InventoryItem[]>([]);
  const [catalogSearchBusy, setCatalogSearchBusy] = useState(false);
  const [inactiveProductsBusy, setInactiveProductsBusy] = useState(false);
  const [activationBlockMissing, setActivationBlockMissing] = useState<string[] | null>(null);
  const [stockRows, setStockRows] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers] = useState<MetaItem[]>([]);
  const [supplierBrands, setSupplierBrands] = useState<SupplierBrandLink[]>([]);
  const [brands, setBrands] = useState<MetaItem[]>([]);
  const [categories, setCategories] = useState<MetaItem[]>([]);
  const [genderTypes, setGenderTypes] = useState<GenderType[]>([]);
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([]);
  const [colorTypes, setColorTypes] = useState<ColorType[]>([]);
  const [brandColorCodes, setBrandColorCodes] = useState<BrandColorCode[]>([]);
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [locations, setLocations] = useState<MetaItem[]>([]);
  const [invoiceIndexRows, setInvoiceIndexRows] = useState<MobileWarehouseInvoiceIndexItem[]>([]);
  const [search, setSearch] = useState("");
  const [snCodFilter, setSnCodFilter] = useState("");
  const [supplier, setSupplier] = useState("all");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");
  const [subCategory, setSubCategory] = useState("all");
  const [genderFilters, setGenderFilters] = useState<string[]>([]);
  const [sizeFilters, setSizeFilters] = useState<string[]>([]);
  const [color, setColor] = useState("all");
  const [location, setLocation] = useState("all");
  const [invoiceFilter, setInvoiceFilter] = useState("all");
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
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProductForm>(() => emptyNewProductForm());
  const [newProductStockRows, setNewProductStockRows] = useState<Record<string, string>>({});
  const [newProductSaving, setNewProductSaving] = useState(false);
  const [newProductBarcodeConflict, setNewProductBarcodeConflict] = useState<MobileBarcodeConflictInfo | null>(null);
  const [shopifySyncCenterOpen, setShopifySyncCenterOpen] = useState(false);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [edit, setEdit] = useState<EditForm>(emptyForm());
  const [editBaseline, setEditBaseline] = useState<EditForm>(emptyForm());
  const [detailCloseConfirmOpen, setDetailCloseConfirmOpen] = useState(false);
  const [productDeleteTarget, setProductDeleteTarget] = useState<InventoryItem | null>(null);
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
  const loadSequenceRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const catalogSearchSequenceRef = useRef(0);
  const catalogSearchAbortRef = useRef<AbortController | null>(null);
  const loadInFlightRef = useRef(false);
  const lastSuccessfulLoadAtRef = useRef(0);

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

  async function apiInventory({
    signal,
    onProgress,
  }: {
    signal?: AbortSignal;
    onProgress?: (items: InventoryItem[], done: boolean, total: number | null) => void;
  } = {}) {
    const items: InventoryItem[] = [];
    const seenVariantIds = new Set<string>();
    let offset = 0;
    let requestIndex = 0;
    let total: number | null = null;

    while (offset < MOBILE_WAREHOUSE_MAX_ROWS) {
      if (signal?.aborted) throw new DOMException("A mobil raktárbetöltés megszakadt.", "AbortError");

      const pageSize = requestIndex === 0
        ? MOBILE_WAREHOUSE_INITIAL_PAGE_SIZE
        : MOBILE_WAREHOUSE_BACKGROUND_PAGE_SIZE;
      const qs = new URLSearchParams();
      qs.set("limit", String(pageSize));
      qs.set("offset", String(offset));

      const page = await fetchAifJSON<{
        items: InventoryItem[];
        hasMore?: boolean;
        returned?: number;
        total?: number | null;
        warehouseFast?: boolean;
      }>(`/warehouse-products?${qs.toString()}`, { signal });

      const rows = Array.isArray(page.items) ? page.items : [];
      const serverTotal = Number(page.total);
      if (Number.isFinite(serverTotal) && serverTotal >= 0) total = serverTotal;

      let added = 0;
      for (const item of rows) {
        const id = selectedVariantIdFromItem(item as any) || String(item.variant_id || "").trim();
        if (!id || seenVariantIds.has(id)) continue;
        seenVariantIds.add(id);
        items.push({ ...item, variant_id: id });
        added += 1;
      }

      offset += rows.length;
      const done = page.hasMore === false || rows.length < pageSize || (total !== null && items.length >= total);
      onProgress?.(items.slice(), done, total);
      if (done) break;

      if (rows.length === 0 || added === 0) {
        throw new Error("A gyorsított mobil raktár API nem halad tovább. Ellenőrizd, hogy a FAST V3 aif.js fut-e a szerveren.");
      }

      requestIndex += 1;
      if (requestIndex === 1) await mobileWarehouseYieldToBrowser();
    }

    return { items, total };
  }

  async function apiInactiveWarehouseProducts(signal?: AbortSignal) {
    if (mobileWarehouseInactiveCache && Date.now() - mobileWarehouseInactiveCache.loadedAt <= MOBILE_WAREHOUSE_INACTIVE_CACHE_TTL_MS) {
      return mobileWarehouseInactiveCache.items.slice();
    }

    const rows: InventoryItem[] = [];
    const seen = new Set<string>();
    let offset = 0;
    const pageSize = 1000;
    let total: number | null = null;

    while (offset < 30000) {
      if (signal?.aborted) throw new DOMException("Az inaktív termékek betöltése megszakadt.", "AbortError");
      const qs = new URLSearchParams();
      qs.set("mode", "inactive");
      qs.set("limit", String(pageSize));
      qs.set("offset", String(offset));
      const page = await fetchAifJSON<{ items?: InventoryItem[]; hasMore?: boolean; total?: number | null }>(`/warehouse-products?${qs.toString()}`, { signal });
      const pageRows = Array.isArray(page.items) ? page.items : [];
      const serverTotal = Number(page.total);
      if (Number.isFinite(serverTotal) && serverTotal >= 0) total = serverTotal;
      for (const item of pageRows) {
        const id = selectedVariantIdFromItem(item as any);
        if (!id || seen.has(id) || itemStatus(item) === "archived" || modelStatus(item) === "archived") continue;
        seen.add(id);
        rows.push({ ...item, variant_id: id });
      }
      offset += pageRows.length;
      if (page.hasMore === false || pageRows.length < pageSize || (total !== null && offset >= total)) break;
      if (!pageRows.length) break;
      await mobileWarehouseYieldToBrowser();
    }

    mobileWarehouseInactiveCache = { items: rows.slice(), loadedAt: Date.now() };
    return rows;
  }

  async function apiMeta(signal?: AbortSignal) {
    return fetchAifJSON<MobileWarehouseMetaResponse>(`/meta?scope=warehouse`, { signal });
  }

  async function apiStock(signal?: AbortSignal) {
    return fetchAifJSON<{ items: StockItem[] }>(`/stock?compact=1`, { signal });
  }

  async function apiWarehouseInvoices(signal?: AbortSignal) {
    return fetchAifJSON<{ items?: MobileWarehouseInvoiceIndexItem[] }>(`/warehouse-invoices`, { signal });
  }

  async function apiInventoryLookup(code: string, signal?: AbortSignal) {
    const clean = cleanScannedBarcode(code);
    if (!clean) return { items: [] as InventoryItem[] };
    const qs = new URLSearchParams();
    qs.set("code", clean);
    qs.set("_", String(Date.now()));
    return fetchAifJSON<{ ok?: boolean; code?: string; matchType?: string | null; items?: InventoryItem[] }>(`/inventory/lookup?${qs.toString()}`, { signal });
  }

  async function apiCatalogSearch(searchText: string, signal?: AbortSignal, snCodText = "") {
    const clean = String(searchText || "").trim();
    const cleanSn = String(snCodText || "").trim();
    if (!clean && !cleanSn) return { items: [] as InventoryItem[] };
    const qs = new URLSearchParams();
    if (clean) qs.set("search", clean);
    if (cleanSn) qs.set("snCod", cleanSn);
    qs.set("includeZero", "1");
    qs.set("limit", "200");
    qs.set("offset", "0");
    qs.set("_", String(Date.now()));
    return fetchAifJSON<{ ok?: boolean; items?: InventoryItem[]; total?: number | null }>(`/inventory?${qs.toString()}`, { signal });
  }

  async function apiImportBatches(limit = 60) {
    return fetchAifJSON<{ items?: Array<Record<string, any>> }>(`/import-batches?limit=${encodeURIComponent(String(limit))}`);
  }

  async function apiImportBatchInventory(batchId: string) {
    return fetchAifJSON<{
      ok?: boolean;
      batch?: Record<string, any> | null;
      items?: InventoryItem[];
      rows?: Array<Record<string, any>>;
      variantIds?: string[];
      rowCount?: number;
      totalQty?: number;
    }>(`/import-batches/${encodeURIComponent(batchId)}/inventory`);
  }

  async function apiVariantDetail(id: string) {
    return fetchAifJSON<DetailResponse>(`/variants/${encodeURIComponent(id)}`);
  }

  function mobileCatalogItemFromDetail(detail: DetailResponse, fallbackBarcode = ""): InventoryItem | null {
    const raw = (detail?.item || {}) as Record<string, any>;
    const variantId = firstText(raw.variant_id, raw.id);
    if (!variantId) return null;
    const rows = Array.isArray(detail?.stock) ? detail.stock : [];
    const totalQty = rows.reduce((sum, row) => sum + n(row?.qty), 0);
    const reservedQty = rows.reduce((sum, row) => sum + n(row?.reserved_qty), 0);
    const availableQty = rows.reduce((sum, row) => sum + (row?.available_qty !== undefined && row?.available_qty !== null ? n(row.available_qty) : n(row?.qty) - n(row?.reserved_qty)), 0);
    return {
      ...raw,
      variant_id: variantId,
      barcode: firstText(raw.barcode, fallbackBarcode) || null,
      display_barcode: firstText(raw.display_barcode, raw.barcode, fallbackBarcode) || null,
      variant_status: firstText(raw.variant_status, raw.variantStatus, raw.status, "active") || "active",
      model_status: firstText(raw.model_status, raw.modelStatus, "active") || "active",
      total_qty: rows.length ? totalQty : (raw.total_qty ?? 0),
      total_reserved_qty: rows.length ? reservedQty : (raw.total_reserved_qty ?? 0),
      available_qty: rows.length ? availableQty : (raw.available_qty ?? raw.total_qty ?? 0),
    } as InventoryItem;
  }

  async function lookupMobileBarcodeOwner(code: string, signal?: AbortSignal) {
    const clean = cleanScannedBarcode(code);
    if (!looksLikeMobileWarehouseExactIdentifier(clean)) return [] as InventoryItem[];
    try {
      const owner = await apiBarcodeConflictCheck(clean, "", signal);
      const variantId = String(owner?.conflict?.variantId || "").trim();
      if (!variantId) return [] as InventoryItem[];
      const detail = await fetchAifJSON<DetailResponse>(`/variants/${encodeURIComponent(variantId)}`, { signal });
      const item = mobileCatalogItemFromDetail(detail, owner.barcode || clean);
      return item && itemStatus(item) !== "archived" && modelStatus(item) !== "archived" ? [item] : [];
    } catch (error: any) {
      if (signal?.aborted || error?.name === "AbortError") throw error;
      return [] as InventoryItem[];
    }
  }

  async function apiVariantHistory(id: string) {
    return fetchAifJSON<VariantHistoryResponse>(`/variants/${encodeURIComponent(id)}/history?limit=700`);
  }

  async function apiVariantUpdate(id: string, payload: Record<string, unknown>) {
    return fetchAifJSON<{ ok: true }>(`/variants/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  async function apiBarcodeConflictCheck(barcode: string, excludeVariantId = "", signal?: AbortSignal) {
    const cleanBarcode = cleanScannedBarcode(barcode);
    if (!cleanBarcode) return { ok: true as const, barcode: "", conflict: null as Record<string, any> | null };
    const qs = new URLSearchParams();
    qs.set("barcode", cleanBarcode);
    if (excludeVariantId) qs.set("excludeVariantId", excludeVariantId);
    qs.set("_", String(Date.now()));
    return fetchAifJSON<{ ok: true; barcode: string; conflict: Record<string, any> | null }>(`/barcode-conflict?${qs.toString()}`, { signal });
  }

  async function apiCreateManualProduct(payload: Record<string, unknown>) {
    return fetchAifJSON<{ ok: true; variantId: string; modelId?: string | null; qty?: number }>(`/manual-products`, { method: "POST", body: JSON.stringify(payload) });
  }

  async function apiVariantDelete(id: string) {
    return fetchAifJSON<{ ok: true; mode?: string }>(`/variants/${encodeURIComponent(id)}?force=1&_=${Date.now()}`, { method: "DELETE" });
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

  const newProductBarcodeMatches = useMemo(() => {
    if (!newProductOpen) return [] as InventoryItem[];
    const barcode = cleanScannedBarcode(newProduct.barcode);
    if (!barcode) return [] as InventoryItem[];
    const key = barcode.toLowerCase();
    return mergeMobileInventoryItems(items, catalogSearchItems)
      .filter((item) => cleanScannedBarcode(item.barcode || "").toLowerCase() === key)
      .slice(0, 4);
  }, [newProductOpen, newProduct.barcode, items, catalogSearchItems]);

  const effectiveNewProductBarcodeConflict = useMemo(
    () => newProductBarcodeConflict || (newProductBarcodeMatches[0] ? mobileBarcodeConflictInfoFromItem(newProductBarcodeMatches[0], newProduct.barcode) : null),
    [newProductBarcodeConflict, newProductBarcodeMatches, newProduct.barcode],
  );

  useEffect(() => {
    if (!newProductOpen) { setNewProductBarcodeConflict(null); return; }
    const barcode = cleanScannedBarcode(newProduct.barcode);
    if (!barcode) { setNewProductBarcodeConflict(null); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void apiBarcodeConflictCheck(barcode)
        .then((result) => { if (!cancelled) setNewProductBarcodeConflict(result.conflict ? barcodeConflictInfoFromApi({ barcode: result.barcode, conflict: result.conflict }) : null); })
        .catch(() => undefined);
    }, 320);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [newProductOpen, newProduct.barcode]);

  const editBarcodeMatches = useMemo(() => {
    const currentVariantId = String(detail?.item?.id || detail?.item?.variant_id || "").trim();
    const barcode = cleanScannedBarcode(edit.barcode);
    if (!currentVariantId || !barcode) return [] as InventoryItem[];
    const key = barcode.toLowerCase();
    return mergeMobileInventoryItems(items, catalogSearchItems)
      .filter((item) => selectedVariantIdFromItem(item as any) !== currentVariantId)
      .filter((item) => cleanScannedBarcode(item.barcode || "").toLowerCase() === key)
      .slice(0, 4);
  }, [detail?.item?.id, detail?.item?.variant_id, edit.barcode, items, catalogSearchItems]);

  const effectiveEditBarcodeConflict = useMemo(
    () => editBarcodeConflict || (editBarcodeMatches[0] ? mobileBarcodeConflictInfoFromItem(editBarcodeMatches[0], edit.barcode) : null),
    [editBarcodeConflict, editBarcodeMatches, edit.barcode],
  );
  const detailHasChanges = useMemo(() => detailOpen && !mobileEditFormsEqual(edit, editBaseline), [detailOpen, edit, editBaseline]);

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

  useEffect(() => {
    if (!activationBlockMissing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setActivationBlockMissing(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activationBlockMissing]);

  const stockMap = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    for (const row of stockRows) {
      const id = String(row.variant_id || "").trim();
      if (!id) continue;
      const current = map.get(id) || [];
      current.push(row);
      map.set(id, current);
    }
    return map;
  }, [stockRows]);

  function stockRowsForVariant(variantId?: string | null) {
    return stockMap.get(String(variantId || "")) || [];
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

  function applyMobileWarehouseMeta(meta: MobileWarehouseMetaResponse) {
    setSuppliers((meta.suppliers || []).filter((x) => x.is_active !== false));
    setSupplierBrands((meta.supplierBrands || []).filter((x) => x.is_active !== false));
    setBrands((meta.brands || []).filter((x) => x.is_active !== false));
    setCategories((meta.categories || []).filter((x) => x.is_active !== false));
    setGenderTypes((meta.genderTypes || []).filter((x) => x.is_active !== false));
    setColorGroups((meta.colorGroups || []).filter((x) => x.is_active !== false).slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || colorGroupLabel(a).localeCompare(colorGroupLabel(b), "hu", { sensitivity: "base" })));
    setColorTypes((meta.colorTypes || []).filter((x) => x.is_active !== false));
    setBrandColorCodes((meta.brandColorCodes || []).filter((x) => x.is_active !== false));
    setSizeTypes((meta.sizeTypes || []).filter((x) => x.is_active !== false).slice().sort(compareMobileWarehouseSizeTypes));
    setLocations((meta.locations || []).filter((x) => x.is_active !== false));
  }

  async function load(options: { showSuccess?: boolean; preferCache?: boolean } = {}) {
    const { showSuccess = false, preferCache = false } = options;
    const sequence = ++loadSequenceRef.current;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    loadInFlightRef.current = true;
    const isCurrent = () => loadSequenceRef.current === sequence && !controller.signal.aborted;

    const cached = preferCache && mobileWarehouseBootstrapCacheFresh()
      ? mobileWarehouseBootstrapCache
      : null;
    const visibleSnapshot = cached?.items || (items.length ? items : null);
    let loadedMeta: MobileWarehouseMetaResponse | null = cached?.meta || null;
    let loadedStock: StockItem[] = cached?.stock || [];
    let loadedInvoices: MobileWarehouseInvoiceIndexItem[] = cached?.invoices || [];
    let latestInventory: InventoryItem[] = cached?.items || [];
    let firstInventoryArrived = Boolean(cached);
    let inventoryComplete = false;
    let firstInventorySettled = false;
    let resolveFirstInventory!: () => void;
    let rejectFirstInventory!: (error: unknown) => void;
    const firstInventoryReady = new Promise<void>((resolve, reject) => {
      resolveFirstInventory = resolve;
      rejectFirstInventory = reject;
    });
    const settleFirstInventory = (error?: unknown) => {
      if (firstInventorySettled) return;
      firstInventorySettled = true;
      if (error) rejectFirstInventory(error);
      else resolveFirstInventory();
    };

    if (cached) {
      applyMobileWarehouseMeta(cached.meta);
      setStockRows(cached.stock);
      setInvoiceIndexRows(cached.invoices || []);
      setItems(cached.items);
      lastSuccessfulLoadAtRef.current = cached.loadedAt;
      setBusy(false);
      settleFirstInventory();
    } else {
      setBusy(true);
    }
    setMessage("");

    try {
      const metaTask = apiMeta(controller.signal)
        .then((meta) => {
          loadedMeta = meta;
          if (isCurrent()) applyMobileWarehouseMeta(meta);
          return meta;
        })
        .catch((error) => {
          if (loadedMeta) return loadedMeta;
          throw error;
        });

      const stockTask = apiStock(controller.signal)
        .then((stock) => {
          loadedStock = stock.items || [];
          if (isCurrent()) {
            setStockRows(loadedStock);
            setItems((current) => stockBackedInventoryItems(current, loadedStock));
          }
          return loadedStock;
        })
        .catch((error) => {
          if (cached) return loadedStock;
          throw error;
        });

      const invoiceTask = apiWarehouseInvoices(controller.signal)
        .then((result) => {
          loadedInvoices = result.items || [];
          if (isCurrent()) setInvoiceIndexRows(loadedInvoices);
          return loadedInvoices;
        })
        .catch(() => loadedInvoices);

      const inventoryTask = apiInventory({
        signal: controller.signal,
        onProgress: (partialItems, done, total) => {
          if (!isCurrent()) return;
          firstInventoryArrived = true;
          latestInventory = partialItems
            .filter((item) => itemStatus(item) !== "archived" && modelStatus(item) !== "archived");

          let displayItems = loadedStock.length
            ? stockBackedInventoryItems(latestInventory, loadedStock)
            : latestInventory;

          if (visibleSnapshot && !done) {
            const merged = new Map<string, InventoryItem>();
            for (const item of visibleSnapshot) {
              const id = selectedVariantIdFromItem(item as any);
              if (id) merged.set(id, item);
            }
            for (const item of displayItems) {
              const id = selectedVariantIdFromItem(item as any);
              if (id) merged.set(id, item);
            }
            displayItems = Array.from(merged.values());
          }

          setItems(displayItems);
          if (!done) {
            const totalText = total !== null ? ` / ${total.toLocaleString("hu-HU")}` : "";
            setMessage(`Raktár háttérbetöltés: ${partialItems.length.toLocaleString("hu-HU")}${totalText} variáns. Az első termékek már használhatók.`);
          }
          settleFirstInventory();
        },
      }).then((result) => {
        inventoryComplete = true;
        latestInventory = (result.items || [])
          .filter((item) => itemStatus(item) !== "archived" && modelStatus(item) !== "archived");
        return result;
      }).catch((error) => {
        settleFirstInventory(error);
        throw error;
      });

      // A mobil nézetet az első 300 termék után azonnal elengedjük. A meta és a
      // helyenkénti készlet ezután is érkezhet a háttérben, nem blokkolja a listát.
      await firstInventoryReady;
      if (isCurrent()) setBusy(false);

      await Promise.all([inventoryTask, metaTask, stockTask, invoiceTask]);
      if (!isCurrent()) return;

      const finalItems = loadedStock.length
        ? stockBackedInventoryItems(latestInventory, loadedStock)
        : latestInventory;
      setItems(finalItems);
      lastSuccessfulLoadAtRef.current = Date.now();
      if (showSuccess) setMessage("Raktár frissítve.");
      else setMessage("");

      if (loadedMeta && inventoryComplete) {
        mobileWarehouseBootstrapCache = {
          meta: loadedMeta,
          stock: loadedStock,
          items: finalItems,
          invoices: loadedInvoices,
          loadedAt: Date.now(),
        };
      }
    } catch (error: any) {
      if (controller.signal.aborted || error?.name === "AbortError") return;
      if (!isCurrent()) return;
      setMessage(
        firstInventoryArrived || visibleSnapshot
          ? `A raktár részben betöltődött, de a háttérfrissítés megszakadt: ${error?.message || "ismeretlen hiba"}`
          : error?.message || "A raktár betöltése nem sikerült."
      );
    } finally {
      if (isCurrent()) {
        setBusy(false);
        loadInFlightRef.current = false;
      }
      if (loadAbortRef.current === controller) loadAbortRef.current = null;
    }
  }

  useEffect(() => {
    void load({ preferCache: true });
    return () => loadAbortRef.current?.abort();
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
    const refreshAfterStockChange = () => void load({ preferCache: false });
    const refreshOnFocusIfStale = () => {
      if (document.visibilityState !== "visible" || loadInFlightRef.current) return;
      const lastLoadedAt = lastSuccessfulLoadAtRef.current || mobileWarehouseBootstrapCache?.loadedAt || 0;
      if (Date.now() - lastLoadedAt < MOBILE_WAREHOUSE_FOCUS_REFRESH_AFTER_MS) return;
      void load({ preferCache: true });
    };
    window.addEventListener(stockMovesChangedEventName, refreshAfterStockChange as EventListener);
    window.addEventListener("focus", refreshOnFocusIfStale);
    return () => {
      window.removeEventListener(stockMovesChangedEventName, refreshAfterStockChange as EventListener);
      window.removeEventListener("focus", refreshOnFocusIfStale);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onIncoming = () => {
      void load({ preferCache: false }).then(() => focusLatestIncoming(false));
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

  const newProductSubCategoryOptions = useMemo(() => {
    if (!newProduct.categoryCode) return subCategories;
    const parent = categoryOptions.find((row) => metaMatches(row, newProduct.categoryCode));
    if (!parent) return subCategories;
    return subCategories.filter((row) => categoryParentId(row) === String(parent.id));
  }, [newProduct.categoryCode, categoryOptions, subCategories]);

  const selectedSupplier = useMemo(() => {
    if (supplier === "all") return null;
    const key = normalizeSearch(supplier);
    return suppliers.find((row) => [row.id, row.code, row.name, row.name_ro].map(normalizeSearch).includes(key)) || null;
  }, [supplier, suppliers]);

  const brandOptions = useMemo(() => {
    if (!selectedSupplier) return brands;
    const linked = new Set(supplierBrands.filter((row) => row.is_active !== false && String(row.supplier_id) === String(selectedSupplier.id)).map((row) => String(row.brand_id)));
    return brands.filter((row) => linked.has(String(row.id)));
  }, [brands, supplierBrands, selectedSupplier]);

  useEffect(() => {
    if (brand === "all") return;
    const key = normalizeSearch(brand);
    if (!brandOptions.some((row) => [row.id, row.code, row.name, row.name_ro].map(normalizeSearch).includes(key))) setBrand("all");
  }, [brand, brandOptions]);

  const genderFilterOptions = useMemo<MobileSelectOption[]>(() => genderTypes
    .filter((row) => row.is_active !== false)
    .slice()
    .sort((a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code), "hu", { sensitivity: "base" }))
    .map((row) => ({ value: String(row.code), label: String(row.name || row.code) })), [genderTypes]);

  const sizeFilterOptions = useMemo<MobileSelectOption[]>(() => sizeTypes
    .filter((row) => row.is_active !== false)
    .slice()
    .sort(compareMobileWarehouseSizeTypes)
    .map((row) => ({ value: String(row.id || row.name || row.code), label: sizeTypeLabel(row) })), [sizeTypes]);

  const selectedSizeMatchKeys = useMemo(() => mobileSelectedSizeMatchKeys(sizeFilters, sizeTypes), [sizeFilters, sizeTypes]);

  const colorFilterOptions = useMemo<MobileSelectOption[]>(() => {
    const activeGroups = colorGroups.filter((row) => row.is_active !== false).slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || colorGroupLabel(a).localeCompare(colorGroupLabel(b), "hu", { sensitivity: "base" }));
    const rows: MobileSelectOption[] = [];
    for (const group of activeGroups) {
      const children = colorTypes.filter((row) => row.is_active !== false && String(row.color_group_id || "") === String(group.id)).slice().sort((a, b) => colorTypeLabel(a).localeCompare(colorTypeLabel(b), "hu", { sensitivity: "base" }));
      rows.push({ value: colorFilterGroupValue(group), label: `${colorGroupLabel(group)} • összes árnyalat`, hint: `${children.length} szín`, swatch: group.hex || undefined });
      children.forEach((row) => rows.push({ value: colorFilterTypeValue(row), label: colorTypeLabel(row), swatch: row.hex || undefined, depth: 1, hint: colorGroupLabel(group) }));
    }
    const ungrouped = colorTypes.filter((row) => row.is_active !== false && !String(row.color_group_id || "").trim()).slice().sort((a, b) => colorTypeLabel(a).localeCompare(colorTypeLabel(b), "hu", { sensitivity: "base" }));
    ungrouped.forEach((row) => rows.push({ value: colorFilterTypeValue(row), label: colorTypeLabel(row), swatch: row.hex || undefined, hint: "Nincs főszín" }));
    return rows;
  }, [colorGroups, colorTypes]);

  const invoiceFilterOptions = useMemo<MobileSelectOption[]>(() => invoiceIndexRows
    .filter((row) => String(row.invoice_number || "").trim())
    .slice()
    .sort((a, b) => Math.max(dateTimeMs(b.reception_date), dateTimeMs(b.invoice_date), dateTimeMs(b.imported_at)) - Math.max(dateTimeMs(a.reception_date), dateTimeMs(a.invoice_date), dateTimeMs(a.imported_at)))
    .map((row) => ({
      value: String(row.reception_id ? `reception:${row.reception_id}` : row.key || row.invoice_number),
      label: String(row.invoice_number),
      hint: [row.supplier_name, dateShort(row.invoice_date || row.reception_date || row.imported_at), `${(row.variant_ids || []).length} variáns`].filter(Boolean).join(" • "),
    })), [invoiceIndexRows]);

  const selectedInvoiceRow = useMemo(() => {
    if (invoiceFilter === "all") return null;
    return invoiceIndexRows.find((row) => String(row.reception_id ? `reception:${row.reception_id}` : row.key || row.invoice_number) === invoiceFilter) || null;
  }, [invoiceFilter, invoiceIndexRows]);

  const searchInventoryItems = useMemo(() => {
    // A normál mobil lista marad a gyors /warehouse-products eredménye. A 0 készletes
    // inaktív rekordok csak konkrét kereséskor kerülnek mellé, így a gyors indulás
    // és a mostani DB-terhelés nem romlik el.
    const includeCatalogRows = Boolean(search.trim() || snCodFilter.trim() || stockFilter === "inactive" || stockFilter === "out" || stockFilter === "missing");
    return includeCatalogRows ? mergeMobileInventoryItems(items, catalogSearchItems) : items;
  }, [items, catalogSearchItems, search, snCodFilter, stockFilter]);

  function mergeMobileCatalogSearchItems(rows: InventoryItem[]) {
    const cleanRows = (rows || [])
      .map((item) => {
        const id = selectedVariantIdFromItem(item as any);
        return id ? { ...item, variant_id: id } : null;
      })
      .filter((item): item is InventoryItem => Boolean(item && itemStatus(item) !== "archived" && modelStatus(item) !== "archived"));
    if (!cleanRows.length) return;
    setCatalogSearchItems((current) => mergeMobileInventoryItems(current, cleanRows).slice(-600));
  }

  async function runMobileWarehouseSearch(searchValue = search) {
    const clean = String(searchValue || "").trim();
    const cleanSn = String(snCodFilter || "").trim();
    setVisibleCount(40);
    setFocusVariantIds([]);
    setFocusLabel("");
    if (!clean && !cleanSn) {
      searchInputRef.current?.focus();
      return;
    }

    const sequence = ++catalogSearchSequenceRef.current;
    catalogSearchAbortRef.current?.abort();
    const controller = new AbortController();
    catalogSearchAbortRef.current = controller;
    setCatalogSearchBusy(true);

    try {
      let rows: InventoryItem[] = [];
      if (looksLikeMobileWarehouseExactIdentifier(clean)) {
        rows = await lookupMobileBarcodeOwner(clean, controller.signal);
      }
      if (!rows.length) {
        const exact = await apiInventoryLookup(clean, controller.signal);
        rows = Array.isArray(exact.items) ? exact.items : [];
      }
      if (!rows.length) {
        const broad = await apiCatalogSearch(clean, controller.signal, cleanSn);
        rows = Array.isArray(broad.items) ? broad.items : [];
      }
      if (controller.signal.aborted || sequence !== catalogSearchSequenceRef.current) return;
      if (rows.length) {
        mergeMobileCatalogSearchItems(rows);
        setMessage(`Teljes terméktörzs: ${rows.length} találat. A 0 készletes és inaktív variánsok is kereshetők.`);
      } else {
        setMessage("A teljes terméktörzsben sincs találat erre a keresésre.");
      }
    } catch (error: any) {
      if (controller.signal.aborted || error?.name === "AbortError") return;
      if (sequence !== catalogSearchSequenceRef.current) return;
      setMessage(error?.message || "A teljes terméktörzs keresése nem sikerült.");
    } finally {
      if (sequence === catalogSearchSequenceRef.current) setCatalogSearchBusy(false);
      if (catalogSearchAbortRef.current === controller) catalogSearchAbortRef.current = null;
    }
  }

  useEffect(() => {
    if (stockFilter !== "inactive") return;
    const controller = new AbortController();
    setInactiveProductsBusy(true);
    void apiInactiveWarehouseProducts(controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        mergeMobileCatalogSearchItems(rows);
        setMessage(`Inaktív termékek betöltve: ${rows.length.toLocaleString("hu-HU")} nem archivált variáns, készlettől függetlenül.`);
      })
      .catch((error: any) => {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        setMessage(error?.message || "Az inaktív termékek betöltése nem sikerült.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setInactiveProductsBusy(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockFilter]);

  useEffect(() => {
    const clean = String(search || "").trim();
    if (!looksLikeMobileWarehouseExactIdentifier(clean)) return;
    if (searchInventoryItems.some((item) => itemMatchesScannedBarcode(item, clean))) return;
    const timer = window.setTimeout(() => { void runMobileWarehouseSearch(clean); }, 280);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasActiveFilters = Boolean(
    search.trim() || snCodFilter.trim() || supplier !== "all" || brand !== "all" || category !== "all" || subCategory !== "all" ||
    genderFilters.length || sizeFilters.length || color !== "all" || location !== "all" || invoiceFilter !== "all" ||
    stockFilter !== "all" || imageFilter !== "all" || shopifyFilter !== "all" || focusVariantIds.length
  );

  function itemSupplierText(item: InventoryItem) {
    return firstText(item.supplier_names, (item.suppliers || []).map((row) => row.name).filter(Boolean).join(" "), splitCsv(item.supplier_codes).join(" "));
  }

  function brandColorForItem(item: Partial<InventoryItem>) {
    const codeKey = colorKey(item.color_code);
    if (!codeKey) return null;
    const brandKeys = [item.brand_code, item.brand_name].map(normalizeSearch).filter(Boolean);
    const rows = brandColorCodes.filter((row) => colorKey(row.color_code) === codeKey);
    if (!rows.length) return null;
    return rows.find((row) => [row.brand_code, row.brand_name].map(normalizeSearch).filter(Boolean).some((key) => brandKeys.includes(key))) || (brandKeys.length ? null : rows[0]);
  }

  function standardColorTypeForItem(item: Partial<InventoryItem>) {
    const direct = findColorTypeByValue(colorTypes, item.color_name) || findColorTypeByValue(colorTypes, item.color_code);
    if (direct) return direct;
    const mapped = brandColorForItem(item);
    return findColorTypeByValue(colorTypes, mapped?.color_type_id) || findColorTypeByValue(colorTypes, mapped?.color_type_code) || findColorTypeByValue(colorTypes, mapped?.color_name_ro) || findColorTypeByValue(colorTypes, mapped?.color_name_hu);
  }

  function colorLabel(item: Partial<InventoryItem>) {
    const standard = standardColorTypeForItem(item);
    return firstText(standard?.name_hu, standard?.name_ro, officialColorFromTypes(firstText(item.color_name, item.color_code), colorTypes), item.color_name, item.color_code) || "-";
  }

  function colorHex(item: Partial<InventoryItem>) {
    const standard = standardColorTypeForItem(item);
    const brandColor = brandColorForItem(item);
    return firstText(standard?.hex, brandColor?.color_hex, item.color_hex);
  }

  function itemMatchesMeta(values: unknown[], selected: string, rows: MetaItem[]) {
    if (selected === "all") return true;
    const selectedRow = rows.find((row) => metaMatches(row, selected));
    const allowed = new Set([normalizeSearch(selected), ...metaValues(selectedRow).map(normalizeSearch)].filter(Boolean));
    return values.map(normalizeSearch).filter(Boolean).some((value) => allowed.has(value));
  }

  function itemMatchesColor(item: InventoryItem) {
    if (color === "all") return true;
    const group = colorGroupFromFilterValue(colorGroups, color);
    const standard = standardColorTypeForItem(item);
    if (group) return Boolean(standard?.color_group_id && String(standard.color_group_id) === String(group.id));
    const selectedColor = colorTypeFromFilterValue(colorTypes, color) || findColorTypeByValue(colorTypes, color);
    const allowed = new Set([colorKey(color), ...colorValues(selectedColor).map(colorKey)].filter(Boolean));
    const itemValues = [item.color_name, item.color_code, standard?.id, standard?.code, standard?.name_ro, standard?.name_hu, officialColorFromTypes(item.color_name, colorTypes), officialColorFromTypes(item.color_code, colorTypes)].map(colorKey).filter(Boolean);
    return itemValues.some((value) => allowed.has(value));
  }

  const filteredItems = useMemo(() => {
    const q = normalizeSearch(search);
    const snKey = normalizeSearch(snCodFilter);
    const focusSet = new Set(focusVariantIds.map(String));
    const invoiceVariantSet = new Set((selectedInvoiceRow?.variant_ids || []).map(String));
    return searchInventoryItems
      .filter((item) => {
        if (focusSet.size && !focusSet.has(String(item.variant_id))) return false;
        if (q) {
          const haystack = [
            itemTitle(item), item.brand_name, item.brand_code, itemSupplierText(item), item.supplier_codes, item.supplier_names, item.internal_sku,
            visibleWarehouseBarcode(item), item.sn_cod, item.snCod, itemCustomsTariffCode(item), item.model_code,
            itemMainCategory(item), itemSubCategory(item), item.color_name, item.color_code, item.size, itemProductCode(item),
          ].map(normalizeSearch).join(" ");
          if (!haystack.includes(q)) return false;
        }
        if (snKey && !normalizeSearch(firstText(item.sn_cod, item.snCod)).includes(snKey)) return false;
        if (supplier !== "all" && !supplierMatches(item, supplier)) return false;
        if (!itemMatchesMeta([item.brand_code, item.brand_name], brand, brands)) return false;
        if (!itemMatchesMeta([item.category_code, item.category_name_ro, item.category_name_hu], category, categoryOptions)) return false;
        if (!itemMatchesMeta([item.subcategory_id, item.subcategory_code, item.subcategory_name_ro, item.subcategory_name_hu, item.product_type], subCategory, subCategories)) return false;
        if (genderFilters.length && !genderFilters.some((value) => normalizeSearch(item.gender) === normalizeSearch(value))) return false;
        if (sizeFilters.length && !selectedSizeMatchKeys.has(colorKey(item.size))) return false;
        if (!itemMatchesColor(item)) return false;
        if (location !== "all" && !(stockMap.get(String(item.variant_id)) || []).some((row) => (String(row.location_code || "") === location || String(row.location_name || "") === location || String(row.location_id || "") === location) && n(row.qty) > 0)) return false;
        if (invoiceFilter !== "all" && !invoiceVariantSet.has(String(item.variant_id))) return false;
        if (imageFilter === "with" && !item.image_url) return false;
        if (imageFilter === "missing" && item.image_url) return false;
        if (shopifyFilter === "mapped" && !isShopifyMappedItem(item)) return false;
        if (shopifyFilter === "recent_mapped" && !(isShopifyMappedItem(item) && shopifyConnectionMs(item) > 0)) return false;
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
        const effectiveSort = shopifyFilter === "recent_mapped" ? "shopify_connected_desc" : sortMode;
        if (effectiveSort === "stock_desc") return n(b.total_qty) - n(a.total_qty) || compareMobileWarehouseVariantPresentation(a, b);
        if (effectiveSort === "stock_asc") return n(a.total_qty) - n(b.total_qty) || compareMobileWarehouseVariantPresentation(a, b);
        if (effectiveSort === "value_desc") return (n(b.total_qty) * n(b.buy_price) - n(a.total_qty) * n(a.buy_price)) || compareMobileWarehouseVariantPresentation(a, b);
        if (effectiveSort === "incoming_desc") return (latestIncomingMs(b) - latestIncomingMs(a)) || compareMobileWarehouseVariantPresentation(a, b);
        if (effectiveSort === "incoming_asc") {
          const aTime = latestIncomingMs(a), bTime = latestIncomingMs(b);
          if (!aTime && bTime) return 1;
          if (aTime && !bTime) return -1;
          return (aTime - bTime) || compareMobileWarehouseVariantPresentation(a, b);
        }
        if (effectiveSort === "shopify_connected_desc") return (shopifyConnectionMs(b) - shopifyConnectionMs(a)) || compareMobileWarehouseVariantPresentation(a, b);
        if (effectiveSort === "missing") return (Number(needsAttention(b)) - Number(needsAttention(a))) || compareMobileWarehouseVariantPresentation(a, b);
        if (effectiveSort === "brand") return firstText(a.brand_name, a.brand_code).localeCompare(firstText(b.brand_name, b.brand_code), "hu", { numeric: true, sensitivity: "base" }) || compareMobileWarehouseVariantPresentation(a, b);
        return compareMobileWarehouseVariantPresentation(a, b);
      });
  }, [searchInventoryItems, focusVariantIds, search, snCodFilter, supplier, brand, brands, category, categoryOptions, subCategory, subCategories, genderFilters, sizeFilters, selectedSizeMatchKeys, color, colorTypes, colorGroups, brandColorCodes, location, stockMap, invoiceFilter, selectedInvoiceRow, stockFilter, imageFilter, shopifyFilter, sortMode]);

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
    catalogSearchAbortRef.current?.abort();
    setCatalogSearchBusy(false);
    setSearch("");
    setSnCodFilter("");
    setSupplier("all");
    setBrand("all");
    setCategory("all");
    setSubCategory("all");
    setGenderFilters([]);
    setSizeFilters([]);
    setColor("all");
    setLocation("all");
    setInvoiceFilter("all");
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
      // Ugyanaz a logika, mint asztali nézetben: a ténylegesen committed importcsomag
      // az elsődleges forrás. A mozgásnapló csak tartalék, így mobilon sem ugrik
      // egy régi vagy idegen bejövő mozgásra az „Utolsó” szűrő.
      const batches = await apiImportBatches(60).catch(() => ({ items: [] as Array<Record<string, any>> }));
      const committedBatches = (batches.items || [])
        .filter((batch) => String(batch.status || "").trim().toLowerCase() === "committed")
        .slice()
        .sort((a, b) => {
          const aTime = dateTimeMs(a.committed_at) || dateTimeMs(a.created_at);
          const bTime = dateTimeMs(b.committed_at) || dateTimeMs(b.created_at);
          return bTime - aTime;
        });

      for (const batch of committedBatches) {
        const batchId = String(batch.id || "").trim();
        if (!batchId) continue;
        try {
          const focused = await apiImportBatchInventory(batchId);
          const focusedItems = (focused.items || [])
            .filter((item) => itemStatus(item) !== "archived" && modelStatus(item) !== "archived");
          const ids = Array.from(new Set([
            ...(focused.variantIds || []),
            ...focusedItems.map((item) => selectedVariantIdFromItem(item as any)),
            ...(focused.rows || []).map((row) => String(row.variant_id || row.variantId || "").trim()),
          ].map((value) => String(value || "").trim()).filter(Boolean)));
          if (!ids.length) continue;

          if (focusedItems.length) {
            setItems((current) => {
              const merged = new Map<string, InventoryItem>();
              for (const item of current) {
                const id = selectedVariantIdFromItem(item as any);
                if (id) merged.set(id, item);
              }
              for (const item of focusedItems) {
                const id = selectedVariantIdFromItem(item as any);
                if (id) merged.set(id, { ...item, variant_id: id });
              }
              return Array.from(merged.values());
            });
          }

          setFocusVariantIds(ids);
          setSortMode("incoming_desc");
          setVisibleCount(40);
          const totalQty = Number(focused.totalQty || (focused.rows || []).reduce((sum, row) => sum + Math.abs(n(row.qty || row.import_qty || row.qty_delta)), 0));
          const batchDate = dateShort(batch.committed_at || batch.created_at);
          const labelText = `Utolsó import${batchDate && batchDate !== "-" ? ` (${batchDate})` : ""}: ${ids.length} variáns${totalQty ? `, ${Math.trunc(totalQty)} db` : ""}`;
          setFocusLabel(labelText);
          if (showMessage) setMessage(labelText);
          return;
        } catch {
          // Ha egy régi committed batch részlete már nem elérhető, próbáljuk a következőt.
        }
      }

      const qs = new URLSearchParams();
      qs.set("direction", "in");
      qs.set("limit", "400");
      const data = await fetchAifJSON<{ items?: Array<Record<string, any>> }>(`/stock-movements?${qs.toString()}`);
      const rows = (data.items || [])
        .filter((row) => n(row.qty_delta) > 0)
        .filter((row) => {
          const sourceType = normalizeSearch(row.source_type || "");
          const reason = normalizeSearch(row.raw?.reason || "");
          const importBatchId = firstText(
            row.raw?.importBatchId,
            row.raw?.import_batch_id,
            sourceType.includes("import batch") ? row.source_id : "",
          );
          const sourceKey = normalizeSearch(firstText(row.source_id, importBatchId));
          if (sourceType.includes("stock table audit") || sourceKey.startsWith("stock audit") || reason.includes("stock audit")) return false;
          return sourceType.includes("import batch") || reason.includes("import batch") || Boolean(importBatchId);
        })
        .sort((a, b) => dateTimeMs(b.created_at) - dateTimeMs(a.created_at));

      if (!rows.length) {
        setFocusVariantIds([]);
        setFocusLabel("");
        setMessage("Nem találtam készletre vett importot vagy hozzá tartozó bejövő készletmozgást.");
        return;
      }

      const latest = rows[0];
      const latestSourceType = normalizeSearch(latest.source_type || "");
      const sourceId = firstText(
        latest.raw?.importBatchId,
        latest.raw?.import_batch_id,
        latestSourceType.includes("import batch") ? latest.source_id : "",
      );
      const latestMinute = Math.floor(dateTimeMs(latest.created_at) / 60000);
      const group = rows.filter((row) => {
        const rowSourceType = normalizeSearch(row.source_type || "");
        const rowSourceId = firstText(
          row.raw?.importBatchId,
          row.raw?.import_batch_id,
          rowSourceType.includes("import batch") ? row.source_id : "",
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

  function openNewProductSheet() {
    const next = emptyNewProductForm();
    if (brand !== "all") next.brandCode = brand;
    if (category !== "all") next.categoryCode = category;
    if (genderFilters.length === 1) next.gender = genderFilters[0];
    next.supplierId = supplier !== "all" ? String(selectedSupplier?.id || "") : "";
    setNewProduct(next);
    setNewProductStockRows(stockLocationRows.reduce<Record<string, string>>((acc, loc) => { acc[locationKey(loc)] = "0"; return acc; }, {}));
    setNewProductBarcodeConflict(null);
    setNewProductOpen(true);
    setMessage("");
  }

  function closeNewProductSheet() {
    if (newProductSaving) return;
    setNewProductOpen(false);
    setNewProduct(emptyNewProductForm());
    setNewProductStockRows({});
    setNewProductBarcodeConflict(null);
  }

  function newProductTotalQty() {
    return stockLocationRows.reduce((sum, loc) => sum + Math.max(0, Math.floor(n(newProductStockRows[locationKey(loc)]))), 0);
  }

  function setNewProductLocationQty(locationRow: MetaItem, value: string) {
    const cleaned = String(value || "").replace(/[^0-9]/g, "");
    setNewProductStockRows((current) => ({ ...current, [locationKey(locationRow)]: cleaned }));
  }

  async function saveNewProduct() {
    if (!newProduct.titleRo.trim()) { setMessage("A terméknév románul kötelező."); return; }
    if (!newProduct.size.trim()) { setMessage("A méret kötelező."); return; }
    const totalQty = newProductTotalQty();
    if (totalQty <= 0) { setMessage("Legalább egy célhelyre adj meg készletet."); return; }
    if (effectiveNewProductBarcodeConflict) { setNewProductBarcodeConflict(effectiveNewProductBarcodeConflict); return; }
    setNewProductSaving(true);
    setMessage("");
    try {
      const requestedBarcode = cleanScannedBarcode(newProduct.barcode);
      if (requestedBarcode) {
        const check = await apiBarcodeConflictCheck(requestedBarcode);
        const conflict = check.conflict ? barcodeConflictInfoFromApi({ barcode: check.barcode, conflict: check.conflict }) : null;
        if (conflict) { setNewProductBarcodeConflict(conflict); return; }
      }
      const normalizedColor = officialColorFromTypes(newProduct.colorName, colorTypes);
      const normalizedSize = officialSizeFromTypes(newProduct.size, sizeTypes);
      const stockRowsPayload = stockLocationRows.map((loc) => ({
        locationId: String(loc.id || ""),
        locationCode: String(loc.code || ""),
        qty: Math.max(0, Math.floor(n(newProductStockRows[locationKey(loc)]))),
      })).filter((row) => row.qty > 0);
      const payload = {
        titleRo: newProduct.titleRo,
        titleHu: newProduct.titleHu,
        descriptionRo: newProduct.descriptionRo,
        brandCode: newProduct.brandCode || null,
        categoryCode: newProduct.categoryCode || null,
        parentCategoryCode: newProduct.categoryCode || null,
        subcategoryCode: newProduct.subCategoryCode || null,
        subCategoryCode: newProduct.subCategoryCode || null,
        gender: newProduct.gender || "unisex",
        productType: newProduct.productType,
        season: newProduct.season,
        material: newProduct.material,
        shopifyTitle: newProduct.shopifyTitle || newProduct.titleRo,
        modelStatus: newProduct.modelStatus || "active",
        barcode: newProduct.barcode,
        snCod: newProduct.snCod,
        customsTariffCode: newProduct.customsTariffCode,
        colorCode: newProduct.colorCode,
        colorName: normalizedColor,
        size: normalizedSize,
        buyPrice: newProduct.buyPrice,
        sellPrice: newProduct.sellPrice,
        compareAtPrice: newProduct.compareAtPrice,
        imageUrl: newProduct.imageUrl,
        status: newProduct.variantStatus || "active",
        supplierId: newProduct.supplierId || null,
        supplierProductCode: newProduct.supplierProductCode || newProduct.barcode || newProduct.titleRo,
        supplierVariantCode: newProduct.supplierVariantCode,
        supplierColorCode: newProduct.supplierColorCode || newProduct.colorCode,
        supplierSize: newProduct.supplierSize || normalizedSize,
        modelCode: newProduct.supplierProductCode || newProduct.barcode || newProduct.titleRo,
        qty: totalQty,
        stockRows: stockRowsPayload,
      };
      const created = await apiCreateManualProduct(payload);
      notifyStockMovesChanged({ variantId: created.variantId, source: "warehouse_mobile_manual_product_create" });
      closeNewProductSheet();
      await load({ preferCache: false });
      setSearch(String(newProduct.barcode || newProduct.supplierProductCode || newProduct.titleRo || "").trim());
      setVisibleCount(40);
      setMessage(`Új termék rögzítve ${totalQty} db készlettel.`);
    } catch (error: any) {
      const conflict = barcodeConflictInfoFromApi(error);
      if (conflict) setNewProductBarcodeConflict(conflict);
      else setMessage(error?.message || "Nem sikerült létrehozni az új terméket.");
    } finally {
      setNewProductSaving(false);
    }
  }

  async function openDetail(item: InventoryItem) {
    const id = String(item.variant_id || item.id || "").trim();
    if (!id) return;
    setDetailOpen(true);
    setEditBarcodeConflict(null);
    setDetailBusy(true);
    setDetail(null);
    const optimisticForm = formFromItem(item as any);
    setEdit(optimisticForm);
    setEditBaseline(optimisticForm);
    setDetailCloseConfirmOpen(false);
    setMessage("");
    try {
      const data = await apiVariantDetail(id);
      const nextForm = formFromItem({ ...(item as any), ...(data.item || {}) });
      if (!nextForm.brandCode) nextForm.brandCode = findBrandCodeForName(data.item?.brand_name || item.brand_name || "");
      setDetail(data);
      setEdit(nextForm);
      setEditBaseline(nextForm);
    } catch (error: any) {
      setMessage(error?.message || "A termék adatlapja nem tölthető be.");
    } finally {
      setDetailBusy(false);
    }
  }

  function closeDetailImmediately() {
    if (saving) return;
    setDetailCloseConfirmOpen(false);
    setDetailOpen(false);
    setDetail(null);
    setEdit(emptyForm());
    setEditBaseline(emptyForm());
    setEditBarcodeConflict(null);
  }

  function requestCloseDetail() {
    if (saving) return;
    if (detailHasChanges) { setDetailCloseConfirmOpen(true); return; }
    closeDetailImmediately();
  }

  function discardDetailChangesAndClose() {
    if (saving) return;
    closeDetailImmediately();
    setMessage("A módosítások mentés nélkül eldobva.");
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
      if (!cleanScannedBarcode(edit.barcode)) missing.push("vonalkód");
      if (!String(edit.titleRo || "").trim()) missing.push("terméknév");
      if (!String(edit.size || "").trim()) missing.push("méret");
      const activationBuyPrice = priceNumber(edit.buyPrice);
      const activationSellPrice = priceNumber(edit.sellPrice);
      if (activationBuyPrice === null || activationBuyPrice <= 0) missing.push("vételár");
      if (activationSellPrice === null || activationSellPrice <= 0) missing.push("eladási ár");
      if (missing.length) {
        setMessage("");
        setActivationBlockMissing(missing);
        return;
      }
    }

    setSaving(true);
    setMessage("");
    let deactivatedSiblingIds: string[] = [];
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

      const normalizedEditColor = officialColorFromTypes(edit.colorName, colorTypes);
      const normalizedEditSize = officialSizeFromTypes(edit.size, sizeTypes);
      const activatingSharedModel = previousModelStatus !== "active" && nextModelStatus === "active";
      if (activatingSharedModel) {
        const currentModelId = firstText(detail?.item?.model_id, detail?.item?.modelId);
        if (currentModelId) {
          const siblingIds: string[] = Array.from(new Set<string>(
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
          deactivatedSiblingIds = siblingIds;
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
        supplierId: edit.supplierId || null,
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

      const siblingSource: InventoryItem = {
        ...(detail?.item as InventoryItem),
        variant_id: id,
        model_id: firstText(detail?.item?.model_id, detail?.item?.modelId) || null,
        brand_code: edit.brandCode || detail?.item?.brand_code || null,
        brand_name: detail?.item?.brand_name || null,
        model_code: detail?.item?.model_code || null,
        color_code: edit.colorCode || detail?.item?.color_code || null,
        color_name: normalizedEditColor || detail?.item?.color_name || null,
        size: normalizedEditSize || detail?.item?.size || null,
        supplier_product_code: edit.supplierProductCode || detail?.item?.supplier_product_code || null,
      };
      const sameColorSizeSiblings = items.filter((item) => mobileWarehouseSameColorSizeSibling(siblingSource, item));
      const siblingPatch: Record<string, unknown> = {};
      if (String(edit.imageUrl || '').trim()) siblingPatch.imageUrl = edit.imageUrl;
      if (String(edit.descriptionRo || '').trim()) siblingPatch.descriptionRo = edit.descriptionRo;

      let inheritedSiblingCount = 0;
      let inheritedSiblingFailed = 0;
      const inheritedSiblingIds: string[] = [];
      if (Object.keys(siblingPatch).length && sameColorSizeSiblings.length) {
        const results = await Promise.allSettled(
          sameColorSizeSiblings.map((item) => apiVariantUpdate(String(item.variant_id), siblingPatch))
        );
        results.forEach((result, index) => {
          const siblingId = String(sameColorSizeSiblings[index]?.variant_id || '').trim();
          if (result.status === 'fulfilled') {
            inheritedSiblingCount += 1;
            if (siblingId) inheritedSiblingIds.push(siblingId);
          } else {
            inheritedSiblingFailed += 1;
          }
        });
      }

      const data = await apiVariantDetail(id);
      const serverItem = (data.item || {}) as Record<string, any>;
      setItems((current) => current.map((item) => {
        const itemId = selectedVariantIdFromItem(item as any);
        if (itemId === id) {
          return {
            ...item,
            ...serverItem,
            variant_id: id,
            total_qty: serverItem.total_qty ?? item.total_qty,
            total_reserved_qty: serverItem.total_reserved_qty ?? item.total_reserved_qty,
            available_qty: serverItem.available_qty ?? item.available_qty,
            last_stock_movement_at: serverItem.last_stock_movement_at ?? item.last_stock_movement_at,
          } as InventoryItem;
        }
        if (inheritedSiblingIds.includes(itemId)) {
          return {
            ...item,
            ...(String(edit.imageUrl || '').trim() ? { image_url: edit.imageUrl } : {}),
            ...(String(edit.descriptionRo || '').trim() ? { description_ro: edit.descriptionRo } : {}),
          } as InventoryItem;
        }
        if (deactivatedSiblingIds.includes(itemId)) {
          return { ...item, model_status: nextModelStatus, variant_status: "inactive" } as InventoryItem;
        }
        return item;
      }));
      setEditBarcodeConflict(null);

      // Mentés kész: a lap azonnal záródik. Nem tartjuk nyitva addig, amíg
      // a teljes raktár újra letöltődik.
      setDetailCloseConfirmOpen(false);
      setDetailOpen(false);
      setDetail(null);
      setEditBaseline(emptyForm());
      const siblingMessage = inheritedSiblingCount
        ? ` Azonos színű további ${inheritedSiblingCount} méretváltozat átvette a képet/leírást.${inheritedSiblingFailed ? ` ${inheritedSiblingFailed} méret frissítése nem sikerült.` : ''}`
        : inheritedSiblingFailed
          ? ` ${inheritedSiblingFailed} azonos színű méret frissítése nem sikerült.`
          : '';
      setMessage(`Termékadatok mentve.${siblingMessage}`);
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

  async function deleteProductNow() {
    const target = productDeleteTarget;
    const id = String(target?.variant_id || target?.id || "").trim();
    if (!id) return;
    setSaving(true);
    try {
      await apiVariantDelete(id);
      setItems((current) => current.filter((item) => selectedVariantIdFromItem(item as any) !== id));
      setCatalogSearchItems((current) => current.filter((item) => selectedVariantIdFromItem(item as any) !== id));
      setStockRows((current) => current.filter((row) => String(row.variant_id || "") !== id));
      setProductDeleteTarget(null);
      if (String(detail?.item?.id || detail?.item?.variant_id || "") === id) closeDetailImmediately();
      setMessage("Termékvariáns véglegesen törölve.");
    } catch (error: any) {
      setMessage(error?.message || "Nem sikerült törölni a terméket.");
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

  function preferredStockReceiverLocation(targetKey: string, rows: Record<string, string>) {
    const candidates = stockLocationRows.filter((loc) => locationKey(loc) !== targetKey);
    return candidates.sort((a, b) => {
      const aq = Math.floor(n(rows[locationKey(a)]));
      const bq = Math.floor(n(rows[locationKey(b)]));
      const an = String(a.name || a.code || "").toLowerCase();
      const bn = String(b.name || b.code || "").toLowerCase();
      const aMain = /miercurea|ciuc|main|warehouse|depozit|raktar|raktár/.test(an) ? 1 : 0;
      const bMain = /miercurea|ciuc|main|warehouse|depozit|raktar|raktár/.test(bn) ? 1 : 0;
      return bMain - aMain || bq - aq;
    })[0] || null;
  }

  function setStockEditorQty(location: MetaItem, value: string) {
    const key = locationKey(location);
    const minQty = stockEditorReservedQty(location);
    const cleaned = Math.max(minQty, Math.floor(n(value.replace(/[^0-9]/g, ""))));
    const next = { ...stockEditorRows, [key]: String(cleaned) };
    setStockEditorRows(next);
    const delta = stockEditorDraftTotal(next) - stockEditorOriginalTotal();
    setStockEditorWarning(delta !== 0 ? `A teljes készlet ${delta > 0 ? "+" : ""}${delta} db-bal változik. Mozgatásnál használd a + / − gombot, korrekciónál kapcsold be a készletkorrekció módot.` : "");
  }

  function adjustStockEditorQty(location: MetaItem, delta: number) {
    const key = locationKey(location);
    const next = { ...stockEditorRows };
    const minTarget = stockEditorReservedQty(location);
    const currentQty = Math.max(minTarget, Math.floor(n(next[key])));
    const wantedQty = Math.max(minTarget, currentQty + delta);
    const effectiveDelta = wantedQty - currentQty;
    if (!effectiveDelta) return;

    if (stockEditorAllowTotalChange) {
      next[key] = String(wantedQty);
      setStockEditorRows(next);
      const totalDelta = stockEditorDraftTotal(next) - stockEditorOriginalTotal();
      setStockEditorWarning(totalDelta !== 0 ? `Készletkorrekció mód: a teljes készlet ${totalDelta > 0 ? "+" : ""}${totalDelta} db-bal változik.` : "");
      return;
    }

    if (effectiveDelta > 0) {
      let need = effectiveDelta;
      const donors = stockLocationRows
        .filter((loc) => locationKey(loc) !== key)
        .map((loc) => {
          const locKey = locationKey(loc);
          const qtyValue = Math.max(stockEditorReservedQty(loc), Math.floor(n(next[locKey])));
          const reserved = stockEditorReservedQty(loc);
          return { key: locKey, qty: qtyValue, movable: Math.max(0, qtyValue - reserved) };
        })
        .filter((row) => row.movable > 0)
        .sort((a, b) => b.movable - a.movable);
      for (const donor of donors) {
        if (need <= 0) break;
        const moved = Math.min(need, donor.movable);
        next[donor.key] = String(donor.qty - moved);
        need -= moved;
      }
      const moved = effectiveDelta - need;
      if (moved <= 0) {
        setStockEditorWarning("Nincs másik helyen szabad készlet. Új áruhoz kapcsold be a készletkorrekció módot.");
        return;
      }
      next[key] = String(currentQty + moved);
      setStockEditorRows(next);
      setStockEditorWarning(need > 0 ? `Csak ${moved} db-ot tudtam átvezetni, mert máshol nincs több szabad készlet.` : "A darabot automatikusan átvezettem másik helyről, a teljes készlet nem változott.");
      return;
    }

    next[key] = String(wantedQty);
    const receiver = preferredStockReceiverLocation(key, next);
    if (!receiver) {
      setStockEditorRows(next);
      setStockEditorWarning("A teljes készlet csökkenne. Törés / korrekció esetén kapcsold be a készletkorrekció módot.");
      return;
    }
    const receiverKey = locationKey(receiver);
    const receiverQty = Math.max(stockEditorReservedQty(receiver), Math.floor(n(next[receiverKey])));
    next[receiverKey] = String(receiverQty + Math.abs(effectiveDelta));
    setStockEditorRows(next);
    setStockEditorWarning("A csökkentett darabot automatikusan áttettem másik célhelyre, így a teljes készlet nem változott.");
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
      await load({ preferCache: false });
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

  async function applyScannedBarcode(rawCode: unknown, _source: "camera" | "manual" = "camera") {
    const code = cleanScannedBarcode(rawCode);
    if (!code) return;
    if (barcodeScannerHandlingRef.current) return;
    barcodeScannerHandlingRef.current = true;
    window.setTimeout(() => { barcodeScannerHandlingRef.current = false; }, 700);

    let exactMatches = searchInventoryItems.filter((item) => itemMatchesScannedBarcode(item, code));
    if (!exactMatches.length) {
      try {
        exactMatches = await lookupMobileBarcodeOwner(code);
        if (!exactMatches.length) {
          const exact = await apiInventoryLookup(code);
          exactMatches = (exact.items || []).filter((item) => itemStatus(item) !== "archived" && modelStatus(item) !== "archived");
        }
        if (exactMatches.length) mergeMobileCatalogSearchItems(exactMatches);
      } catch {
        // A kereső ettől még megkapja a kódot; kézi Keresés gombbal újrapróbálható.
      }
    }

    setSearch(code);
    setVisibleCount(40);
    setFocusVariantIds([]);
    setFocusLabel("");
    setBarcodeScannerManualValue("");
    setMessage(exactMatches.length
      ? `Vonalkód beolvasva: ${code} • ${exactMatches.length} találat, a 0 készletes / inaktív törzsadatot is ellenőriztem.`
      : `Vonalkód beolvasva: ${code}. A teljes terméktörzsben sincs pontos találat.`
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
              <button className={headerIconBtnActive} onClick={() => load({ showSuccess: true, preferCache: false })} disabled={busy} type="button" aria-label="Frissítés">
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
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void runMobileWarehouseSearch(); } }}
                enterKeyHint="search"
                placeholder="Név, beszállító, márka, vonalkód, szín, méret"
              />
              {search && <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-white/45 hover:bg-white/10 hover:text-white" type="button" onClick={() => setSearch("")}><X size={15} /></button>}
            </div>
            <button className={headerIconBtn} onClick={() => void startBarcodeScanner()} type="button" aria-label="Vonalkód scanner"><Barcode size={17} /></button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className={`${softBtn} h-9 rounded-xl`} type="button" onClick={openNewProductSheet}><Plus size={15} /> Új termék</button>
            <button className={`${softBtn} h-9 rounded-xl`} type="button" onClick={() => setShopifySyncCenterOpen(true)}><ShoppingBag size={15} /> Shopify központ</button>
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
          <button className={softBtn} onClick={() => { if (search.trim() || snCodFilter.trim()) void runMobileWarehouseSearch(); else searchInputRef.current?.focus(); }} disabled={catalogSearchBusy} type="button">{catalogSearchBusy ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />} {catalogSearchBusy ? "Keresés..." : "Keresés"}</button>
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
                <p className="mt-1 text-xs text-white/48">Ugyanazok a törzsadatok és szűrési szabályok, mint az asztali Raktárban.</p>
              </div>
              <button className={iconBtn} onClick={() => setFiltersOpen(false)} type="button"><X size={18} /></button>
            </div>
            <div className="grid gap-3">
              <label className={label}>S/N/COD<input className={input} value={snCodFilter} onChange={(e) => { setSnCodFilter(e.target.value); setVisibleCount(40); }} placeholder="pl. S0626" /></label>
              <MobileSingleSelect
                labelText="Beszállító"
                value={supplier}
                options={suppliers.map((row) => ({ value: String(row.code || row.name || row.id), label: String(row.name || row.name_ro || row.code || row.id) }))}
                onChange={(next) => { setSupplier(next); setInvoiceFilter("all"); setVisibleCount(40); }}
              />
              <MobileSingleSelect
                labelText="Márka"
                value={brand}
                emptyText={selectedSupplier ? "Összes kapcsolt márka" : "Összes"}
                options={brandOptions.map((row) => ({ value: String(row.code || row.name || row.id), label: String(row.name || row.name_ro || row.code || row.id) }))}
                onChange={(next) => { setBrand(next); setVisibleCount(40); }}
              />
              <MobileSingleSelect
                labelText="Főkategória"
                value={category}
                options={categoryOptions.map((row) => ({ value: String(row.code || row.id), label: categoryLabel(row) }))}
                onChange={(next) => { setCategory(next); setSubCategory("all"); setVisibleCount(40); }}
              />
              <MobileSingleSelect
                labelText="Alkategória / terméktípus"
                value={subCategory}
                options={subCategoryOptions.map((row) => ({ value: String(row.code || row.id), label: categoryLabel(row) }))}
                onChange={(next) => { setSubCategory(next); setVisibleCount(40); }}
              />
              <MobileMultiSelect labelText="Nem" values={genderFilters} options={genderFilterOptions} onChange={(next) => { setGenderFilters(next); setVisibleCount(40); }} />
              <MobileMultiSelect labelText="Méret" values={sizeFilters} options={sizeFilterOptions} onChange={(next) => { setSizeFilters(next); setVisibleCount(40); }} />
              <MobileSingleSelect
                labelText="Szín / főszín"
                value={color}
                options={colorFilterOptions}
                onChange={(next) => { setColor(next); setVisibleCount(40); }}
              />
              <MobileSingleSelect
                labelText="Cél hely"
                value={location}
                options={locations.map((row) => ({ value: String(row.code || row.name || row.id), label: String(row.name || row.code || row.id) }))}
                onChange={(next) => { setLocation(next); setVisibleCount(40); }}
              />
              <MobileSingleSelect
                labelText="Számla"
                value={invoiceFilter}
                options={invoiceFilterOptions}
                onChange={(next) => { setInvoiceFilter(next); if (next !== "all" && sortMode === "name") setSortMode("incoming_asc"); setVisibleCount(40); }}
              />
              <MobileSingleSelect
                labelText="Készlet"
                value={stockFilter}
                options={[
                  { value: "available", label: "Készleten" },
                  { value: "out", label: "Nincs készleten" },
                  { value: "reserved", label: "Van foglalás" },
                  { value: "missing", label: "Hiányzó adat" },
                  { value: "inactive", label: inactiveProductsBusy ? "Inaktív termékek • betöltés…" : "Inaktív termékek" },
                  { value: "watch", label: "Aktiválandó készlet" },
                ]}
                onChange={(next) => { setStockFilter(next as StockFilter); setVisibleCount(40); }}
              />
              <MobileSingleSelect labelText="Kép" value={imageFilter} options={[{ value: "with", label: "Van kép" }, { value: "missing", label: "Hiányzik kép" }]} onChange={(next) => { setImageFilter(next as ImageFilter); setVisibleCount(40); }} />
              <MobileSingleSelect
                labelText="Shopify"
                value={shopifyFilter}
                options={[
                  { value: "mapped", label: "Összekötve" },
                  { value: "recent_mapped", label: "Legutóbb összekapcsolt" },
                  { value: "exported", label: "Exportálva, párosításra vár" },
                  { value: "unmapped", label: "Nincs Shopifyon" },
                  { value: "error", label: "Kapcsolati / exporthiba" },
                ]}
                onChange={(next) => { const mode = next as ShopifyFilter; setShopifyFilter(mode); if (mode === "recent_mapped") setSortMode("shopify_connected_desc"); setVisibleCount(40); }}
              />
              <MobileSingleSelect
                labelText="Bevételezés"
                value={focusVariantIds.length ? "latest" : "all"}
                options={[{ value: "latest", label: busy ? "Betöltés..." : "Legutóbb bevételezett" }]}
                onChange={(next) => { if (next === "latest") void focusLatestIncoming(true); else { setFocusVariantIds([]); setFocusLabel(""); } }}
                disabled={busy}
              />
              <MobileSingleSelect
                labelText="Sorrend"
                value={sortMode}
                showEmptyOption={false}
                emptyText="Terméknév"
                options={[
                  { value: "incoming_desc", label: "Legújabb bevételezés elöl" },
                  { value: "incoming_asc", label: "Legrégebbi bevételezés elöl" },
                  { value: "shopify_connected_desc", label: "Legutóbb Shopifyhoz kapcsolt" },
                  { value: "name", label: "Terméknév" },
                  { value: "brand", label: "Márka" },
                  { value: "stock_desc", label: "Készlet csökkenő" },
                  { value: "stock_asc", label: "Készlet növekvő" },
                  { value: "value_desc", label: "Készletérték" },
                  { value: "missing", label: "Hiányzó adatok" },
                ]}
                onChange={(next) => { setSortMode(next as SortMode); setVisibleCount(40); }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className={softBtn} onClick={() => resetFilters()} type="button">Alaphelyzet</button>
              <button className={primaryBtn} onClick={() => setFiltersOpen(false)} type="button">Kész</button>
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

      {newProductOpen && (
        <>
          <MobileBackdrop onClose={closeNewProductSheet} />
          <section className={`${sheetPanel} z-[76]`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div><p className="text-[10px] uppercase tracking-[0.16em] text-[#cffffd]/70">Új termék</p><h2 className="mt-1 text-lg text-white">Kézi termékfelvétel</h2><p className="mt-1 text-xs text-white/50">Ugyanazt a termék- és törzsadatlogikát használja, mint az asztali Raktár.</p></div>
              <button className={iconBtn} type="button" onClick={closeNewProductSheet}><X size={18} /></button>
            </div>
            <div className="grid gap-3">
              <label className={label}>Terméknév románul<input className={input} value={newProduct.titleRo} onChange={(e) => setNewProduct((x) => ({ ...x, titleRo: e.target.value }))} /></label>
              <label className={label}>Terméknév magyarul<input className={input} value={newProduct.titleHu} onChange={(e) => setNewProduct((x) => ({ ...x, titleHu: e.target.value }))} /></label>
              <MobileSingleSelect labelText="Beszállító" value={newProduct.supplierId} emptyValue="" emptyText="Nincs" options={suppliers.map((row) => ({ value: String(row.id), label: String(row.name || row.name_ro || row.code || row.id) }))} onChange={(next) => setNewProduct((x) => ({ ...x, supplierId: next }))} />
              <MobileSingleSelect labelText="Márka" value={newProduct.brandCode} emptyValue="" emptyText="Nincs" options={brands.map((row) => ({ value: String(row.code || row.id), label: String(row.name || row.name_ro || row.code || row.id) }))} onChange={(next) => setNewProduct((x) => ({ ...x, brandCode: next }))} />
              <div className="grid grid-cols-2 gap-2">
                <MobileSingleSelect labelText="Főkategória" value={newProduct.categoryCode} emptyValue="" emptyText="Nincs" options={categoryOptions.map((row) => ({ value: String(row.code || row.id), label: categoryLabel(row) }))} onChange={(next) => setNewProduct((x) => ({ ...x, categoryCode: next, subCategoryCode: "" }))} />
                <MobileSingleSelect labelText="Alkategória" value={newProduct.subCategoryCode} emptyValue="" emptyText="Nincs" options={newProductSubCategoryOptions.map((row) => ({ value: String(row.code || row.id), label: categoryLabel(row) }))} onChange={(next) => setNewProduct((x) => ({ ...x, subCategoryCode: next }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MobileSingleSelect labelText="Nem" value={newProduct.gender} showEmptyOption={false} options={genderTypes.map((row) => ({ value: String(row.code), label: String(row.name || row.code) }))} onChange={(next) => setNewProduct((x) => ({ ...x, gender: next }))} />
                <MobileSingleSelect labelText="Méret" value={newProduct.size} emptyValue="" emptyText="Válassz" options={sizeTypes.slice().sort(compareMobileWarehouseSizeTypes).map((row) => ({ value: String(row.name || row.code || row.id), label: sizeTypeLabel(row) }))} onChange={(next) => setNewProduct((x) => ({ ...x, size: next, supplierSize: next }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MobileSingleSelect labelText="Szín" value={newProduct.colorName} emptyValue="" emptyText="Nincs" options={colorTypes.map((row) => ({ value: String(row.name_ro || row.code), label: colorTypeLabel(row), swatch: row.hex || undefined }))} onChange={(next) => setNewProduct((x) => ({ ...x, colorName: next }))} />
                <label className={label}>Színkód<input className={input} value={newProduct.colorCode} onChange={(e) => setNewProduct((x) => ({ ...x, colorCode: e.target.value, supplierColorCode: e.target.value }))} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Vételár<input className={input} inputMode="decimal" value={newProduct.buyPrice} onChange={(e) => setNewProduct((x) => ({ ...x, buyPrice: e.target.value }))} /></label>
                <label className={label}>Eladási ár TVA-val<input className={input} inputMode="decimal" value={newProduct.sellPrice} onChange={(e) => setNewProduct((x) => ({ ...x, sellPrice: e.target.value }))} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Termékkód<input className={input} value={newProduct.supplierProductCode} onChange={(e) => setNewProduct((x) => ({ ...x, supplierProductCode: e.target.value }))} /></label>
                <label className={label}>Vonalkód / Shopify SKU<input className={input} value={newProduct.barcode} onChange={(e) => { setNewProductBarcodeConflict(null); setNewProduct((x) => ({ ...x, barcode: e.target.value })); }} /></label>
              </div>
              {effectiveNewProductBarcodeConflict ? <MobileBarcodeConflictNotice info={effectiveNewProductBarcodeConflict} /> : null}
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>S/N/COD<input className={input} value={newProduct.snCod} onChange={(e) => setNewProduct((x) => ({ ...x, snCod: e.target.value }))} /></label>
                <label className={label}>Vámtarifa kód<input className={input} value={newProduct.customsTariffCode} onChange={(e) => setNewProduct((x) => ({ ...x, customsTariffCode: e.target.value }))} /></label>
              </div>
              <label className={label}>Anyag / összetétel<input className={input} value={newProduct.material} onChange={(e) => setNewProduct((x) => ({ ...x, material: e.target.value }))} /></label>
              <label className={label}>Leírás<textarea className={`${input} h-24 py-3`} value={newProduct.descriptionRo} onChange={(e) => setNewProduct((x) => ({ ...x, descriptionRo: e.target.value }))} /></label>
              <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-3">
                <p className="text-sm text-white">Kezdő készlet</p>
                <p className="mt-1 text-xs text-white/45">Legalább egy helyre adj meg darabszámot.</p>
                <div className="mt-3 grid gap-2">
                  {stockLocationRows.map((loc) => <label key={locationKey(loc)} className="grid grid-cols-[1fr_92px] items-center gap-2 rounded-xl bg-[#263246] px-3 py-2 text-sm text-white"><span className="truncate">{loc.name || loc.code}</span><input className={`${input} h-9 text-center`} inputMode="numeric" value={newProductStockRows[locationKey(loc)] || "0"} onChange={(e) => setNewProductLocationQty(loc, e.target.value)} /></label>)}
                </div>
                <div className="mt-2 text-right text-sm text-[#cffffd]">Összesen: {qty(newProductTotalQty())} db</div>
              </div>
              <button className={`${primaryBtn} h-12`} type="button" onClick={saveNewProduct} disabled={newProductSaving || newProductTotalQty() <= 0 || Boolean(effectiveNewProductBarcodeConflict)}><Save size={16} /> {newProductSaving ? "Mentés..." : "Termék mentése"}</button>
            </div>
          </section>
        </>
      )}

      {detailOpen && (
        <>
          <MobileBackdrop onClose={requestCloseDetail} />
          <div className={sheetPanel}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#cffffd]/70">Termékadatlap</p>
                <h2 className="mt-1 line-clamp-2 text-lg text-white">{edit.titleRo || itemTitle(detail?.item || {})}</h2>
                {detailBusy ? <p className="mt-1 text-xs text-white/50">Betöltés...</p> : null}
              </div>
              <button className={iconBtn} onClick={requestCloseDetail} type="button"><X size={18} /></button>
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
              <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-3">
                <p className="mb-2 text-sm text-white">Beszállítói kapcsolat</p>
                <MobileSingleSelect
                  labelText="Beszállító"
                  value={edit.supplierId}
                  emptyValue=""
                  emptyText="Válassz beszállítót..."
                  options={suppliers
                    .filter((row) => row.is_active !== false)
                    .slice()
                    .sort((a, b) => String(a.name || a.name_ro || a.code || "").localeCompare(String(b.name || b.name_ro || b.code || ""), "hu", { sensitivity: "base" }))
                    .map((row) => ({ value: String(row.id), label: String(row.name || row.name_ro || row.code || row.id) }))}
                  onChange={(next) => setEdit((x) => ({ ...x, supplierId: next }))}
                />
                <div className="mt-2 grid gap-1.5 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/62">
                  <div className="flex justify-between gap-3"><span>Termékkód</span><strong className="max-w-[58%] truncate text-right text-white">{edit.supplierProductCode || "-"}</strong></div>
                  <div className="flex justify-between gap-3"><span>Színkód</span><strong className="max-w-[58%] truncate text-right text-white">{edit.colorCode || detail?.item?.supplier_color_code || "-"}</strong></div>
                  <div className="flex justify-between gap-3"><span>Méret</span><strong className="max-w-[58%] truncate text-right text-white">{edit.size || detail?.item?.supplier_size || "-"}</strong></div>
                </div>
              </div>
              <MobileSingleSelect labelText="Márka" value={edit.brandCode} emptyValue="" emptyText="Nincs" options={brands.map((row) => ({ value: String(row.code || row.id), label: String(row.name || row.name_ro || row.code || row.id) }))} onChange={(next) => setEdit((x) => ({ ...x, brandCode: next }))} />
              <div className="grid grid-cols-2 gap-2">
                <MobileSingleSelect labelText="Főkategória" value={edit.categoryCode} emptyValue="" emptyText="Nincs" options={categoryOptions.map((row) => ({ value: String(row.code || row.id), label: categoryLabel(row) }))} onChange={(next) => setEdit((x) => ({ ...x, categoryCode: next, subCategoryCode: "" }))} />
                <MobileSingleSelect labelText="Alkategória" value={edit.subCategoryCode} emptyValue="" emptyText="Nincs" options={subCategories.filter((row) => { const parent = categoryOptions.find((cat) => metaMatches(cat, edit.categoryCode)); return !parent || categoryParentId(row) === String(parent.id); }).map((row) => ({ value: String(row.code || row.id), label: categoryLabel(row) }))} onChange={(next) => setEdit((x) => ({ ...x, subCategoryCode: next }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MobileSingleSelect labelText="Nem" value={edit.gender} showEmptyOption={false} options={genderTypes.map((row) => ({ value: String(row.code), label: String(row.name || row.code) }))} onChange={(next) => setEdit((x) => ({ ...x, gender: next }))} />
                <MobileSingleSelect labelText="Méret" value={edit.size} emptyValue="" emptyText="Nincs" options={[...(edit.size && !sizeTypes.some((row) => [row.name, row.name_hu, row.code, ...(row.aliases || [])].map(colorKey).includes(colorKey(edit.size))) ? [{ value: edit.size, label: edit.size, hint: "Jelenlegi érték" }] : []), ...sizeTypes.slice().sort(compareMobileWarehouseSizeTypes).map((row) => ({ value: String(row.name || row.code || row.id), label: sizeTypeLabel(row) }))]} onChange={(next) => setEdit((x) => ({ ...x, size: next }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MobileSingleSelect labelText="Szín" value={edit.colorName} emptyValue="" emptyText="Nincs" options={[...(edit.colorName && !colorTypes.some((row) => colorValues(row).map(colorKey).includes(colorKey(edit.colorName))) ? [{ value: edit.colorName, label: edit.colorName, hint: "Jelenlegi érték" }] : []), ...colorTypes.map((row) => ({ value: String(row.name_ro || row.code), label: colorTypeLabel(row), swatch: row.hex || undefined }))]} onChange={(next) => setEdit((x) => ({ ...x, colorName: next }))} />
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
                <MobileSingleSelect labelText="Modell állapot" value={edit.modelStatus} showEmptyOption={false} options={[{ value: "draft", label: "Előkészítés" }, { value: "active", label: "Aktív" }, { value: "archived", label: "Archivált" }]} onChange={(next) => setEdit((x) => ({ ...x, modelStatus: next }))} />
                <MobileSingleSelect labelText="Variáns állapot" value={edit.variantStatus} showEmptyOption={false} options={[{ value: "inactive", label: "Inaktív" }, { value: "active", label: "Aktív" }, { value: "archived", label: "Archivált" }]} onChange={(next) => setEdit((x) => ({ ...x, variantStatus: next, modelStatus: next === "active" && ["draft", "inactive"].includes(String(x.modelStatus || "").toLowerCase()) ? "active" : x.modelStatus }))} />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button className={softBtn} onClick={() => detail?.item && openStockEditor(detail.item)} type="button"><Boxes size={15} /> Készlet</button>
                <button className={`${softBtn} border-rose-300/30 bg-rose-500/12 text-rose-50`} onClick={() => detail?.item && setProductDeleteTarget(detail.item)} type="button"><Trash2 size={15} /> Törlés</button>
              </div>
              <button className={`${primaryBtn} h-12`} onClick={saveDetail} disabled={saving || detailBusy || !detailHasChanges || Boolean(effectiveEditBarcodeConflict)} title={effectiveEditBarcodeConflict ? "Ez az SKU már egy másik termékhez tartozik. Adj meg másik egyedi SKU-t." : undefined} type="button"><Save size={16} /> {saving ? "Mentés..." : "Mentés"}</button>
            </div>
          </div>
        </>
      )}

      {activationBlockMissing && (
        <>
          <button
            type="button"
            aria-label="Aktiválási hiba bezárása"
            className="fixed inset-0 z-[108] bg-black/72 backdrop-blur-sm"
            onClick={() => setActivationBlockMissing(null)}
          />
          <section className="fixed inset-x-3 top-1/2 z-[109] -translate-y-1/2 overflow-hidden rounded-[26px] border border-rose-200/25 bg-[#303a4c] text-white shadow-[0_28px_90px_rgba(0,0,0,.62)]">
            <div className="flex items-start gap-3 border-b border-white/10 bg-[#354153] px-4 py-4">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200/30 bg-rose-500/16 text-rose-100"><AlertTriangle size={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.16em] text-rose-100/60">Aktiválás blokkolva</p>
                <h3 className="mt-1 text-lg font-medium text-white">Nem lehet aktiválni</h3>
              </div>
              <button className={iconBtn} type="button" onClick={() => setActivationBlockMissing(null)} aria-label="Bezárás"><X size={17} /></button>
            </div>
            <div className="p-4">
              {activationBlockMissing.length === 1 && activationBlockMissing[0] === "vételár" ? (
                <p className="rounded-2xl border border-rose-200/20 bg-rose-500/10 px-3 py-3 text-sm leading-relaxed text-rose-50">
                  A termék nem aktiválható, mert nincs vételár megadva.
                </p>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-white/72">Az aktiváláshoz még kötelező adat hiányzik:</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activationBlockMissing.map((field) => <span key={field} className="rounded-full border border-amber-200/25 bg-amber-500/12 px-3 py-1.5 text-xs text-amber-50">{field}</span>)}
                  </div>
                </>
              )}
              <button className={`${primaryBtn} mt-4 h-11 w-full`} type="button" onClick={() => setActivationBlockMissing(null)}><X size={15} /> Bezárás</button>
            </div>
          </section>
        </>
      )}

      {productDeleteTarget && (
        <>
          <button type="button" aria-label="Törlés kérdés" className="fixed inset-0 z-[94] bg-black/70 backdrop-blur-sm" onClick={() => !saving && setProductDeleteTarget(null)} />
          <section className="fixed inset-x-0 bottom-0 z-[95] rounded-t-[28px] border border-rose-300/25 bg-[#303a4c] p-4 shadow-2xl shadow-black/60">
            <p className="text-[10px] uppercase tracking-[0.16em] text-rose-100/65">Végleges törlés</p>
            <h3 className="mt-1 line-clamp-2 text-lg text-white">{itemTitle(productDeleteTarget)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/58">A rendszer a backend használati ellenőrzései alapján csak akkor törli véglegesen, ha a művelet biztonságosan végrehajtható.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className={softBtn} type="button" onClick={() => setProductDeleteTarget(null)} disabled={saving}>Mégse</button>
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-300/35 bg-[#d31126] px-3 text-sm text-white disabled:opacity-50" type="button" onClick={() => void deleteProductNow()} disabled={saving}><Trash2 size={16} /> {saving ? "Törlés..." : "Végleges törlés"}</button>
            </div>
          </section>
        </>
      )}

      {detailCloseConfirmOpen && (
        <>
          <button type="button" aria-label="Bezárási kérdés" className="fixed inset-0 z-[92] bg-black/68 backdrop-blur-sm" onClick={() => setDetailCloseConfirmOpen(false)} />
          <section className="fixed inset-x-0 bottom-0 z-[93] rounded-t-[28px] border border-white/18 bg-[#303a4c] p-4 shadow-2xl shadow-black/60">
            <p className="text-[10px] uppercase tracking-[0.16em] text-amber-100/65">Nem mentett módosítás</p>
            <h3 className="mt-1 text-lg text-white">Mit csináljunk a változtatásokkal?</h3>
            <p className="mt-1 text-sm leading-relaxed text-white/58">A termékadatlap módosult. Bezáráskor ne vesszen el csendben semmi.</p>
            <div className="mt-4 grid gap-2">
              <button className={`${primaryBtn} h-12 w-full`} type="button" onClick={() => void saveDetail()} disabled={saving || Boolean(effectiveEditBarcodeConflict)}><Save size={16} /> Mentés és bezárás</button>
              <button className={`${softBtn} h-12 w-full border-rose-300/25 bg-rose-500/12 text-rose-50`} type="button" onClick={discardDetailChangesAndClose}>Módosítások eldobása</button>
              <button className={`${softBtn} h-11 w-full`} type="button" onClick={() => setDetailCloseConfirmOpen(false)}>Mégse</button>
            </div>
          </section>
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
                      <button className={softBtn} type="button" onClick={() => adjustStockEditorQty(loc, -1)}>-</button>
                      <input className={`${input} text-center text-lg`} value={stockEditorRows[key] || "0"} inputMode="numeric" onChange={(e) => setStockEditorQty(loc, e.target.value)} />
                      <button className={softBtn} type="button" onClick={() => adjustStockEditorQty(loc, 1)}>+</button>
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
                  <div className="mt-3">
                    <MobileSingleSelect
                      labelText="Ok"
                      value={stockEditorReasonCode}
                      emptyValue=""
                      emptyText="Válassz okot"
                      options={[
                        { value: "inventory_difference", label: "Leltáreltérés" },
                        { value: "incorrect_reception", label: "Téves bevételezés" },
                        { value: "invoice_correction", label: "Számlakorrekció" },
                        { value: "damaged_or_lost", label: "Sérült vagy elveszett termék" },
                        { value: "admin_correction", label: "Adminisztrációs javítás" },
                        { value: "other", label: "Egyéb" },
                      ]}
                      onChange={(next) => { setStockEditorReasonCode(next); if (next !== "other") setStockEditorReasonText(""); }}
                    />
                  </div>
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

      <ShopifySyncCenterModal
        open={shopifySyncCenterOpen}
        onClose={() => setShopifySyncCenterOpen(false)}
        onChanged={() => void load({ preferCache: false })}
      />
    </main>
  );
}
