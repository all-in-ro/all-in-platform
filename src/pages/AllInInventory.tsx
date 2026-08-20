import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Barcode,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  Filter,
  Home,
  ImageIcon,
  MapPin,
  PackageCheck,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

const page = "min-h-screen bg-[#4b5362] px-3 py-5 text-white font-normal sm:px-4 sm:py-7";
const shell = "mx-auto max-w-7xl space-y-4";
const panel = "overflow-hidden rounded-2xl border border-white/14 bg-white/[0.07] shadow-lg";
const panelHead = "flex flex-col gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between";
const btn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-[#354153] px-3 text-xs text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const btnSoft = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3 text-xs text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/18 bg-[#354153] px-2.5 text-[11px] text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtnSoft = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.08] px-2.5 text-[11px] text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerPrimaryBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-2.5 text-[11px] text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const redBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#ff6678] bg-[#e3132c] px-3 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(227,19,44,0.28)] hover:bg-[#ff1935] disabled:cursor-not-allowed disabled:opacity-50";
const input = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45";
const label = "grid gap-1.5 text-xs text-white/70";
const chipBase = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs transition-colors";
const chipActive = `${chipBase} border-[#2a8d8b]/60 bg-[#2a8d8b] text-white shadow-[0_0_0_1px_rgba(42,141,139,0.18)]`;
const chipIdle = `${chipBase} border-white/14 bg-white/[0.06] text-white/72 hover:bg-white/[0.10]`;
const qtyInput = "h-10 w-24 rounded-xl border border-white/18 bg-[#303a4c] px-3 text-center text-sm text-white outline-none focus:border-[#2a8d8b]/70";

const AIF_BASE = "/api/aif";
const stockMovesChangedStorageKey = "allinfashion:stockMoves:changed:v1";
const stockMovesChangedEventName = "aif:stock-moves-changed";

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


type MessageTone = "info" | "error" | "success";
type CountStatus = "draft" | "counting" | "review" | "committed" | "cancelled";
type LineFilter = "all" | "uncounted" | "ok" | "missing" | "extra";
type PrintMode = "sheet" | "result";

type AifLocation = {
  id: string;
  code: string;
  name: string;
  location_type?: string | null;
  is_active?: boolean;
};

type AifMeta = {
  locations?: AifLocation[];
};

type AifStockItem = {
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  variant_id: string;
  internal_sku?: string | null;
  barcode?: string | null;
  display_barcode?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  buy_price?: number | string | null;
  sell_price?: number | string | null;
  model_id?: string | null;
  model_code?: string | null;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  category_name_ro?: string | null;
  category_code?: string | null;
  qty: number | string;
  reserved_qty: number | string;
  available_qty: number | string;
  updated_at?: string | null;
};

type InventoryCountSummary = {
  id: string;
  code: string;
  title: string;
  location_id: string;
  location_code?: string | null;
  location_name?: string | null;
  location_type?: string | null;
  status: CountStatus;
  started_at?: string | null;
  counted_at?: string | null;
  committed_at?: string | null;
  actor?: string | null;
  note?: string | null;
  raw?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  line_count?: number | string | null;
  counted_lines?: number | string | null;
  expected_qty?: number | string | null;
  counted_qty?: number | string | null;
  diff_qty?: number | string | null;
  missing_qty?: number | string | null;
  extra_qty?: number | string | null;
  missing_sell_value?: number | string | null;
  extra_sell_value?: number | string | null;
  diff_sell_value?: number | string | null;
  missing_buy_value?: number | string | null;
  extra_buy_value?: number | string | null;
  diff_buy_value?: number | string | null;
};

type InventoryCountLine = {
  id: string;
  count_id: string;
  variant_id: string;
  expected_qty: number | string;
  expected_reserved_qty?: number | string | null;
  counted_qty?: number | string | null;
  diff_qty?: number | string | null;
  missing_qty?: number | string | null;
  extra_qty?: number | string | null;
  buy_price?: number | string | null;
  sell_price?: number | string | null;
  diff_buy_value?: number | string | null;
  diff_sell_value?: number | string | null;
  note?: string | null;
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  internal_sku?: string | null;
  barcode?: string | null;
  display_barcode?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  model_id?: string | null;
  model_code?: string | null;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  category_name_ro?: string | null;
  category_code?: string | null;
  current_qty?: number | string | null;
  current_reserved_qty?: number | string | null;
  current_available_qty?: number | string | null;
};

type InventoryCountDetail = {
  item: InventoryCountSummary;
  lines: InventoryCountLine[];
  totals?: InventoryCountSummary;
};

type DraftLine = {
  countedQty: string;
  note: string;
};

type PendingScan = {
  lineId: string;
  code: string;
  qty: number;
  at: number;
  source: "camera" | "manual";
};

type CountValueSnapshot = {
  countedSellValue: number;
  expectedSellValue: number;
};

type ConfirmDialog = {
  kind: "commit" | "delete";
  title: string;
  description: string;
  confirmLabel: string;
  tone: "green" | "red";
  details?: string[];
};

async function fetchAifJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${AIF_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  const responseText = await res.text();
  let data: any = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = responseText;
  }

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }

  return data as T;
}

function n(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatQty(value: unknown) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(n(value));
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(n(value));
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

function todayTitle() {
  const d = new Date();
  return `Leltár ${new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d)}`;
}

function getImageSrc(item?: { image_url?: string | null; images?: unknown }) {
  if (!item) return "";
  if (typeof item.image_url === "string" && item.image_url.trim()) return item.image_url.trim();
  const images = item.images;
  if (Array.isArray(images)) {
    const first = images.find(Boolean);
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const obj = first as Record<string, unknown>;
      const src = obj.src || obj.url || obj.image_url;
      if (typeof src === "string") return src;
    }
  }
  if (images && typeof images === "object") {
    const obj = images as Record<string, unknown>;
    const src = obj.src || obj.url || obj.image_url;
    if (typeof src === "string") return src;
  }
  return "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function notifyStockMovesChanged(detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = { at: new Date().toISOString(), ...detail };
  try {
    window.localStorage.setItem(stockMovesChangedStorageKey, JSON.stringify(payload));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(stockMovesChangedEventName, { detail: payload }));
  } catch {}
}

function productTitle(item: { title_ro?: string | null; shopify_title?: string | null }) {
  return item.title_ro || item.shopify_title || "Névtelen termék";
}

function statusLabel(status?: CountStatus) {
  switch (status) {
    case "draft": return "Előkészítve";
    case "counting": return "Számolás alatt";
    case "review": return "Ellenőrzés";
    case "committed": return "Bevezetve";
    case "cancelled": return "Törölve";
    default: return "-";
  }
}

function sourceLabel(location?: AifLocation | null) {
  if (!location) return "Válassz üzletet";
  return location.location_type === "shop" ? "Üzlet" : location.location_type === "warehouse" ? "Raktár" : "Helyszín";
}

function lineDraftFrom(line: InventoryCountLine): DraftLine {
  const qty = line.counted_qty === null || line.counted_qty === undefined ? "" : String(Math.trunc(n(line.counted_qty)));
  return { countedQty: qty, note: line.note || "" };
}

function draftCountedValue(draft?: DraftLine) {
  if (!draft || draft.countedQty.trim() === "") return null;
  const value = Number.parseInt(draft.countedQty, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function lineDiff(line: InventoryCountLine, drafts: Record<string, DraftLine>) {
  const counted = draftCountedValue(drafts[line.id]);
  if (counted === null) return null;
  return counted - n(line.expected_qty);
}

function barcodeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[\s\u00a0]+/g, "")
    .toLowerCase();
}

function barcodeLooseKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function barcodeValues(line: InventoryCountLine) {
  return [
    line.display_barcode,
    line.barcode,
    line.internal_sku,
    line.variant_id,
    line.model_code,
  ].filter((x) => String(x ?? "").trim());
}

function signedQty(value: number) {
  return `${value > 0 ? "+" : ""}${formatQty(value)}`;
}

function StatCard({ label, value, hint, icon, tone = "neutral" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "neutral" | "green" | "red" | "blue" }) {
  const toneClass = tone === "green" ? "border-[#2a8d8b]/45 bg-[#2a8d8b]/12" : tone === "red" ? "border-red-300/35 bg-red-500/10" : tone === "blue" ? "border-sky-300/30 bg-sky-500/10" : "border-white/18 bg-white/[0.06]";
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-white/62">{label}</div>
          <div className="mt-2 text-2xl font-semibold leading-none text-white">{value}</div>
        </div>
        {icon ? <div className="rounded-xl border border-white/16 bg-white/[0.08] p-2 text-white/78">{icon}</div> : null}
      </div>
      {hint ? <div className="mt-2 text-xs text-white/58">{hint}</div> : null}
    </div>
  );
}

