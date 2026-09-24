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
  Eye,
  FileText,
  Filter,
  History,
  Home,
  ImageIcon,
  MapPin,
  PackageCheck,
  Printer,
  RefreshCw,
  RotateCcw,
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


const HU_MONTHS = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
] as const;
const HU_WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"] as const;

function isoDateParts(value?: string | null) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day, date };
}

function isoFromUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function huDateLabel(value?: string | null) {
  const parsed = isoDateParts(value);
  if (!parsed) return "Dátum választása";
  return `${parsed.year}. ${String(parsed.month).padStart(2, "0")}. ${String(parsed.day).padStart(2, "0")}.`;
}

function HungarianDatePicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const parsed = isoDateParts(value);
  const [viewYear, setViewYear] = useState(parsed?.year || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState((parsed?.month || new Date().getMonth() + 1) - 1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const todayIso = localDateInput();

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const edge = 10;
    const gap = 8;
    const width = Math.min(336, window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const estimatedHeight = 382;
    const roomBelow = window.innerHeight - rect.bottom - edge;
    const roomAbove = rect.top - edge;
    const openUpward = roomBelow < estimatedHeight && roomAbove > roomBelow;
    if (openUpward) {
      setPosition({ left, width, bottom: Math.max(edge, window.innerHeight - rect.top + gap) });
    } else {
      setPosition({ left, width, top: Math.max(edge, rect.bottom + gap) });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const current = isoDateParts(value);
    if (current) {
      setViewYear(current.year);
      setViewMonth(current.month - 1);
    }
    updatePosition();

    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reposition = () => updatePosition();
    document.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition, value]);

  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1, 12));
  const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(1 - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setUTCDate(gridStart.getUTCDate() + index);
    return day;
  });

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1, 12));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  }

  function chooseDate(iso: string) {
    onChange(iso);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className={`group flex h-11 w-full items-center justify-between rounded-[13px] border px-3 text-left text-sm font-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none transition ${
          open
            ? "border-[#8ce7e2]/72 bg-gradient-to-b from-[#315268] to-[#2b4054] ring-2 ring-[#7bd7d4]/14"
            : "border-white/18 bg-gradient-to-b from-[#2d394b] to-[#293548] hover:border-[#7bd7d4]/38 hover:from-[#324157] hover:to-[#2c3a4e]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <CalendarDays size={16} className="shrink-0 text-[#8fe9e5]" />
          <span className="truncate tracking-[0.02em]">{huDateLabel(value)}</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-white/52 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label={`${ariaLabel} naptár`}
          className="overflow-hidden rounded-[20px] border border-[#8ce7e2]/42 bg-[#202c3d]/[0.995] p-3 text-white shadow-[0_30px_80px_rgba(2,6,23,0.76)] backdrop-blur-xl"
          style={{
            position: "fixed",
            zIndex: 940,
            left: position.left,
            width: position.width,
            top: position.top,
            bottom: position.bottom,
          }}
        >
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#29374b] px-2 py-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/76 transition hover:border-[#7bd7d4]/35 hover:bg-[#2a8d8b]/18 hover:text-white"
              aria-label="Előző hónap"
            >
              <ChevronLeft size={17} />
            </button>
            <div className="text-center">
              <p className="text-[9px] uppercase tracking-[0.16em] text-[#cffffd]/48">Naptár</p>
              <p className="mt-0.5 text-sm font-medium text-white">{viewYear}. {HU_MONTHS[viewMonth]}</p>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/76 transition hover:border-[#7bd7d4]/35 hover:bg-[#2a8d8b]/18 hover:text-white"
              aria-label="Következő hónap"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {HU_WEEKDAYS.map((day, index) => (
              <div
                key={day}
                className={`py-1 text-center text-[10px] font-medium uppercase tracking-[0.05em] ${index >= 5 ? "text-rose-100/55" : "text-[#cffffd]/60"}`}
              >
                {day}
              </div>
            ))}

            {days.map((day) => {
              const iso = isoFromUtcDate(day);
              const inMonth = day.getUTCMonth() === viewMonth;
              const selected = iso === value;
              const today = iso === todayIso;
              const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => chooseDate(iso)}
                  className={`relative flex h-9 items-center justify-center rounded-lg border text-xs transition ${
                    selected
                      ? "border-[#bff8f5]/70 bg-gradient-to-br from-[#2a9a96] to-[#247b82] font-semibold text-white shadow-[0_6px_16px_rgba(42,141,139,0.30)]"
                      : inMonth
                        ? weekend
                          ? "border-transparent bg-white/[0.025] text-rose-50/72 hover:border-[#7bd7d4]/22 hover:bg-white/[0.08] hover:text-white"
                          : "border-transparent bg-white/[0.025] text-white/88 hover:border-[#7bd7d4]/22 hover:bg-white/[0.08] hover:text-white"
                        : "border-transparent text-white/24 hover:bg-white/[0.04] hover:text-white/48"
                  }`}
                >
                  {day.getUTCDate()}
                  {today && !selected ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#7bd7d4]" /> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-3">
            <span className="text-[10px] text-white/40">A hét hétfővel kezdődik.</span>
            <button
              type="button"
              onClick={() => chooseDate(todayIso)}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#8ce7e2]/30 bg-[#2a8d8b]/18 px-3 text-[11px] text-[#d8fffd] transition hover:bg-[#2a8d8b]/32"
            >
              <CalendarDays size={13} /> Ma
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

type MessageTone = "info" | "error" | "success";
type CountStatus = "draft" | "counting" | "review" | "committed" | "cancelled";
type LineFilter = "all" | "uncounted" | "ok" | "missing" | "extra";
type PrintMode = "sheet" | "result";
type InventoryMode = "standard" | "recovery";
type OpeningInventoryStatus = "draft" | "counting" | "review" | "applied" | "cancelled";

type OpeningInventoryProduct = {
  variantId: string;
  title: string;
  internalSku?: string | null;
  modelCode?: string | null;
  productCode?: string | null;
  barcode?: string | null;
  snCod?: string | null;
  brandName?: string | null;
  categoryName?: string | null;
  colorCode?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  size?: string | null;
  imageUrl?: string | null;
};

type OpeningInventorySession = {
  id: string;
  code: string;
  title: string;
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  location_type?: string | null;
  location?: { id: string; code?: string | null; name?: string | null };
  status: OpeningInventoryStatus;
  inventory_mode?: InventoryMode | null;
  inventoryMode?: InventoryMode | null;
  sales_trusted_from?: string | null;
  legacy_retail_value?: number | string | null;
  baseline_at?: string | null;
  started_at?: string | null;
  counting_closed_at?: string | null;
  applied_at?: string | null;
  cancelled_at?: string | null;
  started_by?: string | null;
  closed_by?: string | null;
  applied_by?: string | null;
  cancelled_by?: string | null;
  note?: string | null;
  raw?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  editable?: boolean;
  line_count?: number | string | null;
  counted_lines?: number | string | null;
  counted_qty?: number | string | null;
};

type OpeningInventoryLine = {
  id: string;
  session_id: string;
  variant_id: string;
  status: "awaiting_known" | "uncounted" | "missing" | "untracked" | "ok";
  system_qty_start: number | string;
  system_reserved_start: number | string;
  trusted_net_qty: number | string;
  trusted_in_qty: number | string;
  trusted_out_qty: number | string;
  known_min_qty: number | string;
  baseline_known_min_qty?: number | string | null;
  baseline_trusted_net_qty?: number | string | null;
  counted_qty?: number | string | null;
  physical_counted_qty?: number | string | null;
  live_net_qty?: number | string | null;
  live_in_qty?: number | string | null;
  live_out_qty?: number | string | null;
  movement_after_count_qty?: number | string | null;
  movement_after_count_count?: number | string | null;
  current_system_qty?: number | string | null;
  current_reserved_qty?: number | string | null;
  observation_at?: string | null;
  definite_missing_qty?: number | string | null;
  untracked_qty?: number | string | null;
  system_correction_qty?: number | string | null;
  buy_price?: number | string | null;
  sell_price?: number | string | null;
  first_scanned_at?: string | null;
  last_scanned_at?: string | null;
  last_scanned_by?: string | null;
  auto_zeroed?: boolean;
  note?: string | null;
  product: OpeningInventoryProduct;
};

type OpeningInventorySummary = {
  line_count: number | string;
  counted_lines: number | string;
  counted_qty: number | string;
  system_qty_start: number | string;
  trusted_net_qty: number | string;
  trusted_in_qty: number | string;
  trusted_out_qty: number | string;
  known_min_qty: number | string;
  definite_missing_qty: number | string;
  unseen_known_min_qty: number | string;
  untracked_qty: number | string;
  system_correction_qty: number | string;
  counted_retail_value: number | string;
  comparison_retail_value?: number | string;
  trusted_net_retail_value: number | string;
  definite_missing_retail_value: number | string;
  untracked_retail_value: number | string;
  system_correction_retail_value: number | string;
  live_net_qty?: number | string;
  live_in_qty?: number | string;
  live_out_qty?: number | string;
  live_movement_lines?: number | string;
  unknown_rows: number | string;
  unknown_qty: number | string;
  legacy_retail_value?: number | string | null;
  book_expected_retail_value?: number | string | null;
  book_diff_retail_value?: number | string | null;
};

type OpeningUnknownScan = {
  id: string;
  scan_code: string;
  qty: number | string;
  first_scanned_at?: string | null;
  last_scanned_at?: string | null;
  last_scanned_by?: string | null;
  resolved_variant_id?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
};

type OpeningInventoryDetail = {
  ok?: true;
  session: OpeningInventorySession;
  summary: OpeningInventorySummary;
  lines: OpeningInventoryLine[];
  unknown: OpeningUnknownScan[];
  resolution?: { resolved: number; remaining: number };
  result?: { changed: number; netDiff: number; correctionRetailValue: number };
};

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
  inventory_mode?: InventoryMode | null;
  sales_trusted_from?: string | null;
  legacy_retail_value?: number | string | null;
  baseline_at?: string | null;
  counting_closed_at?: string | null;
  applied_at?: string | null;
  cancelled_at?: string | null;
  opening?: OpeningInventorySession | null;
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
  opening?: OpeningInventoryLine | null;
};

type InventoryCountDetail = {
  item: InventoryCountSummary;
  lines: InventoryCountLine[];
  totals?: InventoryCountSummary;
  opening?: OpeningInventoryDetail | null;
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
  expectedQty?: number;
  countedQty?: number;
  diffQty?: number;
  missingQty?: number;
  extraQty?: number;
};

type ConfirmDialog = {
  kind: "close" | "reopen" | "apply" | "cancel";
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
    const error = new Error(String(msg)) as Error & { status?: number; code?: string; payload?: any };
    error.status = res.status;
    error.code = data && typeof data === "object" ? String(data.code || "") : "";
    error.payload = data;
    throw error;
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

function localDateInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
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


function openingStatusToCountStatus(status?: OpeningInventoryStatus | string): CountStatus {
  if (status === "applied") return "committed";
  if (status === "cancelled") return "cancelled";
  if (status === "review") return "review";
  if (status === "counting") return "counting";
  return "draft";
}

function openingMode(session?: OpeningInventorySession | null): InventoryMode {
  return (session?.inventory_mode || session?.inventoryMode) === "standard" ? "standard" : "recovery";
}

function openingModeLabel(mode: InventoryMode) {
  return mode === "recovery" ? "Helyreállító leltár" : "Rendes leltár";
}

function mapOpeningSession(session: OpeningInventorySession, summary?: OpeningInventorySummary): InventoryCountSummary {
  const expected = summary ? n(summary.known_min_qty) : 0;
  const counted = summary ? n(summary.counted_qty) : n(session.counted_qty);
  return {
    id: String(session.id),
    code: session.code,
    title: session.title,
    location_id: String(session.location_id || session.location?.id || ""),
    location_code: session.location_code || session.location?.code || null,
    location_name: session.location_name || session.location?.name || null,
    location_type: session.location_type || null,
    status: openingStatusToCountStatus(session.status),
    started_at: session.started_at || session.startedAt || session.created_at || null,
    counted_at: session.counting_closed_at || null,
    committed_at: session.applied_at || null,
    actor: session.started_by || null,
    note: session.note || null,
    raw: session.raw || null,
    created_at: session.created_at || session.started_at || session.startedAt || null,
    updated_at: session.updated_at || session.updatedAt || null,
    line_count: summary?.line_count ?? session.line_count ?? 0,
    counted_lines: summary?.counted_lines ?? session.counted_lines ?? 0,
    expected_qty: expected,
    counted_qty: counted,
    diff_qty: summary ? counted - expected : null,
    missing_qty: summary?.definite_missing_qty ?? null,
    extra_qty: summary?.untracked_qty ?? null,
    missing_sell_value: summary?.definite_missing_retail_value ?? null,
    extra_sell_value: summary?.untracked_retail_value ?? null,
    diff_sell_value: summary?.system_correction_retail_value ?? null,
    inventory_mode: openingMode(session),
    sales_trusted_from: session.sales_trusted_from || null,
    legacy_retail_value: session.legacy_retail_value ?? null,
    baseline_at: session.baseline_at || null,
    counting_closed_at: session.counting_closed_at || null,
    applied_at: session.applied_at || null,
    cancelled_at: session.cancelled_at || null,
    opening: session,
  };
}

function mapOpeningLine(line: OpeningInventoryLine, session: OpeningInventorySession): InventoryCountLine {
  const product = line.product || ({} as OpeningInventoryProduct);
  const counted = line.counted_qty === null || line.counted_qty === undefined ? null : n(line.counted_qty);
  const expected = n(line.known_min_qty);
  return {
    id: String(line.id),
    count_id: String(line.session_id || session.id),
    variant_id: String(line.variant_id || product.variantId || ""),
    expected_qty: expected,
    expected_reserved_qty: line.system_reserved_start ?? 0,
    counted_qty: counted,
    diff_qty: counted === null ? null : counted - expected,
    missing_qty: line.definite_missing_qty ?? null,
    extra_qty: line.untracked_qty ?? null,
    buy_price: line.buy_price ?? null,
    sell_price: line.sell_price ?? null,
    diff_buy_value: null,
    diff_sell_value: line.system_correction_qty === null || line.system_correction_qty === undefined ? null : n(line.system_correction_qty) * n(line.sell_price),
    note: line.note || "",
    location_id: String(session.location_id || session.location?.id || ""),
    location_code: session.location_code || session.location?.code || null,
    location_name: session.location_name || session.location?.name || null,
    internal_sku: product.internalSku || null,
    barcode: product.barcode || null,
    display_barcode: product.barcode || null,
    size: product.size || null,
    color_code: product.colorCode || null,
    color_name: product.colorName || null,
    color_hex: product.colorHex || null,
    image_url: product.imageUrl || null,
    images: product.imageUrl ? [product.imageUrl] : [],
    model_id: null,
    model_code: product.modelCode || product.productCode || null,
    title_ro: product.title || "Névtelen termék",
    shopify_title: null,
    brand_name: product.brandName || null,
    brand_code: null,
    category_name_ro: product.categoryName || null,
    category_code: product.categoryName || null,
    current_qty: line.current_system_qty ?? line.system_qty_start ?? 0,
    current_reserved_qty: line.current_reserved_qty ?? line.system_reserved_start ?? 0,
    current_available_qty: n(line.current_system_qty ?? line.system_qty_start) - n(line.current_reserved_qty ?? line.system_reserved_start),
    opening: line,
  };
}

function mapOpeningDetail(detail: OpeningInventoryDetail): InventoryCountDetail {
  const item = mapOpeningSession(detail.session, detail.summary);
  const lines = (detail.lines || []).map((line) => mapOpeningLine(line, detail.session));
  return { item, lines, totals: item, opening: detail };
}

function openingLineStatusLabel(line: OpeningInventoryLine, mode: InventoryMode) {
  if (line.status === "missing") return mode === "recovery" ? "BIZTOS HIÁNY" : "HIÁNY";
  if (line.status === "awaiting_known") return "MÉG NEM TALÁLTÁK";
  if (line.status === "untracked") return mode === "recovery" ? "RÉGI / NEM NYILVÁNTARTOTT" : "TÖBBLET";
  if (line.status === "ok") return "RENDBEN";
  return "MÉG NEM SZÁMOLT";
}

function safeFilePart(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90) || "leltar";
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadOpeningCsv(detail: OpeningInventoryDetail) {
  const session = detail.session;
  const summary = detail.summary;
  const mode = openingMode(session);
  const expectedLabel = mode === "recovery" ? "Igazolható minimum" : "Elvárt";
  const missingLabel = mode === "recovery" ? "Biztos hiány" : "Hiány";
  const extraLabel = mode === "recovery" ? "Régi / nem nyilvántartott" : "Többlet";
  const rows: unknown[][] = [
    ["ALL IN - Üzleti leltár"],
    ["Kód", session.code],
    ["Helyszín", session.location_name || session.location?.name || ""],
    ["Állapot", statusLabel(openingStatusToCountStatus(session.status))],
    ["Típus", openingModeLabel(mode)],
    ["Indítva", formatDateTime(session.started_at || session.startedAt || session.created_at)],
    ["Beolvasás lezárva", formatDateTime(session.counting_closed_at)],
    ["Készletre alkalmazva", formatDateTime(session.applied_at)],
    ["Megjegyzés", session.note || ""],
    [],
    ["Összesítő"],
    ["Leltár szerint", `${formatQty(summary.counted_qty)} db`],
    [expectedLabel, `${formatQty(summary.known_min_qty)} db`],
    [missingLabel, `${formatQty(summary.definite_missing_qty)} db`],
    [extraLabel, `${formatQty(summary.untracked_qty)} db`],
    ["Készletkorrekció", `${n(summary.system_correction_qty) > 0 ? "+" : ""}${formatQty(summary.system_correction_qty)} db`],
    ["Leltárérték", `${formatMoney(summary.counted_retail_value)} RON`],
    [],
    ["Termék", "Márka", "Kategória", "Szín", "Méret", "Termékkód", "Vonalkód", "Rendszer induláskor", "Rendszer most", "Mozgás", expectedLabel, "Fizikailag számolt", "Leltár szerint", "Számolás utáni mozgás", missingLabel, extraLabel, "Készletkorrekció", "Eladási ár", "Állapot", "Utolsó beolvasás", "Beolvasta", "Megjegyzés"],
  ];
  for (const line of detail.lines || []) {
    rows.push([
      line.product.title,
      line.product.brandName || "",
      line.product.categoryName || "",
      line.product.colorName || line.product.colorCode || "",
      line.product.size || "",
      line.product.productCode || line.product.modelCode || line.product.internalSku || "",
      line.product.barcode || "",
      formatQty(line.system_qty_start),
      formatQty(line.current_system_qty ?? line.system_qty_start),
      `${n(line.trusted_net_qty) > 0 ? "+" : ""}${formatQty(line.trusted_net_qty)}`,
      formatQty(line.known_min_qty),
      line.physical_counted_qty === null || line.physical_counted_qty === undefined ? "" : formatQty(line.physical_counted_qty),
      line.counted_qty === null || line.counted_qty === undefined ? "" : formatQty(line.counted_qty),
      `${n(line.movement_after_count_qty) > 0 ? "+" : ""}${formatQty(line.movement_after_count_qty || 0)}`,
      line.definite_missing_qty === null || line.definite_missing_qty === undefined ? "" : formatQty(line.definite_missing_qty),
      line.untracked_qty === null || line.untracked_qty === undefined ? "" : formatQty(line.untracked_qty),
      line.system_correction_qty === null || line.system_correction_qty === undefined ? "" : `${n(line.system_correction_qty) > 0 ? "+" : ""}${formatQty(line.system_correction_qty)}`,
      formatMoney(line.sell_price),
      openingLineStatusLabel(line, mode),
      formatDateTime(line.last_scanned_at),
      line.last_scanned_by || "",
      line.note || "",
    ]);
  }
  const unresolved = (detail.unknown || []).filter((item) => !item.resolved_at && n(item.qty) > 0);
  if (unresolved.length) {
    rows.push([], ["Ellenőrzendő kódok"], ["Kód", "Darab", "Utolsó beolvasás", "Beolvasta"]);
    for (const item of unresolved) rows.push([item.scan_code, formatQty(item.qty), formatDateTime(item.last_scanned_at), item.last_scanned_by || ""]);
  }
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = String(session.started_at || session.created_at || "").slice(0, 10) || localDateInput();
  a.href = url;
  a.download = `${safeFilePart(session.location_name || session.location?.name)}_${date}_${safeFilePart(session.code)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printOpeningReport(detail: OpeningInventoryDetail) {
  const session = detail.session;
  const summary = detail.summary;
  const mode = openingMode(session);
  const expectedLabel = mode === "recovery" ? "Igazolható minimum" : "Elvárt";
  const missingLabel = mode === "recovery" ? "Biztos hiány" : "Hiány";
  const extraLabel = mode === "recovery" ? "Régi / plusz" : "Többlet";
  const rows = (detail.lines || []).map((line, index) => `<tr>
    <td class="c">${index + 1}</td>
    <td><b>${escapeHtml(line.product.title)}</b><br><span>${escapeHtml([line.product.brandName, line.product.colorName, line.product.size].filter(Boolean).join(" • "))}</span><br><span>${escapeHtml(line.product.barcode || line.product.productCode || "")}</span></td>
    <td class="r">${formatQty(line.current_system_qty ?? line.system_qty_start)}</td>
    <td class="r">${formatQty(line.known_min_qty)}</td>
    <td class="r">${line.counted_qty === null || line.counted_qty === undefined ? "–" : formatQty(line.counted_qty)}</td>
    <td class="r neg">${line.definite_missing_qty === null || line.definite_missing_qty === undefined ? "–" : formatQty(line.definite_missing_qty)}</td>
    <td class="r pos">${line.untracked_qty === null || line.untracked_qty === undefined ? "–" : formatQty(line.untracked_qty)}</td>
    <td class="r">${line.system_correction_qty === null || line.system_correction_qty === undefined ? "–" : `${n(line.system_correction_qty) > 0 ? "+" : ""}${formatQty(line.system_correction_qty)}`}</td>
    <td>${escapeHtml(openingLineStatusLabel(line, mode))}</td>
  </tr>`).join("");
  const target = window.open("", "_blank", "width=1200,height=850");
  if (!target) return;
  target.document.open();
  target.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(session.code)}</title><style>
    @page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111827;margin:0;font-size:10px}header{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111827;padding-bottom:8px;margin-bottom:10px}h1{font-size:18px;margin:0 0 3px}.muted,span{color:#6b7280;font-size:9px}.sum{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:10px}.sum div{border:1px solid #d1d5db;border-radius:6px;padding:6px}.sum b{display:block;font-size:12px;margin-top:3px}table{width:100%;border-collapse:collapse}th{background:#1f2937;color:#fff;padding:5px;border:1px solid #1f2937;text-align:left}td{padding:4px;border:1px solid #d1d5db;vertical-align:top}.r{text-align:right}.c{text-align:center}.neg{color:#b91c1c}.pos{color:#047857}footer{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:18px}footer div{border-top:1px solid #111827;padding-top:5px;text-align:center}</style></head><body>
    <header><div><h1>Üzleti leltár • ${escapeHtml(session.code)}</h1><div class="muted">${escapeHtml(session.location_name || session.location?.name || "")} • ${escapeHtml(openingModeLabel(mode))} • ${escapeHtml(formatDateTime(session.started_at || session.created_at))}</div></div><div class="muted">${escapeHtml(statusLabel(openingStatusToCountStatus(session.status)))}</div></header>
    <div class="sum"><div>Leltár szerint<b>${formatQty(summary.counted_qty)} db</b></div><div>${escapeHtml(expectedLabel)}<b>${formatQty(summary.known_min_qty)} db</b></div><div>${escapeHtml(missingLabel)}<b>${formatQty(summary.definite_missing_qty)} db</b></div><div>${escapeHtml(extraLabel)}<b>${formatQty(summary.untracked_qty)} db</b></div><div>Korrekció<b>${n(summary.system_correction_qty)>0?"+":""}${formatQty(summary.system_correction_qty)} db</b></div><div>Leltárérték<b>${formatMoney(summary.counted_retail_value)} RON</b></div></div>
    <table><thead><tr><th>#</th><th>Termék</th><th class="r">Rendszer most</th><th class="r">${escapeHtml(expectedLabel)}</th><th class="r">Leltár</th><th class="r">${escapeHtml(missingLabel)}</th><th class="r">${escapeHtml(extraLabel)}</th><th class="r">Korrekció</th><th>Állapot</th></tr></thead><tbody>${rows}</tbody></table>
    <footer><div>Számolta</div><div>Ellenőrizte</div><div>Jóváhagyta</div></footer><script>window.onload=()=>{window.focus();setTimeout(()=>window.print(),250)}</script></body></html>`);
  target.document.close();
}


function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  onClick,
  active = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "green" | "red" | "blue";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneClass = tone === "green"
    ? "border-[#2a8d8b]/45 bg-[#2a8d8b]/12"
    : tone === "red"
      ? active
        ? "border-[#ff6b78] bg-[#e3132c] shadow-[0_10px_26px_rgba(227,19,44,0.34)] ring-1 ring-[#ff8a94]/30"
        : "border-[#ff5a68] bg-[#d81028] shadow-[0_8px_22px_rgba(216,16,40,0.24)] hover:bg-[#e3132c] hover:border-[#ff7682]"
      : tone === "blue"
        ? "border-sky-300/30 bg-sky-500/10"
        : "border-white/18 bg-white/[0.06]";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={tone === "red" ? "text-xs text-white/84" : "text-xs text-white/62"}>{label}</div>
          <div className="mt-2 text-2xl font-semibold leading-none text-white">{value}</div>
        </div>
        {icon ? <div className={`rounded-xl border p-2 ${tone === "red" ? "border-white/26 bg-white/[0.12] text-white" : "border-white/16 bg-white/[0.08] text-white/78"}`}>{icon}</div> : null}
      </div>
      {hint ? <div className={tone === "red" ? "mt-2 text-xs text-white/78" : "mt-2 text-xs text-white/58"}>{hint}</div> : null}
      {onClick ? <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-white/68">{active ? "Szűrés aktív · kattints a kikapcsoláshoz" : "Kattints a hiányzó termékekhez"}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`w-full rounded-2xl border p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-[#ff8a94]/45 ${toneClass}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`rounded-2xl border p-4 ${toneClass}`}>{content}</div>;
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

const LOCATION_STORAGE_KEY = "allin:opening-inventory:location";

async function fetchAllOpeningSessions(locationValue: string) {
  const items: OpeningInventorySession[] = [];
  let offset = 0;
  const limit = 100;
  for (let guard = 0; guard < 100; guard += 1) {
    const response = await fetchAifJSON<{ items: OpeningInventorySession[]; total?: number; hasMore?: boolean }>(
      `/opening-inventory/admin/sessions?location=${encodeURIComponent(locationValue)}&limit=${limit}&offset=${offset}`
    );
    const page = response.items || [];
    items.push(...page);
    offset += page.length;
    const total = Number(response.total || 0);
    if (!page.length || response.hasMore === false || (total > 0 && offset >= total) || page.length < limit) break;
  }
  return items;
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
  const [recentScannedLineIds, setRecentScannedLineIds] = useState<string[]>([]);
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("standard");
  const [salesTrustedFrom, setSalesTrustedFrom] = useState(localDateInput());
  const [legacyRetailValue, setLegacyRetailValue] = useState("");
  const [openingDetail, setOpeningDetail] = useState<OpeningInventoryDetail | null>(null);
  const [dirtyLineIds, setDirtyLineIds] = useState<string[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [archiveSearch, setArchiveSearch] = useState("");

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
  const dirtyLineIdsRef = useRef<Set<string>>(new Set());

  const currentLocation = useMemo(() => locations.find((x) => x.id === location || x.code === location) || null, [locations, location]);

  const loadMeta = useCallback(async () => {
    const meta = await fetchAifJSON<AifMeta>("/meta");
    const activeLocations = (meta.locations || []).filter((x) => x.is_active !== false);
    setLocations(activeLocations);
    setLocation((prev) => prev || activeLocations[0]?.id || "");
  }, []);

  const loadCount = useCallback(async (id: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const raw = await fetchAifJSON<OpeningInventoryDetail>(`/opening-inventory/admin/sessions/${encodeURIComponent(id)}?_=${Date.now()}`);
      const detail = mapOpeningDetail(raw);
      setActive(detail);
      setOpeningDetail(raw);
      setCountValueCache((prev) => ({
        ...prev,
        [detail.item.id]: {
          countedSellValue: n(raw.summary.counted_retail_value),
          expectedSellValue: openingMode(raw.session) === "recovery"
            ? n(raw.summary.book_expected_retail_value ?? raw.summary.known_min_qty)
            : n(raw.summary.comparison_retail_value ?? raw.summary.book_expected_retail_value),
          expectedQty: n(raw.summary.known_min_qty),
          countedQty: n(raw.summary.counted_qty),
          diffQty: n(raw.summary.counted_qty) - n(raw.summary.known_min_qty),
          missingQty: n(raw.summary.definite_missing_qty),
          extraQty: n(raw.summary.untracked_qty),
        },
      }));
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setDirtyLineIds([]);
      dirtyLineIdsRef.current.clear();
      setInventoryMode(raw.session.status === "applied" ? "standard" : openingMode(raw.session));
      setSalesTrustedFrom(raw.session.sales_trusted_from || localDateInput());
      setLegacyRetailValue(raw.session.legacy_retail_value === null || raw.session.legacy_retail_value === undefined ? "" : String(raw.session.legacy_retail_value));
      setLastRefresh(new Date());
      if (!silent) setMessage(null);
    } catch (e) {
      if (!silent) setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár betöltése nem sikerült." });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadStockAndCounts = useCallback(async (locationValue: string, searchValue: string, silent = false) => {
    if (!locationValue) return;
    if (!silent) setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("location", locationValue);
      if (searchValue.trim()) q.set("search", searchValue.trim());
      const [stock, sessionRows] = await Promise.all([
        fetchAifJSON<{ items: AifStockItem[] }>(`/stock?${q.toString()}`),
        fetchAllOpeningSessions(locationValue),
      ]);
      const mappedSessions = (sessionRows || []).map((session) => mapOpeningSession(session));
      setStockRows(stock.items || []);
      setCounts(mappedSessions);
      setLastRefresh(new Date());
      if (!silent) setMessage(null);

      const open = mappedSessions.find((item) => !["committed", "cancelled"].includes(item.status)) || null;
      if (!open) setInventoryMode("standard");

      const current = activeRef.current;
      if (open && current?.item.id !== open.id) {
        await loadCount(open.id, true);
      } else if (!open && current && String(current.item.location_id) !== String(currentLocation?.id || locationValue)) {
        setActive(null);
        setOpeningDetail(null);
        setDrafts({});
        setDirtyLineIds([]);
        dirtyLineIdsRef.current.clear();
      }
    } catch (e) {
      if (!silent) setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár adatok betöltése nem sikerült." });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadCount, currentLocation?.id]);

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
    setRecentScannedLineIds([]);
  }, [active?.item.id]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    dirtyLineIdsRef.current = new Set(dirtyLineIds);
  }, [dirtyLineIds]);

  useEffect(() => {
    if (!active?.item.id || !["draft", "counting", "review"].includes(active.item.status)) return;
    const timer = window.setInterval(() => {
      if (dirtyLineIdsRef.current.size > 0 || saving || pendingScanRef.current) return;
      void loadCount(active.item.id, true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [active?.item.id, active?.item.status, loadCount, saving]);

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
    const filtered = lines.filter((line) => {
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
      const openingStatus = line.opening?.status;
      if (lineFilter === "uncounted") return diff === null || openingStatus === "uncounted" || openingStatus === "awaiting_known";
      if (lineFilter === "ok") return dirtyLineIdsRef.current.has(line.id) ? diff === 0 : openingStatus === "ok" || diff === 0;
      if (lineFilter === "missing") return dirtyLineIdsRef.current.has(line.id) ? diff !== null && diff < 0 : openingStatus === "missing" || (diff !== null && diff < 0);
      if (lineFilter === "extra") return dirtyLineIdsRef.current.has(line.id) ? diff !== null && diff > 0 : openingStatus === "untracked" || (diff !== null && diff > 0);
      return true;
    });

    if (!recentScannedLineIds.length) return filtered;
    const rank = new Map(recentScannedLineIds.map((id, index) => [id, index]));
    return filtered.sort((a, b) => {
      const aRank = rank.get(a.id);
      const bRank = rank.get(b.id);
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;
      return 0;
    });
  }, [active, categoryFilter, lineFilter, drafts, search, recentScannedLineIds]);

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

  const filteredCounts = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase();
    if (!q) return counts;
    return counts.filter((count) => {
      const session = count.opening;
      return [
        count.title,
        count.code,
        count.location_name,
        count.note,
        statusLabel(count.status),
        session ? openingModeLabel(openingMode(session)) : "",
        String(count.created_at || "").slice(0, 10),
      ].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [archiveSearch, counts]);

  const countsPageSize = 10;
  const countsTotalPages = Math.max(1, Math.ceil(filteredCounts.length / countsPageSize));
  const visibleCounts = useMemo(() => {
    const start = (countsPage - 1) * countsPageSize;
    return filteredCounts.slice(start, start + countsPageSize);
  }, [filteredCounts, countsPage]);

  useEffect(() => {
    setCountsPage(1);
  }, [location, archiveSearch]);

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
          const raw = await fetchAifJSON<OpeningInventoryDetail>(`/opening-inventory/admin/sessions/${encodeURIComponent(count.id)}`);
          if (!cancelled) {
            const snapshot: CountValueSnapshot = {
              countedSellValue: n(raw.summary.counted_retail_value),
              expectedSellValue: openingMode(raw.session) === "recovery"
                ? n(raw.summary.book_expected_retail_value ?? raw.summary.known_min_qty)
                : n(raw.summary.comparison_retail_value ?? raw.summary.book_expected_retail_value),
              expectedQty: n(raw.summary.known_min_qty),
              countedQty: n(raw.summary.counted_qty),
              diffQty: n(raw.summary.counted_qty) - n(raw.summary.known_min_qty),
              missingQty: n(raw.summary.definite_missing_qty),
              extraQty: n(raw.summary.untracked_qty),
            };
            setCountValueCache((prev) => ({ ...prev, [count.id]: snapshot }));
          }
        } catch {
          // Az archívum ettől még használható, csak az érték marad átmenetileg ismeretlen.
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

  const canEditActive = Boolean(active && ["draft", "counting"].includes(active.item.status));
  const activeReview = Boolean(active && active.item.status === "review");
  const activeFinal = Boolean(active && ["committed", "cancelled"].includes(active.item.status));
  const currentInventoryMode: InventoryMode = openingDetail ? openingMode(openingDetail.session) : inventoryMode;
  const unresolvedUnknown = (openingDetail?.unknown || []).filter((item) => !item.resolved_at && n(item.qty) > 0);

  async function createCount() {
    if (!location) {
      setMessage({ tone: "error", text: "Előbb válassz üzletet / helyszínt." });
      return;
    }
    if (counts.some((item) => !["committed", "cancelled"].includes(item.status))) {
      setMessage({ tone: "error", text: "Ehhez a helyszínhez már van aktív leltár. Folytasd vagy zárd le azt." });
      return;
    }
    if (inventoryMode === "recovery" && !salesTrustedFrom) {
      setMessage({ tone: "error", text: "Helyreállító leltárnál add meg, melyik naptól biztosak az új rendszer eladásai." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const raw = await fetchAifJSON<OpeningInventoryDetail>("/opening-inventory/admin/sessions", {
        method: "POST",
        body: JSON.stringify({
          location,
          title: title.trim() || todayTitle(),
          note: note.trim() || null,
          inventoryMode,
          salesTrustedFrom: inventoryMode === "recovery" ? salesTrustedFrom : undefined,
          legacyRetailValue: inventoryMode === "recovery" && legacyRetailValue.trim()
            ? legacyRetailValue.trim().replace(",", ".")
            : null,
        }),
      });
      const detail = mapOpeningDetail(raw);
      setActive(detail);
      setOpeningDetail(raw);
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setDirtyLineIds([]);
      dirtyLineIdsRef.current.clear();
      setMessage({ tone: "success", text: "Leltár elindítva. Több napig folytatható, az üzlet közben is árulhat." });
      setLastRefresh(new Date());
      await loadStockAndCounts(location, search, true);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár indítása nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  async function saveLines(silent = false) {
    if (!active || !canEditActive) return;
    const dirty = Array.from(dirtyLineIdsRef.current);
    if (!dirty.length) {
      if (!silent) setMessage({ tone: "info", text: "Nincs mentetlen módosítás." });
      return;
    }
    setSaving(true);
    if (!silent) setMessage(null);
    try {
      const lines = dirty.map((lineId) => {
        const draft = draftsRef.current[lineId] || { countedQty: "", note: "" };
        return {
          lineId,
          countedQty: draft.countedQty.trim() === "" ? null : Number.parseInt(draft.countedQty, 10),
          note: draft.note.trim() || null,
        };
      });
      const raw = await fetchAifJSON<OpeningInventoryDetail & { saved?: number }>(`/opening-inventory/admin/sessions/${encodeURIComponent(active.item.id)}/lines`, {
        method: "PATCH",
        body: JSON.stringify({ lines }),
      });
      const detail = mapOpeningDetail(raw);
      setActive(detail);
      setOpeningDetail(raw);
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setDirtyLineIds([]);
      dirtyLineIdsRef.current.clear();
      setCountValueCache((prev) => ({
        ...prev,
        [detail.item.id]: {
          countedSellValue: n(raw.summary.counted_retail_value),
          expectedSellValue: n(raw.summary.book_expected_retail_value ?? raw.summary.comparison_retail_value ?? 0),
          expectedQty: n(raw.summary.known_min_qty),
          countedQty: n(raw.summary.counted_qty),
          diffQty: n(raw.summary.counted_qty) - n(raw.summary.known_min_qty),
          missingQty: n(raw.summary.definite_missing_qty),
          extraQty: n(raw.summary.untracked_qty),
        },
      }));
      setLastRefresh(new Date());
      if (!silent) setMessage({ tone: "success", text: `${lines.length} módosított leltársor mentve.` });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A leltár mentése nem sikerült." });
      throw e;
    } finally {
      setSaving(false);
    }
  }

  function commitCount() {
    if (!active || !canEditActive) return;
    setConfirmDialog({
      kind: "close",
      tone: "green",
      title: "Beolvasás lezárása",
      description: "A bolti számlálás lezárul, de az üzlet továbbra is árulhat. Ezután még ellenőrizheted az eltéréseket, és csak külön jóváhagyással kerülnek készletre.",
      confirmLabel: "Beolvasás lezárása",
      details: [
        `Leltár: ${active.item.title}`,
        `Helyszín: ${active.item.location_name || currentLocation?.name || "-"}`,
        `Számolt sor: ${formatQty(activeStats.countedLines)} / ${formatQty(activeStats.lines)}`,
        `Talált mennyiség: ${formatQty(activeStats.counted)} db`,
      ],
    });
  }

  function requestReopen() {
    if (!active || !activeReview) return;
    setConfirmDialog({
      kind: "reopen",
      tone: "green",
      title: "Leltár újranyitása",
      description: "A bolti csippogtatás újra folytatható lesz. Az üzlet közben továbbra is árulhat.",
      confirmLabel: "Újranyitás",
      details: [`Leltár: ${active.item.title}`, `Helyszín: ${active.item.location_name || currentLocation?.name || "-"}`],
    });
  }

  function requestApply() {
    if (!active || !activeReview) return;
    if (unresolvedUnknown.length) {
      setMessage({ tone: "error", text: `${unresolvedUnknown.length} ismeretlen vagy ütköző kód még nincs rendezve.` });
      return;
    }
    setConfirmDialog({
      kind: "apply",
      tone: "green",
      title: "Készlet végleges alkalmazása",
      description: "A rendszer a fizikailag megszámolt mennyiségeket és a közben történt eladásokat/mozgásokat együtt veszi figyelembe, majd auditált készletkorrekciót készít.",
      confirmLabel: "Készlet alkalmazása",
      details: [
        `Leltár: ${active.item.title}`,
        `Helyszín: ${active.item.location_name || currentLocation?.name || "-"}`,
        `${currentInventoryMode === "recovery" ? "Biztos hiány" : "Hiány"}: ${formatQty(openingDetail?.summary.definite_missing_qty || 0)} db`,
        `Korrekció: ${n(openingDetail?.summary.system_correction_qty) > 0 ? "+" : ""}${formatQty(openingDetail?.summary.system_correction_qty || 0)} db`,
      ],
    });
  }

  function deleteCount() {
    if (!active || activeFinal) return;
    setConfirmDialog({
      kind: "cancel",
      tone: "red",
      title: "Leltár megszakítása",
      description: "A leltár lezárul megszakított állapottal. A beolvasások auditként megmaradnak, de a készlethez nem nyúlunk.",
      confirmLabel: "Megszakítás",
      details: [
        `Leltár: ${active.item.title}`,
        `Helyszín: ${active.item.location_name || currentLocation?.name || "-"}`,
        `Állapot: ${statusLabel(active.item.status)}`,
      ],
    });
  }

  async function runConfirmedAction() {
    if (!active || !confirmDialog) return;
    const action = confirmDialog.kind;
    setConfirmDialog(null);
    setSaving(true);
    setMessage(null);
    try {
      if (action === "close" && dirtyLineIdsRef.current.size) await saveLines(true);
      const raw = action === "close"
        ? await fetchAifJSON<OpeningInventoryDetail>(`/opening-inventory/admin/sessions/${encodeURIComponent(active.item.id)}/close`, { method: "POST", body: "{}" })
        : action === "reopen"
          ? await fetchAifJSON<OpeningInventoryDetail>(`/opening-inventory/admin/sessions/${encodeURIComponent(active.item.id)}/reopen`, { method: "POST", body: "{}" })
          : action === "apply"
            ? await fetchAifJSON<OpeningInventoryDetail>(`/opening-inventory/admin/sessions/${encodeURIComponent(active.item.id)}/apply`, { method: "POST", body: "{}" })
            : null;

      if (action === "cancel") {
        await fetchAifJSON(`/opening-inventory/admin/sessions/${encodeURIComponent(active.item.id)}/cancel`, { method: "POST", body: "{}" });
        setActive(null);
        setOpeningDetail(null);
        setDrafts({});
        setDirtyLineIds([]);
        dirtyLineIdsRef.current.clear();
        setMessage({ tone: "success", text: "Leltár megszakítva. A készlethez nem nyúltunk." });
      } else if (raw) {
        const detail = mapOpeningDetail(raw);
        setActive(detail);
        setOpeningDetail(raw);
        const nextDrafts: Record<string, DraftLine> = {};
        for (const line of detail.lines) nextDrafts[line.id] = lineDraftFrom(line);
        setDrafts(nextDrafts);
        setDirtyLineIds([]);
        dirtyLineIdsRef.current.clear();
        if (action === "close") setMessage({ tone: "success", text: "Beolvasás lezárva. Az üzlet továbbra is árulhat; most ellenőrizheted az eredményt." });
        if (action === "reopen") setMessage({ tone: "success", text: "Leltár újranyitva. A bolti számlálás folytatható." });
        if (action === "apply") {
          notifyStockMovesChanged({ source: "opening_inventory", inventoryCountId: detail.item.id });
          setMessage({ tone: "success", text: "Leltár készletre alkalmazva. A korrekció és a közbeni mozgások naplózva vannak." });
        }
      }
      setLastRefresh(new Date());
      await loadStockAndCounts(location, search, true);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A művelet nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  function confirmDialogAction() {
    if (!confirmDialog || saving) return;
    void runConfirmedAction();
  }

  function updateDraft(lineId: string, patch: Partial<DraftLine>) {
    setDrafts((prev) => ({ ...prev, [lineId]: { ...(prev[lineId] || { countedQty: "", note: "" }), ...patch } }));
    setDirtyLineIds((prev) => prev.includes(lineId) ? prev : [...prev, lineId]);
  }

  async function reconcileUnknown() {
    if (!active) return;
    setSaving(true);
    try {
      const raw = await fetchAifJSON<OpeningInventoryDetail>(`/opening-inventory/admin/sessions/${encodeURIComponent(active.item.id)}/reconcile-unknown`, { method: "POST", body: "{}" });
      setOpeningDetail(raw);
      setActive(mapOpeningDetail(raw));
      setMessage({ tone: raw.resolution?.remaining ? "info" : "success", text: raw.resolution?.remaining ? `${raw.resolution.resolved} kód rendezve, ${raw.resolution.remaining} még ellenőrzendő.` : "Az ismeretlen kódok egyeztetése kész." });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Az ismeretlen kódok egyeztetése nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  function openShopView() {
    if (!location) return;
    try { window.sessionStorage.setItem(LOCATION_STORAGE_KEY, currentLocation?.code || location); } catch {}
    window.location.hash = "openinginventoryshop";
  }

  async function downloadArchiveCsv(id: string) {
    setSaving(true);
    try {
      const raw = await fetchAifJSON<OpeningInventoryDetail>(`/opening-inventory/admin/sessions/${encodeURIComponent(id)}`);
      downloadOpeningCsv(raw);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A CSV nem készíthető el." });
    } finally {
      setSaving(false);
    }
  }

  async function printArchivePdf(id: string) {
    setSaving(true);
    try {
      const raw = await fetchAifJSON<OpeningInventoryDetail>(`/opening-inventory/admin/sessions/${encodeURIComponent(id)}`);
      printOpeningReport(raw);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "A PDF nézet nem készíthető el." });
    } finally {
      setSaving(false);
    }
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

  async function scanCodeDirectly(code: string, source: "camera" | "manual") {
    if (!active || !canEditActive) return;
    setSaving(true);
    try {
      const response = await fetchAifJSON<{ line?: { id?: string; countedQty?: number; product?: OpeningInventoryProduct } }>("/opening-inventory/scan", {
        method: "POST",
        body: JSON.stringify({ location: currentLocation?.code || location, code, qty: 1 }),
      });
      await loadCount(active.item.id, true);
      if (response.line?.id) setRecentScannedLineIds((currentOrder) => [String(response.line?.id), ...currentOrder.filter((id) => id !== String(response.line?.id))]);
      setScannerStatus(`${response.line?.product?.title || code}: 1 db hozzáadva.`);
      setMessage({ tone: "success", text: `${response.line?.product?.title || code}: 1 db hozzáadva a leltárhoz.` });
      if (source === "manual") { setManualBarcode(""); focusBarcodeInput(); }
    } catch (e) {
      const err = e as Error & { payload?: any };
      if (err.payload?.unknownRecorded) {
        await loadCount(active.item.id, true);
        setScannerStatus(err.message);
        setMessage({ tone: "info", text: err.message });
      } else {
        setScannerStatus(err.message);
        setMessage({ tone: "error", text: err.message || "A beolvasás nem sikerült." });
      }
      if (source === "manual") { setManualBarcode(""); focusBarcodeInput(); }
    } finally {
      setSaving(false);
    }
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
      // Helyreállító leltárnál teljesen reális, hogy a termék 0 készlettel nem került az induló listába.
      // A backend ilyenkor dinamikusan hozzáadja, az ismeretlen/ütköző kódot pedig auditként eltárolja.
      void scanCodeDirectly(code, source);
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

  async function applyPendingScan() {
    if (!pendingScan || !active) return;
    const scan = pendingScan;
    const line = (activeRef.current?.lines || []).find((item) => item.id === scan.lineId);
    if (!line) {
      setPendingScan(null);
      setMessage({ tone: "error", text: "A beolvasott sor nem található. Frissítsd a leltárt." });
      return;
    }
    const shouldRefocus = scan.source === "manual";
    setSaving(true);
    try {
      // Ha ezen a soron van mentetlen kézi módosítás, előbb rögzítjük, hogy a scan arra épüljön.
      if (dirtyLineIdsRef.current.has(line.id)) await saveLines(true);
      const response = await fetchAifJSON<{ line?: { id?: string; countedQty?: number; product?: OpeningInventoryProduct } }>("/opening-inventory/scan", {
        method: "POST",
        body: JSON.stringify({ location: currentLocation?.code || location, code: scan.code, qty: scan.qty }),
      });
      await loadCount(active.item.id, true);
      setRecentScannedLineIds((currentOrder) => [String(response.line?.id || line.id), ...currentOrder.filter((id) => id !== String(response.line?.id || line.id))]);
      setLinePage(1);
      setPendingScan(null);
      setManualBarcode("");
      setScannerStatus(`${scan.qty} db hozzáadva: ${response.line?.product?.title || productTitle(line)}. Új talált mennyiség: ${formatQty(response.line?.countedQty)} db.`);
      setMessage({ tone: "success", text: `${scan.qty} db hozzáadva ehhez: ${response.line?.product?.title || productTitle(line)}.` });
    } catch (e) {
      const err = e as Error & { payload?: any };
      if (err.payload?.unknownRecorded) {
        await loadCount(active.item.id, true);
        setPendingScan(null);
        setMessage({ tone: "info", text: err.message });
        setScannerStatus(err.message);
      } else {
        setMessage({ tone: "error", text: err.message || "A beolvasás nem sikerült." });
      }
    } finally {
      setSaving(false);
      if (shouldRefocus) focusBarcodeInput();
    }
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
                    <div className="rounded-2xl bg-white/[0.06] p-2"><div className="text-white/48">{currentInventoryMode === "recovery" ? "Minimum" : "Rendszer"}</div><div className="mt-1 text-lg font-semibold text-white">{formatQty(pendingLine.expected_qty)}</div></div>
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
              <div className="mt-1 text-xs text-white/62">{formatQty(openingDetail?.summary.counted_lines ?? activeStats.countedLines)} / {formatQty(openingDetail?.summary.line_count ?? activeStats.lines)} sor · {formatQty(openingDetail?.summary.counted_qty ?? activeStats.counted)} / {formatQty(openingDetail?.summary.known_min_qty ?? activeStats.expected)} db</div>
            </div>
            <span className="shrink-0 rounded-full bg-white/[0.10] px-2.5 py-1 text-[11px] text-white/75">{statusLabel(active.item.status)}</span>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[11px]">
            <div className="rounded-xl bg-white/[0.07] p-2"><div className="text-white/46">{currentInventoryMode === "recovery" ? "Minimum" : "Rendszer"}</div><div className="font-semibold text-white">{formatQty(openingDetail?.summary.known_min_qty ?? activeStats.expected)}</div></div>
            <div className="rounded-xl bg-white/[0.07] p-2"><div className="text-white/46">Talált</div><div className="font-semibold text-white">{formatQty(openingDetail?.summary.counted_qty ?? activeStats.counted)}</div></div>
            <div className="rounded-xl bg-red-500/10 p-2"><div className="text-white/46">{currentInventoryMode === "recovery" ? "Biztos hiány" : "Hiány"}</div><div className="font-semibold text-red-100">{formatQty(openingDetail?.summary.definite_missing_qty ?? activeStats.missing)}</div></div>
            <div className="rounded-xl bg-[#2a8d8b]/14 p-2"><div className="text-white/46">{currentInventoryMode === "recovery" ? "Régi / plusz" : "Többlet"}</div><div className="font-semibold text-emerald-100">{formatQty(openingDetail?.summary.untracked_qty ?? activeStats.extra)}</div></div>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/14 px-3 py-2">
            <span className="text-[11px] text-white/60">Számolt eladási érték</span>
            <strong className="text-sm text-white">{formatMoney(openingDetail?.summary.counted_retail_value ?? activeStats.countedSellValue)} RON</strong>
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
            {canEditActive ? <button className={btnSoft} type="button" onClick={() => void saveLines()} disabled={saving || dirtyLineIds.length === 0}><Save size={15} /> Mentés</button> : activeReview ? <button className={btnSoft} type="button" onClick={requestReopen}><RotateCcw size={15} /> Újranyitás</button> : <button className={btnSoft} type="button" disabled>Lezárt</button>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className={btnSoft} type="button" onClick={() => openingDetail ? printOpeningReport(openingDetail) : printPdf("result")}><Download size={15} /> Eredmény PDF</button>
            {canEditActive ? <button className={primaryBtn} type="button" onClick={commitCount} disabled={saving}><ClipboardCheck size={15} /> Beolvasás lezárása</button> : activeReview ? <button className={primaryBtn} type="button" onClick={requestApply} disabled={saving || unresolvedUnknown.length > 0}><CheckCircle2 size={15} /> Készlet alkalmazása</button> : <button className={btnSoft} type="button" disabled>Kész</button>}
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
            <button className={btnSoft} type="button" onClick={setVisibleToExpected} disabled={!canEditActive || currentInventoryMode === "recovery"} title={currentInventoryMode === "recovery" ? "Helyreállító leltárnál nem töltjük ki automatikusan a talált mennyiséget." : undefined}>Látható = rendszer</button>
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
                    <div className="text-white/45">{currentInventoryMode === "recovery" ? "Minimum" : "Rendszer"}</div>
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
    const ids = visibleInventoryLines.map((line) => line.id);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const line of visibleInventoryLines) next[line.id] = { ...(next[line.id] || { note: "" }), countedQty: String(Math.trunc(n(line.expected_qty))) };
      return next;
    });
    setDirtyLineIds((prev) => Array.from(new Set([...prev, ...ids])));
  }

  function clearVisible() {
    const ids = visibleInventoryLines.map((line) => line.id);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const line of visibleInventoryLines) next[line.id] = { ...(next[line.id] || { note: "" }), countedQty: "" };
      return next;
    });
    setDirtyLineIds((prev) => Array.from(new Set([...prev, ...ids])));
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
              {lastRefresh ? <span className="mr-1 text-[10px] text-white/38">Frissítve: {lastRefresh.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span> : null}
              <button
                className={headerBtnSoft}
                type="button"
                onClick={() => location && loadStockAndCounts(location, search)}
                disabled={loading || !location}
              >
                <RefreshCw size={15} /> Frissítés
              </button>
              {active && !activeFinal ? (
                <button className={headerBtnSoft} type="button" onClick={openShopView} disabled={!location}>
                  <Eye size={15} /> Bolti nézet
                </button>
              ) : null}
              {active && !isMobileLayout && canEditActive ? (
                <button className={headerPrimaryBtn} type="button" onClick={commitCount} disabled={saving}>
                  <ClipboardCheck size={15} /> Beolvasás lezárása
                </button>
              ) : null}
              {active && !isMobileLayout && activeReview ? (
                <>
                  <button className={headerBtnSoft} type="button" onClick={requestReopen} disabled={saving}>
                    <RotateCcw size={15} /> Újranyitás
                  </button>
                  <button className={headerPrimaryBtn} type="button" onClick={requestApply} disabled={saving || unresolvedUnknown.length > 0}>
                    <CheckCircle2 size={15} /> Készlet alkalmazása
                  </button>
                </>
              ) : null}
              <button className={headerPrimaryBtn} type="button" onClick={createCount} disabled={saving || !location || Boolean(active && !activeFinal)}>
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
              <button className={primaryBtn} type="button" onClick={createCount} disabled={saving || !location || Boolean(active && !activeFinal)}><ClipboardList size={15} /> Új leltár indítása</button>
            </div>
          </div>
          <div className="grid gap-3 p-4 lg:grid-cols-[1.2fr_1.4fr_1fr]">
            <label className={label}>Üzlet / helyszín
              <CompactSelect
                value={location}
                onChange={(next) => { setLocation(next); setInventoryMode("standard"); setActive(null); setOpeningDetail(null); setDrafts({}); setDirtyLineIds([]); dirtyLineIdsRef.current.clear(); }}
                disabled={Boolean(active && !activeFinal)}
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
            <label className={label}>Leltár típusa
              <CompactSelect
                value={inventoryMode}
                onChange={(value) => setInventoryMode(value as InventoryMode)}
                disabled={Boolean(active && !activeFinal)}
                placeholder="Leltár típusa"
                options={[
                  { value: "standard", label: "Rendes leltár" },
                  { value: "recovery", label: "Helyreállító leltár" },
                ]}
              />
            </label>
            {inventoryMode === "recovery" ? (
              <>
                <label className={label}>Biztos rendszeres eladások ettől
                  <HungarianDatePicker value={salesTrustedFrom} onChange={setSalesTrustedFrom} ariaLabel="Biztos rendszeres eladások kezdő dátuma" />
                </label>
                <label className={label}>Papír szerinti készletérték (RON, opcionális)
                  <input
                    className={input}
                    value={legacyRetailValue}
                    onChange={(e) => setLegacyRetailValue(e.target.value.replace(/[^0-9.,]/g, ""))}
                    inputMode="decimal"
                    placeholder="Pl. 190000"
                  />
                </label>
              </>
            ) : (
              <div className="lg:col-span-2 rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 px-3 py-2 text-xs text-white/68">
                Rendes leltár: a rendszerben nyilvántartott készlet az összehasonlítás alapja. Az eladás közben is működik.
              </div>
            )}
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
              <span className="text-xs text-white/60">{filteredCounts.length} leltár</span>
              <ChevronDown size={18} className={`text-white/70 transition ${countsExpanded ? "rotate-180" : ""}`} />
            </div>
          </button>

          {countsExpanded ? (
            <div className="p-3">
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="relative">
                  <History className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/42" size={15} />
                  <input
                    className={`${input} w-full pl-9`}
                    value={archiveSearch}
                    onChange={(event) => setArchiveSearch(event.target.value)}
                    placeholder="Archívum keresés: kód, dátum, állapot, megjegyzés..."
                  />
                </div>
                <span className="text-xs text-white/50">{filteredCounts.length} leltár</span>
              </div>
              <div className="grid gap-2">
                {visibleCounts.length ? visibleCounts.map((count) => {
                  const selected = active?.item.id === count.id;
                  const cached = selected
                    ? {
                        countedSellValue: n(openingDetail?.summary.counted_retail_value ?? activeStats.countedSellValue),
                        expectedSellValue: n(openingDetail?.summary.book_expected_retail_value ?? openingDetail?.summary.comparison_retail_value ?? activeStats.expectedSellValue),
                        expectedQty: n(openingDetail?.summary.known_min_qty ?? activeStats.expected),
                        countedQty: n(openingDetail?.summary.counted_qty ?? activeStats.counted),
                        diffQty: n(openingDetail?.summary.counted_qty ?? activeStats.counted) - n(openingDetail?.summary.known_min_qty ?? activeStats.expected),
                        missingQty: n(openingDetail?.summary.definite_missing_qty ?? activeStats.missing),
                        extraQty: n(openingDetail?.summary.untracked_qty ?? activeStats.extra),
                      }
                    : countValueCache[count.id];
                  const progress = Math.max(0, Math.min(100, n(count.line_count) ? (n(count.counted_lines) / n(count.line_count)) * 100 : 0));
                  return (
                    <div
                      key={count.id}
                      className={`w-full overflow-hidden rounded-2xl border transition ${selected
                        ? "border-[#9ee4e2]/75 bg-[#2a8d8b] shadow-[0_12px_28px_rgba(42,141,139,0.24)]"
                        : "border-white/14 bg-white/[0.055] hover:border-[#7bd7d4]/35 hover:bg-white/[0.075]"}`}
                    >
                      <button type="button" onClick={() => loadCount(count.id)} className="w-full text-left">
                        <div className="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(260px,1.5fr)_110px_110px_110px_minmax(180px,1fr)_auto] lg:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-white">{count.title}</span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${selected ? "border-white/35 bg-white/16 text-white" : count.status === "committed" ? "border-[#7bd7d4]/30 bg-[#2a8d8b]/28 text-[#d7fffe]" : count.status === "cancelled" ? "border-red-300/24 bg-red-500/12 text-red-50" : "border-white/12 bg-white/[0.08] text-white/72"}`}>{statusLabel(count.status)}</span>
                              <span className="rounded-full border border-white/12 bg-black/10 px-2 py-0.5 text-[9px] text-white/60">{count.opening ? openingModeLabel(openingMode(count.opening)) : "Leltár"}</span>
                            </div>
                            <div className={`mt-1 text-[11px] ${selected ? "text-white/78" : "text-white/50"}`}>{count.code} · {formatDateTime(count.created_at)}</div>
                            <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${selected ? "bg-white/20" : "bg-slate-950/28"}`}>
                              <div className={`h-full rounded-full ${selected ? "bg-white" : "bg-[#63d8d3]"}`} style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                          <div className="text-xs"><span className={selected ? "text-white/68" : "text-white/46"}>Sor</span><div className="mt-1 text-base font-semibold text-white">{formatQty(count.line_count)}</div></div>
                          <div className="text-xs"><span className={selected ? "text-white/68" : "text-white/46"}>Számolt</span><div className="mt-1 text-base font-semibold text-white">{formatQty(count.counted_lines)}</div></div>
                          <div className="text-xs"><span className={selected ? "text-white/68" : "text-white/46"}>Eltérés</span><div className={`mt-1 text-base font-semibold ${selected ? "text-white" : n(cached?.diffQty) < 0 ? "text-red-200" : n(cached?.diffQty) > 0 ? "text-emerald-200" : "text-white"}`}>{cached ? `${n(cached.diffQty) > 0 ? "+" : ""}${formatQty(cached.diffQty)}` : "–"}</div></div>
                          <div className={`rounded-xl border px-3 py-2 ${selected ? "border-white/25 bg-white/12" : "border-[#7bd7d4]/20 bg-[#2a8d8b]/10"}`}>
                            <div className={selected ? "text-[10px] uppercase tracking-wide text-white/68" : "text-[10px] uppercase tracking-wide text-[#9ee4e2]/75"}>Számolt eladási érték</div>
                            <div className="mt-1 text-base font-semibold text-white">{cached ? `${formatMoney(cached.countedSellValue)} RON` : "Betöltés..."}</div>
                            <div className={selected ? "mt-0.5 text-[10px] text-white/62" : "mt-0.5 text-[10px] text-white/42"}>{cached ? `Összehasonlítás: ${formatMoney(cached.expectedSellValue)} RON` : ""}</div>
                          </div>
                          <ChevronDown size={17} className={`hidden -rotate-90 lg:block ${selected ? "text-white" : "text-white/35"}`} />
                        </div>
                      </button>
                      <div className={`flex flex-wrap justify-end gap-1.5 border-t px-3 py-2 ${selected ? "border-white/18 bg-black/8" : "border-white/8 bg-[#303a4c]/35"}`}>
                        <button className={headerBtnSoft} type="button" onClick={() => loadCount(count.id)}><Eye size={13} /> Átnézés</button>
                        <button className={headerBtnSoft} type="button" onClick={() => void downloadArchiveCsv(count.id)} disabled={saving}><Download size={13} /> CSV</button>
                        <button className={headerBtnSoft} type="button" onClick={() => void printArchivePdf(count.id)} disabled={saving}><Printer size={13} /> PDF</button>
                      </div>
                    </div>
                  );
                }) : <div className="rounded-2xl border border-white/14 bg-white/[0.04] p-4 text-sm text-white/62">Ehhez a helyszínhez még nincs leltár.</div>}
              </div>

              {filteredCounts.length > countsPageSize ? (
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
                <button className={btnSoft} type="button" onClick={() => openingDetail ? printOpeningReport(openingDetail) : printPdf("result")}><Download size={15} /> Eredmény PDF</button>
                {openingDetail ? <button className={btnSoft} type="button" onClick={() => downloadOpeningCsv(openingDetail)}><Download size={15} /> CSV</button> : null}
                {!activeFinal ? <button className={btnSoft} type="button" onClick={openShopView}><Eye size={15} /> Bolti nézet</button> : null}
                {canEditActive ? <button className={btnSoft} type="button" onClick={() => void saveLines()} disabled={saving || dirtyLineIds.length === 0}><Save size={15} /> Mentés{dirtyLineIds.length ? ` (${dirtyLineIds.length})` : ""}</button> : null}
                {canEditActive ? <button className={primaryBtn} type="button" onClick={commitCount} disabled={saving}><ClipboardCheck size={15} /> Beolvasás lezárása</button> : null}
                {activeReview ? <button className={btnSoft} type="button" onClick={requestReopen} disabled={saving}><RotateCcw size={15} /> Újranyitás</button> : null}
                {activeReview ? <button className={primaryBtn} type="button" onClick={requestApply} disabled={saving || unresolvedUnknown.length > 0}><CheckCircle2 size={15} /> Készlet alkalmazása</button> : null}
                {!activeFinal ? <button className={redBtn} type="button" onClick={deleteCount} disabled={saving}><X size={15} /> Megszakítás</button> : null}
              </div>
            </div>

            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-7">
              <StatCard label={currentInventoryMode === "recovery" ? "Igazolható minimum" : "Rendszer szerint"} value={formatQty(openingDetail?.summary.known_min_qty ?? activeStats.expected)} hint={`${formatQty(openingDetail?.summary.line_count ?? activeStats.lines)} sor`} icon={<ClipboardList size={18} />} tone="blue" />
              <StatCard label="Leltár szerint most" value={formatQty(openingDetail?.summary.counted_qty ?? activeStats.counted)} hint={`${formatQty(openingDetail?.summary.counted_lines ?? activeStats.countedLines)} / ${formatQty(openingDetail?.summary.line_count ?? activeStats.lines)} sor`} icon={<CheckCircle2 size={18} />} tone="green" />
              <StatCard
                label={currentInventoryMode === "recovery" ? "Biztos hiány" : "Hiány"}
                value={formatQty(openingDetail?.summary.definite_missing_qty ?? activeStats.missing)}
                hint={`${formatMoney(openingDetail?.summary.definite_missing_retail_value ?? activeStats.missingSell)} RON`}
                icon={<AlertTriangle size={18} />}
                tone="red"
                active={lineFilter === "missing"}
                onClick={() => {
                  setLineFilter((current) => current === "missing" ? "all" : "missing");
                  setLinePage(1);
                  window.setTimeout(() => inventoryLinesTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                }}
              />
              <StatCard label={currentInventoryMode === "recovery" ? "Régi / nem nyilvántartott" : "Többlet"} value={formatQty(openingDetail?.summary.untracked_qty ?? activeStats.extra)} hint={`${formatMoney(openingDetail?.summary.untracked_retail_value ?? activeStats.extraSell)} RON`} icon={<PackageCheck size={18} />} tone="green" />
              <StatCard label="Közbeni mozgás" value={`${n(openingDetail?.summary.live_net_qty) > 0 ? "+" : ""}${formatQty(openingDetail?.summary.live_net_qty || 0)}`} hint={`be ${formatQty(openingDetail?.summary.live_in_qty || 0)} · ki ${formatQty(openingDetail?.summary.live_out_qty || 0)}`} icon={<SlidersHorizontal size={18} />} />
              <StatCard label="Készletkorrekció" value={`${n(openingDetail?.summary.system_correction_qty) > 0 ? "+" : ""}${formatQty(openingDetail?.summary.system_correction_qty || 0)}`} hint={`${formatMoney(openingDetail?.summary.system_correction_retail_value || 0)} RON`} icon={<SlidersHorizontal size={18} />} tone={n(openingDetail?.summary.system_correction_qty) < 0 ? "red" : n(openingDetail?.summary.system_correction_qty) > 0 ? "green" : "neutral"} />
              <StatCard label="Leltárérték" value={`${formatMoney(openingDetail?.summary.counted_retail_value ?? activeStats.countedSellValue)} RON`} hint={openingDetail?.summary.book_expected_retail_value === null || openingDetail?.summary.book_expected_retail_value === undefined ? "Aktuális listaáron" : `Könyv szerint: ${formatMoney(openingDetail.summary.book_expected_retail_value)} RON`} icon={<FileText size={18} />} tone="blue" />
            </div>

            {unresolvedUnknown.length ? (
              <div className="mx-4 mb-4 rounded-2xl border border-amber-200/28 bg-amber-500/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-amber-100/60">Ellenőrzendő kódok</div>
                    <div className="mt-1 text-sm text-white">{unresolvedUnknown.length} ismeretlen vagy ütköző vonalkód</div>
                  </div>
                  <button className={btnSoft} type="button" onClick={() => void reconcileUnknown()} disabled={saving}><RefreshCw size={15} /> Újraazonosítás</button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {unresolvedUnknown.slice(0, 12).map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                      <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-white">{item.scan_code}</span><span className="text-xs text-amber-50">{formatQty(item.qty)} db</span></div>
                      <div className="mt-1 text-[10px] text-white/42">{formatDateTime(item.last_scanned_at)} · {item.last_scanned_by || "–"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

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
                <button className={btnSoft} type="button" onClick={setVisibleToExpected} disabled={!canEditActive || currentInventoryMode === "recovery"} title={currentInventoryMode === "recovery" ? "Helyreállító leltárnál nem töltjük ki automatikusan a talált mennyiséget." : undefined}>Látható sorok = rendszer</button>
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
                    <th className="px-3 py-3 text-center">{currentInventoryMode === "recovery" ? "Minimum" : "Rendszer"}</th>
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
                      <div className="rounded-xl bg-white/[0.06] p-2"><div className="text-white/50">{currentInventoryMode === "recovery" ? "Minimum" : "Rendszer"}</div><div className="text-base font-semibold">{formatQty(line.expected_qty)}</div></div>
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
