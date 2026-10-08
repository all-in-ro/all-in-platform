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
  ChevronUp,
  CheckCircle,
  Eye,
  FileText,
  RefreshCw,
  Save,
  Search,
  Settings,
  MoveRight,
  MoreVertical,
  Trash2,
  X,
} from "lucide-react";
import {
  AifMeta,
  AifReceptionDetail,
  AifReceptionSummary,
  AifReceptionAvizSettings,
  apiAifCommitReceptionRows,
  apiAifDeleteReception,
  apiAifGetReception,
  apiAifGetReceptionAvizSettings,
  apiAifSaveReceptionAvizSettings,
  apiAifEnsureReceptionAvizNumber,
  apiAifIgnoreImportRow,
  apiAifListReceptions,
  apiAifMeta,
  apiAifMoveImportRow,
  apiAifUpdateReception,
  apiAifUpdateImportRow,
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
const RECEPTIONS_PDF_ICON_URL = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/PDF.png";
const DEFAULT_RECEPTION_AVIZ_SETTINGS: AifReceptionAvizSettings = {
  series: "AVZ",
  nextNumber: 1,
  digits: 6,
  includeYear: true,
  yearlyReset: true,
  sequenceYear: new Date().getFullYear(),
  previewNumber: `AVZ/${new Date().getFullYear()}/000001`,
  updatedAt: null,
  updatedBy: null,
};


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
const tinyIconBtn = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.08] text-white transition hover:bg-[#404a5b]/[0.12] disabled:cursor-not-allowed disabled:opacity-50";
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
const receptionGridHeader = "grid grid-cols-[30px_62px_minmax(300px,1.9fr)_82px_58px_126px_54px_112px_126px_96px] items-center gap-1.5 border-b border-white/10 bg-[#293448] px-2.5 py-2 text-[9px] uppercase tracking-[0.06em] text-white/72";
const receptionGridRow = "grid grid-cols-[30px_62px_minmax(300px,1.9fr)_82px_58px_126px_54px_112px_126px_96px] items-center gap-1.5 border-b border-white/[0.07] px-2.5 py-1.5 transition-colors";
const rowCompactInput = "h-8 w-full min-w-0 rounded-lg border border-transparent bg-white/[0.045] px-2 text-[11px] text-white caret-white outline-none transition placeholder:text-white/30 hover:bg-white/[0.065] focus:border-[#7bd7d4]/55 focus:bg-[#29374b] focus:ring-1 focus:ring-[#7bd7d4]/12 disabled:cursor-default disabled:bg-transparent disabled:text-white/72 disabled:opacity-100";
const rowCompactRead = "flex min-h-5 items-center justify-end px-1 text-[9px] leading-tight tabular-nums text-white/45";


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

function ReceptionActionsMenu({
  disabled = false,
  canDelete,
  onVerification,
  onPdf,
  onDelete,
}: {
  disabled?: boolean;
  canDelete: boolean;
  onVerification: () => void;
  onPdf: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    const node = triggerRef.current;
    if (!node || typeof window === "undefined") return;
    const rect = node.getBoundingClientRect();
    const edge = 8;
    const gap = 6;
    const width = 190;
    const estimatedHeight = 148;
    const left = Math.max(edge, Math.min(rect.right - width, window.innerWidth - width - edge));
    const roomBelow = window.innerHeight - rect.bottom;
    const openUpward = roomBelow < estimatedHeight + gap && rect.top > roomBelow;
    setPosition(openUpward
      ? { left, width, bottom: Math.max(edge, window.innerHeight - rect.top + gap) }
      : { left, width, top: rect.bottom + gap });
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

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="További műveletek"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
          open
            ? "border-[#8fe9e5]/55 bg-[#2a8d8b] text-white"
            : "border-white/16 bg-white/[0.08] text-white/78 hover:bg-[#465264]"
        } disabled:cursor-not-allowed disabled:opacity-45`}
        title="További műveletek"
      >
        <MoreVertical size={16} />
      </button>

      {open && position && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="overflow-hidden rounded-xl border border-[#7bd7d4]/42 bg-[#26364c] p-1.5 shadow-[0_18px_46px_rgba(2,6,23,0.64)] ring-1 ring-white/[0.04]"
          style={{ position: "fixed", zIndex: 930, left: position.left, width: position.width, top: position.top, bottom: position.bottom }}
        >
          <button type="button" role="menuitem" onClick={() => run(onVerification)} className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-white/90 transition hover:bg-[#415064]">
            <CheckCircle size={15} className="text-[#8fe9e5]" /> Ellenőrző
          </button>
          <button type="button" role="menuitem" onClick={() => run(onPdf)} className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-white/90 transition hover:bg-[#415064]">
            <FileText size={15} className="text-[#8fe9e5]" /> PDF
          </button>
          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            role="menuitem"
            disabled={!canDelete}
            onClick={() => run(onDelete)}
            className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs text-rose-100 transition hover:bg-rose-500/14 disabled:cursor-not-allowed disabled:opacity-35"
            title={canDelete ? "Receptió törlése" : "Ez a receptió már nem törölhető"}
          >
            <Trash2 size={15} /> Törlés
          </button>
        </div>,
        document.body,
      ) : null}
    </>
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

function supplierDisplayName(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  return raw
    .replace(/\s*-\s*Besz[aá]ll[ií]t[oó]\s*$/i, "")
    .replace(/\s*-\s*Forgalmaz[oó]\s*$/i, "")
    .trim() || raw;
}

function receptionNetInvoiceValue(item: any) {
  const gross = n(item?.invoice_gross);
  const rate = n(item?.tva_rate);
  const mode = String(item?.tva_mode || "no_tva").toLowerCase();
  if (gross <= 0 || rate <= 0 || mode === "no_tva") return gross;
  const factor = 1 + rate / 100;
  return factor > 0 ? gross / factor : gross;
}

function receptionSalesTotalRon(item: any) {
  return n(item?.sales_total_ron ?? item?.salesTotalRon);
}

function receptionValueRon(value: unknown, item: any) {
  const currency = String(item?.currency_code || "RON").toUpperCase();
  const rate = currency === "RON" ? 1 : (n(item?.exchange_rate_to_ron) || 1);
  return n(value) * rate;
}

function receptionStatusTextRo(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "draft") return "Ciornă";
  if (status === "parsed") return "Verificată";
  if (status === "needs_review") return "Necesită verificare";
  if (status === "review") return "În lucru";
  if (status === "committed") return "Recepționată";
  if (status === "ignored") return "Ignorată";
  if (status === "cancelled") return "Anulată";
  return value || "-";
}

type ReceptionReportFilters = {
  search?: string;
  supplier?: string;
  location?: string;
  currency?: string;
  status?: string;
  from?: string;
  to?: string;
};

function buildFilteredReceptionsReportHtml(
  reportItems: AifReceptionSummary[],
  filters: ReceptionReportFilters,
) {
  const rows = reportItems || [];
  const totalInvoices = rows.length;
  const totalLines = rows.reduce((sum, row) => sum + Number(row.line_count || 0), 0);
  const totalQty = rows.reduce((sum, row) => sum + Number(row.total_qty || 0), 0);
  const purchaseNetRon = rows.reduce((sum, row) => sum + receptionValueRon(receptionNetInvoiceValue(row), row), 0);
  const purchaseGrossRon = rows.reduce((sum, row) => sum + receptionValueRon(row.invoice_gross, row), 0);
  const salesGrossRon = rows.reduce((sum, row) => sum + receptionSalesTotalRon(row), 0);
  const generatedAt = new Date().toLocaleString("ro-RO");
  const periodLabel = filters.from || filters.to
    ? `${filters.from || "…"} – ${filters.to || "…"}`
    : "Toată perioada";

  const filterChips = [
    ["Perioadă", periodLabel],
    ["Furnizor", filters.supplier || "Toți furnizorii"],
    ["Gestiune", filters.location || "Toate gestiunile"],
    ["Monedă", filters.currency || "Toate monedele"],
    ["Stare", filters.status || "Toate stările"],
    ...(filters.search ? [["Căutare", filters.search]] : []),
  ].map(([labelText, value]) => `
    <div class="filterBox">
      <span>${pdfEscape(labelText)}</span>
      <strong>${pdfEscape(value)}</strong>
    </div>`).join("");

  const tableRows = rows.map((row, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td class="invoice">${pdfEscape(cell(row.invoice_number))}</td>
      <td>${pdfEscape(supplierDisplayName(row.supplier_name))}</td>
      <td>${pdfEscape(cell(row.location_name))}</td>
      <td class="center">${pdfEscape(dateText(row.reception_date))}</td>
      <td class="center">${pdfEscape(cell(row.currency_code))}</td>
      <td class="money">${pdfEscape(money(receptionNetInvoiceValue(row), row.currency_code))}</td>
      <td class="money">${pdfEscape(money(row.invoice_gross, row.currency_code))}</td>
      <td class="money sales">${pdfEscape(money(receptionSalesTotalRon(row), "RON"))}</td>
      <td class="qty">${pdfNumber(row.total_qty || 0, 0)}</td>
      <td class="center">${pdfEscape(receptionStatusTextRo(row.status))}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <title>Raport receptii</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #172033; font-family: Arial, Helvetica, sans-serif; font-size: 9px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .screen-actions { display: flex; gap: 8px; margin-bottom: 8px; }
    .screen-actions button { border: 1px solid #173f39; border-radius: 6px; background: #173f39; color: #fff; padding: 7px 11px; cursor: pointer; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10mm; padding-bottom: 4mm; border-bottom: 2px solid #255f54; }
    .company { color: #183d36; font-size: 16px; font-weight: 700; letter-spacing: .04em; }
    .muted { color: #687582; font-size: 8px; }
    h1 { margin: 1.5mm 0 0; font-size: 19px; letter-spacing: .035em; }
    .generated { text-align: right; color: #687582; font-size: 8px; line-height: 1.5; }
    .filters { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 2mm; margin-top: 4mm; }
    .filterBox { min-width: 0; border: 1px solid #d7e0de; border-radius: 2mm; background: #f6f9f8; padding: 2mm 2.3mm; }
    .filterBox span { display: block; color: #78848e; font-size: 6.5px; text-transform: uppercase; letter-spacing: .08em; }
    .filterBox strong { display: block; margin-top: .7mm; font-size: 8.5px; overflow-wrap: anywhere; }
    .summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2mm; margin-top: 3mm; }
    .summaryCard { border: 1px solid #cfd9d7; border-radius: 2.2mm; padding: 2.2mm; background: #fff; }
    .summaryCard.sales { border-color: #75c9c3; background: #edfafa; }
    .summaryCard span { display: block; color: #6b7783; font-size: 6.7px; text-transform: uppercase; letter-spacing: .07em; }
    .summaryCard strong { display: block; margin-top: .9mm; color: #183d36; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 4mm; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th { background: #26384b; color: #fff; padding: 2.1mm 1.3mm; border: 1px solid #26384b; font-size: 6.9px; text-transform: uppercase; letter-spacing: .035em; }
    td { border: 1px solid #d7dfe2; padding: 1.7mm 1.3mm; font-size: 7.8px; vertical-align: middle; overflow-wrap: anywhere; }
    tbody tr:nth-child(even) td { background: #f8fafb; }
    th:nth-child(1), td:nth-child(1) { width: 5mm; }
    th:nth-child(2), td:nth-child(2) { width: 28mm; }
    th:nth-child(3), td:nth-child(3) { width: 24mm; }
    th:nth-child(4), td:nth-child(4) { width: 22mm; }
    th:nth-child(5), td:nth-child(5) { width: 20mm; }
    th:nth-child(6), td:nth-child(6) { width: 14mm; }
    th:nth-child(7), td:nth-child(7) { width: 28mm; }
    th:nth-child(8), td:nth-child(8) { width: 28mm; }
    th:nth-child(9), td:nth-child(9) { width: 31mm; }
    th:nth-child(10), td:nth-child(10) { width: 12mm; }
    th:nth-child(11), td:nth-child(11) { width: 28mm; }
    .center { text-align: center; }
    .money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .money.sales { color: #0f625b; font-weight: 700; }
    .qty { text-align: center; font-weight: 700; }
    .invoice { font-weight: 700; }
    .footerTotals td { background: #edf4f2; border-top: 2px solid #255f54; font-weight: 700; }
    .footerTotals .salesTotal { background: #255f54; color: #fff; }
    .footer { display: flex; justify-content: space-between; gap: 10mm; margin-top: 4mm; padding-top: 2mm; border-top: 1px solid #d8e0de; color: #78848e; font-size: 7px; }
    @media print { .screen-actions { display: none; } }
  </style>
</head>
<body>
  <div class="screen-actions">
    <button onclick="window.print()">Tipărire / Salvare PDF</button>
    <button onclick="window.close()">Închide</button>
  </div>

  <div class="header">
    <div>
      <div class="company">TITAN EURO-COM SRL</div>
      <div class="muted">AllInFashion • raport intern de recepții și achiziții</div>
      <h1>RAPORT RECEPȚII / ACHIZIȚII</h1>
    </div>
    <div class="generated">
      <div>Generat: ${pdfEscape(generatedAt)}</div>
      <div>${totalInvoices} facturi • ${totalQty} buc.</div>
    </div>
  </div>

  <div class="filters">${filterChips}</div>

  <div class="summary">
    <div class="summaryCard"><span>Facturi</span><strong>${pdfNumber(totalInvoices, 0)}</strong></div>
    <div class="summaryCard"><span>Linii produse</span><strong>${pdfNumber(totalLines, 0)}</strong></div>
    <div class="summaryCard"><span>Cantitate totală</span><strong>${pdfNumber(totalQty, 0)} buc.</strong></div>
    <div class="summaryCard"><span>Achiziție netă</span><strong>${pdfNumber(purchaseNetRon)} RON</strong></div>
    <div class="summaryCard"><span>Achiziție brută</span><strong>${pdfNumber(purchaseGrossRon)} RON</strong></div>
    <div class="summaryCard sales"><span>Valoare vânzare brută</span><strong>${pdfNumber(salesGrossRon)} RON</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Factura</th>
        <th>Furnizor</th>
        <th>Gestiune</th>
        <th>Data</th>
        <th>Monedă</th>
        <th>Valoare netă</th>
        <th>Total factură</th>
        <th>Valoare vânzare</th>
        <th>Buc.</th>
        <th>Stare</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || `<tr><td colspan="11" style="padding:16px;text-align:center;">Nu există recepții pentru filtrele selectate.</td></tr>`}
    </tbody>
    <tfoot>
      <tr class="footerTotals">
        <td colspan="8">TOTAL FILTRAT</td>
        <td class="money salesTotal">${pdfNumber(salesGrossRon)} RON</td>
        <td class="qty">${pdfNumber(totalQty, 0)}</td>
        <td>${pdfNumber(totalInvoices, 0)} facturi</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <span>Filtrele din AllInFashion sunt aplicate direct raportului.</span>
    <span>Valorile de achiziție din sumar sunt convertite în RON cu cursul salvat pe fiecare recepție.</span>
  </div>
</body>
</html>`;
}

function receptionLookupKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function receptionRowColorCode(row: any, draft: any) {
  return String(
    draft?.colorCode || draft?.color_code || draft?.supplierColorCode || draft?.supplier_color_code ||
    row?.supplier_color_code || row?.normalized?.colorCode || row?.normalized?.color_code ||
    row?.normalized?.supplierColorCode || row?.normalized?.supplier_color_code || ""
  ).trim();
}

function receptionRawColorName(row: any) {
  const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
  const wanted = new Set(["color", "colour", "culoare", "szin", "szin_nev", "color_name", "colour_name", "denumire_culoare"]);
  for (const [key, value] of Object.entries(raw)) {
    if (!wanted.has(receptionLookupKey(key))) continue;
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function receptionResolvedColorName(row: any, draft: any, meta?: AifMeta | null) {
  const directCandidates = [
    draft?.colorName, draft?.color_name, draft?.supplierColorName, draft?.supplier_color_name,
    row?.normalized?.colorName, row?.normalized?.color_name,
    row?.normalized?.supplierColorName, row?.normalized?.supplier_color_name,
    receptionRawColorName(row),
  ];
  for (const candidate of directCandidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }

  const colorCode = receptionRowColorCode(row, draft);
  if (!colorCode || !meta) return "";
  const colorKey = receptionLookupKey(colorCode);

  const brandKeys = new Set(
    [
      draft?.brandId, draft?.brand_id, draft?.brandCode, draft?.brand_code, draft?.brandName, draft?.brand_name,
      row?.normalized?.brandId, row?.normalized?.brand_id, row?.normalized?.brandCode, row?.normalized?.brand_code,
      row?.normalized?.brandName, row?.normalized?.brand_name,
    ]
      .map(receptionLookupKey)
      .filter(Boolean)
  );

  const mappings: any[] = ((meta as any)?.brandColorCodes || []).filter((mapping: any) =>
    receptionLookupKey(mapping?.color_code ?? mapping?.colorCode) === colorKey
  );

  const mappingName = (mapping: any) => String(
    mapping?.color_name_hu ?? mapping?.colorNameHu ??
    mapping?.color_name_ro ?? mapping?.colorNameRo ??
    mapping?.color_name_en ?? mapping?.colorNameEn ??
    mapping?.color_name ?? mapping?.colorName ?? ""
  ).trim();

  if (brandKeys.size) {
    const exact = mappings.find((mapping: any) => {
      const keys = [mapping?.brand_id, mapping?.brandId, mapping?.brand_code, mapping?.brandCode, mapping?.brand_name, mapping?.brandName]
        .map(receptionLookupKey)
        .filter(Boolean);
      return keys.some((key: string) => brandKeys.has(key));
    });
    const name = exact ? mappingName(exact) : "";
    if (name) return name;
  }

  const uniqueNames = Array.from(new Set(mappings.map(mappingName).filter(Boolean)));
  if (uniqueNames.length === 1) return uniqueNames[0];

  const colorType = ((meta as any)?.colorTypes || []).find((item: any) =>
    receptionLookupKey(item?.code) === colorKey
  );
  return String(
    colorType?.name_hu ?? colorType?.nameHu ?? colorType?.name_ro ?? colorType?.nameRo ?? colorType?.name ?? ""
  ).trim();
}


function receptionColorSwatch(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "#64748b";
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
  const key = receptionLookupKey(raw);
  const palette: Record<string, string> = {
    negru: "#111827", fekete: "#111827", black: "#111827",
    alb: "#f8fafc", alba: "#f8fafc", feher: "#f8fafc", white: "#f8fafc",
    rosu: "#ef4444", rosie: "#ef4444", piros: "#ef4444", red: "#ef4444",
    albastru: "#3b82f6", kek: "#3b82f6", blue: "#3b82f6",
    verde: "#22c55e", zold: "#22c55e", green: "#22c55e",
    galben: "#facc15", sarga: "#facc15", yellow: "#facc15",
    portocaliu: "#f97316", narancs: "#f97316", orange: "#f97316",
    mov: "#8b5cf6", violet: "#8b5cf6", purple: "#8b5cf6", lila: "#8b5cf6",
    roz: "#ec4899", pink: "#ec4899",
    gri: "#94a3b8", szurke: "#94a3b8", gray: "#94a3b8", grey: "#94a3b8",
    maro: "#92400e", barna: "#92400e", brown: "#92400e",
    bej: "#d6c5a1", beige: "#d6c5a1",
    bleumarin: "#172554", navy: "#172554",
    turcoaz: "#14b8a6", turquoise: "#14b8a6",
    auriu: "#d4af37", gold: "#d4af37",
    argintiu: "#cbd5e1", silver: "#cbd5e1",
    antracit: "#374151", anthracite: "#374151",
    denim: "#496a9b",
  };
  if (palette[key]) return palette[key];
  for (const [name, color] of Object.entries(palette)) {
    if (key.includes(name)) return color;
  }
  return "#64748b";
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

function receptionStatusBadgeClass(s?: string | null) {
  const v = String(s || "").toLowerCase();
  if (v === "committed") {
    return "border-[#9be9e5]/55 bg-[#2a8d8b] text-white shadow-[0_6px_16px_rgba(42,141,139,0.22)]";
  }
  if (v === "needs_review") {
    return "border-amber-200/35 bg-amber-500/14 text-amber-50";
  }
  if (v === "cancelled") {
    return "border-rose-200/35 bg-rose-500/14 text-rose-50";
  }
  return "border-white/14 bg-white/[0.06] text-white/78";
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

function receptionRowMoveMeta(row: any, drafts: Record<string, Record<string, unknown>>) {
  const draft: any = drafts[row?.id] || row?.normalized || {};
  const move = draft?.receptionMove || row?.normalized?.receptionMove;
  return move && typeof move === "object" ? move : null;
}

function receptionFinancialsFromEnteredAmount(amount: unknown, mode: unknown, rateValue: unknown) {
  const entered = n(amount);
  const modeValue = String(mode || "no_tva");
  const rate = Math.max(0, n(rateValue));
  if (modeValue === "without_tva") {
    const net = entered;
    const vat = net * (rate / 100);
    return { entered, net, vat, gross: net + vat };
  }
  if (modeValue === "with_tva") {
    const gross = entered;
    const factor = 1 + rate / 100;
    const net = factor > 0 ? gross / factor : gross;
    return { entered, net, vat: gross - net, gross };
  }
  return { entered, net: entered, vat: 0, gross: entered };
}

function receptionBalance(
  item: any,
  rows: any[],
  drafts: Record<string, Record<string, unknown>>,
  headerDraft?: Record<string, string>,
) {
  const shipping = n(headerDraft?.shippingCost ?? item?.shipping_cost);
  const tvaRate = n(headerDraft?.tvaRate ?? item?.tva_rate);
  const tvaMode = String(headerDraft?.tvaMode ?? item?.tva_mode ?? "no_tva");
  const fallbackEnteredAmount = tvaMode === "without_tva"
    ? (item?.invoice_net ?? item?.invoice_gross)
    : (item?.invoice_gross ?? item?.invoice_net);
  const enteredInvoiceAmount = n(headerDraft?.invoiceGross ?? fallbackEnteredAmount);
  const invoiceFinancials = receptionFinancialsFromEnteredAmount(enteredInvoiceAmount, tvaMode, tvaRate);

  let rowsValue = 0;
  let movedRowsValue = 0;
  let movedRowsCount = 0;
  let movedQty = 0;
  for (const row of rows || []) {
    const value = rowDraftValue(row, drafts);
    rowsValue += value;
    if (row?.status !== "ignored" && receptionRowMoveMeta(row, drafts)) {
      movedRowsValue += value;
      movedRowsCount += 1;
      const draft: any = drafts[row.id] || row.normalized || {};
      movedQty += n(draft?.qty ?? row?.qty ?? row?.normalized?.qty);
    }
  }

  const originalRowsValue = rowsValue - movedRowsValue;
  const comparableRowsValue = originalRowsValue + shipping;
  const invoiceComparableValue = tvaMode === "without_tva" ? invoiceFinancials.net : invoiceFinancials.gross;
  const diff = invoiceComparableValue - comparableRowsValue;
  const absDiff = Math.abs(diff);
  const isOk = absDiff < 0.01;
  const isSmallDifference = !isOk && absDiff <= 1;
  const isMissing = diff > 0;
  const status = isOk ? "Egyezik" : isSmallDifference ? "Kis eltérés" : isMissing ? "Hiányzik a sorokból" : "Túllépés";
  const badgeClassName = isOk
    ? "border-[#69d7d0]/40 bg-[#2a8d8b]/20 text-[#eaffff]"
    : isSmallDifference
      ? "border-amber-200/36 bg-amber-400/12 text-amber-50"
      : "border-rose-200/34 bg-rose-500/14 text-rose-50";
  const ledClassName = isOk
    ? "bg-[#54d5ca] shadow-[0_0_10px_rgba(84,213,202,0.72)]"
    : isSmallDifference
      ? "bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.72)]"
      : "bg-rose-400 shadow-[0_0_12px_rgba(248,113,113,0.85)]";
  const invoiceAmountLabel = tvaMode === "without_tva"
    ? "Számla nettó"
    : tvaMode === "with_tva"
      ? "Számla bruttó"
      : "Számla összege";

  return {
    enteredInvoiceAmount,
    invoiceAmountLabel,
    invoiceNet: invoiceFinancials.net,
    invoiceVat: invoiceFinancials.vat,
    invoiceGross: invoiceFinancials.gross,
    rowsValue,
    originalRowsValue,
    movedRowsValue,
    movedRowsCount,
    movedQty,
    comparableRowsValue,
    shipping,
    tvaRate,
    tvaMode,
    tvaValue: invoiceFinancials.vat,
    diff,
    absDiff,
    status,
    isOk,
    isSmallDifference,
    isMissing,
    badgeClassName,
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
  const avizNumber = String(item.aviz_number || item.avizNumber || "").trim() || "-";
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
    .meta { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 10px; }
    .box { border: 1px solid #9ca3af; border-radius: 4px; padding: 5px 6px; min-height: 34px; }
    .box .label { color: #6b7280; text-transform: uppercase; font-size: 8px; letter-spacing: .05em; margin-bottom: 2px; }
    .box .value { font-size: 10px; }
    .box .value.uit { font-weight: 700; letter-spacing: .035em; overflow-wrap: anywhere; }
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
        <div class="nr">Aviz: ${pdfEscape(avizNumber)}</div>
        <div>Data recepției: ${pdfEscape(pdfDate(item.reception_date) || today)}</div>
      </div>
    </div>

    <div class="meta">
      <div class="box"><div class="label">Furnizor</div><div class="value">${pdfEscape(item.supplier_name || "-")}</div></div>
      <div class="box"><div class="label">Factura</div><div class="value">${pdfEscape(item.invoice_number || "-")}</div></div>
      <div class="box"><div class="label">Aviz</div><div class="value">${pdfEscape(avizNumber)}</div></div>
      <div class="box"><div class="label">Cod UIT</div><div class="value uit">${pdfEscape(item.uit_code || item.uitCode || "-")}</div></div>
      <div class="box"><div class="label">Data factura</div><div class="value">${pdfEscape(pdfDate(item.invoice_date))}</div></div>
      <div class="box"><div class="label">Data recepției</div><div class="value">${pdfEscape(pdfDate(item.reception_date) || today)}</div></div>
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

function checkRowData(
  row: any,
  draft: any,
  salesSettings: SalesTvaSettings = DEFAULT_SALES_TVA_SETTINGS,
) {
  const qty = n(draft.qty ?? row?.qty ?? row?.normalized?.qty);
  const enteredSellPrice = rowSellEnteredPriceRon(row, draft);
  const sellPriceRon = enteredSellPrice > 0 ? rowSellGrossPriceRon(row, draft, salesSettings) : null;
  const lineValueRon = sellPriceRon === null ? null : qty * sellPriceRon;
  const imageUrl = String(
    draft.imageUrl ||
    draft.image_url ||
    row?.normalized?.imageUrl ||
    row?.normalized?.image_url ||
    ""
  ).trim();

  return {
    code: rowSku(row, draft),
    barcode: cell(receptionRowBarcode(row)),
    title: cell(draft.titleRo || draft.productName || row?.normalized?.titleRo || row?.supplier_product_code),
    brand: cell(draft.brandName || draft.brandCode || row?.normalized?.brandName || row?.normalized?.brandCode),
    color: cell(draft.colorName || row?.normalized?.colorName || row?.supplier_color_code),
    size: cell(row?.supplier_size || draft.size || row?.normalized?.size),
    qty,
    imageUrl,
    sellPriceRon,
    lineValueRon,
  };
}

function buildReceptionVerificationHtml(
  detail: AifReceptionDetail,
  drafts: Record<string, Record<string, unknown>> = {},
  salesSettings: SalesTvaSettings = DEFAULT_SALES_TVA_SETTINGS,
) {
  const item: any = detail.item || {};
  const rows = (detail.rows || []).filter((row: any) => row.status !== "ignored");
  const salesTva = normalizeSalesTvaSettings(salesSettings);
  const title = `Fisa verificare marfa ${item.invoice_number || item.id || ""}`;
  const today = new Date().toLocaleDateString("ro-RO");
  const avizNumber = String(item.aviz_number || item.avizNumber || "").trim() || "-";

  const preparedRows = rows.map((row: any, index: number) => {
    const draft = rowDraft(row, drafts);
    return { index, row, draft, data: checkRowData(row, draft, salesTva) };
  });

  const totalQty = preparedRows.reduce((sum, itemRow) => sum + itemRow.data.qty, 0);
  const totalValueRon = preparedRows.reduce(
    (sum, itemRow) => sum + (itemRow.data.lineValueRon ?? 0),
    0,
  );
  const missingPrices = preparedRows.filter((itemRow) => itemRow.data.sellPriceRon === null).length;

  const lines = preparedRows.map(({ index, data }) => {
    const image = data.imageUrl
      ? `<img class="img" src="${pdfEscape(data.imageUrl)}" alt="" />`
      : `<div class="img empty">Fără foto</div>`;

    const unitPrice = data.sellPriceRon === null ? "-" : pdfNumber(data.sellPriceRon);
    const lineValue = data.lineValueRon === null ? "-" : pdfNumber(data.lineValueRon);

    return `
      <tr>
        <td class="center">${index + 1}</td>
        <td>
          <div class="product">
            ${image}
            <div class="productInfo">
              <strong>${pdfEscape(data.title)}</strong>
              <div class="productMeta">
                <div class="productMetaRow">
                  <span><b>Marcă:</b> ${pdfEscape(data.brand)}</span>
                  <span><b>Culoare:</b> ${pdfEscape(data.color)}</span>
                </div>
                <div class="productMetaSize"><span><b>Mărime:</b> ${pdfEscape(data.size)}</span></div>
              </div>
            </div>
          </div>
        </td>
        <td class="code codeEmphasis">${pdfEscape(data.code)}</td>
        <td class="code codeEmphasis">${pdfEscape(data.barcode)}</td>
        <td class="center">buc.</td>
        <td class="qty">${pdfNumber(data.qty, 0)}</td>
        <td class="checkCell"><span class="checkBox" aria-hidden="true"></span></td>
        <td class="money">${unitPrice}</td>
        <td class="money value">${lineValue}</td>
      </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <title>${pdfEscape(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; max-width: 100%; margin: 0; padding: 0; background: #fff; color: #172033; overflow: visible; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    .screen-actions { margin: 0 0 8px; display: flex; gap: 8px; }
    .screen-actions button { border: 1px solid #172033; background: #172033; color: #fff; border-radius: 6px; padding: 7px 10px; cursor: pointer; }

    .top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(74mm, .95fr);
      gap: 8mm;
      align-items: start;
      padding-bottom: 4.5mm;
      border-bottom: 2px solid #255f54;
    }
    .company { color: #183d36; font-size: 17px; font-weight: 700; letter-spacing: .03em; }
    .staffTag { margin-top: 2.5mm; color: #667382; font-size: 9px; line-height: 1.4; }

    .docBox { border: 1px solid #b9c7c4; border-radius: 3mm; overflow: hidden; }
    .docBox h3 { margin: 0; padding: 2.2mm 3mm; background: #255f54; color: #fff; font-size: 9px; letter-spacing: .09em; text-transform: uppercase; }
    .docBoxBody { padding: 2.4mm 3mm; background: #f5f8f7; }
    .docLine { display: flex; justify-content: space-between; gap: 5mm; padding: 1.1mm 0; border-bottom: 1px solid #d8e0de; }
    .docLine:last-child { border-bottom: 0; }
    .docLine span { color: #667382; }
    .docLine strong { max-width: 48mm; text-align: right; color: #172033; overflow-wrap: anywhere; }

    .title { padding: 4.5mm 0 2.8mm; text-align: center; }
    .eyebrow { color: #255f54; font-size: 8.5px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; }
    h1 { margin: 1.3mm 0 0; font-size: 19px; line-height: 1.15; letter-spacing: .02em; }
    .subtitle { margin-top: 1.5mm; color: #526070; font-size: 9px; }

    .flowSection { margin-top: 2.5mm; border: 1px solid #d8e1e5; border-radius: 2.5mm; overflow: hidden; }
    .flowHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 5mm;
      padding: 2.4mm 3mm;
      background: #ecfdf9;
      border-top: 3px solid #14b8a6;
      border-bottom: 1px solid #d8e1e5;
      color: #0f5f59;
    }
    .flowHeader div { display: grid; gap: .7mm; }
    .flowHeader strong { font-size: 10px; letter-spacing: .09em; }
    .flowHeader span { font-size: 7.5px; color: #52716d; }
    .flowHeader b { font-size: 9px; white-space: nowrap; }

    table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th {
      background: #26384b;
      color: #fff;
      border: 1px solid #26384b;
      padding: 2.2mm 1.4mm;
      font-size: 7.7px;
      line-height: 1.2;
      text-transform: uppercase;
      text-align: left;
    }
    td {
      border: 1px solid #d4dcdf;
      padding: 1.7mm 1.4mm;
      font-size: 8.7px;
      line-height: 1.25;
      vertical-align: middle;
      overflow-wrap: anywhere;
    }
    tbody tr:nth-child(even) td { background: #f8fafb; }

    th:nth-child(1), td:nth-child(1) { width: 6mm; }
    th:nth-child(2), td:nth-child(2) { width: 58mm; }
    th:nth-child(3), td:nth-child(3) { width: 20mm; }
    th:nth-child(4), td:nth-child(4) { width: 24mm; }
    th:nth-child(5), td:nth-child(5) { width: 8mm; }
    th:nth-child(6), td:nth-child(6) { width: 9mm; }
    th:nth-child(7), td:nth-child(7) { width: 17mm; }
    th:nth-child(8), td:nth-child(8) { width: 19mm; }
    th:nth-child(9), td:nth-child(9) { width: 23mm; }

    thead th:nth-child(1),
    thead th:nth-child(3),
    thead th:nth-child(4),
    thead th:nth-child(5),
    thead th:nth-child(6),
    thead th:nth-child(7),
    thead th:nth-child(8),
    thead th:nth-child(9) { text-align: center; }

    .codeHeader { font-size: 8px; font-weight: 700; letter-spacing: .025em; }
    .center { text-align: center; }
    .qty { text-align: center; font-size: 11px; font-weight: 700; color: #255f54; }
    .code { font-family: "Courier New", monospace; font-size: 8.15px; line-height: 1.25; overflow-wrap: anywhere; }
    .codeEmphasis { text-align: center; font-weight: 700; color: #172033; letter-spacing: .01em; }
    .checkCell { text-align: center; }
    .checkBox { display: inline-block; width: 6.2mm; height: 6.2mm; border: 1.4px solid #334155; border-radius: 1.2mm; background: #fff; vertical-align: middle; }
    .money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .value { font-weight: 700; color: #183d36; }

    .product { display: flex; align-items: center; gap: 2mm; min-width: 0; }
    .productInfo { min-width: 0; flex: 1; }
    .product strong { display: block; font-size: 9.3px; line-height: 1.22; color: #172033; }
    .productMeta { margin-top: 1mm; color: #435164; font-size: 7.8px; line-height: 1.28; }
    .productMetaRow { display: flex; flex-wrap: wrap; gap: .35mm 1.8mm; }
    .productMetaSize { margin-top: .55mm; }
    .productMeta span { white-space: nowrap; }
    .productMeta b { color: #1f3d37; font-weight: 700; }
    .img { width: 9mm; height: 11mm; flex: 0 0 auto; object-fit: contain; border: 1px solid #d4dcdf; border-radius: 1.5mm; background: #fff; }
    .img.empty { display: flex; align-items: center; justify-content: center; padding: 1mm; color: #9aa4ae; font-size: 5.5px; text-align: center; }

    tfoot td { background: #eef4f2; border-color: #b9c7c4; font-weight: 700; }
    tfoot .totalLabel { text-align: right; color: #183d36; letter-spacing: .08em; }
    tfoot .totalValue { background: #255f54; color: #fff; font-size: 11px; }

    .signoff {
      display: grid;
      grid-template-columns: 1.4fr .7fr;
      gap: 7mm;
      margin-top: 10mm;
      break-inside: avoid;
    }
    .signBox { border-top: 1px solid #667382; padding-top: 1.5mm; color: #667382; font-size: 8px; }
    .signBox strong { color: #255f54; }

    .footer {
      display: flex;
      justify-content: space-between;
      gap: 8mm;
      margin-top: 5mm;
      padding-top: 2.5mm;
      border-top: 1px solid #d7dfdd;
      color: #7b8793;
      font-size: 7.2px;
    }
    .valuationNote { margin-top: 1.5mm; color: #8a5b00; font-size: 7.5px; text-align: right; }

    @media print {
      .screen-actions { display: none; }
      body { width: auto; max-width: none; }
      .flowSection { overflow: visible; }
      table { width: 100% !important; max-width: 100% !important; }
    }
  </style>
</head>
<body>
  <div class="screen-actions">
    <button onclick="window.print()">Tipărire / Salvare PDF</button>
    <button onclick="window.close()">Închide</button>
  </div>

  <div class="top">
    <div>
      <div class="company">TITAN EURO-COM SRL</div>
      <div class="staffTag">Fișă internă pentru verificarea mărfii primite în gestiune.</div>
    </div>
    <div class="docBox">
      <h3>Datele verificării</h3>
      <div class="docBoxBody">
        <div class="docLine"><span>Furnizor</span><strong>${pdfEscape(item.supplier_name || "-")}</strong></div>
        <div class="docLine"><span>Factura</span><strong>${pdfEscape(item.invoice_number || "-")}</strong></div>
        <div class="docLine"><span>Aviz</span><strong>${pdfEscape(avizNumber)}</strong></div>
        <div class="docLine"><span>Data facturii</span><strong>${pdfEscape(pdfDate(item.invoice_date))}</strong></div>
        <div class="docLine"><span>Data recepției</span><strong>${pdfEscape(pdfDate(item.reception_date) || today)}</strong></div>
        <div class="docLine"><span>Gestiune</span><strong>${pdfEscape(item.location_name || "-")}</strong></div>
      </div>
    </div>
  </div>

  <div class="title">
    <div class="eyebrow">Verificare internă marfă</div>
    <h1>NOTA DE RECEPȚIE ȘI VERIFICARE MARFĂ</h1>
    <div class="subtitle">Cantități și prețuri de vânzare • TVA ${pdfEscape(salesTvaShort(salesTva))}</div>
  </div>

  <section class="flowSection">
    <div class="flowHeader">
      <div>
        <strong>PRODUSE DE VERIFICAT</strong>
        <span>Bifează „Verificat” după controlul fizic al fiecărui produs.</span>
      </div>
      <b>${pdfNumber(totalQty, 0)} buc. · ${pdfNumber(totalValueRon)} RON</b>
    </div>

    <table>
      <thead>
        <tr>
          <th>Nr. crt.</th>
          <th>Denumirea produsului / varianta</th>
          <th class="codeHeader">Cod produs</th>
          <th class="codeHeader">Cod de bare</th>
          <th>U.M.</th>
          <th>Cant.</th>
          <th>Verificat</th>
          <th>P.U. RON</th>
          <th>Valoare RON</th>
        </tr>
      </thead>
      <tbody>
        ${lines || `<tr><td colspan="9" style="text-align:center;padding:18px;">Nu există produse de verificat.</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="totalLabel">TOTAL</td>
          <td class="qty">${pdfNumber(totalQty, 0)}</td>
          <td></td>
          <td></td>
          <td class="money totalValue">${pdfNumber(totalValueRon)}</td>
        </tr>
      </tfoot>
    </table>
  </section>

  ${missingPrices ? `<div class="valuationNote">Atenție: ${missingPrices} poziții nu au preț de vânzare disponibil; totalul valoric include numai pozițiile evaluate.</div>` : ""}

  <div class="signoff">
    <div class="signBox"><strong>Verificat de:</strong> ____________________________________________</div>
    <div class="signBox"><strong>Data:</strong> __________________</div>
  </div>

  <div class="footer">
    <span>AllInFashion • fișă internă magazin</span>
    <span>${pdfEscape(item.invoice_number || "-")} • ${pdfEscape(pdfDate(item.reception_date) || today)}</span>
  </div>
</body>
</html>`;
}

function openReceptionVerificationPdf(
  detail: AifReceptionDetail,
  drafts: Record<string, Record<string, unknown>> = {},
  salesSettings: SalesTvaSettings = DEFAULT_SALES_TVA_SETTINGS,
) {
  const fileName = `verificare_marfa_${fileSafe((detail.item as any)?.invoice_number || (detail.item as any)?.id)}.pdf`;
  const html = buildReceptionVerificationHtml(detail, drafts, salesSettings).replace(
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
  const [rowNumberDescending, setRowNumberDescending] = useState(true);
  const [receptionListNumberDescending, setReceptionListNumberDescending] = useState(true);
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
  const [rowColorResolutionActionError, setRowColorResolutionActionError] = useState("");
  const [rowColorChoice, setRowColorChoice] = useState<'keep_existing' | 'use_incoming' | null>(null);

  const closeRowErrorModal = useCallback(() => {
    setRowErrorTarget(null);
    setRowColorResolution(null);
    setRowColorChoice(null);
    setRowColorResolutionActionError("");
    setRowColorResolutionLoading(false);
  }, []);

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
  const [avizSettings, setAvizSettings] = useState<AifReceptionAvizSettings>(DEFAULT_RECEPTION_AVIZ_SETTINGS);
  const [avizSettingsOpen, setAvizSettingsOpen] = useState(false);
  const [avizSettingsLoading, setAvizSettingsLoading] = useState(false);
  const [avizSettingsSaving, setAvizSettingsSaving] = useState(false);
  const [avizSeries, setAvizSeries] = useState(DEFAULT_RECEPTION_AVIZ_SETTINGS.series);
  const [avizNextNumber, setAvizNextNumber] = useState(String(DEFAULT_RECEPTION_AVIZ_SETTINGS.nextNumber));
  const [avizDigits, setAvizDigits] = useState(String(DEFAULT_RECEPTION_AVIZ_SETTINGS.digits));
  const [avizIncludeYear, setAvizIncludeYear] = useState(DEFAULT_RECEPTION_AVIZ_SETTINGS.includeYear);
  const [avizYearlyReset, setAvizYearlyReset] = useState(DEFAULT_RECEPTION_AVIZ_SETTINGS.yearlyReset);


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

  function applyAvizSettings(settings?: AifReceptionAvizSettings | null) {
    const next = settings || DEFAULT_RECEPTION_AVIZ_SETTINGS;
    setAvizSettings(next);
    setAvizSeries(String(next.series || "AVZ"));
    setAvizNextNumber(String(next.nextNumber || 1));
    setAvizDigits(String(next.digits || 6));
    setAvizIncludeYear(next.includeYear !== false);
    setAvizYearlyReset(next.yearlyReset !== false);
  }

  async function loadAvizSettings() {
    setAvizSettingsLoading(true);
    try {
      const result = await apiAifGetReceptionAvizSettings();
      applyAvizSettings(result.settings || result.item || DEFAULT_RECEPTION_AVIZ_SETTINGS);
    } catch {
      applyAvizSettings(DEFAULT_RECEPTION_AVIZ_SETTINGS);
    } finally {
      setAvizSettingsLoading(false);
    }
  }

  async function saveAvizSettings() {
    if (avizSettingsSaving) return;
    setAvizSettingsSaving(true);
    setMessage("");
    try {
      const result = await apiAifSaveReceptionAvizSettings({
        series: avizSeries,
        nextNumber: Math.max(1, Number.parseInt(avizNextNumber || "1", 10) || 1),
        digits: Math.min(10, Math.max(3, Number.parseInt(avizDigits || "6", 10) || 6)),
        includeYear: avizIncludeYear,
        yearlyReset: avizYearlyReset,
        sequenceYear: avizSettings.sequenceYear || new Date().getFullYear(),
      });
      applyAvizSettings(result.settings || result.item || DEFAULT_RECEPTION_AVIZ_SETTINGS);
      setAvizSettingsOpen(false);
      setMessage("Aviz számozás beállításai mentve.");
    } catch (e: any) {
      setMessage(e?.message || "Az Aviz számozás beállításai nem menthetők.");
    } finally {
      setAvizSettingsSaving(false);
    }
  }

  async function ensureReceptionAviz(id: string) {
    const result = await apiAifEnsureReceptionAvizNumber(id);
    const patch = result.item || {
      aviz_number: result.avizNumber,
      aviz_series: result.avizSeries,
      aviz_sequence_number: result.avizSequenceNumber,
      aviz_sequence_year: result.avizSequenceYear,
    };
    setDetail((prev) => prev && String(prev.item?.id) === String(id)
      ? { ...prev, item: { ...prev.item, ...patch } }
      : prev);
    setItems((prev) => prev.map((item) => String(item.id) === String(id) ? { ...item, ...patch } : item));
    return patch;
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
      await Promise.all([load(), loadSalesTvaSettings(), loadAvizSettings()]);
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
        acc.salesValueRon += receptionSalesTotalRon(r);
        acc.deletable += r.can_delete ? 1 : 0;
        return acc;
      },
      { count: 0, qty: 0, lines: 0, value: 0, salesValueRon: 0, deletable: 0 }
    );
  }, [items]);

  const salesTvaText = useMemo(() => salesTvaLabel(salesTvaSettings), [salesTvaSettings]);

  async function exportFilteredReceptionsPdf() {
    const reportWindow = window.open("", "_blank", "width=1260,height=860,scrollbars=yes,resizable=yes");
    if (!reportWindow) {
      setMessage("A böngésző blokkolta a PDF ablakot. Engedélyezd a felugró ablakokat ehhez az oldalhoz.");
      return;
    }

    reportWindow.document.open();
    reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Raport recepții</title></head><body style="font-family:Arial,sans-serif;padding:28px;color:#243244"><p>Raport készül…</p></body></html>`);
    reportWindow.document.close();

    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifListReceptions({ limit: 5000, search, supplier, location, currency, status, from, to });
      const reportItems = result.items || [];
      const supplierLabel = supplier
        ? supplierDisplayName((meta?.suppliers || []).find((item) => item.id === supplier || item.code === supplier)?.name || supplier)
        : "";
      const locationLabel = location
        ? ((meta?.locations || []).find((item) => item.id === location || item.code === location)?.name || location)
        : "";
      const currencyLabel = currency || "";
      const statusLabel = status ? receptionStatusTextRo(status) : "";
      const html = buildFilteredReceptionsReportHtml(reportItems, {
        search: search.trim(),
        supplier: supplierLabel,
        location: locationLabel,
        currency: currencyLabel,
        status: statusLabel,
        from,
        to,
      }).replace(
        "</head>",
        `<script>
          document.title=${JSON.stringify(`raport_receptii_${fileSafe(supplierLabel || "toate")}_${fileSafe(from || "inceput")}_${fileSafe(to || "azi")}.pdf`)};
          window.addEventListener('load', function () {
            setTimeout(function () {
              try { window.focus(); window.print(); } catch (e) {}
            }, 450);
          });
        </script></head>`
      );
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      reportWindow.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      try { reportWindow.close(); } catch {}
      setMessage(e?.message || "A szűrt receptió PDF export nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const next = await apiAifGetReception(id);
      const avizPatch = await apiAifEnsureReceptionAvizNumber(id).catch(() => null);
      if (avizPatch?.item) next.item = { ...next.item, ...avizPatch.item } as any;
      else if (avizPatch?.avizNumber) next.item = {
        ...next.item,
        aviz_number: avizPatch.avizNumber,
        aviz_series: avizPatch.avizSeries,
        aviz_sequence_number: avizPatch.avizSequenceNumber,
        aviz_sequence_year: avizPatch.avizSequenceYear,
      } as any;
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
      await ensureReceptionAviz(id);
      const data = await apiAifGetReception(id);
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
      await ensureReceptionAviz(id);
      const data = await apiAifGetReception(id);
      if (!data) throw new Error("A receptió nem tölthető be ellenőrző PDF exporthoz.");
      const drafts = detail?.item?.id === id ? rowDrafts : buildDrafts(data.rows || []);
      openReceptionVerificationPdf(data, drafts, salesTvaSettings);
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
        barcode: receptionRowBarcode(row),
        titleRo: n.titleRo || n.title_ro || "",
        colorName: n.colorName || n.color_name || receptionResolvedColorName(row, n, meta) || "",
        colorCode: row.supplier_color_code || n.colorCode || n.color_code || n.supplierColorCode || n.supplier_color_code || "",
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
    const mode = String(item.tva_mode || "without_tva");
    const enteredInvoiceAmount = mode === "without_tva"
      ? ((item as any).invoice_net ?? item.invoice_gross ?? "")
      : (item.invoice_gross ?? (item as any).invoice_net ?? "");
    return {
      invoiceNumber: String(item.invoice_number || ""),
      uitCode: String((item as any).uit_code || (item as any).uitCode || ""),
      invoiceDate: dateText(item.invoice_date) === "-" ? "" : dateText(item.invoice_date),
      receptionDate: dateText(item.reception_date) === "-" ? "" : dateText(item.reception_date),
      currencyCode: String(item.currency_code || ""),
      exchangeRateToRon: String(item.exchange_rate_to_ron || ""),
      tvaMode: mode,
      tvaRate: String(item.tva_rate ?? ""),
      shippingCost: String(item.shipping_cost ?? ""),
      invoiceGross: String(enteredInvoiceAmount),
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

  useEffect(() => {
    if (!detail?.item?.id) return;
    setRowNumberDescending(true);
  }, [detail?.item?.id]);

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
      const financials = receptionFinancialsFromEnteredAmount(
        receptionDraft.invoiceGross,
        receptionDraft.tvaMode,
        receptionDraft.tvaMode === "no_tva" ? 0 : receptionDraft.tvaRate,
      );
      const saved = await apiAifUpdateReception(detail.item.id, {
        invoiceNumber: receptionDraft.invoiceNumber,
        uitCode: receptionDraft.uitCode,
        invoiceDate: receptionDraft.invoiceDate,
        receptionDate: receptionDraft.receptionDate,
        currencyCode: receptionDraft.currencyCode,
        exchangeRateToRon: receptionDraft.exchangeRateToRon,
        tvaMode: receptionDraft.tvaMode,
        tvaRate: receptionDraft.tvaMode === "no_tva" ? 0 : receptionDraft.tvaRate,
        shippingCost: receptionDraft.shippingCost,
        invoiceNet: financials.net,
        invoiceVat: financials.vat,
        invoiceGross: financials.gross,
        note: receptionDraft.note,
      } as any);
      if (saved?.item) {
        setDetail((prev) => prev ? { ...prev, item: { ...prev.item, ...saved.item } } : prev);
        setReceptionDraft((prev) => ({
          ...prev,
          invoiceNumber: String(saved.item?.invoice_number ?? prev.invoiceNumber ?? ""),
          uitCode: String(saved.item?.uit_code ?? saved.item?.uitCode ?? prev.uitCode ?? ""),
          invoiceDate: dateOnly(saved.item?.invoice_date) || prev.invoiceDate,
          receptionDate: dateOnly(saved.item?.reception_date) || prev.receptionDate,
          currencyCode: String(saved.item?.currency_code ?? prev.currencyCode ?? ""),
          exchangeRateToRon: String(saved.item?.exchange_rate_to_ron ?? prev.exchangeRateToRon ?? ""),
          tvaMode: String(saved.item?.tva_mode ?? prev.tvaMode ?? ""),
          tvaRate: String(saved.item?.tva_rate ?? prev.tvaRate ?? ""),
          shippingCost: String(saved.item?.shipping_cost ?? prev.shippingCost ?? ""),
          invoiceGross: String(
            String(saved.item?.tva_mode ?? prev.tvaMode ?? "") === "without_tva"
              ? (saved.item?.invoice_net ?? prev.invoiceGross ?? "")
              : (saved.item?.invoice_gross ?? prev.invoiceGross ?? "")
          ),
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
    const resolvedColorName = receptionResolvedColorName(row, draft, meta);
    const resolvedColorCode = receptionRowColorCode(row, draft);
    return {
      ...draft,
      colorName: (draft as any).colorName || (draft as any).color_name || resolvedColorName || "",
      colorCode: (draft as any).colorCode || (draft as any).color_code || resolvedColorCode || "",
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
    if (!rowErrorTarget) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeRowErrorModal();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [rowErrorTarget, closeRowErrorModal]);

  useEffect(() => {
    const rowId = String(rowErrorTarget?.id || '').trim();
    if (!rowId) {
      setRowColorResolution(null);
      setRowColorChoice(null);
      setRowColorResolutionActionError("");
      setRowColorResolutionLoading(false);
      return;
    }
    let cancelled = false;
    setRowColorResolution(null);
    setRowColorChoice(null);
    setRowColorResolutionActionError("");
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
    setRowColorResolutionActionError("");
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
        closeRowErrorModal();
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
      const actionError = e?.message || 'A színválasztás és készletre vétel nem sikerült.';
      setRowColorResolutionActionError(actionError);
      setMessage(actionError);
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
              <button className={headerBtnSoft} onClick={() => void exportFilteredReceptionsPdf()} disabled={busy} type="button" title="A jelenlegi szűrés PDF exportja">
                <img src={RECEPTIONS_PDF_ICON_URL} alt="" className="h-[17px] w-[17px] shrink-0 object-contain" /> PDF
              </button>
              <button className={headerBtnSoft} onClick={load} disabled={busy} type="button"><RefreshCw size={15} /> Frissítés</button>
              <button className={headerBtnSoft} onClick={() => setAvizSettingsOpen(true)} disabled={avizSettingsLoading} type="button" title={`Következő Aviz: ${avizSettings.previewNumber || "-"}`}>
                <Settings size={15} /> Aviz
              </button>
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
              <input className={input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="számlaszám, UIT kód, beszállító, cél hely" />
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
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Összes érték</p><p className="mt-0.5 text-lg text-white">{money(totals.value)}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Bruttó érték</p><p className="mt-0.5 text-lg text-[#d7fffd]">{money(totals.salesValueRon, "RON")}</p></div>
            <div className="rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-2.5 py-1.5"><p className="text-xs uppercase tracking-[0.06em] text-white/72">Eladási TVA</p><p className="mt-0.5 text-lg text-white">{salesTvaText}</p></div>
          </div>
        </section>

        <section className={card}>
          <SectionTitle title="Receptió lista" right={<span className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-xs text-white/62">{items.length} találat</span>} />
          <div className="overflow-hidden">
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full table-fixed text-left text-xs">
                <colgroup>
                  <col className="w-[4%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[5%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[11%]" />
                  <col className="w-[5%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead className="bg-[#293448] text-[10px] font-normal uppercase tracking-[0.06em] text-white/72 [&_th]:font-normal">
                  <tr>
                    <th className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#8fe9e5]/45 bg-[#2a8d8b] text-white shadow-[0_4px_12px_rgba(42,141,139,0.22)] transition hover:bg-[#319c99]"
                        onClick={() => setReceptionListNumberDescending((current) => !current)}
                        title={receptionListNumberDescending ? `Kattintás: 1 → ${items.length} számozás` : `Kattintás: ${items.length} → 1 számozás`}
                        aria-label="Receptiólista számozási irányának megfordítása"
                      >
                        {receptionListNumberDescending ? <ChevronDown size={14} strokeWidth={2.4} /> : <ChevronUp size={14} strokeWidth={2.4} />}
                      </button>
                    </th>
                    <th className="px-2 py-1.5">Számla</th>
                    <th className="px-2 py-1.5 text-center">Beszállító</th>
                    <th className="px-2 py-1.5 text-center">Cél hely</th>
                    <th className="px-2 py-1.5 text-center">Dátum</th>
                    <th className="px-2 py-1.5 text-center">Pénznem</th>
                    <th className="px-2 py-1.5 text-right">Nettó érték</th>
                    <th className="px-2 py-1.5 text-right">Végösszeg</th>
                    <th className="px-2 py-1.5 text-right text-[#baf7f3]">Számla végösszeg</th>
                    <th className="px-2 py-1.5 text-right">Darab</th>
                    <th className="px-2 py-1.5 text-center">Állapot</th>
                    <th className="px-2 py-1.5 text-center"><span className="sr-only">Műveletek</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-transparent">
                  {items.map((r, index) => {
                    const displayReceptionNo = receptionListNumberDescending ? items.length - index : index + 1;
                    return (
                    <tr key={r.id} className="hover:bg-white/[0.04]">
                      <td className="px-1 py-2 text-center tabular-nums text-[#d7fffd]">{displayReceptionNo}</td>
                      <td className="px-2 py-2 text-white"><span className="block truncate whitespace-nowrap" title={cell(r.invoice_number)}>{cell(r.invoice_number)}</span></td>
                      <td className="px-2 py-2 text-center text-white/82"><span className="block truncate whitespace-nowrap text-center" title={supplierDisplayName(r.supplier_name)}>{supplierDisplayName(r.supplier_name)}</span></td>
                      <td className="px-2 py-2 text-center text-white/82"><span className="block truncate whitespace-nowrap" title={cell(r.location_name)}>{cell(r.location_name)}</span></td>
                      <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums text-white/82">{dateText(r.reception_date)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-center text-white/82">{cell(r.currency_code)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-white/82">{money(receptionNetInvoiceValue(r), r.currency_code)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-white">{money(r.invoice_gross, r.currency_code)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums font-medium text-[#baf7f3]">{money(receptionSalesTotalRon(r), "RON")}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-white/82">{r.total_qty || 0}</td>
                      <td className="px-2 py-2 text-center">
                        <span
                          className={`inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] leading-none ${receptionStatusBadgeClass(r.status)}`}
                          title={statusText(r.status)}
                        >
                          {statusText(r.status)}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className={r.status === "committed" ? tinyIconBtn : tinyBtn}
                            onClick={() => openDetail(r.id)}
                            disabled={busy}
                            type="button"
                            title={r.status === "committed" ? "Adatok" : "Folytatás"}
                            aria-label={r.status === "committed" ? "Adatok" : "Folytatás"}
                          >
                            <Eye size={13} />
                            {r.status === "committed" ? null : "Folytatás"}
                          </button>
                          <ReceptionActionsMenu
                            disabled={busy}
                            canDelete={Boolean(r.can_delete)}
                            onVerification={() => void exportReceptionVerificationPdf(r.id)}
                            onPdf={() => void exportReceptionPdf(r.id)}
                            onDelete={() => setDeleteTarget(r)}
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {!items.length && <tr><td className="px-2 py-6 text-center text-white/62" colSpan={12}>Nincs receptió a megadott szűrés szerint.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-3 lg:hidden">
              {items.map((r, index) => {
                const displayReceptionNo = receptionListNumberDescending ? items.length - index : index + 1;
                return (
                <div key={r.id} className="rounded-2xl border border-white/12 bg-white/[0.05] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 px-1.5 text-[10px] tabular-nums text-[#d7fffd]">{displayReceptionNo}</span>
                        <p className="truncate text-xs text-white">{cell(r.invoice_number)}</p>
                      </div>
                      <p className="mt-1 text-xs text-white/62">{supplierDisplayName(r.supplier_name)} • {cell(r.location_name)}</p>
                    </div>
                    <span className={`inline-flex items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] ${receptionStatusBadgeClass(r.status)}`}>{statusText(r.status)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Dátum</p><p>{dateText(r.reception_date)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Nettó érték</p><p>{money(receptionNetInvoiceValue(r), r.currency_code)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Végösszeg</p><p>{money(r.invoice_gross, r.currency_code)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Darab</p><p>{r.total_qty || 0}</p></div>
                    <div className="col-span-2 rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 p-4"><p className="text-[11px] uppercase text-[#cffffd]/70">Számla végösszeg</p><p className="mt-1 text-base tabular-nums text-[#eaffff]">{money(receptionSalesTotalRon(r), "RON")}</p></div>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                            className={r.status === "committed" ? tinyIconBtn : tinyBtn}
                            onClick={() => openDetail(r.id)}
                            disabled={busy}
                            type="button"
                            title={r.status === "committed" ? "Adatok" : "Folytatás"}
                            aria-label={r.status === "committed" ? "Adatok" : "Folytatás"}
                          >
                            <Eye size={13} />
                            {r.status === "committed" ? null : "Folytatás"}
                          </button>
                    <ReceptionActionsMenu
                      disabled={busy}
                      canDelete={Boolean(r.can_delete)}
                      onVerification={() => void exportReceptionVerificationPdf(r.id)}
                      onPdf={() => void exportReceptionPdf(r.id)}
                      onDelete={() => setDeleteTarget(r)}
                    />
                  </div>
                </div>
                );
              })}
              {!items.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-5 text-center text-sm text-white/65">Nincs receptió a megadott szűrés szerint.</p>}
            </div>
          </div>
        </section>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b111c]/84 p-1.5 backdrop-blur-[7px] sm:p-2">
          <div className="flex max-h-[98vh] w-full max-w-[1760px] flex-col overflow-hidden rounded-[22px] border border-[#9be9e5]/30 bg-[#253143] text-white shadow-[0_34px_120px_rgba(0,0,0,0.74)] ring-1 ring-white/[0.05]">
            <header className="relative shrink-0 overflow-hidden border-b border-white/10 bg-gradient-to-r from-[#203244] via-[#24525a] to-[#2a8d8b] px-4 py-4 sm:px-5">
              <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-white/[0.06] blur-2xl" />
              <div className="relative flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.09] text-[#dffffd] shadow-[0_10px_30px_rgba(0,0,0,0.16)]">
                    <FileText size={23} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-[0.18em] text-white/50">Receptió részletei</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-medium tracking-tight text-white sm:text-2xl">{cell(detail.item.invoice_number)}</h2>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] ${receptionStatusBadgeClass(detail.item.status)}`}>
                        {statusText(detail.item.status)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/62">
                      <span>{supplierDisplayName(detail.item.supplier_name)}</span>
                      <span className="text-white/25">•</span>
                      <span>{cell(detail.item.location_name)}</span>
                      <span className="text-white/25">•</span>
                      <span>{dateText(detail.item.reception_date)}</span>
                      {(detail.item as any).aviz_number ? (
                        <>
                          <span className="text-white/25">•</span>
                          <span className="font-mono text-[#d7fffd]">AVIZ {String((detail.item as any).aviz_number)}</span>
                        </>
                      ) : null}
                      {((detail.item as any).uit_code || (detail.item as any).uitCode) ? (
                        <>
                          <span className="text-white/25">•</span>
                          <span className="font-mono text-[#d7fffd]">UIT {String((detail.item as any).uit_code || (detail.item as any).uitCode)}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-black/10 px-3 text-xs text-white/90 transition hover:bg-white/[0.09]" onClick={() => exportReceptionVerificationPdf(detail.item.id)} disabled={busy} type="button">
                    <CheckCircle size={15} /> Ellenőrző PDF
                  </button>
                  <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-black/10 px-3 text-xs text-white/90 transition hover:bg-white/[0.09]" onClick={() => exportReceptionPdf(detail.item.id)} disabled={busy} type="button">
                    <FileText size={15} /> PDF
                  </button>
                  <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/[0.08] px-3 text-xs text-white transition hover:bg-white/[0.13]" onClick={() => setDetail(null)} type="button">
                    <X size={15} /> Bezárás
                  </button>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-[#2d394b] to-[#263143] p-2.5 pr-3 sm:p-3 sm:pr-4 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-[#1b2533] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-[#1b2533] [&::-webkit-scrollbar-thumb]:bg-[#39a9a5]" style={{ scrollbarColor: "#39a9a5 #1b2533", scrollbarWidth: "auto", scrollbarGutter: "stable" }}>
              <section className="grid gap-3 lg:grid-cols-[1.35fr_0.8fr_0.72fr_0.82fr]">
                <div className="relative overflow-hidden rounded-[24px] border border-[#a9f3ef]/36 bg-gradient-to-br from-[#2a8d8b] to-[#216e70] p-4 shadow-[0_16px_36px_rgba(42,141,139,0.20)]">
                  <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/[0.08] blur-xl" />
                  <p className="relative text-[9px] uppercase tracking-[0.14em] text-[#eaffff]/64">Számla bruttó végösszeg</p>
                  <p className="relative mt-1 text-3xl tracking-tight text-white sm:text-4xl">{money(detail.item.invoice_gross, detail.item.currency_code)}</p>
                  <div className="relative mt-3 flex flex-wrap gap-2 text-[10px] text-white/78">
                    <span className="rounded-full border border-white/15 bg-black/10 px-2.5 py-1">Nettó {money((detail.item as any).invoice_net ?? receptionNetInvoiceValue(detail.item), detail.item.currency_code)}</span>
                    {n((detail.item as any).invoice_vat) > 0 ? <span className="rounded-full border border-white/15 bg-black/10 px-2.5 py-1">TVA {money((detail.item as any).invoice_vat, detail.item.currency_code)}</span> : null}
                    <span className="rounded-full border border-white/15 bg-black/10 px-2.5 py-1">{cell(detail.item.currency_code)}</span>
                    <span className="rounded-full border border-white/15 bg-black/10 px-2.5 py-1">Árfolyam {cell(detail.item.exchange_rate_to_ron)}</span>
                    {detail.item.purchase_order_id ? (
                      <button className="rounded-full border border-orange-100/25 bg-orange-300/12 px-2.5 py-1 text-orange-50 transition hover:bg-orange-300/18" onClick={() => openLinkedPurchaseOrder(detail.item.purchase_order_id)} type="button">
                        {detail.item.purchase_order_number || "Kapcsolt rendelés"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-[#344155]/90 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.12)]">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-white/46">Számla nettó</p>
                  <p className="mt-2 text-2xl tracking-tight text-white">{money((detail.item as any).invoice_net ?? receptionNetInvoiceValue(detail.item), detail.item.currency_code)}</p>
                  <p className="mt-2 text-[10px] text-white/46">A számla pénzügyi fejadata</p>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-[#344155]/90 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.12)]">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">Mennyiség</p>
                  <div className="mt-2 flex items-end gap-2">
                    <p className="text-3xl tracking-tight text-white">{detail.item.total_qty || 0}</p>
                    <span className="pb-1 text-xs text-white/42">db</span>
                  </div>
                  <p className="mt-2 text-[10px] text-white/38">{detail.item.line_count || 0} terméksor</p>
                </div>

                <div className="rounded-[24px] border border-[#7bd7d4]/22 bg-[#29464f] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.12)]">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-[#cffffd]/48">Eladási TVA</p>
                  <p className="mt-2 text-2xl tracking-tight text-[#eaffff]">{salesTvaText}</p>
                  <button className="mt-3 text-[10px] text-[#bdf8f5] underline decoration-[#7bd7d4]/30 underline-offset-4" onClick={() => setSalesTvaModalOpen(true)} disabled={salesTvaSettingsLoading} type="button">
                    Központi beállítás
                  </button>
                </div>
              </section>

              {detailBalance ? (
                <section className={`mt-3 overflow-hidden rounded-[18px] border ${
                  detailBalance.isOk
                    ? "border-[#69d7d0]/24 bg-[#2a8d8b]/8"
                    : detailBalance.isSmallDifference
                      ? "border-amber-200/26 bg-amber-400/[0.07]"
                      : "border-rose-200/28 bg-rose-500/[0.08]"
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${detailBalance.ledClassName}`} />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.13em] text-white/48">Számla egyeztetés</p>
                        <p className="mt-0.5 text-[15px] text-white/92">
                          Különbözet: <span className={detailBalance.isOk ? "text-[#d7fffd]" : detailBalance.isSmallDifference ? "text-amber-50" : "text-rose-50"}>{money(detailBalance.diff, detail.item.currency_code)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-white/72">
                      <span className="rounded-lg border border-white/10 bg-black/10 px-2.5 py-1.5">{detailBalance.invoiceAmountLabel} {money(detailBalance.enteredInvoiceAmount, detail.item.currency_code)}</span>
                      <span className="rounded-lg border border-white/10 bg-black/10 px-2.5 py-1.5">Eredeti sorok {money(detailBalance.originalRowsValue, detail.item.currency_code)}</span>
                      {detailBalance.movedRowsValue > 0 ? <span className="rounded-lg border border-sky-200/20 bg-sky-300/[0.08] px-2.5 py-1.5 text-sky-50">Áthelyezve +{money(detailBalance.movedRowsValue, detail.item.currency_code)}</span> : null}
                      {detailBalance.movedRowsValue > 0 ? <span className="rounded-lg border border-white/10 bg-black/10 px-2.5 py-1.5">Minden termék {money(detailBalance.rowsValue, detail.item.currency_code)}</span> : null}
                      {Math.abs(detailBalance.shipping) > 0.0001 ? <span className="rounded-lg border border-white/10 bg-black/10 px-2.5 py-1.5">Szállítás {money(detailBalance.shipping, detail.item.currency_code)}</span> : null}
                      <span className={`rounded-full border px-2.5 py-1.5 ${detailBalance.badgeClassName}`}>{detailBalance.status}</span>
                    </div>
                  </div>
                  {detailBalance.movedRowsValue > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sky-100/10 bg-sky-300/[0.045] px-4 py-2.5 text-[11px] text-sky-50/82">
                      <span>{detailBalance.movedRowsCount} áthelyezett sor • {detailBalance.movedQty} db • +{money(detailBalance.movedRowsValue, detail.item.currency_code)}. Ezek látszanak a receptióban, de az eredeti számla egyeztetésébe nem számítanak bele.</span>
                      <span className="rounded-full border border-sky-100/16 bg-black/10 px-2.5 py-1 text-[10px] text-sky-50/76">Nyomkövetett áthelyezés</span>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <details className="group mt-3 overflow-hidden rounded-[20px] border border-white/9 bg-[#303c4f]/72" open={String(detail.item.status || "").toLowerCase() !== "committed"}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-white/[0.025] [&::-webkit-details-marker]:hidden">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-white/38">Receptió fejadatai</p>
                    <p className="mt-0.5 text-sm text-white/82">Számlaadatok és beszerzési beállítások</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="hidden h-9 items-center gap-2 rounded-xl border border-[#7bd7d4]/34 bg-[#2a8d8b]/16 px-3 text-xs text-[#d7fffd] hover:bg-[#2a8d8b]/24 sm:inline-flex" onClick={(event) => { event.preventDefault(); void saveReceptionHeader(); }} disabled={busy || savingHeader} type="button">
                      <Save size={14} /> Mentés
                    </button>
                    <ChevronDown size={17} className="text-white/42 transition-transform group-open:rotate-180" />
                  </div>
                </summary>
                <div className="border-t border-white/8 bg-[#2b3749]/76 p-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className={lightLabel}>Számlaszám<input className={lightInput} value={receptionDraft.invoiceNumber || ""} onChange={(e) => updateReceptionDraft("invoiceNumber", e.target.value)} /></label>
                    <label className={lightLabel}>Aviz szám
                      <div className="flex h-10 items-center rounded-xl border border-[#7bd7d4]/22 bg-[#253e48] px-3 font-mono text-xs text-[#d7fffd]">
                        {String((detail.item as any).aviz_number || "PDF készítéskor automatikus")}
                      </div>
                    </label>
                    <label className={lightLabel}>UIT kód<input className={`${lightInput} font-mono tracking-[0.04em]`} maxLength={64} value={receptionDraft.uitCode || ""} onChange={(e) => updateReceptionDraft("uitCode", e.target.value.toUpperCase().replace(/\s+/g, "").slice(0, 64))} placeholder="UIT kód" /></label>
                    <label className={lightLabel}>Számla dátuma<input className={lightInput} type="date" value={receptionDraft.invoiceDate || ""} onChange={(e) => updateReceptionDraft("invoiceDate", e.target.value)} /></label>
                    <label className={lightLabel}>Receptió dátuma<input className={lightInput} type="date" value={receptionDraft.receptionDate || ""} onChange={(e) => updateReceptionDraft("receptionDate", e.target.value)} /></label>
                    <label className={lightLabel}>Pénznem<select className={lightSelect} value={receptionDraft.currencyCode || ""} onChange={(e) => updateReceptionDraft("currencyCode", e.target.value)}>{(meta?.currencies || []).map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}</select></label>
                    <label className={lightLabel}>Árfolyam RON<input className={lightInput} value={receptionDraft.exchangeRateToRon || ""} onChange={(e) => updateReceptionDraft("exchangeRateToRon", e.target.value)} /></label>
                    <label className={lightLabel}>Beszerzési TVA<select className={lightSelect} value={receptionDraft.tvaMode || "no_tva"} onChange={(e) => updateReceptionDraft("tvaMode", e.target.value)}><option value="no_tva">Nincs beszerzési TVA</option><option value="without_tva">Nettó vételár + TVA</option><option value="with_tva">Bruttó vételár, TVA benne van</option></select></label>
                    <label className={lightLabel}>TVA %<input className={lightInput} disabled={receptionDraft.tvaMode === "no_tva"} value={receptionDraft.tvaMode === "no_tva" ? "0" : (receptionDraft.tvaRate || "")} onChange={(e) => updateReceptionDraft("tvaRate", e.target.value)} /></label>
                    <label className={lightLabel}>Szállítás<input className={lightInput} value={receptionDraft.shippingCost || ""} onChange={(e) => updateReceptionDraft("shippingCost", e.target.value)} /></label>
                    <label className={lightLabel}>{receptionDraft.tvaMode === "without_tva" ? "Számla nettó összege" : receptionDraft.tvaMode === "with_tva" ? "Számla bruttó összege" : "Számla összege"}<input className={lightInput} value={receptionDraft.invoiceGross || ""} onChange={(e) => updateReceptionDraft("invoiceGross", e.target.value)} /></label>
                    <label className={`${lightLabel} md:col-span-2 xl:col-span-4`}>Megjegyzés<input className={lightInput} value={receptionDraft.note || ""} onChange={(e) => updateReceptionDraft("note", e.target.value)} /></label>
                    <div className="flex items-end sm:hidden"><button className={primaryBtn} onClick={saveReceptionHeader} disabled={busy || savingHeader} type="button"><Save size={14} /> Mentés</button></div>
                  </div>
                </div>
              </details>

              <section className="mt-3 overflow-hidden rounded-[18px] border border-[#7bd7d4]/14 bg-[#253244] shadow-[0_16px_38px_rgba(0,0,0,0.16)]">
                <div className="flex flex-col gap-3 border-b border-white/8 bg-gradient-to-r from-[#26384a] to-[#294b52] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[11px] uppercase tracking-[0.13em] text-[#d9fffd]/78">Terméksorok</p>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[10px] text-white/58">{visibleRows.length} sor</span>
                      {selectedRows.size ? <span className="rounded-full border border-[#9be9e5]/30 bg-[#2a8d8b]/18 px-2.5 py-1 text-[10px] text-[#d7fffd]">{selectedRows.size} kijelölve</span> : null}
                    </div>
                    <p className="mt-1 text-[14px] text-white/90">Termék, azonosítók, szín, mennyiség és árak egyetlen átlátható sorban.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select className={`${lightSelect} h-9 min-w-[178px]`} value={rowStatusFilter} onChange={(e) => setRowStatusFilter(e.target.value)}>
                      <option value="active">Még dolgozandó sorok</option>
                      <option value="all">Minden sor</option>
                      <option value="committed">Készletre vett</option>
                      <option value="error">Hibás</option>
                      <option value="ignored">Kihagyott</option>
                    </select>
                    <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 text-[11px] text-white/78 hover:bg-white/[0.08]" onClick={selectReadyRows} disabled={busy || savingRows || committingRows} type="button">Kész sorok kijelölése</button>
                    <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 text-[11px] text-white/78 hover:bg-white/[0.08]" onClick={saveRowEdits} disabled={busy || savingRows || committingRows} type="button"><Save size={13} /> Sorok mentése</button>
                    <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#9be9e5]/36 bg-[#2a8d8b] px-3 text-[11px] text-white shadow-[0_8px_20px_rgba(42,141,139,0.18)] hover:bg-[#319c99] disabled:opacity-40" onClick={commitSelectedRows} disabled={busy || savingRows || committingRows || !selectedRows.size} type="button"><CheckCircle size={14} /> Kijelöltek készletre</button>
                  </div>
                </div>

                <div className="hidden xl:block">
                  <div className="p-2.5">
                    <div className="sticky top-0 z-20 grid grid-cols-[32px_44px_minmax(390px,2.2fr)_54px_126px_46px_104px_112px_106px_118px_98px] items-center gap-1.5 rounded-t-[14px] border border-white/[0.08] bg-[#263b4f]/[0.995] px-3 py-2.5 text-[10px] font-normal uppercase tracking-[0.055em] text-white/[0.74] shadow-[0_10px_26px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                      <span className="text-center">✓</span>
                      <span className="flex justify-center">
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#8fe9e5]/45 bg-[#2a8d8b] text-white shadow-[0_4px_12px_rgba(42,141,139,0.22)] transition hover:bg-[#319c99]"
                          onClick={() => setRowNumberDescending((current) => !current)}
                          title={rowNumberDescending ? `Kattintás: 1 → ${visibleRows.length} számozás` : `Kattintás: ${visibleRows.length} → 1 számozás`}
                          aria-label="Terméksorok számozási irányának megfordítása"
                        >
                          {rowNumberDescending ? <ChevronDown size={14} strokeWidth={2.4} /> : <ChevronUp size={14} strokeWidth={2.4} />}
                        </button>
                      </span>
                      <span>Termék / azonosítók</span>
                      <span className="text-center">Méret</span>
                      <span>Szín</span>
                      <span className="text-center">Db</span>
                      <span className="text-right">Vételár / db</span>
                      <span className="text-right text-[#dffefd]">Vételár össz.</span>
                      <span className="text-right">Eladási ár / db</span>
                      <span className="text-right text-[#aef5f1]">Eladási érték <span className="block text-[8px] normal-case tracking-normal text-[#8fe9e5]/70">TVA {salesTvaShort(salesTvaSettings)}</span></span>
                      <span className="text-center"><span className="sr-only">Műveletek</span></span>
                    </div>

                    <div className="overflow-hidden rounded-b-[14px] border-x border-b border-white/[0.12] bg-[#30465a]">
                      {visibleRows.map((r, rowIndex) => {
                        const displayRowNo = rowNumberDescending ? visibleRows.length - rowIndex : rowIndex + 1;
                        const draft: any = rowDrafts[r.id] || r.normalized || {};
                        const editable = rowCanEdit(r);
                        const canCommitOrMove = rowCanWork(r);
                        const checked = canCommitOrMove && selectedRows.has(r.id);
                        const exchangeRate = n(receptionDraft.exchangeRateToRon || detail.item.exchange_rate_to_ron) || 1;
                        const sourceCurrency = String(receptionDraft.currencyCode || detail.item.currency_code || "RON").toUpperCase() || "RON";
                        const rowQty = n(draft.qty ?? r.qty ?? r.normalized?.qty);
                        const buyUnitPrice = n(draft.buyPrice ?? r.buy_price);
                        const buyLineTotal = rowQty * buyUnitPrice;
                        const buyPriceRonPreview = buyUnitPrice * exchangeRate;
                        const buyLineTotalRon = buyLineTotal * exchangeRate;
                        const sellUnitPriceRon = rowSellGrossPriceRon(r, draft, salesTvaSettings);
                        const sellLineTotalRon = rowQty * sellUnitPriceRon;
                        const showBuyConversion = sourceCurrency !== "RON" || Math.abs(exchangeRate - 1) > 0.0001;
                        const hasRowError = r.status === "error" || Boolean((r.error_messages || []).length);
                        const resolvedColorName = receptionResolvedColorName(r, draft, meta);
                        const resolvedColorCode = receptionRowColorCode(r, draft);
                        const displayColorName = String(draft.colorName || resolvedColorName || "").trim();
                        const colorSwatch = receptionColorSwatch(displayColorName);
                        const moveMeta = receptionRowMoveMeta(r, rowDrafts);
                        const rowTone = r.status === "committed"
                          ? "bg-[#344d62] hover:bg-[#3b586f]"
                          : r.status === "ignored"
                            ? "bg-[#2b3e50]/[0.72] opacity-60"
                            : hasRowError
                              ? "bg-rose-500/[0.11] hover:bg-rose-500/[0.16]"
                              : checked
                                ? "bg-[#35646a] hover:bg-[#3b7076]"
                                : "bg-[#385066] hover:bg-[#405d75]";
                        const statusDot = r.status === "committed" ? "bg-[#4fd1c5]" : r.status === "ignored" ? "bg-slate-400" : hasRowError ? "bg-rose-400" : "bg-amber-300";
                        const statusLabel = r.status === "committed" ? "Kész" : r.status === "ignored" ? "Kihagyva" : hasRowError ? "Hiba" : "Nyitott";
                        return (
                          <article
                            key={r.id}
                            className={`relative grid min-h-[88px] grid-cols-[32px_44px_minmax(390px,2.2fr)_54px_126px_46px_104px_112px_106px_118px_98px] items-center gap-1.5 border-b border-white/[0.10] px-3 py-2.5 transition-colors last:border-b-0 ${rowTone}`}
                          >
                            <span className={`absolute inset-y-0 left-0 w-[3px] ${r.status === "committed" ? "bg-[#2a8d8b]" : hasRowError ? "bg-rose-400" : checked ? "bg-[#7bd7d4]" : "bg-transparent"}`} />

                            <div className="flex justify-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded accent-[#2a8d8b]"
                                checked={checked}
                                disabled={!canCommitOrMove || hasRowError}
                                onChange={() => toggleRow(r.id)}
                                aria-label={`Sor ${displayRowNo} kijelölése`}
                              />
                            </div>

                            <div className="min-w-0 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${statusDot}`} />
                                <span className="text-[13px] tabular-nums text-white/[0.96]">{displayRowNo}</span>
                              </div>
                              {hasRowError ? (
                                <button
                                  type="button"
                                  onClick={() => setRowErrorTarget(r)}
                                  className="mt-1 rounded-md border border-rose-300/[0.22] bg-rose-500/[0.15] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.04em] text-rose-50 hover:bg-rose-500/[0.24]"
                                >
                                  Hiba
                                </button>
                              ) : (
                                <span className="mt-1 block text-[9px] uppercase tracking-[0.045em] text-white/[0.58]">{statusLabel}</span>
                              )}
                            </div>

                            <div className="min-w-0 pr-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <input
                                  className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-[15px] tracking-[0.003em] text-white outline-none placeholder:text-white/[0.28] focus:text-[#eaffff] disabled:text-white/[0.90] disabled:opacity-100"
                                  value={String(draft.titleRo ?? "")}
                                  disabled={!editable}
                                  onChange={(e) => updateRowDraft(r.id, "titleRo", e.target.value)}
                                  title={String(draft.titleRo ?? "")}
                                  placeholder="Terméknév"
                                />
                                {moveMeta ? <span className="shrink-0 rounded-md border border-sky-200/20 bg-sky-300/[0.09] px-2 py-1 text-[9px] uppercase tracking-[0.05em] text-sky-50/86" title="Másik receptióból áthelyezett sor">Áthelyezett</span> : null}
                              </div>
                              <div className="mt-2.5 grid min-w-0 grid-cols-[minmax(0,1.08fr)_minmax(0,0.78fr)_minmax(0,1.48fr)] gap-4">
                                <label className="flex min-w-0 items-center gap-2 border-r border-white/[0.10] pr-3">
                                  <span className="shrink-0 text-[11px] uppercase tracking-[0.065em] text-[#bffbf8]/[0.88]">Kód</span>
                                  <input
                                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-white outline-none focus:text-[#eaffff] disabled:opacity-100"
                                    value={String(draft.supplierProductCode ?? "")}
                                    disabled={!editable}
                                    onChange={(e) => updateRowDraft(r.id, "supplierProductCode", e.target.value)}
                                    title={String(draft.supplierProductCode ?? "")}
                                  />
                                </label>
                                <label className="flex min-w-0 items-center gap-2 border-r border-white/[0.10] pr-3">
                                  <span className="shrink-0 text-[11px] uppercase tracking-[0.065em] text-[#bffbf8]/[0.88]">S/N</span>
                                  <input
                                    className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[14px] text-white outline-none focus:text-[#eaffff] disabled:opacity-100"
                                    value={String(draft.snCod ?? draft.sn_cod ?? "")}
                                    disabled={!editable}
                                    onChange={(e) => updateRowDraft(r.id, "snCod", e.target.value)}
                                    title={String(draft.snCod ?? draft.sn_cod ?? "")}
                                  />
                                </label>
                                <label className="flex min-w-0 items-center gap-2">
                                  <span className="shrink-0 text-[11px] uppercase tracking-[0.065em] text-[#d1fffd]/[0.96]">EAN</span>
                                  <input
                                    className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[14px] tracking-[0.018em] text-[#efffff] outline-none focus:text-white disabled:opacity-100"
                                    value={String(draft.barcode ?? receptionRowBarcode(r) ?? "")}
                                    disabled={!editable}
                                    onChange={(e) => updateRowDraft(r.id, "barcode", e.target.value)}
                                    title={String(draft.barcode ?? receptionRowBarcode(r) ?? "")}
                                  />
                                </label>
                              </div>
                            </div>

                            <div className="flex justify-center">
                              <input
                                className="h-9 w-[50px] rounded-lg border border-white/[0.14] bg-[#263a4e] px-1 text-center text-[13px] text-white outline-none focus:border-[#7bd7d4]/[0.55] focus:ring-1 focus:ring-[#7bd7d4]/[0.16] disabled:opacity-100"
                                value={String(draft.size ?? "")}
                                disabled={!editable}
                                onChange={(e) => updateRowDraft(r.id, "size", e.target.value)}
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="h-4 w-4 shrink-0 rounded-full border border-white/[0.38] shadow-[0_0_0_2px_rgba(255,255,255,0.045),0_2px_8px_rgba(0,0,0,0.28)]"
                                  style={{ backgroundColor: colorSwatch }}
                                />
                                <input
                                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12px] text-white/[0.95] outline-none placeholder:text-white/[0.34] focus:text-white disabled:opacity-100"
                                  value={displayColorName}
                                  disabled={!editable}
                                  onChange={(e) => updateRowDraft(r.id, "colorName", e.target.value)}
                                  title={displayColorName}
                                  placeholder="Nincs színnév"
                                />
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <span className="text-[9px] uppercase tracking-[0.06em] text-white/[0.52]">Kód</span>
                                <input
                                  className="h-6 w-[76px] rounded-md border border-white/[0.12] bg-[#263a4e] px-1.5 text-center font-mono text-[11px] text-white/[0.86] outline-none focus:border-[#7bd7d4]/[0.42] disabled:opacity-100"
                                  value={String(draft.colorCode || resolvedColorCode || "")}
                                  disabled={!editable}
                                  onChange={(e) => updateRowDraft(r.id, "colorCode", e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="flex justify-center">
                              <input
                                className="h-9 w-[44px] rounded-lg border border-white/[0.14] bg-[#263a4e] px-1 text-center text-[13px] tabular-nums text-white outline-none focus:border-[#7bd7d4]/[0.55] focus:ring-1 focus:ring-[#7bd7d4]/[0.16] disabled:opacity-100"
                                value={String(draft.qty ?? "")}
                                disabled={!canCommitOrMove}
                                onChange={(e) => updateRowDraft(r.id, "qty", e.target.value)}
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="relative">
                                <input
                                  className="h-9 w-full rounded-lg border border-white/[0.14] bg-[#263a4e] pr-8 pl-2 text-right text-[12px] tabular-nums text-white outline-none focus:border-[#7bd7d4]/[0.48] focus:ring-1 focus:ring-[#7bd7d4]/[0.14] disabled:opacity-100"
                                  value={String(draft.buyPrice ?? "")}
                                  disabled={!editable}
                                  onChange={(e) => updateRowDraft(r.id, "buyPrice", e.target.value)}
                                  title="Vételár darabonként"
                                />
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px] uppercase tracking-[0.03em] text-white/[0.48]">{sourceCurrency}</span>
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="flex min-h-9 items-center justify-end rounded-lg border border-white/[0.14] bg-[#20384b] px-2 text-right text-[13px] tabular-nums text-[#f4ffff]">
                                {money(buyLineTotal, sourceCurrency)}
                              </div>
                              {showBuyConversion ? <p className="mt-1 text-right text-[9px] tabular-nums text-[#d9fffd]/[0.68]">≈ {money(buyLineTotalRon, "RON")}</p> : null}
                            </div>

                            <div className="min-w-0">
                              <div className="relative">
                                <input
                                  className="h-9 w-full rounded-lg border border-[#8ee6e2]/[0.22] bg-[#285159] pr-8 pl-2 text-right text-[12px] tabular-nums text-[#f0ffff] outline-none focus:border-[#7bd7d4]/[0.58] focus:ring-1 focus:ring-[#7bd7d4]/[0.16] disabled:opacity-100"
                                  value={String(draft.sellPrice ?? "")}
                                  disabled={!editable}
                                  onChange={(e) => updateRowSellPrice(r.id, e.target.value)}
                                  title="Eladási ár darabonként"
                                />
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px] uppercase tracking-[0.03em] text-[#d9fffd]/[0.60]">RON</span>
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="flex min-h-9 items-center justify-end rounded-lg border border-[#7bd7d4]/[0.30] bg-[#236169] px-2 text-right text-[13px] tabular-nums text-[#f1ffff]">
                                {money(sellLineTotalRon, "RON")}
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-1">
                              <button
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#a4efeb]/[0.40] bg-[#2a8d8b] text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-40"
                                onClick={() => saveSingleRow(r.id)}
                                disabled={!editable || busy || savingRows || committingRows || savingRowId === r.id}
                                type="button"
                                title={savingRowId === r.id ? "Mentés folyamatban" : "Sor mentése"}
                              >
                                <Save size={14} />
                              </button>
                              <button
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.22] bg-[#43566b] text-white/[0.84] transition hover:bg-[#3a4a5f] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                                onClick={() => void openMoveReception(r)}
                                disabled={!canCommitOrMove || busy || savingRowId === r.id}
                                type="button"
                                title="Áthelyezés másik receptióba"
                              >
                                <MoveRight size={14} />
                              </button>
                              <button
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-400/[0.28] bg-rose-500/[0.18] text-rose-100 transition hover:bg-rose-500/[0.28] disabled:cursor-not-allowed disabled:opacity-35"
                                onClick={() => ignoreRow(r.id)}
                                disabled={!canCommitOrMove || busy || savingRowId === r.id}
                                type="button"
                                title="Sor kihagyása"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                      {!visibleRows.length ? <div className="px-4 py-10 text-center text-sm text-white/[0.42]">Nincs sor ebben a nézetben.</div> : null}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 bg-[#344b60] p-2.5 xl:hidden">
                  {visibleRows.map((r, rowIndex) => {
                    const displayRowNo = rowNumberDescending ? visibleRows.length - rowIndex : rowIndex + 1;
                    const draft: any = rowDrafts[r.id] || r.normalized || {};
                    const editable = rowCanEdit(r);
                    const canCommitOrMove = rowCanWork(r);
                    const checked = canCommitOrMove && selectedRows.has(r.id);
                    const exchangeRate = n(receptionDraft.exchangeRateToRon || detail.item.exchange_rate_to_ron) || 1;
                    const sourceCurrency = String(receptionDraft.currencyCode || detail.item.currency_code || "RON").toUpperCase() || "RON";
                    const rowQty = n(draft.qty ?? r.qty ?? r.normalized?.qty);
                    const buyUnitPrice = n(draft.buyPrice ?? r.buy_price);
                    const buyLineTotal = rowQty * buyUnitPrice;
                    const buyPriceRonPreview = buyUnitPrice * exchangeRate;
                    const buyLineTotalRon = buyLineTotal * exchangeRate;
                    const sellLineTotalRon = rowQty * rowSellGrossPriceRon(r, draft, salesTvaSettings);
                    const showBuyConversion = sourceCurrency !== "RON" || Math.abs(exchangeRate - 1) > 0.0001;
                    const hasRowError = r.status === "error" || Boolean((r.error_messages || []).length);
                    const resolvedColorName = receptionResolvedColorName(r, draft, meta);
                    const resolvedColorCode = receptionRowColorCode(r, draft);
                    const displayColorName = String(draft.colorName || resolvedColorName || "").trim();
                    const colorSwatch = receptionColorSwatch(displayColorName);
                    const moveMeta = receptionRowMoveMeta(r, rowDrafts);
                    return (
                      <article key={r.id} className={`overflow-hidden rounded-[20px] border ${checked ? "border-[#7bd7d4]/28 bg-[#2a8d8b]/10" : hasRowError ? "border-rose-300/24 bg-rose-500/[0.07]" : "border-white/[0.12] bg-[#3a5268]"}`}>
                        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-2.5">
                          <label className="inline-flex items-center gap-2 text-[12px] text-white/92"><input type="checkbox" className="h-4 w-4 accent-[#2a8d8b]" checked={checked} disabled={!canCommitOrMove || hasRowError} onChange={() => toggleRow(r.id)} /><span>Sor {displayRowNo}</span></label>
                          {hasRowError ? <button type="button" onClick={() => setRowErrorTarget(r)} className="rounded-full border border-rose-300/20 bg-rose-500/14 px-2 py-1 text-[10px] text-rose-50">Hiba részletei</button> : <span className="rounded-full bg-black/10 px-2 py-1 text-[10px] text-white/44">{statusText(r.status)}</span>}
                        </div>
                        <div className="p-3">
                          <div className="flex items-center gap-2">
                            <input className={`${rowCompactInput} h-10 flex-1 text-[14px]`} value={String(draft.titleRo ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "titleRo", e.target.value)} />
                            {moveMeta ? <span className="shrink-0 rounded-md border border-sky-200/20 bg-sky-300/[0.09] px-2 py-1 text-[9px] uppercase tracking-[0.05em] text-sky-50/86">Áthelyezett</span> : null}
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            {[
                              ["Kód", String(draft.supplierProductCode ?? ""), "supplierProductCode", false],
                              ["S/N", String(draft.snCod ?? draft.sn_cod ?? ""), "snCod", true],
                              ["EAN", String(draft.barcode ?? receptionRowBarcode(r) ?? ""), "barcode", true],
                            ].map(([labelText, fieldValue, key, mono]) => (
                              <label key={String(key)} className="rounded-xl border border-white/[0.06] bg-[#2b4054] px-2.5 py-2">
                                <span className="text-[10px] uppercase tracking-[0.08em] text-[#b8faf7]/72">{labelText}</span>
                                <input className={`mt-1 w-full bg-transparent text-[12px] text-white/92 outline-none ${mono ? "font-mono" : ""}`} value={String(fieldValue)} disabled={!editable} onChange={(e) => updateRowDraft(r.id, String(key), e.target.value)} />
                              </label>
                            ))}
                          </div>
                          <div className="mt-2 grid grid-cols-[72px_minmax(0,1fr)_72px] gap-2">
                            <label className={rowLabel}>Méret<input className={`${rowCompactInput} text-center`} value={String(draft.size ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "size", e.target.value)} /></label>
                            <div>
                              <span className="text-[9px] uppercase tracking-[0.05em] text-white/42">Szín</span>
                              <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#2b4054] px-2.5 py-2">
                                <span className="h-4 w-4 shrink-0 rounded-full border border-white/35" style={{ backgroundColor: colorSwatch }} />
                                <input className="min-w-0 flex-1 bg-transparent text-[11px] text-white/94 outline-none" value={displayColorName} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorName", e.target.value)} placeholder="Nincs színnév" />
                                <input className="w-[54px] rounded-md bg-black/10 px-1.5 py-0.5 text-center font-mono text-[10px] text-white/76 outline-none" value={String(draft.colorCode || resolvedColorCode || "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorCode", e.target.value)} />
                              </div>
                            </div>
                            <label className={rowLabel}>Db<input className={`${rowCompactInput} text-center`} value={String(draft.qty ?? "")} disabled={!canCommitOrMove} onChange={(e) => updateRowDraft(r.id, "qty", e.target.value)} /></label>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-white/[0.08] bg-[#2b4054] p-2.5">
                              <p className="text-[10px] uppercase tracking-[0.06em] text-white/58">Vételár</p>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <label className="grid gap-1 text-[9px] uppercase tracking-[0.05em] text-white/46">Darabár<div className="relative"><input className={`${rowCompactInput} pr-10 text-right text-[12px]`} value={String(draft.buyPrice ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "buyPrice", e.target.value)} /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-white/42">{sourceCurrency}</span></div></label>
                                <div className="grid gap-1 text-[9px] uppercase tracking-[0.05em] text-white/46"><span>Összesen</span><div className="flex h-8 items-center justify-end rounded-lg border border-white/[0.12] bg-[#20384b] px-2 text-[12px] normal-case tabular-nums tracking-normal text-white">{money(buyLineTotal, sourceCurrency)}</div>{showBuyConversion ? <span className="text-right text-[9px] normal-case tracking-normal text-[#cffffd]/62">≈ {money(buyLineTotalRon, "RON")}</span> : null}</div>
                              </div>
                            </div>
                            <div className="rounded-xl border border-[#7bd7d4]/[0.14] bg-[#2c4d59] p-2.5">
                              <p className="text-[10px] uppercase tracking-[0.06em] text-[#d9fffd]/72">Eladás <span className="normal-case tracking-normal text-[#8fe9e5]/60">TVA {salesTvaShort(salesTvaSettings)}</span></p>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <label className="grid gap-1 text-[9px] uppercase tracking-[0.05em] text-white/46">Darabár<div className="relative"><input className={`${rowCompactInput} bg-[#2a8d8b]/10 pr-10 text-right text-[12px]`} value={String(draft.sellPrice ?? "")} disabled={!editable} onChange={(e) => updateRowSellPrice(r.id, e.target.value)} /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-[#cffffd]/50">RON</span></div></label>
                                <div className="grid gap-1 text-[9px] uppercase tracking-[0.05em] text-white/46"><span>Összesen</span><div className="flex h-8 items-center justify-end rounded-lg border border-[#7bd7d4]/[0.26] bg-[#236169] px-2 text-[12px] normal-case tabular-nums tracking-normal text-[#f1ffff]">{money(sellLineTotalRon, "RON")}</div></div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end gap-1.5 border-t border-white/[0.06] pt-3">
                            <button className={rowPrimaryBtn} onClick={() => saveSingleRow(r.id)} disabled={!editable || busy || savingRows || committingRows || savingRowId === r.id} type="button" title="Sor mentése"><Save size={14} /></button>
                            <button className={rowNeutralBtn} onClick={() => void openMoveReception(r)} disabled={!canCommitOrMove || busy || savingRowId === r.id} type="button" title="Áthelyezés"><MoveRight size={14} /></button>
                            <button className={rowDangerBtn} onClick={() => ignoreRow(r.id)} disabled={!canCommitOrMove || busy || savingRowId === r.id} type="button" title="Kihagy"><X size={14} /></button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {!visibleRows.length ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/42">Nincs sor ebben a nézetben.</div> : null}
                </div>
              </section>
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
            className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/72 p-3 backdrop-blur-[4px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reception-row-error-title"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) closeRowErrorModal();
            }}
          >
            <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] border border-rose-200/28 bg-[#303a4c] text-white shadow-[0_28px_90px_rgba(0,0,0,0.62)] ring-1 ring-rose-400/10" onMouseDown={(event) => event.stopPropagation()}>
              <div className="flex items-start gap-3 border-b border-rose-200/16 bg-gradient-to-r from-[#3b2633] via-[#3a3040] to-[#303a4c] px-4 py-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200/28 bg-rose-500/16 text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.14)]">
                  <AlertTriangle size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-rose-100/58">Készletre vétel megállt</p>
                  <h2 id="reception-row-error-title" className="mt-1 text-xl text-white">
                    {rowColorResolution?.canResolve ? "Szín egyeztetés szükséges" : receptionRowErrorTitle(rowErrorTarget)}
                  </h2>
                  <p className="mt-1 text-sm text-white/58">Nr. {rowErrorTarget.row_no || "?"} • {title}</p>
                </div>
                <button
                  className={neutralBtn}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    closeRowErrorModal();
                  }}
                  aria-label="Bezárás"
                >
                  <X size={15} /> Bezárás
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
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
                    <RefreshCw size={15} className="animate-spin text-[#8ee6e2]" /> Régi termék és színadat ellenőrzése…
                  </div>
                ) : rowColorResolution?.canResolve ? (
                  <div className="rounded-2xl border border-[#7bd7d4]/30 bg-[#233f49] p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#cffffd]/62">Szín egyeztetés</p>
                        <p className="mt-1 text-base text-white">Mit szeretnél megtartani ennél a terméknél?</p>
                        <p className="mt-1 text-sm leading-5 text-white/65">
                          A vonalkód és a méret egyezik, tehát ugyanarról a fizikai variánsról van szó.
                          Csak a régi és az új színmegnevezés tér el.
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/14 bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/58">
                        Jelenlegi készlet: {Number(rowColorResolution.existing?.totalQty || 0)} db
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={rowColorResolutionBusy}
                        onClick={() => setRowColorChoice('keep_existing')}
                        aria-pressed={rowColorChoice === 'keep_existing'}
                        className={`relative rounded-2xl border p-4 text-left disabled:opacity-50 ${
                          rowColorChoice === 'keep_existing'
                            ? 'border-[#8fe7e3] bg-[#2a8d8b] text-white shadow-[0_10px_26px_rgba(42,141,139,0.28)]'
                            : 'border-white/16 bg-[#354153] text-white hover:border-white/30 hover:bg-[#3d4a5e]'
                        }`}
                      >
                        <span className={`absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                          rowColorChoice === 'keep_existing'
                            ? 'border-white/70 bg-white text-[#176b69]'
                            : 'border-white/20 bg-white/[0.05] text-transparent'
                        }`}>
                          <Check size={16} strokeWidth={3} />
                        </span>
                        <p className={`pr-10 text-[10px] uppercase tracking-[0.12em] ${
                          rowColorChoice === 'keep_existing' ? 'text-white/80' : 'text-white/48'
                        }`}>
                          Régi szín marad
                        </p>
                        <p className="mt-2 pr-10 text-xl font-medium text-white">
                          {rowColorResolution.existing?.colorName || 'Nincs színnév'}
                          {rowColorResolution.existing?.colorCode ? (
                            <span className={`ml-2 text-sm ${rowColorChoice === 'keep_existing' ? 'text-white/80' : 'text-white/48'}`}>
                              / {rowColorResolution.existing.colorCode}
                            </span>
                          ) : null}
                        </p>
                        <p className={`mt-3 text-xs leading-5 ${
                          rowColorChoice === 'keep_existing' ? 'text-white/82' : 'text-white/58'
                        }`}>
                          A most érkező darabok a meglévő színű variánshoz kerülnek.
                          A régi szín neve és kódja nem változik.
                        </p>
                      </button>

                      <button
                        type="button"
                        disabled={rowColorResolutionBusy}
                        onClick={() => setRowColorChoice('use_incoming')}
                        aria-pressed={rowColorChoice === 'use_incoming'}
                        className={`relative rounded-2xl border p-4 text-left disabled:opacity-50 ${
                          rowColorChoice === 'use_incoming'
                            ? 'border-[#8fe7e3] bg-[#2a8d8b] text-white shadow-[0_10px_26px_rgba(42,141,139,0.28)]'
                            : 'border-white/16 bg-[#354153] text-white hover:border-white/30 hover:bg-[#3d4a5e]'
                        }`}
                      >
                        <span className={`absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                          rowColorChoice === 'use_incoming'
                            ? 'border-white/70 bg-white text-[#176b69]'
                            : 'border-white/20 bg-white/[0.05] text-transparent'
                        }`}>
                          <Check size={16} strokeWidth={3} />
                        </span>
                        <p className={`pr-10 text-[10px] uppercase tracking-[0.12em] ${
                          rowColorChoice === 'use_incoming' ? 'text-white/80' : 'text-white/48'
                        }`}>
                          Új szín legyen
                        </p>
                        <p className="mt-2 pr-10 text-xl font-medium text-white">
                          {rowColorResolution.incoming?.colorName || 'Nincs színnév'}
                          {rowColorResolution.incoming?.colorCode ? (
                            <span className={`ml-2 text-sm ${rowColorChoice === 'use_incoming' ? 'text-white/80' : 'text-white/48'}`}>
                              / {rowColorResolution.incoming.colorCode}
                            </span>
                          ) : null}
                        </p>
                        <p className={`mt-3 text-xs leading-5 ${
                          rowColorChoice === 'use_incoming' ? 'text-white/82' : 'text-white/58'
                        }`}>
                          A meglévő variáns színét átnevezi az új receptió szerinti értékre,
                          majd az érkező darabokat erre veszi készletre.
                        </p>
                      </button>
                    </div>

                    <div className="mt-3 rounded-xl border border-white/12 bg-[#263246] px-3 py-2">
                      {rowColorChoice ? (
                        <div className="flex items-center gap-2 text-sm text-white">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2a8d8b] text-white">
                            <Check size={14} strokeWidth={3} />
                          </span>
                          <span>
                            Kiválasztva: <strong>
                              {rowColorChoice === 'keep_existing'
                                ? `régi szín marad – ${rowColorResolution.existing?.colorName || 'nincs színnév'}${rowColorResolution.existing?.colorCode ? ` / ${rowColorResolution.existing.colorCode}` : ''}`
                                : `új szín lesz – ${rowColorResolution.incoming?.colorName || 'nincs színnév'}${rowColorResolution.incoming?.colorCode ? ` / ${rowColorResolution.incoming.colorCode}` : ''}`}
                            </strong>
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-white/55">Válaszd ki a két lehetőség egyikét. Addig semmi nem változik.</p>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/10 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#cffffd]/62">Mit kell tenni?</p>
                  <p className="mt-1.5 text-sm leading-5 text-white/76">
                    {rowColorResolution?.canResolve
                      ? <>Válaszd ki fent, hogy a régi szín maradjon-e, vagy az új szín legyen a terméken. Ezután az alsó zöld gombbal külön jóváhagyod a műveletet.</>
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

                {rowColorResolutionActionError ? (
                  <div className="rounded-2xl border border-red-300/45 bg-red-500/14 px-3 py-3 text-sm leading-5 text-red-50 shadow-[0_0_18px_rgba(239,68,68,0.16)]">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-200" />
                      <div>
                        <p className="font-medium text-white">A művelet nem sikerült</p>
                        <p className="mt-1 text-red-50/86">{rowColorResolutionActionError}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-3 flex flex-wrap justify-end gap-2 border-t border-white/10 bg-[#303a4c]/98 px-4 py-3 shadow-[0_-12px_28px_rgba(15,23,42,0.28)] backdrop-blur">
                  {rowColorResolution?.canResolve ? (
                    <>
                      <button
                        className={neutralBtn}
                        type="button"
                        disabled={rowColorResolutionBusy}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          closeRowErrorModal();
                        }}
                      >
                        <X size={15} /> Mégse
                      </button>
                      <button
                        className={primaryBtn}
                        type="button"
                        disabled={!rowColorChoice || rowColorResolutionBusy}
                        onClick={() => {
                          if (!rowColorChoice) return;
                          void resolveBarcodeColorAndCommit(rowColorChoice);
                        }}
                      >
                        {rowColorResolutionBusy ? (
                          <RefreshCw size={15} className="animate-spin" />
                        ) : (
                          <Check size={15} />
                        )}
                        {rowColorResolutionBusy ? "Mentés és készletre vétel…" : "Kiválasztás alkalmazása és készletre vétel"}
                      </button>
                    </>
                  ) : (
                    <button
                      className={primaryBtn}
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        closeRowErrorModal();
                      }}
                    >
                      <Check size={15} /> Értem, javítom
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {avizSettingsOpen && (
        <div className="fixed inset-0 z-[78] grid place-items-center bg-slate-950/66 p-3 backdrop-blur-[5px]" role="dialog" aria-modal="true" aria-labelledby="aviz-settings-title">
          <div className="w-full max-w-2xl overflow-hidden rounded-[22px] border border-[#8fe9e5]/32 bg-[#2d394b] text-white shadow-[0_32px_95px_rgba(0,0,0,0.68)] ring-1 ring-white/[0.05]">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#233747] via-[#24575c] to-[#2a8d8b] px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.08] text-[#dffffd]">
                  <Settings size={20} />
                </span>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.16em] text-white/55">Receptió dokumentum</p>
                  <h2 id="aviz-settings-title" className="mt-1 text-xl text-white">Aviz számozás</h2>
                  <p className="mt-1 text-xs text-white/62">A kiosztott szám a receptióhoz rögzül, később ugyanaz marad mindkét PDF-en.</p>
                </div>
              </div>
              <button className={neutralBtn} onClick={() => setAvizSettingsOpen(false)} type="button"><X size={14} /> Bezárás</button>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#234750] p-4">
                <p className="text-[9px] uppercase tracking-[0.14em] text-[#cffffd]/55">Következő bizonylatszám</p>
                <p className="mt-1 font-mono text-2xl tracking-tight text-[#eaffff]">{avizSettings.previewNumber || "-"}</p>
                <p className="mt-1 text-[11px] text-white/50">A már kiosztott Aviz számokat ez a beállítás nem írja át.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className={label}>Széria
                  <input className={input} value={avizSeries} onChange={(e) => setAvizSeries(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20))} placeholder="AVZ" />
                </label>
                <label className={label}>Következő szám
                  <input className={input} inputMode="numeric" value={avizNextNumber} onChange={(e) => setAvizNextNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))} placeholder="1" />
                </label>
                <label className={label}>Számjegyek
                  <input className={input} inputMode="numeric" value={avizDigits} onChange={(e) => setAvizDigits(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} placeholder="6" />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#354153] px-3 py-3 text-sm text-white/82">
                  <input className="h-4 w-4 accent-[#2a8d8b]" type="checkbox" checked={avizIncludeYear} onChange={(e) => setAvizIncludeYear(e.target.checked)} />
                  Év szerepeljen a számban
                </label>
                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#354153] px-3 py-3 text-sm text-white/82">
                  <input className="h-4 w-4 accent-[#2a8d8b]" type="checkbox" checked={avizYearlyReset} onChange={(e) => setAvizYearlyReset(e.target.checked)} />
                  Év elején induljon újra 1-ről
                </label>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-[11px] leading-5 text-white/55">
                A számla dátuma és a receptió dátuma külön adat. A PDF-ek a <strong className="text-white/82">Receptió dátuma</strong> mezőt használják az áru tényleges átvételi dátumaként.
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/10 bg-[#263246] px-4 py-3">
              <button className={neutralBtn} onClick={() => setAvizSettingsOpen(false)} disabled={avizSettingsSaving} type="button">Mégse</button>
              <button className={primaryBtn} onClick={() => void saveAvizSettings()} disabled={avizSettingsSaving || avizSettingsLoading} type="button">
                <Save size={14} /> {avizSettingsSaving ? "Mentés..." : "Beállítás mentése"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    label: `${cell(r.invoice_number)} • ${supplierDisplayName(r.supplier_name)} • ${dateText(r.reception_date)} • ${stateLabel}`,
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
              {cell(deleteTarget.invoice_number)} • {supplierDisplayName(deleteTarget.supplier_name)} • {money(deleteTarget.invoice_gross, deleteTarget.currency_code)}
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