function HoverZoomImage({ src, title }: { src?: string | null; title: string }) {
  const clean = String(src || "").trim();
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  const previewStyle = useMemo(() => {
    if (!pointer || typeof window === "undefined") return null;
    const width = 300;
    const height = 360;
    const gap = 18;
    const edge = 14;
    const left = pointer.x + gap + width <= window.innerWidth - edge
      ? pointer.x + gap
      : Math.max(edge, pointer.x - width - gap);
    const top = Math.max(edge, Math.min(pointer.y - height / 2, window.innerHeight - height - edge));
    return { left, top, width, height };
  }, [pointer]);

  return (
    <>
      <div
        className={`grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/14 bg-white/90 shadow-sm ${clean ? "cursor-zoom-in" : ""}`}
        onMouseEnter={(event) => clean && setPointer({ x: event.clientX, y: event.clientY })}
        onMouseMove={(event) => clean && setPointer({ x: event.clientX, y: event.clientY })}
        onMouseLeave={() => setPointer(null)}
        title={clean ? "Nagyítás" : undefined}
      >
        {clean ? <img src={clean} alt="" className="h-full w-full object-contain" loading="lazy" /> : <ImageIcon size={18} className="text-slate-400" />}
      </div>
      {clean && pointer && previewStyle && typeof document !== "undefined" ? createPortal(
        <div
          className="pointer-events-none overflow-hidden rounded-[22px] border border-[#9ee4e2]/45 bg-[#202a3a] p-2.5 shadow-[0_28px_80px_rgba(2,6,23,0.72)]"
          style={{ position: "fixed", zIndex: 2400, ...previewStyle }}
        >
          <div className="grid h-[302px] place-items-center overflow-hidden rounded-2xl bg-white">
            <img src={clean} alt="" className="h-full w-full object-contain p-2" />
          </div>
          <div className="mt-2 truncate px-1 text-sm font-semibold text-white">{title}</div>
          <div className="px-1 text-[10px] uppercase tracking-[0.12em] text-[#9ee4e2]/70">Termékkép</div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export default function AllInInventory() {
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [location, setLocation] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState<LineFilter>("all");
  const [stockRows, setStockRows] = useState<AifStockItem[]>([]);
  const [counts, setCounts] = useState<InventoryCountSummary[]>([]);
  const [countsExpanded, setCountsExpanded] = useState(true);
  const [countsPage, setCountsPage] = useState(1);
  const [countValueCache, setCountValueCache] = useState<Record<string, CountValueSnapshot>>({});
  const [active, setActive] = useState<InventoryCountDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftLine>>({});
  const [title, setTitle] = useState(todayTitle());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: MessageTone; text: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [scannerStatus, setScannerStatus] = useState("");
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [linePageSize, setLinePageSize] = useState<20 | 50 | 100>(20);
  const [linePage, setLinePage] = useState(1);

  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerDetectorRef = useRef<any>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const activeRef = useRef<InventoryCountDetail | null>(null);
  const draftsRef = useRef<Record<string, DraftLine>>({});
  const pendingScanRef = useRef<PendingScan | null>(null);
  const manualBarcodeInputRef = useRef<HTMLInputElement | null>(null);
  const countValueLoadingRef = useRef<Set<string>>(new Set());
  const inventoryLinesTopRef = useRef<HTMLDivElement | null>(null);

  const currentLocation = useMemo(() => locations.find((x) => x.id === location || x.code === location) || null, [locations, location]);

  const loadMeta = useCallback(async () => {
    const meta = await fetchAifJSON<AifMeta>("/meta");
    const activeLocations = (meta.locations || []).filter((x) => x.is_active !== false);
    setLocations(activeLocations);
    setLocation((prev) => prev || activeLocations[0]?.id || "");
  }, []);

  const loadStockAndCounts = useCallback(async (locationValue: string, searchValue: string) => {
    if (!locationValue) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("location", locationValue);
      if (searchValue.trim()) q.set("search", searchValue.trim());
      const [stock, countList] = await Promise.all([
        fetchAifJSON<{ items: AifStockItem[] }>(`/stock?${q.toString()}`),
        fetchAifJSON<{ items: InventoryCountSummary[] }>(`/inventory-counts?location=${encodeURIComponent(locationValue)}&limit=200`),
      ]);
      setStockRows(stock.items || []);
      setCounts(countList.items || []);
      setMessage(null);

      setActive((prev) => {
        if (prev && String(prev.item.location_id) === String(locationValue)) return prev;
        const open = (countList.items || []).find((x) => !["committed", "cancelled"].includes(x.status));
        if (open) {
          void loadCount(open.id);
        }
        return prev && String(prev.item.location_id) !== String(locationValue) ? null : prev;
      });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár adatok betöltése nem sikerült." });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCount = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const detail = await fetchAifJSON<InventoryCountDetail>(`/inventory-counts/${encodeURIComponent(id)}`);
      setActive(detail);
      setCountValueCache((prev) => ({ ...prev, [detail.item.id]: valueSnapshotFromLines(detail.lines || []) }));
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setMessage(null);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár betöltése nem sikerült." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!location) return;
    const handle = window.setTimeout(() => void loadStockAndCounts(location, search), 180);
    return () => window.clearTimeout(handle);
  }, [location, search, loadStockAndCounts]);

  useEffect(() => {
    if (!confirmDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setConfirmDialog(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmDialog, saving]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    pendingScanRef.current = pendingScan;
  }, [pendingScan]);

  useEffect(() => {
    return () => stopCameraScanner();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobileLayout(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  const categories = useMemo(() => {
    const set = new Map<string, string>();
    for (const row of active?.lines || stockRows) {
      const code = row.category_code || row.category_name_ro || "uncat";
      const name = row.category_name_ro || row.category_code || "Kategória nélkül";
      set.set(String(code), String(name));
    }
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1], "hu"));
  }, [active, stockRows]);

  const filteredStockRows = useMemo(() => {
    return stockRows.filter((row) => categoryFilter === "all" || row.category_code === categoryFilter || row.category_name_ro === categoryFilter);
  }, [stockRows, categoryFilter]);

  const filteredLines = useMemo(() => {
    const lines = active?.lines || [];
    const searchKey = barcodeLooseKey(search);
    return lines.filter((line) => {
      if (categoryFilter !== "all" && line.category_code !== categoryFilter && line.category_name_ro !== categoryFilter) return false;
      if (searchKey) {
        const haystack = [
          productTitle(line),
          line.brand_name,
          line.category_name_ro,
          line.color_name,
          line.color_code,
          line.size,
          line.display_barcode,
          line.barcode,
          line.internal_sku,
          line.model_code,
        ].map(barcodeLooseKey).join(" ");
        if (!haystack.includes(searchKey)) return false;
      }
      const diff = lineDiff(line, drafts);
      if (lineFilter === "uncounted") return diff === null;
      if (lineFilter === "ok") return diff === 0;
      if (lineFilter === "missing") return diff !== null && diff < 0;
      if (lineFilter === "extra") return diff !== null && diff > 0;
      return true;
    });
  }, [active, categoryFilter, lineFilter, drafts, search]);

  const lineTotalPages = Math.max(1, Math.ceil(filteredLines.length / linePageSize));
  const visibleInventoryLines = useMemo(() => {
    const start = (linePage - 1) * linePageSize;
    return filteredLines.slice(start, start + linePageSize);
  }, [filteredLines, linePage, linePageSize]);

  useEffect(() => {
    setLinePage(1);
  }, [active?.item.id, search, categoryFilter, lineFilter, linePageSize]);

  useEffect(() => {
    if (linePage > lineTotalPages) setLinePage(lineTotalPages);
  }, [linePage, lineTotalPages]);

  function changeLinePage(nextPage: number) {
    const safePage = Math.max(1, Math.min(lineTotalPages, nextPage));
    setLinePage(safePage);
    window.setTimeout(() => {
      inventoryLinesTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function valueSnapshotFromLines(lines: InventoryCountLine[]): CountValueSnapshot {
    let countedSellValue = 0;
    let expectedSellValue = 0;
    for (const line of lines || []) {
      const sell = n(line.sell_price);
      expectedSellValue += n(line.expected_qty) * sell;
      const countedValue = line.counted_qty === null || line.counted_qty === undefined ? null : n(line.counted_qty);
      if (countedValue !== null) countedSellValue += countedValue * sell;
    }
    return { countedSellValue, expectedSellValue };
  }

  const activeStats = useMemo(() => {
    const lines = active?.lines || [];
    let expected = 0;
    let counted = 0;
    let expectedSellValue = 0;
    let countedSellValue = 0;
    let countedLines = 0;
    let missing = 0;
    let extra = 0;
    let diffSell = 0;
    let missingSell = 0;
    let extraSell = 0;
    let diffBuy = 0;
    for (const line of lines) {
      const expectedQty = n(line.expected_qty);
      const countedValue = draftCountedValue(drafts[line.id]);
      expected += expectedQty;
      const sell = n(line.sell_price);
      expectedSellValue += expectedQty * sell;
      if (countedValue !== null) {
        countedSellValue += countedValue * sell;
        countedLines++;
        counted += countedValue;
        const diff = countedValue - expectedQty;
        const buy = n(line.buy_price);
        if (diff < 0) missing += Math.abs(diff);
        if (diff > 0) extra += diff;
        diffSell += diff * sell;
        diffBuy += diff * buy;
        if (diff < 0) missingSell += Math.abs(diff) * sell;
        if (diff > 0) extraSell += diff * sell;
      }
    }
    return {
      lines: lines.length,
      expected,
      counted,
      countedLines,
      missing,
      extra,
      net: counted - expected,
      missingSell,
      extraSell,
      diffSell,
      diffBuy,
      expectedSellValue,
      countedSellValue,
      complete: lines.length > 0 && countedLines === lines.length,
    };
  }, [active, drafts]);

  const countsPageSize = 10;
  const countsTotalPages = Math.max(1, Math.ceil(counts.length / countsPageSize));
  const visibleCounts = useMemo(() => {
    const start = (countsPage - 1) * countsPageSize;
    return counts.slice(start, start + countsPageSize);
  }, [counts, countsPage]);

  useEffect(() => {
    setCountsPage(1);
  }, [location]);

  useEffect(() => {
    if (countsPage > countsTotalPages) setCountsPage(countsTotalPages);
  }, [countsPage, countsTotalPages]);

  useEffect(() => {
    let cancelled = false;
    const loadValues = async () => {
      for (const count of visibleCounts) {
        if (cancelled || countValueCache[count.id] || countValueLoadingRef.current.has(count.id)) continue;
        countValueLoadingRef.current.add(count.id);
        try {
          const detail = await fetchAifJSON<InventoryCountDetail>(`/inventory-counts/${encodeURIComponent(count.id)}`);
          if (!cancelled) {
            const snapshot = valueSnapshotFromLines(detail.lines || []);
            setCountValueCache((prev) => ({ ...prev, [count.id]: snapshot }));
          }
        } catch {
          // A kártya ettől még használható, csak az érték marad átmenetileg ismeretlen.
        } finally {
          countValueLoadingRef.current.delete(count.id);
        }
      }
    };
    void loadValues();
    return () => { cancelled = true; };
  }, [visibleCounts]);

  const pendingLine = useMemo(() => {
    if (!pendingScan || !active) return null;
    return active.lines.find((line) => line.id === pendingScan.lineId) || null;
  }, [active, pendingScan]);

  const stockStats = useMemo(() => {
    return filteredStockRows.reduce((acc, row) => {
      acc.lines += 1;
      acc.qty += n(row.qty);
      acc.available += n(row.available_qty);
      acc.sellValue += n(row.qty) * n(row.sell_price);
      return acc;
    }, { lines: 0, qty: 0, available: 0, sellValue: 0 });
  }, [filteredStockRows]);

  const canEditActive = active && !["committed", "cancelled"].includes(active.item.status);

  async function createCount() {
    if (!location) {
      setMessage({ tone: "error", text: "Előbb válassz üzletet / helyszínt." });
      return;
    }
    setSaving(true);
    try {
      const detail = await fetchAifJSON<InventoryCountDetail>("/inventory-counts", {
        method: "POST",
        body: JSON.stringify({ location, title: title.trim() || todayTitle(), note: note.trim() || null, search: search.trim() || null }),
      });
      setActive(detail);
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setMessage({ tone: "success", text: "Leltár elindítva. A sorok menthetők és nyomtathatók." });
      await loadStockAndCounts(location, search);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár indítása nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  async function saveLines() {
    if (!active) return;
    setSaving(true);
    try {
      const lines = (Object.entries(drafts) as [string, DraftLine][]).map(([lineId, draft]) => ({ lineId, countedQty: draft.countedQty.trim() === "" ? null : draft.countedQty, note: draft.note.trim() || null }));
      const detail = await fetchAifJSON<InventoryCountDetail & { saved?: number }>(`/inventory-counts/${encodeURIComponent(active.item.id)}/lines`, {
        method: "PATCH",
        body: JSON.stringify({ lines }),
      });
      setActive({ item: detail.item, lines: detail.lines });
      setCountValueCache((prev) => ({ ...prev, [detail.item.id]: valueSnapshotFromLines(detail.lines || []) }));
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setMessage({ tone: "success", text: "Leltár mentve." });
      await loadStockAndCounts(location, search);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár mentése nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  function commitCount() {
    if (!active) return;
    if (!activeStats.complete) {
      setMessage({ tone: "error", text: "Bevezetés előtt minden sorhoz írj talált darabszámot." });
      return;
    }
    setConfirmDialog({
      kind: "commit",
      tone: "green",
      title: "Leltár bevezetése",
      description: "A bevezetés módosítja a készletet, és készletmozgást ír a naplóba.",
      confirmLabel: "Bevezetés",
      details: [
        `Leltár: ${active.item.title}`,
        `Helyszín: ${active.item.location_name || currentLocation?.name || "-"}`,
        `Sorok: ${formatQty(activeStats.lines)} · számolt: ${formatQty(activeStats.countedLines)}`,
        `Nettó eltérés: ${activeStats.net > 0 ? "+" : ""}${formatQty(activeStats.net)} db`,
      ],
    });
  }

  async function runCommitCount() {
    if (!active) return;
    if (!activeStats.complete) {
      setConfirmDialog(null);
      setMessage({ tone: "error", text: "Bevezetés előtt minden sorhoz írj talált darabszámot." });
      return;
    }
    setConfirmDialog(null);
    setSaving(true);
    try {
      await saveLines();
      const detail = await fetchAifJSON<InventoryCountDetail & { changed?: number }>(`/inventory-counts/${encodeURIComponent(active.item.id)}/commit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setActive({ item: detail.item, lines: detail.lines });
      setCountValueCache((prev) => ({ ...prev, [detail.item.id]: valueSnapshotFromLines(detail.lines || []) }));
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      notifyStockMovesChanged({ source: "inventory_count", inventoryCountId: detail.item.id });
      setMessage({ tone: "success", text: "Leltár bevezetve. A készlet és a mozgásnapló frissült." });
      await loadStockAndCounts(location, search);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár bevezetése nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  function deleteCount() {
    if (!active) return;
    setConfirmDialog({
      kind: "delete",
      tone: "red",
      title: "Leltár törlése",
      description: "A megkezdett leltár törlődik. Bevezetett leltár nem törölhető innen.",
      confirmLabel: "Törlés",
      details: [
        `Leltár: ${active.item.title}`,
        `Helyszín: ${active.item.location_name || currentLocation?.name || "-"}`,
        `Állapot: ${statusLabel(active.item.status)}`,
      ],
    });
  }

  async function runDeleteCount() {
    if (!active) return;
    setConfirmDialog(null);
    setSaving(true);
    try {
      await fetchAifJSON(`/inventory-counts/${encodeURIComponent(active.item.id)}`, { method: "DELETE" });
      setActive(null);
      setDrafts({});
      setMessage({ tone: "success", text: "Leltár törölve." });
      await loadStockAndCounts(location, search);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár törlése nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  function confirmDialogAction() {
    if (!confirmDialog || saving) return;
    if (confirmDialog.kind === "commit") {
      void runCommitCount();
    } else {
      void runDeleteCount();
    }
  }

  function updateDraft(lineId: string, patch: Partial<DraftLine>) {
    setDrafts((prev) => ({ ...prev, [lineId]: { ...(prev[lineId] || { countedQty: "", note: "" }), ...patch } }));
  }

  function findLineByBarcode(code: string) {
    const exact = barcodeKey(code);
    const loose = barcodeLooseKey(code);
    if (!exact && !loose) return null;
    const lines = activeRef.current?.lines || [];
    return lines.find((line) => barcodeValues(line).some((value) => barcodeKey(value) === exact)) ||
      lines.find((line) => barcodeValues(line).some((value) => barcodeLooseKey(value) === loose)) ||
      null;
  }

  function handleBarcodeCandidate(rawCode: string, source: "camera" | "manual" = "camera") {
    const code = String(rawCode || "").trim();
    if (!code) return;
    if (!activeRef.current) {
      setMessage({ tone: "error", text: "Előbb indíts vagy tölts be egy leltárt." });
      return;
    }
    if (!canEditActive) {
      setMessage({ tone: "error", text: "Ez a leltár már nem szerkeszthető." });
      return;
    }
    if (pendingScanRef.current) return;

    const now = Date.now();
    const key = barcodeKey(code);
    const duplicateWindowMs = source === "manual" ? 250 : 1100;
    if (lastScanRef.current.code === key && now - lastScanRef.current.at < duplicateWindowMs) return;
    lastScanRef.current = { code: key, at: now };

    const line = findLineByBarcode(code);
    if (!line) {
      setScannerStatus(`Nem találom ezt a bárkódot a leltárban: ${code}`);
      setMessage({ tone: "error", text: `A bárkód nincs ebben a leltárban: ${code}. Ellenőrizd a helyszínt vagy a vonalkódot.` });
      return;
    }

    setLineFilter("all");
    setPendingScan({ lineId: line.id, code, qty: 1, at: now, source });
    setScannerStatus(`${productTitle(line)} beolvasva. Alapból 1 db, erősítsd meg vagy állítsd + / - gombbal.`);
    if (source === "manual") setManualBarcode("");
  }

  function submitManualBarcode() {
    handleBarcodeCandidate(manualBarcode, "manual");
  }

  function handleManualBarcodeInput(value: string) {
    setManualBarcode(value);
    if (pendingScanRef.current) return;
    const code = String(value || "").trim();
    if (!code || !activeRef.current || !canEditActive) return;
    if (!findLineByBarcode(code)) return;
    handleBarcodeCandidate(code, "manual");
  }

  function changePendingQty(delta: number) {
    setPendingScan((prev) => {
      if (!prev) return prev;
      return { ...prev, qty: Math.max(1, prev.qty + delta) };
    });
  }

  function focusBarcodeInput() {
    window.setTimeout(() => {
      manualBarcodeInputRef.current?.focus();
      manualBarcodeInputRef.current?.select();
    }, 0);
  }

  function clearPendingScan() {
    const shouldRefocus = pendingScan?.source === "manual";
    setPendingScan(null);
    setScannerStatus("Beolvasás elvetve.");
    if (shouldRefocus) focusBarcodeInput();
  }

  function applyPendingScan() {
    if (!pendingScan) return;
    const line = (activeRef.current?.lines || []).find((item) => item.id === pendingScan.lineId);
    if (!line) {
      setPendingScan(null);
      setMessage({ tone: "error", text: "A beolvasott sor nem található. Frissítsd a leltárt." });
      return;
    }
    const current = draftCountedValue(draftsRef.current[pendingScan.lineId]) ?? 0;
    const next = current + pendingScan.qty;
    const shouldRefocus = pendingScan.source === "manual";
    updateDraft(pendingScan.lineId, { countedQty: String(next) });
    setPendingScan(null);
    setManualBarcode("");
    setScannerStatus(`${pendingScan.qty} db hozzáadva: ${productTitle(line)}. Új számolt mennyiség: ${next} db.`);
    setMessage({ tone: "success", text: `${pendingScan.qty} db hozzáadva ehhez: ${productTitle(line)}. Talált mennyiség: ${next} db.` });
    if (shouldRefocus) focusBarcodeInput();
  }

  function stopCameraScanner() {
    if (scannerFrameRef.current !== null) {
      window.cancelAnimationFrame(scannerFrameRef.current);
      scannerFrameRef.current = null;
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }
    if (scannerVideoRef.current) scannerVideoRef.current.srcObject = null;
    scannerDetectorRef.current = null;
    setScannerOpen(false);
  }

  async function startCameraScanner() {
    if (!active) {
      setMessage({ tone: "error", text: "Előbb indíts vagy tölts be egy leltárt." });
      return;
    }
    if (!canEditActive) {
      setMessage({ tone: "error", text: "Ez a leltár már nem szerkeszthető." });
      return;
    }
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      setScannerStatus("Ez a böngésző nem támogatja a kamera alapú BarcodeDetector API-t. A kézi / bluetooth olvasós mező működik.");
      setMessage({ tone: "error", text: "A böngésző nem támogatja a kamera-bárkódolvasást. Használj Chrome vagy Safari böngészőt, vagy a kézi / bluetooth olvasós mezőt." });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage({ tone: "error", text: "A kamera nem érhető el ezen az eszközön vagy böngészőben." });
      return;
    }

    stopCameraScanner();
    setScannerStatus("Kamera indítása...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      scannerStreamRef.current = stream;
      setScannerOpen(true);
      await new Promise((resolve) => window.setTimeout(resolve, 80));

      const videoElement = scannerVideoRef.current;
      if (!videoElement) throw new Error("A kamera nézet nem készült el. Zárd be és indítsd újra a scannert.");
      videoElement.srcObject = stream;
      videoElement.setAttribute("playsinline", "true");
      await videoElement.play().catch(() => undefined);

      try {
        scannerDetectorRef.current = new BarcodeDetectorCtor({ formats: ["ean_13", "ean_8", "code_128", "code_39", "code_93", "upc_a", "upc_e", "qr_code"] });
      } catch {
        scannerDetectorRef.current = new BarcodeDetectorCtor();
      }

      const tick = async () => {
        const video = scannerVideoRef.current;
        const detector = scannerDetectorRef.current;
        if (!scannerStreamRef.current || !video || !detector) return;
        if (!pendingScanRef.current && video.readyState >= 2) {
          try {
            const detected = await detector.detect(video);
            const first = detected?.[0];
            const raw = first?.rawValue || first?.raw_value || first?.displayValue;
            if (raw) handleBarcodeCandidate(String(raw), "camera");
          } catch {
            // Egy-egy kamera frame hibáját figyelmen kívül hagyjuk, a következő képkockán folytatjuk.
          }
        }
        scannerFrameRef.current = window.requestAnimationFrame(tick);
      };
      scannerFrameRef.current = window.requestAnimationFrame(tick);
      setScannerStatus("Kamera aktív. Irányítsd a bárkódra, majd erősítsd meg a talált terméket.");
    } catch (e) {
      stopCameraScanner();
      setScannerStatus("");
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A kamera indítása nem sikerült." });
    }
  }

  function renderScannerPanel() {
    if (!active) return null;
    const canScan = Boolean(canEditActive);
    const currentQty = pendingLine ? (draftCountedValue(drafts[pendingLine.id]) ?? 0) : 0;
    const afterQty = pendingScan && pendingLine ? currentQty + pendingScan.qty : currentQty;
    const afterDiff = pendingLine ? afterQty - n(pendingLine.expected_qty) : 0;
    const img = getImageSrc(pendingLine || undefined);

    return (
      <div className="border-t border-white/10 bg-[#404a5b]/35 p-4">
        <div className="grid gap-3 xl:grid-cols-[1.05fr_1.35fr]">
          <div className="rounded-3xl border border-[#2a8d8b]/35 bg-[#2a8d8b]/12 p-3 shadow-sm shadow-[#2a8d8b]/10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white">Beolvasás</h3>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {scannerOpen ? (
                  <button className={redBtn} type="button" onClick={stopCameraScanner}><X size={15} /> Kamera stop</button>
                ) : (
                  <button className={primaryBtn} type="button" onClick={startCameraScanner} disabled={!canScan}><Barcode size={15} /> Kamera indítása</button>
                )}
              </div>
            </div>

            <form className="mt-3" onSubmit={(e) => { e.preventDefault(); submitManualBarcode(); }}>
              <input
                ref={manualBarcodeInputRef}
                className={`${input} h-12 w-full text-base`}
                value={manualBarcode}
                onChange={(e) => handleManualBarcodeInput(e.target.value)}
                placeholder="Olvasd be a bárkódot…"
                autoComplete="off"
                inputMode="numeric"
                disabled={!canScan}
              />
            </form>

            {scannerOpen ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/14 bg-black/35">
                <video ref={scannerVideoRef} className="aspect-video w-full object-cover" muted playsInline />
                <div className="border-t border-white/10 px-3 py-2 text-xs text-white/62">Tartsd stabilan a kamerát, és igazítsd a vonalkódot a kép közepére.</div>
              </div>
            ) : null}

            {scannerStatus ? <div className="mt-3 rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white/78">{scannerStatus}</div> : null}
          </div>

          <div className="rounded-3xl border border-white/14 bg-white/[0.07] p-3">
            {pendingLine && pendingScan ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="grid h-36 w-full place-items-center overflow-hidden rounded-2xl border border-white/14 bg-white/90 sm:w-32 sm:shrink-0">
                  {img ? <img src={img} alt="" className="h-full w-full object-contain" /> : <ImageIcon size={32} className="text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#2a8d8b]/45 bg-[#2a8d8b]/18 px-2.5 py-1 text-xs text-[#d7fffe]">Találat</span>
                    <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-xs text-white/65">{pendingScan.code}</span>
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">{productTitle(pendingLine)}</div>
                  <div className="mt-1 text-sm text-white/66">{pendingLine.brand_name || "-"} · {pendingLine.color_name || pendingLine.color_code || "-"} · {pendingLine.size || "-"}</div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-2xl bg-white/[0.06] p-2"><div className="text-white/48">Rendszer</div><div className="mt-1 text-lg font-semibold text-white">{formatQty(pendingLine.expected_qty)}</div></div>
                    <div className="rounded-2xl bg-white/[0.06] p-2"><div className="text-white/48">Most számolt</div><div className="mt-1 text-lg font-semibold text-white">{formatQty(currentQty)}</div></div>
                    <div className="rounded-2xl bg-white/[0.06] p-2"><div className="text-white/48">Utána</div><div className={`mt-1 text-lg font-semibold ${afterDiff < 0 ? "text-red-100" : afterDiff > 0 ? "text-emerald-100" : "text-white"}`}>{formatQty(afterQty)} <span className="text-xs">({signedQty(afterDiff)})</span></div></div>
                  </div>

                  <div className="mt-3 grid grid-cols-[52px_1fr_52px] gap-2">
                    <button className={btnSoft} type="button" onClick={() => changePendingQty(-1)} disabled={pendingScan.qty <= 1}>−</button>
                    <div className="grid place-items-center rounded-2xl border border-white/14 bg-[#303a4c] text-center">
                      <div className="text-3xl font-semibold leading-none text-white">{pendingScan.qty}</div>
                    </div>
                    <button className={btnSoft} type="button" onClick={() => changePendingQty(1)}>+</button>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <button className={primaryBtn} type="button" onClick={applyPendingScan}><CheckCircle2 size={15} /> Hozzáadás a leltárhoz</button>
                    <button className={redBtn} type="button" onClick={clearPendingScan}><X size={15} /> Mégse</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid min-h-[230px] place-items-center rounded-2xl border border-dashed border-white/16 bg-white/[0.04] p-4 text-center">
                <div>
                  <Barcode className="mx-auto text-white/38" size={38} />
                  <div className="mt-3 text-base font-semibold text-white">Várja a beolvasást</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }


  function renderMobileActiveWorkspace() {
    if (!active || !isMobileLayout) return null;
    const canScan = Boolean(canEditActive);
    const currentQty = pendingLine ? (draftCountedValue(drafts[pendingLine.id]) ?? 0) : 0;
    const afterQty = pendingScan && pendingLine ? currentQty + pendingScan.qty : currentQty;
    const afterDiff = pendingLine ? afterQty - n(pendingLine.expected_qty) : 0;
    const pendingImg = getImageSrc(pendingLine || undefined);

    return (
      <section className="space-y-3 lg:hidden">
        <div className="sticky top-2 z-30 rounded-2xl border border-[#2a8d8b]/45 bg-[#303a4c]/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.14em] text-[#9ee4e2]">Aktív leltár</div>
              <div className="mt-1 truncate text-base font-semibold text-white">{active.item.title}</div>
              <div className="mt-1 text-xs text-white/62">{formatQty(activeStats.countedLines)} / {formatQty(activeStats.lines)} sor · {formatQty(activeStats.counted)} / {formatQty(activeStats.expected)} db</div>
            </div>
            <span className="shrink-0 rounded-full bg-white/[0.10] px-2.5 py-1 text-[11px] text-white/75">{statusLabel(active.item.status)}</span>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[11px]">
            <div className="rounded-xl bg-white/[0.07] p-2"><div className="text-white/46">Rendszer</div><div className="font-semibold text-white">{formatQty(activeStats.expected)}</div></div>
            <div className="rounded-xl bg-white/[0.07] p-2"><div className="text-white/46">Talált</div><div className="font-semibold text-white">{formatQty(activeStats.counted)}</div></div>
            <div className="rounded-xl bg-red-500/10 p-2"><div className="text-white/46">Hiány</div><div className="font-semibold text-red-100">{formatQty(activeStats.missing)}</div></div>
            <div className="rounded-xl bg-[#2a8d8b]/14 p-2"><div className="text-white/46">Többlet</div><div className="font-semibold text-emerald-100">{formatQty(activeStats.extra)}</div></div>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/14 px-3 py-2">
            <span className="text-[11px] text-white/60">Számolt eladási érték</span>
            <strong className="text-sm text-white">{formatMoney(activeStats.countedSellValue)} RON</strong>
          </div>

          <form className="mt-3" onSubmit={(e) => { e.preventDefault(); submitManualBarcode(); }}>
            <input
              ref={manualBarcodeInputRef}
              className="h-11 min-w-0 rounded-xl border border-white/18 bg-[#202a3a] px-3 text-base text-white outline-none placeholder:text-white/42 focus:border-[#2a8d8b]/75"
              value={manualBarcode}
              onChange={(e) => handleManualBarcodeInput(e.target.value)}
              placeholder="Olvasd be a bárkódot…"
              autoComplete="off"
              inputMode="numeric"
              disabled={!canScan}
            />
          </form>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {scannerOpen ? (
              <button className={redBtn} type="button" onClick={stopCameraScanner}><X size={15} /> Kamera stop</button>
            ) : (
              <button className={primaryBtn} type="button" onClick={startCameraScanner} disabled={!canScan}><Barcode size={15} /> Kamera</button>
            )}
            <button className={btnSoft} type="button" onClick={saveLines} disabled={saving || !canEditActive}><Save size={15} /> Mentés</button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className={btnSoft} type="button" onClick={() => printPdf("result")}><Download size={15} /> Eredmény PDF</button>
            <button className={primaryBtn} type="button" onClick={commitCount} disabled={saving || !canEditActive || !activeStats.complete}><CheckCircle2 size={15} /> Bevezetés</button>
          </div>

          {scannerOpen ? (
            <div className="mt-2 overflow-hidden rounded-xl border border-white/14 bg-black/40">
              <video ref={scannerVideoRef} className="max-h-56 w-full object-cover" muted playsInline />
            </div>
          ) : null}

          {pendingLine && pendingScan ? (
            <div className="mt-2 rounded-xl border border-[#2a8d8b]/45 bg-[#2a8d8b]/14 p-2">
              <div className="grid grid-cols-[64px_1fr] gap-2">
                <div className="grid h-20 w-16 place-items-center overflow-hidden rounded-lg border border-white/14 bg-white/90">
                  {pendingImg ? <img src={pendingImg} alt="" className="h-full w-full object-contain" /> : <ImageIcon size={22} className="text-slate-400" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{productTitle(pendingLine)}</div>
                  <div className="mt-0.5 text-xs text-white/65">{pendingLine.brand_name || "-"} · {pendingLine.color_name || pendingLine.color_code || "-"} · {pendingLine.size || "-"}</div>
                  <div className="mt-1 grid grid-cols-3 gap-1 text-center text-[10px]">
                    <div className="rounded-lg bg-white/[0.08] p-1"><div className="text-white/45">Volt</div><div className="text-white">{formatQty(currentQty)}</div></div>
                    <div className="rounded-lg bg-white/[0.08] p-1"><div className="text-white/45">+ db</div><div className="text-white">{formatQty(pendingScan.qty)}</div></div>
                    <div className="rounded-lg bg-white/[0.08] p-1"><div className="text-white/45">Utána</div><div className={afterDiff < 0 ? "text-red-100" : afterDiff > 0 ? "text-emerald-100" : "text-white"}>{formatQty(afterQty)}</div></div>
                  </div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-[44px_1fr_44px] gap-2">
                <button className={btnSoft} type="button" onClick={() => changePendingQty(-1)} disabled={pendingScan.qty <= 1}>−</button>
                <div className="grid place-items-center rounded-xl border border-white/14 bg-[#202a3a] text-center text-xl font-semibold text-white">{pendingScan.qty}</div>
                <button className={btnSoft} type="button" onClick={() => changePendingQty(1)}>+</button>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <button className={primaryBtn} type="button" onClick={applyPendingScan}><CheckCircle2 size={15} /> Hozzáadás</button>
                <button className={redBtn} type="button" onClick={clearPendingScan}><X size={15} /> Mégse</button>
              </div>
            </div>
          ) : null}

          {scannerStatus ? <div className="mt-2 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/76">{scannerStatus}</div> : null}
        </div>

        <div className="rounded-2xl border border-white/14 bg-white/[0.06] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/42" size={16} />
            <input className="h-10 w-full rounded-xl border border-white/16 bg-[#303a4c] pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/42" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés termékre vagy vonalkódra" />
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {([
              ["all", "Minden"],
              ["uncounted", "Nincs"],
              ["ok", "Egyezik"],
              ["missing", "Hiány"],
              ["extra", "Többlet"],
            ] as [LineFilter, string][]).map(([key, text]) => (
              <button key={key} type="button" className={`${lineFilter === key ? chipActive : chipIdle} shrink-0`} onClick={() => setLineFilter(key)}>{text}</button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className={btnSoft} type="button" onClick={setVisibleToExpected} disabled={!canEditActive}>Látható = rendszer</button>
            <button className={btnSoft} type="button" onClick={clearVisible} disabled={!canEditActive}>Látható ürítés</button>
          </div>
        </div>

        <div ref={inventoryLinesTopRef} className="grid gap-2" style={{ scrollMarginTop: 92 }}>
          {visibleInventoryLines.map((line) => {
            const diff = lineDiff(line, drafts);
            const img = getImageSrc(line);
            const counted = drafts[line.id]?.countedQty || "";
            return (
              <div key={line.id} className="rounded-2xl border border-white/14 bg-white/[0.055] p-2.5">
                <div className="grid grid-cols-[54px_1fr_auto] gap-2">
                  <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-xl border border-white/14 bg-white/90">
                    {img ? <img src={img} alt="" className="h-full w-full object-contain" /> : <ImageIcon size={18} className="text-slate-400" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9ee4e2]">{line.brand_name || "-"}</div>
                    <div className="truncate text-sm font-semibold text-white">{productTitle(line)}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-white/68">
                      <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5">{line.color_name || line.color_code || "-"}</span>
                      <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5">{line.size || "-"}</span>
                      <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5">{line.display_barcode || line.barcode || "-"}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-white/45">Rendszer</div>
                    <div className="text-base font-semibold text-white">{formatQty(line.expected_qty)}</div>
                    <div className={diff === null ? "text-white/45" : diff < 0 ? "text-red-200" : diff > 0 ? "text-emerald-200" : "text-white/75"}>{diff === null ? "-" : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-[44px_1fr_44px] gap-2">
                  <button
                    className="h-11 rounded-xl border border-white/14 bg-white/[0.08] text-xl text-white disabled:opacity-40"
                    type="button"
                    disabled={!canEditActive}
                    onClick={() => {
                      const current = draftCountedValue(drafts[line.id]) ?? 0;
                      updateDraft(line.id, { countedQty: String(Math.max(0, current - 1)) });
                    }}
                  >−</button>
                  <input className="h-11 w-full rounded-xl border border-white/18 bg-[#202a3a] px-3 text-center text-lg font-semibold text-white outline-none focus:border-[#2a8d8b]/70" disabled={!canEditActive} inputMode="numeric" value={counted} onChange={(e) => updateDraft(line.id, { countedQty: e.target.value.replace(/[^0-9]/g, "") })} placeholder="Talált" />
                  <button
                    className="h-11 rounded-xl border border-white/14 bg-white/[0.08] text-xl text-white disabled:opacity-40"
                    type="button"
                    disabled={!canEditActive}
                    onClick={() => {
                      const current = draftCountedValue(drafts[line.id]) ?? 0;
                      updateDraft(line.id, { countedQty: String(current + 1) });
                    }}
                  >+</button>
                </div>
              </div>
            );
          })}
          {!filteredLines.length ? <div className="rounded-2xl border border-white/14 bg-white/[0.05] p-4 text-center text-sm text-white/62">Nincs találat a jelenlegi szűrésre.</div> : null}
          {filteredLines.length > 0 ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-white/12 bg-[#303a4c] p-2">
              <div className="flex gap-1">
                {([20, 50, 100] as const).map((size) => (
                  <button key={size} type="button" className={linePageSize === size ? chipActive : chipIdle} onClick={() => setLinePageSize(size)}>{size}</button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button className={btnSoft} type="button" disabled={linePage <= 1} onClick={() => changeLinePage(linePage - 1)}><ChevronLeft size={15} /></button>
                <span className="px-2 text-xs text-white/55">{linePage}/{lineTotalPages}</span>
                <button className={btnSoft} type="button" disabled={linePage >= lineTotalPages} onClick={() => changeLinePage(linePage + 1)}><ChevronRight size={15} /></button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  function setVisibleToExpected() {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const line of filteredLines) next[line.id] = { ...(next[line.id] || { note: "" }), countedQty: String(Math.trunc(n(line.expected_qty))) };
      return next;
    });
  }

  function clearVisible() {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const line of filteredLines) next[line.id] = { ...(next[line.id] || { note: "" }), countedQty: "" };
      return next;
    });
  }

  function printPdf(mode: PrintMode) {
    if (!active) return;
    const rows = filteredLines.length ? filteredLines : active.lines;
    const locationName = active.item.location_name || currentLocation?.name || "-";
    const isResult = mode === "result";
    const titleText = isResult ? `Leltár eredmény - ${active.item.code}` : `Leltárív - ${active.item.code}`;
    const subtitle = `${locationName} · ${formatDateTime(active.item.started_at || active.item.created_at)}`;
    const tableRows = rows.map((line, index) => {
      const draft = drafts[line.id];
      const counted = draftCountedValue(draft);
      const diff = counted === null ? null : counted - n(line.expected_qty);
      const image = getImageSrc(line);
      const badge = diff === null ? "" : diff < 0 ? "HIÁNY" : diff > 0 ? "TÖBBLET" : "OK";
      const badgeClass = diff === null ? "" : diff < 0 ? "red" : diff > 0 ? "green" : "ok";
      return `<tr>
        <td class="center">${index + 1}</td>
        <td>${image ? `<img src="${escapeHtml(image)}" />` : ""}</td>
        <td><strong>${escapeHtml(productTitle(line))}</strong><br/><span>${escapeHtml(line.brand_name || "")} ${escapeHtml(line.category_name_ro || "")}</span><br/><span>Vonalkód: ${escapeHtml(line.display_barcode || line.barcode || "-")}</span></td>
        <td>${escapeHtml(line.color_name || line.color_code || "-")}</td>
        <td class="center">${escapeHtml(line.size || "-")}</td>
        ${isResult ? `<td class="right">${formatQty(line.expected_qty)}</td><td class="right">${counted === null ? "-" : formatQty(counted)}</td><td class="right ${diff && diff < 0 ? "neg" : diff && diff > 0 ? "pos" : ""}">${diff === null ? "-" : (diff > 0 ? "+" : "") + formatQty(diff)}</td><td><span class="badge ${badgeClass}">${badge}</span></td><td class="right">${formatMoney((diff || 0) * n(line.sell_price))}</td>` : `<td class="manual"></td><td class="check"></td><td class="note"></td>`}
      </tr>`;
    }).join("");
    const summary = isResult ? `<div class="summary">
      <div><b>Rendszer szerint:</b> ${formatQty(activeStats.expected)} db</div>
      <div><b>Számolt:</b> ${formatQty(activeStats.counted)} db</div>
      <div><b>Hiány:</b> ${formatQty(activeStats.missing)} db</div>
      <div><b>Többlet:</b> ${formatQty(activeStats.extra)} db</div>
      <div><b>Eltérés eladási értéken:</b> ${formatMoney(activeStats.diffSell)} RON</div>
    </div>` : `<div class="summary"><div><b>Sorok:</b> ${rows.length}</div><div><b>Helyszín:</b> ${escapeHtml(locationName)}</div><div><b>Megjegyzés:</b> ${escapeHtml(active.item.note || "")}</div></div>`;

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(titleText)}</title><style>
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
      header { display:flex; justify-content:space-between; gap:16px; border-bottom:2px solid #111827; padding-bottom:10px; margin-bottom:12px; }
      h1 { font-size:20px; margin:0 0 4px; }
      .muted, span { color:#6b7280; font-size:11px; }
      .summary { display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; margin: 10px 0 12px; font-size:11px; }
      .summary div { border:1px solid #d1d5db; border-radius:8px; padding:8px; }
      table { width:100%; border-collapse: collapse; font-size:10px; }
      th { background:#1f2937; color:white; text-align:left; padding:7px; border:1px solid #1f2937; }
      td { padding:6px; border:1px solid #d1d5db; vertical-align:middle; }
      img { width:34px; height:42px; object-fit:contain; border:1px solid #d1d5db; border-radius:6px; }
      .center { text-align:center; } .right { text-align:right; }
      .manual { height:28px; width:62px; } .check { width:48px; } .note { width:120px; }
      .badge { display:inline-block; min-width:45px; border-radius:999px; padding:3px 7px; color:white; font-weight:700; text-align:center; }
      .badge.red { background:#dc2626; } .badge.green { background:#2a8d8b; } .badge.ok { background:#374151; }
      .neg { color:#dc2626; font-weight:700; } .pos { color:#047857; font-weight:700; }
      footer { display:grid; grid-template-columns: repeat(3, 1fr); gap:18px; margin-top:20px; font-size:11px; }
      footer div { border-top:1px solid #111827; padding-top:6px; text-align:center; }
    </style></head><body>
      <header><div><h1>${escapeHtml(titleText)}</h1><div class="muted">${escapeHtml(subtitle)}</div></div><div class="muted">Nyomtatva: ${escapeHtml(formatDateTime(new Date().toISOString()))}</div></header>
      ${summary}
      <table><thead><tr>
        <th>#</th><th>Kép</th><th>Termék</th><th>Szín</th><th>Méret</th>
        ${isResult ? "<th>Rendszer</th><th>Talált</th><th>Eltérés</th><th>Állapot</th><th>Érték RON</th>" : "<th>Talált db</th><th>Pipa</th><th>Megjegyzés</th>"}
      </tr></thead><tbody>${tableRows}</tbody></table>
      <footer><div>Számolta</div><div>Ellenőrizte</div><div>Bevezette</div></footer>
      <script>window.onload = () => { window.focus(); setTimeout(() => window.print(), 250); };</script>
    </body></html>`;
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  const messageClass = message?.tone === "error" ? "border-red-300/35 bg-red-500/12 text-red-50" : message?.tone === "success" ? "border-[#2a8d8b]/45 bg-[#2a8d8b]/14 text-white" : "border-white/14 bg-white/[0.06] text-white/78";

  return (
    <div className={page}>
      <div className={shell}>
        <header className="sticky top-2 z-50 rounded-2xl border border-white/20 bg-[#303a4c]/95 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.05] backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] border-l-4 border-[#7bd7d4]/70 pl-3">
              <p className="text-[11px] uppercase tracking-[0.18em] leading-none text-[#cffffd]/70">AllInFashion</p>
              <h1 className="mt-1 text-xl leading-tight tracking-tight text-white">Leltár</h1>
              <p className="mt-0.5 text-[11px] leading-snug text-white/52">Üzletenkénti leltárív, számolás és készletbevezetés</p>
            </div>
            <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
              <button
                className={headerBtnSoft}
                type="button"
                onClick={() => location && loadStockAndCounts(location, search)}
                disabled={loading || !location}
              >
                <RefreshCw size={15} /> Frissítés
              </button>
              <button className={headerPrimaryBtn} type="button" onClick={createCount} disabled={saving || !location}>
                <ClipboardList size={15} /> Új leltár
              </button>
              <button className={`${headerBtn} ml-2 border-white/30 bg-[#263246] px-3`} type="button" onClick={goHome} title="Kezdőlap">
                <Home size={15} /> Kezdőlap
              </button>
            </div>
          </div>
        </header>

        {message ? <div className={`rounded-2xl border px-4 py-3 text-sm ${messageClass}`}>{message.text}</div> : null}

        {active && isMobileLayout ? renderMobileActiveWorkspace() : null}

        {(!active || !isMobileLayout) ? (
        <section className={panel}>
          <div className={panelHead}>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold"><Filter size={16} /> Leltár előkészítés</div>
              <div className="mt-1 text-xs text-white/58">Válaszd ki az üzletet, szűrd a készletet, majd indíts vagy folytass leltárt.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={btnSoft} type="button" onClick={() => location && loadStockAndCounts(location, search)} disabled={loading}><RefreshCw size={15} /> Frissítés</button>
              <button className={primaryBtn} type="button" onClick={createCount} disabled={saving || !location}><ClipboardList size={15} /> Új leltár indítása</button>
            </div>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-[1.2fr_1.4fr_1fr]">
            <label className={label}>Üzlet / helyszín
              <CompactSelect
                value={location}
                onChange={(next) => { setLocation(next); setActive(null); setDrafts({}); }}
                placeholder="Válassz üzletet"
                options={locations.map((loc) => ({ value: loc.id, label: loc.name }))}
              />
            </label>
            <label className={label}>Termék / vonalkód keresés
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45" size={16} />
                <input className={`${input} w-full pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Terméknév, márka, vonalkód..." />
              </div>
            </label>
            <label className={label}>Kategória
              <CompactSelect
                value={categoryFilter}
                onChange={setCategoryFilter}
                placeholder="Minden kategória"
                options={[
                  { value: "all", label: "Minden kategória" },
                  ...categories.map(([code, name]) => ({ value: code, label: name })),
                ]}
              />
            </label>
            <label className={`${label} lg:col-span-2`}>Leltár címe
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pl. Júliusi üzlet leltár" />
            </label>
            <label className={label}>Megjegyzés
              <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pl. ellenőrző leltár" />
            </label>
          </div>
        </section>
        ) : null}

        {(!active || !isMobileLayout) ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label={sourceLabel(currentLocation)} value={currentLocation?.name || "-"} hint="Kiválasztott helyszín" icon={<MapPin size={18} />} tone="blue" />
          <StatCard label="Készletsor" value={formatQty(stockStats.lines)} hint={`${formatQty(stockStats.qty)} db rendszer szerint`} icon={<PackageCheck size={18} />} />
          <StatCard label="Elérhető" value={formatQty(stockStats.available)} hint="Készlet mínusz foglalt" icon={<ShieldCheck size={18} />} tone="green" />
          <StatCard label="Becsült eladási érték" value={`${formatMoney(stockStats.sellValue)} RON`} hint="A kiválasztott készleten" icon={<FileText size={18} />} />
        </section>
        ) : null}

        {(!active || !isMobileLayout) ? (
        <section className={panel}>
          <button
            type="button"
            className={`${panelHead} w-full text-left`}
            onClick={() => setCountsExpanded((value) => !value)}
            aria-expanded={countsExpanded}
          >
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck size={16} /> Folyamatban lévő / korábbi leltárak</div>
              <div className="mt-1 text-xs text-white/58">10 leltár oldalanként. A kiválasztott sor zölddel kiemelve.</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/60">{counts.length} leltár</span>
              <ChevronDown size={18} className={`text-white/70 transition ${countsExpanded ? "rotate-180" : ""}`} />
            </div>
          </button>

          {countsExpanded ? (
            <div className="p-3">
              <div className="grid gap-2">
                {visibleCounts.length ? visibleCounts.map((count) => {
                  const selected = active?.item.id === count.id;
                  const cached = selected
                    ? { countedSellValue: activeStats.countedSellValue, expectedSellValue: activeStats.expectedSellValue }
                    : countValueCache[count.id];
                  const progress = Math.max(0, Math.min(100, n(count.line_count) ? (n(count.counted_lines) / n(count.line_count)) * 100 : 0));
                  return (
                    <button
                      key={count.id}
                      type="button"
                      onClick={() => loadCount(count.id)}
                      className={`w-full overflow-hidden rounded-2xl border text-left transition ${selected
                        ? "border-[#9ee4e2]/75 bg-[#2a8d8b] shadow-[0_12px_28px_rgba(42,141,139,0.24)]"
                        : "border-white/14 bg-white/[0.055] hover:border-[#7bd7d4]/35 hover:bg-white/[0.09]"}`}
                    >
                      <div className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(260px,1.5fr)_110px_110px_110px_minmax(180px,1fr)_auto] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-white">{count.title}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${selected ? "border-white/35 bg-white/16 text-white" : count.status === "committed" ? "border-[#7bd7d4]/30 bg-[#2a8d8b]/28 text-[#d7fffe]" : "border-white/12 bg-white/[0.08] text-white/72"}`}>{statusLabel(count.status)}</span>
                          </div>
                          <div className={`mt-1 text-[11px] ${selected ? "text-white/78" : "text-white/50"}`}>{count.code} · {formatDateTime(count.created_at)}</div>
                          <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${selected ? "bg-white/20" : "bg-slate-950/28"}`}>
                            <div className={`h-full rounded-full ${selected ? "bg-white" : "bg-[#63d8d3]"}`} style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                        <div className="text-xs"><span className={selected ? "text-white/68" : "text-white/46"}>Sor</span><div className="mt-1 text-base font-semibold text-white">{formatQty(count.line_count)}</div></div>
                        <div className="text-xs"><span className={selected ? "text-white/68" : "text-white/46"}>Számolt</span><div className="mt-1 text-base font-semibold text-white">{formatQty(count.counted_lines)}</div></div>
                        <div className="text-xs"><span className={selected ? "text-white/68" : "text-white/46"}>Eltérés</span><div className={`mt-1 text-base font-semibold ${selected ? "text-white" : n(count.diff_qty) < 0 ? "text-red-200" : n(count.diff_qty) > 0 ? "text-emerald-200" : "text-white"}`}>{n(count.diff_qty) > 0 ? "+" : ""}{formatQty(count.diff_qty)}</div></div>
                        <div className={`rounded-xl border px-3 py-2 ${selected ? "border-white/25 bg-white/12" : "border-[#7bd7d4]/20 bg-[#2a8d8b]/10"}`}>
                          <div className={selected ? "text-[10px] uppercase tracking-wide text-white/68" : "text-[10px] uppercase tracking-wide text-[#9ee4e2]/75"}>Számolt eladási érték</div>
                          <div className="mt-1 text-base font-semibold text-white">{cached ? `${formatMoney(cached.countedSellValue)} RON` : "Betöltés..."}</div>
                          <div className={selected ? "mt-0.5 text-[10px] text-white/62" : "mt-0.5 text-[10px] text-white/42"}>{cached ? `Rendszerérték: ${formatMoney(cached.expectedSellValue)} RON` : ""}</div>
                        </div>
                        <ChevronDown size={17} className={`hidden -rotate-90 lg:block ${selected ? "text-white" : "text-white/35"}`} />
                      </div>
                    </button>
                  );
                }) : <div className="rounded-2xl border border-white/14 bg-white/[0.04] p-4 text-sm text-white/62">Ehhez a helyszínhez még nincs leltár.</div>}
              </div>

              {counts.length > countsPageSize ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                  <span className="text-xs text-white/52">{countsPage} / {countsTotalPages}. oldal · oldalanként 10</span>
                  <div className="flex gap-2">
                    <button className={btnSoft} type="button" disabled={countsPage <= 1} onClick={(event) => { event.stopPropagation(); setCountsPage((value) => Math.max(1, value - 1)); }}>Előző</button>
                    <button className={btnSoft} type="button" disabled={countsPage >= countsTotalPages} onClick={(event) => { event.stopPropagation(); setCountsPage((value) => Math.min(countsTotalPages, value + 1)); }}>Következő</button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
        ) : null}

        {active ? (
          isMobileLayout ? null : (
          <section className={panel}>
            <div className={panelHead}>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/42">{active.item.code}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold">
                  {active.item.title}
                  <span className={`rounded-full px-2.5 py-1 text-[11px] ${active.item.status === "committed" ? "bg-[#2a8d8b] text-white" : "bg-white/[0.10] text-white/72"}`}>{statusLabel(active.item.status)}</span>
                </div>
                <div className="mt-1 text-xs text-white/58">{active.item.location_name} · indítva: {formatDateTime(active.item.started_at || active.item.created_at)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnSoft} type="button" onClick={() => printPdf("sheet")}><Printer size={15} /> Leltárív PDF</button>
                <button className={btnSoft} type="button" onClick={() => printPdf("result")}><Download size={15} /> Eredmény PDF</button>
                <button className={btnSoft} type="button" onClick={saveLines} disabled={saving || !canEditActive}><Save size={15} /> Mentés</button>
                <button className={primaryBtn} type="button" onClick={commitCount} disabled={saving || !canEditActive || !activeStats.complete}><CheckCircle2 size={15} /> Bevezetés</button>
                {canEditActive ? <button className={redBtn} type="button" onClick={deleteCount} disabled={saving}><Trash2 size={15} /> Törlés</button> : null}
              </div>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6">
              <StatCard label="Rendszer szerint" value={formatQty(activeStats.expected)} hint={`${formatQty(activeStats.lines)} sor`} icon={<ClipboardList size={18} />} />
              <StatCard label="Megszámolva" value={formatQty(activeStats.counted)} hint={`${formatQty(activeStats.countedLines)} / ${formatQty(activeStats.lines)} sor`} icon={<CheckCircle2 size={18} />} tone="green" />
              <StatCard label="Hiány" value={formatQty(activeStats.missing)} hint={`${formatMoney(activeStats.missingSell)} RON eladási értéken`} icon={<AlertTriangle size={18} />} tone="red" />
              <StatCard label="Többlet" value={formatQty(activeStats.extra)} hint={`${formatMoney(activeStats.extraSell)} RON eladási értéken`} icon={<PackageCheck size={18} />} tone="green" />
              <StatCard label="Nettó eltérés" value={`${activeStats.net > 0 ? "+" : ""}${formatQty(activeStats.net)}`} hint={`${formatMoney(activeStats.diffSell)} RON eladási értéken`} icon={<SlidersHorizontal size={18} />} tone={activeStats.net < 0 ? "red" : activeStats.net > 0 ? "green" : "neutral"} />
              <StatCard label="Számolt érték" value={`${formatMoney(activeStats.countedSellValue)} RON`} hint={`Rendszerérték: ${formatMoney(activeStats.expectedSellValue)} RON`} icon={<FileText size={18} />} tone="blue" />
            </div>

            {renderScannerPanel()}

            <div className="flex flex-col gap-3 border-y border-white/10 bg-[#404a5b]/55 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "Minden sor"],
                  ["uncounted", "Nincs számolva"],
                  ["ok", "Egyezik"],
                  ["missing", "Hiány"],
                  ["extra", "Többlet"],
                ] as [LineFilter, string][]).map(([key, text]) => (
                  <button key={key} type="button" className={lineFilter === key ? chipActive : chipIdle} onClick={() => setLineFilter(key)}>{text}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnSoft} type="button" onClick={setVisibleToExpected} disabled={!canEditActive}>Látható sorok = rendszer</button>
                <button className={btnSoft} type="button" onClick={clearVisible} disabled={!canEditActive}>Látható ürítés</button>
              </div>
            </div>

            <div ref={inventoryLinesTopRef} className="hidden overflow-auto lg:block" style={{ scrollMarginTop: 92 }}>
              <table className="w-full min-w-[1180px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: "31%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <thead className="bg-[#263247] text-[11px] uppercase tracking-[0.08em] text-white">
                  <tr>
                    <th className="px-3 py-3 text-left">Termék</th>
                    <th className="px-3 py-3 text-left">Szín</th>
                    <th className="px-3 py-3 text-center">Méret</th>
                    <th className="px-3 py-3 text-center">Rendszer</th>
                    <th className="px-3 py-3 text-center">Talált</th>
                    <th className="px-3 py-3 text-center">Eltérés</th>
                    <th className="px-3 py-3 text-center">Érték</th>
                    <th className="px-3 py-3 text-left">Megjegyzés</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleInventoryLines.map((line, rowIndex) => {
                    const diff = lineDiff(line, drafts);
                    const img = getImageSrc(line);
                    return (
                      <tr key={line.id} className={`border-t border-white/10 transition hover:bg-[#445064] ${rowIndex % 2 ? "bg-white/[0.018]" : "bg-transparent"}`}> 
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <HoverZoomImage src={img} title={productTitle(line)} />
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9ee4e2]">{line.brand_name || "-"} <span className="text-white/50 normal-case">{line.category_name_ro || ""}</span></div>
                              <div className="font-semibold text-white">{productTitle(line)}</div>
                              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] text-white/74"><Barcode size={12} /> {line.display_barcode || line.barcode || "-"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-left text-white/85">{line.color_name || line.color_code || "-"}</td>
                        <td className="px-3 py-3 text-center text-white/85">{line.size || "-"}</td>
                        <td className="px-3 py-3 text-center font-semibold tabular-nums">{formatQty(line.expected_qty)}</td>
                        <td className="px-3 py-3 text-center">
                          <div className="mx-auto inline-grid grid-cols-[34px_96px_34px] items-center gap-1">
                            <button
                              className="h-10 rounded-xl border border-white/14 bg-white/[0.08] text-base text-white hover:bg-white/[0.12] disabled:opacity-40"
                              type="button"
                              disabled={!canEditActive}
                              onClick={() => {
                                const current = draftCountedValue(drafts[line.id]) ?? 0;
                                updateDraft(line.id, { countedQty: String(Math.max(0, current - 1)) });
                              }}
                              aria-label="Talált mennyiség csökkentése"
                            >−</button>
                            <input className={`${qtyInput} w-24`} disabled={!canEditActive} inputMode="numeric" value={drafts[line.id]?.countedQty || ""} onChange={(e) => updateDraft(line.id, { countedQty: e.target.value.replace(/[^0-9]/g, "") })} />
                            <button
                              className="h-10 rounded-xl border border-white/14 bg-white/[0.08] text-base text-white hover:bg-white/[0.12] disabled:opacity-40"
                              type="button"
                              disabled={!canEditActive}
                              onClick={() => {
                                const current = draftCountedValue(drafts[line.id]) ?? 0;
                                updateDraft(line.id, { countedQty: String(current + 1) });
                              }}
                              aria-label="Talált mennyiség növelése"
                            >+</button>
                          </div>
                        </td>
                        <td className={`px-3 py-3 text-center font-semibold tabular-nums ${diff === null ? "text-white/45" : diff < 0 ? "text-red-200" : diff > 0 ? "text-emerald-200" : "text-white"}`}>{diff === null ? "-" : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}</td>
                        <td className={`px-3 py-3 text-center tabular-nums ${diff === null ? "text-white/45" : diff < 0 ? "text-red-200" : diff > 0 ? "text-emerald-200" : "text-white/72"}`}>{diff === null ? "-" : `${formatMoney(diff * n(line.sell_price))} RON`}</td>
                        <td className="px-3 py-3"><input className={`${input} w-full`} disabled={!canEditActive} value={drafts[line.id]?.note || ""} onChange={(e) => updateDraft(line.id, { note: e.target.value })} placeholder="Megjegyzés" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="hidden items-center justify-between gap-3 border-t border-white/10 bg-[#303a4c]/55 px-4 py-3 lg:flex">
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/55">
                  {filteredLines.length ? `${((linePage - 1) * linePageSize + 1).toLocaleString("hu-HU")}–${Math.min(linePage * linePageSize, filteredLines.length).toLocaleString("hu-HU")} / ${filteredLines.length.toLocaleString("hu-HU")} termék` : "0 termék"}
                </span>
                <div className="w-[138px]">
                  <CompactSelect
                    value={String(linePageSize)}
                    onChange={(value) => setLinePageSize(Number(value) as 20 | 50 | 100)}
                    size="compact"
                    menuMinWidth={138}
                    ariaLabel="Termékek száma oldalanként"
                    options={[
                      { value: "20", label: "20 / oldal" },
                      { value: "50", label: "50 / oldal" },
                      { value: "100", label: "100 / oldal" },
                    ]}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="min-w-[92px] text-center text-xs text-white/55">{linePage} / {lineTotalPages}. oldal</span>
                <button className={btnSoft} type="button" disabled={linePage <= 1} onClick={() => changeLinePage(linePage - 1)}><ChevronLeft size={15} /> Előző</button>
                <button className={btnSoft} type="button" disabled={linePage >= lineTotalPages} onClick={() => changeLinePage(linePage + 1)}>Következő <ChevronRight size={15} /></button>
              </div>
            </div>

            <div className="grid gap-3 p-4 lg:hidden">
              {filteredLines.map((line) => {
                const diff = lineDiff(line, drafts);
                const img = getImageSrc(line);
                return (
                  <div key={line.id} className="rounded-2xl border border-white/14 bg-white/[0.05] p-3">
                    <div className="flex gap-3">
                      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/14 bg-white/90">
                        {img ? <img src={img} alt="" className="h-full w-full object-contain" /> : <ImageIcon size={18} className="text-slate-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9ee4e2]">{line.brand_name || "-"}</div>
                        <div className="font-semibold text-white">{productTitle(line)}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-white/70"><span className="rounded-full bg-white/[0.08] px-2 py-0.5">{line.color_name || "-"}</span><span className="rounded-full bg-white/[0.08] px-2 py-0.5">{line.size || "-"}</span><span className="rounded-full bg-white/[0.08] px-2 py-0.5">{line.display_barcode || line.barcode || "-"}</span></div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Rendszer</div><div className="text-base font-semibold">{formatQty(line.expected_qty)}</div></div>
                      <div className="rounded-xl bg-white/[0.06] p-2">
                        <div className="text-white/50">Talált</div>
                        <div className="mt-1 grid grid-cols-[36px_1fr_36px] gap-1">
                          <button
                            className="rounded-lg border border-white/14 bg-white/[0.08] text-base text-white disabled:opacity-40"
                            type="button"
                            disabled={!canEditActive}
                            onClick={() => {
                              const current = draftCountedValue(drafts[line.id]) ?? 0;
                              updateDraft(line.id, { countedQty: String(Math.max(0, current - 1)) });
                            }}
                          >−</button>
                          <input className={`${qtyInput} w-full`} disabled={!canEditActive} inputMode="numeric" value={drafts[line.id]?.countedQty || ""} onChange={(e) => updateDraft(line.id, { countedQty: e.target.value.replace(/[^0-9]/g, "") })} />
                          <button
                            className="rounded-lg border border-white/14 bg-white/[0.08] text-base text-white disabled:opacity-40"
                            type="button"
                            disabled={!canEditActive}
                            onClick={() => {
                              const current = draftCountedValue(drafts[line.id]) ?? 0;
                              updateDraft(line.id, { countedQty: String(current + 1) });
                            }}
                          >+</button>
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Eltérés</div><div className={`text-base font-semibold ${diff === null ? "text-white/45" : diff < 0 ? "text-red-200" : diff > 0 ? "text-emerald-200" : "text-white"}`}>{diff === null ? "-" : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}</div></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          )
        ) : (
          <section className={panel}>
            <div className={panelHead}>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold"><PackageCheck size={16} /> Aktuális készlet előnézet</div>
                <div className="mt-1 text-xs text-white/58">Ebből készül az új leltár nyitó listája.</div>
              </div>
              <div className="text-xs text-white/60">{filteredStockRows.length} sor</div>
            </div>
            <div className="hidden overflow-auto lg:block">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="bg-[#263247] text-xs uppercase tracking-wide text-white">
                  <tr><th className="px-4 py-3 text-left">Termék</th><th className="px-4 py-3 text-left">Szín</th><th className="px-4 py-3 text-left">Méret</th><th className="px-4 py-3 text-right">Készlet</th><th className="px-4 py-3 text-right">Foglalt</th><th className="px-4 py-3 text-right">Elérhető</th></tr>
                </thead>
                <tbody>{filteredStockRows.map((row) => <tr key={`${row.location_id}-${row.variant_id}`} className="border-t border-white/10 hover:bg-white/[0.04]"><td className="px-4 py-3"><div className="font-semibold">{productTitle(row)}</div><div className="mt-1 text-xs text-white/55">{row.brand_name || "-"} · Vonalkód: {row.display_barcode || row.barcode || "-"}</div></td><td className="px-4 py-3">{row.color_name || row.color_code || "-"}</td><td className="px-4 py-3">{row.size || "-"}</td><td className="px-4 py-3 text-right font-semibold">{formatQty(row.qty)}</td><td className="px-4 py-3 text-right">{formatQty(row.reserved_qty)}</td><td className="px-4 py-3 text-right">{formatQty(row.available_qty)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="grid gap-3 p-4 lg:hidden">{filteredStockRows.map((row) => <div key={`${row.location_id}-${row.variant_id}`} className="rounded-2xl border border-white/14 bg-white/[0.05] p-3"><div className="font-semibold">{productTitle(row)}</div><div className="mt-1 text-xs text-white/60">{row.brand_name || "-"} · {row.color_name || "-"} · {row.size || "-"}</div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Készlet</div><b>{formatQty(row.qty)}</b></div><div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Foglalt</div><b>{formatQty(row.reserved_qty)}</b></div><div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">Elérhető</div><b>{formatQty(row.available_qty)}</b></div></div></div>)}</div>
          </section>
        )}

        {confirmDialog ? (
          <div className="fixed inset-0 z-50 grid place-items-center px-4 py-6">
            <button
              type="button"
              aria-label="Megerősítés bezárása"
              className="absolute inset-0 bg-black/62 backdrop-blur-sm"
              onClick={() => !saving && setConfirmDialog(null)}
            />
            <div role="dialog" aria-modal="true" className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/18 bg-[#404a5b] text-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-white/12 bg-[#4b5362] px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${confirmDialog.tone === "red" ? "border-red-300/45 bg-red-600 text-white" : "border-[#2a8d8b]/60 bg-[#2a8d8b] text-white"}`}>
                    {confirmDialog.tone === "red" ? <Trash2 size={20} /> : <CheckCircle2 size={20} />}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Megerősítés</div>
                    <h2 className="mt-1 text-lg font-semibold text-white">{confirmDialog.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-white/72">{confirmDialog.description}</p>
                  </div>
                </div>
                <button className={btnSoft} type="button" onClick={() => !saving && setConfirmDialog(null)} disabled={saving}>
                  <X size={15} /> Bezárás
                </button>
              </div>

              {confirmDialog.details?.length ? (
                <div className="m-5 rounded-2xl border border-white/14 bg-[#303a4c] p-4">
                  <div className="grid gap-2 text-sm text-white/78">
                    {confirmDialog.details.map((item) => (
                      <div key={item} className="flex items-start gap-2">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${confirmDialog.tone === "red" ? "bg-red-400" : "bg-[#2a8d8b]"}`} />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t border-white/10 bg-[#354153] px-5 py-4 sm:flex-row sm:justify-end">
                <button className={btnSoft} type="button" onClick={() => setConfirmDialog(null)} disabled={saving}>
                  Mégse
                </button>
                <button className={confirmDialog.tone === "red" ? redBtn : primaryBtn} type="button" onClick={confirmDialogAction} disabled={saving}>
                  {confirmDialog.tone === "red" ? <Trash2 size={15} /> : <CheckCircle2 size={15} />} {confirmDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/14 bg-[#263247] px-4 py-2 text-xs text-white shadow-lg">Betöltés...</div> : null}
      </div>
    </div>
  );
}
