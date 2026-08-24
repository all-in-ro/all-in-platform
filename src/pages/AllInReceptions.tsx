import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Home,
  CalendarDays,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Save,
  Search,
  MoveRight,
  Trash2,
  X,
} from "lucide-react";
import {
  AifMeta,
  AifReceptionDetail,
  AifReceptionSummary,
  apiAifCommitReceptionRows,
  apiAifDeleteReception,
  apiAifGetReception,
  apiAifIgnoreImportRow,
  apiAifListReceptions,
  apiAifMeta,
  apiAifMoveImportRow,
  apiAifUpdateReception,
  apiAifUpdateImportRow,
  apiAifReceptionExportCsvUrl,
} from "../lib/aif/api";

type Props = { onLogout?: () => void };

type SalesTvaSettings = {
  salesTvaRate?: number | string | null;
  sellPriceCurrency?: string | null;
  sellPriceIncludesTva?: boolean | string | null;
  salesPriceIncludesTva?: boolean | string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  updatedBy?: string | null;
  updated_by?: string | null;
};

const DEFAULT_SALES_TVA_SETTINGS: SalesTvaSettings = {
  salesTvaRate: 21,
  sellPriceCurrency: "RON",
  sellPriceIncludesTva: true,
  salesPriceIncludesTva: true,
  updatedAt: null,
  updatedBy: null,
};

const OPEN_RECEPTION_HANDOFF_KEY = "allinfashion:reception-open:v1";
const OPEN_ORDER_HANDOFF_KEY = "allinfashion:purchase-order-open:v1";

async function fetchAifJsonLocal<T>(path: string, init?: RequestInit): Promise<T> {
  const requestHeaders = new Headers(init?.headers || {});
  if (!requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
  const res = await fetch(`/api/aif${path}`, {
    ...init,
    credentials: "include",
    headers: requestHeaders,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }
  return data as T;
}

function boolSetting(value: unknown, fallback = true) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") return !["false", "0", "no", "nem"].includes(value.toLowerCase());
  return Boolean(value);
}

function normalizeSalesTvaSettings(input?: any): SalesTvaSettings {
  const source = input?.settings || input?.item || input || {};
  const rate = Number(String(source.salesTvaRate ?? source.sales_tva_rate ?? source.tvaRate ?? source.tva_rate ?? DEFAULT_SALES_TVA_SETTINGS.salesTvaRate).replace(",", "."));
  const includes = boolSetting(source.salesPriceIncludesTva ?? source.sellPriceIncludesTva ?? source.sell_price_includes_tva, true);
  return {
    salesTvaRate: Number.isFinite(rate) ? Math.max(0, Math.min(99, rate)) : DEFAULT_SALES_TVA_SETTINGS.salesTvaRate,
    sellPriceCurrency: String(source.sellPriceCurrency || source.sell_price_currency || DEFAULT_SALES_TVA_SETTINGS.sellPriceCurrency || "RON").toUpperCase() || "RON",
    sellPriceIncludesTva: includes,
    salesPriceIncludesTva: includes,
    updatedAt: source.updatedAt || source.updated_at || null,
    updatedBy: source.updatedBy || source.updated_by || null,
  };
}

async function apiAifGetSalesTvaSettingsLocal() {
  try {
    return await fetchAifJsonLocal<{ ok: true; item?: SalesTvaSettings; settings?: SalesTvaSettings }>("/settings/sales-tva");
  } catch {
    return fetchAifJsonLocal<{ ok: true; item?: SalesTvaSettings; settings?: SalesTvaSettings }>("/settings/incoming-sales-tva");
  }
}

async function apiAifSaveSalesTvaSettingsLocal(settings: Partial<SalesTvaSettings>) {
  try {
    return await fetchAifJsonLocal<{ ok: true; item?: SalesTvaSettings; settings?: SalesTvaSettings }>("/settings/sales-tva", {
      method: "PATCH",
      body: JSON.stringify({ settings }),
    });
  } catch {
    return fetchAifJsonLocal<{ ok: true; item?: SalesTvaSettings; settings?: SalesTvaSettings }>("/settings/incoming-sales-tva", {
      method: "PATCH",
      body: JSON.stringify({ settings }),
    });
  }
}

async function fetchCentralSalesTvaSettings(): Promise<SalesTvaSettings> {
  const data = await apiAifGetSalesTvaSettingsLocal();
  return normalizeSalesTvaSettings(data);
}

function salesTvaRateOf(settings?: SalesTvaSettings | null) {
  return n(settings?.salesTvaRate ?? DEFAULT_SALES_TVA_SETTINGS.salesTvaRate);
}

function salesIncludesTvaOf(settings?: SalesTvaSettings | null) {
  return boolSetting(settings?.salesPriceIncludesTva ?? settings?.sellPriceIncludesTva, true);
}

function salesTvaLabel(settings?: SalesTvaSettings | null) {
  const rate = salesTvaRateOf(settings);
  return `${rate.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}% ${salesIncludesTvaOf(settings) ? "TVA-val" : "TVA nélkül"}`;
}

function salesTvaShort(settings?: SalesTvaSettings | null) {
  const rate = salesTvaRateOf(settings);
  return `${rate.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%`;
}

function rowSellEnteredPriceRon(row: any, draft: any) {
  const candidates = [
    draft?.sellPriceRon,
    draft?.sell_price_ron,
    draft?.sellPrice,
    row?.sell_price_ron,
    row?.normalized?.sellPriceRon,
    row?.normalized?.sell_price_ron,
    row?.sell_price,
    row?.normalized?.sellPrice,
  ];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || String(candidate).trim() === "") continue;
    return n(candidate);
  }
  return 0;
}

function salesGrossPriceRon(value: unknown, settings?: SalesTvaSettings | null) {
  const entered = n(value);
  if (entered <= 0) return entered;
  if (salesIncludesTvaOf(settings)) return entered;
  return entered * (1 + salesTvaRateOf(settings) / 100);
}

function salesNetPriceRon(value: unknown, settings?: SalesTvaSettings | null) {
  const entered = n(value);
  if (entered <= 0) return entered;
  if (!salesIncludesTvaOf(settings)) return entered;
  const factor = 1 + salesTvaRateOf(settings) / 100;
  return factor > 0 ? entered / factor : entered;
}

function rowSellGrossPriceRon(row: any, draft: any, settings?: SalesTvaSettings | null) {
  return salesGrossPriceRon(rowSellEnteredPriceRon(row, draft), settings);
}

function rowSellValueRon(row: any, draft: any, settings?: SalesTvaSettings | null) {
  const qty = n(draft?.qty ?? row?.qty ?? row?.normalized?.qty);
  return qty * rowSellGrossPriceRon(row, draft, settings);
}

