import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Barcode,
  Boxes,
  ClipboardList,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Home,
  ImagePlus,
  Minus,
  MoreVertical,
  Plus,
  Printer,
  Trash2,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";

const page = "min-h-screen bg-[#4b5362] px-3 py-3 text-white font-normal sm:px-4 sm:py-4";
const shell = "mx-auto max-w-7xl space-y-4";
const panel = "overflow-hidden rounded-2xl border border-white/14 bg-white/[0.07] shadow-lg";
const panelHead = "flex items-center justify-between gap-3 bg-[#404a5b] px-4 py-3";
const btn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/20 bg-[#354153] px-3 text-xs text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const btnSoft = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3 text-xs text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/18 bg-[#354153] px-2.5 text-[11px] text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtnSoft = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.08] px-2.5 text-[11px] text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerPrimaryBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-2.5 text-[11px] text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const dangerBtn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-300/35 bg-rose-600 px-3 text-xs text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const warehouseListIconButton = "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/14 bg-white/[0.08] text-white/86 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#7bd7d4]/45 hover:bg-[#2a8d8b]/22 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/35 disabled:cursor-not-allowed disabled:opacity-50";
const warehouseListDangerButton = "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/30 bg-[#d31126] text-white shadow-[0_8px_18px_rgba(211,17,38,0.18)] transition hover:bg-[#b90f21] focus:outline-none focus:ring-2 focus:ring-rose-200/35 disabled:cursor-not-allowed disabled:opacity-50";
const input = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45";
const select = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none focus:border-white/45";
const moveLabel = "grid min-w-0 gap-1 text-[10px] uppercase tracking-[0.05em] text-white/58";
const moveInput = "h-8 min-w-0 w-full rounded-lg border border-white/18 bg-[#303a4c] px-2 text-xs text-white outline-none placeholder:text-white/40 focus:border-[#7bd7d4]/55";
const moveSelect = `${moveInput} aif-native-select truncate pr-8`;
const moveQtyBox = "grid h-8 w-full min-w-[132px] grid-cols-[32px,minmax(56px,1fr),32px] overflow-hidden rounded-lg border border-white/18 bg-[#303a4c]";
const moveQtyButton = "inline-flex h-8 w-8 items-center justify-center text-white/86 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/25 disabled:cursor-not-allowed disabled:opacity-45";
const moveTinyBtn = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/16 bg-[#354153] text-white/86 transition hover:border-[#7bd7d4]/35 hover:bg-[#3e4d63] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/30 disabled:cursor-not-allowed disabled:opacity-50";
const moveCompactBtn = "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#7bd7d4]/35 bg-[#2a8d8b]/78 px-2.5 text-[11px] text-white transition hover:bg-[#319c99] focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/30 disabled:cursor-not-allowed disabled:opacity-45";
const moveRowActions = "ml-auto flex shrink-0 items-center gap-1";
const label = "grid gap-1.5 text-xs text-white/70";
const chip = "rounded-full border border-white/12 bg-white/[0.08] px-2.5 py-1 text-xs text-white/70";
const selectBox = "h-4 w-4 rounded border-white/30 bg-[#303a4c] accent-[#2a8d8b] focus:ring-2 focus:ring-[#2a8d8b]/45";
const WAREHOUSE_PRODUCTS_PER_PAGE = 50;
const WAREHOUSE_PRODUCTS_PER_PAGE_OPTIONS = [50, 100, 150, 200];
const modalWrap = "fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-3 py-4 backdrop-blur-sm sm:items-center";
const modal = "max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl border border-white/16 bg-[#4b5362] shadow-2xl";
const taxonomyModal = "max-h-[92vh] w-full max-w-[1140px] overflow-auto rounded-[26px] border border-white/20 bg-[#4b5362] shadow-2xl";
const taxonomyCard = "rounded-2xl border border-white/18 bg-[#566171] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_24px_rgba(15,23,42,0.10)]";
const taxonomyTabBase = "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs transition-colors font-normal";
const taxonomyTabActive = `${taxonomyTabBase} border-[#7bd7d4]/55 bg-[#2a8d8b] text-white shadow-[0_0_0_1px_rgba(42,141,139,0.22),0_8px_18px_rgba(15,23,42,0.12)]`;
const taxonomyTabIdle = `${taxonomyTabBase} border-white/16 bg-[#3f4959] text-white/78 hover:bg-[#475365]`;
const taxonomySmallBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/18 bg-[#3f4959] px-2.5 text-[11px] text-white/88 hover:bg-[#475365] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const taxonomyPrimaryBtn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#7bd7d4]/45 bg-[#2a8d8b] px-3 text-xs text-white shadow-[0_0_0_1px_rgba(42,141,139,0.12)] hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-45 font-normal";
const taxonomyDangerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-300/30 bg-[#d31126] px-2.5 text-[11px] text-white shadow-[0_0_0_1px_rgba(248,113,113,0.06)] hover:bg-[#b90f21] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const taxonomyField = "grid gap-1.5 text-[11px] text-white/72";
const taxonomyInput = "h-9 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-[13px] text-white outline-none placeholder:text-white/42 focus:border-[#7bd7d4]/55";
const taxonomyTextarea = "min-h-[74px] rounded-xl border border-white/18 bg-[#3f4959] px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/42 focus:border-[#7bd7d4]/55";
const taxonomyRow = "relative flex items-center justify-between gap-3 rounded-xl border border-white/14 bg-[#495466] px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

const selectedProductsStorageKey = "allinfashion:warehouse:selectedVariants:v1";
const selectedProductActionsStorageKey = "allinfashion:warehouse:selectedVariantActions:v1";
const selectedProductCloudMigrationStorageKey = "allinfashion:warehouse:selectedVariantsCloudMigrated:v1";
const stockMovesChangedStorageKey = "allinfashion:stockMoves:changed:v1";
const stockMovesChangedEventName = "aif:stock-moves-changed";
const warehouseShowAllAfterIncomingStorageKey = "allinfashion:warehouse:showAllAfterIncoming:v1";
const warehouseShowAllAfterIncomingEventName = "aif:warehouse-show-all-after-incoming";

function notifyStockMovesChanged(detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = { at: new Date().toISOString(), ...detail };
  try {
    window.localStorage.setItem(stockMovesChangedStorageKey, JSON.stringify(payload));
  } catch {
    // Ha a localStorage nem elérhető, az aktuális ablak akkor is kapjon jelzést.
  }
  try {
    window.dispatchEvent(new CustomEvent(stockMovesChangedEventName, { detail: payload }));
  } catch {
    // Nem kritikus, a következő betöltés / auto refresh úgyis behozza.
  }
}

type SelectedWorkAction = "label" | "order" | "move";

const selectedWorkActionLabels: Record<SelectedWorkAction, string> = {
  label: "Vonalkód / címke",
  order: "Rendelés / PDF",
  move: "Készletmozgatás",
};

function readSavedSelectedVariantActions(): Record<string, SelectedWorkAction> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(selectedProductActionsStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const allowed = new Set(["label", "order", "move"]);
    return Object.entries(parsed).reduce<Record<string, SelectedWorkAction>>((acc, [id, value]) => {
      const key = String(id || "").trim();
      const action = String(value || "") as SelectedWorkAction;
      if (key && allowed.has(action)) acc[key] = action;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function saveSelectedVariantActionsToStorage(actions: Record<string, SelectedWorkAction>) {
  if (typeof window === "undefined") return;
  const clean = Object.entries(actions).reduce<Record<string, SelectedWorkAction>>((acc, [id, action]) => {
    const key = String(id || "").trim();
    if (key && ["label", "order", "move"].includes(action)) acc[key] = action;
    return acc;
  }, {});
  if (!Object.keys(clean).length) {
    window.localStorage.removeItem(selectedProductActionsStorageKey);
    return;
  }
  window.localStorage.setItem(selectedProductActionsStorageKey, JSON.stringify(clean));
}

function readSavedSelectedVariants(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(selectedProductsStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.reduce<Record<string, boolean>>((acc, id) => {
        const key = String(id || "").trim();
        if (key) acc[key] = true;
        return acc;
      }, {});
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed).reduce<Record<string, boolean>>((acc, [id, value]) => {
        const key = String(id || "").trim();
        if (key && value) acc[key] = true;
        return acc;
      }, {});
    }
  } catch {
    return {};
  }
  return {};
}

function saveSelectedVariantsToStorage(selected: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  const ids = Object.keys(selected).filter((id) => selected[id]);
  if (!ids.length) {
    window.localStorage.removeItem(selectedProductsStorageKey);
    return;
  }
  window.localStorage.setItem(selectedProductsStorageKey, JSON.stringify(ids));
}

function selectedCloudMigrationDone() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(selectedProductCloudMigrationStorageKey) === "1";
  } catch {
    return false;
  }
}

function markSelectedCloudMigrationDone() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(selectedProductCloudMigrationStorageKey, "1");
  } catch {
    // A localStorage hiba nem állíthatja meg a folyamatot.
  }
}

function normalizeSelectedWorkAction(value: unknown): SelectedWorkAction | null {
  const raw = String(value || "").trim();
  return raw === "label" || raw === "order" || raw === "move" ? raw : null;
}

function selectedVariantIdFromItem(item: Partial<InventoryItem> & { selected_variant_id?: string | null; variantId?: string | null; id?: string | null }) {
  return String(item.variant_id || item.selected_variant_id || item.variantId || item.id || "").trim();
}

function selectedPayloadFromState(selected: Record<string, boolean>, actions: Record<string, SelectedWorkAction>) {
  return Object.keys(selected)
    .filter((id) => selected[id])
    .map((id) => ({ variantId: id, action: actions[id] || null }));
}

function mergeInventoryItems(baseItems: InventoryItem[], extraItems: InventoryItem[]) {
  const map = new Map<string, InventoryItem>();
  for (const item of baseItems) {
    const id = selectedVariantIdFromItem(item);
    if (id) map.set(id, { ...item, variant_id: id });
  }
  for (const item of extraItems) {
    const id = selectedVariantIdFromItem(item);
    if (id && !map.has(id)) map.set(id, { ...item, variant_id: id });
  }
  return Array.from(map.values());
}


type InventoryItem = {
  variant_id: string;
  internal_sku?: string | null;
  barcode?: string | null;
  supplier_product_code?: string | null;
  supplierProductCode?: string | null;
  product_code?: string | null;
  productCode?: string | null;
  import_supplier_product_code?: string | null;
  importSupplierProductCode?: string | null;
  sn_cod?: string | null;
  snCod?: string | null;
  customs_tariff_code?: string | null;
  customsTariffCode?: string | null;
  hs_code?: string | null;
  attributes?: Record<string, unknown> | null;
  image_url?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  supplier_names?: string | null;
  supplier_codes?: string | null;
  supplier_ids?: string | null;
  suppliers?: Array<{ id?: string; code?: string; name?: string }> | null;
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
  aliases?: string[] | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  size?: string | null;
  buy_price?: string | number | null;
  sell_price?: string | number | null;
  compare_at_price?: string | number | null;
  variant_status?: string | null;
  total_qty?: number | string | null;
  total_reserved_qty?: number | string | null;
  available_qty?: number | string | null;
  last_stock_movement_at?: string | null;
  last_incoming_at?: string | null;
};

type PersistedSelectedWorkItem = InventoryItem & {
  selected_variant_id?: string | null;
  action?: SelectedWorkAction | null;
  selected_action?: SelectedWorkAction | null;
  sort_order?: number | string | null;
  selected_at?: string | null;
  selected_updated_at?: string | null;
};


function firstWarehouseText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function firstWarehouseValue<T = unknown>(...values: T[]) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function importFocusRowToInventoryItem(rawItem: any): InventoryItem | null {
  if (!rawItem || typeof rawItem !== "object") return null;
  const norm = rawItem.import_normalized && typeof rawItem.import_normalized === "object"
    ? rawItem.import_normalized
    : rawItem.normalized && typeof rawItem.normalized === "object"
      ? rawItem.normalized
      : {};
  const raw = rawItem.import_raw && typeof rawItem.import_raw === "object"
    ? rawItem.import_raw
    : rawItem.raw && typeof rawItem.raw === "object"
      ? rawItem.raw
      : {};
  const variantId = firstWarehouseText(rawItem.variant_id, rawItem.variantId, rawItem.selected_variant_id, rawItem.selectedVariantId, rawItem.id);
  if (!variantId) return null;
  const title = firstWarehouseText(rawItem.title_ro, rawItem.titleRo, norm.titleRo, norm.productName, norm.name, raw.ARTICOL, raw.Articol, raw.DENUMIRE, raw["DENUMIRE PRODUS"], rawItem.import_supplier_product_code, rawItem.supplier_product_code);
  const brandName = firstWarehouseText(rawItem.brand_name, rawItem.brandName, norm.brandName, norm.brand, raw.BRAND, raw.Brand);
  const brandCode = firstWarehouseText(rawItem.brand_code, rawItem.brandCode, norm.brandCode, norm.brand_code);
  const categoryName = firstWarehouseText(rawItem.category_name_ro, rawItem.category_name_hu, rawItem.categoryName, norm.categoryName, norm.productType, raw.RODESCR, raw.CATEGORIE, raw.Category);
  const categoryCode = firstWarehouseText(rawItem.category_code, rawItem.categoryCode, norm.categoryCode, norm.productType, raw.RODESCR, raw.CATEGORIE);
  const colorCode = firstWarehouseText(rawItem.color_code, rawItem.colorCode, rawItem.import_supplier_color_code, rawItem.supplier_color_code, norm.colorCode, norm.supplierColorCode);
  const colorName = firstWarehouseText(rawItem.color_name, rawItem.colorName, norm.colorName, norm.color, raw["CULOARE"], raw.CULOARE);
  const size = firstWarehouseText(rawItem.size, rawItem.import_supplier_size, rawItem.supplier_size, norm.size, norm.supplierSize, raw.MARIME, raw["MĂRIME"], raw.SIZE);
  const qtyFallback = firstWarehouseValue(rawItem.total_qty, rawItem.qty_after, rawItem.import_total_qty, rawItem.import_qty, rawItem.qty_delta, rawItem.qty, norm.totalQty, norm.qty);
  const reservedFallback = firstWarehouseValue(rawItem.total_reserved_qty, rawItem.reserved_qty, 0);
  const availableFallback = firstWarehouseValue(rawItem.available_qty, rawItem.qty_after, rawItem.import_available_qty, rawItem.import_qty, rawItem.qty_delta, rawItem.qty, norm.availableQty, norm.qty);
  const attrs = (rawItem.attributes && typeof rawItem.attributes === "object" ? rawItem.attributes : null) ||
    (rawItem.variant_attributes && typeof rawItem.variant_attributes === "object" ? rawItem.variant_attributes : null) ||
    (norm.attributes && typeof norm.attributes === "object" ? norm.attributes : null);
  const customsCode = firstWarehouseText(rawItem.customs_tariff_code, rawItem.customsTariffCode, rawItem.hs_code, norm.customsTariffCode, norm.customs_tariff_code, norm.tariffCode, norm.hsCode, raw.INTRASTAT, raw.VTSZ);

  return {
    ...rawItem,
    variant_id: variantId,
    internal_sku: firstWarehouseText(rawItem.internal_sku, rawItem.internalSku) || null,
    barcode: firstWarehouseText(rawItem.barcode, norm.barcode, norm.supplierBarcode) || null,
    supplier_product_code: firstWarehouseText(rawItem.supplier_product_code, rawItem.supplierProductCode, rawItem.product_code, rawItem.productCode, rawItem.import_supplier_product_code, norm.supplierProductCode, norm.supplier_product_code, norm.productCode, norm.product_code, raw.CODPRODUS, raw["COD PRODUS"], firstCsvText(rawItem.supplier_codes)) || null,
    supplierProductCode: firstWarehouseText(rawItem.supplierProductCode, rawItem.supplier_product_code, rawItem.productCode, rawItem.product_code, rawItem.import_supplier_product_code, norm.supplierProductCode, norm.supplier_product_code, norm.productCode, norm.product_code, raw.CODPRODUS, raw["COD PRODUS"], firstCsvText(rawItem.supplier_codes)) || null,
    sn_cod: firstWarehouseText(rawItem.sn_cod, rawItem.snCod, norm.snCod, norm.sn_cod, rawItem.import_sn_cod) || null,
    snCod: firstWarehouseText(rawItem.snCod, rawItem.sn_cod, norm.snCod, norm.sn_cod, rawItem.import_sn_cod) || null,
    customs_tariff_code: customsCode || null,
    customsTariffCode: customsCode || null,
    attributes: attrs,
    image_url: firstWarehouseText(rawItem.image_url, rawItem.imageUrl, norm.imageUrl, norm.image_url, raw["IMAGE URL"], raw.IMAGE) || null,
    brand_name: brandName || null,
    brand_code: brandCode || null,
    model_id: firstWarehouseText(rawItem.model_id, rawItem.modelId) || null,
    model_code: firstWarehouseText(rawItem.model_code, rawItem.modelCode, norm.modelCode, rawItem.import_supplier_product_code, rawItem.supplier_product_code) || null,
    title_ro: title || null,
    title_hu: firstWarehouseText(rawItem.title_hu, rawItem.titleHu, norm.titleHu) || null,
    description_ro: firstWarehouseText(rawItem.description_ro, rawItem.descriptionRo, norm.descriptionRo, raw.RODESCR) || null,
    shopify_title: firstWarehouseText(rawItem.shopify_title, rawItem.shopifyTitle, norm.shopifyTitle, title) || null,
    gender: firstWarehouseText(rawItem.gender, norm.gender, raw.GEN) || null,
    product_type: firstWarehouseText(rawItem.product_type, rawItem.productType, norm.productType, raw.RODESCR) || null,
    season: firstWarehouseText(rawItem.season, norm.season, norm.collection, raw.COLECTIE) || null,
    material: firstWarehouseText(rawItem.material, norm.material, norm.composition, raw.COMPOZITIE) || null,
    model_status: firstWarehouseText(rawItem.model_status, rawItem.modelStatus, "active") || "active",
    category_code: categoryCode || null,
    category_name_ro: categoryName || null,
    category_name_hu: firstWarehouseText(rawItem.category_name_hu, rawItem.categoryNameHu) || null,
    subcategory_id: firstWarehouseText(rawItem.subcategory_id, rawItem.subCategoryId, norm.subcategoryId, norm.subCategoryId) || null,
    subcategory_code: firstWarehouseText(rawItem.subcategory_code, rawItem.subCategoryCode, norm.subcategoryCode, norm.subCategoryCode, norm.sourceSubCategory, raw.RODESCR) || null,
    subcategory_name_ro: firstWarehouseText(rawItem.subcategory_name_ro, rawItem.subcategoryName, rawItem.subCategoryName, norm.subcategoryName, norm.subCategoryName, norm.sourceSubCategory, raw.RODESCR) || null,
    subcategory_name_hu: firstWarehouseText(rawItem.subcategory_name_hu, rawItem.subcategoryNameHu, rawItem.subCategoryNameHu) || null,
    color_code: colorCode || null,
    color_name: colorName || null,
    color_hex: firstWarehouseText(rawItem.color_hex, rawItem.colorHex, norm.colorHex) || null,
    size: size || null,
    buy_price: firstWarehouseValue(rawItem.buy_price, rawItem.import_buy_price_ron, rawItem.import_buy_price, norm.buyPriceRon, norm.buyPrice),
    sell_price: firstWarehouseValue(rawItem.sell_price, rawItem.import_sell_price_ron, rawItem.import_sell_price, norm.sellPriceRon, norm.sellPriceGrossRon, norm.sellPrice),
    compare_at_price: firstWarehouseValue(rawItem.compare_at_price, norm.compareAtPrice),
    variant_status: firstWarehouseText(rawItem.variant_status, rawItem.status, "active") || "active",
    total_qty: qtyFallback ?? 0,
    total_reserved_qty: reservedFallback ?? 0,
    available_qty: availableFallback ?? qtyFallback ?? 0,
    last_stock_movement_at: firstWarehouseText(rawItem.last_stock_movement_at, rawItem.updated_at, rawItem.import_updated_at, rawItem.committed_at) || null,
    last_incoming_at: firstWarehouseText(rawItem.last_incoming_at, rawItem.committed_at, rawItem.updated_at) || null,
  };
}


type WarehouseIncomingMovementFocus = {
  sourceId: string;
  sourceFileName?: string | null;
  createdAt?: string | null;
  rows: Array<Record<string, any>>;
  items: InventoryItem[];
  variantIds: string[];
  totalQty: number;
};

function warehouseMovementRowToInventoryItem(row: Record<string, any>): InventoryItem | null {
  if (!row || typeof row !== "object") return null;
  const qtyDelta = Math.abs(n(row.qty_delta));
  const qtyAfter = n(row.qty_after);
  const mapped = importFocusRowToInventoryItem({
    ...row,
    variant_id: row.variant_id || row.variantId,
    barcode: firstWarehouseText(row.barcode),
    total_qty: qtyAfter || qtyDelta,
    available_qty: qtyAfter || qtyDelta,
    import_qty: qtyDelta,
    last_stock_movement_at: row.created_at || row.updated_at,
    last_incoming_at: row.created_at || row.updated_at,
    import_updated_at: row.created_at || row.updated_at,
    variant_status: row.variant_status || row.status || "active",
    model_status: row.model_status || "active",
  });
  if (!mapped) return null;
  return {
    ...mapped,
    barcode: mapped.barcode || firstWarehouseText(row.barcode) || null,
    total_qty: qtyAfter || mapped.total_qty || qtyDelta,
    available_qty: qtyAfter || mapped.available_qty || qtyDelta,
    last_stock_movement_at: firstWarehouseText(row.created_at, mapped.last_stock_movement_at) || null,
    last_incoming_at: firstWarehouseText(row.created_at, mapped.last_incoming_at) || null,
  };
}

function latestWarehouseImportMovementFocus(rows: Array<Record<string, any>>): WarehouseIncomingMovementFocus | null {
  const incomingRows = (rows || [])
    .filter((row) => n(row?.qty_delta) > 0)
    .filter((row) => {
      const sourceType = normalizeSearch(row?.source_type || "");
      const movementType = normalizeSearch(row?.movement_type || "");
      const rawReason = normalizeSearch(row?.raw?.reason || "");
      const rowSourceId = firstWarehouseText(row?.source_id, row?.raw?.importBatchId, row?.raw?.import_batch_id);
      const sourceKey = normalizeSearch(rowSourceId);
      if (sourceType.includes("stock_table_audit") || sourceKey.startsWith("stock_audit") || rawReason.includes("stock_audit")) return false;
      return sourceType.includes("import_batch") || rawReason.includes("import_batch") || (movementType === "incoming" && isUuidLike(rowSourceId));
    })
    .slice()
    .sort((a, b) => dateTimeMs(b.created_at) - dateTimeMs(a.created_at));
  if (!incomingRows.length) return null;

  const latest = incomingRows[0];
  const latestSourceId = firstWarehouseText(latest.source_id, latest.raw?.importBatchId, latest.raw?.import_batch_id);
  const latestMs = dateTimeMs(latest.created_at);
  const latestMinute = latestMs ? Math.floor(latestMs / 60000) : 0;
  const group = incomingRows.filter((row) => {
    const rowSourceId = firstWarehouseText(row.source_id, row.raw?.importBatchId, row.raw?.import_batch_id);
    if (latestSourceId && rowSourceId) return rowSourceId === latestSourceId;
    const rowMinute = dateTimeMs(row.created_at) ? Math.floor(dateTimeMs(row.created_at) / 60000) : 0;
    return rowMinute === latestMinute;
  });

  const itemMap = new Map<string, InventoryItem>();
  for (const row of group) {
    const item = warehouseMovementRowToInventoryItem(row);
    const id = selectedVariantIdFromItem(item || {});
    if (!item || !id) continue;
    const previous = itemMap.get(id);
    itemMap.set(id, previous ? { ...previous, ...item, variant_id: id, total_qty: item.total_qty || previous.total_qty, available_qty: item.available_qty || previous.available_qty } : item);
  }
  const items = Array.from(itemMap.values()).filter((item) => !isArchivedInventoryItem(item));
  const variantIds = Array.from(new Set(items.map((item) => selectedVariantIdFromItem(item)).filter(Boolean)));
  if (!variantIds.length) return null;
  const totalQty = group.reduce((sum, row) => sum + Math.abs(n(row.qty_delta)), 0);
  return {
    sourceId: latestSourceId || `stock-movements:${latest.created_at || Date.now()}`,
    sourceFileName: firstWarehouseText(latest.raw?.sourceFileName, latest.raw?.source_file_name, latest.raw?.fileName, latest.raw?.file_name) || null,
    createdAt: firstWarehouseText(latest.created_at) || null,
    rows: group,
    items,
    variantIds,
    totalQty,
  };
}

type MetaItem = { id: string; code?: string; parent_id?: string | null; parentId?: string | null; name?: string; name_ro?: string; name_hu?: string | null; aliases?: string[] | null; shopify_collection_handle?: string | null; sort_order?: number | string | null; is_active?: boolean };
type GenderType = { code: string; name: string; aliases?: string[] | null; sort_order?: number | string | null; is_active?: boolean };
type ColorType = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  name_en?: string | null;
  name_de?: string | null;
  aliases?: string[] | null;
  hex?: string | null;
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
  color_name_en?: string | null;
  color_name_de?: string | null;
  color_hex?: string | null;
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};
type MaterialType = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  name_en?: string | null;
  name_de?: string | null;
  aliases?: string[] | null;
  sort_order?: number | string | null;
  is_active?: boolean;
};
type SizeType = {
  id: string;
  code: string;
  name: string;
  name_hu?: string | null;
  aliases?: string[] | null;
  sort_order?: number | string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};
type BrandSizeCode = {
  id: string;
  brand_id: string;
  brand_code?: string | null;
  brand_name?: string | null;
  size_code: string;
  size_type_id: string;
  size_type_code?: string | null;
  size_name?: string | null;
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};
type SupplierBrandLink = { id: string; supplier_id: string; brand_id: string; supplier_name?: string; brand_name?: string; is_preferred?: boolean; is_active?: boolean };
type StockItem = { variant_id: string; location_id?: string; location_code?: string; location_name?: string; location_type?: string; qty?: number | string; reserved_qty?: number | string; available_qty?: number | string; updated_at?: string };
type StockTransferDraftRow = {
  fromLocationId: string;
  toLocationId: string;
  qty: string;
};

type PreparedStockTransferRow = {
  item: InventoryItem;
  variantId: string;
  fromLocationId: string;
  toLocationId: string;
  fromLocationName: string;
  toLocationName: string;
  qty: number;
  availableFrom: number;
  valid: boolean;
  problem: string;
};

type StockTransferPrintLine = {
  index: number;
  title: string;
  brand: string;
  category: string;
  barcode: string;
  color: string;
  size: string;
  imageUrl?: string | null;
  fromLocation: string;
  toLocation: string;
  qty: number;
};
type StockFilter = "all" | "available" | "out" | "reserved" | "missing" | "watch";
type ImageFilter = "all" | "with" | "missing";
type SortMode = "name" | "brand" | "stock_desc" | "stock_asc" | "value_desc" | "missing" | "incoming_desc";

type BarcodeScannerMode = "search" | "editBarcode";

type BarcodeScannerSession = {
  mode: BarcodeScannerMode;
  title: string;
  helper: string;
};

type WarehouseDetectedBarcode = {
  rawValue?: string;
  format?: string;
};

type WarehouseBarcodeDetectorInstance = {
  detect(source: CanvasImageSource): Promise<WarehouseDetectedBarcode[]>;
};

type WarehouseBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): WarehouseBarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

type WarehouseZxingControls = {
  stop?: () => void;
};

type WarehouseZxingResult = {
  getText?: () => string;
  text?: string;
  rawValue?: string;
};

type WarehouseZxingReader = {
  decodeFromConstraints?: (
    constraints: MediaStreamConstraints,
    previewElem: HTMLVideoElement,
    callbackFn: (result?: WarehouseZxingResult | null, error?: unknown, controls?: WarehouseZxingControls) => void
  ) => Promise<WarehouseZxingControls> | WarehouseZxingControls;
};

type WarehouseZxingBrowserGlobal = {
  BrowserMultiFormatReader?: new () => WarehouseZxingReader;
  BrowserMultiFormatOneDReader?: new () => WarehouseZxingReader;
};

declare global {
  interface Window {
    BarcodeDetector?: WarehouseBarcodeDetectorConstructor;
    ZXingBrowser?: WarehouseZxingBrowserGlobal;
  }
}

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
let warehouseZxingBrowserPromise: Promise<WarehouseZxingBrowserGlobal | null> | null = null;

function cleanScannedBarcode(value: unknown) {
  return String(value ?? "").replace(/[\r\n\t]+/g, "").trim();
}

function zxingResultText(result: unknown) {
  const r = result as WarehouseZxingResult | null | undefined;
  if (!r) return "";
  if (typeof r.getText === "function") return cleanScannedBarcode(r.getText());
  return cleanScannedBarcode(r.text || r.rawValue || "");
}

function loadWarehouseZxingBrowser(): Promise<WarehouseZxingBrowserGlobal | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  if (window.ZXingBrowser?.BrowserMultiFormatReader || window.ZXingBrowser?.BrowserMultiFormatOneDReader) {
    return Promise.resolve(window.ZXingBrowser);
  }
  if (warehouseZxingBrowserPromise) return warehouseZxingBrowserPromise;

  warehouseZxingBrowserPromise = new Promise((resolve) => {
    const finish = () => resolve(window.ZXingBrowser || null);
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

type DetailResponse = {
  item: any;
  stock: any[];
  supplierCodes: any[];
  movements: any[];
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
type NewProductForm = EditForm & {
  supplierId: string;
  supplierProductCode: string;
  supplierVariantCode: string;
  supplierColorCode: string;
  supplierSize: string;
};

function goHome() {
  window.location.hash = "#allin";
}

function goBarcodeManager(variantId?: string, barcode?: string, title?: string) {
  const params = new URLSearchParams();
  if (variantId) params.set("variant", variantId);
  if (barcode) params.set("barcode", barcode);
  if (title) params.set("title", title);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  window.location.hash = `#allinbarcodes${suffix}`;
}

function n(v: unknown) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function money(v: unknown) {
  if (v === null || v === undefined || v === "") return "-";
  const x = Number(v);
  if (!Number.isFinite(x)) return String(v);
  return x.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function priceNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function priceMarkupPercentText(buyPrice: unknown, sellPrice: unknown) {
  const buy = priceNumber(buyPrice);
  const sell = priceNumber(sellPrice);
  if (!buy || buy <= 0 || sell === null) return "";
  const percent = ((sell - buy) / buy) * 100;
  if (!Number.isFinite(percent)) return "";
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toLocaleString("hu-HU", { maximumFractionDigits: 0 })}%`;
}

function dateTimeMs(value: unknown) {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function latestWarehouseIncomingMs(item: Partial<InventoryItem> | Record<string, unknown>) {
  return Math.max(dateTimeMs((item as any).last_incoming_at), dateTimeMs((item as any).last_stock_movement_at));
}

function chartBarWidth(value: unknown, maxValue: unknown, minPositivePercent = 4) {
  const current = n(value);
  const max = n(maxValue);
  if (current <= 0 || max <= 0) return "0%";
  return `${Math.min(100, Math.max(minPositivePercent, (current / max) * 100))}%`;
}

type WarehouseBarcodeRender = {
  ok: boolean;
  svg: string;
  width: number;
  error?: string;
};

type WarehouseLabelContentKey =
  | "company"
  | "brand"
  | "title"
  | "barcode"
  | "description"
  | "category"
  | "sizeColor"
  | "code"
  | "price";

type WarehouseLabelTemplate = {
  name: string;
  labelWidth: string;
  labelHeight: string;
  labelCols: string;
  labelRows: string;
  labelMarginX: string;
  labelMarginY: string;
  labelCompanyName: string;
  labelCurrency: string;
  labelUnitText: string;
  labelShowBorder: boolean;
  labelContent: Record<WarehouseLabelContentKey, boolean>;
};

type WarehouseLabelPreset = {
  id: string;
  name: string;
  width: string;
  height: string;
  cols: string;
  rows: string;
  marginX: string;
  marginY: string;
};

const WAREHOUSE_LABEL_COMPANY = "TITAN EURO-COM SRL";
const WAREHOUSE_LABEL_PREVIEW_SCALE = 0.58;

const WAREHOUSE_LABEL_PRESETS: WarehouseLabelPreset[] = [
  { id: "40x46", name: "40 × 46 mm, 5 × 6 pe A4", width: "40", height: "46", cols: "5", rows: "6", marginX: "5", marginY: "5" },
  { id: "50x30", name: "50 × 30 mm, 4 × 8 pe A4", width: "50", height: "30", cols: "4", rows: "8", marginX: "5", marginY: "5" },
  { id: "60x40", name: "60 × 40 mm, 3 × 6 pe A4", width: "60", height: "40", cols: "3", rows: "6", marginX: "6", marginY: "6" },
  { id: "70x36", name: "70 × 36 mm, 2 × 7 pe A4", width: "70", height: "36", cols: "2", rows: "7", marginX: "8", marginY: "6" },
];

const WAREHOUSE_LABEL_DEFAULT_CONTENT: Record<WarehouseLabelContentKey, boolean> = {
  company: true,
  brand: true,
  title: true,
  barcode: true,
  description: true,
  category: true,
  sizeColor: true,
  code: true,
  price: true,
};


const WAREHOUSE_LABEL_CONTENT_OPTIONS: { key: WarehouseLabelContentKey; label: string; hint: string }[] = [
  { key: "company", label: "Cég neve", hint: "A címke tetején jelenik meg." },
  { key: "brand", label: "Márka", hint: "A terméknév felett vagy alatt jelenik meg." },
  { key: "title", label: "Terméknév", hint: "A fő terméknév, lehet 1-2 sor." },
  { key: "barcode", label: "Vonalkód", hint: "Code128 belső AllIn / Shopify SKU azonosító." },
  { key: "description", label: "Anyag / összetétel", hint: "Csak az anyagösszetétel kerül a címkére. Ha nincs megadva, üres marad." },
  { key: "category", label: "Főkategória", hint: "Nagy gyűjtőcsoport, pl. Accesorii / Îmbrăcăminte." },
  { key: "sizeColor", label: "Méret / szín", hint: "A variáns gyors azonosításához." },
  { key: "code", label: "Termékkód", hint: "Beszállítói / belső cikkszám." },
  { key: "price", label: "Ár", hint: "Nagy árrész a címke alján." },
];

function readWarehouseLabelTemplates(): WarehouseLabelTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("aifWarehouseLabelTemplates");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWarehouseLabelTemplates(templates: WarehouseLabelTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("aifWarehouseLabelTemplates", JSON.stringify(templates));
}

type WarehouseLabelPrintItem = {
  key: string;
  variantId: string;
  barcode: string;
  title: string;
  brand: string;
  category: string;
  size: string;
  color: string;
  description: string;
  productCode: string;
  price: string;
  stockQty: number;
  copyIndex: number;
  copyTotal: number;
  render: WarehouseBarcodeRender;
};


const WAREHOUSE_LABEL_SHEET_CSS = `
.aifWarehouseLabelPrintPage {
  width:210mm;
  min-height:297mm;
  overflow:hidden;
  display:flex;
  flex-wrap:wrap;
  gap:0;
  padding:var(--aif-label-margin-y) var(--aif-label-margin-x);
  box-sizing:border-box;
  align-content:flex-start;
  align-items:flex-start;
  justify-content:flex-start;
  background:#fff;
  color:#111;
  page-break-after:always;
  break-after:page;
  print-color-adjust:exact;
  -webkit-print-color-adjust:exact;
}
.aifWarehouseLabelPrintPage:last-child { page-break-after:auto; break-after:auto; }
.aifWarehousePrintLabel {
  flex:0 0 var(--aif-label-w);
  width:var(--aif-label-w);
  height:var(--aif-label-h);
  border:1px solid #ddd;
  border-radius:12px;
  padding:2mm;
  color:#111;
  background:#fff;
  overflow:hidden;
  box-sizing:border-box;
  display:flex;
  flex-direction:column;
  justify-content:center;
  font-family:Arial, sans-serif;
  page-break-inside:avoid;
  break-inside:avoid;
  print-color-adjust:exact;
  -webkit-print-color-adjust:exact;
}
.aifWarehousePrintLabel.noBorder { border-color:transparent; }
.aifWhLabelCompany { font-size:10px; text-align:center; text-transform:uppercase; letter-spacing:.08em; color:#333; margin-bottom:2px; }
.aifWhLabelBrand { font-size:10px; text-align:center; text-transform:uppercase; letter-spacing:.05em; color:#222; margin-bottom:2px; }
.aifWhLabelTitle { font-size:13px; line-height:1.1; text-align:center; color:#111; margin-bottom:4px; }
.aifWhLabelMeta { display:flex; justify-content:center; gap:8px; flex-wrap:wrap; color:#333; font-size:10px; margin-bottom:4px; }
.aifWhLabelDescription { border-top:1px solid #ddd; padding-top:3px; margin-top:3px; text-align:center; font-size:9.5px; line-height:1.08; color:#222; }
.aifWhBarcodeSvgWrap { width:100%; overflow:hidden; }
.aifWhBarcodeSvgWrap svg { display:block; width:100%; height:auto; max-height:54px; }
.aifWhLabelCategory { border-top:1px solid #ddd; padding-top:3px; margin-top:3px; text-align:center; text-transform:uppercase; font-size:10px; color:#111; }
.aifWhLabelCode { margin-top:3px; font-size:8.5px; color:#444; text-align:center; }
.aifWhLabelPrice { margin-top:3px; text-align:center; line-height:1; color:#111; white-space:nowrap; }
.aifWhPriceMajor { font-size:22px; letter-spacing:.08em; }
.aifWhPriceCents { font-size:12px; vertical-align:top; margin-left:2px; }
.aifWhPriceUnit { display:inline-block; font-size:8px; margin-left:3px; vertical-align:baseline; }
`;

const WAREHOUSE_LABEL_APP_CSS = `
.aifWarehouseLabelPrintRoot { display:none; }
.aifWhLabelPreviewFrame {
  max-height:68vh;
  overflow:auto;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.14);
  background:#2f394a;
  padding:10px;
}
.aifWhLabelPreviewPageBox {
  width:var(--aif-label-preview-w);
  height:var(--aif-label-preview-h);
  overflow:hidden;
  background:#fff;
  box-shadow:0 14px 34px rgba(0,0,0,.26);
}
.aifWhLabelPreviewFrame .aifWarehouseLabelPrintPage {
  transform:scale(var(--aif-label-preview-scale));
  transform-origin:top left;
}
${WAREHOUSE_LABEL_SHEET_CSS}
@media print {
  @page { size:210mm 297mm; margin:0; }
  html, body {
    width:210mm !important;
    margin:0 !important;
    padding:0 !important;
    background:#fff !important;
  }
  main {
    width:210mm !important;
    min-height:0 !important;
    margin:0 !important;
    padding:0 !important;
    background:#fff !important;
  }
  .aifWarehouseScreenContent {
    display:block !important;
    width:210mm !important;
    max-width:none !important;
    margin:0 !important;
    padding:0 !important;
    background:#fff !important;
  }
  .aifWarehouseScreenContent > :not(.aifWarehouseLabelPrintRoot) {
    display:none !important;
  }
  .aifWarehouseLabelPrintRoot {
    display:block !important;
    position:static !important;
    width:210mm !important;
    margin:0 !important;
    padding:0 !important;
    background:#ffffff !important;
    color:#111111 !important;
  }
  .aifWarehouseLabelPrintPage {
    height:auto !important;
    min-height:0 !important;
    overflow:visible !important;
    box-shadow:none !important;
  }
}
`;

const WAREHOUSE_LABEL_PRINT_DOCUMENT_CSS = `
@page { size:210mm 297mm; margin:0; }
html, body {
  margin:0;
  padding:0;
  background:#fff;
  color:#111;
  overflow:visible;
}
.aifWarehouseLabelPrintRoot {
  display:block;
  width:210mm;
  margin:0;
  padding:0;
  background:#fff;
  color:#111;
  overflow:visible;
}
${WAREHOUSE_LABEL_SHEET_CSS}
.aifWarehouseLabelPrintPage {
  min-height:0 !important;
  height:auto !important;
  overflow:visible !important;
  box-shadow:none !important;
}
`;

const WAREHOUSE_CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function labelCleanInternalCode(input: unknown) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function labelCleanText(input: unknown, max = 120) {
  return String(input ?? "").replace(/[<>]/g, "").slice(0, max);
}

function labelEscapeHtml(input: unknown) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function labelShortHashCode(input: string, length = 7) {
  const source = String(input || `${Date.now()}-${Math.random()}`);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(length, "0").slice(-length);
}

function labelMakeInternalCode(seed = "", parts: unknown[] = []) {
  const source = [seed, ...parts]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("|");
  return labelCleanInternalCode(`AIF${labelShortHashCode(source)}`);
}

function labelInt(v: unknown, fallback: number, min: number, max: number) {
  const n = Number.parseInt(String(v ?? "").replace(",", "."), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function labelMm(v: unknown, fallback: number, min: number, max: number) {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function labelPriceParts(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { major: "", cents: "" };
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return { major: raw, cents: "" };
  const [major, cents] = n.toFixed(2).split(".");
  return { major, cents };
}

type WarehouseLabelPrintDocumentOptions = {
  labelContent: Record<WarehouseLabelContentKey, boolean>;
  labelCompanyName: string;
  labelCurrency: string;
  labelUnitText: string;
  labelShowBorder: boolean;
};

type WarehouseLabelPrintDocumentLayout = {
  labelW: number;
  labelH: number;
  labelColCount: number;
  labelRowCount: number;
  labelMarginXmm: number;
  labelMarginYmm: number;
};

function warehouseLabelContentHtml(label: WarehouseLabelPrintItem, options: WarehouseLabelPrintDocumentOptions) {
  const priceParts = labelPriceParts(label.price);
  const html: string[] = [];

  if (options.labelContent.company && options.labelCompanyName) {
    html.push(`<div class="aifWhLabelCompany">${labelEscapeHtml(labelCleanText(options.labelCompanyName, 48))}</div>`);
  }
  if (options.labelContent.brand && label.brand && label.brand !== "-") {
    html.push(`<div class="aifWhLabelBrand">${labelEscapeHtml(labelCleanText(label.brand, 42))}</div>`);
  }
  if (options.labelContent.title) {
    html.push(`<div class="aifWhLabelTitle">${labelEscapeHtml(labelCleanText(label.title || "Produs", 72))}</div>`);
  }
  if (options.labelContent.sizeColor && (label.size || label.color)) {
    const meta: string[] = [];
    if (label.size && label.size !== "-") meta.push(`<span>${labelEscapeHtml(labelCleanText(label.size, 16))}</span>`);
    if (label.color && label.color !== "-") meta.push(`<span>${labelEscapeHtml(labelCleanText(label.color, 24))}</span>`);
    if (meta.length) html.push(`<div class="aifWhLabelMeta">${meta.join("")}</div>`);
  }
  if (options.labelContent.barcode) {
    html.push(`<div class="aifWhBarcodeSvgWrap">${label.render.ok ? label.render.svg : ""}</div>`);
  }
  if (options.labelContent.description && label.description) {
    html.push(`<div class="aifWhLabelDescription">${labelEscapeHtml(labelCleanText(label.description, 90))}</div>`);
  }
  if (options.labelContent.category && label.category && label.category !== "-") {
    html.push(`<div class="aifWhLabelCategory">${labelEscapeHtml(labelCleanText(label.category, 34))}</div>`);
  }
  if (options.labelContent.code && (label.productCode || label.barcode)) {
    html.push(`<div class="aifWhLabelCode">Cod: ${labelEscapeHtml(labelCleanText(label.productCode || label.barcode, 44))}</div>`);
  }
  if (options.labelContent.price && priceParts.major) {
    html.push(
      `<div class="aifWhLabelPrice"><span class="aifWhPriceMajor">${labelEscapeHtml(priceParts.major)}</span>${
        priceParts.cents ? `<span class="aifWhPriceCents">${labelEscapeHtml(priceParts.cents)}</span>` : ""
      }<span class="aifWhPriceUnit">${labelEscapeHtml(labelCleanText(options.labelUnitText || options.labelCurrency, 12))}</span></div>`
    );
  }

  return html.join("");
}

function warehouseLabelPrintStyleString(layout: WarehouseLabelPrintDocumentLayout) {
  return [
    `--aif-label-w:${layout.labelW}mm`,
    `--aif-label-h:${layout.labelH}mm`,
    `--aif-label-cols:${layout.labelColCount}`,
    `--aif-label-rows:${layout.labelRowCount}`,
    `--aif-label-margin-x:${layout.labelMarginXmm}mm`,
    `--aif-label-margin-y:${layout.labelMarginYmm}mm`,
  ].join(";");
}

function warehouseLabelPrintDocumentHtml(
  pages: WarehouseLabelPrintItem[][],
  options: WarehouseLabelPrintDocumentOptions,
  layout: WarehouseLabelPrintDocumentLayout,
) {
  const rootStyle = warehouseLabelPrintStyleString(layout);
  const pagesHtml = pages
    .map((page) => {
      const labelsHtml = page
        .map((label) => `<div class="aifWarehousePrintLabel ${options.labelShowBorder ? "" : "noBorder"}">${warehouseLabelContentHtml(label, options)}</div>`)
        .join("");
      return `<div class="aifWarehouseLabelPrintPage">${labelsHtml}</div>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${labelEscapeHtml("AllInFashion címke nyomtatás")}</title><style>${WAREHOUSE_LABEL_PRINT_DOCUMENT_CSS}</style></head><body><div class="aifWarehouseLabelPrintRoot" style="${rootStyle}">${pagesHtml}</div></body></html>`;
}

function warehouseTransferDateTime(input: Date | string | number = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function warehouseStockTransferPrintDocumentHtml(options: {
  title: string;
  note?: string;
  createdAt: string;
  lines: StockTransferPrintLine[];
}) {
  const totalQty = options.lines.reduce((sum, line) => sum + line.qty, 0);
  const rowsHtml = options.lines.map((line) => {
    const imageHtml = line.imageUrl
      ? `<img class="aifTransferImg" src="${labelEscapeHtml(line.imageUrl)}" alt="" />`
      : `<div class="aifTransferImg empty"></div>`;
    return `
      <tr>
        <td class="center">${line.index}</td>
        <td>
          <div class="productCell">
            ${imageHtml}
            <div>
              <strong>${labelEscapeHtml(line.title)}</strong>
              <small>${labelEscapeHtml([line.brand, line.category, line.color, line.size].filter(Boolean).join(" • "))}</small>
              <small>Vonalkód: ${labelEscapeHtml(line.barcode || "-")}</small>
            </div>
          </div>
        </td>
        <td>${labelEscapeHtml(line.fromLocation)}</td>
        <td>${labelEscapeHtml(line.toLocation)}</td>
        <td class="qty">${line.qty}</td>
      </tr>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${labelEscapeHtml(options.title || "Készlet átadási lista")}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #fff; }
    .header { display: flex; justify-content: space-between; gap: 18px; border-bottom: 2px solid #2a8d8b; padding-bottom: 10px; margin-bottom: 14px; }
    .brand { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #2a8d8b; font-weight: 700; }
    h1 { margin: 4px 0 0; font-size: 22px; line-height: 1.18; }
    .meta { text-align: right; font-size: 12px; color: #4b5563; line-height: 1.55; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0 14px; }
    .summary div { border: 1px solid #d1d5db; border-radius: 10px; padding: 8px 10px; font-size: 12px; }
    .summary strong { display: block; margin-top: 3px; font-size: 18px; color: #111827; }
    .note { border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 10px; margin-bottom: 14px; font-size: 12px; color: #374151; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { background: #233047; color: white; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; padding: 8px 6px; text-align: left; }
    td { border-bottom: 1px solid #d1d5db; padding: 7px 6px; font-size: 12px; vertical-align: middle; }
    th:nth-child(1), td:nth-child(1) { width: 9mm; }
    th:nth-child(3), td:nth-child(3), th:nth-child(4), td:nth-child(4) { width: 35mm; }
    th:nth-child(5), td:nth-child(5) { width: 15mm; }
    .center { text-align: center; }
    .qty { text-align: center; font-weight: 800; font-size: 16px; color: #2a8d8b; }
    .productCell { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .productCell strong { display: block; font-size: 12px; line-height: 1.2; }
    .productCell small { display: block; margin-top: 2px; color: #4b5563; font-size: 10px; line-height: 1.2; }
    .aifTransferImg { width: 34px; height: 42px; border: 1px solid #d1d5db; border-radius: 8px; object-fit: cover; background: #f3f4f6; flex: 0 0 auto; }
    .aifTransferImg.empty { display: inline-block; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20mm; page-break-inside: avoid; }
    .sig { border-top: 1px solid #111827; padding-top: 6px; text-align: center; font-size: 12px; color: #374151; }
    .footer { margin-top: 10px; font-size: 10px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <div><div class="brand">AllInFashion</div><h1>${labelEscapeHtml(options.title || "Készlet átadási lista")}</h1></div>
    <div class="meta">
      <div>Készült: <strong>${labelEscapeHtml(options.createdAt)}</strong></div>
      <div>Terméksorok: <strong>${options.lines.length}</strong></div>
      <div>Összes darab: <strong>${totalQty}</strong></div>
    </div>
  </div>
  <div class="summary">
    <div>Terméksor<strong>${options.lines.length}</strong></div>
    <div>Összes darab<strong>${totalQty}</strong></div>
    <div>Bizonylat típusa<strong>Készletmozgatás</strong></div>
  </div>
  ${options.note ? `<div class="note"><strong>Megjegyzés:</strong> ${labelEscapeHtml(options.note)}</div>` : ""}
  <table>
    <thead><tr><th>#</th><th>Termék</th><th>Honnan</th><th>Hová</th><th>Db</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="signatures">
    <div class="sig">Átadó</div>
    <div class="sig">Átvevő</div>
    <div class="sig">Ellenőrizte</div>
  </div>
  <div class="footer">A lista az AllInFashion raktármodulból készült.</div>
</body>
</html>`;
}

function labelCode128Svg(value: string, height = 62): WarehouseBarcodeRender {
  const code = String(value || "").trim();
  if (!code) return { ok: false, svg: "", width: 0, error: "A vonalkód mező üres." };

  const values: number[] = [];
  for (const ch of code) {
    const charCode = ch.charCodeAt(0);
    if (charCode < 32 || charCode > 127) {
      return {
        ok: false,
        svg: "",
        width: 0,
        error: "A Code128 csak latin betűket, számokat és egyszerű jeleket kezel.",
      };
    }
    values.push(charCode - 32);
  }

  const startB = 104;
  let checksum = startB;
  values.forEach((v, index) => {
    checksum += v * (index + 1);
  });
  checksum %= 103;

  const sequence = [startB, ...values, checksum, 106];
  const patterns = sequence.map((v) => WAREHOUSE_CODE128_PATTERNS[v]).filter(Boolean);
  const totalModules = patterns.reduce((sum, p) => sum + p.split("").reduce((a, n) => a + Number(n), 0), 0);
  const quiet = 10;
  const width = totalModules + quiet * 2;
  let x = quiet;
  const bars: string[] = [];

  for (const pattern of patterns) {
    let black = true;
    for (const digit of pattern) {
      const w = Number(digit);
      if (black) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}" />`);
      x += w;
      black = !black;
    }
  }

  const safeText = code.replace(/[<&>]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m] || m));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 18}" role="img" aria-label="Vonalkód ${safeText}"><rect width="${width}" height="${height + 18}" fill="#fff"/><g fill="#000">${bars.join("")}</g><text x="${width / 2}" y="${height + 13}" text-anchor="middle" font-family="Arial, sans-serif" font-size="8.5">${safeText}</text></svg>`;
  return { ok: true, svg, width };
}

function dateShort(v: unknown) {
  if (!v) return "-";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ro-RO");
}

function statusHu(value: unknown) {
  const raw = String(value ?? "active").trim().toLowerCase();
  if (raw === "active") return "aktív";
  if (raw === "draft") return "előkészítés";
  if (raw === "inactive") return "inaktív";
  if (raw === "archived") return "archivált";
  return raw || "ismeretlen";
}

function itemModelStatus(it: InventoryItem) {
  return String((it as any).model_status || "active").trim().toLowerCase();
}

function itemVariantStatus(it: InventoryItem) {
  return String((it as any).variant_status || (it as any).status || "active").trim().toLowerCase();
}

function isArchivedInventoryItem(it: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  if (!it) return false;
  const modelStatus = String((it as any).model_status || (it as any).modelStatus || "active").trim().toLowerCase();
  const variantStatus = String((it as any).variant_status || (it as any).variantStatus || (it as any).status || "active").trim().toLowerCase();
  return modelStatus === "archived" || variantStatus === "archived";
}

function needsWarehouseActivation(it: InventoryItem) {
  return itemModelStatus(it) !== "active" || itemVariantStatus(it) !== "active";
}

function isWarehouseVisibleInMainList(it: InventoryItem) {
  return !needsWarehouseActivation(it);
}

function hasMissingData(it: InventoryItem) {
  return !it.image_url || !visibleWarehouseBarcode(it) || !it.sell_price || !it.buy_price || !it.title_ro || !it.size || needsWarehouseActivation(it);
}

function missingLabels(it: InventoryItem) {
  const out = [];
  if (!it.image_url) out.push("kép");
  if (!visibleWarehouseBarcode(it)) out.push("vonalkód");
  if (!it.buy_price) out.push("vételár");
  if (!it.sell_price) out.push("eladási ár");
  if (!it.title_ro) out.push("név");
  if (!it.size) out.push("méret");
  const modelStatus = itemModelStatus(it);
  const variantStatus = itemVariantStatus(it);
  if (modelStatus !== "active") out.push(`modell még nem aktív (${statusHu(modelStatus)})`);
  if (variantStatus !== "active") out.push(`variáns még nem aktív (${statusHu(variantStatus)})`);
  return out;
}

function MissingDataIndicator({ item, openUp = false }: { item: InventoryItem; openUp?: boolean }) {
  const labels = missingLabels(item);
  if (!labels.length) {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#7bd7d4]/45 bg-[#2a8d8b] text-[11px] text-white shadow-[0_0_8px_rgba(42,141,139,0.22)]"
        title="Rendben"
        aria-label="Rendben"
      >
        ✓
      </span>
    );
  }
  const tooltipPosition = openUp ? "bottom-full mb-2" : "top-full mt-2";
  return (
    <span
      className="group relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-200/55 bg-amber-300 text-[12px] leading-none text-slate-900 shadow-[0_0_10px_rgba(251,191,36,0.28)]"
      tabIndex={0}
      aria-label={`Hiányzó adatok: ${labels.join(", ")}`}
    >
      !
      <span className={`pointer-events-none absolute right-0 z-40 hidden w-56 rounded-xl border border-amber-200/30 bg-[#202838] px-3 py-2 text-left text-[11px] leading-snug text-white shadow-2xl group-hover:block group-focus:block ${tooltipPosition}`}>
        <span className="block text-amber-100">Hiányzó adatok</span>
        <span className="mt-1 block text-white/78">{labels.join(", ")}</span>
      </span>
    </span>
  );
}

function normalizeSearch(v: unknown) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function splitCsv(v: unknown) {
  return String(v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isUuidLike(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}


function itemSnCod(it: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  return String(it?.sn_cod || it?.snCod || "").trim();
}

function itemCustomsTariffCode(it: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const attrs = (it?.attributes && typeof it.attributes === "object" ? it.attributes : {}) as Record<string, unknown>;
  return String(
    it?.customs_tariff_code ||
    it?.customsTariffCode ||
    it?.hs_code ||
    attrs.customsTariffCode ||
    attrs.customs_tariff_code ||
    attrs.hsCode ||
    attrs.hs_code ||
    attrs.tariffCode ||
    attrs.tariff_code ||
    ""
  ).trim();
}

function firstCsvText(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((x) => x.trim())
    .find(Boolean) || "";
}

function itemProductCode(it: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (it || {}) as Record<string, any>;
  const rawObj = source.raw && typeof source.raw === "object" ? source.raw as Record<string, any> : {};
  const nestedRaw = rawObj.raw && typeof rawObj.raw === "object" ? rawObj.raw as Record<string, any> : {};
  const normalized = source.normalized && typeof source.normalized === "object" ? source.normalized as Record<string, any> : {};
  const rawNormalized = rawObj.normalized && typeof rawObj.normalized === "object" ? rawObj.normalized as Record<string, any> : {};
  const direct = firstWarehouseText(
    source.supplier_product_code,
    source.supplierProductCode,
    source.product_code,
    source.productCode,
    source.import_supplier_product_code,
    source.importSupplierProductCode,
    source.supplierCode,
    normalized.supplierProductCode,
    normalized.supplier_product_code,
    normalized.productCode,
    normalized.product_code,
    rawNormalized.supplierProductCode,
    rawNormalized.supplier_product_code,
    rawNormalized.productCode,
    rawNormalized.product_code,
    rawObj.CODPRODUS,
    rawObj["COD PRODUS"],
    rawObj.CodProdus,
    nestedRaw.CODPRODUS,
    nestedRaw["COD PRODUS"],
    nestedRaw.CodProdus,
    firstCsvText(source.supplier_codes)
  );
  if (direct) return direct;
  const barcodeLikeProductCode = firstWarehouseText(source.display_barcode, source.barcode);
  const internal = String(source.internal_sku || source.internalSku || "").trim();
  if (barcodeLikeProductCode && barcodeLikeProductCode !== internal && !/^AIF[-_]/i.test(barcodeLikeProductCode) && /[-_/]/.test(barcodeLikeProductCode)) return barcodeLikeProductCode;
  const rawModel = String(source.model_code || source.modelCode || "").trim();
  if (!rawModel) return "";
  const lastPart = rawModel.includes(":") ? rawModel.split(":").pop() || rawModel : rawModel;
  return String(lastPart || rawModel).trim();
}

function visibleWarehouseBarcode(it: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (it || {}) as Record<string, any>;
  const raw = String(source.barcode || source.display_barcode || "").trim();
  if (!raw) return "";
  const internal = String(source.internal_sku || source.internalSku || "").trim();
  const productCode = itemProductCode(source);
  if (internal && raw === internal) return "";
  if (productCode && normalizeSearch(raw) === normalizeSearch(productCode)) return "";
  if (/^AIF[-_]/i.test(raw)) return "";
  return raw;
}

async function copyWarehouseCodeToClipboard(value: string) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Visszaesünk a régi másolási módszerre.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function supplierProductCodeFromDetail(d: DetailResponse | null | undefined) {
  const item = (d?.item || {}) as Record<string, any>;
  const supplierRows = Array.isArray(d?.supplierCodes) ? d!.supplierCodes : [];
  const active = supplierRows.find((row: any) => row && row.is_active !== false && String(row.supplier_product_code || "").trim());
  const anyRow = supplierRows.find((row: any) => row && String(row.supplier_product_code || "").trim());
  return firstWarehouseText(
    item.supplier_product_code,
    item.supplierProductCode,
    active?.supplier_product_code,
    anyRow?.supplier_product_code,
    item.model_code && String(item.model_code).includes(":") ? String(item.model_code).split(":").pop() : ""
  );
}

function VariantCodesTooltip({ item, openUp = false, buttonLabel = "Azonosítók", buttonClassName = "" }: { item: Partial<InventoryItem> & Record<string, any>; openUp?: boolean; buttonLabel?: React.ReactNode; buttonClassName?: string }) {
  const barcode = visibleWarehouseBarcode(item);
  const snCod = itemSnCod(item);
  const customsCode = itemCustomsTariffCode(item);
  const productCode = itemProductCode(item);
  const codeRows = [
    { key: "barcode", label: "Vonalkód / SKU", value: barcode },
    { key: "sn", label: "S/N/COD", value: snCod },
    { key: "tariff", label: "Vámtarifa kód", value: customsCode },
    { key: "product", label: "Termékkód", value: productCode },
  ];
  const hasAny = codeRows.some((row) => String(row.value || "").trim());
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});

  function updateTooltipPosition() {
    if (typeof window === "undefined") return;
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const tooltipWidth = 336;
    const sidePadding = 12;
    const left = Math.min(
      Math.max(sidePadding, rect.left + rect.width / 2 - tooltipWidth / 2),
      Math.max(sidePadding, window.innerWidth - tooltipWidth - sidePadding)
    );
    const shouldOpenUp = openUp || rect.bottom + 220 > window.innerHeight;
    setTooltipStyle({
      position: "fixed",
      left,
      top: shouldOpenUp ? rect.top - 8 : rect.bottom + 8,
      transform: shouldOpenUp ? "translateY(-100%)" : "none",
      width: tooltipWidth,
    });
  }

  function showTooltip() {
    updateTooltipPosition();
    setTooltipOpen(true);
  }

  function togglePinned(event?: React.MouseEvent<HTMLButtonElement>) {
    event?.stopPropagation();
    updateTooltipPosition();
    setCopiedKey("");
    setPinned((current) => {
      const next = !current;
      setTooltipOpen(next);
      return next;
    });
  }

  async function copyCode(rowKey: string, value: string) {
    const ok = await copyWarehouseCodeToClipboard(value);
    if (!ok) return;
    setCopiedKey(rowKey);
    window.setTimeout(() => setCopiedKey((current) => (current === rowKey ? "" : current)), 1200);
  }

  useEffect(() => {
    if (!tooltipOpen && !pinned) return;
    updateTooltipPosition();
    const onMove = () => updateTooltipPosition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [tooltipOpen, pinned, openUp]);

  useEffect(() => {
    if (!pinned) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPinned(false);
      setTooltipOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pinned]);

  const tooltip = (
    <div
      className={`${pinned ? "pointer-events-auto" : "pointer-events-none"} z-[9999] rounded-2xl border border-[#5bd0cc]/35 bg-[#202838] p-2.5 text-left text-[11px] leading-snug text-white shadow-2xl shadow-black/35`}
      style={tooltipStyle}
      role="tooltip"
      onMouseEnter={() => pinned && setTooltipOpen(true)}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div>
          <span className="block text-[#cffffd]">Termékazonosítók</span>
          <span className="block text-[10px] text-white/45">Kattintás: fixálás, újabb kattintás: elengedés.</span>
        </div>
        {pinned && <span className="rounded-full border border-[#5bd0cc]/30 bg-[#2a8d8b]/22 px-2 py-0.5 text-[10px] text-[#cffffd]">fix</span>}
      </div>
      <div className="space-y-1.5">
        {codeRows.map((row) => {
          const value = String(row.value || "").trim();
          return (
            <div key={row.key} className="grid grid-cols-[96px,1fr,64px] items-center gap-2 rounded-xl bg-white/[0.06] px-2 py-1.5">
              <span className="min-w-0 truncate text-white/62">{row.label}</span>
              <span className="min-w-0 truncate text-right tabular-nums text-white" title={value || "-"}>{value || "-"}</span>
              <button
                type="button"
                disabled={!value}
                className="h-6 rounded-lg border border-white/12 bg-white/[0.08] px-2 text-[10px] text-white/78 transition hover:border-[#5bd0cc]/35 hover:bg-[#2a8d8b]/22 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                onClick={(event) => {
                  event.stopPropagation();
                  void copyCode(row.key, value);
                }}
              >
                {copiedKey === row.key ? "Másolva" : "Copy"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  const open = tooltipOpen || pinned;

  return (
    <>
      <span className="relative inline-flex shrink-0 justify-center whitespace-nowrap align-middle">
        <button
          ref={buttonRef}
          type="button"
          className={buttonClassName || `inline-flex h-6 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2 text-[10px] transition focus:outline-none focus:ring-2 focus:ring-[#2a8d8b]/45 ${pinned ? "border-amber-200/50 bg-amber-300/15 text-amber-50" : hasAny ? "border-[#5bd0cc]/35 bg-[#203f49] text-[#cffffd] hover:bg-[#25535c]" : "border-white/12 bg-white/[0.06] text-white/45"}`}
          aria-label={pinned ? "Termékazonosítók elengedése" : "Termékazonosítók megjelenítése"}
          title={pinned ? "Fix tooltip kikapcsolása" : "Kattintásra fix, újabb kattintásra elenged"}
          onMouseEnter={() => !pinned && showTooltip()}
          onMouseLeave={() => !pinned && setTooltipOpen(false)}
          onFocus={() => !pinned && showTooltip()}
          onBlur={() => !pinned && setTooltipOpen(false)}
          onClick={togglePinned}
        >
          {buttonLabel}
        </button>
      </span>
      {open && typeof document !== "undefined" ? createPortal(tooltip, document.body) : null}
    </>
  );
}

function itemMatchesScannedBarcode(it: InventoryItem, scannedBarcode: unknown) {
  const q = normalizeSearch(cleanScannedBarcode(scannedBarcode));
  if (!q) return false;
  const values = [
    it.barcode,
    it.sn_cod,
    it.snCod,
    it.internal_sku,
    it.model_code,
    itemProductCode(it),
    it.supplier_product_code,
    it.supplierProductCode,
    it.product_code,
    it.productCode,
    it.supplier_codes,
    ...splitCsv(it.supplier_codes),
    ...(it.suppliers || []).flatMap((s) => [s.code, s.name]),
  ];
  return values.map((value) => normalizeSearch(cleanScannedBarcode(value))).some((value) => value === q);
}

const COLOR_RO_MAP: Record<string, string> = {
  black: "negru", schwarz: "negru", nero: "negru", noir: "negru", fekete: "negru", negru: "negru",
  white: "alb", weiss: "alb", weiß: "alb", blanco: "alb", bianco: "alb", feher: "alb", fehér: "alb", alb: "alb",
  red: "roșu", rot: "roșu", rosso: "roșu", rojo: "roșu", piros: "roșu", rosu: "roșu", roșu: "roșu",
  blue: "albastru", blau: "albastru", bleu: "albastru", blu: "albastru", albastru: "albastru", kek: "albastru", kék: "albastru",
  "dark blue": "bleumarin", navy: "bleumarin", marine: "bleumarin", bleumarin: "bleumarin", sotetkek: "bleumarin", "sotet kek": "bleumarin", "sötét kék": "bleumarin",
  green: "verde", grun: "verde", grün: "verde", verde: "verde", zold: "verde", zöld: "verde",
  yellow: "galben", gelb: "galben", giallo: "galben", galben: "galben", sarga: "galben", sárga: "galben",
  grey: "gri", gray: "gri", grau: "gri", gri: "gri", szurke: "gri", szürke: "gri",
  orange: "portocaliu", portocaliu: "portocaliu", narancs: "portocaliu",
  brown: "maro", braun: "maro", marrone: "maro", maro: "maro", barna: "maro",
  beige: "bej", bej: "bej", bezs: "bej", bézs: "bej",
  purple: "mov", violet: "mov", lila: "mov", mov: "mov",
  pink: "roz", rosa: "roz", roz: "roz",
  gold: "auriu", golden: "auriu", auriu: "auriu", arany: "auriu",
  silver: "argintiu", silber: "argintiu", argintiu: "argintiu", ezust: "argintiu", ezüst: "argintiu",
  cream: "crem", crem: "crem", ivory: "fildeș", fildes: "fildeș",
  turquoise: "turcoaz", turkis: "turcoaz", türkis: "turcoaz", turcoaz: "turcoaz",
  khaki: "kaki", kaki: "kaki",
  multi: "multicolor", multicolor: "multicolor", multicolour: "multicolor",
};

function colorKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function officialColorRo(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = colorKey(raw);
  if (COLOR_RO_MAP[key]) return COLOR_RO_MAP[key];
  const parts = key.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const translated = parts.map((part) => COLOR_RO_MAP[part]).filter(Boolean);
    if (translated.length === parts.length) return Array.from(new Set(translated)).join(" / ");
  }
  return raw;
}

function officialColorFromTypes(value: unknown, colors: ColorType[]) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = colorKey(raw);
  const found = (colors || []).find((c) => {
    const aliases = Array.isArray(c.aliases) ? c.aliases : [];
    return [c.code, c.name_ro, c.name_hu, c.name_en, c.name_de, ...aliases]
      .filter(Boolean)
      .some((x) => colorKey(x) === key);
  });
  if (found?.name_ro) return found.name_ro;

  const parts = key.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const translated = parts.map((part) => {
      const c = (colors || []).find((row) => {
        const aliases = Array.isArray(row.aliases) ? row.aliases : [];
        return [row.code, row.name_ro, row.name_hu, row.name_en, row.name_de, ...aliases]
          .filter(Boolean)
          .some((x) => colorKey(x) === part);
      });
      return c?.name_ro || COLOR_RO_MAP[part];
    }).filter(Boolean);
    if (translated.length === parts.length) return Array.from(new Set(translated)).join(" / ");
  }

  return officialColorRo(raw);
}

function displayColorName(value: unknown, fallback?: unknown) {
  return officialColorRo(value) || String(fallback || "").trim() || "-";
}

function colorTypeValues(c?: Partial<ColorType> | null) {
  if (!c) return [];
  return [c.id, c.code, c.name_ro, c.name_hu, c.name_en, c.name_de, ...(Array.isArray(c.aliases) ? c.aliases : [])]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function findColorTypeByValue(colors: ColorType[], value: unknown) {
  const key = colorKey(value);
  if (!key) return null;
  return (colors || []).find((c) => colorTypeValues(c).some((candidate) => colorKey(candidate) === key)) || null;
}

function itemMatchesColorSelection(it: Partial<InventoryItem> | Record<string, any>, selectedValue: unknown, colors: ColorType[]) {
  const selectedKey = colorKey(selectedValue);
  if (!selectedKey || selectedKey === "all") return true;
  const selectedColor = findColorTypeByValue(colors, selectedValue);
  const allowed = new Set([selectedKey, ...colorTypeValues(selectedColor).map(colorKey)].filter(Boolean));
  const itemValues = [
    it.color_name,
    it.color_code,
    officialColorFromTypes(it.color_name, colors),
    officialColorFromTypes(it.color_code, colors),
  ].map(colorKey).filter(Boolean);
  return itemValues.some((value) => allowed.has(value));
}

function officialSizeFromTypes(value: unknown, sizes: SizeType[]) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = colorKey(raw);
  const found = (sizes || []).find((s) => {
    const aliases = Array.isArray(s.aliases) ? s.aliases : [];
    return [s.code, s.name, s.name_hu, ...aliases]
      .filter(Boolean)
      .some((x) => colorKey(x) === key);
  });
  return found?.name || raw.toUpperCase();
}

function sizeTypeLabel(s?: SizeType | null) {
  if (!s) return "-";
  return s.name_hu || s.name || s.code || "-";
}

function categoryLabel(c: MetaItem) {
  return c.name_hu || c.name_ro || c.name || c.code || "-";
}

function compactWarehouseLocationName(loc?: Partial<MetaItem> | null, maxLength = 24) {
  const raw = String(loc?.name || loc?.code || "Hely").replace(/\s+/g, " ").trim();
  if (!raw) return "Hely";
  const compact = raw
    .replace(/^\s*(magazin|raktár|raktar|warehouse|store)\s*[-–—:]\s*/i, "")
    .replace(/^\s*(depozit|depot)\s*[-–—:]\s*/i, "Dep. ")
    .replace(/\bMiercurea\s+Ciuc\b/gi, "M. Ciuc")
    .replace(/\bT[aâ]rgu\s+Secuiesc\b/gi, "Tg. Secuiesc")
    .replace(/\s+/g, " ")
    .trim() || raw;
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function categoryParentId(c?: Partial<MetaItem> | null) {
  return String(c?.parent_id || (c as any)?.parentId || "").trim();
}

function isSubCategory(c?: Partial<MetaItem> | null) {
  return Boolean(categoryParentId(c));
}



function categoryValueMatches(c: MetaItem | null | undefined, value: unknown) {
  const key = normalizeSearch(value);
  if (!c || !key) return false;
  return [c.id, c.code, c.name, c.name_ro, c.name_hu].map(normalizeSearch).some((x) => x === key);
}

function metaSelectionKeys(row?: Partial<MetaItem> | null) {
  if (!row) return [];
  return [row.id, row.code, row.name, row.name_ro, row.name_hu, ...(Array.isArray(row.aliases) ? row.aliases : [])]
    .map(normalizeSearch)
    .filter(Boolean);
}

function itemMatchesMetaSelection(values: unknown[], selectedValue: unknown, metaRows: MetaItem[]) {
  const selectedKey = normalizeSearch(selectedValue);
  if (!selectedKey || selectedKey === "all") return true;
  const selectedMeta = metaRows.find((row) => metaSelectionKeys(row).includes(selectedKey));
  const allowed = new Set([selectedKey, ...metaSelectionKeys(selectedMeta)]);
  return values.map(normalizeSearch).filter(Boolean).some((value) => allowed.has(value));
}

function itemMainCategoryLabel(it: Partial<InventoryItem> | Record<string, any>) {
  return firstWarehouseText(it.category_name_hu, it.category_name_ro, it.category_code) || "-";
}

function itemSubCategoryLabel(it: Partial<InventoryItem> | Record<string, any>) {
  return firstWarehouseText(it.subcategory_name_hu, it.subcategory_name_ro, it.subcategory_code, it.product_type);
}

function itemMatchesMainCategory(it: InventoryItem, selectedValue: unknown, categoryRows: MetaItem[]) {
  return itemMatchesMetaSelection([it.category_code, it.category_name_ro, it.category_name_hu], selectedValue, categoryRows);
}

function itemMatchesSubCategory(it: InventoryItem, selectedValue: unknown, subCategoryRows: MetaItem[]) {
  return itemMatchesMetaSelection([it.subcategory_id, it.subcategory_code, it.subcategory_name_ro, it.subcategory_name_hu, it.product_type], selectedValue, subCategoryRows);
}

function modelStatusNeedsAttention(it: InventoryItem) {
  return itemModelStatus(it) !== "active";
}

function ModelStatusBadge({ item, compact = false }: { item: InventoryItem; compact?: boolean }) {
  const status = itemModelStatus(item);
  if (status === "active") return null;
  return (
    <span
      className={`${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"} inline-flex shrink-0 items-center rounded-full border border-red-300/35 bg-red-500/15 font-medium text-red-50`}
      title={`Modell állapot: ${statusHu(status)}`}
    >
      Modell nem aktív: {statusHu(status)}
    </span>
  );
}

function genderLabel(code: unknown, items: GenderType[]) {
  const key = normalizeSearch(code);
  return items.find((g) => normalizeSearch(g.code) === key)?.name || String(code || "-");
}

function itemSupplierText(it: InventoryItem) {
  if (it.supplier_names) return it.supplier_names;
  const names = (it.suppliers || []).map((s) => s.name).filter(Boolean) as string[];
  return names.length ? names.join(", ") : "-";
}

function supplierMatches(it: InventoryItem, selected: string) {
  if (selected === "all") return true;
  const key = normalizeSearch(selected);
  const values = [
    ...splitCsv(it.supplier_ids),
    ...splitCsv(it.supplier_codes),
    ...splitCsv(it.supplier_names),
    ...(it.suppliers || []).flatMap((s) => [s.id, s.code, s.name]),
  ].map(normalizeSearch);
  return values.some((x) => x === key);
}

function itemMatchesSearch(it: InventoryItem, query: string) {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = [
    it.title_ro,
    it.title_hu,
    it.brand_name,
    it.brand_code,
    itemSupplierText(it),
    it.supplier_codes,
    it.internal_sku,
    it.barcode,
    it.sn_cod,
    it.snCod,
    itemCustomsTariffCode(it),
    it.model_code,
    it.category_name_ro,
    it.category_name_hu,
    it.color_name,
    it.color_code,
    it.size,
  ].map(normalizeSearch).join(" ");
  return haystack.includes(q);
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const method = String(options?.method || "GET").toUpperCase();
  const res = await fetch(url, {
    credentials: "include",
    cache: method === "GET" ? "no-store" : "default",
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiInventory() {
  const qs = new URLSearchParams();
  qs.set("limit", "5000");
  qs.set("_", String(Date.now()));
  return fetchJSON<{ items: InventoryItem[] }>(`/api/aif/inventory?${qs.toString()}`);
}

async function apiMeta() {
  return fetchJSON<{ suppliers: MetaItem[]; brands: MetaItem[]; categories: MetaItem[]; genderTypes?: GenderType[]; colorTypes?: ColorType[]; brandColorCodes?: BrandColorCode[]; materialTypes?: MaterialType[]; sizeTypes?: SizeType[]; brandSizeCodes?: BrandSizeCode[]; locations: MetaItem[]; supplierBrands?: SupplierBrandLink[] }>("/api/aif/meta");
}

async function apiStock() {
  return fetchJSON<{ items: StockItem[] }>(`/api/aif/stock?_=${Date.now()}`);
}

async function apiIncomingStockMovements(limit = 300) {
  const qs = new URLSearchParams();
  qs.set("direction", "in");
  qs.set("limit", String(limit));
  qs.set("_", String(Date.now()));
  return fetchJSON<{ items: Array<Record<string, any>>; totals?: Record<string, any> }>(`/api/aif/stock-movements?${qs.toString()}`);
}

async function apiImportBatches(limit = 20) {
  return fetchJSON<{ items: Array<Record<string, any>> }>(`/api/aif/import-batches?limit=${encodeURIComponent(String(limit))}&_=${Date.now()}`);
}

async function apiImportBatchDetail(batchId: string) {
  return fetchJSON<{ batch: Record<string, any>; rows: Array<Record<string, any>> }>(`/api/aif/import-batches/${encodeURIComponent(batchId)}`);
}

async function apiImportBatchInventory(batchId: string) {
  return fetchJSON<{ ok?: boolean; batch?: Record<string, any>; batchId?: string; items?: InventoryItem[]; rows?: Array<Record<string, any>>; variantIds?: string[]; rowCount?: number; totalQty?: number }>(`/api/aif/import-batches/${encodeURIComponent(batchId)}/inventory`);
}

async function apiVariantDetail(id: string) {
  return fetchJSON<DetailResponse>(`/api/aif/variants/${encodeURIComponent(id)}`);
}

async function apiVariantUpdate(id: string, payload: Record<string, unknown>) {
  return fetchJSON<{ ok: true }>(`/api/aif/variants/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiCreateManualProduct(payload: Record<string, unknown>) {
  return fetchJSON<{ ok: true; variantId: string; modelId?: string | null; qty?: number; stockRows?: Array<Record<string, unknown>>; stock?: StockItem[] }>("/api/aif/manual-products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiVariantDelete(id: string) {
  return fetchJSON<{ ok: true; mode?: string; usage?: Record<string, unknown> }>(`/api/aif/variants/${encodeURIComponent(id)}?force=1&_=${Date.now()}`, { method: "DELETE" });
}

async function apiVariantStockUpdate(
  id: string,
  rows: Array<{ locationId?: string; locationCode?: string; qty: number | string; reservedQty?: number | string }>,
  options?: { mode?: "redistribute" | "correction"; allowTotalChange?: boolean }
) {
  return fetchJSON<{ ok: true; changed?: number; beforeTotal?: number; afterTotal?: number; totalDelta?: number; mode?: string; stock: StockItem[] }>(`/api/aif/variants/${encodeURIComponent(id)}/stock`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, mode: options?.mode || "redistribute", allowTotalChange: Boolean(options?.allowTotalChange) }),
  });
}

async function apiStockTransfer(payload: {
  title?: string;
  note?: string;
  lines: Array<{ variantId: string; fromLocationId: string; toLocationId: string; qty: number }>;
}) {
  return fetchJSON<{ ok: true; transferId: string; movedLines?: number; movedRows?: number; lineCount?: number; movedQty?: number; totalQty?: number; items?: any[] }>("/api/aif/stock-transfers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiSelectedVariantSelection() {
  return fetchJSON<{ items: PersistedSelectedWorkItem[] }>("/api/aif/selection");
}

async function apiSaveSelectedVariantSelection(items: Array<{ variantId: string; action?: SelectedWorkAction | null }>) {
  return fetchJSON<{ ok: true; count: number; items?: PersistedSelectedWorkItem[]; owner?: string }>("/api/aif/selection", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

async function apiClearSelectedVariantSelection() {
  return fetchJSON<{ ok: true; count?: number; owner?: string }>("/api/aif/selection", { method: "DELETE" });
}


async function apiSaveCategory(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/categories/${encodeURIComponent(id)}` : "/api/aif/categories";
  return fetchJSON<{ item: MetaItem }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteCategory(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiSaveGenderType(code: string, payload: Record<string, unknown>) {
  const url = code ? `/api/aif/gender-types/${encodeURIComponent(code)}` : "/api/aif/gender-types";
  return fetchJSON<{ item: GenderType }>(url, {
    method: code ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteGenderType(code: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/gender-types/${encodeURIComponent(code)}`, { method: "DELETE" });
}

async function apiSaveColorType(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/color-types/${encodeURIComponent(id)}` : "/api/aif/color-types";
  return fetchJSON<{ item: ColorType }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteColorType(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/color-types/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiSaveBrandColorCode(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/brand-color-codes/${encodeURIComponent(id)}` : "/api/aif/brand-color-codes";
  return fetchJSON<{ item: BrandColorCode }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteBrandColorCode(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/brand-color-codes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiListBrandColorCodes() {
  return fetchJSON<{ items: BrandColorCode[] }>("/api/aif/brand-color-codes");
}

async function apiSaveMaterialType(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/material-types/${encodeURIComponent(id)}` : "/api/aif/material-types";
  return fetchJSON<{ item: MaterialType }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteMaterialType(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/material-types/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiSaveSizeType(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/size-types/${encodeURIComponent(id)}` : "/api/aif/size-types";
  return fetchJSON<{ item: SizeType }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteSizeType(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/size-types/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiSaveBrandSizeCode(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/brand-size-codes/${encodeURIComponent(id)}` : "/api/aif/brand-size-codes";
  return fetchJSON<{ item: BrandSizeCode }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteBrandSizeCode(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/brand-size-codes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiListBrandSizeCodes() {
  return fetchJSON<{ items: BrandSizeCode[] }>("/api/aif/brand-size-codes");
}

async function uploadImage(file: File, variantId: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", `products/${variantId}`);
  fd.append("name", file.name);
  return fetchJSON<{ key: string; url: string }>("/api/uploads/r2", { method: "POST", body: fd });
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

function emptyNewProductForm(): NewProductForm {
  return {
    ...emptyForm(),
    supplierId: "",
    supplierProductCode: "",
    supplierVariantCode: "",
    supplierColorCode: "",
    supplierSize: "",
  };
}

function formFromDetail(d: DetailResponse): EditForm {
  const x = d.item || {};
  return {
    titleRo: x.title_ro || "",
    titleHu: x.title_hu || "",
    descriptionRo: x.description_ro || "",
    gender: x.gender || "unisex",
    productType: x.product_type || "",
    season: x.season || "",
    material: x.material || "",
    shopifyTitle: x.shopify_title || "",
    modelStatus: x.model_status || "active",
    brandCode: x.brand_code || "",
    categoryCode: x.category_code || "",
    subCategoryCode: x.subcategory_code || x.subCategoryCode || "",
    barcode: visibleWarehouseBarcode(x),
    supplierProductCode: supplierProductCodeFromDetail(d),
    snCod: x.sn_cod || x.snCod || "",
    customsTariffCode: itemCustomsTariffCode(x),
    colorCode: x.color_code || "",
    colorName: officialColorRo(x.color_name || ""),
    size: x.size || "",
    buyPrice: x.buy_price == null ? "" : String(x.buy_price),
    sellPrice: x.sell_price == null ? "" : String(x.sell_price),
    compareAtPrice: x.compare_at_price == null ? "" : String(x.compare_at_price),
    imageUrl: x.image_url || "",
    variantStatus: x.status || "active",
  };
}

const editFormComparableKeys: Array<keyof EditForm> = [
  "titleRo",
  "titleHu",
  "descriptionRo",
  "gender",
  "productType",
  "season",
  "material",
  "shopifyTitle",
  "modelStatus",
  "brandCode",
  "categoryCode",
  "subCategoryCode",
  "barcode",
  "supplierProductCode",
  "snCod",
  "customsTariffCode",
  "colorCode",
  "colorName",
  "size",
  "buyPrice",
  "sellPrice",
  "compareAtPrice",
  "imageUrl",
  "variantStatus",
];

function cleanEditComparableValue(value: unknown) {
  return String(value ?? "").trim();
}

function editFormsEqual(a: EditForm, b: EditForm) {
  return editFormComparableKeys.every((key) => cleanEditComparableValue(a[key]) === cleanEditComparableValue(b[key]));
}


function nextSortOrder(rows: Array<{ sort_order?: number | string | null }>) {
  return String(rows.length + 1);
}

function overviewOpenByDefault() {
  // A raktári Áttekintés induljon csukva, hogy a terméklista gyorsabban elérhető legyen.
  return false;
}

export default function AllInWarehouse() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stockRows, setStockRows] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers] = useState<MetaItem[]>([]);
  const [brands, setBrands] = useState<MetaItem[]>([]);
  const [supplierBrands, setSupplierBrands] = useState<SupplierBrandLink[]>([]);
  const [categories, setCategories] = useState<MetaItem[]>([]);
  const [genderTypes, setGenderTypes] = useState<GenderType[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [brandSizeCodes, setBrandSizeCodes] = useState<BrandSizeCode[]>([]);
  const [colorTypes, setColorTypes] = useState<ColorType[]>([]);
  const [brandColorCodes, setBrandColorCodes] = useState<BrandColorCode[]>([]);
  const [locations, setLocations] = useState<MetaItem[]>([]);
  const [search, setSearch] = useState("");
  const [snCodFilter, setSnCodFilter] = useState("");
  const [scannedBarcodeSearch, setScannedBarcodeSearch] = useState("");
  const [supplier, setSupplier] = useState("all");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");
  const [subCategory, setSubCategory] = useState("all");
  const [gender, setGender] = useState("all");
  const [color, setColor] = useState("all");
  const [colorFilterOpen, setColorFilterOpen] = useState(false);
  const colorFilterRef = useRef<HTMLDivElement | null>(null);
  const [location, setLocation] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(() => overviewOpenByDefault());
  const [listOpen, setListOpen] = useState(true);
  const [buyPricesVisible, setBuyPricesVisible] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(WAREHOUSE_PRODUCTS_PER_PAGE);
  const [busy, setBusy] = useState(false);
  const [recentImportFocusBusy, setRecentImportFocusBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [edit, setEdit] = useState<EditForm>(emptyForm());
  const [editBaseline, setEditBaseline] = useState<EditForm>(emptyForm());
  const [detailBusy, setDetailBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProductForm>(() => emptyNewProductForm());
  const [newProductStockRows, setNewProductStockRows] = useState<Record<string, string>>({});
  const [newProductSaving, setNewProductSaving] = useState(false);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [taxonomyTab, setTaxonomyTab] = useState<"categories" | "subCategories" | "genders" | "colors" | "brandColors" | "materials" | "sizes" | "brandSizes">("categories");
  const [taxonomyBusy, setTaxonomyBusy] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ id: "", parentId: "", nameRo: "", nameHu: "", aliases: "", sortOrder: "10" });
  const [subCategoryForm, setSubCategoryForm] = useState({ id: "", parentId: "", nameRo: "", nameHu: "", aliases: "", sortOrder: "10" });
  const [genderForm, setGenderForm] = useState({ code: "", name: "", aliases: "", sortOrder: "10" });
  const [colorForm, setColorForm] = useState({ id: "", nameRo: "", nameHu: "", nameEn: "", nameDe: "", aliases: "", hex: "", sortOrder: "10" });
  const [brandColorForm, setBrandColorForm] = useState({ id: "", brandId: "", colorCode: "", colorTypeId: "", notes: "" });
  const [materialForm, setMaterialForm] = useState({ id: "", nameRo: "", nameHu: "", nameEn: "", nameDe: "", aliases: "", sortOrder: "10" });
  const [sizeForm, setSizeForm] = useState({ id: "", code: "", name: "", nameHu: "", aliases: "", sortOrder: "10" });
  const [brandSizeForm, setBrandSizeForm] = useState({ id: "", brandId: "", sizeCode: "", sizeTypeId: "", notes: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "category" | "subCategory" | "gender" | "color" | "brandColor" | "material" | "size" | "brandSize"; id: string; name: string } | null>(null);
  const [openTaxonomyMenu, setOpenTaxonomyMenu] = useState<string | null>(null);
  const [productDeleteTarget, setProductDeleteTarget] = useState<InventoryItem | null>(null);
  const [stockEditorTarget, setStockEditorTarget] = useState<InventoryItem | null>(null);
  const [stockEditorRows, setStockEditorRows] = useState<Record<string, string>>({});
  const [stockEditorSaving, setStockEditorSaving] = useState(false);
  const [stockEditorAllowTotalChange, setStockEditorAllowTotalChange] = useState(false);
  const [stockEditorWarning, setStockEditorWarning] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, boolean>>(() => readSavedSelectedVariants());
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(false);
  const [selectedWorkActions, setSelectedWorkActions] = useState<Record<string, SelectedWorkAction>>(() => readSavedSelectedVariantActions());
  const [persistedSelectedItems, setPersistedSelectedItems] = useState<InventoryItem[]>([]);
  const [selectedActionTarget, setSelectedActionTarget] = useState<InventoryItem | null>(null);
  const [selectedWorkPanel, setSelectedWorkPanel] = useState<SelectedWorkAction | null>(null);
  const [stockMoveRows, setStockMoveRows] = useState<Record<string, StockTransferDraftRow>>({});
  const [stockMoveNote, setStockMoveNote] = useState("");
  const [stockMoveDocumentTitle, setStockMoveDocumentTitle] = useState("Készlet átadási lista");
  const [stockMoveBulkFrom, setStockMoveBulkFrom] = useState("");
  const [stockMoveBulkTo, setStockMoveBulkTo] = useState("");
  const [stockMoveConfirmOpen, setStockMoveConfirmOpen] = useState(false);
  const [stockMoveSaving, setStockMoveSaving] = useState(false);
  const [labelComposerOpen, setLabelComposerOpen] = useState(false);
  const [labelCopies, setLabelCopies] = useState<Record<string, string>>({});
  const [labelWidth, setLabelWidth] = useState("40");
  const [labelHeight, setLabelHeight] = useState("46");
  const [labelCols, setLabelCols] = useState("5");
  const [labelRows, setLabelRows] = useState("6");
  const [labelMarginX, setLabelMarginX] = useState("5");
  const [labelMarginY, setLabelMarginY] = useState("5");
  const [labelShowBorder, setLabelShowBorder] = useState(true);
  const [labelCompanyName, setLabelCompanyName] = useState(WAREHOUSE_LABEL_COMPANY);
  const [labelCurrency, setLabelCurrency] = useState("RON");
  const [labelUnitText, setLabelUnitText] = useState("RON");
  const [labelContent, setLabelContent] = useState<Record<WarehouseLabelContentKey, boolean>>(WAREHOUSE_LABEL_DEFAULT_CONTENT);
  const [labelTemplateName, setLabelTemplateName] = useState("Standard 40x46");
  const [labelTemplates, setLabelTemplates] = useState<WarehouseLabelTemplate[]>(() => readWarehouseLabelTemplates());
  const [labelDetailMap, setLabelDetailMap] = useState<Record<string, DetailResponse>>({});
  const [labelDetailsBusy, setLabelDetailsBusy] = useState(false);
  const [barcodeScanner, setBarcodeScanner] = useState<BarcodeScannerSession | null>(null);
  const [barcodeScannerStatus, setBarcodeScannerStatus] = useState("");
  const [barcodeScannerManualValue, setBarcodeScannerManualValue] = useState("");
  const barcodeVideoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeStreamRef = useRef<MediaStream | null>(null);
  const barcodeZxingControlsRef = useRef<WarehouseZxingControls | null>(null);
  const barcodeScanRafRef = useRef<number | null>(null);
  const barcodeScannerHandlingRef = useRef(false);
  const selectedSyncReadyRef = useRef(false);
  const selectedSyncTimerRef = useRef<number | null>(null);
  const selectedSyncSilentRef = useRef(false);
  const [pendingProductJumpId, setPendingProductJumpId] = useState("");
  const [highlightProductId, setHighlightProductId] = useState("");
  const [incomingFocus, setIncomingFocus] = useState<{ batchId: string; variantIds: string[]; rows: Array<Record<string, any>>; batch?: Record<string, any> | null; totalQty?: number; sourceFileName?: string | null; mode?: "import" | "activation" } | null>(null);
  const [incomingFocusItems, setIncomingFocusItems] = useState<InventoryItem[]>([]);
  const productListRef = useRef<HTMLElement | null>(null);

  const incomingFocusVariantIdsKey = useMemo(() => (incomingFocus?.variantIds || []).join("|"), [incomingFocus]);
  const incomingFocusVariantSet = useMemo(() => new Set(incomingFocus?.variantIds || []), [incomingFocusVariantIdsKey]);

  const inventoryDisplayItems = useMemo(() => {
    const baseItems = items.filter((item) => !isArchivedInventoryItem(item));
    const focusedItems = incomingFocusItems.filter((item) => !isArchivedInventoryItem(item));
    return focusedItems.length ? mergeInventoryItems(baseItems, focusedItems).filter((item) => !isArchivedInventoryItem(item)) : baseItems;
  }, [items, incomingFocusItems]);

  const stockMap = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    for (const s of stockRows) {
      const id = String(s.variant_id || "");
      if (!id) continue;
      const arr = map.get(id) || [];
      arr.push(s);
      map.set(id, arr);
    }
    return map;
  }, [stockRows]);

  const stockLocationRows = useMemo(() => {
    return locations
      .filter((l) => l.is_active !== false)
      .slice()
      .sort((a, b) => String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""), "hu", { sensitivity: "base" }));
  }, [locations]);

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
    return rows.find((s) =>
      (lid && String(s.location_id || "") === lid) ||
      (lcode && String(s.location_code || "") === lcode) ||
      (lname && String(s.location_name || "") === lname)
    ) || null;
  }

  async function loadIncomingFocusBatch(batchId: string, showMessage = true, mode: "import" | "activation" = "import") {
    const cleanBatchId = String(batchId || "").trim();
    if (!cleanBatchId || !isUuidLike(cleanBatchId)) return null;
    try {
      let detail: { batch?: Record<string, any> | null; rows: Array<Record<string, any>>; items?: InventoryItem[]; variantIds?: string[]; rowCount?: number; totalQty?: number };
      try {
        const focused = await apiImportBatchInventory(cleanBatchId);
        detail = {
          batch: focused.batch || null,
          rows: Array.isArray(focused.rows) ? focused.rows : Array.isArray(focused.items) ? (focused.items as any[]) : [],
          items: focused.items || [],
          variantIds: focused.variantIds || [],
          rowCount: focused.rowCount,
          totalQty: focused.totalQty,
        };
      } catch {
        const fallback = await apiImportBatchDetail(cleanBatchId);
        detail = { batch: fallback.batch || null, rows: Array.isArray(fallback.rows) ? fallback.rows : [] };
      }

      const rows = (Array.isArray(detail.rows) ? detail.rows : []).filter((row: any) => {
        const variantStatus = String(row.variant_status || row.status || "").trim().toLowerCase();
        const modelStatus = String(row.model_status || "").trim().toLowerCase();
        return variantStatus !== "archived" && modelStatus !== "archived";
      });
      const rawFocusedItems = [
        ...rows,
        ...((detail.items || []) as any[]).filter((row: any) => {
          const variantStatus = String(row.variant_status || row.status || "").trim().toLowerCase();
          const modelStatus = String(row.model_status || "").trim().toLowerCase();
          return variantStatus !== "archived" && modelStatus !== "archived";
        }),
      ];
      const normalizedFocusedItems = rawFocusedItems
        .map((rawItem) => importFocusRowToInventoryItem(rawItem))
        .filter((item): item is InventoryItem => Boolean(item) && itemVariantStatus(item as InventoryItem) !== "archived" && itemModelStatus(item as InventoryItem) !== "archived");
      const focusedItemMap = normalizedFocusedItems.reduce<Map<string, InventoryItem>>((map, rawItem) => {
        const anyRawItem = rawItem as InventoryItem & Record<string, any>;
        const variantId = String(anyRawItem?.variant_id || anyRawItem?.variantId || anyRawItem?.selected_variant_id || anyRawItem?.selectedVariantId || "").trim();
        if (!variantId) return map;
        const previous = map.get(variantId) || ({ variant_id: variantId } as InventoryItem);
        map.set(variantId, { ...previous, ...rawItem, variant_id: variantId } as InventoryItem);
        return map;
      }, new Map<string, InventoryItem>());
      const focusedItems = Array.from(focusedItemMap.values()).filter((item) =>
        itemModelStatus(item) !== "archived" && itemVariantStatus(item) !== "archived"
      );
      const focusedItemIds = new Set(focusedItems.map((item) => String(item.variant_id || "").trim()).filter(Boolean));
      const visibleRows = rows.filter((row) => {
        const variantId = String(row.variant_id || row.variantId || "").trim();
        if (!variantId) return false;
        if (focusedItemIds.has(variantId)) return true;
        const variantStatus = String(row.variant_status || row.variantStatus || row.status || "active").toLowerCase();
        const modelStatus = String(row.model_status || row.modelStatus || "active").toLowerCase();
        return variantStatus !== "archived" && modelStatus !== "archived";
      });
      const variantIds = Array.from(new Set([
        ...(Array.isArray(detail.variantIds) ? detail.variantIds : []),
        ...visibleRows.map((row) => String(row.variant_id || row.variantId || "").trim()),
        ...focusedItems.map((item) => String(item.variant_id || "").trim()),
      ].map((id) => String(id || "").trim()).filter((id) => Boolean(id) && (!focusedItemIds.size || focusedItemIds.has(id)))));
      const committedRows = visibleRows.filter((row) => String(row.import_status || row.row_status || row.status || "committed").toLowerCase() === "committed").length || Number(detail.rowCount || 0) || variantIds.length;
      const totalQty = Number(visibleRows.reduce((sum, row: any) => sum + n(row.import_qty || row.qty), 0) || focusedItems.reduce((sum, item: any) => sum + n(item.import_qty || item.total_qty), 0) || 0);
      setIncomingFocusItems(focusedItems);
      setIncomingFocus({
        batchId: cleanBatchId,
        variantIds,
        rows: visibleRows,
        batch: detail.batch || null,
        totalQty,
        sourceFileName: String(detail.batch?.source_file_name || detail.batch?.sourceFileName || "").trim() || null,
        mode,
      });
      setProductPage(1);
      setListOpen(true);
      setSortMode("incoming_desc");
      if (showMessage) {
        setMessage(`Utolsó bevételezés szűrő aktív: ${visibleRows.length || variantIds.length} import sor, ${committedRows} készleten, ${variantIds.length} raktári variáns${totalQty ? `, ${totalQty} db` : ""}. A raktár most pontosan ennek az importnak a variánsait mutatja, ugyanazokat, amiket az Incoming és a Mozgásnapló is lát.`);
      }
      return { rows: visibleRows, variantIds, batch: detail.batch || null, totalQty };
    } catch (error: any) {
      setIncomingFocus(null);
      setIncomingFocusItems([]);
      setMessage(error?.message || "Az utolsó bevételezés terméksorait nem sikerült betölteni.");
      return null;
    }
  }

  function removeVariantFromWarehouseClientState(variantId: unknown) {
    const id = String(variantId || "").trim();
    if (!id) return;

    setItems((current) => current.filter((item) => selectedVariantIdFromItem(item) !== id));
    setIncomingFocusItems((current) => current.filter((item) => selectedVariantIdFromItem(item) !== id));
    setPersistedSelectedItems((current) => current.filter((item) => selectedVariantIdFromItem(item) !== id));
    setStockRows((current) => current.filter((row) => String(row.variant_id || "") !== id));
    setSelectedVariants((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSelectedWorkActions((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setIncomingFocus((current) => {
      if (!current) return current;
      const variantIds = (current.variantIds || []).filter((variantId) => String(variantId || "") !== id);
      const rows = (current.rows || []).filter((row: any) => String(row.variant_id || row.variantId || "") !== id);
      return { ...current, variantIds, rows };
    });
    setHighlightProductId((current) => current === id ? "" : current);
    setPendingProductJumpId((current) => current === id ? "" : current);
  }


  function applyIncomingMovementFocus(focus: WarehouseIncomingMovementFocus, showMessage = true) {
    const rows = focus.rows || [];
    const variantIds = focus.variantIds || [];
    const sourceLabel = focus.sourceFileName || focus.sourceId || "legutóbbi készletmozgás";
    setIncomingFocusItems(focus.items || []);
    setIncomingFocus({
      batchId: focus.sourceId,
      variantIds,
      rows,
      batch: { id: focus.sourceId, source_file_name: sourceLabel, committed_at: focus.createdAt || null, source: "stock_movements" },
      totalQty: focus.totalQty,
      sourceFileName: sourceLabel,
    });
    setProductPage(1);
    setListOpen(true);
    setSortMode("incoming_desc");
    if (showMessage) {
      setMessage(`Utolsó bevételezés a mozgásnaplóból: ${rows.length} mozgássor, ${variantIds.length} raktári variáns${focus.totalQty ? `, ${focus.totalQty} db` : ""}.`);
    }
  }

  async function latestIncomingMovementFocus() {
    const movementData = await apiIncomingStockMovements(400);
    return latestWarehouseImportMovementFocus(movementData.items || []);
  }

  async function focusLatestCommittedImportBatch() {
    setBusy(true);
    setRecentImportFocusBusy(true);
    setMessage("");
    try {
      resetWarehouseFilters(false);
      setSortMode("incoming_desc");
      setFiltersOpen(false);
      setSummaryOpen(false);
      setListOpen(true);
      await load();

      const movementFocus = await latestIncomingMovementFocus().catch(() => null);
      const movementVariantCount = movementFocus?.variantIds?.length || 0;
      const movementRowCount = movementFocus?.rows?.length || 0;
      const movementSourceId = firstWarehouseText(movementFocus?.sourceId);

      let loadedFromBatch: { rows: Array<Record<string, any>>; variantIds: string[]; batch?: Record<string, any> | null; totalQty?: number } | null = null;
      if (movementSourceId && isUuidLike(movementSourceId)) {
        loadedFromBatch = await loadIncomingFocusBatch(movementSourceId, false);
      }

      if (movementFocus && (!loadedFromBatch || (loadedFromBatch.variantIds?.length || 0) < movementVariantCount || (loadedFromBatch.rows?.length || 0) < movementRowCount)) {
        applyIncomingMovementFocus(movementFocus, true);
        return;
      }

      if (loadedFromBatch) {
        const totalQty = Number(loadedFromBatch.totalQty || 0);
        setMessage(`Utolsó bevételezés aktív: ${loadedFromBatch.rows.length || loadedFromBatch.variantIds.length} import sor, ${loadedFromBatch.variantIds.length} raktári variáns${totalQty ? `, ${totalQty} db` : ""}. A lista most ezt az importot mutatja, nem valami félreértett teendőlistát.`);
        return;
      }

      const batches = await apiImportBatches(25);
      const latest = (batches.items || []).find((batch) => String(batch.status || "").toLowerCase() === "committed") || (batches.items || [])[0];
      const latestId = String(latest?.id || "").trim();
      if (!latestId) {
        setIncomingFocus(null);
        setIncomingFocusItems([]);
        setMessage("Nincs készletre vett import vagy bejövő készletmozgás, amit meg tudnék mutatni.");
        return;
      }
      await loadIncomingFocusBatch(latestId, true);
    } catch (error: any) {
      setMessage(error?.message || "A legutóbbi bevételezés betöltése nem sikerült.");
    } finally {
      setRecentImportFocusBusy(false);
      setBusy(false);
    }
  }

  function stockBackedInventoryItems(inventoryItems: InventoryItem[], stockItems: StockItem[]) {
    type StockAggregate = {
      item: InventoryItem;
      totalQty: number;
      reservedQty: number;
      availableQty: number;
      updatedAt: string;
    };

    const nonEmpty = (...values: unknown[]) => {
      for (const value of values) {
        const text = String(value ?? "").trim();
        if (text) return text;
      }
      return "";
    };

    const aggregates = new Map<string, StockAggregate>();

    for (const row of stockItems || []) {
      const source = row as StockItem & Partial<InventoryItem> & Record<string, any>;
      const variantId = String(source.variant_id || "").trim();
      if (!variantId) continue;
      const current = aggregates.get(variantId) || {
        item: {
          variant_id: variantId,
          internal_sku: source.internal_sku || null,
          barcode: nonEmpty(source.barcode, source.display_barcode) || null,
          supplier_product_code: nonEmpty(source.supplier_product_code, source.supplierProductCode, source.product_code, source.productCode, firstCsvText(source.supplier_codes)) || null,
          supplierProductCode: nonEmpty(source.supplierProductCode, source.supplier_product_code, source.productCode, source.product_code, firstCsvText(source.supplier_codes)) || null,
          sn_cod: nonEmpty(source.sn_cod, source.snCod) || null,
          snCod: nonEmpty(source.sn_cod, source.snCod) || null,
          customs_tariff_code: nonEmpty(source.customs_tariff_code, source.customsTariffCode, source.hs_code) || null,
          customsTariffCode: nonEmpty(source.customs_tariff_code, source.customsTariffCode, source.hs_code) || null,
          attributes: source.attributes || source.variant_attributes || null,
          image_url: source.image_url || null,
          brand_name: source.brand_name || null,
          brand_code: source.brand_code || null,
          supplier_names: source.supplier_names || null,
          supplier_codes: source.supplier_codes || null,
          supplier_ids: source.supplier_ids || null,
          suppliers: source.suppliers || null,
          model_id: source.model_id || null,
          model_code: source.model_code || null,
          title_ro: source.title_ro || null,
          title_hu: source.title_hu || null,
          description_ro: source.description_ro || null,
          shopify_title: source.shopify_title || null,
          gender: source.gender || null,
          product_type: source.product_type || null,
          season: source.season || null,
          material: source.material || null,
          model_status: source.model_status || "active",
          category_code: source.category_code || null,
          category_name_ro: source.category_name_ro || null,
          category_name_hu: source.category_name_hu || null,
          color_code: source.color_code || null,
          color_name: source.color_name || null,
          color_hex: source.color_hex || null,
          size: source.size || null,
          buy_price: source.buy_price ?? null,
          sell_price: source.sell_price ?? null,
          compare_at_price: source.compare_at_price ?? null,
          variant_status: source.variant_status || source.status || "active",
          total_qty: 0,
          total_reserved_qty: 0,
          available_qty: 0,
          last_stock_movement_at: source.updated_at || null,
          last_incoming_at: source.last_incoming_at || null,
        },
        totalQty: 0,
        reservedQty: 0,
        availableQty: 0,
        updatedAt: "",
      };

      current.totalQty += n(source.qty);
      current.reservedQty += n(source.reserved_qty);
      current.availableQty += source.available_qty !== undefined && source.available_qty !== null ? n(source.available_qty) : Math.max(0, n(source.qty) - n(source.reserved_qty));
      const updatedAt = String(source.updated_at || source.last_stock_movement_at || "");
      if (updatedAt && (!current.updatedAt || new Date(updatedAt).getTime() > new Date(current.updatedAt).getTime())) current.updatedAt = updatedAt;

      current.item = {
        ...current.item,
        internal_sku: current.item.internal_sku || source.internal_sku || null,
        barcode: current.item.barcode || nonEmpty(source.barcode, source.display_barcode) || null,
        supplier_product_code: current.item.supplier_product_code || nonEmpty(source.supplier_product_code, source.supplierProductCode, source.product_code, source.productCode, firstCsvText(source.supplier_codes)) || null,
        supplierProductCode: current.item.supplierProductCode || nonEmpty(source.supplierProductCode, source.supplier_product_code, source.productCode, source.product_code, firstCsvText(source.supplier_codes)) || null,
        sn_cod: current.item.sn_cod || nonEmpty(source.sn_cod, source.snCod) || null,
        snCod: current.item.snCod || nonEmpty(source.sn_cod, source.snCod) || null,
        customs_tariff_code: current.item.customs_tariff_code || nonEmpty(source.customs_tariff_code, source.customsTariffCode, source.hs_code) || null,
        customsTariffCode: current.item.customsTariffCode || nonEmpty(source.customs_tariff_code, source.customsTariffCode, source.hs_code) || null,
        attributes: current.item.attributes || source.attributes || source.variant_attributes || null,
        image_url: current.item.image_url || source.image_url || null,
        brand_name: current.item.brand_name || source.brand_name || null,
        brand_code: current.item.brand_code || source.brand_code || null,
        model_id: current.item.model_id || source.model_id || null,
        model_code: current.item.model_code || source.model_code || null,
        title_ro: current.item.title_ro || source.title_ro || null,
        title_hu: current.item.title_hu || source.title_hu || null,
        description_ro: current.item.description_ro || source.description_ro || null,
        shopify_title: current.item.shopify_title || source.shopify_title || null,
        gender: current.item.gender || source.gender || null,
        product_type: current.item.product_type || source.product_type || null,
        season: current.item.season || source.season || null,
        material: current.item.material || source.material || null,
        model_status: current.item.model_status || source.model_status || "active",
        category_code: current.item.category_code || source.category_code || null,
        category_name_ro: current.item.category_name_ro || source.category_name_ro || null,
        category_name_hu: current.item.category_name_hu || source.category_name_hu || null,
        color_code: current.item.color_code || source.color_code || null,
        color_name: current.item.color_name || source.color_name || null,
        color_hex: current.item.color_hex || source.color_hex || null,
        size: current.item.size || source.size || null,
        buy_price: current.item.buy_price ?? source.buy_price ?? null,
        sell_price: current.item.sell_price ?? source.sell_price ?? null,
        compare_at_price: current.item.compare_at_price ?? source.compare_at_price ?? null,
        variant_status: current.item.variant_status || source.variant_status || source.status || "active",
      };

      aggregates.set(variantId, current);
    }

    const out = new Map<string, InventoryItem>();
    for (const item of inventoryItems || []) {
      const variantId = selectedVariantIdFromItem(item);
      if (!variantId) continue;
      const aggregate = aggregates.get(variantId);
      if (aggregate) {
        out.set(variantId, {
          ...aggregate.item,
          ...item,
          variant_id: variantId,
          barcode: item.barcode || aggregate.item.barcode || null,
          supplier_product_code: item.supplier_product_code || item.supplierProductCode || aggregate.item.supplier_product_code || aggregate.item.supplierProductCode || firstCsvText(item.supplier_codes) || firstCsvText(aggregate.item.supplier_codes) || null,
          supplierProductCode: item.supplierProductCode || item.supplier_product_code || aggregate.item.supplierProductCode || aggregate.item.supplier_product_code || firstCsvText(item.supplier_codes) || firstCsvText(aggregate.item.supplier_codes) || null,
          sn_cod: item.sn_cod || item.snCod || aggregate.item.sn_cod || aggregate.item.snCod || null,
          snCod: item.snCod || item.sn_cod || aggregate.item.snCod || aggregate.item.sn_cod || null,
          customs_tariff_code: itemCustomsTariffCode(item) || itemCustomsTariffCode(aggregate.item) || null,
          customsTariffCode: itemCustomsTariffCode(item) || itemCustomsTariffCode(aggregate.item) || null,
          attributes: item.attributes || aggregate.item.attributes || null,
          image_url: item.image_url || aggregate.item.image_url || null,
          total_qty: aggregate.totalQty,
          total_reserved_qty: aggregate.reservedQty,
          available_qty: aggregate.availableQty,
          last_stock_movement_at: item.last_stock_movement_at || aggregate.updatedAt || aggregate.item.last_stock_movement_at || null,
        });
      } else {
        out.set(variantId, { ...item, variant_id: variantId });
      }
    }

    for (const [variantId, aggregate] of aggregates.entries()) {
      if (out.has(variantId)) continue;
      out.set(variantId, {
        ...aggregate.item,
        variant_id: variantId,
        total_qty: aggregate.totalQty,
        total_reserved_qty: aggregate.reservedQty,
        available_qty: aggregate.availableQty,
        last_stock_movement_at: aggregate.updatedAt || aggregate.item.last_stock_movement_at || null,
      });
    }

    return Array.from(out.values());
  }

  function openStockEditor(item: InventoryItem) {
    const rows = stockRowsForVariant(item.variant_id);
    const next: Record<string, string> = {};
    for (const loc of stockLocationRows) {
      const row = stockForLocation(rows, loc);
      next[locationKey(loc)] = String(n(row?.qty));
    }
    setStockEditorTarget(item);
    setStockEditorRows(next);
    setStockEditorAllowTotalChange(false);
    setStockEditorWarning("");
  }

  function closeStockEditor() {
    if (stockEditorSaving) return;
    setStockEditorTarget(null);
    setStockEditorRows({});
    setStockEditorAllowTotalChange(false);
    setStockEditorWarning("");
  }

  function stockEditorReservedQty(location: MetaItem) {
    if (!stockEditorTarget?.variant_id) return 0;
    const current = stockForLocation(stockRowsForVariant(stockEditorTarget.variant_id), location);
    return Math.max(0, Math.floor(n(current?.reserved_qty)));
  }

  function stockEditorOriginalQty(location: MetaItem) {
    if (!stockEditorTarget?.variant_id) return 0;
    const current = stockForLocation(stockRowsForVariant(stockEditorTarget.variant_id), location);
    return Math.max(0, Math.floor(n(current?.qty)));
  }

  function stockEditorOriginalTotal() {
    if (!stockEditorTarget?.variant_id) return 0;
    return stockLocationRows.reduce((sum, loc) => sum + stockEditorOriginalQty(loc), 0);
  }

  function stockEditorDraftTotal(rows: Record<string, string> = stockEditorRows) {
    return stockLocationRows.reduce((sum, loc) => {
      const key = locationKey(loc);
      const reserved = stockEditorReservedQty(loc);
      return sum + Math.max(reserved, Math.floor(n(rows[key])));
    }, 0);
  }

  function stockEditorTotalDelta() {
    return stockEditorDraftTotal() - stockEditorOriginalTotal();
  }

  function stockEditorCanSave() {
    return stockEditorAllowTotalChange || stockEditorTotalDelta() === 0;
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

  function setStockEditorQty(location: MetaItem, value: number) {
    const key = locationKey(location);
    const minQty = stockEditorReservedQty(location);
    const nextQty = Math.max(minQty, Math.floor(Number.isFinite(value) ? value : 0));
    const next = { ...stockEditorRows, [key]: String(nextQty) };
    setStockEditorRows(next);
    const delta = stockEditorDraftTotal(next) - stockEditorOriginalTotal();
    if (!stockEditorAllowTotalChange && delta !== 0) {
      setStockEditorWarning("A teljes készlet megváltozna. Mozgatás módban ugyanannyi darabnak kell maradnia, vagy kapcsold be a készletkorrekció módot.");
    } else if (stockEditorAllowTotalChange && delta !== 0) {
      setStockEditorWarning(`Készletkorrekció mód: a teljes készlet ${delta > 0 ? "+" : ""}${delta} db-bal változik.`);
    } else {
      setStockEditorWarning("");
    }
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
          const qty = Math.max(stockEditorReservedQty(loc), Math.floor(n(next[locKey])));
          const reserved = stockEditorReservedQty(loc);
          return { loc, key: locKey, qty, reserved, movable: Math.max(0, qty - reserved) };
        })
        .filter((x) => x.movable > 0)
        .sort((a, b) => b.movable - a.movable);

      for (const donor of donors) {
        if (need <= 0) break;
        const take = Math.min(need, donor.movable);
        next[donor.key] = String(donor.qty - take);
        need -= take;
      }

      const moved = effectiveDelta - need;
      if (moved <= 0) {
        setStockEditorWarning("Nincs máshol elérhető készlet, amit át lehetne mozgatni. Új áruhoz kapcsold be a készletkorrekció módot.");
        return;
      }
      next[key] = String(currentQty + moved);
      setStockEditorRows(next);
      setStockEditorWarning(need > 0
        ? `Csak ${moved} db-ot tudtam áttenni, mert máshol nincs több szabad készlet.`
        : "Átvezettem a darabot másik célhelyről, így a teljes készlet nem változott.");
      return;
    }

    next[key] = String(wantedQty);
    const receiver = preferredStockReceiverLocation(key, next);
    if (receiver) {
      const receiverKey = locationKey(receiver);
      const receiverQty = Math.max(stockEditorReservedQty(receiver), Math.floor(n(next[receiverKey])));
      next[receiverKey] = String(receiverQty + Math.abs(effectiveDelta));
      setStockEditorRows(next);
      setStockEditorWarning("A csökkentett darabot áttettem a fő/legnagyobb készletű célhelyre, így a teljes készlet nem változott.");
    } else {
      setStockEditorRows(next);
      setStockEditorWarning("A teljes készlet csökkenne. Törés/készletkorrekció esetén kapcsold be a készletkorrekció módot.");
    }
  }

  function findBrandCodeForName(name?: string | null) {
    const needle = normalizeSearch(name || "");
    if (!needle) return "";
    const found = brands.find((b) => normalizeSearch(b.name || b.code || "") === needle || normalizeSearch(b.code || "") === needle);
    return found ? String(found.code || found.id || "") : "";
  }

  async function saveStockEditor() {
    if (!stockEditorTarget?.variant_id) return;
    const beforeTotal = stockEditorOriginalTotal();
    const afterTotal = stockEditorDraftTotal();
    const totalDelta = afterTotal - beforeTotal;
    if (!stockEditorAllowTotalChange && totalDelta !== 0) {
      setStockEditorWarning("Mozgatás módban a teljes készlet nem változhat. A + gombbal automatikusan másik helyről vezetjük át, új áruhoz pedig kapcsold be a készletkorrekció módot.");
      return;
    }

    setStockEditorSaving(true);
    setMessage("");
    try {
      const rows = stockLocationRows.map((loc) => {
        const key = locationKey(loc);
        const reservedQty = stockEditorReservedQty(loc);
        const qty = Math.max(reservedQty, Math.floor(n(stockEditorRows[key])));
        return {
          locationId: String(loc.id || ""),
          locationCode: String(loc.code || ""),
          qty,
          reservedQty,
        };
      });
      const changedVariantId = String(stockEditorTarget.variant_id || "");
      await apiVariantStockUpdate(changedVariantId, rows, {
        mode: stockEditorAllowTotalChange ? "correction" : "redistribute",
        allowTotalChange: stockEditorAllowTotalChange,
      });
      notifyStockMovesChanged({ variantId: changedVariantId, source: stockEditorAllowTotalChange ? "warehouse_stock_correction" : "warehouse_stock_redistribution" });
      await load();
      if (detail?.item?.id && String(detail.item.id) === String(stockEditorTarget.variant_id)) {
        const d = await apiVariantDetail(stockEditorTarget.variant_id);
        setDetail(d);
        setEdit(formFromDetail(d));
      }
      setMessage(stockEditorAllowTotalChange
        ? `Készletkorrekció mentve. Teljes változás: ${totalDelta > 0 ? "+" : ""}${totalDelta} db.`
        : "Készlet áthelyezés mentve, a teljes darabszám nem változott.");
      setStockEditorTarget(null);
      setStockEditorRows({});
      setStockEditorAllowTotalChange(false);
      setStockEditorWarning("");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a készletet.");
    } finally {
      setStockEditorSaving(false);
    }
  }

  function StockQtyButton({ item, openUp = false }: { item: InventoryItem; openUp?: boolean }) {
    const rows = stockRowsForVariant(item.variant_id)
      .slice()
      .sort((a, b) => String(a.location_name || a.location_code || "Célhely").localeCompare(String(b.location_name || b.location_code || "Célhely"), "hu", { sensitivity: "base" }));
    const knownRows = stockLocationRows.map((loc) => {
      const row = stockForLocation(rows, loc);
      return {
        key: locationKey(loc),
        name: String(loc.name || loc.code || row?.location_name || row?.location_code || "Célhely"),
        qty: Math.floor(n(row?.qty)),
        reservedQty: Math.floor(n(row?.reserved_qty)),
      };
    });
    const extraRows = rows
      .filter((row) => !stockLocationRows.some((loc) => Boolean(stockForLocation([row], loc))))
      .map((row, rowIndex) => ({
        key: `extra-${row.location_id || row.location_code || row.location_name || rowIndex}`,
        name: String(row.location_name || row.location_code || "Célhely"),
        qty: Math.floor(n(row.qty)),
        reservedQty: Math.floor(n(row.reserved_qty)),
      }));
    const tooltipRows = [...knownRows, ...extraRows].filter((row) => row.name.trim());
    const activePlaceCount = tooltipRows.filter((row) => row.qty > 0).length;
    const tooltipPosition = openUp ? "bottom-full mb-2" : "top-full mt-2";

    return (
      <span className="group relative inline-flex shrink-0 justify-center align-middle whitespace-nowrap">
        <button
          className="inline-flex h-8 min-w-[86px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border border-[#5bd0cc]/45 bg-gradient-to-r from-[#173f49] to-[#246965] px-2 text-center text-xs text-white shadow-[0_0_0_1px_rgba(42,141,139,0.14),0_8px_18px_rgba(15,23,42,0.18)] transition hover:border-[#9cf4f0]/70 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#2a8d8b]/45"
          onClick={() => openStockEditor(item)}
          aria-label={`Készlet üzletenként. Összesen: ${n(item.total_qty)}. Kattints a módosításhoz.`}
          type="button"
        >
          <span className="text-sm font-semibold tabular-nums leading-none">{n(item.total_qty)}</span>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-[#2a8d8b]/30 px-1.5 py-0.5 text-[10px] leading-none text-[#cffffd] group-hover:bg-[#2a8d8b]/45">
            {activePlaceCount || "0"} hely
          </span>
        </button>
        <span className={`pointer-events-none absolute left-1/2 z-[9999] hidden w-72 -translate-x-1/2 rounded-xl border border-[#5bd0cc]/30 bg-[#202838] px-3 py-2 text-left text-[11px] leading-snug text-white shadow-2xl group-hover:block group-focus-within:block ${tooltipPosition}`}>
          <span className="block text-[#cffffd]">Készlet üzletenként</span>
          <span className="mt-2 block space-y-1">
            {tooltipRows.length ? tooltipRows.map((row) => (
              <span key={row.key} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-2 py-1">
                <span className="min-w-0 truncate text-white/78">{row.name}</span>
                <span className="shrink-0 text-right tabular-nums text-white">
                  {row.qty} db
                  {row.reservedQty > 0 ? <span className="ml-1 text-white/48">/ foglalt {row.reservedQty}</span> : null}
                </span>
              </span>
            )) : (
              <span className="block rounded-lg bg-white/[0.06] px-2 py-1 text-white/68">Nincs készletadat üzletenként.</span>
            )}
          </span>
          <span className="mt-2 block border-t border-white/10 pt-1 text-[10px] text-white/45">Kattintás: készlet szerkesztése</span>
        </span>
      </span>
    );
  }

  const mainCategories = useMemo(() => categories.filter((c) => !String((c as any).parent_id || (c as any).parentId || "").trim()), [categories]);
  const subCategories = useMemo(() => categories.filter((c) => String((c as any).parent_id || (c as any).parentId || "").trim()), [categories]);
  const categorySelectOptions = mainCategories.length ? mainCategories : categories;
  const subCategoriesForValue = (categoryValue: unknown) => {
    if (!categoryValue) return subCategories;
    const parent = categorySelectOptions.find((c) => categoryValueMatches(c, categoryValue));
    if (!parent) return subCategories;
    return subCategories.filter((c) => categoryParentId(c) === String(parent.id));
  };
  const newProductSubCategoryOptions = useMemo(() => subCategoriesForValue(newProduct.categoryCode), [subCategories, categorySelectOptions, newProduct.categoryCode]);
  const editSubCategoryOptions = useMemo(() => subCategoriesForValue(edit.categoryCode), [subCategories, categorySelectOptions, edit.categoryCode]);
  const subCategoryFilterOptions = useMemo(() => {
    if (category === "all") return subCategories;
    const parent = categorySelectOptions.find((c) => categoryValueMatches(c, category));
    if (!parent) return subCategories;
    return subCategories.filter((c) => categoryParentId(c) === String(parent.id));
  }, [category, subCategories, categorySelectOptions]);
  const nextCategorySortOrder = useMemo(() => nextSortOrder(mainCategories.length ? mainCategories : categories), [mainCategories, categories]);
  const nextSubCategorySortOrder = useMemo(() => nextSortOrder(subCategories), [subCategories]);
  const subCategoryParentLabel = (row: MetaItem) => categoryLabel(mainCategories.find((c) => String(c.id) === String((row as any).parent_id || (row as any).parentId)) || categories.find((c) => String(c.id) === String((row as any).parent_id || (row as any).parentId)) || {} as MetaItem);
  const nextGenderSortOrder = useMemo(() => nextSortOrder(genderTypes), [genderTypes]);
  const nextColorSortOrder = useMemo(() => nextSortOrder(colorTypes), [colorTypes]);
  const nextMaterialSortOrder = useMemo(() => nextSortOrder(materialTypes), [materialTypes]);
  const nextSizeSortOrder = useMemo(() => nextSortOrder(sizeTypes), [sizeTypes]);

  useEffect(() => {
    if (!taxonomyOpen) return;
    if (taxonomyTab === "categories" && !categoryForm.id && !categoryForm.nameRo.trim() && !categoryForm.nameHu.trim() && !categoryForm.aliases.trim()) {
      setCategoryForm((x) => x.sortOrder === nextCategorySortOrder ? x : { ...x, sortOrder: nextCategorySortOrder, parentId: "" });
    }
    if (taxonomyTab === "subCategories" && !subCategoryForm.id && !subCategoryForm.nameRo.trim() && !subCategoryForm.nameHu.trim() && !subCategoryForm.aliases.trim()) {
      setSubCategoryForm((x) => x.sortOrder === nextSubCategorySortOrder ? x : { ...x, sortOrder: nextSubCategorySortOrder, parentId: x.parentId || mainCategories[0]?.id || "" });
    }
    if (taxonomyTab === "genders" && !genderForm.code && !genderForm.name.trim()) {
      setGenderForm((x) => x.sortOrder === nextGenderSortOrder ? x : { ...x, sortOrder: nextGenderSortOrder });
    }
    if (taxonomyTab === "colors" && !colorForm.id && !colorForm.nameRo.trim()) {
      setColorForm((x) => x.sortOrder === nextColorSortOrder ? x : { ...x, sortOrder: nextColorSortOrder });
    }
    if (taxonomyTab === "materials" && !materialForm.id && !materialForm.nameRo.trim()) {
      setMaterialForm((x) => x.sortOrder === nextMaterialSortOrder ? x : { ...x, sortOrder: nextMaterialSortOrder });
    }
    if (taxonomyTab === "sizes" && !sizeForm.id && !sizeForm.name.trim() && !sizeForm.nameHu.trim()) {
      setSizeForm((x) => x.sortOrder === nextSizeSortOrder ? x : { ...x, sortOrder: nextSizeSortOrder });
    }
  }, [
    taxonomyOpen,
    taxonomyTab,
    nextCategorySortOrder,
    nextSubCategorySortOrder,
    nextGenderSortOrder,
    nextColorSortOrder,
    nextMaterialSortOrder,
    nextSizeSortOrder,
    categoryForm.id,
    categoryForm.nameRo,
    categoryForm.nameHu,
    categoryForm.aliases,
    subCategoryForm.id,
    subCategoryForm.nameRo,
    subCategoryForm.nameHu,
    subCategoryForm.aliases,
    subCategoryForm.parentId,
    mainCategories,
    genderForm.code,
    genderForm.name,
    colorForm.id,
    colorForm.nameRo,
    materialForm.id,
    materialForm.nameRo,
    sizeForm.id,
    sizeForm.name,
    sizeForm.nameHu,
  ]);

  const selectedSupplier = useMemo(() => {
    if (supplier === "all") return null;
    const selected = normalizeSearch(supplier);
    return suppliers.find((s) => [s.id, s.code, s.name].map(normalizeSearch).some((x) => x === selected)) || null;
  }, [supplier, suppliers]);

  const brandOptions = useMemo(() => {
    if (!selectedSupplier) return brands;
    const linkedBrandIds = new Set(
      supplierBrands
        .filter((x) => x.is_active !== false && normalizeSearch(x.supplier_id) === normalizeSearch(selectedSupplier.id))
        .map((x) => String(x.brand_id))
    );
    return brands.filter((b) => linkedBrandIds.has(String(b.id)));
  }, [brands, supplierBrands, selectedSupplier]);

  useEffect(() => {
    if (brand === "all") return;
    const current = normalizeSearch(brand);
    const valid = brandOptions.some((b) => [b.id, b.code, b.name].map(normalizeSearch).some((x) => x === current));
    if (!valid) setBrand("all");
  }, [brand, brandOptions]);

  useEffect(() => {
    if (subCategory === "all") return;
    const valid = subCategoryFilterOptions.some((c) => categoryValueMatches(c, subCategory));
    if (!valid) setSubCategory("all");
  }, [subCategory, subCategoryFilterOptions]);

  useEffect(() => {
    if (!filtersOpen && colorFilterOpen) setColorFilterOpen(false);
  }, [filtersOpen, colorFilterOpen]);

  useEffect(() => {
    if (!colorFilterOpen) return;
    const onColorFilterPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || colorFilterRef.current?.contains(target)) return;
      setColorFilterOpen(false);
    };
    document.addEventListener("mousedown", onColorFilterPointerDown);
    return () => document.removeEventListener("mousedown", onColorFilterPointerDown);
  }, [colorFilterOpen]);

  const colorDisplay = (value: unknown, fallback?: unknown) => {
    return officialColorFromTypes(value, colorTypes) || String(fallback || "").trim() || "-";
  };

  const colorTypeForItem = (item: Partial<InventoryItem> | Record<string, any>) => {
    return findColorTypeByValue(colorTypes, item.color_name) || findColorTypeByValue(colorTypes, item.color_code);
  };

  const colorHexForItem = (item: Partial<InventoryItem> | Record<string, any>) => {
    const visibleColorName = colorDisplay(item.color_name, item.color_code);
    const visibleColorType = findColorTypeByValue(colorTypes, visibleColorName);
    const directColorType = colorTypeForItem(item);
    return String(visibleColorType?.hex || directColorType?.hex || item.color_hex || "").trim();
  };

  const colorCodeForItem = (item: Partial<InventoryItem> | Record<string, any>) => {
    return firstWarehouseText(item.color_code, (item as any).supplier_color_code, (item as any).supplierColorCode);
  };

  function MaskedBuyPrice({ value }: { value: unknown }) {
    const text = money(value);
    if (text === "-") return <span>-</span>;
    if (buyPricesVisible) return <span>{text}</span>;
    return <span className="inline-block select-none rounded-md bg-white/10 px-2 py-0.5 text-white/65 blur-[3px]" title="Vételár homályosítva">{text}</span>;
  }

  function SellPriceWithMarkup({ sellPrice, buyPrice }: { sellPrice: unknown; buyPrice: unknown }) {
    const percentText = buyPricesVisible ? priceMarkupPercentText(buyPrice, sellPrice) : "";
    return (
      <div className="leading-tight">
        <div>{money(sellPrice)}</div>
        {percentText && <div className="mt-0.5 text-[10px] font-semibold text-[#cffffd]">{percentText}</div>}
      </div>
    );
  }

  function SensitiveValueText({ value }: { value: unknown }) {
    const text = money(value);
    if (text === "-") return <span>-</span>;
    if (buyPricesVisible) return <span>{text}</span>;
    return <span className="inline-block select-none rounded-md bg-white/10 px-2 py-0.5 text-white/65 blur-[3px]" title="Vételárból számolt érték homályosítva">{text}</span>;
  }

  function ColorNameWithCode({ item, openUp = false }: { item: Partial<InventoryItem> | Record<string, any>; openUp?: boolean }) {
    const code = colorCodeForItem(item);
    const label = colorDisplay(item.color_name, item.color_code);
    const hex = colorHexForItem(item);
    const tooltipPosition = openUp ? "bottom-full mb-2" : "top-full mt-2";
    return (
      <span
        className="group relative inline-flex max-w-full items-center justify-center gap-1.5 rounded-full border border-[#5bd0cc]/35 bg-[#203f49] px-2 py-1 text-[11px] font-semibold leading-none text-[#cffffd] shadow-[0_0_0_1px_rgba(42,141,139,0.10)] align-middle"
        tabIndex={code ? 0 : undefined}
      >
        <span
          className="h-3 w-3 shrink-0 rounded-full border border-white/30 bg-white/10 shadow-[0_0_0_2px_rgba(255,255,255,0.03)]"
          style={hex ? { backgroundColor: hex } : undefined}
        />
        <span className="min-w-0 max-w-[86px] truncate">{label}</span>
        {code && (
          <span className={`pointer-events-none absolute left-1/2 z-[9999] hidden -translate-x-1/2 rounded-xl border border-[#5bd0cc]/30 bg-[#202838] px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-white shadow-2xl group-hover:block group-focus:block ${tooltipPosition}`}>
            {code}
          </span>
        )}
      </span>
    );
  }

  function ProductCodeTooltipButton({ item, openUp = false }: { item: InventoryItem; openUp?: boolean }) {
    const code = itemProductCode(item);
    return (
      <VariantCodesTooltip
        item={item}
        openUp={openUp}
        buttonLabel={code ? `Termékkód: ${code}` : "Nincs termékkód"}
        buttonClassName="inline-flex h-6 max-w-[220px] shrink-0 items-center justify-start gap-1 overflow-hidden whitespace-nowrap rounded-full border border-[#5bd0cc]/35 bg-[#203f49] px-2 text-[11px] leading-none text-[#cffffd] transition hover:bg-[#25535c] focus:outline-none focus:ring-2 focus:ring-[#2a8d8b]/45"
      />
    );
  }

  const normalizeColor = (value: unknown) => officialColorFromTypes(value, colorTypes);
  const normalizeSize = (value: unknown) => officialSizeFromTypes(value, sizeTypes);

  const detailHasChanges = useMemo(() => Boolean(detail?.item?.id) && !editFormsEqual(edit, editBaseline), [detail?.item?.id, edit, editBaseline]);
  const detailSaveButtonClass = detailHasChanges ? primaryBtn : btnSoft;

  const canSaveCategoryForm = Boolean(categoryForm.nameRo.trim());
  const canSaveSubCategoryForm = Boolean(subCategoryForm.parentId && subCategoryForm.nameRo.trim());
  const canSaveGenderForm = Boolean(genderForm.name.trim());
  const canSaveColorForm = Boolean(colorForm.nameRo.trim());
  const canSaveBrandColorForm = Boolean(brandColorForm.brandId && brandColorForm.colorCode.trim() && brandColorForm.colorTypeId);
  const canSaveSizeForm = Boolean(sizeForm.name.trim());
  const canSaveBrandSizeForm = Boolean(brandSizeForm.brandId && brandSizeForm.sizeCode.trim() && brandSizeForm.sizeTypeId);
  const canSaveMaterialForm = Boolean(materialForm.nameRo.trim());

  const filtered = useMemo(() => {
    let out = [...inventoryDisplayItems];
    const reviewMode = stockFilter === "watch";
    if (incomingFocus?.batchId) {
      // Az utolsó bevezetés itt munkalista: ami már aktív, eltűnik innen.
      out = out.filter((x) => incomingFocusVariantSet.has(String(x.variant_id || "")) && needsWarehouseActivation(x));
    } else if (!reviewMode && stockFilter !== "missing") {
      // A fő raktárlista csak az aktív termékeket mutassa. A draft/inaktív importok az aktiválandó listában élnek, nem a kész raktárban.
      out = out.filter(isWarehouseVisibleInMainList);
    }
    if (search.trim()) {
      const scannedCode = cleanScannedBarcode(scannedBarcodeSearch);
      const isActiveBarcodeScan = scannedCode && normalizeSearch(scannedCode) === normalizeSearch(search);
      out = isActiveBarcodeScan
        ? out.filter((x) => itemMatchesScannedBarcode(x, scannedCode))
        : out.filter((x) => itemMatchesSearch(x, search));
    }
    if (snCodFilter.trim()) {
      const snNeedle = normalizeSearch(snCodFilter);
      out = out.filter((x) => normalizeSearch(x.sn_cod || x.snCod || "").includes(snNeedle));
    }
    if (supplier !== "all") out = out.filter((x) => supplierMatches(x, supplier));
    if (brand !== "all") out = out.filter((x) => (x.brand_code || x.brand_name || "") === brand || x.brand_name === brand);
    if (category !== "all") out = out.filter((x) => itemMatchesMainCategory(x, category, categorySelectOptions));
    if (subCategory !== "all") out = out.filter((x) => itemMatchesSubCategory(x, subCategory, subCategories));
    if (gender !== "all") out = out.filter((x) => (x.gender || "") === gender);
    if (color !== "all") out = out.filter((x) => itemMatchesColorSelection(x, color, colorTypes));
    if (imageFilter === "with") out = out.filter((x) => Boolean(x.image_url));
    if (imageFilter === "missing") out = out.filter((x) => !x.image_url);
    if (location !== "all") {
      out = out.filter((x) => (stockMap.get(x.variant_id) || []).some((s) => (s.location_code === location || s.location_name === location) && n(s.qty) > 0));
    }
    if (stockFilter === "available") out = out.filter((x) => n(x.available_qty) > 0);
    if (stockFilter === "out") out = out.filter((x) => n(x.total_qty) <= 0);
    if (stockFilter === "reserved") out = out.filter((x) => n(x.total_reserved_qty) > 0);
    if (stockFilter === "missing") out = out.filter(hasMissingData);
    if (stockFilter === "watch") out = out.filter((x) => n(x.total_qty) > 0 && needsWarehouseActivation(x));
    out.sort((a, b) => {
      if (sortMode === "incoming_desc") {
        if (incomingFocus?.batchId) {
          const byActivation = Number(needsWarehouseActivation(b)) - Number(needsWarehouseActivation(a));
          if (byActivation !== 0) return byActivation;
        }
        const byIncoming = latestWarehouseIncomingMs(b) - latestWarehouseIncomingMs(a);
        if (byIncoming !== 0) return byIncoming;
        return String(a.title_ro || "").localeCompare(String(b.title_ro || ""), "hu");
      }
      if (sortMode === "brand") return String(a.brand_name || "").localeCompare(String(b.brand_name || ""), "hu");
      if (sortMode === "stock_desc") return n(b.total_qty) - n(a.total_qty);
      if (sortMode === "stock_asc") return n(a.total_qty) - n(b.total_qty);
      if (sortMode === "value_desc") return n(b.total_qty) * n(b.buy_price) - n(a.total_qty) * n(a.buy_price);
      if (sortMode === "missing") return Number(hasMissingData(b)) - Number(hasMissingData(a));
      return String(a.title_ro || "").localeCompare(String(b.title_ro || ""), "hu");
    });
    return out;
  }, [inventoryDisplayItems, incomingFocus?.batchId, incomingFocus?.mode, incomingFocusVariantIdsKey, search, snCodFilter, scannedBarcodeSearch, supplier, brand, category, subCategory, categorySelectOptions, subCategories, gender, color, colorTypes, location, stockFilter, imageFilter, sortMode, stockMap]);

  function resetWarehouseFilters(showMessage = true) {
    setSearch("");
    setSnCodFilter("");
    setScannedBarcodeSearch("");
    setSupplier("all");
    setBrand("all");
    setCategory("all");
    setSubCategory("all");
    setGender("all");
    setColor("all");
    setColorFilterOpen(false);
    setLocation("all");
    setStockFilter("all");
    setImageFilter("all");
    setSortMode("name");
    setIncomingFocus(null);
    setIncomingFocusItems([]);
    setProductPage(1);
    setListOpen(true);
    if (showMessage) setMessage("Szűrők törölve. Most az összes raktári terméksor látszik.");
  }

  function labelForMetaValue(rows: Array<MetaItem | GenderType>, value: unknown) {
    const raw = String(value || "").trim();
    const key = normalizeSearch(raw);
    if (!key) return raw || "-";
    const found = rows.find((row: any) => [row.id, row.code, row.name, row.name_ro, row.name_hu].map(normalizeSearch).some((x) => x === key));
    if (!found) return raw;
    return String((found as any).name_hu || (found as any).name_ro || (found as any).name || (found as any).code || raw);
  }

  const activeWarehouseFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (search.trim()) labels.push(`Keresés: ${search.trim()}`);
    if (snCodFilter.trim()) labels.push(`S/N/COD: ${snCodFilter.trim()}`);
    if (supplier !== "all") labels.push(`Beszállító: ${labelForMetaValue(suppliers, supplier)}`);
    if (brand !== "all") labels.push(`Márka: ${labelForMetaValue(brands, brand)}`);
    if (category !== "all") labels.push(`Főkategória: ${labelForMetaValue(categories, category)}`);
    if (subCategory !== "all") labels.push(`Alkategória / terméktípus: ${labelForMetaValue(subCategories, subCategory)}`);
    if (gender !== "all") labels.push(`Nem: ${genderLabel(gender, genderTypes)}`);
    if (color !== "all") labels.push(`Szín: ${labelForMetaValue(colorTypes as any, color)}`);
    if (location !== "all") labels.push(`Célhely: ${labelForMetaValue(locations, location)}`);
    if (stockFilter !== "all") {
      const stockLabels: Record<StockFilter, string> = {
        all: "Összes",
        available: "Készleten",
        out: "Nincs készleten",
        reserved: "Van foglalás",
        missing: "Hiányzó adat",
        watch: "Aktiválandó készlet",
      };
      labels.push(`Készlet: ${stockLabels[stockFilter] || stockFilter}`);
    }
    if (imageFilter !== "all") {
      labels.push(`Kép: ${imageFilter === "missing" ? "Hiányzik kép" : "Van kép"}`);
    }
    if (incomingFocus?.batchId) {
      labels.push(`Utolsó bevételezés: ${incomingFocus.rows.length} sor / ${incomingFocus.variantIds.length} variáns`);
    }
    return labels;
  }, [search, snCodFilter, supplier, brand, category, subCategory, gender, color, location, stockFilter, imageFilter, suppliers, brands, categories, subCategories, genderTypes, colorTypes, locations, incomingFocus]);

  const hasActiveWarehouseFilters = activeWarehouseFilterLabels.length > 0;

  const newProductBarcodeMatches = useMemo(() => {
    if (!newProductOpen) return [] as InventoryItem[];
    const code = cleanScannedBarcode(newProduct.barcode || newProduct.snCod || "");
    if (!code) return [] as InventoryItem[];
    return items.filter((item) => itemMatchesScannedBarcode(item, code)).slice(0, 4);
  }, [newProductOpen, newProduct.barcode, newProduct.snCod, items]);

  const totalProductPages = Math.max(1, Math.ceil(filtered.length / productPageSize));
  const safeProductPage = Math.min(productPage, totalProductPages);
  const productPageStartIndex = filtered.length ? (safeProductPage - 1) * productPageSize + 1 : 0;
  const productPageEndIndex = Math.min(safeProductPage * productPageSize, filtered.length);

  const productPageItems = useMemo(() => {
    const start = (safeProductPage - 1) * productPageSize;
    return filtered.slice(start, start + productPageSize);
  }, [filtered, safeProductPage, productPageSize]);

  const filteredVariantIds = useMemo(
    () => productPageItems.map((x) => String(x.variant_id || "")).filter(Boolean),
    [productPageItems]
  );

  useEffect(() => {
    setProductPage(1);
  }, [search, snCodFilter, scannedBarcodeSearch, supplier, brand, category, subCategory, gender, color, location, stockFilter, imageFilter, sortMode, incomingFocusVariantIdsKey]);

  useEffect(() => {
    if (productPage > totalProductPages) setProductPage(totalProductPages);
  }, [productPage, totalProductPages]);

  function goToProductPage(pageNumber: number) {
    const nextPage = Math.min(totalProductPages, Math.max(1, pageNumber));
    setProductPage(nextPage);
    window.setTimeout(() => {
      productListRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }, 0);
  }

  function findVisibleProductNode(variantId: string) {
    const root = productListRef.current;
    if (!root || !variantId) return null;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-aif-variant-id]")) as HTMLElement[];
    const matchingNodes = nodes.filter((node) => node.dataset.aifVariantId === variantId);
    return matchingNodes.find((node) => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length)) || matchingNodes[0] || null;
  }

  function queueProductRowJump(variantId: unknown) {
    const id = String(variantId || "").trim();
    if (!id) return;
    setSummaryOpen(false);
    setListOpen(true);
    setPendingProductJumpId(id);
    setHighlightProductId(id);
  }

  function resetListFiltersForProductFocus(searchText: string, scannedCode = "") {
    setDetail(null);
    setIncomingFocus(null);
    setIncomingFocusItems([]);
    setSelectedPanelOpen(false);
    setSelectedWorkPanel(null);
    setFiltersOpen(false);
    setListOpen(true);
    setSummaryOpen(false);
    setSupplier("all");
    setBrand("all");
    setCategory("all");
    setSubCategory("all");
    setGender("all");
    setColor("all");
    setColorFilterOpen(false);
    setLocation("all");
    setStockFilter("all");
    setImageFilter("all");
    setSortMode("name");
    setScannedBarcodeSearch(scannedCode);
    setSearch(searchText);
    setProductPage(1);
  }

  function focusProductInList(item: InventoryItem, searchValue?: unknown, messageText?: string) {
    const variantId = selectedVariantIdFromItem(item);
    const searchText = String(searchValue || visibleWarehouseBarcode(item) || item.sn_cod || item.snCod || item.title_ro || "").trim();
    const scannedCode = cleanScannedBarcode(searchValue || visibleWarehouseBarcode(item) || item.sn_cod || item.snCod || "");
    resetListFiltersForProductFocus(searchText, scannedCode && normalizeSearch(scannedCode) === normalizeSearch(searchText) ? scannedCode : "");
    queueProductRowJump(variantId);
    if (messageText) setMessage(messageText);
  }

  useEffect(() => {
    const targetId = String(pendingProductJumpId || "").trim();
    if (!targetId) return;
    if (!listOpen) {
      setListOpen(true);
      return;
    }

    const targetIndex = filtered.findIndex((item) => String(item.variant_id || "") === targetId);
    if (targetIndex < 0) return;

    const targetPage = Math.max(1, Math.floor(targetIndex / productPageSize) + 1);
    if (targetPage !== safeProductPage) {
      setProductPage(targetPage);
      return;
    }

    const timer = window.setTimeout(() => {
      const node = findVisibleProductNode(targetId);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingProductJumpId((current) => current === targetId ? "" : current);
      window.setTimeout(() => {
        setHighlightProductId((current) => current === targetId ? "" : current);
      }, 5200);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [pendingProductJumpId, filtered, safeProductPage, productPageItems.length, listOpen]);

  const productPager = filtered.length > 0 ? (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/14 bg-[#3f4959]/80 px-3 py-2 text-xs text-white/75">
      <div>
        {productPageStartIndex}-{productPageEndIndex} / {filtered.length} termék
        <span className="ml-2 text-white/45">• oldal {safeProductPage} / {totalProductPages}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 text-white/62">
          <span>Oldalanként</span>
          <select
            className="h-8 rounded-lg border border-white/18 bg-[#303a4c] px-2 text-xs text-white outline-none focus:border-[#7bd7d4]/55"
            value={productPageSize}
            onChange={(e) => {
              setProductPageSize(Number(e.target.value) || WAREHOUSE_PRODUCTS_PER_PAGE);
              setProductPage(1);
            }}
          >
            {WAREHOUSE_PRODUCTS_PER_PAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <button className={btnSoft} type="button" disabled={safeProductPage <= 1} onClick={() => goToProductPage(1)}>Első</button>
        <button className={btnSoft} type="button" disabled={safeProductPage <= 1} onClick={() => goToProductPage(safeProductPage - 1)}><ArrowLeft size={14} /> Előző {productPageSize}</button>
        <span className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-2 text-white">{safeProductPage} / {totalProductPages}</span>
        <button className={btnSoft} type="button" disabled={safeProductPage >= totalProductPages} onClick={() => goToProductPage(safeProductPage + 1)}>Következő {productPageSize} <ArrowRight size={14} /></button>
        <button className={btnSoft} type="button" disabled={safeProductPage >= totalProductPages} onClick={() => goToProductPage(totalProductPages)}>Utolsó</button>
      </div>
    </div>
  ) : null;

  const selectionSourceItems = useMemo(() => mergeInventoryItems(items, persistedSelectedItems), [items, persistedSelectedItems]);

  const selectedItems = useMemo(() => {
    const selected = new Set(Object.keys(selectedVariants).filter((id) => selectedVariants[id]));
    return selectionSourceItems.filter((x) => selected.has(selectedVariantIdFromItem(x)));
  }, [selectionSourceItems, selectedVariants]);

  const selectedCount = selectedItems.length;
  const selectedUnassignedItems = useMemo(
    () => selectedItems.filter((x) => !selectedWorkActions[String(x.variant_id || "")]),
    [selectedItems, selectedWorkActions]
  );
  const selectedLabelItems = useMemo(
    () => selectedItems.filter((x) => selectedWorkActions[String(x.variant_id || "")] === "label"),
    [selectedItems, selectedWorkActions]
  );
  const selectedOrderItems = useMemo(
    () => selectedItems.filter((x) => selectedWorkActions[String(x.variant_id || "")] === "order"),
    [selectedItems, selectedWorkActions]
  );
  const selectedMoveItems = useMemo(
    () => selectedItems.filter((x) => selectedWorkActions[String(x.variant_id || "")] === "move"),
    [selectedItems, selectedWorkActions]
  );
  const selectedWorkCounts: Record<SelectedWorkAction, number> = {
    label: selectedLabelItems.length,
    order: selectedOrderItems.length,
    move: selectedMoveItems.length,
  };
  const selectedWorkButtonClass = (action: SelectedWorkAction) => selectedWorkCounts[action] > 0 ? primaryBtn : btnSoft;

  function locationValue(loc?: MetaItem | null) {
    return String(loc?.id || loc?.code || loc?.name || "").trim();
  }

  function locationByValue(value: string) {
    const key = String(value || "").trim();
    if (!key) return null;
    return stockLocationRows.find((loc) => [loc.id, loc.code, loc.name].some((x) => String(x || "") === key)) || null;
  }

  function locationNameByValue(value: string) {
    const found = locationByValue(value);
    return String(found?.name || found?.code || "-");
  }

  function stockRowForLocationValue(variantId: string, locationId: string) {
    const loc = locationByValue(locationId);
    if (!loc) return null;
    return stockForLocation(stockRowsForVariant(variantId), loc);
  }

  function qtyAtLocation(variantId: string, locationId: string) {
    return Math.max(0, Math.floor(n(stockRowForLocationValue(variantId, locationId)?.qty)));
  }

  function reservedAtLocation(variantId: string, locationId: string) {
    return Math.max(0, Math.floor(n(stockRowForLocationValue(variantId, locationId)?.reserved_qty)));
  }

  function availableAtLocation(variantId: string, locationId: string) {
    const row = stockRowForLocationValue(variantId, locationId);
    if (!row) return 0;
    if (row.available_qty !== undefined && row.available_qty !== null) return Math.max(0, Math.floor(n(row.available_qty)));
    return Math.max(0, Math.floor(n(row.qty) - n(row.reserved_qty)));
  }

  function firstDifferentLocation(value: string) {
    return locationValue(stockLocationRows.find((loc) => locationValue(loc) && locationValue(loc) !== value) || stockLocationRows[0] || null);
  }

  function defaultStockMoveFrom(item: InventoryItem) {
    const variantId = String(item.variant_id || "");
    const sorted = stockLocationRows
      .map((loc) => ({ loc, available: availableAtLocation(variantId, locationValue(loc)), qty: qtyAtLocation(variantId, locationValue(loc)) }))
      .sort((a, b) => b.available - a.available || b.qty - a.qty || String(a.loc.name || a.loc.code || "").localeCompare(String(b.loc.name || b.loc.code || ""), "hu", { sensitivity: "base" }));
    return locationValue(sorted.find((row) => row.available > 0)?.loc || stockLocationRows[0] || null);
  }

  function defaultStockMoveTo(fromLocationId: string) {
    return firstDifferentLocation(fromLocationId);
  }

  function clampStockMoveQty(item: InventoryItem, fromLocationId: string, rawQty: unknown) {
    const variantId = String(item.variant_id || "");
    const available = availableAtLocation(variantId, fromLocationId);
    const qty = Math.max(0, Math.floor(n(rawQty)));
    if (available <= 0) return 0;
    return Math.min(qty || 1, available);
  }

  function defaultMoveDraftForItem(item: InventoryItem): StockTransferDraftRow {
    const fromLocationId = defaultStockMoveFrom(item);
    const toLocationId = defaultStockMoveTo(fromLocationId);
    const qty = clampStockMoveQty(item, fromLocationId, "1");
    return { fromLocationId, toLocationId, qty: String(qty) };
  }

  function setStockMoveRowField(variantId: string, patch: Partial<StockTransferDraftRow>) {
    const item = selectedMoveItems.find((x) => String(x.variant_id || "") === variantId);
    setStockMoveRows((current) => {
      const previous = current[variantId] || (item ? defaultMoveDraftForItem(item) : { fromLocationId: "", toLocationId: "", qty: "1" });
      let next: StockTransferDraftRow = { ...previous, ...patch };
      if (patch.fromLocationId !== undefined && (!next.toLocationId || next.toLocationId === next.fromLocationId)) {
        next.toLocationId = defaultStockMoveTo(next.fromLocationId);
      }
      if (patch.toLocationId !== undefined && next.toLocationId === next.fromLocationId) {
        next.toLocationId = defaultStockMoveTo(next.fromLocationId);
      }
      if (item) next.qty = String(clampStockMoveQty(item, next.fromLocationId, next.qty));
      return { ...current, [variantId]: next };
    });
  }

  function adjustStockMoveQty(variantId: string, delta: number) {
    const item = selectedMoveItems.find((x) => String(x.variant_id || "") === variantId);
    if (!item) return;
    const current = stockMoveRows[variantId] || defaultMoveDraftForItem(item);
    setStockMoveRowField(variantId, { qty: String(Math.max(0, Math.floor(n(current.qty)) + delta)) });
  }

  function applyMoveLocationsToAll(fromLocationId: string, toLocationId: string) {
    if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) return;
    setStockMoveRows((current) => {
      const next = { ...current };
      for (const item of selectedMoveItems) {
        const variantId = String(item.variant_id || "");
        if (!variantId) continue;
        const previous = next[variantId] || defaultMoveDraftForItem(item);
        next[variantId] = {
          fromLocationId,
          toLocationId,
          qty: String(clampStockMoveQty(item, fromLocationId, previous.qty)),
        };
      }
      return next;
    });
  }

  function applyStockMoveBulkLocations() {
    if (!stockMoveBulkFrom || !stockMoveBulkTo) {
      setMessage("Válassz forrást és célt a gyors kitöltéshez.");
      return;
    }
    if (stockMoveBulkFrom === stockMoveBulkTo) {
      setMessage("A forrás és a cél nem lehet ugyanaz.");
      return;
    }
    applyMoveLocationsToAll(stockMoveBulkFrom, stockMoveBulkTo);
    setMessage(`Gyors útvonal alkalmazva minden készletmozgatási sorra: ${compactWarehouseLocationName(locationByValue(stockMoveBulkFrom))} → ${compactWarehouseLocationName(locationByValue(stockMoveBulkTo))}.`);
  }

  const selectedMoveIdsKey = useMemo(() => selectedMoveItems.map((item) => String(item.variant_id || "")).filter(Boolean).join("|"), [selectedMoveItems]);

  useEffect(() => {
    if (selectedWorkPanel !== "move") return;
    setStockMoveRows((current) => {
      const activeIds = new Set(selectedMoveItems.map((item) => String(item.variant_id || "")).filter(Boolean));
      const next: Record<string, StockTransferDraftRow> = {};
      for (const item of selectedMoveItems) {
        const variantId = String(item.variant_id || "");
        if (!variantId) continue;
        const previous = current[variantId] || defaultMoveDraftForItem(item);
        const fromLocationId = previous.fromLocationId || defaultStockMoveFrom(item);
        let toLocationId = previous.toLocationId || defaultStockMoveTo(fromLocationId);
        if (toLocationId === fromLocationId) toLocationId = defaultStockMoveTo(fromLocationId);
        next[variantId] = {
          fromLocationId,
          toLocationId,
          qty: String(clampStockMoveQty(item, fromLocationId, previous.qty || "1")),
        };
      }
      for (const [variantId, row] of Object.entries(current) as Array<[string, StockTransferDraftRow]>) {
        if (activeIds.has(variantId) && !next[variantId]) next[variantId] = row;
      }
      return next;
    });
  }, [selectedWorkPanel, selectedMoveIdsKey, stockLocationRows, stockRows]);

  const preparedMoveRows = useMemo<PreparedStockTransferRow[]>(() => {
    return selectedMoveItems.map((item) => {
      const variantId = String(item.variant_id || "");
      const draft = stockMoveRows[variantId] || defaultMoveDraftForItem(item);
      const qty = Math.max(0, Math.floor(n(draft.qty)));
      const availableFrom = availableAtLocation(variantId, draft.fromLocationId);
      let problem = "";
      if (!variantId) problem = "Hiányzó termékazonosító.";
      else if (!draft.fromLocationId) problem = "Válassz forrás helyet.";
      else if (!draft.toLocationId) problem = "Válassz célhelyet.";
      else if (draft.fromLocationId === draft.toLocationId) problem = "A forrás és a célhely nem lehet ugyanaz.";
      else if (qty <= 0) problem = "Adj meg legalább 1 darabot.";
      else if (qty > availableFrom) problem = `A forrás helyen csak ${availableFrom} db elérhető.`;
      return {
        item,
        variantId,
        fromLocationId: draft.fromLocationId,
        toLocationId: draft.toLocationId,
        fromLocationName: locationNameByValue(draft.fromLocationId),
        toLocationName: locationNameByValue(draft.toLocationId),
        qty,
        availableFrom,
        valid: !problem,
        problem,
      };
    });
  }, [selectedMoveItems, stockMoveRows, stockLocationRows, stockRows]);

  const preparedMoveRowsById = useMemo(() => new Map(preparedMoveRows.map((row) => [row.variantId, row])), [preparedMoveRows]);
  const moveValidRows = useMemo(() => preparedMoveRows.filter((row) => row.valid), [preparedMoveRows]);
  const moveInvalidCount = Math.max(0, preparedMoveRows.length - moveValidRows.length);
  const moveAllRowsValid = useMemo(() => preparedMoveRows.length > 0 && preparedMoveRows.every((row) => row.valid), [preparedMoveRows]);
  const moveTotalQty = useMemo(() => moveValidRows.reduce((sum, row) => sum + row.qty, 0), [moveValidRows]);
  const moveCanSave = selectedWorkPanel === "move" && moveAllRowsValid && !stockMoveSaving;
  const moveBulkCanApply = selectedWorkPanel === "move" && Boolean(stockMoveBulkFrom && stockMoveBulkTo && stockMoveBulkFrom !== stockMoveBulkTo);

  function movePrintLines() {
    return moveValidRows.map((row, index): StockTransferPrintLine => ({
      index: index + 1,
      title: row.item.title_ro || "-",
      brand: row.item.brand_name || "-",
      category: row.item.category_name_hu || row.item.category_name_ro || "-",
      barcode: row.item.barcode || row.item.internal_sku || "-",
      color: colorDisplay(row.item.color_name, row.item.color_code),
      size: String(row.item.size || "-"),
      imageUrl: row.item.image_url || null,
      fromLocation: row.fromLocationName,
      toLocation: row.toLocationName,
      qty: row.qty,
    }));
  }

  function printStockMoveTransferPdf() {
    if (!moveAllRowsValid) {
      setMessage("A PDF előtt javítsd a készletmozgatási sorokat.");
      return;
    }
    const printHtml = warehouseStockTransferPrintDocumentHtml({
      title: stockMoveDocumentTitle.trim() || "Készlet átadási lista",
      note: stockMoveNote.trim(),
      createdAt: warehouseTransferDateTime(),
      lines: movePrintLines(),
    });

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "210mm";
    iframe.style.height = "297mm";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const printWindow = iframe.contentWindow;
    const printDocument = printWindow?.document;
    if (!printWindow || !printDocument) {
      iframe.remove();
      setMessage("A böngésző nem engedte megnyitni a nyomtatási keretet.");
      return;
    }

    let cleaned = false;
    let cleanupTimer: number | undefined;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (cleanupTimer) window.clearTimeout(cleanupTimer);
      iframe.remove();
    };

    printWindow.addEventListener("afterprint", cleanup, { once: true });
    printDocument.open();
    printDocument.write(printHtml);
    printDocument.close();
    const runPrint = () => {
      printWindow.focus();
      printWindow.print();
      cleanupTimer = window.setTimeout(cleanup, 60000);
    };
    printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(runPrint));
  }

  function requestSaveSelectedMoveTransfers() {
    if (!moveCanSave) {
      setMessage(moveInvalidCount ? `${moveInvalidCount} készletmozgatási sor még hibás. Javítsd őket mentés előtt.` : "Nincs menthető készletmozgatás.");
      return;
    }
    setStockMoveConfirmOpen(true);
  }

  async function saveSelectedMoveTransfers() {
    if (!moveCanSave) {
      setMessage(moveInvalidCount ? `${moveInvalidCount} készletmozgatási sor még hibás. Javítsd őket mentés előtt.` : "Nincs menthető készletmozgatás.");
      return;
    }

    const rowsToMove = moveValidRows.map((row) => ({
      variantId: row.variantId,
      fromLocationId: row.fromLocationId,
      toLocationId: row.toLocationId,
      qty: row.qty,
    }));
    const qtyToMove = rowsToMove.reduce((sum, row) => sum + row.qty, 0);
    setStockMoveConfirmOpen(false);

    setStockMoveSaving(true);
    setMessage("");
    try {
      const result = await apiStockTransfer({
        title: stockMoveDocumentTitle.trim() || "Készlet átadási lista",
        note: stockMoveNote.trim(),
        lines: rowsToMove,
      });
      notifyStockMovesChanged({ source: "warehouse_transfer", transferId: result.transferId });
      await load();
      const movedLines = Number(result.movedLines ?? result.movedRows ?? result.lineCount ?? rowsToMove.length);
      const movedQty = Number(result.movedQty ?? result.totalQty ?? qtyToMove);
      const movedVariantIds = new Set<string>(rowsToMove.map((row) => String(row.variantId || "")));
      setStockMoveRows((current) => {
        const next = { ...current };
        Array.from(movedVariantIds).forEach((id: string) => {
          delete next[id];
        });
        return next;
      });
      setSelectedWorkActions((current) => {
        const next = { ...current };
        Array.from(movedVariantIds).forEach((id: string) => {
          if (next[id] === "move") delete next[id];
        });
        return next;
      });
      setStockMoveBulkFrom("");
      setStockMoveBulkTo("");
      setStockMoveConfirmOpen(false);
      setMessage(`Készletmozgatás rögzítve: ${movedLines} sor, ${movedQty} db. A mozgatott sorokat levettem a készletmozgatási listáról, hogy ne lehessen véletlenül még egyszer ugyanazt átküldeni.`);
    } catch (e: any) {
      setMessage(e?.message || "A készletmozgatás mentése nem sikerült.");
    } finally {
      setStockMoveSaving(false);
    }
  }

  function applyPersistedSelectedWorklist(rows: PersistedSelectedWorkItem[]) {
    const nextSelected: Record<string, boolean> = {};
    const nextActions: Record<string, SelectedWorkAction> = {};
    const nextItems: InventoryItem[] = [];

    for (const row of rows || []) {
      const id = selectedVariantIdFromItem(row);
      if (!id) continue;
      nextSelected[id] = true;
      const action = normalizeSelectedWorkAction(row.action || row.selected_action);
      if (action) nextActions[id] = action;
      nextItems.push({ ...row, variant_id: id });
    }

    selectedSyncSilentRef.current = true;
    setPersistedSelectedItems(nextItems);
    setSelectedVariants(nextSelected);
    setSelectedWorkActions(nextActions);
    window.setTimeout(() => {
      selectedSyncSilentRef.current = false;
      selectedSyncReadyRef.current = true;
    }, 0);
  }

  const selectedVisibleCount = filteredVariantIds.filter((id) => selectedVariants[id]).length;
  const allFilteredSelected = filteredVariantIds.length > 0 && selectedVisibleCount === filteredVariantIds.length;

  function assignSelectedItemToAction(item: InventoryItem, action: SelectedWorkAction) {
    const id = String(item.variant_id || "");
    if (!id) return;
    setSelectedVariants((current) => ({ ...current, [id]: true }));
    setSelectedWorkActions((current) => ({ ...current, [id]: action }));
    setSelectedActionTarget(null);
    setSelectedWorkPanel(action);
  }

  function returnSelectedItemToMainList(id: string) {
    if (!id) return;
    setSelectedWorkActions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function removeSelectedItemEverywhere(id: string) {
    if (!id) return;
    setSelectedVariants((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSelectedWorkActions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function selectedItemsForAction(action: SelectedWorkAction) {
    if (action === "label") return selectedLabelItems;
    if (action === "order") return selectedOrderItems;
    return selectedMoveItems;
  }

  function labelProductCodeForItem(item: InventoryItem) {
    const raw = String(item.model_code || item.internal_sku || item.barcode || "").trim();
    const clean = raw.includes(":") ? raw.split(":").pop() || raw : raw;
    return labelCleanText(clean, 48);
  }

  function toggleLabelContent(key: WarehouseLabelContentKey) {
    setLabelContent((current) => ({ ...current, [key]: !current[key] }));
  }

  function applyWarehouseLabelPreset(id: string) {
    const preset = WAREHOUSE_LABEL_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setLabelWidth(preset.width);
    setLabelHeight(preset.height);
    setLabelCols(preset.cols);
    setLabelRows(preset.rows);
    setLabelMarginX(preset.marginX);
    setLabelMarginY(preset.marginY);
  }

  function saveCurrentWarehouseLabelTemplate() {
    const name = labelTemplateName.trim() || "Standard 40x46";
    const template: WarehouseLabelTemplate = {
      name,
      labelWidth,
      labelHeight,
      labelCols,
      labelRows,
      labelMarginX,
      labelMarginY,
      labelCompanyName,
      labelCurrency,
      labelUnitText,
      labelShowBorder,
      labelContent,
    };
    const next = [template, ...labelTemplates.filter((x) => x.name !== name)].slice(0, 20);
    setLabelTemplates(next);
    saveWarehouseLabelTemplates(next);
    setMessage("Címke sablon mentve.");
  }

  function loadWarehouseLabelTemplate(name: string) {
    const template = labelTemplates.find((x) => x.name === name);
    if (!template) return;
    setLabelTemplateName(template.name);
    setLabelWidth(template.labelWidth || "40");
    setLabelHeight(template.labelHeight || "46");
    setLabelCols(template.labelCols || "5");
    setLabelRows(template.labelRows || "6");
    setLabelMarginX(template.labelMarginX || "5");
    setLabelMarginY(template.labelMarginY || "5");
    setLabelCompanyName(template.labelCompanyName || WAREHOUSE_LABEL_COMPANY);
    setLabelCurrency(template.labelCurrency || "RON");
    setLabelUnitText(template.labelUnitText || template.labelCurrency || "RON");
    setLabelShowBorder(template.labelShowBorder !== false);
    setLabelContent({ ...WAREHOUSE_LABEL_DEFAULT_CONTENT, ...(template.labelContent || {}) });
  }

  function defaultLabelCopiesForItem(item: InventoryItem) {
    const qty = Math.floor(n(item.total_qty || item.available_qty));
    return String(Math.max(1, qty || 1));
  }

  function barcodeForLabelItem(item: InventoryItem) {
    const existing = labelCleanInternalCode(item.barcode || item.internal_sku || "");
    if (existing) return existing;
    return labelMakeInternalCode("", [
      item.variant_id,
      item.model_id,
      item.title_ro,
      item.brand_name,
      item.category_name_ro,
      item.color_name,
      item.size,
    ]);
  }

  async function openLabelComposer() {
    if (!selectedLabelItems.length) {
      setMessage("Nincs termék a Vonalkód / címke listában.");
      return;
    }
    setLabelCopies((current) => {
      const next = { ...current };
      for (const item of selectedLabelItems) {
        const id = String(item.variant_id || "");
        if (id && !next[id]) next[id] = defaultLabelCopiesForItem(item);
      }
      return next;
    });

    const missingIds = selectedLabelItems
      .map((item) => String(item.variant_id || ""))
      .filter((id) => id && !labelDetailMap[id]);

    if (missingIds.length) {
      setLabelDetailsBusy(true);
      try {
        const loaded = await Promise.all(
          missingIds.map(async (id) => {
            try {
              const detail = await apiVariantDetail(id);
              return { id, detail };
            } catch {
              return { id, detail: null };
            }
          })
        );

        setLabelDetailMap((current) => {
          const next = { ...current };
          for (const row of loaded) {
            if (row.detail) next[row.id] = row.detail;
          }
          return next;
        });
      } finally {
        setLabelDetailsBusy(false);
      }
    }

    setLabelComposerOpen(true);
  }

  function updateLabelCopies(id: string, value: string) {
    const qty = labelInt(value, 1, 0, 999);
    setLabelCopies((current) => ({ ...current, [id]: String(qty) }));
  }

  function adjustLabelCopies(id: string, delta: number) {
    setLabelCopies((current) => {
      const currentQty = labelInt(current[id], 1, 0, 999);
      return { ...current, [id]: String(Math.max(0, currentQty + delta)) };
    });
  }

  const labelW = labelMm(labelWidth, 40, 20, 120);
  const labelH = labelMm(labelHeight, 46, 15, 100);
  const labelColCount = labelInt(labelCols, 5, 1, 8);
  const labelRowCount = labelInt(labelRows, 6, 1, 12);
  const labelMarginXmm = labelMm(labelMarginX, 5, 0, 25);
  const labelMarginYmm = labelMm(labelMarginY, 5, 0, 25);
  const labelsPerPage = Math.max(1, labelColCount * labelRowCount);

  const labelRowsForPrint = useMemo(() => {
    return selectedLabelItems.map((item) => {
      const id = String(item.variant_id || "");
      const detailItem = labelDetailMap[id]?.item || {};
      const barcode = barcodeForLabelItem(item);
      const copies = labelInt(labelCopies[id], labelInt(defaultLabelCopiesForItem(item), 1, 1, 999), 0, 999);
      const color = colorDisplay(item.color_name || detailItem.color_name, item.color_code || detailItem.color_code);
      const price = item.sell_price == null ? "" : String(item.sell_price);
      return {
        item,
        id,
        barcode,
        copies,
        title: detailItem.title_ro || item.title_ro || "-",
        brand: detailItem.brand_name || item.brand_name || "-",
        category: detailItem.category_name_ro || item.category_name_ro || detailItem.category_name_hu || item.category_name_hu || "-",
        size: detailItem.size || item.size || "-",
        color,
        description: detailItem.material || item.material || "",
        productCode: labelProductCodeForItem(item),
        price,
        stockQty: Math.floor(n(item.total_qty)),
        render: labelCode128Svg(barcode, 58),
      };
    });
  }, [selectedLabelItems, labelCopies, colorTypes, labelDetailMap]);

  const labelPrintItems = useMemo<WarehouseLabelPrintItem[]>(() => {
    const out: WarehouseLabelPrintItem[] = [];
    for (const row of labelRowsForPrint) {
      for (let i = 0; i < row.copies; i += 1) {
        out.push({
          key: `${row.id}-${i}`,
          variantId: row.id,
          barcode: row.barcode,
          title: row.title,
          brand: row.brand,
          category: row.category,
          size: row.size,
          color: row.color,
          description: row.description,
          productCode: row.productCode,
          price: row.price,
          stockQty: row.stockQty,
          copyIndex: i + 1,
          copyTotal: row.copies,
          render: row.render,
        });
      }
    }
    return out;
  }, [labelRowsForPrint]);

  const labelPrintPages = useMemo(() => {
    const pages: WarehouseLabelPrintItem[][] = [];
    for (let i = 0; i < labelPrintItems.length; i += labelsPerPage) {
      pages.push(labelPrintItems.slice(i, i + labelsPerPage));
    }
    return pages;
  }, [labelPrintItems, labelsPerPage]);

  const labelPrintStyle = {
    "--aif-label-w": `${labelW}mm`,
    "--aif-label-h": `${labelH}mm`,
    "--aif-label-cols": String(labelColCount),
    "--aif-label-rows": String(labelRowCount),
    "--aif-label-margin-x": `${labelMarginXmm}mm`,
    "--aif-label-margin-y": `${labelMarginYmm}mm`,
    "--aif-label-page-w": "210mm",
    "--aif-label-page-h": "297mm",
    "--aif-label-preview-scale": String(WAREHOUSE_LABEL_PREVIEW_SCALE),
    "--aif-label-preview-w": `${210 * WAREHOUSE_LABEL_PREVIEW_SCALE}mm`,
    "--aif-label-preview-h": `${297 * WAREHOUSE_LABEL_PREVIEW_SCALE}mm`,
  } as React.CSSProperties & Record<string, string>;

  function printGeneratedLabels() {
    if (!labelPrintItems.length) {
      setMessage("Nincs nyomtatható címke. Állíts be legalább egy példányt.");
      return;
    }

    const printHtml = warehouseLabelPrintDocumentHtml(
      labelPrintPages,
      { labelContent, labelCompanyName, labelCurrency, labelUnitText, labelShowBorder },
      { labelW, labelH, labelColCount, labelRowCount, labelMarginXmm, labelMarginYmm },
    );

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "210mm";
    iframe.style.height = "297mm";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const printWindow = iframe.contentWindow;
    const printDocument = printWindow?.document;
    if (!printWindow || !printDocument) {
      iframe.remove();
      setMessage("A böngésző nem engedte megnyitni a nyomtatási keretet.");
      return;
    }

    let cleaned = false;
    let cleanupTimer: number | undefined;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (cleanupTimer) window.clearTimeout(cleanupTimer);
      iframe.remove();
    };

    printWindow.addEventListener("afterprint", cleanup, { once: true });
    printDocument.open();
    printDocument.write(printHtml);
    printDocument.close();

    const runPrint = () => {
      printWindow.focus();
      printWindow.print();
      cleanupTimer = window.setTimeout(cleanup, 60000);
    };

    printWindow.requestAnimationFrame(() => {
      printWindow.requestAnimationFrame(runPrint);
    });
  }

  function WarehouseLabelContent({ label }: { label: WarehouseLabelPrintItem }) {
    const priceParts = labelPriceParts(label.price);
    return (
      <>
        {labelContent.company && labelCompanyName && <div className="aifWhLabelCompany">{labelCleanText(labelCompanyName, 48)}</div>}
        {labelContent.brand && label.brand && label.brand !== "-" && <div className="aifWhLabelBrand">{labelCleanText(label.brand, 42)}</div>}
        {labelContent.title && <div className="aifWhLabelTitle">{labelCleanText(label.title || "Produs", 72)}</div>}
        {labelContent.sizeColor && (label.size || label.color) && (
          <div className="aifWhLabelMeta">
            {label.size && label.size !== "-" && <span>{labelCleanText(label.size, 16)}</span>}
            {label.color && label.color !== "-" && <span>{labelCleanText(label.color, 24)}</span>}
          </div>
        )}
        {labelContent.barcode && <div className="aifWhBarcodeSvgWrap" dangerouslySetInnerHTML={{ __html: label.render.ok ? label.render.svg : "" }} />}
        {labelContent.description && label.description && <div className="aifWhLabelDescription">{labelCleanText(label.description, 90)}</div>}
        {labelContent.category && label.category && label.category !== "-" && <div className="aifWhLabelCategory">{labelCleanText(label.category, 34)}</div>}
        {labelContent.code && (label.productCode || label.barcode) && <div className="aifWhLabelCode">Cod: {labelCleanText(label.productCode || label.barcode, 44)}</div>}
        {labelContent.price && priceParts.major && (
          <div className="aifWhLabelPrice">
            <span className="aifWhPriceMajor">{priceParts.major}</span>
            {priceParts.cents && <span className="aifWhPriceCents">{priceParts.cents}</span>}
            <span className="aifWhPriceUnit">{labelCleanText(labelUnitText || labelCurrency, 12)}</span>
          </div>
        )}
      </>
    );
  }

  function toggleVariantSelection(id: string, checked: boolean) {
    if (!id) return;
    setSelectedVariants((current) => {
      const next = { ...current };
      if (checked) next[id] = true;
      else delete next[id];
      return next;
    });
    if (!checked) {
      setSelectedWorkActions((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }

  function toggleAllFilteredSelection(checked: boolean) {
    setSelectedVariants((current) => {
      const next = { ...current };
      for (const id of filteredVariantIds) {
        if (checked) next[id] = true;
        else delete next[id];
      }
      return next;
    });
    if (!checked) {
      setSelectedWorkActions((current) => {
        const next = { ...current };
        for (const id of filteredVariantIds) delete next[id];
        return next;
      });
    }
  }

  function clearSelectedVariants() {
    setSelectedVariants({});
    setSelectedWorkActions({});
    setPersistedSelectedItems([]);
    setSelectedActionTarget(null);
    setSelectedWorkPanel(null);
    setSelectedPanelOpen(false);
    apiClearSelectedVariantSelection()
      .then(() => {
        selectedSyncReadyRef.current = true;
        markSelectedCloudMigrationDone();
      })
      .catch((err) => {
        console.error("AIF selected variants clear failed", err);
      });
  }

  useEffect(() => {
    const selected = new Set(Object.keys(selectedVariants).filter((id) => selectedVariants[id]));
    setSelectedWorkActions((current) => {
      let changed = false;
      const next: Record<string, SelectedWorkAction> = {};
      for (const [id, action] of Object.entries(current) as Array<[string, SelectedWorkAction]>) {
        if (selected.has(id)) next[id] = action;
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [selectedVariants]);

  useEffect(() => {
    saveSelectedVariantsToStorage(selectedVariants);
  }, [selectedVariants]);

  useEffect(() => {
    saveSelectedVariantActionsToStorage(selectedWorkActions);
  }, [selectedWorkActions]);

  useEffect(() => {
    if (!selectedSyncReadyRef.current || selectedSyncSilentRef.current) return;
    if (selectedSyncTimerRef.current !== null) window.clearTimeout(selectedSyncTimerRef.current);
    selectedSyncTimerRef.current = window.setTimeout(() => {
      selectedSyncTimerRef.current = null;
      const payload = selectedPayloadFromState(selectedVariants, selectedWorkActions);
      apiSaveSelectedVariantSelection(payload)
        .then(() => markSelectedCloudMigrationDone())
        .catch((err) => {
          console.error("AIF selected variants sync failed", err);
        });
    }, 450);
    return () => {
      if (selectedSyncTimerRef.current !== null) {
        window.clearTimeout(selectedSyncTimerRef.current);
        selectedSyncTimerRef.current = null;
      }
    };
  }, [selectedVariants, selectedWorkActions]);

  useEffect(() => {
    if (selectedPanelOpen && selectedCount <= 0) setSelectedPanelOpen(false);
    if (selectedWorkPanel && selectedWorkCounts[selectedWorkPanel] <= 0) setSelectedWorkPanel(null);
  }, [selectedPanelOpen, selectedCount, selectedWorkPanel, selectedWorkCounts.label, selectedWorkCounts.order, selectedWorkCounts.move]);

  const activationTodoCount = useMemo(
    () => inventoryDisplayItems.filter((x) => n(x.total_qty) > 0 && needsWarehouseActivation(x)).length,
    [inventoryDisplayItems]
  );

  function showActivationTodoList() {
    setIncomingFocus(null);
    setIncomingFocusItems([]);
    setStockFilter("watch");
    setSortMode("incoming_desc");
    setFiltersOpen(false);
    setSummaryOpen(false);
    setListOpen(true);
    setProductPage(1);
    setMessage("Az aktiválandó készletes variánsokat mutatom. Amint egy modell és variáns aktív lesz, eltűnik innen és átkerül a normál raktárlistába.");
  }

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, x) => {
        acc.variants += 1;
        acc.qty += n(x.total_qty);
        acc.reserved += n(x.total_reserved_qty);
        acc.available += n(x.available_qty);
        acc.value += n(x.total_qty) * n(x.buy_price);
        if (hasMissingData(x)) acc.missing += 1;
        if (n(x.total_qty) > 0 && needsWarehouseActivation(x)) acc.watch += 1;
        return acc;
      },
      { variants: 0, qty: 0, reserved: 0, available: 0, value: 0, missing: 0, watch: 0 }
    );
  }, [filtered]);

  const brandChart = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; value: number }>();
    for (const x of filtered) {
      const key = x.brand_name || "Nincs márka";
      const row = map.get(key) || { name: key, qty: 0, value: 0 };
      row.qty += n(x.total_qty);
      row.value += n(x.total_qty) * n(x.buy_price);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filtered]);

  const locationChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stockRows) {
      const key = s.location_name || s.location_code || "Ismeretlen";
      map.set(key, (map.get(key) || 0) + n(s.qty));
    }
    return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [stockRows]);

  function resetCategoryForm() {
    setCategoryForm({ id: "", parentId: "", nameRo: "", nameHu: "", aliases: "", sortOrder: nextCategorySortOrder });
  }

  function editCategoryRow(c: MetaItem) {
    setTaxonomyTab("categories");
    setCategoryForm({
      id: String(c.id || c.code || ""),
      parentId: "",
      nameRo: String(c.name_ro || c.name || ""),
      nameHu: String(c.name_hu || ""),
      aliases: (Array.isArray(c.aliases) ? c.aliases : []).join(", "),
      sortOrder: c.sort_order == null ? nextCategorySortOrder : String(c.sort_order),
    });
  }


  function resetSubCategoryForm() {
    setSubCategoryForm({ id: "", parentId: mainCategories[0]?.id || "", nameRo: "", nameHu: "", aliases: "", sortOrder: nextSubCategorySortOrder });
  }

  function editSubCategoryRow(c: MetaItem) {
    setTaxonomyTab("subCategories");
    setSubCategoryForm({
      id: String(c.id || c.code || ""),
      parentId: String((c as any).parent_id || (c as any).parentId || ""),
      nameRo: String(c.name_ro || c.name || ""),
      nameHu: String(c.name_hu || ""),
      aliases: (Array.isArray(c.aliases) ? c.aliases : []).join(", "),
      sortOrder: c.sort_order == null ? nextSubCategorySortOrder : String(c.sort_order),
    });
  }

  function resetGenderForm() {
    setGenderForm({ code: "", name: "", aliases: "", sortOrder: nextGenderSortOrder });
  }

  function editGenderRow(g: GenderType) {
    setTaxonomyTab("genders");
    setGenderForm({
      code: String(g.code || ""),
      name: String(g.name || ""),
      aliases: (Array.isArray(g.aliases) ? g.aliases : []).join(", "),
      sortOrder: g.sort_order == null ? nextGenderSortOrder : String(g.sort_order),
    });
  }

  function resetColorForm() {
    setColorForm({ id: "", nameRo: "", nameHu: "", nameEn: "", nameDe: "", aliases: "", hex: "", sortOrder: nextColorSortOrder });
  }

  function editColorRow(c: ColorType) {
    setTaxonomyTab("colors");
    setColorForm({
      id: String(c.id || ""),
      nameRo: String(c.name_ro || ""),
      nameHu: String(c.name_hu || ""),
      nameEn: String(c.name_en || ""),
      nameDe: String(c.name_de || ""),
      aliases: (Array.isArray(c.aliases) ? c.aliases : []).join(", "),
      hex: String(c.hex || ""),
      sortOrder: c.sort_order == null ? nextColorSortOrder : String(c.sort_order),
    });
  }

  function colorTypeLabel(c?: ColorType | null) {
    if (!c) return "-";
    return c.name_hu || c.name_ro || c.name_en || c.code || "-";
  }

  function brandLabel(b?: MetaItem | null) {
    return b?.name || b?.code || "-";
  }

  function metaItemByValue<T extends MetaItem>(rows: T[], value: unknown) {
    const key = normalizeSearch(value);
    if (!key) return null;
    return rows.find((row) => [row.id, row.code, row.name, row.name_ro, row.name_hu].map(normalizeSearch).some((x) => x === key)) || null;
  }

  function standardSizeForBrandSize(brandValue: unknown, supplierSize: unknown) {
    const brandRow = metaItemByValue(brands, brandValue);
    const brandKeys = new Set([brandRow?.id, brandRow?.code, brandRow?.name, brandValue].map(normalizeSearch).filter(Boolean));
    const sizeKey = normalizeSearch(supplierSize);
    if (!brandKeys.size || !sizeKey) return "";
    const found = brandSizeCodes.find((row) => {
      const rowBrandKeys = [row.brand_id, row.brand_code, row.brand_name].map(normalizeSearch).filter(Boolean);
      return rowBrandKeys.some((key) => brandKeys.has(key)) && normalizeSearch(row.size_code || "") === sizeKey;
    });
    return found?.size_name || sizeTypes.find((size) => normalizeSearch(size.id) === normalizeSearch(found?.size_type_id))?.name || "";
  }

  function resetBrandColorForm() {
    setBrandColorForm({ id: "", brandId: brands[0]?.id || "", colorCode: "", colorTypeId: colorTypes[0]?.id || "", notes: "" });
  }

  function editBrandColorRow(row: BrandColorCode) {
    setTaxonomyTab("brandColors");
    setBrandColorForm({
      id: String(row.id || ""),
      brandId: String(row.brand_id || ""),
      colorCode: String(row.color_code || ""),
      colorTypeId: String(row.color_type_id || ""),
      notes: String(row.notes || ""),
    });
  }

  async function saveBrandColorForm() {
    if (!brandColorForm.brandId) {
      setMessage("A márka kiválasztása kötelező.");
      return;
    }
    if (!brandColorForm.colorCode.trim()) {
      setMessage("A gyártói színkód kötelező.");
      return;
    }
    if (!brandColorForm.colorTypeId) {
      setMessage("Az AllIn szín kiválasztása kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveBrandColorCode(brandColorForm.id, {
        brandId: brandColorForm.brandId,
        colorCode: brandColorForm.colorCode.trim().toUpperCase(),
        colorTypeId: brandColorForm.colorTypeId,
        notes: brandColorForm.notes,
      });
      resetBrandColorForm();
      await load();
      setMessage("Márka színkód mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a márka színkódot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  function resetMaterialForm() {
    setMaterialForm({ id: "", nameRo: "", nameHu: "", nameEn: "", nameDe: "", aliases: "", sortOrder: nextMaterialSortOrder });
  }

  function editMaterialRow(m: MaterialType) {
    setTaxonomyTab("materials");
    setMaterialForm({
      id: String(m.id || ""),
      nameRo: String(m.name_ro || ""),
      nameHu: String(m.name_hu || ""),
      nameEn: String(m.name_en || ""),
      nameDe: String(m.name_de || ""),
      aliases: (Array.isArray(m.aliases) ? m.aliases : []).join(", "),
      sortOrder: m.sort_order == null ? nextMaterialSortOrder : String(m.sort_order),
    });
  }

  function resetSizeForm() {
    setSizeForm({ id: "", code: "", name: "", nameHu: "", aliases: "", sortOrder: nextSizeSortOrder });
  }

  function editSizeRow(row: SizeType) {
    setTaxonomyTab("sizes");
    setSizeForm({
      id: String(row.id || ""),
      code: String(row.code || ""),
      name: String(row.name || ""),
      nameHu: String(row.name_hu || ""),
      aliases: (Array.isArray(row.aliases) ? row.aliases : []).join(", "),
      sortOrder: row.sort_order == null ? nextSizeSortOrder : String(row.sort_order),
    });
  }

  function resetBrandSizeForm() {
    setBrandSizeForm({ id: "", brandId: brands[0]?.id || "", sizeCode: "", sizeTypeId: sizeTypes[0]?.id || "", notes: "" });
  }

  function editBrandSizeRow(row: BrandSizeCode) {
    setTaxonomyTab("brandSizes");
    setBrandSizeForm({
      id: String(row.id || ""),
      brandId: String(row.brand_id || ""),
      sizeCode: String(row.size_code || ""),
      sizeTypeId: String(row.size_type_id || ""),
      notes: String(row.notes || ""),
    });
  }

  async function saveBrandSizeForm() {
    if (!brandSizeForm.brandId) {
      setMessage("A márka kiválasztása kötelező.");
      return;
    }
    if (!brandSizeForm.sizeCode.trim()) {
      setMessage("A gyártói méret / méretkód kötelező.");
      return;
    }
    if (!brandSizeForm.sizeTypeId) {
      setMessage("A standard AllIn méret kiválasztása kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveBrandSizeCode(brandSizeForm.id, {
        brandId: brandSizeForm.brandId,
        sizeCode: brandSizeForm.sizeCode.trim().toUpperCase(),
        sizeTypeId: brandSizeForm.sizeTypeId,
        notes: brandSizeForm.notes,
      });
      resetBrandSizeForm();
      await load();
      setMessage("Márkaméret mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a márkaméretet.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function saveCategoryForm() {
    if (!categoryForm.nameRo.trim()) {
      setMessage("A főkategória neve kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveCategory(categoryForm.id, {
        nameRo: categoryForm.nameRo,
        nameHu: categoryForm.nameHu,
        aliases: categoryForm.aliases,
        sortOrder: categoryForm.sortOrder,
        parentId: null,
      });
      resetCategoryForm();
      await load();
      setMessage("Főkategória mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a főkategóriát.");
    } finally {
      setTaxonomyBusy(false);
    }
  }


  async function saveSubCategoryForm() {
    if (!subCategoryForm.parentId) {
      setMessage("A főkategória kiválasztása kötelező az alkategóriához / terméktípushoz.");
      return;
    }
    if (!subCategoryForm.nameRo.trim()) {
      setMessage("Az alkategória / terméktípus román neve kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveCategory(subCategoryForm.id, {
        parentId: subCategoryForm.parentId,
        nameRo: subCategoryForm.nameRo,
        nameHu: subCategoryForm.nameHu,
        aliases: subCategoryForm.aliases,
        sortOrder: subCategoryForm.sortOrder,
      });
      resetSubCategoryForm();
      await load();
      setMessage("Alkategória / terméktípus mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni az alkategóriát / terméktípust.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function saveGenderForm() {
    if (!genderForm.name.trim()) {
      setMessage("A nem megnevezése kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveGenderType(genderForm.code, {
        name: genderForm.name,
        aliases: genderForm.aliases,
        sortOrder: genderForm.sortOrder,
      });
      resetGenderForm();
      await load();
      setMessage("Nem törzsadat mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a nem törzsadatot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function saveColorForm() {
    if (!colorForm.nameRo.trim()) {
      setMessage("A román hivatalos színnév kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveColorType(colorForm.id, {
        nameRo: colorForm.nameRo,
        nameHu: colorForm.nameHu,
        nameEn: colorForm.nameEn,
        nameDe: colorForm.nameDe,
        aliases: colorForm.aliases,
        hex: colorForm.hex,
        sortOrder: colorForm.sortOrder,
      });
      resetColorForm();
      await load();
      setMessage("Szín törzsadat mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a szín törzsadatot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function saveMaterialForm() {
    if (!materialForm.nameRo.trim()) {
      setMessage("A román hivatalos összetevőnév kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveMaterialType(materialForm.id, {
        nameRo: materialForm.nameRo,
        nameHu: materialForm.nameHu,
        nameEn: materialForm.nameEn,
        nameDe: materialForm.nameDe,
        aliases: materialForm.aliases,
        sortOrder: materialForm.sortOrder,
      });
      resetMaterialForm();
      await load();
      setMessage("Összetevő törzsadat mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni az összetevő törzsadatot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function saveSizeForm() {
    if (!sizeForm.name.trim()) {
      setMessage("A standard méret megnevezése kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveSizeType(sizeForm.id, {
        code: sizeForm.code,
        name: sizeForm.name.trim().toUpperCase(),
        nameHu: sizeForm.nameHu,
        aliases: sizeForm.aliases,
        sortOrder: sizeForm.sortOrder,
      });
      resetSizeForm();
      await load();
      setMessage("Standard méret mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a standard méretet.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function confirmDeleteTaxonomy() {
    if (!deleteTarget) return;
    setTaxonomyBusy(true);
    try {
      if (deleteTarget.kind === "category" || deleteTarget.kind === "subCategory") await apiDeleteCategory(deleteTarget.id);
      if (deleteTarget.kind === "gender") await apiDeleteGenderType(deleteTarget.id);
      if (deleteTarget.kind === "color") await apiDeleteColorType(deleteTarget.id);
      if (deleteTarget.kind === "brandColor") await apiDeleteBrandColorCode(deleteTarget.id);
      if (deleteTarget.kind === "material") await apiDeleteMaterialType(deleteTarget.id);
      if (deleteTarget.kind === "size") await apiDeleteSizeType(deleteTarget.id);
      if (deleteTarget.kind === "brandSize") await apiDeleteBrandSizeCode(deleteTarget.id);
      setDeleteTarget(null);
      setOpenTaxonomyMenu(null);
      await load();
      setMessage("Törzsadat frissítve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a törzsadatot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const [inv, meta, stock] = await Promise.all([apiInventory(), apiMeta(), apiStock()]);
      let brandColorRows = meta.brandColorCodes || [];
      if (!brandColorRows.length) {
        try {
          const extra = await apiListBrandColorCodes();
          brandColorRows = extra.items || [];
        } catch {
          brandColorRows = [];
        }
      }
      let brandSizeRows = meta.brandSizeCodes || [];
      if (!brandSizeRows.length) {
        try {
          const extra = await apiListBrandSizeCodes();
          brandSizeRows = extra.items || [];
        } catch {
          brandSizeRows = [];
        }
      }
      const stockBackedItems = stockBackedInventoryItems(inv.items || [], stock.items || []);
      setItems(stockBackedItems.filter((x) => !isArchivedInventoryItem(x)));
      setSuppliers(meta.suppliers || []);
      setBrands(meta.brands || []);
      setSupplierBrands(meta.supplierBrands || []);
      setCategories((meta.categories || []).slice().sort((a: MetaItem, b: MetaItem) => categoryLabel(a).localeCompare(categoryLabel(b), "hu", { sensitivity: "base" })));
      setGenderTypes(meta.genderTypes || []);
      setColorTypes(meta.colorTypes || []);
      setBrandColorCodes(brandColorRows);
      setMaterialTypes((meta.materialTypes || []).slice().sort((a: MaterialType, b: MaterialType) => (a.name_hu || a.name_ro || a.code).localeCompare(b.name_hu || b.name_ro || b.code, "hu", { sensitivity: "base" })));
      setSizeTypes((meta.sizeTypes || []).slice().sort((a: SizeType, b: SizeType) => sizeTypeLabel(a).localeCompare(sizeTypeLabel(b), "hu", { sensitivity: "base" })));
      setBrandSizeCodes(brandSizeRows);
      setLocations(meta.locations || []);
      setStockRows(stock.items || []);

      try {
        const savedSelection = await apiSelectedVariantSelection();
        const savedRows = (savedSelection.items || []).filter((row) => selectedVariantIdFromItem(row));
        if (savedRows.length) {
          markSelectedCloudMigrationDone();
          applyPersistedSelectedWorklist(savedRows);
        } else {
          setPersistedSelectedItems([]);
          selectedSyncReadyRef.current = true;
          const localPayload = selectedPayloadFromState(selectedVariants, selectedWorkActions);
          if (localPayload.length && !selectedCloudMigrationDone()) {
            markSelectedCloudMigrationDone();
            apiSaveSelectedVariantSelection(localPayload)
              .then((saved) => {
                if (saved?.items?.length) applyPersistedSelectedWorklist(saved.items);
              })
              .catch((err) => {
                console.error("AIF selected variants migration failed", err);
              });
          } else {
            markSelectedCloudMigrationDone();
          }
        }
      } catch (selectionError) {
        console.error("AIF selected variants load skipped", selectionError);
        selectedSyncReadyRef.current = true;
      }
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült betölteni a raktár adatait.");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setDetailBusy(true);
    setMessage("");
    try {
      const d = await apiVariantDetail(id);
      setDetail(d);
      const nextForm = formFromDetail(d);
      if (!nextForm.brandCode) {
        const listItem = items.find((it) => String(it.variant_id || "") === String(id));
        nextForm.brandCode = findBrandCodeForName(d.item?.brand_name || listItem?.brand_name || "");
      }
      nextForm.colorName = officialColorFromTypes(nextForm.colorName, colorTypes);
      nextForm.size = officialSizeFromTypes(nextForm.size, sizeTypes);
      setEdit(nextForm);
      setEditBaseline({ ...nextForm });
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült betölteni a termékadatlapot.");
    } finally {
      setDetailBusy(false);
    }
  }

  function stopBarcodeScannerCamera() {
    if (barcodeScanRafRef.current !== null) {
      window.cancelAnimationFrame(barcodeScanRafRef.current);
      barcodeScanRafRef.current = null;
    }
    if (barcodeZxingControlsRef.current?.stop) {
      try {
        barcodeZxingControlsRef.current.stop();
      } catch {
        // Már áll, nincs mit dramatizálni.
      }
      barcodeZxingControlsRef.current = null;
    }
    if (barcodeStreamRef.current) {
      barcodeStreamRef.current.getTracks().forEach((track) => track.stop());
      barcodeStreamRef.current = null;
    }
    if (barcodeVideoRef.current) {
      const currentSource = barcodeVideoRef.current.srcObject;
      if (currentSource && typeof (currentSource as MediaStream).getTracks === "function") {
        (currentSource as MediaStream).getTracks().forEach((track) => track.stop());
      }
      barcodeVideoRef.current.srcObject = null;
    }
  }

  function openBarcodeScanner(mode: BarcodeScannerMode) {
    barcodeScannerHandlingRef.current = false;
    setBarcodeScannerManualValue("");
    setBarcodeScannerStatus("Kamera indítása...");
    setBarcodeScanner({
      mode,
      title: mode === "editBarcode" ? "Vonalkód hozzáadása kamerával" : "Termék keresése vonalkóddal",
      helper:
        mode === "editBarcode"
          ? "Tartsd a ruhán lévő vonalkódot a kamera elé. A beolvasott kód bekerül a termék vonalkód mezőjébe."
          : "Tartsd a ruhán lévő vonalkódot a kamera elé. A beolvasott kód alapján csak a találatot mutatja a listában, nem nyitja meg külön az adatlapot.",
    });
  }

  function closeBarcodeScanner() {
    stopBarcodeScannerCamera();
    barcodeScannerHandlingRef.current = false;
    setBarcodeScanner(null);
    setBarcodeScannerStatus("");
    setBarcodeScannerManualValue("");
  }

  async function applyScannedBarcode(rawValue: unknown) {
    const code = cleanScannedBarcode(rawValue);
    if (!code) {
      setBarcodeScannerStatus("Nem érkezett olvasható vonalkód. Próbáld közelebb tartani a kódot, vagy írd be kézzel.");
      return;
    }
    if (barcodeScannerHandlingRef.current) return;
    barcodeScannerHandlingRef.current = true;

    const mode = barcodeScanner?.mode || "search";
    stopBarcodeScannerCamera();
    setBarcodeScanner(null);
    setBarcodeScannerStatus("");
    setBarcodeScannerManualValue("");

    if (mode === "editBarcode") {
      const currentVariantId = String(detail?.item?.id || detail?.item?.variant_id || "");
      const duplicate = items.find((item) => itemMatchesScannedBarcode(item, code) && String(item.variant_id || "") !== currentVariantId);
      setEdit((current) => ({ ...current, barcode: code }));
      setMessage(
        duplicate
          ? `Vonalkód beolvasva és beírva: ${code}. Figyelem: ez már szerepel ennél is: ${duplicate.title_ro || duplicate.internal_sku || duplicate.variant_id}. Mentés előtt ellenőrizd.`
          : `Vonalkód beolvasva és beírva: ${code}. Mentéssel rögzül a terméken.`
      );
      return;
    }

    const exactMatches = items.filter((item) => itemMatchesScannedBarcode(item, code));
    if (exactMatches.length === 1) {
      focusProductInList(exactMatches[0], code, `Vonalkód beolvasva: ${code}. A terméksorra ugrottam, adatlapot nem nyitok meg.`);
      return;
    }
    if (exactMatches.length > 1) {
      focusProductInList(exactMatches[0], code, `Vonalkód beolvasva: ${code}. Több egyezés van, az első találatra ugrottam.`);
      return;
    }

    resetListFiltersForProductFocus(code, code);
    setMessage(`Vonalkód beolvasva: ${code}. Pontos egyezés nem volt, a kereső erre a kódra lett állítva.`);
  }

  useEffect(() => {
    if (!barcodeScanner) return;

    let cancelled = false;

    async function attachPreviewStream(status: string) {
      const stream = await navigator.mediaDevices.getUserMedia(WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS);
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      barcodeStreamRef.current = stream;
      const video = barcodeVideoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setBarcodeScannerStatus(status);
    }

    async function startNativeBarcodeDetectorScanner() {
      const stream = await navigator.mediaDevices.getUserMedia(WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS);
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      barcodeStreamRef.current = stream;
      const video = barcodeVideoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();

      const NativeBarcodeDetector = window.BarcodeDetector;
      if (!NativeBarcodeDetector) {
        await startZxingFallbackScanner();
        return;
      }
      const supportedFormats = await NativeBarcodeDetector.getSupportedFormats?.().catch(() => []);
      const formats = Array.isArray(supportedFormats) && supportedFormats.length
        ? WAREHOUSE_BARCODE_SCAN_FORMATS.filter((format) => supportedFormats.includes(format))
        : WAREHOUSE_BARCODE_SCAN_FORMATS;
      const detector = new NativeBarcodeDetector(formats.length ? { formats } : undefined);

      setBarcodeScannerStatus("Kamera aktív. A beépített olvasó fut. Tartsd a vonalkódot a keretbe.");

      const scanFrame = async () => {
        if (cancelled || barcodeScannerHandlingRef.current) return;
        const currentVideo = barcodeVideoRef.current;
        if (currentVideo && currentVideo.readyState >= 2) {
          try {
            const detected = await detector.detect(currentVideo);
            const first = detected.find((item) => cleanScannedBarcode(item.rawValue));
            if (first?.rawValue) {
              await applyScannedBarcode(first.rawValue);
              return;
            }
          } catch {
            // Egy-egy sikertelen képkocka normális, a szkennelés folytatódik.
          }
        }
        if (!cancelled && !barcodeScannerHandlingRef.current) {
          barcodeScanRafRef.current = window.requestAnimationFrame(scanFrame);
        }
      };

      barcodeScanRafRef.current = window.requestAnimationFrame(scanFrame);
    }

    async function startZxingFallbackScanner() {
      setBarcodeScannerStatus("A beépített vonalkód-olvasó ezen a böngészőn nincs meg, ZXing fallback betöltése...");
      const zxing = await loadWarehouseZxingBrowser();
      if (cancelled) return;

      const Reader = zxing?.BrowserMultiFormatReader || zxing?.BrowserMultiFormatOneDReader;
      const video = barcodeVideoRef.current;
      if (!Reader || !video) {
        await attachPreviewStream("Kamera aktív, de az automatikus dekódoló nem érhető el ezen a böngészőn. Használd a kézi beírást.");
        return;
      }

      const reader = new Reader();
      if (typeof reader.decodeFromConstraints !== "function") {
        await attachPreviewStream("Kamera aktív, de ez a ZXing build nem ad folyamatos olvasót. Kézi beírás marad.");
        return;
      }

      const controls = await reader.decodeFromConstraints(
        WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS,
        video,
        async (result) => {
          const code = zxingResultText(result);
          if (code && !barcodeScannerHandlingRef.current) {
            await applyScannedBarcode(code);
          }
        }
      );

      if (cancelled) {
        controls?.stop?.();
        return;
      }
      barcodeZxingControlsRef.current = controls || null;
      setBarcodeScannerStatus("Kamera aktív. Laptopos ZXing olvasó megy. Tartsd a vonalkódot a keretbe.");
    }

    async function startBarcodeScannerCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setBarcodeScannerStatus("Ez a böngésző nem ad kamerát a weboldalnak. Használj USB-s scannert vagy kézi beírást.");
          return;
        }

        if (window.BarcodeDetector) {
          await startNativeBarcodeDetectorScanner();
          return;
        }

        await startZxingFallbackScanner();
      } catch (e: any) {
        const name = String(e?.name || "");
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setBarcodeScannerStatus("A kamera engedély nincs megadva. Engedélyezd a böngészőben, vagy használd a kézi beírást.");
          return;
        }
        if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setBarcodeScannerStatus("Nem található kamera ezen az eszközön.");
          return;
        }
        if (name === "NotReadableError" || name === "TrackStartError") {
          setBarcodeScannerStatus("A kamerát nem tudta megnyitni a böngésző. Lehet, hogy másik app használja, vagy az OS tiltja a hozzáférést.");
          return;
        }
        setBarcodeScannerStatus(e?.message || "Nem sikerült elindítani a kamerát.");
      }
    }

    startBarcodeScannerCamera();

    return () => {
      cancelled = true;
      stopBarcodeScannerCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeScanner?.mode]);

  useEffect(() => {
    return () => stopBarcodeScannerCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emptyStockRowsByLocation(defaultValue = "0") {
    return stockLocationRows.reduce<Record<string, string>>((acc, loc) => {
      acc[locationKey(loc)] = defaultValue;
      return acc;
    }, {});
  }

  function openNewProductModal() {
    const next = emptyNewProductForm();
    if (brand !== "all") next.brandCode = brand;
    if (category !== "all") next.categoryCode = category;
    if (gender !== "all") next.gender = gender;
    next.supplierId = supplier !== "all" ? String(selectedSupplier?.id || "") : "";
    setNewProduct(next);
    setNewProductStockRows(emptyStockRowsByLocation("0"));
    setNewProductOpen(true);
    setMessage("");
  }

  function closeNewProductModal() {
    if (newProductSaving) return;
    setNewProductOpen(false);
    setNewProduct(emptyNewProductForm());
    setNewProductStockRows({});
  }

  function newProductTotalQty(rows: Record<string, string> = newProductStockRows) {
    return stockLocationRows.reduce((sum, loc) => sum + Math.max(0, Math.floor(n(rows[locationKey(loc)]))), 0);
  }

  function setNewProductLocationQty(location: MetaItem, value: string) {
    const cleaned = String(value || "").replace(/[^0-9]/g, "");
    setNewProductStockRows((rows) => ({ ...rows, [locationKey(location)]: cleaned }));
  }

  async function saveNewProduct() {
    if (!newProduct.titleRo.trim()) {
      setMessage("A terméknév románul kötelező.");
      return;
    }
    if (!newProduct.size.trim()) {
      setMessage("A méret kötelező. One size esetén használd az OSFM-et.");
      return;
    }
    const totalQty = newProductTotalQty();
    if (totalQty <= 0) {
      setMessage("Legalább egy célhelyre adj meg készletet.");
      return;
    }
    setNewProductSaving(true);
    setMessage("");
    try {
      const stockRowsPayload = stockLocationRows
        .map((loc) => ({
          locationId: String(loc.id || ""),
          locationCode: String(loc.code || ""),
          qty: Math.max(0, Math.floor(n(newProductStockRows[locationKey(loc)]))),
        }))
        .filter((row) => row.qty > 0);

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
        colorName: normalizeColor(newProduct.colorName),
        size: normalizeSize(newProduct.size),
        buyPrice: newProduct.buyPrice,
        sellPrice: newProduct.sellPrice,
        compareAtPrice: newProduct.compareAtPrice,
        imageUrl: newProduct.imageUrl,
        status: newProduct.variantStatus || "active",
        supplierId: newProduct.supplierId || null,
        supplierProductCode: newProduct.supplierProductCode || newProduct.barcode || newProduct.titleRo,
        supplierVariantCode: newProduct.supplierVariantCode,
        supplierColorCode: newProduct.supplierColorCode || newProduct.colorCode,
        supplierSize: newProduct.supplierSize || newProduct.size,
        modelCode: newProduct.supplierProductCode || newProduct.barcode || newProduct.titleRo,
        qty: totalQty,
        stockRows: stockRowsPayload,
      };

      const created = await apiCreateManualProduct(payload);
      const createdVariantId = String(created.variantId || "").trim();
      const createdSearchText = String(newProduct.barcode || newProduct.snCod || newProduct.supplierProductCode || newProduct.titleRo || "").trim();
      const createdScannedCode = cleanScannedBarcode(newProduct.barcode || newProduct.snCod || "");
      notifyStockMovesChanged({ variantId: created.variantId, source: "warehouse_manual_product_create" });
      await load();
      setNewProductOpen(false);
      setNewProduct(emptyNewProductForm());
      setNewProductStockRows({});
      if (createdVariantId) {
        resetListFiltersForProductFocus(createdSearchText, createdScannedCode && normalizeSearch(createdScannedCode) === normalizeSearch(createdSearchText) ? createdScannedCode : "");
        queueProductRowJump(createdVariantId);
      }
      setMessage(createdVariantId
        ? `Új termék rögzítve ${totalQty} db készlettel. A terméksorra ugrottam, nem nyitottam külön adatlapot.`
        : `Új termék rögzítve ${totalQty} db készlettel.`);
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült létrehozni az új terméket.");
    } finally {
      setNewProductSaving(false);
    }
  }

  async function saveDetail() {
    if (!detail?.item?.id || !detailHasChanges) return;
    const detailId = String(detail.item.id || detail.item.variant_id || "");
    const wasActivationWorkView = stockFilter === "watch" || Boolean(incomingFocus?.batchId);
    setSaving(true);
    setMessage("");
    try {
      await apiVariantUpdate(detail.item.id, {
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
        supplierProductCode: edit.supplierProductCode,
        productCode: edit.supplierProductCode,
        snCod: edit.snCod,
        customsTariffCode: edit.customsTariffCode,
        colorCode: edit.colorCode,
        colorName: normalizeColor(edit.colorName),
        size: normalizeSize(edit.size),
        buyPrice: edit.buyPrice,
        sellPrice: edit.sellPrice,
        imageUrl: edit.imageUrl,
        status: edit.variantStatus,
      });
      const d = await apiVariantDetail(detail.item.id);
      const formResolvedActivation = String(edit.modelStatus || "").toLowerCase() === "active" && String(edit.variantStatus || "").toLowerCase() === "active";
      const resolvedActivation = formResolvedActivation || !needsWarehouseActivation(d.item as InventoryItem);
      if (incomingFocus?.batchId && resolvedActivation) {
        setIncomingFocusItems((current) => current.filter((item) => selectedVariantIdFromItem(item) !== detailId));
        setIncomingFocus((current) => current ? {
          ...current,
          variantIds: (current.variantIds || []).filter((id) => String(id || "") !== detailId),
          rows: (current.rows || []).filter((row: any) => String(row.variant_id || row.variantId || "") !== detailId),
        } : current);
      }
      if (wasActivationWorkView && resolvedActivation) {
        setDetail(null);
        setEditBaseline(emptyForm());
      } else {
        const savedForm = formFromDetail(d);
        if (!savedForm.brandCode) {
          const listItem = items.find((it) => String(it.variant_id || "") === String(detailId));
          savedForm.brandCode = findBrandCodeForName(d.item?.brand_name || listItem?.brand_name || "");
        }
        savedForm.colorName = officialColorFromTypes(savedForm.colorName, colorTypes);
        savedForm.size = officialSizeFromTypes(savedForm.size, sizeTypes);
        setDetail(d);
        setEdit(savedForm);
        setEditBaseline({ ...savedForm });
      }
      await load();
      if (incomingFocus?.batchId && !resolvedActivation && isUuidLike(incomingFocus.batchId)) await loadIncomingFocusBatch(incomingFocus.batchId, false);
      if (wasActivationWorkView && resolvedActivation) {
        setMessage("A termék aktív lett, ezért levettem az aktiválandó listáról.");
        setHighlightProductId((current) => current === detailId ? "" : current);
        setPendingProductJumpId((current) => current === detailId ? "" : current);
      } else {
        setMessage("A termékadatok mentése megtörtént.");
      }
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a termékadatokat.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteProduct() {
    if (!productDeleteTarget?.variant_id) return;
    setSaving(true);
    setMessage("");
    const deletedVariantId = String(productDeleteTarget.variant_id || "");
    const activeIncomingBatchId = String(incomingFocus?.batchId || "").trim();
    try {
      const result = await apiVariantDelete(deletedVariantId);
      notifyStockMovesChanged({ variantId: deletedVariantId, source: "warehouse_variant_permanent_delete", mode: result?.mode || "deleted" });
      removeVariantFromWarehouseClientState(deletedVariantId);
      setProductDeleteTarget(null);
      if (detail?.item?.id && String(detail.item.id) === deletedVariantId) setDetail(null);
      await load();
      if (activeIncomingBatchId && isUuidLike(activeIncomingBatchId)) await loadIncomingFocusBatch(activeIncomingBatchId, false);
      setMessage(result?.mode === "archived" || result?.mode === "archived_after_delete_fallback"
        ? "Termék archiválva és eltávolítva a raktárlistából."
        : "Termék véglegesen törölve: készlet, import-kapcsolat, mozgásnapló és beszállítói kapcsolat kitakarítva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a terméket.");
    } finally {
      setSaving(false);
    }
  }

  async function onImageSelected(file: File | null) {
    if (!file || !detail?.item?.id) return;
    setSaving(true);
    setMessage("");
    try {
      const up = await uploadImage(file, detail.item.id);
      setEdit((x) => ({ ...x, imageUrl: up.url }));
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült feltölteni a képet.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const consumeIncomingShowAllFlag = () => {
      if (typeof window === "undefined") return null as null | Record<string, any>;
      let payload: Record<string, any> | null = null;
      try {
        const raw = window.localStorage.getItem(warehouseShowAllAfterIncomingStorageKey);
        if (raw) {
          payload = JSON.parse(raw);
          window.localStorage.removeItem(warehouseShowAllAfterIncomingStorageKey);
        }
      } catch {
        payload = null;
      }
      if (payload) {
        resetWarehouseFilters(false);
        setSortMode("incoming_desc");
        setFiltersOpen(false);
        setSummaryOpen(false);
        setListOpen(true);
      }
      return payload;
    };

    const incomingPayload = consumeIncomingShowAllFlag();
    load().then(async () => {
      const batchId = String(incomingPayload?.importBatchId || incomingPayload?.batchId || "").trim();
      if (batchId && isUuidLike(batchId)) {
        await loadIncomingFocusBatch(batchId, true);
      } else if (incomingPayload) {
        setMessage("Készletre vétel után töröltem a raktárszűrőket és betöltöttem az utolsó bevételezés sorait. Ha egy import sor már meglévő variánsra ment, a fő raktári termékszám nem nő, csak a készlet badge változik.");
      }
    });

    const onIncomingShowAll = () => {
      const payload = consumeIncomingShowAllFlag();
      load().then(async () => {
        const batchId = String(payload?.importBatchId || payload?.batchId || "").trim();
        if (batchId && isUuidLike(batchId)) {
          await loadIncomingFocusBatch(batchId, true);
        } else if (payload) {
          setMessage("Készletre vétel után töröltem a raktárszűrőket és a legfrissebb készletmozgásokat tettem felülre.");
        }
      });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === warehouseShowAllAfterIncomingStorageKey && event.newValue) onIncomingShowAll();
    };

    if (typeof window !== "undefined") {
      window.addEventListener(warehouseShowAllAfterIncomingEventName, onIncomingShowAll);
      window.addEventListener("storage", onStorage);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(warehouseShowAllAfterIncomingEventName, onIncomingShowAll);
        window.removeEventListener("storage", onStorage);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxBrandValue = Math.max(1, ...brandChart.map((x) => x.value));
  const maxLocationQty = Math.max(1, ...locationChart.map((x) => x.qty));

  function chartFillWidth(value: number, maxValue: number) {
    const cleanValue = Number.isFinite(value) ? value : 0;
    const cleanMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 1;
    if (cleanValue <= 0) return "0%";
    return `${Math.min(100, Math.max(4, (cleanValue / cleanMax) * 100))}%`;
  }

  function taxonomyMenuOpensUp(index: number, total: number) {
    if (total <= 3) return false;
    return index >= Math.max(2, total - 2);
  }

  function taxonomyActionMenu(args: {
    menuId: string;
    openUp?: boolean;
    onEdit: () => void;
    onDelete: () => void;
  }) {
    const isOpen = openTaxonomyMenu === args.menuId;
    return (
      <div className="relative shrink-0">
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/18 bg-[#3f4959] text-white/80 hover:bg-[#475365] hover:text-white"
          onClick={() => setOpenTaxonomyMenu(isOpen ? null : args.menuId)}
          type="button"
          aria-label="Műveletek"
        >
          <MoreVertical size={15} />
        </button>
        {isOpen && (
          <div className={`absolute right-0 z-50 w-40 rounded-xl border border-white/18 bg-[#2f394a] p-1.5 shadow-2xl ${args.openUp ? "bottom-full mb-2" : "top-full mt-2"}`}>
            <button
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-white/90 hover:bg-white/10"
              onClick={() => {
                setOpenTaxonomyMenu(null);
                args.onEdit();
              }}
              type="button"
            >
              <Edit3 size={13} /> Szerkesztés
            </button>
            <button
              className="mt-1 flex h-8 w-full items-center gap-2 rounded-lg border border-rose-300/28 bg-[#cf1028] px-2.5 text-left text-xs text-white shadow-[0_0_14px_rgba(207,16,40,0.25)] hover:bg-[#aa0d21]"
              onClick={() => {
                setOpenTaxonomyMenu(null);
                args.onDelete();
              }}
              type="button"
            >
              <Trash2 size={13} /> Törlés
            </button>
          </div>
        )}
      </div>
    );
  }


  const selectedColorFilter = color === "all" ? null : findColorTypeByValue(colorTypes, color);
  const selectedColorFilterLabel = selectedColorFilter ? colorTypeLabel(selectedColorFilter) : (color === "all" ? "Összes" : String(color || "-"));
  const selectedColorFilterHex = selectedColorFilter?.hex || "";

  return (
    <main className={page}>
      <style id="aifWarehouseLabelPrintCss">{WAREHOUSE_LABEL_APP_CSS}</style>
      <div className={`${shell} aifWarehouseScreenContent`}>
        <header className="rounded-2xl border border-white/20 bg-[#303a4c] px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.05]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] border-l-4 border-[#7bd7d4]/70 pl-3">
              <p className="text-[11px] uppercase tracking-[0.18em] leading-none text-[#cffffd]/70">AllInFashion</p>
              <h1 className="mt-1 text-xl leading-tight tracking-tight text-white">Raktár</h1>
              <p className="mt-0.5 text-[11px] leading-snug text-white/52">Termék- és készletközpont</p>
            </div>
            <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
              <button
                className={buyPricesVisible ? headerPrimaryBtn : headerBtnSoft}
                onClick={() => setBuyPricesVisible((x) => !x)}
                type="button"
                title={buyPricesVisible ? "Vételár homályosítása" : "Vételár megjelenítése"}
              >
                {buyPricesVisible ? <EyeOff size={15} /> : <Eye size={15} />} {buyPricesVisible ? "Vételár látszik" : "Vételár rejtve"}
              </button>
              <button className={headerPrimaryBtn} onClick={openNewProductModal} type="button"><Plus size={15} /> Új termék</button>
              <button className={headerBtnSoft} onClick={() => setTaxonomyOpen(true)}><Edit3 size={15} /> Törzsadatok</button>
              {hasActiveWarehouseFilters && <button className={headerPrimaryBtn} onClick={() => resetWarehouseFilters()} type="button"><Eye size={14} /> Minden termék</button>}
              <button className={headerBtnSoft} onClick={focusLatestCommittedImportBatch} disabled={busy || recentImportFocusBusy} type="button" title="A legutóbb készletre vett import konkrét terméksorait mutatja">
                <PackageCheck size={15} /> {recentImportFocusBusy ? "Import betöltése..." : "Utolsó import"}
              </button>
              <button className={headerBtnSoft} onClick={load} disabled={busy}><RefreshCw size={15} /> Frissítés</button>
              <button className={`${headerBtn} ml-2 border-white/30 bg-[#263246] px-3`} onClick={goHome} type="button" title="Kezdőlap"><Home size={15} /> Kezdőlap</button>
            </div>
          </div>
        </header>

        {message && <div className="rounded-xl border border-white/20 bg-[#404a5b] px-4 py-3 text-sm text-white/85">{message}</div>}
        <datalist id="warehouse-standard-size-options">
          {sizeTypes.map((st) => <option key={st.id} value={st.name || st.code}>{st.name_hu || st.code}</option>)}
        </datalist>
        <datalist id="warehouse-color-options">
          {colorTypes.map((c) => <option key={c.id} value={c.name_ro}>{c.name_hu || c.code}</option>)}
        </datalist>

        <section className={`${panel} overflow-visible`}>
          <div className={`${panelHead} ${filtersOpen ? "border-b border-white/12" : ""}`}>
            <div className="flex items-center gap-2"><Filter size={17} /><span>Szűrés és keresés</span></div>
            <button className={btnSoft} onClick={() => setFiltersOpen((x) => !x)}>{filtersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {filtersOpen ? "Bezárás" : "Megnyitás"}</button>
          </div>
          {filtersOpen && (
            <div className="grid gap-3 p-4 md:grid-cols-5">
              <label className={`${label} md:col-span-2`}>
                Keresés
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 text-white/40" size={18} />
                  <input className={`${input} w-full pl-10 pr-12`} value={search} onChange={(e) => { setScannedBarcodeSearch(""); setSearch(e.target.value); }} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Név, beszállító, márka, vonalkód, S/N/COD, szín, méret" />
                  <button
                    className="absolute right-1.5 top-1.5 inline-flex h-7 w-9 items-center justify-center rounded-lg border border-[#7bd7d4]/35 bg-[#2a8d8b]/70 text-white shadow-[0_0_10px_rgba(42,141,139,0.18)] hover:bg-[#2a8d8b] focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/45"
                    type="button"
                    onClick={() => openBarcodeScanner("search")}
                    title="Vonalkód beolvasása kamerával"
                    aria-label="Vonalkód beolvasása kamerával a kereséshez"
                  >
                    <Barcode size={15} />
                  </button>
                </div>
              </label>
              <label className={label}>S/N/COD
                <input className={input} value={snCodFilter} onChange={(e) => setSnCodFilter(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="pl. S0626" />
              </label>
              <label className={label}>Beszállító
                <select className={select} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                  <option value="all">Összes</option>
                  {suppliers.map((s) => <option key={s.id} value={s.code || s.name || s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className={label}>Márka
                <select className={select} value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="all">{selectedSupplier ? "Összes kapcsolt márka" : "Összes"}</option>
                  {brandOptions.map((b) => <option key={b.id} value={b.code || b.name || b.id}>{b.name}</option>)}
                  {selectedSupplier && !brandOptions.length && <option value="" disabled>Nincs kapcsolt márka</option>}
                </select>
              </label>
              <label className={label}>Főkategória
                <select className={select} value={category} onChange={(e) => { setCategory(e.target.value); setSubCategory("all"); }}>
                  <option value="all">Összes</option>
                  {categorySelectOptions.map((c) => <option key={c.id} value={c.code || c.name_ro || c.id}>{categoryLabel(c)}</option>)}
                </select>
              </label>
              <label className={label}>Alkategória / terméktípus
                <select className={select} value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
                  <option value="all">Összes</option>
                  {subCategoryFilterOptions.map((c) => <option key={c.id} value={c.code || c.name_ro || c.id}>{categoryLabel(c)}</option>)}
                  {!subCategoryFilterOptions.length && <option value="" disabled>Nincs alkategória</option>}
                </select>
              </label>
              <label className={label}>Nem
                <select className={select} value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="all">Összes</option>
                  {genderTypes.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                </select>
              </label>
              <div ref={colorFilterRef} className={`${label} relative`}>
                Szín
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none transition hover:bg-[#475365] focus:border-[#7bd7d4]/55 focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/25"
                  onClick={() => setColorFilterOpen((x) => !x)}
                  aria-haspopup="listbox"
                  aria-expanded={colorFilterOpen}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/30 bg-white/10"
                      style={selectedColorFilterHex ? { backgroundColor: selectedColorFilterHex } : undefined}
                    />
                    <span className="truncate">{selectedColorFilterLabel}</span>
                  </span>
                  <ChevronDown size={15} className={`shrink-0 text-white/55 transition ${colorFilterOpen ? "rotate-180" : ""}`} />
                </button>
                {colorFilterOpen && (
                  <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-64 overflow-auto rounded-xl border border-white/18 bg-[#293344] py-1 shadow-2xl" role="listbox">
                    <button
                      type="button"
                      className={`flex h-8 w-full items-center gap-2 px-3 text-left text-xs transition ${color === "all" ? "bg-white/[0.10] text-white" : "text-white/76 hover:bg-white/[0.07]"}`}
                      onClick={() => { setColor("all"); setColorFilterOpen(false); }}
                      role="option"
                      aria-selected={color === "all"}
                    >
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/30 bg-white/10" />
                      <span className="truncate">Összes</span>
                    </button>
                    <div className="my-1 h-px bg-white/10" />
                    {colorTypes.map((c) => {
                      const value = String(c.id || c.code || c.name_ro || "");
                      const active = color !== "all" && (colorKey(color) === colorKey(value) || itemMatchesColorSelection({ color_name: c.name_ro, color_code: c.code }, color, [c]));
                      return (
                        <button
                          key={c.id || c.code}
                          type="button"
                          className={`flex h-8 w-full items-center gap-2 px-3 text-left text-xs transition ${active ? "bg-white/[0.10] text-white" : "text-white/76 hover:bg-white/[0.07]"}`}
                          onClick={() => { setColor(value); setColorFilterOpen(false); }}
                          title={c.name_ro || c.name_hu || c.code}
                          role="option"
                          aria-selected={active}
                        >
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/30 bg-white/10" style={c.hex ? { backgroundColor: c.hex } : undefined} />
                          <span className="truncate">{colorTypeLabel(c)}</span>
                        </button>
                      );
                    })}
                    {!colorTypes.length && <span className="block px-3 py-1 text-[11px] text-white/45">Nincs szín törzsadat.</span>}
                  </div>
                )}
              </div>
              <label className={label}>Cél hely
                <select className={select} value={location} onChange={(e) => setLocation(e.target.value)}>
                  <option value="all">Összes</option>
                  {locations.map((l) => <option key={l.id} value={l.code || l.name || l.id}>{l.name}</option>)}
                </select>
              </label>
              <label className={label}>Készlet állapot
                <select className={select} value={stockFilter} onChange={(e) => setStockFilter(e.target.value as StockFilter)}>
                  <option value="all">Összes</option>
                  <option value="available">Készleten</option>
                  <option value="out">Nincs készleten</option>
                  <option value="reserved">Van foglalás</option>
                  <option value="missing">Hiányzó adat</option>
                  <option value="watch">Aktiválandó készlet</option>
                </select>
              </label>
              <label className={label}>Kép
                <select className={select} value={imageFilter} onChange={(e) => setImageFilter(e.target.value as ImageFilter)}>
                  <option value="all">Összes</option>
                  <option value="with">Van kép</option>
                  <option value="missing">Hiányzik kép</option>
                </select>
              </label>
              <label className={label}>Sorrend
                <select className={select} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="incoming_desc">Legutóbbi bevételezés</option>
                  <option value="name">Terméknév</option>
                  <option value="brand">Márka</option>
                  <option value="stock_desc">Készlet csökkenő</option>
                  <option value="stock_asc">Készlet növekvő</option>
                  <option value="value_desc">Készletérték</option>
                  <option value="missing">Hiányzó adatok</option>
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button className={btn} onClick={load} disabled={busy}><Search size={16} /> Keresés</button>
                <button className={btnSoft} onClick={() => resetWarehouseFilters(false)} type="button">Alaphelyzet</button>
              </div>
            </div>
          )}
        </section>

        <section className={panel}>
          <div className={`${panelHead} ${summaryOpen ? "border-b border-white/12" : ""}`}>
            <div className="flex items-center gap-2"><Boxes size={17} /><span>Áttekintés</span></div>
            <button className={btnSoft} onClick={() => setSummaryOpen((x) => !x)}>{summaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {summaryOpen ? "Bezárás" : "Megnyitás"}</button>
          </div>
          {summaryOpen && (
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Variáns</p><p className="mt-1 text-xl">{totals.variants}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Össz készlet</p><p className="mt-1 text-xl">{totals.qty}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Elérhető</p><p className="mt-1 text-xl">{totals.available}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Foglalt</p><p className="mt-1 text-xl">{totals.reserved}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Készletérték</p><p className="mt-1 text-xl"><SensitiveValueText value={totals.value} /></p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Aktiválandó</p><p className="mt-1 text-xl">{activationTodoCount}</p></div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/40 bg-white p-4 text-slate-900 shadow-[0_10px_28px_rgba(15,23,42,0.12)]">
                  <p className="mb-3 text-sm text-slate-700">Márkák készletérték szerint</p>
                  <div className="space-y-2">
                    {brandChart.map((x) => (
                      <div key={x.name} className="grid gap-1">
                        <div className="flex justify-between gap-3 text-xs text-slate-600"><span>{x.name}</span><span>{buyPricesVisible ? money(x.value) : "••••"}</span></div>
                        <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-[#276454]" style={{ width: chartFillWidth(x.value, maxBrandValue) }} /></div>
                      </div>
                    ))}
                    {!brandChart.length && <p className="text-sm text-slate-500">Nincs megjeleníthető adat.</p>}
                  </div>
                </div>
                <div className="rounded-xl border border-white/40 bg-white p-4 text-slate-900 shadow-[0_10px_28px_rgba(15,23,42,0.12)]">
                  <p className="mb-3 text-sm text-slate-700">Készlet célhelyenként</p>
                  <div className="space-y-2">
                    {locationChart.map((x) => (
                      <div key={x.name} className="grid gap-1">
                        <div className="flex justify-between gap-3 text-xs text-slate-600"><span>{x.name}</span><span>{x.qty}</span></div>
                        <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-[#276454]" style={{ width: chartFillWidth(x.qty, maxLocationQty) }} /></div>
                      </div>
                    ))}
                    {!locationChart.length && <p className="text-sm text-slate-500">Nincs megjeleníthető adat.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section ref={productListRef} className="overflow-hidden rounded-2xl border border-white/20 bg-[#515d6e] shadow-xl">
          <div className={`flex flex-wrap items-center justify-between gap-3 bg-[#303a4c] px-4 py-3 ${listOpen ? "border-b border-white/16" : ""}`}>
            <div className="flex flex-wrap items-center gap-2 text-white/95">
              <Eye size={17} />
              <span>Terméklista</span>
              <span className={chip}>{filtered.length} variáns</span>
              {hasActiveWarehouseFilters && <span className="rounded-full border border-amber-200/30 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-50">Szűrve: {filtered.length}/{items.length}</span>}
              {filtered.length > 0 && <span className={chip}>{productPageStartIndex}-{productPageEndIndex} látható</span>}
              {selectedCount > 0 && (
                <span className="rounded-full border border-[#2a8d8b]/45 bg-[#2a8d8b]/18 px-2.5 py-1 text-xs text-white">
                  {selectedCount} kijelölve
                </span>
              )}
              {incomingFocus && (
                <span className="rounded-full border border-[#7bd7d4]/35 bg-[#2a8d8b]/12 px-2.5 py-1 text-xs text-[#d7fffd]">
                  Utolsó bevételezés: {incomingFocus.rows.length || incomingFocus.variantIds.length} sor / {incomingFocus.variantIds.length} variáns{incomingFocus.totalQty ? ` / ${incomingFocus.totalQty} db` : ""}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                className={sortMode === "incoming_desc" ? primaryBtn : btnSoft}
                onClick={focusLatestCommittedImportBatch}
                type="button"
                title="A legutóbbi készletre vett import összes raktári variánsát mutatja"
              >
                <RefreshCw size={15} /> Legutóbbi bevételezés
              </button>
              {incomingFocus && (
                <button
                  className={btnSoft}
                  onClick={() => { setIncomingFocus(null); setIncomingFocusItems([]); setProductPage(1); setMessage("Utolsó bevételezés szűrő törölve. Most újra az összes raktári variáns látszik."); }}
                  type="button"
                  title="Csak az utolsó import sorainak mutatását kikapcsolja"
                >
                  <X size={15} /> Import szűrő törlése
                </button>
              )}
              {selectedCount > 0 && (
                <>
                  <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] font-normal" onClick={() => setSelectedPanelOpen(true)} type="button">
                    <Eye size={15} /> Kijelöltek megnyitása
                  </button>
                  <button className={btnSoft} onClick={clearSelectedVariants} type="button" title="A mentett kijelölési listát is törli">
                    <X size={15} /> Kijelölés törlése
                  </button>
                </>
              )}
              {hasActiveWarehouseFilters && (
                <button className={btnSoft} onClick={() => resetWarehouseFilters()} type="button" title="Minden szűrő törlése">
                  <X size={15} /> Szűrők törlése
                </button>
              )}
              <button className={btnSoft} onClick={() => setListOpen((x) => !x)}>{listOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {listOpen ? "Bezárás" : "Megnyitás"}</button>
            </div>
          </div>
          {listOpen && (
            <div className="p-4">
              {productPager}
              {incomingFocus?.batchId ? (
                <div className="mb-3 rounded-xl border border-[#5bd0cc]/35 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-white">A legutóbbi bevezetés még aktiválandó sorait mutatom.</p>
                      <p className="mt-1">Forrás: {String(incomingFocus.sourceFileName || incomingFocus.batch?.source_file_name || incomingFocus.batchId || "import")} • import sor: {incomingFocus.rows.length || incomingFocus.variantIds.length} • megjelenő variáns: {filtered.length}/{incomingFocus.variantIds.length}{incomingFocus.totalQty ? ` • ${incomingFocus.totalQty} db` : ""}</p>
                      <p className="mt-1 text-[#bdf5f2]">Amint a Modell állapot és a Variáns állapot aktív, a sor eltűnik innen. A készlet nem tűnik el, csak átkerül a normál raktárlistába.</p>
                    </div>
                    <button className={btnSoft} onClick={() => resetWarehouseFilters()} type="button"><X size={14} /> Minden raktári variáns</button>
                  </div>
                </div>
              ) : sortMode === "incoming_desc" && (
                <div className="mb-3 rounded-xl border border-[#5bd0cc]/24 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                  Legutóbbi bevételezés szerinti sorrend van bekapcsolva. A lista termékvariánsokat mutat, ezért ha az import már meglévő modell + szín + méret sorra ment, nem új sor jön létre, hanem a készlet darabszáma nő.
                </div>
              )}
              {hasActiveWarehouseFilters && (
                <div className="mb-3 rounded-xl border border-amber-200/26 bg-amber-400/10 px-3 py-2 text-xs text-amber-50">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">A terméklista most szűrve van, ezért nem minden készleten lévő sor látszik.</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {activeWarehouseFilterLabels.map((filterLabel) => (
                          <span key={filterLabel} className="rounded-full border border-amber-200/22 bg-black/12 px-2 py-0.5 text-[11px] text-amber-50">{filterLabel}</span>
                        ))}
                      </div>
                    </div>
                    <button className={btnSoft} onClick={() => resetWarehouseFilters()} type="button">Minden termék mutatása</button>
                  </div>
                </div>
              )}
              {filtered.length > 0 && (
                <div className="mb-3 rounded-xl border border-white/12 bg-white/[0.045] px-3 py-2 text-xs text-white/55">
                  A raktárlista termékvariánsonként összesít: külön méret külön sor. Importnál a már létező modell + szín + méret nem új terméksor, hanem a meglévő sor készlete nő.
                  {incomingFocus ? (
                    <span className="mt-1 block text-[#d7fffd]">Most az utolsó bevezetés aktiválandó listája aktív, ezért csak azok a sorok látszanak, amelyeknél a modell vagy a variáns még nem aktív.</span>
                  ) : null}
                </div>
              )}
              <div className="hidden overflow-auto rounded-xl border border-white/20 bg-[#465163] lg:block">
                <table className="min-w-[1120px] w-full table-fixed text-left text-[12px]">
                  <colgroup>
                    <col style={{ width: "42px" }} />
                    <col style={{ width: "62px" }} />
                    <col style={{ width: "94px" }} />
                    <col style={{ width: "250px" }} />
                    <col style={{ width: "138px" }} />
                    <col style={{ width: "92px" }} />
                    <col style={{ width: "58px" }} />
                    <col style={{ width: "98px" }} />
                    <col style={{ width: "88px" }} />
                    <col style={{ width: "92px" }} />
                    <col style={{ width: "62px" }} />
                    <col style={{ width: "86px" }} />
                  </colgroup>
                  <thead className="bg-[#2f3a4c] text-[10px] uppercase tracking-[0.08em] text-white/72">
                    <tr>
                      <th className="px-2 py-3 text-center align-middle font-normal">
                        <input
                          className={selectBox}
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={(e) => toggleAllFilteredSelection(e.target.checked)}
                          disabled={!filteredVariantIds.length}
                          aria-label="Az aktuális oldal termékeinek kijelölése"
                          title="Az aktuális oldal termékeinek kijelölése"
                        />
                      </th>
                      <th className="px-2 py-3 text-center align-middle font-normal">Kép</th>
                      <th className="px-2 py-3 text-left align-middle font-normal">Márka</th>
                      <th className="px-2 py-3 text-left align-middle font-normal">Terméknév</th>
                      <th className="px-2 py-3 text-center align-middle font-normal">Főkat. / alkat.</th>
                      <th className="px-2 py-3 text-center align-middle font-normal">Szín</th>
                      <th className="px-2 py-3 text-center align-middle font-normal">Méret</th>
                      <th className="px-2 py-3 text-center align-middle font-normal">Készlet</th>
                      <th className="px-2 py-3 text-center align-middle font-normal">Vételár</th>
                      <th className="px-2 py-3 text-center align-middle font-normal">Eladási ár</th>
                      <th className="px-2 py-3 text-center align-middle font-normal">Áll.</th>
                      <th className="px-2 py-3 text-center align-middle font-normal">Műv.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/12 align-middle">
                    {productPageItems.map((it, index) => {
                      const variantId = String(it.variant_id || "");
                      const isSelected = Boolean(selectedVariants[variantId]);
                      const isHighlighted = Boolean(highlightProductId && variantId === highlightProductId);
                      return (
                      <tr
                        key={it.variant_id}
                        data-aif-variant-id={variantId}
                        className={`${isHighlighted ? "bg-amber-400/18 ring-2 ring-inset ring-amber-200/75" : isSelected ? "bg-[#2a8d8b]/18 ring-1 ring-inset ring-[#2a8d8b]/45" : "odd:bg-[#526071] even:bg-[#4c5869]"} relative scroll-mt-32 align-middle hover:bg-[#617084]`}
                      >
                        <td className="px-2 py-2.5 text-center align-middle">
                          <input
                            className={selectBox}
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleVariantSelection(String(it.variant_id || ""), e.target.checked)}
                            aria-label={`${it.title_ro || "Termék"} kijelölése`}
                          />
                        </td>
                        <td className="px-2 py-2.5 text-center align-middle">
                          {it.image_url ? <img src={it.image_url} alt="" className="mx-auto h-11 w-11 rounded-lg object-cover" /> : <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-black/20 text-white/35"><ImagePlus size={17} /></div>}
                        </td>
                        <td className="truncate px-2 py-2.5 text-left align-middle" title={it.brand_name || ""}>{it.brand_name || "-"}</td>
                        <td className="relative min-w-0 overflow-visible px-2 py-2.5 text-left align-middle">
                          <button
                            className="block max-w-full truncate text-left text-[13px] leading-5 text-white hover:text-[#cffffd] focus:outline-none focus:underline"
                            onClick={() => openDetail(it.variant_id)}
                            title={it.title_ro || "Termék részletei"}
                            type="button"
                          >
                            {it.title_ro || "-"}
                          </button>
                          <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-visible text-[11px] leading-4">
                            <span className="relative z-40 min-w-0 overflow-visible"><ProductCodeTooltipButton item={it} openUp={index >= Math.max(0, productPageItems.length - 3)} /></span>
                          </div>
                          {modelStatusNeedsAttention(it) ? <div className="mt-1"><ModelStatusBadge item={it} compact /></div> : null}
                        </td>
                        <td className="px-2 py-2.5 text-center align-middle" title={[itemMainCategoryLabel(it), itemSubCategoryLabel(it)].filter(Boolean).join(" / ")}>
                          <div className="truncate text-white/90">{itemMainCategoryLabel(it)}</div>
                          {itemSubCategoryLabel(it) ? <div className="truncate text-[10px] leading-3 text-white/48">{itemSubCategoryLabel(it)}</div> : null}
                        </td>
                        <td className="px-2 py-2.5 text-center align-middle" title={colorDisplay(it.color_name, it.color_code)}><ColorNameWithCode item={it} openUp={index >= Math.max(0, productPageItems.length - 3)} /></td>
                        <td className="px-2 py-2.5 text-center align-middle whitespace-nowrap">{it.size || "-"}</td>
                        <td className="px-2 py-2.5 text-center align-middle whitespace-nowrap"><StockQtyButton item={it} openUp={index >= Math.max(0, productPageItems.length - 3)} /></td>
                        <td className="px-2 py-2.5 text-center align-middle tabular-nums whitespace-nowrap"><MaskedBuyPrice value={it.buy_price} /></td>
                        <td className="px-2 py-2.5 text-center align-middle tabular-nums whitespace-nowrap"><SellPriceWithMarkup sellPrice={it.sell_price} buyPrice={it.buy_price} /></td>
                        <td className="px-2 py-2.5 text-center align-middle"><span className="inline-flex w-full justify-center"><MissingDataIndicator item={it} openUp={index >= Math.max(0, productPageItems.length - 2)} /></span></td>
                        <td className="px-2 py-2.5 text-center align-middle">
                          <div className="flex items-center justify-center gap-1.5">
                            <button className={warehouseListIconButton} onClick={() => openDetail(it.variant_id)} title="Részletek" aria-label="Részletek" type="button"><Edit3 size={15} /></button>
                            <button className={warehouseListDangerButton} onClick={() => setProductDeleteTarget(it)} title="Törlés" aria-label="Törlés" type="button"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {!productPageItems.length && <tr><td className="px-3 py-10 text-center text-white/55" colSpan={12}>Nincs megjeleníthető termék az AIF készletben.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 hidden lg:block">{productPager}</div>

              <div className="grid gap-3 lg:hidden">
                {productPageItems.map((it) => {
                  const variantId = String(it.variant_id || "");
                  const isSelected = Boolean(selectedVariants[variantId]);
                  const isHighlighted = Boolean(highlightProductId && variantId === highlightProductId);
                  return (
                  <article
                    key={it.variant_id}
                    data-aif-variant-id={variantId}
                    className={`scroll-mt-32 rounded-xl border p-3 ${isHighlighted ? "border-amber-200/75 bg-amber-400/14 ring-2 ring-amber-200/60" : isSelected ? "border-[#2a8d8b]/65 bg-[#2a8d8b]/14" : "border-white/12 bg-white/[0.05]"}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-xs text-white/76">
                        <input
                          className={selectBox}
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleVariantSelection(String(it.variant_id || ""), e.target.checked)}
                        />
                        Kijelölés
                      </label>
                      {isSelected && <span className="rounded-full border border-[#2a8d8b]/45 bg-[#2a8d8b]/22 px-2 py-0.5 text-[11px] text-white">Kijelölve</span>}
                    </div>
                    <div className="flex gap-3">
                      {it.image_url ? <img src={it.image_url} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-black/20 text-white/35"><ImagePlus size={20} /></div>}
                      <div className="min-w-0 flex-1">
                        <button className="block max-w-full truncate text-left text-sm text-white hover:text-[#cffffd] focus:outline-none focus:underline" onClick={() => openDetail(it.variant_id)} type="button" title={String(it.title_ro || "-")}>{it.title_ro || "-"}</button>
                        <p className="mt-1 text-xs text-white/55">{it.brand_name || "-"} • {itemMainCategoryLabel(it)}{itemSubCategoryLabel(it) ? ` / ${itemSubCategoryLabel(it)}` : ""} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"}</p>
                        <div className="mt-1"><ProductCodeTooltipButton item={it} /></div>
                        {modelStatusNeedsAttention(it) ? <div className="mt-1"><ModelStatusBadge item={it} compact /></div> : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <StockQtyButton item={it} />
                          <MissingDataIndicator item={it} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button className={`${warehouseListIconButton} h-9 w-9`} onClick={() => openDetail(it.variant_id)} title="Részletek / adatlap" aria-label={`Részletek / adatlap: ${it.title_ro || "termék"}`} type="button"><Edit3 size={15} /></button>
                      <button className={`${warehouseListDangerButton} h-9 w-9`} onClick={() => setProductDeleteTarget(it)} title="Törlés" aria-label={`Törlés: ${it.title_ro || "termék"}`} type="button"><Trash2 size={15} /></button>
                    </div>
                  </article>
                  );
                })}
                {!productPageItems.length && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-6 text-center text-sm text-white/60">Nincs megjeleníthető termék az AIF készletben.</div>}
                {productPager}
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedPanelOpen && (
        <div className={modalWrap}>
          <div className="max-h-[88vh] w-full max-w-5xl overflow-auto rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Kijelölt termékek</p>
                <h2 className="mt-1 text-lg text-white">{selectedCount} termék kijelölve</h2>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button className={selectedWorkButtonClass("label")} type="button" disabled={!selectedWorkCounts.label} onClick={() => setSelectedWorkPanel("label")} title="Vonalkód / címke listára tett termékek">
                  <Barcode size={15} /> Vonalkód / címke {selectedWorkCounts.label > 0 ? `(${selectedWorkCounts.label})` : ""}
                </button>
                <button className={selectedWorkButtonClass("order")} type="button" disabled={!selectedWorkCounts.order} onClick={() => setSelectedWorkPanel("order")} title="Rendelés / PDF listára tett termékek">
                  <ClipboardList size={15} /> Rendelés / PDF {selectedWorkCounts.order > 0 ? `(${selectedWorkCounts.order})` : ""}
                </button>
                <button className={selectedWorkButtonClass("move")} type="button" disabled={!selectedWorkCounts.move} onClick={() => setSelectedWorkPanel("move")} title="Készletmozgatás listára tett termékek">
                  <PackageCheck size={15} /> Készletmozgatás {selectedWorkCounts.move > 0 ? `(${selectedWorkCounts.move})` : ""}
                </button>
                <button className={btnSoft} onClick={() => setSelectedPanelOpen(false)} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-[#2a8d8b]/30 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                Ez a kijelölt termékek közös munkalistája. A kijelölés a fiókodhoz mentődik, így mobilon és másik gépen is ugyaninnen folytatható. A sor eleji pipával választható ki, hogy címkézéshez, rendeléshez vagy készletmozgatáshoz kerüljön.
              </div>

              <div className="grid gap-2">
                {selectedUnassignedItems.map((it) => (
                  <div key={it.variant_id} className="grid gap-3 rounded-xl border border-white/12 bg-[#3f4959] p-3 md:grid-cols-[36px,56px,1fr,auto] md:items-center">
                    <div className="flex justify-center">
                      <input
                        className={selectBox}
                        type="checkbox"
                        checked={false}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedActionTarget(it);
                        }}
                        aria-label="Feladat kiválasztása"
                        title="Feladat kiválasztása"
                      />
                    </div>
                    <div>
                      {it.image_url ? <img src={it.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/20 text-white/35"><ImagePlus size={16} /></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-white">{it.title_ro || "-"}</p>
                      <p className="mt-1 text-xs text-white/55">
                        {it.brand_name || "-"} • {itemMainCategoryLabel(it)}{itemSubCategoryLabel(it) ? ` / ${itemSubCategoryLabel(it)}` : ""} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"}
                      </p>
                      {modelStatusNeedsAttention(it) ? <div className="mt-1"><ModelStatusBadge item={it} compact /></div> : null}
                      <p className="mt-1 text-xs text-white/45">Készlet: {n(it.total_qty)} • SKU: {visibleWarehouseBarcode(it) || "-"}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button className={btnSoft} onClick={() => { setSelectedPanelOpen(false); openDetail(it.variant_id); }} type="button"><Edit3 size={14} /> Részletek</button>
                      <button className={btnSoft} onClick={() => { setSelectedPanelOpen(false); openStockEditor(it); }} type="button"><Boxes size={14} /> Készlet</button>
                      <button className={btnSoft} onClick={() => removeSelectedItemEverywhere(String(it.variant_id || ""))} type="button"><X size={14} /> Kivétel</button>
                    </div>
                  </div>
                ))}
                {!selectedUnassignedItems.length && (
                  <p className="rounded-xl border border-white/12 bg-[#3f4959] px-3 py-6 text-center text-sm text-white/60">
                    Nincs szabadon várakozó kijelölt termék. A felső gombokkal megnyithatók a feladatlisták.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap justify-between gap-2 border-t border-white/12 pt-3">
                <button className={btnSoft} onClick={clearSelectedVariants} type="button" title="A mentett kijelölési listát is törli"><X size={15} /> Teljes kijelölés törlése</button>
                <button className={primaryBtn} onClick={() => setSelectedPanelOpen(false)} type="button">Kész</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {labelComposerOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-3 py-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Vonalkód / címke nyomtatás</p>
                <h2 className="mt-1 text-lg text-white">{labelRowsForPrint.length} termék • {labelPrintItems.length} címke</h2>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button className={btnSoft} onClick={() => setLabelComposerOpen(false)} type="button"><ArrowLeft size={15} /> Vissza</button>
                <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal" onClick={printGeneratedLabels} disabled={!labelPrintItems.length} type="button"><Barcode size={15} /> Nyomtatás A4</button>
                <button className={btnSoft} onClick={() => setLabelComposerOpen(false)} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded-xl border border-[#2a8d8b]/30 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                A címkék egy közös A4-es ívre kerülnek egymás után, több termék együtt is. A címke a román főkategóriát és az anyagösszetételt használja. Ha nincs anyagösszetétel, az a rész üres marad.
              </div>

              <section className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
                <div className="rounded-xl border border-white/12 bg-[#3f4959] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-white">Címke tartalma</p>
                    <span className="text-xs text-white/55">Kapcsold ki, ami nem kell a címkére</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {WAREHOUSE_LABEL_CONTENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`flex min-h-[48px] items-start gap-2 rounded-xl border px-3 py-2 text-left transition ${
                          labelContent[opt.key]
                            ? "border-[#7bd7d4]/60 bg-[#2a8d8b]/20 text-white"
                            : "border-white/16 bg-[#303a4c] text-white/76"
                        }`}
                        onClick={() => toggleLabelContent(opt.key)}
                      >
                        <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                          labelContent[opt.key] ? "border-[#9af4d8]/80 bg-[#6ee7c8] text-[#123328]" : "border-white/35 bg-white/[0.04] text-white/30"
                        }`}>
                          {labelContent[opt.key] ? "✓" : ""}
                        </span>
                        <span className="grid gap-0.5">
                          <span className="text-xs text-white">{opt.label}</span>
                          <span className="text-[11px] leading-snug text-white/55">{opt.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/12 bg-[#3f4959] p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-white">Méret, kiosztás és sablon</p>
                    <span className="rounded-full border border-white/12 bg-white/[0.08] px-2.5 py-1 text-xs text-white/70">
                      {labelColCount} oszlop × {labelRowCount} sor • {labelsPerPage} címke / oldal • {Math.max(1, labelPrintPages.length)} oldal
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className={`${label} min-w-0`}>Gyors sablon
                      <select className={`${select} w-full min-w-0`} onChange={(e) => applyWarehouseLabelPreset(e.target.value)} defaultValue="40x46">
                        {WAREHOUSE_LABEL_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                      </select>
                    </label>
                    <label className={`${label} min-w-0`}>Címke szélesség mm<input className={`${input} w-full min-w-0`} value={labelWidth} onChange={(e) => setLabelWidth(e.target.value)} inputMode="decimal" /></label>
                    <label className={`${label} min-w-0`}>Címke magasság mm<input className={`${input} w-full min-w-0`} value={labelHeight} onChange={(e) => setLabelHeight(e.target.value)} inputMode="decimal" /></label>
                    <label className={`${label} min-w-0`}>Oszlop / A4<input className={`${input} w-full min-w-0`} value={labelCols} onChange={(e) => setLabelCols(e.target.value)} inputMode="numeric" /></label>
                    <label className={`${label} min-w-0`}>Sor / A4<input className={`${input} w-full min-w-0`} value={labelRows} onChange={(e) => setLabelRows(e.target.value)} inputMode="numeric" /></label>
                    <label className={`${label} min-w-0`}>Margó bal-jobb mm<input className={`${input} w-full min-w-0`} value={labelMarginX} onChange={(e) => setLabelMarginX(e.target.value)} inputMode="decimal" /></label>
                    <label className={`${label} min-w-0`}>Margó fent-lent mm<input className={`${input} w-full min-w-0`} value={labelMarginY} onChange={(e) => setLabelMarginY(e.target.value)} inputMode="decimal" /></label>
                    <label className={`${label} min-w-0`}>Cég neve a címkén<input className={`${input} w-full min-w-0`} value={labelCompanyName} onChange={(e) => setLabelCompanyName(e.target.value)} placeholder={WAREHOUSE_LABEL_COMPANY} /></label>
                    <label className={`${label} min-w-0`}>Pénznem
                      <select className={`${select} w-full min-w-0`} value={labelCurrency} onChange={(e) => { setLabelCurrency(e.target.value); if (!labelUnitText.trim() || labelUnitText === labelCurrency) setLabelUnitText(e.target.value); }}>
                        <option value="RON">RON</option>
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                        <option value="HUF">HUF</option>
                      </select>
                    </label>
                    <label className={`${label} min-w-0`}>Ár melletti egység<input className={`${input} w-full min-w-0`} value={labelUnitText} onChange={(e) => setLabelUnitText(e.target.value)} placeholder="RON" /></label>
                    <label className={`${label} min-w-0`}>Sablon neve<input className={`${input} w-full min-w-0`} value={labelTemplateName} onChange={(e) => setLabelTemplateName(e.target.value)} placeholder="Standard 40x46" /></label>
                    <label className={`${label} min-w-0`}>Mentett sablon
                      <select className={`${select} w-full min-w-0`} value="" onChange={(e) => loadWarehouseLabelTemplate(e.target.value)}>
                        <option value="">Betöltés</option>
                        {labelTemplates.map((template) => <option key={template.name} value={template.name}>{template.name}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-white/72">
                      <input className={selectBox} type="checkbox" checked={labelShowBorder} onChange={(e) => setLabelShowBorder(e.target.checked)} />
                      Címke keret nyomtatása
                    </label>
                    <button className={btnSoft} type="button" onClick={saveCurrentWarehouseLabelTemplate}><Save size={14} /> Sablon mentése</button>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[1.05fr,0.95fr]">
                <div className="rounded-xl border border-white/12 bg-[#3f4959] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-white">Termékek és példányszám</p>
                    <span className="text-xs text-white/55">A készletnél több címke is kérhető</span>
                  </div>
                  <div className="grid gap-2">
                    {labelRowsForPrint.map((row) => (
                      <div key={row.id} className="grid gap-3 rounded-xl border border-white/12 bg-[#465163] p-3 md:grid-cols-[1fr,148px] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white">{row.title}</p>
                          <p className="mt-1 text-xs text-white/55">{row.brand} • {row.category} • {row.color} • {row.size}</p>
                          <p className="mt-1 text-xs text-white/45">Készlet: {row.stockQty} • Vonalkód: {row.barcode}</p>
                          {!row.render.ok && <p className="mt-1 text-xs text-rose-100">{row.render.error}</p>}
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] uppercase tracking-[0.05em] text-white/55">Címke darab</p>
                          <div className="flex h-9 overflow-hidden rounded-xl border border-white/20 bg-[#303a4c]">
                            <button className="flex h-full w-10 items-center justify-center border-r border-white/14 bg-white/[0.06] text-lg text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onClick={() => adjustLabelCopies(row.id, -1)} disabled={labelInt(labelCopies[row.id], 1, 0, 999) <= 0} type="button">−</button>
                            <input className="h-full min-w-0 flex-1 bg-transparent px-2 text-center text-sm tabular-nums text-white outline-none" value={String(labelInt(labelCopies[row.id], row.copies, 0, 999))} inputMode="numeric" onChange={(e) => updateLabelCopies(row.id, e.target.value)} />
                            <button className="flex h-full w-10 items-center justify-center border-l border-white/14 bg-[#2a8d8b] text-lg text-white transition hover:bg-[#319c99]" onClick={() => adjustLabelCopies(row.id, 1)} type="button">+</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!labelRowsForPrint.length && <p className="rounded-xl border border-white/12 bg-[#465163] px-3 py-5 text-center text-sm text-white/60">Nincs termék a Vonalkód / címke listában.</p>}
                  </div>
                </div>

                <div className="rounded-xl border border-white/12 bg-[#3f4959] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-white">Első oldal előnézet</p>
                    <span className="text-xs text-white/55">{Math.min(labelPrintItems.length, labelsPerPage)} / {labelPrintItems.length} címke</span>
                  </div>
                  {labelPrintItems.length ? (
                    <div className="aifWhLabelPreviewFrame" style={labelPrintStyle}>
                      <div className="aifWhLabelPreviewPageBox">
                        <div className="aifWarehouseLabelPrintPage">
                          {(labelPrintPages[0] || []).map((printLabel) => (
                            <div className={`aifWarehousePrintLabel ${labelShowBorder ? "" : "noBorder"}`} key={printLabel.key}>
                              <WarehouseLabelContent label={printLabel} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/12 bg-[#465163] px-3 py-8 text-center text-sm text-white/60">Nincs előnézet.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {selectedActionTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-3 py-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Feladat kiválasztása</p>
                <h2 className="mt-1 text-lg text-white">{selectedActionTarget.title_ro || "Termék"}</h2>
              </div>
              <button className={btnSoft} onClick={() => setSelectedActionTarget(null)} type="button"><X size={14} /> Bezárás</button>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm text-white/70">Válaszd ki, melyik munkalistára kerüljön a kijelölt termék.</p>
              <div className="grid gap-2">
                <button className="flex items-center justify-between gap-3 rounded-xl border border-[#2a8d8b]/45 bg-[#2a8d8b]/18 px-2 py-2 text-left text-sm text-white hover:bg-[#2a8d8b]/26" onClick={() => assignSelectedItemToAction(selectedActionTarget, "label")} type="button">
                  <span className="inline-flex items-center gap-2"><Barcode size={16} /> Vonalkód / címke</span>
                  <span className="text-xs text-white/55">címkelista</span>
                </button>
                <button className="flex items-center justify-between gap-3 rounded-xl border border-white/16 bg-[#3f4959] px-2 py-2 text-left text-sm text-white hover:bg-[#475365]" onClick={() => assignSelectedItemToAction(selectedActionTarget, "order")} type="button">
                  <span className="inline-flex items-center gap-2"><ClipboardList size={16} /> Rendelés / PDF</span>
                  <span className="text-xs text-white/55">rendelési lista</span>
                </button>
                <button className="flex items-center justify-between gap-3 rounded-xl border border-white/16 bg-[#3f4959] px-2 py-2 text-left text-sm text-white hover:bg-[#475365]" onClick={() => assignSelectedItemToAction(selectedActionTarget, "move")} type="button">
                  <span className="inline-flex items-center gap-2"><PackageCheck size={16} /> Készletmozgatás</span>
                  <span className="text-xs text-white/55">átadási lista</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedWorkPanel && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-sm">
          <div className={`${selectedWorkPanel === "move" ? "max-h-[94vh] max-w-[1540px]" : "max-h-[88vh] max-w-5xl"} w-full overflow-auto rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl`}>
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">{selectedWorkActionLabels[selectedWorkPanel]}</p>
                <h2 className="mt-1 text-lg text-white">{selectedItemsForAction(selectedWorkPanel).length} termék a listában</h2>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {selectedWorkPanel === "label" && (
                  <button className={primaryBtn} onClick={openLabelComposer} type="button" disabled={!selectedLabelItems.length || labelDetailsBusy}>
                    <Barcode size={15} /> {labelDetailsBusy ? "Termékadatok betöltése..." : "Vonalkódok / címkék generálása"}
                  </button>
                )}
                <button className={btnSoft} onClick={() => setSelectedWorkPanel(null)} type="button"><ArrowLeft size={15} /> Vissza</button>
                <button className={btnSoft} onClick={() => { setSelectedWorkPanel(null); setSelectedPanelOpen(false); }} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-[#2a8d8b]/30 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                Itt vannak azok a termékek, amelyeket ehhez a feladathoz soroltál. A pipa levétele csak ebből a feladatlistából veszi ki, a fő Kijelölt termékek listában megmarad.
              </div>

              {selectedWorkPanel === "move" && (
                <div className="space-y-2">
                  <div className="grid gap-2 rounded-2xl border border-white/14 bg-[#3f4959] p-2.5 xl:grid-cols-[minmax(190px,0.9fr),minmax(280px,1.3fr),auto] xl:items-end">
                    <label className={moveLabel}>
                      PDF / bizonylat címe
                      <input className={moveInput} value={stockMoveDocumentTitle} onChange={(e) => setStockMoveDocumentTitle(e.target.value)} placeholder="Készlet átadási lista" />
                    </label>
                    <label className={moveLabel}>
                      Megjegyzés a PDF-re és a naplóba
                      <input className={moveInput} value={stockMoveNote} onChange={(e) => setStockMoveNote(e.target.value)} placeholder="Pl. átadás ellenőrzésre, visszahozatal..." />
                    </label>
                    <div className="rounded-lg border border-[#2a8d8b]/28 bg-[#203f49] px-2.5 py-2 text-[11px] text-[#d7fffd]">
                      <div className="whitespace-nowrap font-semibold text-white">{moveValidRows.length} sor • {moveTotalQty} db</div>
                      <div className={`mt-0.5 whitespace-nowrap ${moveInvalidCount ? "text-amber-100" : "text-[#d7fffd]/78"}`}>{moveInvalidCount ? `${moveInvalidCount} hibás sor javítandó` : "véglegesítésre kész"}</div>
                    </div>
                  </div>

                  <details className="rounded-xl border border-white/12 bg-[#303a4c]/70 p-2 text-xs text-white/70">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 py-0.5 text-white/78 outline-none marker:hidden">
                      <span className="inline-flex items-center gap-2"><PackageCheck size={14} /> Gyors kitöltés több sorra</span>
                      <span className="text-[11px] text-white/45">opcionális, zárva marad, hogy ne zabálja a helyet</span>
                    </summary>
                    <div className="mt-2 grid min-w-0 gap-2 border-t border-white/10 pt-2 sm:grid-cols-[minmax(150px,1fr),22px,minmax(150px,1fr),auto] sm:items-end">
                      <label className={moveLabel}>
                        Forrás mindhez
                        <select
                          className={moveSelect}
                          value={stockMoveBulkFrom}
                          title={locationNameByValue(stockMoveBulkFrom)}
                          onChange={(e) => {
                            const fromId = e.target.value;
                            setStockMoveBulkFrom(fromId);
                            if (!fromId) return;
                            setStockMoveBulkTo((current) => current && current !== fromId ? current : defaultStockMoveTo(fromId));
                          }}
                          aria-label="Tömeges forrás hely"
                        >
                          <option value="">Forrás...</option>
                          {stockLocationRows.map((loc) => {
                            const value = locationValue(loc);
                            return <option key={value} value={value}>{compactWarehouseLocationName(loc, 22)}</option>;
                          })}
                        </select>
                      </label>
                      <span className="hidden items-center justify-center pb-2 text-white/45 sm:flex"><ArrowRight size={14} /></span>
                      <label className={moveLabel}>
                        Cél mindhez
                        <select
                          className={moveSelect}
                          value={stockMoveBulkTo}
                          title={locationNameByValue(stockMoveBulkTo)}
                          onChange={(e) => {
                            const toId = e.target.value;
                            setStockMoveBulkTo(toId);
                            if (!toId) return;
                            setStockMoveBulkFrom((current) => current && current !== toId ? current : firstDifferentLocation(toId));
                          }}
                          aria-label="Tömeges cél hely"
                        >
                          <option value="">Cél...</option>
                          {stockLocationRows.map((loc) => {
                            const value = locationValue(loc);
                            return <option key={value} value={value} disabled={value === stockMoveBulkFrom}>{compactWarehouseLocationName(loc, 22)}</option>;
                          })}
                        </select>
                      </label>
                      <button
                        className={moveCompactBtn}
                        type="button"
                        disabled={!moveBulkCanApply}
                        onClick={applyStockMoveBulkLocations}
                        title="A kiválasztott útvonalat minden alábbi sorra ráteszi, de még nem mozgat készletet."
                      >
                        Alkalmazás minden sorra
                      </button>
                    </div>
                  </details>

                  <div className="flex flex-wrap gap-1.5 text-[11px] text-white/58">
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5"><FileText size={12} /> PDF = csak nyomtatás</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5"><PackageCheck size={12} /> Készlet mozgatása = valódi készletmozgás, megerősítéssel</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5"><ArrowRight size={12} /> Soronként: Forrás → Cél → Db</span>
                  </div>
                </div>
              )}

              <div className={selectedWorkPanel === "move" ? "grid gap-1.5" : "grid gap-2"}>
                {selectedItemsForAction(selectedWorkPanel).map((it) => {
                  const variantId = String(it.variant_id || "");
                  const preparedMove = preparedMoveRowsById.get(variantId);

                  if (selectedWorkPanel === "move") {
                    const draft = stockMoveRows[variantId] || (preparedMove ? { fromLocationId: preparedMove.fromLocationId, toLocationId: preparedMove.toLocationId, qty: String(preparedMove.qty) } : defaultMoveDraftForItem(it));
                    const availableFrom = preparedMove?.availableFrom ?? availableAtLocation(variantId, draft.fromLocationId);
                    const currentQty = qtyAtLocation(variantId, draft.fromLocationId);
                    const reservedQty = reservedAtLocation(variantId, draft.fromLocationId);
                    const rowProblem = preparedMove?.problem || "";
                    return (
                      <div key={it.variant_id} className={`rounded-lg border px-2 py-1.5 ${rowProblem ? "border-amber-200/26 bg-[#4a4a43]" : "border-white/12 bg-[#3f4959]"}`}>
                        <div className="grid gap-1.5 xl:grid-cols-[22px,34px,minmax(220px,0.95fr),minmax(680px,1.85fr)] xl:items-center xl:gap-2">
                          <div className="flex justify-center xl:pt-0">
                            <input
                              className={selectBox}
                              type="checkbox"
                              checked
                              onChange={(e) => {
                                if (!e.target.checked) returnSelectedItemToMainList(String(it.variant_id || ""));
                              }}
                              aria-label="Kivétel ebből a feladatlistából"
                              title="Kivétel ebből a feladatlistából, a fő kijelölt listában megmarad"
                            />
                          </div>
                          <div className="flex xl:justify-center">
                            {it.image_url ? <img src={it.image_url} alt="" className="h-8 w-8 rounded-md object-cover" /> : <div className="flex h-8 w-8 items-center justify-center rounded-md bg-black/20 text-white/35"><ImagePlus size={14} /></div>}
                          </div>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <p className="min-w-0 flex-1 truncate text-[12px] leading-4 text-white">{it.title_ro || "-"}</p>
                              {rowProblem ? <span className="shrink-0 rounded-full border border-amber-200/25 bg-amber-300/12 px-1.5 py-0.5 text-[10px] leading-none text-amber-100">hiba</span> : null}
                              <div className={moveRowActions}>
                                <button className={moveTinyBtn} onClick={() => { setSelectedWorkPanel(null); setSelectedPanelOpen(false); openDetail(it.variant_id); }} type="button" title="Részletek" aria-label="Részletek"><Edit3 size={12} /></button>
                                <button className={`${moveTinyBtn} hover:border-rose-300/45 hover:bg-rose-500/16`} onClick={() => returnSelectedItemToMainList(String(it.variant_id || ""))} type="button" title="Kivétel ebből a készletmozgatásból" aria-label="Kivétel ebből a készletmozgatásból"><X size={12} /></button>
                              </div>
                            </div>
                            <p className="mt-0.5 truncate text-[10.5px] leading-3 text-white/52">{it.brand_name || "-"} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"} • Össz.: {n(it.total_qty)} • {visibleWarehouseBarcode(it) || "nincs vonalkód"}</p>
                            {rowProblem ? <p className="mt-0.5 truncate text-[10.5px] leading-3 text-amber-200">{rowProblem}</p> : <p className="mt-0.5 truncate text-[10.5px] leading-3 text-[#cffffd]">Forrás: {currentQty} db • foglalt: {reservedQty} • elérhető: {availableFrom}</p>}
                          </div>
                          <div className="grid min-w-0 gap-1.5 rounded-lg border border-[#7bd7d4]/16 bg-[#303a4c]/56 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:grid-cols-[minmax(150px,240px),28px,minmax(150px,240px),132px] sm:items-end sm:justify-end">
                            <label className="grid min-w-0 gap-0.5 text-[10px] uppercase tracking-[0.05em] text-white/58">
                              <span>Forrás</span>
                              <select className={moveSelect} value={draft.fromLocationId} onChange={(e) => setStockMoveRowField(variantId, { fromLocationId: e.target.value })} aria-label="Forrás hely" title={locationNameByValue(draft.fromLocationId)}>
                                <option value="">Forrás...</option>
                                {stockLocationRows.map((loc) => {
                                  const value = locationValue(loc);
                                  const available = availableAtLocation(variantId, value);
                                  return <option key={value} value={value} title={loc.name || loc.code || ""}>{compactWarehouseLocationName(loc, 18)} ({available})</option>;
                                })}
                              </select>
                            </label>
                            <button
                              className="hidden h-8 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white/58 hover:border-[#7bd7d4]/35 hover:bg-[#2a8d8b]/18 hover:text-white sm:inline-flex"
                              type="button"
                              onClick={() => setStockMoveRowField(variantId, { fromLocationId: draft.toLocationId, toLocationId: draft.fromLocationId })}
                              disabled={!draft.fromLocationId || !draft.toLocationId}
                              title="Forrás és cél felcserélése"
                              aria-label="Forrás és cél felcserélése"
                            >
                              ↔
                            </button>
                            <label className="grid min-w-0 gap-0.5 text-[10px] uppercase tracking-[0.05em] text-white/58">
                              <span>Cél</span>
                              <select className={moveSelect} value={draft.toLocationId} onChange={(e) => setStockMoveRowField(variantId, { toLocationId: e.target.value })} aria-label="Cél hely" title={locationNameByValue(draft.toLocationId)}>
                                <option value="">Cél...</option>
                                {stockLocationRows.map((loc) => {
                                  const value = locationValue(loc);
                                  return <option key={value} value={value} disabled={value === draft.fromLocationId} title={loc.name || loc.code || ""}>{compactWarehouseLocationName(loc, 18)}</option>;
                                })}
                              </select>
                            </label>
                            <label className="grid min-w-[132px] gap-0.5 text-[10px] uppercase tracking-[0.05em] text-white/58">
                              <span>Db</span>
                              <div className={moveQtyBox}>
                                <button className={`${moveQtyButton} border-r border-white/12`} type="button" onClick={() => adjustStockMoveQty(variantId, -1)} disabled={n(draft.qty) <= 0} aria-label="Darabszám csökkentése"><Minus size={13} /></button>
                                <input className="w-16 min-w-[56px] flex-1 bg-transparent px-2 text-center text-sm font-semibold text-white outline-none tabular-nums" type="text" inputMode="numeric" pattern="[0-9]*" value={draft.qty} onChange={(e) => setStockMoveRowField(variantId, { qty: e.target.value.replace(/[^0-9]/g, "") })} aria-label="Mozgatott darabszám" />
                                <button className={`${moveQtyButton} border-l border-white/12`} type="button" onClick={() => adjustStockMoveQty(variantId, 1)} disabled={availableFrom <= 0 || n(draft.qty) >= availableFrom} aria-label="Darabszám növelése"><Plus size={13} /></button>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={it.variant_id} className="grid gap-3 rounded-xl border border-white/12 bg-[#3f4959] p-3 md:grid-cols-[36px,56px,1fr,auto] md:items-center">
                      <div className="flex justify-center">
                        <input
                          className={selectBox}
                          type="checkbox"
                          checked
                          onChange={(e) => {
                            if (!e.target.checked) returnSelectedItemToMainList(String(it.variant_id || ""));
                          }}
                          aria-label="Kivétel ebből a feladatlistából"
                          title="Kivétel ebből a feladatlistából, a fő kijelölt listában megmarad"
                        />
                      </div>
                      <div>
                        {it.image_url ? <img src={it.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black/20 text-white/35"><ImagePlus size={18} /></div>}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{it.title_ro || "-"}</p>
                        <p className="mt-1 text-xs text-white/55">{it.brand_name || "-"} • {itemMainCategoryLabel(it)}{itemSubCategoryLabel(it) ? ` / ${itemSubCategoryLabel(it)}` : ""} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"}</p>
                        {modelStatusNeedsAttention(it) ? <div className="mt-1"><ModelStatusBadge item={it} compact /></div> : null}
                        <p className="mt-1 text-xs text-white/45">Készlet: {n(it.total_qty)} • Vonalkód: {visibleWarehouseBarcode(it) || "-"}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button className={btnSoft} onClick={() => { setSelectedWorkPanel(null); setSelectedPanelOpen(false); openDetail(it.variant_id); }} type="button"><Edit3 size={14} /> Részletek</button>
                        <button className={btnSoft} onClick={() => returnSelectedItemToMainList(String(it.variant_id || ""))} type="button"><ArrowLeft size={14} /> Vissza a fő listába</button>
                        <button className={btnSoft} onClick={() => removeSelectedItemEverywhere(String(it.variant_id || ""))} type="button" title="A teljes kijelölésből is kiveszi"><X size={14} /> Törlés minden listából</button>
                      </div>
                    </div>
                  );
                })}
                {!selectedItemsForAction(selectedWorkPanel).length && (
                  <p className="rounded-xl border border-white/12 bg-[#3f4959] px-3 py-6 text-center text-sm text-white/60">Nincs termék ebben a listában.</p>
                )}
              </div>

              {selectedWorkPanel === "move" && selectedItemsForAction(selectedWorkPanel).length > 0 && (
                <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/12 bg-[#404a5b]/98 px-4 py-2.5 shadow-[0_-14px_32px_rgba(15,23,42,0.25)] backdrop-blur">
                  <div className="min-w-0 text-xs leading-relaxed text-white/62">
                    <span className="font-semibold text-white">{moveValidRows.length} sor • {moveTotalQty} db</span>
                    <span className="ml-2">Mentés után ténylegesen átírja a készletet és bekerül a mozgásnaplóba.</span>
                    {!moveAllRowsValid && selectedMoveItems.length > 0 ? <span className="ml-2 text-amber-200">Van javítandó sor.</span> : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button className={btnSoft} onClick={printStockMoveTransferPdf} type="button" disabled={!moveAllRowsValid}>
                      <Printer size={15} /> PDF / nyomtatás
                    </button>
                    <button className={primaryBtn} onClick={requestSaveSelectedMoveTransfers} type="button" disabled={!moveCanSave} title="Végleges művelet: készletet módosít és mozgásnaplóba ír, előtte megerősítést kér.">
                      <PackageCheck size={15} /> {stockMoveSaving ? "Mentés..." : "Véglegesítés: készlet mozgatása"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {stockMoveConfirmOpen && selectedWorkPanel === "move" && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-3 py-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="border-b border-white/12 bg-[#404a5b]/98 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-amber-100/80">Megerősítés</p>
              <h2 className="mt-1 text-lg text-white">Készlet mozgatása véglegesen?</h2>
            </div>
            <div className="space-y-3 p-4 text-sm text-white/74">
              <div className="rounded-xl border border-amber-200/28 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-50">
                Ez nem csak PDF-nyomtatás: mentés után a készlet ténylegesen átkerül a kiválasztott forrásból a célhelyre.
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-white/12 bg-[#3f4959] px-3 py-2">
                  <span className="block text-white/48">Sorok</span>
                  <strong className="mt-1 block text-lg text-white">{moveValidRows.length}</strong>
                </div>
                <div className="rounded-xl border border-white/12 bg-[#3f4959] px-3 py-2">
                  <span className="block text-white/48">Összes darab</span>
                  <strong className="mt-1 block text-lg text-white">{moveTotalQty}</strong>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button className={btnSoft} onClick={() => setStockMoveConfirmOpen(false)} type="button" disabled={stockMoveSaving}>Mégsem</button>
                <button className={primaryBtn} onClick={saveSelectedMoveTransfers} type="button" disabled={!moveCanSave}>
                  <PackageCheck size={15} /> Igen, készletet mozgat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stockEditorTarget && (
        <div className={modalWrap}>
          <div className="max-h-[88vh] w-full max-w-xl overflow-auto rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Készlet célhelyenként</p>
                <h2 className="mt-1 text-lg text-white">{stockEditorTarget.title_ro || "Termék"}</h2>
                <p className="mt-1 text-xs text-white/58">{stockEditorTarget.brand_name || "-"} • {colorDisplay(stockEditorTarget.color_name, stockEditorTarget.color_code)} • {stockEditorTarget.size || "-"}</p>
              </div>
              <button className={btnSoft} onClick={closeStockEditor} disabled={stockEditorSaving} type="button"><X size={14} /> Bezárás</button>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-[#5bd0cc]/30 bg-[#203f49] px-3 py-2 text-xs text-[#d7fffd]">
                Mozgatás módban a teljes készlet nem változik: ha az egyik célhelyre pluszolsz, automatikusan leveszi másik célhelyről. Új áru vagy leltárkorrekció esetén kapcsold be a készletkorrekció módot.
              </div>

              <div className="grid gap-2 rounded-xl border border-white/12 bg-[#3f4959]/70 p-3 text-xs text-white/72 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-white/88">{stockEditorAllowTotalChange ? "Készletkorrekció mód" : "Mozgatás célhelyek között"}</p>
                  <p className="mt-0.5 text-white/52">
                    Régi összesen: <span className="text-white">{stockEditorOriginalTotal()}</span> db • Új összesen: <span className="text-white">{stockEditorDraftTotal()}</span> db • Eltérés: <span className={stockEditorTotalDelta() === 0 ? "text-[#bff7f4]" : "text-amber-200"}>{stockEditorTotalDelta() > 0 ? "+" : ""}{stockEditorTotalDelta()}</span> db
                  </p>
                </div>
                <button
                  className={stockEditorAllowTotalChange ? dangerBtn : btnSoft}
                  type="button"
                  disabled={stockEditorSaving}
                  onClick={() => {
                    const nextMode = !stockEditorAllowTotalChange;
                    setStockEditorAllowTotalChange(nextMode);
                    const delta = stockEditorTotalDelta();
                    setStockEditorWarning(nextMode
                      ? (delta !== 0 ? `Készletkorrekció mód: a teljes készlet ${delta > 0 ? "+" : ""}${delta} db-bal változik.` : "Készletkorrekció mód bekapcsolva. Itt lehet újonnan kapott darabot vagy leltárkorrekciót menteni.")
                      : (delta !== 0 ? "Mozgatás módban a teljes készlet nem változhat. Állítsd vissza az eltérést 0-ra, vagy kapcsold vissza a korrekciót." : ""));
                  }}
                >
                  {stockEditorAllowTotalChange ? "Korrekció bekapcsolva" : "Korrekció engedélyezése"}
                </button>
              </div>

              {stockEditorWarning && (
                <div className={`flex gap-2 rounded-xl border px-3 py-2 text-xs ${stockEditorAllowTotalChange ? "border-amber-300/35 bg-amber-400/12 text-amber-100" : "border-[#5bd0cc]/30 bg-[#203f49] text-[#d7fffd]"}`}>
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{stockEditorWarning}</span>
                </div>
              )}

              <div className="space-y-2">
                {stockLocationRows.map((loc) => {
                  const key = locationKey(loc);
                  const current = stockForLocation(stockRowsForVariant(stockEditorTarget.variant_id), loc);
                  const reservedQty = Math.max(0, Math.floor(n(current?.reserved_qty)));
                  const qtyValue = Math.max(reservedQty, Math.floor(n(stockEditorRows[key])));
                  const availableDraft = Math.max(0, qtyValue - reservedQty);
                  return (
                    <div key={key} className="grid grid-cols-[1fr_136px] items-center gap-3 rounded-xl border border-white/12 bg-[#3f4959] px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{loc.name || loc.code || "-"}</p>
                        <p className="mt-0.5 text-[11px] text-white/50">
                          Előző: {n(current?.qty)} • Foglalt: {reservedQty} • Új elérhető: {availableDraft}
                        </p>
                      </div>
                      <div className="flex h-9 overflow-hidden rounded-xl border border-white/20 bg-[#303a4c]">
                        <button
                          className="flex h-full w-10 items-center justify-center border-r border-white/14 bg-white/[0.06] text-lg text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
                          onClick={() => adjustStockEditorQty(loc, -1)}
                          disabled={stockEditorSaving || qtyValue <= reservedQty}
                          title={reservedQty > 0 ? `Minimum a foglalt mennyiség miatt: ${reservedQty}` : "Készlet csökkentése"}
                          type="button"
                        >
                          −
                        </button>
                        <input
                          className="h-full min-w-0 flex-1 bg-transparent px-2 text-center text-sm tabular-nums text-white outline-none"
                          inputMode="numeric"
                          value={qtyValue}
                          readOnly
                          aria-label={`${loc.name || loc.code || "Célhely"} készlet`}
                        />
                        <button
                          className="flex h-full w-10 items-center justify-center border-l border-white/14 bg-[#2a8d8b] text-lg text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => adjustStockEditorQty(loc, 1)}
                          disabled={stockEditorSaving}
                          title="Készlet növelése"
                          type="button"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!stockLocationRows.length && <p className="rounded-xl border border-white/12 bg-[#3f4959] px-3 py-4 text-sm text-white/60">Nincs aktív célhely.</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 pt-3">
                <div className="text-xs text-white/60">
                  Régi összesen: <span className="text-white">{stockEditorOriginalTotal()}</span> • Új összesen: <span className="text-white">{stockEditorDraftTotal()}</span>
                  {stockEditorTotalDelta() !== 0 && <span className="ml-2 text-amber-200">({stockEditorTotalDelta() > 0 ? "+" : ""}{stockEditorTotalDelta()} db)</span>}
                </div>
                <div className="flex gap-2">
                  <button className={btnSoft} onClick={closeStockEditor} disabled={stockEditorSaving} type="button">Mégse</button>
                  <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/45 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#249b99] disabled:cursor-not-allowed disabled:opacity-50 font-normal" onClick={saveStockEditor} disabled={stockEditorSaving || !stockLocationRows.length || !stockEditorCanSave()} title={!stockEditorCanSave() ? "Mozgatás módban a teljes készlet nem változhat." : "Készlet mentése"} type="button">
                    <Save size={15} /> {stockEditorAllowTotalChange ? "Korrekció mentése" : "Mozgatás mentése"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {newProductOpen && (
        <div className={modalWrap}>
          <div className={modal}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3">
              <div>
                <p className="text-sm text-white/65">Új termék kézi felvétele</p>
                <h2 className="text-xl">Új termék hozzáadása raktárba</h2>
              </div>
              <button className={btnSoft} onClick={closeNewProductModal} disabled={newProductSaving} type="button"><X size={16} /> Bezárás</button>
            </div>

            <div className="space-y-4 p-4">
              {newProductBarcodeMatches.length > 0 && (
                <section className="rounded-2xl border border-amber-200/30 bg-amber-400/10 p-3 shadow-[0_0_0_1px_rgba(251,191,36,0.08)]">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-amber-50">Vonalkód találat már létező termékre</p>
                      <p className="text-xs text-amber-100/70">Az adatlap nem nyílik meg automatikusan. A terméksorra tudsz ugrani, vagy rögtön a készletét módosítani.</p>
                    </div>
                    <span className="rounded-full border border-amber-200/30 bg-black/15 px-2.5 py-1 text-xs text-amber-50">{newProductBarcodeMatches.length} találat</span>
                  </div>
                  <div className="grid gap-2">
                    {newProductBarcodeMatches.map((it) => (
                      <div key={it.variant_id} className="grid gap-3 rounded-xl border border-white/14 bg-[#3f4959] p-3 md:grid-cols-[56px,1fr,auto] md:items-center">
                        <div>
                          {it.image_url ? <img src={it.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-black/20 text-white/35"><ImagePlus size={18} /></div>}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white">{it.title_ro || "-"}</p>
                          <p className="mt-1 text-xs text-white/58">{it.brand_name || "-"} • {itemMainCategoryLabel(it)}{itemSubCategoryLabel(it) ? ` / ${itemSubCategoryLabel(it)}` : ""} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"}</p>
                          {modelStatusNeedsAttention(it) ? <div className="mt-1"><ModelStatusBadge item={it} compact /></div> : null}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/45">
                            <span>Vonalkód: {visibleWarehouseBarcode(it) || "-"}</span>
                            <VariantCodesTooltip item={it} />
                            <span>Készlet: {n(it.total_qty)}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            className={btnSoft}
                            type="button"
                            onClick={() => {
                              const searchText = cleanScannedBarcode(newProduct.barcode || newProduct.snCod || it.barcode || it.sn_cod || it.snCod || "") || String(it.barcode || it.title_ro || "");
                              setNewProductOpen(false);
                              setNewProduct(emptyNewProductForm());
                              setNewProductStockRows({});
                              focusProductInList(it, searchText, `Meglévő termék találat: ${searchText}. A terméksorra ugrottam.`);
                            }}
                          >
                            <Eye size={14} /> Ugrás a terméksorra
                          </button>
                          <button
                            className={primaryBtn}
                            type="button"
                            onClick={() => {
                              const searchText = cleanScannedBarcode(newProduct.barcode || newProduct.snCod || it.barcode || it.sn_cod || it.snCod || "") || String(it.barcode || it.title_ro || "");
                              setNewProductOpen(false);
                              setNewProduct(emptyNewProductForm());
                              setNewProductStockRows({});
                              focusProductInList(it, searchText, `Meglévő termék találat: ${searchText}. Készlet módosítása megnyitva.`);
                              openStockEditor(it);
                            }}
                          >
                            <Boxes size={14} /> Készlet
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
                <div className="space-y-3 rounded-xl border border-white/12 bg-white/[0.05] p-3">
                  {newProduct.imageUrl ? <img src={newProduct.imageUrl} alt="" className="aspect-square w-full rounded-xl object-cover" /> : <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-black/20 text-white/35"><ImagePlus size={32} /></div>}
                  <label className={label}>Kép URL
                    <input className={input} value={newProduct.imageUrl} onChange={(e) => setNewProduct((x) => ({ ...x, imageUrl: e.target.value }))} placeholder="https://..." />
                  </label>
                  <div className="rounded-xl border border-white/12 bg-black/10 p-3 text-xs text-white/60">
                    <p>Beszállítói kód: {newProduct.supplierProductCode || "nincs megadva"}</p>
                    <p className="mt-1">Vonalkód / SKU alap: {newProduct.barcode || "nincs megadva"}</p>
                    <p className="mt-1">S/N/COD: {newProduct.snCod || "nincs megadva"}</p>
                    <p className="mt-1">Vámtarifa kód: {newProduct.customsTariffCode || "nincs megadva"}</p>
                    <p className="mt-1">Kezdő készlet: {newProductTotalQty()} db</p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm"><Edit3 size={16} /> Alapadatok</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={label}>Terméknév románul<input className={input} value={newProduct.titleRo} onChange={(e) => setNewProduct((x) => ({ ...x, titleRo: e.target.value, shopifyTitle: x.shopifyTitle || e.target.value }))} placeholder="pl. Pantofi running" /></label>
                      <label className={label}>Terméknév magyarul<input className={input} value={newProduct.titleHu} onChange={(e) => setNewProduct((x) => ({ ...x, titleHu: e.target.value }))} /></label>
                      <label className={`${label} md:col-span-2`}>Leírás<textarea className="min-h-[90px] rounded-xl border border-white/18 bg-[#3f4959] px-3 py-2 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45" value={newProduct.descriptionRo} onChange={(e) => setNewProduct((x) => ({ ...x, descriptionRo: e.target.value }))} /></label>
                      <label className={label}>Beszállító / forrás
                        <select className={select} value={newProduct.supplierId} onChange={(e) => setNewProduct((x) => ({ ...x, supplierId: e.target.value }))}>
                          <option value="">Nincs megadva</option>
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </label>
                      <label className={label}>Márka
                        <select className={select} value={newProduct.brandCode} onChange={(e) => {
                          const nextBrand = e.target.value;
                          const mapped = standardSizeForBrandSize(nextBrand, newProduct.supplierSize);
                          setNewProduct((x) => ({ ...x, brandCode: nextBrand, size: mapped || x.size }));
                        }}>
                          <option value="">Nincs beállítva</option>
                          {brands.map((b) => <option key={b.id} value={b.code || b.id}>{b.name}</option>)}
                        </select>
                      </label>
                      <label className={label}>Főkategória
                        <select className={select} value={newProduct.categoryCode} onChange={(e) => setNewProduct((x) => ({ ...x, categoryCode: e.target.value, subCategoryCode: "" }))}>
                          <option value="">Nincs beállítva</option>
                          {categorySelectOptions.map((c) => <option key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}
                        </select>
                      </label>
                      <label className={label}>Alkategória / terméktípus
                        <select className={select} value={newProduct.subCategoryCode} onChange={(e) => {
                          const value = e.target.value;
                          const found = subCategories.find((c) => categoryValueMatches(c, value));
                          setNewProduct((x) => ({ ...x, subCategoryCode: value, productType: x.productType || (found ? categoryLabel(found) : "") }));
                        }}>
                          <option value="">Nincs beállítva</option>
                          {newProductSubCategoryOptions.map((c) => <option key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}
                        </select>
                      </label>
                      <label className={label}>Nem
                        <select className={select} value={newProduct.gender} onChange={(e) => setNewProduct((x) => ({ ...x, gender: e.target.value }))}>
                          {genderTypes.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                          {!genderTypes.length && <option value="unisex">Unisex</option>}
                        </select>
                      </label>
                      <label className={label}>Import terméktípus / RODESCR<input className={input} value={newProduct.productType} onChange={(e) => setNewProduct((x) => ({ ...x, productType: e.target.value }))} /></label>
                      <label className={label}>Szezon<input className={input} value={newProduct.season} onChange={(e) => setNewProduct((x) => ({ ...x, season: e.target.value }))} /></label>
                      <label className={label}>Anyag / összetétel<input className={input} value={newProduct.material} onChange={(e) => setNewProduct((x) => ({ ...x, material: e.target.value }))} placeholder="pl. piele, textil, bumbac" /></label>
                    </div>
                  </section>

                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm"><Boxes size={16} /> Variáns és árak</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className={label}>Termékkód<input className={input} value={newProduct.supplierProductCode} onChange={(e) => setNewProduct((x) => ({ ...x, supplierProductCode: e.target.value }))} placeholder="pl. 3026999-001" /></label>
                      <label className={label}>Vámtarifa kód<input className={input} value={newProduct.customsTariffCode} onChange={(e) => setNewProduct((x) => ({ ...x, customsTariffCode: e.target.value }))} placeholder="pl. 61099020" /></label>
                      <label className={label}>Variáns kód<input className={input} value={newProduct.supplierVariantCode} onChange={(e) => setNewProduct((x) => ({ ...x, supplierVariantCode: e.target.value }))} /></label>
                      <label className={label}>Vonalkód / Shopify SKU alap<input className={input} value={newProduct.barcode} onChange={(e) => setNewProduct((x) => ({ ...x, barcode: e.target.value }))} /></label>
                      <label className={label}>S/N/COD<input className={input} value={newProduct.snCod} onChange={(e) => setNewProduct((x) => ({ ...x, snCod: e.target.value }))} /></label>
                      <label className={label}>Szín<input className={input} list="warehouse-color-options" value={newProduct.colorName} onChange={(e) => setNewProduct((x) => ({ ...x, colorName: e.target.value }))} placeholder="pl. negru" /></label>
                      <label className={label}>Gyártói színkód<input className={input} value={newProduct.supplierColorCode || newProduct.colorCode} onChange={(e) => setNewProduct((x) => ({ ...x, supplierColorCode: e.target.value, colorCode: e.target.value }))} placeholder="pl. 001" /></label>
                      <label className={label}>Gyártói méret<input className={input} value={newProduct.supplierSize} onChange={(e) => {
                        const supplierSizeValue = e.target.value;
                        const mapped = standardSizeForBrandSize(newProduct.brandCode, supplierSizeValue);
                        setNewProduct((x) => ({ ...x, supplierSize: supplierSizeValue, size: mapped || x.size || supplierSizeValue }));
                      }} placeholder="pl. US 8.5 vagy OSFM" /></label>
                      <label className={label}>Standard méret<input className={input} list="warehouse-standard-size-options" value={newProduct.size} onChange={(e) => setNewProduct((x) => ({ ...x, size: e.target.value }))} placeholder="pl. OSFM, M, EU 42" /></label>
                      <label className={label}>Vételár<input className={input} value={newProduct.buyPrice} onChange={(e) => setNewProduct((x) => ({ ...x, buyPrice: e.target.value }))} inputMode="decimal" /></label>
                      <label className={label}>Eladási ár<input className={input} value={newProduct.sellPrice} onChange={(e) => setNewProduct((x) => ({ ...x, sellPrice: e.target.value }))} inputMode="decimal" /></label>
                      <label className={label}>Akció előtti ár<input className={input} value={newProduct.compareAtPrice} onChange={(e) => setNewProduct((x) => ({ ...x, compareAtPrice: e.target.value }))} inputMode="decimal" /></label>
                      <label className={`${label} md:col-span-2`}>Shopify cím<input className={input} value={newProduct.shopifyTitle} onChange={(e) => setNewProduct((x) => ({ ...x, shopifyTitle: e.target.value }))} /></label>
                      <label className={label}>Variáns állapot<select className={select} value={newProduct.variantStatus} onChange={(e) => setNewProduct((x) => ({ ...x, variantStatus: e.target.value }))}><option value="active">Aktív</option><option value="inactive">Inaktív</option><option value="archived">Archivált</option></select></label>
                    </div>
                  </section>
                </div>
              </div>

              <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-white/88">Kezdő készlet célhelyenként</p>
                    <p className="text-xs text-white/55">Csak a pozitív mennyiségek kerülnek mentésre. Összesen: <span className="text-white">{newProductTotalQty()}</span> db</p>
                  </div>
                  <button className={btnSoft} type="button" onClick={() => setNewProductStockRows(emptyStockRowsByLocation("0"))}>Nullázás</button>
                </div>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {stockLocationRows.map((loc) => {
                    const key = locationKey(loc);
                    return (
                      <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-[#3f4959] px-3 py-2 text-sm text-white/78">
                        <span className="min-w-0 truncate">{loc.name || loc.code}</span>
                        <input className="h-9 w-24 rounded-lg border border-white/16 bg-[#303a4c] px-2 text-right text-white outline-none focus:border-white/45" value={newProductStockRows[key] || ""} onChange={(e) => setNewProductLocationQty(loc, e.target.value)} inputMode="numeric" placeholder="0" />
                      </label>
                    );
                  })}
                  {!stockLocationRows.length && <p className="rounded-xl border border-amber-200/20 bg-amber-400/10 px-2 py-2 text-sm text-amber-100">Nincs aktív célhely. Előbb vegyél fel legalább egy aktív lokációt a törzsadatoknál.</p>}
                </div>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 pt-4">
                <div className="text-sm text-white/65">Mentés után a termék azonnal megjelenik a raktárlistában, a készletmozgás pedig kézi bevitelként naplózódik.</div>
                <div className="flex gap-2">
                  <button className={btnSoft} type="button" onClick={closeNewProductModal} disabled={newProductSaving}>Mégse</button>
                  <button className={primaryBtn} type="button" onClick={saveNewProduct} disabled={newProductSaving || newProductTotalQty() <= 0}><Save size={15} /> Termék mentése</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {productDeleteTarget && (
        <div className={modalWrap}>
          <div className="w-full max-w-md rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Termék törlése</p>
                <h2 className="mt-1 text-lg text-white">Biztosan törlöd?</h2>
              </div>
              <button className={taxonomySmallBtn} onClick={() => setProductDeleteTarget(null)} type="button"><X size={14} /> Bezárás</button>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-rose-200/24 bg-rose-500/10 px-2 py-2 text-sm text-white/86">
                <p className="text-white">{productDeleteTarget.title_ro || "Névtelen termék"}</p>
                <p className="mt-1 text-xs text-white/62">{productDeleteTarget.brand_name || "Nincs márka"} • {productDeleteTarget.category_name_hu || productDeleteTarget.category_name_ro || "Nincs főkategória"} • {productDeleteTarget.size || "nincs méret"}</p>
              </div>
              <p className="text-xs leading-relaxed text-white/68">A termék azonnal eltűnik a raktárlistából és az aktuális importlistából is. Készletmozgáshoz kapcsolt terméknél a rendszer archiválja, hogy a korábbi előzmények ne sérüljenek.</p>
              <div className="flex justify-end gap-2 pt-1">
                <button className={btnSoft} onClick={() => setProductDeleteTarget(null)} disabled={saving} type="button">Mégse</button>
                <button className={dangerBtn} onClick={confirmDeleteProduct} disabled={saving} type="button"><Trash2 size={15} /> Törlés</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {taxonomyOpen && (
        <div className={modalWrap}>
          <div className={taxonomyModal}>
            <div className="sticky top-0 z-10 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3 backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">Raktár törzsadatok</p>
                  <h2 className="mt-1 text-[22px] leading-tight text-white">Főkategóriák, alkategóriák / terméktípusok, nemek, színek, méretek, márkakódok és összetevők kezelése</h2>
                  <p className="mt-1 text-sm text-white/60">Kompakt törzsadat-kezelés: bal oldalt szerkesztés, jobb oldalt lista.</p>
                </div>
                <button className={taxonomySmallBtn} onClick={() => setTaxonomyOpen(false)}><X size={14} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="inline-flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/10 p-1">
                <button className={taxonomyTab === "categories" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("categories"); setOpenTaxonomyMenu(null); }}>
                  Főkategóriák <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{mainCategories.length || categories.length}</span>
                </button>
                <button className={taxonomyTab === "subCategories" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("subCategories"); setOpenTaxonomyMenu(null); }}>
                  Alkategóriák / terméktípusok <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{subCategories.length}</span>
                </button>
                <button className={taxonomyTab === "genders" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("genders"); setOpenTaxonomyMenu(null); }}>
                  Nemek <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{genderTypes.length}</span>
                </button>
                <button className={taxonomyTab === "colors" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("colors"); setOpenTaxonomyMenu(null); }}>
                  Színek <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{colorTypes.length}</span>
                </button>
                <button className={taxonomyTab === "brandColors" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("brandColors"); setOpenTaxonomyMenu(null); }}>
                  Márka színkódok <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{brandColorCodes.length}</span>
                </button>
                <button className={taxonomyTab === "sizes" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("sizes"); setOpenTaxonomyMenu(null); }}>
                  Méretek <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{sizeTypes.length}</span>
                </button>
                <button className={taxonomyTab === "brandSizes" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("brandSizes"); setOpenTaxonomyMenu(null); }}>
                  Márkaméretek <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{brandSizeCodes.length}</span>
                </button>
                <button className={taxonomyTab === "materials" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("materials"); setOpenTaxonomyMenu(null); }}>
                  Összetevők <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{materialTypes.length}</span>
                </button>
              </div>

              {taxonomyTab === "categories" && (
                <div className="grid gap-3 lg:grid-cols-[0.94fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{categoryForm.id ? "Főkategória módosítása" : "Új főkategória"}</p>
                        <p className="text-[11px] text-white/50">Román és magyar megnevezés, import aliasokkal.</p>
                      </div>
                      {categoryForm.id && <button className={taxonomySmallBtn} onClick={resetCategoryForm}>Új</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={taxonomyField}>Megnevezés románul<input className={taxonomyInput} value={categoryForm.nameRo} onChange={(e) => setCategoryForm((x) => ({ ...x, nameRo: e.target.value }))} /></label>
                      <label className={taxonomyField}>Megnevezés magyarul<input className={taxonomyInput} value={categoryForm.nameHu} onChange={(e) => setCategoryForm((x) => ({ ...x, nameHu: e.target.value }))} /></label>
                      <label className={`${taxonomyField} md:col-span-2`}>Aliasok / import nevek<textarea className={taxonomyTextarea} value={categoryForm.aliases} onChange={(e) => setCategoryForm((x) => ({ ...x, aliases: e.target.value }))} placeholder="TSHIRT, T-Shirt, SHORTS CAS, hoodie, joggers" /></label>
                      <label className={`${taxonomyField} md:max-w-[180px]`}>Sorrend
                        <input className={taxonomyInput} value={categoryForm.sortOrder} onChange={(e) => setCategoryForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!categoryForm.id && <span className="text-[11px] text-white/45">Javasolt következő: {nextCategorySortOrder}</span>}
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveCategoryForm} disabled={taxonomyBusy || !canSaveCategoryForm} title={!canSaveCategoryForm ? ("A román megnevezés kötelező.") : "Mentés"}><Save size={14} /> Mentés</button>
                    </div>
                  </section>
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{"Főkategória lista"}</p>
                        <p className="text-[11px] text-white/50">Aktív elemek törzsrendi kezelése.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{mainCategories.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {mainCategories.map((c, index) => (
                        <div key={c.id} className={taxonomyRow}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-white">{categoryLabel(c)}</p>
                              {c.sort_order !== undefined && c.sort_order !== null && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">#{c.sort_order}</span>}
                            </div>
                            <p className="mt-0.5 text-[11px] text-white/50">RO: {c.name_ro || "-"} • HU: {c.name_hu || "-"}</p>
                            {!!c.aliases?.length && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">Alias: {c.aliases.join(", ")}</p>}
                          </div>
                          {taxonomyActionMenu({
                            menuId: `category-${c.id}`,
                            openUp: taxonomyMenuOpensUp(index, mainCategories.length),
                            onEdit: () => editCategoryRow(c),
                            onDelete: () => setDeleteTarget({ kind: "category", id: String(c.id), name: categoryLabel(c) }),
                          })}
                        </div>
                      ))}
                      {!mainCategories.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív főkategória.</p>}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "subCategories" && (
                <div className="grid gap-3 lg:grid-cols-[0.94fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{subCategoryForm.id ? "Alkategória / terméktípus módosítása" : "Új alkategória / terméktípus"}</p>
                        <p className="text-[11px] text-white/50">Főkategóriához kötött terméktípus, import aliasokkal.</p>
                      </div>
                      {subCategoryForm.id && <button className={taxonomySmallBtn} onClick={resetSubCategoryForm}>Új</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={`${taxonomyField} md:col-span-2`}>Főkategória
                        <select className={taxonomyInput} value={subCategoryForm.parentId} onChange={(e) => setSubCategoryForm((x) => ({ ...x, parentId: e.target.value }))}>
                          <option value="">Válassz főkategóriát</option>
                          {(mainCategories.length ? mainCategories : categories).map((c) => <option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}
                        </select>
                      </label>
                      <label className={taxonomyField}>Megnevezés románul<input className={taxonomyInput} value={subCategoryForm.nameRo} onChange={(e) => setSubCategoryForm((x) => ({ ...x, nameRo: e.target.value }))} /></label>
                      <label className={taxonomyField}>Megnevezés magyarul<input className={taxonomyInput} value={subCategoryForm.nameHu} onChange={(e) => setSubCategoryForm((x) => ({ ...x, nameHu: e.target.value }))} /></label>
                      <label className={`${taxonomyField} md:col-span-2`}>Aliasok / import nevek<textarea className={taxonomyTextarea} value={subCategoryForm.aliases} onChange={(e) => setSubCategoryForm((x) => ({ ...x, aliases: e.target.value }))} placeholder="RODESCR, SUBCATEGORIE, PRODUCT TYPE, TRICOU" /></label>
                      <label className={`${taxonomyField} md:max-w-[180px]`}>Sorrend
                        <input className={taxonomyInput} value={subCategoryForm.sortOrder} onChange={(e) => setSubCategoryForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!subCategoryForm.id && <span className="text-[11px] text-white/45">Javasolt következő: {nextSubCategorySortOrder}</span>}
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveSubCategoryForm} disabled={taxonomyBusy || !canSaveSubCategoryForm} title={!canSaveSubCategoryForm ? "Főkategória és román megnevezés kötelező." : "Mentés"}><Save size={14} /> Mentés</button>
                    </div>
                  </section>
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Alkategória / terméktípus lista</p>
                        <p className="text-[11px] text-white/50">Főkategória szerint kötött aktív terméktípusok.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{subCategories.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {subCategories.map((c, index) => (
                        <div key={c.id} className={taxonomyRow}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-white">{categoryLabel(c)}</p>
                              {c.sort_order !== undefined && c.sort_order !== null && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">#{c.sort_order}</span>}
                            </div>
                            <p className="mt-0.5 text-[11px] text-white/50">Főkategória: {subCategoryParentLabel(c)} • RO: {c.name_ro || "-"} • HU: {c.name_hu || "-"}</p>
                            {!!c.aliases?.length && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">Alias: {c.aliases.join(", ")}</p>}
                          </div>
                          {taxonomyActionMenu({
                            menuId: `subcategory-${c.id}`,
                            openUp: taxonomyMenuOpensUp(index, subCategories.length),
                            onEdit: () => editSubCategoryRow(c),
                            onDelete: () => setDeleteTarget({ kind: "subCategory", id: String(c.id), name: categoryLabel(c) }),
                          })}
                        </div>
                      ))}
                      {!subCategories.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív alkategória / terméktípus.</p>}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "genders" && (
                <div className="grid gap-3 lg:grid-cols-[0.9fr,1.1fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{genderForm.code ? "Nem módosítása" : "Új nem"}</p>
                        <p className="text-[11px] text-white/50">Megnevezés, import aliasok és sorrend.</p>
                      </div>
                      {genderForm.code && <button className={taxonomySmallBtn} onClick={resetGenderForm}>Új</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr,170px]">
                      <label className={taxonomyField}>Megnevezés<input className={taxonomyInput} value={genderForm.name} onChange={(e) => setGenderForm((x) => ({ ...x, name: e.target.value }))} /></label>
                      <label className={taxonomyField}>Sorrend
                        <input className={taxonomyInput} value={genderForm.sortOrder} onChange={(e) => setGenderForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!genderForm.code && <span className="text-[11px] text-white/45">Javasolt következő: {nextGenderSortOrder}</span>}
                      </label>
                      <label className={`${taxonomyField} md:col-span-2`}>Aliasok / import nevek<textarea className={taxonomyTextarea} value={genderForm.aliases} onChange={(e) => setGenderForm((x) => ({ ...x, aliases: e.target.value }))} placeholder="Barbat, Bărbat, Men, Ladies, Dama, Junior" /></label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveGenderForm} disabled={taxonomyBusy || !canSaveGenderForm} title={!canSaveGenderForm ? "A megnevezés kötelező." : "Mentés"}><Save size={14} /> Mentés</button>
                    </div>
                  </section>
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Nemek listája</p>
                        <p className="text-[11px] text-white/50">A termékekhez használható nemek.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{genderTypes.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {genderTypes.map((g, index) => (
                        <div key={g.code} className={taxonomyRow}>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-white">{g.name}</p>
                              {g.sort_order !== undefined && g.sort_order !== null && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">#{g.sort_order}</span>}
                            </div>
                            <p className="mt-0.5 text-[11px] text-white/45">Kód: {g.code}</p>
                            {!!g.aliases?.length && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">Alias: {g.aliases.join(", ")}</p>}
                          </div>
                          {taxonomyActionMenu({
                            menuId: `gender-${g.code}`,
                            openUp: taxonomyMenuOpensUp(index, genderTypes.length),
                            onEdit: () => editGenderRow(g),
                            onDelete: () => setDeleteTarget({ kind: "gender", id: String(g.code), name: g.name }),
                          })}
                        </div>
                      ))}
                      {!genderTypes.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív elem.</p>}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "colors" && (
                <div className="grid gap-3 lg:grid-cols-[0.95fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{colorForm.id ? "Szín módosítása" : "Új szín"}</p>
                        <p className="text-[11px] text-white/50">Hivatalos román név, fordítások és import aliasok.</p>
                      </div>
                      {colorForm.id && <button className={taxonomySmallBtn} onClick={resetColorForm}>Új szín</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={taxonomyField}>Román hivatalos név<input className={taxonomyInput} value={colorForm.nameRo} onChange={(e) => setColorForm((x) => ({ ...x, nameRo: e.target.value }))} placeholder="pl. negru" /></label>
                      <label className={taxonomyField}>Magyar név<input className={taxonomyInput} value={colorForm.nameHu} onChange={(e) => setColorForm((x) => ({ ...x, nameHu: e.target.value }))} placeholder="pl. fekete" /></label>
                      <label className={taxonomyField}>Angol név<input className={taxonomyInput} value={colorForm.nameEn} onChange={(e) => setColorForm((x) => ({ ...x, nameEn: e.target.value }))} placeholder="pl. black" /></label>
                      <label className={taxonomyField}>Német név<input className={taxonomyInput} value={colorForm.nameDe} onChange={(e) => setColorForm((x) => ({ ...x, nameDe: e.target.value }))} placeholder="pl. schwarz" /></label>
                      <label className={`${taxonomyField} md:col-span-2`}>Aliasok / import nevek<textarea className={taxonomyTextarea} value={colorForm.aliases} onChange={(e) => setColorForm((x) => ({ ...x, aliases: e.target.value }))} placeholder="Black, schwarz, fekete, nero, noir" /></label>
                      <label className={taxonomyField}>HEX<input className={taxonomyInput} value={colorForm.hex} onChange={(e) => setColorForm((x) => ({ ...x, hex: e.target.value }))} placeholder="#000000" /></label>
                      <label className={taxonomyField}>Sorrend
                        <input className={taxonomyInput} value={colorForm.sortOrder} onChange={(e) => setColorForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!colorForm.id && <span className="text-[11px] text-white/45">Javasolt következő: {nextColorSortOrder}</span>}
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveColorForm} disabled={taxonomyBusy || !canSaveColorForm} title={!canSaveColorForm ? "A román hivatalos név kötelező." : "Mentés"}><Save size={14} /> Mentés</button>
                    </div>
                  </section>
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Szín lista</p>
                        <p className="text-[11px] text-white/50">Fordításokkal és import aliasokkal együtt.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{colorTypes.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {colorTypes.map((c, index) => (
                        <div key={c.id} className={taxonomyRow}>
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-white/25 bg-white/10 shadow-[0_0_0_3px_rgba(255,255,255,0.03)]" style={c.hex ? { backgroundColor: c.hex } : undefined} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm text-white">{c.name_ro}</p>
                                {c.hex && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">{c.hex}</span>}
                                {c.sort_order !== undefined && c.sort_order !== null && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">#{c.sort_order}</span>}
                              </div>
                              <p className="mt-0.5 text-[11px] text-white/50">HU: {c.name_hu || "-"} • EN: {c.name_en || "-"} • DE: {c.name_de || "-"}</p>
                              {!!c.aliases?.length && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">Alias: {c.aliases.join(", ")}</p>}
                            </div>
                          </div>
                          {taxonomyActionMenu({
                            menuId: `color-${c.id}`,
                            openUp: taxonomyMenuOpensUp(index, colorTypes.length),
                            onEdit: () => editColorRow(c),
                            onDelete: () => setDeleteTarget({ kind: "color", id: String(c.id), name: c.name_ro }),
                          })}
                        </div>
                      ))}
                      {!colorTypes.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív szín.</p>}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "brandColors" && (
                <div className="grid gap-3 lg:grid-cols-[0.95fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{brandColorForm.id ? "Márka színkód módosítása" : "Új márka színkód"}</p>
                        <p className="text-[11px] text-white/50">Gyártói kód fordítása AllIn színre, márkához kötve. Nem globális alias, mert ugyanaz a kód márkánként mást jelenthet.</p>
                      </div>
                      {brandColorForm.id && <button className={taxonomySmallBtn} onClick={resetBrandColorForm}>Új színkód</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={taxonomyField}>Márka
                        <select className={taxonomyInput} value={brandColorForm.brandId} onChange={(e) => setBrandColorForm((x) => ({ ...x, brandId: e.target.value }))}>
                          <option value="">Válassz márkát</option>
                          {brands.map((b) => <option key={b.id} value={b.id}>{brandLabel(b)}</option>)}
                        </select>
                      </label>
                      <label className={taxonomyField}>Gyártói színkód
                        <input className={taxonomyInput} value={brandColorForm.colorCode} onChange={(e) => setBrandColorForm((x) => ({ ...x, colorCode: e.target.value.toUpperCase() }))} placeholder="pl. 100 vagy 001" />
                      </label>
                      <label className={taxonomyField}>AllIn szín
                        <select className={taxonomyInput} value={brandColorForm.colorTypeId} onChange={(e) => setBrandColorForm((x) => ({ ...x, colorTypeId: e.target.value }))}>
                          <option value="">Válassz színt</option>
                          {colorTypes.map((c) => <option key={c.id} value={c.id}>{colorTypeLabel(c)}{c.name_ro && c.name_hu ? ` • ${c.name_ro}` : ""}</option>)}
                        </select>
                      </label>
                      <label className={`${taxonomyField} md:col-span-2`}>Megjegyzés
                        <textarea className={taxonomyTextarea} value={brandColorForm.notes} onChange={(e) => setBrandColorForm((x) => ({ ...x, notes: e.target.value }))} placeholder="pl. Under Armour CODPRODUS utolsó része: 100 = fekete/negru" />
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveBrandColorForm} disabled={taxonomyBusy || !canSaveBrandColorForm} title={!canSaveBrandColorForm ? "Márka, gyártói színkód és AllIn szín kell." : "Mentés"}><Save size={14} /> Mentés</button>
                    </div>
                  </section>

                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Márka színkód lista</p>
                        <p className="text-[11px] text-white/50">Importnál például Under Armour + 100 → fekete/negru.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{brandColorCodes.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {brandColorCodes.map((row, index) => (
                        <div key={row.id} className={taxonomyRow}>
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-white/25 bg-white/10 shadow-[0_0_0_3px_rgba(255,255,255,0.03)]" style={row.color_hex ? { backgroundColor: row.color_hex } : undefined} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm text-white">{row.brand_name || row.brand_code || "-"}</p>
                                <span className="rounded-full border border-[#67d4d1]/25 bg-[#208d8b]/18 px-2 py-0.5 text-[10px] text-white">{row.color_code}</span>
                                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/65">{row.color_name_hu || row.color_name_ro || row.color_type_code || "-"}</span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-white/50">RO: {row.color_name_ro || "-"} • HU: {row.color_name_hu || "-"} • HEX: {row.color_hex || "-"}</p>
                              {row.notes && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">{row.notes}</p>}
                            </div>
                          </div>
                          {taxonomyActionMenu({
                            menuId: `brand-color-${row.id}`,
                            openUp: taxonomyMenuOpensUp(index, brandColorCodes.length),
                            onEdit: () => editBrandColorRow(row),
                            onDelete: () => setDeleteTarget({ kind: "brandColor", id: String(row.id), name: `${row.brand_name || row.brand_code || "-"} / ${row.color_code}` }),
                          })}
                        </div>
                      ))}
                      {!brandColorCodes.length && (
                        <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/60">
                          Nincs aktív márka színkód. Ha az SQL már lefutott, akkor az aif.js backend még nincs frissen deployolva.
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "sizes" && (
                <div className="grid gap-3 lg:grid-cols-[0.95fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{sizeForm.id ? "Standard méret módosítása" : "Új standard méret"}</p>
                        <p className="text-[11px] text-white/50">AllIn méret, amit importnál és kézi termékfelvételnél egységesen használunk.</p>
                      </div>
                      {sizeForm.id && <button className={taxonomySmallBtn} onClick={resetSizeForm}>Új méret</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={taxonomyField}>Standard méret
                        <input className={taxonomyInput} value={sizeForm.name} onChange={(e) => setSizeForm((x) => ({ ...x, name: e.target.value.toUpperCase() }))} placeholder="pl. OSFM, EU 42, 36 2/3" />
                      </label>
                      <label className={taxonomyField}>Magyar megnevezés
                        <input className={taxonomyInput} value={sizeForm.nameHu} onChange={(e) => setSizeForm((x) => ({ ...x, nameHu: e.target.value }))} placeholder="pl. one size, 42-es" />
                      </label>
                      <label className={taxonomyField}>Belső kód
                        <input className={taxonomyInput} value={sizeForm.code} onChange={(e) => setSizeForm((x) => ({ ...x, code: e.target.value }))} placeholder="üresen automatikus" />
                      </label>
                      <label className={`${taxonomyField} md:col-span-2`}>Aliasok / import nevek
                        <textarea className={taxonomyTextarea} value={sizeForm.aliases} onChange={(e) => setSizeForm((x) => ({ ...x, aliases: e.target.value }))} placeholder="ONE SIZE, OS, one-size, 42 EU, EU42" />
                      </label>
                      <label className={taxonomyField}>Sorrend
                        <input className={taxonomyInput} value={sizeForm.sortOrder} onChange={(e) => setSizeForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!sizeForm.id && <span className="text-[11px] text-white/45">Javasolt következő: {nextSizeSortOrder}</span>}
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveSizeForm} disabled={taxonomyBusy || !canSaveSizeForm} title={!canSaveSizeForm ? "A standard méret kötelező." : "Mentés"}><Save size={14} /> Mentés</button>
                    </div>
                  </section>

                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Standard méret lista</p>
                        <p className="text-[11px] text-white/50">OSFM, ruhaméretek és cipőméretek standard oldala.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{sizeTypes.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {sizeTypes.map((row, index) => (
                        <div key={row.id} className={taxonomyRow}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-white">{sizeTypeLabel(row)}</p>
                              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/65">{row.code}</span>
                              <span className="rounded-full border border-[#67d4d1]/25 bg-[#208d8b]/18 px-2 py-0.5 text-[10px] text-white">#{row.sort_order ?? "-"}</span>
                            </div>
                            {row.name_hu && <p className="mt-0.5 text-[11px] text-white/50">HU: {row.name_hu}</p>}
                            {!!row.aliases?.length && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">Alias: {row.aliases.join(", ")}</p>}
                          </div>
                          {taxonomyActionMenu({
                            menuId: `size-${row.id}`,
                            openUp: taxonomyMenuOpensUp(index, sizeTypes.length),
                            onEdit: () => editSizeRow(row),
                            onDelete: () => setDeleteTarget({ kind: "size", id: String(row.id), name: sizeTypeLabel(row) }),
                          })}
                        </div>
                      ))}
                      {!sizeTypes.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív standard méret.</p>}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "brandSizes" && (
                <div className="grid gap-3 lg:grid-cols-[0.95fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{brandSizeForm.id ? "Márkaméret módosítása" : "Új márkaméret"}</p>
                        <p className="text-[11px] text-white/50">Gyártói méret fordítása standard AllIn méretre, márkához kötve. Cipőknél ez márkánként eltérhet.</p>
                      </div>
                      {brandSizeForm.id && <button className={taxonomySmallBtn} onClick={resetBrandSizeForm}>Új márkaméret</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={taxonomyField}>Márka
                        <select className={taxonomyInput} value={brandSizeForm.brandId} onChange={(e) => setBrandSizeForm((x) => ({ ...x, brandId: e.target.value }))}>
                          <option value="">Válassz márkát</option>
                          {brands.map((b) => <option key={b.id} value={b.id}>{brandLabel(b)}</option>)}
                        </select>
                      </label>
                      <label className={taxonomyField}>Gyártói méret / méretkód
                        <input className={taxonomyInput} value={brandSizeForm.sizeCode} onChange={(e) => setBrandSizeForm((x) => ({ ...x, sizeCode: e.target.value.toUpperCase() }))} placeholder="pl. 8.5, 42, MENS 9" />
                      </label>
                      <label className={taxonomyField}>Standard AllIn méret
                        <select className={taxonomyInput} value={brandSizeForm.sizeTypeId} onChange={(e) => setBrandSizeForm((x) => ({ ...x, sizeTypeId: e.target.value }))}>
                          <option value="">Válassz standard méretet</option>
                          {sizeTypes.map((st) => <option key={st.id} value={st.id}>{sizeTypeLabel(st)}</option>)}
                        </select>
                      </label>
                      <label className={`${taxonomyField} md:col-span-2`}>Megjegyzés
                        <textarea className={taxonomyTextarea} value={brandSizeForm.notes} onChange={(e) => setBrandSizeForm((x) => ({ ...x, notes: e.target.value }))} placeholder="pl. Adidas US 8.5 = EU 42" />
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveBrandSizeForm} disabled={taxonomyBusy || !canSaveBrandSizeForm} title={!canSaveBrandSizeForm ? "Márka, gyártói méret és standard méret kell." : "Mentés"}><Save size={14} /> Mentés</button>
                    </div>
                  </section>

                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Márkaméret lista</p>
                        <p className="text-[11px] text-white/50">Importnál például Adidas + US 8.5 → EU 42.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{brandSizeCodes.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {brandSizeCodes.map((row, index) => (
                        <div key={row.id} className={taxonomyRow}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-white">{row.brand_name || row.brand_code || "-"}</p>
                              <span className="rounded-full border border-[#67d4d1]/25 bg-[#208d8b]/18 px-2 py-0.5 text-[10px] text-white">{row.size_code}</span>
                              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/65">{row.size_name || row.size_type_code || "-"}</span>
                            </div>
                            {row.notes && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">{row.notes}</p>}
                          </div>
                          {taxonomyActionMenu({
                            menuId: `brand-size-${row.id}`,
                            openUp: taxonomyMenuOpensUp(index, brandSizeCodes.length),
                            onEdit: () => editBrandSizeRow(row),
                            onDelete: () => setDeleteTarget({ kind: "brandSize", id: String(row.id), name: `${row.brand_name || row.brand_code || "-"} / ${row.size_code}` }),
                          })}
                        </div>
                      ))}
                      {!brandSizeCodes.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív márkaméret.</p>}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "materials" && (
                <div className="grid gap-3 lg:grid-cols-[0.95fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{materialForm.id ? "Összetevő módosítása" : "Új összetevő"}</p>
                        <p className="text-[11px] text-white/50">Hivatalos román név, fordítások és import aliasok.</p>
                      </div>
                      {materialForm.id && <button className={taxonomySmallBtn} onClick={resetMaterialForm}>Új összetevő</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={taxonomyField}>Román hivatalos név<input className={taxonomyInput} value={materialForm.nameRo} onChange={(e) => setMaterialForm((x) => ({ ...x, nameRo: e.target.value }))} placeholder="pl. bumbac" /></label>
                      <label className={taxonomyField}>Magyar név<input className={taxonomyInput} value={materialForm.nameHu} onChange={(e) => setMaterialForm((x) => ({ ...x, nameHu: e.target.value }))} placeholder="pl. pamut" /></label>
                      <label className={taxonomyField}>Angol név<input className={taxonomyInput} value={materialForm.nameEn} onChange={(e) => setMaterialForm((x) => ({ ...x, nameEn: e.target.value }))} placeholder="pl. cotton" /></label>
                      <label className={taxonomyField}>Német név<input className={taxonomyInput} value={materialForm.nameDe} onChange={(e) => setMaterialForm((x) => ({ ...x, nameDe: e.target.value }))} placeholder="pl. baumwolle" /></label>
                      <label className={`${taxonomyField} md:col-span-2`}>Aliasok / import nevek<textarea className={taxonomyTextarea} value={materialForm.aliases} onChange={(e) => setMaterialForm((x) => ({ ...x, aliases: e.target.value }))} placeholder="COTTON, BODY FABRIC COTTON, Baumwolle, pamut" /></label>
                      <label className={taxonomyField}>Sorrend
                        <input className={taxonomyInput} value={materialForm.sortOrder} onChange={(e) => setMaterialForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!materialForm.id && <span className="text-[11px] text-white/45">Javasolt következő: {nextMaterialSortOrder}</span>}
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveMaterialForm} disabled={taxonomyBusy || !canSaveMaterialForm} title={!canSaveMaterialForm ? "A román hivatalos összetevőnév kötelező." : "Mentés"}><Save size={14} /> Mentés</button>
                    </div>
                  </section>
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Összetevő lista</p>
                        <p className="text-[11px] text-white/50">Import nevek hivatalos román összetevőkre fordítva.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{materialTypes.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {materialTypes.map((m, index) => (
                        <div key={m.id} className={taxonomyRow}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-white">{m.name_hu || m.name_ro}</p>
                              {m.sort_order !== undefined && m.sort_order !== null && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">#{m.sort_order}</span>}
                            </div>
                            <p className="mt-0.5 text-[11px] text-white/50">RO: {m.name_ro || "-"} • HU: {m.name_hu || "-"} • EN: {m.name_en || "-"} • DE: {m.name_de || "-"}</p>
                            {!!m.aliases?.length && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">Alias: {m.aliases.join(", ")}</p>}
                          </div>
                          {taxonomyActionMenu({
                            menuId: `material-${m.id}`,
                            openUp: taxonomyMenuOpensUp(index, materialTypes.length),
                            onEdit: () => editMaterialRow(m),
                            onDelete: () => setDeleteTarget({ kind: "material", id: String(m.id), name: m.name_hu || m.name_ro }),
                          })}
                        </div>
                      ))}
                      {!materialTypes.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív összetevő.</p>}
                    </div>
                  </section>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/64 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/18 bg-[#4b5362] p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rose-300/30 bg-[#cf1028] text-white shadow-[0_0_22px_rgba(207,16,40,0.35)]">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-base text-white">Törlés megerősítése</p>
                <p className="mt-1 text-sm text-white/68">A kiválasztott törzsadat törlésre kerül. Ha már használatban van, a rendszer inaktiválja, hogy a korábbi adatok ne sérüljenek.</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-white/12 bg-[#354153] px-3 py-2 text-sm text-white">
              {deleteTarget.name}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={taxonomySmallBtn} onClick={() => setDeleteTarget(null)} disabled={taxonomyBusy} type="button"><X size={13} /> Mégse</button>
              <button className={taxonomyDangerBtn} onClick={confirmDeleteTaxonomy} disabled={taxonomyBusy} type="button"><Trash2 size={13} /> Törlés</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className={modalWrap}>
          <div className={modal}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3">
              <div>
                <p className="text-sm text-white/65">Termékadatlap</p>
                <h2 className="text-xl">{detail.item?.title_ro || "Termék"}</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  className={btn}
                  onClick={() => goBarcodeManager(detail.item?.id, edit.barcode, edit.titleRo || detail.item?.title_ro)}
                  disabled={!detail.item?.id}
                  type="button"
                  title="Külön vonalkód- és címkemodul megnyitása"
                >
                  <Barcode size={16} /> Vonalkód / címke
                </button>
                <button className={btnSoft} onClick={() => setDetail(null)}><X size={16} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-4 p-4">
              {detailBusy && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-4 text-sm text-white/65">Betöltés...</div>}

              <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
                <div className="space-y-3 rounded-xl border border-white/12 bg-white/[0.05] p-3">
                  {edit.imageUrl ? <img src={edit.imageUrl} alt="" className="aspect-square w-full rounded-xl object-cover" /> : <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-black/20 text-white/35"><ImagePlus size={32} /></div>}
                  <label className={label}>Kép feltöltése
                    <input type="file" accept="image/*" className="text-xs text-white/70" onChange={(e) => onImageSelected(e.target.files?.[0] || null)} />
                  </label>
                  <label className={label}>Kép URL
                    <input className={input} value={edit.imageUrl} onChange={(e) => setEdit((x) => ({ ...x, imageUrl: e.target.value }))} placeholder="https://..." />
                  </label>
                  <div className="rounded-xl border border-white/12 bg-black/10 p-3 text-xs text-white/60">
                    <p>Belső azonosító: {detail.item?.internal_sku || "-"}</p>
                    <p className="mt-1">Termékkód: {edit.supplierProductCode || "nincs megadva"}</p>
                    <p className="mt-1">Vonalkód / SKU alap: {edit.barcode || "nincs megadva"}</p>
                    <p className="mt-1">S/N/COD: {edit.snCod || "nincs megadva"}</p>
                    <p className="mt-1">Vámtarifa kód: {edit.customsTariffCode || "nincs megadva"}</p>
                    <p className="mt-1">Utolsó módosítás: {dateShort(detail.item?.updated_at)}</p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm"><Edit3 size={16} /> Alapadatok</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={label}>Terméknév románul<input className={input} value={edit.titleRo} onChange={(e) => setEdit((x) => ({ ...x, titleRo: e.target.value }))} /></label>
                      <label className={label}>Terméknév magyarul<input className={input} value={edit.titleHu} onChange={(e) => setEdit((x) => ({ ...x, titleHu: e.target.value }))} /></label>
                      <label className={`${label} md:col-span-2`}>Leírás<textarea className="min-h-[90px] rounded-xl border border-white/18 bg-[#3f4959] px-3 py-2 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45" value={edit.descriptionRo} onChange={(e) => setEdit((x) => ({ ...x, descriptionRo: e.target.value }))} /></label>
                      <label className={label}>Márka<select className={select} value={edit.brandCode} onChange={(e) => setEdit((x) => ({ ...x, brandCode: e.target.value }))}><option value="">Nincs beállítva</option>{brands.map((b) => <option key={b.id} value={b.code || b.id}>{b.name}</option>)}</select></label>
                      <label className={label}>Főkategória<select className={select} value={edit.categoryCode} onChange={(e) => setEdit((x) => ({ ...x, categoryCode: e.target.value, subCategoryCode: "" }))}><option value="">Nincs beállítva</option>{categorySelectOptions.map((c) => <option key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}</select></label>
                      <label className={label}>Alkategória / terméktípus<select className={select} value={edit.subCategoryCode} onChange={(e) => { const value = e.target.value; const found = subCategories.find((c) => categoryValueMatches(c, value)); setEdit((x) => ({ ...x, subCategoryCode: value, productType: x.productType || (found ? categoryLabel(found) : "") })); }}><option value="">Nincs beállítva</option>{editSubCategoryOptions.map((c) => <option key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}</select></label>
                      <label className={label}>Nem<select className={select} value={edit.gender} onChange={(e) => setEdit((x) => ({ ...x, gender: e.target.value }))}>{genderTypes.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}</select></label>
                      <label className={label}>Import terméktípus / RODESCR<input className={input} value={edit.productType} onChange={(e) => setEdit((x) => ({ ...x, productType: e.target.value }))} /></label>
                      <label className={label}>Szezon<input className={input} value={edit.season} onChange={(e) => setEdit((x) => ({ ...x, season: e.target.value }))} /></label>
                      <label className={label}>Anyag / összetétel<input className={input} value={edit.material} onChange={(e) => setEdit((x) => ({ ...x, material: e.target.value }))} /></label>
                    </div>
                  </section>

                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm"><Boxes size={16} /> Variáns és árak</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className={label}>Termékkód<input className={input} value={edit.supplierProductCode} onChange={(e) => setEdit((x) => ({ ...x, supplierProductCode: e.target.value }))} placeholder="pl. 1329582-402" /></label>
                      <label className={label}>
                        <span className="flex items-center gap-1.5">
                          <span>Vonalkód / Shopify SKU alap</span>
                          <span
                            className={`group relative inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] leading-none shadow transition ${
                              String(edit.barcode || "").trim()
                                ? "border-[#7bd7d4]/70 bg-[#2a8d8b] text-white shadow-[0_0_10px_rgba(42,141,139,0.38)]"
                                : "border-amber-200/60 bg-amber-300 text-slate-900 shadow-[0_0_10px_rgba(252,211,77,0.32)]"
                            }`}
                            tabIndex={0}
                            aria-label={String(edit.barcode || "").trim() ? "SKU alap megadva" : "Egyedi variánsazonosító információ"}
                          >
                            i
                            <span
                              className={`pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden w-64 -translate-x-1/2 rounded-lg border bg-[#1f2937] px-2 py-1.5 text-[11px] leading-snug tracking-normal text-white shadow-xl group-hover:block group-focus:block ${
                                String(edit.barcode || "").trim() ? "border-[#2a8d8b]/55" : "border-amber-200/35"
                              }`}
                            >
                              {String(edit.barcode || "").trim()
                                ? "SKU alap megadva. Ez kerül a Shopify SKU mezőbe."
                                : "Egyedi variánsazonosító. Később ez kerül a Shopify SKU mezőbe."}
                            </span>
                          </span>
                        </span>
                        <div className="relative">
                          <input className={`${input} w-full pr-12`} value={edit.barcode} onChange={(e) => setEdit((x) => ({ ...x, barcode: e.target.value }))} />
                          <button
                            className="absolute right-1.5 top-1.5 inline-flex h-7 w-9 items-center justify-center rounded-lg border border-[#7bd7d4]/35 bg-[#2a8d8b]/70 text-white shadow-[0_0_10px_rgba(42,141,139,0.18)] hover:bg-[#2a8d8b] focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/45"
                            type="button"
                            onClick={() => openBarcodeScanner("editBarcode")}
                            title="Vonalkód beolvasása kamerával"
                            aria-label="Vonalkód beolvasása kamerával ehhez a termékhez"
                          >
                            <Barcode size={15} />
                          </button>
                        </div>
                      </label>
                      <label className={label}>S/N/COD<input className={input} value={edit.snCod} onChange={(e) => setEdit((x) => ({ ...x, snCod: e.target.value }))} placeholder="belső azonosító" /></label>
                      <label className={label}>Vámtarifa kód<input className={input} value={edit.customsTariffCode} onChange={(e) => setEdit((x) => ({ ...x, customsTariffCode: e.target.value }))} placeholder="pl. 61102091" /></label>
                      <label className={label}>Szín<input className={input} value={edit.colorName} onChange={(e) => setEdit((x) => ({ ...x, colorName: e.target.value }))} onBlur={() => setEdit((x) => ({ ...x, colorName: normalizeColor(x.colorName) }))} placeholder="pl. negru" /></label>
                      <label className={label}>Színkód<input className={input} value={edit.colorCode} onChange={(e) => setEdit((x) => ({ ...x, colorCode: e.target.value }))} /></label>
                      <label className={label}>Méret<input className={input} list="warehouse-standard-size-options" value={edit.size} onChange={(e) => setEdit((x) => ({ ...x, size: e.target.value }))} onBlur={() => setEdit((x) => ({ ...x, size: normalizeSize(x.size) }))} /></label>
                      <label className={label}>Vételár<input className={input} value={edit.buyPrice} onChange={(e) => setEdit((x) => ({ ...x, buyPrice: e.target.value }))} /></label>
                      <label className={label}>Eladási ár<input className={input} value={edit.sellPrice} onChange={(e) => setEdit((x) => ({ ...x, sellPrice: e.target.value }))} /></label>
                      <label className={label}>Variáns állapot<select className={select} value={edit.variantStatus} onChange={(e) => setEdit((x) => ({ ...x, variantStatus: e.target.value }))}><option value="active">Aktív</option><option value="inactive">Inaktív</option><option value="archived">Archivált</option></select></label>
                      <label className={label}>Modell állapot<select className={select} value={edit.modelStatus} onChange={(e) => setEdit((x) => ({ ...x, modelStatus: e.target.value }))}><option value="draft">Előkészítés</option><option value="active">Aktív</option><option value="archived">Archivált</option></select></label>
                      <label className={label}>Shopify cím<input className={input} value={edit.shopifyTitle} onChange={(e) => setEdit((x) => ({ ...x, shopifyTitle: e.target.value }))} /></label>
                    </div>
                  </section>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Készlet célhelyenként</p>
                  <div className="space-y-2 text-sm">
                    {(detail.stock || []).map((s) => <div key={s.location_id} className="flex justify-between gap-3 rounded-lg bg-black/10 px-3 py-2"><span>{s.location_name}</span><span>{n(s.qty)} / elérhető {n(s.available_qty)}</span></div>)}
                    {!detail.stock?.length && <p className="text-white/55">Nincs készletadat.</p>}
                  </div>
                </section>
                <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Beszállítói kapcsolatok</p>
                  <div className="space-y-2 text-sm">
                    {(detail.supplierCodes || []).slice(0, 5).map((s) => <div key={s.id} className="rounded-lg bg-black/10 px-3 py-2"><p>{s.supplier_name || "-"}</p><p className="text-xs text-white/55">Termékkód: {s.supplier_product_code || "-"} • Méret: {s.supplier_size || "-"}</p></div>)}
                    {!detail.supplierCodes?.length && <p className="text-white/55">Nincs beszállítói kapcsolat.</p>}
                  </div>
                </section>
                <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Hiányzó adatok</p>
                  <div className="flex flex-wrap gap-2">
                    {missingLabels({ ...detail.item, image_url: edit.imageUrl, barcode: edit.barcode, buy_price: edit.buyPrice, sell_price: edit.sellPrice, title_ro: edit.titleRo, size: edit.size, model_status: edit.modelStatus, variant_status: edit.variantStatus }).map((x) => <span key={x} className="rounded-full border border-amber-200/25 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100">{x}</span>)}
                    {!missingLabels({ ...detail.item, image_url: edit.imageUrl, barcode: edit.barcode, buy_price: edit.buyPrice, sell_price: edit.sellPrice, title_ro: edit.titleRo, size: edit.size, model_status: edit.modelStatus, variant_status: edit.variantStatus }).length && <span className="rounded-full border border-[#7bd7d4]/25 bg-[#2a8d8b]/12 px-2.5 py-1 text-xs text-[#d7fffd]">Nincs jelölt hiány</span>}
                  </div>
                </section>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-white/12 pt-4">
                <button className={btnSoft} onClick={() => setDetail(null)}><X size={16} /> Mégse</button>
                <button className={detailSaveButtonClass} onClick={saveDetail} disabled={saving || !detailHasChanges} title={!detailHasChanges ? "Nincs módosítás, amit menteni kellene." : "Módosítások mentése"}><Save size={16} /> Mentés</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {barcodeScanner && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 px-3 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Kamera / vonalkód</p>
                <h2 className="mt-1 flex items-center gap-2 text-lg"><Barcode size={18} /> {barcodeScanner.title}</h2>
                <p className="mt-1 text-xs text-white/60">{barcodeScanner.helper}</p>
              </div>
              <button className={btnSoft} type="button" onClick={closeBarcodeScanner}><X size={16} /> Bezárás</button>
            </div>
            <div className="space-y-3 p-4">
              <div className="relative overflow-hidden rounded-2xl border border-[#7bd7d4]/25 bg-black shadow-[0_18px_38px_rgba(0,0,0,0.28)]">
                <video ref={barcodeVideoRef} className="aspect-video w-full object-cover" autoPlay muted playsInline />
                <div className="pointer-events-none absolute inset-7 rounded-2xl border border-[#7bd7d4]/65 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
                <div className="pointer-events-none absolute left-10 right-10 top-1/2 border-t border-[#7bd7d4]/90 shadow-[0_0_14px_rgba(123,215,212,0.9)]" />
              </div>

              <div className="rounded-xl border border-white/12 bg-[#3f4959] px-3 py-2 text-sm text-white/75">
                {barcodeScannerStatus || "Kamera előkészítése..."}
              </div>

              <form
                className="grid gap-2 rounded-xl border border-white/12 bg-white/[0.05] p-3 sm:grid-cols-[1fr,auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  void applyScannedBarcode(barcodeScannerManualValue);
                }}
              >
                <label className="grid gap-1.5 text-xs text-white/70">
                  Kézi beírás, ha a kamera nem olvas
                  <input
                    className={input}
                    value={barcodeScannerManualValue}
                    onChange={(e) => setBarcodeScannerManualValue(e.target.value)}
                    placeholder="Vonalkód"
                    autoComplete="off"
                  />
                </label>
                <div className="flex items-end">
                  <button className={btn} type="submit" disabled={!barcodeScannerManualValue.trim()}><Barcode size={15} /> Használat</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {busy && <div className="fixed bottom-4 right-4 rounded-xl border border-white/15 bg-[#404a5b] px-4 py-3 text-sm text-white/80 shadow-xl"><RefreshCw className="mr-2 inline" size={15} /> Betöltés...</div>}
      {activationTodoCount > 0 && (
        <button
          className="fixed bottom-4 left-4 hidden rounded-xl border border-amber-200/20 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-50 shadow-xl transition hover:bg-amber-500/16 lg:block"
          type="button"
          onClick={showActivationTodoList}
          title="Aktiválandó készletes variánsok megnyitása"
        >
          <AlertTriangle className="mr-2 inline" size={15} /> {activationTodoCount} aktiválandó készleten lévő variáns
        </button>
      )}
    
      <div className="aifWarehouseLabelPrintRoot" style={labelPrintStyle}>
        {labelPrintPages.map((page, pageIndex) => (
          <div className="aifWarehouseLabelPrintPage" key={`label-page-${pageIndex}`}>
            {page.map((printLabel) => (
              <div className={`aifWarehousePrintLabel ${labelShowBorder ? "" : "noBorder"}`} key={printLabel.key}>
                <WarehouseLabelContent label={printLabel} />
              </div>
            ))}
          </div>
        ))}
      </div>
</main>
  );
}
