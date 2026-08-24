import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Archive,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  Barcode,
  Boxes,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  Edit3,
  ChevronRight,
  FileText,
  Home,
  ImageIcon,
  MapPin,
  Minus,
  PackageCheck,
  PackagePlus,
  PackageX,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Save,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Truck,
  Undo2,
  X,
} from "lucide-react";

const page = "min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-4 sm:py-5";
const shell = "mx-auto max-w-[1540px] space-y-4";
const panel = "overflow-hidden rounded-2xl border border-white/14 bg-white/[0.07] shadow-lg";
const panelHead = "flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3";
const btn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-3 text-xs text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50";
const btnSoft = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/[0.07] px-3 text-xs text-white transition hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50";
const primaryBtn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/40 bg-[#2a8d8b] px-3 text-xs text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50";
const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/18 bg-[#354153] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50";
const dangerIconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/35 bg-rose-600 text-white shadow-[0_7px_18px_rgba(225,29,72,0.22)] transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-300/35 bg-rose-600 px-3 text-xs text-white shadow-[0_7px_18px_rgba(225,29,72,0.22)] transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50";
const rowBtnSoft = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.07] px-2.5 text-[11px] text-white transition hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50";
const rowPrimaryBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#7bd7d4]/40 bg-[#2a8d8b] px-2.5 text-[11px] text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50";
const rowIconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/18 bg-[#354153] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50";
const rowDangerIconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300/35 bg-rose-600 text-white shadow-[0_5px_14px_rgba(225,29,72,0.20)] transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50";
const input = "h-10 w-full rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/20";
const label = "grid min-w-0 gap-1.5 text-xs text-white/65";
const API_BASE = "/api/aif";
const stockMovesChangedStorageKey = "allinfashion:stockMoves:changed:v1";
const stockMovesChangedEventName = "aif:stock-moves-changed";
const UIT_WARNING_THRESHOLD_RON = 10000;

function notifyStockMovesChanged() {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(stockMovesChangedStorageKey, String(Date.now())); } catch {}
  try { window.dispatchEvent(new CustomEvent(stockMovesChangedEventName)); } catch {}
}

type DocumentType = "internal_transfer" | "supplier_return" | "damaged_writeoff" | "stock_correction";
type ArchiveFilter = "all" | "official" | "draft" | "preparation" | "legacy" | "cancelled" | DocumentType;
type CorrectionDirection = "increase" | "decrease";
type DeleteMode = "restore_stock" | "permanent";

type LocationItem = { id: string; code?: string | null; name: string; is_active?: boolean };
type SupplierItem = { id: string; code?: string | null; name: string; is_active?: boolean };
type ReceptionItem = {
  id: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  reception_date?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  location_name?: string | null;
  status?: string | null;
};

type InventoryItem = {
  variant_id: string;
  internal_sku?: string | null;
  barcode?: string | null;
  display_barcode?: string | null;
  sn_cod?: string | null;
  snCod?: string | null;
  model_code?: string | null;
  product_code?: string | null;
  productCode?: string | null;
  supplier_product_code?: string | null;
  supplierProductCode?: string | null;
  supplier_variant_code?: string | null;
  supplier_codes?: string | null;
  title_ro?: string | null;
  shopify_title?: string | null;
  brand_name?: string | null;
  category_name_ro?: string | null;
  subcategory_name_ro?: string | null;
  subcategory_name_hu?: string | null;
  subcategory_code?: string | null;
  product_type?: string | null;
  color_name?: string | null;
  color_code?: string | null;
  size?: string | null;
  image_url?: string | null;
  buy_price?: number | string | null;
  sell_price?: number | string | null;
  total_qty?: number | string | null;
  total_reserved_qty?: number | string | null;
  available_qty?: number | string | null;
  variant_status?: string | null;
  model_status?: string | null;
};

type StockItem = {
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  variant_id: string;
  qty?: number | string | null;
  reserved_qty?: number | string | null;
  available_qty?: number | string | null;
};

type StockDocumentSettings = {
  documentType: DocumentType;
  series: string;
  nextNumber: number;
  digits: number;
  includeYear: boolean;
  yearlyReset: boolean;
  sequenceYear: number;
  documentTitle: string;
  documentSubtitle: string;
  previewNumber: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type DocumentListItem = {
  id: string;
  transfer_id: string;
  document_number: string;
  document_type?: DocumentType | string | null;
  series?: string | null;
  sequence_number?: number | string | null;
  sequence_year?: number | string | null;
  title?: string | null;
  subtitle?: string | null;
  note?: string | null;
  status?: "draft" | "preparation" | "issued" | "cancelled" | "legacy" | string;
  actor?: string | null;
  owner_key?: string | null;
  line_count?: number | string | null;
  total_qty?: number | string | null;
  total_value?: number | string | null;
  currency_code?: string | null;
  from_location_summary?: string | null;
  to_location_summary?: string | null;
  source_location_id?: string | null;
  target_location_id?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  reception_id?: string | null;
  external_reference?: string | null;
  uit_code?: string | null;
  reason_code?: string | null;
  reason_text?: string | null;
  operation_direction?: string | null;
  price_basis?: string | null;
  raw?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
  isLegacy?: boolean;
  source?: "official" | "legacy" | string;
};

type DocumentLine = {
  id?: string;
  line_no: number | string;
  variant_id?: string | null;
  product_title?: string | null;
  brand_name?: string | null;
  category_name?: string | null;
  subcategory_name?: string | null;
  subcategory_name_ro?: string | null;
  product_type?: string | null;
  product_code?: string | null;
  barcode?: string | null;
  color_name?: string | null;
  size?: string | null;
  image_url?: string | null;
  from_location_id?: string | null;
  from_location_name?: string | null;
  to_location_id?: string | null;
  to_location_name?: string | null;
  qty: number | string;
  qty_delta?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  currency_code?: string | null;
  price_basis?: string | null;
  source_before?: number | string | null;
  source_after?: number | string | null;
  target_before?: number | string | null;
  target_after?: number | string | null;
  raw?: Record<string, unknown> | null;
};

type DocumentDetail = { document: DocumentListItem; lines: DocumentLine[] };

type ListTotals = {
  total: number;
  all?: number;
  official: number;
  legacy: number;
  cancelled: number;
  draft?: number;
  preparation?: number;
  totalQty: number;
  totalValue?: number;
  internalTransfer?: number;
  supplierReturn?: number;
  damagedWriteoff?: number;
  stockCorrection?: number;
};

type ListResponse = {
  items: DocumentListItem[];
  totals: ListTotals;
  page: number;
  pages: number;
  limit: number;
  total: number;
  locations: LocationItem[];
};

type DraftLine = { key: string; item: InventoryItem; qty: number; originalQty: number; fromLocationId?: string; toLocationId?: string; lineId?: string | null };

type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
    ZXingBrowser?: {
      BrowserMultiFormatReader?: new () => {
        decodeFromConstraints?: (
          constraints: MediaStreamConstraints,
          video: HTMLVideoElement,
          callback: (result?: { getText?: () => string; text?: string } | null) => void,
        ) => Promise<{ stop?: () => void }> | { stop?: () => void };
      };
    };
  }
}

const DOCUMENT_TYPES: Array<{
  type: DocumentType;
  label: string;
  shortLabel: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: string;
}> = [
  {
    type: "internal_transfer",
    label: "Belső átadás / Aviz",
    shortLabel: "Belső átadás",
    subtitle: "Üzletek közötti hivatalos készletátadás",
    icon: ArrowRightLeft,
    tone: "border-[#7bd7d4]/35 bg-[#2a8d8b]/16 text-[#d7fffd]",
  },
  {
    type: "supplier_return",
    label: "Retur către furnizor",
    shortLabel: "Beszállítói retur",
    subtitle: "Visszaküldés a beszállítónak, készletkivezetéssel",
    icon: Undo2,
    tone: "border-sky-200/28 bg-sky-500/12 text-sky-50",
  },
  {
    type: "damaged_writeoff",
    label: "Produse deteriorate",
    shortLabel: "Sérült / kivezetés",
    subtitle: "Sérült vagy nem értékesíthető termék hivatalos kivezetése",
    icon: PackageX,
    tone: "border-rose-200/28 bg-rose-500/12 text-rose-50",
  },
  {
    type: "stock_correction",
    label: "Készletkorrekció",
    shortLabel: "Készletkorrekció",
    subtitle: "Indokolt plusz vagy mínusz készletmódosítás",
    icon: SlidersHorizontal,
    tone: "border-amber-200/28 bg-amber-500/12 text-amber-50",
  },
];

const REASON_OPTIONS: Record<DocumentType, Array<{ value: string; label: string; ro: string }>> = {
  internal_transfer: [],
  supplier_return: [
    { value: "invoice_error", label: "Hibás számla", ro: "Eroare de facturare" },
    { value: "wrong_product", label: "Hibás terméket küldtek", ro: "Produs livrat greșit" },
    { value: "damaged_on_delivery", label: "Sérülten érkezett", ro: "Produs deteriorat la livrare" },
    { value: "quality_issue", label: "Minőségi probléma", ro: "Neconformitate calitativă" },
    { value: "other", label: "Egyéb", ro: "Alt motiv" },
  ],
  damaged_writeoff: [
    { value: "damaged", label: "Sérült termék", ro: "Produs deteriorat" },
    { value: "unusable", label: "Nem értékesíthető", ro: "Produs impropriu vânzării" },
    { value: "other", label: "Egyéb", ro: "Alt motiv" },
  ],
  stock_correction: [
    { value: "inventory_difference", label: "Leltáreltérés", ro: "Diferență de inventar" },
    { value: "incorrect_reception", label: "Téves bevételezés", ro: "Recepție înregistrată eronat" },
    { value: "invoice_correction", label: "Számlakorrekció", ro: "Corecție de factură" },
    { value: "admin_correction", label: "Adminisztrációs javítás", ro: "Corecție administrativă" },
    { value: "other", label: "Egyéb", ro: "Alt motiv" },
  ],
};

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function decimalValue(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function quantity(value: unknown) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(n(value));
}

function moneyRon(value: unknown, includeCurrency = true) {
  const parsed = decimalValue(value);
  if (parsed === null) return "-";
  const formatted = new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed);
  return includeCurrency ? `${formatted} RON` : formatted;
}

