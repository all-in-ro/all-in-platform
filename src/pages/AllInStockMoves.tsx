import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  CheckCircle2,
  Activity,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Barcode,
  Boxes,
  CalendarDays,
  Clock3,
  Download,
  FileText,
  Filter,
  Home,
  ImageIcon,
  Loader2,
  MapPin,
  Minus,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  apiAifAddItemsToOpenPurchaseOrders,
  apiAifGetVariant,
} from "../lib/aif/api";

const page = "min-h-screen bg-[#4b5362] px-3 py-5 text-white font-normal sm:px-4 sm:py-7";
const shell = "mx-auto max-w-7xl space-y-4";
const panel = "overflow-hidden rounded-2xl border border-white/14 bg-white/[0.07] shadow-lg";
const panelHead = "flex flex-col gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between";
const btnSoft = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3 text-xs text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const historyBtn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#2a8d8b]/65 bg-[#2a8d8b] px-3 text-xs text-white shadow-[0_8px_18px_rgba(42,141,139,0.18)] transition hover:bg-[#319c99] focus:outline-none focus:ring-2 focus:ring-[#7bd7d4]/35 disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/18 bg-[#354153] px-2.5 text-[11px] text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtnSoft = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.08] px-2.5 text-[11px] text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerPrimaryBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-2.5 text-[11px] text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const rowPrimaryBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#2a8d8b]/55 bg-[#2a8d8b] px-2.5 text-[11px] text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const rowSoftBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.08] px-2.5 text-[11px] text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const rowDangerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-500 bg-red-600 px-2.5 text-[11px] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const redBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500 bg-red-600 px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(220,38,38,0.22)] hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50";
const tinyDangerBtn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-red-500 bg-red-600 px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(220,38,38,0.22)] hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50";
const input = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45";
const label = "grid gap-1.5 text-xs text-white/70";
const chipBase = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs transition-colors";
const chipActive = `${chipBase} border-[#2a8d8b]/60 bg-[#2a8d8b] text-white shadow-[0_0_0_1px_rgba(42,141,139,0.18)]`;
const chipIdle = `${chipBase} border-white/14 bg-white/[0.06] text-white/72 hover:bg-white/[0.10]`;

const AIF_BASE = "/api/aif";
const stockMovesChangedStorageKey = "allinfashion:stockMoves:changed:v1";
const stockMovesChangedEventName = "aif:stock-moves-changed";
const purchaseOrdersChangedStorageKey = "allinfashion:purchaseOrders:changed:v1";
const purchaseOrdersChangedEventName = "aif:purchase-orders-changed";

function goHome() {
  window.location.hash = "#allin";
}

type CompactSelectOption = {
  value: string;
  label: string;
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
  size?: "compact" | "default";
  menuMinWidth?: number;
};

function CompactSelect({
  value,
  options,
  onChange,
  placeholder = "Válassz",
  className = "",
  disabled = false,
  ariaLabel,
  size = "default",
  menuMinWidth = 220,
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

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const maxWidth = Math.min(360, window.innerWidth - viewportPadding * 2);
    const width = Math.min(Math.max(rect.width, menuMinWidth), maxWidth);
    const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding);
    const roomBelow = window.innerHeight - rect.bottom;
    const openUp = roomBelow < 250 && rect.top > roomBelow;
    setMenuPosition(openUp
      ? { left, width, bottom: Math.max(viewportPadding, window.innerHeight - rect.top + 6) }
      : { left, width, top: Math.min(window.innerHeight - viewportPadding, rect.bottom + 6) });
  }, [menuMinWidth]);

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

  const heightClass = size === "compact" ? "h-9 rounded-lg" : "h-10 rounded-xl";

  return (
    <div className={`min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full min-w-0 items-center justify-between gap-2 border border-white/22 bg-[#3f4959] px-3 text-left text-xs text-white outline-none transition hover:bg-[#465264] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18 disabled:cursor-not-allowed disabled:opacity-45 ${heightClass}`}
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
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__empty"}
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
        </div>,
        document.body,
      ) : null}
    </div>
  );
}


type AifLocation = {
  id: string;
  code: string;
  name: string;
  location_type?: string;
  is_active?: boolean;
};

function normalizeLocationSearch(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function defaultPurchaseOrderLocationId(locations: AifLocation[]) {
  const active = (locations || []).filter((location) => location.is_active !== false);
  const preferred = active.find((location) => {
    const code = normalizeLocationSearch(location.code);
    const name = normalizeLocationSearch(location.name);
    const type = normalizeLocationSearch(location.location_type);
    return (
      code === "main warehouse" ||
      code.includes("main warehouse") ||
      code.includes("miercurea ciuc") ||
      code.includes("csikszereda") ||
      name.includes("magazin miercurea ciuc") ||
      name.includes("miercurea ciuc") ||
      name.includes("csikszereda") ||
      type === "main warehouse"
    );
  });
  return String(preferred?.id || preferred?.code || "").trim();
}

type AifSupplier = {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
};

type AifMeta = {
  locations?: AifLocation[];
  suppliers?: AifSupplier[];
};

type AifStockItem = {
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  variant_id: string;
  barcode?: string | null;
  display_barcode?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  category_name_ro?: string | null;
  qty: number | string;
  reserved_qty: number | string;
  available_qty: number | string;
  updated_at?: string | null;
};

type AifStockMoveItem = {
  id: string;
  created_at: string;
  movement_type?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  qty_delta: number | string;
  qty_before?: number | string | null;
  qty_after?: number | string | null;
  actor?: string | null;
  direction: "in" | "out" | "adjust";
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  variant_id: string;
  barcode?: string | null;
  display_barcode?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  category_name_ro?: string | null;
  raw?: any;
};

type AifStockMoveTotals = {
  movement_count?: number;
  distinct_variants?: number;
  incoming_qty?: number | string;
  outgoing_qty?: number | string;
  net_qty?: number | string;
};

type AifVariantHistoryEvent = {
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
  raw?: any;
  location_name?: string | null;
  from_location_name?: string | null;
  to_location_name?: string | null;
  effective_buy_price?: number | string | null;
  effective_sell_price?: number | string | null;
  invoice_number?: string | null;
  source_file_name?: string | null;
  supplier_name?: string | null;
};

type AifVariantHistorySummary = {
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

type AifVariantHistoryResponse = {
  item?: (AifStockItem | AifStockMoveItem) & Record<string, any>;
  stock?: AifStockItem[];
  summary?: AifVariantHistorySummary;
  events?: AifVariantHistoryEvent[];
};

type RangePreset = "today" | "yesterday" | "last7" | "month" | "year" | "all" | "custom";
type DirectionFilter = "all" | "in" | "out" | "adjust";
type StockDocumentTypeFilter = "all" | "internal_transfer" | "supplier_return" | "damaged_writeoff" | "stock_correction";
type TabKey = "moves" | "stock";
type MessageTone = "info" | "error";

async function fetchAifJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AIF_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }

  return data as T;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeForPreset(preset: RangePreset): { from: string; to: string } {
  const today = startOfToday();
  const end = new Date(today);
  switch (preset) {
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: dateInputValue(y), to: dateInputValue(y) };
    }
    case "last7": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: dateInputValue(from), to: dateInputValue(end) };
    }
    case "month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: dateInputValue(from), to: dateInputValue(end) };
    }
    case "year": {
      const from = new Date(today.getFullYear(), 0, 1);
      return { from: dateInputValue(from), to: dateInputValue(end) };
    }
    case "all":
      return { from: "", to: "" };
    case "today":
    case "custom":
    default:
      return { from: dateInputValue(today), to: dateInputValue(end) };
  }
}

function n(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatQty(value: unknown) {
  const num = n(value);
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(num);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function firstImage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImage(item);
      if (found) return found;
    }
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["url", "src", "image", "imageUrl", "image_url", "originalSrc", "transformedSrc"]) {
      const raw = obj[key];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
  }
  return null;
}

function imageFor(item: Pick<AifStockItem, "image_url" | "images"> | Pick<AifStockMoveItem, "image_url" | "images">) {
  return item.image_url || firstImage(item.images) || null;
}

function displayName(item: Pick<AifStockItem, "title_ro" | "shopify_title"> | Pick<AifStockMoveItem, "title_ro" | "shopify_title">) {
  return item.title_ro || item.shopify_title || "Névtelen termék";
}

function displayBarcode(item: Pick<AifStockItem, "display_barcode" | "barcode"> | Pick<AifStockMoveItem, "display_barcode" | "barcode">) {
  return item.display_barcode || item.barcode || "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stockDocumentTypeFromMove(item: Pick<AifStockMoveItem, "source_type" | "raw">): StockDocumentTypeFilter {
  const raw = item.raw && typeof item.raw === "object" ? item.raw as Record<string, unknown> : {};
  const explicit = String(raw.documentType || raw.document_type || "").trim().toLowerCase();
  if (explicit === "internal_transfer" || explicit === "supplier_return" || explicit === "damaged_writeoff" || explicit === "stock_correction") return explicit;
  const source = String(item.source_type || "").trim().toLowerCase();
  if (source === "stock_transfer") return "internal_transfer";
  if (source === "supplier_return") return "supplier_return";
  if (source === "damaged_writeoff") return "damaged_writeoff";
  if (source === "stock_correction") return "stock_correction";
  return "all";
}

function stockDocumentTypeLabel(value: StockDocumentTypeFilter) {
  if (value === "internal_transfer") return "Belső átadás";
  if (value === "supplier_return") return "Beszállítói retur";
  if (value === "damaged_writeoff") return "Sérült / kivezetés";
  if (value === "stock_correction") return "Készletkorrekció";
  return "Minden bizonylat";
}

function movementDocumentNumber(item: Pick<AifStockMoveItem, "raw">) {
  const raw = item.raw && typeof item.raw === "object" ? item.raw as Record<string, unknown> : {};
  return String(raw.documentNumber || raw.document_number || "").trim();
}

