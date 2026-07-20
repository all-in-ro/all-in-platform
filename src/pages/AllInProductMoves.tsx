import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
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
const input = "h-10 w-full rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/20";
const label = "grid min-w-0 gap-1.5 text-xs text-white/65";
const API_BASE = "/api/aif";

type DocumentType = "internal_transfer" | "supplier_return" | "damaged_writeoff" | "stock_correction";
type ArchiveFilter = "all" | "official" | "draft" | "preparation" | "legacy" | "cancelled" | DocumentType;
type CorrectionDirection = "increase" | "decrease";

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
  supplier_product_code?: string | null;
  supplier_codes?: string | null;
  title_ro?: string | null;
  shopify_title?: string | null;
  brand_name?: string | null;
  category_name_ro?: string | null;
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

function productSearchValues(item: InventoryItem) {
  return [
    item.variant_id,
    item.internal_sku,
    item.barcode,
    item.display_barcode,
    item.supplier_product_code,
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
  const key = normalize(query);
  if (!key) return false;
  return [
    item.variant_id,
    item.internal_sku,
    item.barcode,
    item.display_barcode,
    item.supplier_product_code,
    ...(String(item.supplier_codes || "").split(",")),
  ].map((value) => normalize(value)).some((value) => value === key);
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
    return { label: "Piszkozat", cls: "border-amber-200/35 bg-amber-500/14 text-amber-50", icon: Edit3 };
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

function makePrintHtml(detail: DocumentDetail) {
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
  const rows = lines.map((line, index) => {
    const image = line.image_url
      ? `<img class="img" src="${escapeHtml(line.image_url)}" alt="" />`
      : `<div class="img empty">Fără foto</div>`;
    const variant = [line.brand_name, line.category_name, line.color_name, line.size]
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
      <td class="money">${escapeHtml(moneyRon(lineUnitPrice(line), false))}</td>
      <td class="money value">${escapeHtml(moneyRon(lineTotalValue(line), false))}</td>
    </tr>`;
  }).join("");
  const reason = type === "internal_transfer" ? "" : reasonLabel(type, doc.reason_code, doc.reason_text, true);
  const reference = firstText(doc.external_reference, (doc.raw as any)?.receptionInvoiceNumber);

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
  .declaration{margin-bottom:3.5mm;border-left:3px solid #255f54;background:#f5f8f7;padding:2.5mm 3mm;color:#354353;line-height:1.45}.note{margin-bottom:3.5mm;border:1px solid #d3dcda;border-radius:2.5mm;padding:2.5mm 3mm}
  table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#26384b;color:#fff;border:1px solid #26384b;padding:2.2mm 1.4mm;font-size:7.7px;line-height:1.2;text-transform:uppercase;text-align:left}td{border:1px solid #d4dcdf;padding:1.7mm 1.4mm;font-size:8.5px;line-height:1.25;vertical-align:middle;overflow-wrap:anywhere}tbody tr:nth-child(even) td{background:#f8fafb}
  th:nth-child(1),td:nth-child(1){width:7mm}th:nth-child(2),td:nth-child(2){width:54mm}th:nth-child(3),td:nth-child(3){width:24mm}th:nth-child(4),td:nth-child(4){width:27mm}th:nth-child(5),td:nth-child(5){width:10mm}th:nth-child(6),td:nth-child(6){width:11mm}th:nth-child(7),td:nth-child(7){width:24mm}th:nth-child(8),td:nth-child(8){width:28mm}
  .center{text-align:center}.qty{text-align:center;font-size:11px;font-weight:700;color:#255f54}.code{font-family:"Courier New",monospace;font-size:8px}.money{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.value{font-weight:700;color:#183d36}.product{display:flex;align-items:center;gap:2mm;min-width:0}.product strong{display:block;font-size:9px}.product small{display:block;margin-top:.7mm;color:#667382;font-size:7.5px}.img{width:9mm;height:11mm;flex:0 0 auto;object-fit:contain;border:1px solid #d4dcdf;border-radius:1.5mm;background:#fff}.img.empty{display:flex;align-items:center;justify-content:center;padding:1mm;color:#9aa4ae;font-size:5.5px;text-align:center}
  tfoot td{background:#eef4f2;border-color:#b9c7c4;font-weight:700}tfoot .totalLabel{text-align:right;color:#183d36;letter-spacing:.08em}tfoot .totalValue{background:#255f54;color:#fff;font-size:11px}.total{display:grid;grid-template-columns:minmax(0,1fr) auto;margin-top:2.5mm;border:1px solid #b9c7c4;border-radius:2.5mm;overflow:hidden}.total span{padding:2.4mm 3mm;color:#536171;background:#f5f8f7}.total strong{min-width:44mm;padding:2.4mm 3mm;text-align:center;color:#fff;background:#255f54;font-size:13px}.valuationNote{margin-top:1.5mm;color:#8a5b00;font-size:7.5px;text-align:right}
  .signatures{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4mm;margin-top:13mm;break-inside:avoid}.signature{min-height:27mm;border:1px solid #ccd7d4;border-radius:2.5mm;padding:2.5mm}.signatureTitle{color:#255f54;font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.signatureLine{margin-top:9mm;border-top:1px solid #667382;padding-top:1.3mm;color:#667382;font-size:7.2px;text-align:center}.signatureDate{margin-top:2.5mm;color:#7b8793;font-size:7.2px;text-align:center}.footer{display:flex;justify-content:space-between;gap:8mm;margin-top:5mm;padding-top:2.5mm;border-top:1px solid #d7dfdd;color:#7b8793;font-size:7.2px}
</style>
</head>
<body>
<div class="top">
  <div><div class="company">TITAN EURO-COM SRL</div><div class="companyMeta"><div><strong>CUI:</strong> RO17495362</div><div><strong>Nr. Reg. Com.:</strong> J19/420/2005</div><div><strong>Sediu:</strong> Str. Mihail Sadoveanu nr. 33, sc. C, et. 4, ap. 17, Miercurea-Ciuc, jud. Harghita, România</div></div></div>
  <div class="docBox"><h3>Datele documentului</h3><div class="docBoxBody"><div class="docLine"><span>Nr. document</span><strong>${escapeHtml(doc.document_number)}</strong></div><div class="docLine"><span>Data emiterii</span><strong>${escapeHtml(roDateTime(doc.created_at))}</strong></div><div class="docLine"><span>Tip operațiune</span><strong>${escapeHtml(meta.operation)}</strong></div>${reference ? `<div class="docLine"><span>Referință</span><strong>${escapeHtml(reference)}</strong></div>` : ""}</div></div>
</div>
<div class="title"><div class="eyebrow">Document intern de gestiune</div><h1>${escapeHtml(doc.title || documentMeta(type).label)}</h1><div class="subtitle">${escapeHtml(doc.subtitle || meta.operation)}</div>${legacyMark}</div>
<div class="route"><div class="routeCard"><span>${escapeHtml(meta.leftLabel)}</span><strong>${escapeHtml(meta.leftValue)}</strong></div><div class="routeCard"><span>${escapeHtml(meta.rightLabel)}</span><strong>${escapeHtml(meta.rightValue)}</strong></div></div>
<div class="declaration">${escapeHtml(meta.declaration)}</div>
${reason && type !== "internal_transfer" ? `<div class="note"><strong>Motiv:</strong> ${escapeHtml(reason)}</div>` : ""}
${doc.note ? `<div class="note"><strong>Observații interne relevante documentului:</strong> ${escapeHtml(doc.note)}</div>` : ""}
<table><thead><tr><th>Nr. crt.</th><th>Denumirea produsului / varianta</th><th>Cod produs</th><th>Cod de bare</th><th>U.M.</th><th>Cant.</th><th>P.U. RON</th><th>Valoare RON</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5" class="totalLabel">TOTAL</td><td class="qty">${escapeHtml(quantity(totalQty))}</td><td></td><td class="money totalValue">${escapeHtml(moneyRon(totalValue, false))}</td></tr></tfoot></table>
<div class="total"><span>Total produse: ${lines.length} poziții • ${quantity(totalQty)} buc.</span><strong>${escapeHtml(moneyRon(totalValue))}</strong></div>
${missingPrices ? `<div class="valuationNote">Atenție: ${missingPrices} poziții nu au preț disponibil; totalul valoric include numai pozițiile evaluate.</div>` : ""}
<div class="signatures">${meta.signatures.map((title) => `<div class="signature"><div class="signatureTitle">${escapeHtml(title)}</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div>`).join("")}</div>
<div class="footer"><span>Document generat din sistemul AllInFashion.</span><span>${escapeHtml(doc.document_number)} • ${escapeHtml(roDateTime(doc.created_at))}</span></div>
</body></html>`;
}

function printDetail(detail: DocumentDetail) {
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
  doc.write(makePrintHtml(detail));
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
  const [deleteTarget, setDeleteTarget] = useState<DocumentListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

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
  const [note, setNote] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [productSearch, setProductSearch] = useState("");
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
    if (!query) return [] as InventoryItem[];
    return inventory
      .filter((item) => productSearchValues(item).some((value) => value.includes(query)))
      .sort((a, b) => {
        const exactA = exactProductMatch(a, productSearch) ? 0 : 1;
        const exactB = exactProductMatch(b, productSearch) ? 0 : 1;
        return exactA - exactB || productTitle(a).localeCompare(productTitle(b), "hu", { numeric: true, sensitivity: "base" });
      })
      .slice(0, 10);
  }, [inventory, productSearch]);

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
    setNote("");
    setScanValue("");
    setProductSearch("");
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
      if (status !== "draft" && status !== "preparation") throw new Error("Csak piszkozat vagy előkészítés szerkeszthető.");
      const docType = documentTypeOf(result.document);
      setEditingDraftId(result.document.id);
      setEditingDraftNumber(result.document.document_number || (status === "preparation" ? "Előkészítés" : "Piszkozat"));
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

  function handleScannedValue(raw: unknown) {
    const code = String(raw || "").replace(/[\r\n\t]+/g, "").trim();
    if (!code) return;
    const exact = inventory.filter((item) => exactProductMatch(item, code));
    if (exact.length === 1) {
      addDraftItem(exact[0], 1);
      setMessage(`Beolvasva: ${productTitle(exact[0])}.`);
      return;
    }
    if (exact.length > 1) {
      setProductSearch(code);
      setError("Több termék egyezik ezzel a kóddal. Válaszd ki a megfelelő variánst a találatokból.");
      return;
    }
    setProductSearch(code);
    setError(`Nincs pontos találat erre a kódra: ${code}. A keresési találatokat megmutatom.`);
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
      setEditingDraftNumber(String(result.documentNumber || editingDraftNumber || "Piszkozat"));
      setEditingDocumentStatus("draft");
      setMessage(`${result.documentNumber || "A piszkozat"} mentve. A készlet még nem változott.`);
      await loadList();
      if (closeAfterSave) {
        setCreateOpen(false);
        resetDraft(draftType);
      }
      return nextId;
    } catch (saveError: any) {
      setError(saveError?.message || "A piszkozat mentése nem sikerült.");
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
      setMessage(`${number || "A PV"} lezárva. A következő készletáthelyezés új PV-előkészítést indít.`);
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
          console.error("A véglegesített piszkozat takarítása nem sikerült", cleanupError);
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
      setMessage(`${item.document_number} lezárva. A következő mozgatás új PV-előkészítést indít.`);
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
      setMessage(`${item.document_number} visszaállítva Előkészítésre. A következő mozgatások ismét ehhez a PV-hez kerülnek.`);
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

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError("");
    try {
      const deletePath = deleteTarget.status === "draft"
        ? `/stock-documents/${encodeURIComponent(deleteTarget.id)}/draft`
        : deleteTarget.status === "preparation"
          ? `/stock-transfer-documents/${encodeURIComponent(deleteTarget.id)}/preparation`
          : `/stock-transfer-documents/${encodeURIComponent(deleteTarget.id)}`;
      await fetchJson<{ ok: boolean; restoredQty?: number }>(deletePath, { method: "DELETE" });
      const number = deleteTarget.document_number;
      if (detail?.document.id === deleteTarget.id) setDetail(null);
      setDeleteTarget(null);
      setMessage(deleteTarget.status === "preparation" ? `${number} előkészítés törölve, a benne mozgatott készlet visszaállítva.` : `${number} véglegesen törölve az archívumból. A készlet mennyisége nem változott.`);
      await loadList();
    } catch (deleteError: any) {
      setError(deleteError?.message || "A bizonylat végleges törlése nem sikerült.");
    } finally {
      setDeleting(false);
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
    const canReopen = item.status === "issued" && documentTypeOf(item) === "internal_transfer";
    return (
      <div className="flex justify-end gap-1.5">
        <button type="button" className={btnSoft} onClick={() => void openDetailById(item.id)}>{compact ? null : <PackageCheck size={14} />} Részletek</button>
        {(isPreparation || isDraft) ? <button type="button" className={primaryBtn} onClick={() => void openDraftForEdit(item)}><Edit3 size={14} /> {compact ? "Szerk." : "Szerkesztés"}</button> : null}
        {isPreparation ? <button type="button" className={primaryBtn} onClick={() => void closePreparationById(item)} title="Előkészítés lezárása"><CheckCircle2 size={14} /> {compact ? "Lezár" : "Lezárás"}</button> : null}
        {!isPreparation && !isDraft ? <button type="button" className={iconBtn} onClick={async () => { const current = detail?.document.id === item.id ? detail : await fetchJson<DocumentDetail>(`/stock-transfer-documents/${encodeURIComponent(item.id)}`); printDetail(current); }} title="PDF / nyomtatás"><Printer size={15} /></button> : null}
        {canReopen ? <button type="button" className={iconBtn} onClick={() => void reopenAsPreparation(item)} title="Visszaállítás Előkészítésre"><RotateCcw size={15} /></button> : null}
        <button type="button" className={dangerIconBtn} onClick={() => setDeleteTarget(item)} title="Végleges törlés"><Trash2 size={15} /></button>
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
                <p className="mt-0.5 text-[11px] text-white/48">Aviz, retur, sérült termék és készletkorrekció egy helyen</p>
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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
          <SummaryCard labelText="Összes bizonylat" value={quantity(totals.all ?? totals.total)} hint="Kattints a teljes listához" active={type === "all"} onClick={() => applyTypeFilter("all")} />
          <SummaryCard labelText="Előkészítés" value={quantity(totals.preparation || 0)} hint="Készlet mozgatva, még szerkeszthető" tone="red" active={type === "preparation"} onClick={() => applyTypeFilter("preparation")} />
          <SummaryCard labelText="Piszkozat" value={quantity(totals.draft || 0)} hint="Készletet még nem módosított" tone="amber" active={type === "draft"} onClick={() => applyTypeFilter("draft")} />
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
            <label className={label}>Típus<CompactSelect value={type} onChange={(next) => { setType(next as ArchiveFilter); setPageNo(1); }} options={[{ value: "all", label: "Minden bizonylat" }, { value: "preparation", label: "Előkészítés" }, { value: "draft", label: "Piszkozat" }, { value: "internal_transfer", label: "Belső átadás" }, { value: "supplier_return", label: "Beszállítói retur" }, { value: "damaged_writeoff", label: "Sérült / kivezetés" }, { value: "stock_correction", label: "Készletkorrekció" }, { value: "legacy", label: "Régi archívum" }, { value: "cancelled", label: "Sztornózott" }]} /></label>
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
              <thead className="bg-[#293448] text-[10px] uppercase tracking-[0.08em] text-white/60"><tr><th className="px-4 py-3 text-left">Bizonylat</th><th className="px-4 py-3 text-left">Típus</th><th className="px-4 py-3 text-left">Dátum</th><th className="px-4 py-3 text-left">Útvonal / partner</th><th className="px-4 py-3 text-center">Sor / db / érték</th><th className="px-4 py-3 text-left">Rögzítette</th><th className="px-4 py-3 text-right">Művelet</th></tr></thead>
              <tbody>
                {items.map((item) => {
                  const badge = documentBadge(item);
                  const BadgeIcon = badge.icon;
                  const typeMeta = documentMeta(documentTypeOf(item));
                  const TypeIcon = typeMeta.icon;
                  return (
                    <tr key={item.id} className="border-t border-white/10 align-middle transition hover:bg-white/[0.035]">
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06]"><FileText size={18} /></span><div><p className="font-medium text-white">{item.document_number}</p><span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${badge.cls}`}><BadgeIcon size={11} /> {badge.label}</span></div></div></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${typeMeta.tone}`}><TypeIcon size={13} /> {typeMeta.shortLabel}</span></td>
                      <td className="px-4 py-3 text-white/72">{dateTime(item.created_at)}</td>
                      <td className="px-4 py-3"><div className="grid gap-1"><span className="inline-flex items-center gap-1.5 text-white/76"><ArrowLeft size={13} className="text-[#7bd7d4]" /> {item.from_location_summary || "-"}</span><span className="inline-flex items-center gap-1.5 text-white/76"><ArrowRight size={13} className="text-[#7bd7d4]" /> {item.supplier_name || item.to_location_summary || reasonLabel(documentTypeOf(item), item.reason_code, item.reason_text)}</span>{item.external_reference ? <span className="text-[10px] text-white/42">Hivatkozás: {item.external_reference}</span> : null}</div></td>
                      <td className="px-4 py-3 text-center"><span className="inline-flex flex-col rounded-xl border border-[#7bd7d4]/26 bg-[#2a8d8b]/13 px-3 py-1.5 text-xs text-[#d7fffd]"><span>{quantity(item.line_count)} sor • {quantity(item.total_qty)} db</span><span className="mt-0.5 text-[10px] text-white/58">{moneyRon(item.total_value || 0)}</span></span></td>
                      <td className="px-4 py-3 text-white/65">{item.actor || "-"}</td>
                      <td className="px-4 py-3">{documentActionButtons(item)}</td>
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
              return (
                <article key={item.id} className="rounded-2xl border border-white/12 bg-white/[0.05] p-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-base text-white">{item.document_number}</p><p className="mt-1 text-xs text-white/48">{dateTime(item.created_at)}</p></div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${badge.cls}`}><BadgeIcon size={11} /> {badge.label}</span></div>
                  <div className="mt-3 flex items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${meta.tone}`}><TypeIcon size={13} /> {meta.shortLabel}</span><span className="text-xs text-[#d7fffd]">{quantity(item.total_qty)} db • {moneyRon(item.total_value || 0)}</span></div>
                  <div className="mt-3 grid gap-2 text-xs"><div className="rounded-xl bg-[#354153] px-3 py-2"><span className="text-white/42">Forrás</span><p className="mt-0.5 text-white/78">{item.from_location_summary || "-"}</p></div><div className="rounded-xl bg-[#354153] px-3 py-2"><span className="text-white/42">Cél / partner</span><p className="mt-0.5 text-white/78">{item.supplier_name || item.to_location_summary || reasonLabel(documentTypeOf(item), item.reason_code, item.reason_text)}</p></div></div>
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
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setDetail(null); }}>
            <div className="flex max-h-[95vh] w-full max-w-[1360px] flex-col overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] shadow-2xl">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#263246] via-[#334154] to-[#2a8d8b]/55 px-4 py-3.5">
                <div className="flex min-w-0 items-start gap-3"><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><TypeIcon size={21} /></span><div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">{doc.status === "preparation" ? "Készletátadás előkészítése" : doc.status === "draft" ? "Készletbizonylat piszkozat" : "Készletbizonylat részletei"}</p><h2 className="mt-0.5 truncate text-[22px]">{doc.document_number}</h2><p className="mt-1 truncate text-xs text-white/58">{meta.label} • {doc.subtitle || "-"}</p></div></div>
                <div className="flex flex-wrap gap-2">{doc.status === "preparation" ? <><button type="button" className={primaryBtn} onClick={() => void openDraftForEdit(doc)}><Edit3 size={15} /> Előkészítés folytatása</button><button type="button" className={primaryBtn} onClick={() => void closePreparationById(doc)}><CheckCircle2 size={15} /> Lezárás</button></> : doc.status === "draft" ? <button type="button" className={primaryBtn} onClick={() => void openDraftForEdit(doc)}><Edit3 size={15} /> Piszkozat folytatása</button> : <><button type="button" className={primaryBtn} onClick={() => printDetail(detail)}><Printer size={15} /> PDF / nyomtatás</button>{documentTypeOf(doc) === "internal_transfer" ? <button type="button" className={btnSoft} onClick={() => void reopenAsPreparation(doc)}><RotateCcw size={15} /> Előkészítésre</button> : null}</>}<button type="button" className={dangerBtn} onClick={() => setDeleteTarget(doc)}><Trash2 size={15} /> Végleges törlés</button><button type="button" className={btn} onClick={() => setDetail(null)}><X size={15} /> Bezárás</button></div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3.5">
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                  <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Bizonylatszám</p><p className="mt-1 text-sm">{doc.document_number}</p></div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">{doc.status === "draft" || doc.status === "preparation" ? "Utoljára mentve" : "Kibocsátva"}</p><p className="mt-1 text-sm">{dateTime(doc.updated_at || doc.created_at)}</p></div>
                  <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-[#cffffd]/55">Típus</p><p className="mt-1 text-sm text-[#d7fffd]">{meta.shortLabel}</p></div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Rögzítette</p><p className="mt-1 truncate text-sm">{doc.actor || "-"}</p></div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Forrás</p><p className="mt-1 truncate text-sm">{doc.from_location_summary || "-"}</p></div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Cél / partner</p><p className="mt-1 truncate text-sm">{doc.supplier_name || doc.to_location_summary || "-"}</p></div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Sor / darab</p><p className="mt-1 text-sm">{detail.lines.length} sor • {quantity(doc.total_qty)} db</p></div>
                  <div className="rounded-2xl border border-[#7bd7d4]/26 bg-[#2a8d8b]/14 px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-[#cffffd]/58">Bizonylat értéke</p><p className="mt-1 text-sm text-[#d7fffd]">{moneyRon(detailValue)}</p>{detailMissingPrices ? <p className="mt-0.5 text-[9px] text-amber-100/70">{detailMissingPrices} sor ár nélkül</p> : null}</div>
                </div>
                {(doc.reason_code || doc.reason_text || doc.external_reference || doc.note) ? <div className="mt-3 grid gap-2 md:grid-cols-3"><div className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Ok</p><p className="mt-1 text-xs text-white/78">{reasonLabel(documentTypeOf(doc), doc.reason_code, doc.reason_text)}</p></div><div className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Hivatkozás</p><p className="mt-1 text-xs text-white/78">{doc.external_reference || "-"}</p></div><div className="rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Megjegyzés</p><p className="mt-1 text-xs text-white/78">{doc.note || "-"}</p></div></div> : null}

                <div className="mt-3 overflow-hidden rounded-2xl border border-white/12 bg-[#404a5b]">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5"><div className="flex items-center gap-2 text-sm"><Boxes size={16} /> Bizonylat terméksorai</div><span className="rounded-full border border-white/12 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/52">{detail.lines.length} sor</span></div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[1120px] w-full text-left text-xs">
                      <thead className="bg-[#303a4c] text-[9px] uppercase tracking-[0.08em] text-white/48"><tr><th className="px-2 py-2">#</th><th className="px-2 py-2">Kép</th><th className="px-2 py-2">Termék</th><th className="px-2 py-2">Márka / kategória</th><th className="px-2 py-2">Azonosító</th><th className="px-2 py-2">Variáns</th><th className="px-2 py-2 text-right">Db</th><th className="px-2 py-2 text-right">P.U. RON</th><th className="px-2 py-2 text-right">Érték RON</th></tr></thead>
                      <tbody>
                        {detail.lines.map((line, index) => <tr key={line.id || `${line.line_no}-${index}`} className="border-t border-white/[0.08] align-middle hover:bg-white/[0.035]"><td className="px-2 py-2 text-white/45">{index + 1}</td><td className="px-2 py-2"><ProductThumb item={line} className="h-11 w-11" /></td><td className="px-2 py-2"><p className="max-w-[250px] truncate text-white">{line.product_title || "Produs"}</p><p className="mt-0.5 max-w-[250px] truncate text-[10px] text-white/42">{line.product_code || "-"}</p></td><td className="px-2 py-2"><p>{line.brand_name || "-"}</p><p className="mt-0.5 text-[10px] text-white/42">{line.category_name || "-"}</p></td><td className="px-2 py-2 font-mono text-[10px]">{line.barcode || "-"}</td><td className="px-2 py-2">{[line.color_name, line.size].filter(Boolean).join(" • ") || "-"}</td><td className="px-2 py-2 text-right tabular-nums text-[#d7fffd]">{quantity(line.qty)}</td><td className="px-2 py-2 text-right tabular-nums">{moneyRon(lineUnitPrice(line), false)}</td><td className="px-2 py-2 text-right tabular-nums text-[#d7fffd]">{moneyRon(lineTotalValue(line), false)}</td></tr>)}
                      </tbody>
                      <tfoot><tr className="border-t border-[#7bd7d4]/35 bg-[#214e54]"><td colSpan={6} className="px-3 py-3 text-right text-xs uppercase tracking-[0.08em] text-[#d7fffd]">Total</td><td className="px-2 py-3 text-right">{quantity(doc.total_qty)}</td><td></td><td className="px-2 py-3 text-right text-sm text-white">{moneyRon(detailValue)}</td></tr></tfoot>
                    </table>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/12 bg-[#303a4c] px-4 py-3 text-[11px] text-white/45"><span>{doc.status === "preparation" ? "ESC: bezárás • a készlet már a sorok szerint át van mozgatva" : doc.status === "draft" ? "ESC: bezárás • a piszkozat nem módosította a készletet" : "ESC: bezárás • a PDF román nyelvű hivatalos formátum"}</span><button type="button" className={btnSoft} onClick={() => setDetail(null)}><X size={14} /> Bezárás</button></div>
            </div>
          </div>
        );
      })() : null}

      {createOpen ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/75 p-2 backdrop-blur-sm lg:items-center lg:p-4" onMouseDown={(event) => { if (event.currentTarget === event.target && !savingDocument) setCreateOpen(false); }}>
          <div className="flex max-h-[96vh] w-full max-w-[1460px] flex-col overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#263246] via-[#334154] to-[#2a8d8b]/55 px-4 py-3.5">
              <div className="flex min-w-0 items-start gap-3"><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><PackagePlus size={21} /></span><div><p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">{editingDocumentStatus === "preparation" ? "Előkészítés szerkesztése" : editingDraftId ? "Piszkozat szerkesztése" : "Új készletbizonylat"}</p><h2 className="mt-0.5 text-[22px]">{documentMeta(draftType).label}</h2><p className="mt-1 text-xs text-white/58">{editingDocumentStatus === "preparation" ? `${editingDraftNumber} • a készlet már át van mozgatva; a módosítás a különbözetet rendezi` : editingDraftId ? `${editingDraftNumber} • a készlet csak véglegesítéskor módosul` : "Vonalkódos termékfelvétel, piszkozat és hivatalos véglegesítés"}</p></div></div>
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
                {draftType === "supplier_return" ? <><label className={label}>Beszállító<CompactSelect value={supplierId} onChange={(next) => void loadSupplierReceptions(next)} placeholder="Válassz beszállítót" options={[{ value: "", label: "Válassz beszállítót" }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]} /></label><label className={label}>Kapcsolt receptió / számla<CompactSelect value={receptionId} onChange={setReceptionId} placeholder="Nincs megadva" options={[{ value: "", label: "Nincs megadva" }, ...selectedSupplierReceptions.map((reception) => ({ value: reception.id, label: `${reception.invoice_number || "Számla nélkül"} • ${reception.reception_date ? String(reception.reception_date).slice(0, 10) : "-"}` }))]} /></label></> : null}
                {draftType === "stock_correction" ? <label className={label}>Korrekció iránya<CompactSelect value={correctionDirection} onChange={(next) => { setCorrectionDirection(next as CorrectionDirection); setDraftLines({}); }} options={[{ value: "decrease", label: "Készlet csökkentése" }, { value: "increase", label: "Készlet növelése" }]} /></label> : null}
                {draftType !== "internal_transfer" ? <label className={label}>Művelet oka<CompactSelect value={reasonCode} onChange={setReasonCode} placeholder="Válassz okot" options={[{ value: "", label: "Válassz okot" }, ...REASON_OPTIONS[draftType].map((option) => ({ value: option.value, label: option.label }))]} /></label> : null}
                {draftType !== "internal_transfer" ? <label className={label}>Ok pontosítása<input className={input} value={reasonText} onChange={(event) => setReasonText(event.target.value)} placeholder={reasonCode === "other" ? "Kötelező rövid leírás" : "Opcionális pontosítás"} /></label> : null}
                <label className={label}>Hivatkozás / számlaszám<input className={input} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="Opcionális" /></label>
                <label className={`${label} md:col-span-2`}>Megjegyzés a bizonylathoz<input className={input} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Csak a dokumentumhoz tartozó releváns megjegyzés" /></label>
              </div>

              <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(360px,.85fr)_minmax(0,1.6fr)]">
                <div className="rounded-2xl border border-white/12 bg-[#404a5b] p-3">
                  <div className="flex items-center justify-between gap-2"><div><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Termék hozzáadása</p><h3 className="mt-1 flex items-center gap-2 text-sm"><Barcode size={16} /> Vonalkód vagy keresés</h3></div><button type="button" className={primaryBtn} onClick={() => setCameraOpen(true)}><Camera size={15} /> Kamera</button></div>
                  <label className="mt-3 grid gap-1.5 text-xs text-white/62">Vonalkód / USB scanner<div className="flex gap-2"><input autoFocus className={input} value={scanValue} onChange={(event) => setScanValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleScannedValue(scanValue); } }} placeholder="Csipogtasd be, majd Enter" /><button type="button" className={primaryBtn} onClick={() => handleScannedValue(scanValue)}><Barcode size={15} /></button></div></label>
                  <label className="mt-3 grid gap-1.5 text-xs text-white/62">Név / termékkód / méret<div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/38" /><input className={`${input} pl-9`} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Kezdj el gépelni..." /></div></label>
                  {productSearch ? <div className="mt-2 max-h-[330px] space-y-1.5 overflow-auto rounded-xl border border-white/10 bg-[#303a4c] p-1.5">{productSearchResults.map((item) => <button key={item.variant_id} type="button" onClick={() => addDraftItem(item)} className="flex w-full items-center gap-2 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-[#7bd7d4]/28 hover:bg-[#2a8d8b]/12"><ProductThumb item={item} className="h-11 w-11" /><span className="min-w-0 flex-1"><span className="block truncate text-xs text-white">{productTitle(item)}</span><span className="mt-0.5 block truncate text-[10px] text-white/45">{item.brand_name || "-"} • {item.color_name || item.color_code || "-"} • {item.size || "-"}</span><span className="mt-0.5 block truncate font-mono text-[9px] text-[#cffffd]/65">{visibleBarcode(item) || productCode(item) || "Azonosító nélkül"}</span></span><span className="shrink-0 rounded-full border border-white/12 bg-white/[0.05] px-2 py-1 text-[10px] text-white/62">{sourceLocationId ? `${availableAt(item.variant_id, sourceLocationId)} db` : "-"}</span></button>)}{!productSearchResults.length ? <div className="px-3 py-5 text-center text-xs text-white/42">Nincs találat.</div> : null}</div> : null}
                  <div className="mt-3 rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 px-3 py-2 text-[11px] leading-relaxed text-[#d7fffd]/82">Az USB-s olvasó billentyűzetként működik. Telefonon a Kamera gomb nyitja meg a hátsó kamerát. Ugyanazt a terméket újra beolvasva a darabszám nő.</div>
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 bg-[#303a4c] px-4 py-3"><div className="text-xs text-white/58"><span className="text-white">{draftLineArray.length} sor • {draftTotalQty} db • {moneyRon(draftTotalValue)}</span><span className="ml-2">{editingDocumentStatus === "preparation" ? "A készlet már át van mozgatva. Mentéskor csak a módosítás különbözete rendeződik." : "Piszkozatnál nincs készletmozgás. Csak a véglegesítés módosítja a készletet."}</span></div><div className="flex flex-wrap gap-2"><button type="button" className={btnSoft} onClick={() => setCreateOpen(false)} disabled={savingDocument}>Mégse</button><button type="button" className={editingDocumentStatus === "preparation" ? btnSoft : dangerBtn} onClick={() => void saveDraftDocument(true)} disabled={savingDocument}><Save size={15} /> {savingDocument ? "Mentés..." : editingDocumentStatus === "preparation" ? "Előkészítés mentése" : "Piszkozat mentése"}</button><button type="button" className={primaryBtn} onClick={() => void saveDocument()} disabled={savingDocument || !draftLineArray.length}><CheckCircle2 size={15} /> {savingDocument ? "Feldolgozás..." : editingDocumentStatus === "preparation" ? "Előkészítés lezárása" : "Bizonylat véglegesítése"}</button></div></div>
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

      {deleteTarget ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-rose-200/25 bg-[#4b5362] p-4 shadow-2xl"><div className="flex items-start gap-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200/28 bg-rose-500/14 text-rose-50"><AlertTriangle size={19} /></span><div><h3 className="text-lg">Végleges törlés</h3><p className="mt-1 text-sm leading-relaxed text-white/62">A(z) <span className="text-white">{deleteTarget.document_number}</span> {deleteTarget.status === "preparation" ? "előkészítés törlődik, és minden benne szereplő mozgatás visszakerül az eredeti készlethelyre." : deleteTarget.status === "draft" ? "piszkozat végleg törlődik. Készletmozgás nem történt." : "bizonylat végleg eltűnik az archívumból. A készletet ez nem írja vissza, mert a valós készletmozgás már megtörtént."}</p></div></div><div className="mt-4 flex justify-end gap-2"><button type="button" className={btnSoft} onClick={() => setDeleteTarget(null)} disabled={deleting}>Mégse</button><button type="button" className={dangerBtn} onClick={() => void confirmDelete()} disabled={deleting}><Trash2 size={15} /> {deleting ? "Törlés..." : "Végleges törlés"}</button></div></div>
        </div>
      ) : null}
    </div>
  );
}
