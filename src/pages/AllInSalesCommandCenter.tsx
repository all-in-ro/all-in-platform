import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Database,
  Filter,
  Gauge,
  Home,
  Info,
  Layers3,
  Loader2,
  PackageSearch,
  Percent,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Target,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import {
  apiAifCreateSalesHistoryImport,
  apiAifSalesCommandCenterOverview,
  type AifSalesCommandDetailItem,
  type AifSalesCommandDimensionItem,
  type AifSalesCommandDimensionKey,
  type AifSalesCommandMetricRow,
  type AifSalesCommandOverviewResponse,
  type AifSalesHistoryInputRow,
} from "../lib/aif/api";

type SourceFilter = "all" | "live" | "history";
type BucketFilter = "auto" | "day" | "week" | "month";
type ChartMetric =
  | "revenue"
  | "grossProfit"
  | "itemsSold"
  | "transactions"
  | "averageBasket"
  | "discountTotal"
  | "unpaidTotal";
type QuickPreset = "ytd" | "month" | "lastMonth" | "fullYear";

type FiltersState = {
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
  location: string;
  employee: string;
  brand: string;
  category: string;
  subcategory: string;
  size: string;
  color: string;
  payment: string;
  product: string;
  search: string;
  source: SourceFilter;
  bucket: BucketFilter;
};

type SelectOption = { value: string; label: string; hint?: string };

type ManualHistoryDraft = {
  month: string;
  location: string;
  actor: string;
  revenue: string;
  quantity: string;
  transactions: string;
  estimatedCost: string;
  discountTotal: string;
  unpaidTotal: string;
  note: string;
};


const panel =
  "rounded-[22px] border border-white/16 bg-gradient-to-br from-[#39475b] via-[#344154] to-[#303b4d] shadow-[0_16px_36px_rgba(15,23,42,0.20)]";
const control =
  "h-11 min-w-0 w-full rounded-[13px] border border-white/18 bg-gradient-to-b from-[#2d394b] to-[#293548] px-3 text-sm font-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none placeholder:text-white/38 transition hover:border-white/28 focus:border-[#7bd7d4]/65 focus:ring-2 focus:ring-[#7bd7d4]/15 [color-scheme:dark]";
const buttonBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45";
const primaryButton = `${buttonBase} border-[#9be9e5]/48 bg-gradient-to-r from-[#238985] to-[#2a9a96] shadow-[0_8px_20px_rgba(42,141,139,0.18)] hover:brightness-110`;
const neutralButton = `${buttonBase} border-white/18 bg-[#3a475a]/90 hover:border-[#8ce7e2]/28 hover:bg-[#445369]`;

const dimensionLabels: Record<AifSalesCommandDimensionKey, string> = {
  brand: "Márkák",
  category: "Főkategóriák",
  subcategory: "Alkategóriák",
  product: "Termékek",
  size: "Méretek",
  color: "Színek",
  store: "Üzletek",
  payment: "Fizetési módok",
};

const chartMetricConfig: Record<
  ChartMetric,
  { label: string; short: string; format: (value: number) => string }
> = {
  revenue: { label: "Forgalom", short: "Forgalom", format: money },
  grossProfit: { label: "Bruttó nyereség", short: "Nyereség", format: money },
  itemsSold: { label: "Eladott darab", short: "Darab", format: (value) => `${integer(value)} db` },
  transactions: { label: "Tranzakció", short: "Tranzakció", format: integer },
  averageBasket: { label: "Átlagkosár", short: "Átlagkosár", format: money },
  discountTotal: { label: "Kedvezmény", short: "Kedvezmény", format: money },
  unpaidTotal: { label: "Kintlévőség", short: "Kintlévőség", format: money },
};


function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let raw = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "")
    .replace(/RON|LEI/gi, "")
    .replace(/%$/, "");
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    raw = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (comma >= 0) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown) {
  return `${numberValue(value).toLocaleString("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} RON`;
}

function integer(value: unknown) {
  return Math.round(numberValue(value)).toLocaleString("ro-RO");
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("hu-HU", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numberValue(value));
}