function movementDocumentId(item: Pick<AifStockMoveItem, "raw">) {
  const raw = item.raw && typeof item.raw === "object" ? item.raw as Record<string, unknown> : {};
  return String(raw.documentId || raw.document_id || movementDocumentNumber(item)).trim();
}

function openMovementDocument(item: Pick<AifStockMoveItem, "raw">) {
  const id = movementDocumentId(item);
  if (!id) return;
  window.location.hash = `#allinproductmoves?document=${encodeURIComponent(id)}`;
}

function sourceLabel(item: Pick<AifStockMoveItem, "source_type" | "movement_type" | "raw">) {
  const source = String(item.source_type || "").toLowerCase();
  const movement = String(item.movement_type || "").toLowerCase();
  const rawReason = String((item.raw as any)?.reason || "").toLowerCase();
  const rawDirection = String((item.raw as any)?.direction || "").toLowerCase();
  const documentType = stockDocumentTypeFromMove(item);
  if (documentType !== "all") return stockDocumentTypeLabel(documentType);
  if (
    source.includes("archive") ||
    source.includes("removal") ||
    source.includes("stock_clear") ||
    rawReason.includes("archive") ||
    rawReason.includes("stock_clear")
  ) return "Készletről kivétel";
  if (source.includes("import_batch") || movement === "incoming") return "Bevételezés";
  if (source.includes("sale") || movement === "sale") return "Eladás";
  if (source.includes("transfer") || movement === "transfer") return "Áthelyezés";
  if (source.includes("manual_stock_edit") || movement === "manual_adjustment" || movement === "adjustment") {
    return rawDirection === "out" ? "Kézi kivétel" : rawDirection === "in" ? "Kézi bevétel" : "Kézi módosítás";
  }
  return movement || source || "Mozgás";
}

function movementReasonText(item: Pick<AifStockMoveItem, "raw">) {
  const raw = item.raw && typeof item.raw === "object" ? item.raw as Record<string, unknown> : {};
  const code = String(raw.reasonCode || raw.reason_code || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    inventory_difference: "Leltáreltérés",
    incorrect_reception: "Téves bevételezés",
    invoice_correction: "Számlakorrekció",
    damaged_or_lost: "Sérült vagy elveszett termék",
    admin_correction: "Adminisztrációs javítás",
    invoice_error: "Hibás számla",
    wrong_product: "Hibás termék",
    damaged_on_delivery: "Sérülten érkezett",
    quality_issue: "Minőségi probléma",
    damaged: "Sérült termék",
    lost: "Elveszett termék",
    theft: "Lopás",
    expired: "Lejárt / nem értékesíthető",
    input_error: "Rögzítési hiba",
    recount: "Újraszámolás",
    other: "Egyéb",
  };
  const explicit = String(raw.reasonText || raw.reason_text || "").trim();
  const note = String(raw.note || "").trim();
  const reason = explicit || labels[code] || "";
  return Array.from(new Set([reason, note].filter(Boolean))).join(" • ");
}

function directionMeta(item: AifStockMoveItem) {
  const delta = n(item.qty_delta);
  if (item.direction === "in" || delta > 0) {
    return {
      label: "Bejött",
      sign: "+",
      icon: ArrowDownLeft,
      cls: "border-[#2a8d8b] bg-[#2a8d8b] text-white shadow-[0_0_0_1px_rgba(42,141,139,0.28)]",
      dot: "bg-[#2a8d8b]",
    };
  }
  if (item.direction === "out" || delta < 0) {
    return {
      label: "Kiment",
      sign: "−",
      icon: ArrowUpRight,
      cls: "border-red-500 bg-red-600 text-white shadow-[0_0_0_1px_rgba(220,38,38,0.28)]",
      dot: "bg-red-400",
    };
  }
  return {
    label: "Korrekció",
    sign: "",
    icon: ArrowRightLeft,
    cls: "border-amber-300/30 bg-amber-500/16 text-amber-50",
    dot: "bg-amber-300",
  };
}