function displayDocumentNumber(item?: Partial<DocumentListItem> | null) {
  const value = String(item?.document_number || "").trim();
  if (!value) return "-";
  if (item?.status !== "draft") return value;

  const suffix = value
    .replace(/^PISZKOZAT\//i, "")
    .replace(/^ELŐKÉSZÍTÉS\//i, "")
    .trim();
  const prefixByType: Record<DocumentType, string> = {
    internal_transfer: "PV",
    supplier_return: "RET",
    damaged_writeoff: "DET",
    stock_correction: "COR",
  };
  return `${prefixByType[documentTypeOf(item)]}/${suffix || "NYITOTT"}`;
}

function dateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function roDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function lineLocationName(
  line: DocumentLine,
  side: "from" | "to",
  locations: LocationItem[] = [],
) {
  const raw = line.raw && typeof line.raw === "object" ? line.raw as Record<string, unknown> : {};
  const directName = side === "from"
    ? firstText(
        line.from_location_name,
        raw.fromLocationName,
        raw.from_location_name,
        raw.sourceLocationName,
        raw.source_location_name,
      )
    : firstText(
        line.to_location_name,
        raw.toLocationName,
        raw.to_location_name,
        raw.targetLocationName,
        raw.target_location_name,
      );
  if (directName) return directName;

  const locationId = side === "from"
    ? firstText(line.from_location_id, raw.fromLocationId, raw.from_location_id, raw.sourceLocationId, raw.source_location_id)
    : firstText(line.to_location_id, raw.toLocationId, raw.to_location_id, raw.targetLocationId, raw.target_location_id);
  if (!locationId) return "-";
  const found = locations.find((location) => String(location.id) === locationId || String(location.code || "") === locationId);
  return found?.name || locationId;
}

function documentTypeOf(item?: Partial<DocumentListItem> | null): DocumentType {
  const raw = String(item?.document_type || item?.raw?.documentType || item?.raw?.document_type || "").trim();
  return DOCUMENT_TYPES.some((row) => row.type === raw) ? raw as DocumentType : "internal_transfer";
}

function documentMeta(type: DocumentType) {
  return DOCUMENT_TYPES.find((row) => row.type === type) || DOCUMENT_TYPES[0];
}

function reasonLabel(type: DocumentType, code?: string | null, explicit?: string | null, romanian = false) {
  const normalizedCode = String(code || "").trim().toLowerCase();
  const normalizedExplicit = normalize(explicit);
  if (["lost", "theft"].includes(normalizedCode) || ["elveszett", "lopas", "furt", "produs lipsa pierdut"].includes(normalizedExplicit)) {
    return romanian ? "Alt motiv" : "Egyéb";
  }
  if (explicit) return explicit;
  const row = (REASON_OPTIONS[type] || []).find((option) => option.value === normalizedCode);
  return row ? (romanian ? row.ro : row.label) : String(code || "-");
}

function lineUnitPrice(line: DocumentLine) {
  const raw = line.raw && typeof line.raw === "object" ? line.raw : {};
  const candidates = [
    line.unit_price,
    line.raw?.unitPrice,
    line.raw?.unit_price,
    raw.sellPrice,
    raw.sell_price,
    raw.buyPrice,
    raw.buy_price,
  ];
  for (const candidate of candidates) {
    const parsed = decimalValue(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function lineTotalValue(line: DocumentLine) {
  const saved = decimalValue(line.line_total ?? line.raw?.lineTotal ?? line.raw?.line_total);
  if (saved !== null) return saved;
  const price = lineUnitPrice(line);
  return price === null ? null : Math.max(0, n(line.qty)) * price;
}

function detailTotalValue(lines: DocumentLine[]) {
  return lines.reduce((sum, line) => sum + (lineTotalValue(line) ?? 0), 0);
}

function visibleBarcode(item: InventoryItem) {
  return firstText(item.display_barcode, item.barcode);
}

function productCode(item: InventoryItem) {
  return firstText(item.supplier_product_code, item.internal_sku);
}

function productTitle(item: InventoryItem) {
  return firstText(item.title_ro, item.shopify_title, "Névtelen termék");
}

function cleanScanCode(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, "")
    .replace(/[\s\u00a0]+/g, "")
    .trim();
}

function scanExactKey(value: unknown) {
  return normalize(cleanScanCode(value));
}

function scanLooseKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function productIdentifierValues(item: InventoryItem) {
  return [
    item.variant_id,
    item.internal_sku,
    item.barcode,
    item.display_barcode,
    item.sn_cod,
    item.snCod,
    item.model_code,
    item.product_code,
    item.productCode,
    item.supplier_product_code,
    item.supplierProductCode,
    item.supplier_variant_code,
    ...(String(item.supplier_codes || "").split(/[;,|]+/)),
  ].filter((value) => String(value ?? "").trim());
}

function productSearchValues(item: InventoryItem) {
  return [
    ...productIdentifierValues(item),
    item.supplier_codes,
    item.title_ro,
    item.shopify_title,
    item.brand_name,
    item.color_name,
    item.color_code,
    item.size,
  ].map((value) => normalize(value)).filter(Boolean);
}

function exactProductMatch(item: InventoryItem, query: string) {
  const exact = scanExactKey(query);
  const loose = scanLooseKey(query);
  if (!exact && !loose) return false;
  const values = productIdentifierValues(item);
  if (exact && values.some((value) => scanExactKey(value) === exact)) return true;
  return Boolean(loose && values.some((value) => scanLooseKey(value) === loose));
}

function uniqueInventoryItems(items: InventoryItem[]) {
  const map = new Map<string, InventoryItem>();
  for (const item of items || []) {
    const id = String(item.variant_id || "").trim();
    if (!id || map.has(id)) continue;
    map.set(id, item);
  }
  return Array.from(map.values());
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(String(body?.error || body?.message || `${response.status} ${response.statusText}`));
  return body as T;
}

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `stock-doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function goHome() {
  window.location.hash = "#allin";
}

type CompactSelectOption = {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
};

type CompactSelectProps = {
  value: string;
  options: CompactSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

function CompactSelect({
  value,
  options,
  onChange,
  placeholder = "Válassz",
  className = "",
  disabled = false,
  ariaLabel,
}: CompactSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((option) => option.value === value) || null;
  const groupedOptions = useMemo(() => {
    const groups: Array<{ label: string; items: CompactSelectOption[] }> = [];
    for (const option of options) {
      const groupLabel = option.group || "";
      const current = groups[groups.length - 1];
      if (!current || current.label !== groupLabel) groups.push({ label: groupLabel, items: [option] });
      else current.items.push(option);
    }
    return groups;
  }, [options]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - viewportPadding * 2);
    const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding);
    const roomBelow = window.innerHeight - rect.bottom;
    const openUp = roomBelow < 250 && rect.top > roomBelow;
    setMenuPosition(openUp
      ? { left, width, bottom: Math.max(viewportPadding, window.innerHeight - rect.top + 6) }
      : { left, width, top: Math.min(window.innerHeight - viewportPadding, rect.bottom + 6) });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reposition = () => updatePosition();

    document.addEventListener("mousedown", closeOnOutside, true);
    window.addEventListener("keydown", closeOnEscape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside, true);
      window.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  return (
    <div className={`min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-white/22 bg-[#3f4959] px-3 text-left text-xs text-white outline-none transition hover:bg-[#465264] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18 disabled:cursor-not-allowed disabled:opacity-45"
        onClick={() => {
          if (disabled) return;
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
      >
        <span className={`truncate ${selected ? "text-white" : "text-white/48"}`}>{selected?.label || placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 text-white/55 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && menuPosition && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="overflow-hidden rounded-xl border shadow-2xl"
          style={{
            position: "fixed",
            zIndex: 500,
            left: menuPosition.left,
            width: menuPosition.width,
            top: menuPosition.top,
            bottom: menuPosition.bottom,
            color: "#ffffff",
            backgroundColor: "#26364c",
            borderColor: "rgba(142, 230, 226, 0.48)",
            boxShadow: "0 18px 46px rgba(2, 6, 23, 0.58)",
          }}
        >
          <div className="max-h-64 overflow-y-auto p-1">
            {groupedOptions.map((group, groupIndex) => (
              <div key={`${group.label}:${groupIndex}`} className={groupIndex ? "mt-1 border-t border-white/10 pt-1" : ""}>
                {group.label ? <div className="px-2 py-1.5 text-[9px] uppercase tracking-[0.12em]" style={{ color: "#b8c7d9" }}>{group.label}</div> : null}
                {group.items.map((option) => {
                  const active = option.value === value;
                  return (
                    <button
                      key={`${group.label}:${option.value}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={option.disabled}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        color: "#ffffff",
                        backgroundColor: active ? "#2a8d8b" : "#354153",
                      }}
                      onMouseEnter={(event) => {
                        if (!option.disabled) event.currentTarget.style.backgroundColor = active ? "#319c99" : "#415064";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.backgroundColor = active ? "#2a8d8b" : "#354153";
                      }}
                      onClick={() => {
                        if (option.disabled) return;
                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <span className="truncate" style={{ color: "#ffffff" }}>{option.label}</span>
                      <CheckCircle2 size={13} color="#ffffff" className={active ? "shrink-0 opacity-100" : "shrink-0 opacity-0"} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function documentBadge(item: DocumentListItem) {
  if (item.status === "preparation") {
    return { label: "Előkészítés", cls: "border-red-300/75 bg-red-600 text-white shadow-[0_0_18px_rgba(220,38,38,.34)]", icon: Edit3 };
  }
  if (item.status === "draft") {
    return { label: "Előkészítés", cls: "border-red-300/75 bg-red-600 text-white shadow-[0_0_18px_rgba(220,38,38,.34)]", icon: Edit3 };
  }
  if (item.isLegacy || item.status === "legacy") {
    return { label: "Régi átadás", cls: "border-amber-200/28 bg-amber-500/12 text-amber-50", icon: Archive };
  }
  if (item.status === "cancelled") {
    return { label: "Sztornózott", cls: "border-rose-200/30 bg-rose-500/12 text-rose-50", icon: X };
  }
  return { label: "Hivatalos", cls: "border-[#7bd7d4]/38 bg-[#2a8d8b]/18 text-[#d7fffd]", icon: ShieldCheck };
}

type SummaryCardProps = {
  labelText: string;
  value: React.ReactNode;
  hint: string;
  tone?: "neutral" | "green" | "amber" | "blue" | "red";
  active?: boolean;
  onClick?: () => void;
};

function SummaryCard({ labelText, value, hint, tone = "neutral", active = false, onClick }: SummaryCardProps) {
  const toneClass = tone === "green"
    ? "border-[#7bd7d4]/28 bg-[#2a8d8b]/13"
    : tone === "amber"
      ? "border-amber-200/22 bg-amber-500/10"
      : tone === "blue"
        ? "border-sky-200/22 bg-sky-500/10"
        : tone === "red"
          ? "border-rose-200/30 bg-rose-500/14"
          : "border-white/12 bg-white/[0.06]";
  const className = `w-full rounded-2xl border p-3 text-left transition ${toneClass} ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:bg-white/[0.10]" : ""} ${active ? "ring-2 ring-[#7bd7d4]/70 shadow-[0_0_0_1px_rgba(123,215,212,.25)]" : ""}`;
  const content = <><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">{labelText}</p><p className="mt-1 text-[24px] leading-none text-white">{value}</p><p className="mt-1.5 text-[11px] text-white/45">{hint}</p></>;
  return onClick ? <button type="button" onClick={onClick} className={className}>{content}</button> : <div className={className}>{content}</div>;
}

function ProductThumb({ item, className = "h-12 w-12" }: { item: InventoryItem | DocumentLine; className?: string }) {
  const src = firstText((item as InventoryItem).image_url, (item as DocumentLine).image_url);
  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/14 bg-white text-slate-400`}>
      {src ? <img src={src} alt="" className="h-full w-full object-contain p-0.5" loading="lazy" /> : <ImageIcon size={17} />}
    </span>
  );
}


type IndexedDocumentLine = {
  line: DocumentLine;
  index: number;
};

type DocumentFlowGroups = {
  focusLocationName: string;
  incoming: IndexedDocumentLine[];
  outgoing: IndexedDocumentLine[];
  other: IndexedDocumentLine[];
};

function rawLocationValue(line: DocumentLine, side: "from" | "to", keyType: "id" | "name") {
  const raw = line.raw && typeof line.raw === "object" ? line.raw as Record<string, unknown> : {};
  if (side === "from" && keyType === "id") {
    return firstText(line.from_location_id, raw.fromLocationId, raw.from_location_id, raw.sourceLocationId, raw.source_location_id);
  }
  if (side === "to" && keyType === "id") {
    return firstText(line.to_location_id, raw.toLocationId, raw.to_location_id, raw.targetLocationId, raw.target_location_id);
  }
  if (side === "from") {
    return firstText(line.from_location_name, raw.fromLocationName, raw.from_location_name, raw.sourceLocationName, raw.source_location_name);
  }
  return firstText(line.to_location_name, raw.toLocationName, raw.to_location_name, raw.targetLocationName, raw.target_location_name);
}

function documentFlowGroups(detail: DocumentDetail, locations: LocationItem[] = []): DocumentFlowGroups {
  const lines = detail.lines || [];
  const firstLine = lines[0] || null;
  const focusLocationId = firstText(
    detail.document.target_location_id,
    firstLine ? rawLocationValue(firstLine, "to", "id") : "",
  );
  const focusLocationName = firstText(
    locations.find((location) => String(location.id) === focusLocationId || String(location.code || "") === focusLocationId)?.name,
    firstLine ? lineLocationName(firstLine, "to", locations) : "",
    detail.document.to_location_summary,
    "Kijelölt célhely",
  );

  const sameLocation = (line: DocumentLine, side: "from" | "to") => {
    const lineId = rawLocationValue(line, side, "id");
    if (focusLocationId && lineId) return lineId === focusLocationId;
    const lineName = lineLocationName(line, side, locations);
    return normalize(lineName) === normalize(focusLocationName);
  };

  const incoming: IndexedDocumentLine[] = [];
  const outgoing: IndexedDocumentLine[] = [];
  const other: IndexedDocumentLine[] = [];

  lines.forEach((line, index) => {
    if (sameLocation(line, "to")) incoming.push({ line, index });
    else if (sameLocation(line, "from")) outgoing.push({ line, index });
    else other.push({ line, index });
  });

  return { focusLocationName, incoming, outgoing, other };
}

function flowSectionTotals(rows: IndexedDocumentLine[]) {
  return rows.reduce(
    (totals, row) => {
      totals.qty += n(row.line.qty);
      totals.value += lineTotalValue(row.line) || 0;
      return totals;
    },
    { qty: 0, value: 0 },
  );
}

function DocumentFlowOverview({
  flow,
  totalQty,
  totalValue,
}: {
  flow: DocumentFlowGroups;
  totalQty: number;
  totalValue: number;
}) {
  const incoming = flowSectionTotals(flow.incoming);
  const outgoing = flowSectionTotals(flow.outgoing);

  return (
    <div className="overflow-hidden rounded-[22px] border border-white/12 bg-[#313c4e] shadow-[0_18px_44px_rgba(15,23,42,.18)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-white/38">Mozgási áttekintés</p>
          <p className="mt-1 text-sm text-white/82">Egyetlen pillantással látszik, mi érkezik és mi indul tovább.</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/55">
          <span className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1">{quantity(totalQty)} db</span>
          <span className="rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 px-2.5 py-1 text-[#d7fffd]">{moneyRon(totalValue)}</span>
        </div>
      </div>

      <div className="grid gap-2 p-3 lg:grid-cols-[minmax(0,1fr)_42px_minmax(220px,.72fr)_42px_minmax(0,1fr)] lg:items-stretch">
        <div className="relative overflow-hidden rounded-2xl border border-[#2dd4bf]/22 bg-gradient-to-br from-[#29434a] to-[#2d394a] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
          <div className="absolute inset-y-0 left-0 w-1 bg-[#2dd4bf]" />
          <div className="flex items-start justify-between gap-3 pl-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#5eead4]/25 bg-[#2dd4bf]/14 text-[#99f6e4]"><ArrowDownLeft size={17} /></span>
              <div><p className="text-[9px] uppercase tracking-[0.16em] text-[#99f6e4]/70">Bejövő</p><p className="mt-0.5 text-sm text-white">Az aktív üzletbe érkezik</p></div>
            </div>
            <span className="rounded-full border border-[#5eead4]/20 bg-[#2dd4bf]/10 px-2 py-1 text-[10px] text-[#ccfbf1]">{flow.incoming.length} sor</span>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3 pl-1">
            <div><p className="text-[26px] leading-none text-white">{quantity(incoming.qty)} <span className="text-xs text-white/45">db</span></p><p className="mt-1 text-[10px] text-white/42">fogadott mennyiség</p></div>
            <p className="text-sm text-[#ccfbf1]">{moneyRon(incoming.value)}</p>
          </div>
        </div>

        <div className="hidden items-center justify-center lg:flex"><span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#2dd4bf]/24 bg-[#2dd4bf]/10 text-[#5eead4]"><ArrowRight size={15} /></span></div>

        <div className="flex min-h-[112px] flex-col items-center justify-center rounded-2xl border border-white/14 bg-[#263246] px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/14 bg-white/[0.06] text-[#d7fffd]"><MapPin size={19} /></span>
          <p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-white/38">Aktív üzlet</p>
          <p className="mt-1 max-w-[240px] text-sm leading-snug text-white">{flow.focusLocationName}</p>
        </div>

        <div className="hidden items-center justify-center lg:flex"><span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/24 bg-red-500/10 text-red-400"><ArrowRight size={15} /></span></div>

        <div className="relative overflow-hidden rounded-2xl border border-red-400/22 bg-gradient-to-br from-[#433039] to-[#303949] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
          <div className="absolute inset-y-0 left-0 w-1 bg-red-500" />
          <div className="flex items-start justify-between gap-3 pl-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/14 text-red-200"><ArrowUpRight size={17} /></span>
              <div><p className="text-[9px] uppercase tracking-[0.16em] text-red-300/75">Kimenő</p><p className="mt-0.5 text-sm text-white">Az aktív üzletből indul</p></div>
            </div>
            <span className="rounded-full border border-red-300/20 bg-red-500/10 px-2 py-1 text-[10px] text-red-100">{flow.outgoing.length} sor</span>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3 pl-1">
            <div><p className="text-[26px] leading-none text-white">{quantity(outgoing.qty)} <span className="text-xs text-white/45">db</span></p><p className="mt-1 text-[10px] text-white/42">kiadott mennyiség</p></div>
            <p className="text-sm text-red-100">{moneyRon(outgoing.value)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentFlowSection({
  title,
  subtitle,
  tone,
  rows,
  locations,
}: {
  title: string;
  subtitle: string;
  tone: "incoming" | "outgoing" | "neutral";
  rows: IndexedDocumentLine[];
  locations: LocationItem[];
}) {
  if (!rows.length) return null;
  const incomingTone = tone === "incoming";
  const outgoingTone = tone === "outgoing";
  const section = flowSectionTotals(rows);
  const accentClass = incomingTone ? "bg-[#2dd4bf]" : outgoingTone ? "bg-red-500" : "bg-slate-400";
  const iconClass = incomingTone
    ? "border-[#5eead4]/28 bg-[#2dd4bf]/12 text-[#99f6e4]"
    : outgoingTone
      ? "border-red-300/28 bg-red-500/12 text-red-200"
      : "border-white/14 bg-white/[0.06] text-white/70";
  const quantityClass = incomingTone
    ? "border-[#5eead4]/22 bg-[#2dd4bf]/10 text-[#ccfbf1]"
    : outgoingTone
      ? "border-red-300/22 bg-red-500/10 text-red-100"
      : "border-white/12 bg-white/[0.05] text-white/72";
  const Icon = incomingTone ? ArrowDownLeft : outgoingTone ? ArrowUpRight : ArrowRightLeft;

  return (
    <div className="overflow-hidden rounded-[20px] border border-white/12 bg-[#3b4657] shadow-[0_14px_34px_rgba(15,23,42,.14)]">
      <div className={`h-1 ${accentClass}`} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#354052] px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${iconClass}`}><Icon size={17} /></span>
          <div><p className="text-sm text-white">{title}</p><p className="mt-0.5 text-[10px] text-white/42">{subtitle}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-lg border px-2.5 py-1.5 text-[10px] ${quantityClass}`}>{rows.length} sor · {quantity(section.qty)} db</span>
          <span className="rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[10px] text-white/78">{moneyRon(section.value)}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1220px] w-full text-left text-xs">
          <thead className="bg-[#2d3748] text-[9px] font-normal uppercase tracking-[0.08em] text-white/44">
            <tr>
              <th className="px-2.5 py-2 font-normal">#</th>
              <th className="px-2.5 py-2 font-normal">Kép</th>
              <th className="px-2.5 py-2 font-normal">Termék</th>
              <th className="px-2.5 py-2 font-normal">Márka / kategória</th>
              <th className="px-2.5 py-2 font-normal">Azonosító</th>
              <th className="px-2.5 py-2 font-normal">Variáns</th>
              <th className="px-2.5 py-2 font-normal">Útvonal</th>
              <th className="px-2.5 py-2 text-right font-normal">Db</th>
              <th className="px-2.5 py-2 text-right font-normal">P.U. RON</th>
              <th className="px-2.5 py-2 text-right font-normal">Érték RON</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, index }) => {
              const routeFrom = lineLocationName(line, "from", locations);
              const routeTo = lineLocationName(line, "to", locations);
              return (
                <tr key={line.id || `${line.line_no}-${index}`} className="border-t border-white/[0.07] align-middle odd:bg-black/[0.025] hover:bg-white/[0.035]">
                  <td className="px-2.5 py-2 text-white/35">{index + 1}</td>
                  <td className="px-2.5 py-2"><ProductThumb item={line} className="h-11 w-11" /></td>
                  <td className="px-2.5 py-2"><p className="max-w-[245px] truncate text-white">{line.product_title || "Produs"}</p><p className="mt-0.5 max-w-[245px] truncate text-[10px] text-white/38">{line.product_code || "-"}</p></td>
                  <td className="px-2.5 py-2"><p className="text-white/82">{line.brand_name || "-"}</p><p className="mt-0.5 text-[10px] text-white/38">{line.category_name || "-"}</p></td>
                  <td className="px-2.5 py-2 font-mono text-[10px] text-white/68">{line.barcode || "-"}</td>
                  <td className="px-2.5 py-2 text-white/76">{[line.color_name, line.size].filter(Boolean).join(" • ") || "-"}</td>
                  <td className="px-2.5 py-2">
                    <div className="flex min-w-[300px] items-center gap-1.5 text-[10px]">
                      <span className="max-w-[140px] truncate rounded-lg border border-red-400/18 bg-red-500/[0.07] px-2 py-1 text-red-100" title={routeFrom}>{routeFrom}</span>
                      <ArrowRight size={12} className="shrink-0 text-white/30" />
                      <span className="max-w-[140px] truncate rounded-lg border border-[#5eead4]/18 bg-[#2dd4bf]/[0.07] px-2 py-1 text-[#ccfbf1]" title={routeTo}>{routeTo}</span>
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-right"><span className={`inline-flex min-w-9 justify-center rounded-lg border px-2 py-1 text-[11px] ${quantityClass}`}>{quantity(line.qty)}</span></td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-white/74">{moneyRon(lineUnitPrice(line), false)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-white">{moneyRon(lineTotalValue(line), false)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 bg-[#313c4d]">
              <td colSpan={7} className="px-3 py-2.5 text-right text-[9px] uppercase tracking-[0.1em] text-white/38">Részösszeg</td>
              <td className={`px-2.5 py-2.5 text-right text-sm ${incomingTone ? "text-[#99f6e4]" : outgoingTone ? "text-red-200" : "text-white"}`}>{quantity(section.qty)}</td>
              <td></td>
              <td className="px-2.5 py-2.5 text-right text-sm text-white">{moneyRon(section.value)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function inventoryVariantMap(items: InventoryItem[] = []) {
  return new Map((items || []).map((item) => [String(item.variant_id || ""), item] as const).filter(([id]) => Boolean(id)));
}

function documentLineSubcategory(line: DocumentLine, variants: Map<string, InventoryItem>) {
  const raw = line.raw && typeof line.raw === "object" ? line.raw as Record<string, unknown> : {};
  const inventoryItem = line.variant_id ? variants.get(String(line.variant_id)) : null;
  return firstText(
    line.subcategory_name,
    line.subcategory_name_ro,
    line.product_type,
    raw.subcategoryName,
    raw.subcategory_name,
    raw.subcategoryNameRo,
    raw.subcategory_name_ro,
    raw.subCategoryName,
    raw.sub_category_name,
    raw.productType,
    raw.product_type,
    inventoryItem?.subcategory_name_ro,
    inventoryItem?.subcategory_name_hu,
    inventoryItem?.product_type,
    inventoryItem?.subcategory_code,
  );
}

function normalizedUitCode(value: unknown) {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 64);
}

function documentUitCode(item?: Partial<DocumentListItem> | null) {
  const raw = item?.raw && typeof item.raw === "object" ? item.raw as Record<string, unknown> : {};
  return normalizedUitCode(firstText(item?.uit_code, raw.uitCode, raw.uit_code));
}

function internalTransferNeedsUit(type: DocumentType, totalValue: unknown) {
  return type === "internal_transfer" && n(totalValue) >= UIT_WARNING_THRESHOLD_RON;
}

function internalTransferMissingUit(item?: Partial<DocumentListItem> | null) {
  return internalTransferNeedsUit(documentTypeOf(item), item?.total_value) && !documentUitCode(item);
}

function documentPrintMeta(type: DocumentType, doc: DocumentListItem) {
  const source = doc.from_location_summary || "-";
  if (type === "internal_transfer") {
    return {
      operation: "Transfer intern de stoc",
      leftLabel: "Gestiune predătoare",
      leftValue: source,
      rightLabel: "Gestiune primitoare",
      rightValue: doc.to_location_summary || "-",
      declaration: "Prin prezentul document se confirmă predarea și primirea produselor enumerate mai jos, în cantitățile și la valorile indicate, pentru transfer intern între gestiuni. Persoanele semnatare confirmă verificarea cantitativă și valorică a bunurilor.",
      signatures: ["Predat de", "Transportat de", "Primit de", "Verificat de"],
    };
  }
  if (type === "supplier_return") {
    return {
      operation: "Retur de marfă către furnizor",
      leftLabel: "Gestiune emitentă",
      leftValue: source,
      rightLabel: "Furnizor",
      rightValue: doc.supplier_name || doc.to_location_summary || "-",
      declaration: "Prin prezentul document se confirmă scoaterea produselor din gestiune și predarea acestora către furnizor, în cantitățile și la valorile indicate. Produsele fac obiectul unui retur justificat și sunt însoțite de prezentul document.",
      signatures: ["Predat de", "Transportat de", "Primit furnizor", "Verificat de"],
    };
  }
  if (type === "damaged_writeoff") {
    return {
      operation: "Scoatere din gestiune",
      leftLabel: "Gestiune",
      leftValue: source,
      rightLabel: "Motiv constatat",
      rightValue: reasonLabel(type, doc.reason_code, doc.reason_text, true),
      declaration: "Comisia constată că produsele enumerate mai jos nu mai pot fi comercializate în condiții normale și aprobă scoaterea lor din gestiune, în cantitățile și la valorile indicate.",
      signatures: ["Gestionar", "Constatat de", "Aprobat de", "Verificat de"],
    };
  }
  return {
    operation: "Corecție de stoc",
    leftLabel: "Gestiune",
    leftValue: source,
    rightLabel: "Tip corecție",
    rightValue: doc.operation_direction === "increase" ? "Majorare de stoc" : "Diminuare de stoc",
    declaration: "Prin prezentul document se înregistrează corecția justificată a stocului pentru produsele enumerate mai jos. Cantitățile au fost verificate, iar diferențele sunt asumate de persoanele semnatare.",
    signatures: ["Întocmit de", "Gestionar", "Aprobat de", "Verificat de"],
  };
}

function makePrintHtml(detail: DocumentDetail, inventoryItems: InventoryItem[] = []) {
  const doc = detail.document;
  const lines = detail.lines || [];
  const type = documentTypeOf(doc);
  const meta = documentPrintMeta(type, doc);
  const totalQty = lines.reduce((sum, line) => sum + n(line.qty), 0);
  const totalValue = detailTotalValue(lines);
  const missingPrices = lines.filter((line) => lineUnitPrice(line) === null).length;
  const legacyMark = doc.isLegacy || doc.status === "legacy"
    ? `<div class="legacy">ARHIVĂ TEHNICĂ · document reconstruit din jurnalul de stoc</div>`
    : "";
  const flow = documentFlowGroups(detail);
  const variants = inventoryVariantMap(inventoryItems);
  const uitRequired = internalTransferNeedsUit(type, totalValue);
  const uitCode = documentUitCode(doc);

  const renderRows = (rows: IndexedDocumentLine[]) => rows.map(({ line, index }) => {
    const image = line.image_url
      ? `<img class="img" src="${escapeHtml(line.image_url)}" alt="" />`
      : `<div class="img empty">Fără foto</div>`;
    const subcategory = documentLineSubcategory(line, variants);
    const variant = [line.brand_name, subcategory, line.color_name, line.size]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" • ");
    return `<tr>
      <td class="center">${index + 1}</td>
      <td><div class="product">${image}<div><strong>${escapeHtml(line.product_title || "Produs")}</strong>${variant ? `<small>${escapeHtml(variant)}</small>` : ""}</div></div></td>
      <td class="code">${escapeHtml(line.product_code || "-")}</td>
      <td class="code">${escapeHtml(line.barcode || "-")}</td>
      <td class="center">buc.</td>
      <td class="qty">${escapeHtml(quantity(line.qty))}</td>
      <td class="checkCell"><span class="checkBox" aria-hidden="true"></span></td>
      <td class="money">${escapeHtml(moneyRon(lineUnitPrice(line), false))}</td>
      <td class="money value">${escapeHtml(moneyRon(lineTotalValue(line), false))}</td>
    </tr>`;
  }).join("");

  const renderSection = (
    rows: IndexedDocumentLine[],
    kind: "incoming" | "outgoing" | "neutral",
    title: string,
    subtitle: string,
  ) => {
    if (!rows.length) return "";
    const sectionQty = rows.reduce((sum, row) => sum + n(row.line.qty), 0);
    const sectionValue = rows.reduce((sum, row) => sum + (lineTotalValue(row.line) || 0), 0);
    return `<section class="flowSection ${kind}">
      <div class="flowHeader">
        <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div>
        <b>${escapeHtml(quantity(sectionQty))} buc. · ${escapeHtml(moneyRon(sectionValue))}</b>
      </div>
      <table><thead><tr><th>Nr. crt.</th><th>Denumirea produsului / varianta</th><th>Cod produs</th><th>Cod de bare</th><th>U.M.</th><th>Cant.</th><th>Verificat</th><th>P.U. RON</th><th>Valoare RON</th></tr></thead><tbody>${renderRows(rows)}</tbody><tfoot><tr><td colspan="5" class="totalLabel">SUBTOTAL</td><td class="qty">${escapeHtml(quantity(sectionQty))}</td><td></td><td></td><td class="money totalValue">${escapeHtml(moneyRon(sectionValue, false))}</td></tr></tfoot></table>
    </section>`;
  };

  const indexedLines = lines.map((line, index) => ({ line, index }));
  const sectionsHtml = type === "internal_transfer"
    ? [
        renderSection(flow.incoming, "incoming", "PRODUSE INTRATE", `Destinație: ${flow.focusLocationName}`),
        renderSection(flow.outgoing, "outgoing", "PRODUSE IEȘITE", `Gestiune sursă: ${flow.focusLocationName}`),
        renderSection(flow.other, "neutral", "ALTE TRASEE", "Mișcări care nu folosesc gestiunea principală a documentului"),
      ].join("")
    : renderSection(indexedLines, type === "damaged_writeoff" || type === "supplier_return" ? "outgoing" : "neutral", "PRODUSELE DOCUMENTULUI", meta.operation);

  const reason = type === "internal_transfer" ? "" : reasonLabel(type, doc.reason_code, doc.reason_text, true);
  const reference = firstText(doc.external_reference, (doc.raw as any)?.receptionInvoiceNumber);
  const routeLeftClass = type === "internal_transfer" ? "routeCard routeOutgoing" : "routeCard";
  const routeRightClass = type === "internal_transfer" ? "routeCard routeIncoming" : "routeCard";

  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(`${doc.title || "Document de gestiune"} ${doc.document_number}`)}</title>
<style>
  @page { size:A4 portrait; margin:10mm; }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; background:#fff; color:#172033; }
  body { font-family:Arial,Helvetica,sans-serif; font-size:11px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .top { display:grid; grid-template-columns:minmax(0,1fr) minmax(68mm,.9fr); gap:9mm; align-items:start; padding-bottom:5mm; border-bottom:2px solid #255f54; }
  .company { color:#183d36; font-size:17px; font-weight:700; letter-spacing:.03em; }
  .companyMeta { margin-top:2.5mm; color:#465467; font-size:9.5px; line-height:1.45; }
  .docBox { border:1px solid #b9c7c4; border-radius:3mm; overflow:hidden; }
  .docBox h3 { margin:0; padding:2.2mm 3mm; background:#255f54; color:#fff; font-size:9px; letter-spacing:.09em; text-transform:uppercase; }
  .docBoxBody { padding:2.5mm 3mm; background:#f5f8f7; }
  .docLine { display:flex; justify-content:space-between; gap:5mm; padding:1.1mm 0; border-bottom:1px solid #d8e0de; }
  .docLine:last-child { border-bottom:0; }.docLine span{color:#667382}.docLine strong{text-align:right;color:#172033}
  .title { padding:5mm 0 3.5mm; text-align:center; }.eyebrow{color:#255f54;font-size:8.5px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}
  h1{margin:1.5mm 0 0;font-size:19px;line-height:1.15;letter-spacing:.02em}.subtitle{margin-top:1.5mm;color:#526070}
  .legacy{margin:2.5mm auto 0;display:inline-block;border:1px solid #d69d28;border-radius:999px;padding:1.2mm 2.5mm;background:#fff8e8;color:#8a5b00;font-size:8px;font-weight:700}
  .route{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3mm;margin-bottom:3.5mm}.routeCard{border:1px solid #ccd7d4;border-radius:2.5mm;padding:2.5mm 3mm;background:#f7faf9}.routeCard span{display:block;color:#6a7683;font-size:8px;letter-spacing:.08em;text-transform:uppercase}.routeCard strong{display:block;margin-top:1mm;font-size:11px}
  .routeOutgoing{border-color:#ef4444;background:#fff1f2}.routeOutgoing span,.routeOutgoing strong{color:#991b1b}.routeIncoming{border-color:#0f9f8f;background:#ecfdf9}.routeIncoming span,.routeIncoming strong{color:#0f5f59}
  .declaration{margin-bottom:3.5mm;border-left:3px solid #255f54;background:#f5f8f7;padding:2.5mm 3mm;color:#354353;line-height:1.45}.note{margin-bottom:3.5mm;border:1px solid #d3dcda;border-radius:2.5mm;padding:2.5mm 3mm}
  .uitWarning{margin-bottom:3.5mm;border:2px solid #dc2626;border-radius:2.5mm;background:#fff1f2;padding:2.8mm 3mm;color:#991b1b;font-weight:700;line-height:1.45}.uitWarning.recorded{border-color:#0f9f8f;background:#ecfdf9;color:#0f5f59}.uitCode{display:inline-block;min-width:52mm;margin-left:2mm;border-bottom:1px solid currentColor;color:inherit}.uitValue{display:inline-block;margin-left:2mm;font-size:11px;letter-spacing:.06em}
  .flowSection{margin-top:3.5mm;break-inside:auto;border:1px solid #d8e1e5;border-radius:2.5mm;overflow:hidden}.flowHeader{display:flex;align-items:center;justify-content:space-between;gap:5mm;padding:2.4mm 3mm;background:#f8fafc;border-top:3px solid #64748b;border-bottom:1px solid #d8e1e5;color:#172033}.flowHeader div{display:grid;gap:.7mm}.flowHeader strong{font-size:10px;letter-spacing:.09em}.flowHeader span{font-size:7.5px;color:#64748b}.flowHeader b{font-size:9px;white-space:nowrap}.flowSection.incoming .flowHeader{background:#ecfdf9;border-top-color:#14b8a6;color:#0f5f59}.flowSection.outgoing .flowHeader{background:#fff1f2;border-top-color:#ef4444;color:#991b1b}.flowSection.neutral .flowHeader{background:#f1f5f9;border-top-color:#64748b;color:#334155}
  table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#26384b;color:#fff;border:1px solid #26384b;padding:2.2mm 1.4mm;font-size:7.7px;line-height:1.2;text-transform:uppercase;text-align:left}td{border:1px solid #d4dcdf;padding:1.7mm 1.4mm;font-size:8.5px;line-height:1.25;vertical-align:middle;overflow-wrap:anywhere}tbody tr:nth-child(even) td{background:#f8fafb}
  th:nth-child(1),td:nth-child(1){width:7mm}th:nth-child(2),td:nth-child(2){width:58mm}th:nth-child(3),td:nth-child(3){width:20mm}th:nth-child(4),td:nth-child(4){width:23mm}th:nth-child(5),td:nth-child(5){width:9mm}th:nth-child(6),td:nth-child(6){width:10mm}th:nth-child(7),td:nth-child(7){width:19mm}th:nth-child(8),td:nth-child(8){width:20mm}th:nth-child(9),td:nth-child(9){width:24mm}
  .center{text-align:center}.qty{text-align:center;font-size:11px;font-weight:700;color:#255f54}.code{font-family:"Courier New",monospace;font-size:8px}.checkCell{text-align:center}.checkBox{display:inline-block;width:6.2mm;height:6.2mm;border:1.4px solid #334155;border-radius:1.2mm;background:#fff;vertical-align:middle}.money{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.value{font-weight:700;color:#183d36}.product{display:flex;align-items:center;gap:2mm;min-width:0}.product strong{display:block;font-size:9px}.product small{display:block;margin-top:.7mm;color:#667382;font-size:7.5px}.img{width:9mm;height:11mm;flex:0 0 auto;object-fit:contain;border:1px solid #d4dcdf;border-radius:1.5mm;background:#fff}.img.empty{display:flex;align-items:center;justify-content:center;padding:1mm;color:#9aa4ae;font-size:5.5px;text-align:center}
  tfoot td{background:#eef4f2;border-color:#b9c7c4;font-weight:700}tfoot .totalLabel{text-align:right;color:#183d36;letter-spacing:.08em}tfoot .totalValue{background:#255f54;color:#fff;font-size:11px}.total{display:grid;grid-template-columns:minmax(0,1fr) auto;margin-top:3mm;border:1px solid #b9c7c4;border-radius:2.5mm;overflow:hidden}.total span{padding:2.4mm 3mm;color:#536171;background:#f5f8f7}.total strong{min-width:44mm;padding:2.4mm 3mm;text-align:center;color:#fff;background:#255f54;font-size:13px}.valuationNote{margin-top:1.5mm;color:#8a5b00;font-size:7.5px;text-align:right}
  .signatures{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4mm;margin-top:13mm;break-inside:avoid}.signature{min-height:27mm;border:1px solid #ccd7d4;border-radius:2.5mm;padding:2.5mm}.signatureTitle{color:#255f54;font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.signatureLine{margin-top:9mm;border-top:1px solid #667382;padding-top:1.3mm;color:#667382;font-size:7.2px;text-align:center}.signatureDate{margin-top:2.5mm;color:#7b8793;font-size:7.2px;text-align:center}.footer{display:flex;justify-content:space-between;gap:8mm;margin-top:5mm;padding-top:2.5mm;border-top:1px solid #d7dfdd;color:#7b8793;font-size:7.2px}
</style>
</head>
<body>
<div class="top">
  <div><div class="company">TITAN EURO-COM SRL</div><div class="companyMeta"><div><strong>CUI:</strong> RO17495362</div><div><strong>Nr. Reg. Com.:</strong> J19/420/2005</div><div><strong>Sediu:</strong> Str. Mihail Sadoveanu nr. 33, sc. C, et. 4, ap. 17, Miercurea-Ciuc, jud. Harghita, România</div></div></div>
  <div class="docBox"><h3>Datele documentului</h3><div class="docBoxBody"><div class="docLine"><span>Nr. document</span><strong>${escapeHtml(doc.document_number)}</strong></div><div class="docLine"><span>Data emiterii</span><strong>${escapeHtml(roDateTime(doc.created_at))}</strong></div><div class="docLine"><span>Tip operațiune</span><strong>${escapeHtml(meta.operation)}</strong></div>${reference ? `<div class="docLine"><span>Referință</span><strong>${escapeHtml(reference)}</strong></div>` : ""}</div></div>
</div>
<div class="title"><div class="eyebrow">Document intern de gestiune</div><h1>${escapeHtml(doc.title || documentMeta(type).label)}</h1><div class="subtitle">${escapeHtml(doc.subtitle || meta.operation)}</div>${legacyMark}</div>
<div class="route"><div class="${routeLeftClass}"><span>${escapeHtml(type === "internal_transfer" ? "Ieșire / gestiune sursă" : meta.leftLabel)}</span><strong>${escapeHtml(meta.leftValue)}</strong></div><div class="${routeRightClass}"><span>${escapeHtml(type === "internal_transfer" ? "Intrare / gestiune destinație" : meta.rightLabel)}</span><strong>${escapeHtml(meta.rightValue)}</strong></div></div>
<div class="declaration">${escapeHtml(meta.declaration)}</div>
${uitRequired || uitCode ? `<div class="uitWarning ${uitCode ? "recorded" : ""}">${uitCode ? "Cod UIT înregistrat:" : "ATENȚIE: valoarea transferului depășește 10.000 RON. Pentru expediere este necesar cod UIT. Cod UIT:"}${uitCode ? `<span class="uitValue">${escapeHtml(uitCode)}</span>` : `<span class="uitCode">&nbsp;</span>`}</div>` : ""}
${reason && type !== "internal_transfer" ? `<div class="note"><strong>Motiv:</strong> ${escapeHtml(reason)}</div>` : ""}
${doc.note ? `<div class="note"><strong>Observații interne relevante documentului:</strong> ${escapeHtml(doc.note)}</div>` : ""}
${sectionsHtml}
<div class="total"><span>Total produse: ${lines.length} poziții • ${quantity(totalQty)} buc.</span><strong>${escapeHtml(moneyRon(totalValue))}</strong></div>
${missingPrices ? `<div class="valuationNote">Atenție: ${missingPrices} poziții nu au preț disponibil; totalul valoric include numai pozițiile evaluate.</div>` : ""}
<div class="signatures">${meta.signatures.map((title) => `<div class="signature"><div class="signatureTitle">${escapeHtml(title)}</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div>`).join("")}</div>
<div class="footer"><span>Document generat din sistemul AllInFashion.</span><span>${escapeHtml(doc.document_number)} • ${escapeHtml(roDateTime(doc.created_at))}</span></div>
</body></html>`;
}

function printDetail(detail: DocumentDetail, inventoryItems: InventoryItem[] = []) {
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
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error("A böngésző nem engedte megnyitni a nyomtatási keretet.");
  }
  let cleaned = false;
  let timer: number | undefined;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (timer) window.clearTimeout(timer);
    iframe.remove();
  };
  win.addEventListener("afterprint", cleanup, { once: true });
  doc.open();
  doc.write(makePrintHtml(detail, inventoryItems));
  doc.close();
  win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
    win.focus();
    win.print();
    timer = window.setTimeout(cleanup, 60000);
  }));
}

let zxingPromise: Promise<Window["ZXingBrowser"] | null> | null = null;
function loadZxing() {
  if (window.ZXingBrowser?.BrowserMultiFormatReader) return Promise.resolve(window.ZXingBrowser);
  if (zxingPromise) return zxingPromise;
  zxingPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-aif-stock-zxing="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.ZXingBrowser || null), { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@zxing/browser@0.1.5";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.aifStockZxing = "1";
    script.onload = () => resolve(window.ZXingBrowser || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return zxingPromise;
}

export default function AllInProductMoves() {
  const [items, setItems] = useState<DocumentListItem[]>([]);
  const [totals, setTotals] = useState<ListTotals>({ total: 0, official: 0, legacy: 0, cancelled: 0, totalQty: 0 });
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [receptions, setReceptions] = useState<ReceptionItem[]>([]);
  const [settings, setSettings] = useState<Record<DocumentType, StockDocumentSettings> | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit, setLimit] = useState(30);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [type, setType] = useState<ArchiveFilter>("all");
  const [loading, setLoading] = useState(false);
  const [baseLoading, setBaseLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailUitCode, setDetailUitCode] = useState("");
  const [detailUitSaving, setDetailUitSaving] = useState(false);
  const [detailUitError, setDetailUitError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocumentListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingMode, setDeletingMode] = useState<DeleteMode | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsType, setSettingsType] = useState<DocumentType>("internal_transfer");
  const [settingsDraft, setSettingsDraft] = useState<StockDocumentSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [draftType, setDraftType] = useState<DocumentType>("internal_transfer");
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [targetLocationId, setTargetLocationId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [receptionId, setReceptionId] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [correctionDirection, setCorrectionDirection] = useState<CorrectionDirection>("decrease");
  const [externalReference, setExternalReference] = useState("");
  const [uitCode, setUitCode] = useState("");
  const [note, setNote] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productSearchBusy, setProductSearchBusy] = useState(false);
  const [productSearchError, setProductSearchError] = useState("");
  const [draftLines, setDraftLines] = useState<Record<string, DraftLine>>({});
  const [editingDraftId, setEditingDraftId] = useState("");
  const [editingDraftNumber, setEditingDraftNumber] = useState("");
  const [editingDocumentStatus, setEditingDocumentStatus] = useState<"" | "draft" | "preparation">("");
  const [savingDocument, setSavingDocument] = useState(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraRafRef = useRef<number | null>(null);
  const zxingControlsRef = useRef<{ stop?: () => void } | null>(null);
  const cameraHandlingRef = useRef(false);
  const autoOpenedDocumentRef = useRef("");
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const scanAutoTimerRef = useRef<number | null>(null);
  const scanQueueRef = useRef<string[]>([]);
  const scanQueueRunningRef = useRef(false);
  const productSearchRequestIdRef = useRef(0);

  const loadSettings = useCallback(async () => {
    const result = await fetchJson<{ settings?: Record<DocumentType, StockDocumentSettings>; items?: StockDocumentSettings[] }>("/stock-documents/settings");
    const map = result.settings || Object.fromEntries((result.items || []).map((row) => [row.documentType, row])) as Record<DocumentType, StockDocumentSettings>;
    setSettings(map);
    return map;
  }, []);

  const loadBaseData = useCallback(async () => {
    setBaseLoading(true);
    try {
      const [meta, inv, stockResult] = await Promise.all([
        fetchJson<{ locations?: LocationItem[]; suppliers?: SupplierItem[] }>("/meta"),
        fetchJson<{ items?: InventoryItem[] }>(`/inventory?limit=5000&includeZero=1&_=${Date.now()}`),
        fetchJson<{ items?: StockItem[] }>(`/stock?_=${Date.now()}`),
      ]);
      setLocations((meta.locations || []).filter((row) => row.is_active !== false));
      setSuppliers((meta.suppliers || []).filter((row) => row.is_active !== false));
      setInventory((inv.items || []).filter((row) => String(row.variant_status || "active") !== "archived" && String(row.model_status || "active") !== "archived"));
      setStock(stockResult.items || []);
    } catch (loadError: any) {
      setError(loadError?.message || "A bizonylatkészítés törzsadatai nem tölthetők be.");
    } finally {
      setBaseLoading(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      query.set("page", String(pageNo));
      query.set("limit", String(limit));
      if (search.trim()) query.set("search", search.trim());
      if (from) query.set("from", from);
      if (to) query.set("to", to);
      if (fromLocation) query.set("fromLocation", fromLocation);
      if (toLocation) query.set("toLocation", toLocation);
      if (type !== "all") query.set("type", type);
      const result = await fetchJson<ListResponse>(`/stock-transfer-documents?${query.toString()}`);
      setItems(result.items || []);
      setTotals(result.totals || { total: 0, official: 0, legacy: 0, cancelled: 0, totalQty: 0 });
      setPageNo(result.page || 1);
      setPages(result.pages || 1);
      if (result.locations?.length) setLocations(result.locations);
    } catch (loadError: any) {
      setError(loadError?.message || "A készletbizonylatok betöltése nem sikerült.");
    } finally {
      setLoading(false);
    }
  }, [from, fromLocation, limit, pageNo, search, to, toLocation, type]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    void Promise.all([loadSettings(), loadBaseData()]).catch((loadError) => setError(loadError?.message || "Az oldal előkészítése nem sikerült."));
  }, [loadBaseData, loadSettings]);

  const openDetailById = useCallback(async (id: string) => {
    if (!id) return;
    setDetailLoading(true);
    setError("");
    try {
      const result = await fetchJson<DocumentDetail>(`/stock-transfer-documents/${encodeURIComponent(id)}`);
      setDetail(result);
      setDetailUitCode(documentUitCode(result.document));
      setDetailUitError("");
    } catch (loadError: any) {
      setError(loadError?.message || "A bizonylat részleteinek betöltése nem sikerült.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const queryText = window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "";
    const target = new URLSearchParams(queryText).get("document") || "";
    if (!target || autoOpenedDocumentRef.current === target) return;
    autoOpenedDocumentRef.current = target;
    void openDetailById(target);
  }, [openDetailById, items.length]);

  useEffect(() => {
    if (!detail && !settingsOpen && !deleteTarget && !createOpen && !cameraOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (cameraOpen) setCameraOpen(false);
      else if (deleteTarget && !deleting) setDeleteTarget(null);
      else if (settingsOpen && !settingsSaving) setSettingsOpen(false);
      else if (createOpen && !savingDocument) setCreateOpen(false);
      else if (detail) setDetail(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [cameraOpen, createOpen, deleteTarget, deleting, detail, savingDocument, settingsOpen, settingsSaving]);

  const stockMap = useMemo(() => {
    const map = new Map<string, StockItem>();
    for (const row of stock) {
      const key = `${row.variant_id}:${row.location_id || row.location_code || row.location_name || ""}`;
      map.set(key, row);
    }
    return map;
  }, [stock]);

  function locationById(value: string) {
    return locations.find((row) => String(row.id) === value || String(row.code || "") === value) || null;
  }

  function stockAt(variantId: string, locationId: string) {
    const loc = locationById(locationId);
    if (!loc) return null;
    return stockMap.get(`${variantId}:${loc.id}`)
      || stockMap.get(`${variantId}:${loc.code || ""}`)
      || stockMap.get(`${variantId}:${loc.name}`)
      || null;
  }

  function availableAt(variantId: string, locationId: string) {
    const row = stockAt(variantId, locationId);
    if (!row) return 0;
    if (row.available_qty !== null && row.available_qty !== undefined) return Math.max(0, Math.floor(n(row.available_qty)));
    return Math.max(0, Math.floor(n(row.qty) - n(row.reserved_qty)));
  }

  const draftLineArray = useMemo(() => Object.values(draftLines), [draftLines]);
  const outgoingDraft = draftType !== "stock_correction" || correctionDirection === "decrease";
  const draftPriceBasis = draftType === "internal_transfer" ? "Eladási ár" : "Beszerzési ár";
  const draftTotalQty = draftLineArray.reduce((sum, line) => sum + line.qty, 0);
  const draftTotalValue = draftLineArray.reduce((sum, line) => {
    const price = decimalValue(draftType === "internal_transfer" ? line.item.sell_price : line.item.buy_price) || 0;
    return sum + price * line.qty;
  }, 0);

  const selectedSupplierReceptions = useMemo(
    () => receptions.filter((row) => !supplierId || String(row.supplier_id || "") === supplierId),
    [receptions, supplierId],
  );

  const productSearchResults = useMemo(() => {
    const query = normalize(productSearch);
    const looseQuery = scanLooseKey(productSearch);
    if (!query && !looseQuery) return [] as InventoryItem[];

    return inventory
      .filter((item) => {
        if (query && productSearchValues(item).some((value) => value.includes(query))) return true;
        if (!looseQuery) return false;
        return [
          ...productIdentifierValues(item),
          item.title_ro,
          item.shopify_title,
          item.brand_name,
          item.color_name,
          item.color_code,
          item.size,
        ]
          .filter((value) => String(value ?? "").trim())
          .some((value) => scanLooseKey(value).includes(looseQuery));
      })
      .sort((a, b) => {
        const exactA = exactProductMatch(a, productSearch) ? 0 : 1;
        const exactB = exactProductMatch(b, productSearch) ? 0 : 1;
        return exactA - exactB || productTitle(a).localeCompare(productTitle(b), "hu", { numeric: true, sensitivity: "base" });
      })
      .slice(0, 10);
  }, [inventory, productSearch]);

  useEffect(() => {
    if (!createOpen) return;
    const query = productSearch.trim();
    const requestId = ++productSearchRequestIdRef.current;

    if (!query) {
      setProductSearchBusy(false);
      setProductSearchError("");
      return;
    }

    const timer = window.setTimeout(async () => {
      setProductSearchBusy(true);
      setProductSearchError("");
      try {
        const params = new URLSearchParams();
        params.set("search", query);
        params.set("limit", "100");
        params.set("includeZero", "1");
        params.set("_", String(Date.now()));

        const remote = await fetchJson<{ items?: InventoryItem[] }>(`/inventory?${params.toString()}`);
        if (requestId !== productSearchRequestIdRef.current) return;

        const remoteItems = (remote.items || []).filter((item) =>
          String(item.variant_status || "active") !== "archived" &&
          String(item.model_status || "active") !== "archived"
        );

        if (remoteItems.length) {
          setInventory((current) => uniqueInventoryItems([...current, ...remoteItems]));
        }
      } catch (searchError: any) {
        if (requestId !== productSearchRequestIdRef.current) return;
        setProductSearchError(searchError?.message || "A teljes terméktörzs keresése nem sikerült.");
      } finally {
        if (requestId === productSearchRequestIdRef.current) setProductSearchBusy(false);
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [createOpen, productSearch]);

  useEffect(() => {
    if (!createOpen) return;
    const ready = Boolean(sourceLocationId && (draftType !== "internal_transfer" || targetLocationId));
    if (!ready) return;
    focusScanInput();
  }, [createOpen, draftType, sourceLocationId, targetLocationId]);


  function resetDraft(nextType: DocumentType = "internal_transfer") {
    setDraftType(nextType);
    setSourceLocationId("");
    setTargetLocationId("");
    setSupplierId("");
    setReceptionId("");
    setReasonCode("");
    setReasonText("");
    setCorrectionDirection("decrease");
    setExternalReference("");
    setUitCode("");
    setNote("");
    setScanValue("");
    setScanBusy(false);
    setScanFeedback(null);
    scanQueueRef.current = [];
    if (scanAutoTimerRef.current !== null) {
      window.clearTimeout(scanAutoTimerRef.current);
      scanAutoTimerRef.current = null;
    }
    setProductSearch("");
    setProductSearchBusy(false);
    setProductSearchError("");
    productSearchRequestIdRef.current += 1;
    setDraftLines({});
    setEditingDraftId("");
    setEditingDraftNumber("");
    setEditingDocumentStatus("");
  }

  function changeDraftType(nextType: DocumentType) {
    if (editingDocumentStatus === "preparation") return;
    setDraftType(nextType);
    setTargetLocationId("");
    setSupplierId("");
    setReceptionId("");
    setReceptions([]);
    setReasonCode("");
    setReasonText("");
    setCorrectionDirection("decrease");
    if (nextType !== "internal_transfer") setUitCode("");
  }

  function openCreate(nextType: DocumentType = "internal_transfer") {
    resetDraft(nextType);
    setError("");
    setMessage("");
    setCreateOpen(true);
    if (!inventory.length || !stock.length) void loadBaseData();
  }

  async function openDraftForEdit(target: DocumentListItem | string) {
    const id = typeof target === "string" ? target : target.id;
    setDetailLoading(true);
    setError("");
    try {
      const result = await fetchJson<DocumentDetail>(`/stock-transfer-documents/${encodeURIComponent(id)}`);
      const status = String(result.document.status || "");
      if (status !== "draft" && status !== "preparation") throw new Error("Csak nyitott előkészítés szerkeszthető.");
      const docType = documentTypeOf(result.document);
      setEditingDraftId(result.document.id);
      setEditingDraftNumber(displayDocumentNumber(result.document));
      setEditingDocumentStatus(status as "draft" | "preparation");
      setDraftType(docType);
      const firstLine = (result.lines || [])[0] || null;
      setSourceLocationId(String(result.document.source_location_id || firstLine?.from_location_id || ""));
      setTargetLocationId(String(result.document.target_location_id || firstLine?.to_location_id || ""));
      setSupplierId(String(result.document.supplier_id || ""));
      setReceptionId(String(result.document.reception_id || ""));
      setReasonCode(String(result.document.reason_code || ""));
      setReasonText(String(result.document.reason_text || ""));
      setCorrectionDirection(result.document.operation_direction === "increase" ? "increase" : "decrease");
      setExternalReference(String(result.document.external_reference || ""));
      setUitCode(documentUitCode(result.document));
      setNote(String(result.document.note || ""));
      const inventoryById = new Map<string, InventoryItem>(inventory.map((row) => [String(row.variant_id), row]));
      const rows: Record<string, DraftLine> = {};
      for (const line of result.lines || []) {
        const idValue = String(line.variant_id || "").trim();
        if (!idValue) continue;
        const current = inventoryById.get(idValue);
        const item: InventoryItem = current || {
          variant_id: idValue,
          title_ro: line.product_title || "Termék",
          brand_name: line.brand_name || null,
          category_name_ro: line.category_name || null,
          subcategory_name_ro: line.subcategory_name_ro || line.subcategory_name || null,
          product_type: line.product_type || null,
          supplier_product_code: line.product_code || null,
          barcode: line.barcode || null,
          display_barcode: line.barcode || null,
          color_name: line.color_name || null,
          size: line.size || null,
          image_url: line.image_url || null,
          buy_price: line.price_basis === "purchase_price" ? line.unit_price : null,
          sell_price: line.price_basis === "selling_price" ? line.unit_price : null,
        };
        const fromId = String(line.from_location_id || result.document.source_location_id || "");
        const toId = String(line.to_location_id || result.document.target_location_id || "");
        const qty = Math.max(1, Math.floor(n(line.qty)));
        const key = docType === "internal_transfer" ? `${idValue}:${fromId}:${toId}` : idValue;
        const previous = rows[key];
        rows[key] = {
          key,
          item,
          qty: qty + Number(previous?.qty || 0),
          originalQty: qty + Number(previous?.originalQty || 0),
          fromLocationId: fromId || undefined,
          toLocationId: toId || undefined,
          lineId: line.id || null,
        };
      }
      setDraftLines(rows);
      setProductSearch("");
      setScanValue("");
      setDetail(null);
      setCreateOpen(true);
      if (result.document.supplier_id) {
        try {
          const rec = await fetchJson<{ items?: ReceptionItem[] }>(`/receptions?supplier=${encodeURIComponent(String(result.document.supplier_id))}&limit=150`);
          setReceptions(rec.items || []);
        } catch { setReceptions([]); }
      } else setReceptions([]);
      if (!inventory.length || !stock.length) void loadBaseData();
    } catch (editError: any) {
      setError(editError?.message || "A dokumentum nem tölthető be szerkesztésre.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadSupplierReceptions(nextSupplierId: string) {
    setSupplierId(nextSupplierId);
    setReceptionId("");
    if (!nextSupplierId) {
      setReceptions([]);
      return;
    }
    try {
      const result = await fetchJson<{ items?: ReceptionItem[] }>(`/receptions?supplier=${encodeURIComponent(nextSupplierId)}&limit=150`);
      setReceptions(result.items || []);
    } catch (loadError: any) {
      setError(loadError?.message || "A beszállító receptiói nem tölthetők be.");
    }
  }

  function maxDraftQty(item: InventoryItem, fromId = sourceLocationId, originalQty = 0) {
    if (!outgoingDraft) return 999999;
    const available = availableAt(item.variant_id, fromId);
    return editingDocumentStatus === "preparation" ? Math.max(0, originalQty) + available : available;
  }

  function addDraftItem(item: InventoryItem, amount = 1) {
    if (!sourceLocationId) {
      setError("Előbb válaszd ki a forráshelyet, hogy a rendszer ellenőrizni tudja az elérhető készletet.");
      return;
    }
    if (draftType === "internal_transfer" && !targetLocationId) {
      setError("Belső átadáshoz válaszd ki a célhelyet is.");
      return;
    }
    const id = String(item.variant_id || "").trim();
    if (!id) return;
    const fromId = sourceLocationId;
    const toId = draftType === "internal_transfer" ? targetLocationId : "";
    const key = draftType === "internal_transfer" ? `${id}:${fromId}:${toId}` : id;
    setDraftLines((current) => {
      const previous = current[key];
      const originalQty = Number(previous?.originalQty || 0);
      const max = maxDraftQty(item, fromId, originalQty);
      if (outgoingDraft && max <= 0) {
        setError(`${productTitle(item)}: nincs szabad készlet a kiválasztott helyen.`);
        return current;
      }
      const wanted = (previous?.qty || 0) + Math.max(1, amount);
      const qty = outgoingDraft ? Math.min(max, wanted) : wanted;
      return {
        ...current,
        [key]: {
          key,
          item,
          qty,
          originalQty,
          fromLocationId: fromId || undefined,
          toLocationId: toId || undefined,
          lineId: previous?.lineId || null,
        },
      };
    });
    setError("");
    setProductSearch("");
    setScanValue("");
  }

  function adjustDraftQty(lineKey: string, delta: number) {
    setDraftLines((current) => {
      const row = current[lineKey];
      if (!row) return current;
      const max = maxDraftQty(row.item, row.fromLocationId || sourceLocationId, row.originalQty);
      const nextQty = Math.max(0, outgoingDraft ? Math.min(max, row.qty + delta) : row.qty + delta);
      const next = { ...current };
      if (nextQty <= 0) delete next[lineKey];
      else next[lineKey] = { ...row, qty: nextQty };
      return next;
    });
  }

  function setDraftQty(lineKey: string, value: string) {
    setDraftLines((current) => {
      const row = current[lineKey];
      if (!row) return current;
      const max = maxDraftQty(row.item, row.fromLocationId || sourceLocationId, row.originalQty);
      const parsed = Math.max(0, Math.floor(n(value)));
      const qty = outgoingDraft ? Math.min(max, parsed) : parsed;
      const next = { ...current };
      if (qty <= 0) delete next[lineKey];
      else next[lineKey] = { ...row, qty };
      return next;
    });
  }

  function focusScanInput(select = false) {
    window.setTimeout(() => {
      const node = scanInputRef.current;
      if (!node || node.disabled) return;
      node.focus();
      if (select) node.select();
    }, 0);
  }

  function scannerReady() {
    return Boolean(
      sourceLocationId &&
      (draftType !== "internal_transfer" || targetLocationId) &&
      !savingDocument
    );
  }

  async function resolveScannedProducts(code: string) {
    const localMatches = uniqueInventoryItems(inventory.filter((item) => exactProductMatch(item, code)));
    if (localMatches.length) return localMatches;

    // Az oldal szándékosan nem tölt be tízezres terméktörzset induláskor.
    // Ha a beolvasott termék nincs az első helyi csomagban, pontos keresést
    // kérünk a szervertől. Így a régi rendszerből áthozott 14k+ variáns is
    // ugyanúgy felismerhető, mint a raktár oldalon.
    const query = new URLSearchParams();
    query.set("search", code);
    query.set("limit", "100");
    query.set("includeZero", "1");
    query.set("_", String(Date.now()));
    const remote = await fetchJson<{ items?: InventoryItem[] }>(`/inventory?${query.toString()}`);
    const remoteItems = (remote.items || []).filter((item) =>
      String(item.variant_status || "active") !== "archived" &&
      String(item.model_status || "active") !== "archived"
    );

    if (remoteItems.length) {
      setInventory((current) => uniqueInventoryItems([...current, ...remoteItems]));
    }

    return uniqueInventoryItems(remoteItems.filter((item) => exactProductMatch(item, code)));
  }

  async function processScannedCode(code: string) {
    if (!scannerReady()) {
      setScanFeedback({
        tone: "error",
        text: draftType === "internal_transfer"
          ? "Előbb válaszd ki a forrás- és célhelyet. Utána a scanner automatikusan aktív."
          : "Előbb válaszd ki az érintett készlethelyet. Utána a scanner automatikusan aktív.",
      });
      setError(draftType === "internal_transfer"
        ? "Előbb válaszd ki a forrás- és célhelyet."
        : "Előbb válaszd ki a forráshelyet.");
      return;
    }

    setScanBusy(true);
    setScanFeedback({ tone: "info", text: `${code} azonosítása…` });
    try {
      const exact = await resolveScannedProducts(code);

      if (exact.length === 1) {
        const item = exact[0];
        const available = outgoingDraft ? availableAt(item.variant_id, sourceLocationId) : 999999;
        if (outgoingDraft && available <= 0) {
          setProductSearch(code);
          setError(`${productTitle(item)}: nincs szabad készlet a kiválasztott forráshelyen.`);
          setScanFeedback({ tone: "error", text: `${productTitle(item)} felismerve, de nincs szabad készlet a forráshelyen.` });
          return;
        }

        addDraftItem(item, 1);
        setScanFeedback({ tone: "success", text: `✓ ${productTitle(item)} • +1 db hozzáadva` });
        setMessage("");
        return;
      }

      if (exact.length > 1) {
        setProductSearch(code);
        setError("Több termék egyezik ezzel a kóddal. Válaszd ki a megfelelő variánst a találatokból.");
        setScanFeedback({ tone: "error", text: `Több pontos egyezés: ${code}.` });
        return;
      }

      setProductSearch(code);
      setError(`Nincs pontos találat erre a kódra: ${code}. A keresési találatokat megmutatom.`);
      setScanFeedback({ tone: "error", text: `Nem találom ezt a kódot: ${code}.` });
    } catch (scanError: any) {
      setError(scanError?.message || "A beolvasott termék azonosítása nem sikerült.");
      setScanFeedback({ tone: "error", text: scanError?.message || "A termék azonosítása nem sikerült." });
    } finally {
      setScanBusy(false);
    }
  }

  async function drainScanQueue() {
    if (scanQueueRunningRef.current) return;
    scanQueueRunningRef.current = true;
    try {
      while (scanQueueRef.current.length) {
        const next = scanQueueRef.current.shift() || "";
        if (!next) continue;
        await processScannedCode(next);
      }
    } finally {
      scanQueueRunningRef.current = false;
      focusScanInput();
    }
  }

  function handleScannedValue(raw: unknown) {
    const code = cleanScanCode(raw);
    if (!code) {
      focusScanInput();
      return;
    }
    setScanValue("");
    scanQueueRef.current.push(code);
    void drainScanQueue();
  }

  function scheduleAutomaticScan(rawValue: string) {
    setScanValue(rawValue);
    if (scanAutoTimerRef.current !== null) {
      window.clearTimeout(scanAutoTimerRef.current);
      scanAutoTimerRef.current = null;
    }

    const code = cleanScanCode(rawValue);
    if (!code || !scannerReady()) return;

    const localExact = uniqueInventoryItems(inventory.filter((item) => exactProductMatch(item, code)));
    const delay = localExact.length === 1 ? 45 : 170;
    scanAutoTimerRef.current = window.setTimeout(() => {
      scanAutoTimerRef.current = null;
      handleScannedValue(code);
    }, delay);
  }

  function submitScannerInput() {
    if (scanAutoTimerRef.current !== null) {
      window.clearTimeout(scanAutoTimerRef.current);
      scanAutoTimerRef.current = null;
    }
    handleScannedValue(scanValue);
  }


  function stopCamera() {
    if (cameraRafRef.current !== null) {
      window.cancelAnimationFrame(cameraRafRef.current);
      cameraRafRef.current = null;
    }
    try { zxingControlsRef.current?.stop?.(); } catch {}
    zxingControlsRef.current = null;
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks?.().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    if (!cameraOpen) {
      stopCamera();
      return;
    }
    let cancelled = false;
    cameraHandlingRef.current = false;

    const accept = (code: string) => {
      if (!code || cameraHandlingRef.current) return;
      cameraHandlingRef.current = true;
      stopCamera();
      setCameraOpen(false);
      handleScannedValue(code);
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraStatus("A böngésző nem ad kamerát. Az USB-s olvasó és a kézi mező továbbra is használható.");
          return;
        }
        const constraints: MediaStreamConstraints = { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
        const video = videoRef.current;
        if (!video) return;
        if (window.BarcodeDetector) {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
          cameraStreamRef.current = stream;
          video.srcObject = stream;
          await video.play();
          const detector = new window.BarcodeDetector({ formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39", "itf", "qr_code"] });
          setCameraStatus("Kamera aktív. Tartsd a vonalkódot a keretbe.");
          const frame = async () => {
            if (cancelled || cameraHandlingRef.current) return;
            try {
              const results = await detector.detect(video);
              const code = String(results.find((row) => row.rawValue)?.rawValue || "").trim();
              if (code) return accept(code);
            } catch {}
            cameraRafRef.current = window.requestAnimationFrame(frame);
          };
          cameraRafRef.current = window.requestAnimationFrame(frame);
          return;
        }

        setCameraStatus("ZXing olvasó betöltése...");
        const zxing = await loadZxing();
        const Reader = zxing?.BrowserMultiFormatReader;
        if (!Reader) {
          setCameraStatus("Az automatikus kameraolvasó nem érhető el. Használd az USB-s olvasót vagy a kézi mezőt.");
          return;
        }
        const reader = new Reader();
        const controls = await reader.decodeFromConstraints?.(constraints, video, (result) => {
          const code = String(result?.getText?.() || result?.text || "").trim();
          if (code) accept(code);
        });
        if (cancelled) { controls?.stop?.(); return; }
        zxingControlsRef.current = controls || null;
        setCameraStatus("Kamera aktív. Tartsd a vonalkódot a keretbe.");
      } catch (cameraError: any) {
        const name = String(cameraError?.name || "");
        setCameraStatus(
          name === "NotAllowedError"
            ? "A kameraengedély nincs megadva. Engedélyezd a böngészőben, vagy használd az USB-s olvasót."
            : cameraError?.message || "A kamera nem indítható el.",
        );
      }
    };
    void start();
    return () => { cancelled = true; stopCamera(); };
  }, [cameraOpen]);

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    return () => {
      if (scanAutoTimerRef.current !== null) {
        window.clearTimeout(scanAutoTimerRef.current);
        scanAutoTimerRef.current = null;
      }
      scanQueueRef.current = [];
    };
  }, []);

  function validateDraft() {
    if (!sourceLocationId && !draftLineArray.every((row) => row.fromLocationId)) return "A forráshely kötelező.";
    if (draftType === "internal_transfer" && !targetLocationId && !draftLineArray.every((row) => row.toLocationId)) return "A célhely kötelező.";
    if (draftType === "internal_transfer" && sourceLocationId && targetLocationId && sourceLocationId === targetLocationId) return "A forrás és a cél nem lehet ugyanaz.";
    if (draftType === "supplier_return" && !supplierId) return "A beszállító kötelező.";
    if (draftType !== "internal_transfer" && !reasonCode) return "A művelet oka kötelező.";
    if (reasonCode === "other" && !reasonText.trim()) return "Az Egyéb ok rövid leírása kötelező.";
    if (!draftLineArray.length) return "Legalább egy terméket adj a bizonylathoz.";
    for (const row of draftLineArray) {
      if (row.qty <= 0) return `${productTitle(row.item)}: érvénytelen mennyiség.`;
      const fromId = row.fromLocationId || sourceLocationId;
      const toId = row.toLocationId || targetLocationId;
      if (draftType === "internal_transfer" && (!fromId || !toId)) return `${productTitle(row.item)}: hiányzik a forrás vagy a cél.`;
      if (draftType === "internal_transfer" && fromId === toId) return `${productTitle(row.item)}: a forrás és a cél nem lehet ugyanaz.`;
      if (outgoingDraft && row.qty > maxDraftQty(row.item, fromId, row.originalQty)) return `${productTitle(row.item)}: nincs elég szabad készlet.`;
    }
    return "";
  }

  function stockDocumentPayload() {
    return {
      documentType: draftType,
      sourceLocationId: sourceLocationId || null,
      targetLocationId: draftType === "internal_transfer" ? targetLocationId || null : null,
      supplierId: draftType === "supplier_return" ? supplierId || null : null,
      receptionId: draftType === "supplier_return" ? receptionId || null : null,
      reasonCode: draftType === "internal_transfer" ? null : reasonCode || null,
      reasonText: draftType === "internal_transfer" ? null : reasonText.trim() || (reasonCode ? reasonLabel(draftType, reasonCode) : null),
      operationDirection: draftType === "stock_correction" ? correctionDirection : null,
      externalReference: externalReference.trim() || null,
      uitCode: draftType === "internal_transfer" ? normalizedUitCode(uitCode) || null : null,
      note: note.trim() || null,
      lines: draftLineArray.map((row) => ({
        variantId: row.item.variant_id,
        qty: row.qty,
        fromLocationId: row.fromLocationId || sourceLocationId || null,
        toLocationId: draftType === "internal_transfer" ? row.toLocationId || targetLocationId || null : null,
      })),
    };
  }

  async function saveDraftDocument(closeAfterSave = true) {
    if (editingDocumentStatus === "preparation") {
      const validation = validateDraft();
      if (validation) {
        setError(validation);
        return "";
      }
      setSavingDocument(true);
      setError("");
      setMessage("");
      try {
        const result = await fetchJson<{ documentId?: string; documentNumber?: string; totalQty?: number; totalValue?: number; restoredQty?: number; addedQty?: number }>(`/stock-transfer-documents/${encodeURIComponent(editingDraftId)}/preparation`, {
          method: "PUT",
          body: JSON.stringify(stockDocumentPayload()),
        });
        setEditingDraftNumber(String(result.documentNumber || editingDraftNumber || "Előkészítés"));
        setMessage(`${result.documentNumber || "Az előkészítés"} mentve. Visszaállítva: ${quantity(result.restoredQty || 0)} db, hozzáadva: ${quantity(result.addedQty || 0)} db.`);
        await Promise.all([loadList(), loadBaseData()]);
        if (closeAfterSave) {
          setCreateOpen(false);
          resetDraft(draftType);
        }
        return String(result.documentId || editingDraftId || "");
      } catch (saveError: any) {
        setError(saveError?.message || "Az előkészítés mentése nem sikerült.");
        return "";
      } finally {
        setSavingDocument(false);
      }
    }

    if (draftType === "damaged_writeoff") {
      const validation = validateDraft();
      if (validation) {
        setError(validation);
        return "";
      }
      setSavingDocument(true);
      setError("");
      setMessage("");
      try {
        const result = await fetchJson<{
          documentNumber?: string;
          documentId?: string;
          totalQty?: number;
          totalValue?: number;
        }>("/stock-documents/preparation", {
          method: "POST",
          body: JSON.stringify({
            ...stockDocumentPayload(),
            draftId: editingDocumentStatus === "draft" ? editingDraftId || null : null,
          }),
        });
        const nextId = String(result.documentId || "");
        setEditingDraftId(nextId);
        setEditingDraftNumber(String(result.documentNumber || "Előkészítés"));
        setEditingDocumentStatus("preparation");
        setMessage(`${result.documentNumber || "Az előkészítés"} mentve. A sérült termék készlete már kivezetésre került.`);
        await Promise.all([loadList(), loadBaseData()]);
        if (closeAfterSave) {
          setCreateOpen(false);
          resetDraft(draftType);
        }
        return nextId;
      } catch (saveError: any) {
        setError(saveError?.message || "A sérült termék előkészítésének mentése nem sikerült.");
        return "";
      } finally {
        setSavingDocument(false);
      }
    }

    setSavingDocument(true);
    setError("");
    setMessage("");
    try {
      const result = await fetchJson<{
        documentNumber?: string;
        documentId?: string;
        totalQty?: number;
        totalValue?: number;
      }>(editingDraftId ? `/stock-documents/${encodeURIComponent(editingDraftId)}/draft` : "/stock-documents/draft", {
        method: editingDraftId ? "PUT" : "POST",
        body: JSON.stringify(stockDocumentPayload()),
      });
      const nextId = String(result.documentId || editingDraftId || "");
      setEditingDraftId(nextId);
      setEditingDraftNumber(String(result.documentNumber || editingDraftNumber || "Előkészítés"));
      setEditingDocumentStatus("draft");
      setMessage(`${result.documentNumber || "Az előkészítés"} mentve. A készlet még nem változott.`);
      await loadList();
      if (closeAfterSave) {
        setCreateOpen(false);
        resetDraft(draftType);
      }
      return nextId;
    } catch (saveError: any) {
      setError(saveError?.message || "Az előkészítés mentése nem sikerült.");
      return "";
    } finally {
      setSavingDocument(false);
    }
  }

  async function closePreparationDocument() {
    const validation = validateDraft();
    if (validation) {
      setError(validation);
      return;
    }
    if (!editingDraftId || editingDocumentStatus !== "preparation") return;
    setSavingDocument(true);
    setError("");
    setMessage("");
    try {
      await fetchJson(`/stock-transfer-documents/${encodeURIComponent(editingDraftId)}/preparation`, {
        method: "PUT",
        body: JSON.stringify(stockDocumentPayload()),
      });
      const result = await fetchJson<{ document?: DocumentListItem }>(`/stock-transfer-documents/${encodeURIComponent(editingDraftId)}/close`, { method: "POST", body: "{}" });
      const closedId = editingDraftId;
      const number = result.document?.document_number || editingDraftNumber;
      setCreateOpen(false);
      resetDraft(draftType);
      setMessage(`${number || "A bizonylat"} lezárva. A következő tétel új előkészítést indít.`);
      await Promise.all([loadList(), loadBaseData(), loadSettings()]);
      if (closedId) await openDetailById(closedId);
    } catch (closeError: any) {
      setError(closeError?.message || "Az előkészítés lezárása nem sikerült.");
    } finally {
      setSavingDocument(false);
    }
  }

  async function saveDocument() {
    if (editingDocumentStatus === "preparation") {
      await closePreparationDocument();
      return;
    }
    const validation = validateDraft();
    if (validation) {
      setError(validation);
      return;
    }
    if (draftType === "damaged_writeoff") {
      setSavingDocument(true);
      setError("");
      setMessage("");
      try {
        const prepared = await fetchJson<{ documentId?: string; documentNumber?: string }>("/stock-documents/preparation", {
          method: "POST",
          body: JSON.stringify({
            ...stockDocumentPayload(),
            draftId: editingDocumentStatus === "draft" ? editingDraftId || null : null,
          }),
        });
        const preparedId = String(prepared.documentId || "");
        if (!preparedId) throw new Error("Az előkészítés azonosítója hiányzik.");
        await fetchJson(`/stock-transfer-documents/${encodeURIComponent(preparedId)}/close`, { method: "POST", body: "{}" });
        setCreateOpen(false);
        resetDraft(draftType);
        setMessage(`${prepared.documentNumber || "A sérülttermék-bizonylat"} lezárva. A készlet kivezetve marad.`);
        await Promise.all([loadList(), loadBaseData(), loadSettings()]);
        await openDetailById(preparedId);
      } catch (saveError: any) {
        setError(saveError?.message || "A sérülttermék-előkészítés lezárása nem sikerült.");
      } finally {
        setSavingDocument(false);
      }
      return;
    }
    setSavingDocument(true);
    setError("");
    setMessage("");
    const draftToDelete = editingDraftId;
    try {
      const key = createIdempotencyKey();
      const result = await fetchJson<{
        documentNumber?: string;
        documentId?: string;
        totalQty?: number;
        totalValue?: number;
        duplicate?: boolean;
      }>("/stock-documents", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify({ ...stockDocumentPayload(), idempotencyKey: key }),
      });
      if (draftToDelete) {
        try {
          await fetchJson<{ ok: boolean }>(`/stock-documents/${encodeURIComponent(draftToDelete)}/draft`, { method: "DELETE" });
        } catch (cleanupError) {
          console.error("A véglegesített előkészítés takarítása nem sikerült", cleanupError);
        }
      }
      setCreateOpen(false);
      resetDraft(draftType);
      setMessage(`${result.documentNumber || "A bizonylat"} véglegesítve: ${quantity(result.totalQty || 0)} db, ${moneyRon(result.totalValue || 0)}. A készlet és a mozgásnapló frissült.`);
      await Promise.all([loadList(), loadBaseData(), loadSettings()]);
      if (result.documentId) await openDetailById(result.documentId);
    } catch (saveError: any) {
      setError(saveError?.message || "A készletbizonylat véglegesítése nem sikerült.");
    } finally {
      setSavingDocument(false);
    }
  }

  async function closePreparationById(item: DocumentListItem) {
    setError("");
    try {
      await fetchJson(`/stock-transfer-documents/${encodeURIComponent(item.id)}/close`, { method: "POST", body: "{}" });
      setMessage(`${item.document_number} lezárva. A következő tétel új előkészítést indít.`);
      if (detail?.document.id === item.id) setDetail(null);
      await loadList();
    } catch (closeError: any) {
      setError(closeError?.message || "Az előkészítés lezárása nem sikerült.");
    }
  }

  async function reopenAsPreparation(item: DocumentListItem) {
    setError("");
    try {
      await fetchJson(`/stock-transfer-documents/${encodeURIComponent(item.id)}/reopen`, { method: "POST", body: "{}" });
      setMessage(`${displayDocumentNumber(item)} visszaállítva Előkészítésre. A következő tételek ismét ehhez a dokumentumhoz kerülnek.`);
      setDetail(null);
      await loadList();
      await openDraftForEdit(item.id);
    } catch (reopenError: any) {
      setError(reopenError?.message || "A bizonylat nem állítható vissza előkészítésre.");
    }
  }

  function applyTypeFilter(nextType: ArchiveFilter) {
    setType(nextType);
    setPageNo(1);
  }

  function applySearch() {
    setPageNo(1);
    setSearch(searchDraft.trim());
  }

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setFrom("");
    setTo("");
    setFromLocation("");
    setToLocation("");
    setType("all");
    setPageNo(1);
  }

  function openSettings(typeToOpen: DocumentType = "internal_transfer") {
    const row = settings?.[typeToOpen] || null;
    setSettingsType(typeToOpen);
    setSettingsDraft(row ? { ...row } : null);
    setSettingsOpen(true);
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setSettingsSaving(true);
    setError("");
    try {
      const result = await fetchJson<{ settings: StockDocumentSettings }>(`/stock-documents/settings/${settingsType}`, {
        method: "PUT",
        body: JSON.stringify({ settings: settingsDraft }),
      });
      setSettings((current) => ({ ...(current || {} as Record<DocumentType, StockDocumentSettings>), [settingsType]: result.settings }));
      setSettingsOpen(false);
      setMessage(`${documentMeta(settingsType).shortLabel} számozása mentve. Következő: ${result.settings.previewNumber}.`);
    } catch (saveError: any) {
      setError(saveError?.message || "A számozási beállítás mentése nem sikerült.");
    } finally {
      setSettingsSaving(false);
    }
  }

  function canRestoreStockOnDelete(item: DocumentListItem) {
    if (item.isLegacy || item.status === "legacy") return false;
    if (item.status === "draft") return false;
    const type = documentTypeOf(item);
    return ["internal_transfer", "damaged_writeoff"].includes(type)
      && ["preparation", "issued"].includes(String(item.status || ""));
  }

  function restoreDeleteUnavailableReason(item: DocumentListItem) {
    if (item.isLegacy || item.status === "legacy") return "Régi archív bizonylatnál a készlet automatikus visszaállítása nem biztonságos.";
    if (item.status === "draft") return "Ez az előkészítés még nem módosította a készletet.";
    if (!["internal_transfer", "damaged_writeoff"].includes(documentTypeOf(item))) {
      return "Ennél a bizonylattípusnál nincs biztonságos automatikus készlet-visszaállítás.";
    }
    return "A készlet automatikus visszaállítása ennél a bizonylatnál nem érhető el.";
  }

  async function confirmDelete(mode: DeleteMode) {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    const number = displayDocumentNumber(target);
    setDeleting(true);
    setDeletingMode(mode);
    setError("");
    try {
      if (mode === "restore_stock") {
        if (!canRestoreStockOnDelete(target)) {
          throw new Error(restoreDeleteUnavailableReason(target));
        }

        if (target.status === "issued") {
          await fetchJson(`/stock-transfer-documents/${encodeURIComponent(target.id)}/reopen`, {
            method: "POST",
            body: "{}",
          });
        }

        const result = await fetchJson<{ ok: boolean; restoredQty?: number }>(
          `/stock-transfer-documents/${encodeURIComponent(target.id)}/preparation`,
          { method: "DELETE" },
        );
        notifyStockMovesChanged();
        if (detail?.document.id === target.id) setDetail(null);
        setDeleteTarget(null);
        setMessage(`${number} törölve. A bizonylat készletmozgása vissza lett fordítva, visszaállított mennyiség: ${quantity(result.restoredQty || target.total_qty || 0)} db.`);
        await Promise.all([loadList(), loadBaseData()]);
        return;
      }

      if (target.status === "draft") {
        await fetchJson<{ ok: boolean }>(
          `/stock-documents/${encodeURIComponent(target.id)}/draft`,
          { method: "DELETE" },
        );
      } else if (target.status === "preparation") {
        /*
          A végleges törlésnél a készlethez nem nyúlunk. A backend a nyitott
          előkészítést csak készlet-visszaállítással engedné törölni, ezért
          előbb lezárjuk, majd az archívumból végleg eltávolítjuk. Emberi
          nyelven: a papír megy, a készlet marad. Végre egyértelműen.
        */
        if (n(target.total_qty) > 0) {
          await fetchJson(`/stock-transfer-documents/${encodeURIComponent(target.id)}/close`, {
            method: "POST",
            body: "{}",
          });
          await fetchJson<{ ok: boolean }>(
            `/stock-transfer-documents/${encodeURIComponent(target.id)}`,
            { method: "DELETE" },
          );
        } else {
          await fetchJson<{ ok: boolean }>(
            `/stock-transfer-documents/${encodeURIComponent(target.id)}/preparation`,
            { method: "DELETE" },
          );
        }
      } else {
        await fetchJson<{ ok: boolean }>(
          `/stock-transfer-documents/${encodeURIComponent(target.id)}`,
          { method: "DELETE" },
        );
      }

      if (detail?.document.id === target.id) setDetail(null);
      setDeleteTarget(null);
      setMessage(`${number} véglegesen törölve. A raktárkészlet változatlan maradt.`);
      await loadList();
    } catch (deleteError: any) {
      setError(deleteError?.message || "A bizonylat törlése nem sikerült.");
    } finally {
      setDeleting(false);
      setDeletingMode(null);
    }
  }


  async function saveDetailUitCode() {
    if (!detail?.document?.id || detailUitSaving) return;
    setDetailUitSaving(true);
    setDetailUitError("");
    try {
      const result = await fetchJson<{ document?: DocumentListItem; item?: DocumentListItem }>(
        `/stock-transfer-documents/${encodeURIComponent(detail.document.id)}/uit`,
        {
          method: "PUT",
          body: JSON.stringify({ uitCode: normalizedUitCode(detailUitCode) || null }),
        },
      );
      const updatedDocument = result.document || result.item;
      if (!updatedDocument) throw new Error("Az UIT kód mentése után nem érkezett vissza a bizonylat.");
      setDetail((current) => current ? { ...current, document: { ...current.document, ...updatedDocument } } : current);
      setItems((current) => current.map((item) => item.id === updatedDocument.id ? { ...item, ...updatedDocument } : item));
      setDetailUitCode(documentUitCode(updatedDocument));
      setMessage(documentUitCode(updatedDocument) ? `UIT kód mentve: ${documentUitCode(updatedDocument)}.` : "Az UIT kód törölve.");
    } catch (saveError: any) {
      setDetailUitError(saveError?.message || "Az UIT kód mentése nem sikerült.");
    } finally {
      setDetailUitSaving(false);
    }
  }

  const activeFilterCount = useMemo(
    () => [search, from, to, fromLocation, toLocation, type !== "all" ? type : ""].filter(Boolean).length,
    [from, fromLocation, search, to, toLocation, type],
  );

  const detailValue = useMemo(() => detailTotalValue(detail?.lines || []), [detail]);
  const detailMissingPrices = useMemo(() => (detail?.lines || []).filter((line) => lineUnitPrice(line) === null).length, [detail]);

  function documentActionButtons(item: DocumentListItem, compact = false) {
    const isPreparation = item.status === "preparation";
    const isDraft = item.status === "draft";
    const canReopen = item.status === "issued" && ["internal_transfer", "damaged_writeoff"].includes(documentTypeOf(item));
    return (
      <div className="flex justify-end gap-1">
        <button type="button" className={rowBtnSoft} onClick={() => void openDetailById(item.id)}>{compact ? null : <PackageCheck size={13} />} Részletek</button>
        {(isPreparation || isDraft) ? <button type="button" className={rowPrimaryBtn} onClick={() => void openDraftForEdit(item)}><Edit3 size={13} /> {compact ? "Szerk." : "Szerkesztés"}</button> : null}
        {isPreparation ? <button type="button" className={rowPrimaryBtn} onClick={() => void closePreparationById(item)} title="Előkészítés lezárása"><CheckCircle2 size={13} /> {compact ? "Lezár" : "Lezárás"}</button> : null}
        {!isPreparation && !isDraft ? <button type="button" className={rowIconBtn} onClick={async () => { const current = detail?.document.id === item.id ? detail : await fetchJson<DocumentDetail>(`/stock-transfer-documents/${encodeURIComponent(item.id)}`); printDetail(current, inventory); }} title="PDF / nyomtatás"><Printer size={14} /></button> : null}
        {canReopen ? <button type="button" className={rowIconBtn} onClick={() => void reopenAsPreparation(item)} title="Visszaállítás Előkészítésre"><RotateCcw size={14} /></button> : null}
        <button type="button" className={rowDangerIconBtn} onClick={() => setDeleteTarget(item)} title="Törlés"><Trash2 size={14} /></button>
      </div>
    );
  }

  return (
    <div className={page}>
      <div className={shell}>
        <header className="sticky top-2 z-40 rounded-2xl border border-white/20 bg-[#303a4c]/96 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[280px] items-center gap-3 border-l-4 border-[#7bd7d4]/70 pl-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]"><FileText size={20} /></span>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">AllInFashion</p>
                <h1 className="mt-0.5 text-xl leading-tight">Készletbizonylatok</h1>
                <p className="mt-0.5 text-[11px] text-white/48">Aviz, retur, sérült termék és készletkorrekció • minden átadási irány külön PV-ben</p>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              {settings?.internal_transfer ? <span className="hidden rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 px-2.5 py-1 text-[10px] text-[#cffffd]/78 md:inline">Következő: {settings.internal_transfer.previewNumber}</span> : null}
              <button type="button" className={primaryBtn} onClick={() => openCreate("internal_transfer")}><Plus size={15} /> Új bizonylat</button>
              <button type="button" className={iconBtn} onClick={() => openSettings("internal_transfer")} title="Admin beállítások" aria-label="Admin beállítások"><Settings size={16} /></button>
              <button type="button" className={btnSoft} onClick={() => void loadList()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Frissítés</button>
              <button type="button" className={btn} onClick={goHome}><Home size={15} /> Kezdőlap</button>
            </div>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-rose-200/25 bg-rose-500/12 px-4 py-3 text-sm text-rose-50">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#174c55]/72 px-4 py-3 text-sm text-cyan-50">{message}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <SummaryCard labelText="Összes bizonylat" value={quantity(totals.all ?? totals.total)} hint="Kattints a teljes listához" active={type === "all"} onClick={() => applyTypeFilter("all")} />
          <SummaryCard labelText="Előkészítés" value={quantity((totals.preparation || 0))} hint="Nyitott, még szerkeszthető dokumentumok" tone="red" active={type === "preparation"} onClick={() => applyTypeFilter("preparation")} />
          <SummaryCard labelText="Belső átadás" value={quantity(totals.internalTransfer ?? totals.official)} hint="Aviz / proces-verbal" tone="green" active={type === "internal_transfer"} onClick={() => applyTypeFilter("internal_transfer")} />
          <SummaryCard labelText="Beszállítói retur" value={quantity(totals.supplierReturn || 0)} hint="Készletből kivezetve" tone="blue" active={type === "supplier_return"} onClick={() => applyTypeFilter("supplier_return")} />
          <SummaryCard labelText="Sérült termék" value={quantity(totals.damagedWriteoff || 0)} hint="Scoatere din gestiune" tone="red" active={type === "damaged_writeoff"} onClick={() => applyTypeFilter("damaged_writeoff")} />
          <SummaryCard labelText="Korrekció" value={quantity(totals.stockCorrection || 0)} hint="Indokolt plusz / mínusz" tone="amber" active={type === "stock_correction"} onClick={() => applyTypeFilter("stock_correction")} />
          <SummaryCard labelText="Összérték" value={moneyRon(totals.totalValue || 0)} hint={`${quantity(totals.totalQty)} db összesen`} tone="green" />
        </div>

        <section className={panel}>
          <div className={panelHead}>
            <div><p className="text-[10px] uppercase tracking-[0.17em] text-white/40">Szűrés és keresés</p><h2 className="mt-1 flex items-center gap-2 text-base"><SlidersHorizontal size={17} /> Bizonylatok gyors visszakeresése</h2></div>
            {activeFilterCount ? <span className="rounded-full border border-amber-200/25 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-50">{activeFilterCount} aktív szűrő</span> : null}
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-4 xl:grid-cols-7">
            <label className={`${label} lg:col-span-2 xl:col-span-2`}>Keresés<div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/38" /><input className={`${input} pl-9`} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }} placeholder="Bizonylatszám, termék, vonalkód, beszállító..." /></div></label>
            <label className={label}>Ettől<input className={input} type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPageNo(1); }} /></label>
            <label className={label}>Eddig<input className={input} type="date" value={to} onChange={(event) => { setTo(event.target.value); setPageNo(1); }} /></label>
            <label className={label}>Forrás<CompactSelect value={fromLocation} onChange={(next) => { setFromLocation(next); setPageNo(1); }} placeholder="Minden forrás" options={[{ value: "", label: "Minden forrás" }, ...locations.map((location) => ({ value: location.id, label: location.name }))]} /></label>
            <label className={label}>Cél / partner<CompactSelect value={toLocation} onChange={(next) => { setToLocation(next); setPageNo(1); }} placeholder="Minden célhely / partner" options={[{ value: "", label: "Minden célhely / partner" }, ...locations.map((location) => ({ value: `location:${location.id}`, label: location.name, group: "Készlethelyek" })), ...suppliers.map((supplier) => ({ value: `supplier:${supplier.id}`, label: supplier.name, group: "Beszállítók" }))]} /></label>
            <label className={label}>Típus<CompactSelect value={type} onChange={(next) => { setType(next as ArchiveFilter); setPageNo(1); }} options={[{ value: "all", label: "Minden bizonylat" }, { value: "preparation", label: "Előkészítés" }, { value: "internal_transfer", label: "Belső átadás" }, { value: "supplier_return", label: "Beszállítói retur" }, { value: "damaged_writeoff", label: "Sérült / kivezetés" }, { value: "stock_correction", label: "Készletkorrekció" }, { value: "legacy", label: "Régi archívum" }, { value: "cancelled", label: "Sztornózott" }]} /></label>
            <div className="flex items-end gap-2 lg:col-span-4 xl:col-span-7"><button type="button" className={primaryBtn} onClick={applySearch}><Search size={15} /> Keresés</button><button type="button" className={btnSoft} onClick={clearFilters}><X size={15} /> Szűrők törlése</button></div>
          </div>
        </section>

        <section className={panel}>
          <div className={panelHead}>
            <div><p className="text-[10px] uppercase tracking-[0.17em] text-white/40">Bizonylati archívum</p><h2 className="mt-1 flex items-center gap-2 text-base"><FileText size={17} /> Hivatalos készletbizonylatok és előzmények</h2></div>
            <div className="flex items-center gap-2 text-xs text-white/55"><span>{quantity(totals.total)} találat</span><CompactSelect className="w-[112px]" value={String(limit)} onChange={(next) => { setLimit(Number(next)); setPageNo(1); }} options={[{ value: "30", label: "30 / oldal" }, { value: "50", label: "50 / oldal" }, { value: "100", label: "100 / oldal" }]} /></div>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1260px] border-collapse text-sm">
              <thead className="bg-[#293448] text-[9px] font-normal uppercase tracking-[0.08em] text-white/60"><tr><th className="px-3 py-2.5 text-left font-normal">Bizonylat</th><th className="px-3 py-2.5 text-left font-normal">Típus</th><th className="px-3 py-2.5 text-left font-normal">Dátum</th><th className="px-3 py-2.5 text-left font-normal">Útvonal / partner</th><th className="px-3 py-2.5 text-center font-normal">Sor / db / érték</th><th className="px-3 py-2.5 text-left font-normal">Rögzítette</th><th className="px-3 py-2.5 text-right font-normal">Művelet</th></tr></thead>
              <tbody>
                {items.map((item) => {
                  const badge = documentBadge(item);
                  const BadgeIcon = badge.icon;
                  const typeMeta = documentMeta(documentTypeOf(item));
                  const TypeIcon = typeMeta.icon;
                  const itemUitCode = documentUitCode(item);
                  const itemNeedsUit = !item.isLegacy && item.status !== "legacy" && internalTransferNeedsUit(documentTypeOf(item), item.total_value);
                  return (
                    <tr key={item.id} className="border-t border-white/10 align-middle text-[12px] leading-tight transition hover:bg-white/[0.035]">
                      <td className="px-3 py-2"><div className="flex items-center gap-2"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06]"><FileText size={16} /></span><div className="min-w-0"><p className="max-w-[190px] truncate text-[13px] font-normal text-white" title={displayDocumentNumber(item)}>{displayDocumentNumber(item)}</p><div className="mt-0.5 flex flex-wrap gap-1"><span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] ${badge.cls}`}><BadgeIcon size={10} /> {badge.label}</span>{itemNeedsUit && !itemUitCode ? <span className="inline-flex items-center gap-1 rounded-full border border-red-300/75 bg-red-600 px-1.5 py-0.5 text-[9px] text-white shadow-[0_0_18px_rgba(220,38,38,.34)]"><AlertTriangle size={10} /> UIT szükséges</span> : itemUitCode ? <span className="inline-flex items-center gap-1 rounded-full border border-[#7bd7d4]/45 bg-[#2a8d8b] px-1.5 py-0.5 text-[9px] text-white"><CheckCircle2 size={10} /> UIT rögzítve</span> : null}</div></div></div></td>
                      <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${typeMeta.tone}`}><TypeIcon size={12} /> {typeMeta.shortLabel}</span></td>
                      <td className="px-3 py-2 text-[11px] text-white/72">{dateTime(item.created_at)}</td>
                      <td className="px-3 py-2"><div className="grid gap-0.5"><span className="inline-flex items-center gap-1 text-[11px] text-red-100"><ArrowUpRight size={12} className="text-red-500" /> <span className="text-red-300">Kimenő:</span> {item.from_location_summary || "-"}</span><span className="inline-flex items-center gap-1 text-[11px] text-[#d7fffd]"><ArrowDownLeft size={12} className="text-[#2dd4bf]" /> <span className="text-[#7bd7d4]">Bejövő:</span> {item.supplier_name || item.to_location_summary || reasonLabel(documentTypeOf(item), item.reason_code, item.reason_text)}</span>{item.external_reference ? <span className="text-[9px] text-white/42">Hivatkozás: {item.external_reference}</span> : null}</div></td>
                      <td className="px-3 py-2 text-center"><span className="inline-flex flex-col rounded-lg border border-[#7bd7d4]/26 bg-[#2a8d8b]/13 px-2 py-1 text-[11px] text-[#d7fffd]"><span>{quantity(item.line_count)} sor • {quantity(item.total_qty)} db</span><span className="mt-0.5 text-[9px] text-white/58">{moneyRon(item.total_value || 0)}</span></span></td>
                      <td className="px-3 py-2 text-[11px] text-white/65">{item.actor || "-"}</td>
                      <td className="px-3 py-2">{documentActionButtons(item)}</td>
                    </tr>
                  );
                })}
                {!items.length && !loading ? <tr><td colSpan={7} className="px-4 py-14 text-center text-white/45">Nincs találat a megadott szűrésre.</td></tr> : null}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-3 lg:hidden">
            {items.map((item) => {
              const badge = documentBadge(item);
              const BadgeIcon = badge.icon;
              const meta = documentMeta(documentTypeOf(item));
              const TypeIcon = meta.icon;
              const itemUitCode = documentUitCode(item);
              const itemNeedsUit = !item.isLegacy && item.status !== "legacy" && internalTransferNeedsUit(documentTypeOf(item), item.total_value);
              return (
                <article key={item.id} className="rounded-2xl border border-white/12 bg-white/[0.05] p-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-base text-white">{displayDocumentNumber(item)}</p><p className="mt-1 text-xs text-white/48">{dateTime(item.created_at)}</p></div><div className="flex flex-col items-end gap-1"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${badge.cls}`}><BadgeIcon size={11} /> {badge.label}</span>{itemNeedsUit && !itemUitCode ? <span className="inline-flex items-center gap-1 rounded-full border border-red-300/75 bg-red-600 px-2 py-1 text-[10px] text-white shadow-[0_0_18px_rgba(220,38,38,.34)]"><AlertTriangle size={11} /> UIT szükséges</span> : itemUitCode ? <span className="inline-flex items-center gap-1 rounded-full border border-[#7bd7d4]/45 bg-[#2a8d8b] px-2 py-1 text-[10px] text-white"><CheckCircle2 size={11} /> UIT rögzítve</span> : null}</div></div>
                  <div className="mt-3 flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${meta.tone}`}><TypeIcon size={13} /> {meta.shortLabel}</span><span className="text-xs text-[#d7fffd]">{quantity(item.total_qty)} db • {moneyRon(item.total_value || 0)}</span></div>
                  <div className="mt-3 grid gap-2 text-xs"><div className="rounded-xl border border-red-400/30 bg-red-950/30 px-3 py-2"><span className="inline-flex items-center gap-1 text-red-300"><ArrowUpRight size={12} /> Kimenő / forrás</span><p className="mt-0.5 text-red-50">{item.from_location_summary || "-"}</p></div><div className="rounded-xl border border-[#7bd7d4]/30 bg-[#174c55]/40 px-3 py-2"><span className="inline-flex items-center gap-1 text-[#7bd7d4]"><ArrowDownLeft size={12} /> Bejövő / cél</span><p className="mt-0.5 text-[#d7fffd]">{item.supplier_name || item.to_location_summary || reasonLabel(documentTypeOf(item), item.reason_code, item.reason_text)}</p></div></div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3"><span className="text-xs text-white/50">{item.actor || "-"}</span>{documentActionButtons(item, true)}</div>
                </article>
              );
            })}
            {!items.length && !loading ? <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-8 text-center text-sm text-white/45">Nincs találat.</div> : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 bg-[#303a4c] px-4 py-3">
            <span className="text-xs text-white/45">Oldal {pageNo} / {pages}</span>
            <div className="flex items-center gap-2"><button type="button" className={btnSoft} disabled={pageNo <= 1 || loading} onClick={() => setPageNo((current) => Math.max(1, current - 1))}><ChevronLeft size={15} /> Előző</button><span className="rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/72">{pageNo} / {pages}</span><button type="button" className={btnSoft} disabled={pageNo >= pages || loading} onClick={() => setPageNo((current) => Math.min(pages, current + 1))}>Következő <ChevronRight size={15} /></button></div>
          </div>
        </section>
      </div>

      {detailLoading ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 backdrop-blur-sm"><div className="rounded-2xl border border-white/18 bg-[#303a4c] px-5 py-4 text-sm text-white shadow-2xl"><RefreshCw size={16} className="mr-2 inline animate-spin" /> Bizonylat betöltése...</div></div> : null}

      {detail ? (() => {
        const doc = detail.document;
        const meta = documentMeta(documentTypeOf(doc));
        const TypeIcon = meta.icon;
        const routeRows = detail.lines.map((line) => ({
          from: lineLocationName(line, "from", locations),
          to: lineLocationName(line, "to", locations),
        }));
        const uniqueFrom = Array.from(new Set(routeRows.map((row) => row.from).filter((value) => value && value !== "-")));
        const uniqueTo = Array.from(new Set(routeRows.map((row) => row.to).filter((value) => value && value !== "-")));
        const detailFromSummary = uniqueFrom.length === 1
          ? uniqueFrom[0]
          : uniqueFrom.length > 1
            ? "Több forráshely • lásd a terméksorokat"
            : doc.from_location_summary || "-";
        const detailToSummary = uniqueTo.length === 1
          ? uniqueTo[0]
          : uniqueTo.length > 1
            ? "Több célhely • lásd a terméksorokat"
            : doc.supplier_name || doc.to_location_summary || "-";
        const flow = documentFlowGroups(detail, locations);
        const indexedDetailLines = detail.lines.map((line, index) => ({ line, index }));
        const directionalSections = documentTypeOf(doc) === "internal_transfer"
          ? [
              { key: "incoming", title: "Bejövő termékek", subtitle: `Célhely: ${flow.focusLocationName}`, tone: "incoming" as const, rows: flow.incoming },
              { key: "outgoing", title: "Kimenő termékek", subtitle: `Forráshely: ${flow.focusLocationName}`, tone: "outgoing" as const, rows: flow.outgoing },
              { key: "other", title: "Egyéb útvonalak", subtitle: "A fő célhelyhez közvetlenül nem tartozó mozgások", tone: "neutral" as const, rows: flow.other },
            ].filter((section) => section.rows.length)
          : [
              {
                key: "all",
                title: documentTypeOf(doc) === "damaged_writeoff" ? "Kivezetett termékek" : "Bizonylat terméksorai",
                subtitle: meta.label,
                tone: documentTypeOf(doc) === "damaged_writeoff" || documentTypeOf(doc) === "supplier_return" ? "outgoing" as const : "neutral" as const,
                rows: indexedDetailLines,
              },
            ];
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setDetail(null); }}>
            <div className="flex max-h-[95vh] w-full max-w-[1420px] flex-col overflow-hidden rounded-[26px] border border-white/16 bg-[#414b5b] shadow-[0_34px_100px_rgba(2,6,23,.52)]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#233044] via-[#2d3a4d] to-[#31525a] px-4 py-3.5">
                <div className="flex min-w-0 items-start gap-3"><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><TypeIcon size={21} /></span><div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">{doc.status === "preparation" || doc.status === "draft" ? "Készletbizonylat előkészítése" : "Készletbizonylat részletei"}</p><h2 className="mt-0.5 truncate text-[22px]">{doc.status === "draft" ? meta.shortLabel : displayDocumentNumber(doc)}</h2><p className="mt-1 truncate text-xs text-white/58">{doc.status === "draft" ? `Azonosító: ${displayDocumentNumber(doc)} • ${doc.subtitle || meta.label}` : `${meta.label} • ${doc.subtitle || "-"}`}</p></div></div>
                <div className="flex flex-wrap gap-2">{doc.status === "preparation" ? <><button type="button" className={primaryBtn} onClick={() => void openDraftForEdit(doc)}><Edit3 size={15} /> Előkészítés folytatása</button><button type="button" className={primaryBtn} onClick={() => void closePreparationById(doc)}><CheckCircle2 size={15} /> Lezárás</button></> : doc.status === "draft" ? <button type="button" className={primaryBtn} onClick={() => void openDraftForEdit(doc)}><Edit3 size={15} /> Előkészítés folytatása</button> : <><button type="button" className={primaryBtn} onClick={() => printDetail(detail, inventory)}><Printer size={15} /> PDF / nyomtatás</button>{["internal_transfer", "damaged_writeoff"].includes(documentTypeOf(doc)) ? <button type="button" className={btnSoft} onClick={() => void reopenAsPreparation(doc)}><RotateCcw size={15} /> Előkészítésre</button> : null}</>}<button type="button" className={dangerBtn} onClick={() => setDeleteTarget(doc)}><Trash2 size={15} /> Törlés</button><button type="button" className={btn} onClick={() => setDetail(null)}><X size={15} /> Bezárás</button></div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3.5">
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="min-w-0 rounded-2xl border border-white/11 bg-[#354052] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
                    <div className="flex items-center justify-between gap-2"><p className="text-[9px] uppercase tracking-[0.14em] text-white/38">{doc.status === "draft" ? "Előkészítési azonosító" : "Bizonylatszám"}</p>{doc.status === "preparation" || doc.status === "draft" ? <span className="rounded-full border border-red-300/25 bg-red-500/12 px-2 py-0.5 text-[9px] text-red-100">Előkészítés</span> : <span className="rounded-full border border-[#5eead4]/22 bg-[#2dd4bf]/10 px-2 py-0.5 text-[9px] text-[#ccfbf1]">Hivatalos</span>}</div>
                    <p className="mt-2 truncate text-[15px] text-white" title={displayDocumentNumber(doc)}>{displayDocumentNumber(doc)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/11 bg-[#354052] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-white/38">{doc.status === "draft" || doc.status === "preparation" ? "Utoljára mentve" : "Kibocsátva"}</p>
                    <p className="mt-2 truncate text-sm text-white/88">{dateTime(doc.updated_at || doc.created_at)}</p>
                  </div>
                  <div className="rounded-2xl border border-[#5eead4]/16 bg-[#2a8d8b]/[0.08] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-[#99f6e4]/55">Típus / rögzítette</p>
                    <p className="mt-2 truncate text-sm text-[#d7fffd]">{meta.shortLabel}</p><p className="mt-0.5 truncate text-[10px] text-white/42">{doc.actor || "-"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/11 bg-[#354052] px-3.5 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-white/38">Tartalom</p>
                    <p className="mt-2 text-[18px] text-white">{quantity(doc.total_qty)} <span className="text-[10px] text-white/42">db</span></p><p className="mt-0.5 text-[10px] text-white/42">{detail.lines.length} terméksor</p>
                  </div>
                  <div className="rounded-2xl border border-[#5eead4]/20 bg-gradient-to-br from-[#214e54] to-[#2c3c4c] px-3.5 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-[#99f6e4]/55">Bizonylat értéke</p>
                    <p className="mt-2 text-[18px] text-white">{moneyRon(detailValue)}</p>{detailMissingPrices ? <p className="mt-0.5 text-[9px] text-amber-100/65">{detailMissingPrices} sor ár nélkül</p> : <p className="mt-0.5 text-[9px] text-white/35">RON összérték</p>}
                  </div>
                </div>
                {documentTypeOf(doc) === "internal_transfer" && !doc.isLegacy && doc.status !== "legacy" ? <div className={`mt-3 rounded-2xl border-2 px-4 py-3 shadow-[0_10px_28px_rgba(0,0,0,.12)] ${internalTransferNeedsUit(documentTypeOf(doc), detailValue) && !documentUitCode(doc) ? "border-red-300/75 bg-red-600/24" : "border-[#7bd7d4]/45 bg-[#174c55]/60"}`}><div className="flex flex-wrap items-end gap-3"><div className="flex min-w-[250px] flex-1 items-start gap-3"><AlertTriangle size={20} className={`mt-0.5 shrink-0 ${internalTransferNeedsUit(documentTypeOf(doc), detailValue) && !documentUitCode(doc) ? "text-red-300" : "text-[#7bd7d4]"}`} /><div><p className="text-sm text-white">{internalTransferNeedsUit(documentTypeOf(doc), detailValue) && !documentUitCode(doc) ? "UIT kód szükséges" : documentUitCode(doc) ? "UIT kód rögzítve" : "UIT kód"}</p><p className="mt-1 text-xs leading-relaxed text-white/65">{internalTransferNeedsUit(documentTypeOf(doc), detailValue) ? `Az átadás értéke meghaladja a 10.000 RON-t (${moneyRon(detailValue)}). A szállítás előtt rögzítsétek az UIT kódot.` : "Ehhez az átadáshoz szükség esetén itt rögzíthető az UIT kód."}</p></div></div><label className="grid min-w-[260px] flex-1 gap-1 text-xs text-white/70">UIT kód<input className={`${input} ${internalTransferNeedsUit(documentTypeOf(doc), detailValue) && !detailUitCode ? "border-red-300/80 bg-red-950/30" : ""}`} value={detailUitCode} onChange={(event) => setDetailUitCode(normalizedUitCode(event.target.value))} placeholder="Írd be az UIT kódot" /></label><button type="button" className={primaryBtn} onClick={() => void saveDetailUitCode()} disabled={detailUitSaving}>{detailUitSaving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />} {detailUitSaving ? "Mentés..." : "UIT mentése"}</button></div>{detailUitError ? <p className="mt-2 text-xs text-red-100">{detailUitError}</p> : null}</div> : null}
                {(doc.reason_code || doc.reason_text || doc.external_reference || doc.note) ? <div className="mt-3 grid gap-2 md:grid-cols-3"><div className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Ok</p><p className="mt-1 text-xs text-white/78">{reasonLabel(documentTypeOf(doc), doc.reason_code, doc.reason_text)}</p></div><div className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Hivatkozás</p><p className="mt-1 text-xs text-white/78">{doc.external_reference || "-"}</p></div><div className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Megjegyzés</p><p className="mt-1 text-xs text-white/78">{doc.note || "-"}</p></div></div> : null}

                <div className="mt-3 space-y-3">
                  {documentTypeOf(doc) === "internal_transfer" ? (
                    <DocumentFlowOverview flow={flow} totalQty={n(doc.total_qty)} totalValue={detailValue} />
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[20px] border border-white/12 bg-[#313c4e] px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,.14)]">
                      <div><p className="text-[9px] uppercase tracking-[0.16em] text-white/38">Bizonylat tartalma</p><p className="mt-1 text-sm text-white/82">{meta.shortLabel}</p></div>
                      <div className="flex gap-2 text-[10px]"><span className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-white/60">{detail.lines.length} sor · {quantity(doc.total_qty)} db</span><span className="rounded-full border border-[#5eead4]/20 bg-[#2dd4bf]/10 px-2.5 py-1 text-[#ccfbf1]">{moneyRon(detailValue)}</span></div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 px-1 pt-1">
                    <span className="h-px flex-1 bg-white/10" />
                    <span className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-white/36"><Boxes size={13} /> Részletes terméksorok</span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  {directionalSections.map((section) => (
                    <DocumentFlowSection
                      key={section.key}
                      title={section.title}
                      subtitle={section.subtitle}
                      tone={section.tone}
                      rows={section.rows}
                      locations={locations}
                    />
                  ))}

                  {directionalSections.length > 1 ? (
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-5 rounded-2xl border border-white/12 bg-[#303b4c] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-white/38">Dokumentum összesen</span>
                      <span className="text-sm text-[#ccfbf1]">{quantity(doc.total_qty)} db</span>
                      <span className="text-sm text-white">{moneyRon(detailValue)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/12 bg-[#303a4c] px-4 py-3 text-[11px] text-white/45"><span>{doc.status === "preparation" ? (documentTypeOf(doc) === "damaged_writeoff" ? "ESC: bezárás • a sérült termék készlete már kivezetve" : "ESC: bezárás • a készlet már a sorok szerint át van mozgatva") : doc.status === "draft" ? "ESC: bezárás • az előkészítés még nem módosította a készletet" : "ESC: bezárás • a PDF román nyelvű hivatalos formátum"}</span><button type="button" className={btnSoft} onClick={() => setDetail(null)}><X size={14} /> Bezárás</button></div>
            </div>
          </div>
        );
      })() : null}

      {createOpen ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/75 p-2 backdrop-blur-sm lg:items-center lg:p-4" onMouseDown={(event) => { if (event.currentTarget === event.target && !savingDocument) setCreateOpen(false); }}>
          <div className="flex max-h-[96vh] w-full max-w-[1460px] flex-col overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#263246] via-[#334154] to-[#2a8d8b]/55 px-4 py-3.5">
              <div className="flex min-w-0 items-start gap-3"><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><PackagePlus size={21} /></span><div><p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">{editingDocumentStatus === "preparation" || editingDraftId ? "Előkészítés szerkesztése" : "Új készletbizonylat"}</p><h2 className="mt-0.5 text-[22px]">{documentMeta(draftType).label}</h2><p className="mt-1 text-xs text-white/58">{editingDocumentStatus === "preparation" ? `${editingDraftNumber} • a készlet már módosult; mentéskor csak a különbözet rendeződik` : editingDraftId ? `${editingDraftNumber} • a készlet a lezáráskor módosul` : "Vonalkódos termékfelvétel, előkészítés és hivatalos lezárás"}</p></div></div>
              <div className="flex gap-2"><button type="button" className={btn} onClick={() => setCreateOpen(false)} disabled={savingDocument}><X size={15} /> Bezárás</button></div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3.5">
              {error ? <div className="mb-3 rounded-xl border border-rose-200/25 bg-rose-500/12 px-3 py-2 text-sm text-rose-50">{error}</div> : null}
              {baseLoading ? <div className="mb-3 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-white/55"><RefreshCw size={15} className="mr-2 inline animate-spin" /> Törzsadatok és készlet betöltése...</div> : null}

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {DOCUMENT_TYPES.map((row) => {
                  const Icon = row.icon;
                  const active = draftType === row.type;
                  return <button key={row.type} type="button" onClick={() => changeDraftType(row.type)} disabled={editingDocumentStatus === "preparation"} className={`rounded-2xl border p-3 text-left transition ${active ? "border-[#7bd7d4]/65 bg-[#2a8d8b]/24 shadow-[0_0_0_1px_rgba(123,215,212,.12)]" : "border-white/12 bg-white/[0.05] hover:bg-white/[0.08]"} ${editingDocumentStatus === "preparation" && !active ? "opacity-35" : ""}`}><div className="flex items-center gap-3"><span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${row.tone}`}><Icon size={19} /></span><span><span className="block text-sm text-white">{row.label}</span><span className="mt-0.5 block text-[10px] leading-snug text-white/45">{row.subtitle}</span></span></div></button>;
                })}
              </div>

              <div className="mt-3 grid gap-3 rounded-2xl border border-white/12 bg-white/[0.045] p-3 md:grid-cols-2 xl:grid-cols-4">
                <label className={label}>Forráshely / érintett készlethely<CompactSelect value={sourceLocationId} onChange={setSourceLocationId} placeholder="Válassz helyszínt" options={[{ value: "", label: "Válassz helyszínt" }, ...locations.map((location) => ({ value: location.id, label: location.name }))]} /></label>
                {draftType === "internal_transfer" ? <label className={label}>Célhely<CompactSelect value={targetLocationId} onChange={setTargetLocationId} placeholder="Válassz célhelyet" options={[{ value: "", label: "Válassz célhelyet" }, ...locations.filter((location) => location.id !== sourceLocationId).map((location) => ({ value: location.id, label: location.name }))]} /></label> : null}
                {draftType === "internal_transfer" ? <label className={label}>UIT kód<input className={`${input} ${internalTransferNeedsUit(draftType, draftTotalValue) && !uitCode ? "border-red-300/80 bg-red-950/30" : ""}`} value={uitCode} onChange={(event) => setUitCode(normalizedUitCode(event.target.value))} placeholder={internalTransferNeedsUit(draftType, draftTotalValue) ? "Kötelező a szállításhoz" : "Ha szükséges"} /></label> : null}
                {draftType === "supplier_return" ? <><label className={label}>Beszállító<CompactSelect value={supplierId} onChange={(next) => void loadSupplierReceptions(next)} placeholder="Válassz beszállítót" options={[{ value: "", label: "Válassz beszállítót" }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]} /></label><label className={label}>Kapcsolt receptió / számla<CompactSelect value={receptionId} onChange={setReceptionId} placeholder="Nincs megadva" options={[{ value: "", label: "Nincs megadva" }, ...selectedSupplierReceptions.map((reception) => ({ value: reception.id, label: `${reception.invoice_number || "Számla nélkül"} • ${reception.reception_date ? String(reception.reception_date).slice(0, 10) : "-"}` }))]} /></label></> : null}
                {draftType === "stock_correction" ? <label className={label}>Korrekció iránya<CompactSelect value={correctionDirection} onChange={(next) => { setCorrectionDirection(next as CorrectionDirection); setDraftLines({}); }} options={[{ value: "decrease", label: "Készlet csökkentése" }, { value: "increase", label: "Készlet növelése" }]} /></label> : null}
                {draftType !== "internal_transfer" ? <label className={label}>Művelet oka<CompactSelect value={reasonCode} onChange={setReasonCode} placeholder="Válassz okot" options={[{ value: "", label: "Válassz okot" }, ...REASON_OPTIONS[draftType].map((option) => ({ value: option.value, label: option.label }))]} /></label> : null}
                {draftType !== "internal_transfer" ? <label className={label}>Ok pontosítása<input className={input} value={reasonText} onChange={(event) => setReasonText(event.target.value)} placeholder={reasonCode === "other" ? "Kötelező rövid leírás" : "Opcionális pontosítás"} /></label> : null}
                <label className={label}>Hivatkozás / számlaszám<input className={input} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="Opcionális" /></label>
                <label className={`${label} md:col-span-2`}>Megjegyzés a bizonylathoz<input className={input} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Csak a dokumentumhoz tartozó releváns megjegyzés" /></label>
              </div>

              {internalTransferNeedsUit(draftType, draftTotalValue) ? <div className={`mt-3 flex items-start gap-3 rounded-2xl border-2 px-4 py-3 text-white shadow-[0_10px_28px_rgba(220,38,38,.16)] ${uitCode ? "border-[#7bd7d4]/55 bg-[#174c55]/72" : "border-red-300/75 bg-red-600/28"}`}><AlertTriangle size={20} className={`mt-0.5 shrink-0 ${uitCode ? "text-[#7bd7d4]" : "text-red-300"}`} /><div><p className="text-sm text-white">{uitCode ? "UIT kód rögzítve az előkészítéshez" : "Figyelem: UIT kód szükséges"}</p><p className="mt-1 text-xs leading-relaxed text-white/72">Az átadás becsült értéke meghaladja a 10.000 RON-t ({moneyRon(draftTotalValue)}). {uitCode ? `Rögzített kód: ${uitCode}` : "A szállítás előtt írd be az UIT kódot a fenti mezőbe."}</p></div></div> : null}

              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(360px,.85fr)_minmax(0,1.6fr)]">
                <div className="rounded-2xl border border-white/12 bg-[#404a5b] p-3">
                  <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Termék hozzáadása</p><h3 className="mt-1 flex items-center gap-2 text-sm"><Barcode size={16} /> Vonalkód vagy keresés</h3></div><button type="button" className={primaryBtn} onClick={() => setCameraOpen(true)}><Camera size={15} /> Kamera</button></div>
                  <label className="mt-3 grid gap-1.5 text-xs text-white/62">Vonalkód / USB scanner
                    <div className="flex gap-2">
                      <input
                        ref={scanInputRef}
                        autoFocus
                        className={`${input} flex-1 ${scanFeedback?.tone === "success" ? "border-[#7bd7d4]/70 shadow-[0_0_0_2px_rgba(42,141,139,.12)]" : scanFeedback?.tone === "error" ? "border-rose-300/55" : ""}`}
                        value={scanValue}
                        onChange={(event) => scheduleAutomaticScan(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === "Tab") {
                            if (!scanValue.trim()) return;
                            event.preventDefault();
                            submitScannerInput();
                          }
                        }}
                        placeholder={scannerReady() ? "Csipogtasd be • automatikusan hozzáadja" : "Válaszd ki előbb a forrás- és célhelyet"}
                        autoComplete="off"
                        inputMode="numeric"
                        disabled={!scannerReady()}
                      />
                      <span className={`inline-flex min-w-[92px] items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[10px] ${
                        scanBusy
                          ? "border-sky-200/25 bg-sky-500/10 text-sky-50"
                          : scannerReady()
                            ? "border-[#7bd7d4]/35 bg-[#2a8d8b]/18 text-[#d7fffd]"
                            : "border-white/12 bg-white/[0.05] text-white/42"
                      }`}>
                        {scanBusy ? <RefreshCw size={13} className="animate-spin" /> : <Barcode size={13} />}
                        {scanBusy ? "KERESÉS" : scannerReady() ? "SCANNER AKTÍV" : "VÁRAKOZIK"}
                      </span>
                    </div>
                  </label>
                  {scanFeedback ? (
                    <div className={`mt-2 rounded-xl border px-3 py-2 text-[11px] ${
                      scanFeedback.tone === "success"
                        ? "border-[#7bd7d4]/32 bg-[#2a8d8b]/14 text-[#d7fffd]"
                        : scanFeedback.tone === "error"
                          ? "border-rose-300/30 bg-rose-500/12 text-rose-50"
                          : "border-sky-200/22 bg-sky-500/10 text-sky-50"
                    }`}>
                      {scanFeedback.text}
                    </div>
                  ) : null}
                  <label className="mt-3 grid gap-1.5 text-xs text-white/62">
                    Név / termékkód / méret / vonalkód
                    <div className="relative">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/38" />
                      <input
                        className={`${input} pl-9 pr-10`}
                        value={productSearch}
                        onChange={(event) => {
                          setProductSearchError("");
                          setProductSearch(event.target.value);
                        }}
                        placeholder="Vonalkódot is beírhatsz…"
                        autoComplete="off"
                      />
                      {productSearchBusy ? (
                        <RefreshCw size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#8ee6e2]" />
                      ) : null}
                    </div>
                  </label>
                  {productSearch ? (
                    <div className="mt-2 max-h-[330px] space-y-1.5 overflow-auto rounded-xl border border-white/10 bg-[#303a4c] p-1.5">
                      {productSearchResults.map((item) => (
                        <button
                          key={item.variant_id}
                          type="button"
                          onClick={() => { addDraftItem(item); focusScanInput(); }}
                          className="flex w-full items-center gap-2 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-[#7bd7d4]/28 hover:bg-[#2a8d8b]/12"
                        >
                          <ProductThumb item={item} className="h-11 w-11" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs text-white">{productTitle(item)}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-white/45">
                              {item.brand_name || "-"} • {item.color_name || item.color_code || "-"} • {item.size || "-"}
                            </span>
                            <span className="mt-0.5 block truncate font-mono text-[9px] text-[#cffffd]/65">
                              {visibleBarcode(item) || productCode(item) || "Azonosító nélkül"}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full border border-white/12 bg-white/[0.05] px-2 py-1 text-[10px] text-white/62">
                            {sourceLocationId ? `${availableAt(item.variant_id, sourceLocationId)} db` : "-"}
                          </span>
                        </button>
                      ))}
                      {!productSearchResults.length && productSearchBusy ? (
                        <div className="flex items-center justify-center gap-2 px-3 py-5 text-xs text-white/52">
                          <RefreshCw size={14} className="animate-spin text-[#8ee6e2]" />
                          Keresés a teljes terméktörzsben…
                        </div>
                      ) : null}
                      {!productSearchResults.length && !productSearchBusy && productSearchError ? (
                        <div className="px-3 py-4 text-center text-xs text-rose-100">{productSearchError}</div>
                      ) : null}
                      {!productSearchResults.length && !productSearchBusy && !productSearchError ? (
                        <div className="px-3 py-5 text-center text-xs text-white/42">Nincs találat.</div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-3 rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 px-3 py-2 text-[11px] leading-relaxed text-[#d7fffd]/82">Forrás és cél kiválasztása után csak csipogtasd a termékeket. A találat automatikusan bekerül a listába, a mező pedig rögtön várja a következőt. Ugyanazt újra beolvasva a darabszám +1.</div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#404a5b]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5"><div><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Bizonylat tartalma</p><h3 className="mt-1 flex items-center gap-2 text-sm"><Boxes size={16} /> {draftLineArray.length} terméksor • {draftTotalQty} db</h3></div><span className="rounded-full border border-[#7bd7d4]/25 bg-[#2a8d8b]/12 px-2.5 py-1 text-[11px] text-[#d7fffd]">Becsült érték: {moneyRon(draftTotalValue)} • {draftPriceBasis}</span></div>
                  <div className="max-h-[520px] overflow-auto">
                    <table className="min-w-[900px] w-full text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-[#303a4c] text-[9px] uppercase tracking-[0.08em] text-white/48"><tr><th className="px-2 py-2">Kép</th><th className="px-2 py-2">Termék</th><th className="px-2 py-2">Vonalkód</th>{draftType === "internal_transfer" ? <th className="px-2 py-2">Útvonal</th> : null}<th className="px-2 py-2 text-center">Elérhető</th><th className="px-2 py-2 text-center">Db</th><th className="px-2 py-2 text-right">P.U.</th><th className="px-2 py-2 text-right">Érték</th><th className="px-2 py-2 text-right"></th></tr></thead>
                      <tbody>
                        {draftLineArray.map((row) => {
                          const unit = decimalValue(draftType === "internal_transfer" ? row.item.sell_price : row.item.buy_price);
                          const rowFromId = row.fromLocationId || sourceLocationId;
                          const rowToId = row.toLocationId || targetLocationId;
                          const available = maxDraftQty(row.item, rowFromId, row.originalQty);
                          const fromName = locationById(rowFromId)?.name || "-";
                          const toName = locationById(rowToId)?.name || "-";
                          return <tr key={row.key} className="border-t border-white/[0.08]"><td className="px-2 py-2"><ProductThumb item={row.item} className="h-11 w-11" /></td><td className="px-2 py-2"><p className="max-w-[260px] truncate text-white">{productTitle(row.item)}</p><p className="mt-0.5 text-[10px] text-white/42">{row.item.brand_name || "-"} • {row.item.color_name || row.item.color_code || "-"} • {row.item.size || "-"}</p></td><td className="px-2 py-2 font-mono text-[10px] text-[#cffffd]/70">{visibleBarcode(row.item) || productCode(row.item) || "-"}</td>{draftType === "internal_transfer" ? <td className="px-2 py-2 text-[10px] leading-snug text-white/68"><span className="block truncate">← {fromName}</span><span className="mt-0.5 block truncate">→ {toName}</span></td> : null}<td className="px-2 py-2 text-center"><span className={`rounded-full border px-2 py-1 text-[10px] ${!outgoingDraft || available >= row.qty ? "border-[#7bd7d4]/25 bg-[#2a8d8b]/12 text-[#d7fffd]" : "border-rose-200/30 bg-rose-500/12 text-rose-50"}`}>{outgoingDraft ? `${available} db max` : "növelés"}</span></td><td className="px-2 py-2"><div className="mx-auto grid h-8 w-[112px] grid-cols-[30px_1fr_30px] overflow-hidden rounded-lg border border-white/16 bg-[#303a4c]"><button type="button" onClick={() => adjustDraftQty(row.key, -1)} className="grid place-items-center hover:bg-white/10"><Minus size={13} /></button><input className="w-full bg-transparent text-center text-xs text-white outline-none" value={row.qty} onChange={(event) => setDraftQty(row.key, event.target.value)} inputMode="numeric" /><button type="button" onClick={() => adjustDraftQty(row.key, 1)} className="grid place-items-center hover:bg-white/10"><Plus size={13} /></button></div></td><td className="px-2 py-2 text-right tabular-nums">{moneyRon(unit, false)}</td><td className="px-2 py-2 text-right tabular-nums text-[#d7fffd]">{moneyRon(unit === null ? null : unit * row.qty, false)}</td><td className="px-2 py-2 text-right"><button type="button" className={dangerIconBtn} onClick={() => setDraftLines((current) => { const next = { ...current }; delete next[row.key]; return next; })}><Trash2 size={14} /></button></td></tr>;
                        })}
                        {!draftLineArray.length ? <tr><td colSpan={draftType === "internal_transfer" ? 9 : 8} className="px-4 py-12 text-center text-white/42">Még nincs termék a bizonylaton. Adj hozzá terméket vonalkóddal vagy kereséssel.</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 bg-[#303a4c] px-4 py-3"><div className="text-xs text-white/58"><span className="text-white">{draftLineArray.length} sor • {draftTotalQty} db • {moneyRon(draftTotalValue)}</span><span className="ml-2">{editingDocumentStatus === "preparation" ? (draftType === "damaged_writeoff" ? "A sérült termék készlete már kivezetve. Mentéskor csak a különbözet rendeződik." : "A készlet már át van mozgatva. Mentéskor csak a módosítás különbözete rendeződik.") : (draftType === "damaged_writeoff" ? "Mentéskor a sérült termék azonnal kivezetésre kerül és az Előkészítéshez adódik." : "Az előkészítés készletmozgása csak a lezáráskor történik meg.")}</span></div><div className="flex flex-wrap gap-2"><button type="button" className={btnSoft} onClick={() => setCreateOpen(false)} disabled={savingDocument}>Mégse</button><button type="button" className={editingDocumentStatus === "preparation" || draftType === "damaged_writeoff" ? btnSoft : dangerBtn} onClick={() => void saveDraftDocument(true)} disabled={savingDocument}><Save size={15} /> {savingDocument ? "Mentés..." : "Előkészítés mentése"}</button><button type="button" className={primaryBtn} onClick={() => void saveDocument()} disabled={savingDocument || !draftLineArray.length}><CheckCircle2 size={15} /> {savingDocument ? "Feldolgozás..." : editingDocumentStatus === "preparation" || draftType === "damaged_writeoff" ? "Előkészítés lezárása" : "Bizonylat véglegesítése"}</button></div></div>
          </div>
        </div>
      ) : null}

      {cameraOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setCameraOpen(false); }}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/18 bg-[#303a4c] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/12 px-4 py-3"><div><p className="text-[10px] uppercase tracking-[0.14em] text-[#cffffd]/65">Vonalkódolvasó</p><h3 className="mt-1 flex items-center gap-2 text-base"><Camera size={17} /> Hátsó kamera</h3></div><button type="button" className={iconBtn} onClick={() => setCameraOpen(false)}><X size={16} /></button></div>
            <div className="p-3"><div className="relative overflow-hidden rounded-2xl border border-[#7bd7d4]/30 bg-black"><video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" /><div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-[#7bd7d4] shadow-[0_0_0_999px_rgba(0,0,0,.35)]" /></div><p className="mt-3 text-center text-xs text-white/62">{cameraStatus || "Kamera indítása..."}</p></div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !settingsSaving) setSettingsOpen(false); }}>
          <div className="w-full max-w-3xl overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/12 bg-gradient-to-r from-[#263246] to-[#2a8d8b]/60 px-4 py-3"><div><p className="text-[10px] uppercase tracking-[0.16em] text-[#cffffd]/65">Admin settings</p><h3 className="mt-1 text-lg">Készletbizonylatok számozása</h3></div><button type="button" className={iconBtn} onClick={() => setSettingsOpen(false)}><X size={16} /></button></div>
            <div className="p-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{DOCUMENT_TYPES.map((row) => { const Icon = row.icon; return <button key={row.type} type="button" onClick={() => { setSettingsType(row.type); setSettingsDraft(settings?.[row.type] ? { ...settings[row.type] } : null); }} className={`rounded-xl border p-2.5 text-left ${settingsType === row.type ? "border-[#7bd7d4]/55 bg-[#2a8d8b]/20" : "border-white/12 bg-white/[0.05]"}`}><span className="flex items-center gap-2 text-xs"><Icon size={14} /> {row.shortLabel}</span><span className="mt-1 block text-[10px] text-white/42">{settings?.[row.type]?.previewNumber || "-"}</span></button>; })}</div>
              {settingsDraft ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className={label}>Sorozat<input className={input} value={settingsDraft.series} onChange={(event) => setSettingsDraft({ ...settingsDraft, series: event.target.value.toUpperCase() })} /></label><label className={label}>Következő szám<input className={input} type="number" min={1} value={settingsDraft.nextNumber} onChange={(event) => setSettingsDraft({ ...settingsDraft, nextNumber: Math.max(1, Number(event.target.value) || 1) })} /></label><label className={label}>Számjegyek<input className={input} type="number" min={3} max={10} value={settingsDraft.digits} onChange={(event) => setSettingsDraft({ ...settingsDraft, digits: Math.min(10, Math.max(3, Number(event.target.value) || 6)) })} /></label><label className={label}>Sorozat éve<input className={input} type="number" min={2000} max={2100} value={settingsDraft.sequenceYear} onChange={(event) => setSettingsDraft({ ...settingsDraft, sequenceYear: Number(event.target.value) || new Date().getFullYear() })} /></label><label className={`${label} sm:col-span-2`}>Román dokumentumcím<input className={input} value={settingsDraft.documentTitle} onChange={(event) => setSettingsDraft({ ...settingsDraft, documentTitle: event.target.value })} /></label><label className={`${label} sm:col-span-2`}>Román alcím<input className={input} value={settingsDraft.documentSubtitle} onChange={(event) => setSettingsDraft({ ...settingsDraft, documentSubtitle: event.target.value })} /></label><label className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs"><input type="checkbox" checked={settingsDraft.includeYear} onChange={(event) => setSettingsDraft({ ...settingsDraft, includeYear: event.target.checked })} className="accent-[#2a8d8b]" /> Év szerepeljen a számban</label><label className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs"><input type="checkbox" checked={settingsDraft.yearlyReset} onChange={(event) => setSettingsDraft({ ...settingsDraft, yearlyReset: event.target.checked })} className="accent-[#2a8d8b]" /> Évente újrainduljon</label><div className="rounded-xl border border-[#7bd7d4]/25 bg-[#2a8d8b]/12 px-3 py-2 sm:col-span-2"><p className="text-[10px] uppercase tracking-[0.1em] text-[#cffffd]/55">Következő bizonylat</p><p className="mt-1 text-lg text-[#d7fffd]">{settingsDraft.previewNumber}</p></div></div> : <div className="mt-4 rounded-xl border border-rose-200/20 bg-rose-500/10 px-3 py-3 text-sm text-rose-50">A beállítás még nem tölthető be.</div>}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/12 bg-[#303a4c] px-4 py-3"><button type="button" className={btnSoft} onClick={() => setSettingsOpen(false)}>Mégse</button><button type="button" className={primaryBtn} onClick={() => void saveSettings()} disabled={!settingsDraft || settingsSaving}><CheckCircle2 size={15} /> {settingsSaving ? "Mentés..." : "Beállítás mentése"}</button></div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (() => {
        const restoreAvailable = canRestoreStockOnDelete(deleteTarget);
        const noRestoreReason = restoreDeleteUnavailableReason(deleteTarget);
        const targetNumber = displayDocumentNumber(deleteTarget);
        const targetQty = quantity(deleteTarget.total_qty || 0);
        return (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-[24px] border border-white/16 bg-[#4b5362] shadow-[0_30px_90px_rgba(2,6,23,.55)]">
              <div className="flex items-start gap-3 border-b border-white/12 bg-gradient-to-r from-[#3b2730] via-[#3d3544] to-[#344154] px-4 py-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200/28 bg-rose-500/14 text-rose-50"><AlertTriangle size={20} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-rose-100/58">Törlési mód kiválasztása</p>
                  <h3 className="mt-1 text-lg text-white">Mi történjen a készlettel?</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/62">
                    <span className="text-white">{targetNumber}</span> • {targetQty} db. A két művelet nem ugyanaz, ezért a rendszer most nem találgat helyetted.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 p-4 md:grid-cols-2">
                <button
                  type="button"
                  disabled={!restoreAvailable || deleting}
                  onClick={() => void confirmDelete("restore_stock")}
                  className="group rounded-2xl border border-amber-200/28 bg-amber-500/10 p-4 text-left transition hover:-translate-y-0.5 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200/25 bg-amber-500/14 text-amber-50">
                    {deletingMode === "restore_stock" ? <RefreshCw size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                  </span>
                  <p className="mt-3 text-sm text-white">Törlés készlet-visszaállítással</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/58">
                    A bizonylat törlődik, és a benne szereplő készletmozgás visszafordul. Ezt csak akkor válaszd, ha maga a mozgás is hibás.
                  </p>
                  {!restoreAvailable ? <p className="mt-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-[10px] leading-relaxed text-amber-50/72">{noRestoreReason}</p> : null}
                </button>

                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void confirmDelete("permanent")}
                  className="group rounded-2xl border border-rose-200/30 bg-rose-600/14 p-4 text-left transition hover:-translate-y-0.5 hover:bg-rose-600/20 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200/28 bg-rose-600 text-white shadow-[0_8px_20px_rgba(225,29,72,.22)]">
                    {deletingMode === "permanent" ? <RefreshCw size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  </span>
                  <p className="mt-3 text-sm text-white">Végleges törlés, készlethez ne nyúljon</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-white/58">
                    Csak a bizonylat tűnik el. A jelenlegi raktárkészlet változatlan marad. Régi, már rendezett dokumentumoknál ezt válaszd.
                  </p>
                  <p className="mt-3 rounded-xl border border-rose-200/14 bg-rose-950/18 px-3 py-2 text-[10px] leading-relaxed text-rose-50/76">
                    Ez a művelet nem állít vissza egyetlen darabot sem a raktárba.
                  </p>
                </button>
              </div>

              <div className="flex justify-end border-t border-white/12 bg-[#303a4c] px-4 py-3">
                <button type="button" className={btnSoft} onClick={() => setDeleteTarget(null)} disabled={deleting}>Mégse</button>
              </div>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