const page = "min-h-screen bg-[#4b5362] px-3 py-5 text-white font-normal sm:px-4 sm:py-7";
const wrap = "mx-auto max-w-7xl space-y-4";
const card = "overflow-hidden rounded-2xl border border-white/14 bg-[#404a5b]/[0.07] shadow-lg";
const headerCard = "sticky top-2 z-50 rounded-2xl border border-white/20 bg-[#303a4c]/95 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.05] backdrop-blur";
const sectionHeader = "flex flex-col gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3 sm:flex-row sm:items-center sm:justify-between font-normal";
const label = "grid gap-1.5 text-xs text-white/70 font-normal";
const input = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white caret-white outline-none placeholder:text-white/45 selection:bg-[#2a8d8b]/35 focus:border-white/45 font-normal";
const select = `${input} pr-8`;
const btnBase = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/18 bg-[#354153] px-2.5 text-[11px] text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtnSoft = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.08] px-2.5 text-[11px] text-white hover:bg-[#404a5b]/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerPrimaryBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-2.5 text-[11px] text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = `${btnBase} border-[#2a8d8b]/55 bg-[#2a8d8b] text-white hover:bg-[#319c99]`;
const neutralBtn = `${btnBase} border-white/15 bg-white/[0.08] text-white hover:bg-[#404a5b]/[0.12]`;
const dangerBtn = `${btnBase} border-red-500 bg-red-600 text-white hover:bg-red-500`;
const tinyBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.08] px-2.5 text-[11px] text-white transition hover:bg-[#404a5b]/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const tinyDangerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-500 bg-red-600 px-2.5 text-[11px] text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const statCard = "rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
const lightPanel = "rounded-2xl border border-white/14 bg-[#404a5b] p-4 text-white shadow-lg";
const lightLabel = "grid gap-1.5 text-xs text-white/70 font-normal";
const lightInput = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white caret-white outline-none placeholder:text-white/45 selection:bg-[#2a8d8b]/35 focus:border-white/45 disabled:opacity-55 font-normal";
const lightSelect = `${lightInput} pr-8`;
const rowLabel = "grid gap-1 text-[10px] uppercase tracking-[0.05em] text-white/52 font-normal";
const rowInput = "h-8 w-full min-w-0 rounded-md border border-white/16 bg-[#303b4e] px-2 text-[11px] text-white caret-white outline-none transition placeholder:text-white/35 focus:border-[#2a8d8b]/80 focus:ring-1 focus:ring-[#2a8d8b]/20 disabled:opacity-45 font-normal";
const rowRead = "flex h-8 min-w-0 items-center justify-end rounded-md border border-white/12 bg-white/[0.05] px-2 text-[11px] tabular-nums text-white/72 font-normal";
const rowStatusPill = "inline-flex h-6 min-w-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-2 text-[10px] text-white/64 font-normal";
const rowActionBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40 font-normal";
const rowPrimaryBtn = `${rowActionBtn} border-[#2a8d8b]/45 bg-[#2a8d8b] text-white hover:bg-[#319c99]`;
const rowNeutralBtn = `${rowActionBtn} border-white/16 bg-white/[0.08] text-white/72 hover:bg-[#404a5b]/[0.12]`;
const rowDangerBtn = `${rowActionBtn} border-red-500 bg-red-600 text-white hover:bg-red-500`;
const receptionGridHeader = "grid min-w-[1260px] grid-cols-[34px_64px_118px_122px_minmax(170px,1.5fr)_72px_86px_66px_56px_76px_90px_82px_96px_108px] items-center gap-1 border-b border-white/12 bg-[#293448] px-2 py-2 text-[9px] uppercase tracking-[0.06em] text-white/72";
const receptionGridRow = "grid min-w-[1260px] grid-cols-[34px_64px_118px_122px_minmax(170px,1.5fr)_72px_86px_66px_56px_76px_90px_82px_96px_108px] items-center gap-1 border-b border-white/10 px-2 py-1.5 transition-colors";


type UiSelectOption = { value: string; label: string; disabled?: boolean };

function SmartSelect({
  value,
  options,
  onChange,
  placeholder = "Válassz",
  disabled = false,
}: {
  value: string;
  options: UiSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.value === value) || null;

  const updatePosition = useCallback(() => {
    const node = triggerRef.current;
    if (!node || typeof window === "undefined") return;
    const rect = node.getBoundingClientRect();
    const edge = 8;
    const width = Math.min(Math.max(rect.width, 220), Math.min(360, window.innerWidth - edge * 2));
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const roomBelow = window.innerHeight - rect.bottom;
    const openUpward = roomBelow < 240 && rect.top > roomBelow;
    setPosition(openUpward
      ? { left, width, bottom: Math.max(edge, window.innerHeight - rect.top + 6) }
      : { left, width, top: rect.bottom + 6 });
  }, []);

  useEffect(() => {
    if (!open) return;
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
  }, [open, updatePosition]);

  return (
    <div className="min-w-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs text-white outline-none transition ${
          open
            ? "border-[#7bd7d4]/55 bg-[#465264] ring-2 ring-[#7bd7d4]/18"
            : "border-white/22 bg-[#3f4959] hover:bg-[#465264]"
        } disabled:cursor-not-allowed disabled:opacity-45`}
      >
        <span className={`truncate ${selected ? "text-white" : "text-white/48"}`}>{selected?.label || placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 text-white/55 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && position && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="overflow-hidden rounded-xl border border-[#7bd7d4]/48 bg-[#26364c] p-1 shadow-[0_18px_46px_rgba(2,6,23,0.58)]"
          style={{ position: "fixed", zIndex: 900, left: position.left, width: position.width, top: position.top, bottom: position.bottom }}
        >
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__all"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition disabled:opacity-40 ${
                    active ? "bg-[#2a8d8b] text-white" : "bg-[#354153] text-white/90 hover:bg-[#415064]"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {active ? (
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#d8fffd] text-[#176b69]">
                      <Check size={15} strokeWidth={2.8} />
                    </span>
                  ) : null}
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

function isoParts(value?: string | null) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, date };
}

function isoUtc(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function huDate(value?: string | null) {
  const parsed = isoParts(value);
  if (!parsed) return "Dátum választása";
  return `${parsed.year}. ${String(parsed.month).padStart(2, "0")}. ${String(parsed.day).padStart(2, "0")}.`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const parsed = isoParts(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.year || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState((parsed?.month || new Date().getMonth() + 1) - 1);
  const today = todayIso();

  useEffect(() => {
    if (!open) return;
    const current = isoParts(value);
    if (current) {
      setViewYear(current.year);
      setViewMonth(current.month - 1);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", escape, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", escape, true);
    };
  }, [open, value]);

  const first = new Date(Date.UTC(viewYear, viewMonth, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(1 - offset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day;
  });

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1, 12));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  }

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-10 w-full items-center justify-between rounded-xl border px-3 text-left text-xs text-white outline-none transition ${
          open ? "border-[#7bd7d4]/55 bg-[#465264] ring-2 ring-[#7bd7d4]/18" : "border-white/22 bg-[#3f4959] hover:bg-[#465264]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays size={15} className="shrink-0 text-[#8fe9e5]" />
          <span className="truncate">{huDate(value)}</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-white/55 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[940] grid place-items-center bg-slate-950/38 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-label={`${ariaLabel} naptár`}
            className="w-full max-w-[356px] overflow-hidden rounded-[22px] border border-[#8ce7e2]/48 bg-[#202c3d]/[0.995] p-3 text-white shadow-[0_34px_95px_rgba(2,6,23,0.82)] ring-1 ring-white/[0.04]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#29374b] px-2 py-2">
              <button type="button" onClick={() => shiftMonth(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/76 hover:bg-[#2a8d8b]/18" aria-label="Előző hónap">
                <ChevronLeft size={17} />
              </button>
              <div className="text-center">
                <p className="text-[9px] uppercase tracking-[0.16em] text-[#cffffd]/48">Naptár</p>
                <p className="mt-0.5 text-[15px] text-white">{viewYear}. {HU_MONTHS[viewMonth]}</p>
              </div>
              <button type="button" onClick={() => shiftMonth(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/76 hover:bg-[#2a8d8b]/18" aria-label="Következő hónap">
                <ChevronRight size={17} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1">
              {HU_WEEKDAYS.map((day, index) => (
                <div key={day} className={`py-1 text-center text-[10px] uppercase ${index >= 5 ? "text-rose-100/55" : "text-[#cffffd]/60"}`}>{day}</div>
              ))}
              {days.map((day) => {
                const iso = isoUtc(day);
                const inMonth = day.getUTCMonth() === viewMonth;
                const selected = iso === value;
                const isToday = iso === today;
                const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    className={`relative flex h-10 items-center justify-center rounded-lg border text-xs transition ${
                      selected
                        ? "border-[#bff8f5]/70 bg-[#2a8d8b] text-white shadow-[0_7px_18px_rgba(42,141,139,0.32)]"
                        : inMonth
                          ? weekend
                            ? "border-transparent bg-[#404a5b]/[0.025] text-rose-50/72 hover:bg-white/[0.08]"
                            : "border-transparent bg-[#404a5b]/[0.025] text-white/88 hover:bg-white/[0.08]"
                          : "border-transparent text-white/24 hover:bg-white/[0.04]"
                    }`}
                  >
                    {day.getUTCDate()}
                    {isToday && !selected ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#7bd7d4]" /> : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-3">
              <span className="text-[10px] text-white/40">Hétfővel kezdődik</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-[11px] text-white/72">
                  <X size={13} /> Bezárás
                </button>
                <button type="button" onClick={() => { onChange(today); setOpen(false); }} className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#8ce7e2]/30 bg-[#2a8d8b]/18 px-3 text-[11px] text-[#d8fffd]">
                  <CalendarDays size={13} /> Ma
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}


function n(v: unknown): number {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function money(v: unknown, currency?: string | null): string {
  const x = n(v);
  return `${x.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}

function dateText(v?: string | null) {
  if (!v) return "-";
  return String(v).slice(0, 10);
}

function dateOnly(v?: string | null) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function cell(v: unknown) {
  const s = String(v ?? "").trim();
  return s || "-";
}

function statusText(s?: string | null) {
  const v = String(s || "").toLowerCase();
  if (v === "draft") return "Vázlat";
  if (v === "parsed") return "Ellenőrizve";
  if (v === "needs_review") return "Ellenőrzés szükséges";
  if (v === "review") return "Folyamatban";
  if (v === "committed") return "Készletre véve";
  if (v === "ignored") return "Kihagyva";
  if (v === "cancelled") return "Törölve";
  return s || "-";
}

function receptionRowErrorMessages(row: any) {
  const source = Array.isArray(row?.error_messages)
    ? row.error_messages
    : row?.error_messages
      ? [row.error_messages]
      : [];
  return source.map((value: unknown) => String(value || "").trim()).filter(Boolean);
}

function stripReceptionRowErrorPrefix(message: unknown) {
  return String(message || "")
    .replace(/^A\(z\)\s+\d+\.\s+terméksor készletre vétele nem sikerült:\s*/i, "")
    .replace(/^A\s+\d+\.\s+terméksor készletre vétele nem sikerült:\s*/i, "")
    .trim();
}

function receptionRowBarcode(row: any) {
  const normalized = row?.normalized || {};
  const raw = row?.raw || {};
  return String(
    normalized.barcode ||
    normalized.ean ||
    normalized.ean13 ||
    normalized.supplierBarcode ||
    normalized.supplier_barcode ||
    raw.BARCODE ||
    raw.Barcode ||
    raw.barcode ||
    raw.EAN ||
    raw.EAN13 ||
    ""
  ).trim();
}

function humanReceptionRowError(message: unknown, row?: any) {
  const clean = stripReceptionRowErrorPrefix(message);
  const barcode = receptionRowBarcode(row);

  if (/ugyanahhoz a modellhez és mérethez tartozik, de a szín eltér/i.test(clean)) {
    return clean;
  }
  if (/vonalk[oó]d.*m[aá]r egy m[aá]sik vari[aá]nshoz tartozik/i.test(clean) || /barcode[_\s-]*conflict/i.test(clean)) {
    return barcode
      ? `A ${barcode} vonalkód már egy másik termékvariánshoz tartozik. Ennél a sornál ezért nem engedhető a készletre vétel.`
      : "A vonalkód már egy másik termékvariánshoz tartozik. Ennél a sornál ezért nem engedhető a készletre vétel.";
  }
  if (/m[eé]ret.*hi[aá]nyzik|variant_size_required|size.*required/i.test(clean)) {
    return "A termék mérete hiányzik, ezért a rendszer nem tudja biztonságosan azonosítani a variánst.";
  }
  if (/qty must be > 0/i.test(clean)) {
    return "A darabszám hibás. A készletre vételhez legalább 1 db szükséges.";
  }
  if (/duplicate key|unique constraint|23505/i.test(clean)) {
    return "Egy egyedi azonosító már használatban van egy másik terméknél. Ellenőrizd a vonalkódot, termékkódot és a méretet.";
  }
  if (/stock cannot go negative|k[eé]szlet.*negat/i.test(clean)) {
    return "A művelet negatív készletet eredményezne, ezért a rendszer leállította a sort.";
  }
  if (/model\/product code missing|product.*code.*missing/i.test(clean)) {
    return "Hiányzik a termék- vagy modellkód, ezért a sor nem azonosítható.";
  }
  if (/product name\/title missing|title.*missing/i.test(clean)) {
    return "Hiányzik a terméknév.";
  }
  return clean || "A terméksort a rendszer nem tudta készletre venni.";
}

function receptionRowErrorTitle(row: any) {
  const joined = receptionRowErrorMessages(row).join(" ");
  if (/szín eltér|szin elter|régi szín maradjon|regi szin maradjon/i.test(joined)) return "Szín egyeztetés szükséges";
  if (/vonalk[oó]d|barcode/i.test(joined)) return "Vonalkód ütközés";
  if (/m[eé]ret|size/i.test(joined)) return "Méret probléma";
  if (/duplicate|unique|23505/i.test(joined)) return "Duplikált azonosító";
  if (/k[eé]szlet|stock/i.test(joined)) return "Készlet probléma";
  return "A sor nem vehető készletre";
}

function tvaModeText(s?: string | null) {
  const v = String(s || "").toLowerCase();
  if (v === "without_tva") return "preturi fara TVA";
  if (v === "with_tva") return "preturi cu TVA inclus";
  if (v === "no_tva") return "fara TVA";
  return s || "-";
}

function rowDraftValue(row: any, drafts: Record<string, Record<string, unknown>>) {
  if (!row || row.status === "ignored") return 0;
  const draft = drafts[row.id] || row.normalized || {};
  const qty = n((draft as any).qty ?? row.qty ?? (row.normalized || {}).qty);
  const buyPrice = n((draft as any).buyPrice ?? row.buy_price ?? (row.normalized || {}).buyPrice);
  return qty * buyPrice;
}

function receptionBalance(
  item: any,
  rows: any[],
  drafts: Record<string, Record<string, unknown>>,
  headerDraft?: Record<string, string>,
) {
  const invoiceGross = n(headerDraft?.invoiceGross ?? item?.invoice_gross);
  const shipping = n(headerDraft?.shippingCost ?? item?.shipping_cost);
  const tvaRate = n(headerDraft?.tvaRate ?? item?.tva_rate);
  const tvaMode = String(headerDraft?.tvaMode ?? item?.tva_mode ?? "no_tva");
  const rowsValue = (rows || []).reduce((sum, row) => sum + rowDraftValue(row, drafts), 0);
  const baseTotal = rowsValue + shipping;
  const grossFromNet = rowsValue + rowsValue * (tvaRate / 100) + shipping;
  let tvaValue = 0;
  let calculatedTotal = baseTotal;

  if (tvaMode === "without_tva" && tvaRate > 0) {
    tvaValue = rowsValue * (tvaRate / 100);
    calculatedTotal = grossFromNet;
  } else if (tvaMode === "with_tva" && tvaRate > 0) {
    tvaValue = rowsValue - rowsValue / (1 + tvaRate / 100);
    calculatedTotal = baseTotal;
  }

  const diff = invoiceGross - calculatedTotal;
  const absDiff = Math.abs(diff);
  const isOk = absDiff < 0.01;
  const noVatWouldMatch = Math.abs(invoiceGross - baseTotal) < 0.01;
  const suggestedNoVat = !isOk && tvaMode === "without_tva" && tvaRate > 0 && noVatWouldMatch;
  const isMissing = diff > 0;
  const status = isOk
    ? "Egyezik"
    : suggestedNoVat
      ? "Csak a beszerzési TVA mód hibás"
      : isMissing
        ? "Hiányzik a sorokból"
        : "Túllépés";
  const className = isOk
    ? "border-[#2a8d8b]/55 bg-[#2a8d8b]/10"
    : suggestedNoVat
      ? "border-amber-300/55 bg-amber-500/12 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]"
      : "border-red-300/55 bg-red-500/14 shadow-[0_0_0_1px_rgba(248,113,113,0.18),0_0_24px_rgba(239,68,68,0.24)]";
  const badgeClassName = isOk
    ? "border-[#2a8d8b]/45 bg-[#2a8d8b]/14 text-white"
    : suggestedNoVat
      ? "border-amber-200/45 bg-amber-500/18 text-amber-50"
      : "border-red-200/35 bg-red-500/18 text-red-50 shadow-[0_0_12px_rgba(239,68,68,0.35)]";
  const amountClassName = isOk ? "text-white" : suggestedNoVat ? "text-amber-50" : "text-red-100";
  const labelClassName = isOk ? "text-white/72" : suggestedNoVat ? "text-amber-50/88" : "text-red-100/88";
  const ledClassName = isOk
    ? "bg-[#2a8d8b] shadow-[0_0_10px_rgba(42,141,139,0.85)]"
    : suggestedNoVat
      ? "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.9)]"
      : "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,1),0_0_24px_rgba(239,68,68,0.8)] animate-pulse";

  return {
    invoiceGross,
    rowsValue,
    shipping,
    tvaRate,
    tvaMode,
    tvaValue,
    baseTotal,
    grossFromNet,
    calculatedTotal,
    diff,
    absDiff,
    status,
    isOk,
    isMissing,
    suggestedNoVat,
    className,
    badgeClassName,
    amountClassName,
    labelClassName,
    ledClassName,
  };
}

function SectionTitle(props: { title: string; icon?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className={sectionHeader}>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-white/40">AllInFashion</p>
        <h2 className="mt-1 flex items-center gap-2 text-base font-normal text-white">
          {props.icon}
          <span>{props.title}</span>
        </h2>
      </div>
      {props.right}
    </div>
  );
}

function exportCsv(id: string) {
  window.open(apiAifReceptionExportCsvUrl(id), "_blank", "noopener,noreferrer");
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
  const x = n(v);
  return x.toLocaleString("ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pdfDate(v?: string | null) {
  const s = dateOnly(v);
  return s || "-";
}

function rowDraft(row: any, drafts: Record<string, Record<string, unknown>>) {
  return { ...(row?.normalized || {}), ...(drafts[row?.id] || {}) } as any;
}

function rowSku(row: any, draft: any) {
  return cell(row?.supplier_product_code || draft.supplierProductCode || draft.modelCode || row?.supplier_variant_code || draft.supplierVariantCode);
}

function rowSnCod(row: any, draft: any) {
  return cell(
    row?.sn_cod ||
    draft?.snCod ||
    draft?.sn_cod ||
    row?.normalized?.snCod ||
    row?.normalized?.sn_cod
  );
}

function rowTitle(row: any, draft: any) {
  const name = cell(draft.titleRo || draft.productName || row?.supplier_product_code);
  const color = String(draft.colorName || row?.supplier_color_code || "").trim();
  const size = String(draft.size || row?.supplier_size || "").trim();
  const suffix = [color, size].filter(Boolean).join(" / ");
  return suffix ? `${name} - ${suffix}` : name;
}

function buildOfficialReceptionHtml(detail: AifReceptionDetail, drafts: Record<string, Record<string, unknown>> = {}, salesSettings: SalesTvaSettings = DEFAULT_SALES_TVA_SETTINGS) {
  const item: any = detail.item || {};
  const rows = (detail.rows || []).filter((row: any) => row.status !== "ignored");
  const currency = String(item.currency_code || "").toUpperCase() || "RON";
  const rate = n(item.exchange_rate_to_ron) || 1;
  const shipping = n(item.shipping_cost);
  const shippingRon = shipping * rate;
  const salesTva = normalizeSalesTvaSettings(salesSettings);
  const salesTvaText = salesTvaLabel(salesTva);

  const baseLines = rows.map((row: any) => {
    const draft = rowDraft(row, drafts);
    const qty = n(draft.qty ?? row.qty);
    const price = n(draft.buyPrice ?? row.buy_price ?? draft.buyPriceOriginal);
    const priceRon = price * rate;
    const sellPriceRon = rowSellGrossPriceRon(row, draft, salesTva);
    const sellValueRon = qty * sellPriceRon;
    const value = qty * price;
    return { row, draft, qty, price, priceRon, sellPriceRon, sellValueRon, value };
  });

  const totalValue = baseLines.reduce((sum, x) => sum + x.value, 0);
  const lines = baseLines.map((x) => {
    const share = totalValue > 0 ? x.value / totalValue : 0;
    const transportRonTotal = shippingRon * share;
    const transportPerUnitRon = x.qty > 0 ? transportRonTotal / x.qty : 0;
    const costPerUnitRon = x.priceRon + transportPerUnitRon;
    const valueRon = costPerUnitRon * x.qty;
    return { ...x, transportPerUnitRon, costPerUnitRon, valueRon };
  });

  const totalQty = lines.reduce((sum, x) => sum + x.qty, 0);
  const totalRon = lines.reduce((sum, x) => sum + x.valueRon, 0);
  const totalSellRon = lines.reduce((sum, x) => sum + x.sellValueRon, 0);
  const nrIntern = `REC-${String(item.invoice_number || item.id || "").replace(/[^a-zA-Z0-9-]+/g, "").slice(0, 18) || "-"}`;
  const title = `Receptie ${item.invoice_number || nrIntern}`;
  const today = new Date().toLocaleDateString("ro-RO");

  const tableRows = lines.map((x) => `
    <tr>
      <td>${pdfEscape(rowTitle(x.row, x.draft))}</td>
      <td>${pdfEscape(rowSku(x.row, x.draft))}</td>
      <td>${pdfEscape(rowSnCod(x.row, x.draft))}</td>
      <td class="num">${pdfNumber(x.qty, 0)}</td>
      <td class="num">${pdfNumber(x.price)}</td>
      <td class="num">${pdfNumber(x.priceRon)}</td>
      <td class="num">${pdfNumber(x.transportPerUnitRon)}</td>
      <td class="num">${pdfNumber(x.costPerUnitRon)}</td>
      <td class="num">${pdfNumber(x.sellPriceRon)}</td>
      <td class="num">${pdfEscape(salesTvaShort(salesTva))}</td>
      <td class="num">${pdfNumber(x.value)}</td>
      <td class="num">${pdfNumber(x.valueRon)}</td>
      <td class="num">${pdfNumber(x.sellValueRon)}</td>
    </tr>`).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${pdfEscape(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
    .doc { width: 100%; }
    .header { display: grid; grid-template-columns: 1.25fr 1fr; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
    .company { font-size: 10px; line-height: 1.45; }
    .company-name { font-size: 15px; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 3px; }
    .title { text-align: right; }
    .title h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: .05em; text-transform: uppercase; }
    .title .nr { font-size: 12px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
    .box { border: 1px solid #9ca3af; border-radius: 4px; padding: 5px 6px; min-height: 34px; }
    .box .label { color: #6b7280; text-transform: uppercase; font-size: 8px; letter-spacing: .05em; margin-bottom: 2px; }
    .box .value { font-size: 10px; }
    .note { border: 1px solid #d1d5db; background: #f9fafb; padding: 6px 8px; margin: 8px 0 10px; line-height: 1.35; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    th { background: #111827; color: #fff; font-weight: 400; text-transform: uppercase; font-size: 8px; letter-spacing: .03em; padding: 5px 4px; border: 1px solid #111827; }
    td { padding: 4px; border: 1px solid #d1d5db; vertical-align: top; font-size: 9px; line-height: 1.25; overflow-wrap: anywhere; }
    .num { text-align: right; white-space: nowrap; }
    .totals td { font-size: 10px; border-top: 2px solid #111827; background: #f3f4f6; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 18px; font-size: 10px; }
    .sig { padding-top: 22px; border-top: 1px solid #111827; }
    .footer { margin-top: 10px; color: #6b7280; font-size: 8px; display: flex; justify-content: space-between; }
    .screen-actions { margin: 0 0 10px; display: flex; gap: 8px; }
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
        <h1>Receptie marfa</h1>
        <div class="nr">Nr. intern: ${pdfEscape(nrIntern)}</div>
        <div>Data: ${pdfEscape(pdfDate(item.reception_date) || today)}</div>
      </div>
    </div>

    <div class="meta">
      <div class="box"><div class="label">Furnizor</div><div class="value">${pdfEscape(item.supplier_name || "-")}</div></div>
      <div class="box"><div class="label">Factura</div><div class="value">${pdfEscape(item.invoice_number || "-")}</div></div>
      <div class="box"><div class="label">Data factura</div><div class="value">${pdfEscape(pdfDate(item.invoice_date))}</div></div>
      <div class="box"><div class="label">Gestiune</div><div class="value">${pdfEscape(item.location_name || "-")}</div></div>
      <div class="box"><div class="label">Deviza factura</div><div class="value">${pdfEscape(currency)}</div></div>
      <div class="box"><div class="label">Curs RON</div><div class="value">${pdfNumber(rate, 4)}</div></div>
      <div class="box"><div class="label">Transport ${pdfEscape(currency)}</div><div class="value">${pdfNumber(shipping)}</div></div>
      <div class="box"><div class="label">Transport RON</div><div class="value">${pdfNumber(shippingRon)}</div></div>
    </div>

    <div class="note">Repartizare transport: proportional dupa valoarea liniei. TVA achizitie: ${pdfEscape(tvaModeText(item.tva_mode))}. Pret vanzare: ${pdfEscape(salesTvaText)}, moneda ${pdfEscape(salesTva.sellPriceCurrency)}. Document generat din AllInFashion.</div>

    <table>
      <colgroup>
        <col style="width: 22%" />
        <col style="width: 8%" />
        <col style="width: 7%" />
        <col style="width: 4%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
        <col style="width: 6%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
        <col style="width: 5%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
        <col style="width: 6%" />
      </colgroup>
      <thead>
        <tr>
          <th>Denumire</th>
          <th>SKU</th>
          <th>S/N/COD</th>
          <th>Cant.</th>
          <th>Pret ${pdfEscape(currency)}</th>
          <th>Pret RON</th>
          <th>Tr/db RON</th>
          <th>Cost/db RON</th>
          <th>Vanzare/db RON</th>
          <th>TVA</th>
          <th>Val ${pdfEscape(currency)}</th>
          <th>Cost RON</th>
          <th>Val. vanzare RON</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || `<tr><td colspan="13" style="text-align:center;padding:18px;">Nu exista linii de receptie.</td></tr>`}
      </tbody>
      <tfoot>
        <tr class="totals">
          <td colspan="3">TOTAL</td>
          <td class="num">${pdfNumber(totalQty, 0)}</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td class="num">${pdfNumber(totalValue)}</td>
          <td class="num">${pdfNumber(totalRon)}</td>
          <td class="num">${pdfNumber(totalSellRon)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="signatures">
      <div class="sig">Responsabil gestiune</div>
      <div class="sig">Semnatura</div>
      <div class="sig">Data</div>
    </div>

    <div class="footer">
      <span>SC TITAN EURO-COM SRL - receptie marfa</span>
      <span>Generat: ${pdfEscape(today)}</span>
    </div>
  </div>
</body>
</html>`;
}

function openOfficialReceptionPdf(detail: AifReceptionDetail, drafts: Record<string, Record<string, unknown>> = {}, salesSettings: SalesTvaSettings = DEFAULT_SALES_TVA_SETTINGS) {
  const fileName = `receptie_${fileSafe((detail.item as any)?.invoice_number || (detail.item as any)?.id)}.pdf`;
  const html = buildOfficialReceptionHtml(detail, drafts, salesSettings).replace(
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

function normPdfKey(v: unknown) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function categoryPdfLabel(value: unknown, categories?: any[]) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const key = normPdfKey(raw);
  const found = (categories || []).find((c) => {
    const aliases = Array.isArray(c.aliases) ? c.aliases : [];
    return [c.id, c.code, c.name_ro, c.name_hu, c.name, ...aliases]
      .filter(Boolean)
      .some((x) => normPdfKey(x) === key);
  });
  return found ? String(found.name_hu || found.name_ro || found.name || found.code || raw) : raw;
}

function genderPdfLabel(value: unknown, genderTypes?: any[]) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const key = normPdfKey(raw);
  const found = (genderTypes || []).find((g) => {
    const aliases = Array.isArray(g.aliases) ? g.aliases : [];
    return [g.code, g.name, ...aliases]
      .filter(Boolean)
      .some((x) => normPdfKey(x) === key);
  });
  return found ? String(found.name || raw) : raw;
}

function checkRowData(row: any, draft: any, categories?: any[], genderTypes?: any[]) {
  const rawCategory = draft.categoryName || draft.categoryCode || row?.normalized?.categoryName || row?.normalized?.categoryCode;
  const rawGender = draft.gender || row?.normalized?.gender;
  return {
    code: rowSku(row, draft),
    snCod: cell(row?.sn_cod || draft.snCod || draft.sn_cod || row?.normalized?.snCod || row?.normalized?.sn_cod),
    title: cell(draft.titleRo || draft.productName || row?.normalized?.titleRo || row?.supplier_product_code),
    brand: cell(draft.brandName || draft.brandCode || row?.normalized?.brandName || row?.normalized?.brandCode),
    category: categoryPdfLabel(rawCategory, categories),
    gender: genderPdfLabel(rawGender, genderTypes),
    color: cell(draft.colorName || row?.normalized?.colorName),
    colorCode: cell(row?.supplier_color_code || draft.colorCode || row?.normalized?.colorCode),
    size: cell(row?.supplier_size || draft.size || row?.normalized?.size),
    qty: n(draft.qty ?? row?.qty ?? row?.normalized?.qty),
    status: statusText(row?.status),
  };
}

function buildReceptionVerificationHtml(
  detail: AifReceptionDetail,
  drafts: Record<string, Record<string, unknown>> = {},
  categories?: any[],
  genderTypes?: any[]
) {
  const item: any = detail.item || {};
  const rows = (detail.rows || []).filter((row: any) => row.status !== "ignored");
  const title = `Fisa verificare marfa ${item.invoice_number || item.id || ""}`;
  const today = new Date().toLocaleDateString("ro-RO");
  const lines = rows.map((row: any, index: number) => {
    const draft = rowDraft(row, drafts);
    const x = checkRowData(row, draft, categories, genderTypes);
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td>${pdfEscape(x.code)}</td>
        <td>${pdfEscape(x.snCod)}</td>
        <td>${pdfEscape(x.title)}</td>
        <td>${pdfEscape(x.brand)}</td>
        <td>${pdfEscape(x.category)}</td>
        <td>${pdfEscape(x.gender)}</td>
        <td>${pdfEscape(x.color)}</td>
        <td>${pdfEscape(x.colorCode)}</td>
        <td>${pdfEscape(x.size)}</td>
        <td class="num">${pdfNumber(x.qty, 0)}</td>
        <td class="write"></td>
        <td class="check"></td>
        <td class="write"></td>
        <td class="write wide"></td>
      </tr>`;
  }).join("");
  const totalQty = rows.reduce((sum: number, row: any) => {
    const draft = rowDraft(row, drafts);
    return sum + n(draft.qty ?? row.qty ?? row.normalized?.qty);
  }, 0);

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
        <div class="sub">Document fara preturi</div>
      </div>
    </div>
    <div class="meta">
      <div class="box"><div class="label">Furnizor</div><div class="value">${pdfEscape(item.supplier_name || "-")}</div></div>
      <div class="box"><div class="label">Factura</div><div class="value">${pdfEscape(item.invoice_number || "-")}</div></div>
      <div class="box"><div class="label">Data factura</div><div class="value">${pdfEscape(pdfDate(item.invoice_date))}</div></div>
      <div class="box"><div class="label">Gestiune</div><div class="value">${pdfEscape(item.location_name || "-")}</div></div>
      <div class="box"><div class="label">Total factura</div><div class="value">${pdfNumber(totalQty, 0)} buc.</div></div>
    </div>
    <div class="note">Lista pentru verificarea fizica a marfii primite. Nu contine preturi. Completeaza cantitatea receptionata, bifeaza OK sau noteaza problema si observatiile.</div>
    <table>
      <colgroup>
        <col style="width: 3%" />
        <col style="width: 7%" />
        <col style="width: 9%" />
        <col style="width: 15%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
        <col style="width: 5%" />
        <col style="width: 7%" />
        <col style="width: 6%" />
        <col style="width: 5%" />
        <col style="width: 6%" />
        <col style="width: 6%" />
        <col style="width: 3%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
      </colgroup>
      <thead>
        <tr>
          <th>Nr.</th>
          <th>Cod produs</th>
          <th>S/N/COD</th>
          <th>Denumire produs</th>
          <th>Brand</th>
          <th>Categorie</th>
          <th>Gen</th>
          <th>Culoare</th>
          <th>Cod culoare</th>
          <th>Marime</th>
          <th>Cant. factura</th>
          <th>Cant. receptionata</th>
          <th>OK</th>
          <th>Lipsa / problema</th>
          <th>Observatii</th>
        </tr>
      </thead>
      <tbody>
        ${lines || `<tr><td colspan="15" style="text-align:center;padding:18px;">Nu exista linii de verificat.</td></tr>`}
      </tbody>
      <tfoot>
        <tr class="totals"><td colspan="10">TOTAL</td><td class="num">${pdfNumber(totalQty, 0)}</td><td colspan="4"></td></tr>
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

function openReceptionVerificationPdf(
  detail: AifReceptionDetail,
  drafts: Record<string, Record<string, unknown>> = {},
  categories?: any[],
  genderTypes?: any[]
) {
  const fileName = `verificare_marfa_${fileSafe((detail.item as any)?.invoice_number || (detail.item as any)?.id)}.pdf`;
  const html = buildReceptionVerificationHtml(detail, drafts, categories, genderTypes).replace(
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


export default function AllInReceptions(_props: Props) {
  const [meta, setMeta] = useState<AifMeta | null>(null);
  const [items, setItems] = useState<AifReceptionSummary[]>([]);
  const [detail, setDetail] = useState<AifReceptionDetail | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [rowDrafts, setRowDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [receptionDraft, setReceptionDraft] = useState<Record<string, string>>({});
  const [rowStatusFilter, setRowStatusFilter] = useState("all");
  const [moveTarget, setMoveTarget] = useState<any | null>(null);
  const [moveToReceptionId, setMoveToReceptionId] = useState("");
  const [moveReceptionOptions, setMoveReceptionOptions] = useState<AifReceptionSummary[]>([]);
  const [moveReceptionOptionsLoading, setMoveReceptionOptionsLoading] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingRows, setSavingRows] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [committingRows, setCommittingRows] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AifReceptionSummary | null>(null);
  const [rowErrorTarget, setRowErrorTarget] = useState<any | null>(null);
  const [rowColorResolution, setRowColorResolution] = useState<any | null>(null);
  const [rowColorResolutionLoading, setRowColorResolutionLoading] = useState(false);
  const [rowColorResolutionBusy, setRowColorResolutionBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [salesTvaSettings, setSalesTvaSettings] = useState<SalesTvaSettings>(DEFAULT_SALES_TVA_SETTINGS);
  const [salesTvaModalOpen, setSalesTvaModalOpen] = useState(false);
  const [salesTvaSettingsLoading, setSalesTvaSettingsLoading] = useState(false);
  const [salesTvaSettingsSaving, setSalesTvaSettingsSaving] = useState(false);
  const [salesTvaRate, setSalesTvaRate] = useState(String(DEFAULT_SALES_TVA_SETTINGS.salesTvaRate ?? 21));
  const [salesPriceIncludesTva, setSalesPriceIncludesTva] = useState(true);
  const [salesTvaUpdatedAt, setSalesTvaUpdatedAt] = useState<string | null>(null);
  const [salesTvaUpdatedBy, setSalesTvaUpdatedBy] = useState<string | null>(null);

  function applySalesTvaSettings(settings: SalesTvaSettings) {
    const normalized = normalizeSalesTvaSettings(settings);
    setSalesTvaSettings(normalized);
    setSalesTvaRate(String(normalized.salesTvaRate ?? DEFAULT_SALES_TVA_SETTINGS.salesTvaRate ?? 21));
    setSalesPriceIncludesTva(salesIncludesTvaOf(normalized));
    setSalesTvaUpdatedAt(String(normalized.updatedAt || normalized.updated_at || "") || null);
    setSalesTvaUpdatedBy(String(normalized.updatedBy || normalized.updated_by || "") || null);
  }

  async function loadSalesTvaSettings() {
    setSalesTvaSettingsLoading(true);
    try {
      applySalesTvaSettings(await fetchCentralSalesTvaSettings());
    } catch {
      applySalesTvaSettings(DEFAULT_SALES_TVA_SETTINGS);
    } finally {
      setSalesTvaSettingsLoading(false);
    }
  }

  async function saveSalesTvaSettings() {
    setSalesTvaSettingsSaving(true);
    setMessage("");
    try {
      const saved = await apiAifSaveSalesTvaSettingsLocal({
        salesTvaRate,
        sellPriceIncludesTva: salesPriceIncludesTva,
        salesPriceIncludesTva,
        sellPriceCurrency: "RON",
      });
      applySalesTvaSettings(normalizeSalesTvaSettings(saved.item || saved.settings || saved));
      setSalesTvaModalOpen(false);
      setMessage("Központi eladási TVA beállítás mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A központi eladási TVA beállítás nem menthető.");
    } finally {
      setSalesTvaSettingsSaving(false);
    }
  }

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const [m, r] = await Promise.all([
        apiAifMeta(),
        apiAifListReceptions({ limit: 200, search, supplier, location, currency, status, from, to }),
      ]);
      setMeta(m);
      setItems(r.items || []);
    } catch (e: any) {
      setMessage(e?.message || "A receptiók betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await Promise.all([load(), loadSalesTvaSettings()]);
      let receptionId = "";
      try {
        receptionId = window.sessionStorage.getItem(OPEN_RECEPTION_HANDOFF_KEY) || "";
        if (receptionId) window.sessionStorage.removeItem(OPEN_RECEPTION_HANDOFF_KEY);
      } catch {}
      if (receptionId) await openDetail(receptionId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.qty += Number(r.total_qty || 0);
        acc.lines += Number(r.line_count || 0);
        acc.value += n(r.invoice_gross);
        acc.deletable += r.can_delete ? 1 : 0;
        return acc;
      },
      { count: 0, qty: 0, lines: 0, value: 0, deletable: 0 }
    );
  }, [items]);

  const salesTvaText = useMemo(() => salesTvaLabel(salesTvaSettings), [salesTvaSettings]);

  async function openDetail(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const next = await apiAifGetReception(id);
      setDetail(next);
      setReceptionDraft(buildReceptionDraft(next.item));
      setRowDrafts(buildDrafts(next.rows || []));
      setSelectedRows(new Set((next.rows || []).filter(rowCanWork).map((row: any) => row.id)));
    } catch (e: any) {
      setMessage(e?.message || "A receptió részletei nem tölthetők be.");
    } finally {
      setBusy(false);
    }
  }

  function openLinkedPurchaseOrder(orderId?: string | null) {
    const id = String(orderId || "").trim();
    if (!id) return;
    try { window.sessionStorage.setItem(OPEN_ORDER_HANDOFF_KEY, id); } catch {}
    window.location.hash = "#allinorderhistory";
  }

  async function deleteReception() {
    if (!deleteTarget) return;
    setBusy(true);
    setMessage("");
    try {
      await apiAifDeleteReception(deleteTarget.id);
      setDeleteTarget(null);
      if (detail?.item?.id === deleteTarget.id) setDetail(null);
      await load();
      setMessage("Receptió törölve.");
    } catch (e: any) {
      setMessage(e?.message || "A receptió törlése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function exportReceptionPdf(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const data = detail?.item?.id === id ? detail : await apiAifGetReception(id);
      if (!data) throw new Error("A receptió nem tölthető be PDF exporthoz.");
      const drafts = detail?.item?.id === id ? rowDrafts : buildDrafts(data.rows || []);
      openOfficialReceptionPdf(data, drafts, salesTvaSettings);
    } catch (e: any) {
      setMessage(e?.message || "A PDF export nem sikerült.");
    } finally {
      setBusy(false);
    }
  }


  async function exportReceptionVerificationPdf(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const data = detail?.item?.id === id ? detail : await apiAifGetReception(id);
      if (!data) throw new Error("A receptió nem tölthető be ellenőrző PDF exporthoz.");
      const drafts = detail?.item?.id === id ? rowDrafts : buildDrafts(data.rows || []);
      openReceptionVerificationPdf(data, drafts, (meta?.categories || []) as any[], (meta?.genderTypes || []) as any[]);
    } catch (e: any) {
      setMessage(e?.message || "Az ellenőrző PDF export nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setSupplier("");
    setLocation("");
    setCurrency("");
    setStatus("");
    setFrom("");
    setTo("");
    setTimeout(() => load(), 0);
  }

  function rowCanWork(row: any) {
    return row.status !== "committed" && row.status !== "ignored";
  }

  function rowCanEdit(row: any) {
    return row.status !== "ignored";
  }

  function buildDrafts(rows: any[]) {
    const next: Record<string, Record<string, unknown>> = {};
    for (const row of rows || []) {
      const n: any = row.normalized || {};
      next[row.id] = {
        ...n,
        supplierProductCode: row.supplier_product_code || n.supplierProductCode || n.modelCode || "",
        snCod: row.sn_cod || n.snCod || n.sn_cod || "",
        sn_cod: row.sn_cod || n.snCod || n.sn_cod || "",
        titleRo: n.titleRo || "",
        colorName: n.colorName || "",
        colorCode: row.supplier_color_code || n.colorCode || "",
        size: row.supplier_size || n.size || "",
        qty: row.qty ?? n.qty ?? "",
        buyPrice: row.buy_price ?? n.buyPrice ?? "",
        sellPrice: row.sell_price_ron ?? row.sell_price ?? n.sellPriceRon ?? n.sell_price_ron ?? n.sellPrice ?? "",
        sellPriceCurrency: n.sellPriceCurrency || "RON",
        salesTvaRate: n.salesTvaRate ?? DEFAULT_SALES_TVA_SETTINGS.salesTvaRate,
      };
    }
    return next;
  }

  function buildReceptionDraft(item: AifReceptionSummary) {
    return {
      invoiceNumber: String(item.invoice_number || ""),
      invoiceDate: dateText(item.invoice_date) === "-" ? "" : dateText(item.invoice_date),
      receptionDate: dateText(item.reception_date) === "-" ? "" : dateText(item.reception_date),
      currencyCode: String(item.currency_code || ""),
      exchangeRateToRon: String(item.exchange_rate_to_ron || ""),
      tvaMode: String(item.tva_mode || "without_tva"),
      tvaRate: String(item.tva_rate ?? ""),
      shippingCost: String(item.shipping_cost ?? ""),
      invoiceGross: String(item.invoice_gross ?? ""),
      note: String((item as any).note || ""),
    };
  }

  function updateReceptionDraft(key: string, value: string) {
    setReceptionDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "tvaMode" && value === "no_tva") {
        next.tvaRate = "0";
      } else if (key === "tvaMode" && (value === "without_tva" || value === "with_tva") && n(next.tvaRate) <= 0) {
        next.tvaRate = String(n(detail?.item?.tva_rate) || 21);
      }
      return next;
    });
  }

  const visibleRows = useMemo(() => {
    const rows = detail?.rows || [];
    if (rowStatusFilter === "all") return rows;
    if (rowStatusFilter === "committed") return rows.filter((r) => r.status === "committed");
    if (rowStatusFilter === "ignored") return rows.filter((r) => r.status === "ignored");
    if (rowStatusFilter === "error") return rows.filter((r) => r.status === "error" || (r.error_messages || []).length);
    return rows.filter((r) => r.status !== "committed" && r.status !== "ignored");
  }, [detail, rowStatusFilter]);

  const detailBalance = useMemo(() => {
    if (!detail) return null;
    return receptionBalance(detail.item, detail.rows || [], rowDrafts, receptionDraft);
  }, [detail, rowDrafts, receptionDraft]);

  async function applyNoPurchaseVatAndSave() {
    if (!detail) return;
    setSavingHeader(true);
    setMessage("");
    try {
      const nextDraft = { ...receptionDraft, tvaMode: "no_tva", tvaRate: "0" };
      setReceptionDraft(nextDraft);
      await apiAifUpdateReception(detail.item.id, {
        invoiceNumber: nextDraft.invoiceNumber,
        invoiceDate: nextDraft.invoiceDate,
        receptionDate: nextDraft.receptionDate,
        currencyCode: nextDraft.currencyCode,
        exchangeRateToRon: nextDraft.exchangeRateToRon,
        tvaMode: "no_tva",
        tvaRate: 0,
        shippingCost: nextDraft.shippingCost,
        invoiceGross: nextDraft.invoiceGross,
        note: nextDraft.note,
      });
      await reloadDetail(detail.item.id);
      await load();
      setMessage("A beszerzési TVA mód „Nincs TVA” értékre állítva. A számla most a terméksorokkal egyezik.");
    } catch (e: any) {
      setMessage(e?.message || "A beszerzési TVA mód automatikus javítása nem sikerült.");
    } finally {
      setSavingHeader(false);
    }
  }

  async function saveReceptionHeader() {
    if (!detail) return;
    setSavingHeader(true);
    setMessage("");
    try {
      const saved = await apiAifUpdateReception(detail.item.id, {
        invoiceNumber: receptionDraft.invoiceNumber,
        invoiceDate: receptionDraft.invoiceDate,
        receptionDate: receptionDraft.receptionDate,
        currencyCode: receptionDraft.currencyCode,
        exchangeRateToRon: receptionDraft.exchangeRateToRon,
        tvaMode: receptionDraft.tvaMode,
        tvaRate: receptionDraft.tvaMode === "no_tva" ? 0 : receptionDraft.tvaRate,
        shippingCost: receptionDraft.shippingCost,
        invoiceGross: receptionDraft.invoiceGross,
        note: receptionDraft.note,
      });
      if (saved?.item) {
        setDetail((prev) => prev ? { ...prev, item: { ...prev.item, ...saved.item } } : prev);
        setReceptionDraft((prev) => ({
          ...prev,
          invoiceNumber: String(saved.item?.invoice_number ?? prev.invoiceNumber ?? ""),
          invoiceDate: dateOnly(saved.item?.invoice_date) || prev.invoiceDate,
          receptionDate: dateOnly(saved.item?.reception_date) || prev.receptionDate,
          currencyCode: String(saved.item?.currency_code ?? prev.currencyCode ?? ""),
          exchangeRateToRon: String(saved.item?.exchange_rate_to_ron ?? prev.exchangeRateToRon ?? ""),
          tvaMode: String(saved.item?.tva_mode ?? prev.tvaMode ?? ""),
          tvaRate: String(saved.item?.tva_rate ?? prev.tvaRate ?? ""),
          shippingCost: String(saved.item?.shipping_cost ?? prev.shippingCost ?? ""),
          invoiceGross: String(saved.item?.invoice_gross ?? prev.invoiceGross ?? ""),
          note: String(saved.item?.note ?? prev.note ?? ""),
        }));
      }
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Receptió fejadatai mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A receptió fejadatai nem menthetők.");
    } finally {
      setSavingHeader(false);
    }
  }

  async function openMoveReception(row: any) {
    if (!detail) return;
    setMoveTarget(row);
    setMoveToReceptionId("");
    setMoveReceptionOptions([]);
    setMoveReceptionOptionsLoading(true);
    setMessage("");
    try {
      const r = await apiAifListReceptions({ limit: 200 });
      const available = (r.items || []).filter(
        (item) => String(item.status || "").toLowerCase() !== "cancelled"
      );
      setMoveReceptionOptions(available);

      const targets = available.filter((item) => item.id !== detail.item.id);
      if (targets.length === 1) setMoveToReceptionId(targets[0].id);
    } catch (e: any) {
      setMoveReceptionOptions([]);
      setMessage(e?.message || "A cél receptiók betöltése nem sikerült.");
    } finally {
      setMoveReceptionOptionsLoading(false);
    }
  }

  async function moveRowToReception(commitAfterMove = false) {
    if (!detail || !moveTarget || !moveToReceptionId) return;
    const sourceReceptionId = detail.item.id;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifMoveImportRow(moveTarget.id, moveToReceptionId, { commitAfterMove });
      setMoveTarget(null);
      setMoveToReceptionId("");
      await reloadDetail(sourceReceptionId);
      await load();
      setMessage(
        result.committedAfterMove
          ? "Terméksor áthelyezve és készletre véve. A forrás és a cél receptió állapota újraszámolva."
          : "Terméksor áthelyezve. A cél receptió addig Vázlat marad, amíg a sort készletre nem veszed."
      );
    } catch (e: any) {
      setMessage(
        e?.message || (commitAfterMove
          ? "Az áthelyezés és készletre vétel nem sikerült. A rendszer az egész műveletet visszavonta."
          : "A terméksor áthelyezése nem sikerült.")
      );
    } finally {
      setBusy(false);
    }
  }

  function updateRowDraft(rowId: string, key: string, value: unknown) {
    setRowDrafts((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        [key]: value,
      },
    }));
  }

  function updateRowSellPrice(rowId: string, value: string) {
    setRowDrafts((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        sellPrice: value,
        sellPriceGrossRon: value,
        sellPriceCurrency: "RON",
        sellPriceIsRon: true,
        sellPriceIncludesTva: salesTvaSettings.sellPriceIncludesTva,
        salesPriceIncludesTva: salesTvaSettings.salesPriceIncludesTva,
        salesTvaRate: salesTvaSettings.salesTvaRate,
        saleTvaRate: salesTvaSettings.salesTvaRate,
      },
    }));
  }

  function rowPayload(row: any) {
    const draft = rowDrafts[row.id] || row.normalized || {};
    const sellPrice = (draft as any).sellPrice ?? (draft as any).sellPriceGrossRon ?? "";
    const parsedRate = Number(String(salesTvaSettings.salesTvaRate || DEFAULT_SALES_TVA_SETTINGS.salesTvaRate || 0).replace(",", "."));
    const rate = Number.isFinite(parsedRate) ? parsedRate : Number(DEFAULT_SALES_TVA_SETTINGS.salesTvaRate || 21);
    return {
      ...draft,
      snCod: (draft as any).snCod ?? (draft as any).sn_cod ?? "",
      sn_cod: (draft as any).snCod ?? (draft as any).sn_cod ?? "",
      sellPrice,
      sellPriceGrossRon: sellPrice,
      sellPriceCurrency: "RON",
      sellPriceIsRon: true,
      sellPriceIncludesTva: salesTvaSettings.sellPriceIncludesTva,
      salesPriceIncludesTva: salesTvaSettings.salesPriceIncludesTva,
      salesTvaRate: rate,
      saleTvaRate: rate,
    };
  }

  function toggleRow(rowId: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function selectReadyRows() {
    if (!detail) return;
    const ids = detail.rows
      .filter((row) => row.status !== "committed" && row.status !== "ignored" && row.status !== "error")
      .map((row) => row.id);
    setSelectedRows(new Set(ids));
  }

  async function reloadDetail(id?: string) {
    const detailId = id || detail?.item?.id;
    if (!detailId) return null;
    const next = await apiAifGetReception(detailId);
    setDetail(next);
    setReceptionDraft(buildReceptionDraft(next.item));
    setRowDrafts(buildDrafts(next.rows || []));
    setSelectedRows(new Set((next.rows || []).filter(rowCanWork).map((row: any) => row.id)));
    return next;
  }

  async function saveRowEdits() {
    if (!detail) return;
    setSavingRows(true);
    setMessage("");
    try {
      const editable = detail.rows.filter((row) => rowCanEdit(row));
      for (const row of editable) {
        await apiAifUpdateImportRow(row.id, rowPayload(row));
      }
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Terméksorok mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A terméksorok mentése nem sikerült.");
    } finally {
      setSavingRows(false);
    }
  }

  async function saveSingleRow(rowId: string) {
    if (!detail) return;
    setSavingRowId(rowId);
    setMessage("");
    try {
      const row = detail.rows.find((x: any) => x.id === rowId);
      if (row) await apiAifUpdateImportRow(rowId, rowPayload(row));
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Terméksor mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A terméksor mentése nem sikerült.");
    } finally {
      setSavingRowId(null);
    }
  }

  useEffect(() => {
    const rowId = String(rowErrorTarget?.id || '').trim();
    if (!rowId) {
      setRowColorResolution(null);
      setRowColorResolutionLoading(false);
      return;
    }
    let cancelled = false;
    setRowColorResolution(null);
    setRowColorResolutionLoading(true);
    void fetchAifJsonLocal<any>(`/import-rows/${encodeURIComponent(rowId)}/barcode-color-resolution`)
      .then((data) => {
        if (!cancelled && data?.canResolve) setRowColorResolution(data);
      })
      .catch(() => {
        // Nem minden hiba színütközés, ettől a normál hibamodal még működik.
      })
      .finally(() => {
        if (!cancelled) setRowColorResolutionLoading(false);
      });
    return () => { cancelled = true; };
  }, [rowErrorTarget?.id]);

  async function resolveBarcodeColorAndCommit(resolution: 'keep_existing' | 'use_incoming') {
    if (!detail || !rowErrorTarget?.id || rowColorResolutionBusy) return;
    const rowId = String(rowErrorTarget.id);
    setRowColorResolutionBusy(true);
    setMessage('');
    try {
      await fetchAifJsonLocal(`/import-rows/${encodeURIComponent(rowId)}/barcode-color-resolution`, {
        method: 'POST',
        body: JSON.stringify({ resolution }),
      });
      await apiAifCommitReceptionRows(detail.item.id, [rowId]);
      const next = await reloadDetail(detail.item.id);
      await load();
      const freshRow = (next?.rows || []).find((row: any) => String(row.id) === rowId);
      if (freshRow?.status === 'committed') {
        setRowErrorTarget(null);
        setRowColorResolution(null);
        setMessage(
          resolution === 'keep_existing'
            ? 'Készletre véve. A meglévő színnév maradt, az új darabok ehhez a variánshoz kerültek.'
            : 'Készletre véve. A meglévő variáns színe az új receptió szerinti színre lett átnevezve.'
        );
      } else if (freshRow) {
        setRowErrorTarget(freshRow);
        setMessage('A színválasztást elmentettem, de a sornál maradt másik ellenőrizendő hiba.');
      }
    } catch (e: any) {
      try {
        const next = await reloadDetail(detail.item.id);
        const freshRow = (next?.rows || []).find((row: any) => String(row.id) === rowId);
        if (freshRow) setRowErrorTarget(freshRow);
      } catch {}
      setMessage(e?.message || 'A színválasztás és készletre vétel nem sikerült.');
    } finally {
      setRowColorResolutionBusy(false);
    }
  }

  async function commitSelectedRows() {
    if (!detail) return;
    const ids = Array.from(selectedRows);
    if (!ids.length) {
      setMessage("Nincs kijelölt készletre vehető terméksor.");
      return;
    }
    setCommittingRows(true);
    setMessage("");
    try {
      await saveRowEdits();
      const result: any = await apiAifCommitReceptionRows(detail.item.id, ids);
      const next = await reloadDetail(detail.item.id);
      await load();

      const failedRows = Array.isArray(result?.failedRows) ? result.failedRows : [];
      const failedIds = new Set(failedRows.map((row: any) => String(row?.id || "")).filter(Boolean));
      const firstError = (next?.rows || []).find((row: any) =>
        (failedIds.size ? failedIds.has(String(row.id)) : ids.includes(String(row.id))) &&
        (row.status === "error" || receptionRowErrorMessages(row).length)
      );

      if (firstError) setRowErrorTarget(firstError);

      if (failedRows.length || firstError) {
        const committed = Number(result?.committed || 0);
        const failedCount = Number(result?.failedCount || failedRows.length || 1);
        setMessage(`${committed} sor készletre véve, ${failedCount} sor hibás. A hiba részlete megnyílt.`);
      } else {
        setMessage("A kijelölt terméksorok készletre véve.");
      }
    } catch (e: any) {
      let firstError: any = null;
      try {
        const next = await reloadDetail(detail.item.id);
        await load();
        firstError = (next?.rows || []).find((row: any) =>
          ids.includes(String(row.id)) &&
          (row.status === "error" || receptionRowErrorMessages(row).length)
        );
      } catch {
        // Az eredeti készletre vételi hibát mutatjuk tovább.
      }

      if (firstError) {
        setRowErrorTarget(firstError);
        setMessage("A készletre vétel megállt egy hibás sornál. A részletes magyarázat megnyílt.");
      } else {
        setMessage(e?.message || "A kijelölt terméksorok készletre vétele nem sikerült.");
      }
    } finally {
      setCommittingRows(false);
    }
  }

  async function ignoreRow(rowId: string) {
    if (!detail) return;
    setBusy(true);
    setMessage("");
    try {
      await apiAifIgnoreImportRow(rowId);
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Terméksor kihagyva.");
    } catch (e: any) {
      setMessage(e?.message || "A terméksor kihagyása nem sikerült.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className={page}>
      <div className={wrap}>
        <header className={headerCard}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] border-l-4 border-[#7bd7d4]/70 pl-3">
              <p className="text-[11px] uppercase tracking-[0.18em] leading-none text-[#cffffd]/70">AllInFashion</p>
              <h1 className="mt-1 text-xl leading-tight tracking-tight text-white">Receptiók</h1>
              <p className="mt-0.5 text-[11px] leading-snug text-white/52">Számlás bevételezések, export és részletezés.</p>
            </div>
            <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
              <button className={headerBtnSoft} onClick={load} disabled={busy} type="button"><RefreshCw size={15} /> Frissítés</button>
              <button className={headerBtnSoft} onClick={() => setSalesTvaModalOpen(true)} disabled={salesTvaSettingsLoading} type="button">Eladási TVA {salesTvaShort(salesTvaSettings)}</button>
              <button className={headerPrimaryBtn} onClick={() => (window.location.hash = "#allinincoming")} type="button"><FileText size={15} /> Új bevételezés</button>
              <button className={`${headerBtn} ml-2 border-white/30 bg-[#263246] px-3`} onClick={() => (window.location.hash = "#allin")} type="button" title="Kezdőlap"><Home size={15} /> Kezdőlap</button>
            </div>
          </div>
        </header>

        {message && <div className="rounded-xl border border-white/18 bg-[#354153] px-3 py-2 text-sm text-white/86">{message}</div>}

        <section className={card}>
          <SectionTitle icon={<Search size={16} />} title="Szűrés és keresés" />
          <div className="space-y-4 p-4">
            <div className="grid gap-3 lg:grid-cols-4">
            <label className={`${label} lg:col-span-2`}>
              Keresés
              <input className={input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="számlaszám, beszállító, cél hely" />
            </label>
            <div className={label}>
              <span>Időszak kezdete</span>
              <HungarianDatePicker value={from} ariaLabel="Időszak kezdete" onChange={setFrom} />
            </div>
            <div className={label}>
              <span>Időszak vége</span>
              <HungarianDatePicker value={to} ariaLabel="Időszak vége" onChange={setTo} />
            </div>
            <label className={label}>
              Beszállító
              <SmartSelect
                value={supplier}
                onChange={setSupplier}
                placeholder="Összes beszállító"
                options={[{ value: "", label: "Összes beszállító" }, ...(meta?.suppliers || []).map((s) => ({ value: s.id, label: s.name }))]}
              />
            </label>
            <label className={label}>
              Cél hely
              <SmartSelect
                value={location}
                onChange={setLocation}
                placeholder="Összes helyszín"
                options={[{ value: "", label: "Összes helyszín" }, ...(meta?.locations || []).map((l) => ({ value: l.id, label: l.name }))]}
              />
            </label>
            <label className={label}>
              Pénznem
              <SmartSelect
                value={currency}
                onChange={setCurrency}
                placeholder="Összes pénznem"
                options={[{ value: "", label: "Összes pénznem" }, ...(meta?.currencies || []).map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))]}
              />
            </label>
            <label className={label}>
              Állapot
              <SmartSelect
                value={status}
                onChange={setStatus}
                placeholder="Minden állapot"
                options={[
                  { value: "", label: "Minden állapot" },
                  { value: "draft", label: "Vázlat" },
                  { value: "parsed", label: "Ellenőrizve" },
                  { value: "needs_review", label: "Ellenőrzés szükséges" },
                  { value: "review", label: "Folyamatban" },
                  { value: "committed", label: "Készletre véve" },
                ]}
              />
            </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={primaryBtn} onClick={load} disabled={busy} type="button"><Search size={15} /> Keresés</button>
              <button className={neutralBtn} onClick={resetFilters} type="button"><X size={15} /> Alaphelyzet</button>
            </div>
          </div>
        </section>

        <section className={card}>
          <SectionTitle icon={<CalendarDays size={16} />} title="Áttekintés" />
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Receptiók</p><p className="mt-0.5 text-lg text-white">{totals.count}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Terméksor</p><p className="mt-0.5 text-lg text-white">{totals.lines}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Darab</p><p className="mt-0.5 text-lg text-white">{totals.qty}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Törölhető</p><p className="mt-0.5 text-lg text-white">{totals.deletable}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Összes érték</p><p className="mt-0.5 text-lg text-white">{money(totals.value)}</p></div>
            <div className="rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-2.5 py-1.5"><p className="text-xs uppercase tracking-[0.06em] text-white/72">Eladási TVA</p><p className="mt-0.5 text-lg text-white">{salesTvaText}</p></div>
          </div>
        </section>

        <section className={card}>
          <SectionTitle title="Receptió lista" right={<span className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-xs text-white/62">{items.length} találat</span>} />
          <div className="overflow-hidden">
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[#293448] text-[10px] font-normal uppercase tracking-[0.08em] text-white/72 [&_th]:font-normal">
                  <tr>
                    <th className="px-2 py-1.5">Számla</th>
                    <th className="px-2 py-1.5">Beszállító</th>
                    <th className="px-2 py-1.5">Beszerzési rendelés</th>
                    <th className="px-2 py-1.5">Cél hely</th>
                    <th className="px-2 py-1.5">Dátum</th>
                    <th className="px-2 py-1.5">Pénznem</th>
                    <th className="px-2 py-1.5 text-right">Végösszeg</th>
                    <th className="px-2 py-1.5 text-right">Sorszám</th>
                    <th className="px-2 py-1.5 text-right">Darab</th>
                    <th className="px-2 py-1.5">Állapot</th>
                    <th className="px-2 py-1.5 text-right">Művelet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-transparent">
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-white/[0.04]">
                      <td className="px-3 py-2 text-white">{cell(r.invoice_number)}</td>
                      <td className="px-2 py-1.5 text-white/82">{cell(r.supplier_name)}</td>
                      <td className="px-2 py-1.5 text-white/82">{r.purchase_order_id ? <button className="rounded-full border border-orange-200/35 bg-orange-500/16 px-2 py-1 text-[10px] text-orange-50 hover:bg-orange-500/24" onClick={() => openLinkedPurchaseOrder(r.purchase_order_id)} type="button">{r.purchase_order_number || "Kapcsolt rendelés"}</button> : <span className="text-white/35">-</span>}</td>
                      <td className="px-2 py-1.5 text-white/82">{cell(r.location_name)}</td>
                      <td className="px-2 py-1.5 text-white/82">{dateText(r.reception_date)}</td>
                      <td className="px-2 py-1.5 text-white/82">{cell(r.currency_code)}</td>
                      <td className="px-3 py-2 text-right text-white">{money(r.invoice_gross, r.currency_code)}</td>
                      <td className="px-3 py-2 text-right text-white/82">{r.line_count || 0}</td>
                      <td className="px-3 py-2 text-right text-white/82">{r.total_qty || 0}</td>
                      <td className="px-2 py-1.5 text-white/82">{statusText(r.status)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex justify-end gap-1.5">
                          <button className={tinyBtn} onClick={() => openDetail(r.id)} disabled={busy} type="button"><Eye size={13} /> {r.status === "committed" ? "Adatok" : "Folytatás"}</button>
                          <button className={tinyBtn} onClick={() => exportReceptionVerificationPdf(r.id)} disabled={busy} type="button"><CheckCircle size={13} /> Ellenőrző</button>
                          <button className={tinyBtn} onClick={() => exportReceptionPdf(r.id)} disabled={busy} type="button"><FileText size={13} /> PDF</button>
                          <button className={tinyBtn} onClick={() => exportCsv(r.id)} type="button"><Download size={13} /> CSV</button>
                          <button className={tinyDangerBtn} onClick={() => setDeleteTarget(r)} disabled={busy || !r.can_delete} type="button"><Trash2 size={13} /> Törlés</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!items.length && <tr><td className="px-2 py-6 text-center text-white/62" colSpan={11}>Nincs receptió a megadott szűrés szerint.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-3 lg:hidden">
              {items.map((r) => (
                <div key={r.id} className="rounded-2xl border border-white/12 bg-white/[0.05] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-white">{cell(r.invoice_number)}</p>
                      <p className="mt-1 text-xs text-white/62">{cell(r.supplier_name)} • {cell(r.location_name)}</p>
                      {r.purchase_order_id && <button className="mt-2 rounded-full border border-orange-200/35 bg-orange-500/16 px-2 py-1 text-[10px] text-orange-50" onClick={() => openLinkedPurchaseOrder(r.purchase_order_id)} type="button">{r.purchase_order_number || "Kapcsolt rendelés"}</button>}
                    </div>
                    <span className="rounded-full border border-[#2a8d8b]/40 bg-[#2a8d8b]/10 px-2 py-1 text-xs text-white">{statusText(r.status)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Dátum</p><p>{dateText(r.reception_date)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Érték</p><p>{money(r.invoice_gross, r.currency_code)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Sorszám</p><p>{r.line_count || 0}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Darab</p><p>{r.total_qty || 0}</p></div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className={tinyBtn} onClick={() => openDetail(r.id)} disabled={busy} type="button"><Eye size={13} /> {r.status === "committed" ? "Adatok" : "Folytatás"}</button>
                    <button className={tinyBtn} onClick={() => exportReceptionVerificationPdf(r.id)} disabled={busy} type="button"><CheckCircle size={13} /> Ellenőrző</button>
                    <button className={tinyBtn} onClick={() => exportReceptionPdf(r.id)} disabled={busy} type="button"><FileText size={13} /> PDF</button>
                          <button className={tinyBtn} onClick={() => exportCsv(r.id)} type="button"><Download size={13} /> CSV</button>
                    <button className={tinyDangerBtn} onClick={() => setDeleteTarget(r)} disabled={busy || !r.can_delete} type="button"><Trash2 size={13} /> Törlés</button>
                  </div>
                </div>
              ))}
              {!items.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-5 text-center text-sm text-white/65">Nincs receptió a megadott szűrés szerint.</p>}
            </div>
          </div>
        </section>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-[96vw] overflow-auto rounded-2xl border border-white/18 bg-[#404a5b] shadow-2xl">
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/12 bg-[#303a4c]/98 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-xs uppercase tracking-[0.1em] text-white">Receptió részletei</p>
                <h2 className="text-base text-white font-normal">{cell(detail.item.invoice_number)}</h2>
              </div>
              <div className="flex gap-2">
                <button className={neutralBtn} onClick={() => exportReceptionVerificationPdf(detail.item.id)} disabled={busy} type="button"><CheckCircle size={15} /> Ellenőrző PDF</button>
                <button className={neutralBtn} onClick={() => exportReceptionPdf(detail.item.id)} disabled={busy} type="button"><FileText size={15} /> PDF</button>
                <button className={neutralBtn} onClick={() => exportCsv(detail.item.id)} type="button"><Download size={15} /> CSV</button>
                <button className={neutralBtn} onClick={() => setDetail(null)} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-3 px-3 pt-3 pb-6">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Beszállító</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.supplier_name)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Beszerzési rendelés</p>{detail.item.purchase_order_id ? <button className="mt-1 rounded-full border border-orange-200/35 bg-orange-500/16 px-2 py-1 text-[10px] text-orange-50 hover:bg-orange-500/24" onClick={() => openLinkedPurchaseOrder(detail.item.purchase_order_id)} type="button">{detail.item.purchase_order_number || "Kapcsolt rendelés"}</button> : <p className="mt-0.5 text-xs text-white/40">-</p>}</div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Cél hely</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.location_name)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Pénznem</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.currency_code)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Árfolyam</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.exchange_rate_to_ron)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Végösszeg</p><p className="mt-0.5 text-xs text-white">{money(detail.item.invoice_gross, detail.item.currency_code)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Eladási TVA</p><p className="mt-0.5 text-xs text-white">{salesTvaText}</p></div>
              </div>

              {detailBalance && (
                <div className={`rounded-xl border px-3 py-2 ${detailBalance.className}`}>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="relative mt-0.5 shrink-0">
                        {!detailBalance.isOk && !detailBalance.suggestedNoVat && <span className="absolute inset-0 rounded-full bg-red-400/55 blur-md animate-pulse" />}
                        <span className={`relative block h-3.5 w-3.5 rounded-full ${detailBalance.ledClassName}`} />
                      </div>
                      <div>
                        <p className={`text-[11px] uppercase tracking-[0.14em] ${detailBalance.labelClassName}`}>Számla egyeztetés</p>
                        <div className="mt-0.5 flex flex-wrap items-end gap-x-3 gap-y-1">
                          <p className={`text-base sm:text-lg ${detailBalance.amountClassName}`}>
                            {detailBalance.suggestedNoVat ? (
                              <>A sorok összege helyes: <span className="text-amber-50">{money(detailBalance.baseTotal, detail.item.currency_code)}</span></>
                            ) : (
                              <>Különbözet: <span className={!detailBalance.isOk ? "text-red-50 [text-shadow:0_0_14px_rgba(248,113,113,0.45)]" : ""}>{money(detailBalance.diff, detail.item.currency_code)}</span></>
                            )}
                          </p>
                          {!detailBalance.isOk && !detailBalance.suggestedNoVat && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200/35 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-50 shadow-[0_0_14px_rgba(239,68,68,0.35)]">
                              <span className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.95)] animate-pulse" />
                              Figyelem: a számla még nem talál
                            </span>
                          )}
                          {detailBalance.suggestedNoVat && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/45 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-50">
                              A sorok összege pontosan egyezik a számlával. Csak a beszerzési TVA mód van rosszul beállítva.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`self-start rounded-full border px-2.5 py-1 text-xs ${detailBalance.badgeClassName}`}>{detailBalance.status}</span>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                    <div className={detailBalance.labelClassName}>Sorok: <span className="text-white">{money(detailBalance.rowsValue, detail.item.currency_code)}</span></div>
                    <div className={detailBalance.labelClassName}>Beszerzési TVA: <span className="text-white">{money(detailBalance.tvaValue, detail.item.currency_code)}</span></div>
                    <div className={detailBalance.labelClassName}>Szállítás: <span className="text-white">{money(detailBalance.shipping, detail.item.currency_code)}</span></div>
                    <div className={detailBalance.labelClassName}>Számított számla: <span className="text-white">{money(detailBalance.calculatedTotal, detail.item.currency_code)}</span></div>
                  </div>
                  {detailBalance.suggestedNoVat && (
                    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-amber-200/35 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-50 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        {money(detailBalance.rowsValue, detail.item.currency_code)} termék + {money(detailBalance.shipping, detail.item.currency_code)} szállítás = {money(detailBalance.invoiceGross, detail.item.currency_code)} számla.
                        A plusz {money(detailBalance.tvaValue, detail.item.currency_code)} csak a hibás beszerzési TVA-beállításból jön.
                      </span>
                      <button className={primaryBtn} onClick={() => void applyNoPurchaseVatAndSave()} disabled={savingHeader || busy} type="button">
                        Nincs beszerzési TVA • javítás és mentés
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-[#2a8d8b]/35 bg-[#2a8d8b]/10 px-3 py-2 text-white shadow-lg shadow-slate-950/10">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.1em] text-white/70">Eladási ár / TVA</p>
                    <p className="mt-1 text-sm text-white">
                      {salesIncludesTvaOf(salesTvaSettings)
                        ? `A megadott eladási ár már végár, a ${salesTvaShort(salesTvaSettings)} TVA benne van.`
                        : `A megadott eladási ár nettó, a rendszer hozzáadja a ${salesTvaShort(salesTvaSettings)} TVA-t.`}
                    </p>
                    {salesTvaUpdatedAt && <p className="mt-1 text-[11px] text-white/55">Utolsó központi mentés: {String(salesTvaUpdatedAt).slice(0, 16).replace("T", " ")}{salesTvaUpdatedBy ? ` • ${salesTvaUpdatedBy}` : ""}</p>}
                  </div>
                  <button className={neutralBtn} onClick={() => setSalesTvaModalOpen(true)} disabled={salesTvaSettingsLoading} type="button">Beállítás</button>
                </div>
              </div>

              <div className={lightPanel}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.1em] text-white/52">Receptió fejadatai</p>
                    <p className="mt-1 text-xs text-white/68">Számlaszám, árfolyam, beszerzési TVA és végösszeg javítása. Az eladási TVA külön, központi beállításként működik.</p>
                  </div>
                  <button className={primaryBtn} onClick={saveReceptionHeader} disabled={busy || savingHeader} type="button"><Save size={15} /> Fejadatok mentése</button>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-4">
                  <label className={lightLabel}>Számlaszám<input className={lightInput} value={receptionDraft.invoiceNumber || ""} onChange={(e) => updateReceptionDraft("invoiceNumber", e.target.value)} /></label>
                  <label className={lightLabel}>Számla dátuma<input className={lightInput} type="date" value={receptionDraft.invoiceDate || ""} onChange={(e) => updateReceptionDraft("invoiceDate", e.target.value)} /></label>
                  <label className={lightLabel}>Receptió dátuma<input className={lightInput} type="date" value={receptionDraft.receptionDate || ""} onChange={(e) => updateReceptionDraft("receptionDate", e.target.value)} /></label>
                  <label className={lightLabel}>Pénznem<select className={lightSelect} value={receptionDraft.currencyCode || ""} onChange={(e) => updateReceptionDraft("currencyCode", e.target.value)}>{(meta?.currencies || []).map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}</select></label>
                  <label className={lightLabel}>Árfolyam RON<input className={lightInput} value={receptionDraft.exchangeRateToRon || ""} onChange={(e) => updateReceptionDraft("exchangeRateToRon", e.target.value)} /></label>
                  <label className={lightLabel}>Beszerzési TVA kezelése<select className={lightSelect} value={receptionDraft.tvaMode || "no_tva"} onChange={(e) => updateReceptionDraft("tvaMode", e.target.value)}><option value="no_tva">Nincs beszerzési TVA</option><option value="without_tva">Nettó vételár + TVA</option><option value="with_tva">Bruttó vételár, TVA benne van</option></select></label>
                  <label className={lightLabel}>Beszerzési TVA %<input className={lightInput} disabled={receptionDraft.tvaMode === "no_tva"} value={receptionDraft.tvaMode === "no_tva" ? "0" : (receptionDraft.tvaRate || "")} onChange={(e) => updateReceptionDraft("tvaRate", e.target.value)} /></label>
                  <label className={lightLabel}>Szállítás<input className={lightInput} value={receptionDraft.shippingCost || ""} onChange={(e) => updateReceptionDraft("shippingCost", e.target.value)} /></label>
                  <label className={lightLabel}>Számla végösszeg<input className={lightInput} value={receptionDraft.invoiceGross || ""} onChange={(e) => updateReceptionDraft("invoiceGross", e.target.value)} /></label>
                  <label className={`${lightLabel} lg:col-span-3`}>Megjegyzés<input className={lightInput} value={receptionDraft.note || ""} onChange={(e) => updateReceptionDraft("note", e.target.value)} /></label>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/14 bg-[#404a5b] text-white shadow-lg">
                <div className="flex flex-col gap-2 border-b border-white/12 bg-[#303a4c] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs uppercase tracking-[0.08em] text-white/82">Terméksorok</p>
                      <span className="rounded-full border border-white/12 bg-[#404a5b] px-2 py-0.5 text-[10px] text-white/68">{visibleRows.length} sor</span>
                      {selectedRows.size ? <span className="rounded-full border border-[#8edbd7] bg-[#effbf9] px-2 py-0.5 text-[10px] text-[#187876]">{selectedRows.size} kijelölve</span> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-white/52">Egy sor egy termékvariáns. A mezők egy vonalban maradnak, az állapot és a műveletek pedig nem foglalnak el fél képernyőt.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select className={`${lightSelect} min-w-[180px]`} value={rowStatusFilter} onChange={(e) => setRowStatusFilter(e.target.value)}>
                      <option value="active">Még dolgozandó sorok</option>
                      <option value="all">Minden sor</option>
                      <option value="committed">Készletre vett</option>
                      <option value="error">Hibás</option>
                      <option value="ignored">Kihagyott</option>
                    </select>
                    <button className={neutralBtn} onClick={selectReadyRows} disabled={busy || savingRows || committingRows} type="button">Kész sorok kijelölése</button>
                    <button className={neutralBtn} onClick={saveRowEdits} disabled={busy || savingRows || committingRows} type="button"><Save size={13} /> Sorok mentése</button>
                    <button className={primaryBtn} onClick={commitSelectedRows} disabled={busy || savingRows || committingRows || !selectedRows.size} type="button"><CheckCircle size={14} /> Kijelöltek készletre</button>
                  </div>
                </div>

                <div className="hidden xl:block">
                  <div className="max-h-[54vh] overflow-auto">
                    <div className={`${receptionGridHeader} sticky top-0 z-10`}>
                      <span className="text-center">✓</span>
                      <span>Sor</span>
                      <span>Termékkód</span>
                      <span>S/N/COD</span>
                      <span>Terméknév</span>
                      <span>Méret</span>
                      <span>Szín</span>
                      <span>Színkód</span>
                      <span className="text-right">Db</span>
                      <span className="text-right">Vételár</span>
                      <span className="text-right">Vételár RON</span>
                      <span className="text-right">{salesIncludesTvaOf(salesTvaSettings) ? "Eladási végár" : "Eladási nettó"}</span>
                      <span className="text-right">Eladás / TVA</span>
                      <span className="text-center">Művelet</span>
                    </div>
                    {visibleRows.map((r) => {
                      const draft: any = rowDrafts[r.id] || r.normalized || {};
                      const editable = rowCanEdit(r);
                      const canCommitOrMove = rowCanWork(r);
                      const checked = canCommitOrMove && selectedRows.has(r.id);
                      const exchangeRate = n(receptionDraft.exchangeRateToRon || detail.item.exchange_rate_to_ron) || 1;
                      const buyPriceRonPreview = n(draft.buyPrice ?? r.buy_price) * exchangeRate;
                      const sellPriceRonPreview = rowSellGrossPriceRon(r, draft, salesTvaSettings);
                      const hasRowError = r.status === "error" || Boolean((r.error_messages || []).length);
                      const rowTone = r.status === "committed"
                        ? "bg-emerald-500/[0.08] hover:bg-emerald-500/[0.12]"
                        : r.status === "ignored"
                          ? "bg-white/[0.05] opacity-70"
                          : hasRowError
                            ? "bg-rose-500/[0.08] hover:bg-rose-500/[0.12]"
                            : checked
                              ? "bg-[#2a8d8b]/12 hover:bg-[#2a8d8b]/16"
                              : "bg-[#404a5b] hover:bg-white/[0.04]";
                      const statusDot = r.status === "committed"
                        ? "bg-emerald-500"
                        : r.status === "ignored"
                          ? "bg-slate-400"
                          : hasRowError
                            ? "bg-rose-500"
                            : "bg-amber-400";
                      return (
                        <div key={r.id} className={`${receptionGridRow} ${rowTone}`}>
                          <div className="flex justify-center">
                            <input type="checkbox" className="h-4 w-4 accent-[#2a8d8b]" checked={checked} disabled={!canCommitOrMove || hasRowError} onChange={() => toggleRow(r.id)} aria-label={`Sor ${r.row_no} kijelölése`} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5" title={statusText(r.status)}>
                              <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
                              <span className="truncate text-[11px] tabular-nums text-white/82">Nr. {r.row_no}</span>
                            </div>
                            {hasRowError ? (
                              <button
                                type="button"
                                onClick={() => setRowErrorTarget(r)}
                                className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded-full border border-rose-300/28 bg-rose-500/14 px-1.5 py-0.5 text-[9px] text-rose-50 hover:bg-rose-500/22"
                                title="Hiba részletei"
                              >
                                <AlertTriangle size={9} className="shrink-0" />
                                <span className="truncate">Hiba • részletek</span>
                              </button>
                            ) : (
                              <span className="mt-0.5 block truncate text-[9px] text-white/40">{statusText(r.status)}</span>
                            )}
                          </div>
                          <input className={rowInput} value={String(draft.supplierProductCode ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "supplierProductCode", e.target.value)} title={String(draft.supplierProductCode ?? "")} />
                          <input className={rowInput} value={String(draft.snCod ?? draft.sn_cod ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "snCod", e.target.value)} title={String(draft.snCod ?? draft.sn_cod ?? "")} />
                          <input className={rowInput} value={String(draft.titleRo ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "titleRo", e.target.value)} title={String(draft.titleRo ?? "")} />
                          <input className={rowInput} value={String(draft.size ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "size", e.target.value)} />
                          <input className={rowInput} value={String(draft.colorName ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorName", e.target.value)} title={String(draft.colorName ?? "")} />
                          <input className={rowInput} value={String(draft.colorCode ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorCode", e.target.value)} />
                          <input className={`${rowInput} text-right tabular-nums`} value={String(draft.qty ?? "")} disabled={!canCommitOrMove} onChange={(e) => updateRowDraft(r.id, "qty", e.target.value)} />
                          <input className={`${rowInput} text-right tabular-nums`} value={String(draft.buyPrice ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "buyPrice", e.target.value)} />
                          <span className={rowRead}>{money(buyPriceRonPreview || r.buy_price_ron, "RON")}</span>
                          <input className={`${rowInput} text-right tabular-nums`} value={String(draft.sellPrice ?? "")} disabled={!editable} onChange={(e) => updateRowSellPrice(r.id, e.target.value)} />
                          <span className={`${rowRead} flex-col items-end justify-center leading-tight`}><span>{money(sellPriceRonPreview, "RON")}</span><span className="text-[9px] text-white/40">{salesTvaShort(salesTvaSettings)}</span></span>
                          <div className="flex items-center justify-center gap-1">
                            <button className={rowPrimaryBtn} onClick={() => saveSingleRow(r.id)} disabled={!editable || busy || savingRows || committingRows || savingRowId === r.id} type="button" title={savingRowId === r.id ? "Mentés folyamatban" : "Sor mentése"}><Save size={14} /></button>
                            <button className={rowNeutralBtn} onClick={() => void openMoveReception(r)} disabled={!canCommitOrMove || busy || savingRowId === r.id} type="button" title="Áthelyezés másik receptióba"><MoveRight size={14} /></button>
                            <button className={rowDangerBtn} onClick={() => ignoreRow(r.id)} disabled={!canCommitOrMove || busy || savingRowId === r.id} type="button" title="Sor kihagyása"><X size={14} /></button>
                          </div>
                        </div>
                      );
                    })}
                    {!visibleRows.length ? <div className="px-4 py-8 text-center text-sm text-white/52">Nincs sor ebben a nézetben.</div> : null}
                  </div>
                </div>

                <div className="grid max-h-[54vh] gap-2 overflow-y-auto bg-white/[0.04] p-2 xl:hidden">
                  {visibleRows.map((r) => {
                    const draft: any = rowDrafts[r.id] || r.normalized || {};
                    const editable = rowCanEdit(r);
                    const canCommitOrMove = rowCanWork(r);
                    const checked = canCommitOrMove && selectedRows.has(r.id);
                    const exchangeRate = n(receptionDraft.exchangeRateToRon || detail.item.exchange_rate_to_ron) || 1;
                    const buyPriceRonPreview = n(draft.buyPrice ?? r.buy_price) * exchangeRate;
                    const sellPriceRonPreview = rowSellGrossPriceRon(r, draft, salesTvaSettings);
                    const hasRowError = r.status === "error" || Boolean((r.error_messages || []).length);
                    return (
                      <div key={r.id} className={`rounded-xl border p-2.5 shadow-sm ${checked ? "border-[#7bd7d4]/45 bg-[#2a8d8b]/12" : hasRowError ? "border-rose-300/30 bg-rose-500/[0.08]" : "border-white/12 bg-white/[0.04]"}`}>
                        <div className="flex items-center justify-between gap-2 border-b border-white/12 pb-2">
                          <label className="inline-flex items-center gap-2 text-[11px] text-white/82"><input type="checkbox" className="h-4 w-4 accent-[#2a8d8b]" checked={checked} disabled={!canCommitOrMove || hasRowError} onChange={() => toggleRow(r.id)} />Nr. {r.row_no}</label>
                          {hasRowError ? (
                            <button
                              type="button"
                              onClick={() => setRowErrorTarget(r)}
                              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-rose-300/30 bg-rose-500/14 px-2 text-[10px] text-rose-50"
                            >
                              <AlertTriangle size={11} />
                              Hiba részletei
                            </button>
                          ) : (
                            <span className={rowStatusPill}>{statusText(r.status)}</span>
                          )}
                          <div className="ml-auto flex gap-1">
                            <button className={rowPrimaryBtn} onClick={() => saveSingleRow(r.id)} disabled={!editable || busy || savingRows || committingRows || savingRowId === r.id} type="button" title="Sor mentése"><Save size={14} /></button>
                            <button className={rowNeutralBtn} onClick={() => void openMoveReception(r)} disabled={!canCommitOrMove || busy || savingRowId === r.id} type="button" title="Áthelyezés"><MoveRight size={14} /></button>
                            <button className={rowDangerBtn} onClick={() => ignoreRow(r.id)} disabled={!canCommitOrMove || busy || savingRowId === r.id} type="button" title="Kihagy"><X size={14} /></button>
                          </div>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className={rowLabel}>Termékkód<input className={rowInput} value={String(draft.supplierProductCode ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "supplierProductCode", e.target.value)} /></label>
                          <label className={rowLabel}>S/N/COD<input className={rowInput} value={String(draft.snCod ?? draft.sn_cod ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "snCod", e.target.value)} /></label>
                          <label className={`${rowLabel} sm:col-span-2`}>Terméknév<input className={rowInput} value={String(draft.titleRo ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "titleRo", e.target.value)} /></label>
                          <label className={rowLabel}>Méret<input className={rowInput} value={String(draft.size ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "size", e.target.value)} /></label>
                          <label className={rowLabel}>Szín<input className={rowInput} value={String(draft.colorName ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorName", e.target.value)} /></label>
                          <label className={rowLabel}>Színkód<input className={rowInput} value={String(draft.colorCode ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorCode", e.target.value)} /></label>
                          <label className={rowLabel}>Darab<input className={`${rowInput} text-right`} value={String(draft.qty ?? "")} disabled={!canCommitOrMove} onChange={(e) => updateRowDraft(r.id, "qty", e.target.value)} /></label>
                          <label className={rowLabel}>Vételár<input className={`${rowInput} text-right`} value={String(draft.buyPrice ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "buyPrice", e.target.value)} /></label>
                          <label className={rowLabel}>Vételár RON<span className={rowRead}>{money(buyPriceRonPreview || r.buy_price_ron, "RON")}</span></label>
                          <label className={rowLabel}>{salesIncludesTvaOf(salesTvaSettings) ? "Eladási végár RON" : "Eladási nettó RON"}<input className={`${rowInput} text-right`} value={String(draft.sellPrice ?? "")} disabled={!editable} onChange={(e) => updateRowSellPrice(r.id, e.target.value)} /></label>
                          <label className={rowLabel}>Eladás / TVA<span className={rowRead}>{money(sellPriceRonPreview, "RON")} • {salesTvaShort(salesTvaSettings)}</span></label>
                        </div>
                      </div>
                    );
                  })}
                  {!visibleRows.length ? <div className="rounded-xl border border-white/12 bg-[#404a5b] px-3 py-6 text-center text-sm text-white/52">Nincs sor ebben a nézetben.</div> : null}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {rowErrorTarget && (() => {
        const draft: any = rowDrafts[rowErrorTarget.id] || rowErrorTarget.normalized || {};
        const errors = receptionRowErrorMessages(rowErrorTarget);
        const barcode = receptionRowBarcode(rowErrorTarget);
        const title = String(draft.titleRo || draft.productName || rowErrorTarget.normalized?.titleRo || rowErrorTarget.supplier_product_code || "Ismeretlen termék");
        const productCode = String(rowErrorTarget.supplier_product_code || draft.supplierProductCode || draft.modelCode || "-");
        const snCod = String(rowErrorTarget.sn_cod || draft.snCod || draft.sn_cod || "-");
        const size = String(rowErrorTarget.supplier_size || draft.size || "-");
        const color = String(draft.colorName || rowErrorTarget.supplier_color_code || "-");
        const isBarcodeConflict = /vonalk[oó]d|barcode/i.test(errors.join(" "));
        return (
          <div
            className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/72 p-3 backdrop-blur-[4px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reception-row-error-title"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setRowErrorTarget(null);
            }}
          >
            <div className="w-full max-w-2xl overflow-hidden rounded-[22px] border border-rose-200/28 bg-[#303a4c] text-white shadow-[0_28px_90px_rgba(0,0,0,0.62)] ring-1 ring-rose-400/10">
              <div className="flex items-start gap-3 border-b border-rose-200/16 bg-gradient-to-r from-[#3b2633] via-[#3a3040] to-[#303a4c] px-4 py-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200/28 bg-rose-500/16 text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.14)]">
                  <AlertTriangle size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-rose-100/58">Készletre vétel megállt</p>
                  <h2 id="reception-row-error-title" className="mt-1 text-xl text-white">{receptionRowErrorTitle(rowErrorTarget)}</h2>
                  <p className="mt-1 text-sm text-white/58">Nr. {rowErrorTarget.row_no || "?"} • {title}</p>
                </div>
                <button className={neutralBtn} type="button" onClick={() => setRowErrorTarget(null)} aria-label="Bezárás">
                  <X size={15} /> Bezárás
                </button>
              </div>

              <div className="space-y-3 p-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-white/12 bg-[#263246] px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Termékkód</p>
                    <p className="mt-1 truncate text-xs text-white" title={productCode}>{productCode}</p>
                  </div>
                  <div className="rounded-xl border border-white/12 bg-[#263246] px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Vonalkód</p>
                    <p className="mt-1 truncate font-mono text-xs text-[#cffffd]" title={barcode || "-"}>{barcode || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-white/12 bg-[#263246] px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Méret / szín</p>
                    <p className="mt-1 truncate text-xs text-white">{size} • {color}</p>
                  </div>
                  <div className="rounded-xl border border-white/12 bg-[#263246] px-3 py-2">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">S/N/COD</p>
                    <p className="mt-1 truncate text-xs text-white" title={snCod}>{snCod}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-rose-200/24 bg-rose-500/[0.09] p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-rose-100/64">Mi a hiba?</p>
                  <div className="mt-2 space-y-2">
                    {(errors.length ? errors : ["A terméksort a rendszer nem tudta készletre venni."]).map((error: string, index: number) => (
                      <div key={`${index}-${error}`} className="flex items-start gap-2 text-sm leading-5 text-rose-50">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-300" />
                        <span>{humanReceptionRowError(error, rowErrorTarget)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {rowColorResolutionLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-4 text-sm text-white/55">
                    <RefreshCw size={15} className="animate-spin text-[#8ee6e2]" /> Egyező régi termék ellenőrzése…
                  </div>
                ) : rowColorResolution?.canResolve ? (
                  <div className="rounded-2xl border border-[#7bd7d4]/30 bg-[#233f49] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#cffffd]/62">Te döntöd el, melyik szín maradjon</p>
                        <p className="mt-1 text-sm text-white/72">A vonalkód és a méret egyezik. Ez ugyanaz a fizikai variáns, csak a régi és az új színmegnevezés különbözik.</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/14 bg-white/[0.06] px-2 py-1 text-[10px] text-white/58">
                        jelenlegi készlet: {Number(rowColorResolution.existing?.totalQty || 0)} db
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={rowColorResolutionBusy}
                        onClick={() => void resolveBarcodeColorAndCommit('keep_existing')}
                        className="rounded-2xl border border-sky-200/28 bg-sky-500/[0.10] p-3 text-left transition hover:bg-sky-500/[0.16] disabled:opacity-50"
                      >
                        <p className="text-[10px] uppercase tracking-[0.12em] text-sky-100/58">Régi szín megtartása</p>
                        <p className="mt-1 text-lg text-white">
                          {rowColorResolution.existing?.colorName || 'Nincs színnév'}
                          {rowColorResolution.existing?.colorCode ? <span className="ml-2 text-sm text-white/48">/ {rowColorResolution.existing.colorCode}</span> : null}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-white/58">A beérkező darabokat ehhez a meglévő színhez teszi. A régi terméknév/szín nem változik.</p>
                      </button>

                      <button
                        type="button"
                        disabled={rowColorResolutionBusy}
                        onClick={() => void resolveBarcodeColorAndCommit('use_incoming')}
                        className="rounded-2xl border border-[#7bd7d4]/40 bg-[#2a8d8b]/18 p-3 text-left transition hover:bg-[#2a8d8b]/26 disabled:opacity-50"
                      >
                        <p className="text-[10px] uppercase tracking-[0.12em] text-[#cffffd]/62">Átnevezés az új színre</p>
                        <p className="mt-1 text-lg text-white">
                          {rowColorResolution.incoming?.colorName || 'Nincs színnév'}
                          {rowColorResolution.incoming?.colorCode ? <span className="ml-2 text-sm text-white/48">/ {rowColorResolution.incoming.colorCode}</span> : null}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-white/58">A meglévő variáns színét átírja az új receptió szerinti értékre, majd erre veszi készletre a darabokat.</p>
                      </button>
                    </div>
                    {rowColorResolutionBusy ? <p className="mt-2 text-center text-xs text-[#cffffd]/65">Mentés és készletre vétel…</p> : null}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/10 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#cffffd]/62">Mit kell tenni?</p>
                  <p className="mt-1.5 text-sm leading-5 text-white/76">
                    {rowColorResolution?.canResolve
                      ? <>Válassz a két lehetőség közül fent. A rendszer csak ezután módosít készletet vagy színnevet, tehát semmit nem dönt el helyetted.</>
                      : isBarcodeConflict
                        ? <>Ellenőrizd a <strong className="text-white">{barcode || "megadott"}</strong> vonalkódot a Raktárban. Ha már egy másik mérethez vagy variánshoz tartozik, előbb azt a kapcsolatot kell tisztázni. A rendszer szándékosan nem készít néma duplikált terméket.</>
                        : <>Javítsd a piros sor adatait, mentsd el a sort, majd indítsd újra a készletre vételt. Ennél a sornál addig nem történik készletmozgás.</>}
                  </p>
                </div>

                {errors.length ? (
                  <details className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-[11px] text-white/48">
                    <summary className="cursor-pointer select-none text-white/58">Technikai részlet</summary>
                    <div className="mt-2 space-y-1 font-mono leading-5">
                      {errors.map((error: string, index: number) => <p key={`${index}-technical`}>{stripReceptionRowErrorPrefix(error)}</p>)}
                    </div>
                  </details>
                ) : null}

                <div className="flex justify-end">
                  <button className={primaryBtn} type="button" onClick={() => setRowErrorTarget(null)}>
                    <Check size={15} /> Értem, javítom
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {salesTvaModalOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="sales-tva-title">
          <div className="w-full max-w-lg rounded-2xl border border-white/24 bg-[#404a5b] p-4 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="sales-tva-title" className="text-lg font-normal">Eladási ár / TVA beállítás</p>
                <p className="mt-1 text-sm text-white/70">Ez központi beállítás. Mentés után minden gépen és telefonon ugyanaz lesz.</p>
              </div>
              <button className={neutralBtn} onClick={() => setSalesTvaModalOpen(false)} type="button"><X size={14} /> Bezárás</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={label}>Eladási TVA %<input className={`${input} w-full`} value={salesTvaRate} onChange={(e) => setSalesTvaRate(e.target.value)} placeholder="pl. 21" /></label>
              <label className="flex items-center gap-2 rounded-xl border border-white/14 bg-[#354153] px-3 py-2 text-sm text-white/82">
                <input className="h-4 w-4 accent-[#2a8d8b]" type="checkbox" checked={salesPriceIncludesTva} onChange={(e) => setSalesPriceIncludesTva(e.target.checked)} />
                A megadott eladási ár már tartalmazza a TVA-t
              </label>
            </div>
            <div className="mt-3 rounded-xl border border-[#2a8d8b]/35 bg-[#2a8d8b]/10 px-3 py-2 text-sm text-white/82">
              {salesPriceIncludesTva
                ? `Példa: 100 RON megadva → 100 RON végár, ebből számolja vissza a ${salesTvaRate || 0}% TVA-t.`
                : `Példa: 100 RON megadva → ${money(100 * (1 + n(salesTvaRate) / 100), "RON")} végár, mert a rendszer ráteszi a ${salesTvaRate || 0}% TVA-t.`}
              {salesTvaUpdatedAt && <span className="mt-1 block text-white/45">Utolsó központi mentés: {String(salesTvaUpdatedAt).slice(0, 16).replace("T", " ")}{salesTvaUpdatedBy ? ` • ${salesTvaUpdatedBy}` : ""}</span>}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className={neutralBtn} onClick={() => setSalesTvaModalOpen(false)} type="button">Mégse</button>
              <button className={primaryBtn} onClick={saveSalesTvaSettings} disabled={salesTvaSettingsSaving || salesTvaSettingsLoading} type="button"><Save size={14} /> {salesTvaSettingsSaving ? "Mentés..." : "Központi beállítás mentése"}</button>
            </div>
          </div>
        </div>
      )}

      {moveTarget && detail && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/24 bg-[#404a5b] p-4 shadow-2xl">
            <h2 className="text-base text-white font-normal">Terméksor áthelyezése</h2>
            <p className="mt-2 text-sm text-white/76">
              A sima áthelyezés a cél receptiót Vázlat állapotba teszi. Az „Áthelyezés + készletre vétel” egyetlen biztonságos műveletben átteszi és rögtön készletre veszi a sort; ha bármi hibázik, az áthelyezés is visszavonódik.
            </p>
            <div className="mt-2 rounded-xl border border-white/12 bg-[#354153] p-2.5 text-xs text-white">
              {cell((moveTarget.normalized || {}).titleRo)} • {cell(moveTarget.supplier_product_code || (moveTarget.normalized || {}).supplierProductCode)} • S/N/COD: {cell((moveTarget as any).sn_cod || (moveTarget.normalized || {}).snCod || (moveTarget.normalized || {}).sn_cod)}
            </div>
            <label className={`${label} mt-3`}>
              Cél receptió
              <SmartSelect
                value={moveToReceptionId}
                onChange={setMoveToReceptionId}
                disabled={moveReceptionOptionsLoading}
                placeholder={moveReceptionOptionsLoading ? "Betöltés..." : "Válassz receptiót"}
                options={moveReceptionOptions.map((r) => {
                  const isCurrent = r.id === detail.item.id;
                  const currentStatus = String(r.status || "").toLowerCase();
                  const stateLabel = isCurrent
                    ? "Jelenlegi"
                    : currentStatus === "committed"
                      ? "Készletre véve • újranyílik"
                      : statusText(r.status);
                  return {
                    value: r.id,
                    disabled: isCurrent,
                    label: `${cell(r.invoice_number)} • ${cell(r.supplier_name)} • ${dateText(r.reception_date)} • ${stateLabel}`,
                  };
                })}
              />
            </label>
            <div className="mt-3 rounded-xl border border-amber-200/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-50">
              Ha csak áthelyezed, a „Vázlat” állapot a még nyitott sorral együtt a cél receptióra kerül. Mindkettő csak akkor lesz lezárt, amikor a sor készletre került vagy ki lett hagyva.
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className={neutralBtn} onClick={() => setMoveTarget(null)} disabled={busy} type="button"><X size={15} /> Mégse</button>
              <button
                className={neutralBtn}
                onClick={() => moveRowToReception(false)}
                disabled={busy || moveReceptionOptionsLoading || !moveToReceptionId}
                type="button"
                title="Csak áthelyezi a sort; a cél receptió Vázlat lesz."
              >
                <MoveRight size={15} /> Csak áthelyezés
              </button>
              <button
                className={primaryBtn}
                onClick={() => moveRowToReception(true)}
                disabled={busy || moveReceptionOptionsLoading || !moveToReceptionId}
                type="button"
                title="Áthelyezés és készletre vétel egy tranzakcióban. Hiba esetén semmi nem mozdul el."
              >
                <CheckCircle size={15} /> Áthelyezés + készletre vétel
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/24 bg-[#404a5b] p-4 shadow-2xl">
            <h2 className="text-base text-white font-normal">Receptió törlése</h2>
            <p className="mt-2 text-sm text-white/76">A törlés a receptióhoz tartozó mentett import sorokat is eltávolítja, ha még nem történt készletre vétel.</p>
            <div className="mt-2 rounded-xl border border-white/12 bg-[#354153] p-2.5 text-xs text-white">
              {cell(deleteTarget.invoice_number)} • {cell(deleteTarget.supplier_name)} • {money(deleteTarget.invoice_gross, deleteTarget.currency_code)}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={neutralBtn} onClick={() => setDeleteTarget(null)} disabled={busy} type="button"><X size={15} /> Mégse</button>
              <button className={dangerBtn} onClick={deleteReception} disabled={busy} type="button"><Trash2 size={15} /> Törlés</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