function percentage(value: unknown, digits = 1) {
  return `${numberValue(value).toLocaleString("hu-HU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function localIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function shiftYear(iso: string, amount: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const targetYear = year + amount;
  const maxDay = new Date(Date.UTC(targetYear, month, 0, 12)).getUTCDate();
  return `${targetYear}-${String(month).padStart(2, "0")}-${String(Math.min(day, maxDay)).padStart(2, "0")}`;
}

function previousMonthRange(today: string) {
  const date = new Date(`${monthStart(today)}T12:00:00Z`);
  date.setUTCDate(0);
  const to = date.toISOString().slice(0, 10);
  return { from: monthStart(to), to };
}

function presetFilters(preset: QuickPreset, current = localIsoDate()): Pick<FiltersState, "from" | "to" | "compareFrom" | "compareTo"> {
  const year = Number(current.slice(0, 4));
  if (preset === "month") {
    return {
      from: monthStart(current),
      to: current,
      compareFrom: shiftYear(monthStart(current), -1),
      compareTo: shiftYear(current, -1),
    };
  }
  if (preset === "lastMonth") {
    const range = previousMonthRange(current);
    return {
      ...range,
      compareFrom: shiftYear(range.from, -1),
      compareTo: shiftYear(range.to, -1),
    };
  }
  if (preset === "fullYear") {
    return {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      compareFrom: `${year - 1}-01-01`,
      compareTo: `${year - 1}-12-31`,
    };
  }
  return {
    from: `${year}-01-01`,
    to: current,
    compareFrom: `${year - 1}-01-01`,
    compareTo: shiftYear(current, -1),
  };
}

function huDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("hu-HU", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function metricValue(row: Partial<AifSalesCommandMetricRow> | undefined, metric: ChartMetric) {
  return numberValue(row?.[metric]);
}

function deltaValue(current: number, comparison: number) {
  if (Math.abs(comparison) < 0.000001) return Math.abs(current) < 0.000001 ? 0 : null;
  return ((current - comparison) / Math.abs(comparison)) * 100;
}

function sourceLabel(source: string) {
  if (source === "live_sale") return "Élő eladás";
  if (source === "live_exchange") return "Csere új termék";
  if (source === "live_exchange_return") return "Csere visszavétel";
  if (source === "history") return "Történeti adat";
  return source || "Ismeretlen";
}

function sourceBadge(source: string) {
  if (source === "history") return "border-violet-300/24 bg-violet-400/12 text-violet-50";
  if (source === "live_exchange" || source === "live_exchange_return") return "border-amber-200/24 bg-amber-400/12 text-amber-50";
  return "border-[#8ce7e2]/24 bg-[#2a8d8b]/14 text-[#d7fffd]";
}

function paymentLabel(value?: string | null) {
  const key = String(value || "").toLowerCase();
  if (key === "cash") return "Készpénz";
  if (key === "card") return "Kártya";
  if (key === "bank_transfer") return "Banki átutalás";
  if (key === "credit") return "Hitel";
  if (key === "mixed") return "Vegyes";
  if (key === "exchange") return "Csere";
  return value || "Nincs adat";
}

const SALES_STORE_CODES = new Set(["main_warehouse", "magazin_targu_secuiesc"]);

function friendlyLocationLabel(code?: string | null, name?: string | null) {
  const key = String(code || "").trim().toLowerCase();
  if (key === "main_warehouse") return "Csíkszereda";
  if (key === "magazin_targu_secuiesc") return "Kézdivásárhely";
  return String(name || code || "Ismeretlen üzlet").trim() || "Ismeretlen üzlet";
}

function closeOnEscape(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [active, close]);
}

function FloatingHint({ children, content }: { children: ReactNode; content: ReactNode }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);

  const update = useCallback(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 20);
    const left = Math.max(10, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 10));
    const desiredTop = rect.top - 12;
    setPosition({ left, top: desiredTop, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    update();
    const listener = () => update();
    window.addEventListener("resize", listener);
    window.addEventListener("scroll", listener, true);
    return () => {
      window.removeEventListener("resize", listener);
      window.removeEventListener("scroll", listener, true);
    };
  }, [open, update]);

  return (
    <>
      <span
        ref={ref}
        className="inline-flex"
        onMouseEnter={() => {
          update();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => {
          update();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open && position
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[1200] -translate-y-full rounded-xl border border-[#7bd7d4]/28 bg-[#111b2a]/[0.98] px-3 py-2.5 text-xs leading-5 text-white/82 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl"
              style={{ left: position.left, top: position.top, width: position.width }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function SelectControl({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.value === value);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const edge = 10;
    const gap = 8;
    const desiredHeight = Math.min(350, 58 + Math.max(1, options.length) * 46);
    const width = Math.min(Math.max(rect.width, 250), window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const roomBelow = window.innerHeight - rect.bottom - edge;
    const roomAbove = rect.top - edge;
    const openUpward = roomBelow < Math.min(desiredHeight, 240) && roomAbove > roomBelow;

    if (openUpward) {
      setPosition({ left, width, bottom: Math.max(edge, window.innerHeight - rect.top + gap) });
    } else {
      setPosition({ left, width, top: Math.min(window.innerHeight - edge, rect.bottom + gap) });
    }
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`group flex h-11 min-w-0 w-full items-center justify-between gap-2 overflow-hidden rounded-[13px] border px-3 text-left text-sm font-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none transition disabled:opacity-45 ${
          open
            ? "border-[#8ce7e2]/72 bg-gradient-to-b from-[#315268] to-[#2b4054] ring-2 ring-[#7bd7d4]/14"
            : "border-white/18 bg-gradient-to-b from-[#2d394b] to-[#293548] hover:border-[#7bd7d4]/35 hover:from-[#324157] hover:to-[#2c3a4e]"
        }`}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full transition ${open ? "bg-[#8ff4ee] shadow-[0_0_12px_rgba(123,215,212,0.9)]" : selected ? "bg-[#63d8d3]" : "bg-white/28"}`} />
          <span title={selected?.label || placeholder} className="min-w-0 flex-1 truncate" style={{ color: selected?.label ? "#ffffff" : "rgba(255,255,255,0.55)" }}>
            {selected?.label || placeholder}
          </span>
        </span>
        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${open ? "border-[#9be9e5]/48 bg-[#2a8d8b]/34 text-[#d7fffd]" : "border-white/10 bg-white/[0.035] text-white/62 group-hover:border-[#7bd7d4]/25 group-hover:text-white"}`}>
          <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && position ? createPortal(
        <div
          ref={menuRef}
          className="overflow-hidden rounded-[18px] border border-[#7bd7d4]/42 bg-[#202c3d]/[0.99] p-2 shadow-[0_28px_70px_rgba(2,6,23,0.72)] backdrop-blur-xl"
          style={{ position: "fixed", zIndex: 1120, left: position.left, width: position.width, top: position.top, bottom: position.bottom, color: "#ffffff" }}
          role="listbox"
        >
          <div className="max-h-[310px] space-y-1 overflow-y-auto pr-0.5">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__all"}
                  type="button"
                  className={`group/item flex min-h-10 w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-sm font-normal transition ${
                    active
                      ? "border-[#8ce7e2]/44 bg-gradient-to-r from-[#2a8d8b] to-[#287b82] shadow-[0_8px_18px_rgba(42,141,139,0.18)]"
                      : "border-transparent bg-[#2e3b4f] hover:border-white/10 hover:bg-[#3a4a61]"
                  }`}
                  style={{ color: "#ffffff" }}
                  onClick={() => { onChange(option.value); setOpen(false); }}
                  role="option"
                  aria-selected={active}
                >
                  <span className={`h-6 w-1 shrink-0 rounded-full transition ${active ? "bg-[#bff8f5]" : "bg-white/0 group-hover/item:bg-white/18"}`} />
                  <span className="min-w-0 flex-1 truncate" style={{ color: active ? "#ffffff" : "rgba(255,255,255,0.88)" }}>{option.label}</span>
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
                    {active ? <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#d8fffd] text-[#176b69] shadow-[0_4px_12px_rgba(0,0,0,0.18)]"><Check size={17} strokeWidth={2.8} /></span> : null}
                  </span>
                </button>
              );
            })}
          </div>
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

function isoDateParts(value?: string | null) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
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
  const [yearMode, setYearMode] = useState(false);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const parsed = isoDateParts(value);
  const [viewYear, setViewYear] = useState(parsed?.year || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState((parsed?.month || new Date().getMonth() + 1) - 1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const todayIso = localIsoDate();
  const currentYear = Number(todayIso.slice(0, 4));
  const yearChoices = Array.from({ length: 16 }, (_, index) => currentYear + 1 - index);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const edge = 10;
    const gap = 8;
    const width = Math.min(336, window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const estimatedHeight = 410;
    const roomBelow = window.innerHeight - rect.bottom - edge;
    const roomAbove = rect.top - edge;
    if (roomBelow < estimatedHeight && roomAbove > roomBelow) {
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
    setYearMode(false);
    updatePosition();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
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
        onClick={() => { if (!open) updatePosition(); setOpen((current) => !current); }}
        className={`group flex h-11 w-full items-center justify-between rounded-[13px] border px-3 text-left text-sm font-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none transition ${
          open
            ? "border-[#8ce7e2]/72 bg-gradient-to-b from-[#315268] to-[#2b4054] ring-2 ring-[#7bd7d4]/14"
            : "border-white/18 bg-gradient-to-b from-[#2d394b] to-[#293548] hover:border-[#7bd7d4]/38 hover:from-[#324157] hover:to-[#2c3a4e]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5"><CalendarDays size={16} className="shrink-0 text-[#8fe9e5]" /><span className="truncate tracking-[0.02em]">{huDateLabel(value)}</span></span>
        <ChevronDown size={14} className={`shrink-0 text-white/52 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && position ? createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label={`${ariaLabel} naptár`}
          className="fixed z-[1140] overflow-hidden rounded-[20px] border border-[#8ce7e2]/42 bg-[#202c3d]/[0.995] p-3 text-white shadow-[0_30px_80px_rgba(2,6,23,0.76)] backdrop-blur-xl"
          style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom }}
        >
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-[#29374b] px-2 py-2">
            <button type="button" onClick={() => shiftMonth(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/76 transition hover:border-[#7bd7d4]/35 hover:bg-[#2a8d8b]/18 hover:text-white" aria-label="Előző hónap"><ChevronLeft size={17} /></button>
            <button type="button" onClick={() => setYearMode((current) => !current)} className={`min-w-[170px] rounded-lg border px-3 py-1.5 text-center transition ${yearMode ? "border-[#8ce7e2]/42 bg-[#2a8d8b]/24" : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"}`} title="Év kiválasztása">
              <p className="text-[9px] uppercase tracking-[0.16em] text-[#cffffd]/48">{yearMode ? "Év kiválasztása" : "Naptár"}</p>
              <p className="mt-0.5 text-sm font-medium text-white">{viewYear}. {yearMode ? "" : HU_MONTHS[viewMonth]}</p>
            </button>
            <button type="button" onClick={() => shiftMonth(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/76 transition hover:border-[#7bd7d4]/35 hover:bg-[#2a8d8b]/18 hover:text-white" aria-label="Következő hónap"><ChevronRight size={17} /></button>
          </div>

          {yearMode ? (
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {yearChoices.map((year) => (
                <button key={year} type="button" onClick={() => { setViewYear(year); setYearMode(false); }} className={`h-10 rounded-lg border text-xs transition ${year === viewYear ? "border-[#bff8f5]/60 bg-[#2a8d8b] text-white" : "border-white/8 bg-[#2e3b4f] text-white/76 hover:border-[#7bd7d4]/28 hover:bg-[#3a4a61] hover:text-white"}`}>{year}</button>
              ))}
            </div>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-7 gap-1">
                {HU_WEEKDAYS.map((day, index) => <div key={day} className={`py-1 text-center text-[10px] font-medium uppercase tracking-[0.05em] ${index >= 5 ? "text-rose-100/55" : "text-[#cffffd]/60"}`}>{day}</div>)}
                {days.map((day) => {
                  const iso = isoFromUtcDate(day);
                  const inMonth = day.getUTCMonth() === viewMonth;
                  const selected = iso === value;
                  const today = iso === todayIso;
                  const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
                  return (
                    <button key={iso} type="button" onClick={() => chooseDate(iso)} className={`relative flex h-9 items-center justify-center rounded-lg border text-xs transition ${selected ? "border-[#bff8f5]/70 bg-gradient-to-br from-[#2a9a96] to-[#247b82] font-semibold text-white shadow-[0_6px_16px_rgba(42,141,139,0.30)]" : inMonth ? weekend ? "border-transparent bg-white/[0.025] text-rose-50/72 hover:border-[#7bd7d4]/22 hover:bg-white/[0.08] hover:text-white" : "border-transparent bg-white/[0.025] text-white/88 hover:border-[#7bd7d4]/22 hover:bg-white/[0.08] hover:text-white" : "border-transparent text-white/24 hover:bg-white/[0.04] hover:text-white/48"}`}>
                      {day.getUTCDate()}{today && !selected ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#7bd7d4]" /> : null}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-3"><span className="text-[10px] text-white/40">Az évre kattintva közvetlenül válthatsz évet.</span><button type="button" onClick={() => chooseDate(todayIso)} className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#8ce7e2]/30 bg-[#2a8d8b]/18 px-3 text-[11px] text-[#d8fffd] transition hover:bg-[#2a8d8b]/32"><CalendarDays size={13} />Ma</button></div>
            </>
          )}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function HungarianMonthPicker({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  const initialYear = match ? Number(match[1]) : new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [yearMode, setYearMode] = useState(false);
  const [year, setYear] = useState(initialYear);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const currentYear = Number(localIsoDate().slice(0, 4));
  const yearChoices = Array.from({ length: 16 }, (_, index) => currentYear + 1 - index);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const edge = 10;
    const gap = 8;
    const width = Math.min(360, window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const roomBelow = window.innerHeight - rect.bottom - edge;
    const roomAbove = rect.top - edge;
    if (roomBelow < 350 && roomAbove > roomBelow) setPosition({ left, width, bottom: Math.max(edge, window.innerHeight - rect.top + gap) });
    else setPosition({ left, width, top: Math.max(edge, rect.bottom + gap) });
  }, []);

  useEffect(() => {
    if (!open) return;
    const current = String(value || "").match(/^(\d{4})-(\d{2})$/);
    if (current) setYear(Number(current[1]));
    setYearMode(false);
    updatePosition();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const reposition = () => updatePosition();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition, value]);

  const selectedMonth = match ? Number(match[2]) - 1 : -1;
  const selectedYear = match ? Number(match[1]) : -1;
  const label = match ? `${match[1]}. ${HU_MONTHS[Number(match[2]) - 1]}` : "Hónap választása";

  return (
    <>
      <button ref={triggerRef} type="button" aria-label={ariaLabel} onClick={() => { if (!open) updatePosition(); setOpen((current) => !current); }} className={`group flex h-11 w-full items-center justify-between rounded-[13px] border px-3 text-left text-sm font-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition ${open ? "border-[#8ce7e2]/72 bg-gradient-to-b from-[#315268] to-[#2b4054] ring-2 ring-[#7bd7d4]/14" : "border-white/18 bg-gradient-to-b from-[#2d394b] to-[#293548] hover:border-[#7bd7d4]/38 hover:from-[#324157] hover:to-[#2c3a4e]"}`}>
        <span className="flex min-w-0 items-center gap-2.5"><CalendarDays size={16} className="shrink-0 text-[#8fe9e5]" /><span className="truncate">{label}</span></span><ChevronDown size={14} className={`shrink-0 text-white/52 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && position ? createPortal(
        <div ref={menuRef} className="fixed z-[1140] overflow-hidden rounded-[20px] border border-[#8ce7e2]/42 bg-[#202c3d]/[0.995] p-3 text-white shadow-[0_30px_80px_rgba(2,6,23,0.76)] backdrop-blur-xl" style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom }}>
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#29374b] px-2 py-2">
            <button type="button" onClick={() => setYear((current) => current - 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/76 transition hover:border-[#7bd7d4]/35 hover:bg-[#2a8d8b]/18"><ChevronLeft size={17} /></button>
            <button type="button" onClick={() => setYearMode((current) => !current)} className={`min-w-[150px] rounded-lg border px-3 py-1.5 text-sm font-medium transition ${yearMode ? "border-[#8ce7e2]/42 bg-[#2a8d8b]/24" : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"}`}>{year}</button>
            <button type="button" onClick={() => setYear((current) => current + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/76 transition hover:border-[#7bd7d4]/35 hover:bg-[#2a8d8b]/18"><ChevronRight size={17} /></button>
          </div>
          {yearMode ? (
            <div className="mt-3 grid grid-cols-4 gap-1.5">{yearChoices.map((candidate) => <button key={candidate} type="button" onClick={() => { setYear(candidate); setYearMode(false); }} className={`h-10 rounded-lg border text-xs transition ${candidate === year ? "border-[#bff8f5]/60 bg-[#2a8d8b] text-white" : "border-white/8 bg-[#2e3b4f] text-white/76 hover:border-[#7bd7d4]/28 hover:bg-[#3a4a61]"}`}>{candidate}</button>)}</div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">{HU_MONTHS.map((month, index) => { const active = selectedYear === year && selectedMonth === index; return <button key={month} type="button" onClick={() => { onChange(`${year}-${String(index + 1).padStart(2, "0")}`); setOpen(false); }} className={`min-h-12 rounded-xl border px-2 text-xs transition ${active ? "border-[#bff8f5]/60 bg-[#2a8d8b] text-white" : "border-white/8 bg-[#2e3b4f] text-white/76 hover:border-[#7bd7d4]/28 hover:bg-[#3a4a61] hover:text-white"}`}>{month}</button>; })}</div>
          )}
          <p className="mt-3 border-t border-white/8 pt-3 text-[10px] text-white/40">Az évszámra kattintva közvetlenül választhatsz évet.</p>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function DateControl({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <div className="grid min-w-0 gap-1.5 text-[9px] uppercase tracking-[0.11em] text-white/42">
      <span>{label}</span>
      <HungarianDatePicker value={value} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

function DeltaPill({ value, inverse = false }: { value: number | null | undefined; inverse?: boolean }) {
  const neutral = value === null || value === undefined || Math.abs(value) < 0.05;
  const rawPositive = !neutral && numberValue(value) > 0;
  const positive = inverse ? !rawPositive : rawPositive;
  const Icon = neutral ? Activity : rawPositive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[9px] ${
        neutral
          ? "border-white/10 bg-white/[0.04] text-white/46"
          : positive
            ? "border-emerald-200/20 bg-emerald-400/10 text-emerald-50"
            : "border-rose-200/20 bg-rose-400/10 text-rose-50"
      }`}
    >
      <Icon size={10} />
      {value === null || value === undefined ? "új" : `${value > 0 ? "+" : ""}${numberValue(value).toFixed(1)}%`}
    </span>
  );
}

function MetricCard({
  title,
  value,
  comparison,
  delta,
  icon: Icon,
  hint,
  active = false,
  tone = "normal",
  onClick,
  warning,
}: {
  title: string;
  value: string;
  comparison: string;
  delta: number | null | undefined;
  icon: ComponentType<{ size?: number; className?: string }>;
  hint: string;
  active?: boolean;
  tone?: "normal" | "success" | "warning" | "danger" | "accent";
  onClick?: () => void;
  warning?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "from-[#4a2633] via-[#382b3b] to-[#283145] border-rose-200/22"
      : tone === "warning"
        ? "from-[#4b4029] via-[#383a39] to-[#283145] border-amber-200/20"
        : tone === "success"
          ? "from-[#145f59] via-[#23515a] to-[#283145] border-[#8ce7e2]/28"
          : tone === "accent"
            ? "from-[#1d5563] via-[#27475a] to-[#283145] border-[#8ce7e2]/24"
            : "from-[#2c3c51] via-[#263448] to-[#202c3d] border-white/12";

  const content = (
    <>
      <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-[#bff8f5]/45 to-transparent" />
      <span className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#7bd7d4]/[0.07] blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[9px] uppercase tracking-[0.14em] text-white/54">{title}</p>
            {warning ? (
              <FloatingHint content={warning}>
                <span tabIndex={0} className="inline-flex cursor-help text-amber-100/75"><AlertTriangle size={12} /></span>
              </FloatingHint>
            ) : null}
          </div>
          <p className="mt-2 truncate text-[clamp(1.05rem,1.45vw,1.5rem)] font-medium tracking-tight text-white" title={value}>{value}</p>
        </div>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${active ? "border-[#bff8f5]/48 bg-[#2a8d8b]/34 text-[#d8fffd]" : "border-white/12 bg-white/[0.045] text-[#bff8f5]"}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] text-white/42" title={hint}>{hint}</p>
          <p className="mt-1 truncate text-[9px] text-white/32" title={comparison}>Összehasonlítás: {comparison}</p>
        </div>
        <DeltaPill value={delta} inverse={title === "Kedvezmény" || title === "Kintlévőség"} />
      </div>
    </>
  );

  const className = `relative min-w-0 overflow-hidden rounded-[20px] border bg-gradient-to-br p-3.5 text-left shadow-[0_14px_34px_rgba(2,6,23,0.22)] ${toneClass} ${active ? "ring-2 ring-[#7bd7d4]/22" : ""}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} w-full transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0`}>
        {content}
      </button>
    );
  }
  return <article className={className}>{content}</article>;
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) / 2;
    path += ` C ${midX} ${previous.y}, ${midX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

function CompareChart({
  data,
  metric,
  onMetricChange,
  currentLabel,
  comparisonLabel,
  onBucketClick,
}: {
  data: AifSalesCommandOverviewResponse["trend"];
  metric: ChartMetric;
  onMetricChange: (metric: ChartMetric) => void;
  currentLabel: string;
  comparisonLabel: string;
  onBucketClick: (index: number) => void;
}) {
  const width = 980;
  const height = 360;
  const padding = { left: 62, right: 26, top: 28, bottom: 54 };
  const current = data.current || [];
  const comparison = data.comparison || [];
  const count = Math.max(current.length, comparison.length, 1);
  const values = [
    ...current.map((item) => metricValue(item, metric)),
    ...comparison.map((item) => metricValue(item, metric)),
  ];
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (Math.abs(max - min) < 0.000001) max = min + 1;
  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;
  const xAt = (index: number) => count <= 1 ? padding.left + usableWidth / 2 : padding.left + (index / (count - 1)) * usableWidth;
  const yAt = (value: number) => padding.top + ((max - value) / (max - min)) * usableHeight;
  const zeroY = yAt(0);
  const currentPoints = current.map((item, index) => ({ x: xAt(index), y: yAt(metricValue(item, metric)), item, value: metricValue(item, metric) }));
  const comparisonPoints = comparison.map((item, index) => ({ x: xAt(index), y: yAt(metricValue(item, metric)), item, value: metricValue(item, metric) }));
  const currentLine = smoothPath(currentPoints);
  const comparisonLine = smoothPath(comparisonPoints);
  const currentArea = currentPoints.length
    ? `${currentLine} L ${currentPoints[currentPoints.length - 1].x} ${zeroY} L ${currentPoints[0].x} ${zeroY} Z`
    : "";
  const comparisonArea = comparisonPoints.length
    ? `${comparisonLine} L ${comparisonPoints[comparisonPoints.length - 1].x} ${zeroY} L ${comparisonPoints[0].x} ${zeroY} Z`
    : "";
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const metricConfig = chartMetricConfig[metric];
  const labelStep = Math.max(1, Math.ceil(count / 9));
  const empty = values.every((value) => Math.abs(value) < 0.000001);

  const move = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * width;
    const raw = count <= 1 ? 0 : Math.round(((viewX - padding.left) / usableWidth) * (count - 1));
    setHoverIndex(Math.max(0, Math.min(count - 1, raw)));
  };

  const hoverCurrent = hoverIndex === null ? undefined : current[hoverIndex];
  const hoverComparison = hoverIndex === null ? undefined : comparison[hoverIndex];
  const hoverX = hoverIndex === null ? 0 : xAt(hoverIndex);
  const tooltipLeft = hoverIndex === null ? 0 : `${Math.max(9, Math.min(91, (hoverX / width) * 100))}%`;

  return (
    <section className={`${panel} overflow-hidden p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-[#bff8f5]/44">Idősoros összehasonlítás</p>
          <h2 className="mt-1 text-lg text-white">{metricConfig.label} alakulása</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(chartMetricConfig) as ChartMetric[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onMetricChange(key)}
              className={`h-8 rounded-lg border px-2.5 text-[10px] transition ${
                metric === key
                  ? "border-[#9be9e5]/46 bg-[#2a8d8b] text-white"
                  : "border-white/10 bg-white/[0.035] text-white/52 hover:border-white/20 hover:text-white"
              }`}
            >
              {chartMetricConfig[key].short}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/48">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-full bg-[#58d7d0]" />{currentLabel}</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-5 rounded-full bg-[#f0a43b]" />{comparisonLabel}</span>
        </div>
        <span>Kattints egy pontra a pontos időszak megnyitásához</span>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/8 bg-[#111c2b]/70">
        {empty ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="rounded-2xl border border-white/10 bg-[#162235]/94 px-5 py-4 text-center shadow-xl">
              <BarChart3 className="mx-auto text-[#7bd7d4]" size={26} />
              <p className="mt-2 text-sm text-white">Ebben a két időszakban nincs megjeleníthető adat.</p>
            </div>
          </div>
        ) : null}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[330px] w-full cursor-crosshair sm:h-[360px]"
          onMouseMove={move}
          onMouseLeave={() => setHoverIndex(null)}
          onClick={() => hoverIndex !== null && onBucketClick(hoverIndex)}
          role="img"
          aria-label={`${metricConfig.label} összehasonlító diagram`}
        >
          <defs>
            <linearGradient id="commandCurrentArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#58d7d0" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#58d7d0" stopOpacity="0.015" />
            </linearGradient>
            <linearGradient id="commandComparisonArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0a43b" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#f0a43b" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = min + (max - min) * ratio;
            const y = yAt(value);
            return (
              <g key={ratio}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,0.075)" />
                <text x={padding.left - 10} y={y + 4} fill="rgba(255,255,255,0.35)" fontSize="10" textAnchor="end">
                  {compactNumber(value)}
                </text>
              </g>
            );
          })}
          {min < 0 && max > 0 ? <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.18)" /> : null}
          {comparisonArea ? <path d={comparisonArea} fill="url(#commandComparisonArea)" /> : null}
          {currentArea ? <path d={currentArea} fill="url(#commandCurrentArea)" /> : null}
          {comparisonLine ? <path d={comparisonLine} fill="none" stroke="#f0a43b" strokeWidth="3" strokeLinecap="round" /> : null}
          {currentLine ? <path d={currentLine} fill="none" stroke="#58d7d0" strokeWidth="4" strokeLinecap="round" /> : null}

          {Array.from({ length: count }, (_, index) => {
            const item = current[index] || comparison[index];
            if (!item || (index % labelStep !== 0 && index !== count - 1)) return null;
            return (
              <text key={index} x={xAt(index)} y={height - 17} fill="rgba(255,255,255,0.42)" fontSize="10" textAnchor="middle">
                {item.label}
              </text>
            );
          })}

          {hoverIndex !== null ? (
            <g>
              <line x1={hoverX} x2={hoverX} y1={padding.top} y2={height - padding.bottom} stroke="rgba(255,255,255,0.30)" strokeDasharray="4 5" />
              {hoverCurrent ? <circle cx={hoverX} cy={yAt(metricValue(hoverCurrent, metric))} r="6" fill="#d8fffd" stroke="#2a8d8b" strokeWidth="3" /> : null}
              {hoverComparison ? <circle cx={hoverX} cy={yAt(metricValue(hoverComparison, metric))} r="5" fill="#fff4dc" stroke="#f0a43b" strokeWidth="3" /> : null}
            </g>
          ) : null}
        </svg>

        {hoverIndex !== null ? (
          <div
            className="pointer-events-none absolute top-4 z-20 w-[230px] -translate-x-1/2 rounded-xl border border-[#7bd7d4]/24 bg-[#0e1826]/[0.97] p-3 text-xs shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl"
            style={{ left: tooltipLeft }}
          >
            <p className="text-[9px] uppercase tracking-[0.13em] text-white/38">{metricConfig.label}</p>
            <div className="mt-2 space-y-2">
              <div>
                <div className="flex items-center justify-between gap-3"><span className="text-[#9ff3ee]">Vizsgált</span><strong className="font-medium text-white">{metricConfig.format(metricValue(hoverCurrent, metric))}</strong></div>
                <p className="mt-0.5 text-[9px] text-white/34">{hoverCurrent ? `${huDate(hoverCurrent.start)} – ${huDate(hoverCurrent.end)}` : "Nincs időszak"}</p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3"><span className="text-amber-100">Összehasonlítás</span><strong className="font-medium text-white">{metricConfig.format(metricValue(hoverComparison, metric))}</strong></div>
                <p className="mt-0.5 text-[9px] text-white/34">{hoverComparison ? `${huDate(hoverComparison.start)} – ${huDate(hoverComparison.end)}` : "Nincs időszak"}</p>
              </div>
              <div className="border-t border-white/8 pt-2">
                <DeltaPill value={deltaValue(metricValue(hoverCurrent, metric), metricValue(hoverComparison, metric))} inverse={metric === "discountTotal" || metric === "unpaidTotal"} />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EmployeeRanking({
  rows,
  metric,
  selected,
  onSelect,
}: {
  rows: AifSalesCommandOverviewResponse["employees"];
  metric: ChartMetric;
  selected: string;
  onSelect: (actor: string) => void;
}) {
  const visible = rows.slice(0, 12);
  const max = Math.max(
    1,
    ...visible.flatMap((row) => [Math.abs(metricValue(row.current, metric)), Math.abs(metricValue(row.comparison, metric))]),
  );
  return (
    <section className={`${panel} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-[#bff8f5]/44">Csapatrangsor</p>
          <h2 className="mt-1 text-lg text-white">Eladók teljesítménye</h2>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 text-[#cffffd]"><Users size={18} /></span>
      </div>
      <div className="mt-4 space-y-2.5">
        {visible.map((row) => {
          const currentValue = metricValue(row.current, metric);
          const comparisonValue = metricValue(row.comparison, metric);
          const active = selected.toLocaleLowerCase("hu-HU") === row.actor.toLocaleLowerCase("hu-HU");
          return (
            <button
              key={row.actor}
              type="button"
              onClick={() => onSelect(active ? "" : row.actor)}
              className={`group w-full rounded-2xl border p-3 text-left transition ${
                active
                  ? "border-[#8ce7e2]/46 bg-[#2a8d8b]/18 ring-1 ring-[#7bd7d4]/15"
                  : "border-white/8 bg-white/[0.025] hover:border-white/16 hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[10px] ${row.rank === 1 ? "border-amber-200/30 bg-amber-400/14 text-amber-50" : "border-white/10 bg-white/[0.04] text-white/52"}`}>{row.rank}</span>
                  <span className="truncate text-xs text-white/84">{row.actor}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-white">{chartMetricConfig[metric].format(currentValue)}</span>
                  <DeltaPill value={row.deltaPercent?.[metric]} inverse={metric === "discountTotal" || metric === "unpaidTotal"} />
                </span>
              </div>
              <div className="mt-2.5 space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-[#101a28]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#64ddd7]" style={{ width: `${Math.max(currentValue === 0 ? 0 : 3, Math.abs(currentValue) / max * 100)}%` }} />
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[#101a28]">
                  <div className="h-full rounded-full bg-[#f0a43b]/80" style={{ width: `${Math.max(comparisonValue === 0 ? 0 : 2, Math.abs(comparisonValue) / max * 100)}%` }} />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px] text-white/34">
                <span>{integer(row.current.itemsSold)} db • {integer(row.current.transactions)} eladás</span>
                <span>Korábban: {chartMetricConfig[metric].format(comparisonValue)}</span>
              </div>
            </button>
          );
        })}
        {!visible.length ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-white/38">Nincs rangsorolható eladói adat.</div> : null}
      </div>
    </section>
  );
}

function DimensionPanel({
  dimensions,
  activeDimension,
  onDimensionChange,
  metric,
  onDrill,
}: {
  dimensions: AifSalesCommandOverviewResponse["dimensions"];
  activeDimension: AifSalesCommandDimensionKey;
  onDimensionChange: (dimension: AifSalesCommandDimensionKey) => void;
  metric: ChartMetric;
  onDrill: (dimension: AifSalesCommandDimensionKey, item: AifSalesCommandDimensionItem) => void;
}) {
  const items = dimensions?.[activeDimension] || [];
  const max = Math.max(1, ...items.flatMap((item) => [Math.abs(metricValue(item.current, metric)), Math.abs(metricValue(item.comparison, metric))]));
  return (
    <section className={`${panel} overflow-hidden`}>
      <div className="border-b border-white/8 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[#bff8f5]/44">Értékesítési bontás</p>
            <h2 className="mt-1 text-lg text-white">Eladások részletes bontása</h2>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 text-[#cffffd]"><Layers3 size={18} /></span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(Object.keys(dimensionLabels) as AifSalesCommandDimensionKey[]).map((dimension) => (
            <button
              key={dimension}
              type="button"
              onClick={() => onDimensionChange(dimension)}
              className={`h-8 rounded-lg border px-2.5 text-[10px] transition ${
                activeDimension === dimension
                  ? "border-[#9be9e5]/44 bg-[#2a8d8b] text-white"
                  : "border-white/10 bg-white/[0.03] text-white/48 hover:border-white/18 hover:text-white"
              }`}
            >
              {dimensionLabels[dimension]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 p-4 md:grid-cols-2">
        {items.slice(0, 16).map((item) => {
          const currentValue = metricValue(item.current, metric);
          const comparisonValue = metricValue(item.comparison, metric);
          return (
            <button
              key={`${activeDimension}:${item.key}`}
              type="button"
              onClick={() => onDrill(activeDimension, item)}
              className="group rounded-2xl border border-white/8 bg-white/[0.025] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#7bd7d4]/28 hover:bg-white/[0.05] active:translate-y-0"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-xs text-white/84" title={item.name}>{item.rank}. {item.name}</span>
                  <span className="mt-1 block truncate text-[9px] text-white/34">{item.meta || `${integer(item.current.itemsSold)} db • ${integer(item.current.transactions)} tranzakció`}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs text-white">{chartMetricConfig[metric].format(currentValue)}</span>
                  <span className="mt-1 inline-flex"><DeltaPill value={item.deltaPercent?.[metric]} inverse={metric === "discountTotal" || metric === "unpaidTotal"} /></span>
                </span>
              </div>
              <div className="mt-2.5 space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-[#101a28]"><div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#64ddd7]" style={{ width: `${Math.max(currentValue === 0 ? 0 : 3, Math.abs(currentValue) / max * 100)}%` }} /></div>
                <div className="h-1 overflow-hidden rounded-full bg-[#101a28]"><div className="h-full rounded-full bg-[#f0a43b]/75" style={{ width: `${Math.max(comparisonValue === 0 ? 0 : 2, Math.abs(comparisonValue) / max * 100)}%` }} /></div>
              </div>
            </button>
          );
        })}
        {!items.length ? <div className="col-span-full rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-xs text-white/38">Ebben a bontásban nincs megjeleníthető adat.</div> : null}
      </div>
    </section>
  );
}

function Heatmap({
  heatmap,
  metric,
  onCellClick,
}: {
  heatmap: AifSalesCommandOverviewResponse["heatmap"];
  metric: "revenue" | "itemsSold" | "transactions" | "grossProfit";
  onCellClick: (actor: string, month: AifSalesCommandOverviewResponse["heatmap"]["months"][number]) => void;
}) {
  const values = heatmap.rows.flatMap((row) => row.values.map((value) => Math.abs(metricValue(value.current, metric))));
  const max = Math.max(1, ...values);
  const label = chartMetricConfig[metric].label;
  return (
    <section className={`${panel} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 p-4">
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-[#bff8f5]/44">Havi eladói teljesítmény</p>
          <h2 className="mt-1 text-lg text-white">Eladók havi összehasonlítása</h2>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/38">
          <span>Alacsonyabb</span><span className="h-2.5 w-20 rounded-full bg-gradient-to-r from-[#172334] via-[#235d61] to-[#5ce0d9]" /><span>Magasabb</span>
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        <div className="min-w-[760px]">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `minmax(180px,1.3fr) repeat(${Math.max(1, heatmap.months.length)}, minmax(92px,1fr))` }}>
            <div className="px-2 py-2 text-[9px] uppercase tracking-[0.12em] text-white/34">Eladó</div>
            {heatmap.months.map((month) => <div key={month.index} className="px-2 py-2 text-center text-[9px] text-white/44">{month.label}</div>)}
            {heatmap.rows.slice(0, 20).map((row) => (
              <div key={row.actor} className="contents">
                <div className="flex items-center gap-2 rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2.5 text-xs text-white/76"><UserRound size={13} className="text-[#8ee6e2]" /><span className="truncate">{row.actor}</span></div>
                {heatmap.months.map((month, index) => {
                  const value = row.values[index];
                  const currentValue = metricValue(value?.current, metric);
                  const ratio = Math.min(1, Math.abs(currentValue) / max);
                  const negative = currentValue < 0;
                  const background = negative
                    ? `rgba(225, 65, 92, ${0.12 + ratio * 0.65})`
                    : `rgba(42, 141, 139, ${0.08 + ratio * 0.78})`;
                  return (
                    <FloatingHint
                      key={`${row.actor}:${month.index}`}
                      content={
                        <div>
                          <p className="font-medium text-white">{row.actor} • {month.label}</p>
                          <p className="mt-1 text-[#aef4f0]">{label}: {chartMetricConfig[metric].format(currentValue)}</p>
                          <p className="text-amber-100/82">Korábban: {chartMetricConfig[metric].format(metricValue(value?.comparison, metric))}</p>
                          <p className="mt-1 text-white/45">{month.currentStart ? `${huDate(month.currentStart)} – ${huDate(month.currentEnd)}` : "Nincs vizsgált hónap"}</p>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => onCellClick(row.actor, month)}
                        className="flex min-h-11 w-full items-center justify-center rounded-xl border border-white/7 px-2 text-[10px] text-white transition hover:border-[#bff8f5]/38 hover:brightness-125"
                        style={{ background }}
                      >
                        <span className="truncate">{currentValue === 0 ? "–" : chartMetricConfig[metric].format(currentValue)}</span>
                      </button>
                    </FloatingHint>
                  );
                })}
              </div>
            ))}
          </div>
          {!heatmap.rows.length ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-xs text-white/38">Nincs hőtérképre tehető alkalmazotti adat.</div> : null}
        </div>
      </div>
    </section>
  );
}

function CoverageStrip({ data }: { data: AifSalesCommandOverviewResponse }) {
  const items = [
    {
      label: "Vételár-lefedettség",
      current: data.coverage.current.cost,
      comparison: data.coverage.comparison.cost,
      hint: "A nyereség csak azoknál a soroknál teljesen biztos, ahol van eladáskori vagy jelenlegi vételár.",
    },
    {
      label: "Nettó-lefedettség",
      current: data.coverage.current.net,
      comparison: data.coverage.comparison.net,
      hint: "A történeti sorok nettó értékéhez nettó forgalom vagy TVA-kulcs szükséges.",
    },
    {
      label: "Történeti részletezettség",
      current: data.coverage.current.historyDetail,
      comparison: data.coverage.comparison.historyDetail,
      hint: "A márka-, méret- és termékbontás csak a részletesen rögzített történeti forgalomra értelmezhető.",
    },
  ];
  return (
    <section className={`${panel} p-3.5`}>
      <div className="grid gap-3 lg:grid-cols-[180px_repeat(3,1fr)] lg:items-center">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 text-[#cffffd]"><ShieldCheck size={17} /></span>
          <div><p className="text-[9px] uppercase tracking-[0.13em] text-white/38">Adatbiztonság</p><p className="mt-1 text-xs text-white/70">Mit tudunk biztosan?</p></div>
        </div>
        {items.map((item) => (
          <FloatingHint key={item.label} content={item.hint}>
            <div className="w-full rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 text-[9px]"><span className="truncate text-white/48">{item.label}</span><span className="text-white/76">{percentage(item.current, 0)}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#101a28]"><div className={`h-full rounded-full ${item.current >= 99 ? "bg-[#54d7ce]" : item.current >= 75 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${Math.max(0, Math.min(100, item.current))}%` }} /></div>
              <p className="mt-1.5 text-[8px] text-white/28">Összehasonlítás: {percentage(item.comparison, 0)}</p>
            </div>
          </FloatingHint>
        ))}
      </div>
    </section>
  );
}

function DetailDrawer({ item, onClose }: { item: AifSalesCommandDetailItem | null; onClose: () => void }) {
  closeOnEscape(Boolean(item), onClose);
  useEffect(() => {
    if (!item) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [item]);
  if (!item) return null;
  const rows = [
    ["Forrás", sourceLabel(item.source)],
    ["Dátum", huDate(item.date)],
    ["Üzlet", friendlyLocationLabel(item.locationCode, item.locationName)],
    ["Eladó", item.actor || "–"],
    ["Bizonylat", item.documentNumber || "Havi összesítő"],
    ["Márka", item.brandName || "–"],
    ["Főkategória", item.categoryName || "–"],
    ["Alkategória", item.subcategoryName || "–"],
    ["Termék", item.productTitle || "Összesített adat"],
    ["Termékkód", item.productCode || "–"],
    ["Szín", item.colorName || "–"],
    ["Méret", item.size || "–"],
    ["Fizetési mód", paymentLabel(item.paymentMethod)],
  ];
  return createPortal(
    <div className="fixed inset-0 z-[1100] bg-slate-950/72 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col border-l border-[#7bd7d4]/24 bg-[#172334] shadow-[-24px_0_80px_rgba(0,0,0,0.55)]">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#1c2d42] to-[#20505a] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.15em] text-white/42">Részletes adatkártya</p>
            <h3 className="mt-1 truncate text-xl text-white">{item.productTitle || item.documentNumber || "Történeti összesítő"}</h3>
            <p className="mt-1 text-xs text-white/42">{huDate(item.date)} • {item.actor}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] text-white hover:bg-white/[0.1]"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Forgalom", money(item.revenue), "text-white"],
              ["Nettó", money(item.netRevenue), "text-[#bff8f5]"],
              ["Nyereség", money(item.grossProfit), item.grossProfit >= 0 ? "text-emerald-100" : "text-rose-100"],
              ["Darab", `${integer(item.quantity)} db`, "text-white"],
              ["Kedvezmény", money(item.discountTotal), "text-amber-50"],
              ["Kintlévőség", money(item.unpaidTotal), "text-rose-50"],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/34">{label}</p><p className={`mt-1.5 text-sm ${tone}`}>{value}</p></div>
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/8">
            {rows.map(([label, value]) => <div key={label} className="grid grid-cols-[130px_1fr] gap-3 border-t border-white/7 px-4 py-3 first:border-t-0"><span className="text-[10px] uppercase tracking-[0.08em] text-white/34">{label}</span><span className="text-sm text-white/76">{value}</span></div>)}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className={`rounded-xl border px-3 py-3 ${item.costCovered ? "border-emerald-200/18 bg-emerald-400/8" : "border-amber-200/18 bg-amber-400/8"}`}><p className="text-[9px] uppercase tracking-[0.1em] text-white/34">Vételár</p><p className="mt-1 text-xs text-white/72">{item.costCovered ? `${money(item.estimatedCost)} • lefedett` : "Nincs biztos vételár-adat"}</p></div>
            <div className={`rounded-xl border px-3 py-3 ${item.netCovered ? "border-emerald-200/18 bg-emerald-400/8" : "border-amber-200/18 bg-amber-400/8"}`}><p className="text-[9px] uppercase tracking-[0.1em] text-white/34">Nettó érték</p><p className="mt-1 text-xs text-white/72">{item.netCovered ? "TVA-kezelés lefedett" : "A történeti TVA-adat hiányos"}</p></div>
          </div>
          {item.note ? <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/34">Megjegyzés</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70">{item.note}</p></div> : null}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function DetailsTable({
  rows,
  onOpen,
}: {
  rows: AifSalesCommandDetailItem[];
  onOpen: (item: AifSalesCommandDetailItem) => void;
}) {
  const [limit, setLimit] = useState(80);
  useEffect(() => setLimit(80), [rows]);
  const visible = rows.slice(0, limit);
  return (
    <section className={`${panel} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 p-4">
        <div>
          <p className="text-[9px] uppercase tracking-[0.16em] text-[#bff8f5]/44">Részletes eladási adatok</p>
          <h2 className="mt-1 text-lg text-white">Eladási tételek</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] text-white/44">{rows.length} sor</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-xs">
          <thead className="bg-[#152235] text-[9px] uppercase tracking-[0.08em] text-white/38">
            <tr>
              <th className="px-3 py-3 text-left">Forrás / dátum</th>
              <th className="px-3 py-3 text-left">Termék</th>
              <th className="px-3 py-3 text-left">Eladó / üzlet</th>
              <th className="px-3 py-3 text-center">Darab</th>
              <th className="px-3 py-3 text-right">Forgalom</th>
              <th className="px-3 py-3 text-right">Nettó</th>
              <th className="px-3 py-3 text-right">Nyereség</th>
              <th className="px-3 py-3 text-right">Kedvezmény</th>
              <th className="w-12 px-2 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={`${item.source}:${item.id}`} className="group border-t border-white/7 hover:bg-white/[0.035]">
                <td className="whitespace-nowrap px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] ${sourceBadge(item.source)}`}>{sourceLabel(item.source)}</span><p className="mt-1.5 text-[10px] text-white/42">{huDate(item.date)}{item.documentNumber ? ` • ${item.documentNumber}` : ""}</p></td>
                <td className="min-w-[260px] px-3 py-3"><p className="max-w-[310px] truncate text-white/84" title={item.productTitle || "Összesített adat"}>{item.productTitle || "Összesített havi adat"}</p><p className="mt-1 max-w-[310px] truncate text-[10px] text-white/38" title={[item.brandName, item.subcategoryName, item.colorName, item.size].filter(Boolean).join(" • ")}>{[item.brandName, item.subcategoryName, item.colorName, item.size].filter(Boolean).join(" • ") || item.granularity}</p></td>
                <td className="min-w-[160px] px-3 py-3"><p className="text-white/72">{item.actor}</p><p className="mt-1 truncate text-[10px] text-white/36">{friendlyLocationLabel(item.locationCode, item.locationName)}</p></td>
                <td className="px-3 py-3 text-center"><span className="rounded-lg border border-[#7bd7d4]/18 bg-[#2a8d8b]/10 px-2 py-1.5 text-[#d5fffd]">{integer(item.quantity)}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-white">{money(item.revenue)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-[#bff8f5]/82">{money(item.netRevenue)}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-right ${item.grossProfit >= 0 ? "text-emerald-100" : "text-rose-100"}`}>{money(item.grossProfit)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-amber-50">{money(item.discountTotal)}</td>
                <td className="px-2 py-3 text-center"><button type="button" onClick={() => onOpen(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-white/52 transition hover:border-[#7bd7d4]/28 hover:bg-[#2a8d8b]/16 hover:text-white"><ChevronRight size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <div className="px-4 py-14 text-center"><PackageSearch className="mx-auto text-[#7bd7d4]/62" size={28} /><p className="mt-2 text-sm text-white/66">Nincs részletes adat a kiválasztott feltételekkel.</p></div> : null}
      </div>
      {limit < rows.length ? <div className="flex justify-center border-t border-white/8 p-3"><button type="button" className={neutralButton} onClick={() => setLimit((current) => current + 80)}>További sorok</button></div> : null}
    </section>
  );
}

function FieldLabel({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="grid min-w-0 gap-1.5 text-[9px] uppercase tracking-[0.1em] text-white/42"><span className="flex items-center gap-1.5">{label}{hint ? <FloatingHint content={hint}><Info size={11} className="cursor-help text-white/36" /></FloatingHint> : null}</span>{children}</label>;
}

function HistoryModal({
  open,
  onClose,
  data,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  data: AifSalesCommandOverviewResponse | null;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const today = localIsoDate();
  const defaultMonth = `${Number(today.slice(0, 4)) - 1}-${today.slice(5, 7)}`;
  const defaultLocation = data?.filterOptions.locations.find((location) => location.code === "main_warehouse")?.code
    || data?.filterOptions.locations[0]?.code
    || "main_warehouse";
  const [manualRows, setManualRows] = useState<AifSalesHistoryInputRow[]>([]);
  const [manualDraft, setManualDraft] = useState<ManualHistoryDraft>({
    month: defaultMonth,
    location: defaultLocation,
    actor: "",
    revenue: "",
    quantity: "",
    transactions: "",
    estimatedCost: "",
    discountTotal: "",
    unpaidTotal: "",
    note: "",
  });

  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess("");
  }, [open]);

  useEffect(() => {
    if (!data) return;
    const location = data.filterOptions.locations.find((item) => item.code === "main_warehouse")?.code
      || data.filterOptions.locations[0]?.code
      || defaultLocation;
    setManualDraft((current) => ({ ...current, location: current.location || location }));
  }, [data, defaultLocation]);

  closeOnEscape(open, onClose);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const locationOptions = useMemo<SelectOption[]>(() => {
    const fromServer = (data?.filterOptions.locations || [])
      .filter((location) => SALES_STORE_CODES.has(String(location.code || "")))
      .map((location) => ({
        value: location.code,
        label: friendlyLocationLabel(location.code, location.name),
      }));
    if (fromServer.length) return fromServer;
    return [
      { value: "main_warehouse", label: "Csíkszereda" },
      { value: "magazin_targu_secuiesc", label: "Kézdivásárhely" },
    ];
  }, [data?.filterOptions.locations]);

  function addManualRow() {
    setError("");
    setSuccess("");
    const revenue = nullableNumber(manualDraft.revenue);
    if (!manualDraft.month || !manualDraft.location || !manualDraft.actor.trim() || revenue === null) {
      setError("A hónap, üzlet, eladó és forgalom kötelező.");
      return;
    }
    const row: AifSalesHistoryInputRow = {
      rowNo: manualRows.length + 1,
      soldOn: `${manualDraft.month}-01`,
      location: manualDraft.location,
      actor: manualDraft.actor.trim(),
      sourceGranularity: "monthly",
      revenue,
      quantity: nullableNumber(manualDraft.quantity),
      transactions: nullableNumber(manualDraft.transactions),
      estimatedCost: nullableNumber(manualDraft.estimatedCost),
      discountTotal: nullableNumber(manualDraft.discountTotal),
      unpaidTotal: nullableNumber(manualDraft.unpaidTotal),
      tvaRate: data?.salesTva.rate ?? 21,
      priceIncludesTva: data?.salesTva.priceIncludesTva !== false,
      note: manualDraft.note.trim() || null,
    };
    setManualRows((current) => [...current, row]);
    setManualDraft((current) => ({
      ...current,
      revenue: "",
      quantity: "",
      transactions: "",
      estimatedCost: "",
      discountTotal: "",
      unpaidTotal: "",
      note: "",
    }));
  }

  async function saveManualRows() {
    if (!manualRows.length || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const firstMonth = String(manualRows[0]?.soldOn || "").slice(0, 7);
      const lastMonth = String(manualRows[manualRows.length - 1]?.soldOn || "").slice(0, 7);
      await apiAifCreateSalesHistoryImport({
        sourceName: firstMonth === lastMonth
          ? `Kézi történeti adat ${firstMonth}`
          : `Kézi történeti adatok ${firstMonth} – ${lastMonth}`,
        sourceKind: "manual",
        rows: manualRows,
      });
      setSuccess(`${manualRows.length} havi sor elmentve. Az elemzések frissültek.`);
      setManualRows([]);
      await onChanged();
    } catch (saveError: any) {
      setError(saveError?.message || "A visszamenőleges adatok mentése nem sikerült.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-slate-950/78 p-2 backdrop-blur-md sm:p-4"
      onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose(); }}
    >
      <section className="mx-auto flex h-full max-h-[94vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-[28px] border border-[#8ce7e2]/26 bg-[#303a4c] text-white shadow-[0_38px_130px_rgba(0,0,0,0.70)]">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#25354a] via-[#2f3b4f] to-[#28565c] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#9be9e5]/32 bg-[#2a8d8b]/22 text-[#d7fffd]"><Database size={22} /></span>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/42">Belső kézi adatbevitel • készlet és pénztár módosítása nélkül</p>
              <h2 className="mt-1 truncate text-xl text-white sm:text-2xl">Visszamenőleges eladások</h2>
            </div>
          </div>
          <button type="button" disabled={saving} onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] text-white hover:bg-white/[0.1]"><X size={18} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error ? <div className="mb-4 whitespace-pre-line rounded-2xl border border-rose-300/28 bg-rose-500/13 px-4 py-3 text-sm leading-6 text-rose-50"><AlertTriangle size={17} className="mr-2 inline" />{error}</div> : null}
          {success ? <div className="mb-4 rounded-2xl border border-emerald-200/24 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50"><Check size={17} className="mr-2 inline" />{success}</div> : null}

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.35fr]">
            <section className={`${panel} p-4`}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[9px] uppercase tracking-[0.14em] text-white/36">Egy hónap / egy eladó</p><h3 className="mt-1 text-base">Havi összesítő rögzítése</h3></div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 text-[#cffffd]"><CalendarDays size={17} /></span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FieldLabel label="Hónap"><HungarianMonthPicker value={manualDraft.month} onChange={(value) => setManualDraft({ ...manualDraft, month: value })} ariaLabel="Visszamenőleges eladás hónapja" /></FieldLabel>
                <FieldLabel label="Üzlet"><SelectControl value={manualDraft.location} onChange={(value) => setManualDraft({ ...manualDraft, location: value })} options={locationOptions} placeholder="Válassz üzletet" /></FieldLabel>
                <FieldLabel label="Eladó"><input className={control} value={manualDraft.actor} onChange={(event) => setManualDraft({ ...manualDraft, actor: event.target.value })} placeholder="Alkalmazott neve" /></FieldLabel>
                <FieldLabel label="Forgalom"><input inputMode="decimal" className={control} value={manualDraft.revenue} onChange={(event) => setManualDraft({ ...manualDraft, revenue: event.target.value })} placeholder="0,00" /></FieldLabel>
                <FieldLabel label="Darab"><input inputMode="decimal" className={control} value={manualDraft.quantity} onChange={(event) => setManualDraft({ ...manualDraft, quantity: event.target.value })} placeholder="0" /></FieldLabel>
                <FieldLabel label="Tranzakció"><input inputMode="decimal" className={control} value={manualDraft.transactions} onChange={(event) => setManualDraft({ ...manualDraft, transactions: event.target.value })} placeholder="0" /></FieldLabel>
                <FieldLabel label="Beszerzési érték" hint="Ebből számolható a történeti nyereség."><input inputMode="decimal" className={control} value={manualDraft.estimatedCost} onChange={(event) => setManualDraft({ ...manualDraft, estimatedCost: event.target.value })} placeholder="0,00" /></FieldLabel>
                <FieldLabel label="Kedvezmény"><input inputMode="decimal" className={control} value={manualDraft.discountTotal} onChange={(event) => setManualDraft({ ...manualDraft, discountTotal: event.target.value })} placeholder="0,00" /></FieldLabel>
                <FieldLabel label="Kintlévőség"><input inputMode="decimal" className={control} value={manualDraft.unpaidTotal} onChange={(event) => setManualDraft({ ...manualDraft, unpaidTotal: event.target.value })} placeholder="0,00" /></FieldLabel>
                <FieldLabel label="Megjegyzés"><input className={control} value={manualDraft.note} onChange={(event) => setManualDraft({ ...manualDraft, note: event.target.value })} placeholder="Opcionális" /></FieldLabel>
              </div>
              <button type="button" className={`${primaryButton} mt-4 w-full`} onClick={addManualRow}><Check size={15} />Hozzáadás</button>
            </section>

            <section className={`${panel} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 p-4">
                <div><p className="text-[9px] uppercase tracking-[0.14em] text-white/36">Mentés előtt ellenőrizhető</p><h3 className="mt-1 text-base">Rögzítendő havi adatok</h3></div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] text-white/44">{manualRows.length} sor</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-[#142033] text-[9px] uppercase tracking-[0.08em] text-white/34"><tr><th className="px-3 py-3 text-left">Hónap</th><th className="px-3 py-3 text-left">Üzlet</th><th className="px-3 py-3 text-left">Eladó</th><th className="px-3 py-3 text-right">Forgalom</th><th className="px-3 py-3 text-center">Darab</th><th className="px-3 py-3 text-center">Tranzakció</th><th className="px-3 py-3 text-right">Költség</th><th className="w-12"></th></tr></thead>
                  <tbody>{manualRows.map((row, index) => <tr key={`${row.soldOn}:${row.actor}:${index}`} className="border-t border-white/7"><td className="px-3 py-3">{String(row.soldOn).slice(0, 7)}</td><td className="px-3 py-3 text-white/62">{locationOptions.find((item) => item.value === String(row.location))?.label || String(row.location)}</td><td className="px-3 py-3">{String(row.actor)}</td><td className="px-3 py-3 text-right">{money(row.revenue)}</td><td className="px-3 py-3 text-center">{integer(row.quantity)}</td><td className="px-3 py-3 text-center">{integer(row.transactions)}</td><td className="px-3 py-3 text-right">{row.estimatedCost === null ? "–" : money(row.estimatedCost)}</td><td className="px-2 py-3"><button type="button" onClick={() => setManualRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300/18 bg-rose-500/8 text-rose-100 hover:bg-rose-500/18"><Trash2 size={14} /></button></td></tr>)}</tbody>
                </table>
                {!manualRows.length ? <div className="px-4 py-16 text-center"><CalendarDays className="mx-auto text-[#7bd7d4]/55" size={28} /><p className="mt-3 text-sm text-white/55">A bal oldalon add hozzá a hónapokat.</p></div> : null}
              </div>
              <div className="flex justify-end border-t border-white/8 p-4"><button type="button" className={primaryButton} disabled={!manualRows.length || saving} onClick={() => void saveManualRows()}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}Mentés az elemzésekhez</button></div>
            </section>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default function AllInSalesCommandCenter({ actor = "ADMIN" }: { actor?: string; role?: "admin" | "shop" }) {
  const initial = useMemo<FiltersState>(() => ({
    ...presetFilters("ytd"),
    location: "all",
    employee: "",
    brand: "",
    category: "",
    subcategory: "",
    size: "",
    color: "",
    payment: "",
    product: "",
    search: "",
    source: "all",
    bucket: "auto",
  }), []);
  const [draft, setDraft] = useState<FiltersState>(initial);
  const [applied, setApplied] = useState<FiltersState>(initial);
  const [activePreset, setActivePreset] = useState<QuickPreset | "custom">("ytd");
  const [data, setData] = useState<AifSalesCommandOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");
  const [dimension, setDimension] = useState<AifSalesCommandDimensionKey>("brand");
  const [heatmapMetric, setHeatmapMetric] = useState<"revenue" | "itemsSold" | "transactions" | "grossProfit">("revenue");
  const [detailTarget, setDetailTarget] = useState<AifSalesCommandDetailItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifSalesCommandCenterOverview(applied);
      setData(response);
    } catch (loadError: any) {
      setError(loadError?.message || "A vezetői eladási központ nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => { void load(); }, [load]);

  function applyPreset(preset: QuickPreset) {
    const next = { ...draft, ...presetFilters(preset) };
    setDraft(next);
    setApplied(next);
    setActivePreset(preset);
  }

  function applyFilters() {
    const next = { ...draft };
    if (next.from > next.to) [next.from, next.to] = [next.to, next.from];
    if (next.compareFrom > next.compareTo) [next.compareFrom, next.compareTo] = [next.compareTo, next.compareFrom];
    setDraft(next);
    setApplied(next);
    setActivePreset("custom");
  }

  function applyPatch(patch: Partial<FiltersState>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setApplied(next);
    setActivePreset("custom");
  }

  function clearDrillFilters() {
    applyPatch({ employee: "", brand: "", category: "", subcategory: "", size: "", color: "", payment: "", product: "", location: "all", search: "", source: "all" });
  }

  function drillDimension(active: AifSalesCommandDimensionKey, item: AifSalesCommandDimensionItem) {
    if (active === "brand") applyPatch({ brand: item.rawName || item.name });
    else if (active === "category") applyPatch({ category: item.rawName || item.name });
    else if (active === "subcategory") applyPatch({ subcategory: item.rawName || item.name });
    else if (active === "size") applyPatch({ size: item.rawName || item.name });
    else if (active === "color") applyPatch({ color: item.rawName || item.name });
    else if (active === "payment") applyPatch({ payment: item.rawName || item.key });
    else if (active === "store") applyPatch({ location: item.meta || item.key || item.rawName || item.name });
    else if (active === "product") applyPatch({ product: item.meta || item.rawName || item.name });
  }

  const activeChips = useMemo(() => {
    const values: Array<{ key: keyof FiltersState; label: string }> = [];
    if (applied.location !== "all") values.push({ key: "location", label: friendlyLocationLabel(applied.location, data?.filterOptions.locations.find((item) => item.code === applied.location || item.id === applied.location)?.name) });
    if (applied.employee) values.push({ key: "employee", label: applied.employee });
    if (applied.brand) values.push({ key: "brand", label: applied.brand });
    if (applied.category) values.push({ key: "category", label: applied.category });
    if (applied.subcategory) values.push({ key: "subcategory", label: applied.subcategory });
    if (applied.size) values.push({ key: "size", label: `Méret: ${applied.size}` });
    if (applied.color) values.push({ key: "color", label: applied.color });
    if (applied.payment) values.push({ key: "payment", label: paymentLabel(applied.payment) });
    if (applied.product) values.push({ key: "product", label: applied.product });
    if (applied.search) values.push({ key: "search", label: `Keresés: ${applied.search}` });
    if (applied.source !== "all") values.push({ key: "source", label: applied.source === "live" ? "Csak élő" : "Csak történeti" });
    return values;
  }, [applied, data?.filterOptions.locations]);

  const summary = data?.summary;
  const comparison = data?.comparisonSummary;
  const delta = data?.deltaPercent;
  const currentPeriodLabel = data ? `${huDate(data.scope.from)} – ${huDate(data.scope.to)}` : `${huDate(applied.from)} – ${huDate(applied.to)}`;
  const comparisonPeriodLabel = data ? `${huDate(data.scope.compareFrom)} – ${huDate(data.scope.compareTo)}` : `${huDate(applied.compareFrom)} – ${huDate(applied.compareTo)}`;
  const marginDelta = deltaValue(numberValue(summary?.grossMargin), numberValue(comparison?.grossMargin));

  const locationOptions = useMemo<SelectOption[]>(() => [
    { value: "all", label: "Minden üzlet" },
    ...(data?.filterOptions.locations || [])
      .filter((item) => SALES_STORE_CODES.has(String(item.code || "")))
      .map((item) => ({ value: item.code, label: friendlyLocationLabel(item.code, item.name) })),
  ], [data?.filterOptions.locations]);
  const employeeOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden eladó" }, ...(data?.filterOptions.employees || []).map((value) => ({ value, label: value }))], [data?.filterOptions.employees]);
  const brandOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden márka" }, ...(data?.filterOptions.brands || []).map((value) => ({ value, label: value }))], [data?.filterOptions.brands]);
  const categoryOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden főkategória" }, ...(data?.filterOptions.categories || []).map((value) => ({ value, label: value }))], [data?.filterOptions.categories]);
  const subcategoryOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden alkategória" }, ...(data?.filterOptions.subcategories || []).map((value) => ({ value, label: value }))], [data?.filterOptions.subcategories]);
  const sizeOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden méret" }, ...(data?.filterOptions.sizes || []).map((value) => ({ value, label: value }))], [data?.filterOptions.sizes]);
  const colorOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden szín" }, ...(data?.filterOptions.colors || []).map((value) => ({ value, label: value }))], [data?.filterOptions.colors]);
  const paymentOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden fizetési mód" }, ...Array.from(new Map((data?.dimensions.payment || []).map((item) => [item.rawName || item.key, { value: item.rawName || item.key, label: item.name }])).values())], [data?.dimensions.payment]);

  const bucketClick = (index: number) => {
    const current = data?.trend.current[index];
    const previous = data?.trend.comparison[index];
    if (!current) return;
    applyPatch({
      from: current.start,
      to: current.end,
      compareFrom: previous?.start || applied.compareFrom,
      compareTo: previous?.end || applied.compareTo,
    });
  };

  return (
    <main
      className="min-h-screen bg-[#4e5969] p-3 text-white sm:p-4 lg:p-6"
      style={{
        backgroundImage:
          "radial-gradient(circle at 14% 8%, rgba(42,141,139,0.18), transparent 24%), radial-gradient(circle at 88% 12%, rgba(104,221,216,0.08), transparent 22%), linear-gradient(135deg, #5c6878 0%, #535f70 42%, #46515f 100%)",
      }}
    >
      <div className="mx-auto max-w-[1760px] space-y-3.5">
        <header className="relative overflow-hidden rounded-[28px] border border-[#9be9e5]/20 bg-gradient-to-r from-[#263448] via-[#2f3b4f] to-[#294a51] px-4 py-4 shadow-[0_22px_62px_rgba(15,23,42,0.30)] sm:px-5">
          <span className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#bff8f5]/72 to-transparent" />
          <span className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full bg-[#7bd7d4]/[0.11] blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-4">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#8ce7e2]/38 bg-[#2a8d8b]/24 text-[#d8fffd] shadow-[0_0_36px_rgba(42,141,139,0.20)]"><Gauge size={28} /></span>
            <div className="min-w-[260px] border-l-4 border-[#2a8d8b] pl-3">
              <div className="flex flex-wrap items-center gap-2"><p className="text-[9px] uppercase tracking-[0.19em] text-[#cffffd]/60">AllInFashion • vezetői elemzés</p><span className="rounded-full border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 px-2 py-0.5 text-[8px] uppercase tracking-[0.1em] text-[#cffffd]/64">Élő + történeti</span></div>
              <h1 className="mt-1 text-2xl tracking-tight sm:text-3xl">Vezetői eladási központ</h1>
              <p className="mt-1 text-xs text-white/42">Forgalom, eladók, termékek és időszakok összehasonlítása egy képernyőn.</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <span className="hidden rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] text-white/46 xl:inline-flex xl:items-center xl:gap-2"><Zap size={13} className="text-[#8ee6e2]" />{data?.generatedAt ? `Frissítve: ${dateTime(data.generatedAt)}` : actor}</span>
              <button type="button" className={primaryButton} onClick={() => setHistoryOpen(true)}><Database size={15} />Történeti adatok</button>
              <button type="button" className={neutralButton} onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Frissítés</button>
              <button type="button" className={neutralButton} onClick={() => { window.location.hash = "#allin"; }}><Home size={15} />Kezdőlap</button>
            </div>
          </div>
        </header>

        <section className={`${panel} overflow-visible p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 text-[#cffffd]"><Target size={17} /></span><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/36">Vizsgált időszak és összehasonlítás</p><h2 className="mt-0.5 text-base">Mit hasonlítsunk össze?</h2></div></div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["ytd", "Idén / tavaly"],
                ["month", "Ez a hónap / tavaly"],
                ["lastMonth", "Előző hónap / tavaly"],
                ["fullYear", "Teljes év / tavaly"],
              ].map(([key, label]) => <button key={key} type="button" onClick={() => applyPreset(key as QuickPreset)} className={`h-8 rounded-lg border px-3 text-[10px] transition ${activePreset === key ? "border-[#9be9e5]/44 bg-[#2a8d8b] text-white" : "border-white/10 bg-white/[0.025] text-white/48 hover:border-white/18 hover:text-white"}`}>{label}</button>)}
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_220px_220px_auto]">
            <div className="grid gap-2 rounded-2xl border border-[#7bd7d4]/14 bg-[#2a8d8b]/[0.045] p-3 sm:grid-cols-2"><DateControl label="Vizsgált ettől" value={draft.from} onChange={(value) => setDraft({ ...draft, from: value, to: draft.to < value ? value : draft.to })} /><DateControl label="Vizsgált eddig" value={draft.to} onChange={(value) => setDraft({ ...draft, to: value, from: draft.from > value ? value : draft.from })} /></div>
            <div className="grid gap-2 rounded-2xl border border-amber-200/12 bg-amber-400/[0.035] p-3 sm:grid-cols-2"><DateControl label="Összehasonlítás ettől" value={draft.compareFrom} onChange={(value) => setDraft({ ...draft, compareFrom: value, compareTo: draft.compareTo < value ? value : draft.compareTo })} /><DateControl label="Összehasonlítás eddig" value={draft.compareTo} onChange={(value) => setDraft({ ...draft, compareTo: value, compareFrom: draft.compareFrom > value ? value : draft.compareFrom })} /></div>
            <FieldLabel label="Üzlet"><SelectControl value={draft.location} onChange={(value) => setDraft({ ...draft, location: value })} options={locationOptions} placeholder="Minden üzlet" /></FieldLabel>
            <FieldLabel label="Eladó"><SelectControl value={draft.employee} onChange={(value) => setDraft({ ...draft, employee: value })} options={employeeOptions} placeholder="Minden eladó" /></FieldLabel>
            <div className="flex items-end gap-2"><button type="button" className={`${primaryButton} min-w-[122px] flex-1`} onClick={applyFilters}><Search size={15} />Alkalmazás</button><button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/52 hover:border-[#7bd7d4]/26 hover:text-white" onClick={() => setFiltersOpen((current) => !current)} title="Részletes szűrők"><Filter size={16} /></button></div>
          </div>

          {filtersOpen ? <div className="mt-3 grid gap-3 border-t border-white/8 pt-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8"><FieldLabel label="Márka"><SelectControl value={draft.brand} onChange={(value) => setDraft({ ...draft, brand: value })} options={brandOptions} placeholder="Minden márka" /></FieldLabel><FieldLabel label="Főkategória"><SelectControl value={draft.category} onChange={(value) => setDraft({ ...draft, category: value })} options={categoryOptions} placeholder="Minden" /></FieldLabel><FieldLabel label="Alkategória"><SelectControl value={draft.subcategory} onChange={(value) => setDraft({ ...draft, subcategory: value })} options={subcategoryOptions} placeholder="Minden" /></FieldLabel><FieldLabel label="Méret"><SelectControl value={draft.size} onChange={(value) => setDraft({ ...draft, size: value })} options={sizeOptions} placeholder="Minden" /></FieldLabel><FieldLabel label="Szín"><SelectControl value={draft.color} onChange={(value) => setDraft({ ...draft, color: value })} options={colorOptions} placeholder="Minden" /></FieldLabel><FieldLabel label="Fizetési mód"><SelectControl value={draft.payment} onChange={(value) => setDraft({ ...draft, payment: value })} options={paymentOptions} placeholder="Minden" /></FieldLabel><FieldLabel label="Adatforrás"><SelectControl value={draft.source} onChange={(value) => setDraft({ ...draft, source: value as SourceFilter })} options={[{ value: "all", label: "Élő + történeti" }, { value: "live", label: "Csak élő eladások" }, { value: "history", label: "Csak történeti adatok" }]} placeholder="Minden" /></FieldLabel><FieldLabel label="Grafikon bontása"><SelectControl value={draft.bucket} onChange={(value) => setDraft({ ...draft, bucket: value as BucketFilter })} options={[{ value: "auto", label: "Automatikus" }, { value: "day", label: "Nap" }, { value: "week", label: "Hét" }, { value: "month", label: "Hónap" }]} placeholder="Automatikus" /></FieldLabel><FieldLabel label="Termék"><input className={control} value={draft.product} onChange={(event) => setDraft({ ...draft, product: event.target.value })} placeholder="Név vagy kód" /></FieldLabel><FieldLabel label="Szabad keresés"><div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-3.5 text-white/32" /><input className={`${control} pl-9`} value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") applyFilters(); }} placeholder="Bizonylat, márka, termék..." /></div></FieldLabel></div> : null}

          {activeChips.length ? <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/8 pt-3"><span className="mr-1 text-[9px] uppercase tracking-[0.1em] text-white/28">Aktív:</span>{activeChips.map((chip) => <button key={String(chip.key)} type="button" onClick={() => applyPatch({ [chip.key]: chip.key === "location" ? "all" : chip.key === "source" ? "all" : "" } as Partial<FiltersState>)} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#7bd7d4]/18 bg-[#2a8d8b]/9 px-2.5 text-[9px] text-[#d7fffd]/72 hover:bg-[#2a8d8b]/18"><span className="max-w-[180px] truncate">{chip.label}</span><X size={10} /></button>)}<button type="button" onClick={clearDrillFilters} className="ml-1 h-7 rounded-full border border-white/10 px-2.5 text-[9px] text-white/42 hover:text-white">Összes törlése</button></div> : null}
        </section>

        {error ? <div className="rounded-2xl border border-rose-300/28 bg-rose-500/13 px-4 py-3 text-sm text-rose-50"><AlertTriangle size={17} className="mr-2 inline" />{error}</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <MetricCard title="Forgalom" value={money(summary?.revenue)} comparison={money(comparison?.revenue)} delta={delta?.revenue} icon={CircleDollarSign} hint={`${money(summary?.liveRevenue)} élő • ${money(summary?.historyRevenue)} történeti`} tone="success" active={chartMetric === "revenue"} onClick={() => setChartMetric("revenue")} />
          <MetricCard title="Bruttó nyereség" value={money(summary?.grossProfit)} comparison={money(comparison?.grossProfit)} delta={delta?.grossProfit} icon={TrendingUp} hint="Nettó forgalom mínusz beszerzési érték" tone="success" active={chartMetric === "grossProfit"} onClick={() => setChartMetric("grossProfit")} warning={numberValue(summary?.costCoveragePercent) < 99 ? `A vizsgált forgalom vételár-lefedettsége ${percentage(summary?.costCoveragePercent)}. A hiányzó költségadatok miatt a nyereség becslés.` : undefined} />
          <MetricCard title="Árrés" value={percentage(summary?.grossMargin)} comparison={percentage(comparison?.grossMargin)} delta={marginDelta} icon={Percent} hint="Bruttó nyereség / nettó forgalom" tone="accent" warning={numberValue(summary?.costCoveragePercent) < 99 ? "Az árrés a rendelkezésre álló vételár-adatokból számolódik." : undefined} />
          <MetricCard title="Eladott darab" value={`${integer(summary?.itemsSold)} db`} comparison={`${integer(comparison?.itemsSold)} db`} delta={delta?.itemsSold} icon={ShoppingBag} hint="Eladás és csere nettó darabszáma" active={chartMetric === "itemsSold"} onClick={() => setChartMetric("itemsSold")} />
          <MetricCard title="Tranzakció" value={integer(summary?.transactions)} comparison={integer(comparison?.transactions)} delta={delta?.transactions} icon={ReceiptText} hint="Egyedi bizonylatok és havi összesítések" active={chartMetric === "transactions"} onClick={() => setChartMetric("transactions")} />
          <MetricCard title="Átlagkosár" value={money(summary?.averageBasket)} comparison={money(comparison?.averageBasket)} delta={delta?.averageBasket} icon={Target} hint="Forgalom / tranzakció" active={chartMetric === "averageBasket"} onClick={() => setChartMetric("averageBasket")} />
          <MetricCard title="Kedvezmény" value={money(summary?.discountTotal)} comparison={money(comparison?.discountTotal)} delta={delta?.discountTotal} icon={Tags} hint="Összes adott kedvezmény" tone={numberValue(summary?.discountTotal) > 0 ? "warning" : "normal"} active={chartMetric === "discountTotal"} onClick={() => setChartMetric("discountTotal")} />
          <MetricCard title="Kintlévőség" value={money(summary?.unpaidTotal)} comparison={money(comparison?.unpaidTotal)} delta={delta?.unpaidTotal} icon={WalletCards} hint="Nyitott fizetési összeg" tone={numberValue(summary?.unpaidTotal) > 0 ? "danger" : "normal"} active={chartMetric === "unpaidTotal"} onClick={() => setChartMetric("unpaidTotal")} />
        </section>

        {data ? <CoverageStrip data={data} /> : null}

        <section className="grid gap-3 2xl:grid-cols-[1.72fr_0.88fr]">
          <CompareChart data={data?.trend || { current: [], comparison: [] }} metric={chartMetric} onMetricChange={setChartMetric} currentLabel={currentPeriodLabel} comparisonLabel={comparisonPeriodLabel} onBucketClick={bucketClick} />
          <EmployeeRanking rows={data?.employees || []} metric={chartMetric} selected={applied.employee} onSelect={(employee) => applyPatch({ employee })} />
        </section>

        <DimensionPanel dimensions={data?.dimensions || ({ brand: [], category: [], subcategory: [], product: [], size: [], color: [], store: [], payment: [] } as AifSalesCommandOverviewResponse["dimensions"])} activeDimension={dimension} onDimensionChange={setDimension} metric={chartMetric} onDrill={drillDimension} />

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {(["revenue", "itemsSold", "transactions", "grossProfit"] as const).map((key) => <button key={key} type="button" onClick={() => setHeatmapMetric(key)} className={`h-7 rounded-lg border px-2.5 text-[9px] transition ${heatmapMetric === key ? "border-[#8ce7e2]/40 bg-[#2a8d8b] text-white" : "border-white/9 bg-white/[0.025] text-white/42 hover:text-white"}`}>{chartMetricConfig[key].short}</button>)}
          </div>
          <Heatmap heatmap={data?.heatmap || { months: [], rows: [] }} metric={heatmapMetric} onCellClick={(employee, month) => { if (!month.currentStart || !month.currentEnd) return; applyPatch({ employee, from: month.currentStart, to: month.currentEnd, compareFrom: month.comparisonStart || applied.compareFrom, compareTo: month.comparisonEnd || applied.compareTo }); }} />
        </section>

        <DetailsTable rows={data?.details || []} onOpen={setDetailTarget} />
      </div>

      <DetailDrawer item={detailTarget} onClose={() => setDetailTarget(null)} />
      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} data={data} onChanged={load} />

      {loading ? <div className="fixed inset-0 z-[900] grid place-items-center bg-slate-950/28 backdrop-blur-[2px]"><div className="flex items-center gap-3 rounded-2xl border border-[#7bd7d4]/24 bg-[#142033] px-5 py-4 text-sm text-white shadow-2xl"><Loader2 className="animate-spin text-[#8ee6e2]" size={22} />Vezetői adatok betöltése...</div></div> : null}
    </main>
  );
}