function formatMoney(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return "-";
  const num = Number(String(value).replace(",", "."));
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function priceNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const num = Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function sellWithoutTva(value: unknown, rate = 21) {
  const gross = priceNumber(value);
  if (gross === null) return null;
  return gross / (1 + rate / 100);
}

function markupWithoutTva(buyPrice: unknown, sellPrice: unknown) {
  const buy = priceNumber(buyPrice);
  const sellNet = sellWithoutTva(sellPrice);
  if (!buy || buy <= 0 || sellNet === null) return "-";
  const pct = ((sellNet - buy) / buy) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toLocaleString("hu-HU", { maximumFractionDigits: 0 })}%`;
}

function historyEventBadge(event: AifVariantHistoryEvent) {
  const type = String(event.event_type || "").toLowerCase();
  const direction = String(event.direction || "").toLowerCase();
  if (type === "transfer") return { label: "Áthelyezés", cls: "border-sky-300/30 bg-sky-500/14 text-sky-50" };
  if (type === "inventory") return { label: "Leltár", cls: "border-violet-300/30 bg-violet-500/14 text-violet-50" };
  if (type === "incoming" || direction === "in") return { label: "Bevételezés", cls: "border-[#2a8d8b]/45 bg-[#2a8d8b]/22 text-[#d7fffd]" };
  if (type === "outgoing" || direction === "out") return { label: "Kimenő", cls: "border-red-300/30 bg-red-500/14 text-red-50" };
  return { label: "Korrekció", cls: "border-amber-300/30 bg-amber-500/14 text-amber-50" };
}

function isTransferHistoryEvent(event: AifVariantHistoryEvent) {
  const type = String(event.event_type || "").toLowerCase();
  const source = String(event.source_type || "").toLowerCase();
  const reason = String(event.raw?.reason || "").toLowerCase();
  return type === "transfer" || source.includes("stock_transfer") || reason === "stock_transfer";
}

function historyEventTimestamp(value?: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function firstHistoryValue<T>(...values: Array<T | null | undefined | "">): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") return value as T;
  }
  return null;
}

/**
 * Egy készletáthelyezés az adatbázisban helyesen két technikai naplósor:
 *  - mínusz a forráshelyen
 *  - plusz a célhelyen
 *
 * A Termék History viszont üzleti eseményeket mutat, ezért a két oldalt a
 * transferId + lineNo alapján egyetlen áthelyezéssé vonjuk össze. Külön
 * transferId-ket nem mosunk össze, mert azok valóban külön mentések lehetnek.
 */
function logicalVariantHistoryEvents(rows: AifVariantHistoryEvent[]) {
  const normalEvents: AifVariantHistoryEvent[] = [];
  const transferGroups = new Map<string, AifVariantHistoryEvent[]>();

  for (const event of rows || []) {
    if (!isTransferHistoryEvent(event)) {
      normalEvents.push(event);
      continue;
    }

    const raw = event.raw && typeof event.raw === "object" ? event.raw : {};
    const transferId = String(raw.transferId || raw.transfer_id || "").trim();
    const lineNo = String(raw.lineNo || raw.line_no || "1").trim() || "1";

    // Régi, transferId nélküli rekordnál nem találgatunk. Inkább megmarad külön,
    // mint hogy két valódi áthelyezést véletlenül egy eseménnyé gyúrjunk.
    const key = transferId ? `${transferId}:${lineNo}` : `movement:${event.id}`;
    const group = transferGroups.get(key) || [];
    group.push(event);
    transferGroups.set(key, group);
  }

  const logicalTransfers = Array.from(transferGroups.entries()).map(([key, group]) => {
    const sourceLeg = group.find((event) => String(event.raw?.side || "").toLowerCase() === "source")
      || group.find((event) => n(event.qty_delta) < 0)
      || group[0];
    const targetLeg = group.find((event) => String(event.raw?.side || "").toLowerCase() === "target")
      || group.find((event) => n(event.qty_delta) > 0)
      || group[group.length - 1]
      || sourceLeg;
    const newest = group.slice().sort((a, b) => historyEventTimestamp(b.created_at) - historyEventTimestamp(a.created_at))[0] || sourceLeg;
    const rawSource = sourceLeg?.raw && typeof sourceLeg.raw === "object" ? sourceLeg.raw : {};
    const rawTarget = targetLeg?.raw && typeof targetLeg.raw === "object" ? targetLeg.raw : {};
    const quantity = Math.max(0, ...group.map((event) => Math.abs(n(event.qty_delta))));
    const fromLocationName = String(firstHistoryValue(
      rawSource.fromLocationName,
      rawTarget.fromLocationName,
      sourceLeg?.from_location_name,
      targetLeg?.from_location_name,
      sourceLeg?.location_name,
    ) || "");
    const toLocationName = String(firstHistoryValue(
      rawSource.toLocationName,
      rawTarget.toLocationName,
      sourceLeg?.to_location_name,
      targetLeg?.to_location_name,
      targetLeg?.location_name,
    ) || "");

    return {
      ...sourceLeg,
      id: `logical-transfer:${key}`,
      created_at: newest?.created_at || sourceLeg?.created_at || null,
      event_type: "transfer",
      direction: "adjust",
      movement_type: "transfer",
      source_type: "stock_transfer",
      qty_delta: quantity,
      qty_before: sourceLeg?.qty_before ?? null,
      qty_after: targetLeg?.qty_after ?? null,
      from_location_name: fromLocationName || sourceLeg?.from_location_name || null,
      to_location_name: toLocationName || targetLeg?.to_location_name || null,
      location_name: fromLocationName || sourceLeg?.location_name || null,
      effective_buy_price: firstHistoryValue(sourceLeg?.effective_buy_price, targetLeg?.effective_buy_price),
      effective_sell_price: firstHistoryValue(sourceLeg?.effective_sell_price, targetLeg?.effective_sell_price),
      supplier_name: firstHistoryValue(sourceLeg?.supplier_name, targetLeg?.supplier_name),
      invoice_number: firstHistoryValue(sourceLeg?.invoice_number, targetLeg?.invoice_number),
      source_file_name: firstHistoryValue(sourceLeg?.source_file_name, targetLeg?.source_file_name),
      raw: {
        ...rawTarget,
        ...rawSource,
        logicalTransfer: true,
        pairedMovementIds: group.map((event) => event.id),
        pairedMovementCount: group.length,
      },
    } satisfies AifVariantHistoryEvent;
  });

  return [...normalEvents, ...logicalTransfers]
    .sort((a, b) => historyEventTimestamp(b.created_at) - historyEventTimestamp(a.created_at));
}

function ProductHistoryOverlay({
  target,
  history,
  loading,
  error,
  onClose,
  onReload,
}: {
  target: AifStockItem | AifStockMoveItem | null;
  history: AifVariantHistoryResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onReload: () => void;
}) {
  if (!target) return null;
  const item = { ...(target as any), ...(history?.item || {}) } as AifStockItem & AifStockMoveItem & Record<string, any>;
  const summary = history?.summary || {};
  const events = logicalVariantHistoryEvents(history?.events || []);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm lg:items-center">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl border border-white/18 bg-[#404a5b] shadow-2xl">
        <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b border-white/12 bg-[#303a4c]/98 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 gap-3">
            <ProductThumb item={item} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#cffffd]/65">Termék History</p>
              <h2 className="mt-1 line-clamp-2 text-lg text-white">{displayName(item)}</h2>
              <p className="mt-1 text-xs text-white/55">{item.brand_name || "-"} • {item.color_name || "-"} • {item.size || "-"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onReload} disabled={loading} className={btnSoft}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Frissítés</button>
            <button type="button" onClick={onClose} className={btnSoft}><X size={15} /> Bezárás</button>
          </div>
        </div>
        <div className="space-y-3 p-4">
          {error ? <div className="rounded-xl border border-red-200/20 bg-red-500/12 px-3 py-2 text-sm text-red-50">{error}</div> : null}
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white/12 bg-white/[0.06] p-3"><p className="text-xs text-white/45">Készlet</p><p className="mt-1 text-xl text-white">{formatQty(summary.currentQty || 0)}</p></div>
            <div className="rounded-xl border border-white/12 bg-white/[0.06] p-3"><p className="text-xs text-white/45">Bejött</p><p className="mt-1 text-xl text-white">{formatQty(summary.totalIncomingQty || 0)}</p></div>
            <div className="rounded-xl border border-white/12 bg-white/[0.06] p-3"><p className="text-xs text-white/45">Kiment</p><p className="mt-1 text-xl text-white">{formatQty(summary.totalOutgoingQty || 0)}</p></div>
            <div className="rounded-xl border border-white/12 bg-white/[0.06] p-3"><p className="text-xs text-white/45">Átmozgatva</p><p className="mt-1 text-xl text-white">{formatQty(summary.totalTransferredQty || 0)}</p></div>
          </div>
          {loading && !history ? <div className="rounded-xl border border-white/12 bg-white/[0.05] p-6 text-center text-white/55">Betöltés...</div> : null}
          <div className="divide-y divide-white/10 rounded-2xl border border-white/12 bg-white/[0.05]">
            {events.map((event) => {
              const badge = historyEventBadge(event);
              const route = event.from_location_name || event.to_location_name ? `${event.from_location_name || event.location_name || "-"} → ${event.to_location_name || event.location_name || "-"}` : event.location_name || "-";
              return (
                <div key={event.id} className="grid gap-3 px-4 py-3 md:grid-cols-[128px,1fr,150px]">
                  <div className="text-xs text-white/55">{formatDateTime(event.created_at)}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs ${badge.cls}`}>{badge.label}</span>
                      <span className="text-sm text-white">
                        {isTransferHistoryEvent(event)
                          ? `${formatQty(Math.abs(n(event.qty_delta)))} db`
                          : `${n(event.qty_delta) > 0 ? "+" : ""}${formatQty(event.qty_delta)}`}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-white/60">{route}</p>
                    {event.supplier_name || event.invoice_number || event.source_file_name ? <p className="mt-1 truncate text-xs text-white/42">{[event.supplier_name, event.invoice_number, event.source_file_name].filter(Boolean).join(" • ")}</p> : null}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#303a4c] px-3 py-2 text-xs text-white/62">
                    <div>Vételár: <span className="text-white">{formatMoney(event.effective_buy_price)}</span></div>
                    <div className="mt-1">Eladási: <span className="text-white">{formatMoney(event.effective_sell_price)}</span></div>
                    <div className="mt-1">Haszon: <span className="text-[#cffffd]">{markupWithoutTva(event.effective_buy_price, event.effective_sell_price)}</span></div>
                  </div>
                </div>
              );
            })}
            {!events.length && !loading ? <div className="px-4 py-10 text-center text-sm text-white/55">Nincs naplózott esemény.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function reportTitle(kind: "in" | "out") {
  return kind === "in" ? "Bejövő készletmozgások" : "Kimenő készletmozgások";
}

function writeStockMovementPdfWindow(win: Window, params: {
  kind: "in" | "out";
  rows: AifStockMoveItem[];
  locationName: string;
  rangeLabel: string;
  search: string;
}) {
  const { kind, rows, locationName, rangeLabel, search } = params;
  const title = reportTitle(kind);
  const accent = kind === "in" ? "#2a8d8b" : "#dc2626";
  const soft = kind === "in" ? "#e8fbfa" : "#fff1f1";
  const totalQty = rows.reduce((sum, row) => sum + Math.abs(n(row.qty_delta)), 0);
  const createdAt = new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const bodyRows = rows.map((row, index) => {
    const qty = Math.abs(n(row.qty_delta));
    const barcode = displayBarcode(row) || "-";
    const product = displayName(row);
    const variant = [row.brand_name, row.color_name, row.size].filter(Boolean).join(" · ") || "-";
    const img = imageFor(row);
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td>
          <div class="product">
            ${img ? `<img class="thumb" src="${escapeHtml(img)}" alt="">` : `<div class="thumb noimg">Kép</div>`}
            <div>
              <strong>${escapeHtml(product)}</strong>
              <div class="muted">Vonalkód: ${escapeHtml(barcode)}</div>
              <div class="muted">${escapeHtml(variant)}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(row.location_name || "-")}</td>
        <td>${escapeHtml(formatDateTime(row.created_at))}</td>
        <td class="num">${escapeHtml(formatQty(row.qty_before ?? 0))}</td>
        <td class="num delta">${kind === "in" ? "+" : "-"}${escapeHtml(formatQty(qty))}</td>
        <td class="num">${escapeHtml(formatQty(row.qty_after ?? 0))}</td>
        <td>${escapeHtml([sourceLabel(row), movementReasonText(row)].filter(Boolean).join(" • "))}</td>
      </tr>`;
  }).join("");

  const html = `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} - AllInFashion</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #172033; background: #fff; }
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; border-bottom: 3px solid ${accent}; padding-bottom: 14px; margin-bottom: 14px; }
  .brand { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #607086; }
  h1 { margin: 4px 0 0; font-size: 24px; line-height: 1.15; color: #111827; }
  .pill { display: inline-block; border: 1px solid ${accent}; background: ${soft}; color: ${accent}; border-radius: 999px; padding: 7px 12px; font-size: 12px; font-weight: 700; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 16px; }
  .card { border: 1px solid #d8dee8; border-radius: 12px; padding: 10px; background: #f8fafc; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
  .value { margin-top: 4px; font-size: 16px; font-weight: 700; color: #111827; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th { text-align: left; background: #263247; color: #fff; padding: 8px 7px; border: 1px solid #263247; }
  tbody td { vertical-align: top; padding: 7px; border: 1px solid #d9e0eb; }
  tbody tr:nth-child(even) td { background: #f7f9fc; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .delta { color: ${accent}; font-weight: 800; }
  .muted { color: #667085; font-size: 9.5px; margin-top: 2px; }
  .product { display: flex; align-items: center; gap: 8px; min-width: 260px; }
  .thumb { width: 36px; height: 36px; object-fit: cover; border-radius: 9px; border: 1px solid #d9e0eb; background: #eef2f8; flex: 0 0 auto; }
  .noimg { display: flex; align-items: center; justify-content: center; color: #8a95a8; font-size: 8px; }
  .foot { margin-top: 12px; color: #667085; font-size: 10px; display: flex; justify-content: space-between; gap: 12px; }
  @media print { .no-print { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="top">
    <div>
      <div class="brand">AllInFashion · Raktármozgás</div>
      <h1>${escapeHtml(title)}</h1>
    </div>
    <div class="pill">${kind === "in" ? "BEJÖVŐ" : "KIMENŐ"}</div>
  </div>
  <div class="meta">
    <div class="card"><div class="label">Időszak</div><div class="value">${escapeHtml(rangeLabel)}</div></div>
    <div class="card"><div class="label">Helyszín</div><div class="value">${escapeHtml(locationName)}</div></div>
    <div class="card"><div class="label">Sorok</div><div class="value">${escapeHtml(formatQty(rows.length))}</div></div>
    <div class="card"><div class="label">Összes darab</div><div class="value">${escapeHtml(formatQty(totalQty))}</div></div>
  </div>
  ${search.trim() ? `<div class="card" style="margin-bottom:12px"><div class="label">Keresés</div><div class="value">${escapeHtml(search.trim())}</div></div>` : ""}
  <table>
    <thead>
      <tr>
        <th style="width:34px">#</th>
        <th>Termék</th>
        <th>Helyszín</th>
        <th>Dátum / óra</th>
        <th>Előtte</th>
        <th>${kind === "in" ? "Bejött" : "Kiment"}</th>
        <th>Utána</th>
        <th>Forrás</th>
      </tr>
    </thead>
    <tbody>${bodyRows || `<tr><td colspan="8" style="text-align:center;padding:24px;color:#667085">Nincs exportálható sor.</td></tr>`}</tbody>
  </table>
  <div class="foot">
    <div>Generálva: ${escapeHtml(createdAt)}</div>
    <div>AllInFashion raktárnapló</div>
  </div>
  <script>window.setTimeout(() => { window.focus(); window.print(); }, 350);</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

function ProductThumb({
  item,
  compact = false,
}: {
  item: Pick<AifStockItem, "image_url" | "images" | "title_ro"> | Pick<AifStockMoveItem, "image_url" | "images" | "title_ro">;
  compact?: boolean;
}) {
  const src = imageFor(item);
  const sizeClass = compact ? "h-11 w-11 rounded-lg" : "h-14 w-14 rounded-xl";
  const [preview, setPreview] = useState<{ left: number; top: number; size: number } | null>(null);

  const showPreview = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!src || typeof window === "undefined") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const size = Math.max(160, Math.min(280, window.innerWidth - 24, window.innerHeight - 24));
    const gap = 12;
    const rightSide = rect.right + gap;
    const left = rightSide + size <= window.innerWidth - 8
      ? rightSide
      : Math.max(8, rect.left - size - gap);
    const top = Math.min(
      Math.max(8, rect.top + rect.height / 2 - size / 2),
      Math.max(8, window.innerHeight - size - 8),
    );
    setPreview({ left, top, size });
  };

  return (
    <>
      <div
        className={`${sizeClass} ${src ? "cursor-zoom-in" : ""} shrink-0 overflow-hidden border border-white/12 bg-white/[0.08]`}
        onMouseEnter={showPreview}
        onMouseLeave={() => setPreview(null)}
      >
        {src ? (
          <img src={src} alt={item.title_ro || "Termékkép"} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/35">
            <ImageIcon size={compact ? 17 : 20} />
          </div>
        )}
      </div>
      {src && preview && typeof document !== "undefined" ? createPortal(
        <div
          aria-hidden="true"
          className="overflow-hidden rounded-2xl border border-[#7bd7d4]/55 bg-[#263246] p-2 shadow-[0_22px_60px_rgba(0,0,0,.62)]"
          style={{
            position: "fixed",
            zIndex: 600,
            left: preview.left,
            top: preview.top,
            width: preview.size,
            height: preview.size,
            pointerEvents: "none",
          }}
        >
          <img src={src} alt="" className="h-full w-full rounded-xl bg-white object-contain" />
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function ProductText({
  item,
  compact = false,
}: {
  item: AifStockItem | AifStockMoveItem;
  compact?: boolean;
}) {
  const barcode = displayBarcode(item);
  return (
    <div className="min-w-0">
      <div className={`flex flex-wrap items-center ${compact ? "gap-1.5" : "gap-2"}`}>
        {item.brand_name && <span className={`${compact ? "text-[10px]" : "text-xs"} font-normal uppercase tracking-[0.10em] text-[#9fd7d5]`}>{item.brand_name}</span>}
        {item.category_name_ro && <span className={compact ? "text-[10px] text-white/42" : "text-[11px] text-white/42"}>{item.category_name_ro}</span>}
      </div>
      <p className={`${compact ? "mt-0 truncate text-[13px] font-normal leading-tight" : "mt-0.5 truncate text-sm font-normal sm:text-[15px]"} text-white`}>{displayName(item)}</p>
      <div className={`${compact ? "mt-0.5 gap-1.5 text-[10px]" : "mt-1 gap-2 text-xs"} flex flex-wrap items-center text-white/58`}>
        {barcode && (
          <span className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] ${compact ? "px-1.5 py-0" : "px-2 py-0.5"}`}>
            <Barcode size={compact ? 10 : 12} />
            Vonalkód: {barcode}
          </span>
        )}
        {(item.color_name || item.size) && (
          <span className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] ${compact ? "px-1.5 py-0" : "px-2 py-0.5"}`}>
            {item.color_name || "-"} · {item.size || "-"}
          </span>
        )}
      </div>
    </div>
  );
}


function splitValues(value: unknown) {
  return String(value || "")
    .split(/[;,|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function supplierCandidatesForVariant(detail: any, suppliers: AifSupplier[]) {
  const item = detail?.item && typeof detail.item === "object" ? detail.item : {};
  const supplierCodes = Array.isArray(detail?.supplierCodes) ? detail.supplierCodes : [];
  const ids = new Set<string>();
  const codes = new Set<string>();
  const names = new Set<string>();

  for (const value of [item.supplier_id, item.supplierId, item.supplier_ids, item.supplierIds]) {
    splitValues(value).forEach((entry) => ids.add(entry));
  }
  for (const value of [item.supplier_code, item.supplierCode, item.supplier_codes, item.supplierCodes]) {
    splitValues(value).forEach((entry) => codes.add(entry.toLowerCase()));
  }
  for (const value of [item.supplier_name, item.supplierName, item.supplier_names, item.supplierNames]) {
    splitValues(value).forEach((entry) => names.add(entry.toLowerCase()));
  }

  for (const entry of supplierCodes) {
    if (!entry || typeof entry !== "object") continue;
    splitValues(entry.supplier_id ?? entry.supplierId).forEach((value) => ids.add(value));
    splitValues(entry.supplier_code ?? entry.supplierCode).forEach((value) => codes.add(value.toLowerCase()));
    splitValues(entry.supplier_name ?? entry.supplierName).forEach((value) => names.add(value.toLowerCase()));
  }

  const matched = suppliers.filter((supplier) =>
    ids.has(String(supplier.id))
    || codes.has(String(supplier.code || "").toLowerCase())
    || names.has(String(supplier.name || "").toLowerCase()),
  );
  return matched.length ? matched : suppliers;
}

function StatCard({ icon: Icon, label, value, hint, tone = "green" }: { icon: ComponentType<{ size?: number; className?: string }>; label: string; value: ReactNode; hint?: string; tone?: "green" | "red" | "neutral" }) {
  const iconTone = tone === "red"
    ? "border-red-300/32 bg-red-500/17 text-red-100"
    : tone === "neutral"
      ? "border-white/18 bg-white/[0.08] text-white/72"
      : "border-[#2a8d8b]/32 bg-[#2a8d8b]/18 text-[#a7e7e5]";
  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-white/55">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{value}</p>
          {hint && <p className="mt-1 text-xs text-white/45">{hint}</p>}
        </div>
        <div className={`rounded-xl border p-2 ${iconTone}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function AllInStockMoves() {
  const initialRange = useMemo(() => rangeForPreset("today"), []);
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [suppliers, setSuppliers] = useState<AifSupplier[]>([]);
  const [locationId, setLocationId] = useState("");
  const [stockRows, setStockRows] = useState<AifStockItem[]>([]);
  const [moveRows, setMoveRows] = useState<AifStockMoveItem[]>([]);
  const [totals, setTotals] = useState<AifStockMoveTotals>({});
  const [activeTab, setActiveTab] = useState<TabKey>("moves");
  const [preset, setPreset] = useState<RangePreset>("today");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [documentType, setDocumentType] = useState<StockDocumentTypeFilter>("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [deleteCandidate, setDeleteCandidate] = useState<AifStockMoveItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedMoveIds, setSelectedMoveIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exportingDirection, setExportingDirection] = useState<"in" | "out" | null>(null);
  const [historyTarget, setHistoryTarget] = useState<AifStockItem | AifStockMoveItem | null>(null);
  const [variantHistory, setVariantHistory] = useState<AifVariantHistoryResponse | null>(null);
  const [variantHistoryLoading, setVariantHistoryLoading] = useState(false);
  const [variantHistoryError, setVariantHistoryError] = useState<string | null>(null);
  const [reorderTarget, setReorderTarget] = useState<AifStockMoveItem | null>(null);
  const [reorderVariantDetail, setReorderVariantDetail] = useState<any>(null);
  const [reorderSupplierId, setReorderSupplierId] = useState("");
  const [reorderLocationId, setReorderLocationId] = useState("");
  const [reorderQty, setReorderQty] = useState(1);
  const [reorderLoading, setReorderLoading] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [reorderIdempotencyKey, setReorderIdempotencyKey] = useState("");
  const refreshInFlightRef = useRef(false);

  const closeVariantHistory = useCallback(() => {
    setHistoryTarget(null);
    setVariantHistory(null);
    setVariantHistoryError(null);
    setVariantHistoryLoading(false);
  }, []);

  const openVariantHistory = useCallback(async (item: AifStockItem | AifStockMoveItem) => {
    const id = String(item?.variant_id || "").trim();
    if (!id) {
      setMessageTone("error");
      setMessage("Ehhez a sorhoz nincs termékazonosító, ezért a Termék History nem nyitható meg.");
      return;
    }
    setHistoryTarget(item);
    setVariantHistory(null);
    setVariantHistoryError(null);
    setVariantHistoryLoading(true);
    try {
      const data = await fetchAifJSON<AifVariantHistoryResponse>(`/variants/${encodeURIComponent(id)}/history?limit=700`);
      setVariantHistory(data);
    } catch (e: any) {
      setVariantHistoryError(e?.message || "A Termék History betöltése nem sikerült.");
    } finally {
      setVariantHistoryLoading(false);
    }
  }, []);

  const reloadVariantHistory = useCallback(() => {
    if (historyTarget) void openVariantHistory(historyTarget);
  }, [historyTarget, openVariantHistory]);

  const closeReorder = useCallback(() => {
    if (reorderSaving) return;
    setReorderTarget(null);
    setReorderVariantDetail(null);
    setReorderSupplierId("");
    setReorderLocationId("");
    setReorderQty(1);
    setReorderLoading(false);
    setReorderError(null);
    setReorderIdempotencyKey("");
  }, [reorderSaving]);

  const openReorder = useCallback(async (row: AifStockMoveItem) => {
    if (!(row.direction === "out" || n(row.qty_delta) < 0)) return;
    const variantId = String(row.variant_id || "").trim();
    if (!variantId) {
      setMessageTone("error");
      setMessage("Ehhez a kimenő sorhoz nincs termékazonosító, ezért nem rendelhető újra.");
      return;
    }

    setReorderTarget(row);
    setReorderVariantDetail(null);
    setReorderSupplierId("");
    setReorderLocationId(defaultPurchaseOrderLocationId(locations));
    setReorderQty(Math.max(1, Math.abs(Math.trunc(n(row.qty_delta)))));
    setReorderError(null);
    setReorderLoading(true);
    setReorderIdempotencyKey(
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `stock-move-reorder:${crypto.randomUUID()}`
        : `stock-move-reorder:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    );

    try {
      const detail = await apiAifGetVariant(variantId);
      setReorderVariantDetail(detail);
      const candidates = supplierCandidatesForVariant(detail, suppliers);
      if (candidates.length === 1) setReorderSupplierId(candidates[0].id);
    } catch (error: any) {
      setReorderError(error?.message || "A termék beszállítói adatai nem tölthetők be.");
    } finally {
      setReorderLoading(false);
    }
  }, [locations, suppliers]);

  const reorderSupplierOptions = useMemo(() => {
    if (!reorderTarget) return suppliers;
    return supplierCandidatesForVariant(reorderVariantDetail, suppliers);
  }, [reorderTarget, reorderVariantDetail, suppliers]);

  const notifyPurchaseOrdersChanged = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const payload = { at: new Date().toISOString() };
      window.localStorage.setItem(purchaseOrdersChangedStorageKey, JSON.stringify(payload));
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent(purchaseOrdersChangedEventName, { detail: { at: new Date().toISOString() } }));
    } catch {}
  }, []);

  const submitReorder = useCallback(async () => {
    if (!reorderTarget || reorderSaving) return;
    if (!reorderSupplierId) {
      setReorderError("Válaszd ki a beszállítót.");
      return;
    }
    if (!reorderLocationId) {
      setReorderError("Válaszd ki a rendelés központi célhelyét.");
      return;
    }

    setReorderSaving(true);
    setReorderError(null);
    try {
      const result = await apiAifAddItemsToOpenPurchaseOrders({
        items: [{
          supplierId: reorderSupplierId,
          variantId: reorderTarget.variant_id,
          qty: Math.max(1, Math.trunc(reorderQty)),
          unitPrice: null,
          note: movementDocumentNumber(reorderTarget)
            ? `Újrarendelés a ${movementDocumentNumber(reorderTarget)} készletmozgásból.`
            : "Újrarendelés a készletmozgás naplóból.",
        }],
        targetLocationId: reorderLocationId,
        currencyCode: "RON",
        note: "Készletmozgásból indított utánrendelés.",
        idempotencyKey: reorderIdempotencyKey,
      });
      const order = result.orders?.[0];
      const orderText = order?.orderNumber || "a nyitott rendelés";
      setMessageTone("info");
      setMessage(
        order?.created
          ? `${formatQty(reorderQty)} db hozzáadva. Új nyitott rendelés készült: ${orderText}.`
          : `${formatQty(reorderQty)} db hozzáadva a ${orderText} nyitott rendeléshez.`,
      );
      notifyPurchaseOrdersChanged();
      setReorderTarget(null);
      setReorderVariantDetail(null);
      setReorderSupplierId("");
      setReorderLocationId("");
      setReorderQty(1);
      setReorderIdempotencyKey("");
    } catch (error: any) {
      setReorderError(error?.message || "A termék rendeléshez adása nem sikerült.");
    } finally {
      setReorderSaving(false);
    }
  }, [notifyPurchaseOrdersChanged, reorderIdempotencyKey, reorderLocationId, reorderQty, reorderSaving, reorderSupplierId, reorderTarget]);

  useEffect(() => {
    if (!historyTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeVariantHistory();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [historyTarget, closeVariantHistory]);

  useEffect(() => {
    if (!reorderTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !reorderSaving) closeReorder();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeReorder, reorderSaving, reorderTarget]);

  useEffect(() => {
    let alive = true;
    fetchAifJSON<AifMeta>("/meta")
      .then((data) => {
        if (!alive) return;
        const activeLocations = (data.locations || []).filter((loc) => loc.is_active !== false);
        const activeSuppliers = (data.suppliers || []).filter((supplier) => supplier.is_active !== false);
        setLocations(activeLocations);
        setSuppliers(activeSuppliers);
      })
      .catch((e) => {
        setMessageTone("error");
        setMessage(e.message || "A helyszínek betöltése nem sikerült.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedLocation = useMemo(
    () => locations.find((loc) => loc.id === locationId || loc.code === locationId) || null,
    [locations, locationId]
  );

  const selectedLocationName = selectedLocation?.name || "Minden helyszín";

  const buildStockQuery = useCallback(() => {
    const q = new URLSearchParams();
    if (locationId) q.set("location", locationId);
    if (search.trim()) q.set("search", search.trim());
    return q;
  }, [locationId, search]);

  const buildMoveQuery = useCallback((override?: { direction?: DirectionFilter | "in" | "out"; limit?: number }) => {
    const q = new URLSearchParams();
    if (locationId) q.set("location", locationId);
    if (search.trim()) q.set("search", search.trim());
    const nextDirection = override?.direction ?? direction;
    if (nextDirection !== "all") q.set("direction", nextDirection);
    if (documentType !== "all") q.set("documentType", documentType);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    q.set("limit", String(override?.limit || 350));
    return q;
  }, [direction, documentType, from, locationId, search, to]);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    if (!options?.silent) setLoading(true);
    setMessage(null);
    setMessageTone("info");
    try {
      const stockQ = buildStockQuery();
      const movesQ = buildMoveQuery({ limit: 350 });
      const [stockData, moveData] = await Promise.all([
        fetchAifJSON<{ items: AifStockItem[] }>(`/stock?${stockQ.toString()}`),
        fetchAifJSON<{ items: AifStockMoveItem[]; totals: AifStockMoveTotals }>(`/stock-movements?${movesQ.toString()}`),
      ]);
      const nextMoveRows = moveData.items || [];
      setStockRows(stockData.items || []);
      setMoveRows(nextMoveRows);
      setSelectedMoveIds((current) => {
        const visibleIds = new Set(nextMoveRows.map((row) => String(row.id)));
        const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
        return next.size === current.size ? current : next;
      });
      setTotals(moveData.totals || {});
    } catch (e: any) {
      setMessageTone("error");
      setMessage(e.message || "A készletmozgások betöltése nem sikerült.");
    } finally {
      refreshInFlightRef.current = false;
      if (!options?.silent) setLoading(false);
    }
  }, [buildMoveQuery, buildStockQuery]);

  const notifyStockMovesChanged = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(stockMovesChangedStorageKey, String(Date.now()));
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent(stockMovesChangedEventName));
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshSilently = () => refresh({ silent: true });
    const onStorage = (event: StorageEvent) => {
      if (event.key === stockMovesChangedStorageKey) refreshSilently();
    };
    const onVisibility = () => {
      if (!document.hidden) refreshSilently();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(stockMovesChangedEventName, refreshSilently as EventListener);
    window.addEventListener("focus", refreshSilently);
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(() => {
      if (!document.hidden) refreshSilently();
    }, 12000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(stockMovesChangedEventName, refreshSilently as EventListener);
      window.removeEventListener("focus", refreshSilently);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  const stockTotals = useMemo(() => {
    return stockRows.reduce(
      (acc, row) => {
        acc.qty += n(row.qty);
        acc.reserved += n(row.reserved_qty);
        acc.available += n(row.available_qty);
        return acc;
      },
      { qty: 0, reserved: 0, available: 0 }
    );
  }, [stockRows]);

  const presetOptions: { key: RangePreset; label: string }[] = [
    { key: "today", label: "Ma" },
    { key: "yesterday", label: "Tegnap" },
    { key: "last7", label: "7 nap" },
    { key: "month", label: "Hónap" },
    { key: "year", label: "Év" },
    { key: "all", label: "Mind" },
  ];

  const rangeLabel = useMemo(() => {
    if (!from && !to) return "Minden dátum";
    if (from && to && from === to) return formatDateOnly(from);
    return `${from ? formatDateOnly(from) : "kezdettől"} - ${to ? formatDateOnly(to) : "mostanáig"}`;
  }, [from, to]);

  const handlePreset = (next: RangePreset) => {
    setPreset(next);
    const range = rangeForPreset(next);
    setFrom(range.from);
    setTo(range.to);
  };

  const confirmDeleteMovement = useCallback(async () => {
    if (!deleteCandidate?.id) return;
    const id = deleteCandidate.id;
    setDeletingId(id);
    setMessage(null);
    setMessageTone("info");
    try {
      await fetchAifJSON<{ ok: true }>(`/stock-movements/${encodeURIComponent(id)}`, { method: "DELETE" });
      setDeleteCandidate(null);
      notifyStockMovesChanged();
      await refresh({ silent: true });
      setMessageTone("info");
      setMessage("A naplóbejegyzés végleg törölve. A készlet mennyisége nem változott, csak a naplóbejegyzés került eltávolításra.");
    } catch (e: any) {
      setMessageTone("error");
      setMessage(e.message || "A naplóbejegyzés törlése nem sikerült.");
    } finally {
      setDeletingId(null);
    }
  }, [deleteCandidate, notifyStockMovesChanged, refresh]);

  const selectedMoveCount = selectedMoveIds.size;
  const allVisibleMovesSelected = moveRows.length > 0 && moveRows.every((row) => selectedMoveIds.has(String(row.id)));

  const toggleMoveSelection = useCallback((id: string) => {
    setSelectedMoveIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisibleMoves = useCallback(() => {
    setSelectedMoveIds((current) => {
      const next = new Set(current);
      const visibleIds = moveRows.map((row) => String(row.id));
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }, [moveRows]);

  const confirmBulkDeleteMovements = useCallback(async () => {
    const ids = Array.from(selectedMoveIds);
    if (!ids.length) return;
    setBulkDeleting(true);
    setMessage(null);
    setMessageTone("info");
    try {
      const result = await fetchAifJSON<{ deletedCount?: number; deletedIds?: string[] }>("/stock-movements/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      const deletedIds = new Set((result.deletedIds || ids).map(String));
      setMoveRows((current) => current.filter((row) => !deletedIds.has(String(row.id))));
      setSelectedMoveIds(new Set());
      setBulkDeleteOpen(false);
      notifyStockMovesChanged();
      await refresh({ silent: true });
      setMessageTone("info");
      setMessage(`${formatQty(result.deletedCount ?? deletedIds.size)} kijelölt naplóbejegyzés végleg törölve. A készlet mennyisége nem változott.`);
    } catch (e: any) {
      setMessageTone("error");
      setMessage(e?.message || "A kijelölt naplóbejegyzések törlése nem sikerült.");
    } finally {
      setBulkDeleting(false);
    }
  }, [notifyStockMovesChanged, refresh, selectedMoveIds]);

  const exportPdf = useCallback(async (kind: "in" | "out") => {
    if (typeof window === "undefined") return;
    const popup = window.open("", "_blank", "width=1200,height=820");
    if (!popup) {
      setMessageTone("error");
      setMessage("A böngésző blokkolta a PDF ablakot. Engedélyezd a felugró ablakot ennél az oldalnál.");
      return;
    }
    const title = reportTitle(kind);
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#17202f"><h2>${escapeHtml(title)}</h2><p>PDF előkészítése...</p></body></html>`);
    popup.document.close();

    setExportingDirection(kind);
    setMessage(null);
    setMessageTone("info");
    try {
      const q = buildMoveQuery({ direction: kind, limit: 2000 });
      const data = await fetchAifJSON<{ items: AifStockMoveItem[] }>(`/stock-movements?${q.toString()}`);
      const rows = data.items || [];
      writeStockMovementPdfWindow(popup, { kind, rows, locationName: selectedLocationName, rangeLabel, search });
      if (!rows.length) {
        setMessageTone("info");
        setMessage(kind === "in" ? "Nincs bejövő mozgás a megadott szűrésre." : "Nincs kimenő mozgás a megadott szűrésre.");
      }
    } catch (e: any) {
      popup.document.open();
      popup.document.write(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>PDF hiba</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#17202f"><h2>PDF export hiba</h2><p>${escapeHtml(e.message || "A PDF előkészítése nem sikerült.")}</p></body></html>`);
      popup.document.close();
      setMessageTone("error");
      setMessage(e.message || "A PDF export nem sikerült.");
    } finally {
      setExportingDirection(null);
    }
  }, [buildMoveQuery, rangeLabel, search, selectedLocationName]);

  return (
    <div className={page}>
      <div className={shell}>
        <header className="sticky top-2 z-50 rounded-2xl border border-white/20 bg-[#303a4c]/95 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.05] backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] border-l-4 border-[#7bd7d4]/70 pl-3">
              <p className="text-[11px] uppercase tracking-[0.18em] leading-none text-[#cffffd]/70">AllInFashion</p>
              <h1 className="mt-1 text-xl leading-tight tracking-tight text-white">Raktármozgás / készlet</h1>
              <p className="mt-0.5 text-[11px] leading-snug text-white/52">Termékes készletnézet és mozgásnapló</p>
            </div>
            <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("moves")}
                className={activeTab === "moves" ? headerPrimaryBtn : headerBtnSoft}
              >
                <Activity size={15} /> Mozgásnapló
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("stock")}
                className={activeTab === "stock" ? headerPrimaryBtn : headerBtnSoft}
              >
                <Boxes size={15} /> Jelenlegi készlet
              </button>
              <button
                type="button"
                onClick={() => refresh()}
                disabled={loading}
                className={headerBtnSoft}
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Frissítés
              </button>
              <button className={`${headerBtn} ml-2 border-white/30 bg-[#263246] px-3`} onClick={goHome} type="button" title="Kezdőlap">
                <Home size={15} /> Kezdőlap
              </button>
            </div>
          </div>
        </header>

        <div className={panel}>
          <div className={panelHead}>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">Szűrés</p>
              <h2 className="mt-1 flex items-center gap-2 text-base font-semibold"><SlidersHorizontal size={17} /> Mit nézzünk?</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("moves")}
                className={activeTab === "moves" ? primaryBtn : btnSoft}
              >
                <Activity size={15} /> Mozgásnapló ({formatQty(totals.movement_count || 0)})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("stock")}
                className={activeTab === "stock" ? primaryBtn : btnSoft}
              >
                <Boxes size={15} /> Jelenlegi készlet ({formatQty(stockRows.length)})
              </button>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(190px,0.9fr)_minmax(220px,1.1fr)_minmax(260px,1.3fr)_minmax(150px,0.65fr)_minmax(180px,0.8fr)_auto] xl:items-end">
              <label className={label}>
                Helyszín
                <CompactSelect
                  value={locationId}
                  onChange={setLocationId}
                  placeholder="Minden helyszín"
                  options={[
                    { value: "", label: "Minden helyszín" },
                    ...locations.map((loc) => ({ value: loc.id || loc.code, label: loc.name })),
                  ]}
                />
              </label>

              <label className={label}>
                Termék / vonalkód keresés
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={15} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") refresh(); }}
                    placeholder="Terméknév, márka, vonalkód..."
                    className={`${input} w-full pl-9 pr-9`}
                  />
                  {search && (
                    <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white">
                      <X size={15} />
                    </button>
                  )}
                </div>
              </label>

              <div className="grid gap-1.5 text-xs text-white/70">
                Gyors dátum
                <div className="flex flex-wrap gap-2">
                  {presetOptions.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handlePreset(item.key)}
                      className={preset === item.key ? chipActive : chipIdle}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className={label}>
                Irány
                <CompactSelect
                  value={direction}
                  onChange={(next) => setDirection(next as DirectionFilter)}
                  menuMinWidth={180}
                  options={[
                    { value: "all", label: "Minden mozgás" },
                    { value: "in", label: "Csak bejött" },
                    { value: "out", label: "Csak kiment" },
                    { value: "adjust", label: "Korrekció" },
                  ]}
                />
              </label>

              <label className={label}>
                Bizonylat / művelet
                <CompactSelect
                  value={documentType}
                  onChange={(next) => setDocumentType(next as StockDocumentTypeFilter)}
                  options={[
                    { value: "all", label: "Minden típus" },
                    { value: "internal_transfer", label: "Belső átadás" },
                    { value: "supplier_return", label: "Beszállítói retur" },
                    { value: "damaged_writeoff", label: "Sérült / kivezetés" },
                    { value: "stock_correction", label: "Készletkorrekció" },
                  ]}
                />
              </label>

              <button type="button" onClick={() => refresh()} disabled={loading} className={primaryBtn}>
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Frissítés
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label className={label}>
                Ettől
                <input
                  type="date"
                  value={from}
                  onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }}
                  className={input}
                />
              </label>
              <label className={label}>
                Eddig
                <input
                  type="date"
                  value={to}
                  onChange={(e) => { setPreset("custom"); setTo(e.target.value); }}
                  className={input}
                />
              </label>
              <div className="rounded-xl border border-white/12 bg-[#354153] px-3 py-2 text-xs text-white/65">
                <div className="flex items-center gap-2"><CalendarDays size={14} /> Aktív időszak</div>
                <p className="mt-1 text-white">{rangeLabel}</p>
              </div>
            </div>

            {message && (
              <div className={messageTone === "error" ? "rounded-xl border border-red-200/20 bg-red-500/12 px-3 py-2 text-sm text-red-50" : "rounded-xl border border-[#2a8d8b]/25 bg-[#174c55]/70 px-3 py-2 text-sm text-cyan-50/90"}>{message}</div>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={MapPin} label="Helyszín" value={selectedLocation?.name || "Minden"} hint="A kiválasztott üzlet / raktár" tone="neutral" />
          <StatCard icon={ArrowDownLeft} label="Bejött" value={formatQty(totals.incoming_qty || 0)} hint="A szűrt időszakban" tone="green" />
          <StatCard icon={ArrowUpRight} label="Kiment" value={formatQty(totals.outgoing_qty || 0)} hint="A szűrt időszakban" tone="red" />
          <StatCard icon={ArrowRightLeft} label="Nettó mozgás" value={formatQty(totals.net_qty || 0)} hint="Bejött mínusz kiment" tone="neutral" />
          <StatCard icon={Boxes} label="Elérhető most" value={formatQty(stockTotals.available)} hint={`${formatQty(stockTotals.qty)} készlet · ${formatQty(stockTotals.reserved)} foglalt`} tone="green" />
        </div>

        {activeTab === "moves" ? (
          <div className={panel}>
            <div className={panelHead}>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/40">Mozgásnapló</p>
                <h2 className="mt-1 flex items-center gap-2 text-base font-normal"><Clock3 size={17} /> Dátum, óra, termék és irány</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => exportPdf("in")} disabled={exportingDirection !== null} className={primaryBtn}>
                  <FileText size={15} /> {exportingDirection === "in" ? "Készül..." : "Bejövő PDF"}
                </button>
                <button type="button" onClick={() => exportPdf("out")} disabled={exportingDirection !== null} className={redBtn}>
                  <Download size={15} /> {exportingDirection === "out" ? "Készül..." : "Kimenő PDF"}
                </button>
                <div className="text-sm text-white/62">{formatQty(moveRows.length)} sor megjelenítve</div>
                <button type="button" onClick={toggleAllVisibleMoves} disabled={!moveRows.length || bulkDeleting} className={btnSoft}>
                  <CheckCircle2 size={15} /> {allVisibleMovesSelected ? "Kijelölés törlése" : "Összes kijelölése"}
                </button>
                {selectedMoveCount > 0 ? (
                  <button type="button" onClick={() => setBulkDeleteOpen(true)} disabled={bulkDeleting} className={redBtn}>
                    <Trash2 size={15} /> Kijelöltek törlése ({formatQty(selectedMoveCount)})
                  </button>
                ) : null}
              </div>
            </div>

            <div className="hidden overflow-auto lg:block">
              <table className="w-full min-w-[1080px] border-collapse text-[13px]">
                <thead className="bg-[#293448] text-[10px] font-normal uppercase tracking-[0.08em] text-white/72">
                  <tr>
                    <th className="w-10 px-2 py-2.5 text-center font-normal">
                      <input
                        type="checkbox"
                        checked={allVisibleMovesSelected}
                        onChange={toggleAllVisibleMoves}
                        disabled={!moveRows.length || bulkDeleting}
                        className="h-4 w-4 cursor-pointer accent-[#2a8d8b]"
                        aria-label="Összes látható mozgás kijelölése"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left font-normal">Termék</th>
                    <th className="px-3 py-2.5 text-left font-normal">Dátum / óra</th>
                    <th className="px-3 py-2.5 text-left font-normal">Helyszín</th>
                    <th className="px-3 py-2.5 text-center font-normal">Mozgás</th>
                    <th className="px-3 py-2.5 text-center font-normal">Előtte</th>
                    <th className="px-3 py-2.5 text-center font-normal">Utána</th>
                    <th className="px-3 py-2.5 text-left font-normal">Forrás</th>
                    <th className="w-[214px] px-3 py-2.5 text-right font-normal">Művelet</th>
                  </tr>
                </thead>
                <tbody>
                  {moveRows.map((row) => {
                    const meta = directionMeta(row);
                    const Icon = meta.icon;
                    const delta = Math.abs(n(row.qty_delta));
                    return (
                      <tr key={row.id} className={`border-t border-white/10 leading-tight hover:bg-white/[0.04] ${selectedMoveIds.has(String(row.id)) ? "bg-[#2a8d8b]/12" : ""}`}>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedMoveIds.has(String(row.id))}
                            onChange={() => toggleMoveSelection(String(row.id))}
                            disabled={bulkDeleting}
                            className="h-4 w-4 cursor-pointer accent-[#2a8d8b]"
                            aria-label={`${displayName(row)} mozgás kijelölése`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <ProductThumb item={row} compact />
                            <ProductText item={row} compact />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[12px] text-white/78">{formatDateTime(row.created_at)}</td>
                        <td className="px-3 py-2 text-[12px] text-white/78">{row.location_name || "-"}</td>
                        <td className="px-3 py-2 text-center">
                          {row.direction === "out" || n(row.qty_delta) < 0 ? (
                            <button
                              type="button"
                              onClick={() => void openReorder(row)}
                              className={`inline-flex min-w-[110px] cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-normal transition hover:-translate-y-px hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-red-200/35 ${meta.cls}`}
                              title="Kattints az azonnali utánrendeléshez"
                            >
                              <Icon size={12} /> {meta.label} {meta.sign}{formatQty(delta)} <ShoppingCart size={11} />
                            </button>
                          ) : (
                            <span className={`inline-flex min-w-[110px] items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-normal ${meta.cls}`}>
                              <Icon size={12} /> {meta.label} {meta.sign}{formatQty(delta)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-[12px] tabular-nums text-white/78">{formatQty(row.qty_before ?? 0)}</td>
                        <td className="px-3 py-2 text-center text-[12px] tabular-nums text-white/78">{formatQty(row.qty_after ?? 0)}</td>
                        <td className="px-3 py-2 text-[12px] text-white/70">
                          <div className="grid gap-0.5">
                            <span>{sourceLabel(row)}</span>
                            {movementReasonText(row) ? <span className="text-[10px] leading-snug text-white/45">{movementReasonText(row)}</span> : null}
                            {movementDocumentNumber(row) ? (
                              <button
                                type="button"
                                onClick={() => openMovementDocument(row)}
                                className="w-fit rounded-full border border-[#7bd7d4]/32 bg-[#2a8d8b]/16 px-2 py-0.5 text-[10px] text-[#d7fffd] hover:bg-[#2a8d8b]/28"
                              >
                                {movementDocumentNumber(row)}
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="ml-auto grid w-[198px] grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => openVariantHistory(row)}
                              className={`${rowPrimaryBtn} w-full`}
                              title="Termék History"
                              aria-label="Termék History"
                            >
                              <Clock3 size={13} className="shrink-0" /> Történet
                            </button>
                            {movementDocumentNumber(row) ? (
                              <button
                                type="button"
                                onClick={() => openMovementDocument(row)}
                                className={`${rowSoftBtn} w-full`}
                                title="Kapcsolt készletbizonylat megnyitása"
                              >
                                <FileText size={13} className="shrink-0" /> Bizonylat
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteCandidate(row)}
                                disabled={deletingId === row.id}
                                className={`${rowDangerBtn} w-full`}
                                title="Naplóbejegyzés végleges törlése"
                                aria-label="Naplóbejegyzés végleges törlése"
                              >
                                <Trash2 size={13} className="shrink-0" /> Törlés
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!moveRows.length && (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-white/55">Nincs mozgás ebben az időszakban.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-3 lg:hidden">
              {moveRows.map((row) => {
                const meta = directionMeta(row);
                const Icon = meta.icon;
                const delta = Math.abs(n(row.qty_delta));
                return (
                  <div key={row.id} className={`rounded-2xl border p-3 ${selectedMoveIds.has(String(row.id)) ? "border-[#7bd7d4]/45 bg-[#2a8d8b]/12" : "border-white/12 bg-white/[0.05]"}`}>
                    <div className="flex items-start gap-3">
                      <ProductThumb item={row} />
                      <div className="min-w-0 flex-1"><ProductText item={row} /></div>
                      <input
                        type="checkbox"
                        checked={selectedMoveIds.has(String(row.id))}
                        onChange={() => toggleMoveSelection(String(row.id))}
                        disabled={bulkDeleting}
                        className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[#2a8d8b]"
                        aria-label={`${displayName(row)} mozgás kijelölése`}
                      />
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-white/68 sm:grid-cols-2">
                      <div className="rounded-xl bg-[#354153] px-3 py-2"><Clock3 className="mr-1 inline" size={13} /> {formatDateTime(row.created_at)}</div>
                      <div className="rounded-xl bg-[#354153] px-3 py-2"><MapPin className="mr-1 inline" size={13} /> {row.location_name || "-"}</div>
                      {row.direction === "out" || n(row.qty_delta) < 0 ? (
                        <button
                          type="button"
                          onClick={() => void openReorder(row)}
                          className={`rounded-xl border px-3 py-2 text-center font-semibold transition hover:brightness-110 ${meta.cls}`}
                        >
                          <Icon className="mr-1 inline" size={13} /> {meta.label}: {meta.sign}{formatQty(delta)} <ShoppingCart className="ml-1 inline" size={12} />
                        </button>
                      ) : (
                        <div className={`rounded-xl border px-3 py-2 text-center font-semibold ${meta.cls}`}><Icon className="mr-1 inline" size={13} /> {meta.label}: {meta.sign}{formatQty(delta)}</div>
                      )}
                      <div className="rounded-xl bg-[#354153] px-3 py-2">{formatQty(row.qty_before ?? 0)} → {formatQty(row.qty_after ?? 0)}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-white/62">
                      <span className="flex flex-wrap items-center gap-1.5">
                        Forrás: {sourceLabel(row)}
                        {movementReasonText(row) ? <span className="text-white/45">• {movementReasonText(row)}</span> : null}
                        {movementDocumentNumber(row) ? (
                          <button
                            type="button"
                            onClick={() => openMovementDocument(row)}
                            className="rounded-full border border-[#7bd7d4]/32 bg-[#2a8d8b]/16 px-2 py-0.5 text-[10px] text-[#d7fffd]"
                          >
                            {movementDocumentNumber(row)}
                          </button>
                        ) : null}
                      </span>
                      <div className="grid w-full grid-cols-2 gap-2 sm:w-[224px]">
                        <button
                          type="button"
                          onClick={() => openVariantHistory(row)}
                          className={`${primaryBtn} w-full`}
                          title="Termék History"
                          aria-label="Termék History"
                        >
                          <Clock3 size={15} className="shrink-0" /> Történet
                        </button>
                        {movementDocumentNumber(row) ? (
                          <button
                            type="button"
                            onClick={() => openMovementDocument(row)}
                            className={`${btnSoft} w-full`}
                          >
                            <FileText size={15} className="shrink-0" /> Bizonylat
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteCandidate(row)}
                            disabled={deletingId === row.id}
                            className={`${tinyDangerBtn} w-full`}
                          >
                            <Trash2 size={15} className="shrink-0" /> Törlés
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!moveRows.length && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-6 text-center text-sm text-white/55">Nincs mozgás ebben az időszakban.</div>}
            </div>
          </div>
        ) : (
          <div className={panel}>
            <div className={panelHead}>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/40">Jelenlegi készlet</p>
                <h2 className="mt-1 flex items-center gap-2 text-base font-normal"><PackageSearch size={17} /> Termékek a kiválasztott helyszínen</h2>
              </div>
              <div className="text-sm text-white/62">{formatQty(stockRows.length)} terméksor</div>
            </div>

            <div className="hidden overflow-auto lg:block">
              <table className="w-full min-w-[860px] border-collapse text-[13px]">
                <thead className="bg-[#293448] text-[10px] font-normal uppercase tracking-[0.08em] text-white/72">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-normal">Termék</th>
                    <th className="px-3 py-2.5 text-left font-normal">Helyszín</th>
                    <th className="px-3 py-2.5 text-center font-normal">Méret</th>
                    <th className="px-3 py-2.5 text-center font-normal">Készlet</th>
                    <th className="px-3 py-2.5 text-center font-normal">Foglalt</th>
                    <th className="px-3 py-2.5 text-center font-normal">Elérhető</th>
                    <th className="px-3 py-2.5 text-left font-normal">Frissítve</th>
                    <th className="px-3 py-2.5 text-right font-normal">Műv.</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((row) => (
                    <tr key={`${row.location_id || row.location_code}-${row.variant_id}`} className="border-t border-white/10 leading-tight hover:bg-white/[0.04]">
                      <td className="px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <ProductThumb item={row} compact />
                          <ProductText item={row} compact />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[12px] text-white/78">{row.location_name || "-"}</td>
                      <td className="px-3 py-2 text-center text-[12px] text-white/78">{row.size || "-"}</td>
                      <td className="px-3 py-2 text-center text-[12px] tabular-nums text-white">{formatQty(row.qty)}</td>
                      <td className="px-3 py-2 text-center text-[12px] tabular-nums text-white/70">{formatQty(row.reserved_qty)}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex min-w-10 justify-center rounded-full border border-[#2a8d8b]/35 bg-[#2a8d8b]/18 px-2.5 py-0.5 text-[11px] text-white">{formatQty(row.available_qty)}</span>
                      </td>
                      <td className="px-3 py-2 text-[12px] text-white/60">{formatDateTime(row.updated_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openVariantHistory(row)}
                          className={rowPrimaryBtn}
                          title="Termék History"
                          aria-label="Termék History"
                        >
                          <Clock3 size={13} className="shrink-0" /> Történet
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!stockRows.length && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-white/55">Nincs készlet a szűrés alapján.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-3 lg:hidden">
              {stockRows.map((row) => (
                <div key={`${row.location_id || row.location_code}-${row.variant_id}`} className="rounded-2xl border border-white/12 bg-white/[0.05] p-3">
                  <div className="flex gap-3">
                    <ProductThumb item={row} />
                    <div className="min-w-0 flex-1"><ProductText item={row} /></div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-[#354153] px-2 py-2"><span className="block text-white/48">Készlet</span><span className="mt-1 block text-base text-white">{formatQty(row.qty)}</span></div>
                    <div className="rounded-xl bg-[#354153] px-2 py-2"><span className="block text-white/48">Foglalt</span><span className="mt-1 block text-base text-white">{formatQty(row.reserved_qty)}</span></div>
                    <div className="rounded-xl border border-[#2a8d8b]/35 bg-[#2a8d8b]/16 px-2 py-2"><span className="block text-white/60">Elérhető</span><span className="mt-1 block text-base text-white">{formatQty(row.available_qty)}</span></div>
                  </div>
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={() => openVariantHistory(row)}
                      className={primaryBtn}
                      title="Termék History"
                      aria-label="Termék History"
                    >
                      <Clock3 size={15} className="shrink-0" /> Történet
                    </button>
                  </div>
                </div>
              ))}
              {!stockRows.length && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-6 text-center text-sm text-white/55">Nincs készlet a szűrés alapján.</div>}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-[#2a8d8b]/25 bg-[#174c55]/60 px-4 py-3 text-sm text-cyan-50/90">
          <Filter className="mr-2 inline" size={15} />
          A PDF export az aktuális dátum-, helyszín- és keresési szűrést használja, külön bejövőre és kimenőre.
        </div>
      </div>

      {historyTarget && (
        <ProductHistoryOverlay
          target={historyTarget}
          history={variantHistory}
          loading={variantHistoryLoading}
          error={variantHistoryError}
          onReload={reloadVariantHistory}
          onClose={closeVariantHistory}
        />
      )}

      {reorderTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-red-300/28 bg-[#404a5b] shadow-[0_24px_70px_rgba(0,0,0,.58)]">
            <div className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#303a4c] to-[#4a3039] px-5 py-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-red-100/60">Azonnali utánrendelés</p>
                <h3 className="mt-1 flex items-center gap-2 text-lg font-normal text-white"><ShoppingCart size={19} /> Kimenő termék rendeléshez adása</h3>
              </div>
              <button type="button" onClick={closeReorder} disabled={reorderSaving} className={btnSoft}><X size={15} /> Bezárás</button>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex gap-3 rounded-2xl border border-white/12 bg-[#354153] p-3">
                <ProductThumb item={reorderTarget} />
                <div className="min-w-0 flex-1">
                  <ProductText item={reorderTarget} />
                  <p className="mt-2 text-xs text-white/48">Kiment: {formatQty(Math.abs(n(reorderTarget.qty_delta)))} db • {reorderTarget.location_name || "Nincs helyszín"}</p>
                </div>
              </div>

              {reorderError ? <div className="rounded-xl border border-red-200/22 bg-red-500/12 px-3 py-2 text-sm text-red-50">{reorderError}</div> : null}

              {reorderLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-8 text-sm text-white/60"><Loader2 size={17} className="animate-spin" /> Beszállítói adatok betöltése...</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>
                    Beszállító
                    <CompactSelect
                      value={reorderSupplierId}
                      onChange={setReorderSupplierId}
                      placeholder="Válassz beszállítót"
                      options={reorderSupplierOptions.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
                    />
                  </label>
                  <label className={label}>
                    Rendelési célhely
                    <CompactSelect
                      value={reorderLocationId}
                      onChange={setReorderLocationId}
                      placeholder="Válassz célhelyet"
                      options={locations.map((location) => ({ value: location.id || location.code, label: location.name }))}
                    />
                  </label>
                </div>
              )}

              {!reorderLoading ? (
                <p className="-mt-2 text-[11px] text-white/48">Alapértelmezett rendelési célhely: Magazin - Miercurea Ciuc. Innen oszlik szét a készlet.</p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className={label}>
                  Rendelendő mennyiség
                  <div className="grid grid-cols-[42px_minmax(90px,1fr)_42px]">
                    <button type="button" className={`${btnSoft} rounded-r-none px-0`} onClick={() => setReorderQty((qty) => Math.max(1, qty - 1))} disabled={reorderSaving}><Minus size={16} /></button>
                    <input
                      className={`${input} rounded-none text-center text-base tabular-nums`}
                      value={reorderQty}
                      onChange={(event) => setReorderQty(Math.max(1, Math.trunc(n(event.target.value) || 1)))}
                      inputMode="numeric"
                    />
                    <button type="button" className={`${primaryBtn} rounded-l-none px-0`} onClick={() => setReorderQty((qty) => qty + 1)} disabled={reorderSaving}><Plus size={16} /></button>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => void submitReorder()}
                  disabled={reorderLoading || reorderSaving || !reorderSupplierId || !reorderLocationId}
                  className="inline-flex h-10 min-w-[190px] items-center justify-center gap-2 rounded-xl border border-red-300/30 bg-red-600 px-4 text-sm text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {reorderSaving ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
                  {reorderSaving ? "Hozzáadás..." : "Rendeléshez adás"}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2a8d8b]/24 bg-[#174c55]/50 px-3 py-2 text-xs text-cyan-50/86">
                <span>Ha van nyitott rendelés ennél a beszállítónál, azt bővíti. Ha nincs, újat nyit.</span>
                <button type="button" onClick={() => { closeReorder(); window.location.hash = "#allinorderhistory"; }} className="rounded-lg border border-white/18 bg-white/[0.08] px-2.5 py-1.5 text-white hover:bg-white/[0.12]">Rendelések</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && selectedMoveCount > 0 && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-red-300/25 bg-[#404a5b] shadow-2xl">
            <div className="border-b border-white/12 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-red-100/55">Végleges törlés</p>
              <h3 className="mt-1 text-lg font-normal text-white">{formatQty(selectedMoveCount)} kijelölt naplósor törlése</h3>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-white/75">
              <p>A kijelölt sorok végleg eltűnnek a mozgásnaplóból. A jelenlegi készlet mennyisége nem változik.</p>
              <div className="rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-50/85">
                Ez naplótakarítás, nem készletkorrekció. Pont ezért kell megerősíteni, mert a tesztadatok és a valódi események külsőre meglepően hasonlóak.
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-white/12 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting} className={btnSoft}>Mégse</button>
              <button type="button" onClick={confirmBulkDeleteMovements} disabled={bulkDeleting} className={redBtn}>
                <Trash2 size={16} /> {bulkDeleting ? "Törlés..." : `Végleges törlés (${formatQty(selectedMoveCount)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/18 bg-[#404a5b] shadow-2xl">
            <div className="border-b border-white/12 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40">Végleges törlés</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Naplóbejegyzés törlése</h3>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-white/75">
              <p>Ez csak a készletmozgás naplósorát törli. A jelenlegi készletet nem módosítja.</p>
              <div className="rounded-xl border border-white/12 bg-white/[0.06] p-3">
                <div className="flex gap-3">
                  <ProductThumb item={deleteCandidate} />
                  <div className="min-w-0 flex-1">
                    <ProductText item={deleteCandidate} />
                    <p className="mt-2 text-xs text-white/55">{formatDateTime(deleteCandidate.created_at)} · {deleteCandidate.location_name || "-"}</p>
                    <p className="mt-1 text-xs text-white/65">Mennyiség: {directionMeta(deleteCandidate).label} {formatQty(Math.abs(n(deleteCandidate.qty_delta)))}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-white/12 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setDeleteCandidate(null)} disabled={deletingId === deleteCandidate.id} className={btnSoft}>Mégse</button>
              <button type="button" onClick={confirmDeleteMovement} disabled={deletingId === deleteCandidate.id} className={redBtn}>
                <Trash2 size={16} className="shrink-0" /> {deletingId === deleteCandidate.id ? "Törlés..." : "Végleges törlés"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
