import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Barcode,
  Boxes,
  ClipboardList,
  Clock3,
  PackageCheck,
  PackageOpen,
  Receipt,
  CheckCircle2,
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
  ShoppingBag,
  ShoppingCart,
  X,
} from "lucide-react";
import ShopifyProductExportModal from "../components/ShopifyProductExportModal";
import ShopifySyncCenterModal from "../components/ShopifySyncCenterModal";
import { AIF_SHOPIFY_ICON_URL, isShopifyExportPending, isShopifyMappedItem } from "../components/ShopifyStatusIcon";
import {
  apiAifAddItemsToOpenPurchaseOrders,
  apiAifGetPurchaseOrder,
  apiAifListPurchaseOrders,
} from "../lib/aif/api";

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
const moveTinyBtn = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/16 bg-[#344257] text-white/86 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#7bd7d4]/45 hover:bg-[#405067] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/30 disabled:cursor-not-allowed disabled:opacity-50";
const moveCompactBtn = "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#7bd7d4]/35 bg-[#2a8d8b]/78 px-2.5 text-[11px] text-white transition hover:bg-[#319c99] focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/30 disabled:cursor-not-allowed disabled:opacity-45";
const moveRowActions = "ml-auto flex shrink-0 items-center gap-1";
const label = "grid gap-1.5 text-xs text-white/70";
const chip = "rounded-full border border-white/12 bg-white/[0.08] px-2.5 py-1 text-xs text-white/70";
const selectBox = "h-4 w-4 rounded border-white/30 bg-[#303a4c] accent-[#2a8d8b] focus:ring-2 focus:ring-[#2a8d8b]/45";
const WAREHOUSE_PRODUCTS_PER_PAGE = 50;
const WAREHOUSE_PRODUCTS_PER_PAGE_OPTIONS = [50, 100, 150, 200];
const WAREHOUSE_SALES_TVA_RATE_PERCENT = 21;
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

function ShopifyBrandMark({
  size = "sm",
  className = "",
  fill = false,
}: {
  size?: "xs" | "sm" | "md";
  className?: string;
  fill?: boolean;
}) {
  const dimension = size === "xs" ? "h-5 w-5" : size === "md" ? "h-8 w-8" : "h-6 w-6";
  const fallbackSize = size === "xs" ? 12 : size === "md" ? 18 : 15;
  const shellClass = fill
    ? "rounded-none border-0 bg-transparent shadow-none"
    : "rounded-md border border-[#95bf47]/75 bg-white shadow-sm";
  return (
    <span className={`${dimension} relative inline-flex shrink-0 items-center justify-center ${shellClass} ${className}`}>
      <ShoppingBag size={fallbackSize} strokeWidth={1.9} className="absolute text-[#008060]" />
      <img
        src={AIF_SHOPIFY_ICON_URL}
        alt=""
        className={`relative object-contain ${fill ? "h-full w-full" : "h-[78%] w-[78%]"}`}
        onError={(event) => { event.currentTarget.style.display = "none"; }}
      />
    </span>
  );
}

const stockMovesChangedStorageKey = "allinfashion:stockMoves:changed:v1";
const stockMovesChangedEventName = "aif:stock-moves-changed";
const warehouseShowAllAfterIncomingStorageKey = "allinfashion:warehouse:showAllAfterIncoming:v1";
const warehouseShowAllAfterIncomingEventName = "aif:warehouse-show-all-after-incoming";
const warehouseLocalPriceHistoryStorageKey = "allinfashion:warehouse:localPriceHistory:v1";
const warehouseBarcodeReturnStorageKey = "allinfashion:warehouse:barcodeReturn:v1";
const warehouseBarcodeChangedStorageKey = "allinfashion:barcode:changed:v1";
const purchaseOrdersChangedStorageKey = "allinfashion:purchaseOrders:changed:v1";
const purchaseOrdersChangedEventName = "aif:purchase-orders-changed";
const OPEN_ORDER_HANDOFF_KEY = "allinfashion:purchase-order-open:v1";
const WAREHOUSE_UIT_WARNING_THRESHOLD_RON = 10000;
const warehouseUitSuppressedStorageKey = "allinfashion:warehouse:uit-warning-suppressed:v1";

function warehouseUitWarningDocumentKey(documentId?: unknown, documentNumber?: unknown) {
  return firstWarehouseText(documentId, documentNumber);
}

function readWarehouseUitSuppressedDocuments() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.sessionStorage.getItem(warehouseUitSuppressedStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value || "").trim()).filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

function warehouseUitWarningIsSuppressed(documentId?: unknown, documentNumber?: unknown) {
  const key = warehouseUitWarningDocumentKey(documentId, documentNumber);
  return Boolean(key && readWarehouseUitSuppressedDocuments().has(key));
}

function suppressWarehouseUitWarning(documentId?: unknown, documentNumber?: unknown) {
  if (typeof window === "undefined") return;
  const key = warehouseUitWarningDocumentKey(documentId, documentNumber);
  if (!key) return;
  try {
    const next = readWarehouseUitSuppressedDocuments();
    next.add(key);
    window.sessionStorage.setItem(warehouseUitSuppressedStorageKey, JSON.stringify(Array.from(next)));
  } catch {
    // A figyelmeztetés ettől még bezárható; legfeljebb a munkamenetben újra megjelenik.
  }
}


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

type SelectedWorkAction = "label" | "order" | "move" | "shopify";

const selectedWorkActionLabels: Record<SelectedWorkAction, string> = {
  label: "Vonalkód / címke",
  order: "Rendelés / PDF",
  move: "Készletmozgatás",
  shopify: "Shopify export",
};

function normalizeSelectedWorkAction(value: unknown): SelectedWorkAction | null {
  const raw = String(value || "").trim();
  return raw === "label" || raw === "order" || raw === "move" || raw === "shopify" ? raw : null;
}

function selectedVariantIdFromItem(item: Partial<InventoryItem> & { selected_variant_id?: string | null; variantId?: string | null; id?: string | null }) {
  return String(item.variant_id || item.selected_variant_id || item.variantId || item.id || "").trim();
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
  supplier_source_codes?: string | null;
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
  first_incoming_at?: string | null;
  last_incoming_at?: string | null;
  last_import_batch_id?: string | null;
  last_reception_id?: string | null;
  last_invoice_number?: string | null;
  last_invoice_date?: string | null;
  last_reception_date?: string | null;
  last_source_file_name?: string | null;
  invoice_numbers?: string[] | string | null;
  invoice_history?: Array<{
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    receptionDate?: string | null;
    importedAt?: string | null;
    batchId?: string | null;
    receptionId?: string | null;
    sourceFileName?: string | null;
    supplierId?: string | null;
    supplierCode?: string | null;
    supplierName?: string | null;
    locationId?: string | null;
    locationName?: string | null;
    currencyCode?: string | null;
    invoiceGross?: string | number | null;
    receptionStatus?: string | null;
  }> | string | null;
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
  shopify_mapping_updated_at?: string | null;
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

type PersistedSelectedWorkItem = InventoryItem & {
  selected_variant_id?: string | null;
  action?: SelectedWorkAction | null;
  selected_action?: SelectedWorkAction | null;
  sort_order?: number | string | null;
  selected_at?: string | null;
  selected_updated_at?: string | null;
};

function warehouseShopifyStatusLabel(value: unknown) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  if (!raw) return "-";
  if (["active", "ready", "done", "completed", "success", "synced", "mapped", "reconciled"].includes(key)) return key === "active" ? "Aktív" : "Kész";
  if (["error", "failed", "failure"].includes(key)) return "Hiba";
  if (["pending", "queued", "processing", "running", "draft"].includes(key)) return key === "queued" ? "Sorban" : "Folyamatban";
  if (["inactive", "disabled"].includes(key)) return "Inaktív";
  return raw;
}

function warehouseShopifyDateTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function warehouseShopifyMessageList(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  const raw = String(value || "").trim();
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((entry) => String(entry || "").trim()).filter(Boolean);
  } catch {
    // A sima szöveges hibaüzenet maradjon egyben, ne daraboljuk értelmetlenül.
  }
  return [raw];
}

const WAREHOUSE_SHOPIFY_ERROR_STATES = new Set(["error", "failed", "failure", "blocked"]);

function warehouseShopifyStateKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function warehouseHasLiveShopifyMapping(item: Partial<InventoryItem> | Record<string, any>) {
  return Boolean(
    isShopifyMappedItem(item) ||
    String((item as any).shopify_product_id || "").trim() ||
    String((item as any).shopify_variant_id || "").trim() ||
    String((item as any).shopify_inventory_item_id || "").trim()
  );
}

function warehouseShopifyConnectionHasError(item: Partial<InventoryItem> | Record<string, any>) {
  const syncState = warehouseShopifyStateKey((item as any).shopify_sync_status);
  const outboxState = warehouseShopifyStateKey((item as any).shopify_outbox_status);
  return WAREHOUSE_SHOPIFY_ERROR_STATES.has(syncState) || WAREHOUSE_SHOPIFY_ERROR_STATES.has(outboxState);
}

function warehouseShopifyExportHasError(item: Partial<InventoryItem> | Record<string, any>) {
  const itemState = warehouseShopifyStateKey((item as any).shopify_export_item_status);
  const exportErrors = warehouseShopifyMessageList((item as any).shopify_export_errors);
  return WAREHOUSE_SHOPIFY_ERROR_STATES.has(itemState) || (exportErrors.length > 0 && itemState !== "mapped");
}

function warehouseShopifyHasAnyIssue(item: Partial<InventoryItem> | Record<string, any>) {
  return warehouseShopifyConnectionHasError(item) || warehouseShopifyExportHasError(item);
}

// A közös ShopifyStatusIcon eredeti lebegő ablaka magasabb lehetett a böngészőnél,
// ezért az alsó hibaüzenetek egyszerűen lelógtak a képernyőről. A raktárban saját,
// viewporthoz igazított, görgethető kapcsolatpanelt használunk. Így az egész lista
// elérhető marad, akár a felső, akár az alsó terméksoron nyitják meg.
function WarehouseShopifyStatusIcon({
  item,
  size = "sm",
}: {
  item: InventoryItem;
  size?: "xs" | "sm" | "md";
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const mapped = warehouseHasLiveShopifyMapping(item);
  const pending = isShopifyExportPending(item);
  const hasConnectionError = warehouseShopifyConnectionHasError(item);
  const hasExportError = warehouseShopifyExportHasError(item);
  const visible = mapped || pending || hasConnectionError || hasExportError;
  const open = visible && (hovered || pinned);

  const connectionErrors = Array.from(new Set([
    ...warehouseShopifyMessageList(item.shopify_last_error),
    ...warehouseShopifyMessageList(item.shopify_outbox_error),
  ]));
  const exportErrors = Array.from(new Set(warehouseShopifyMessageList(item.shopify_export_errors)));
  const warnings = Array.from(new Set(warehouseShopifyMessageList(item.shopify_export_warnings)));
  const primaryError = hasConnectionError ? (connectionErrors[0] || "A jelenlegi Shopify kapcsolat vagy készletszinkron hibás.") : "";
  const primaryExportError = hasExportError ? (exportErrors[0] || "A legutóbbi Shopify export vagy párosítás hibával zárult.") : "";
  const productTitle = String(item.shopify_product_title || item.shopify_title || item.title_ro || "Shopify termék").trim();
  const statusRows = [
    { label: "Shopify termék", value: item.shopify_product_title || item.shopify_title || "-" },
    { label: "Variáns", value: item.shopify_variant_title || item.size || "-" },
    { label: "Termékállapot", value: warehouseShopifyStatusLabel(item.shopify_product_status) },
    { label: "Szinkron", value: warehouseShopifyStatusLabel(item.shopify_sync_status) },
    { label: "Feldolgozás", value: warehouseShopifyStatusLabel(item.shopify_outbox_status) },
    { label: "Export", value: warehouseShopifyStatusLabel(item.shopify_export_item_status || item.shopify_export_status) },
    { label: "Exportálva", value: warehouseShopifyDateTime(item.shopify_exported_at) },
    { label: "Export ellenőrizve", value: warehouseShopifyDateTime(item.shopify_export_reconciled_at) },
    { label: "Kapcsolva", value: mapped ? warehouseShopifyDateTime(item.shopify_mapped_at || item.shopify_connected_at) : "-" },
    { label: "Utolsó szinkron", value: warehouseShopifyDateTime(item.shopify_last_synced_at) },
  ];

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    if (pinned) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setHovered(false), 140);
  }, [pinned, cancelClose]);

  const updatePopupPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const button = buttonRef.current;
    if (!button) return;
    const padding = 12;
    const gap = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(410, Math.max(292, viewportWidth - padding * 2));
    const maxHeight = Math.max(240, viewportHeight - padding * 2);
    const buttonRect = button.getBoundingClientRect();
    const measuredHeight = Math.min(
      maxHeight,
      Math.max(260, popupRef.current?.scrollHeight || popupRef.current?.getBoundingClientRect().height || 520),
    );

    let left = buttonRect.left + buttonRect.width / 2 - width / 2;
    left = Math.min(Math.max(padding, left), Math.max(padding, viewportWidth - width - padding));

    let top = buttonRect.bottom + gap;
    if (top + measuredHeight > viewportHeight - padding) top = buttonRect.top - measuredHeight - gap;
    if (top < padding) top = padding;
    if (top + measuredHeight > viewportHeight - padding) top = Math.max(padding, viewportHeight - measuredHeight - padding);

    setPopupStyle({
      position: "fixed",
      left,
      top,
      width,
      maxHeight,
      zIndex: 2147483000,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePopupPosition();
    const frame = window.requestAnimationFrame(updatePopupPosition);
    const onMove = () => updatePopupPosition();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPinned(false);
      setHovered(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!pinned) return;
      const target = event.target as Node | null;
      if (!target || buttonRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setPinned(false);
      setHovered(false);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, pinned, updatePopupPosition]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  if (!visible) return null;

  const buttonSize = size === "xs" ? "h-6 w-6" : size === "md" ? "h-9 w-9" : "h-8 w-8";
  const brandSize = size === "xs" ? "xs" : size === "md" ? "md" : "sm";
  const badgeText = hasConnectionError ? "Hiba" : hasExportError ? "Exporthiba" : pending ? "Folyamatban" : "Kapcsolva";
  const badgeClass = hasConnectionError
    ? "border-rose-200/55 bg-rose-100 text-rose-700"
    : hasExportError || pending
      ? "border-amber-200/55 bg-amber-100 text-amber-800"
      : "border-emerald-200/55 bg-emerald-100 text-emerald-700";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${buttonSize} relative inline-flex shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.08] transition hover:border-[#95bf47]/70 hover:bg-white/[0.13] focus:outline-none focus:ring-2 focus:ring-[#95bf47]/45`}
        onMouseEnter={() => { cancelClose(); setHovered(true); }}
        onMouseLeave={scheduleClose}
        onFocus={() => { cancelClose(); setHovered(true); }}
        onBlur={scheduleClose}
        onClick={(event) => {
          event.stopPropagation();
          cancelClose();
          setPinned((current) => !current);
          setHovered(true);
        }}
        aria-label={`Shopify kapcsolat: ${badgeText}`}
        aria-expanded={open}
        title="Shopify kapcsolat részletei"
      >
        <ShopifyBrandMark size={brandSize} fill />
        {hasConnectionError ? <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500" /> : null}
        {!hasConnectionError && (hasExportError || pending) ? <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400" /> : null}
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={popupRef}
          className="flex overflow-hidden rounded-2xl border border-[#95bf47]/70 bg-[#f7f8f8] text-slate-800 shadow-[0_28px_75px_rgba(0,0,0,.58)]"
          style={popupStyle}
          role="dialog"
          aria-label="Shopify kapcsolat részletei"
          onMouseEnter={() => { cancelClose(); setHovered(true); }}
          onMouseLeave={scheduleClose}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="flex min-h-0 w-full flex-col">
            <div className="flex shrink-0 items-start justify-between gap-3 bg-[#008060] px-3 py-3 text-white">
              <div className="flex min-w-0 items-start gap-2.5">
                <ShopifyBrandMark size="md" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/78">Shopify kapcsolat</p>
                  <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-white" title={productTitle}>{productTitle}</p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${badgeClass}`}>{badgeText}</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-gutter:stable]">
              {primaryError ? (
                <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] leading-relaxed text-rose-800">
                  <div className="mb-1 flex items-center gap-1.5 text-rose-700"><AlertTriangle size={14} /> Jelenlegi Shopify kapcsolati hiba</div>
                  <div className="break-words">{primaryError}</div>
                </div>
              ) : primaryExportError ? (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">
                  <div className="mb-1 flex items-center gap-1.5 text-amber-800"><AlertTriangle size={14} /> Shopify exporthiba</div>
                  <div className="break-words">{primaryExportError}</div>
                  <div className="mt-1.5 border-t border-amber-200/70 pt-1.5 text-[10px] text-amber-700">Ez az export vagy párosítás eredménye, nem megszakadt élő mapping. A Shopify központ ezért mutathat 0 hibás kapcsolatot.</div>
                </div>
              ) : pending ? (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  <Clock3 size={14} className="mr-1.5 inline" /> A Shopify export vagy párosítás még feldolgozás alatt van.
                </div>
              ) : mapped ? (
                <div className="mb-3 rounded-xl border border-[#d6e9ba] bg-[#f4f9ec] px-3 py-2 text-[11px] text-[#42651c]">
                  <CheckCircle2 size={14} className="mr-1.5 inline" /> A jelenlegi Shopify kapcsolat rendben.
                </div>
              ) : null}

              <div className="space-y-1.5">
                {statusRows.map((row) => (
                  <div key={row.label} className="grid grid-cols-[112px,minmax(0,1fr)] overflow-hidden rounded-xl border border-slate-200 bg-white text-[11px]">
                    <div className="bg-[#eef3e8] px-2.5 py-2 text-slate-500">{row.label}</div>
                    <div className="min-w-0 break-words px-2.5 py-2 text-right text-slate-800" title={String(row.value || "-")}>{String(row.value || "-")}</div>
                  </div>
                ))}
              </div>

              {connectionErrors.length > 1 ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800">
                  <div className="mb-1.5 flex items-center gap-1.5 text-rose-700"><AlertTriangle size={14} /> További kapcsolati hibák</div>
                  <div className="space-y-1.5">
                    {connectionErrors.slice(1).map((errorText, index) => <div key={`${errorText}-${index}`} className="break-words rounded-lg bg-white/70 px-2 py-1.5">{errorText}</div>)}
                  </div>
                </div>
              ) : null}

              {exportErrors.length > 1 ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                  <div className="mb-1.5 flex items-center gap-1.5 text-amber-800"><AlertTriangle size={14} /> További exporthibák</div>
                  <div className="space-y-1.5">
                    {exportErrors.slice(1).map((errorText, index) => <div key={`${errorText}-${index}`} className="break-words rounded-lg bg-white/70 px-2 py-1.5">{errorText}</div>)}
                  </div>
                </div>
              ) : null}

              {warnings.length ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800">
                  <div className="mb-1.5">Figyelmeztetések</div>
                  <div className="space-y-1.5">
                    {warnings.map((warning, index) => <div key={`${warning}-${index}`} className="break-words rounded-lg bg-white/70 px-2 py-1.5">{warning}</div>)}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500">
              <span>Az ablak görgethető • ESC: bezárás</span>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[10px] text-slate-700 hover:bg-slate-100"
                onClick={() => { setPinned(false); setHovered(false); }}
              >
                <X size={12} /> Bezárás
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}


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
    buy_price: firstWarehouseValue(rawItem.buy_price_ron, rawItem.import_buy_price_ron, norm.buyPriceRon, rawItem.buy_price, rawItem.import_buy_price, norm.buyPrice),
    sell_price: firstWarehouseValue(rawItem.sell_price_ron, rawItem.import_sell_price_ron, norm.sellPriceRon, norm.sellPriceGrossRon, rawItem.sell_price, rawItem.import_sell_price, norm.sellPrice),
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

function warehouseImportMovementBatchId(row: Record<string, any> | null | undefined) {
  if (!row || typeof row !== "object") return "";
  const sourceType = normalizeSearch(row.source_type || "");
  // A raw.importBatchId az elsődleges. A source_id csak valódi import_batch
  // mozgásnál használható, mert más bejövő műveletek is kaphatnak UUID-t.
  return firstWarehouseText(
    row.raw?.importBatchId,
    row.raw?.import_batch_id,
    sourceType.includes("import_batch") ? row.source_id : "",
  );
}

function latestWarehouseImportMovementFocus(rows: Array<Record<string, any>>): WarehouseIncomingMovementFocus | null {
  const incomingRows = (rows || [])
    .filter((row) => n(row?.qty_delta) > 0)
    .filter((row) => {
      const sourceType = normalizeSearch(row?.source_type || "");
      const rawReason = normalizeSearch(row?.raw?.reason || "");
      const importBatchId = warehouseImportMovementBatchId(row);
      const sourceKey = normalizeSearch(firstWarehouseText(row?.source_id, importBatchId));
      if (sourceType.includes("stock_table_audit") || sourceKey.startsWith("stock_audit") || rawReason.includes("stock_audit")) return false;
      // Nem elég, hogy egy mozgás bejövő és a source_id UUID. Az lehet kézi
      // termékfelvétel vagy más művelet is, amitől a „Legutóbbi bevételezés”
      // egy régi, teljesen idegen termékre ugrott.
      return sourceType.includes("import_batch") || rawReason.includes("import_batch") || Boolean(importBatchId);
    })
    .slice()
    .sort((a, b) => dateTimeMs(b.created_at) - dateTimeMs(a.created_at));
  if (!incomingRows.length) return null;

  const latest = incomingRows[0];
  const latestSourceId = warehouseImportMovementBatchId(latest);
  const latestMs = dateTimeMs(latest.created_at);
  const latestMinute = latestMs ? Math.floor(latestMs / 60000) : 0;
  const group = incomingRows.filter((row) => {
    const rowSourceId = warehouseImportMovementBatchId(row);
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

type PurchaseOrderWorkDraftRow = {
  supplierId: string;
  qty: string;
};

type PreparedPurchaseOrderWorkRow = {
  item: InventoryItem;
  variantId: string;
  supplierId: string;
  supplierName: string;
  qty: number;
  unitPrice: number | null;
  lineValue: number | null;
  valid: boolean;
  problem: string;
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
  productCode: string;
  barcode: string;
  color: string;
  size: string;
  imageUrl?: string | null;
  fromLocation: string;
  toLocation: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};
type StockFilter = "all" | "available" | "out" | "reserved" | "missing" | "inactive" | "watch";
type ImageFilter = "all" | "with" | "missing";
type ShopifyFilter = "all" | "mapped" | "recent_mapped" | "exported" | "unmapped" | "error";
type SortMode = "name" | "brand" | "stock_desc" | "stock_asc" | "value_desc" | "missing" | "incoming_desc" | "incoming_asc" | "shopify_connected_desc";

type WarehouseMultiSelectOption = { value: string; label: string; hint?: string };

function WarehouseMultiSelect({
  labelText,
  options,
  values,
  onChange,
  emptyText = "Összes",
}: {
  labelText: string;
  options: WarehouseMultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = useMemo(() => new Set(values.map((value) => String(value))), [values]);
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedSet.has(String(option.value))),
    [options, selectedSet]
  );
  const summary = !selectedOptions.length
    ? emptyText
    : selectedOptions.length <= 2
      ? selectedOptions.map((option) => option.label).join(" + ")
      : `${selectedOptions.length} kiválasztva`;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function toggle(value: string) {
    const key = String(value);
    const next = new Set(values.map(String));
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  }

  return (
    <div ref={rootRef} className={`${label} relative`}>
      <span>{labelText}</span>
      <button
        type="button"
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none transition hover:bg-[#475365] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/25"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{summary}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {selectedOptions.length ? (
            <span className="rounded-full border border-[#7bd7d4]/35 bg-[#2a8d8b]/22 px-1.5 py-0.5 text-[10px] text-[#d7fffd]">{selectedOptions.length}</span>
          ) : null}
          <ChevronDown size={15} className={`text-white/55 transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-[70] mt-1 overflow-hidden rounded-xl border border-white/18 bg-[#293344] shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2 py-1.5">
            <button
              type="button"
              className="h-7 rounded-lg px-2 text-[11px] text-white/72 hover:bg-white/[0.08] hover:text-white"
              onClick={() => onChange([])}
            >
              Összes
            </button>
            <button
              type="button"
              className="h-7 rounded-lg px-2 text-[11px] text-white/55 hover:bg-white/[0.08] hover:text-white"
              onClick={() => onChange(options.map((option) => option.value))}
              disabled={!options.length}
            >
              Mind kijelölése
            </button>
          </div>
          <div className="max-h-64 overflow-auto py-1" role="listbox" aria-multiselectable="true">
            {options.map((option) => {
              const active = selectedSet.has(String(option.value));
              return (
                <label
                  key={option.value}
                  className={`flex min-h-8 cursor-pointer items-center gap-2 px-3 py-1.5 text-xs transition ${active ? "bg-[#2a8d8b]/22 text-white" : "text-white/76 hover:bg-white/[0.07]"}`}
                  title={option.hint || option.label}
                >
                  <input
                    className={selectBox}
                    type="checkbox"
                    checked={active}
                    onChange={() => toggle(option.value)}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint ? <span className="shrink-0 text-[10px] text-white/38">{option.hint}</span> : null}
                </label>
              );
            })}
            {!options.length ? <div className="px-3 py-3 text-xs text-white/45">Nincs választható érték.</div> : null}
          </div>
          <div className="flex justify-end border-t border-white/10 px-2 py-1.5">
            <button type="button" className="h-7 rounded-lg bg-[#2a8d8b] px-3 text-[11px] text-white hover:bg-[#319c99]" onClick={() => setOpen(false)}>Kész</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


type WarehouseMoveDropdownOption = {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
};

function WarehouseMoveDropdown({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  tone = "neutral",
}: {
  value: string;
  options: WarehouseMoveDropdownOption[];
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  tone?: "neutral" | "source" | "target";
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const selected = options.find((option) => String(option.value) === String(value)) || null;

  const toneClass = tone === "source"
    ? "border-rose-400/45 focus:border-rose-300 focus:ring-rose-400/20"
    : tone === "target"
      ? "border-[#7bd7d4]/45 focus:border-[#7bd7d4] focus:ring-[#7bd7d4]/20"
      : "border-white/20 focus:border-[#7bd7d4] focus:ring-[#7bd7d4]/20";

  function updateMenuPosition() {
    if (typeof window === "undefined") return;
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const viewportPadding = 10;
    const gap = 5;
    const desiredHeight = Math.min(286, 46 + Math.max(1, options.length) * 40);
    const roomBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding);
    const roomAbove = Math.max(0, rect.top - viewportPadding);
    const openUp = roomBelow < Math.min(170, desiredHeight) && roomAbove > roomBelow;
    const maxHeight = Math.max(108, Math.min(desiredHeight, openUp ? roomAbove - gap : roomBelow - gap));
    const width = Math.min(
      Math.max(rect.width, 250),
      Math.max(250, window.innerWidth - viewportPadding * 2)
    );
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
    );

    setMenuStyle({
      position: "fixed",
      left,
      top: openUp ? Math.max(viewportPadding, rect.top - gap) : Math.min(window.innerHeight - viewportPadding, rect.bottom + gap),
      width,
      maxHeight,
      transform: openUp ? "translateY(-100%)" : "none",
      zIndex: 2147483000,
      backgroundColor: "#263246",
      color: "#ffffff",
    });
  }

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onMove = () => updateMenuPosition();

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, value, options.length]);

  const menu = open && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          className="overflow-y-auto rounded-2xl border border-[#7bd7d4]/25 p-1.5 shadow-[0_24px_70px_rgba(2,6,23,0.72)]"
          style={menuStyle}
          role="listbox"
          aria-label={ariaLabel}
        >
          <button
            type="button"
            className="flex min-h-9 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-[12px] transition hover:bg-[#415064]"
            style={{
              backgroundColor: !value ? "#2a8d8b" : "#303d51",
              color: "#ffffff",
            }}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            role="option"
            aria-selected={!value}
          >
            <span className="truncate">{placeholder}</span>
            {!value ? <CheckCircle2 size={13} className="shrink-0 text-white" /> : null}
          </button>

          {options.map((option) => {
            const active = String(option.value) === String(value);
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                className="mt-1 flex min-h-9 w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 text-left text-[12px] transition hover:border-white/10 hover:bg-[#415064] disabled:cursor-not-allowed"
                style={{
                  backgroundColor: active ? "#2a8d8b" : "#303d51",
                  color: option.disabled ? "rgba(255,255,255,0.36)" : "#ffffff",
                  opacity: option.disabled ? 0.62 : 1,
                }}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
                role="option"
                aria-selected={active}
                title={option.label}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {option.hint ? (
                    <span
                      className="text-[10px]"
                      style={{ color: option.disabled ? "rgba(255,255,255,0.32)" : "rgba(215,255,253,0.72)" }}
                    >
                      {option.hint}
                    </span>
                  ) : null}
                  {active ? <CheckCircle2 size={13} className="text-white" /> : null}
                </span>
              </button>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-[#344257] px-3 text-left text-[12px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] outline-none transition hover:bg-[#405067] focus:ring-2 ${toneClass}`}
        onClick={() => {
          updateMenuPosition();
          setOpen((current) => !current);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={selected?.label || placeholder}
      >
        <span className={`min-w-0 truncate ${selected ? "text-white" : "text-white/50"}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-white/75 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {menu}
    </>
  );
}

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

type WarehouseBarcodeConflictInfo = {
  barcode: string;
  conflictVariantId: string;
  title?: string | null;
  modelCode?: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  message?: string | null;
};

function barcodeConflictInfoFromApi(value: unknown): WarehouseBarcodeConflictInfo | null {
  const source = value && typeof value === "object" ? value as Record<string, any> : {};
  const conflict = source.conflict && typeof source.conflict === "object" ? source.conflict as Record<string, any> : {};
  const barcode = cleanScannedBarcode(source.barcode || conflict.barcode || "");
  const conflictVariantId = String(conflict.variantId || source.conflictVariantId || "").trim();
  if (!barcode || !conflictVariantId) return null;
  return {
    barcode,
    conflictVariantId,
    title: firstWarehouseText(conflict.title) || null,
    modelCode: firstWarehouseText(conflict.modelCode) || null,
    brand: firstWarehouseText(conflict.brand) || null,
    color: firstWarehouseText(conflict.color) || null,
    size: firstWarehouseText(conflict.size) || null,
    message: firstWarehouseText(source.error, source.message) || null,
  };
}

function WarehouseBarcodeConflictNotice({
  info,
  onOpen,
}: {
  info: WarehouseBarcodeConflictInfo;
  onOpen?: (() => void) | null;
}) {
  const meta = [info.brand, info.color, info.size].map((value) => String(value || "").trim()).filter(Boolean).join(" • ");
  return (
    <div className="rounded-2xl border border-rose-300/45 bg-rose-500/12 p-3 text-rose-50 shadow-[0_0_0_1px_rgba(244,63,94,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-200/35 bg-rose-500/20 text-rose-100">
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-rose-50">Ez az SKU már használatban van</p>
            <p className="mt-0.5 text-xs leading-relaxed text-rose-100/78">
              A <span className="font-semibold text-white">{info.barcode}</span> kód már egy másik termékvariánshoz tartozik, ezért ezt az SKU-t a rendszer nem fogadja el.
            </p>
          </div>
        </div>
        {onOpen && info.conflictVariantId ? (
          <button className={btnSoft} type="button" onClick={onOpen}>
            <Eye size={14} /> Termék megnyitása
          </button>
        ) : null}
      </div>
      <div className="mt-2.5 rounded-xl border border-white/12 bg-black/15 px-3 py-2">
        <p className="truncate text-sm text-white" title={info.title || info.modelCode || info.conflictVariantId}>
          {info.title || info.modelCode || "Már létező termék"}
        </p>
        <p className="mt-0.5 text-xs text-rose-100/70">
          {meta || `Variáns: ${info.conflictVariantId}`}
        </p>
      </div>
      <p className="mt-2 text-xs text-rose-100/72">
        Az SKU nem lett elmentve. Minden variánsnak egyedi Vonalkód / Shopify SKU szükséges.
      </p>
    </div>
  );
}

type WarehouseFilterSnapshot = {
  search: string;
  snCodFilter: string;
  scannedBarcodeSearch: string;
  supplier: string;
  brand: string;
  category: string;
  subCategory: string;
  genderFilters: string[];
  sizeFilters: string[];
  color: string;
  location: string;
  invoiceFilter: string;
  stockFilter: StockFilter;
  imageFilter: ImageFilter;
  shopifyFilter: ShopifyFilter;
  sortMode: SortMode;
  filtersOpen: boolean;
  summaryOpen: boolean;
  listOpen: boolean;
  productPageSize: number;
};

type WarehouseDetailReturnAnchor = {
  variantId: string;
  nextVariantId?: string | null;
  previousVariantId?: string | null;
  productPage: number;
  scrollY: number;
  rowViewportTop?: number | null;
  filters: WarehouseFilterSnapshot;
};

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
  actor?: string | null;
  raw?: Record<string, any> | null;
  location_name?: string | null;
  from_location_name?: string | null;
  to_location_name?: string | null;
  import_qty?: number | string | null;
  buy_price?: number | string | null;
  buy_price_ron?: number | string | null;
  sell_price?: number | string | null;
  sell_price_ron?: number | string | null;
  effective_buy_price?: number | string | null;
  effective_sell_price?: number | string | null;
  import_batch_id?: string | null;
  source_file_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  reception_date?: string | null;
  currency_code?: string | null;
  supplier_name?: string | null;
  sales_tva_rate?: number | string | null;
  old_buy_price?: number | string | null;
  new_buy_price?: number | string | null;
  old_sell_price?: number | string | null;
  new_sell_price?: number | string | null;
  old_compare_at_price?: number | string | null;
  new_compare_at_price?: number | string | null;
  price_change_fields?: string[] | null;
  local_only?: boolean | null;
};

type VariantHistorySummary = {
  currentQty?: number | string | null;
  reservedQty?: number | string | null;
  availableQty?: number | string | null;
  stockLocationCount?: number | string | null;
  totalIncomingQty?: number | string | null;
  totalOutgoingQty?: number | string | null;
  totalTransferredQty?: number | string | null;
  netMovementQty?: number | string | null;
  movementCount?: number | string | null;
  totalPurchasedQty?: number | string | null;
  avgBuyPrice?: number | string | null;
  lastBuyPrice?: number | string | null;
  lastSellPrice?: number | string | null;
  lastIncomingAt?: string | null;
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

type WarehouseBarcodeReturnContext = {
  filters?: WarehouseFilterSnapshot | null;
  productPage?: number | null;
  scrollY?: number | null;
  rowViewportTop?: number | null;
  nextVariantId?: string | null;
  previousVariantId?: string | null;
  incomingFocusBatchId?: string | null;
  incomingFocusMode?: "import" | "activation" | null;
};

type WarehouseBarcodeReturnTarget = {
  variantId: string;
  title?: string | null;
  barcode?: string | null;
  context?: WarehouseBarcodeReturnContext | null;
};

function rememberWarehouseBarcodeReturnTarget(
  variantId?: string,
  title?: string,
  context?: WarehouseBarcodeReturnContext | null,
) {
  const cleanVariantId = String(variantId || "").trim();
  if (!cleanVariantId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(warehouseBarcodeReturnStorageKey, JSON.stringify({
      variantId: cleanVariantId,
      title: String(title || "").trim() || null,
      context: context || null,
      startedAt: new Date().toISOString(),
    }));
  } catch {
    // A visszatérés kényelmi funkció. A bárkódoldal ettől még megnyílhat.
  }
}

function consumeWarehouseBarcodeReturnTarget() {
  if (typeof window === "undefined") return null as WarehouseBarcodeReturnTarget | null;
  try {
    const raw = window.localStorage.getItem(warehouseBarcodeReturnStorageKey);
    if (!raw) return null;
    window.localStorage.removeItem(warehouseBarcodeReturnStorageKey);
    const parsed = JSON.parse(raw) as Record<string, any>;
    const variantId = String(parsed?.variantId || "").trim();
    if (!variantId) return null;

    let savedBarcode = "";
    try {
      const changedRaw = window.localStorage.getItem(warehouseBarcodeChangedStorageKey);
      const changed = changedRaw ? JSON.parse(changedRaw) as Record<string, unknown> : null;
      if (String(changed?.variantId || "").trim() === variantId) savedBarcode = String(changed?.barcode || "").trim();
    } catch {
      savedBarcode = "";
    }

    return {
      variantId,
      title: String(parsed?.title || "").trim() || null,
      barcode: savedBarcode || null,
      context: parsed?.context && typeof parsed.context === "object" ? parsed.context as WarehouseBarcodeReturnContext : null,
    };
  } catch {
    return null;
  }
}

function goBarcodeManager(
  variantId?: string,
  barcode?: string,
  title?: string,
  returnContext?: WarehouseBarcodeReturnContext | null,
) {
  const params = new URLSearchParams();
  if (variantId) params.set("variant", variantId);
  if (barcode) params.set("barcode", barcode);
  if (title) params.set("title", title);
  params.set("source", "warehouse");
  params.set("return", "allinwarehouse");
  params.set("returnMode", "warehouse");
  if (variantId) {
    params.set("returnVariant", variantId);
    rememberWarehouseBarcodeReturnTarget(variantId, title, returnContext || null);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  window.location.hash = `#allinbarcodes${suffix}`;
}

function n(v: unknown) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function formatQty(value: unknown) {
  return Math.trunc(n(value)).toLocaleString("hu-HU");
}


type OpenPurchaseOrderBadgeOrder = {
  id: string;
  orderNumber: string;
  supplierName: string;
  status: string;
  qty: number;
};

type OpenPurchaseOrderBadgeInfo = {
  totalQty: number;
  orders: OpenPurchaseOrderBadgeOrder[];
};

function purchaseOrderStatusText(status: unknown) {
  const raw = String(status || "").trim().toLowerCase();
  if (raw === "draft") return "Nyitott";
  if (raw === "ordered") return "Rendelve";
  if (raw === "partially_received") return "Részben beérkezett";
  return raw || "Folyamatban";
}

async function fetchOpenPurchaseOrderVariantMap() {
  const list = await apiAifListPurchaseOrders({ limit: 1000 });
  const activeOrders = (list.items || []).filter((order) =>
    ["draft", "ordered", "partially_received"].includes(String(order.status || "").toLowerCase()),
  );
  const details = await Promise.all(activeOrders.map(async (order) => {
    try {
      return await apiAifGetPurchaseOrder(order.id);
    } catch {
      return null;
    }
  }));
  const result: Record<string, OpenPurchaseOrderBadgeInfo> = {};
  for (const detail of details) {
    if (!detail?.item) continue;
    for (const line of detail.lines || []) {
      const variantId = String(line.variant_id || "").trim();
      if (!variantId) continue;
      const ordered = Math.max(0, n(line.qty_ordered));
      const received = Math.max(0, n(line.qty_received));
      const remainingRaw = line.qty_remaining === null || line.qty_remaining === undefined
        ? ordered - received
        : n(line.qty_remaining);
      const qty = Math.max(0, Math.trunc(remainingRaw));
      if (qty <= 0) continue;
      const current = result[variantId] || { totalQty: 0, orders: [] };
      current.totalQty += qty;
      const existing = current.orders.find((order) => order.id === detail.item.id);
      if (existing) existing.qty += qty;
      else current.orders.push({
        id: detail.item.id,
        orderNumber: String(detail.item.order_number || "Rendelés"),
        supplierName: String(detail.item.supplier_name || "Beszállító"),
        status: purchaseOrderStatusText(detail.item.status),
        qty,
      });
      result[variantId] = current;
    }
  }
  return result;
}


function openPurchaseOrderFromWarehouse(info: OpenPurchaseOrderBadgeInfo, variantId: string) {
  const cleanVariantId = String(variantId || "").trim();
  const targetOrder = (info.orders || [])[0] || null;
  const orderId = String(targetOrder?.id || "").trim();
  if (!orderId) return;

  try {
    window.sessionStorage.setItem(OPEN_ORDER_HANDOFF_KEY, JSON.stringify({
      orderId,
      variantId: cleanVariantId || null,
      orderNumber: targetOrder?.orderNumber || null,
      source: "warehouse",
    }));
  } catch {
    // A navigáció ettől még működjön; legfeljebb a céloldal nem tud automatikusan fókuszálni.
  }

  window.location.hash = "#allinorderhistory";
}

function OpenPurchaseOrderBadge({
  info,
  children,
  className = "",
  onClick,
  title = "Rendelés alatt",
}: {
  info: OpenPurchaseOrderBadgeInfo;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});

  const updateTooltipPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const node = buttonRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const width = 330;
    const padding = 10;
    const left = Math.min(
      Math.max(padding, rect.left + rect.width / 2 - width / 2),
      Math.max(padding, window.innerWidth - width - padding),
    );
    const openUp = rect.bottom + 190 > window.innerHeight;
    setTooltipStyle({
      position: "fixed",
      left,
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      width,
      transform: openUp ? "translateY(-100%)" : "none",
      zIndex: 2147483000,
    });
  }, []);

  useEffect(() => {
    if (!tooltipOpen) return;
    updateTooltipPosition();
    const reposition = () => updateTooltipPosition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [tooltipOpen, updateTooltipPosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        onClick={onClick}
        onMouseEnter={() => { updateTooltipPosition(); setTooltipOpen(true); }}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => { updateTooltipPosition(); setTooltipOpen(true); }}
        onBlur={() => setTooltipOpen(false)}
        aria-label={`${title}: ${info.totalQty} darab`}
      >
        {children}
      </button>
      {tooltipOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="pointer-events-none rounded-2xl border border-orange-200/55 bg-[#202838] p-3 text-left text-[11px] leading-snug text-white shadow-[0_24px_60px_rgba(0,0,0,.55)]"
          style={tooltipStyle}
          role="tooltip"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
            <span className="inline-flex items-center gap-2 text-orange-100"><ShoppingCart size={15} /> {title}</span>
            <span className="rounded-full border border-orange-200/55 bg-[#ff6a00] px-2 py-0.5 text-[10px] text-white">{formatQty(info.totalQty)} db</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {info.orders.map((order) => (
              <div key={order.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl bg-white/[0.06] px-2.5 py-2">
                <div className="min-w-0">
                  <div className="truncate text-white">{order.orderNumber} • {order.supplierName}</div>
                  <div className="mt-0.5 text-[10px] text-white/48">{order.status}</div>
                </div>
                <div className="self-center whitespace-nowrap tabular-nums text-orange-100">{formatQty(order.qty)} db</div>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-white/10 pt-2 text-[10px] text-white/42">Kattintás: művelet folytatása</div>
        </div>,
        document.body,
      ) : null}
    </>
  );
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

function dateTimeMs(value: unknown) {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function latestWarehouseIncomingMs(item: Partial<InventoryItem> | Record<string, unknown>) {
  return Math.max(dateTimeMs((item as any).last_incoming_at), dateTimeMs((item as any).last_stock_movement_at));
}

function firstWarehouseIncomingMs(item: Partial<InventoryItem> | Record<string, unknown>) {
  return dateTimeMs((item as any).first_incoming_at) || latestWarehouseIncomingMs(item);
}

function shopifyConnectionMs(item: Partial<InventoryItem> | Record<string, unknown>) {
  if (!warehouseHasLiveShopifyMapping(item)) return 0;
  return Math.max(
    dateTimeMs((item as any).shopify_mapped_at),
    dateTimeMs((item as any).shopify_connected_at),
  );
}

function inventoryInvoiceHistory(item: Partial<InventoryItem> | Record<string, unknown>) {
  const raw = (item as any).invoice_history;
  let rows: Array<Record<string, unknown>> = [];
  if (Array.isArray(raw)) rows = raw.filter((row) => row && typeof row === "object") as Array<Record<string, unknown>>;
  else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) rows = parsed.filter((row) => row && typeof row === "object");
    } catch {
      rows = [];
    }
  }
  if (!rows.length && String((item as any).last_invoice_number || "").trim()) {
    rows = [{
      invoiceNumber: (item as any).last_invoice_number,
      invoiceDate: (item as any).last_invoice_date,
      receptionDate: (item as any).last_reception_date,
      importedAt: (item as any).last_incoming_at,
      batchId: (item as any).last_import_batch_id,
      receptionId: (item as any).last_reception_id,
      sourceFileName: (item as any).last_source_file_name,
    }];
  }
  return rows.map((row) => ({
    invoiceNumber: String(row.invoiceNumber || row.invoice_number || "").trim(),
    invoiceDate: String(row.invoiceDate || row.invoice_date || "").trim() || null,
    receptionDate: String(row.receptionDate || row.reception_date || "").trim() || null,
    importedAt: String(row.importedAt || row.imported_at || "").trim() || null,
    batchId: String(row.batchId || row.batch_id || "").trim() || null,
    receptionId: String(row.receptionId || row.reception_id || "").trim() || null,
    sourceFileName: String(row.sourceFileName || row.source_file_name || "").trim() || null,
    supplierId: String(row.supplierId || row.supplier_id || "").trim() || null,
    supplierCode: String(row.supplierCode || row.supplier_code || "").trim() || null,
    supplierName: String(row.supplierName || row.supplier_name || "").trim() || null,
    locationId: String(row.locationId || row.location_id || "").trim() || null,
    locationName: String(row.locationName || row.location_name || "").trim() || null,
    currencyCode: String(row.currencyCode || row.currency_code || "").trim() || null,
    invoiceGross: row.invoiceGross ?? row.invoice_gross ?? null,
    receptionStatus: String(row.receptionStatus || row.reception_status || row.status || "").trim() || null,
  }))
    .filter((row) => row.invoiceNumber)
    .sort((a, b) => Math.max(dateTimeMs(b.receptionDate), dateTimeMs(b.invoiceDate), dateTimeMs(b.importedAt)) - Math.max(dateTimeMs(a.receptionDate), dateTimeMs(a.invoiceDate), dateTimeMs(a.importedAt)));
}

function inventoryInvoiceNumbers(item: Partial<InventoryItem> | Record<string, unknown>) {
  const values: string[] = inventoryInvoiceHistory(item).map((row) => row.invoiceNumber);
  const add = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    String(value ?? "")
      .split(/[;,|]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => values.push(part));
  };
  add((item as any).last_invoice_number);
  add((item as any).invoice_numbers);
  return Array.from(new Set(values));
}

function warehouseDateLabel(value: unknown) {
  const ms = dateTimeMs(value);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function inventoryPurchaseDateLabel(item: Partial<InventoryItem> | Record<string, unknown>, invoiceNumber?: string, receptionId?: string | null) {
  const invoiceKey = normalizeSearch(invoiceNumber);
  const receptionKey = String(receptionId || "").trim();
  const historyRows = inventoryInvoiceHistory(item);
  const historyRow = receptionKey
    ? historyRows.find((row) => String(row.receptionId || "").trim() === receptionKey)
    : invoiceKey
      ? historyRows.find((row) => normalizeSearch(row.invoiceNumber) === invoiceKey)
      : null;
  return warehouseDateLabel(
    historyRow?.receptionDate ||
    historyRow?.invoiceDate ||
    historyRow?.importedAt ||
    (item as any).last_reception_date ||
    (item as any).last_invoice_date ||
    (item as any).last_incoming_at ||
    (item as any).last_stock_movement_at
  );
}


type WarehouseInvoiceFilterOption = {
  value: string;
  invoiceNumber: string;
  supplierId?: string | null;
  supplierCode?: string | null;
  supplierName: string;
  supplierKeys: string[];
  invoiceDate?: string | null;
  receptionDate?: string | null;
  importedAt?: string | null;
  dateMs: number;
  count: number;
  variantIds: string[];
  receptionIds: string[];
  batchIds: string[];
  locationNames: string[];
  currencyCodes: string[];
  sourceFileNames: string[];
  items: InventoryItem[];
  displayLabel: string;
};

type WarehouseReceptionDetail = {
  item?: Record<string, any> | null;
  rows?: Array<Record<string, any>>;
  batches?: Array<Record<string, any>>;
};

function inventorySupplierEntries(item: Partial<InventoryItem> | Record<string, unknown>) {
  const source = item as Partial<InventoryItem> & Record<string, any>;
  const entries: Array<{ id?: string | null; code?: string | null; name?: string | null; key: string; label: string }> = [];
  const seen = new Set<string>();
  const add = (id?: unknown, code?: unknown, name?: unknown) => {
    const cleanId = String(id || "").trim() || null;
    const cleanCode = String(code || "").trim() || null;
    const cleanName = String(name || "").trim() || null;
    const key = normalizeSearch(cleanId || cleanCode || cleanName);
    if (!key || seen.has(key)) return;
    seen.add(key);
    entries.push({ id: cleanId, code: cleanCode, name: cleanName, key, label: cleanName || cleanCode || cleanId || "Beszállító" });
  };

  for (const row of source.suppliers || []) add(row?.id, row?.code, row?.name);
  const ids = splitCsv(source.supplier_ids);
  const codes = splitCsv(source.supplier_source_codes || source.supplier_codes);
  const names = splitCsv(source.supplier_names);
  const count = Math.max(ids.length, codes.length, names.length);
  for (let index = 0; index < count; index += 1) add(ids[index], codes[index], names[index]);
  if (!entries.length) add(null, null, source.supplier_names || source.supplier_codes || null);
  return entries;
}

function invoiceSupplierInfo(
  item: Partial<InventoryItem> | Record<string, unknown>,
  row?: ReturnType<typeof inventoryInvoiceHistory>[number] | null,
) {
  const itemEntries = inventorySupplierEntries(item);
  const rowId = String(row?.supplierId || "").trim() || null;
  const rowCode = String(row?.supplierCode || "").trim() || null;
  const rowName = String(row?.supplierName || "").trim() || null;
  const rowKeys = [rowId, rowCode, rowName].map(normalizeSearch).filter(Boolean);
  const matchingEntries = rowKeys.length
    ? itemEntries.filter((entry) => {
        const entryKeys = [entry.id, entry.code, entry.name].map(normalizeSearch).filter(Boolean);
        return entryKeys.some((key) => rowKeys.includes(key));
      })
    : itemEntries;
  const itemMatch = matchingEntries[0] || null;
  const keys = Array.from(new Set([
    ...rowKeys,
    ...matchingEntries.flatMap((entry) => [entry.id, entry.code, entry.name]),
  ].map(normalizeSearch).filter(Boolean)));
  return {
    id: rowId || itemMatch?.id || null,
    code: rowCode || itemMatch?.code || null,
    name: rowName || itemMatch?.name || itemSupplierText(item as InventoryItem) || "Beszállító nélkül",
    keys,
  };
}

function itemMatchesInvoiceOption(item: InventoryItem, option?: WarehouseInvoiceFilterOption | null) {
  if (!option) return true;
  const history = inventoryInvoiceHistory(item);
  const receptionIds = new Set(option.receptionIds.map((value) => String(value || "").trim()).filter(Boolean));
  if (receptionIds.size && history.some((row) => row.receptionId && receptionIds.has(String(row.receptionId)))) return true;

  const invoiceKey = normalizeSearch(option.invoiceNumber);
  if (!invoiceKey) return true;
  const supplierKeys = new Set(option.supplierKeys.map(normalizeSearch).filter(Boolean));
  const itemSupplierKeys = new Set(inventorySupplierEntries(item).flatMap((entry) => [entry.id, entry.code, entry.name]).map(normalizeSearch).filter(Boolean));
  const supplierMatchesOption = !supplierKeys.size || Array.from(supplierKeys).some((key) => itemSupplierKeys.has(key));
  return supplierMatchesOption && inventoryInvoiceNumbers(item).some((invoice) => normalizeSearch(invoice) === invoiceKey);
}

function receptionStatusHu(value: unknown) {
  const raw = normalizeSearch(value);
  if (raw === "committed") return "Készletre vett";
  if (raw === "parsed") return "Ellenőrizve";
  if (raw === "needs_review") return "Ellenőrzendő";
  if (raw === "draft") return "Folyamatban";
  if (raw === "cancelled") return "Törölt";
  return String(value || "-");
}

function invoiceProductRowStatusHu(value: unknown) {
  const raw = normalizeSearch(value);
  if (raw === "committed") return "Készleten";
  if (raw === "parsed") return "Feldolgozható";
  if (raw === "error") return "Javítandó";
  if (raw === "ignored") return "Kihagyva";
  if (raw === "draft") return "Vázlat";
  return String(value || "-");
}

function WarehouseInvoicePicker({
  options,
  value,
  onSelect,
  onInspect,
}: {
  options: WarehouseInvoiceFilterOption[];
  value: string;
  onSelect: (value: string) => void;
  onInspect: (option: WarehouseInvoiceFilterOption) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<{ option: WarehouseInvoiceFilterOption; style: React.CSSProperties } | null>(null);
  const selected = options.find((option) => option.value === value) || null;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      setOpen(false);
      setHovered(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setHovered(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function showHover(option: WarehouseInvoiceFilterOption, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const width = 326;
    const gap = 10;
    const padding = 12;
    let left = rect.right + gap;
    if (left + width > window.innerWidth - padding) left = rect.left - width - gap;
    if (left < padding) left = Math.max(padding, window.innerWidth - width - padding);
    const top = Math.min(Math.max(padding, rect.top - 8), Math.max(padding, window.innerHeight - 196));
    setHovered({ option, style: { position: "fixed", left, top, width } });
  }

  return (
    <div ref={rootRef} className={`${label} relative`}>
      <span>Számla</span>
      <button
        type="button"
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none transition hover:bg-[#475365] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/25"
        onClick={() => { setOpen((current) => !current); setHovered(null); }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{selected ? `${selected.invoiceNumber} • ${selected.count} variáns` : "Összes számla"}</span>
        <ChevronDown size={15} className={`shrink-0 text-white/55 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-[85] mt-1 w-[min(590px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-white/18 bg-[#293344] shadow-2xl">
          <button
            type="button"
            className={`flex min-h-11 w-full items-center gap-3 border-b border-white/10 px-3 text-left text-xs transition ${value === "all" ? "bg-[#2a8d8b]/24 text-white" : "text-white/78 hover:bg-white/[0.07]"}`}
            onClick={() => { onSelect("all"); setOpen(false); setHovered(null); }}
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06]"><Receipt size={16} /></span>
            <span><span className="block text-white">Összes számla</span><span className="text-[10px] text-white/42">A számlaszűrés kikapcsolása</span></span>
          </button>
          <div className="max-h-80 overflow-auto py-1" role="listbox">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`grid min-h-[54px] w-full grid-cols-[36px,minmax(0,1fr),auto] items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-left transition last:border-b-0 ${active ? "bg-[#2a8d8b]/24 text-white" : "text-white/78 hover:bg-white/[0.07]"}`}
                  onMouseEnter={(event) => showHover(option, event.currentTarget)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={(event) => showHover(option, event.currentTarget)}
                  onBlur={() => setHovered(null)}
                  onClick={() => {
                    onSelect(option.value);
                    onInspect(option);
                    setOpen(false);
                    setHovered(null);
                  }}
                  role="option"
                  aria-selected={active}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#7bd7d4]/25 bg-[#2a8d8b]/14 text-[#d7fffd]"><FileText size={15} /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-white">{option.invoiceNumber} <span className="text-white/48">• {option.supplierName}</span></span>
                    <span className="mt-0.5 block truncate text-[10px] text-white/42">{option.locationNames.join(", ") || "Célhely nélkül"} • {option.count} variáns</span>
                  </span>
                  <span className="shrink-0 text-right text-[10px] text-white/55">
                    <span className="block">{warehouseDateLabel(option.invoiceDate || option.receptionDate || option.importedAt) || "-"}</span>
                    <span className="mt-0.5 block text-[#bfe9e6]">Részletek ›</span>
                  </span>
                </button>
              );
            })}
            {!options.length ? <div className="px-4 py-5 text-center text-xs text-white/45">Nincs számlaadat az aktuális szűréshez.</div> : null}
          </div>
          <div className="border-t border-white/10 px-3 py-2 text-[10px] text-white/38">Rámutatás: dátumok • Kattintás: szűrés és számlarészletek</div>
        </div>
      ) : null}

      {hovered && typeof document !== "undefined" ? createPortal(
        <div className="pointer-events-none z-[9999] rounded-2xl border border-[#7bd7d4]/30 bg-[#202838] p-3 text-left text-[11px] text-white shadow-2xl shadow-black/45" style={hovered.style} role="tooltip">
          <div className="flex items-center gap-2 border-b border-white/10 pb-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#2a8d8b]/22 text-[#d7fffd]"><Receipt size={17} /></span>
            <div className="min-w-0"><div className="text-[10px] uppercase tracking-[0.12em] text-[#cffffd]/65">Számla</div><div className="truncate text-[14px] text-white">{hovered.option.invoiceNumber}</div></div>
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="flex justify-between gap-3 rounded-lg bg-white/[0.06] px-2 py-1.5"><span className="text-white/55">Beszállító</span><span className="max-w-[190px] truncate text-right">{hovered.option.supplierName}</span></div>
            <div className="flex justify-between gap-3 rounded-lg bg-white/[0.06] px-2 py-1.5"><span className="text-white/55">Számla dátuma</span><span>{warehouseDateLabel(hovered.option.invoiceDate) || "-"}</span></div>
            <div className="flex justify-between gap-3 rounded-lg bg-white/[0.06] px-2 py-1.5"><span className="text-white/55">Receptió dátuma</span><span>{warehouseDateLabel(hovered.option.receptionDate) || "-"}</span></div>
            <div className="flex justify-between gap-3 rounded-lg bg-[#2a8d8b]/14 px-2 py-1.5"><span className="text-[#cffffd]/70">Terméksor</span><span className="text-[#d7fffd]">{hovered.option.count} variáns</span></div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function WarehouseInvoiceDetailModal({
  option,
  details,
  loading,
  error,
  buyPricesVisible,
  onClose,
  onReload,
}: {
  option: WarehouseInvoiceFilterOption | null;
  details: WarehouseReceptionDetail[];
  loading: boolean;
  error: string;
  buyPricesVisible: boolean;
  onClose: () => void;
  onReload: () => void;
}) {
  useEffect(() => {
    if (!option) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [option, onClose]);

  if (!option) return null;
  const detailItems = details.map((detail) => detail.item || {}).filter(Boolean);
  const detailRows = details.flatMap((detail) => (detail.rows || []).filter((row) => String(row.status || "").toLowerCase() !== "ignored"));
  const productRows = detailRows.length
    ? detailRows.map((row, index) => {
        const normalized = row.normalized && typeof row.normalized === "object" ? row.normalized : {};
        return {
          key: String(row.id || `${row.batch_id || "row"}-${row.row_no || index}`),
          imageUrl: String((normalized as any).imageUrl || (normalized as any).image_url || row.image_url || "").trim(),
          productCode: String(row.supplier_product_code || (normalized as any).supplierProductCode || (normalized as any).modelCode || "-").trim(),
          title: String((normalized as any).titleRo || (normalized as any).productName || row.title_ro || row.supplier_product_code || "Névtelen termék").trim(),
          brand: String((normalized as any).brandName || (normalized as any).brandCode || row.brand_name || "-").trim(),
          category: String((normalized as any).categoryName || (normalized as any).categoryCode || (normalized as any).productType || "-").trim(),
          color: String((normalized as any).colorName || row.supplier_color_code || (normalized as any).colorCode || "-").trim(),
          size: String(row.supplier_size || (normalized as any).size || "-").trim(),
          qty: n(row.qty ?? (normalized as any).qty),
          buyPrice: row.buy_price_ron ?? row.buy_price ?? (normalized as any).buyPrice ?? null,
          sellPrice: row.sell_price_ron ?? row.sell_price ?? (normalized as any).sellPriceGrossRon ?? (normalized as any).sellPrice ?? null,
          status: String(row.status || "-").trim(),
        };
      })
    : option.items.map((item) => ({
        key: item.variant_id,
        imageUrl: String(item.image_url || "").trim(),
        productCode: itemProductCode(item) || "-",
        title: String(item.title_ro || item.shopify_title || "Névtelen termék"),
        brand: String(item.brand_name || "-"),
        category: itemMainCategoryLabel(item),
        color: displayColorName(item.color_name, item.color_code),
        size: String(item.size || "-"),
        qty: n(item.total_qty),
        buyPrice: item.buy_price ?? null,
        sellPrice: item.sell_price ?? null,
        status: item.variant_status || "-",
      }));
  const totalQty = productRows.reduce((sum, row) => sum + n(row.qty), 0);
  const invoiceTotal = detailItems.reduce((sum, item) => sum + n(item.invoice_gross), 0);
  const currencies = Array.from(new Set([...option.currencyCodes, ...detailItems.map((item) => String(item.currency_code || "").trim())].filter(Boolean)));
  const locations = Array.from(new Set([...option.locationNames, ...detailItems.map((item) => String(item.location_name || "").trim())].filter(Boolean)));
  const supplierName = detailItems.map((item) => String(item.supplier_name || "").trim()).find(Boolean) || option.supplierName;
  const invoiceDate = detailItems.map((item) => item.invoice_date).find(Boolean) || option.invoiceDate;
  const receptionDate = detailItems.map((item) => item.reception_date).find(Boolean) || option.receptionDate;
  const status = detailItems.map((item) => item.status).find(Boolean) || null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/72 px-3 py-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="flex max-h-[94vh] w-full max-w-[1220px] flex-col overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] text-white shadow-2xl shadow-black/45">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#263246] via-[#334154] to-[#2a8d8b]/55 px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/35 bg-[#2a8d8b]/24 text-[#d7fffd] shadow-lg"><Receipt size={21} /></span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">Számla és receptió részletei</p>
              <h2 className="mt-0.5 truncate text-[22px] leading-tight">{option.invoiceNumber}</h2>
              <p className="mt-1 truncate text-xs text-white/60">{supplierName} • {locations.join(", ") || "Célhely nélkül"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className={btnSoft} type="button" onClick={onReload} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Frissítés</button>
            <button className={btn} type="button" onClick={onClose}><X size={15} /> Bezárás</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3.5">
          {error ? <div className="mb-3 rounded-xl border border-rose-300/30 bg-rose-500/12 px-3 py-2 text-sm text-rose-50">{error}</div> : null}
          {loading && !details.length ? <div className="mb-3 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-5 text-center text-sm text-white/60"><RefreshCw size={16} className="mr-2 inline animate-spin" /> Számlarészletek betöltése...</div> : null}

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Beszállító</p><p className="mt-1 truncate text-sm" title={supplierName}>{supplierName}</p></div>
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Számla dátuma</p><p className="mt-1 text-sm">{warehouseDateLabel(invoiceDate) || "-"}</p></div>
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Receptió dátuma</p><p className="mt-1 text-sm">{warehouseDateLabel(receptionDate) || "-"}</p></div>
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Állapot</p><p className="mt-1 text-sm">{receptionStatusHu(status)}</p></div>
            <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-[#cffffd]/55">Terméksor / darab</p><p className="mt-1 text-sm text-[#d7fffd]">{productRows.length} sor • {totalQty} db</p></div>
            <div className="rounded-2xl border border-amber-200/20 bg-amber-500/10 px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-amber-100/55">Számlaérték</p><p className="mt-1 text-sm text-amber-50">{invoiceTotal ? `${money(invoiceTotal)} ${currencies.join("/")}` : "-"}</p></div>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-white/12 bg-[#404a5b]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm"><PackageOpen size={16} /> A számla termékei</div>
              <div className="flex flex-wrap gap-1.5 text-[10px] text-white/48">
                {option.sourceFileNames.map((file) => <span key={file} className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5" title={file}>{file}</span>)}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1050px] w-full text-left text-xs">
                <thead className="bg-[#303a4c] text-[9px] uppercase tracking-[0.08em] text-white/48">
                  <tr><th className="px-2 py-2">#</th><th className="px-2 py-2">Kép</th><th className="px-2 py-2">Termék</th><th className="px-2 py-2">Márka / kategória</th><th className="px-2 py-2">Szín</th><th className="px-2 py-2">Méret</th><th className="px-2 py-2 text-right">Db</th><th className="px-2 py-2 text-right">Vételár</th><th className="px-2 py-2 text-right">Eladási ár</th><th className="px-2 py-2">Állapot</th></tr>
                </thead>
                <tbody>
                  {productRows.map((row, index) => (
                    <tr key={row.key} className="border-t border-white/[0.08] align-middle hover:bg-white/[0.035]">
                      <td className="px-2 py-2 text-white/45">{index + 1}</td>
                      <td className="px-2 py-2">{row.imageUrl ? <img src={row.imageUrl} alt="" className="h-11 w-11 rounded-lg border border-white/12 bg-white object-contain p-0.5" loading="lazy" /> : <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] text-white/30"><ImagePlus size={16} /></span>}</td>
                      <td className="px-2 py-2"><p className="max-w-[250px] truncate text-white">{row.title}</p><p className="mt-0.5 max-w-[250px] truncate text-[10px] text-[#cffffd]/70">{row.productCode}</p></td>
                      <td className="px-2 py-2"><p className="max-w-[180px] truncate">{row.brand}</p><p className="mt-0.5 max-w-[180px] truncate text-[10px] text-white/42">{row.category}</p></td>
                      <td className="px-2 py-2">{row.color}</td>
                      <td className="px-2 py-2">{row.size}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-[#d7fffd]">{row.qty}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{buyPricesVisible ? money(row.buyPrice) : "••••"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(row.sellPrice)}</td>
                      <td className="px-2 py-2"><span className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/65">{invoiceProductRowStatusHu(row.status)}</span></td>
                    </tr>
                  ))}
                  {!productRows.length && !loading ? <tr><td colSpan={10} className="px-4 py-8 text-center text-white/45">Ehhez a számlához nem találtam terméksort.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/12 bg-[#303a4c] px-4 py-3 text-[11px] text-white/45">
          <span>ESC: bezárás • a számlaszűrés a bezárás után is megmarad</span>
          <button className={btnSoft} type="button" onClick={onClose}><X size={14} /> Bezárás</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function itemMatchesGenderSelections(item: Partial<InventoryItem> | Record<string, unknown>, selected: string[], rows: GenderType[]) {
  if (!selected.length) return true;
  const itemKey = normalizeSearch((item as any).gender);
  if (!itemKey) return false;
  return selected.some((value) => {
    const selectedKey = normalizeSearch(value);
    const row = rows.find((gender) => [gender.code, gender.name, ...(gender.aliases || [])].map(normalizeSearch).includes(selectedKey));
    const allowed = [selectedKey, row?.code, row?.name, ...(row?.aliases || [])].map(normalizeSearch).filter(Boolean);
    return allowed.includes(itemKey);
  });
}

function itemMatchesSizeSelections(item: Partial<InventoryItem> | Record<string, unknown>, selected: string[], rows: SizeType[]) {
  if (!selected.length) return true;
  const itemValue = officialSizeFromTypes((item as any).size, rows);
  const itemKey = normalizeSearch(itemValue);
  if (!itemKey) return false;
  return selected.some((value) => {
    const selectedKey = normalizeSearch(value);
    const row = rows.find((size) => [size.id, size.code, size.name, size.name_hu, ...(size.aliases || [])].map(normalizeSearch).includes(selectedKey));
    const allowed = [selectedKey, row?.id, row?.code, row?.name, row?.name_hu, ...(row?.aliases || [])].map(normalizeSearch).filter(Boolean);
    return allowed.includes(itemKey);
  });
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

type WarehouseLabelPrintMode = "a4" | "zebra";

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
// Az előnézet legnagyobb nagyítása. A tényleges értéket a panel szélessége
// alapján számoljuk, így az A4-es lap nem lóg ki és nem vágódik le.
const WAREHOUSE_LABEL_PREVIEW_SCALE = 0.72;
// Kis vágási köz maradjon a címkék között. A számítás szükség esetén
// automatikusan csökkenti a külső margót, hogy az előírt címkeméret megmaradjon.
const WAREHOUSE_LABEL_GAP_X_MM = 2;
const WAREHOUSE_LABEL_GAP_Y_MM = 2;

const WAREHOUSE_LABEL_PRESETS: WarehouseLabelPreset[] = [
  { id: "40x46", name: "40 × 46 mm, 5 × 6 pe A4", width: "40", height: "46", cols: "5", rows: "6", marginX: "5", marginY: "5" },
  { id: "50x30", name: "50 × 30 mm, 4 × 8 pe A4", width: "50", height: "30", cols: "4", rows: "8", marginX: "5", marginY: "5" },
  { id: "60x40", name: "60 × 40 mm, 3 × 6 pe A4", width: "60", height: "40", cols: "3", rows: "6", marginX: "6", marginY: "6" },
  { id: "70x36", name: "70 × 36 mm, 2 × 7 pe A4", width: "70", height: "36", cols: "2", rows: "7", marginX: "8", marginY: "6" },
];

const WAREHOUSE_LABEL_DEFAULT_CONTENT: Record<WarehouseLabelContentKey, boolean> = {
  company: true,
  brand: false,
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
  { key: "category", label: "Alkategória", hint: "A termék alkategóriája / terméktípusa kerül a címkére." },
  { key: "sizeColor", label: "Méret", hint: "A variáns mérete kerül a címkére." },
  { key: "code", label: "Termékkód / színkód", hint: "A termékkód után a gyártói színkód jelenik meg." },
  { key: "price", label: "Ár", hint: "Nagy árrész a címke alján." },
];

function readWarehouseLabelPrintMode(): WarehouseLabelPrintMode {
  if (typeof window === "undefined") return "zebra";
  try {
    const raw = String(window.localStorage.getItem("aifWarehouseLabelPrintMode") || "").trim().toLowerCase();
    return raw === "a4" ? "a4" : "zebra";
  } catch {
    return "zebra";
  }
}

function saveWarehouseLabelPrintMode(mode: WarehouseLabelPrintMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("aifWarehouseLabelPrintMode", mode);
  } catch {
    // Kényelmi beállítás, a nyomtatás ettől még működik.
  }
}

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
  display:grid;
  grid-template-columns:repeat(var(--aif-label-cols), var(--aif-label-w));
  grid-auto-rows:var(--aif-label-h);
  column-gap:var(--aif-label-gap-x, 0mm);
  row-gap:var(--aif-label-gap-y, 0mm);
  padding:var(--aif-label-margin-y) var(--aif-label-margin-x);
  box-sizing:border-box;
  align-content:start;
  align-items:start;
  justify-content:start;
  background:#fff;
  color:#111;
  page-break-after:always;
  break-after:page;
  print-color-adjust:exact;
  -webkit-print-color-adjust:exact;
}
.aifWarehouseLabelPrintPage:last-child { page-break-after:auto; break-after:auto; }
.aifWarehousePrintLabel {
  width:var(--aif-label-w);
  height:var(--aif-label-h);
  min-width:0;
  min-height:0;
  border:.2mm solid #d9dde3;
  border-radius:2mm;
  padding:1.25mm 1.45mm;
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
.aifWhLabelCompany,
.aifWhLabelBrand,
.aifWhLabelTitle,
.aifWhLabelDescription,
.aifWhLabelCategory,
.aifWhLabelCode { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.aifWhLabelCompany { font-size:8.4px; line-height:1.05; text-align:center; text-transform:uppercase; letter-spacing:.055em; color:#333; margin-bottom:.45mm; }
.aifWhLabelBrand { font-size:8px; line-height:1.05; text-align:center; text-transform:uppercase; letter-spacing:.04em; color:#222; margin-bottom:.4mm; }
.aifWhLabelTitle { font-size:10.4px; line-height:1.06; text-align:center; color:#111; margin-bottom:.55mm; flex:0 0 auto; }
.aifWhLabelMeta { display:flex; justify-content:center; gap:4px; flex-wrap:nowrap; color:#333; font-size:8.2px; line-height:1; margin-bottom:.5mm; min-height:2mm; }
.aifWhBarcodeSvgWrap { width:100%; height:13.8mm; overflow:hidden; flex:0 0 13.8mm; display:flex; align-items:center; justify-content:center; margin-bottom:.45mm; }
.aifWhBarcodeSvgWrap svg { display:block; width:100%; height:100%; max-width:100%; max-height:100%; }
.aifWhLabelDescription { text-align:center; font-size:7.7px; line-height:1.05; color:#222; margin-bottom:.35mm; }
.aifWhLabelCategory { text-align:center; text-transform:uppercase; font-size:8.1px; line-height:1.05; color:#111; margin-bottom:.35mm; }
.aifWhLabelCode { font-size:7.1px; line-height:1.05; color:#444; text-align:center; margin-bottom:.55mm; }
.aifWhLabelPrice { margin-top:0; padding-top:0; text-align:center; line-height:.92; color:#111; white-space:nowrap; }
.aifWhPriceMajor { font-size:20px; letter-spacing:.055em; }
.aifWhPriceCents { font-size:10.5px; vertical-align:top; margin-left:1px; }
.aifWhPriceUnit { display:inline-block; font-size:7px; margin-left:2px; vertical-align:baseline; }
`;

const WAREHOUSE_ZEBRA_LABEL_CSS = `
.aifWarehousePrintLabel.aifWhZebraLabel {
  width:var(--aif-label-w);
  height:var(--aif-label-h);
  padding:.8mm .7mm .75mm;
  border-radius:1.6mm;
  justify-content:center;
  align-items:stretch;
  gap:0;
  text-align:center;
  font-family:Arial, Helvetica, sans-serif;
}
.aifWhZebraLabel .aifWhLabelCompany {
  flex:0 0 auto;
  margin:0 0 .28mm;
  font-size:6.4px;
  line-height:1;
  letter-spacing:.085em;
  color:#4d4d4d;
}
.aifWhZebraLabel .aifWhLabelBrand {
  flex:0 0 auto;
  margin:0 0 .25mm;
  font-size:6.7px;
  line-height:1;
  letter-spacing:.055em;
  color:#333;
}
.aifWhZebraLabel .aifWhLabelTitle {
  flex:0 0 4.55mm;
  min-height:4.55mm;
  max-height:4.55mm;
  margin:0;
  padding:0 .15mm;
  display:-webkit-box;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:2;
  white-space:normal;
  overflow:hidden;
  text-overflow:ellipsis;
  font-size:9.2px;
  font-weight:700;
  line-height:1.04;
  text-align:center;
  color:#111;
}
.aifWhZebraLabel .aifWhLabelMeta {
  flex:0 0 auto;
  min-height:0;
  margin:.12mm 0 .32mm;
  font-size:7.1px;
  line-height:1;
  color:#111;
}
.aifWhZebraLabel .aifWhLabelMeta span {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:9.2mm;
  height:2.85mm;
  padding:0 1.2mm;
  border:.18mm solid #333;
  border-radius:1.6mm;
  font-weight:700;
}
.aifWhZebraBarcodeArea {
  flex:0 0 auto;
  width:100%;
  margin:0;
  padding:0;
}
.aifWhZebraLabel .aifWhBarcodeSvgWrap {
  width:calc(100% + .35mm);
  height:12.25mm;
  flex:0 0 12.25mm;
  margin:0 0 0 -.175mm;
  overflow:hidden;
  display:flex;
  align-items:stretch;
  justify-content:center;
}
.aifWhZebraLabel .aifWhBarcodeSvgWrap svg {
  display:block;
  width:100%;
  height:100%;
  max-width:none;
  max-height:none;
}
.aifWhZebraBarcodeText {
  height:3.2mm;
  margin:.08mm 0 .32mm;
  overflow:hidden;
  white-space:nowrap;
  text-align:center;
  font-family:"Courier New", monospace;
  font-size:8.35px;
  font-weight:700;
  line-height:3mm;
  letter-spacing:.075em;
  color:#080808;
}
.aifWhZebraInfo {
  flex:0 0 auto;
  width:100%;
  min-height:6.15mm;
  display:flex;
  flex-direction:column;
  justify-content:center;
  padding:.38mm .1mm .34mm;
  border-top:.16mm solid #cfcfcf;
  border-bottom:.16mm solid #cfcfcf;
}
.aifWhZebraLabel .aifWhLabelDescription {
  margin:0;
  font-size:7.55px;
  font-weight:700;
  line-height:1.08;
  color:#222;
}
.aifWhZebraLabel .aifWhLabelCategory {
  margin:.28mm 0 0;
  font-size:7.8px;
  font-weight:700;
  line-height:1.06;
  color:#111;
}
.aifWhZebraLabel .aifWhLabelCode {
  flex:0 0 auto;
  width:100%;
  margin:.42mm 0 0;
  font-size:8.15px;
  font-weight:700;
  line-height:1.08;
  letter-spacing:.02em;
  text-align:center;
  color:#111;
}
.aifWhZebraLabel .aifWhLabelPrice {
  flex:0 0 auto;
  width:100%;
  margin:.6mm 0 0;
  padding:.55mm 0 0;
  text-align:center;
  line-height:.88;
  border-top:.24mm solid #222;
  color:#111;
}
.aifWhZebraLabel .aifWhPriceMajor {
  font-size:23px;
  font-weight:700;
  letter-spacing:.018em;
}
.aifWhZebraLabel .aifWhPriceCents {
  position:relative;
  top:-.4em;
  margin-left:1px;
  font-size:10.4px;
  font-weight:700;
  vertical-align:baseline;
}
.aifWhZebraLabel .aifWhPriceUnit {
  margin-left:3px;
  font-size:7px;
  font-weight:700;
  letter-spacing:.04em;
  vertical-align:baseline;
}
`;

const WAREHOUSE_LABEL_APP_CSS = `
.aifWarehouseLabelPrintRoot { display:none; }
.aifWhLabelPreviewFrame {
  max-height:68vh;
  overflow:auto;
  display:flex;
  align-items:flex-start;
  justify-content:flex-start;
  overscroll-behavior:contain;
  scrollbar-gutter:stable;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.14);
  background:#2f394a;
  padding:14px;
}
.aifWhLabelPreviewPageBox {
  position:relative;
  flex:0 0 auto;
  width:var(--aif-label-preview-w);
  min-width:var(--aif-label-preview-w);
  height:var(--aif-label-preview-h);
  min-height:var(--aif-label-preview-h);
  overflow:hidden;
  box-sizing:border-box;
  background:#f1f3f6;
  box-shadow:0 14px 34px rgba(0,0,0,.26);
}
.aifWhLabelPreviewFrame .aifWarehouseLabelPrintPage {
  position:absolute;
  left:0;
  top:0;
  overflow:hidden;
  background:#f1f3f6;
  transform:scale(var(--aif-label-preview-scale));
  transform-origin:top left;
}
.aifWhLabelPreviewFrame .aifWarehousePrintLabel {
  background:#fff;
  box-shadow:0 0 0 .15mm rgba(15,23,42,.12);
}
.aifWhLabelPreviewFrame .aifWarehousePrintLabel.noBorder {
  border-color:transparent;
}
${WAREHOUSE_LABEL_SHEET_CSS}
${WAREHOUSE_ZEBRA_LABEL_CSS}
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
  labelGapXmm: number;
  labelGapYmm: number;
};

function warehouseLabelContentHtml(label: WarehouseLabelPrintItem, options: WarehouseLabelPrintDocumentOptions) {
  const priceParts = labelPriceParts(label.price);
  const productCodeWithColor = [label.productCode, label.color]
    .map((value) => String(value || "").trim())
    .filter((value) => value && value !== "-")
    .filter((value, index, all) => all.findIndex((entry) => normalizeSearch(entry) === normalizeSearch(value)) === index)
    .join(" - ");
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
  if (options.labelContent.sizeColor && label.size && label.size !== "-") {
    html.push(`<div class="aifWhLabelMeta"><span>${labelEscapeHtml(labelCleanText(label.size, 16))}</span></div>`);
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
  if (options.labelContent.code && (productCodeWithColor || label.barcode)) {
    html.push(`<div class="aifWhLabelCode">Cod: ${labelEscapeHtml(labelCleanText(productCodeWithColor || label.barcode, 56))}</div>`);
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


function warehouseZebraBarcodeBarsSvg(render: WarehouseBarcodeRender) {
  if (!render?.ok || !render.svg) return "";
  return String(render.svg)
    .replace(/<text\b[^>]*>[\s\S]*?<\/text>/gi, "")
    .replace(/preserveAspectRatio="[^"]*"/i, 'preserveAspectRatio="none"')
    .replace(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/i, (_match, width, height) => {
      const cleanHeight = Math.max(1, Number(height || 0) - 12);
      return `viewBox="0 0 ${width} ${cleanHeight}"`;
    });
}

function warehouseZebraProductCodeWithColor(label: WarehouseLabelPrintItem) {
  return [label.productCode, label.color]
    .map((value) => String(value || "").trim())
    .filter((value) => value && value !== "-")
    .filter((value, index, all) => all.findIndex((entry) => normalizeSearch(entry) === normalizeSearch(value)) === index)
    .join(" - ");
}

function warehouseZebraLabelContentHtml(label: WarehouseLabelPrintItem, options: WarehouseLabelPrintDocumentOptions) {
  const priceParts = labelPriceParts(label.price);
  const productCodeWithColor = warehouseZebraProductCodeWithColor(label);
  const barsSvg = warehouseZebraBarcodeBarsSvg(label.render);
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
  if (options.labelContent.sizeColor && label.size && label.size !== "-") {
    html.push(`<div class="aifWhLabelMeta"><span>${labelEscapeHtml(labelCleanText(label.size, 16))}</span></div>`);
  }
  if (options.labelContent.barcode) {
    html.push(`<div class="aifWhZebraBarcodeArea"><div class="aifWhBarcodeSvgWrap">${barsSvg}</div><div class="aifWhZebraBarcodeText">${labelEscapeHtml(labelCleanText(label.barcode, 64))}</div></div>`);
  }
  if ((options.labelContent.description && label.description) || (options.labelContent.category && label.category && label.category !== "-")) {
    html.push(`<div class="aifWhZebraInfo">`);
    if (options.labelContent.description && label.description) {
      html.push(`<div class="aifWhLabelDescription">${labelEscapeHtml(labelCleanText(label.description, 78))}</div>`);
    }
    if (options.labelContent.category && label.category && label.category !== "-") {
      html.push(`<div class="aifWhLabelCategory">${labelEscapeHtml(labelCleanText(label.category, 34))}</div>`);
    }
    html.push(`</div>`);
  }
  if (options.labelContent.code && (productCodeWithColor || label.barcode)) {
    html.push(`<div class="aifWhLabelCode">Cod: ${labelEscapeHtml(labelCleanText(productCodeWithColor || label.barcode, 56))}</div>`);
  }
  if (options.labelContent.price && priceParts.major) {
    html.push(`<div class="aifWhLabelPrice"><span class="aifWhPriceMajor">${labelEscapeHtml(priceParts.major)}</span>${priceParts.cents ? `<span class="aifWhPriceCents">${labelEscapeHtml(priceParts.cents)}</span>` : ""}<span class="aifWhPriceUnit">${labelEscapeHtml(labelCleanText(options.labelUnitText || options.labelCurrency, 12))}</span></div>`);
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
    `--aif-label-gap-x:${layout.labelGapXmm}mm`,
    `--aif-label-gap-y:${layout.labelGapYmm}mm`,
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

function warehouseZebraLabelPrintDocumentHtml(
  labels: WarehouseLabelPrintItem[],
  options: WarehouseLabelPrintDocumentOptions,
  labelW: number,
  labelH: number,
) {
  const safeWidth = Math.max(20, Math.min(120, Number(labelW) || 40));
  const safeHeight = Math.max(15, Math.min(100, Number(labelH) || 46));
  const pageCount = Math.max(1, labels.length);
  const totalHeight = safeHeight * pageCount;
  const labelsHtml = labels
    .map((label, index) => `<section class="aifWarehouseZebraPrintPage" data-aif-zebra-page="${index + 1}"><div class="aifWarehousePrintLabel aifWhZebraLabel ${options.labelShowBorder ? "" : "noBorder"}">${warehouseZebraLabelContentHtml(label, options)}</div></section>`)
    .join("");
  const rootStyle = `--aif-label-w:${safeWidth}mm;--aif-label-h:${safeHeight}mm;--aif-zebra-page-count:${pageCount}`;

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${labelEscapeHtml("AllInFashion Zebra címke nyomtatás")}</title><style>
@page { size:${safeWidth}mm ${safeHeight}mm; margin:0; }
html, body {
  width:${safeWidth}mm;
  min-width:${safeWidth}mm;
  min-height:${totalHeight}mm;
  margin:0 !important;
  padding:0 !important;
  background:#fff !important;
  color:#111;
  overflow:visible !important;
}
* { box-sizing:border-box; }
.aifWarehouseZebraPrintRoot {
  width:${safeWidth}mm;
  min-width:${safeWidth}mm;
  min-height:${totalHeight}mm;
  margin:0;
  padding:0;
  background:#fff;
  color:#111;
  overflow:visible;
}
.aifWarehouseZebraPrintPage {
  width:${safeWidth}mm;
  height:${safeHeight}mm;
  min-width:${safeWidth}mm;
  min-height:${safeHeight}mm;
  margin:0;
  padding:0;
  overflow:hidden;
  display:flex;
  align-items:center;
  justify-content:center;
  page-break-inside:avoid;
  break-inside:avoid-page;
  background:#fff;
}
.aifWarehouseZebraPrintPage + .aifWarehouseZebraPrintPage {
  page-break-before:always;
  break-before:page;
}
${WAREHOUSE_LABEL_SHEET_CSS}
${WAREHOUSE_ZEBRA_LABEL_CSS}
.aifWarehouseZebraPrintPage .aifWarehousePrintLabel {
  width:${safeWidth}mm;
  height:${safeHeight}mm;
  min-width:${safeWidth}mm;
  min-height:${safeHeight}mm;
  margin:0;
}
@media print {
  html, body {
    width:${safeWidth}mm !important;
    min-width:${safeWidth}mm !important;
    min-height:${totalHeight}mm !important;
    margin:0 !important;
    padding:0 !important;
    background:#fff !important;
    overflow:visible !important;
  }
  .aifWarehouseZebraPrintRoot {
    display:block !important;
    width:${safeWidth}mm !important;
    min-width:${safeWidth}mm !important;
    min-height:${totalHeight}mm !important;
    margin:0 !important;
    padding:0 !important;
    background:#fff !important;
    overflow:visible !important;
  }
  .aifWarehouseZebraPrintPage {
    display:flex !important;
    width:${safeWidth}mm !important;
    height:${safeHeight}mm !important;
    min-width:${safeWidth}mm !important;
    min-height:${safeHeight}mm !important;
    margin:0 !important;
    padding:0 !important;
    overflow:hidden !important;
    align-items:center !important;
    justify-content:center !important;
    page-break-inside:avoid !important;
    break-inside:avoid-page !important;
  }
  .aifWarehouseZebraPrintPage + .aifWarehouseZebraPrintPage {
    page-break-before:always !important;
    break-before:page !important;
  }
}
</style></head><body><div class="aifWarehouseZebraPrintRoot" style="${rootStyle}">${labelsHtml}</div></body></html>`;
}

function warehouseTransferDateTime(input: Date | string | number = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function warehouseTransferDocumentNumber(input: Date | string | number = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return `TRF-${Date.now()}`;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `TRF-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function warehouseTransferMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0,00";
  return amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function warehouseStockTransferPrintDocumentHtml(options: {
  title: string;
  note?: string;
  createdAt: string;
  documentNumber?: string;
  lines: StockTransferPrintLine[];
}) {
  const totalQty = options.lines.reduce((sum, line) => sum + line.qty, 0);
  const totalValue = options.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const routePairs = Array.from(new Map(
    options.lines.map((line) => {
      const from = String(line.fromLocation || "").trim();
      const to = String(line.toLocation || "").trim();
      return [`${normalizeSearch(from)}->${normalizeSearch(to)}`, { from, to }] as const;
    })
  ).values()).filter((route) => route.from || route.to);
  const fromSummary = routePairs.length ? routePairs.map((route) => route.from || "-").filter((value, index, all) => all.indexOf(value) === index).join(" / ") : "-";
  const toSummary = routePairs.length ? routePairs.map((route) => route.to || "-").filter((value, index, all) => all.indexOf(value) === index).join(" / ") : "-";
  const documentNumber = String(options.documentNumber || warehouseTransferDocumentNumber()).trim();
  const documentObject = String(options.title || "Transfer intern de stoc").trim();

  const rowsHtml = options.lines.map((line) => {
    const imageHtml = line.imageUrl
      ? `<img class="aifTransferImg" src="${labelEscapeHtml(line.imageUrl)}" alt="" />`
      : `<div class="aifTransferImg empty">Fără foto</div>`;
    const variantMeta = [line.brand, line.category, line.color, line.size]
      .map((value) => String(value || "").trim())
      .filter((value) => value && value !== "-")
      .join(" • ");
    return `
      <tr>
        <td class="center serial">${line.index}</td>
        <td>
          <div class="productCell">
            ${imageHtml}
            <div class="productText">
              <strong>${labelEscapeHtml(line.title || "Produs")}</strong>
              ${variantMeta ? `<small>${labelEscapeHtml(variantMeta)}</small>` : ""}
            </div>
          </div>
        </td>
        <td class="code">${labelEscapeHtml(line.productCode || "-")}</td>
        <td class="code">${labelEscapeHtml(line.barcode || "-")}</td>
        <td class="center unit">buc.</td>
        <td class="qty">${line.qty}</td>
        <td class="money">${warehouseTransferMoney(line.unitPrice)}</td>
        <td class="money strongMoney">${warehouseTransferMoney(line.lineTotal)}</td>
      </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <title>${labelEscapeHtml(`Proces-verbal transfer stoc ${documentNumber}`)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; color: #172033; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 100%; }
    .topGrid { display: grid; grid-template-columns: minmax(0,1fr) minmax(70mm,.86fr); gap: 10mm; align-items: start; padding-bottom: 5mm; border-bottom: 2px solid #255f54; }
    .companyName { color: #183d36; font-size: 17px; font-weight: 700; letter-spacing: .03em; }
    .companyMeta { margin-top: 2.5mm; color: #465467; font-size: 10px; line-height: 1.45; }
    .companyMeta div { margin-top: .6mm; }
    .docBox { border: 1px solid #b9c7c4; border-radius: 3mm; overflow: hidden; }
    .docBoxTitle { padding: 2.2mm 3mm; background: #255f54; color: #fff; font-size: 9px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
    .docBoxBody { display: grid; grid-template-columns: 1fr; gap: 1.4mm; padding: 2.7mm 3mm; background: #f5f8f7; }
    .docLine { display: flex; justify-content: space-between; gap: 5mm; border-bottom: 1px solid #d8e0de; padding-bottom: 1.1mm; }
    .docLine:last-child { border-bottom: 0; padding-bottom: 0; }
    .docLine span { color: #667382; }
    .docLine strong { color: #172033; text-align: right; }
    .titleBlock { padding: 6mm 0 4mm; text-align: center; }
    .eyebrow { color: #255f54; font-size: 9px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; }
    h1 { margin: 1.5mm 0 0; font-size: 20px; line-height: 1.15; letter-spacing: .02em; color: #172033; }
    .subtitle { margin-top: 1.5mm; color: #526070; font-size: 11px; }
    .routeGrid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 3mm; margin: 1mm 0 4mm; }
    .routeCard { border: 1px solid #ccd7d4; border-radius: 2.5mm; padding: 2.5mm 3mm; background: #f7faf9; }
    .routeCard span { display: block; color: #6a7683; font-size: 8.5px; letter-spacing: .08em; text-transform: uppercase; }
    .routeCard strong { display: block; margin-top: 1mm; color: #172033; font-size: 11px; line-height: 1.3; }
    .declaration { margin-bottom: 3.5mm; border-left: 3px solid #255f54; background: #f5f8f7; padding: 2.5mm 3mm; color: #354353; line-height: 1.45; }
    .note { margin-bottom: 3.5mm; border: 1px solid #d3dcda; border-radius: 2.5mm; padding: 2.5mm 3mm; color: #354353; background: #fff; }
    .note strong { color: #172033; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th { background: #26384b; color: #fff; border: 1px solid #26384b; padding: 2.2mm 1.3mm; font-size: 7.7px; line-height: 1.2; letter-spacing: .025em; text-transform: uppercase; text-align: left; }
    td { border: 1px solid #d4dcdf; padding: 1.8mm 1.3mm; font-size: 8.5px; line-height: 1.25; vertical-align: middle; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) td { background: #f8fafb; }
    th:nth-child(1), td:nth-child(1) { width: 7mm; }
    th:nth-child(2), td:nth-child(2) { width: 52mm; }
    th:nth-child(3), td:nth-child(3) { width: 25mm; }
    th:nth-child(4), td:nth-child(4) { width: 29mm; }
    th:nth-child(5), td:nth-child(5) { width: 10mm; }
    th:nth-child(6), td:nth-child(6) { width: 12mm; }
    th:nth-child(7), td:nth-child(7) { width: 23mm; }
    th:nth-child(8), td:nth-child(8) { width: 25mm; }
    .center { text-align: center; }
    .serial { color: #536171; }
    .unit { white-space: nowrap; }
    .qty { text-align: center; font-size: 11px; font-weight: 700; color: #255f54; }
    .money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .strongMoney { font-weight: 700; color: #183d36; }
    .code { font-family: "Courier New", monospace; font-size: 7.8px; }
    .productCell { display: flex; align-items: center; gap: 2mm; min-width: 0; }
    .productText { min-width: 0; }
    .productCell strong { display: block; color: #172033; font-size: 9px; line-height: 1.2; }
    .productCell small { display: block; margin-top: .7mm; color: #667382; font-size: 7.7px; line-height: 1.25; }
    .aifTransferImg { width: 9mm; height: 11mm; flex: 0 0 auto; object-fit: contain; border: 1px solid #d4dcdf; border-radius: 1.5mm; background: #fff; }
    .aifTransferImg.empty { display: flex; align-items: center; justify-content: center; padding: 1mm; color: #9aa4ae; font-size: 5.5px; text-align: center; }
    tfoot td { background: #eef4f2 !important; border-color: #b9c7c4; font-weight: 700; }
    .totalLabel { text-align: right; color: #183d36; letter-spacing: .05em; }
    .totalValueCell { background: #255f54 !important; color: #fff; font-size: 10px; }
    .totalRow { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; margin-top: 2.5mm; border: 1px solid #b9c7c4; border-radius: 2.5mm; overflow: hidden; }
    .totalRow span { padding: 2.4mm 3mm; color: #536171; background: #f5f8f7; }
    .totalRow strong { min-width: 40mm; padding: 2.4mm 3mm; text-align: center; color: #fff; background: #255f54; font-size: 13px; }
    .signatures { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 4mm; margin-top: 13mm; break-inside: avoid; page-break-inside: avoid; }
    .signature { min-height: 27mm; border: 1px solid #ccd7d4; border-radius: 2.5mm; padding: 2.5mm; }
    .signatureTitle { color: #255f54; font-size: 8.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
    .signatureLine { margin-top: 9mm; border-top: 1px solid #667382; padding-top: 1.3mm; color: #667382; font-size: 7.5px; text-align: center; }
    .signatureDate { margin-top: 2.5mm; color: #7b8793; font-size: 7.5px; text-align: center; }
    .footer { display: flex; justify-content: space-between; gap: 8mm; margin-top: 5mm; padding-top: 2.5mm; border-top: 1px solid #d7dfdd; color: #7b8793; font-size: 7.5px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="topGrid">
      <div>
        <div class="companyName">TITAN EURO-COM SRL</div>
        <div class="companyMeta">
          <div><strong>CUI:</strong> RO17495362</div>
          <div><strong>Nr. Reg. Com.:</strong> J19/420/2005</div>
          <div><strong>Sediu:</strong> Str. Mihail Sadoveanu nr. 33, sc. C, et. 4, ap. 17, Miercurea-Ciuc, jud. Harghita, România</div>
        </div>
      </div>
      <div class="docBox">
        <div class="docBoxTitle">Datele documentului</div>
        <div class="docBoxBody">
          <div class="docLine"><span>Nr. document</span><strong>${labelEscapeHtml(documentNumber)}</strong></div>
          <div class="docLine"><span>Data emiterii</span><strong>${labelEscapeHtml(options.createdAt)}</strong></div>
          <div class="docLine"><span>Tip operațiune</span><strong>Transfer intern de stoc</strong></div>
        </div>
      </div>
    </div>

    <div class="titleBlock">
      <div class="eyebrow">Document intern de gestiune</div>
      <h1>PROCES-VERBAL DE PREDARE-PRIMIRE</h1>
      <div class="subtitle">${labelEscapeHtml(documentObject)}</div>
    </div>

    <div class="routeGrid">
      <div class="routeCard"><span>Gestiune predătoare</span><strong>${labelEscapeHtml(fromSummary)}</strong></div>
      <div class="routeCard"><span>Gestiune primitoare</span><strong>${labelEscapeHtml(toSummary)}</strong></div>
    </div>

    <div class="declaration">Prin prezentul document se confirmă predarea și primirea produselor enumerate mai jos, în cantitățile și la valorile indicate, pentru transfer intern între gestiuni. Persoanele semnatare confirmă verificarea cantitativă și valorică a bunurilor.</div>
    ${options.note ? `<div class="note"><strong>Observații:</strong> ${labelEscapeHtml(options.note)}</div>` : ""}

    <table>
      <thead>
        <tr>
          <th>Nr. crt.</th>
          <th>Denumirea produsului / varianta</th>
          <th>Cod produs</th>
          <th>Cod de bare</th>
          <th>U.M.</th>
          <th>Cant.</th>
          <th>P.U. RON</th>
          <th>Valoare RON</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="totalLabel">TOTAL</td>
          <td class="qty">${totalQty}</td>
          <td class="money">-</td>
          <td class="money totalValueCell">${warehouseTransferMoney(totalValue)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="totalRow"><span>Total produse transferate: ${options.lines.length} poziții / ${totalQty} buc.</span><strong>${warehouseTransferMoney(totalValue)} RON</strong></div>

    <div class="signatures">
      <div class="signature"><div class="signatureTitle">Predat de</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div>
      <div class="signature"><div class="signatureTitle">Transportat de</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div>
      <div class="signature"><div class="signatureTitle">Primit de</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div>
      <div class="signature"><div class="signatureTitle">Verificat de</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div>
    </div>

    <div class="footer">
      <span>Document generat din sistemul AllInFashion.</span>
      <span>${labelEscapeHtml(documentNumber)} • ${labelEscapeHtml(options.createdAt)}</span>
    </div>
  </div>
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 12}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Vonalkód ${safeText}"><rect width="${width}" height="${height + 12}" fill="#fff"/><g fill="#000">${bars.join("")}</g><text x="${width / 2}" y="${height + 9}" text-anchor="middle" font-family="Arial, sans-serif" font-size="7.2">${safeText}</text></svg>`;
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

function activationRequiredMissingFields(it: Partial<InventoryItem> | Record<string, any>) {
  const out: string[] = [];
  if (!String((it as any).image_url || (it as any).imageUrl || "").trim()) out.push("kép");
  if (!visibleWarehouseBarcode(it)) out.push("vonalkód");
  if (!String((it as any).title_ro || (it as any).titleRo || "").trim()) out.push("terméknév");
  if (!String((it as any).size || "").trim()) out.push("méret");
  if (priceNumber((it as any).buy_price ?? (it as any).buyPrice) === null) out.push("vételár");
  if (priceNumber((it as any).sell_price ?? (it as any).sellPrice) === null) out.push("eladási ár");
  return out;
}

function hasMissingData(it: InventoryItem) {
  return activationRequiredMissingFields(it).length > 0 || needsWarehouseActivation(it);
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

function WarehouseProductImage({
  src,
  alt = "",
  thumbClassName = "h-11 w-11 rounded-lg",
  iconSize = 17,
}: {
  src?: string | null;
  alt?: string;
  thumbClassName?: string;
  iconSize?: number;
}) {
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStyle, setPreviewStyle] = useState<React.CSSProperties>({});
  const cleanSrc = String(src || "").trim();

  function updatePreviewPosition() {
    if (!cleanSrc || typeof window === "undefined") return;
    const thumb = thumbRef.current;
    if (!thumb) return;
    const rect = thumb.getBoundingClientRect();
    const previewWidth = 248;
    const previewHeight = 300;
    const gap = 12;
    const padding = 10;
    let left = rect.right + gap;
    if (left + previewWidth > window.innerWidth - padding) left = rect.left - previewWidth - gap;
    if (left < padding) left = Math.min(Math.max(padding, rect.left + rect.width / 2 - previewWidth / 2), Math.max(padding, window.innerWidth - previewWidth - padding));
    const maxTop = Math.max(padding, window.innerHeight - previewHeight - padding);
    const top = Math.min(Math.max(padding, rect.top + rect.height / 2 - previewHeight / 2), maxTop);
    setPreviewStyle({ position: "fixed", left, top, width: previewWidth });
  }

  function openPreview() {
    if (!cleanSrc) return;
    updatePreviewPosition();
    setPreviewOpen(true);
  }

  useEffect(() => {
    if (!previewOpen || !cleanSrc) return;
    updatePreviewPosition();
    const onMove = () => updatePreviewPosition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [previewOpen, cleanSrc]);

  const thumb = (
    <span
      ref={thumbRef}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/18 bg-white text-slate-400 shadow-sm ${thumbClassName}`}
      onMouseEnter={openPreview}
      onMouseLeave={() => setPreviewOpen(false)}
      onFocus={openPreview}
      onBlur={() => setPreviewOpen(false)}
      tabIndex={cleanSrc ? 0 : undefined}
      aria-label={cleanSrc ? "Termékkép nagyítása" : "Nincs termékkép"}
    >
      {cleanSrc ? (
        <img src={cleanSrc} alt={alt} className="h-full w-full object-contain p-0.5" loading="lazy" />
      ) : (
        <ImagePlus size={iconSize} />
      )}
    </span>
  );

  const preview = cleanSrc && previewOpen && typeof document !== "undefined"
    ? createPortal(
        <div
          className="pointer-events-none z-[9999] rounded-2xl border border-white/80 bg-white p-2 shadow-2xl shadow-black/45"
          style={previewStyle}
          role="tooltip"
        >
          <img src={cleanSrc} alt="" className="max-h-[280px] w-full rounded-xl bg-white object-contain" />
        </div>,
        document.body
      )
    : null;

  return <>{thumb}{preview}</>;
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

function warehouseProductFamilyCode(it: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (it || {}) as Record<string, any>;
  const colorCode = firstWarehouseText(source.color_code, source.colorCode, source.supplier_color_code, source.supplierColorCode);
  const rawProductCode = firstWarehouseText(itemProductCode(source));
  const rawModelCode = firstWarehouseText(source.model_code, source.modelCode);

  const withoutColorSuffix = (value: string) => {
    const cleanValue = String(value || "").trim();
    const cleanColor = String(colorCode || "").trim();
    if (!cleanValue || !cleanColor) return cleanValue;
    const escapedColor = cleanColor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = cleanValue
      .replace(new RegExp(`(?:[-_./:\\s]+)?${escapedColor}$`, "i"), "")
      .replace(/[-_./:\\s]+$/g, "")
      .trim();
    return stripped || cleanValue;
  };

  const productFamily = withoutColorSuffix(rawProductCode);
  if (productFamily) return productFamily;
  const cleanModelCode = rawModelCode.includes(":") ? rawModelCode.split(":").pop() || rawModelCode : rawModelCode;
  return withoutColorSuffix(cleanModelCode) || firstWarehouseText(source.title_ro, source.shopify_title, source.internal_sku);
}

function warehouseVariantColorSortKey(it: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (it || {}) as Record<string, any>;
  return firstWarehouseText(source.color_code, source.colorCode, source.supplier_color_code, source.supplierColorCode, source.color_name, source.colorName);
}

function warehouseVariantSizeSortRank(value: unknown) {
  const key = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  const known = [
    "XXXS", "XXS", "XS", "S", "S/M", "M", "M/L", "L", "L/XL", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL",
    "OSFM", "ONESIZE", "ONE-SIZE", "TU",
  ];
  const index = known.indexOf(key);
  return index >= 0 ? index : 1000;
}

function warehouseSameColorSizeSibling(a: Partial<InventoryItem> | Record<string, any>, b: Partial<InventoryItem> | Record<string, any>) {
  const aId = selectedVariantIdFromItem(a as any);
  const bId = selectedVariantIdFromItem(b as any);
  if (!aId || !bId || aId === bId) return false;

  const aModelId = firstWarehouseText((a as any).model_id, (a as any).modelId);
  const bModelId = firstWarehouseText((b as any).model_id, (b as any).modelId);
  const sameModel = aModelId && bModelId
    ? aModelId === bModelId
    : normalizeSearch(warehouseProductFamilyCode(a)) === normalizeSearch(warehouseProductFamilyCode(b)) &&
      normalizeSearch(firstWarehouseText((a as any).brand_code, (a as any).brand_name)) === normalizeSearch(firstWarehouseText((b as any).brand_code, (b as any).brand_name));
  if (!sameModel) return false;

  const aColorCode = firstWarehouseText((a as any).color_code, (a as any).colorCode, (a as any).supplier_color_code, (a as any).supplierColorCode);
  const bColorCode = firstWarehouseText((b as any).color_code, (b as any).colorCode, (b as any).supplier_color_code, (b as any).supplierColorCode);
  if (aColorCode && bColorCode && normalizeSearch(aColorCode) !== normalizeSearch(bColorCode)) return false;

  const aColorName = firstWarehouseText((a as any).color_name, (a as any).colorName);
  const bColorName = firstWarehouseText((b as any).color_name, (b as any).colorName);
  if ((!aColorCode || !bColorCode) && aColorName && bColorName && colorKey(aColorName) !== colorKey(bColorName)) return false;

  // Ha az egyik oldalon sincs színadat, ugyanazon modellen belül ezt is egy színnek tekintjük.
  // Ha van használható színadat, annak már fent egyeznie kellett.
  const aSize = normalizeSearch((a as any).size);
  const bSize = normalizeSearch((b as any).size);
  return Boolean(aSize && bSize && aSize !== bSize);
}

function compareWarehouseVariantPresentation(a: InventoryItem, b: InventoryItem) {
  const compareText = (left: unknown, right: unknown) => String(left || "").localeCompare(String(right || ""), "hu", {
    numeric: true,
    sensitivity: "base",
  });

  const byTitle = compareText(a.title_ro || a.shopify_title, b.title_ro || b.shopify_title);
  if (byTitle !== 0) return byTitle;

  const byFamily = compareText(warehouseProductFamilyCode(a), warehouseProductFamilyCode(b));
  if (byFamily !== 0) return byFamily;

  // Azonos termékcsaládnál előbb egy szín összes mérete jön, és csak utána
  // a következő színkód. Így a 069 és 601 sorok nem váltogatják egymást.
  const byColorCode = compareText(warehouseVariantColorSortKey(a), warehouseVariantColorSortKey(b));
  if (byColorCode !== 0) return byColorCode;

  const aSizeRank = warehouseVariantSizeSortRank(a.size);
  const bSizeRank = warehouseVariantSizeSortRank(b.size);
  if (aSizeRank !== bSizeRank) return aSizeRank - bSizeRank;

  const bySize = compareText(a.size, b.size);
  if (bySize !== 0) return bySize;

  const byProductCode = compareText(itemProductCode(a), itemProductCode(b));
  if (byProductCode !== 0) return byProductCode;

  return compareText(a.variant_id, b.variant_id);
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

function historyDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function historyPercent(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return "-";
  const x = Number(value);
  if (!Number.isFinite(x)) return "-";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toLocaleString("hu-HU", { maximumFractionDigits: 0 })}%`;
}

function historyQty(value: unknown, signed = false) {
  const x = n(value);
  const sign = signed && x > 0 ? "+" : "";
  return `${sign}${Math.trunc(x).toLocaleString("hu-HU")} db`;
}

const WAREHOUSE_PRICE_HISTORY_ATTR_KEY = "aifPriceHistory";
const WAREHOUSE_PRICE_HISTORY_LIMIT = 150;

type WarehousePriceHistoryEntry = {
  id: string;
  createdAt: string;
  source: "warehouse_detail_edit";
  actor?: string | null;
  variantId?: string | null;
  title?: string | null;
  buyPriceBefore?: string | number | null;
  buyPriceAfter?: string | number | null;
  sellPriceBefore?: string | number | null;
  sellPriceAfter?: string | number | null;
  compareAtPriceBefore?: string | number | null;
  compareAtPriceAfter?: string | number | null;
  changedFields?: string[];
};

function warehousePriceComparable(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const parsed = priceNumber(value);
  return parsed === null ? String(value).trim() : parsed.toFixed(2);
}

function warehousePriceValueForHistory(value: unknown) {
  const parsed = priceNumber(value);
  if (parsed === null) return null;
  return Number(parsed.toFixed(2));
}

function warehousePriceChanged(before: unknown, after: unknown) {
  return warehousePriceComparable(before) !== warehousePriceComparable(after);
}

function warehousePriceHistoryId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `price:${Date.now().toString(36)}:${random}`;
}

function normalizeWarehousePriceHistory(value: unknown): WarehousePriceHistoryEntry[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).items)
      ? ((value as Record<string, unknown>).items as unknown[])
      : [];
  return source
    .map((entry) => entry && typeof entry === "object" ? entry as WarehousePriceHistoryEntry : null)
    .filter((entry): entry is WarehousePriceHistoryEntry => Boolean(entry?.createdAt || entry?.id))
    .map((entry) => ({
      ...entry,
      id: String(entry.id || warehousePriceHistoryId()),
      createdAt: String(entry.createdAt || new Date().toISOString()),
      source: "warehouse_detail_edit",
    }));
}

function warehousePriceHistoryFromAttributes(attributes: unknown) {
  const attrs = attributes && typeof attributes === "object" && !Array.isArray(attributes)
    ? attributes as Record<string, unknown>
    : {};
  return normalizeWarehousePriceHistory(attrs[WAREHOUSE_PRICE_HISTORY_ATTR_KEY] || attrs.priceHistory);
}

function makeWarehousePriceHistoryEntry(args: { variantId: string; before: EditForm; after: EditForm; item?: Record<string, any> | null }) {
  const changedFields: string[] = [];
  if (warehousePriceChanged(args.before.buyPrice, args.after.buyPrice)) changedFields.push("Vételár");
  if (warehousePriceChanged(args.before.sellPrice, args.after.sellPrice)) changedFields.push("Eladási ár");
  if (warehousePriceChanged(args.before.compareAtPrice, args.after.compareAtPrice)) changedFields.push("Akciós / összehasonlító ár");
  if (!changedFields.length) return null;

  return {
    id: warehousePriceHistoryId(),
    createdAt: new Date().toISOString(),
    source: "warehouse_detail_edit" as const,
    actor: "AllInWarehouse",
    variantId: args.variantId,
    title: firstWarehouseText(args.item?.title_ro, args.item?.shopify_title, args.after.titleRo),
    buyPriceBefore: warehousePriceValueForHistory(args.before.buyPrice),
    buyPriceAfter: warehousePriceValueForHistory(args.after.buyPrice),
    sellPriceBefore: warehousePriceValueForHistory(args.before.sellPrice),
    sellPriceAfter: warehousePriceValueForHistory(args.after.sellPrice),
    compareAtPriceBefore: warehousePriceValueForHistory(args.before.compareAtPrice),
    compareAtPriceAfter: warehousePriceValueForHistory(args.after.compareAtPrice),
    changedFields,
  } satisfies WarehousePriceHistoryEntry;
}

function appendWarehousePriceHistory(attributes: unknown, entry: WarehousePriceHistoryEntry) {
  const current = warehousePriceHistoryFromAttributes(attributes);
  const next = [...current.filter((item) => String(item.id) !== String(entry.id)), entry]
    .sort((a, b) => dateTimeMs(a.createdAt) - dateTimeMs(b.createdAt))
    .slice(-WAREHOUSE_PRICE_HISTORY_LIMIT);
  return next;
}

function historyIsPriceEvent(event: VariantHistoryEvent) {
  const type = String(event.event_type || "").toLowerCase();
  const source = String(event.source_type || "").toLowerCase();
  const movement = String(event.movement_type || "").toLowerCase();
  return type === "price" || type === "price_change" || source.includes("price") || movement.includes("price") || event.raw?.source === "warehouse_detail_edit";
}

function historyPriceFieldList(value: unknown) {
  if (Array.isArray(value)) return value.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof value === "string") {
    const clean = value.trim();
    if (!clean) return [] as string[];
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
    } catch {}
    return clean.split(/[;,|]+/).map((x) => x.trim()).filter(Boolean);
  }
  return [] as string[];
}

function historyPriceChangeRows(event: VariantHistoryEvent) {
  const rawChanges = Array.isArray(event.raw?.priceChanges) ? event.raw?.priceChanges as Array<Record<string, unknown>> : [];
  const fromRaw = rawChanges
    .map((row) => ({
      label: firstWarehouseText(row.label, row.key),
      oldValue: row.oldValue,
      newValue: row.newValue,
    }))
    .filter((row) => row.label || warehousePriceComparable(row.oldValue) !== warehousePriceComparable(row.newValue));
  if (fromRaw.length) return fromRaw;

  const rows = [
    { label: "Vételár", oldValue: event.old_buy_price, newValue: event.new_buy_price },
    { label: "Eladási ár", oldValue: event.old_sell_price, newValue: event.new_sell_price },
    { label: "Akció előtti ár", oldValue: event.old_compare_at_price, newValue: event.new_compare_at_price },
  ].filter((row) => warehousePriceComparable(row.oldValue) !== warehousePriceComparable(row.newValue));
  if (rows.length) return rows;

  return historyPriceFieldList(event.price_change_fields || event.raw?.changedFields).map((label) => ({ label, oldValue: "", newValue: "" }));
}

function historyPriceDedupKey(event: VariantHistoryEvent) {
  const changes = historyPriceChangeRows(event);
  const changeKey = changes
    .map((row) => `${String(row.label || "").toLowerCase()}:${warehousePriceComparable(row.oldValue)}>${warehousePriceComparable(row.newValue)}`)
    .sort()
    .join("|") || [
      warehousePriceComparable(event.old_buy_price), warehousePriceComparable(event.new_buy_price),
      warehousePriceComparable(event.old_sell_price), warehousePriceComparable(event.new_sell_price),
      warehousePriceComparable(event.old_compare_at_price), warehousePriceComparable(event.new_compare_at_price),
    ].join(">");
  const minute = dateTimeMs(event.created_at) ? String(Math.floor(dateTimeMs(event.created_at) / 60000)) : String(event.created_at || "");
  return `price:${minute}:${changeKey}`;
}

function dedupeVariantHistoryEvents(events: VariantHistoryEvent[]) {
  const seen = new Set<string>();
  return (events || []).filter((event) => {
    if (!event) return false;
    const key = historyIsPriceEvent(event)
      ? historyPriceDedupKey(event)
      : `event:${String(event.id || `${event.source_type || ""}:${event.source_id || ""}:${event.created_at || ""}:${event.qty_delta || ""}`)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


function historyIsTransferEvent(event: VariantHistoryEvent) {
  const type = String(event.event_type || "").toLowerCase();
  const source = String(event.source_type || "").toLowerCase();
  const reason = String(event.raw?.reason || "").toLowerCase();
  return type === "transfer" || source.includes("stock_transfer") || reason === "stock_transfer";
}

function logicalWarehouseVariantHistoryEvents(rows: VariantHistoryEvent[]) {
  const regular: VariantHistoryEvent[] = [];
  const transferGroups = new Map<string, VariantHistoryEvent[]>();

  for (const event of rows || []) {
    if (!historyIsTransferEvent(event)) {
      regular.push(event);
      continue;
    }
    const raw = event.raw && typeof event.raw === "object" ? event.raw : {};
    const transferId = firstWarehouseText(raw.transferId, raw.transfer_id);
    const lineNo = firstWarehouseText(raw.lineNo, raw.line_no, "1");
    const movementGroupId = firstWarehouseText(raw.movementGroupId, raw.movement_group_id);
    const key = movementGroupId || (transferId ? `${transferId}:${lineNo}` : `movement:${event.id}`);
    const group = transferGroups.get(key) || [];
    group.push(event);
    transferGroups.set(key, group);
  }

  const transfers = Array.from(transferGroups.entries()).map(([key, group]) => {
    const sourceLeg = group.find((event) => String(event.raw?.side || "").toLowerCase() === "source")
      || group.find((event) => n(event.qty_delta) < 0)
      || group[0];
    const targetLeg = group.find((event) => String(event.raw?.side || "").toLowerCase() === "target")
      || group.find((event) => n(event.qty_delta) > 0)
      || group[group.length - 1]
      || sourceLeg;
    const newest = group.slice().sort((a, b) => dateTimeMs(b.created_at) - dateTimeMs(a.created_at))[0] || sourceLeg;
    const sourceRaw = sourceLeg?.raw && typeof sourceLeg.raw === "object" ? sourceLeg.raw : {};
    const targetRaw = targetLeg?.raw && typeof targetLeg.raw === "object" ? targetLeg.raw : {};
    const qty = Math.max(0, ...group.map((event) => Math.abs(n(event.qty_delta))));
    const fromLocation = firstWarehouseText(
      sourceRaw.fromLocationName,
      targetRaw.fromLocationName,
      sourceLeg?.from_location_name,
      targetLeg?.from_location_name,
      sourceLeg?.location_name,
    );
    const toLocation = firstWarehouseText(
      sourceRaw.toLocationName,
      targetRaw.toLocationName,
      sourceLeg?.to_location_name,
      targetLeg?.to_location_name,
      targetLeg?.location_name,
    );

    return {
      ...sourceLeg,
      id: `logical-transfer:${key}`,
      created_at: newest?.created_at || sourceLeg?.created_at || null,
      event_type: "transfer",
      direction: "adjust",
      movement_type: "transfer",
      source_type: "stock_transfer",
      qty_delta: qty,
      qty_before: sourceLeg?.qty_before ?? null,
      qty_after: targetLeg?.qty_after ?? null,
      from_location_name: fromLocation || sourceLeg?.from_location_name || null,
      to_location_name: toLocation || targetLeg?.to_location_name || null,
      location_name: fromLocation || sourceLeg?.location_name || null,
      effective_buy_price: sourceLeg?.effective_buy_price ?? targetLeg?.effective_buy_price ?? null,
      effective_sell_price: sourceLeg?.effective_sell_price ?? targetLeg?.effective_sell_price ?? null,
      raw: {
        ...targetRaw,
        ...sourceRaw,
        logicalTransfer: true,
        pairedMovementIds: group.map((event) => event.id),
        pairedMovementCount: group.length,
      },
    } satisfies VariantHistoryEvent;
  });

  return [...regular, ...transfers]
    .sort((a, b) => dateTimeMs(b.created_at) - dateTimeMs(a.created_at));
}

function priceHistoryEventsFromItem(item?: (InventoryItem & Record<string, any>) | null): VariantHistoryEvent[] {
  const entries = warehousePriceHistoryFromAttributes(item?.attributes);
  return entries.map((entry) => {
    const priceChanges = [
      { key: "buyPrice", label: "Vételár", oldValue: entry.buyPriceBefore, newValue: entry.buyPriceAfter },
      { key: "sellPrice", label: "Eladási ár", oldValue: entry.sellPriceBefore, newValue: entry.sellPriceAfter },
      { key: "compareAtPrice", label: "Akció előtti ár", oldValue: entry.compareAtPriceBefore, newValue: entry.compareAtPriceAfter },
    ].filter((row) => warehousePriceComparable(row.oldValue) !== warehousePriceComparable(row.newValue));
    return {
      id: entry.id,
      created_at: entry.createdAt,
      event_type: "price",
      direction: "adjust",
      movement_type: "price_change",
      source_type: "price_change",
      source_id: entry.id,
      qty_delta: 0,
      qty_before: null,
      qty_after: null,
      actor: entry.actor || null,
      location_name: null,
      old_buy_price: entry.buyPriceBefore ?? null,
      new_buy_price: entry.buyPriceAfter ?? null,
      old_sell_price: entry.sellPriceBefore ?? null,
      new_sell_price: entry.sellPriceAfter ?? null,
      old_compare_at_price: entry.compareAtPriceBefore ?? null,
      new_compare_at_price: entry.compareAtPriceAfter ?? null,
      price_change_fields: entry.changedFields || priceChanges.map((row) => row.label),
      effective_buy_price: entry.buyPriceAfter ?? entry.buyPriceBefore ?? null,
      effective_sell_price: entry.sellPriceAfter ?? entry.sellPriceBefore ?? null,
      raw: {
        ...entry,
        title: "Árváltozás",
        reason: "warehouse_price_edit",
        priceChanges,
      },
    };
  });
}

function mergeVariantHistoryPriceEvents(data: VariantHistoryResponse): VariantHistoryResponse {
  const priceEvents = priceHistoryEventsFromItem(data.item || null);
  const events = logicalWarehouseVariantHistoryEvents(
    dedupeVariantHistoryEvents([...(data.events || []), ...priceEvents])
  );
  return { ...data, events };
}

function historyEventMeta(event: VariantHistoryEvent) {
  const type = String(event.event_type || "").toLowerCase();
  const direction = String(event.direction || "").toLowerCase();
  const source = String(event.source_type || "").toLowerCase();
  const reason = String(event.raw?.reason || "").toLowerCase();
  const movement = String(event.movement_type || "").toLowerCase();
  const isPrice = type === "price" || source.includes("price") || movement.includes("price");
  const isTransfer = historyIsTransferEvent(event) || source.includes("redistribution");
  const isInventory = type === "inventory" || source.includes("inventory");
  const isIncoming = type === "incoming" || direction === "in";
  const isOutgoing = type === "outgoing" || direction === "out";

  if (isPrice) {
    return {
      label: "Árváltozás",
      cls: "border-amber-300/80 bg-amber-100 text-amber-900",
      dot: "bg-amber-500",
      stripe: "bg-amber-400",
      card: "bg-amber-50/90 border-amber-200",
    };
  }

  if (isTransfer) {
    return {
      label: direction === "out" ? "Átvitel ki" : direction === "in" ? "Átvitel be" : "Átvitel",
      cls: "border-sky-300/70 bg-sky-100 text-sky-800",
      dot: "bg-sky-500",
      stripe: "bg-sky-400",
      card: "bg-sky-50/90 border-sky-200",
    };
  }
  if (isInventory) {
    return {
      label: "Leltár",
      cls: "border-violet-300/70 bg-violet-100 text-violet-800",
      dot: "bg-violet-500",
      stripe: "bg-violet-400",
      card: "bg-violet-50/90 border-violet-200",
    };
  }
  if (isIncoming) {
    return {
      label: "Bevételezés",
      cls: "border-[#8be1dd] bg-[#e7faf8] text-[#187876]",
      dot: "bg-[#208d8b]",
      stripe: "bg-[#2a8d8b]",
      card: "bg-[#effbf9] border-[#b9ece9]",
    };
  }
  if (isOutgoing) {
    return {
      label: "Kimenő",
      cls: "border-rose-300/70 bg-rose-100 text-rose-800",
      dot: "bg-rose-500",
      stripe: "bg-rose-400",
      card: "bg-rose-50/90 border-rose-200",
    };
  }
  return {
    label: "Korrekció",
    cls: "border-amber-300/80 bg-amber-100 text-amber-900",
    dot: "bg-amber-500",
    stripe: "bg-amber-400",
    card: "bg-amber-50/90 border-amber-200",
  };
}

function historySourceLabel(event: VariantHistoryEvent) {
  const type = String(event.event_type || "").toLowerCase();
  const source = String(event.source_type || "").toLowerCase();
  const reason = String(event.raw?.reason || "").toLowerCase();
  const movement = String(event.movement_type || "").toLowerCase();
  if (historyIsPriceEvent(event)) return "Ár módosítása";
  if (type === "transfer" || source.includes("transfer") || reason.includes("transfer")) return "Üzletek közti átvitel";
  if (source.includes("manual_stock_redistribution")) return "Készlet átrendezés";
  if (type === "inventory" || source.includes("inventory")) return "Leltár rendezés";
  if (source.includes("import_batch") || reason.includes("import_batch")) return "Import / bevételezés";
  if (source.includes("manual_stock_correction")) return "Kézi készletkorrekció";
  if (source.includes("sale")) return "Eladás";
  if (movement.includes("manual") || movement.includes("adjustment") || source.includes("manual")) return "Kézi készletmódosítás";
  if (type === "incoming") return "Bejövő mozgás";
  if (type === "outgoing") return "Kimenő mozgás";
  return "Egyéb készletmozgás";
}

function historyEventNote(event: VariantHistoryEvent) {
  if (historyIsPriceEvent(event)) return "Árváltozás rögzítve a termékadatlapon.";
  const note = firstWarehouseText(event.raw?.title, event.raw?.note);
  const key = normalizeSearch(note);
  if (!note) return "";
  if (
    (key.includes("manual") && key.includes("adjustment")) ||
    key.includes("manual_stock") ||
    key.includes("stock_transfer") ||
    key.includes("transfer_out") ||
    key.includes("transfer_in") ||
    key.includes("import_batch")
  ) return "";
  return note;
}

function HistoryMiniCard({ label: labelText, value, hint, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "green" | "blue" | "red" | "gold" }) {
  const toneClass = tone === "green"
    ? "border-[#9be2df] bg-[#effbf9]"
    : tone === "blue"
      ? "border-sky-200 bg-sky-50"
      : tone === "red"
        ? "border-rose-200 bg-rose-50"
        : tone === "gold"
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-[0.09em] text-slate-500">{labelText}</p>
      <p className="mt-1 text-[22px] leading-none tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p> : null}
    </div>
  );
}

function priceChangeRowsForHistory(event: VariantHistoryEvent): WarehousePriceChangeRow[] {
  const rawRows = Array.isArray(event.raw?.priceChanges) ? event.raw?.priceChanges : [];
  if (rawRows.length) {
    return rawRows
      .map((row: any) => ({
        key: String(row?.key || "sellPrice") as WarehousePriceChangeRow["key"],
        label: String(row?.label || "Ár"),
        oldValue: priceDisplayValue(row?.oldValue),
        newValue: priceDisplayValue(row?.newValue),
      }))
      .filter((row: WarehousePriceChangeRow) => row.label && (row.oldValue !== "-" || row.newValue !== "-"));
  }
  const raw = event.raw || {};
  const oldBuy = event.old_buy_price ?? raw.buyPriceBefore ?? raw.oldBuyPrice;
  const newBuy = event.new_buy_price ?? raw.buyPriceAfter ?? raw.newBuyPrice;
  const oldSell = event.old_sell_price ?? raw.sellPriceBefore ?? raw.oldSellPrice;
  const newSell = event.new_sell_price ?? raw.sellPriceAfter ?? raw.newSellPrice;
  const oldCompare = event.old_compare_at_price ?? raw.compareAtPriceBefore ?? raw.oldCompareAtPrice;
  const newCompare = event.new_compare_at_price ?? raw.compareAtPriceAfter ?? raw.newCompareAtPrice;
  const rows: WarehousePriceChangeRow[] = [];
  if (priceComparableValue(oldBuy) !== priceComparableValue(newBuy)) {
    rows.push({ key: "buyPrice", label: "Vételár", oldValue: priceDisplayValue(oldBuy), newValue: priceDisplayValue(newBuy) });
  }
  if (priceComparableValue(oldSell) !== priceComparableValue(newSell)) {
    rows.push({ key: "sellPrice", label: "Eladási ár", oldValue: priceDisplayValue(oldSell), newValue: priceDisplayValue(newSell) });
  }
  if (priceComparableValue(oldCompare) !== priceComparableValue(newCompare)) {
    rows.push({ key: "compareAtPrice", label: "Akció előtti ár", oldValue: priceDisplayValue(oldCompare), newValue: priceDisplayValue(newCompare) });
  }
  return rows;
}

function HistoryPriceBox({ event, pricesVisible }: { event: VariantHistoryEvent; pricesVisible: boolean }) {
  const isPriceEvent = historyIsPriceEvent(event);
  if (isPriceEvent) {
    const rows = priceChangeRowsForHistory(event);
    return (
      <div className="rounded-2xl border border-amber-200 bg-white px-3 py-2 text-[12px] leading-snug text-slate-600 shadow-sm">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.09em] text-amber-700">Árváltozás</div>
        {rows.length ? rows.map((row) => {
          const hideValue = row.key === "buyPrice" && !pricesVisible;
          return (
            <div key={row.key} className="mt-1.5 flex items-center justify-between gap-3 border-t border-slate-200 pt-1.5 first:mt-0 first:border-t-0 first:pt-0">
              <span className="text-slate-500">{row.label}</span>
              <span className="whitespace-nowrap tabular-nums text-slate-900">{hideValue ? "••••" : money(row.oldValue)} → {hideValue ? "••••" : money(row.newValue)}</span>
            </div>
          );
        }) : <div className="text-slate-500">Ár módosítva.</div>}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] leading-snug text-slate-600 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-1.5">
        <span className="text-slate-500">Vételár</span>
        <span className="tabular-nums text-slate-900">{pricesVisible ? money(event.effective_buy_price) : "••••"}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 border-b border-slate-200 pb-1.5">
        <span className="text-slate-500">Eladási ár</span>
        <span className="tabular-nums text-slate-900">{money(event.effective_sell_price)}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-slate-500">TVA nélküli haszon</span>
        <span className="tabular-nums text-[#187876]">{pricesVisible ? priceMarkupPercentText(event.effective_buy_price, event.effective_sell_price) || "-" : "••••"}</span>
      </div>
    </div>
  );
}

function VariantHistoryPanel({
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
  useEffect(() => {
    if (!target) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [target, onClose]);

  if (!target) return null;
  const historyReloadButton = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white shadow-sm transition hover:bg-[#237f7d] disabled:cursor-not-allowed disabled:opacity-60";
  const historyCloseButton = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-400/45 bg-[#303a4c] px-3 text-xs text-white shadow-sm transition hover:bg-[#263246] disabled:cursor-not-allowed disabled:opacity-60";
  const item = { ...(target as any), ...(history?.item || {}) } as InventoryItem & Record<string, any>;
  const summary = history?.summary || {};
  const events = history?.events || [];
  const stockRows = history?.stock || [];
  const lastBuy = pricesVisible ? money(summary.lastBuyPrice ?? item.buy_price) : "••••";
  const avgBuy = pricesVisible ? money(summary.avgBuyPrice) : "••••";
  const margin = pricesVisible ? historyPercent(summary.marginWithoutTva) : "••••";
  const currentQtyText = historyQty(summary.currentQty ?? item.total_qty);
  const availableQtyText = historyQty(summary.availableQty ?? item.available_qty);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/42 backdrop-blur-[2px]">
      <div className="h-full w-full max-w-[1040px] overflow-auto border-l border-slate-200 bg-[#edf2f6] text-slate-900 shadow-2xl shadow-slate-950/30">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-[#f8fbfd]/96 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <WarehouseProductImage src={item.image_url} alt={item.title_ro || ""} thumbClassName="h-14 w-14 rounded-2xl bg-white" iconSize={18} />
              <div className="min-w-0 border-l-4 border-[#2a8d8b] pl-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#187876]">Termék History</p>
                <h2 className="mt-0.5 line-clamp-2 text-[26px] leading-tight tracking-tight text-slate-900">{item.title_ro || item.shopify_title || "Névtelen termék"}</h2>
                <p className="mt-1 text-[13px] leading-snug text-slate-600">
                  {item.brand_name || "Márka nélkül"} • {itemMainCategoryLabel(item)}{itemSubCategoryLabel(item) ? ` / ${itemSubCategoryLabel(item)}` : ""} • {displayColorName(item.color_name, item.color_code)} • {item.size || "-"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-[#8edbd7] bg-[#effbf9] px-2.5 py-1 text-[11px] text-[#187876]">Termékkód: {itemProductCode(item) || "-"}</span>
                  {visibleWarehouseBarcode(item) ? <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">Vonalkód: {visibleWarehouseBarcode(item)}</span> : null}
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600">Készlet: {currentQtyText}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className={historyReloadButton} onClick={onReload} disabled={loading} type="button"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Frissítés</button>
              <button className={historyCloseButton} onClick={onClose} type="button"><X size={15} /> Bezárás</button>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-3.5">
          {error ? <div className="rounded-2xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          {loading && !history ? <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600">Termék History betöltése...</div> : null}

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <HistoryMiniCard tone="green" label="Jelenlegi készlet" value={currentQtyText} hint={`${availableQtyText} elérhető`} />
            <HistoryMiniCard tone="green" label="Összes bejött" value={historyQty(summary.totalIncomingQty)} hint={`${historyQty(summary.totalPurchasedQty)} importból`} />
            <HistoryMiniCard tone="red" label="Összes kiment" value={historyQty(summary.totalOutgoingQty)} hint="Eladás / kivétel / leltár" />
            <HistoryMiniCard tone="blue" label="Átmozgatva" value={historyQty(summary.totalTransferredQty)} hint="Üzletek / raktár között" />
            <HistoryMiniCard tone="gold" label="Utolsó vételár" value={lastBuy} hint="Utolsó bevételezés alapján" />
            <HistoryMiniCard tone="gold" label="Átlag vételár" value={avgBuy} hint="Súlyozott import átlag" />
            <HistoryMiniCard label="Utolsó eladási ár" value={money(summary.lastSellPrice ?? item.sell_price)} hint="TVA-val" />
            <HistoryMiniCard tone="green" label="Haszonkulcs" value={margin} hint="TVA nélkül számolva" />
          </div>

          {stockRows.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
              <div className="mb-2.5 flex items-center justify-between gap-2 text-slate-800">
                <div className="flex items-center gap-2 text-sm"><Boxes size={16} /> Készlet helyenként</div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">{stockRows.length} hely</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {stockRows.map((row) => (
                  <div key={`${row.location_id || row.location_code}`} className="rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2 text-xs">
                    <div className="truncate text-slate-600">{row.location_name || row.location_code || "Hely"}</div>
                    <div className="mt-1 text-[24px] leading-none text-slate-900">{historyQty(row.qty)} <span className="text-[11px] text-slate-500">/ foglalt {historyQty(row.reserved_qty)}</span></div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/92 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#f8fbfd] px-3.5 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Termék History</p>
                <h3 className="mt-0.5 text-[18px] text-slate-900">Teljes terméktörténet</h3>
              </div>
              <span className="rounded-full border border-[#8edbd7] bg-[#effbf9] px-2.5 py-1 text-[11px] text-[#187876]">{events.length} esemény</span>
            </div>
            <div className="space-y-2.5 p-3">
              {events.map((event) => {
                const meta = historyEventMeta(event);
                const transferText = event.from_location_name || event.to_location_name
                  ? `${event.from_location_name || event.location_name || "-"} → ${event.to_location_name || event.location_name || "-"}`
                  : event.location_name || "-";
                const invoice = event.invoice_number ? `Számla: ${event.invoice_number}` : "";
                const supplier = event.supplier_name ? `Beszállító: ${event.supplier_name}` : "";
                const file = event.source_file_name ? `Forrás: ${event.source_file_name}` : "";
                const note = historyEventNote(event);
                const isPriceEvent = historyIsPriceEvent(event);
                const isTransferEvent = historyIsTransferEvent(event);
                const priceChangedFields = priceChangeRowsForHistory(event).map((row) => row.label).join(", ");
                return (
                  <div key={event.id} className={`relative overflow-hidden rounded-2xl border p-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.06)] ${meta.card}`}>
                    <span className={`absolute left-0 top-0 h-full w-1 ${meta.stripe}`} />
                    <div className="grid gap-2.5 pl-2 lg:grid-cols-[148px,1fr,188px] lg:items-start">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.10em] text-slate-400">Dátum</p>
                        <p className="mt-1 text-[13px] leading-snug text-slate-800">{historyDateTime(event.created_at)}</p>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${meta.cls}`}><span className={`h-2 w-2 rounded-full ${meta.dot}`} />{meta.label}</span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-700">{isPriceEvent ? "Ár" : historyQty(event.qty_delta, !isTransferEvent)}</span>
                          <span className="rounded-full border border-slate-200 bg-white/100 px-2.5 py-1 text-[11px] text-slate-500">{historySourceLabel(event)}</span>
                        </div>
                        <div className="mt-2 grid gap-1.5 text-[12px] leading-snug text-slate-600 sm:grid-cols-2">
                          {isPriceEvent ? (
                            <>
                              <div className="rounded-xl bg-white px-3 py-2">Módosított mező: <span className="text-slate-800">{priceChangedFields || "Ár"}</span></div>
                              <div className="rounded-xl bg-white px-3 py-2">Művelet: <span className="text-slate-800">Ár módosítás</span></div>
                            </>
                          ) : isTransferEvent ? (
                            <>
                              <div className="rounded-xl bg-white px-3 py-2">Honnan / hová: <span className="text-slate-800">{transferText}</span></div>
                              <div className="rounded-xl bg-white px-3 py-2">Áthelyezett mennyiség: <span className="text-slate-800">{historyQty(Math.abs(n(event.qty_delta)))}</span></div>
                            </>
                          ) : (
                            <>
                              <div className="rounded-xl bg-white px-3 py-2">Hely: <span className="text-slate-800">{transferText}</span></div>
                              <div className="rounded-xl bg-white px-3 py-2">Előtte / utána: <span className="text-slate-800">{historyQty(event.qty_before)} → {historyQty(event.qty_after)}</span></div>
                            </>
                          )}
                          {supplier ? <div className="rounded-xl bg-white px-3 py-2 text-slate-700">{supplier}</div> : null}
                          {invoice ? <div className="rounded-xl bg-white px-3 py-2 text-slate-700">{invoice}</div> : null}
                          {event.reception_date ? <div className="rounded-xl bg-white px-3 py-2">Receptió: <span className="text-slate-800">{dateShort(event.reception_date)}</span></div> : null}
                          {file ? <div className="truncate rounded-xl bg-white px-3 py-2 text-slate-500" title={file}>{file}</div> : null}
                        </div>
                        {note ? <p className="mt-1.5 rounded-xl bg-white/75 px-3 py-2 text-xs leading-snug text-slate-500">{note}</p> : null}
                      </div>
                      <HistoryPriceBox event={event} pricesVisible={pricesVisible} />
                    </div>
                  </div>
                );
              })}
              {!events.length && !loading ? <div className="px-4 py-8 text-center text-sm text-slate-500">Még nincs naplózott esemény ennél a terméknél.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
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

function warehouseMoveLocationLabel(loc?: Partial<MetaItem> | null) {
  const raw = String(loc?.name || loc?.code || "Hely").replace(/\s+/g, " ").trim();
  return raw || "Hely";
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
    ...splitCsv(it.supplier_source_codes),
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
    it.supplier_source_codes,
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
    const error = new Error(body?.error || `HTTP ${res.status}`) as Error & Record<string, any>;
    error.status = res.status;
    if (body && typeof body === "object") Object.assign(error, body);
    throw error;
  }
  return res.json();
}

async function apiInventory(onProgress?: (items: InventoryItem[], done: boolean) => void) {
  // Nem egy 25 000 soros szörnyválasz, és nem is 15 nehéz teljes-adatbázis lekérdezés.
  // A backend fastPage módban csak az adott lap variánsaihoz számolja ki a drágább
  // számla/import/Shopify adatokat.
  const pageSize = 2500;
  const maxRows = 30000;
  const items: InventoryItem[] = [];
  const seenVariantIds = new Set<string>();

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const qs = new URLSearchParams();
    qs.set("limit", String(pageSize));
    qs.set("offset", String(offset));
    qs.set("includeZero", "1");
    qs.set("fastPage", "1");
    qs.set("_", String(Date.now()));

    const page = await fetchJSON<{
      items: InventoryItem[];
      hasMore?: boolean;
      returned?: number;
      fastPage?: boolean;
    }>(`/api/aif/inventory?${qs.toString()}`);

    const rows = Array.isArray(page.items) ? page.items : [];
    let added = 0;
    for (const item of rows) {
      const id = selectedVariantIdFromItem(item);
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

async function apiReceptionDetail(id: string) {
  return fetchJSON<WarehouseReceptionDetail>(`/api/aif/receptions/${encodeURIComponent(id)}`);
}

async function apiVariantDetail(id: string) {
  return fetchJSON<DetailResponse>(`/api/aif/variants/${encodeURIComponent(id)}`);
}

async function apiVariantHistory(id: string) {
  const data = await fetchJSON<VariantHistoryResponse>(`/api/aif/variants/${encodeURIComponent(id)}/history?limit=700`);
  return mergeVariantHistoryPriceEvents(data);
}

async function apiVariantUpdate(id: string, payload: Record<string, unknown>) {
  return fetchJSON<{ ok: true }>(`/api/aif/variants/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiBarcodeConflictCheck(barcode: string, excludeVariantId = "") {
  const cleanBarcode = cleanScannedBarcode(barcode);
  if (!cleanBarcode) return { ok: true as const, barcode: "", conflict: null as Record<string, any> | null };
  const qs = new URLSearchParams();
  qs.set("barcode", cleanBarcode);
  if (excludeVariantId) qs.set("excludeVariantId", excludeVariantId);
  qs.set("_", String(Date.now()));
  return fetchJSON<{ ok: true; barcode: string; conflict: Record<string, any> | null }>(`/api/aif/barcode-conflict?${qs.toString()}`);
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
  options?: {
    mode?: "redistribute" | "correction";
    allowTotalChange?: boolean;
    reasonCode?: string;
    reasonText?: string;
    note?: string;
  }
) {
  return fetchJSON<{ ok: true; changed?: number; beforeTotal?: number; afterTotal?: number; totalDelta?: number; mode?: string; stock: StockItem[] }>(`/api/aif/variants/${encodeURIComponent(id)}/stock`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows,
      mode: options?.mode || "redistribute",
      allowTotalChange: Boolean(options?.allowTotalChange),
      reasonCode: options?.reasonCode || null,
      reasonText: options?.reasonText || null,
      note: options?.note || null,
    }),
  });
}

type StockTransferApiPayload = {
  title?: string;
  note?: string;
  idempotencyKey: string;
  lines: Array<{ variantId: string; fromLocationId: string; toLocationId: string; qty: number }>;
};

function createStockTransferIdempotencyKey() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `stock-transfer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function stockTransferPayloadFingerprint(payload: Omit<StockTransferApiPayload, "idempotencyKey">) {
  return JSON.stringify({
    title: String(payload.title || "").trim(),
    note: String(payload.note || "").trim(),
    lines: payload.lines.map((line) => ({
      variantId: String(line.variantId || "").trim(),
      fromLocationId: String(line.fromLocationId || "").trim(),
      toLocationId: String(line.toLocationId || "").trim(),
      qty: Number(line.qty || 0),
    })),
  });
}

type StockTransferDocumentResult = {
  preparationCreated?: boolean;
  status?: string;
  transferId?: string | null;
  documentId?: string | null;
  documentNumber?: string | null;
  documentCreatedAt?: string | null;
  documentTitle?: string | null;
  documentSubtitle?: string | null;
  document?: Record<string, any> | null;
  sourceLocationId?: string | null;
  sourceLocationName?: string | null;
  targetLocationId?: string | null;
  targetLocationName?: string | null;
  movedLines?: number;
  movedRows?: number;
  lineCount?: number;
  movedQty?: number;
  totalQty?: number;
  documentLineCount?: number;
  documentTotalQty?: number;
  documentTotalValue?: number;
  movements?: number;
  items?: any[];
};

type StockTransferApiResponse = StockTransferDocumentResult & {
  ok: true;
  duplicate?: boolean;
  idempotencyKey?: string | null;
  documentCount?: number;
  documents?: StockTransferDocumentResult[];
  requestTotalQty?: number;
  requestTotalValue?: number;
};

async function apiStockTransfer(payload: StockTransferApiPayload) {
  return fetchJSON<StockTransferApiResponse>("/api/aif/stock-transfers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": payload.idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}


type WarehouseTransferPreparationSummary = {
  id: string;
  document_number?: string | null;
  document_type?: string | null;
  status?: string | null;
  total_value?: number | string | null;
  total_qty?: number | string | null;
  line_count?: number | string | null;
  source_location_id?: string | null;
  target_location_id?: string | null;
  from_location_summary?: string | null;
  to_location_summary?: string | null;
  uit_code?: string | null;
  raw?: Record<string, any> | null;
};

type WarehouseUitWarningState = {
  documentId: string;
  documentNumber: string;
  totalValue: number;
  totalQty: number;
  addedValue: number;
  routeLabel?: string;
};

type WarehouseTransferToastState = WarehouseUitWarningState & {
  crossedThreshold: boolean;
  uitRecorded: boolean;
  documentCount?: number;
};

async function apiOpenTransferPreparations() {
  return fetchJSON<{ items?: WarehouseTransferPreparationSummary[] }>(
    `/api/aif/stock-transfer-documents?type=preparation&page=1&limit=100&_=${Date.now()}`,
  );
}

function warehousePreparationUitCode(item?: WarehouseTransferPreparationSummary | Record<string, any> | null) {
  const raw = item?.raw && typeof item.raw === "object" ? item.raw : {};
  return firstWarehouseText((item as any)?.uit_code, raw.uitCode, raw.uit_code);
}

function warehousePreparationMatchesRoute(
  item: WarehouseTransferPreparationSummary,
  fromLocationId: string,
  toLocationId: string,
  fromLocationName = "",
  toLocationName = "",
) {
  const itemFromId = firstWarehouseText(item.source_location_id, item.raw?.sourceLocationId, item.raw?.source_location_id);
  const itemToId = firstWarehouseText(item.target_location_id, item.raw?.targetLocationId, item.raw?.target_location_id);
  if (fromLocationId && toLocationId && itemFromId && itemToId) {
    return itemFromId === fromLocationId && itemToId === toLocationId;
  }

  const itemFromName = firstWarehouseText(item.from_location_summary, item.raw?.fromLocationName, item.raw?.from_location_name);
  const itemToName = firstWarehouseText(item.to_location_summary, item.raw?.toLocationName, item.raw?.to_location_name);
  return Boolean(
    fromLocationName &&
    toLocationName &&
    normalizeSearch(itemFromName) === normalizeSearch(fromLocationName) &&
    normalizeSearch(itemToName) === normalizeSearch(toLocationName)
  );
}

type SelectedVariantSelectionResponse = {
  ok?: true;
  count?: number;
  owner?: string;
  items?: PersistedSelectedWorkItem[];
  selectedVariantIds?: string[];
  actions?: Record<string, SelectedWorkAction>;
  updatedAt?: string | null;
  added?: number;
  updated?: number;
  removed?: number;
};

async function apiSelectedVariantSelection() {
  return fetchJSON<SelectedVariantSelectionResponse>(`/api/aif/selection?_=${Date.now()}`);
}

async function apiAddSelectedVariantSelection(items: Array<{ variantId: string; action?: SelectedWorkAction | null }>) {
  return fetchJSON<SelectedVariantSelectionResponse>("/api/aif/selection/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

async function apiUpdateSelectedVariantActions(items: Array<{ variantId: string; action?: SelectedWorkAction | null }>) {
  return fetchJSON<SelectedVariantSelectionResponse>("/api/aif/selection/items", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

async function apiRemoveSelectedVariantSelection(variantIds: string[]) {
  return fetchJSON<SelectedVariantSelectionResponse>("/api/aif/selection/items", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variantIds }),
  });
}

async function apiClearSelectedVariantSelection() {
  return fetchJSON<SelectedVariantSelectionResponse>("/api/aif/selection", { method: "DELETE" });
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
  const modelStatus = String(x.model_status || x.modelStatus || "active").trim().toLowerCase();
  const storedVariantStatus = String(x.variant_status || x.variantStatus || x.status || "active").trim().toLowerCase();
  // Régi importoknál a variáns gyakran már „active”, miközben a közös modell még draft.
  // Ezt nem tekintjük valódi, kézi aktiválásnak: az adatlap ilyenkor Inaktívként nyílik meg,
  // így minden méretet / színt külön kell kifejezetten Aktívra tenni.
  const variantStatus = modelStatus !== "active" && storedVariantStatus === "active" ? "inactive" : storedVariantStatus;
  return {
    titleRo: x.title_ro || "",
    titleHu: x.title_hu || "",
    descriptionRo: x.description_ro || "",
    gender: x.gender || "unisex",
    productType: x.product_type || "",
    season: x.season || "",
    material: x.material || "",
    shopifyTitle: x.shopify_title || "",
    modelStatus,
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
    variantStatus,
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

type WarehousePriceChangeRow = {
  key: "buyPrice" | "sellPrice" | "compareAtPrice";
  label: string;
  oldValue: string;
  newValue: string;
};

function priceComparableValue(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed.toFixed(4) : raw;
}

function priceDisplayValue(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw ? raw : "-";
}

function editPriceChanges(before: EditForm, after: EditForm): WarehousePriceChangeRow[] {
  const rows: WarehousePriceChangeRow[] = [];
  const add = (key: WarehousePriceChangeRow["key"], labelText: string) => {
    if (priceComparableValue(before[key]) === priceComparableValue(after[key])) return;
    rows.push({ key, label: labelText, oldValue: priceDisplayValue(before[key]), newValue: priceDisplayValue(after[key]) });
  };
  add("buyPrice", "Vételár");
  add("sellPrice", "Eladási ár");
  add("compareAtPrice", "Akció előtti ár");
  return rows;
}

function localPriceHistoryId(variantId: string) {
  return String(variantId || "").trim();
}

function readLocalPriceHistoryMap(): Record<string, VariantHistoryEvent[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(warehouseLocalPriceHistoryStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.entries(parsed).reduce<Record<string, VariantHistoryEvent[]>>((acc, [variantId, rows]) => {
      if (!variantId || !Array.isArray(rows)) return acc;
      acc[variantId] = rows.filter((row) => row && typeof row === "object") as VariantHistoryEvent[];
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function saveLocalPriceHistoryMap(map: Record<string, VariantHistoryEvent[]>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(warehouseLocalPriceHistoryStorageKey, JSON.stringify(map));
  } catch {
    // A localStorage nem kritikus. A szerveres mentés ettől még megtörtént.
  }
}

function localPriceHistoryRows(variantId: string) {
  const id = localPriceHistoryId(variantId);
  if (!id) return [] as VariantHistoryEvent[];
  return readLocalPriceHistoryMap()[id] || [];
}

function saveLocalPriceHistoryRow(variantId: string, event: VariantHistoryEvent | null) {
  const id = localPriceHistoryId(variantId);
  if (!id || !event) return;
  const map = readLocalPriceHistoryMap();
  const rows = [event, ...(map[id] || [])]
    .filter((row, index, all) => row?.id && all.findIndex((x) => x.id === row.id) === index)
    .sort((a, b) => dateTimeMs(b.created_at) - dateTimeMs(a.created_at))
    .slice(0, 80);
  map[id] = rows;
  saveLocalPriceHistoryMap(map);
}

function buildLocalPriceHistoryEvent(variantId: string, item: Record<string, any> | null | undefined, before: EditForm, after: EditForm): VariantHistoryEvent | null {
  const changes = editPriceChanges(before, after);
  if (!changes.length) return null;
  const createdAt = new Date().toISOString();
  return {
    id: `local-price-${variantId}-${Date.now()}`,
    created_at: createdAt,
    event_type: "price",
    direction: "adjust",
    movement_type: "price_change",
    source_type: "warehouse_price_edit",
    source_id: `warehouse_price_edit:${variantId}:${Date.now()}`,
    qty_delta: null,
    qty_before: null,
    qty_after: null,
    actor: "Felhasználó",
    location_name: null,
    old_buy_price: before.buyPrice || null,
    new_buy_price: after.buyPrice || null,
    old_sell_price: before.sellPrice || null,
    new_sell_price: after.sellPrice || null,
    old_compare_at_price: before.compareAtPrice || null,
    new_compare_at_price: after.compareAtPrice || null,
    effective_buy_price: after.buyPrice || null,
    effective_sell_price: after.sellPrice || null,
    price_change_fields: changes.map((row) => row.label),
    local_only: true,
    raw: {
      title: "Árváltozás",
      reason: "warehouse_price_edit",
      productTitle: firstWarehouseText(item?.title_ro, item?.shopify_title, item?.title_hu),
      priceChanges: changes,
    },
  };
}

function withLocalPriceHistory(history: VariantHistoryResponse | null, variantId: string): VariantHistoryResponse {
  const localRows = localPriceHistoryRows(variantId);
  const base = history || {};
  const combined = dedupeVariantHistoryEvents([...(base.events || []), ...localRows])
    .sort((a, b) => dateTimeMs(b.created_at) - dateTimeMs(a.created_at));
  return { ...base, events: combined };
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
  const [genderFilters, setGenderFilters] = useState<string[]>([]);
  const [sizeFilters, setSizeFilters] = useState<string[]>([]);
  const [color, setColor] = useState("all");
  const [colorFilterOpen, setColorFilterOpen] = useState(false);
  const colorFilterRef = useRef<HTMLDivElement | null>(null);
  const [location, setLocation] = useState("all");
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [invoiceDetailTarget, setInvoiceDetailTarget] = useState<WarehouseInvoiceFilterOption | null>(null);
  const [invoiceDetailRows, setInvoiceDetailRows] = useState<WarehouseReceptionDetail[]>([]);
  const [invoiceDetailBusy, setInvoiceDetailBusy] = useState(false);
  const [invoiceDetailError, setInvoiceDetailError] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [shopifyFilter, setShopifyFilter] = useState<ShopifyFilter>("all");
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
  const [duplicateSkuOpen, setDuplicateSkuOpen] = useState(false);
  const [barcodeReturnNotice, setBarcodeReturnNotice] = useState<WarehouseBarcodeReturnTarget | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [edit, setEdit] = useState<EditForm>(emptyForm());
  const [editBaseline, setEditBaseline] = useState<EditForm>(emptyForm());
  const [detailCloseConfirmOpen, setDetailCloseConfirmOpen] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProductForm>(() => emptyNewProductForm());
  const [newProductStockRows, setNewProductStockRows] = useState<Record<string, string>>({});
  const [newProductSaving, setNewProductSaving] = useState(false);
  const [newProductBarcodeConflict, setNewProductBarcodeConflict] = useState<WarehouseBarcodeConflictInfo | null>(null);
  const [editBarcodeConflict, setEditBarcodeConflict] = useState<WarehouseBarcodeConflictInfo | null>(null);
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
  const [bulkProductDeleteTarget, setBulkProductDeleteTarget] = useState<{ ids: string[]; items: InventoryItem[]; context: "warehouse" | "incoming" } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<InventoryItem | null>(null);
  const [variantHistory, setVariantHistory] = useState<VariantHistoryResponse | null>(null);
  const [variantHistoryBusy, setVariantHistoryBusy] = useState(false);
  const [variantHistoryError, setVariantHistoryError] = useState("");
  const [stockEditorTarget, setStockEditorTarget] = useState<InventoryItem | null>(null);
  const [stockEditorRows, setStockEditorRows] = useState<Record<string, string>>({});
  const [stockEditorSaving, setStockEditorSaving] = useState(false);
  const [stockEditorAllowTotalChange, setStockEditorAllowTotalChange] = useState(false);
  const [stockEditorReasonCode, setStockEditorReasonCode] = useState("");
  const [stockEditorReasonText, setStockEditorReasonText] = useState("");
  const [stockEditorNote, setStockEditorNote] = useState("");
  const [stockEditorWarning, setStockEditorWarning] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, boolean>>({});
  const [incomingSelectedVariants, setIncomingSelectedVariants] = useState<Record<string, boolean>>({});
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(false);
  const [selectedWorkActions, setSelectedWorkActions] = useState<Record<string, SelectedWorkAction>>({});
  const [persistedSelectedItems, setPersistedSelectedItems] = useState<InventoryItem[]>([]);
  const [selectedActionTargets, setSelectedActionTargets] = useState<InventoryItem[]>([]);
  const [selectedWorkPanel, setSelectedWorkPanel] = useState<SelectedWorkAction | null>(null);
  const [shopifyExportModalOpen, setShopifyExportModalOpen] = useState(false);
  const [shopifyExportItems, setShopifyExportItems] = useState<InventoryItem[]>([]);
  const [shopifySyncCenterOpen, setShopifySyncCenterOpen] = useState(false);
  const [purchaseOrderWorkRows, setPurchaseOrderWorkRows] = useState<Record<string, PurchaseOrderWorkDraftRow>>({});
  const [purchaseOrderTargetLocationId, setPurchaseOrderTargetLocationId] = useState("");
  const [purchaseOrderWorkSaving, setPurchaseOrderWorkSaving] = useState(false);
  const [openPurchaseOrdersByVariant, setOpenPurchaseOrdersByVariant] = useState<Record<string, OpenPurchaseOrderBadgeInfo>>({});
  const purchaseOrderWorkSubmitLockRef = useRef(false);
  const purchaseOrderWorkIdempotencyKeyRef = useRef("");
  const [stockMoveRows, setStockMoveRows] = useState<Record<string, StockTransferDraftRow>>({});
  const [stockMoveNote, setStockMoveNote] = useState("");
  const [stockMoveDocumentTitle, setStockMoveDocumentTitle] = useState("Aviz intern de transfer stoc");
  const [stockMoveBulkFrom, setStockMoveBulkFrom] = useState("");
  const [stockMoveBulkTo, setStockMoveBulkTo] = useState("");
  const [stockMoveConfirmOpen, setStockMoveConfirmOpen] = useState(false);
  const [stockMoveSaving, setStockMoveSaving] = useState(false);
  const stockMoveSubmitLockRef = useRef(false);
  const stockMoveIdempotencyKeyRef = useRef("");
  const stockMovePayloadFingerprintRef = useRef("");
  const [openTransferPreparations, setOpenTransferPreparations] = useState<WarehouseTransferPreparationSummary[]>([]);
  const [openTransferPreparationsBusy, setOpenTransferPreparationsBusy] = useState(false);
  const [openTransferPreparationsLoaded, setOpenTransferPreparationsLoaded] = useState(false);
  const [warehouseUitWarning, setWarehouseUitWarning] = useState<WarehouseUitWarningState | null>(null);
  const [warehouseUitSuppressChecked, setWarehouseUitSuppressChecked] = useState(false);
  const [warehouseTransferToast, setWarehouseTransferToast] = useState<WarehouseTransferToastState | null>(null);
  const warehouseTransferToastTimerRef = useRef<number | null>(null);
  const [labelComposerOpen, setLabelComposerOpen] = useState(false);
  const [labelPrintMode, setLabelPrintMode] = useState<WarehouseLabelPrintMode>(() => readWarehouseLabelPrintMode());
  const [labelCopies, setLabelCopies] = useState<Record<string, string>>({});
  const [labelWidth, setLabelWidth] = useState("40");
  const [labelHeight, setLabelHeight] = useState("46");
  const [labelCols, setLabelCols] = useState("5");
  const [labelRows, setLabelRows] = useState("6");
  const [labelMarginX, setLabelMarginX] = useState("5");
  const [labelMarginY, setLabelMarginY] = useState("5");
  const [labelShowBorder, setLabelShowBorder] = useState(false);
  const [labelCompanyName, setLabelCompanyName] = useState(WAREHOUSE_LABEL_COMPANY);
  const [labelCurrency, setLabelCurrency] = useState("RON");
  const [labelUnitText, setLabelUnitText] = useState("RON");
  const [labelContent, setLabelContent] = useState<Record<WarehouseLabelContentKey, boolean>>(WAREHOUSE_LABEL_DEFAULT_CONTENT);
  const [labelTemplateName, setLabelTemplateName] = useState("Standard 40x46");
  const [labelTemplates, setLabelTemplates] = useState<WarehouseLabelTemplate[]>(() => readWarehouseLabelTemplates());
  const labelPreviewFrameRef = useRef<HTMLDivElement | null>(null);
  const [labelPreviewScale, setLabelPreviewScale] = useState(0.58);
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
  const selectedMutationCountRef = useRef(0);
  const selectedMutationSequenceRef = useRef(0);
  const selectedFetchSequenceRef = useRef(0);
  const [pendingProductJumpId, setPendingProductJumpId] = useState("");
  const [highlightProductId, setHighlightProductId] = useState("");
  const [incomingFocus, setIncomingFocus] = useState<{ batchId: string; variantIds: string[]; rows: Array<Record<string, any>>; batch?: Record<string, any> | null; totalQty?: number; sourceFileName?: string | null; mode?: "import" | "activation" } | null>(null);
  const [incomingFocusItems, setIncomingFocusItems] = useState<InventoryItem[]>([]);
  const productListRef = useRef<HTMLElement | null>(null);
  const detailReturnAnchorRef = useRef<WarehouseDetailReturnAnchor | null>(null);
  const stockEditorReturnAnchorRef = useRef<WarehouseDetailReturnAnchor | null>(null);
  const selectionReturnAnchorRef = useRef<WarehouseDetailReturnAnchor | null>(null);
  const lastSelectionVariantIdRef = useRef("");
  const pendingProductJumpViewportTopRef = useRef<number | null>(null);
  const pendingProductJumpCandidateIdsRef = useRef<string[]>([]);
  const pendingProductJumpFallbackRef = useRef<{ productPage: number; scrollY: number } | null>(null);

  const refreshOpenTransferPreparations = useCallback(async () => {
    setOpenTransferPreparationsBusy(true);
    try {
      const result = await apiOpenTransferPreparations();
      const rows = (result.items || []).filter((item) => {
        const status = String(item.status || "").trim().toLowerCase();
        const type = String(item.document_type || item.raw?.documentType || item.raw?.document_type || "internal_transfer").trim().toLowerCase();
        return status === "preparation" && type === "internal_transfer";
      });
      setOpenTransferPreparations(rows);
      setOpenTransferPreparationsLoaded(true);
      return rows;
    } catch {
      setOpenTransferPreparationsLoaded(false);
      return [] as WarehouseTransferPreparationSummary[];
    } finally {
      setOpenTransferPreparationsBusy(false);
    }
  }, []);

  const closeWarehouseUitWarning = useCallback(() => {
    if (warehouseUitWarning && warehouseUitSuppressChecked) {
      suppressWarehouseUitWarning(warehouseUitWarning.documentId, warehouseUitWarning.documentNumber);
    }
    setWarehouseUitWarning(null);
    setWarehouseUitSuppressChecked(false);
  }, [warehouseUitSuppressChecked, warehouseUitWarning]);

  useEffect(() => {
    if (!warehouseUitWarning) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      closeWarehouseUitWarning();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closeWarehouseUitWarning, warehouseUitWarning]);

  useEffect(() => () => {
    if (warehouseTransferToastTimerRef.current !== null) {
      window.clearTimeout(warehouseTransferToastTimerRef.current);
      warehouseTransferToastTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const stockEditorMoveOpen = Boolean(stockEditorTarget && !stockEditorAllowTotalChange);
    if (selectedWorkPanel !== "move" && !stockEditorMoveOpen) return;
    void refreshOpenTransferPreparations();
  }, [refreshOpenTransferPreparations, selectedWorkPanel, stockEditorAllowTotalChange, stockEditorTarget?.variant_id]);

  const loadOpenPurchaseOrderState = useCallback(async () => {
    try {
      setOpenPurchaseOrdersByVariant(await fetchOpenPurchaseOrderVariantMap());
    } catch {
      // A raktárlista ettől még használható; a jelzés a következő fókusznál újrapróbálkozik.
    }
  }, []);

  const incomingFocusVariantIdsKey = useMemo(() => (incomingFocus?.variantIds || []).join("|"), [incomingFocus]);
  const incomingFocusVariantSet = useMemo(() => new Set(incomingFocus?.variantIds || []), [incomingFocusVariantIdsKey]);

  useEffect(() => {
    setIncomingSelectedVariants({});
  }, [incomingFocus?.batchId]);

  useEffect(() => {
    void loadOpenPurchaseOrderState();
    if (typeof window === "undefined") return;
    const refreshOrders = () => void loadOpenPurchaseOrderState();
    const onStorage = (event: StorageEvent) => {
      if (event.key === purchaseOrdersChangedStorageKey) refreshOrders();
    };
    window.addEventListener(purchaseOrdersChangedEventName, refreshOrders as EventListener);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshOrders);
    return () => {
      window.removeEventListener(purchaseOrdersChangedEventName, refreshOrders as EventListener);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshOrders);
    };
  }, [loadOpenPurchaseOrderState]);

  const inventoryDisplayItems = useMemo(() => {
    const baseItems = items.filter((item) => !isArchivedInventoryItem(item));
    const focusedItems = incomingFocusItems.filter((item) => !isArchivedInventoryItem(item));
    return focusedItems.length ? mergeInventoryItems(baseItems, focusedItems).filter((item) => !isArchivedInventoryItem(item)) : baseItems;
  }, [items, incomingFocusItems]);

  const duplicateSkuGroups = useMemo(() => {
    const groups = new Map<string, { sku: string; items: InventoryItem[] }>();
    for (const item of inventoryDisplayItems) {
      const sku = cleanScannedBarcode(firstWarehouseText(item.barcode, (item as any).display_barcode));
      if (!sku || /^AIF[-_]/i.test(sku)) continue;
      const key = sku.toLowerCase();
      const current = groups.get(key) || { sku, items: [] };
      if (!current.items.some((row) => selectedVariantIdFromItem(row) === selectedVariantIdFromItem(item))) {
        current.items.push(item);
      }
      groups.set(key, current);
    }
    return Array.from(groups.values())
      .filter((group) => group.items.length > 1)
      .sort((a, b) => b.items.length - a.items.length || a.sku.localeCompare(b.sku, "hu", { numeric: true, sensitivity: "base" }));
  }, [inventoryDisplayItems]);

  const duplicateSkuVariantCount = useMemo(
    () => duplicateSkuGroups.reduce((sum, group) => sum + group.items.length, 0),
    [duplicateSkuGroups],
  );

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

  async function loadIncomingFocusBatch(
    batchId: string,
    showMessage = true,
    mode: "import" | "activation" = "import",
    options: { silentFailure?: boolean } = {},
  ) {
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
      if (!options.silentFailure) {
        setIncomingFocus(null);
        setIncomingFocusItems([]);
        setMessage(error?.message || "Az utolsó bevételezés terméksorait nem sikerült betölteni.");
      }
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
    setIncomingSelectedVariants((current) => {
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


  function applyIncomingMovementFocus(
    focus: WarehouseIncomingMovementFocus,
    showMessage = true,
    mode: "import" | "activation" = "import",
  ) {
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
      mode,
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

  async function focusLatestCommittedImportBatch(options: { preserveCurrentFilters?: boolean } = {}) {
    const focusMode: "import" | "activation" = options.preserveCurrentFilters ? "import" : "activation";
    setBusy(true);
    setRecentImportFocusBusy(true);
    setMessage("");
    try {
      if (options.preserveCurrentFilters) {
        // A szűrőmezőből indítva a már beállított beszállító / márka / kategória
        // szűrések megmaradnak, és ezekkel együtt szűkíthető a legutóbbi bevételezés.
        setIncomingFocus(null);
        setIncomingFocusItems([]);
        setIncomingSelectedVariants({});
        setProductPage(1);
      } else {
        // A fejléc és a terméklista gyorsgombja továbbra is önálló munkanézetet nyit.
        resetWarehouseFilters(false);
        setFiltersOpen(false);
        setSummaryOpen(false);
      }
      setSortMode("incoming_desc");
      setListOpen(true);
      await load();

      // A legutóbbi bevételezést az importcsomagok committed_at dátuma dönti el.
      // A mozgásnapló csak tartalék forrás. Korábban ez fordítva volt, ezért egy
      // törölt/összevont régi variáns mozgása vagy egy idegen UUID-s bejövő sor
      // képes volt elrabolni a „Legutóbb bevételezett” szűrőt.
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
        const batchId = String(batch?.id || "").trim();
        if (!batchId || !isUuidLike(batchId)) continue;
        const loaded = await loadIncomingFocusBatch(batchId, false, focusMode, { silentFailure: true });
        if (!loaded || (!loaded.variantIds.length && !loaded.rows.length)) continue;
        const totalQty = Number(loaded.totalQty || 0);
        const batchDate = warehouseDateLabel(batch.committed_at || batch.created_at);
        setMessage(`Utolsó bevételezés aktív${batchDate ? ` (${batchDate})` : ""}: ${loaded.rows.length || loaded.variantIds.length} import sor, ${loaded.variantIds.length} raktári variáns${totalQty ? `, ${totalQty} db` : ""}. A lista kizárólag a legutóbb készletre vett import termékeit mutatja.`);
        return;
      }

      // Csak akkor nyúlunk a mozgásnaplóhoz, ha nincs elérhető committed importcsomag
      // vagy a hozzá tartozó előzményt már ténylegesen törölték.
      const movementFocus = await latestIncomingMovementFocus().catch(() => null);
      if (movementFocus) {
        applyIncomingMovementFocus(movementFocus, true, focusMode);
        return;
      }

      setIncomingFocus(null);
      setIncomingFocusItems([]);
      setMessage("Nincs készletre vett import vagy importhoz tartozó bejövő készletmozgás, amit meg tudnék mutatni.");
    } catch (error: any) {
      setMessage(error?.message || "A legutóbbi bevételezés betöltése nem sikerült.");
    } finally {
      setRecentImportFocusBusy(false);
      setBusy(false);
    }
  }

  function clearLatestIncomingFilter(showMessage = true) {
    setIncomingFocus(null);
    setIncomingFocusItems([]);
    setIncomingSelectedVariants({});
    setProductPage(1);
    setListOpen(true);
    if (showMessage) {
      setMessage("Legutóbb bevételezett szűrő törölve. A többi beállított szűrő megmaradt.");
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
    rememberStockEditorReturnAnchor(item.variant_id);
    const rows = stockRowsForVariant(item.variant_id);
    const next: Record<string, string> = {};
    for (const loc of stockLocationRows) {
      const row = stockForLocation(rows, loc);
      next[locationKey(loc)] = String(n(row?.qty));
    }
    setStockEditorTarget(item);
    setStockEditorRows(next);
    setStockEditorAllowTotalChange(false);
    setStockEditorReasonCode("");
    setStockEditorReasonText("");
    setStockEditorNote("");
    setStockEditorWarning("");
  }

  async function openProductHistory(item: InventoryItem) {
    const id = String(item.variant_id || (item as any).id || "").trim();
    if (!id) return;
    setHistoryTarget(item);
    setVariantHistory(null);
    setVariantHistoryError("");
    setVariantHistoryBusy(true);
    try {
      const data = await apiVariantHistory(id);
      setVariantHistory(withLocalPriceHistory(mergeVariantHistoryPriceEvents(data), id));
    } catch (error: any) {
      setVariantHistoryError(error?.message || "A Termék History betöltése nem sikerült.");
    } finally {
      setVariantHistoryBusy(false);
    }
  }

  async function reloadProductHistory() {
    if (!historyTarget) return;
    await openProductHistory(historyTarget);
  }

  function resetStockEditorState() {
    setStockEditorTarget(null);
    setStockEditorRows({});
    setStockEditorAllowTotalChange(false);
    setStockEditorReasonCode("");
    setStockEditorReasonText("");
    setStockEditorNote("");
    setStockEditorWarning("");
  }

  function finishCloseStockEditor(options: { restorePosition?: boolean } = {}) {
    resetStockEditorState();
    if (options.restorePosition !== false) {
      window.requestAnimationFrame(() => restoreStockEditorReturnPosition());
    }
  }

  function closeStockEditor() {
    if (stockEditorSaving) return;
    finishCloseStockEditor();
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

  function stockEditorCorrectionReasonValid() {
    if (!stockEditorAllowTotalChange || stockEditorTotalDelta() === 0) return true;
    if (!stockEditorReasonCode) return false;
    if (stockEditorReasonCode === "other" && !stockEditorReasonText.trim()) return false;
    return true;
  }

  function stockEditorCanSave() {
    if (!stockEditorAllowTotalChange && stockEditorTotalDelta() !== 0) return false;
    return stockEditorCorrectionReasonValid();
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
      const qty = Math.min(donor.qty, receiver.qty);
      if (qty > 0) {
        lines.push({
          variantId: String(stockEditorTarget.variant_id),
          fromLocationId: String(donor.loc.id || ""),
          toLocationId: String(receiver.loc.id || ""),
          qty,
        });
        donor.qty -= qty;
        receiver.qty -= qty;
      }
      if (donor.qty <= 0) donorIndex += 1;
      if (receiver.qty <= 0) receiverIndex += 1;
    }
    const remainder = donors.reduce((sum, row) => sum + row.qty, 0) + receivers.reduce((sum, row) => sum + row.qty, 0);
    if (remainder > 0) throw new Error("A készletáthelyezés forrás- és célmennyisége nem egyezik.");
    return lines;
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
    if (stockEditorAllowTotalChange && totalDelta !== 0 && !stockEditorReasonCode) {
      setStockEditorWarning("A készletkorrekció okának kiválasztása kötelező. Ez kerül be a Készletmozgások naplójába.");
      return;
    }
    if (stockEditorAllowTotalChange && totalDelta !== 0 && stockEditorReasonCode === "other" && !stockEditorReasonText.trim()) {
      setStockEditorWarning("Az Egyéb korrekció okát szövegesen is add meg.");
      return;
    }

    setStockEditorSaving(true);
    setMessage("");
    // Egy korábbi értesítés nem használható a most induló mentés eredményeként.
    if (warehouseTransferToastTimerRef.current !== null) {
      window.clearTimeout(warehouseTransferToastTimerRef.current);
      warehouseTransferToastTimerRef.current = null;
    }
    setWarehouseTransferToast(null);
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
      let preparationNumber = "";
      let transferResult: Awaited<ReturnType<typeof apiStockTransfer>> | null = null;
      let transferAddedValue = 0;
      if (stockEditorAllowTotalChange) {
        await apiVariantStockUpdate(changedVariantId, rows, {
          mode: "correction",
          allowTotalChange: true,
          reasonCode: stockEditorReasonCode,
          reasonText: stockEditorReasonText.trim(),
          note: stockEditorNote.trim(),
        });
        notifyStockMovesChanged({ variantId: changedVariantId, source: "warehouse_stock_correction" });
      } else {
        const transferLines = stockEditorTransferLines();
        if (!transferLines.length) {
          setMessage("Nem változott a készlet elosztása, ezért nem került új sor az előkészítésbe.");
          finishCloseStockEditor();
          return;
        }
        transferAddedValue = transferLines.reduce((sum, line) => sum + line.qty * (priceNumber(stockEditorTarget.sell_price) || 0), 0);
        transferResult = await apiStockTransfer({
          title: "Aviz intern de transfer stoc",
          note: stockEditorNote.trim(),
          idempotencyKey: createStockTransferIdempotencyKey(),
          lines: transferLines,
        });
        preparationNumber = (transferResult.documents || [])
          .map((entry) => String(entry.documentNumber || entry.transferId || "").trim())
          .filter(Boolean)
          .join(", ") || String(transferResult.documentNumber || transferResult.transferId || "");
        handleWarehouseStockTransferResult(transferResult, transferAddedValue);
        notifyStockMovesChanged({ variantId: changedVariantId, source: "warehouse_transfer_preparation", transferId: transferResult.transferId, documentId: transferResult.documentId });
      }
      await load();
      if (detail?.item?.id && String(detail.item.id) === String(stockEditorTarget.variant_id)) {
        const d = await apiVariantDetail(stockEditorTarget.variant_id);
        setDetail(d);
        setEdit(formFromDetail(d));
      }
      setMessage(stockEditorAllowTotalChange
        ? `Készletkorrekció mentve. Teljes változás: ${totalDelta > 0 ? "+" : ""}${totalDelta} db.`
        : `Készlet áthelyezve és hozzáadva a ${preparationNumber || "nyitott PV"} előkészítéshez. A teljes darabszám nem változott.`);
      finishCloseStockEditor();
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

  const genderFilterOptions = useMemo<WarehouseMultiSelectOption[]>(() => {
    return genderTypes
      .filter((row) => row.is_active !== false)
      .slice()
      .sort((a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code), "hu", { sensitivity: "base" }))
      .map((row) => ({ value: String(row.code), label: String(row.name || row.code) }));
  }, [genderTypes]);

  const sizeFilterOptions = useMemo<WarehouseMultiSelectOption[]>(() => {
    const rows = new Map<string, WarehouseMultiSelectOption>();
    const add = (value: unknown, labelValue?: unknown, hint?: string) => {
      const raw = String(value ?? "").trim();
      if (!raw) return;
      const normalized = officialSizeFromTypes(raw, sizeTypes) || raw.toUpperCase();
      const key = normalizeSearch(normalized);
      if (!key || rows.has(key)) return;
      rows.set(key, { value: normalized, label: String(labelValue || normalized), hint });
    };
    sizeTypes.filter((row) => row.is_active !== false).forEach((row) => add(row.name || row.code, sizeTypeLabel(row), row.code && row.code !== row.name ? row.code : undefined));
    inventoryDisplayItems.forEach((item) => add(item.size));
    return Array.from(rows.values()).sort((a, b) => a.label.localeCompare(b.label, "hu", { numeric: true, sensitivity: "base" }));
  }, [sizeTypes, inventoryDisplayItems]);

  const invoiceFilterOptions = useMemo<WarehouseInvoiceFilterOption[]>(() => {
    const map = new Map<string, {
      invoiceNumber: string;
      supplierId?: string | null;
      supplierCode?: string | null;
      supplierName: string;
      supplierKeys: Set<string>;
      invoiceDate?: string | null;
      receptionDate?: string | null;
      importedAt?: string | null;
      dateMs: number;
      variantIds: Set<string>;
      receptionIds: Set<string>;
      batchIds: Set<string>;
      locationNames: Set<string>;
      currencyCodes: Set<string>;
      sourceFileNames: Set<string>;
      items: Map<string, InventoryItem>;
    }>();

    let sourceItems = [...inventoryDisplayItems];
    if (selectedSupplier) {
      const selectedKeys = new Set([selectedSupplier.id, selectedSupplier.code, selectedSupplier.name].map(normalizeSearch).filter(Boolean));
      sourceItems = sourceItems.filter((item) => inventorySupplierEntries(item).some((entry) => [entry.id, entry.code, entry.name].map(normalizeSearch).some((key) => selectedKeys.has(key))));
    }
    if (brand !== "all") sourceItems = sourceItems.filter((item) => (item.brand_code || item.brand_name || "") === brand || item.brand_name === brand);

    const addInvoice = (item: InventoryItem, invoiceNumber: string, historyRow?: ReturnType<typeof inventoryInvoiceHistory>[number] | null) => {
      const cleanInvoice = String(invoiceNumber || "").trim();
      if (!cleanInvoice) return;
      const supplierInfo = invoiceSupplierInfo(item, historyRow || null);
      if (selectedSupplier) {
        const selectedKeys = new Set([selectedSupplier.id, selectedSupplier.code, selectedSupplier.name].map(normalizeSearch).filter(Boolean));
        const directHistorySupplierKeys = [
          historyRow?.supplierId,
          historyRow?.supplierCode,
          historyRow?.supplierName,
        ].map(normalizeSearch).filter(Boolean);

        if (directHistorySupplierKeys.length) {
          // A számla saját beszállítóadata az elsődleges. Egy termék idővel több
          // beszállítóhoz is kapcsolódhat, de ettől a Mayo Chix számla még nem
          // válhat 4F számlává. A termékszintű kapcsolatok itt nem írhatják felül
          // a receptió / számla konkrét beszállítóját.
          if (!directHistorySupplierKeys.some((key) => selectedKeys.has(key))) return;
        } else {
          const itemSupplierRows = inventorySupplierEntries(item);
          const matchingItemSuppliers = itemSupplierRows.filter((entry) =>
            [entry.id, entry.code, entry.name].map(normalizeSearch).some((key) => selectedKeys.has(key))
          );
          if (!matchingItemSuppliers.length) return;
          // Régi, beszállító nélküli számlaelőzménynél több termékszintű
          // beszállító esetén nem találgatunk. Inkább kihagyjuk az ambivalens sort,
          // mint hogy idegen számlát mutassunk a kiválasztott forgalmazó alatt.
          if (itemSupplierRows.length > 1) return;
        }
      }
      const receptionId = String(historyRow?.receptionId || "").trim();
      const batchId = String(historyRow?.batchId || "").trim();
      const dateIdentity = String(historyRow?.invoiceDate || historyRow?.receptionDate || "").slice(0, 10);
      const supplierKey = supplierInfo.keys[0] || normalizeSearch(supplierInfo.name) || "supplier_unknown";
      const key = receptionId
        ? `reception:${receptionId}`
        : `invoice:${supplierKey}:${normalizeSearch(cleanInvoice)}:${dateIdentity}`;
      const dateMs = Math.max(
        dateTimeMs(historyRow?.receptionDate),
        dateTimeMs(historyRow?.invoiceDate),
        dateTimeMs(historyRow?.importedAt),
        dateTimeMs(item.last_reception_date),
        dateTimeMs(item.last_invoice_date),
        latestWarehouseIncomingMs(item),
      );
      const current = map.get(key) || {
        invoiceNumber: cleanInvoice,
        supplierId: supplierInfo.id,
        supplierCode: supplierInfo.code,
        supplierName: supplierInfo.name,
        supplierKeys: new Set<string>(),
        invoiceDate: historyRow?.invoiceDate || item.last_invoice_date || null,
        receptionDate: historyRow?.receptionDate || item.last_reception_date || null,
        importedAt: historyRow?.importedAt || item.last_incoming_at || null,
        dateMs,
        variantIds: new Set<string>(),
        receptionIds: new Set<string>(),
        batchIds: new Set<string>(),
        locationNames: new Set<string>(),
        currencyCodes: new Set<string>(),
        sourceFileNames: new Set<string>(),
        items: new Map<string, InventoryItem>(),
      };
      supplierInfo.keys.forEach((value) => current.supplierKeys.add(value));
      if (!current.supplierName || current.supplierName === "Beszállító nélkül") current.supplierName = supplierInfo.name;
      if (dateMs > current.dateMs) {
        current.dateMs = dateMs;
        current.invoiceDate = historyRow?.invoiceDate || current.invoiceDate;
        current.receptionDate = historyRow?.receptionDate || current.receptionDate;
        current.importedAt = historyRow?.importedAt || current.importedAt;
      }
      const variantId = String(item.variant_id || "").trim();
      if (variantId) {
        current.variantIds.add(variantId);
        current.items.set(variantId, item);
      }
      if (receptionId) current.receptionIds.add(receptionId);
      if (batchId) current.batchIds.add(batchId);
      const locationName = String(historyRow?.locationName || "").trim();
      if (locationName) current.locationNames.add(locationName);
      const currencyCode = String(historyRow?.currencyCode || "").trim();
      if (currencyCode) current.currencyCodes.add(currencyCode);
      const sourceFileName = String(historyRow?.sourceFileName || "").trim();
      if (sourceFileName) current.sourceFileNames.add(sourceFileName);
      map.set(key, current);
    };

    for (const item of sourceItems) {
      const history = inventoryInvoiceHistory(item);
      if (history.length) {
        history.forEach((row) => addInvoice(item, row.invoiceNumber, row));
      } else {
        inventoryInvoiceNumbers(item).forEach((invoiceNumber) => addInvoice(item, invoiceNumber, null));
      }
    }

    return Array.from(map.entries())
      .map(([value, row]) => {
        const count = row.variantIds.size;
        const dateLabel = warehouseDateLabel(row.invoiceDate || row.receptionDate || row.importedAt);
        return {
          value,
          invoiceNumber: row.invoiceNumber,
          supplierId: row.supplierId || null,
          supplierCode: row.supplierCode || null,
          supplierName: row.supplierName || "Beszállító nélkül",
          supplierKeys: Array.from(row.supplierKeys),
          invoiceDate: row.invoiceDate || null,
          receptionDate: row.receptionDate || null,
          importedAt: row.importedAt || null,
          dateMs: row.dateMs,
          count,
          variantIds: Array.from(row.variantIds),
          receptionIds: Array.from(row.receptionIds),
          batchIds: Array.from(row.batchIds),
          locationNames: Array.from(row.locationNames),
          currencyCodes: Array.from(row.currencyCodes),
          sourceFileNames: Array.from(row.sourceFileNames),
          items: Array.from(row.items.values()),
          displayLabel: `${row.invoiceNumber}${dateLabel ? ` • ${dateLabel}` : ""} • ${count} variáns`,
        } satisfies WarehouseInvoiceFilterOption;
      })
      .sort((a, b) => b.dateMs - a.dateMs || a.invoiceNumber.localeCompare(b.invoiceNumber, "hu", { numeric: true, sensitivity: "base" }));
  }, [inventoryDisplayItems, supplier, brand, selectedSupplier]);

  const selectedInvoiceFilterOption = useMemo(
    () => invoiceFilter === "all" ? null : invoiceFilterOptions.find((option) => option.value === invoiceFilter) || null,
    [invoiceFilter, invoiceFilterOptions],
  );


  useEffect(() => {
    if (brand === "all") return;
    const current = normalizeSearch(brand);
    const valid = brandOptions.some((b) => [b.id, b.code, b.name].map(normalizeSearch).some((x) => x === current));
    if (!valid) setBrand("all");
  }, [brand, brandOptions]);

  useEffect(() => {
    if (invoiceFilter === "all") return;
    if (!invoiceFilterOptions.some((option) => option.value === invoiceFilter)) setInvoiceFilter("all");
  }, [invoiceFilter, invoiceFilterOptions]);

  async function loadInvoiceDetail(option: WarehouseInvoiceFilterOption) {
    setInvoiceDetailTarget(option);
    setInvoiceDetailRows([]);
    setInvoiceDetailError("");
    const receptionIds = Array.from(new Set(option.receptionIds.map((value) => String(value || "").trim()).filter(Boolean)));
    if (!receptionIds.length) {
      setInvoiceDetailBusy(false);
      setInvoiceDetailError("Ehhez a régi számlaadathoz nincs receptióazonosító. A raktári terméklistát megmutatom, de a teljes receptiófej nem tölthető be.");
      return;
    }
    setInvoiceDetailBusy(true);
    try {
      const details = await Promise.all(receptionIds.map((id) => apiReceptionDetail(id)));
      setInvoiceDetailRows(details);
    } catch (error: any) {
      setInvoiceDetailError(error?.message || "A számla részleteinek betöltése nem sikerült.");
    } finally {
      setInvoiceDetailBusy(false);
    }
  }

  async function reloadInvoiceDetail() {
    if (!invoiceDetailTarget) return;
    await loadInvoiceDetail(invoiceDetailTarget);
  }

  function closeInvoiceDetail() {
    setInvoiceDetailTarget(null);
    setInvoiceDetailRows([]);
    setInvoiceDetailError("");
  }

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

  const colorCodeForItem = (item: Partial<InventoryItem> | Record<string, any>) => {
    return firstWarehouseText(item.color_code, (item as any).supplier_color_code, (item as any).supplierColorCode);
  };

  const brandColorForItem = (item: Partial<InventoryItem> | Record<string, any>) => {
    const code = colorCodeForItem(item);
    const codeKey = colorKey(code);
    if (!codeKey) return null;
    const brandRow = metaItemByValue(brands, (item as any).brand_id || item.brand_code || item.brand_name || (item as any).brand);
    const brandKeys = [
      (item as any).brand_id,
      item.brand_code,
      item.brand_name,
      (item as any).brand,
      brandRow?.id,
      brandRow?.code,
      brandRow?.name,
      brandRow?.name_ro,
      brandRow?.name_hu,
    ].map(normalizeSearch).filter(Boolean);
    const sameCodeRows = (brandColorCodes || []).filter((row) => colorKey(row.color_code) === codeKey);
    if (!sameCodeRows.length) return null;
    const byBrand = sameCodeRows.find((row) => {
      const rowKeys = [row.brand_id, row.brand_code, row.brand_name].map(normalizeSearch).filter(Boolean);
      return rowKeys.some((key) => brandKeys.includes(key));
    });
    if (byBrand) return byBrand;
    return brandKeys.length ? null : (sameCodeRows.length === 1 ? sameCodeRows[0] : null);
  };

  const standardColorTypeForItem = (item: Partial<InventoryItem> | Record<string, any>) => {
    const visibleColorName = colorDisplay(item.color_name, item.color_code);
    const mappedBrandColor = brandColorForItem(item);
    return findColorTypeByValue(colorTypes, visibleColorName)
      || colorTypeForItem(item)
      || findColorTypeByValue(colorTypes, mappedBrandColor?.color_type_id)
      || findColorTypeByValue(colorTypes, mappedBrandColor?.color_type_code)
      || findColorTypeByValue(colorTypes, mappedBrandColor?.color_name_ro)
      || findColorTypeByValue(colorTypes, mappedBrandColor?.color_name_hu);
  };

  const colorHexForItem = (item: Partial<InventoryItem> | Record<string, any>) => {
    const standardColorType = standardColorTypeForItem(item);
    const mappedBrandColor = brandColorForItem(item);
    return String(standardColorType?.hex || mappedBrandColor?.color_hex || item.color_hex || "").trim();
  };

  function MaskedBuyPrice({ value }: { value: unknown }) {
    const text = money(value);
    if (text === "-") return <span>-</span>;
    if (buyPricesVisible) return <span>{text}</span>;
    return <span className="inline-block select-none rounded-md bg-white/10 px-2 py-0.5 text-white/65 blur-[3px]" title="Vételár homályosítva">{text}</span>;
  }

  function SellPriceWithMarkup({ sellPrice, buyPrice, openUp = false }: { sellPrice: unknown; buyPrice: unknown; openUp?: boolean }) {
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const [tooltipOpen, setTooltipOpen] = useState(false);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const percentText = buyPricesVisible ? priceMarkupPercentText(buyPrice, sellPrice) : "";
    const buy = priceNumber(buyPrice);
    const sellGross = priceNumber(sellPrice);
    const sellNet = sellPriceWithoutTva(sellPrice);
    const canShowTooltip = buyPricesVisible && buy !== null && sellGross !== null && sellNet !== null;

    function updateTooltipPosition() {
      if (typeof window === "undefined") return;
      const node = tooltipRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const tooltipWidth = 252;
      const sidePadding = 12;
      const left = Math.min(
        Math.max(sidePadding, rect.left + rect.width / 2 - tooltipWidth / 2),
        Math.max(sidePadding, window.innerWidth - tooltipWidth - sidePadding)
      );
      const shouldOpenUp = openUp || rect.bottom + 168 > window.innerHeight;
      setTooltipStyle({
        position: "fixed",
        left,
        top: shouldOpenUp ? rect.top - 8 : rect.bottom + 8,
        transform: shouldOpenUp ? "translateY(-100%)" : "none",
        width: tooltipWidth,
      });
    }

    function showTooltip() {
      if (!canShowTooltip) return;
      updateTooltipPosition();
      setTooltipOpen(true);
    }

    useEffect(() => {
      if (!tooltipOpen) return;
      updateTooltipPosition();
      const onMove = () => updateTooltipPosition();
      window.addEventListener("scroll", onMove, true);
      window.addEventListener("resize", onMove);
      return () => {
        window.removeEventListener("scroll", onMove, true);
        window.removeEventListener("resize", onMove);
      };
    }, [tooltipOpen, openUp, canShowTooltip]);

    const tooltip = canShowTooltip && tooltipOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none z-[9999] rounded-xl border border-[#5bd0cc]/30 bg-[#202838] px-3 py-2 text-left text-[11px] leading-snug text-white shadow-2xl shadow-black/35"
            style={tooltipStyle}
            role="tooltip"
          >
            <span className="block text-[#cffffd]">Árképzés</span>
            <span className="mt-2 block space-y-1">
              <span className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-2 py-1"><span className="text-white/62">Vételi ár:</span><span className="tabular-nums text-white">{money(buy)}</span></span>
              <span className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-2 py-1"><span className="text-white/62">Eladási ár TVA nélkül:</span><span className="tabular-nums text-white">{money(sellNet)}</span></span>
              <span className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-2 py-1"><span className="text-white/62">Eladási ár TVA-val:</span><span className="tabular-nums text-white">{money(sellGross)}</span></span>
              <span className="flex items-center justify-between gap-3 rounded-lg bg-[#2a8d8b]/18 px-2 py-1"><span className="text-[#cffffd]">Haszonkulcs TVA nélkül:</span><span className="tabular-nums font-semibold text-white">{percentText || "-"}</span></span>
            </span>
          </div>,
          document.body
        )
      : null;

    return (
      <div
        ref={tooltipRef}
        className="relative inline-block leading-tight"
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={showTooltip}
        onBlur={() => setTooltipOpen(false)}
        tabIndex={canShowTooltip ? 0 : undefined}
      >
        <div>{money(sellPrice)}</div>
        {percentText && <div className="mt-0.5 text-[10px] font-semibold text-[#cffffd]" title="Haszonkulcs TVA nélkül">{percentText}</div>}
        {tooltip}
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
    const tooltipRef = useRef<HTMLSpanElement | null>(null);
    const [tooltipOpen, setTooltipOpen] = useState(false);
    const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
    const code = colorCodeForItem(item);
    const label = colorDisplay(item.color_name, item.color_code);
    const hex = colorHexForItem(item);
    const standardColor = standardColorTypeForItem(item);
    const brandColor = brandColorForItem(item);
    const standardName = firstWarehouseText(
      standardColor?.name_hu,
      standardColor?.name_ro,
      standardColor?.name_en,
      standardColor?.name_de,
      brandColor?.color_name_hu,
      brandColor?.color_name_ro,
      label,
    );
    const fullName = firstWarehouseText(
      label,
      standardColor?.name_hu,
      standardColor?.name_ro,
      brandColor?.color_name_hu,
      brandColor?.color_name_ro,
      code,
    );
    const officialNames = [
      standardColor?.name_hu ? `HU: ${standardColor.name_hu}` : "",
      standardColor?.name_ro ? `RO: ${standardColor.name_ro}` : "",
      standardColor?.name_en ? `EN: ${standardColor.name_en}` : "",
      standardColor?.name_de ? `DE: ${standardColor.name_de}` : "",
    ].filter(Boolean).join(" • ");
    const brandColorText = brandColor
      ? `${brandColor.brand_name || brandColor.brand_code || item.brand_name || item.brand_code || "Márka"} / ${brandColor.color_code || code} → ${brandColor.color_name_hu || brandColor.color_name_ro || brandColor.color_type_code || standardName || "-"}`
      : "Nincs márkához rendelve";

    function updateTooltipPosition() {
      if (typeof window === "undefined") return;
      const node = tooltipRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const tooltipWidth = 326;
      const sidePadding = 12;
      const left = Math.min(
        Math.max(sidePadding, rect.left + rect.width / 2 - tooltipWidth / 2),
        Math.max(sidePadding, window.innerWidth - tooltipWidth - sidePadding)
      );
      const shouldOpenUp = openUp || rect.bottom + 178 > window.innerHeight;
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

    useEffect(() => {
      if (!tooltipOpen) return;
      updateTooltipPosition();
      const onMove = () => updateTooltipPosition();
      window.addEventListener("scroll", onMove, true);
      window.addEventListener("resize", onMove);
      return () => {
        window.removeEventListener("scroll", onMove, true);
        window.removeEventListener("resize", onMove);
      };
    }, [tooltipOpen, openUp, fullName, code, standardColor?.id, brandColor?.id]);

    const tooltip = tooltipOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none z-[9999] rounded-xl border border-[#5bd0cc]/30 bg-[#202838] p-2.5 text-left text-[11px] leading-snug text-white shadow-2xl shadow-black/40"
            style={tooltipStyle}
            role="tooltip"
          >
            <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-2">
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-white/30 bg-white/10 shadow-[0_0_0_2px_rgba(255,255,255,0.04)]"
                style={hex ? { backgroundColor: hex } : undefined}
              />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.12em] text-[#cffffd]/70">Szín részletek</div>
                <div className="truncate text-[12px] text-white">{fullName || "-"}</div>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-[112px,1fr] overflow-hidden rounded-lg bg-white/[0.06]">
                <div className="px-2 py-1.5 text-white/58">Teljes név</div>
                <div className="px-2 py-1.5 text-white">{fullName || "-"}</div>
              </div>
              <div className="grid grid-cols-[112px,1fr] overflow-hidden rounded-lg bg-white/[0.06]">
                <div className="px-2 py-1.5 text-white/58">Színkód</div>
                <div className="px-2 py-1.5 text-white">{code || "-"}</div>
              </div>
              <div className="grid grid-cols-[112px,1fr] overflow-hidden rounded-lg bg-white/[0.06]">
                <div className="px-2 py-1.5 text-white/58">Standard szín</div>
                <div className="px-2 py-1.5">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${standardColor ? "border-[#7bd7d4]/45 bg-[#2a8d8b]/24 text-[#cffffd]" : "border-white/12 bg-white/[0.05] text-white/55"}`}>
                    {standardColor ? "Igen" : "Nem"}
                  </span>
                  {standardColor ? <span className="ml-2 text-white/78">{standardName}{standardColor.code ? ` • ${standardColor.code}` : ""}</span> : null}
                </div>
              </div>
              <div className="grid grid-cols-[112px,1fr] overflow-hidden rounded-lg bg-white/[0.06]">
                <div className="px-2 py-1.5 text-white/58">Márka szín</div>
                <div className="px-2 py-1.5">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${brandColor ? "border-[#7bd7d4]/45 bg-[#2a8d8b]/24 text-[#cffffd]" : "border-white/12 bg-white/[0.05] text-white/55"}`}>
                    {brandColor ? "Igen" : "Nem"}
                  </span>
                  <span className="ml-2 text-white/78">{brandColorText}</span>
                </div>
              </div>
              {officialNames ? (
                <div className="rounded-lg bg-[#2a8d8b]/12 px-2 py-1.5 text-[10px] leading-snug text-[#cffffd]/82">
                  {officialNames}
                </div>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null;

    return (
      <span
        ref={tooltipRef}
        className="relative inline-flex max-w-full items-center justify-center gap-1.5 rounded-full border border-[#5bd0cc]/35 bg-[#203f49] px-2 py-1 text-[11px] font-semibold leading-none text-[#cffffd] shadow-[0_0_0_1px_rgba(42,141,139,0.10)] align-middle"
        tabIndex={0}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={showTooltip}
        onBlur={() => setTooltipOpen(false)}
      >
        <span
          className="h-3 w-3 shrink-0 rounded-full border border-white/30 bg-white/10 shadow-[0_0_0_2px_rgba(255,255,255,0.03)]"
          style={hex ? { backgroundColor: hex } : undefined}
        />
        <span className="min-w-0 max-w-[86px] truncate">{label}</span>
        {tooltip}
      </span>
    );
  }

  const normalizeColor = (value: unknown) => officialColorFromTypes(value, colorTypes);
  const normalizeSize = (value: unknown) => officialSizeFromTypes(value, sizeTypes);

  const detailHasChanges = useMemo(() => Boolean(detail?.item?.id) && !editFormsEqual(edit, editBaseline), [detail?.item?.id, edit, editBaseline]);
  const detailSaveButtonClass = detailHasChanges ? primaryBtn : btnSoft;

  function closeDetailImmediately(options: { restoreListPosition?: boolean } = {}) {
    setDetailCloseConfirmOpen(false);
    setDetail(null);
    setDetailBusy(false);
    setEdit(emptyForm());
    setEditBaseline(emptyForm());
    setEditBarcodeConflict(null);
    if (options.restoreListPosition !== false) {
      window.requestAnimationFrame(() => restoreDetailReturnPosition());
    }
  }

  function discardDetailChangesAndClose() {
    if (saving || detailBusy) return;
    closeDetailImmediately();
    setMessage("A módosítások mentés nélkül eldobva.");
  }

  function requestCloseDetail() {
    if (!detail) return;
    if (saving || detailBusy) return;
    if (detailHasChanges) {
      setDetailCloseConfirmOpen(true);
      return;
    }
    closeDetailImmediately();
  }

  async function saveDetailAndClose() {
    const ok = await saveDetail({ closeAfterSave: true });
    if (ok) setDetailCloseConfirmOpen(false);
  }

  useEffect(() => {
    if (!detail) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (barcodeScanner || saving || detailBusy) return;
      event.preventDefault();
      event.stopPropagation();
      if (detailCloseConfirmOpen) {
        setDetailCloseConfirmOpen(false);
        return;
      }
      requestCloseDetail();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [detail, detailHasChanges, detailCloseConfirmOpen, barcodeScanner, saving, detailBusy]);

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
    const inactiveMode = stockFilter === "inactive";
    const explicitSearchMode = Boolean(search.trim());
    if (incomingFocus?.batchId) {
      // A szűrőből megnyitott „Legutóbb bevételezett” nézet történeti lista:
      // minden, az adott bevételezéshez tartozó variáns látható marad, az aktív is.
      // Csak a külön aktiválási munkanézet tünteti el a már elkészült sorokat.
      out = out.filter((x) => incomingFocusVariantSet.has(String(x.variant_id || "")));
      if (incomingFocus.mode === "activation") {
        out = out.filter(needsWarehouseActivation);
      }
    } else if (!reviewMode && !inactiveMode && stockFilter !== "missing" && !explicitSearchMode) {
      // Alaphelyzetben a kész raktárlista aktív termékeket mutat.
      // Kereséskor viszont a teljes terméktörzsben keresünk, különben egy 0 készletes
      // inaktív vonalkód úgy eltűnne, mintha nem is létezne.
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
    if (genderFilters.length) out = out.filter((x) => itemMatchesGenderSelections(x, genderFilters, genderTypes));
    if (sizeFilters.length) out = out.filter((x) => itemMatchesSizeSelections(x, sizeFilters, sizeTypes));
    if (color !== "all") out = out.filter((x) => itemMatchesColorSelection(x, color, colorTypes));
    if (imageFilter === "with") out = out.filter((x) => Boolean(x.image_url));
    if (imageFilter === "missing") out = out.filter((x) => !x.image_url);
    if (shopifyFilter === "mapped") out = out.filter((x) => isShopifyMappedItem(x));
    if (shopifyFilter === "recent_mapped") out = out.filter((x) => isShopifyMappedItem(x) && shopifyConnectionMs(x) > 0);
    if (shopifyFilter === "exported") out = out.filter((x) => isShopifyExportPending(x));
    if (shopifyFilter === "unmapped") out = out.filter((x) => !isShopifyMappedItem(x) && !isShopifyExportPending(x));
    if (shopifyFilter === "error") out = out.filter((x) => warehouseShopifyHasAnyIssue(x));
    if (location !== "all") {
      out = out.filter((x) => (stockMap.get(x.variant_id) || []).some((s) => (s.location_code === location || s.location_name === location) && n(s.qty) > 0));
    }
    if (invoiceFilter !== "all") out = out.filter((x) => itemMatchesInvoiceOption(x, selectedInvoiceFilterOption));
    if (stockFilter === "available") out = out.filter((x) => n(x.available_qty) > 0);
    if (stockFilter === "out") out = out.filter((x) => n(x.total_qty) <= 0);
    if (stockFilter === "reserved") out = out.filter((x) => n(x.total_reserved_qty) > 0);
    if (stockFilter === "missing") out = out.filter(hasMissingData);
    if (stockFilter === "inactive") out = out.filter(needsWarehouseActivation);
    if (stockFilter === "watch") out = out.filter((x) => n(x.total_qty) > 0 && needsWarehouseActivation(x));
    out.sort((a, b) => {
      const effectiveSortMode = shopifyFilter === "recent_mapped" ? "shopify_connected_desc" : sortMode;
      if (effectiveSortMode === "incoming_desc") {
        if (incomingFocus?.mode === "activation") {
          const byActivation = Number(needsWarehouseActivation(b)) - Number(needsWarehouseActivation(a));
          if (byActivation !== 0) return byActivation;
        }
        const byIncoming = latestWarehouseIncomingMs(b) - latestWarehouseIncomingMs(a);
        if (byIncoming !== 0) return byIncoming;
        return compareWarehouseVariantPresentation(a, b);
      }
      if (effectiveSortMode === "incoming_asc") {
        const aIncoming = firstWarehouseIncomingMs(a);
        const bIncoming = firstWarehouseIncomingMs(b);
        if (!aIncoming && bIncoming) return 1;
        if (aIncoming && !bIncoming) return -1;
        if (aIncoming !== bIncoming) return aIncoming - bIncoming;
        return compareWarehouseVariantPresentation(a, b);
      }
      if (effectiveSortMode === "shopify_connected_desc") {
        const byConnection = shopifyConnectionMs(b) - shopifyConnectionMs(a);
        if (byConnection !== 0) return byConnection;
        return compareWarehouseVariantPresentation(a, b);
      }
      if (effectiveSortMode === "brand") {
        const byBrand = String(a.brand_name || "").localeCompare(String(b.brand_name || ""), "hu", { numeric: true, sensitivity: "base" });
        if (byBrand !== 0) return byBrand;
        return compareWarehouseVariantPresentation(a, b);
      }
      if (effectiveSortMode === "stock_desc") {
        const byStock = n(b.total_qty) - n(a.total_qty);
        return byStock !== 0 ? byStock : compareWarehouseVariantPresentation(a, b);
      }
      if (effectiveSortMode === "stock_asc") {
        const byStock = n(a.total_qty) - n(b.total_qty);
        return byStock !== 0 ? byStock : compareWarehouseVariantPresentation(a, b);
      }
      if (effectiveSortMode === "value_desc") {
        const byValue = n(b.total_qty) * n(b.buy_price) - n(a.total_qty) * n(a.buy_price);
        return byValue !== 0 ? byValue : compareWarehouseVariantPresentation(a, b);
      }
      if (effectiveSortMode === "missing") {
        const byMissing = Number(hasMissingData(b)) - Number(hasMissingData(a));
        return byMissing !== 0 ? byMissing : compareWarehouseVariantPresentation(a, b);
      }
      return compareWarehouseVariantPresentation(a, b);
    });
    return out;
  }, [inventoryDisplayItems, incomingFocus?.batchId, incomingFocus?.mode, incomingFocusVariantIdsKey, search, snCodFilter, scannedBarcodeSearch, supplier, brand, category, subCategory, categorySelectOptions, subCategories, genderFilters, genderTypes, sizeFilters, sizeTypes, color, colorTypes, location, invoiceFilter, selectedInvoiceFilterOption, stockFilter, imageFilter, shopifyFilter, sortMode, stockMap]);

  function resetWarehouseFilters(showMessage = true) {
    setSearch("");
    setSnCodFilter("");
    setScannedBarcodeSearch("");
    setSupplier("all");
    setBrand("all");
    setCategory("all");
    setSubCategory("all");
    setGenderFilters([]);
    setSizeFilters([]);
    setColor("all");
    setColorFilterOpen(false);
    setLocation("all");
    setInvoiceFilter("all");
    setStockFilter("all");
    setImageFilter("all");
    setShopifyFilter("all");
    setSortMode("name");
    setIncomingFocus(null);
    setIncomingFocusItems([]);
    setIncomingSelectedVariants({});
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
    if (genderFilters.length) labels.push(`Nem: ${genderFilters.map((value) => genderLabel(value, genderTypes)).join(" + ")}`);
    if (sizeFilters.length) labels.push(`Méret: ${sizeFilters.join(" + ")}`);
    if (color !== "all") labels.push(`Szín: ${labelForMetaValue(colorTypes as any, color)}`);
    if (location !== "all") labels.push(`Célhely: ${labelForMetaValue(locations, location)}`);
    if (invoiceFilter !== "all") labels.push(`Számla: ${selectedInvoiceFilterOption?.invoiceNumber || invoiceFilter}`);
    if (stockFilter !== "all") {
      const stockLabels: Record<StockFilter, string> = {
        all: "Összes",
        available: "Készleten",
        out: "Nincs készleten",
        reserved: "Van foglalás",
        missing: "Hiányzó adat",
        inactive: "Inaktív termékek",
        watch: "Aktiválandó készlet",
      };
      labels.push(`Készlet: ${stockLabels[stockFilter] || stockFilter}`);
    }
    if (imageFilter !== "all") {
      labels.push(`Kép: ${imageFilter === "missing" ? "Hiányzik kép" : "Van kép"}`);
    }
    if (shopifyFilter !== "all") {
      const shopifyLabels: Record<ShopifyFilter, string> = {
        all: "Összes",
        mapped: "Shopifyhoz kapcsolva",
        recent_mapped: "Legutóbb összekapcsolt",
        exported: "Exportálva, párosításra vár",
        unmapped: "Nincs Shopifyon",
        error: "Shopify / export hiba",
      };
      labels.push(`Shopify: ${shopifyLabels[shopifyFilter]}`);
    }
    if (incomingFocus?.batchId) {
      labels.push(`Utolsó bevételezés: ${incomingFocus.rows.length} sor / ${incomingFocus.variantIds.length} variáns`);
    }
    return labels;
  }, [search, snCodFilter, supplier, brand, category, subCategory, genderFilters, sizeFilters, color, location, invoiceFilter, selectedInvoiceFilterOption, stockFilter, imageFilter, shopifyFilter, suppliers, brands, categories, subCategories, genderTypes, colorTypes, locations, incomingFocus]);

  const hasActiveWarehouseFilters = activeWarehouseFilterLabels.length > 0;

  function barcodeConflictInfoFromInventoryItem(item: InventoryItem, barcode: string): WarehouseBarcodeConflictInfo {
    return {
      barcode: cleanScannedBarcode(barcode || item.barcode || ""),
      conflictVariantId: selectedVariantIdFromItem(item),
      title: firstWarehouseText(item.title_ro, item.shopify_title) || null,
      modelCode: firstWarehouseText(item.model_code) || null,
      brand: firstWarehouseText(item.brand_name, item.brand_code) || null,
      color: firstWarehouseText(item.color_name, item.color_code) || null,
      size: firstWarehouseText(item.size) || null,
    };
  }

  const newProductBarcodeMatches = useMemo(() => {
    if (!newProductOpen) return [] as InventoryItem[];
    const code = cleanScannedBarcode(newProduct.barcode);
    if (!code) return [] as InventoryItem[];
    const key = normalizeSearch(code);
    return items
      .filter((item) => normalizeSearch(cleanScannedBarcode(item.barcode || "")) === key)
      .slice(0, 4);
  }, [newProductOpen, newProduct.barcode, items]);

  const editBarcodeMatches = useMemo(() => {
    const currentVariantId = String(detail?.item?.id || detail?.item?.variant_id || "").trim();
    const code = cleanScannedBarcode(edit.barcode);
    if (!currentVariantId || !code) return [] as InventoryItem[];
    const key = normalizeSearch(code);
    return items
      .filter((item) => selectedVariantIdFromItem(item) !== currentVariantId)
      .filter((item) => normalizeSearch(cleanScannedBarcode(item.barcode || "")) === key)
      .slice(0, 4);
  }, [detail?.item?.id, detail?.item?.variant_id, edit.barcode, items]);

  const effectiveNewProductBarcodeConflict = useMemo(
    () => newProductBarcodeConflict || (newProductBarcodeMatches[0] ? barcodeConflictInfoFromInventoryItem(newProductBarcodeMatches[0], newProduct.barcode) : null),
    [newProductBarcodeConflict, newProductBarcodeMatches, newProduct.barcode],
  );

  const effectiveEditBarcodeConflict = useMemo(
    () => editBarcodeConflict || (editBarcodeMatches[0] ? barcodeConflictInfoFromInventoryItem(editBarcodeMatches[0], edit.barcode) : null),
    [editBarcodeConflict, editBarcodeMatches, edit.barcode],
  );

  useEffect(() => {
    if (!newProductOpen) {
      setNewProductBarcodeConflict(null);
      return;
    }
    const barcode = cleanScannedBarcode(newProduct.barcode);
    if (!barcode) {
      setNewProductBarcodeConflict(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void apiBarcodeConflictCheck(barcode)
        .then((result) => {
          if (cancelled) return;
          setNewProductBarcodeConflict(result.conflict ? barcodeConflictInfoFromApi({ barcode: result.barcode, conflict: result.conflict }) : null);
        })
        .catch(() => {
          // A mentés előtt újra ellenőrizzük a DB-t. Egy pillanatnyi hálózati hiba
          // ne tegye használhatatlanná a termékfelvételi modalt.
        });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [newProductOpen, newProduct.barcode]);

  useEffect(() => {
    const currentVariantId = String(detail?.item?.id || detail?.item?.variant_id || "").trim();
    if (!currentVariantId) {
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
          // A tényleges mentés előtt ugyanaz a szerveres ellenőrzés újra lefut.
        });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [detail?.item?.id, detail?.item?.variant_id, edit.barcode]);

  const totalProductPages = Math.max(1, Math.ceil(filtered.length / productPageSize));
  const safeProductPage = Math.min(productPage, totalProductPages);
  const productPageStartIndex = filtered.length ? (safeProductPage - 1) * productPageSize + 1 : 0;
  const productPageEndIndex = Math.min(safeProductPage * productPageSize, filtered.length);

  const productPageItems = useMemo(() => {
    const start = (safeProductPage - 1) * productPageSize;
    return filtered.slice(start, start + productPageSize);
  }, [filtered, safeProductPage, productPageSize]);

  const filteredVariantIds = useMemo(() => {
    const sourceItems = incomingFocus?.batchId ? filtered : productPageItems;
    return sourceItems.map((x) => String(x.variant_id || "")).filter(Boolean);
  }, [incomingFocus?.batchId, filtered, productPageItems]);

  useEffect(() => {
    setProductPage(1);
  }, [search, snCodFilter, scannedBarcodeSearch, supplier, brand, category, subCategory, genderFilters, sizeFilters, color, location, invoiceFilter, stockFilter, imageFilter, shopifyFilter, sortMode, incomingFocusVariantIdsKey]);

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

  function currentWarehouseFilterSnapshot(): WarehouseFilterSnapshot {
    return {
      search,
      snCodFilter,
      scannedBarcodeSearch,
      supplier,
      brand,
      category,
      subCategory,
      genderFilters: [...genderFilters],
      sizeFilters: [...sizeFilters],
      color,
      location,
      invoiceFilter,
      stockFilter,
      imageFilter,
      shopifyFilter,
      sortMode,
      filtersOpen,
      summaryOpen,
      listOpen,
      productPageSize,
    };
  }

  function restoreWarehouseFilterSnapshot(snapshot: WarehouseFilterSnapshot) {
    setSearch(snapshot.search);
    setSnCodFilter(snapshot.snCodFilter);
    setScannedBarcodeSearch(snapshot.scannedBarcodeSearch);
    setSupplier(snapshot.supplier);
    setBrand(snapshot.brand);
    setCategory(snapshot.category);
    setSubCategory(snapshot.subCategory);
    setGenderFilters([...(snapshot.genderFilters || [])]);
    setSizeFilters([...(snapshot.sizeFilters || [])]);
    setColor(snapshot.color);
    setColorFilterOpen(false);
    setLocation(snapshot.location);
    setInvoiceFilter(snapshot.invoiceFilter || "all");
    setStockFilter(snapshot.stockFilter);
    setImageFilter(snapshot.imageFilter);
    setShopifyFilter(snapshot.shopifyFilter);
    setSortMode(snapshot.sortMode);
    setFiltersOpen(snapshot.filtersOpen);
    setSummaryOpen(snapshot.summaryOpen);
    setListOpen(true);
    setProductPageSize(snapshot.productPageSize || WAREHOUSE_PRODUCTS_PER_PAGE);
  }

  function rememberDetailReturnAnchor(variantId: unknown) {
    const id = String(variantId || "").trim();
    if (!id || typeof window === "undefined") return;
    const index = filtered.findIndex((item) => String(item.variant_id || "") === id);
    const node = findVisibleProductNode(id);
    const rowViewportTop = node ? node.getBoundingClientRect().top : null;
    detailReturnAnchorRef.current = {
      variantId: id,
      nextVariantId: index >= 0 ? String(filtered[index + 1]?.variant_id || "") || null : null,
      previousVariantId: index > 0 ? String(filtered[index - 1]?.variant_id || "") || null : null,
      productPage: safeProductPage,
      scrollY: window.scrollY,
      rowViewportTop: typeof rowViewportTop === "number" && Number.isFinite(rowViewportTop) ? rowViewportTop : null,
      filters: currentWarehouseFilterSnapshot(),
    };
  }

  function restoreDetailReturnPosition(options: { preferNext?: boolean } = {}) {
    const anchor = detailReturnAnchorRef.current;
    if (!anchor || typeof window === "undefined") return;
    detailReturnAnchorRef.current = null;

    // Az adatlap nem jogosult átírni a munkanézetet. Ugyanazokat a szűrőket,
    // rendezést és oldalméretet állítjuk vissza, amelyekből a terméket megnyitották.
    restoreWarehouseFilterSnapshot(anchor.filters);
    setProductPage(Math.max(1, anchor.productPage || 1));

    const candidates = (options.preferNext
      ? [anchor.nextVariantId, anchor.variantId, anchor.previousVariantId]
      : [anchor.variantId, anchor.nextVariantId, anchor.previousVariantId])
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (candidates.length) {
      pendingProductJumpCandidateIdsRef.current = Array.from(new Set(candidates));
      pendingProductJumpFallbackRef.current = { productPage: Math.max(1, anchor.productPage || 1), scrollY: Math.max(0, anchor.scrollY || 0) };
      pendingProductJumpViewportTopRef.current = typeof anchor.rowViewportTop === "number" && Number.isFinite(anchor.rowViewportTop)
        ? anchor.rowViewportTop
        : null;
      setListOpen(true);
      setPendingProductJumpId(candidates[0]);
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: Math.max(0, anchor.scrollY || 0), behavior: "auto" });
    });
  }

  function rememberStockEditorReturnAnchor(variantId: unknown) {
    const id = String(variantId || "").trim();
    if (!id || typeof window === "undefined") return;
    const index = filtered.findIndex((item) => String(item.variant_id || "") === id);
    const node = findVisibleProductNode(id);
    const rowViewportTop = node ? node.getBoundingClientRect().top : null;
    stockEditorReturnAnchorRef.current = {
      variantId: id,
      nextVariantId: index >= 0 ? String(filtered[index + 1]?.variant_id || "") || null : null,
      previousVariantId: index > 0 ? String(filtered[index - 1]?.variant_id || "") || null : null,
      productPage: safeProductPage,
      scrollY: window.scrollY,
      rowViewportTop: typeof rowViewportTop === "number" && Number.isFinite(rowViewportTop) ? rowViewportTop : null,
      filters: currentWarehouseFilterSnapshot(),
    };
  }

  function restoreStockEditorReturnPosition() {
    const anchor = stockEditorReturnAnchorRef.current;
    if (!anchor || typeof window === "undefined") return;
    stockEditorReturnAnchorRef.current = null;

    restoreWarehouseFilterSnapshot(anchor.filters);
    setProductPage(Math.max(1, anchor.productPage || 1));

    const candidates = [anchor.variantId, anchor.nextVariantId, anchor.previousVariantId]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (candidates.length) {
      pendingProductJumpCandidateIdsRef.current = Array.from(new Set(candidates));
      pendingProductJumpFallbackRef.current = {
        productPage: Math.max(1, anchor.productPage || 1),
        scrollY: Math.max(0, anchor.scrollY || 0),
      };
      pendingProductJumpViewportTopRef.current =
        typeof anchor.rowViewportTop === "number" && Number.isFinite(anchor.rowViewportTop)
          ? anchor.rowViewportTop
          : null;
      setListOpen(true);
      setHighlightProductId(candidates[0]);
      setPendingProductJumpId(candidates[0]);
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: Math.max(0, anchor.scrollY || 0), behavior: "auto" });
    });
  }

  function rememberSelectionReturnAnchor(variantId: unknown) {
    const id = String(variantId || "").trim();
    if (!id || typeof window === "undefined") return;
    lastSelectionVariantIdRef.current = id;
    const index = filtered.findIndex((item) => String(item.variant_id || "") === id);
    const node = findVisibleProductNode(id);
    const rowViewportTop = node ? node.getBoundingClientRect().top : null;
    selectionReturnAnchorRef.current = {
      variantId: id,
      nextVariantId: index >= 0 ? String(filtered[index + 1]?.variant_id || "") || null : null,
      previousVariantId: index > 0 ? String(filtered[index - 1]?.variant_id || "") || null : null,
      productPage: safeProductPage,
      scrollY: window.scrollY,
      rowViewportTop: typeof rowViewportTop === "number" && Number.isFinite(rowViewportTop) ? rowViewportTop : null,
      filters: currentWarehouseFilterSnapshot(),
    };
  }

  function restoreSelectionReturnPosition() {
    if (typeof window === "undefined") return;
    const anchor = selectionReturnAnchorRef.current;
    selectionReturnAnchorRef.current = null;
    const fallbackId = String(lastSelectionVariantIdRef.current || "").trim();

    if (!anchor) {
      if (fallbackId) queueProductRowJump(fallbackId);
      return;
    }

    restoreWarehouseFilterSnapshot(anchor.filters);
    setProductPage(Math.max(1, anchor.productPage || 1));

    const candidates = [anchor.variantId, anchor.nextVariantId, anchor.previousVariantId]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (candidates.length) {
      pendingProductJumpCandidateIdsRef.current = Array.from(new Set(candidates));
      pendingProductJumpFallbackRef.current = {
        productPage: Math.max(1, anchor.productPage || 1),
        scrollY: Math.max(0, anchor.scrollY || 0),
      };
      pendingProductJumpViewportTopRef.current =
        typeof anchor.rowViewportTop === "number" && Number.isFinite(anchor.rowViewportTop)
          ? anchor.rowViewportTop
          : null;
      setListOpen(true);
      setHighlightProductId(candidates[0]);
      setPendingProductJumpId(candidates[0]);
      return;
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: Math.max(0, anchor.scrollY || 0), behavior: "auto" });
    });
  }

  function closeSelectedWorkflowAndReturn() {
    setSelectedActionTargets([]);
    setShopifyExportModalOpen(false);
    setSelectedWorkPanel(null);
    setSelectedPanelOpen(false);
    window.requestAnimationFrame(() => restoreSelectionReturnPosition());
  }

  function queueProductRowJump(variantId: unknown, options: { viewportTop?: number | null } = {}) {
    const id = String(variantId || "").trim();
    if (!id) return;
    pendingProductJumpCandidateIdsRef.current = [id];
    pendingProductJumpFallbackRef.current = null;
    pendingProductJumpViewportTopRef.current = typeof options.viewportTop === "number" && Number.isFinite(options.viewportTop) ? options.viewportTop : null;
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
    setGenderFilters([]);
    setSizeFilters([]);
    setColor("all");
    setColorFilterOpen(false);
    setLocation("all");
    setInvoiceFilter("all");
    setStockFilter("all");
    setImageFilter("all");
    setShopifyFilter("all");
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
    const requestedId = String(pendingProductJumpId || "").trim();
    if (!requestedId) return;
    if (!listOpen) {
      setListOpen(true);
      return;
    }

    const candidateIds = pendingProductJumpCandidateIdsRef.current.length
      ? pendingProductJumpCandidateIdsRef.current
      : [requestedId];
    const targetId = candidateIds.find((candidateId) =>
      filtered.some((item) => String(item.variant_id || "") === candidateId)
    );

    // Szűrő-visszaállításkor lehet egy köztes render a régi listával. Nem adjuk fel,
    // hanem megvárjuk, míg az eredeti munkanézet újraszámolódik. Ha abban sincs már
    // következő sor, visszatérünk ugyanarra az oldal- és görgetési pozícióra.
    if (!targetId) {
      const fallback = pendingProductJumpFallbackRef.current;
      if (!fallback) return;
      const fallbackTimer = window.setTimeout(() => {
        pendingProductJumpCandidateIdsRef.current = [];
        pendingProductJumpFallbackRef.current = null;
        pendingProductJumpViewportTopRef.current = null;
        setPendingProductJumpId("");
        setHighlightProductId("");
        setProductPage(fallback.productPage);
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: fallback.scrollY, behavior: "auto" });
        });
      }, 220);
      return () => window.clearTimeout(fallbackTimer);
    }

    const targetIndex = filtered.findIndex((item) => String(item.variant_id || "") === targetId);
    if (targetIndex < 0) return;

    const targetPage = Math.max(1, Math.floor(targetIndex / productPageSize) + 1);
    if (targetPage !== safeProductPage) {
      setProductPage(targetPage);
      return;
    }

    setHighlightProductId(targetId);
    const timer = window.setTimeout(() => {
      const node = findVisibleProductNode(targetId);
      if (!node) return;
      const desiredViewportTop = pendingProductJumpViewportTopRef.current;
      if (typeof desiredViewportTop === "number" && Number.isFinite(desiredViewportTop)) {
        const rowTop = node.getBoundingClientRect().top;
        window.scrollTo({
          top: Math.max(0, window.scrollY + rowTop - Number(desiredViewportTop)),
          behavior: "auto",
        });
      } else {
        node.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      pendingProductJumpCandidateIdsRef.current = [];
      pendingProductJumpFallbackRef.current = null;
      pendingProductJumpViewportTopRef.current = null;
      setPendingProductJumpId("");
      // Szándékosan nem töröljük időzítővel a kiemelést. A "Folytatás innen"
      // munkajelzés addig marad, amíg a felhasználó meg nem nyit egy terméket.
    }, 80);

    return () => window.clearTimeout(timer);
  }, [pendingProductJumpId, filtered, safeProductPage, productPageItems.length, listOpen, productPageSize]);

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

  useEffect(() => {
    if (!incomingFocus?.batchId) {
      setIncomingSelectedVariants({});
      return;
    }
    setIncomingSelectedVariants((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [id, selected] of Object.entries(current)) {
        if (selected && incomingFocusVariantSet.has(id)) next[id] = true;
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [incomingFocus?.batchId, incomingFocusVariantIdsKey]);

  const selectionSourceItems = useMemo(() => mergeInventoryItems(items, persistedSelectedItems), [items, persistedSelectedItems]);

  const selectedItems = useMemo(() => {
    const selected = new Set(Object.keys(selectedVariants).filter((id) => selectedVariants[id]));
    return selectionSourceItems.filter((x) => selected.has(selectedVariantIdFromItem(x)));
  }, [selectionSourceItems, selectedVariants]);

  const incomingSelectedItems = useMemo(() => {
    if (!incomingFocus?.batchId) return [] as InventoryItem[];
    const selected = new Set(Object.keys(incomingSelectedVariants).filter((id) => incomingSelectedVariants[id]));
    // Az importkijelölés nem a pillanatnyi szűrt listából él. Ha közben egy további
    // szűrő elrejti valamelyik kijelölt sort, a kijelölés és a zöld munkagomb akkor
    // is stabilan megmarad. Csak az aktuális bevételezés valódi variánsai számítanak.
    return inventoryDisplayItems.filter((item) => {
      const id = selectedVariantIdFromItem(item);
      return Boolean(id && incomingFocusVariantSet.has(id) && selected.has(id));
    });
  }, [inventoryDisplayItems, incomingFocus?.batchId, incomingFocusVariantIdsKey, incomingSelectedVariants]);

  const selectedCount = selectedItems.length;
  const incomingSelectedCount = incomingSelectedItems.length;
  const activeListSelectedCount = incomingFocus?.batchId ? incomingSelectedCount : selectedCount;
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
  const selectedShopifyItems = useMemo(
    () => selectedItems.filter((x) => selectedWorkActions[String(x.variant_id || "")] === "shopify"),
    [selectedItems, selectedWorkActions]
  );
  const selectedWorkCounts: Record<SelectedWorkAction, number> = {
    label: selectedLabelItems.length,
    order: selectedOrderItems.length,
    move: selectedMoveItems.length,
    shopify: selectedShopifyItems.length,
  };
  const selectedWorkButtonClass = (action: SelectedWorkAction) => selectedWorkCounts[action] > 0 ? primaryBtn : btnSoft;

  function supplierValue(row?: Partial<MetaItem> | null) {
    return String(row?.id || row?.code || row?.name || "").trim();
  }

  function supplierByValue(value: unknown) {
    const key = normalizeSearch(value);
    if (!key) return null;
    return suppliers.find((row) => [row.id, row.code, row.name].map(normalizeSearch).includes(key)) || null;
  }

  function brandRowForOrderItem(item: InventoryItem) {
    const keys = [item.brand_code, item.brand_name].map(normalizeSearch).filter(Boolean);
    if (!keys.length) return null;
    return brands.find((row) => [row.id, row.code, row.name].map(normalizeSearch).some((key) => keys.includes(key))) || null;
  }

  function orderSupplierCandidatesForItem(item: InventoryItem) {
    const candidates = new Map<string, MetaItem>();
    const addSupplier = (row?: MetaItem | null) => {
      if (!row || row.is_active === false) return;
      const id = supplierValue(row);
      if (id && !candidates.has(id)) candidates.set(id, row);
    };

    const directEntries = inventorySupplierEntries(item);
    for (const entry of directEntries) {
      const keyValues = [entry.id, entry.code, entry.name].map(normalizeSearch).filter(Boolean);
      const found = suppliers.find((row) => [row.id, row.code, row.name].map(normalizeSearch).some((key) => keyValues.includes(key)));
      addSupplier(found || null);
    }

    const brandRow = brandRowForOrderItem(item);
    const brandLinks = brandRow
      ? supplierBrands
          .filter((link) => link.is_active !== false && String(link.brand_id || "") === String(brandRow.id || ""))
          .slice()
          .sort((a, b) => Number(Boolean(b.is_preferred)) - Number(Boolean(a.is_preferred)))
      : [];
    for (const link of brandLinks) addSupplier(suppliers.find((row) => String(row.id || "") === String(link.supplier_id || "")) || null);

    return Array.from(candidates.values());
  }

  function preferredOrderSupplierIdForItem(item: InventoryItem) {
    const candidates = orderSupplierCandidatesForItem(item);
    if (candidates.length === 1) return supplierValue(candidates[0]);

    const brandRow = brandRowForOrderItem(item);
    if (brandRow) {
      const preferredLink = supplierBrands.find((link) =>
        link.is_active !== false &&
        link.is_preferred &&
        String(link.brand_id || "") === String(brandRow.id || "") &&
        candidates.some((row) => String(row.id || "") === String(link.supplier_id || ""))
      );
      if (preferredLink) return String(preferredLink.supplier_id || "");
    }

    return "";
  }

  function purchaseOrderSupplierOptionsForItem(item: InventoryItem): WarehouseMoveDropdownOption[] {
    const linked = orderSupplierCandidatesForItem(item);
    const linkedIds = new Set(linked.map((row) => String(row.id || "")));
    const rest = suppliers
      .filter((row) => row.is_active !== false && !linkedIds.has(String(row.id || "")))
      .slice()
      .sort((a, b) => String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""), "hu", { sensitivity: "base" }));
    return [
      ...linked.map((row) => ({
        value: supplierValue(row),
        label: String(row.name || row.code || "Beszállító"),
        hint: "kapcsolt",
      })),
      ...rest.map((row) => ({
        value: supplierValue(row),
        label: String(row.name || row.code || "Beszállító"),
      })),
    ];
  }

  const selectedOrderIdsKey = useMemo(
    () => selectedOrderItems.map((item) => String(item.variant_id || "")).filter(Boolean).join("|"),
    [selectedOrderItems]
  );

  useEffect(() => {
    if (selectedWorkPanel !== "order") return;
    purchaseOrderWorkIdempotencyKeyRef.current = "";
    setPurchaseOrderWorkRows((current) => {
      const next: Record<string, PurchaseOrderWorkDraftRow> = {};
      for (const item of selectedOrderItems) {
        const variantId = String(item.variant_id || "");
        if (!variantId) continue;
        const previous = current[variantId];
        const previousSupplier = supplierByValue(previous?.supplierId);
        next[variantId] = {
          supplierId: previousSupplier ? supplierValue(previousSupplier) : preferredOrderSupplierIdForItem(item),
          qty: String(Math.max(1, Math.floor(n(previous?.qty || 1)))),
        };
      }
      return next;
    });

    if (!purchaseOrderTargetLocationId) {
      const preferredLocation = stockLocationRows.find((row) => String(row.code || "") === "main_warehouse")
        || stockLocationRows.find((row) => /miercurea|ciuc/i.test(String(row.name || row.code || "")))
        || stockLocationRows[0]
        || null;
      setPurchaseOrderTargetLocationId(locationValue(preferredLocation));
    }
  }, [
    selectedWorkPanel,
    selectedOrderIdsKey,
    suppliers,
    brands,
    supplierBrands,
    stockLocationRows,
    purchaseOrderTargetLocationId,
  ]);

  function setPurchaseOrderWorkRowField(variantId: string, patch: Partial<PurchaseOrderWorkDraftRow>) {
    const item = selectedOrderItems.find((row) => String(row.variant_id || "") === String(variantId || ""));
    setPurchaseOrderWorkRows((current) => {
      const previous = current[variantId] || {
        supplierId: item ? preferredOrderSupplierIdForItem(item) : "",
        qty: "1",
      };
      const next = { ...previous, ...patch };
      next.qty = String(Math.max(1, Math.floor(n(next.qty || 1))));
      return { ...current, [variantId]: next };
    });
    purchaseOrderWorkIdempotencyKeyRef.current = "";
  }

  function adjustPurchaseOrderWorkQty(variantId: string, delta: number) {
    const item = selectedOrderItems.find((row) => String(row.variant_id || "") === String(variantId || ""));
    if (!item) return;
    const current = purchaseOrderWorkRows[variantId] || {
      supplierId: preferredOrderSupplierIdForItem(item),
      qty: "1",
    };
    setPurchaseOrderWorkRowField(variantId, { qty: String(Math.max(1, Math.floor(n(current.qty)) + delta)) });
  }

  const preparedPurchaseOrderRows = useMemo<PreparedPurchaseOrderWorkRow[]>(() => {
    return selectedOrderItems.map((item) => {
      const variantId = String(item.variant_id || "");
      const draft = purchaseOrderWorkRows[variantId] || {
        supplierId: preferredOrderSupplierIdForItem(item),
        qty: "1",
      };
      const supplier = supplierByValue(draft.supplierId);
      const qty = Math.max(0, Math.floor(n(draft.qty)));
      const unitPrice = priceNumber(item.buy_price);
      const lineValue = unitPrice === null ? null : Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;
      let problem = "";
      if (!variantId) problem = "Hiányzik a termékazonosító.";
      else if (!supplier) problem = "Válassz beszállítót.";
      else if (qty <= 0) problem = "Adj meg legalább 1 darabot.";
      return {
        item,
        variantId,
        supplierId: supplier ? supplierValue(supplier) : "",
        supplierName: supplier ? String(supplier.name || supplier.code || "Beszállító") : "",
        qty,
        unitPrice,
        lineValue,
        valid: !problem,
        problem,
      };
    });
  }, [selectedOrderItems, purchaseOrderWorkRows, suppliers, brands, supplierBrands]);

  const preparedPurchaseOrderRowsById = useMemo(
    () => new Map(preparedPurchaseOrderRows.map((row) => [row.variantId, row])),
    [preparedPurchaseOrderRows]
  );

  const purchaseOrderWorkGroups = useMemo(() => {
    const groups = new Map<string, { supplierId: string; supplierName: string; rows: number; qty: number; value: number }>();
    for (const row of preparedPurchaseOrderRows.filter((item) => item.valid)) {
      const current = groups.get(row.supplierId) || {
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        rows: 0,
        qty: 0,
        value: 0,
      };
      current.rows += 1;
      current.qty += row.qty;
      current.value += row.lineValue || 0;
      groups.set(row.supplierId, current);
    }
    return Array.from(groups.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName, "hu", { sensitivity: "base" }));
  }, [preparedPurchaseOrderRows]);

  const purchaseOrderWorkInvalidCount = preparedPurchaseOrderRows.filter((row) => !row.valid).length;
  const purchaseOrderWorkTotalQty = preparedPurchaseOrderRows
    .filter((row) => row.valid)
    .reduce((sum, row) => sum + row.qty, 0);
  const purchaseOrderWorkTotalValue = preparedPurchaseOrderRows
    .filter((row) => row.valid)
    .reduce((sum, row) => sum + (row.lineValue || 0), 0);
  const purchaseOrderWorkCanSave =
    selectedWorkPanel === "order" &&
    preparedPurchaseOrderRows.length > 0 &&
    purchaseOrderWorkInvalidCount === 0 &&
    !purchaseOrderWorkSaving;

  function createPurchaseOrderWorkIdempotencyKey() {
    if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `purchase-order-work-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  async function saveSelectedOrderItemsToOpenOrders() {
    if (purchaseOrderWorkSubmitLockRef.current) return;
    if (!purchaseOrderWorkCanSave) {
      setMessage(purchaseOrderWorkInvalidCount
        ? `${purchaseOrderWorkInvalidCount} rendelési sor még javítandó.`
        : "Nincs menthető termék a rendelési listában.");
      return;
    }

    purchaseOrderWorkSubmitLockRef.current = true;
    setPurchaseOrderWorkSaving(true);
    setMessage("");
    try {
      if (!purchaseOrderWorkIdempotencyKeyRef.current) {
        purchaseOrderWorkIdempotencyKeyRef.current = createPurchaseOrderWorkIdempotencyKey();
      }
      const result = await apiAifAddItemsToOpenPurchaseOrders({
        targetLocationId: purchaseOrderTargetLocationId || null,
        currencyCode: "RON",
        idempotencyKey: purchaseOrderWorkIdempotencyKeyRef.current,
        items: preparedPurchaseOrderRows.map((row) => ({
          supplierId: row.supplierId,
          variantId: row.variantId,
          qty: row.qty,
          unitPrice: row.unitPrice,
        })),
      });

      const completedIds = new Set<string>(
        preparedPurchaseOrderRows.map((row) => row.variantId).filter((value): value is string => Boolean(value))
      );
      const cleanup = await removeCompletedSelectedItems(completedIds);
      const resultText = (result.orders || [])
        .map((order) => `${order.orderNumber} • ${order.supplierName || "beszállító"} • +${order.addedQty} db${order.created ? " • új" : " • bővítve"}`)
        .join(" | ");

      try {
        const payload = { at: new Date().toISOString(), orders: result.orders || [] };
        window.localStorage.setItem("allinfashion:purchaseOrders:changed:v1", JSON.stringify(payload));
        window.dispatchEvent(new CustomEvent("aif:purchase-orders-changed", { detail: payload }));
      } catch {
        // A következő oldalbetöltés ettől még behozza a rendeléseket.
      }

      await loadOpenPurchaseOrderState();
      purchaseOrderWorkIdempotencyKeyRef.current = "";
      setPurchaseOrderWorkRows({});
      setMessage(
        `${result.duplicate ? "A korábbi mentést ismertem fel, nem dupláztam." : "Nyitott rendelések frissítve."} ${resultText}${
          cleanup.synced ? "" : " A helyi kijelölésből eltűntek, de a közös munkalista szinkronját újra kell próbálni."
        }`
      );
      closeSelectedWorkflowAndReturn();
    } catch (error: any) {
      setMessage(error?.message || "A nyitott beszállítói rendelések frissítése nem sikerült.");
    } finally {
      purchaseOrderWorkSubmitLockRef.current = false;
      setPurchaseOrderWorkSaving(false);
    }
  }

  function openPurchaseOrdersPage() {
    setSelectedWorkPanel(null);
    setSelectedPanelOpen(false);
    window.location.hash = "#allinorderhistory";
  }

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
      else if (priceNumber(item.sell_price) === null) problem = "Hiányzik az eladási ár.";
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
  const moveRoutePairs = useMemo(() => Array.from(new Set(
    moveValidRows.map((row) => `${row.fromLocationId}=>${row.toLocationId}`)
  )), [moveValidRows]);
  const moveHasSingleRoute = moveRoutePairs.length <= 1;
  const moveRouteProblem = moveRoutePairs.length > 1
    ? "Egy hivatalos átadás-átvételi bizonylaton csak egy forrás és egy cél lehet. Használd a Gyors kitöltést, vagy készíts külön bizonylatot útvonalanként."
    : "";
  const moveAllRowsValid = useMemo(
    () => preparedMoveRows.length > 0 && preparedMoveRows.every((row) => row.valid) && moveHasSingleRoute,
    [preparedMoveRows, moveHasSingleRoute]
  );
  const moveTotalQty = useMemo(() => moveValidRows.reduce((sum, row) => sum + row.qty, 0), [moveValidRows]);
  const moveTotalValue = useMemo(() => moveValidRows.reduce((sum, row) => {
    const unitPrice = priceNumber(row.item.sell_price) || 0;
    return sum + row.qty * unitPrice;
  }, 0), [moveValidRows]);
  const moveCanSave = selectedWorkPanel === "move" && moveAllRowsValid && !stockMoveSaving;
  const moveBulkCanApply = selectedWorkPanel === "move" && Boolean(stockMoveBulkFrom && stockMoveBulkTo && stockMoveBulkFrom !== stockMoveBulkTo);
  const moveRouteSummary = useMemo(() => {
    const routedRows = preparedMoveRows.filter((row) => row.fromLocationId && row.toLocationId);
    const routes = new Map<string, PreparedStockTransferRow>();
    for (const row of routedRows) routes.set(`${row.fromLocationId}=>${row.toLocationId}`, row);
    if (!routes.size) {
      return { from: "Nincs kiválasztva", to: "Nincs kiválasztva", routeCount: 0 };
    }
    if (routes.size > 1) {
      return { from: "Több forráshely", to: "Több célhely", routeCount: routes.size };
    }
    const row = Array.from(routes.values())[0];
    return { from: row.fromLocationName || "Forráshely", to: row.toLocationName || "Célhely", routeCount: 1 };
  }, [preparedMoveRows]);

  const stockEditorTransferPreview = useMemo(() => {
    if (!stockEditorTarget || stockEditorAllowTotalChange) return null;
    try {
      const lines = stockEditorTransferLines();
      if (!lines.length) return null;
      const routes = Array.from(new Map(lines.map((line) => [
        `${line.fromLocationId}=>${line.toLocationId}`,
        line,
      ] as const)).values());
      if (routes.length !== 1) return null;
      const route = routes[0];
      const qty = lines.reduce((sum, line) => sum + line.qty, 0);
      const addedValue = qty * (priceNumber(stockEditorTarget.sell_price) || 0);
      return {
        fromLocationId: route.fromLocationId,
        toLocationId: route.toLocationId,
        fromLocationName: locationNameByValue(route.fromLocationId),
        toLocationName: locationNameByValue(route.toLocationId),
        qty,
        addedValue,
      };
    } catch {
      return null;
    }
  }, [stockEditorAllowTotalChange, stockEditorRows, stockEditorTarget?.variant_id, stockLocationRows, stockRows]);

  const warehouseMoveValuePreview = useMemo(() => {
    let fromLocationId = "";
    let toLocationId = "";
    let fromLocationName = "";
    let toLocationName = "";
    let addedValue = 0;
    let qty = 0;
    let mode: "bulk" | "single" = "bulk";

    if (selectedWorkPanel === "move" && moveHasSingleRoute && moveValidRows.length) {
      const first = moveValidRows[0];
      fromLocationId = first.fromLocationId;
      toLocationId = first.toLocationId;
      fromLocationName = first.fromLocationName;
      toLocationName = first.toLocationName;
      addedValue = moveTotalValue;
      qty = moveTotalQty;
      mode = "bulk";
    } else if (stockEditorTransferPreview) {
      fromLocationId = stockEditorTransferPreview.fromLocationId;
      toLocationId = stockEditorTransferPreview.toLocationId;
      fromLocationName = stockEditorTransferPreview.fromLocationName;
      toLocationName = stockEditorTransferPreview.toLocationName;
      addedValue = stockEditorTransferPreview.addedValue;
      qty = stockEditorTransferPreview.qty;
      mode = "single";
    } else {
      return null;
    }

    const preparation = openTransferPreparations.find((item) =>
      warehousePreparationMatchesRoute(item, fromLocationId, toLocationId, fromLocationName, toLocationName)
    ) || null;

    // Mentés után a backend már az új PV-összeget adja vissza, miközben a modalban
    // a most mentett sor még egy rövid ideig látható. Ha ilyenkor az új összeghez
    // még egyszer hozzáadnánk a draft értékét, 697,50 helyett 837,00 jelenne meg.
    // Mentés közben ezért a friss toast backend-eredménye az igazságforrás.
    const saveInProgress = stockEditorSaving || stockMoveSaving;
    const toastDocumentMatches = Boolean(
      warehouseTransferToast?.documentId &&
      preparation?.id &&
      String(warehouseTransferToast.documentId) === String(preparation.id)
    );
    const toastRouteMatches = Boolean(
      warehouseTransferToast?.routeLabel &&
      normalizeSearch(warehouseTransferToast.routeLabel) === normalizeSearch(`${fromLocationName} → ${toLocationName}`)
    );
    const confirmedToast = saveInProgress && warehouseTransferToast && (toastDocumentMatches || toastRouteMatches)
      ? warehouseTransferToast
      : null;

    const confirmedTotalValue = confirmedToast ? priceNumber(confirmedToast.totalValue) : null;
    const confirmedAddedValue = confirmedToast ? priceNumber(confirmedToast.addedValue) : null;
    const previewAddedValue = confirmedAddedValue ?? addedValue;
    const storedCurrentValue = priceNumber(preparation?.total_value) || 0;
    const currentValue = confirmedTotalValue !== null
      ? Math.max(0, confirmedTotalValue - previewAddedValue)
      : storedCurrentValue;
    const projectedValue = confirmedTotalValue ?? (currentValue + previewAddedValue);
    const thresholdReached = projectedValue >= WAREHOUSE_UIT_WARNING_THRESHOLD_RON;
    const uitRecorded = Boolean(warehousePreparationUitCode(preparation));
    return {
      mode,
      preparation,
      fromLocationName,
      toLocationName,
      qty,
      addedValue: previewAddedValue,
      currentValue,
      projectedValue,
      thresholdReached,
      uitRecorded,
      remainingValue: WAREHOUSE_UIT_WARNING_THRESHOLD_RON - projectedValue,
    };
  }, [
    moveHasSingleRoute,
    moveTotalQty,
    moveTotalValue,
    moveValidRows,
    openTransferPreparations,
    selectedWorkPanel,
    stockEditorSaving,
    stockEditorTransferPreview,
    stockMoveSaving,
    warehouseTransferToast,
  ]);

  function showWarehouseTransferToast(next: WarehouseTransferToastState) {
    if (warehouseTransferToastTimerRef.current !== null) {
      window.clearTimeout(warehouseTransferToastTimerRef.current);
    }
    setWarehouseTransferToast(next);
    warehouseTransferToastTimerRef.current = window.setTimeout(() => {
      setWarehouseTransferToast(null);
      warehouseTransferToastTimerRef.current = null;
    }, 8500);
  }

  function handleWarehouseStockTransferResult(
    result: Awaited<ReturnType<typeof apiStockTransfer>>,
    fallbackAddedValue = 0,
  ) {
    const resultDocuments: StockTransferDocumentResult[] = Array.isArray(result.documents) && result.documents.length
      ? result.documents
      : [result];

    const prepared = resultDocuments.map((entry) => {
      const document = entry.document && typeof entry.document === "object" ? entry.document : {};
      const documentId = firstWarehouseText(entry.documentId, document.id, entry.transferId);
      const documentNumber = firstWarehouseText(entry.documentNumber, document.document_number, entry.transferId, "PV-előkészítés");
      const knownPreparation = openTransferPreparations.find((item) =>
        String(item.id || "") === documentId ||
        normalizeSearch(item.document_number) === normalizeSearch(documentNumber)
      ) || null;
      const knownTotalValue = priceNumber(knownPreparation?.total_value) || 0;
      const itemAddedValue = (entry.items || []).reduce((sum, item) => sum + (priceNumber(item?.lineTotal ?? item?.line_total) || 0), 0);
      const addedValue = Math.max(0, itemAddedValue || (resultDocuments.length === 1 ? fallbackAddedValue : 0));
      const totalValue = priceNumber(entry.documentTotalValue ?? document.total_value) ?? (knownTotalValue + addedValue);
      const totalQty = Math.max(0, Math.floor(n(entry.documentTotalQty ?? document.total_qty ?? entry.totalQty ?? entry.movedQty ?? knownPreparation?.total_qty)));
      const uitCode = warehousePreparationUitCode(document) || warehousePreparationUitCode(knownPreparation);
      const crossedThreshold = totalValue >= WAREHOUSE_UIT_WARNING_THRESHOLD_RON;
      const sourceLocationId = firstWarehouseText(entry.sourceLocationId, document.source_location_id, document.sourceLocationId, knownPreparation?.source_location_id);
      const targetLocationId = firstWarehouseText(entry.targetLocationId, document.target_location_id, document.targetLocationId, knownPreparation?.target_location_id);
      const sourceLocationName = firstWarehouseText(entry.sourceLocationName, document.from_location_summary, document.fromLocationName, knownPreparation?.from_location_summary, locationNameByValue(sourceLocationId));
      const targetLocationName = firstWarehouseText(entry.targetLocationName, document.to_location_summary, document.toLocationName, knownPreparation?.to_location_summary, locationNameByValue(targetLocationId));
      const routeLabel = sourceLocationName && targetLocationName ? `${sourceLocationName} → ${targetLocationName}` : "";

      const summary: WarehouseTransferPreparationSummary = {
        id: documentId,
        document_number: documentNumber,
        document_type: "internal_transfer",
        status: String(entry.status || result.status || document.status || "preparation"),
        total_value: totalValue,
        total_qty: totalQty,
        line_count: entry.documentLineCount ?? document.line_count ?? null,
        source_location_id: sourceLocationId || null,
        target_location_id: targetLocationId || null,
        from_location_summary: sourceLocationName || null,
        to_location_summary: targetLocationName || null,
        uit_code: uitCode || null,
        raw: document.raw && typeof document.raw === "object" ? document.raw : null,
      };

      return {
        summary,
        documentId,
        documentNumber,
        totalValue,
        totalQty,
        addedValue,
        crossedThreshold,
        uitCode,
        routeLabel,
      };
    });

    const validSummaries = prepared.filter((row) => row.documentId);
    if (validSummaries.length) {
      setOpenTransferPreparations((current) => {
        const changedIds = new Set(validSummaries.map((row) => String(row.documentId)));
        const next = current.filter((item) => !changedIds.has(String(item.id || "")));
        return [...validSummaries.map((row) => row.summary), ...next];
      });
      setOpenTransferPreparationsLoaded(true);
    }

    const toastTarget = prepared.find((row) => row.crossedThreshold && !row.uitCode) || prepared[0];
    if (toastTarget) {
      showWarehouseTransferToast({
        documentId: toastTarget.documentId,
        documentNumber: prepared.length > 1 ? `${prepared.length} külön irányú PV frissítve` : toastTarget.documentNumber,
        totalValue: toastTarget.totalValue,
        totalQty: toastTarget.totalQty,
        addedValue: prepared.length > 1
          ? prepared.reduce((sum, row) => sum + row.addedValue, 0)
          : toastTarget.addedValue,
        crossedThreshold: toastTarget.crossedThreshold,
        uitRecorded: Boolean(toastTarget.uitCode),
        routeLabel: prepared.length > 1 ? "Minden útvonal saját előkészítést kapott." : toastTarget.routeLabel,
        documentCount: prepared.length,
      });
    }

    const warningTarget = prepared.find((row) =>
      row.crossedThreshold &&
      !row.uitCode &&
      !result.duplicate &&
      !warehouseUitWarningIsSuppressed(row.documentId, row.documentNumber)
    );
    if (warningTarget) {
      setWarehouseUitSuppressChecked(false);
      setWarehouseUitWarning({
        documentId: warningTarget.documentId,
        documentNumber: warningTarget.documentNumber,
        totalValue: warningTarget.totalValue,
        totalQty: warningTarget.totalQty,
        addedValue: warningTarget.addedValue,
        routeLabel: warningTarget.routeLabel,
      });
    }

    void refreshOpenTransferPreparations();
  }

  function movePrintLines() {
    return moveValidRows.map((row, index): StockTransferPrintLine => {
      const unitPrice = priceNumber(row.item.sell_price) || 0;
      return {
        index: index + 1,
        title: row.item.title_ro || "-",
        brand: row.item.brand_name || "-",
        category: row.item.category_name_hu || row.item.category_name_ro || "-",
        productCode: itemProductCode(row.item) || "-",
        barcode: visibleWarehouseBarcode(row.item) || row.item.barcode || row.item.internal_sku || "-",
        color: colorDisplay(row.item.color_name, row.item.color_code),
        size: String(row.item.size || "-"),
        imageUrl: row.item.image_url || null,
        fromLocation: row.fromLocationName,
        toLocation: row.toLocationName,
        qty: row.qty,
        unitPrice,
        lineTotal: row.qty * unitPrice,
      };
    });
  }

  function printStockMoveTransferPdf() {
    if (!moveHasSingleRoute) {
      setMessage(moveRouteProblem);
      return;
    }
    if (!moveAllRowsValid) {
      setMessage("A PDF előtt javítsd a készletmozgatási sorokat. Az eladási ár is kötelező, mert a bizonylat értéket számol.");
      return;
    }
    const issuedAt = new Date();
    const printHtml = warehouseStockTransferPrintDocumentHtml({
      title: stockMoveDocumentTitle.trim() || "Aviz intern de transfer stoc",
      note: stockMoveNote.trim(),
      createdAt: warehouseTransferDateTime(issuedAt),
      documentNumber: `PREVIZUALIZARE-${warehouseTransferDocumentNumber(issuedAt)}`,
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

  function selectedMoveTransferPayload() {
    const lines = moveValidRows.map((row) => ({
      variantId: row.variantId,
      fromLocationId: row.fromLocationId,
      toLocationId: row.toLocationId,
      qty: row.qty,
    }));
    return {
      title: stockMoveDocumentTitle.trim() || "Aviz intern de transfer stoc",
      note: stockMoveNote.trim(),
      lines,
    };
  }

  function ensureStockMoveIdempotencyKey(payload: ReturnType<typeof selectedMoveTransferPayload>) {
    const fingerprint = stockTransferPayloadFingerprint(payload);
    if (
      !stockMoveIdempotencyKeyRef.current ||
      stockMovePayloadFingerprintRef.current !== fingerprint
    ) {
      stockMoveIdempotencyKeyRef.current = createStockTransferIdempotencyKey();
      stockMovePayloadFingerprintRef.current = fingerprint;
    }
    return stockMoveIdempotencyKeyRef.current;
  }

  function requestSaveSelectedMoveTransfers() {
    if (!moveHasSingleRoute) {
      setMessage(moveRouteProblem);
      return;
    }
    if (!moveCanSave || stockMoveSubmitLockRef.current) {
      setMessage(moveInvalidCount ? `${moveInvalidCount} készletmozgatási sor még hibás. Javítsd őket mentés előtt.` : stockMoveSubmitLockRef.current ? "A készletmozgatás mentése már folyamatban van." : "Nincs menthető készletmozgatás.");
      return;
    }
    ensureStockMoveIdempotencyKey(selectedMoveTransferPayload());
    setStockMoveConfirmOpen(true);
  }

  async function saveSelectedMoveTransfers() {
    // A React state csak a következő rendernél tiltja le a gombot. A ref az első
    // kattintás pillanatában zár, így gyors dupla kattintással sem indul két POST.
    if (stockMoveSubmitLockRef.current) return;
    if (!moveHasSingleRoute) {
      setMessage(moveRouteProblem);
      return;
    }
    if (!moveCanSave) {
      setMessage(moveInvalidCount ? `${moveInvalidCount} készletmozgatási sor még hibás. Javítsd őket mentés előtt.` : "Nincs menthető készletmozgatás.");
      return;
    }

    const payload = selectedMoveTransferPayload();
    const rowsToMove = payload.lines;
    const qtyToMove = rowsToMove.reduce((sum, row) => sum + row.qty, 0);
    const idempotencyKey = ensureStockMoveIdempotencyKey(payload);

    stockMoveSubmitLockRef.current = true;
    setStockMoveSaving(true);
    setStockMoveConfirmOpen(false);
    setMessage("");
    // Egy korábbi értesítés ne fagyassza rá a régi összeget az új mentésre.
    if (warehouseTransferToastTimerRef.current !== null) {
      window.clearTimeout(warehouseTransferToastTimerRef.current);
      warehouseTransferToastTimerRef.current = null;
    }
    setWarehouseTransferToast(null);
    try {
      const result = await apiStockTransfer({ ...payload, idempotencyKey });
      handleWarehouseStockTransferResult(result, moveTotalValue);
      notifyStockMovesChanged({ source: "warehouse_transfer", transferId: result.transferId, duplicate: Boolean(result.duplicate) });
      await load();
      const movedLines = Number(result.movedLines ?? result.movedRows ?? result.lineCount ?? rowsToMove.length);
      const movedQty = Number(result.movedQty ?? result.totalQty ?? qtyToMove);
      const movedVariantIds = new Set<string>(rowsToMove.map((row) => String(row.variantId || "")));
      const selectionCleanup = await removeCompletedSelectedItems(movedVariantIds);
      setStockMoveBulkFrom("");
      setStockMoveBulkTo("");
      setStockMoveConfirmOpen(false);
      stockMoveIdempotencyKeyRef.current = "";
      stockMovePayloadFingerprintRef.current = "";
      const officialDocumentNumber = (result.documents || [])
        .map((entry) => String(entry.documentNumber || entry.transferId || "").trim())
        .filter(Boolean)
        .join(", ") || String(result.documentNumber || "").trim();
      setMessage(
        result.duplicate
          ? `Az ismételt mentési kérést a rendszer felismerte, ezért a készletet nem mozgatta meg újra. ${officialDocumentNumber ? `Előkészítés: ${officialDocumentNumber}. ` : ""}A már rögzített művelet: ${movedLines} sor, ${movedQty} db.`
          : `Készletmozgatás hozzáadva ${Number(result.documentCount || result.documents?.length || 1) > 1 ? `${Number(result.documentCount || result.documents?.length)} külön irányú előkészítéshez` : "az átadási előkészítéshez"}: ${officialDocumentNumber || result.transferId}. ${movedLines} sor, ${movedQty} db. Az ellenkező irány mindig külön PV-be kerül.`
      );
      if (!selectionCleanup.synced) {
        setMessage((current) => `${current} A kész termékeket helyben kivettem a kijelölésből, de a szerveres munkalista mentése hibázott.`);
      }
    } catch (e: any) {
      // Hálózati bizonytalanságnál ugyanaz a kulcs marad. Újrapróbáláskor a backend
      // visszaadja a korábbi eredményt, de nem írja át még egyszer a készletet.
      setMessage(e?.message || "A készletmozgatás mentése nem sikerült.");
    } finally {
      stockMoveSubmitLockRef.current = false;
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

    const sameKeyValueMap = <T extends string | boolean>(
      current: Record<string, T>,
      next: Record<string, T>,
    ) => {
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      if (currentKeys.length !== nextKeys.length) return false;
      return nextKeys.every((key) => current[key] === next[key]);
    };

    const selectedItemFingerprint = (item: Partial<PersistedSelectedWorkItem> & Record<string, any>) => [
      selectedVariantIdFromItem(item),
      normalizeSelectedWorkAction(item.action || item.selected_action) || "",
      String(item.sort_order ?? ""),
      String(item.selected_updated_at || item.updated_at || ""),
      String(item.title_ro || item.shopify_title || ""),
      String(item.brand_name || ""),
      String(item.category_code || item.category_name_ro || ""),
      String(item.subcategory_code || item.subcategory_name_ro || item.product_type || ""),
      String(item.color_code || item.color_name || ""),
      String(item.size || ""),
      String(item.barcode || ""),
      String(item.image_url || ""),
      String(item.total_qty ?? ""),
      String(item.available_qty ?? ""),
      String(item.buy_price ?? ""),
      String(item.sell_price ?? ""),
      String(item.model_status || ""),
      String(item.variant_status || ""),
    ].join("\u001f");

    setPersistedSelectedItems((current) => {
      if (current.length !== nextItems.length) return nextItems;
      const currentFingerprint = current.map((item) => selectedItemFingerprint(item as any)).join("\u001e");
      const nextFingerprint = nextItems.map((item) => selectedItemFingerprint(item as any)).join("\u001e");
      return currentFingerprint === nextFingerprint ? current : nextItems;
    });
    setSelectedVariants((current) => sameKeyValueMap(current, nextSelected) ? current : nextSelected);
    setSelectedWorkActions((current) => sameKeyValueMap(current, nextActions) ? current : nextActions);
  }

  async function refreshSelectedVariantSelection(options: { force?: boolean; quiet?: boolean } = {}) {
    if (!options.force && selectedMutationCountRef.current > 0) return null;
    const requestSequence = ++selectedFetchSequenceRef.current;
    const mutationSequenceAtStart = selectedMutationSequenceRef.current;
    try {
      const saved = await apiSelectedVariantSelection();
      if (requestSequence !== selectedFetchSequenceRef.current) return saved;
      // Ha a GET indítása óta kattintás történt, a válasz már lehet régi.
      // Ilyenkor nem alkalmazzuk, a művelet végén induló következő GET lesz az igazság.
      if (mutationSequenceAtStart !== selectedMutationSequenceRef.current || selectedMutationCountRef.current > 0) return saved;
      applyPersistedSelectedWorklist(saved.items || []);
      return saved;
    } catch (error) {
      if (!options.quiet) console.error("AIF selected variants refresh failed", error);
      return null;
    }
  }

  async function runSelectedVariantMutation(
    request: () => Promise<SelectedVariantSelectionResponse>,
    errorText: string,
  ) {
    const mutationSequence = ++selectedMutationSequenceRef.current;
    selectedMutationCountRef.current += 1;
    try {
      const saved = await request();
      // Gyors egymás utáni kattintásoknál egy régebbi válasz nem írhatja felül
      // az újabbat. A legutolsó művelet után külön GET hozza a végleges közös állapotot.
      if (mutationSequence === selectedMutationSequenceRef.current) {
        applyPersistedSelectedWorklist(saved.items || []);
      }
      return saved;
    } catch (error) {
      console.error("AIF selected variants mutation failed", error);
      setMessage(error instanceof Error && error.message ? error.message : errorText);
      throw error;
    } finally {
      selectedMutationCountRef.current = Math.max(0, selectedMutationCountRef.current - 1);
      if (selectedMutationCountRef.current === 0) {
        void refreshSelectedVariantSelection({ force: true, quiet: true });
      }
    }
  }

  const activeListSelectionMap = incomingFocus?.batchId ? incomingSelectedVariants : selectedVariants;
  const selectedVisibleCount = filteredVariantIds.filter((id) => activeListSelectionMap[id]).length;
  const allFilteredSelected = filteredVariantIds.length > 0 && selectedVisibleCount === filteredVariantIds.length;

  function openSelectedProductsPanel() {
    const rememberedId = String(lastSelectionVariantIdRef.current || "").trim();
    const rememberedStillSelected = Boolean(rememberedId && selectedVariants[rememberedId]);
    if (rememberedStillSelected) {
      rememberSelectionReturnAnchor(rememberedId);
    } else {
      const selectedSet = new Set(Object.keys(selectedVariants).filter((id) => selectedVariants[id]));
      const fallbackItem =
        filtered.slice().reverse().find((item) => selectedSet.has(selectedVariantIdFromItem(item))) ||
        selectedItems[selectedItems.length - 1] ||
        null;
      if (fallbackItem) rememberSelectionReturnAnchor(selectedVariantIdFromItem(fallbackItem));
    }
    setSelectedPanelOpen(true);
  }

  function openIncomingSelectedProductsPanel() {
    const targets = incomingSelectedItems
      .map((item) => ({ ...item, variant_id: selectedVariantIdFromItem(item) }))
      .filter((item) => Boolean(item.variant_id));
    const ids = Array.from(new Set(targets.map((item) => String(item.variant_id || "").trim()).filter(Boolean)));
    if (!ids.length) return;

    const lastTargetId = ids[ids.length - 1];
    if (lastTargetId) rememberSelectionReturnAnchor(lastTargetId);

    // A Legutóbbi bevételezés kijelölése továbbra is külön állapot marad.
    // Csak a zöld gomb kifejezett megnyomásakor kerülnek át ezek a sorok a közös,
    // több gépen is folytatható kijelölt munkalistába.
    setSelectedVariants((current) => {
      const next = { ...current };
      for (const id of ids) next[id] = true;
      return next;
    });
    setPersistedSelectedItems((current) => mergeInventoryItems(current, targets));
    setSelectedPanelOpen(true);

    void runSelectedVariantMutation(
      () => apiAddSelectedVariantSelection(ids.map((variantId) => ({ variantId }))),
      "A legutóbbi bevételezés kijelölt termékeinek megnyitása nem sikerült.",
    ).catch(() => undefined);
  }

  function openSelectedItemsActionPicker(targetItems: InventoryItem[]) {
    const unique = new Map<string, InventoryItem>();
    for (const item of targetItems || []) {
      const id = selectedVariantIdFromItem(item);
      if (id) unique.set(id, item);
    }
    const targets = Array.from(unique.values());
    if (!targets.length) return;
    const lastTargetId = selectedVariantIdFromItem(targets[targets.length - 1]);
    if (lastTargetId) rememberSelectionReturnAnchor(lastTargetId);
    setSelectedActionTargets(targets);
  }

  function assignSelectedItemsToAction(targetItems: InventoryItem[], action: SelectedWorkAction) {
    const ids = Array.from(new Set((targetItems || []).map((item) => selectedVariantIdFromItem(item)).filter(Boolean)));
    if (!ids.length) return;
    setSelectedVariants((current) => {
      const next = { ...current };
      for (const id of ids) next[id] = true;
      return next;
    });
    setSelectedWorkActions((current) => {
      const next = { ...current };
      for (const id of ids) next[id] = action;
      return next;
    });
    setSelectedActionTargets([]);
    setSelectedWorkPanel(action);
    void runSelectedVariantMutation(
      () => apiAddSelectedVariantSelection(ids.map((variantId) => ({ variantId, action }))),
      "A kijelölt termékek műveletének mentése nem sikerült.",
    ).catch(() => undefined);
  }

  function returnSelectedItemToMainList(id: string) {
    if (!id) return;
    setSelectedWorkActions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    void runSelectedVariantMutation(
      () => apiUpdateSelectedVariantActions([{ variantId: id, action: null }]),
      "A kijelölt termék műveletének törlése nem sikerült.",
    ).catch(() => undefined);
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
    setPersistedSelectedItems((current) => current.filter((item) => selectedVariantIdFromItem(item) !== id));
    void runSelectedVariantMutation(
      () => apiRemoveSelectedVariantSelection([id]),
      "A kijelölt termék eltávolítása nem sikerült.",
    ).catch(() => undefined);
  }

  function selectedItemsForAction(action: SelectedWorkAction) {
    if (action === "label") return selectedLabelItems;
    if (action === "order") return selectedOrderItems;
    if (action === "shopify") return selectedShopifyItems;
    return selectedMoveItems;
  }

  async function removeCompletedSelectedItems(idsInput: Iterable<string>) {
    const completedIds = new Set(Array.from(idsInput, (value) => String(value || "").trim()).filter(Boolean));
    if (!completedIds.size) return { removed: 0, synced: true };

    const nextSelected = { ...selectedVariants };
    const nextActions = { ...selectedWorkActions };
    let removed = 0;
    for (const id of completedIds) {
      if (nextSelected[id]) removed += 1;
      delete nextSelected[id];
      delete nextActions[id];
    }

    // A kész művelet termékei minden helyi munkalistából azonnal eltűnnek.
    setSelectedVariants(nextSelected);
    setSelectedWorkActions(nextActions);
    setPersistedSelectedItems((current) => current.filter((item) => !completedIds.has(selectedVariantIdFromItem(item))));
    setSelectedActionTargets((current) => current.filter((item) => !completedIds.has(selectedVariantIdFromItem(item))));
    setStockMoveRows((current) => {
      const next = { ...current };
      completedIds.forEach((id) => delete next[id]);
      return next;
    });

    // Csak a valóban elkészült variánsokat töröljük a közös szerveres listából.
    // A többi gép saját, közben hozzáadott kijelöléséhez nem nyúlunk.
    try {
      const saved = await runSelectedVariantMutation(
        () => apiRemoveSelectedVariantSelection(Array.from(completedIds)),
        "A kész termékek eltávolítása nem sikerült a közös munkalistából.",
      );
      if (Array.isArray(saved.items)) applyPersistedSelectedWorklist(saved.items);
      return { removed, synced: true };
    } catch (error) {
      console.error("AIF completed selected items cleanup sync failed", error);
      return { removed, synced: false };
    }
  }

  function openSelectedShopifyExport() {
    const targets = selectedShopifyItems.slice();
    if (!targets.length) {
      setMessage("Nincs termék a Shopify export listában.");
      return;
    }
    setShopifyExportItems(targets);
    setShopifyExportModalOpen(true);
  }

  async function handleShopifyExportChanged() {
    const completedIds = new Set(shopifyExportItems.map((item) => selectedVariantIdFromItem(item)).filter(Boolean));
    await load();
    const cleanup = await removeCompletedSelectedItems(completedIds);
    if (cleanup.removed > 0) {
      setMessage(
        cleanup.synced
          ? `Shopify művelet elkészült. ${cleanup.removed} terméket eltávolítottam a kijelölt munkalistából.`
          : `Shopify művelet elkészült, és ${cleanup.removed} termék eltűnt a helyi kijelölésből, de a szerveres kijelölés mentését újra kell próbálni.`
      );
    }
  }

  function closeShopifyExportModal() {
    setShopifyExportModalOpen(false);
    setShopifyExportItems([]);
  }

  function labelProductCodeForItem(item: InventoryItem) {
    const rawProductCode = String(itemProductCode(item) || "").trim();
    const rawModelCode = String(item.model_code || "").trim();
    const modelCode = rawModelCode.includes(":") ? rawModelCode.split(":").pop() || rawModelCode : rawModelCode;
    const colorCode = firstWarehouseText(
      item.color_code,
      (item as any).supplier_color_code,
      (item as any).supplierColorCode,
    );
    const removeColorSuffix = (value: string) => {
      const cleanValue = String(value || "").trim();
      if (!cleanValue || !colorCode) return cleanValue;
      const escapedColor = colorCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return cleanValue
        .replace(new RegExp(`(?:[-_./:\\s]+)?${escapedColor}$`, "i"), "")
        .replace(/[-_./:\\s]+$/g, "")
        .trim() || cleanValue;
    };
    const clean = removeColorSuffix(rawProductCode || modelCode) || String(item.internal_sku || item.barcode || "").trim();
    return labelCleanText(clean, 48);
  }

  function labelComposerImageUrl(item: InventoryItem, detailItem?: Record<string, any> | null) {
    const detailAttributes = detailItem?.attributes && typeof detailItem.attributes === "object"
      ? detailItem.attributes as Record<string, unknown>
      : {};
    const itemAttributes = item.attributes && typeof item.attributes === "object"
      ? item.attributes as Record<string, unknown>
      : {};
    return firstWarehouseText(
      detailItem?.image_url,
      detailItem?.imageUrl,
      detailItem?.photo_url,
      detailItem?.photoUrl,
      detailAttributes.image_url,
      detailAttributes.imageUrl,
      item.image_url,
      (item as any).imageUrl,
      itemAttributes.image_url,
      itemAttributes.imageUrl,
    ) || null;
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
    setLabelShowBorder(template.labelShowBorder === true);
    setLabelContent({ ...WAREHOUSE_LABEL_DEFAULT_CONTENT, ...(template.labelContent || {}) });
  }

  function defaultLabelCopiesForItem(item: InventoryItem) {
    const qty = Math.floor(n(item.total_qty || item.available_qty));
    return String(Math.max(1, qty || 1));
  }

  function barcodeForLabelItem(item: InventoryItem, detailItem?: Record<string, any> | null) {
    return String(detailItem?.barcode || item.barcode || "")
      .replace(/[\r\n\t]+/g, "")
      .trim()
      .slice(0, 64);
  }

  async function openLabelComposer() {
    // Minden megnyitáskor keret és márka nélkül induljon. Mentett sablon
    // betöltése továbbra is tudatosan visszakapcsolhatja ezeket.
    setLabelShowBorder(false);
    setLabelContent((current) => ({ ...current, brand: false }));
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

    const resolvedDetailMap: Record<string, DetailResponse> = { ...labelDetailMap };
    const missingIds = selectedLabelItems
      .map((item) => String(item.variant_id || ""))
      .filter((id) => id && !resolvedDetailMap[id]);

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

        for (const row of loaded) {
          if (row.detail) resolvedDetailMap[row.id] = row.detail;
        }
        setLabelDetailMap(resolvedDetailMap);
      } finally {
        setLabelDetailsBusy(false);
      }
    }

    const missingBarcodeItems = selectedLabelItems.filter((item) => {
      const id = String(item.variant_id || "");
      return !barcodeForLabelItem(item, resolvedDetailMap[id]?.item || null);
    });

    setLabelComposerOpen(true);
    if (missingBarcodeItems.length) {
      const first = missingBarcodeItems[0];
      setMessage(
        `${missingBarcodeItems.length} terméknek nincs mentett bárkódja. A címkenyomtatás csak a termékhez elmentett kódot használja. Első hiányzó: ${first.title_ro || first.variant_id || "termék"}.`
      );
    }
  }

  useEffect(() => {
    saveWarehouseLabelPrintMode(labelPrintMode);
  }, [labelPrintMode]);

  useEffect(() => {
    if (!labelComposerOpen) return;
    const frame = labelPreviewFrameRef.current;
    if (!frame) return;

    const updatePreviewScale = () => {
      // 1 mm = 96 / 25.4 CSS pixel. A belső 28 px a preview keretének kétoldali paddingje.
      const a4WidthPx = 210 * 96 / 25.4;
      const availableWidth = Math.max(240, frame.clientWidth - 28);
      const nextScale = Math.min(
        WAREHOUSE_LABEL_PREVIEW_SCALE,
        Math.max(0.32, availableWidth / a4WidthPx),
      );
      setLabelPreviewScale((current) => Math.abs(current - nextScale) < 0.002 ? current : Number(nextScale.toFixed(4)));
    };

    updatePreviewScale();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updatePreviewScale) : null;
    observer?.observe(frame);
    window.addEventListener("resize", updatePreviewScale);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePreviewScale);
    };
  }, [labelComposerOpen]);

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
  const requestedLabelMarginXmm = labelMm(labelMarginX, 5, 0, 25);
  const requestedLabelMarginYmm = labelMm(labelMarginY, 5, 0, 25);
  // A címkék közti rés valódi üres vágási sáv. A megadott címkeméretet nem
  // zsugorítjuk; ha kell, inkább a külső A4-margó csökken automatikusan.
  const maxLabelGapXmm = labelColCount > 1
    ? Math.max(0, (210 - labelColCount * labelW) / (labelColCount - 1))
    : 0;
  const maxLabelGapYmm = labelRowCount > 1
    ? Math.max(0, (297 - labelRowCount * labelH) / (labelRowCount - 1))
    : 0;
  const labelGapXmm = labelColCount > 1 ? Math.min(WAREHOUSE_LABEL_GAP_X_MM, maxLabelGapXmm) : 0;
  const labelGapYmm = labelRowCount > 1 ? Math.min(WAREHOUSE_LABEL_GAP_Y_MM, maxLabelGapYmm) : 0;
  const maxLabelMarginXmm = Math.max(0, (210 - labelColCount * labelW - (labelColCount - 1) * labelGapXmm) / 2);
  const maxLabelMarginYmm = Math.max(0, (297 - labelRowCount * labelH - (labelRowCount - 1) * labelGapYmm) / 2);
  const labelMarginXmm = Math.min(requestedLabelMarginXmm, maxLabelMarginXmm);
  const labelMarginYmm = Math.min(requestedLabelMarginYmm, maxLabelMarginYmm);
  const labelsPerPage = Math.max(1, labelColCount * labelRowCount);

  const labelRowsForPrint = useMemo(() => {
    return selectedLabelItems.map((item) => {
      const id = String(item.variant_id || "");
      const detailItem = labelDetailMap[id]?.item || {};
      const barcode = barcodeForLabelItem(item, detailItem);
      const copies = labelInt(labelCopies[id], labelInt(defaultLabelCopiesForItem(item), 1, 1, 999), 0, 999);
      const mergedLabelItem = { ...item, ...detailItem } as InventoryItem;
      const colorCode = firstWarehouseText(
        detailItem.color_code,
        detailItem.supplier_color_code,
        detailItem.supplierColorCode,
        item.color_code,
        (item as any).supplier_color_code,
        (item as any).supplierColorCode,
      );
      const price = item.sell_price == null ? "" : String(item.sell_price);
      return {
        item,
        id,
        barcode,
        copies,
        imageUrl: labelComposerImageUrl(item, detailItem),
        title: detailItem.title_ro || item.title_ro || "-",
        brand: detailItem.brand_name || item.brand_name || "-",
        category: detailItem.subcategory_name_ro || item.subcategory_name_ro || detailItem.subcategory_name_hu || item.subcategory_name_hu || detailItem.product_type || item.product_type || "-",
        size: detailItem.size || item.size || "-",
        color: colorCode || "-",
        description: detailItem.material || item.material || "",
        productCode: labelProductCodeForItem(mergedLabelItem),
        price,
        stockQty: Math.floor(n(item.total_qty)),
        render: labelCode128Svg(barcode, 52),
      };
    });
  }, [selectedLabelItems, labelCopies, labelDetailMap]);

  const labelInvalidRows = useMemo(
    () => labelRowsForPrint.filter((row) => row.copies > 0 && !row.render.ok),
    [labelRowsForPrint]
  );

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

  const labelPrintReady = labelPrintItems.length > 0 && labelInvalidRows.length === 0;

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
    "--aif-label-gap-x": `${labelGapXmm}mm`,
    "--aif-label-gap-y": `${labelGapYmm}mm`,
    "--aif-label-page-w": "210mm",
    "--aif-label-page-h": "297mm",
    "--aif-label-preview-scale": String(labelPreviewScale),
    "--aif-label-preview-w": `${210 * labelPreviewScale}mm`,
    "--aif-label-preview-h": `${297 * labelPreviewScale}mm`,
  } as React.CSSProperties & Record<string, string>;

  const zebraLabelPreviewScale = useMemo(() => {
    const widthPx = labelW * 96 / 25.4;
    const heightPx = labelH * 96 / 25.4;
    return Math.max(0.8, Math.min(1.85, 330 / Math.max(1, widthPx), 360 / Math.max(1, heightPx)));
  }, [labelW, labelH]);

  function printGeneratedLabels(options: { testOnly?: boolean } = {}) {
    if (!labelPrintItems.length) {
      setMessage("Nincs nyomtatható címke. Állíts be legalább egy példányt.");
      return;
    }
    if (labelInvalidRows.length) {
      const first = labelInvalidRows[0];
      setMessage(
        `${labelInvalidRows.length} termék címkéje nem nyomtatható, mert nincs termékhez mentett, érvényes bárkód. Első érintett: ${first.title || first.id}.`
      );
      return;
    }

    const printItems = options.testOnly ? labelPrintItems.slice(0, 1) : labelPrintItems;
    const printHtml = labelPrintMode === "zebra"
      ? warehouseZebraLabelPrintDocumentHtml(
          printItems,
          { labelContent, labelCompanyName, labelCurrency, labelUnitText, labelShowBorder },
          labelW,
          labelH,
        )
      : warehouseLabelPrintDocumentHtml(
          (() => {
            const pages: WarehouseLabelPrintItem[][] = [];
            for (let i = 0; i < printItems.length; i += labelsPerPage) pages.push(printItems.slice(i, i + labelsPerPage));
            return pages;
          })(),
          { labelContent, labelCompanyName, labelCurrency, labelUnitText, labelShowBorder },
          { labelW, labelH, labelColCount, labelRowCount, labelMarginXmm, labelMarginYmm, labelGapXmm, labelGapYmm },
        );

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = labelPrintMode === "zebra" ? `${labelW}mm` : "210mm";
    // Zebra módban a rejtett nyomtatási dokumentum viewportja eddig mindig csak
    // egyetlen címke magas volt. A második/harmadik oldal benne volt a HTML-ben,
    // de Chromium + a Zebra driver kombinációja így képes volt csak az első oldalt
    // spoololni. A viewport most a teljes példányszám magasságát lefedi.
    iframe.style.height = labelPrintMode === "zebra"
      ? `${Math.max(labelH, labelH * Math.max(1, printItems.length))}mm`
      : "297mm";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.overflow = "visible";
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
      // Kényszerítjük a teljes többoldalas Zebra dokumentum layoutját a print()
      // előtt. Ez különösen a kis egyedi papírméreteknél számít.
      void printDocument.documentElement.offsetHeight;
      void printDocument.body?.offsetHeight;
      printWindow.focus();
      printWindow.print();
      cleanupTimer = window.setTimeout(cleanup, 60000);
    };

    printWindow.requestAnimationFrame(() => {
      printWindow.requestAnimationFrame(() => {
        window.setTimeout(runPrint, labelPrintMode === "zebra" ? 120 : 0);
      });
    });
  }

  function WarehouseZebraLabelContent({ label }: { label: WarehouseLabelPrintItem }) {
    const priceParts = labelPriceParts(label.price);
    const productCodeWithColor = warehouseZebraProductCodeWithColor(label);
    const barsSvg = warehouseZebraBarcodeBarsSvg(label.render);
    const hasInfo = Boolean(
      (labelContent.description && label.description) ||
      (labelContent.category && label.category && label.category !== "-")
    );

    return (
      <>
        {labelContent.company && labelCompanyName && <div className="aifWhLabelCompany">{labelCleanText(labelCompanyName, 48)}</div>}
        {labelContent.brand && label.brand && label.brand !== "-" && <div className="aifWhLabelBrand">{labelCleanText(label.brand, 42)}</div>}
        {labelContent.title && <div className="aifWhLabelTitle">{labelCleanText(label.title || "Produs", 72)}</div>}
        {labelContent.sizeColor && label.size && label.size !== "-" && (
          <div className="aifWhLabelMeta"><span>{labelCleanText(label.size, 16)}</span></div>
        )}
        {labelContent.barcode && (
          <div className="aifWhZebraBarcodeArea">
            <div className="aifWhBarcodeSvgWrap" dangerouslySetInnerHTML={{ __html: barsSvg }} />
            <div className="aifWhZebraBarcodeText">{labelCleanText(label.barcode, 64)}</div>
          </div>
        )}
        {hasInfo && (
          <div className="aifWhZebraInfo">
            {labelContent.description && label.description && <div className="aifWhLabelDescription">{labelCleanText(label.description, 78)}</div>}
            {labelContent.category && label.category && label.category !== "-" && <div className="aifWhLabelCategory">{labelCleanText(label.category, 34)}</div>}
          </div>
        )}
        {labelContent.code && (productCodeWithColor || label.barcode) && <div className="aifWhLabelCode">Cod: {labelCleanText(productCodeWithColor || label.barcode, 56)}</div>}
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

  function WarehouseLabelContent({ label }: { label: WarehouseLabelPrintItem }) {
    const priceParts = labelPriceParts(label.price);
    const productCodeWithColor = [label.productCode, label.color]
      .map((value) => String(value || "").trim())
      .filter((value) => value && value !== "-")
      .filter((value, index, all) => all.findIndex((entry) => normalizeSearch(entry) === normalizeSearch(value)) === index)
      .join(" - ");
    return (
      <>
        {labelContent.company && labelCompanyName && <div className="aifWhLabelCompany">{labelCleanText(labelCompanyName, 48)}</div>}
        {labelContent.brand && label.brand && label.brand !== "-" && <div className="aifWhLabelBrand">{labelCleanText(label.brand, 42)}</div>}
        {labelContent.title && <div className="aifWhLabelTitle">{labelCleanText(label.title || "Produs", 72)}</div>}
        {labelContent.sizeColor && label.size && label.size !== "-" && (
          <div className="aifWhLabelMeta">
            <span>{labelCleanText(label.size, 16)}</span>
          </div>
        )}
        {labelContent.barcode && <div className="aifWhBarcodeSvgWrap" dangerouslySetInnerHTML={{ __html: label.render.ok ? label.render.svg : "" }} />}
        {labelContent.description && label.description && <div className="aifWhLabelDescription">{labelCleanText(label.description, 90)}</div>}
        {labelContent.category && label.category && label.category !== "-" && <div className="aifWhLabelCategory">{labelCleanText(label.category, 34)}</div>}
        {labelContent.code && (productCodeWithColor || label.barcode) && <div className="aifWhLabelCode">Cod: {labelCleanText(productCodeWithColor || label.barcode, 56)}</div>}
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
    if (checked) rememberSelectionReturnAnchor(id);
    if (incomingFocus?.batchId) {
      setIncomingSelectedVariants((current) => {
        const next = { ...current };
        if (checked) next[id] = true;
        else delete next[id];
        return next;
      });
      return;
    }

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
      setPersistedSelectedItems((current) => current.filter((item) => selectedVariantIdFromItem(item) !== id));
    }

    void runSelectedVariantMutation(
      () => checked
        ? apiAddSelectedVariantSelection([{ variantId: id }])
        : apiRemoveSelectedVariantSelection([id]),
      checked ? "A termék kijelölése nem sikerült." : "A termék kijelölésének törlése nem sikerült.",
    ).catch(() => undefined);
  }

  function toggleAllFilteredSelection(checked: boolean) {
    const progressVariantId = filteredVariantIds[filteredVariantIds.length - 1] || filteredVariantIds[0] || "";
    if (checked && progressVariantId) rememberSelectionReturnAnchor(progressVariantId);
    if (incomingFocus?.batchId) {
      setIncomingSelectedVariants((current) => {
        const next = { ...current };
        for (const id of filteredVariantIds) {
          if (checked) next[id] = true;
          else delete next[id];
        }
        return next;
      });
      return;
    }

    const ids = Array.from(new Set(filteredVariantIds.map((id) => String(id || "").trim()).filter(Boolean)));
    if (!ids.length) return;
    setSelectedVariants((current) => {
      const next = { ...current };
      for (const id of ids) {
        if (checked) next[id] = true;
        else delete next[id];
      }
      return next;
    });
    if (!checked) {
      const removedSet = new Set(ids);
      setSelectedWorkActions((current) => {
        const next = { ...current };
        for (const id of ids) delete next[id];
        return next;
      });
      setPersistedSelectedItems((current) => current.filter((item) => !removedSet.has(selectedVariantIdFromItem(item))));
    }

    void runSelectedVariantMutation(
      () => checked
        ? apiAddSelectedVariantSelection(ids.map((variantId) => ({ variantId })))
        : apiRemoveSelectedVariantSelection(ids),
      checked ? "A szűrt termékek kijelölése nem sikerült." : "A szűrt kijelölések törlése nem sikerült.",
    ).catch(() => undefined);
  }

  function clearIncomingSelection() {
    setIncomingSelectedVariants({});
  }

  function clearSelectedVariants() {
    setSelectedVariants({});
    setSelectedWorkActions({});
    setPersistedSelectedItems([]);
    setSelectedActionTargets([]);
    setSelectedWorkPanel(null);
    setSelectedPanelOpen(false);
    void runSelectedVariantMutation(
      () => apiClearSelectedVariantSelection(),
      "A kijelölések törlése nem sikerült.",
    ).catch(() => undefined);
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
    let disposed = false;
    const refreshSharedSelection = () => {
      if (disposed || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      void refreshSelectedVariantSelection({ quiet: true });
    };
    const timer = window.setInterval(refreshSharedSelection, 2000);
    const onFocus = () => refreshSharedSelection();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSharedSelection();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (selectedPanelOpen && selectedCount <= 0) setSelectedPanelOpen(false);
    if (selectedWorkPanel && selectedWorkCounts[selectedWorkPanel] <= 0) setSelectedWorkPanel(null);
  }, [selectedPanelOpen, selectedCount, selectedWorkPanel, selectedWorkCounts.label, selectedWorkCounts.order, selectedWorkCounts.move, selectedWorkCounts.shopify]);

  const activationTodoItems = useMemo(
    () => inventoryDisplayItems.filter((x) => n(x.total_qty) > 0 && needsWarehouseActivation(x)),
    [inventoryDisplayItems],
  );
  const activationTodoCount = activationTodoItems.length;

  function showActivationTodoList() {
    setIncomingFocus(null);
    setIncomingFocusItems([]);
    setStockFilter("watch");
    setSortMode("incoming_desc");
    setFiltersOpen(false);
    setSummaryOpen(false);
    setListOpen(true);
    setProductPage(1);
    setMessage(
      activationTodoItems.length === 1
        ? `Ezt az 1 aktiválandó készletes variánst mutatom: ${firstWarehouseText(activationTodoItems[0].title_ro, activationTodoItems[0].shopify_title, activationTodoItems[0].model_code, activationTodoItems[0].variant_id)}.`
        : `Az aktiválandó készletes variánsokat mutatom (${activationTodoItems.length}). Minden méretet és színt külön kell Aktívra tenni.`,
    );
    if (activationTodoItems.length === 1) {
      window.setTimeout(() => queueProductRowJump(activationTodoItems[0].variant_id), 0);
    } else {
      window.setTimeout(() => productListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
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
      // A törzsadat és a készlet azonnal betöltődik. A terméklista utána,
      // lapokban épül fel, ezért nem marad 0 minden csak azért, mert egy inventory lap lassú.
      const [meta, stock] = await Promise.all([apiMeta(), apiStock()]);

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

      await apiInventory((partialItems, done) => {
        const stockBackedItems = stockBackedInventoryItems(partialItems, stock.items || []);
        setItems(stockBackedItems.filter((x) => !isArchivedInventoryItem(x)));
        if (!done) setMessage(`Raktár betöltése: ${partialItems.length.toLocaleString("hu-HU")} variáns már használható…`);
      });

      setMessage("");

      try {
        const savedSelection = await apiSelectedVariantSelection();
        applyPersistedSelectedWorklist((savedSelection.items || []).filter((row) => selectedVariantIdFromItem(row)));
      } catch (selectionError) {
        console.error("AIF selected variants load skipped", selectionError);
      }
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült betölteni a raktár adatait.");
    } finally {
      setBusy(false);
    }
  }

  function barcodeReturnContextForVariant(variantId: string): WarehouseBarcodeReturnContext {
    const cleanVariantId = String(variantId || "").trim();
    const anchor = detailReturnAnchorRef.current;
    const node = cleanVariantId ? findVisibleProductNode(cleanVariantId) : null;
    const rowViewportTop = anchor?.rowViewportTop ?? (node ? node.getBoundingClientRect().top : null);
    return {
      filters: anchor?.filters || currentWarehouseFilterSnapshot(),
      productPage: anchor?.productPage || safeProductPage,
      scrollY: anchor?.scrollY ?? (typeof window !== "undefined" ? window.scrollY : 0),
      rowViewportTop: typeof rowViewportTop === "number" && Number.isFinite(rowViewportTop) ? rowViewportTop : null,
      nextVariantId: anchor?.nextVariantId || null,
      previousVariantId: anchor?.previousVariantId || null,
      incomingFocusBatchId: incomingFocus?.batchId || null,
      incomingFocusMode: incomingFocus?.mode || null,
    };
  }

  async function openDetail(id: string) {
    rememberDetailReturnAnchor(id);
    // A korábbi "Folytatás innen" jelzés addig maradjon látható, amíg ténylegesen
    // el nem kezdjük a következő terméket. Nem időzítő dönti el helyettünk.
    setHighlightProductId("");
    setDetailCloseConfirmOpen(false);
    setEditBarcodeConflict(null);
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
      const duplicate = items.find((item) =>
        normalizeSearch(cleanScannedBarcode(item.barcode || "")) === normalizeSearch(code) &&
        String(item.variant_id || "") !== currentVariantId
      );
      setEdit((current) => ({ ...current, barcode: code }));
      setEditBarcodeConflict(duplicate ? barcodeConflictInfoFromInventoryItem(duplicate, code) : null);
      setMessage(duplicate ? "" : `Vonalkód beolvasva és beírva: ${code}. Mentéssel rögzül a terméken.`);
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
    if (genderFilters.length === 1) next.gender = genderFilters[0];
    next.supplierId = supplier !== "all" ? String(selectedSupplier?.id || "") : "";
    setNewProduct(next);
    setNewProductStockRows(emptyStockRowsByLocation("0"));
    setNewProductBarcodeConflict(null);
    setNewProductOpen(true);
    setMessage("");
  }

  function closeNewProductModal() {
    if (newProductSaving) return;
    setNewProductOpen(false);
    setNewProduct(emptyNewProductForm());
    setNewProductStockRows({});
    setNewProductBarcodeConflict(null);
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
    if (effectiveNewProductBarcodeConflict) {
      setNewProductBarcodeConflict(effectiveNewProductBarcodeConflict);
      setMessage("");
      return;
    }
    setNewProductSaving(true);
    setMessage("");
    try {
      const requestedBarcode = cleanScannedBarcode(newProduct.barcode);
      if (requestedBarcode) {
        const barcodeCheck = await apiBarcodeConflictCheck(requestedBarcode);
        const conflictInfo = barcodeCheck.conflict
          ? barcodeConflictInfoFromApi({ barcode: barcodeCheck.barcode, conflict: barcodeCheck.conflict })
          : null;
        if (conflictInfo) {
          setNewProductBarcodeConflict(conflictInfo);
          return;
        }
        setNewProductBarcodeConflict(null);
      }

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
      setNewProductBarcodeConflict(null);
      if (createdVariantId) {
        resetListFiltersForProductFocus(createdSearchText, createdScannedCode && normalizeSearch(createdScannedCode) === normalizeSearch(createdSearchText) ? createdScannedCode : "");
        queueProductRowJump(createdVariantId);
      }
      setMessage(createdVariantId
        ? `Új termék rögzítve ${totalQty} db készlettel. A terméksorra ugrottam, nem nyitottam külön adatlapot.`
        : `Új termék rögzítve ${totalQty} db készlettel.`);
    } catch (e: any) {
      const conflictInfo = barcodeConflictInfoFromApi(e);
      if (conflictInfo) {
        setNewProductBarcodeConflict(conflictInfo);
        setMessage("");
      } else {
        setMessage(e.message || "Nem sikerült létrehozni az új terméket.");
      }
    } finally {
      setNewProductSaving(false);
    }
  }

  async function saveDetail(options: { closeAfter?: boolean; closeAfterSave?: boolean } = {}) {
    const shouldCloseAfter = Boolean(options.closeAfter || options.closeAfterSave);
    if (!detail?.item?.id) return false;
    if (!detailHasChanges) {
      if (shouldCloseAfter) closeDetailImmediately();
      return true;
    }
    const detailId = String(detail.item.id || detail.item.variant_id || "");
    if (effectiveEditBarcodeConflict) {
      setEditBarcodeConflict(effectiveEditBarcodeConflict);
      setDetailCloseConfirmOpen(false);
      setMessage("");
      return false;
    }
    const priceHistoryEntry = makeWarehousePriceHistoryEntry({
      variantId: detailId,
      before: editBaseline,
      after: edit,
      item: detail?.item || null,
    });
    // Az árváltozást a backend naplózza a Termék History-ba.
    // Nem írjuk még egyszer localStorage-ba / attributes-be, mert attól ugyanaz az egy módosítás több sorban jelent meg.
    const wasActivationWorkView = stockFilter === "watch" || incomingFocus?.mode === "activation";
    const previousModelStatus = String(editBaseline.modelStatus || "").trim().toLowerCase();
    const previousVariantStatus = String(editBaseline.variantStatus || "").trim().toLowerCase();
    const nextModelStatus = String(edit.modelStatus || "").trim().toLowerCase();
    const nextVariantStatus = String(edit.variantStatus || "").trim().toLowerCase();
    const explicitlyActivatingVariant = nextVariantStatus === "active" && (previousVariantStatus !== "active" || previousModelStatus !== "active");
    const activatingSharedModel = previousModelStatus !== "active" && nextModelStatus === "active";
    const activationCandidate = {
      ...detail.item,
      image_url: edit.imageUrl,
      barcode: edit.barcode,
      title_ro: edit.titleRo,
      size: edit.size,
      buy_price: edit.buyPrice,
      sell_price: edit.sellPrice,
      model_status: nextModelStatus,
      variant_status: nextVariantStatus,
    };
    const activationMissing = explicitlyActivatingVariant ? activationRequiredMissingFields(activationCandidate) : [];
    if (activationMissing.length) {
      setMessage(`Ezt a konkrét variánst még nem lehet aktiválni. Hiányzik: ${activationMissing.join(", ")}. A termékkód nem helyettesíti az egyedi vonalkódot.`);
      return false;
    }

    setSaving(true);
    setMessage("");
    let deactivatedSiblingIds: string[] = [];
    try {
      const requestedBarcode = cleanScannedBarcode(edit.barcode);
      if (requestedBarcode) {
        const barcodeCheck = await apiBarcodeConflictCheck(requestedBarcode, detailId);
        const conflictInfo = barcodeCheck.conflict
          ? barcodeConflictInfoFromApi({ barcode: barcodeCheck.barcode, conflict: barcodeCheck.conflict })
          : null;
        if (conflictInfo) {
          setEditBarcodeConflict(conflictInfo);
          setDetailCloseConfirmOpen(false);
          return false;
        }
        setEditBarcodeConflict(null);
      }

      const normalizedEditColor = normalizeColor(edit.colorName);
      const normalizedEditSize = normalizeSize(edit.size);
      const supplierVariantCode = firstWarehouseText(
        detail.item.supplier_variant_code,
        detail.item.supplierVariantCode,
        [edit.supplierProductCode, normalizedEditColor || edit.colorCode, normalizedEditSize].filter(Boolean).join("::")
      );
      // A Modell állapot közös minden méretre és színre. Amikor egy régi draft modellt
      // először aktiválunk, a testvérvariánsokat előbb Inaktívra tesszük. Így a közös
      // modell aktiválása nem rántja át automatikusan az S/M/XL sorokat a Raktárba.
      if (activatingSharedModel) {
        const currentModelId = firstWarehouseText(detail.item.model_id, detail.item.modelId);
        if (currentModelId) {
          const siblingIds = Array.from(new Set(
            inventoryDisplayItems
              .filter((item) => String(item.variant_id || "") !== detailId)
              .filter((item) => firstWarehouseText((item as any).model_id, (item as any).modelId) === currentModelId)
              .filter((item) => itemVariantStatus(item) === "active")
              .map((item) => String(item.variant_id || "").trim())
              .filter(Boolean)
          ));
          for (const siblingId of siblingIds) {
            await apiVariantUpdate(siblingId, { status: "inactive" });
          }
          deactivatedSiblingIds = siblingIds;
        }
      }

      const variantUpdatePayload: Record<string, unknown> = {
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
        supplierId: detail.item.supplier_id || detail.item.supplierId || null,
        supplierProductCode: edit.supplierProductCode,
        productCode: edit.supplierProductCode,
        // A termékkód modell-szintű adat, ezért több színnél és méretnél is azonos lehet.
        // A rejtett variánskód, a szín és a méret együtt különbözteti meg a variánsokat.
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
        status: edit.variantStatus,
      };
      await apiVariantUpdate(detail.item.id, variantUpdatePayload);

      // Azonos termék + azonos szín + más méret esetén a kép és a leírás közös.
      // Más színhez NEM nyúlunk. Így pl. S/M/L ugyanazt a DENIM fotót/leírást kapja,
      // de egy BLACK vagy WHITE variáns megtartja a saját képét.
      const siblingSource: InventoryItem = {
        ...(detail.item as InventoryItem),
        variant_id: detailId,
        model_id: firstWarehouseText(detail.item.model_id, detail.item.modelId) || null,
        brand_code: edit.brandCode || detail.item.brand_code || null,
        brand_name: detail.item.brand_name || null,
        color_code: edit.colorCode || detail.item.color_code || null,
        color_name: normalizedEditColor || detail.item.color_name || null,
        size: normalizedEditSize || detail.item.size || null,
        supplier_product_code: edit.supplierProductCode || detail.item.supplier_product_code || null,
        model_code: detail.item.model_code || null,
      };
      const sameColorSizeSiblings = inventoryDisplayItems.filter((item) => warehouseSameColorSizeSibling(siblingSource, item));
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

      const d = await apiVariantDetail(detail.item.id);

      // Egy termékadat módosítása miatt nem kérjük le újra a teljes raktárt.
      // A PATCH után a friss variánst visszaolvassuk és helyben cseréljük ki.
      // Ez teszi az egyszerű mezőmódosítást (pl. Anyag) azonnal használhatóvá.
      const freshItem = (current: InventoryItem): InventoryItem => {
        const serverItem = (d.item || {}) as Record<string, any>;
        return {
          ...current,
          ...serverItem,
          variant_id: detailId,
          supplier_product_code: supplierProductCodeFromDetail(d) || current.supplier_product_code || null,
          supplierProductCode: supplierProductCodeFromDetail(d) || current.supplierProductCode || current.supplier_product_code || null,
          total_qty: serverItem.total_qty ?? current.total_qty,
          total_reserved_qty: serverItem.total_reserved_qty ?? current.total_reserved_qty,
          available_qty: serverItem.available_qty ?? current.available_qty,
          last_stock_movement_at: serverItem.last_stock_movement_at ?? current.last_stock_movement_at,
        };
      };
      const updateSavedRows = (current: InventoryItem[]) => current.map((item) => {
        const itemId = String(item.variant_id || "").trim();
        if (itemId === detailId) return freshItem(item);
        if (inheritedSiblingIds.includes(itemId)) {
          return {
            ...item,
            ...(String(edit.imageUrl || '').trim() ? { image_url: edit.imageUrl } : {}),
            ...(String(edit.descriptionRo || '').trim() ? { description_ro: edit.descriptionRo } : {}),
          };
        }
        if (activatingSharedModel && deactivatedSiblingIds.includes(itemId)) {
          return { ...item, model_status: nextModelStatus, variant_status: "inactive" };
        }
        return item;
      });
      setItems(updateSavedRows);
      setIncomingFocusItems(updateSavedRows);

      if (priceHistoryEntry && historyTarget && String(historyTarget.variant_id || (historyTarget as any).id || "") === detailId) {
        try {
          const refreshedHistory = await apiVariantHistory(detailId);
          setVariantHistory(mergeVariantHistoryPriceEvents(refreshedHistory));
        } catch {
          // Nem kritikus: a következő Frissítés vagy újranyitás úgyis behozza.
        }
      }
      // Egy sor kizárólag akkor hagyhatja el az aktiválandó listát, ha ezt a konkrét
      // variánst Aktívra állítottuk. A backendből visszaérkező régi/default „active”
      // érték többé nem aktiválhat testvérméreteket a felhasználó helyett.
      const resolvedActivation = nextModelStatus === "active" && nextVariantStatus === "active";
      let detailClosedDuringSave = false;
      let preferNextAfterClose = false;
      if (incomingFocus?.batchId && incomingFocus.mode === "activation" && resolvedActivation) {
        setIncomingFocusItems((current) => current.filter((item) => selectedVariantIdFromItem(item) !== detailId));
        setIncomingFocus((current) => current ? {
          ...current,
          variantIds: (current.variantIds || []).filter((id) => String(id || "") !== detailId),
          rows: (current.rows || []).filter((row: any) => String(row.variant_id || row.variantId || "") !== detailId),
        } : current);
      }
      if (wasActivationWorkView && resolvedActivation) {
        detailClosedDuringSave = true;
        preferNextAfterClose = true;
        closeDetailImmediately({ restoreListPosition: false });
      } else if (shouldCloseAfter) {
        detailClosedDuringSave = true;
        closeDetailImmediately({ restoreListPosition: false });
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
      if (detailClosedDuringSave) {
        // A visszatérési pontot AZONNAL mutatjuk, nem egy teljes raktár-újratöltés után.
        window.requestAnimationFrame(() => restoreDetailReturnPosition({ preferNext: preferNextAfterClose }));
      }
      if (wasActivationWorkView && resolvedActivation) {
        setMessage(deactivatedSiblingIds.length
          ? `Ez a konkrét variáns aktív lett. A modell további ${deactivatedSiblingIds.length} méret-/színvariánsa az aktiválandó listán maradt, amíg azokat külön Aktívra nem teszed.`
          : "Ez a konkrét variáns aktív lett, ezért levettem az aktiválandó listáról. A többi méret és szín állapota nem változott.");
        setHighlightProductId((current) => current === detailId ? "" : current);
        setPendingProductJumpId((current) => current === detailId ? "" : current);
      } else if (wasActivationWorkView && nextModelStatus === "active" && nextVariantStatus !== "active") {
        setMessage(deactivatedSiblingIds.length
          ? `A közös modell aktív, de ez a variáns továbbra is Inaktív. A további ${deactivatedSiblingIds.length} variáns szintén az aktiválandó listán maradt.`
          : "A modell aktív, de ez a konkrét variáns még Inaktív, ezért az aktiválandó listán maradt.");
      } else {
        const siblingMessage = inheritedSiblingCount
          ? ` Azonos színű további ${inheritedSiblingCount} méretváltozat átvette a képet/leírást.${inheritedSiblingFailed ? ` ${inheritedSiblingFailed} méret frissítése nem sikerült.` : ''}`
          : inheritedSiblingFailed
            ? ` ${inheritedSiblingFailed} azonos színű méret frissítése nem sikerült.`
            : '';
        setMessage((priceHistoryEntry
          ? (shouldCloseAfter ? "A változtatások mentve, az árváltozás bekerült a Termék History-ba." : "A termékadatok mentve, az árváltozás bekerült a Termék History-ba.")
          : (shouldCloseAfter ? "A változtatások mentve." : "A termékadatok mentése megtörtént.")) + siblingMessage
        );
      }
      return true;
    } catch (e: any) {
      const conflictInfo = barcodeConflictInfoFromApi(e);
      if (conflictInfo) {
        setEditBarcodeConflict(conflictInfo);
        setDetailCloseConfirmOpen(false);
        setMessage("");
      } else {
        setMessage(e.message || "Nem sikerült menteni a termékadatokat.");
      }
      return false;
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
    const activeIncomingMode = incomingFocus?.mode || "import";
    try {
      const result = await apiVariantDelete(deletedVariantId);
      notifyStockMovesChanged({ variantId: deletedVariantId, source: "warehouse_variant_permanent_delete", mode: result?.mode || "deleted" });
      removeVariantFromWarehouseClientState(deletedVariantId);
      await removeCompletedSelectedItems([deletedVariantId]);
      setProductDeleteTarget(null);
      if (detail?.item?.id && String(detail.item.id) === deletedVariantId) setDetail(null);
      await load();
      if (activeIncomingBatchId && isUuidLike(activeIncomingBatchId)) {
        await loadIncomingFocusBatch(activeIncomingBatchId, false, activeIncomingMode);
      }
      setMessage(result?.mode === "archived" || result?.mode === "archived_after_delete_fallback"
        ? "Termék archiválva és eltávolítva a raktárlistából."
        : "Termék véglegesen törölve: készlet, import-kapcsolat, mozgásnapló és beszállítói kapcsolat kitakarítva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a terméket.");
    } finally {
      setSaving(false);
    }
  }

  function openSelectedProductsDeleteConfirm(context: "warehouse" | "incoming" = incomingFocus?.batchId ? "incoming" : "warehouse") {
    const sourceItems = context === "incoming" ? incomingSelectedItems : selectedItems;
    const ids = Array.from(new Set(sourceItems.map((item) => selectedVariantIdFromItem(item)).filter(Boolean)));
    if (!ids.length) {
      setMessage(context === "incoming" ? "Nincs kijelölt termék az utolsó bevételezés törléséhez." : "Nincs kijelölt termék törléshez.");
      return;
    }
    const itemById = new Map(sourceItems.map((item) => [selectedVariantIdFromItem(item), item]));
    const deleteItems = ids.map((id) => itemById.get(id)).filter(Boolean) as InventoryItem[];
    setBulkProductDeleteTarget({ ids, items: deleteItems, context });
  }

  async function confirmDeleteSelectedProducts() {
    if (!bulkProductDeleteTarget?.ids.length) return;
    const ids = Array.from(new Set(bulkProductDeleteTarget.ids.map((id) => String(id || "").trim()).filter(Boolean)));
    if (!ids.length) return;

    setSaving(true);
    setMessage("");
    const activeIncomingBatchId = String(incomingFocus?.batchId || "").trim();
    const activeIncomingMode = incomingFocus?.mode || "import";
    const failures: string[] = [];
    const successfullyDeletedIds: string[] = [];
    let archivedCount = 0;
    let permanentlyDeletedCount = 0;

    try {
      for (const id of ids) {
        try {
          const result = await apiVariantDelete(id);
          const mode = String(result?.mode || "deleted");
          if (mode === "archived" || mode === "archived_after_delete_fallback") archivedCount += 1;
          else permanentlyDeletedCount += 1;
          notifyStockMovesChanged({ variantId: id, source: "warehouse_selected_variants_delete", mode });
          successfullyDeletedIds.push(id);
          removeVariantFromWarehouseClientState(id);
        } catch (error: any) {
          failures.push(`${id}: ${error?.message || "törlési hiba"}`);
        }
      }

      const deleteContext = bulkProductDeleteTarget.context;
      setBulkProductDeleteTarget(null);
      if (deleteContext === "incoming") {
        setIncomingSelectedVariants((current) => {
          const next = { ...current };
          for (const id of successfullyDeletedIds) delete next[id];
          return next;
        });
      } else if (successfullyDeletedIds.length) {
        await removeCompletedSelectedItems(successfullyDeletedIds);
      }
      if (detail?.item?.id && ids.includes(String(detail.item.id))) setDetail(null);
      if (historyTarget?.variant_id && ids.includes(String(historyTarget.variant_id))) {
        setHistoryTarget(null);
        setVariantHistory(null);
        setVariantHistoryError("");
      }

      await load();
      if (activeIncomingBatchId && isUuidLike(activeIncomingBatchId)) {
        await loadIncomingFocusBatch(activeIncomingBatchId, false, activeIncomingMode);
      }

      const successCount = ids.length - failures.length;
      const modeText = [
        permanentlyDeletedCount ? `${permanentlyDeletedCount} végleg törölve` : "",
        archivedCount ? `${archivedCount} archiválva` : "",
      ].filter(Boolean).join(" • ");
      setMessage(failures.length
        ? `Kijelölt termékek törlése részben sikerült: ${successCount}/${ids.length}. ${modeText || ""} Hibás: ${failures.slice(0, 3).join(" | ")}${failures.length > 3 ? " ..." : ""}`
        : `Kijelölt termékek törölve: ${ids.length} termék. ${modeText || ""}`
      );
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

    const barcodeReturnTarget = consumeWarehouseBarcodeReturnTarget();
    const incomingPayload = consumeIncomingShowAllFlag();
    load().then(async () => {
      const returnVariantId = String(barcodeReturnTarget?.variantId || "").trim();
      if (returnVariantId) {
        const returnContext = barcodeReturnTarget?.context || null;
        const returnBatchId = String(returnContext?.incomingFocusBatchId || "").trim();

        if (returnBatchId && isUuidLike(returnBatchId)) {
          await loadIncomingFocusBatch(
            returnBatchId,
            false,
            returnContext?.incomingFocusMode === "activation" ? "activation" : "import",
            { silentFailure: true },
          );
        }

        if (returnContext?.filters) restoreWarehouseFilterSnapshot(returnContext.filters);
        else resetWarehouseFilters(false);

        setProductPage(Math.max(1, Number(returnContext?.productPage || 1)));
        setSummaryOpen(false);
        setListOpen(true);

        const returnCandidates = [
          returnVariantId,
          returnContext?.nextVariantId,
          returnContext?.previousVariantId,
        ].map((value) => String(value || "").trim()).filter(Boolean);
        pendingProductJumpCandidateIdsRef.current = Array.from(new Set(returnCandidates));
        pendingProductJumpFallbackRef.current = {
          productPage: Math.max(1, Number(returnContext?.productPage || 1)),
          scrollY: Math.max(0, Number(returnContext?.scrollY || 0)),
        };
        pendingProductJumpViewportTopRef.current =
          typeof returnContext?.rowViewportTop === "number" && Number.isFinite(returnContext.rowViewportTop)
            ? returnContext.rowViewportTop
            : null;
        setPendingProductJumpId(returnVariantId);
        setHighlightProductId(returnVariantId);
        setBarcodeReturnNotice(barcodeReturnTarget);
        setMessage("");
        return;
      }

      const batchId = String(incomingPayload?.importBatchId || incomingPayload?.batchId || "").trim();
      if (batchId && isUuidLike(batchId)) {
        await loadIncomingFocusBatch(batchId, true, "activation");
      } else if (incomingPayload) {
        setMessage("Készletre vétel után töröltem a raktárszűrőket és betöltöttem az utolsó bevételezés sorait. Ha egy import sor már meglévő variánsra ment, a fő raktári termékszám nem nő, csak a készlet badge változik.");
      }
    });

    const onIncomingShowAll = () => {
      const payload = consumeIncomingShowAllFlag();
      load().then(async () => {
        const batchId = String(payload?.importBatchId || payload?.batchId || "").trim();
        if (batchId && isUuidLike(batchId)) {
          await loadIncomingFocusBatch(batchId, true, "activation");
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
  const showPurchaseContext = invoiceFilter !== "all" || sortMode === "incoming_desc" || sortMode === "incoming_asc";
  const showShopifyConnectionContext = shopifyFilter === "recent_mapped" || sortMode === "shopify_connected_desc";

  return (
    <main className={page}>
      <style id="aifWarehouseLabelPrintCss">{WAREHOUSE_LABEL_APP_CSS}</style>
      <div className={`${shell} aifWarehouseScreenContent`}>
        <header className="sticky top-2 z-50 rounded-2xl border border-white/20 bg-[#303a4c]/95 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.05] backdrop-blur">
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
              <button
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/90 bg-white p-[2px] text-[#008060] shadow-[0_5px_14px_rgba(15,23,42,0.18)] transition hover:border-[#cfe1a8] hover:bg-[#fbfdf7] focus:outline-none focus:ring-2 focus:ring-[#95bf47]/45"
                onClick={() => setShopifySyncCenterOpen(true)}
                type="button"
                title="Shopify központ: kapcsolatok, újraszinkron és exportelőzmények"
                aria-label="Shopify központ"
              >
                <ShopifyBrandMark size="md" fill className="!h-7 !w-7" />
              </button>
              {hasActiveWarehouseFilters && <button className={headerPrimaryBtn} onClick={() => resetWarehouseFilters()} type="button"><Eye size={14} /> Minden termék</button>}
              <button className={headerBtnSoft} onClick={() => void focusLatestCommittedImportBatch()} disabled={busy || recentImportFocusBusy} type="button" title="A legutóbb készletre vett import konkrét terméksorait mutatja">
                <PackageCheck size={15} /> {recentImportFocusBusy ? "Import betöltése..." : "Utolsó import"}
              </button>
              <button className={headerBtnSoft} onClick={load} disabled={busy}><RefreshCw size={15} /> Frissítés</button>
              <button className={`${headerBtn} ml-2 border-white/30 bg-[#263246] px-3`} onClick={goHome} type="button" title="Kezdőlap"><Home size={15} /> Kezdőlap</button>
            </div>
          </div>
        </header>

        {message && <div className="rounded-xl border border-white/20 bg-[#404a5b] px-4 py-3 text-sm text-white/85">{message}</div>}
        {barcodeReturnNotice && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#7bd7d4]/40 bg-[#203f49] px-4 py-3 text-sm text-white shadow-lg">
            <div className="min-w-0">
              <p className="text-[#d7fffd]">
                {barcodeReturnNotice.barcode
                  ? `A bárkód elmentve: ${barcodeReturnNotice.barcode}.`
                  : "Visszatértél a raktárlistára."}
              </p>
              <p className="mt-0.5 text-xs text-white/58">
                A terméksor kiemelve marad, így azonnal folytathatod a következő termékkel.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                className={primaryBtn}
                type="button"
                onClick={() => {
                  const variantId = String(barcodeReturnNotice.variantId || "").trim();
                  setBarcodeReturnNotice(null);
                  if (variantId) void openDetail(variantId);
                }}
              >
                <Edit3 size={15} /> Termékadatlapra
              </button>
              <button className={btnSoft} type="button" onClick={() => setBarcodeReturnNotice(null)}>
                <X size={14} /> Bezárás
              </button>
            </div>
          </div>
        )}
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
                <select
                  className={select}
                  value={supplier}
                  onChange={(e) => {
                    setSupplier(e.target.value);
                    setInvoiceFilter("all");
                    closeInvoiceDetail();
                  }}
                >
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
              <WarehouseMultiSelect
                labelText="Nem"
                options={genderFilterOptions}
                values={genderFilters}
                onChange={setGenderFilters}
              />
              <WarehouseMultiSelect
                labelText="Méret"
                options={sizeFilterOptions}
                values={sizeFilters}
                onChange={setSizeFilters}
              />
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
              <WarehouseInvoicePicker
                options={invoiceFilterOptions}
                value={invoiceFilter}
                onSelect={(nextValue) => {
                  setInvoiceFilter(nextValue);
                  if (nextValue !== "all" && sortMode === "name") setSortMode("incoming_asc");
                }}
                onInspect={(option) => {
                  if (sortMode === "name") setSortMode("incoming_asc");
                  void loadInvoiceDetail(option);
                }}
              />
              <label className={label}>Készlet állapot
                <select className={select} value={stockFilter} onChange={(e) => setStockFilter(e.target.value as StockFilter)}>
                  <option value="all">Összes</option>
                  <option value="available">Készleten</option>
                  <option value="out">Nincs készleten</option>
                  <option value="reserved">Van foglalás</option>
                  <option value="missing">Hiányzó adat</option>
                  <option value="inactive">Inaktív termékek</option>
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
              <label className={label}>Shopify
                <select
                  className={select}
                  value={shopifyFilter}
                  onChange={(e) => {
                    const next = e.target.value as ShopifyFilter;
                    setShopifyFilter(next);
                    if (next === "recent_mapped") setSortMode("shopify_connected_desc");
                  }}
                >
                  <option value="all">Összes</option>
                  <option value="mapped">Összekötve</option>
                  <option value="recent_mapped">Legutóbb összekapcsolt</option>
                  <option value="exported">Exportálva, párosításra vár</option>
                  <option value="unmapped">Nincs Shopifyon</option>
                  <option value="error">Kapcsolati / exporthiba</option>
                </select>
              </label>
              <label className={label}>Bevételezés
                <select
                  className={`${select} ${(incomingFocus?.batchId || recentImportFocusBusy) ? "border-[#7bd7d4]/60 bg-[#31565d]" : ""}`}
                  value={(incomingFocus?.batchId || recentImportFocusBusy) ? "latest" : "all"}
                  disabled={busy || recentImportFocusBusy}
                  onChange={(e) => {
                    if (e.target.value === "latest") {
                      void focusLatestCommittedImportBatch({ preserveCurrentFilters: true });
                    } else {
                      clearLatestIncomingFilter();
                    }
                  }}
                  title="A legutóbb készletre vett bevételezés összes termékét tartósan mutatja, a többi szűrő megtartásával"
                >
                  <option value="all">Összes</option>
                  <option value="latest">{recentImportFocusBusy ? "Betöltés..." : "Legutóbb bevételezett"}</option>
                </select>
              </label>
              <label className={label}>Sorrend
                <select className={select} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="incoming_desc">Legújabb bevételezés elöl</option>
                  <option value="incoming_asc">Legrégebbi bevételezés elöl</option>
                  <option value="shopify_connected_desc">Legutóbb Shopifyhoz kapcsolt</option>
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
          <div className={`bg-[#303a4c] px-4 py-3 ${listOpen ? "border-b border-white/16" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-white/95">
                <Eye size={17} />
                <span>Terméklista</span>
                <span className={chip}>{filtered.length} variáns</span>
                {hasActiveWarehouseFilters && <span className="rounded-full border border-amber-200/30 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-50">Szűrve: {filtered.length}/{items.length}</span>}
                {filtered.length > 0 && <span className={chip}>{productPageStartIndex}-{productPageEndIndex} látható</span>}
                {incomingFocus && (
                  <span className="rounded-full border border-[#7bd7d4]/35 bg-[#2a8d8b]/12 px-2.5 py-1 text-xs text-[#d7fffd]">
                    Utolsó bevételezés: {incomingFocus.rows.length || incomingFocus.variantIds.length} sor / {incomingFocus.variantIds.length} variáns{incomingFocus.totalQty ? ` / ${incomingFocus.totalQty} db` : ""}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  className={sortMode === "incoming_desc" ? primaryBtn : btnSoft}
                  onClick={() => void focusLatestCommittedImportBatch()}
                  type="button"
                  title="A legutóbbi készletre vett import összes raktári variánsát mutatja"
                >
                  <RefreshCw size={15} /> Legutóbbi bevételezés
                </button>
                {incomingFocus && (
                  <button
                    className={btnSoft}
                    onClick={() => clearLatestIncomingFilter()}
                    type="button"
                    title="Csak az utolsó import sorainak mutatását kikapcsolja"
                  >
                    <X size={15} /> Import szűrő törlése
                  </button>
                )}
                {hasActiveWarehouseFilters && (
                  <button className={btnSoft} onClick={() => resetWarehouseFilters()} type="button" title="Minden szűrő törlése">
                    <X size={15} /> Szűrők törlése
                  </button>
                )}
                <button className={btnSoft} onClick={() => setListOpen((x) => !x)}>{listOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {listOpen ? "Bezárás" : "Megnyitás"}</button>
              </div>
            </div>

            <div className="mt-3 grid min-h-[48px] gap-2 rounded-xl border border-white/12 bg-white/[0.045] p-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-white/72">
                <PackageCheck size={15} className="shrink-0 text-[#9cf4f0]" />
                <span className="shrink-0 text-white">{incomingFocus ? "Import-kijelölés" : "Közös munkalista"}</span>
                <span className={`inline-flex min-w-[156px] items-center justify-center rounded-full border px-2.5 py-1 text-[11px] ${
                  activeListSelectedCount > 0
                    ? incomingFocus
                      ? "border-[#7bd7d4]/45 bg-[#2a8d8b]/22 text-[#d7fffd]"
                      : "border-[#7bd7d4]/45 bg-[#2a8d8b]/18 text-white"
                    : "border-white/12 bg-white/[0.04] text-white/42"
                }`}>
                  {activeListSelectedCount > 0
                    ? incomingFocus
                      ? `${activeListSelectedCount} kijelölve ebben az importban`
                      : `${activeListSelectedCount} kijelölve`
                    : "Nincs kijelölt termék"}
                </span>
                {incomingFocus && incomingSelectedCount > selectedVisibleCount ? (
                  <span className="text-[10px] text-white/45">
                    {selectedVisibleCount} látható, {incomingSelectedCount - selectedVisibleCount} további kijelölés most szűrve van
                  </span>
                ) : null}
              </div>

              <div className="flex min-h-8 flex-wrap items-center justify-end gap-2">
                {incomingFocus ? (
                  <>
                    <button
                      className={`${headerPrimaryBtn} min-w-[164px]`}
                      onClick={openIncomingSelectedProductsPanel}
                      disabled={incomingSelectedCount <= 0}
                      type="button"
                      title="Az utolsó bevételezés kijelölt termékeit megnyitja a közös munkalistában"
                    >
                      <Eye size={14} /> Kijelöltek megnyitása
                    </button>
                    <button
                      className="inline-flex h-8 min-w-[174px] items-center justify-center gap-1.5 rounded-xl border border-red-200/70 bg-[#d31126] px-2.5 text-[11px] text-white shadow-[0_8px_18px_rgba(211,17,38,0.18)] hover:bg-[#b90f21] disabled:cursor-not-allowed disabled:opacity-45 font-normal"
                      onClick={() => openSelectedProductsDeleteConfirm("incoming")}
                      disabled={incomingSelectedCount <= 0 || saving}
                      type="button"
                      title="Csak az utolsó bevételezésben kijelölt sorokat törli"
                    >
                      <Trash2 size={14} /> Kijelölt termékek törlése
                    </button>
                    <button
                      className={`${headerBtnSoft} min-w-[156px]`}
                      onClick={clearIncomingSelection}
                      disabled={incomingSelectedCount <= 0}
                      type="button"
                      title="Csak az importnézet kijelölését törli"
                    >
                      <X size={14} /> Import kijelölés törlése
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className={`${headerPrimaryBtn} min-w-[164px]`}
                      onClick={openSelectedProductsPanel}
                      disabled={selectedCount <= 0}
                      type="button"
                    >
                      <Eye size={14} /> Kijelöltek megnyitása
                    </button>
                    <button
                      className="inline-flex h-8 min-w-[174px] items-center justify-center gap-1.5 rounded-xl border border-red-200/70 bg-[#d31126] px-2.5 text-[11px] text-white shadow-[0_8px_18px_rgba(211,17,38,0.18)] hover:bg-[#b90f21] disabled:cursor-not-allowed disabled:opacity-45 font-normal"
                      onClick={() => openSelectedProductsDeleteConfirm("warehouse")}
                      disabled={selectedCount <= 0 || saving}
                      type="button"
                      title="Az összes raktári munkalistán kijelölt terméket törli"
                    >
                      <Trash2 size={14} /> Kijelölt termékek törlése
                    </button>
                    <button
                      className={`${headerBtnSoft} min-w-[156px]`}
                      onClick={clearSelectedVariants}
                      disabled={selectedCount <= 0}
                      type="button"
                      title="A mentett kijelölési listát is törli"
                    >
                      <X size={14} /> Kijelölés törlése
                    </button>
                  </>
                )}
              </div>
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
                      <p className="mt-1 text-[#bdf5f2]">Csak az a konkrét méret/szín kerül át a Raktárba, amelynél a Variáns állapotot külön Aktívra teszed. A közös Modell állapot nem aktiválja automatikusan a többi variánst.</p>
                      <p className="mt-1 text-[#bdf5f2]">Az itteni kijelölés külön importlista: nem keveredik a normál raktári kijelölésekkel, címkékkel vagy készletmozgatási teendőkkel.</p>
                    </div>
                    <div className="flex min-h-9 flex-wrap items-center gap-2">
                      <button
                        className={btnSoft}
                        onClick={() => toggleAllFilteredSelection(true)}
                        disabled={!filteredVariantIds.length || allFilteredSelected}
                        type="button"
                        title="Csak az utolsó bevételezés jelenleg látható sorait jelöli ki, a normál raktári munkalistát nem bántja."
                      >
                        <PackageCheck size={14} /> {allFilteredSelected ? "Minden látható sor kijelölve" : "Összes látható import sor kijelölése"}
                      </button>
                      <button
                        className={btnSoft}
                        onClick={clearIncomingSelection}
                        disabled={incomingSelectedCount <= 0}
                        type="button"
                      >
                        <X size={14} /> Import kijelölés törlése
                      </button>
                      <button className={btnSoft} onClick={() => resetWarehouseFilters()} type="button"><X size={14} /> Minden raktári variáns</button>
                    </div>
                  </div>
                </div>
              ) : sortMode === "incoming_desc" || sortMode === "incoming_asc" ? (
                <div className="mb-3 rounded-xl border border-[#5bd0cc]/24 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                  {sortMode === "incoming_asc"
                    ? "A legrégebben beérkezett termékek vannak elöl. Márkaszűrővel együtt gyorsan látszik, mi ül régóta a raktárban és érdemes-e leárazni."
                    : "A legutóbbi bevételezés szerinti sorrend van bekapcsolva. Ha az import meglévő modell + szín + méret sorra ment, nem új sor jön létre, hanem a készlet darabszáma nő."}
                </div>
              ) : showShopifyConnectionContext ? (
                <div className="mb-3 rounded-xl border border-[#95bf47]/35 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                  A legutóbb Shopifyhoz párosított termékek vannak elöl. A sorok alatt a kapcsolás dátuma is látszik a gyors ellenőrzéshez.
                </div>
              ) : null}
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
                    <col style={{ width: "116px" }} />
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
                          aria-label={incomingFocus?.batchId ? "Az utolsó bevételezés összes szűrt termékének kijelölése" : "Az aktuális oldal termékeinek kijelölése"}
                          title={incomingFocus?.batchId ? "Az utolsó bevételezés összes szűrt termékének kijelölése" : "Az aktuális oldal termékeinek kijelölése"}
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
                      const isSelected = Boolean(activeListSelectionMap[variantId]);
                      const isHighlighted = Boolean(highlightProductId && variantId === highlightProductId);
                      const invoiceText = selectedInvoiceFilterOption?.invoiceNumber || (it.last_invoice_number || inventoryInvoiceNumbers(it)[0] || "");
                      const purchaseDateText = inventoryPurchaseDateLabel(it, selectedInvoiceFilterOption?.invoiceNumber, selectedInvoiceFilterOption?.receptionIds?.[0]);
                      const shopifyConnectedText = warehouseDateLabel(it.shopify_connected_at || it.shopify_export_reconciled_at || it.shopify_mapped_at);
                      const openOrderInfo = openPurchaseOrdersByVariant[variantId] || null;
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
                          <WarehouseProductImage src={it.image_url} alt={it.title_ro || ""} thumbClassName="mx-auto h-11 w-11 rounded-lg" iconSize={17} />
                        </td>
                        <td className="truncate px-2 py-2.5 text-left align-middle" title={it.brand_name || ""}>{it.brand_name || "-"}</td>
                        <td className="relative min-w-0 overflow-visible px-2 py-2.5 text-left align-middle">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <button
                              className="block min-w-0 max-w-full flex-1 truncate text-left text-[13px] leading-5 text-white hover:text-[#cffffd] focus:outline-none focus:underline"
                              onClick={() => openDetail(it.variant_id)}
                              title={it.title_ro || "Termék részletei"}
                              type="button"
                            >
                              {it.title_ro || "-"}
                            </button>
                            <WarehouseShopifyStatusIcon item={it} size="sm" />
                          </div>
                          <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-visible text-[11px] leading-4">
                            <span className="relative z-40 min-w-0 overflow-visible"><ProductCodeTooltipButton item={it} openUp={index >= Math.max(0, productPageItems.length - 3)} /></span>
                            {isHighlighted ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-100/75 bg-amber-300 px-2 py-0.5 text-[10px] leading-none text-slate-900 shadow-[0_0_16px_rgba(252,211,77,0.42)]">
                                <ArrowRight size={10} /> Folytatás innen
                              </span>
                            ) : null}
                          </div>
                          {showPurchaseContext && (invoiceText || purchaseDateText) ? (
                            <div className="mt-1 truncate text-[10px] leading-3 text-white/45" title={[invoiceText ? `Számla: ${invoiceText}` : "", purchaseDateText ? `Beérkezés: ${purchaseDateText}` : ""].filter(Boolean).join(" • ")}>
                              {invoiceText ? `Számla: ${invoiceText}` : "Számla nélkül"}{purchaseDateText ? ` • ${purchaseDateText}` : ""}
                            </div>
                          ) : null}
                          {showShopifyConnectionContext && shopifyConnectedText ? (
                            <div className="mt-1 truncate text-[10px] leading-3 text-[#d7fffd]/72">Shopify kapcsolat: {shopifyConnectedText}</div>
                          ) : null}
                          {modelStatusNeedsAttention(it) ? <div className="mt-1"><ModelStatusBadge item={it} compact /></div> : null}
                        </td>
                        <td className="px-2 py-2.5 text-center align-middle" title={[itemMainCategoryLabel(it), itemSubCategoryLabel(it)].filter(Boolean).join(" / ")}>
                          <div className="truncate text-white/90">{itemMainCategoryLabel(it)}</div>
                          {itemSubCategoryLabel(it) ? <div className="truncate text-[10px] leading-3 text-white/48">{itemSubCategoryLabel(it)}</div> : null}
                        </td>
                        <td className="px-2 py-2.5 text-center align-middle" title={colorDisplay(it.color_name, it.color_code)}><ColorNameWithCode item={it} openUp={index >= Math.max(0, productPageItems.length - 3)} /></td>
                        <td className="px-2 py-2.5 text-center align-middle whitespace-nowrap">{it.size || "-"}</td>
                        <td className="px-2 py-2.5 text-center align-middle whitespace-nowrap">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <StockQtyButton item={it} openUp={index >= Math.max(0, productPageItems.length - 3)} />
                            {openOrderInfo ? (
                              <OpenPurchaseOrderBadge
                                info={openOrderInfo}
                                onClick={() => openPurchaseOrderFromWarehouse(openOrderInfo, it.variant_id)}
                                title="Rendelés alatt"
                                className="inline-flex h-5 min-w-[94px] shrink-0 items-center justify-center gap-1 rounded-full border border-orange-200/75 bg-[#ff6a00] px-2 text-[9px] leading-none text-white shadow-[0_0_0_1px_rgba(255,106,0,.28),0_5px_12px_rgba(255,106,0,.20)] transition hover:bg-[#ff7a1a] focus:outline-none focus:ring-2 focus:ring-orange-200/45"
                              >
                                <ShoppingCart size={10} /> Rendelés alatt
                              </OpenPurchaseOrderBadge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-center align-middle tabular-nums whitespace-nowrap"><MaskedBuyPrice value={it.buy_price} /></td>
                        <td className="px-2 py-2.5 text-center align-middle tabular-nums whitespace-nowrap"><SellPriceWithMarkup sellPrice={it.sell_price} buyPrice={it.buy_price} openUp={index >= Math.max(0, productPageItems.length - 3)} /></td>
                        <td className="px-2 py-2.5 text-center align-middle"><span className="inline-flex w-full justify-center"><MissingDataIndicator item={it} openUp={index >= Math.max(0, productPageItems.length - 2)} /></span></td>
                        <td className="px-2 py-2.5 text-center align-middle">
                          <div className="flex items-center justify-center gap-1.5">
                            <button className={warehouseListIconButton} onClick={() => openProductHistory(it)} title="Termék History" aria-label="Termék History" type="button"><Clock3 size={15} /></button>
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
                  const isSelected = Boolean(activeListSelectionMap[variantId]);
                  const isHighlighted = Boolean(highlightProductId && variantId === highlightProductId);
                  const invoiceText = selectedInvoiceFilterOption?.invoiceNumber || (it.last_invoice_number || inventoryInvoiceNumbers(it)[0] || "");
                  const purchaseDateText = inventoryPurchaseDateLabel(it, selectedInvoiceFilterOption?.invoiceNumber, selectedInvoiceFilterOption?.receptionIds?.[0]);
                  const shopifyConnectedText = warehouseDateLabel(it.shopify_connected_at || it.shopify_export_reconciled_at || it.shopify_mapped_at);
                  const openOrderInfo = openPurchaseOrdersByVariant[variantId] || null;
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
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {isHighlighted ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-100/75 bg-amber-300 px-2 py-0.5 text-[11px] text-slate-900 shadow-[0_0_16px_rgba(252,211,77,0.42)]"><ArrowRight size={11} /> Folytatás innen</span> : null}
                        {isSelected && <span className="rounded-full border border-[#2a8d8b]/45 bg-[#2a8d8b]/22 px-2 py-0.5 text-[11px] text-white">Kijelölve</span>}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <WarehouseProductImage src={it.image_url} alt={it.title_ro || ""} thumbClassName="h-20 w-20 rounded-xl" iconSize={20} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <button className="block min-w-0 flex-1 truncate text-left text-sm text-white hover:text-[#cffffd] focus:outline-none focus:underline" onClick={() => openDetail(it.variant_id)} type="button" title={String(it.title_ro || "-")}>{it.title_ro || "-"}</button>
                          <WarehouseShopifyStatusIcon item={it} size="sm" />
                        </div>
                        <p className="mt-1 text-xs text-white/55">{it.brand_name || "-"} • {itemMainCategoryLabel(it)}{itemSubCategoryLabel(it) ? ` / ${itemSubCategoryLabel(it)}` : ""} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <ProductCodeTooltipButton item={it} />
                        </div>
                        {showPurchaseContext && (invoiceText || purchaseDateText) ? <p className="mt-1 text-[11px] text-white/45">{invoiceText ? `Számla: ${invoiceText}` : "Számla nélkül"}{purchaseDateText ? ` • ${purchaseDateText}` : ""}</p> : null}
                        {showShopifyConnectionContext && shopifyConnectedText ? <p className="mt-1 text-[11px] text-[#d7fffd]/72">Shopify kapcsolat: {shopifyConnectedText}</p> : null}
                        {modelStatusNeedsAttention(it) ? <div className="mt-1"><ModelStatusBadge item={it} compact /></div> : null}
                        <div className="mt-2 flex flex-wrap items-start gap-1.5">
                          <div className="flex flex-col items-start gap-1">
                            <StockQtyButton item={it} />
                            {openOrderInfo ? (
                              <OpenPurchaseOrderBadge
                                info={openOrderInfo}
                                onClick={() => openPurchaseOrderFromWarehouse(openOrderInfo, it.variant_id)}
                                title="Rendelés alatt"
                                className="inline-flex h-5 min-w-[94px] shrink-0 items-center justify-center gap-1 rounded-full border border-orange-200/75 bg-[#ff6a00] px-2 text-[9px] leading-none text-white shadow-[0_5px_12px_rgba(255,106,0,.20)] transition hover:bg-[#ff7a1a] focus:outline-none focus:ring-2 focus:ring-orange-200/45"
                              >
                                <ShoppingCart size={10} /> Rendelés alatt
                              </OpenPurchaseOrderBadge>
                            ) : null}
                          </div>
                          <MissingDataIndicator item={it} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button className={`${warehouseListIconButton} h-9 w-9`} onClick={() => openProductHistory(it)} title="Termék History" aria-label={`Termék History: ${it.title_ro || "termék"}`} type="button"><Clock3 size={15} /></button>
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
                <button className={selectedWorkButtonClass("shopify")} type="button" disabled={!selectedWorkCounts.shopify} onClick={() => setSelectedWorkPanel("shopify")} title="Shopify export listára tett termékek">
                  <ShopifyBrandMark size="xs" /> Shopify export {selectedWorkCounts.shopify > 0 ? `(${selectedWorkCounts.shopify})` : ""}
                </button>
                <button className={btnSoft} onClick={closeSelectedWorkflowAndReturn} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-[#2a8d8b]/30 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                Ez a kijelölt termékek közös munkalistája. A kijelölés a fiókodhoz mentődik, így mobilon és másik gépen is ugyaninnen folytatható. Egy terméknél használd a sor eleji pipát, az összes szabadon várakozó terméknél pedig az alábbi tömeges gombot.
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-white/14 bg-[#3f4959] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-white">Tömeges feladatválasztás</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/55">
                    {selectedUnassignedItems.length
                      ? `${selectedUnassignedItems.length} termék még nincs munkalistához rendelve. Egy kattintással ugyanazt a feladatot adhatod mindegyiknek.`
                      : "Minden kijelölt termékhez tartozik már feladat."}
                  </p>
                </div>
                <button
                  className={primaryBtn}
                  type="button"
                  disabled={!selectedUnassignedItems.length}
                  onClick={() => openSelectedItemsActionPicker(selectedUnassignedItems)}
                  title="Az összes feladatra váró terméket egyszerre kijelöli, majd megnyitja a feladatválasztót."
                >
                  <PackageCheck size={15} /> Összes kijelölése és feladat választása
                  {selectedUnassignedItems.length > 0 ? ` (${selectedUnassignedItems.length})` : ""}
                </button>
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
                          if (e.target.checked) {
                            rememberSelectionReturnAnchor(it.variant_id);
                            openSelectedItemsActionPicker([it]);
                          }
                        }}
                        aria-label="Feladat kiválasztása"
                        title="Feladat kiválasztása"
                      />
                    </div>
                    <div>
                      <WarehouseProductImage src={it.image_url} alt={it.title_ro || ""} thumbClassName="h-10 w-10 rounded-lg" iconSize={16} />
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
                <button className={primaryBtn} onClick={closeSelectedWorkflowAndReturn} type="button">Kész</button>
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
                {labelPrintMode === "zebra" ? (
                  <button className={btnSoft} onClick={() => printGeneratedLabels({ testOnly: true })} disabled={!labelPrintReady} title={labelInvalidRows.length ? "A teszthez is minden termékhez mentett, egyedi bárkód kell." : "Egyetlen 40×46 mm-es tesztcímke nyomtatása"} type="button"><Printer size={15} /> Teszt 1 címke</button>
                ) : null}
                <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal" onClick={() => printGeneratedLabels()} disabled={!labelPrintReady} title={labelInvalidRows.length ? "A nyomtatáshoz minden termékhez mentett, egyedi bárkód kell." : ""} type="button"><Printer size={15} /> {labelPrintMode === "zebra" ? `Nyomtatás Zebra (${labelPrintItems.length})` : "Nyomtatás A4"}</button>
                <button className={btnSoft} onClick={() => setLabelComposerOpen(false)} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid gap-2 rounded-2xl border border-white/12 bg-[#354153] p-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setLabelPrintMode("a4")}
                  className={`flex min-h-[58px] items-center gap-3 rounded-xl border px-3 text-left transition ${labelPrintMode === "a4" ? "border-[#7bd7d4]/60 bg-[#2a8d8b] text-white shadow-[0_8px_20px_rgba(42,141,139,.18)]" : "border-white/12 bg-[#303a4c] text-white/66 hover:bg-[#3b4759]"}`}
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-black/10"><FileText size={17} /></span>
                  <span><strong className="block text-sm font-normal">A4 ív</strong><span className="mt-0.5 block text-[10px] text-white/52">Több címke egy 210 × 297 mm-es lapon</span></span>
                </button>
                <button
                  type="button"
                  onClick={() => setLabelPrintMode("zebra")}
                  className={`flex min-h-[58px] items-center gap-3 rounded-xl border px-3 text-left transition ${labelPrintMode === "zebra" ? "border-[#7bd7d4]/60 bg-[#2a8d8b] text-white shadow-[0_8px_20px_rgba(42,141,139,.18)]" : "border-white/12 bg-[#303a4c] text-white/66 hover:bg-[#3b4759]"}`}
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-black/10"><Printer size={17} /></span>
                  <span><strong className="block text-sm font-normal">Zebra GC420t</strong><span className="mt-0.5 block text-[10px] text-white/52">1 címke = 1 nyomtatási oldal, Windows driverrel</span></span>
                </button>
              </div>

              {labelPrintMode === "zebra" ? (
                <div className="rounded-xl border border-[#7bd7d4]/35 bg-[#173f49] px-3 py-2.5 text-xs leading-relaxed text-[#d7fffd]">
                  <strong className="font-normal text-white">Zebra mód:</strong> a rendszer minden címkét külön, pontosan <span className="text-white">{labelW} × {labelH} mm</span>-es nyomtatási oldalra tesz. A Windowsban válaszd a <span className="text-white">Zebra GC420t</span> nyomtatót, papírméretnek ugyanezt a méretet, méretezésnek <span className="text-white">100% / Actual size</span>, margónak <span className="text-white">0</span>, a fejléc/lábléc pedig legyen kikapcsolva. Browser Print nem kell.
                </div>
              ) : (
                <div className="rounded-xl border border-[#2a8d8b]/30 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                  A címkék egy közös A4-es ívre kerülnek egymás után. Nyomtatás csak a termékhez adatbázisban elmentett bárkóddal lehetséges, így ugyanaz a kód marad a raktárban, a címkén és később a Shopify-kapcsolatban is.
                </div>
              )}

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
                    <p className="text-sm text-white">{labelPrintMode === "zebra" ? "Zebra címkeméret és sablon" : "Méret, kiosztás és sablon"}</p>
                    <span className="rounded-full border border-white/12 bg-white/[0.08] px-2.5 py-1 text-xs text-white/70">
                      {labelPrintMode === "zebra"
                        ? `${labelW} × ${labelH} mm • 1 címke / oldal • ${labelPrintItems.length} oldal`
                        : `${labelColCount} oszlop × ${labelRowCount} sor • ${labelsPerPage} címke / oldal • ${Math.max(1, labelPrintPages.length)} oldal`}
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className={`${label} min-w-0`}>{labelPrintMode === "zebra" ? "Gyors címkeméret" : "Gyors sablon"}
                      <select className={`${select} w-full min-w-0`} onChange={(e) => applyWarehouseLabelPreset(e.target.value)} defaultValue="40x46">
                        {WAREHOUSE_LABEL_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{labelPrintMode === "zebra" ? `${preset.width} × ${preset.height} mm` : preset.name}</option>)}
                      </select>
                    </label>
                    <label className={`${label} min-w-0`}>Címke szélesség mm<input className={`${input} w-full min-w-0`} value={labelWidth} onChange={(e) => setLabelWidth(e.target.value)} inputMode="decimal" /></label>
                    <label className={`${label} min-w-0`}>Címke magasság mm<input className={`${input} w-full min-w-0`} value={labelHeight} onChange={(e) => setLabelHeight(e.target.value)} inputMode="decimal" /></label>
                    {labelPrintMode === "a4" ? (
                      <>
                        <label className={`${label} min-w-0`}>Oszlop / A4<input className={`${input} w-full min-w-0`} value={labelCols} onChange={(e) => setLabelCols(e.target.value)} inputMode="numeric" /></label>
                        <label className={`${label} min-w-0`}>Sor / A4<input className={`${input} w-full min-w-0`} value={labelRows} onChange={(e) => setLabelRows(e.target.value)} inputMode="numeric" /></label>
                        <label className={`${label} min-w-0`}>Margó bal-jobb mm<input className={`${input} w-full min-w-0`} value={labelMarginX} onChange={(e) => setLabelMarginX(e.target.value)} inputMode="decimal" /></label>
                        <label className={`${label} min-w-0`}>Margó fent-lent mm<input className={`${input} w-full min-w-0`} value={labelMarginY} onChange={(e) => setLabelMarginY(e.target.value)} inputMode="decimal" /></label>
                      </>
                    ) : (
                      <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-[#7bd7d4]/22 bg-[#174c55]/45 px-3 py-2 text-[11px] leading-relaxed text-[#d7fffd]">
                        <span className="text-white">GC420t beállítás:</span> a nyomtató driverében a média mérete legyen pontosan <span className="text-white">{labelW} × {labelH} mm</span>. A Zebra saját gap érzékelése lépteti a tekercset, ezért itt nincs A4-es oszlop, sor vagy margó.
                      </div>
                    )}
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
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-white">Termékek és példányszám</p>
                    <span className="text-xs text-white/55">A kép csak végső ellenőrzéshez látszik, a címkére nem kerül</span>
                  </div>
                  <div className="grid gap-2">
                    {labelRowsForPrint.map((row) => (
                      <div key={row.id} className="grid grid-cols-[64px,minmax(0,1fr)] items-center gap-3 rounded-xl border border-white/12 bg-[#465163] p-3 md:grid-cols-[64px,minmax(0,1fr),148px]">
                        <div className="self-start md:self-center" title={row.imageUrl ? "Rámutatásra nagyítás" : "Ehhez a termékhez nincs mentett kép"}>
                          <WarehouseProductImage
                            src={row.imageUrl}
                            alt={row.title}
                            thumbClassName="h-16 w-16 rounded-xl bg-white"
                            iconSize={20}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white">{row.title}</p>
                          <p className="mt-1 text-xs text-white/55">{row.brand} • {row.category} • Színkód: {row.color || "-"} • {row.size}</p>
                          <p className="mt-1 text-xs text-white/45">Készlet: {row.stockQty} • Vonalkód: {row.barcode || "nincs mentve"}</p>
                          {!row.render.ok && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-rose-300/25 bg-rose-500/10 px-2 py-1.5">
                              <span className="text-xs text-rose-100">{row.render.error}</span>
                              <button
                                className="inline-flex h-7 items-center justify-center gap-1.5 rounded-lg border border-[#7bd7d4]/40 bg-[#2a8d8b] px-2 text-[11px] text-white hover:bg-[#319c99]"
                                type="button"
                                onClick={() => {
                                  setLabelComposerOpen(false);
                                  goBarcodeManager(row.id, "", row.title);
                                }}
                              >
                                <Barcode size={13} /> Generálás és mentés
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="col-span-2 md:col-span-1">
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
                    <p className="text-sm text-white">{labelPrintMode === "zebra" ? "Zebra címke előnézet" : "Első oldal előnézet"}</p>
                    <span className="text-xs text-white/55">{labelPrintMode === "zebra" ? `${labelW} × ${labelH} mm` : `${Math.min(labelPrintItems.length, labelsPerPage)} / ${labelPrintItems.length} címke`}</span>
                  </div>
                  {labelPrintItems.length ? (
                    labelPrintMode === "zebra" ? (
                      <div className="flex min-h-[360px] items-start justify-center overflow-auto rounded-[14px] border border-white/14 bg-[#2f394a] p-5">
                        <div
                          className="relative shrink-0 bg-[#f1f3f6] shadow-[0_14px_34px_rgba(0,0,0,.32)]"
                          style={{ width: `${labelW * zebraLabelPreviewScale}mm`, height: `${labelH * zebraLabelPreviewScale}mm` }}
                        >
                          <div
                            className={`aifWarehousePrintLabel aifWhZebraLabel ${labelShowBorder ? "" : "noBorder"}`}
                            style={{
                              "--aif-label-w": `${labelW}mm`,
                              "--aif-label-h": `${labelH}mm`,
                              position: "absolute",
                              left: 0,
                              top: 0,
                              transform: `scale(${zebraLabelPreviewScale})`,
                              transformOrigin: "top left",
                            } as React.CSSProperties & Record<string, string>}
                          >
                            <WarehouseZebraLabelContent label={labelPrintItems[0]} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div ref={labelPreviewFrameRef} className="aifWhLabelPreviewFrame" style={labelPrintStyle}>
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
                    )
                  ) : (
                    <div className="rounded-xl border border-white/12 bg-[#465163] px-3 py-8 text-center text-sm text-white/60">Nincs előnézet.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {selectedActionTargets.length > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-3 py-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Feladat kiválasztása</p>
                <h2 className="mt-1 text-lg text-white">{selectedActionTargets.length === 1 ? (selectedActionTargets[0]?.title_ro || "Termék") : `${selectedActionTargets.length} termék`}</h2>
              </div>
              <button className={btnSoft} onClick={() => setSelectedActionTargets([])} type="button"><X size={14} /> Bezárás</button>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm text-white/70">Válaszd ki, melyik munkalistára kerüljön {selectedActionTargets.length === 1 ? "a kijelölt termék" : `mind a ${selectedActionTargets.length} kijelölt termék`}.</p>
              {selectedActionTargets.length > 1 && (
                <div className="rounded-xl border border-[#2a8d8b]/30 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                  <span className="text-white">Tömeges művelet:</span>{" "}
                  {selectedActionTargets.slice(0, 4).map((item) => item.title_ro || item.variant_id).join(", ")}
                  {selectedActionTargets.length > 4 ? ` és még ${selectedActionTargets.length - 4} termék` : ""}
                </div>
              )}
              <div className="grid gap-2">
                <button className="flex items-center justify-between gap-3 rounded-xl border border-[#2a8d8b]/45 bg-[#2a8d8b]/18 px-2 py-2 text-left text-sm text-white hover:bg-[#2a8d8b]/26" onClick={() => assignSelectedItemsToAction(selectedActionTargets, "label")} type="button">
                  <span className="inline-flex items-center gap-2"><Barcode size={16} /> Vonalkód / címke</span>
                  <span className="text-xs text-white/55">címkelista</span>
                </button>
                <button className="flex items-center justify-between gap-3 rounded-xl border border-white/16 bg-[#3f4959] px-2 py-2 text-left text-sm text-white hover:bg-[#475365]" onClick={() => assignSelectedItemsToAction(selectedActionTargets, "order")} type="button">
                  <span className="inline-flex items-center gap-2"><ClipboardList size={16} /> Rendelés / PDF</span>
                  <span className="text-xs text-white/55">rendelési lista</span>
                </button>
                <button className="flex items-center justify-between gap-3 rounded-xl border border-white/16 bg-[#3f4959] px-2 py-2 text-left text-sm text-white hover:bg-[#475365]" onClick={() => assignSelectedItemsToAction(selectedActionTargets, "move")} type="button">
                  <span className="inline-flex items-center gap-2"><PackageCheck size={16} /> Készletmozgatás</span>
                  <span className="text-xs text-white/55">átadási lista</span>
                </button>
                <button className="flex items-center justify-between gap-3 rounded-xl border border-white/16 bg-[#3f4959] px-2 py-2 text-left text-sm text-white hover:bg-[#475365]" onClick={() => assignSelectedItemsToAction(selectedActionTargets, "shopify")} type="button">
                  <span className="inline-flex items-center gap-2"><ShopifyBrandMark size="sm" /> Shopify export</span>
                  <span className="text-xs text-white/55">egyetlen termék-CSV</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedWorkPanel && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-[#070c16]/80 p-4 backdrop-blur-lg">
          <div
            className={`${selectedWorkPanel === "move"
              ? "flex max-w-none flex-col overflow-hidden rounded-[28px] bg-[#253143]"
              : selectedWorkPanel === "order"
                ? "flex max-w-none flex-col overflow-hidden rounded-[26px] bg-[#253143]"
                : "max-h-[88vh] max-w-5xl overflow-auto rounded-2xl bg-[#4b5362]"} w-full border border-white/20 shadow-[0_34px_110px_rgba(2,6,23,0.72),0_0_0_1px_rgba(123,215,212,0.05)]`}
            style={selectedWorkPanel === "move" ? {
              width: "min(1480px, calc(100vw - 32px))",
              height: "min(780px, calc(100vh - 32px))",
            } : selectedWorkPanel === "order" ? {
              width: "min(1280px, calc(100vw - 32px))",
              height: "min(760px, calc(100vh - 32px))",
            } : undefined}
          >
            <div className={`${selectedWorkPanel === "move" || selectedWorkPanel === "order"
              ? "bg-gradient-to-r from-[#172235] via-[#293b52] to-[#2a8d8b]/70 px-5 py-3.5"
              : "sticky top-0 z-10 bg-[#404a5b]/98 px-4 py-3 backdrop-blur"} flex flex-wrap items-center justify-between gap-3 border-b border-white/14`}>
              {selectedWorkPanel === "move" ? (
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/38 bg-[#2a8d8b]/24 text-[#d7fffd] shadow-[0_12px_28px_rgba(2,6,23,0.28)]" title="A készlet csak a végső megerősítés után változik.">
                    <ArrowRightLeft size={22} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/68">Készletmozgatás • PV-előkészítés</p>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="mr-1 truncate text-[22px] leading-tight tracking-tight text-white">Átadási csomag</h2>
                      <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] ${moveAllRowsValid ? "border-[#7bd7d4]/35 bg-[#2a8d8b]/20 text-[#d7fffd]" : "border-amber-200/28 bg-amber-300/12 text-amber-50"}`}>
                        {moveAllRowsValid ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                        {moveAllRowsValid ? "Menthető" : `${moveInvalidCount} javítandó`}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-white/62">{selectedMoveItems.length} terméksor • {moveTotalQty} db • {money(moveTotalValue)} RON</p>
                  </div>
                </div>
              ) : selectedWorkPanel === "order" ? (
                <div className="flex min-w-0 items-center gap-3.5">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/38 bg-[#2a8d8b]/24 text-[#d7fffd] shadow-[0_12px_28px_rgba(2,6,23,0.28)]" title="Beszállítónként egy nyitott rendelés készül vagy bővül.">
                    <ClipboardList size={22} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/68">Beszállítói rendelés • nyitott lista</p>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="mr-1 truncate text-[22px] leading-tight tracking-tight text-white">Rendelési csomag</h2>
                      <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] ${purchaseOrderWorkCanSave ? "border-[#7bd7d4]/35 bg-[#2a8d8b]/20 text-[#d7fffd]" : "border-rose-200/35 bg-[#d31126]/75 text-white"}`}>
                        {purchaseOrderWorkCanSave ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                        {purchaseOrderWorkCanSave ? "Menthető" : `${purchaseOrderWorkInvalidCount} javítandó`}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-white/62">{selectedOrderItems.length} terméksor • {purchaseOrderWorkTotalQty} db • {purchaseOrderWorkGroups.length} beszállító</p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-white/45">{selectedWorkActionLabels[selectedWorkPanel]}</p>
                  <h2 className="mt-1 text-lg text-white">{selectedItemsForAction(selectedWorkPanel).length} termék a listában</h2>
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {selectedWorkPanel === "label" && (
                  <button className={primaryBtn} onClick={openLabelComposer} type="button" disabled={!selectedLabelItems.length || labelDetailsBusy}>
                    <Barcode size={15} /> {labelDetailsBusy ? "Termékadatok betöltése..." : "Címkék előkészítése"}
                  </button>
                )}
                {selectedWorkPanel === "shopify" && (
                  <button className={primaryBtn} onClick={openSelectedShopifyExport} type="button" disabled={!selectedShopifyItems.length}>
                    <ShopifyBrandMark size="xs" /> Shopify export előkészítése
                  </button>
                )}
                {selectedWorkPanel === "order" && (
                  <button className={`${btnSoft} !h-10 !rounded-xl !px-4 !text-[12px]`} onClick={openPurchaseOrdersPage} type="button">
                    <ClipboardList size={14} /> Rendelések
                  </button>
                )}
                <button className={`${btnSoft} !h-10 !rounded-xl !px-4 !text-[12px]`} onClick={() => setSelectedWorkPanel(null)} type="button"><ArrowLeft size={15} /> Vissza</button>
                <button className={`${btnSoft} !h-10 !rounded-xl !px-4 !text-[12px]`} onClick={closeSelectedWorkflowAndReturn} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>

            <div className={selectedWorkPanel === "move" || selectedWorkPanel === "order"
              ? "min-h-0 flex-1 overflow-hidden bg-[#253143] p-3.5"
              : "space-y-3 p-4"}>
              {selectedWorkPanel === "move" ? (
                <div className="flex h-full min-h-0 flex-col gap-3">
                  <div className="grid shrink-0 gap-3 xl:grid-cols-[minmax(420px,.92fr)_minmax(700px,1.38fr)]">
                    <section className="overflow-hidden rounded-2xl border border-white/14 bg-[#303d51] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_28px_rgba(2,6,23,0.10)]">
                      <div className="flex h-10 items-center justify-between gap-2 border-b border-white/10 bg-[#29364a] px-3.5">
                        <span className="inline-flex items-center gap-2 text-[13px] text-white/92">
                          <FileText size={13} className="text-[#7bd7d4]" />
                          Bizonylat
                        </span>
                        <span className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[10px] ${moveAllRowsValid ? "border-[#7bd7d4]/32 bg-[#2a8d8b]/18 text-[#d7fffd]" : "border-amber-200/28 bg-amber-300/12 text-amber-50"}`}>
                          {moveAllRowsValid ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                          {moveAllRowsValid ? "Menthető" : `${moveInvalidCount} hibás`}
                        </span>
                      </div>
                      <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                        <label className="grid min-w-0 gap-1.5 text-[10px] uppercase tracking-[0.08em] text-white/58" title="Ez a cím kerül a PDF-re és a mozgásnaplóba.">
                          Bizonylat címe
                          <input
                            className="h-10 w-full rounded-xl border border-white/18 bg-[#253247] px-3 text-[13px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none placeholder:text-white/38 focus:border-[#7bd7d4]/60 focus:ring-2 focus:ring-[#7bd7d4]/18"
                            value={stockMoveDocumentTitle}
                            onChange={(e) => setStockMoveDocumentTitle(e.target.value)}
                            placeholder="Aviz intern de transfer stoc"
                          />
                        </label>
                        <label className="grid min-w-0 gap-1.5 text-[10px] uppercase tracking-[0.08em] text-white/58" title="Opcionális megjegyzés a PDF-re és a mozgásnaplóba.">
                          Megjegyzés
                          <input
                            className="h-10 w-full rounded-xl border border-white/18 bg-[#253247] px-3 text-[13px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none placeholder:text-white/38 focus:border-[#7bd7d4]/60 focus:ring-2 focus:ring-[#7bd7d4]/18"
                            value={stockMoveNote}
                            onChange={(e) => setStockMoveNote(e.target.value)}
                            placeholder="Opcionális"
                          />
                        </label>
                      </div>
                    </section>

                    <section className="overflow-hidden rounded-2xl border border-white/14 bg-[#303d51] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_28px_rgba(2,6,23,0.10)]">
                      <div className="flex h-10 items-center justify-between gap-2 border-b border-white/10 bg-[#29364a] px-3.5">
                        <span className="inline-flex items-center gap-2 text-[13px] text-white/92" title="Az itt kiválasztott útvonal egy kattintással minden terméksorra rákerül.">
                          <ArrowRightLeft size={13} className="text-[#7bd7d4]" />
                          Egységes útvonal
                        </span>
                        <span className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/66">1 PV = 1 útvonal</span>
                      </div>
                      <div className="grid gap-2.5 p-3 sm:grid-cols-[minmax(220px,1fr)_40px_minmax(220px,1fr)_auto] sm:items-center">
                        <label className="grid min-w-0 gap-1.5 rounded-xl border border-rose-400/24 bg-rose-950/16 p-2 text-[10px] uppercase tracking-[0.08em] text-rose-200">
                          Kimenő / forrás
                          <WarehouseMoveDropdown
                            value={stockMoveBulkFrom}
                            placeholder="Válassz forrást..."
                            ariaLabel="Tömeges forrás hely"
                            tone="source"
                            options={stockLocationRows.map((loc) => ({
                              value: locationValue(loc),
                              label: warehouseMoveLocationLabel(loc),
                            }))}
                            onChange={(fromId) => {
                              setStockMoveBulkFrom(fromId);
                              if (!fromId) return;
                              setStockMoveBulkTo((current) => current && current !== fromId ? current : defaultStockMoveTo(fromId));
                            }}
                          />
                        </label>
                        <button
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-[#253247] text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition hover:border-[#7bd7d4]/45 hover:bg-[#2a8d8b]/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                          type="button"
                          disabled={!stockMoveBulkFrom || !stockMoveBulkTo}
                          onClick={() => {
                            const fromId = stockMoveBulkFrom;
                            setStockMoveBulkFrom(stockMoveBulkTo);
                            setStockMoveBulkTo(fromId);
                          }}
                          title="Forrás és cél felcserélése"
                          aria-label="Forrás és cél felcserélése"
                        >
                          <ArrowRightLeft size={14} />
                        </button>
                        <label className="grid min-w-0 gap-1.5 rounded-xl border border-[#7bd7d4]/24 bg-[#174c55]/24 p-2 text-[10px] uppercase tracking-[0.08em] text-[#bff7f4]">
                          Bejövő / cél
                          <WarehouseMoveDropdown
                            value={stockMoveBulkTo}
                            placeholder="Válassz célhelyet..."
                            ariaLabel="Tömeges cél hely"
                            tone="target"
                            options={stockLocationRows.map((loc) => {
                              const value = locationValue(loc);
                              return {
                                value,
                                label: warehouseMoveLocationLabel(loc),
                                disabled: value === stockMoveBulkFrom,
                              };
                            })}
                            onChange={(toId) => {
                              setStockMoveBulkTo(toId);
                              if (!toId) return;
                              setStockMoveBulkFrom((current) => current && current !== toId ? current : firstDifferentLocation(toId));
                            }}
                          />
                        </label>
                        <button
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/48 bg-[#2a8d8b] px-4 text-[12px] text-white shadow-[0_10px_24px_rgba(2,6,23,0.20)] transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-40"
                          type="button"
                          disabled={!moveBulkCanApply}
                          onClick={applyStockMoveBulkLocations}
                          title="A kiválasztott útvonalat minden terméksorra ráteszi. Készletet még nem mozgat."
                        >
                          <PackageCheck size={13} />
                          Minden sorra
                        </button>
                      </div>
                    </section>
                  </div>

                  {(moveRouteProblem || moveInvalidCount > 0) ? (
                    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200/28 bg-amber-500/[0.09] px-3 py-2 text-[12px] text-amber-50">
                      <AlertTriangle size={13} className="shrink-0" />
                      <span className="min-w-0" title={moveRouteProblem || `${moveInvalidCount} terméksor hibás.`}>
                        {moveRouteProblem || `${moveInvalidCount} terméksor még hibás.`}
                      </span>
                    </div>
                  ) : null}

                  <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/14 bg-[#29364a] shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_16px_34px_rgba(2,6,23,0.14)]">
                    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#263246] px-3.5">
                      <div className="flex items-center gap-2 text-[13px] text-white/94" title="A teljes termékadatok rámutatással érhetők el.">
                        <Boxes size={14} className="text-[#7bd7d4]" />
                        Mozgatandó termékek
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="rounded-full border border-white/12 bg-white/[0.05] px-2 py-0.5 text-white/65">{selectedMoveItems.length} sor</span>
                        <span className="rounded-full border border-[#7bd7d4]/25 bg-[#2a8d8b]/12 px-2 py-0.5 text-[#d7fffd]">{moveTotalQty} db</span>
                      </div>
                    </div>

                    <div className="hidden shrink-0 border-b border-white/[0.09] bg-[#202c3e] px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-white/56 xl:grid xl:grid-cols-[24px_44px_minmax(250px,1.15fr)_minmax(200px,.9fr)_40px_minmax(200px,.9fr)_124px_104px_68px] xl:items-center xl:gap-2.5">
                      <span />
                      <span />
                      <span>Termék</span>
                      <span>Kimenő / forrás</span>
                      <span />
                      <span>Bejövő / cél</span>
                      <span>Mozgatandó</span>
                      <span className="text-right">Érték</span>
                      <span />
                    </div>

                    <div className="min-h-0 flex-1 divide-y divide-white/[0.08] overflow-y-auto overscroll-contain">
                      {selectedMoveItems.map((it) => {
                        const variantId = String(it.variant_id || "");
                        const preparedMove = preparedMoveRowsById.get(variantId);
                        const draft = stockMoveRows[variantId] || (preparedMove ? {
                          fromLocationId: preparedMove.fromLocationId,
                          toLocationId: preparedMove.toLocationId,
                          qty: String(preparedMove.qty),
                        } : defaultMoveDraftForItem(it));
                        const availableFrom = preparedMove?.availableFrom ?? availableAtLocation(variantId, draft.fromLocationId);
                        const currentQty = qtyAtLocation(variantId, draft.fromLocationId);
                        const reservedQty = reservedAtLocation(variantId, draft.fromLocationId);
                        const rowProblem = preparedMove?.problem || "";
                        const lineValue = (priceNumber(it.sell_price) || 0) * Math.max(0, n(draft.qty));

                        return (
                          <article
                            key={it.variant_id}
                            className={`${rowProblem ? "bg-amber-500/[0.07]" : "bg-[#344257] hover:bg-[#3d4c61]"} transition-colors`}
                          >
                            <div className="grid gap-2.5 px-3 py-2 xl:grid-cols-[24px_44px_minmax(250px,1.15fr)_minmax(200px,.9fr)_40px_minmax(200px,.9fr)_124px_104px_68px] xl:items-center">
                              <div className="flex justify-center">
                                <input
                                  className={selectBox}
                                  type="checkbox"
                                  checked
                                  onChange={(e) => {
                                    if (!e.target.checked) returnSelectedItemToMainList(variantId);
                                  }}
                                  aria-label="Kivétel ebből a feladatlistából"
                                  title="Kivétel a készletmozgatási listából; a fő kijelölésben megmarad."
                                />
                              </div>

                              <WarehouseProductImage
                                src={it.image_url}
                                alt={it.title_ro || ""}
                                thumbClassName="h-10 w-10 rounded-xl"
                                iconSize={15}
                              />

                              <div
                                className="min-w-0"
                                title={`${it.title_ro || "-"} • ${it.brand_name || "-"} • ${itemMainCategoryLabel(it)} • ${colorDisplay(it.color_name, it.color_code)} • ${it.size || "-"} • Készlet: ${n(it.total_qty)} db • Vonalkód: ${visibleWarehouseBarcode(it) || "-"} • Termékkód: ${itemProductCode(it) || "-"}`}
                              >
                                <p className="truncate text-[13px] text-white">{it.title_ro || "-"}</p>
                                <p className="mt-0.5 truncate text-[11px] text-white/58">
                                  {it.brand_name || "-"} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"} • készlet {n(it.total_qty)} db
                                </p>
                              </div>

                              <WarehouseMoveDropdown
                                value={draft.fromLocationId}
                                placeholder="Forrás..."
                                ariaLabel="Forrás hely"
                                tone="source"
                                options={stockLocationRows.map((loc) => {
                                  const optionValue = locationValue(loc);
                                  const available = availableAtLocation(variantId, optionValue);
                                  return {
                                    value: optionValue,
                                    label: warehouseMoveLocationLabel(loc),
                                    hint: `${available} db`,
                                  };
                                })}
                                onChange={(fromLocationId) => setStockMoveRowField(variantId, { fromLocationId })}
                              />

                              <button
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-[#253247] text-white/68 transition hover:border-[#7bd7d4]/45 hover:bg-[#2a8d8b]/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                                type="button"
                                onClick={() => setStockMoveRowField(variantId, {
                                  fromLocationId: draft.toLocationId,
                                  toLocationId: draft.fromLocationId,
                                })}
                                disabled={!draft.fromLocationId || !draft.toLocationId}
                                title={`Forrás és cél felcserélése. Forráskészlet: ${currentQty} db, foglalt: ${reservedQty} db.`}
                                aria-label="Forrás és cél felcserélése"
                              >
                                <ArrowRightLeft size={13} />
                              </button>

                              <WarehouseMoveDropdown
                                value={draft.toLocationId}
                                placeholder="Célhely..."
                                ariaLabel="Cél hely"
                                tone="target"
                                options={stockLocationRows.map((loc) => {
                                  const optionValue = locationValue(loc);
                                  return {
                                    value: optionValue,
                                    label: warehouseMoveLocationLabel(loc),
                                    disabled: optionValue === draft.fromLocationId,
                                  };
                                })}
                                onChange={(toLocationId) => setStockMoveRowField(variantId, { toLocationId })}
                              />

                              <div
                                className="grid h-10 grid-cols-[32px,minmax(48px,1fr),32px] overflow-hidden rounded-xl border border-white/18 bg-[#253247] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                                title={`Legfeljebb ${availableFrom} db mozgatható erről a forráshelyről.`}
                              >
                                <button
                                  className="inline-flex h-10 items-center justify-center border-r border-white/10 text-white/84 hover:bg-white/10 disabled:opacity-35"
                                  type="button"
                                  onClick={() => adjustStockMoveQty(variantId, -1)}
                                  disabled={n(draft.qty) <= 0}
                                  aria-label="Darabszám csökkentése"
                                >
                                  <Minus size={12} />
                                </button>
                                <input
                                  className="w-full min-w-0 bg-transparent px-1 text-center text-[13px] text-white outline-none tabular-nums"
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={draft.qty}
                                  onChange={(e) => setStockMoveRowField(variantId, {
                                    qty: e.target.value.replace(/[^0-9]/g, ""),
                                  })}
                                  aria-label="Mozgatott darabszám"
                                />
                                <button
                                  className="inline-flex h-10 items-center justify-center border-l border-white/10 text-white/84 hover:bg-white/10 disabled:opacity-35"
                                  type="button"
                                  onClick={() => adjustStockMoveQty(variantId, 1)}
                                  disabled={availableFrom <= 0 || n(draft.qty) >= availableFrom}
                                  aria-label="Darabszám növelése"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>

                              <div className="truncate text-right text-[12px] tabular-nums text-white" title={`${money(lineValue)} RON`}>
                                {money(lineValue)} <span className="text-[10px] text-white/46">RON</span>
                              </div>

                              <div className="flex justify-end gap-1.5">
                                <button
                                  className={moveTinyBtn}
                                  onClick={() => {
                                    setSelectedWorkPanel(null);
                                    setSelectedPanelOpen(false);
                                    openDetail(it.variant_id);
                                  }}
                                  type="button"
                                  title="Termék részletei"
                                  aria-label="Termék részletei"
                                >
                                  <Edit3 size={12} />
                                </button>
                                <button
                                  className={`${moveTinyBtn} hover:border-rose-300/45 hover:bg-rose-500/16`}
                                  onClick={() => returnSelectedItemToMainList(variantId)}
                                  type="button"
                                  title="Kivétel a készletmozgatásból"
                                  aria-label="Kivétel a készletmozgatásból"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </div>

                            {rowProblem ? (
                              <div className="flex items-center gap-2 border-t border-amber-200/16 bg-amber-500/[0.08] px-3 py-1.5 text-[11px] text-amber-100">
                                <AlertTriangle size={11} className="shrink-0" />
                                {rowProblem}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                      {!selectedMoveItems.length ? (
                        <p className="px-3 py-8 text-center text-sm text-white/60">Nincs termék ebben a listában.</p>
                      ) : null}
                    </div>
                  </section>
                </div>
              ) : selectedWorkPanel === "order" ? (
                <div className="flex h-full min-h-0 flex-col gap-3">
                  <section className="shrink-0 overflow-hidden rounded-2xl border border-white/14 bg-[#303d51] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_28px_rgba(2,6,23,0.10)]">
                    <div className="flex h-10 items-center justify-between gap-2 border-b border-white/10 bg-[#29364a] px-3.5">
                      <span className="inline-flex items-center gap-2 text-[13px] text-white/92">
                        <ClipboardList size={13} className="text-[#7bd7d4]" />
                        Nyitott rendelések beállítása
                      </span>
                      <span className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/66" title="Beszállítónként mindig a meglévő nyitott rendelés bővül; ha nincs, új rendelés nyílik.">
                        1 beszállító = 1 nyitott rendelés
                      </span>
                    </div>
                    <div className="grid gap-3 p-3 lg:grid-cols-[minmax(280px,.8fr)_minmax(0,1.7fr)] lg:items-end">
                      <label className="grid min-w-0 gap-1.5 text-[10px] uppercase tracking-[0.08em] text-white/58">
                        Alapértelmezett célhely
                        <WarehouseMoveDropdown
                          value={purchaseOrderTargetLocationId}
                          placeholder="Válassz célhelyet..."
                          ariaLabel="Beszerzési rendelés célhelye"
                          tone="target"
                          options={stockLocationRows.map((loc) => ({
                            value: locationValue(loc),
                            label: warehouseMoveLocationLabel(loc),
                          }))}
                          onChange={(value) => {
                            setPurchaseOrderTargetLocationId(value);
                            purchaseOrderWorkIdempotencyKeyRef.current = "";
                          }}
                        />
                      </label>
                      <div className="min-w-0">
                        <p className="mb-1.5 text-[10px] uppercase tracking-[0.08em] text-white/48">Rendelések</p>
                        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-white/12 bg-[#253247] px-2.5 py-1.5">
                          {purchaseOrderWorkGroups.map((group) => (
                            <span key={group.supplierId} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#7bd7d4]/25 bg-[#2a8d8b]/14 px-2 text-[11px] text-[#d7fffd]" title={`${group.rows} terméksor, ${group.qty} db, ismert vételár alapján ${money(group.value)} RON`}>
                              {group.supplierName}
                              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-white">{group.rows}/{group.qty}</span>
                            </span>
                          ))}
                          {!purchaseOrderWorkGroups.length ? (
                            <span className="text-[11px] text-white/45">A beszállítók kiválasztása után itt látszik, hány nyitott rendelés frissül.</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </section>

                  {purchaseOrderWorkInvalidCount > 0 ? (
                    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-rose-200/28 bg-[#d31126]/18 px-3 py-2 text-[12px] text-rose-50">
                      <AlertTriangle size={13} className="shrink-0" />
                      <span>{purchaseOrderWorkInvalidCount} terméksornál még beszállítót vagy mennyiséget kell megadni.</span>
                    </div>
                  ) : null}

                  <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/14 bg-[#29364a] shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_16px_34px_rgba(2,6,23,0.14)]">
                    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#263246] px-3.5">
                      <div className="flex items-center gap-2 text-[13px] text-white/94">
                        <Boxes size={14} className="text-[#7bd7d4]" />
                        Rendelendő termékek
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="rounded-full border border-white/12 bg-white/[0.05] px-2 py-0.5 text-white/65">{selectedOrderItems.length} sor</span>
                        <span className="rounded-full border border-[#7bd7d4]/25 bg-[#2a8d8b]/12 px-2 py-0.5 text-[#d7fffd]">{purchaseOrderWorkTotalQty} db</span>
                        <span className="rounded-full border border-amber-200/20 bg-amber-300/[0.08] px-2 py-0.5 text-amber-50" title="Csak a rögzített vételárak összege. Eladási ár nem kerül a beszerzési rendelésbe.">{money(purchaseOrderWorkTotalValue)} RON</span>
                      </div>
                    </div>

                    <div className="hidden shrink-0 border-b border-white/[0.09] bg-[#202c3e] px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-white/56 lg:grid lg:grid-cols-[24px_44px_minmax(250px,1.2fr)_minmax(220px,.85fr)_112px_132px_86px] lg:items-center lg:gap-2.5">
                      <span />
                      <span />
                      <span>Termék</span>
                      <span>Beszállító</span>
                      <span className="text-right">Vételár</span>
                      <span>Rendelendő</span>
                      <span />
                    </div>

                    <div className="min-h-0 flex-1 divide-y divide-white/[0.08] overflow-y-auto overscroll-contain">
                      {selectedOrderItems.map((it) => {
                        const variantId = String(it.variant_id || "");
                        const prepared = preparedPurchaseOrderRowsById.get(variantId);
                        const draft = purchaseOrderWorkRows[variantId] || {
                          supplierId: preferredOrderSupplierIdForItem(it),
                          qty: "1",
                        };
                        const rowProblem = prepared?.problem || "";
                        const supplierOptions = purchaseOrderSupplierOptionsForItem(it);

                        return (
                          <article key={variantId} className={`${rowProblem ? "bg-rose-500/[0.06]" : "bg-[#344257] hover:bg-[#3d4c61]"} transition-colors`}>
                            <div className="grid gap-2.5 px-3 py-2 lg:grid-cols-[24px_44px_minmax(250px,1.2fr)_minmax(220px,.85fr)_112px_132px_86px] lg:items-center">
                              <div className="flex justify-center">
                                <input
                                  className={selectBox}
                                  type="checkbox"
                                  checked
                                  onChange={(event) => {
                                    if (!event.target.checked) returnSelectedItemToMainList(variantId);
                                  }}
                                  aria-label="Kivétel a rendelési listából"
                                  title="Kivétel a rendelési listából; a fő kijelölésben megmarad."
                                />
                              </div>

                              <WarehouseProductImage
                                src={it.image_url}
                                alt={it.title_ro || ""}
                                thumbClassName="h-10 w-10 rounded-xl"
                                iconSize={15}
                              />

                              <div className="min-w-0" title={`${it.title_ro || "-"} • ${it.brand_name || "-"} • ${colorDisplay(it.color_name, it.color_code)} • ${it.size || "-"} • ${itemProductCode(it) || "-"}`}>
                                <p className="truncate text-[13px] text-white">{it.title_ro || "-"}</p>
                                <p className="mt-0.5 truncate text-[11px] text-white/58">
                                  {it.brand_name || "-"} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"} • {itemProductCode(it) || "nincs termékkód"}
                                </p>
                              </div>

                              <WarehouseMoveDropdown
                                value={draft.supplierId}
                                placeholder="Válassz beszállítót..."
                                ariaLabel="Rendelési beszállító"
                                options={supplierOptions}
                                onChange={(supplierId) => setPurchaseOrderWorkRowField(variantId, { supplierId })}
                              />

                              <div className="text-right text-[12px] tabular-nums" title="A termék rögzített vételára. Eladási ár nem kerül a beszerzési rendelésbe.">
                                {prepared?.unitPrice === null || prepared?.unitPrice === undefined
                                  ? <span className="text-white/38">nincs adat</span>
                                  : <span className="text-amber-50">{money(prepared.unitPrice)} RON</span>}
                              </div>

                              <div className="grid h-10 grid-cols-[32px,minmax(48px,1fr),32px] overflow-hidden rounded-xl border border-white/18 bg-[#253247] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                                <button
                                  className="inline-flex h-10 items-center justify-center border-r border-white/10 text-white/84 hover:bg-white/10 disabled:opacity-35"
                                  type="button"
                                  onClick={() => adjustPurchaseOrderWorkQty(variantId, -1)}
                                  disabled={n(draft.qty) <= 1}
                                  aria-label="Rendelendő mennyiség csökkentése"
                                >
                                  <Minus size={12} />
                                </button>
                                <input
                                  className="w-full min-w-0 bg-transparent px-1 text-center text-[13px] text-white outline-none tabular-nums"
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={draft.qty}
                                  onChange={(event) => setPurchaseOrderWorkRowField(variantId, {
                                    qty: event.target.value.replace(/[^0-9]/g, "") || "1",
                                  })}
                                  aria-label="Rendelendő darabszám"
                                />
                                <button
                                  className="inline-flex h-10 items-center justify-center border-l border-white/10 text-white/84 hover:bg-white/10"
                                  type="button"
                                  onClick={() => adjustPurchaseOrderWorkQty(variantId, 1)}
                                  aria-label="Rendelendő mennyiség növelése"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>

                              <div className="flex justify-end gap-1.5">
                                <button
                                  className={moveTinyBtn}
                                  onClick={() => {
                                    setSelectedWorkPanel(null);
                                    setSelectedPanelOpen(false);
                                    openDetail(it.variant_id);
                                  }}
                                  type="button"
                                  title="Termék részletei"
                                  aria-label="Termék részletei"
                                >
                                  <Edit3 size={12} />
                                </button>
                                <button
                                  className={`${moveTinyBtn} hover:border-rose-300/45 hover:bg-rose-500/16`}
                                  onClick={() => returnSelectedItemToMainList(variantId)}
                                  type="button"
                                  title="Kivétel a rendelési listából"
                                  aria-label="Kivétel a rendelési listából"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </div>

                            {rowProblem ? (
                              <div className="flex items-center gap-2 border-t border-rose-200/14 bg-[#d31126]/10 px-3 py-1.5 text-[11px] text-rose-100">
                                <AlertTriangle size={11} className="shrink-0" />
                                {rowProblem}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                      {!selectedOrderItems.length ? (
                        <p className="px-3 py-8 text-center text-sm text-white/60">Nincs termék ebben a listában.</p>
                      ) : null}
                    </div>
                  </section>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-[#2a8d8b]/30 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                    Itt vannak azok a termékek, amelyeket ehhez a feladathoz soroltál. A pipa levétele csak ebből a feladatlistából veszi ki, a fő Kijelölt termékek listában megmarad. Shopify exportnál a következő ablak minden szükséges adatot ellenőriz, mielőtt az egyetlen Shopify CSV elkészül.
                  </div>
                  <div className="grid gap-2">
                    {selectedItemsForAction(selectedWorkPanel).map((it) => (
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
                        <WarehouseProductImage src={it.image_url} alt={it.title_ro || ""} thumbClassName="h-12 w-12 rounded-lg" iconSize={18} />
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
                    ))}
                    {!selectedItemsForAction(selectedWorkPanel).length && <p className="rounded-xl border border-white/12 bg-[#3f4959] px-3 py-6 text-center text-sm text-white/60">Nincs termék ebben a listában.</p>}
                  </div>
                </>
              )}
            </div>

            {selectedWorkPanel === "move" && selectedMoveItems.length > 0 && (
              <div className="flex min-h-[62px] shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/14 bg-[#172235]/98 px-4 py-3 shadow-[0_-18px_38px_rgba(2,6,23,0.34)] backdrop-blur">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5 text-[12px]" title={`${moveRouteSummary.from} → ${moveRouteSummary.to}. Mentéskor a készlet ténylegesen átkerül, és a sorok a nyitott PV-előkészítéshez adódnak.`}>
                  <span className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 ${moveAllRowsValid ? "border-[#7bd7d4]/35 bg-[#2a8d8b]/20 text-[#d7fffd]" : "border-amber-200/28 bg-amber-300/12 text-amber-50"}`}>
                    {moveAllRowsValid ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {moveAllRowsValid ? "Rendben" : "Javítandó"}
                  </span>
                  <span className="text-white">{moveValidRows.length} sor • {moveTotalQty} db • {money(moveTotalValue)} RON</span>
                  <span className="max-w-[620px] truncate text-white/52">{moveRouteSummary.from} → {moveRouteSummary.to}</span>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button className={`${btnSoft} !h-10 !rounded-xl !px-4 !text-[12px]`} onClick={printStockMoveTransferPdf} type="button" disabled={!moveAllRowsValid} title="PDF előnézet a jelenlegi sorokból.">
                    <Printer size={14} /> PDF
                  </button>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/50 bg-[#2a8d8b] px-4 text-[12px] text-white shadow-[0_10px_24px_rgba(2,6,23,0.24)] transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-40" onClick={requestSaveSelectedMoveTransfers} type="button" disabled={!moveCanSave} title="Tényleges készletmozgatás és hozzáadás a nyitott PV-előkészítéshez; előtte megerősítést kér.">
                    <PackageCheck size={15} /> {stockMoveSaving ? "Mentés..." : "Mozgatás az előkészítésbe"}
                  </button>
                </div>
              </div>
            )}

            {selectedWorkPanel === "order" && selectedOrderItems.length > 0 && (
              <div className="flex min-h-[62px] shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/14 bg-[#172235]/98 px-4 py-3 shadow-[0_-18px_38px_rgba(2,6,23,0.34)] backdrop-blur">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5 text-[12px]" title="Mentéskor beszállítónként a meglévő nyitott rendelés bővül, vagy új nyitott rendelés jön létre.">
                  <span className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 ${purchaseOrderWorkCanSave ? "border-[#7bd7d4]/35 bg-[#2a8d8b]/20 text-[#d7fffd]" : "border-rose-200/35 bg-[#d31126]/65 text-white"}`}>
                    {purchaseOrderWorkCanSave ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    {purchaseOrderWorkCanSave ? "Rendben" : "Javítandó"}
                  </span>
                  <span className="text-white">{preparedPurchaseOrderRows.length} sor • {purchaseOrderWorkTotalQty} db</span>
                  <span className="max-w-[620px] truncate text-white/52">{purchaseOrderWorkGroups.map((group) => group.supplierName).join(" • ") || "Nincs kiválasztott beszállító"}</span>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button className={`${btnSoft} !h-10 !rounded-xl !px-4 !text-[12px]`} onClick={openPurchaseOrdersPage} type="button">
                    <ClipboardList size={14} /> Rendelések
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/50 bg-[#2a8d8b] px-4 text-[12px] text-white shadow-[0_10px_24px_rgba(2,6,23,0.24)] transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={saveSelectedOrderItemsToOpenOrders}
                    type="button"
                    disabled={!purchaseOrderWorkCanSave}
                    title="Hozzáadás beszállítónként a nyitott rendeléshez; ha nincs ilyen, új nyitott rendelés készül."
                  >
                    <Plus size={15} /> {purchaseOrderWorkSaving ? "Mentés..." : "Hozzáadás a nyitott rendelésekhez"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {warehouseMoveValuePreview && typeof document !== "undefined" ? createPortal(
        <div
          className={`pointer-events-none fixed right-5 top-[96px] z-[125] w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[22px] border text-slate-900 shadow-[0_28px_90px_rgba(15,23,42,0.48)] ${warehouseMoveValuePreview.thresholdReached && !warehouseMoveValuePreview.uitRecorded ? "border-red-300" : "border-teal-300"}`}
          style={{ backgroundColor: "#ffffff", color: "#0f172a", opacity: 1 }}
          role="status"
          aria-live="polite"
        >
          <div className={`flex items-start gap-3 px-3.5 py-3 text-white ${warehouseMoveValuePreview.thresholdReached && !warehouseMoveValuePreview.uitRecorded ? "bg-[#b4233d]" : "bg-[#176f6c]"}`}>
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/35 bg-white/15 text-white shadow-sm">
              {warehouseMoveValuePreview.thresholdReached && !warehouseMoveValuePreview.uitRecorded ? <AlertTriangle size={19} /> : warehouseMoveValuePreview.uitRecorded ? <CheckCircle2 size={19} /> : <Receipt size={19} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/80">PV-előkészítés élő értéke</p>
              <p className="mt-1 truncate text-[15px] leading-tight text-white" title={warehouseMoveValuePreview.preparation?.document_number || "Új előkészítés"}>
                {warehouseMoveValuePreview.preparation?.document_number || "Új előkészítés"}
              </p>
              <p className="mt-1 truncate text-[10px] text-white/82" title={`${warehouseMoveValuePreview.fromLocationName} → ${warehouseMoveValuePreview.toLocationName}`}>
                {warehouseMoveValuePreview.fromLocationName} → {warehouseMoveValuePreview.toLocationName}
              </p>
            </div>
            {openTransferPreparationsBusy ? <RefreshCw size={15} className="mt-1 shrink-0 animate-spin text-white/85" /> : null}
          </div>

          <div className="bg-white p-3.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 shadow-sm">
                <p className="text-[9px] uppercase tracking-[0.11em] text-slate-500">Már ebben az irányban</p>
                <p className="mt-1 text-[17px] leading-none text-slate-900">
                  {openTransferPreparationsLoaded ? money(warehouseMoveValuePreview.currentValue) : "Betöltés..."}
                  {openTransferPreparationsLoaded ? <span className="ml-1 text-[9px] text-slate-500">RON</span> : null}
                </p>
              </div>
              <div className="rounded-2xl border border-teal-200 bg-teal-50 px-3 py-2.5 shadow-sm">
                <p className="text-[9px] uppercase tracking-[0.11em] text-[#176f6c]">Most hozzáadod</p>
                <p className="mt-1 text-[17px] leading-none text-[#0f5f59]">+{money(warehouseMoveValuePreview.addedValue)} <span className="text-[9px] text-[#176f6c]">RON</span></p>
                <p className="mt-1 text-[10px] text-slate-600">{warehouseMoveValuePreview.qty} db</p>
              </div>
            </div>

            <div className={`mt-3 rounded-2xl border px-3 py-3 shadow-sm ${warehouseMoveValuePreview.thresholdReached && !warehouseMoveValuePreview.uitRecorded ? "border-red-200 bg-red-50" : "border-teal-200 bg-[#effbf9]"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className={`text-[10px] ${warehouseMoveValuePreview.thresholdReached && !warehouseMoveValuePreview.uitRecorded ? "text-red-800" : "text-[#176f6c]"}`}>Mentés után, ezen a PV-n</span>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] ${warehouseMoveValuePreview.thresholdReached && !warehouseMoveValuePreview.uitRecorded ? "border-red-300 bg-white text-red-700" : "border-teal-300 bg-white text-[#176f6c]"}`}>
                  {warehouseMoveValuePreview.uitRecorded ? "UIT rögzítve" : warehouseMoveValuePreview.thresholdReached ? "UIT szükséges" : `${money(Math.max(0, warehouseMoveValuePreview.remainingValue))} RON maradt`}
                </span>
              </div>
              <p className={`mt-2 text-[25px] leading-none ${warehouseMoveValuePreview.thresholdReached && !warehouseMoveValuePreview.uitRecorded ? "text-red-900" : "text-slate-900"}`}>
                {money(warehouseMoveValuePreview.projectedValue)} <span className="text-[10px] text-slate-500">RON</span>
              </p>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${warehouseMoveValuePreview.thresholdReached && !warehouseMoveValuePreview.uitRecorded ? "bg-red-500" : "bg-[#2a8d8b]"}`}
                  style={{ width: `${Math.min(100, Math.max(2, (warehouseMoveValuePreview.projectedValue / WAREHOUSE_UIT_WARNING_THRESHOLD_RON) * 100))}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-600">A darabszám vagy egy terméksor módosításakor az összeg azonnal újraszámolódik.</p>
            </div>

            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-[10px] leading-relaxed text-sky-900">
              Az ellenkező irány külön PV-előkészítést kap, ezért a két útvonal értéke nem adódik össze.
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      <ShopifyProductExportModal
        open={shopifyExportModalOpen}
        items={shopifyExportItems}
        onClose={closeShopifyExportModal}
        onChanged={handleShopifyExportChanged}
      />

      <ShopifySyncCenterModal
        open={shopifySyncCenterOpen}
        onClose={() => setShopifySyncCenterOpen(false)}
        onChanged={() => load()}
      />

      {warehouseTransferToast && typeof document !== "undefined" ? createPortal(
        <div
          className={`fixed bottom-5 right-5 z-[125] w-[390px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[22px] border text-slate-900 shadow-[0_28px_90px_rgba(15,23,42,0.48)] ${warehouseTransferToast.crossedThreshold && !warehouseTransferToast.uitRecorded ? "border-red-300" : "border-teal-300"}`}
          style={{ backgroundColor: "#ffffff", color: "#0f172a", opacity: 1 }}
          role="status"
          aria-live="polite"
        >
          <div className={`flex items-start gap-3 px-3.5 py-3 text-white ${warehouseTransferToast.crossedThreshold && !warehouseTransferToast.uitRecorded ? "bg-[#b4233d]" : "bg-[#176f6c]"}`}>
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/35 bg-white/15 text-white shadow-sm">
              {warehouseTransferToast.crossedThreshold && !warehouseTransferToast.uitRecorded ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/80">Előkészítés frissítve</p>
              <p className="mt-1 truncate text-[15px] leading-tight text-white" title={warehouseTransferToast.documentNumber}>{warehouseTransferToast.documentNumber}</p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-white/12 text-white hover:bg-white/22"
              onClick={() => setWarehouseTransferToast(null)}
              aria-label="Értesítés bezárása"
            >
              <X size={14} />
            </button>
          </div>

          <div className="bg-white p-3.5">
            {warehouseTransferToast.routeLabel ? (
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-700" title={warehouseTransferToast.routeLabel}>
                <span className="block text-[9px] uppercase tracking-[0.11em] text-slate-500">Útvonal</span>
                <span className="mt-0.5 block truncate text-slate-800">{warehouseTransferToast.routeLabel}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-teal-200 bg-teal-50 px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-[0.11em] text-[#176f6c]">Most hozzáadva</p>
                <p className="mt-1 text-[17px] leading-none text-[#0f5f59]">+{money(warehouseTransferToast.addedValue)} <span className="text-[9px] text-[#176f6c]">RON</span></p>
              </div>
              <div className={`rounded-2xl border px-3 py-2.5 ${warehouseTransferToast.crossedThreshold && !warehouseTransferToast.uitRecorded ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                <p className={`text-[9px] uppercase tracking-[0.11em] ${warehouseTransferToast.crossedThreshold && !warehouseTransferToast.uitRecorded ? "text-red-700" : "text-slate-500"}`}>PV összesen</p>
                <p className={`mt-1 text-[20px] leading-none ${warehouseTransferToast.crossedThreshold && !warehouseTransferToast.uitRecorded ? "text-red-900" : "text-slate-900"}`}>{money(warehouseTransferToast.totalValue)} <span className="text-[9px] text-slate-500">RON</span></p>
              </div>
            </div>

            <div className={`mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${warehouseTransferToast.crossedThreshold && !warehouseTransferToast.uitRecorded ? "border-red-200 bg-red-50" : "border-teal-200 bg-[#effbf9]"}`}>
              <span className={`text-[10px] ${warehouseTransferToast.crossedThreshold && !warehouseTransferToast.uitRecorded ? "text-red-800" : "text-[#176f6c]"}`}>
                {warehouseTransferToast.uitRecorded ? "Az UIT kód rögzítve van." : warehouseTransferToast.crossedThreshold ? "A PV elérte az UIT-határt." : "Az UIT-határig még maradt:"}
              </span>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] ${warehouseTransferToast.crossedThreshold && !warehouseTransferToast.uitRecorded ? "border-red-300 bg-white text-red-700" : "border-teal-300 bg-white text-[#176f6c]"}`}>
                {warehouseTransferToast.uitRecorded ? "UIT rögzítve" : warehouseTransferToast.crossedThreshold ? "UIT szükséges" : `${money(Math.max(0, WAREHOUSE_UIT_WARNING_THRESHOLD_RON - warehouseTransferToast.totalValue))} RON`}
              </span>
            </div>

            {Number(warehouseTransferToast.documentCount || 1) === 1 ? <p className="mt-2 text-[9px] leading-relaxed text-slate-500">Az ellenkező irány külön PV-előkészítésbe kerül.</p> : null}
          </div>
        </div>,
        document.body,
      ) : null}

      {warehouseUitWarning && (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-slate-950/58 p-3 backdrop-blur-md" onMouseDown={(event) => { if (event.currentTarget === event.target) closeWarehouseUitWarning(); }}>
          <div className="w-full max-w-lg overflow-hidden rounded-[26px] border border-red-300 bg-[#f8fafc] text-slate-900 shadow-[0_32px_90px_rgba(2,6,23,0.52)]">
            <div className="flex items-start gap-3 border-b border-red-300 bg-gradient-to-r from-[#8f1f32] via-[#b4233d] to-[#d31126] px-4 py-4 text-white">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/15 text-white shadow-lg"><AlertTriangle size={23} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/78">UIT figyelmeztetés</p>
                <h2 className="mt-1 text-[22px] leading-tight text-white">Az előkészítés elérte a 10.000 RON-t</h2>
                <p className="mt-1 truncate text-xs text-white/82" title={warehouseUitWarning.documentNumber}>{warehouseUitWarning.documentNumber}</p>
                {warehouseUitWarning.routeLabel ? <p className="mt-0.5 truncate text-[10px] text-white/72" title={warehouseUitWarning.routeLabel}>{warehouseUitWarning.routeLabel}</p> : null}
              </div>
              <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-black/10 text-white hover:bg-black/20" onClick={closeWarehouseUitWarning} aria-label="Bezárás"><X size={15} /></button>
            </div>

            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">Most hozzáadva</p>
                  <p className="mt-1 text-[18px] text-slate-900">+{money(warehouseUitWarning.addedValue)} RON</p>
                </div>
                <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 shadow-sm">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-red-700">Ez a PV összesen</p>
                  <p className="mt-1 text-[18px] text-red-900">{money(warehouseUitWarning.totalValue)} RON</p>
                </div>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs leading-relaxed text-red-900">
                A szállításhoz UIT kód szükséges. Ez kizárólag ennek az útvonalnak az értéke. Az ellenkező irány külön PV-előkészítésben fut, ezért nem növeli ezt az összeget.
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs leading-relaxed text-slate-700 shadow-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#2a8d8b]"
                  checked={warehouseUitSuppressChecked}
                  onChange={(event) => setWarehouseUitSuppressChecked(event.target.checked)}
                />
                <span><span className="block text-slate-900">Ennél az előkészítésnél ne mutassa újra</span><span className="mt-1 block text-[10px] text-slate-500">A piros UIT jelzés a Készletbizonylatok oldalon továbbra is megmarad.</span></span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-[10px] text-slate-500">ESC: bezárás és munka folytatása</span>
                <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b] bg-[#2a8d8b] px-4 text-xs text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] hover:bg-[#319c99]" onClick={closeWarehouseUitWarning}>
                  <CheckCircle2 size={15} /> Tudomásul vettem
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stockMoveConfirmOpen && selectedWorkPanel === "move" && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-md">
          <div className="w-full max-w-xl overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] shadow-[0_28px_80px_rgba(2,6,23,0.62)]">
            <div className="flex items-center gap-3 border-b border-white/12 bg-gradient-to-r from-[#263246] via-[#334154] to-[#2a8d8b]/55 px-4 py-3.5">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><PackageCheck size={21} /></span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">Végső ellenőrzés</p>
                <h2 className="mt-0.5 truncate text-xl text-white">Mozgatás a PV-előkészítésbe</h2>
                <p className="mt-1 text-xs text-white/55">A következő lépés már ténylegesen átírja a készletet.</p>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid gap-2 sm:grid-cols-[1fr,42px,1fr] sm:items-center">
                <div className="rounded-2xl border border-rose-400/28 bg-rose-950/20 px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-rose-300">Kimenő / forrás</p>
                  <p className="mt-1 truncate text-sm text-rose-50" title={moveRouteSummary.from}>{moveRouteSummary.from}</p>
                </div>
                <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-[#303a4c] text-[#7bd7d4]"><ArrowRight size={18} /></span>
                <div className="rounded-2xl border border-[#7bd7d4]/28 bg-[#174c55]/30 px-3 py-2.5">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[#7bd7d4]">Bejövő / cél</p>
                  <p className="mt-1 truncate text-sm text-[#d7fffd]" title={moveRouteSummary.to}>{moveRouteSummary.to}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/12 bg-[#354153] px-3 py-2 text-center"><span className="block text-[9px] uppercase tracking-[0.1em] text-white/42">Sor</span><strong className="mt-1 block text-xl font-normal text-white">{moveValidRows.length}</strong></div>
                <div className="rounded-xl border border-white/12 bg-[#354153] px-3 py-2 text-center"><span className="block text-[9px] uppercase tracking-[0.1em] text-white/42">Darab</span><strong className="mt-1 block text-xl font-normal text-white">{moveTotalQty}</strong></div>
                <div className="rounded-xl border border-white/12 bg-[#354153] px-3 py-2 text-center"><span className="block text-[9px] uppercase tracking-[0.1em] text-white/42">Érték</span><strong className="mt-1 block text-sm font-normal text-white">{money(moveTotalValue)} RON</strong></div>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-amber-200/24 bg-amber-300/[0.08] px-3 py-2.5 text-xs leading-relaxed text-amber-50">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>A készlet azonnal átkerül a forráshelyről a célhelyre. A művelet ennek a pontos iránynak a nyitott PV-előkészítésébe kerül. Az ellenkező irány külön PV-t kap.</span>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button className={btnSoft} onClick={() => setStockMoveConfirmOpen(false)} type="button" disabled={stockMoveSaving}>Mégsem</button>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/45 bg-[#2a8d8b] px-4 text-xs text-white shadow-[0_10px_24px_rgba(15,23,42,0.20)] transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-40" onClick={saveSelectedMoveTransfers} type="button" disabled={!moveCanSave}>
                  <PackageCheck size={15} /> Igen, mozgatás és hozzáadás
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
                Mozgatás módban a teljes készlet nem változik: ha az egyik célhelyre pluszolsz, automatikusan leveszi másik célhelyről. Minden Honnan → Hová irány külön PV-előkészítést kap. Új áru vagy leltárkorrekció esetén kapcsold be a készletkorrekció módot.
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
                    if (!nextMode) {
                      setStockEditorReasonCode("");
                      setStockEditorReasonText("");
                      setStockEditorNote("");
                    }
                    const delta = stockEditorTotalDelta();
                    setStockEditorWarning(nextMode
                      ? (delta !== 0 ? `Készletkorrekció mód: a teljes készlet ${delta > 0 ? "+" : ""}${delta} db-bal változik. Válaszd ki a korrekció okát is.` : "Készletkorrekció mód bekapcsolva. A készletváltozás okát mentés előtt kötelező megadni.")
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

              {stockEditorAllowTotalChange && (
                <div className="rounded-xl border border-amber-200/25 bg-amber-400/[0.08] p-3">
                  <div className="mb-3 flex items-start gap-2">
                    <ClipboardList size={16} className="mt-0.5 shrink-0 text-amber-100" />
                    <div>
                      <p className="text-xs text-white">Korrekció oka</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-white/52">Kötelező, ha a teljes darabszám változik. Az ok és a megjegyzés bekerül a Készletmozgások naplójába.</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={label}>
                      Ok
                      <select
                        className={select}
                        value={stockEditorReasonCode}
                        onChange={(event) => {
                          const next = event.target.value;
                          setStockEditorReasonCode(next);
                          if (next !== "other") setStockEditorReasonText("");
                          if (next) setStockEditorWarning(stockEditorTotalDelta() !== 0 ? `Készletkorrekció mód: a teljes készlet ${stockEditorTotalDelta() > 0 ? "+" : ""}${stockEditorTotalDelta()} db-bal változik.` : "");
                        }}
                      >
                        <option value="">Válassz okot</option>
                        <option value="inventory_difference">Leltáreltérés</option>
                        <option value="incorrect_reception">Téves bevételezés</option>
                        <option value="invoice_correction">Számlakorrekció</option>
                        <option value="damaged_or_lost">Sérült vagy elveszett termék</option>
                        <option value="admin_correction">Adminisztrációs javítás</option>
                        <option value="other">Egyéb</option>
                      </select>
                    </label>
                    {stockEditorReasonCode === "other" ? (
                      <label className={label}>
                        Egyéb ok
                        <input
                          className={input}
                          value={stockEditorReasonText}
                          onChange={(event) => setStockEditorReasonText(event.target.value)}
                          placeholder="Miért szükséges a korrekció?"
                        />
                      </label>
                    ) : (
                      <label className={label}>
                        Megjegyzés <span className="text-white/38">(opcionális)</span>
                        <input
                          className={input}
                          value={stockEditorNote}
                          onChange={(event) => setStockEditorNote(event.target.value)}
                          placeholder="Rövid belső megjegyzés"
                        />
                      </label>
                    )}
                  </div>
                  {stockEditorReasonCode === "other" && (
                    <label className={`${label} mt-3`}>
                      Megjegyzés <span className="text-white/38">(opcionális)</span>
                      <input
                        className={input}
                        value={stockEditorNote}
                        onChange={(event) => setStockEditorNote(event.target.value)}
                        placeholder="Rövid belső megjegyzés"
                      />
                    </label>
                  )}
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
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/45 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#249b99] disabled:cursor-not-allowed disabled:opacity-50 font-normal"
                    onClick={saveStockEditor}
                    disabled={stockEditorSaving || !stockLocationRows.length || !stockEditorCanSave()}
                    title={!stockEditorCanSave()
                      ? (stockEditorAllowTotalChange && stockEditorTotalDelta() !== 0 ? "A készletkorrekció okának megadása kötelező." : "Mozgatás módban a teljes készlet nem változhat.")
                      : "Készlet mentése"}
                    type="button"
                  >
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
              {newProductBarcodeConflict && newProductBarcodeMatches.length === 0 ? (
                <WarehouseBarcodeConflictNotice
                  info={newProductBarcodeConflict}
                  onOpen={newProductBarcodeConflict.conflictVariantId ? () => {
                    const conflictItem = items.find((item) => selectedVariantIdFromItem(item) === newProductBarcodeConflict.conflictVariantId);
                    setNewProductOpen(false);
                    setNewProduct(emptyNewProductForm());
                    setNewProductStockRows({});
                    setNewProductBarcodeConflict(null);
                    if (conflictItem) {
                      focusProductInList(conflictItem, newProductBarcodeConflict.barcode, `Ez az SKU már a(z) ${conflictItem.title_ro || "meglévő termék"} variánshoz tartozik.`);
                    } else {
                      void openDetail(newProductBarcodeConflict.conflictVariantId);
                    }
                  } : null}
                />
              ) : null}
              {newProductBarcodeMatches.length > 0 && (
                <section className="rounded-2xl border border-amber-200/30 bg-amber-400/10 p-3 shadow-[0_0_0_1px_rgba(251,191,36,0.08)]">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-amber-50">Ez az SKU már használatban van</p>
                      <p className="text-xs text-amber-100/70">A beírt Vonalkód / Shopify SKU már egy másik variánshoz tartozik. Ezt az SKU-t nem mentjük el új termékhez. Nyisd meg a meglévő terméket, vagy adj meg másik egyedi SKU-t.</p>
                    </div>
                    <span className="rounded-full border border-amber-200/30 bg-black/15 px-2.5 py-1 text-xs text-amber-50">{newProductBarcodeMatches.length} találat</span>
                  </div>
                  <div className="grid gap-2">
                    {newProductBarcodeMatches.map((it) => (
                      <div key={it.variant_id} className="grid gap-3 rounded-xl border border-white/14 bg-[#3f4959] p-3 md:grid-cols-[56px,1fr,auto] md:items-center">
                        <div>
                          <WarehouseProductImage src={it.image_url} alt={it.title_ro || ""} thumbClassName="h-14 w-14 rounded-lg" iconSize={18} />
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
                  {newProduct.imageUrl ? <img src={newProduct.imageUrl} alt="" className="aspect-square w-full rounded-xl bg-white object-contain p-2" /> : <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-white text-slate-400"><ImagePlus size={32} /></div>}
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
                      <label className={label}>Vonalkód / Shopify SKU alap<input className={input} value={newProduct.barcode} onChange={(e) => { setNewProductBarcodeConflict(null); setNewProduct((x) => ({ ...x, barcode: e.target.value })); }} /></label>
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
                  <button className={primaryBtn} type="button" onClick={saveNewProduct} disabled={newProductSaving || newProductTotalQty() <= 0 || Boolean(effectiveNewProductBarcodeConflict)} title={effectiveNewProductBarcodeConflict ? "Ez az SKU már egy másik termékhez tartozik. Adj meg másik egyedi SKU-t." : undefined}><Save size={15} /> Termék mentése</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {historyTarget && (
        <VariantHistoryPanel
          target={historyTarget}
          history={variantHistory}
          loading={variantHistoryBusy}
          error={variantHistoryError}
          pricesVisible={buyPricesVisible}
          onReload={reloadProductHistory}
          onClose={() => { setHistoryTarget(null); setVariantHistory(null); setVariantHistoryError(""); }}
        />
      )}

      {bulkProductDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border-2 border-red-300/75 bg-[#4b1f28] text-white shadow-2xl shadow-red-950/60">
            <div className="flex items-center justify-between gap-3 border-b border-red-200/25 bg-[#d31126] px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-red-50/78">{bulkProductDeleteTarget.context === "incoming" ? "Importból kijelölt termékek törlése" : "Kijelölt termékek törlése"}</p>
                <h2 className="mt-1 text-xl text-white">Biztosan törlöd a kijelölt termékeket?</h2>
              </div>
              <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/15 px-3 text-xs text-white hover:bg-white/20" onClick={() => setBulkProductDeleteTarget(null)} disabled={saving} type="button"><X size={14} /> Bezárás</button>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-2xl border border-red-200/45 bg-red-600/25 px-3 py-3">
                <div className="flex items-center gap-2 text-base text-white">
                  <AlertTriangle size={20} className="text-red-100" />
                  <span>{bulkProductDeleteTarget.ids.length} kijelölt termék törlésre kerül{bulkProductDeleteTarget.context === "incoming" ? " az utolsó bevételezés nézetből" : ""}.</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-red-50/85">{bulkProductDeleteTarget.context === "incoming" ? "Csak az utolsó bevételezés külön kijelöléséből törlünk. A normál raktári munkalistán kijelölt termékeket nem bántjuk." : "A normál raktári munkalistán kijelölt termékeket töröljük. Az utolsó bevételezés külön kijelölése ettől független."} Készletmozgáshoz kapcsolt terméknél a rendszer archiválja, hogy a korábbi előzmények ne sérüljenek.</p>
                {bulkProductDeleteTarget.context === "incoming" ? <p className="mt-2 rounded-xl border border-red-200/35 bg-red-950/22 px-3 py-2 text-sm text-red-50">Ez csak a Legutóbbi bevételezés kijelölését használja. A normál raktári kijelölési listádhoz, címkéidhez és egyéb teendőidhez nem nyúl.</p> : null}
              </div>

              <div className="max-h-56 overflow-auto rounded-2xl border border-red-200/25 bg-red-950/25 p-2">
                {bulkProductDeleteTarget.items.slice(0, 8).map((item) => (
                  <div key={selectedVariantIdFromItem(item)} className="mb-1 last:mb-0 rounded-xl border border-white/12 bg-white/10 px-3 py-2 text-sm">
                    <div className="text-white">{item.title_ro || item.shopify_title || itemProductCode(item) || selectedVariantIdFromItem(item)}</div>
                    <div className="mt-0.5 text-xs text-red-50/70">{item.brand_name || "Nincs márka"} • {itemMainCategoryLabel(item)} • {displayColorName(item.color_name, item.color_code)} • {item.size || "nincs méret"}</div>
                  </div>
                ))}
                {bulkProductDeleteTarget.ids.length > 8 ? <p className="px-2 py-1 text-xs text-red-50/70">+ {bulkProductDeleteTarget.ids.length - 8} további kijelölt termék</p> : null}
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/24 bg-white/10 px-4 text-sm text-white hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => setBulkProductDeleteTarget(null)} disabled={saving} type="button">Mégse</button>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-100 bg-[#d31126] px-4 text-sm text-white shadow-[0_12px_30px_rgba(211,17,38,0.32)] hover:bg-[#b90f21] disabled:cursor-not-allowed disabled:opacity-60" onClick={confirmDeleteSelectedProducts} disabled={saving} type="button">
                  <Trash2 size={16} /> {saving ? "Törlés folyamatban..." : "Igen, törlés"}
                </button>
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

      {detailCloseConfirmOpen && detail && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[#7bd7d4]/45 bg-[#f7fbfd] text-slate-900 shadow-2xl shadow-slate-950/35">
            <div className="border-b border-[#7bd7d4]/35 bg-[#e9faf8] px-5 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#208d8b]">Nem mentett módosítás</p>
              <h2 className="mt-1 text-2xl leading-tight text-slate-900">Elmented a Változtatást?</h2>
              <p className="mt-1 text-sm leading-snug text-slate-600">A termékadatlap módosult. Zárás előtt válaszd ki, hogy mentjük vagy eldobjuk a változást.</p>
            </div>
            <div className="flex flex-col gap-2 p-4 sm:flex-row sm:justify-end">
              <button
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={saving}
                onClick={discardDetailChangesAndClose}
              >
                Nem
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-4 text-sm text-white shadow-[0_10px_22px_rgba(42,141,139,0.22)] transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={saving || Boolean(effectiveEditBarcodeConflict)}
                title={effectiveEditBarcodeConflict ? "Ez az SKU már egy másik termékhez tartozik. Előbb adj meg másik egyedi SKU-t." : undefined}
                onClick={() => { void saveDetailAndClose(); }}
              >
                <Save size={15} /> {saving ? "Mentés..." : "Igen"}
              </button>
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
                  onClick={() => {
                    const variantId = String(detail.item?.id || "").trim();
                    goBarcodeManager(
                      variantId,
                      detail.item?.barcode || "",
                      edit.titleRo || detail.item?.title_ro,
                      barcodeReturnContextForVariant(variantId),
                    );
                  }}
                  disabled={!detail.item?.id}
                  type="button"
                  title="Külön vonalkód- és címkemodul megnyitása"
                >
                  <Barcode size={16} /> Vonalkód / címke
                </button>
                <button className={btnSoft} onClick={requestCloseDetail} type="button"><X size={16} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-4 p-4">
              {detailBusy && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-4 text-sm text-white/65">Betöltés...</div>}

              <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
                <div className="space-y-3 rounded-xl border border-white/12 bg-white/[0.05] p-3">
                  {edit.imageUrl ? <img src={edit.imageUrl} alt="" className="aspect-square w-full rounded-xl bg-white object-contain p-2" /> : <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-white text-slate-400"><ImagePlus size={32} /></div>}
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
                          <input className={`${input} w-full pr-12`} value={edit.barcode} onChange={(e) => { setEditBarcodeConflict(null); setEdit((x) => ({ ...x, barcode: e.target.value })); }} />
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
                      {effectiveEditBarcodeConflict ? (
                        <div className="md:col-span-3">
                          <WarehouseBarcodeConflictNotice info={effectiveEditBarcodeConflict} />
                        </div>
                      ) : null}
                      <label className={label}>S/N/COD<input className={input} value={edit.snCod} onChange={(e) => setEdit((x) => ({ ...x, snCod: e.target.value }))} placeholder="belső azonosító" /></label>
                      <label className={label}>Vámtarifa kód<input className={input} value={edit.customsTariffCode} onChange={(e) => setEdit((x) => ({ ...x, customsTariffCode: e.target.value }))} placeholder="pl. 61102091" /></label>
                      <label className={label}>Szín<input className={input} value={edit.colorName} onChange={(e) => setEdit((x) => ({ ...x, colorName: e.target.value }))} onBlur={() => setEdit((x) => ({ ...x, colorName: normalizeColor(x.colorName) }))} placeholder="pl. negru" /></label>
                      <label className={label}>Színkód<input className={input} value={edit.colorCode} onChange={(e) => setEdit((x) => ({ ...x, colorCode: e.target.value }))} /></label>
                      <label className={label}>Méret<input className={input} list="warehouse-standard-size-options" value={edit.size} onChange={(e) => setEdit((x) => ({ ...x, size: e.target.value }))} onBlur={() => setEdit((x) => ({ ...x, size: normalizeSize(x.size) }))} /></label>
                      <label className={label}>Vételár<input className={input} value={edit.buyPrice} onChange={(e) => setEdit((x) => ({ ...x, buyPrice: e.target.value }))} /></label>
                      <label className={label}>Eladási ár<input className={input} value={edit.sellPrice} onChange={(e) => setEdit((x) => ({ ...x, sellPrice: e.target.value }))} /></label>
                      <label className={label}>Variáns állapot (csak ez a méret/szín)<select className={select} value={edit.variantStatus} onChange={(e) => {
                        const value = e.target.value;
                        setEdit((x) => ({
                          ...x,
                          variantStatus: value,
                          modelStatus: value === "active" && ["draft", "inactive"].includes(String(x.modelStatus || "").toLowerCase()) ? "active" : x.modelStatus,
                        }));
                      }}><option value="inactive">Inaktív</option><option value="active">Aktív</option><option value="archived">Archivált</option></select></label>
                      <label className={label}>Modell állapot (közös minden variánsnál)<select className={select} value={edit.modelStatus} onChange={(e) => setEdit((x) => ({ ...x, modelStatus: e.target.value }))}><option value="draft">Előkészítés</option><option value="active">Aktív</option><option value="archived">Archivált</option></select></label>
                      <label className={label}>Shopify cím<input className={input} value={edit.shopifyTitle} onChange={(e) => setEdit((x) => ({ ...x, shopifyTitle: e.target.value }))} /></label>
                      <div className="md:col-span-3 rounded-xl border border-[#7bd7d4]/24 bg-[#203f49] px-3 py-2 text-[11px] leading-relaxed text-[#d7fffd]">
                        A Raktárba csak ez a konkrét méret/szín kerül át, amikor a Variáns állapotot Aktívra teszed. Első aktiváláskor a modell többi méretét és színét a rendszer Inaktívként hagyja. Aktiváláshoz valódi vonalkód és kép is kötelező; a termékkód nem számít vonalkódnak.
                      </div>
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

              <div className="sticky bottom-0 z-20 -mx-5 -mb-5 flex flex-wrap justify-end gap-2 border-t border-white/16 bg-[#404a5b] px-5 py-3 shadow-[0_-14px_28px_rgba(15,23,42,0.26)]">
                <button className={btnSoft} onClick={requestCloseDetail} type="button"><X size={16} /> Mégse</button>
                <button
                  className={detailHasChanges ? primaryBtn : btnSoft}
                  onClick={() => void saveDetailAndClose()}
                  disabled={saving || detailBusy || !detailHasChanges || Boolean(effectiveEditBarcodeConflict)}
                  title={effectiveEditBarcodeConflict
                    ? "Ez az SKU már egy másik termékhez tartozik. Adj meg másik egyedi SKU-t."
                    : !detailHasChanges
                      ? "Nincs módosítás, amit menteni kellene."
                      : "Módosítások mentése és adatlap bezárása"}
                  type="button"
                >
                  <Save size={16} /> {saving ? "Mentés..." : "Mentés"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <WarehouseInvoiceDetailModal
        option={invoiceDetailTarget}
        details={invoiceDetailRows}
        loading={invoiceDetailBusy}
        error={invoiceDetailError}
        buyPricesVisible={buyPricesVisible}
        onClose={closeInvoiceDetail}
        onReload={() => void reloadInvoiceDetail()}
      />

      {duplicateSkuOpen && (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setDuplicateSkuOpen(false);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[24px] border border-rose-200/30 bg-[#414b5b] shadow-[0_30px_90px_rgba(2,6,23,.58)]">
            <div className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#4c1d28] via-[#3d2b38] to-[#344154] px-4 py-3.5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200/35 bg-[#d31126] text-white">
                  <AlertTriangle size={20} />
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-rose-100/65">Adatellenőrzés</p>
                  <h3 className="mt-1 text-lg text-white">Dupla Vonalkód / Shopify SKU</h3>
                  <p className="mt-1 text-xs text-white/62">
                    {duplicateSkuGroups.length} ütköző kód • {duplicateSkuVariantCount} konkrét termék. Nem kell találgatni, itt vannak név szerint.
                  </p>
                </div>
              </div>
              <button className={iconBtn} type="button" onClick={() => setDuplicateSkuOpen(false)} aria-label="Bezárás"><X size={16} /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3.5">
              {duplicateSkuGroups.map((group) => (
                <section key={group.sku} className="overflow-hidden rounded-2xl border border-rose-200/22 bg-[#354052]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#3a3140] px-3 py-2.5">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.12em] text-rose-100/55">Ütköző SKU</p>
                      <p className="mt-0.5 font-mono text-sm text-white">{group.sku}</p>
                    </div>
                    <span className="rounded-full border border-rose-200/28 bg-[#d31126] px-2.5 py-1 text-[10px] text-white">{group.items.length} termék</span>
                  </div>
                  <div className="divide-y divide-white/[0.08]">
                    {group.items.map((item) => (
                      <div key={item.variant_id} className="grid gap-3 px-3 py-2.5 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:items-center">
                        <WarehouseProductImage src={item.image_url} alt={item.title_ro || ""} thumbClassName="h-14 w-14 rounded-xl" iconSize={18} />
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white" title={firstWarehouseText(item.title_ro, item.shopify_title, item.model_code)}>
                            {firstWarehouseText(item.title_ro, item.shopify_title, item.model_code, "Névtelen termék")}
                          </p>
                          <p className="mt-1 text-xs text-white/58">
                            {firstWarehouseText(item.brand_name, item.brand_code, "Márka nélkül")} • {displayColorName(item.color_name, item.color_code)} • {item.size || "-"}
                          </p>
                          <p className="mt-1 truncate font-mono text-[10px] text-[#cffffd]/70">
                            Termékkód: {itemProductCode(item) || "-"} • készlet: {formatQty(item.total_qty)} db • variáns: {statusHu(itemVariantStatus(item))}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={btnSoft}
                          onClick={() => {
                            setDuplicateSkuOpen(false);
                            void openDetail(item.variant_id);
                          }}
                        >
                          <Eye size={14} /> Termék megnyitása
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/12 bg-[#303a4c] px-4 py-3 text-[11px] text-white/48">
              <span>ESC vagy Bezárás • minden ütköző SKU külön csoportban</span>
              <button className={btnSoft} type="button" onClick={() => setDuplicateSkuOpen(false)}><X size={14} /> Bezárás</button>
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
      {(duplicateSkuGroups.length > 0 || activationTodoCount > 0) && (
        <div className="fixed bottom-4 left-4 z-[45] hidden max-w-[360px] flex-col gap-2 lg:flex">
          {duplicateSkuGroups.length > 0 ? (
            <button
              className="rounded-xl border border-rose-300/45 bg-[#d31126] px-4 py-3 text-left text-sm text-white shadow-[0_14px_32px_rgba(120,8,24,.34)] transition hover:bg-[#b90f21]"
              type="button"
              onClick={() => setDuplicateSkuOpen(true)}
              title="Dupla Vonalkód / Shopify SKU-k megnyitása"
            >
              <AlertTriangle className="mr-2 inline" size={15} />
              {duplicateSkuGroups.length} dupla SKU • {duplicateSkuVariantCount} érintett termék
            </button>
          ) : null}
          {activationTodoCount > 0 ? (
            <button
              className="rounded-xl border border-amber-200/28 bg-amber-500/14 px-4 py-3 text-left text-sm text-amber-50 shadow-xl transition hover:bg-amber-500/20"
              type="button"
              onClick={showActivationTodoList}
              title="Aktiválandó készletes variánsok megnyitása"
            >
              <AlertTriangle className="mr-2 inline" size={15} /> {activationTodoCount} aktiválandó készleten lévő variáns
            </button>
          ) : null}
        </div>
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
