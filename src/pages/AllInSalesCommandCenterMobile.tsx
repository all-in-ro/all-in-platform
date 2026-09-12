import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Database,
  Filter,
  Gauge,
  Home,
  Layers3,
  Loader2,
  PackageSearch,
  Percent,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Tags,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
  X,
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
type ChartMetric = "revenue" | "grossProfit" | "itemsSold" | "transactions" | "discountTotal" | "unpaidTotal";
type QuickPreset = "month" | "lastMonth" | "fullYear" | "previousYear";
type PeriodMode = "month" | "range";

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
  snCod: string;
  search: string;
  source: SourceFilter;
  bucket: BucketFilter;
};

type SelectOption = { value: string; label: string };

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

const SALES_STORE_CODES = new Set(["main_warehouse", "magazin_targu_secuiesc"]);
const panel = "rounded-[22px] border border-white/14 bg-[#344154] shadow-[0_14px_34px_rgba(15,23,42,0.18)]";
const inputClass = "h-10 w-full min-w-0 rounded-xl border border-white/16 bg-[#293649] px-3 text-[13px] font-normal text-white outline-none placeholder:text-white/34 focus:border-[#7bd7d4]/60 focus:ring-2 focus:ring-[#7bd7d4]/15";
const HU_MONTHS = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"] as const;
const HU_WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"] as const;

const dimensionLabels: Record<AifSalesCommandDimensionKey, string> = {
  brand: "Márka",
  category: "Főkategória",
  subcategory: "Alkategória",
  product: "Termék",
  size: "Méret",
  color: "Szín",
  store: "Üzlet",
  payment: "Fizetés",
};

const chartMetricConfig: Record<ChartMetric, { label: string; short: string; format: (value: number) => string }> = {
  revenue: { label: "Forgalom", short: "Forgalom", format: money },
  grossProfit: { label: "Bruttó nyereség", short: "Profit", format: money },
  itemsSold: { label: "Eladott darab", short: "Darab", format: (value) => `${integer(value)} db` },
  transactions: { label: "Tranzakció", short: "Tranz.", format: integer },
  discountTotal: { label: "Kedvezmény", short: "Kedv.", format: money },
  unpaidTotal: { label: "Kintlévőség", short: "Kintl.", format: money },
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  let raw = String(value).replace(/\u00a0/g, " ").replace(/\s+/g, "").replace(/RON|LEI/gi, "").replace(/%$/, "");
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) raw = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  else if (comma >= 0) raw = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown) {
  return `${numberValue(value).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;
}

function compactMoney(value: unknown) {
  const amount = numberValue(value);
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toLocaleString("ro-RO", { maximumFractionDigits: 2 })} M RON`;
  if (Math.abs(amount) >= 10_000) return `${(amount / 1_000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}k RON`;
  return money(amount);
}

function integer(value: unknown) {
  return Math.round(numberValue(value)).toLocaleString("ro-RO");
}

function percentage(value: unknown, digits = 1) {
  return `${numberValue(value).toLocaleString("hu-HU", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function localIsoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
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
  if (preset === "month") return { from: monthStart(current), to: current, compareFrom: shiftYear(monthStart(current), -1), compareTo: shiftYear(current, -1) };
  if (preset === "lastMonth") {
    const range = previousMonthRange(current);
    return { ...range, compareFrom: shiftYear(range.from, -1), compareTo: shiftYear(range.to, -1) };
  }
  if (preset === "previousYear") return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, compareFrom: `${year - 2}-01-01`, compareTo: `${year - 2}-12-31` };
  return { from: `${year}-01-01`, to: current, compareFrom: `${year - 1}-01-01`, compareTo: shiftYear(current, -1) };
}

function automaticComparison(filters: FiltersState): FiltersState {
  return { ...filters, compareFrom: shiftYear(filters.from, -1), compareTo: shiftYear(filters.to, -1) };
}

function monthSelectionRange(value: string, current = localIsoDate()) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  const safe = match ? value : current.slice(0, 7);
  const [year, month] = safe.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const fullTo = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to: safe === current.slice(0, 7) ? current : fullTo };
}

function monthDisplayLabel(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12));
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" }).format(date);
}

function huDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function shortPeriod(from: string, to: string) {
  if (from === to) return huDate(from);
  return `${huDate(from)} – ${huDate(to)}`;
}

function metricValue(row: Partial<AifSalesCommandMetricRow> | undefined, metric: ChartMetric) {
  return numberValue(row?.[metric]);
}

function deltaValue(current: number, comparison: number) {
  if (Math.abs(comparison) < 0.000001) return Math.abs(current) < 0.000001 ? 0 : null;
  return ((current - comparison) / Math.abs(comparison)) * 100;
}

function paymentLabel(value?: string | null) {
  const key = String(value || "").toLowerCase();
  if (key === "cash") return "Készpénz";
  if (key === "card") return "Kártya";
  if (key === "bank_transfer") return "Átutalás";
  if (key === "credit") return "Hitel";
  if (key === "mixed") return "Vegyes";
  if (key === "exchange") return "Csere";
  return value || "Nincs adat";
}

function friendlyLocationLabel(code?: string | null, name?: string | null) {
  const key = String(code || "").trim().toLowerCase();
  if (key === "main_warehouse") return "Csíkszereda";
  if (key === "magazin_targu_secuiesc") return "Kézdivásárhely";
  return String(name || code || "Ismeretlen üzlet").trim() || "Ismeretlen üzlet";
}

function dimensionItemLabel(dimension: AifSalesCommandDimensionKey, item: AifSalesCommandDimensionItem) {
  if (dimension === "store") return friendlyLocationLabel(item.meta || item.key, item.name);
  if (dimension === "payment") return paymentLabel(item.rawName || item.key || item.name);
  return item.name;
}

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
  if (!parsed) return "Dátum";
  return `${parsed.year}. ${String(parsed.month).padStart(2, "0")}. ${String(parsed.day).padStart(2, "0")}.`;
}

function DeltaPill({ value, inverse = false }: { value: number | null | undefined; inverse?: boolean }) {
  const neutral = value === null || value === undefined || Math.abs(value) < 0.05;
  const rawPositive = !neutral && numberValue(value) > 0;
  const positive = inverse ? !rawPositive : rawPositive;
  const Icon = neutral ? Activity : rawPositive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[9px] ${neutral ? "border-white/10 bg-white/[0.04] text-white/46" : positive ? "border-emerald-200/24 bg-emerald-400/10 text-emerald-50" : "border-rose-200/24 bg-rose-400/10 text-rose-50"}`}>
      <Icon size={10} />{value === null || value === undefined ? "új" : `${value > 0 ? "+" : ""}${numberValue(value).toFixed(1)}%`}
    </span>
  );
}

function MobileSelect({ value, options, onChange, placeholder }: { value: string; options: SelectOption[]; onChange: (value: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const selected = options.find((item) => String(item.value) === String(value));
  const showSearch = options.length > 12;
  const searchKey = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const visibleOptions = searchKey
    ? options.filter((item) => item.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(searchKey))
    : options;

  const close = useCallback(() => { setOpen(false); setSearch(""); }, []);
  const position = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect || typeof window === "undefined") return;
    const edge = 10;
    const gap = 6;
    const width = Math.min(Math.max(rect.width, 210), window.innerWidth - edge * 2);
    const desiredHeight = Math.min(320, 20 + (showSearch ? 48 : 0) + Math.max(1, options.length) * 34);
    const roomBelow = window.innerHeight - rect.bottom - edge;
    const roomAbove = rect.top - edge;
    const openUp = roomBelow < Math.min(170, desiredHeight) && roomAbove > roomBelow;
    const maxHeight = Math.max(120, Math.min(desiredHeight, openUp ? roomAbove - gap : roomBelow - gap));
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    setMenuStyle({ position: "fixed", left, top: openUp ? rect.top - gap : rect.bottom + gap, width, maxHeight, transform: openUp ? "translateY(-100%)" : "none", zIndex: 2147483200 });
  }, [options.length, showSearch]);

  useEffect(() => {
    if (!open) return;
    position();
    const outside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const reposition = () => position();
    document.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [close, open, position]);

  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => { if (open) close(); else { position(); setOpen(true); } }} className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-left text-[12px] text-white outline-none transition ${open ? "border-[#7bd7d4]/58 bg-[#3f4959] ring-2 ring-[#7bd7d4]/12" : "border-white/18 bg-[#3f4959]"}`}>
        <span className="min-w-0 flex-1 truncate">{selected?.label || placeholder}</span><ChevronDown size={14} className={`shrink-0 text-white/58 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#7bd7d4]/30 bg-[#293344] text-white shadow-[0_24px_70px_rgba(2,6,23,0.72)]" style={menuStyle} role="listbox">
          {showSearch ? <div className="border-b border-white/10 p-1.5"><div className="relative"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/42" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 w-full rounded-xl border border-white/16 bg-[#202b3b] pl-8 pr-2 text-[11px] text-white outline-none" placeholder="Keresés..." /></div></div> : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {visibleOptions.map((option) => {
              const active = String(option.value) === String(value);
              return <button key={option.value || "__all"} type="button" onClick={() => { onChange(option.value); close(); }} className={`mb-1 flex min-h-8 w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-[11px] ${active ? "border-[#7bd7d4]/60 bg-[#2a8d8b] text-white" : "border-transparent bg-[#303a4c] text-white/78"}`}><span className="min-w-0 flex-1 truncate">{option.label}</span>{active ? <CheckCircle2 size={13} className="shrink-0 text-[#d7fffd]" /> : null}</button>;
            })}
            {!visibleOptions.length ? <div className="px-3 py-4 text-center text-[11px] text-white/45">Nincs találat.</div> : null}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function MobileDatePicker({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const parsed = isoDateParts(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsed?.year || new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState((parsed?.month || new Date().getMonth() + 1) - 1);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const todayIso = localIsoDate();
  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1, 12));
  const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(1 - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setUTCDate(gridStart.getUTCDate() + index); return day; });

  useEffect(() => {
    if (!open) return;
    const current = isoDateParts(value);
    if (current) { setViewYear(current.year); setViewMonth(current.month - 1); }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, value]);

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1, 12));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  }

  return (
    <>
      <button type="button" aria-label={ariaLabel} onClick={() => setOpen(true)} className="flex h-10 w-full min-w-0 items-center justify-between rounded-xl border border-white/18 bg-[#293649] px-3 text-left text-[12px] text-white"><span className="flex min-w-0 items-center gap-2"><CalendarDays size={14} className="shrink-0 text-[#8fe9e5]" /><span className="truncate">{huDateLabel(value)}</span></span><ChevronDown size={13} className="shrink-0 text-white/48" /></button>
      {open ? createPortal(
        <div className="fixed inset-0 z-[2147483300] grid place-items-center bg-slate-950/62 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <div ref={popupRef} className="w-full max-w-[300px] overflow-hidden rounded-[20px] border border-[#8ce7e2]/42 bg-[#202c3d] p-2.5 text-white shadow-[0_30px_80px_rgba(2,6,23,0.76)]">
            <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#29374b] px-2 py-1.5"><button type="button" onClick={() => shiftMonth(-1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04]"><ChevronLeft size={16} /></button><div className="text-center"><p className="text-[8px] uppercase tracking-[0.14em] text-[#cffffd]/44">Dátum</p><p className="mt-0.5 text-[13px]">{viewYear}. {HU_MONTHS[viewMonth]}</p></div><button type="button" onClick={() => shiftMonth(1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04]"><ChevronRight size={16} /></button></div>
            <div className="mt-2 grid grid-cols-7 gap-0.5">{HU_WEEKDAYS.map((day, index) => <div key={day} className={`py-1 text-center text-[9px] ${index >= 5 ? "text-rose-100/52" : "text-[#cffffd]/56"}`}>{day}</div>)}{days.map((day) => { const iso = isoFromUtcDate(day); const inMonth = day.getUTCMonth() === viewMonth; const selected = iso === value; const today = iso === todayIso; return <button key={iso} type="button" onClick={() => { onChange(iso); setOpen(false); }} className={`relative flex h-8 items-center justify-center rounded-lg border text-[10px] ${selected ? "border-[#bff8f5]/62 bg-[#2a8d8b] text-white" : inMonth ? "border-transparent bg-white/[0.025] text-white/86" : "border-transparent text-white/22"}`}>{day.getUTCDate()}{today && !selected ? <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#7bd7d4]" /> : null}</button>; })}</div>
            <div className="mt-2 flex justify-between border-t border-white/8 pt-2"><button type="button" onClick={() => setOpen(false)} className="h-8 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-[10px]">Mégse</button><button type="button" onClick={() => { onChange(todayIso); setOpen(false); }} className="h-8 rounded-lg border border-[#8ce7e2]/28 bg-[#2a8d8b]/18 px-3 text-[10px] text-[#d8fffd]">Ma</button></div>
          </div>
        </div>, document.body) : null}
    </>
  );
}

function MobileMonthPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(match ? Number(match[1]) : new Date().getFullYear());
  const selectedMonth = match ? Number(match[2]) - 1 : -1;
  const selectedYear = match ? Number(match[1]) : -1;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-10 w-full items-center justify-between rounded-xl border border-white/18 bg-[#293649] px-3 text-left text-[12px] text-white"><span className="flex items-center gap-2"><CalendarDays size={14} className="text-[#8fe9e5]" />{match ? `${match[1]}. ${HU_MONTHS[selectedMonth]}` : "Hónap"}</span><ChevronDown size={13} className="text-white/48" /></button>
      {open ? createPortal(<div className="fixed inset-0 z-[2147483300] grid place-items-center bg-slate-950/62 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}><div className="w-full max-w-[300px] rounded-[20px] border border-[#8ce7e2]/42 bg-[#202c3d] p-2.5 text-white shadow-[0_30px_80px_rgba(2,6,23,0.76)]"><div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#29374b] px-2 py-1.5"><button type="button" onClick={() => setYear((current) => current - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04]"><ChevronLeft size={16} /></button><span className="text-[13px]">{year}</span><button type="button" onClick={() => setYear((current) => current + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04]"><ChevronRight size={16} /></button></div><div className="mt-2 grid grid-cols-3 gap-1.5">{HU_MONTHS.map((month, index) => { const active = selectedYear === year && selectedMonth === index; return <button key={month} type="button" onClick={() => { onChange(`${year}-${String(index + 1).padStart(2, "0")}`); setOpen(false); }} className={`min-h-10 rounded-xl border px-1 text-[10px] ${active ? "border-[#bff8f5]/60 bg-[#2a8d8b]" : "border-white/8 bg-[#2e3b4f] text-white/76"}`}>{month}</button>; })}</div><button type="button" onClick={() => setOpen(false)} className="mt-2 h-8 w-full rounded-lg border border-white/12 bg-white/[0.04] text-[10px]">Bezárás</button></div></div>, document.body) : null}
    </>
  );
}

function MetricCard({ title, value, comparison, delta, icon: Icon, tone = "normal", onClick, active, comparisonAvailable }: { title: string; value: string; comparison: string; delta: number | null | undefined; icon: ComponentType<{ size?: number; className?: string }>; tone?: "normal" | "success" | "warning" | "danger"; onClick?: () => void; active?: boolean; comparisonAvailable: boolean }) {
  const toneClass = tone === "success" ? "border-emerald-200/20 bg-gradient-to-br from-[#27665b] to-[#344154]" : tone === "warning" ? "border-amber-200/20 bg-gradient-to-br from-[#544c39] to-[#344154]" : tone === "danger" ? "border-rose-200/20 bg-gradient-to-br from-[#533543] to-[#344154]" : "border-white/14 bg-[#344154]";
  const content = <><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[8px] uppercase tracking-[0.12em] text-white/44">{title}</p><p className="mt-2 truncate text-[17px] leading-tight text-white" title={value}>{value}</p></div><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border ${active ? "border-[#9be9e5]/45 bg-[#2a8d8b]/28 text-[#d7fffd]" : "border-white/12 bg-white/[0.05] text-[#bff8f5]"}`}><Icon size={15} /></span></div><div className="mt-2 flex items-center justify-between gap-2"><p className="truncate text-[9px] text-white/36" title={comparisonAvailable ? comparison : "Nincs előző évi adat"}>{comparisonAvailable ? `Előző: ${comparison}` : "Előző év: nincs adat"}</p>{comparisonAvailable ? <DeltaPill value={delta} inverse={title === "Kedvezmény" || title === "Kintlévőség"} /> : null}</div></>;
  const classes = `min-w-0 rounded-[20px] border p-3.5 text-left shadow-[0_12px_30px_rgba(15,23,42,0.14)] ${toneClass} ${active ? "ring-2 ring-[#7bd7d4]/18" : ""}`;
  return onClick ? <button type="button" onClick={onClick} className={`${classes} w-full active:scale-[0.99]`}>{content}</button> : <article className={classes}>{content}</article>;
}

function MiniTrendChart({ data, metric, comparisonAvailable }: { data: AifSalesCommandOverviewResponse["trend"]; metric: ChartMetric; comparisonAvailable: boolean }) {
  const width = 720;
  const height = 250;
  const pad = { left: 42, right: 18, top: 20, bottom: 38 };
  const current = data.current || [];
  const comparison = comparisonAvailable ? (data.comparison || []) : [];
  const count = Math.max(current.length, comparison.length, 1);
  const values = [...current.map((item) => metricValue(item, metric)), ...comparison.map((item) => metricValue(item, metric))];
  const min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (Math.abs(max - min) < 0.000001) max = min + 1;
  const usableW = width - pad.left - pad.right;
  const usableH = height - pad.top - pad.bottom;
  const xAt = (index: number) => count <= 1 ? pad.left + usableW / 2 : pad.left + index / (count - 1) * usableW;
  const yAt = (value: number) => pad.top + (max - value) / (max - min) * usableH;
  const path = (rows: AifSalesCommandMetricRow[]) => rows.map((row, index) => `${index ? "L" : "M"} ${xAt(index)} ${yAt(metricValue(row, metric))}`).join(" ");
  const labelStep = Math.max(1, Math.ceil(count / 5));
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#111c2b]/68">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img" aria-label={`${chartMetricConfig[metric].label} diagram`}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => { const y = pad.top + ratio * usableH; return <line key={ratio} x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" />; })}
        {comparison.length ? <path d={path(comparison)} fill="none" stroke="#9aa7b7" strokeWidth="3" strokeLinecap="round" /> : null}
        {current.length ? <path d={path(current)} fill="none" stroke="#58d7d0" strokeWidth="4" strokeLinecap="round" /> : null}
        {current.map((row, index) => <circle key={index} cx={xAt(index)} cy={yAt(metricValue(row, metric))} r="3" fill="#bff8f5" stroke="#2a8d8b" strokeWidth="1.5" />)}
        {Array.from({ length: count }, (_, index) => { const item = current[index] || comparison[index]; if (!item || (index % labelStep !== 0 && index !== count - 1)) return null; return <text key={index} x={xAt(index)} y={height - 14} fill="rgba(255,255,255,.42)" fontSize="10" textAnchor="middle">{item.label}</text>; })}
      </svg>
    </div>
  );
}

function HistoryMobile({ open, onClose, data, onChanged }: { open: boolean; onClose: () => void; data: AifSalesCommandOverviewResponse | null; onChanged: () => Promise<void> }) {
  const today = localIsoDate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<AifSalesHistoryInputRow[]>([]);
  const defaultLocation = data?.filterOptions.locations.find((location) => location.code === "main_warehouse")?.code || data?.filterOptions.locations[0]?.code || "main_warehouse";
  const [draft, setDraft] = useState<ManualHistoryDraft>({ month: today.slice(0, 7), location: defaultLocation, actor: "", revenue: "", quantity: "", transactions: "", estimatedCost: "", discountTotal: "", unpaidTotal: "", note: "" });

  useEffect(() => { if (open) setError(""); }, [open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", escape, true);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape, true); };
  }, [onClose, open, saving]);

  const locationOptions = useMemo<SelectOption[]>(() => {
    const fromServer = (data?.filterOptions.locations || []).filter((location) => SALES_STORE_CODES.has(String(location.code || ""))).map((location) => ({ value: location.code, label: friendlyLocationLabel(location.code, location.name) }));
    return fromServer.length ? fromServer : [{ value: "main_warehouse", label: "Csíkszereda" }, { value: "magazin_targu_secuiesc", label: "Kézdivásárhely" }];
  }, [data?.filterOptions.locations]);
  const employeeOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Válassz eladót" }, ...(data?.filterOptions.employees || []).map((value) => ({ value, label: value }))], [data?.filterOptions.employees]);

  function addRow() {
    const revenue = nullableNumber(draft.revenue);
    if (!draft.month || !draft.location || !draft.actor.trim() || revenue === null) { setError("A hónap, üzlet, eladó és forgalom kötelező."); return; }
    setRows((current) => [...current, { rowNo: current.length + 1, soldOn: `${draft.month}-01`, location: draft.location, actor: draft.actor.trim(), sourceGranularity: "monthly", revenue, quantity: nullableNumber(draft.quantity), transactions: nullableNumber(draft.transactions), estimatedCost: nullableNumber(draft.estimatedCost), discountTotal: nullableNumber(draft.discountTotal), unpaidTotal: nullableNumber(draft.unpaidTotal), tvaRate: data?.salesTva.rate ?? 21, priceIncludesTva: data?.salesTva.priceIncludesTva !== false, note: draft.note.trim() || null }]);
    setDraft((current) => ({ ...current, revenue: "", quantity: "", transactions: "", estimatedCost: "", discountTotal: "", unpaidTotal: "", note: "" }));
    setError("");
  }

  async function saveRows() {
    if (!rows.length || saving) return;
    setSaving(true);
    setError("");
    try {
      await apiAifCreateSalesHistoryImport({ sourceName: `Kézi történeti adatok ${String(rows[0]?.soldOn || "").slice(0, 7)}`, sourceKind: "manual", rows });
      setRows([]);
      await onChanged();
      onClose();
    } catch (caught: any) {
      setError(caught?.message || "A visszamenőleges adatok mentése nem sikerült.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/78 p-3 backdrop-blur-md" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose(); }}>
      <section className="flex max-h-[90dvh] w-full max-w-[380px] flex-col overflow-hidden rounded-[26px] border border-[#9be9e5]/28 bg-[#303a4c] text-white shadow-[0_34px_110px_rgba(0,0,0,0.66)]">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#25354a] to-[#28565c] px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#9be9e5]/32 bg-[#2a8d8b]/22 text-[#d7fffd]"><Database size={19} /></span><div className="min-w-0"><p className="text-[8px] uppercase tracking-[0.14em] text-white/42">Eladási előzmények</p><h2 className="mt-0.5 truncate text-[16px]">Havi adat rögzítése</h2></div></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-white/14 bg-white/[0.05]"><X size={17} /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error ? <div className="mb-2 rounded-xl border border-rose-200/28 bg-rose-500/14 px-3 py-2 text-[11px] text-rose-50">{error}</div> : null}
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[8px] uppercase text-white/44">Hónap<MobileMonthPicker value={draft.month} onChange={(value) => setDraft({ ...draft, month: value })} /></label>
            <label className="grid gap-1 text-[8px] uppercase text-white/44">Üzlet<MobileSelect value={draft.location} onChange={(value) => setDraft({ ...draft, location: value })} options={locationOptions} placeholder="Üzlet" /></label>
            <label className="col-span-2 grid gap-1 text-[8px] uppercase text-white/44">Eladó<MobileSelect value={draft.actor} onChange={(value) => setDraft({ ...draft, actor: value })} options={employeeOptions} placeholder="Eladó" /></label>
            <label className="grid gap-1 text-[8px] uppercase text-white/44">Forgalom<input inputMode="decimal" className={inputClass} value={draft.revenue} onChange={(e) => setDraft({ ...draft, revenue: e.target.value })} placeholder="0,00" /></label>
            <label className="grid gap-1 text-[8px] uppercase text-white/44">Darab<input inputMode="decimal" className={inputClass} value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} placeholder="0" /></label>
            <label className="grid gap-1 text-[8px] uppercase text-white/44">Tranzakció<input inputMode="decimal" className={inputClass} value={draft.transactions} onChange={(e) => setDraft({ ...draft, transactions: e.target.value })} placeholder="0" /></label>
            <label className="grid gap-1 text-[8px] uppercase text-white/44">Beszerzés<input inputMode="decimal" className={inputClass} value={draft.estimatedCost} onChange={(e) => setDraft({ ...draft, estimatedCost: e.target.value })} placeholder="0,00" /></label>
            <label className="grid gap-1 text-[8px] uppercase text-white/44">Kedvezmény<input inputMode="decimal" className={inputClass} value={draft.discountTotal} onChange={(e) => setDraft({ ...draft, discountTotal: e.target.value })} placeholder="0,00" /></label>
            <label className="grid gap-1 text-[8px] uppercase text-white/44">Kintlévőség<input inputMode="decimal" className={inputClass} value={draft.unpaidTotal} onChange={(e) => setDraft({ ...draft, unpaidTotal: e.target.value })} placeholder="0,00" /></label>
            <label className="col-span-2 grid gap-1 text-[8px] uppercase text-white/44">Megjegyzés<input className={inputClass} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Opcionális" /></label>
          </div>
          <button type="button" onClick={addRow} className="mt-2 h-10 w-full rounded-xl border border-[#9be9e5]/44 bg-[#2a8d8b] text-[12px] text-white">+ Hozzáadás</button>
          {rows.length ? <div className="mt-3 space-y-1.5">{rows.map((row, index) => <div key={`${row.soldOn}:${index}`} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#293548] px-3 py-2"><div className="min-w-0"><p className="truncate text-[11px] text-white">{String(row.soldOn).slice(0, 7)} • {row.actor}</p><p className="mt-0.5 text-[9px] text-white/44">{money(row.revenue)} • {integer(row.quantity)} db</p></div><button type="button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/34 bg-[#E21C2A] text-white"><X size={14} /></button></div>)}</div> : null}
        </div>
        <footer className="grid grid-cols-2 gap-2 border-t border-white/10 bg-[#293548] p-3"><button type="button" onClick={onClose} className="h-10 rounded-xl border border-white/14 bg-white/[0.05] text-[11px]">Mégse</button><button type="button" disabled={!rows.length || saving} onClick={() => void saveRows()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#9be9e5]/42 bg-[#2a8d8b] text-[11px] disabled:opacity-45">{saving ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}Mentés</button></footer>
      </section>
    </div>, document.body,
  );
}

function DetailMobile({ item, onClose }: { item: AifSalesCommandDetailItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!item) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape, true);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape, true); };
  }, [item, onClose]);
  if (!item) return null;
  return createPortal(<div className="fixed inset-0 z-[1050] flex items-end bg-slate-950/78 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] border-x border-t border-[#9be9e5]/24 bg-[#303a4c] text-white shadow-[0_-30px_90px_rgba(0,0,0,.58)]"><header className="sticky top-0 flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#25354a] to-[#28565c] px-4 py-3"><div className="min-w-0"><p className="text-[8px] uppercase tracking-[0.14em] text-white/42">Eladási részletek</p><h3 className="mt-1 line-clamp-2 text-[16px]">{item.productTitle || item.documentNumber || "Történeti adat"}</h3><p className="mt-1 text-[10px] text-white/48">{huDate(item.date)} • {item.actor}</p></div><button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/14 bg-white/[0.05]"><X size={17} /></button></header><div className="space-y-2 p-3"><div className="grid grid-cols-2 gap-2">{[["Forgalom", money(item.revenue)], ["Nettó", money(item.netRevenue)], ["Profit", money(item.grossProfit)], ["Darab", `${integer(item.quantity)} db`], ["Kedvezmény", money(item.discountTotal)], ["Kintlévőség", money(item.unpaidTotal)]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-[#293548] p-3"><p className="text-[8px] uppercase text-white/38">{label}</p><p className="mt-1 text-[13px] text-white">{value}</p></div>)}</div>{[["Üzlet", friendlyLocationLabel(item.locationCode, item.locationName)], ["Eladó", item.actor || "–"], ["Bizonylat", item.documentNumber || "Havi összesítő"], ["Márka", item.brandName || "–"], ["Kategória", item.subcategoryName || item.categoryName || "–"], ["Termékkód", item.productCode || "–"], ["Szín", item.colorName || "–"], ["Méret", item.size || "–"], ["Fizetés", paymentLabel(item.paymentMethod)]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#293548] px-3 py-2.5 text-[11px]"><span className="text-white/40">{label}</span><span className="min-w-0 flex-1 truncate text-right text-white/82">{value}</span></div>)}</div></section></div>, document.body);
}

export default function AllInSalesCommandCenterMobile({ actor = "ADMIN" }: { actor?: string; role?: "admin" | "shop" }) {
  const initial = useMemo<FiltersState>(() => ({ ...presetFilters("month"), location: "all", employee: "", brand: "", category: "", subcategory: "", size: "", color: "", payment: "", product: "", snCod: "", search: "", source: "all", bucket: "auto" }), []);
  const [draft, setDraft] = useState<FiltersState>(initial);
  const [applied, setApplied] = useState<FiltersState>(initial);
  const [activePreset, setActivePreset] = useState<QuickPreset | "custom">("month");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [data, setData] = useState<AifSalesCommandOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");
  const [dimension, setDimension] = useState<AifSalesCommandDimensionKey>("brand");
  const [heatmapMetric, setHeatmapMetric] = useState<"revenue" | "itemsSold" | "transactions" | "grossProfit">("revenue");
  const [detailTarget, setDetailTarget] = useState<AifSalesCommandDetailItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailsPage, setDetailsPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await apiAifSalesCommandCenterOverview(applied)); }
    catch (caught: any) { setError(caught?.message || "A vezetői eladási központ nem tölthető be."); }
    finally { setLoading(false); }
  }, [applied]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const delay = draft.search || draft.product || draft.snCod ? 220 : 40; const timer = window.setTimeout(() => setApplied(draft), delay); return () => window.clearTimeout(timer); }, [draft]);
  useEffect(() => { setDetailsPage(1); }, [applied]);
  useEffect(() => {
    if (!filtersOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector('[role="listbox"]')) setFiltersOpen(false); };
    window.addEventListener("keydown", escape, true);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape, true); };
  }, [filtersOpen]);

  function applyPreset(preset: QuickPreset) {
    const next = automaticComparison({ ...draft, ...presetFilters(preset) });
    setPeriodMode(preset === "month" || preset === "lastMonth" ? "month" : "range");
    setDraft(next); setApplied(next); setActivePreset(preset);
  }

  function setSelectedMonth(value: string) {
    const range = monthSelectionRange(value);
    const next = automaticComparison({ ...draft, ...range });
    setDraft(next); setApplied(next); setActivePreset(value === localIsoDate().slice(0, 7) ? "month" : "custom");
  }

  function patch(patchValue: Partial<FiltersState>) {
    let next = { ...draft, ...patchValue };
    if (patchValue.from !== undefined || patchValue.to !== undefined) next = automaticComparison(next);
    setDraft(next); setApplied(next); setActivePreset("custom");
  }

  function resetAdvancedFilters() {
    const next = { ...draft, location: "all", employee: "", brand: "", category: "", subcategory: "", size: "", color: "", payment: "", product: "", snCod: "", search: "", source: "all" as SourceFilter, bucket: "auto" as BucketFilter };
    setDraft(next); setApplied(next);
  }

  const summary = data?.summary;
  const comparison = data?.comparisonSummary;
  const delta = data?.deltaPercent;
  const comparisonAvailable = numberValue(comparison?.liveRows) + numberValue(comparison?.historyRows) > 0;
  const targetProfitPercent = numberValue((data as any)?.pricingRule?.targetProfitPercent || 65);
  const salesTvaRate = numberValue(data?.salesTva?.rate || 21);
  const currentProfitPercent = numberValue((summary as any)?.profitPercent);
  const comparisonProfitPercent = numberValue((comparison as any)?.profitPercent);
  const currentTvaAmount = numberValue((summary as any)?.tvaAmount ?? (summary as any)?.tvaPayable);
  const comparisonTvaAmount = numberValue((comparison as any)?.tvaAmount ?? (comparison as any)?.tvaPayable);

  const locationOptions = useMemo<SelectOption[]>(() => [{ value: "all", label: "Minden üzlet" }, ...(data?.filterOptions.locations || []).filter((item) => SALES_STORE_CODES.has(String(item.code || ""))).map((item) => ({ value: item.code, label: friendlyLocationLabel(item.code, item.name) }))], [data?.filterOptions.locations]);
  const employeeOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden eladó" }, ...(data?.filterOptions.employees || []).map((value) => ({ value, label: value }))], [data?.filterOptions.employees]);
  const brandOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden márka" }, ...(data?.filterOptions.brands || []).map((value) => ({ value, label: value }))], [data?.filterOptions.brands]);
  const categoryOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden főkategória" }, ...(data?.filterOptions.categories || []).map((value) => ({ value, label: value }))], [data?.filterOptions.categories]);
  const subcategoryOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden alkategória" }, ...(data?.filterOptions.subcategories || []).map((value) => ({ value, label: value }))], [data?.filterOptions.subcategories]);
  const sizeOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden méret" }, ...(data?.filterOptions.sizes || []).map((value) => ({ value, label: value }))], [data?.filterOptions.sizes]);
  const colorOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden szín" }, ...(data?.filterOptions.colors || []).map((value) => ({ value, label: value }))], [data?.filterOptions.colors]);
  const paymentOptions = useMemo<SelectOption[]>(() => [{ value: "", label: "Minden fizetés" }, ...Array.from(new Map((data?.dimensions.payment || []).map((item) => [item.rawName || item.key, { value: item.rawName || item.key, label: paymentLabel(item.rawName || item.key || item.name) }])).values())], [data?.dimensions.payment]);

  const activeFilterCount = [draft.location !== "all" ? draft.location : "", draft.employee, draft.brand, draft.category, draft.subcategory, draft.size, draft.color, draft.payment, draft.product, draft.snCod, draft.search, draft.source !== "all" ? draft.source : "", draft.bucket !== "auto" ? draft.bucket : ""].filter(Boolean).length;
  const dimensionItems = data?.dimensions?.[dimension] || [];
  const dimensionMax = Math.max(1, ...dimensionItems.map((item) => Math.abs(metricValue(item.current, chartMetric))));
  const employees = (data?.employees || []).slice(0, 10);
  const employeeMax = Math.max(1, ...employees.map((item) => Math.abs(metricValue(item.current, chartMetric))));
  const detailRows = data?.details || [];
  const pageSize = 20;
  const totalDetailPages = Math.max(1, Math.ceil(detailRows.length / pageSize));
  const safeDetailsPage = Math.min(detailsPage, totalDetailPages);
  const visibleDetails = detailRows.slice((safeDetailsPage - 1) * pageSize, safeDetailsPage * pageSize);
  const heatMonths = data?.heatmap?.months || [];
  const heatRows = (data?.heatmap?.rows || []).slice(0, 8);
  const heatMax = Math.max(1, ...heatRows.flatMap((row) => row.values.map((value) => Math.abs(metricValue(value.current, heatmapMetric)))));

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#5a6575] via-[#505b6b] to-[#454f5e] text-white">
      <div className="mx-auto w-full max-w-[760px] pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-40 border-b border-white/12 bg-[#2d394b]/96 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-[0_14px_34px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#8ce7e2]/34 bg-[#2a8d8b]/22 text-[#d7fffd]"><Gauge size={22} /></span>
            <div className="min-w-0 flex-1"><p className="text-[9px] uppercase tracking-[0.16em] text-[#bff8f5]/58">Vezetői elemzés</p><h1 className="mt-0.5 truncate text-lg leading-tight text-white">Eladási központ</h1><p className="mt-0.5 truncate text-[11px] text-white/48">{shortPeriod(applied.from, applied.to)} • {actor}</p></div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => setFiltersOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/14 bg-white/[0.055] text-white active:scale-[0.97]" aria-label="Szűrők"><Filter size={17} />{activeFilterCount ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border border-[#2d394b] bg-[#2a8d8b] px-1 text-[9px]">{activeFilterCount}</span> : null}</button>
              <button type="button" onClick={() => void load()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl border border-white/14 bg-white/[0.055] text-white disabled:opacity-45" aria-label="Frissítés"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button>
              <button type="button" onClick={() => { window.location.hash = "#allin"; }} className="grid h-10 w-10 place-items-center rounded-xl border border-white/14 bg-white/[0.055] text-white" aria-label="Kezdőlap"><Home size={17} /></button>
            </div>
          </div>
          <div className="mt-3 flex w-full gap-1.5">{([ ["month", "Hónap"], ["lastMonth", "Előző hó"], ["fullYear", "Teljes év"], ["previousYear", "Előző év"] ] as Array<[QuickPreset, string]>).map(([key, label], index, items) => <button key={key} type="button" onClick={() => applyPreset(key)} className={`h-9 min-w-0 rounded-xl border px-2.5 text-[10px] transition ${index === items.length - 1 ? "flex-1" : "shrink-0"} ${activePreset === key ? "border-[#8ce7e2]/44 bg-[#2a8d8b] text-white" : "border-white/12 bg-white/[0.045] text-white/58"}`}>{label}</button>)}</div>
        </header>

        <div className="space-y-3 px-3 py-3">
          {error ? <div className="rounded-2xl border border-rose-200/28 bg-rose-500/14 px-3.5 py-3 text-sm text-rose-50"><AlertTriangle size={16} className="mr-2 inline" />{error}</div> : null}

          <section className="overflow-hidden rounded-[24px] border border-[#9be9e5]/30 bg-gradient-to-br from-[#227c72] via-[#2d6968] to-[#344154] p-4 shadow-[0_18px_42px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[9px] uppercase tracking-[0.15em] text-[#d7fffd]/62">Összes forgalom</p><p className="mt-2 break-words text-[clamp(1.7rem,8.6vw,2.45rem)] leading-none tracking-tight text-white">{money(summary?.revenue)}</p><p className="mt-2 text-[10px] text-white/46">{friendlyLocationLabel(applied.location, applied.location === "all" ? "Mindkét üzlet" : undefined)} • {integer(summary?.transactions)} eladás • {integer(summary?.itemsSold)} db</p></div>{comparisonAvailable ? <DeltaPill value={delta?.revenue} /> : null}</div>
            <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setHistoryOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#bff8f5]/32 bg-white/[0.08] text-[11px] text-white"><Database size={14} />Előzmények</button><button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/16 bg-[#293548]/80 text-[11px] text-white"><Filter size={14} />Részletes szűrés</button></div>
          </section>

          <section className="grid grid-cols-2 gap-2.5">
            <MetricCard title="Profit" value={compactMoney(summary?.grossProfit)} comparison={compactMoney(comparison?.grossProfit)} delta={delta?.grossProfit} icon={TrendingUp} tone="success" active={chartMetric === "grossProfit"} onClick={() => setChartMetric("grossProfit")} comparisonAvailable={comparisonAvailable} />
            <MetricCard title="Profit %" value={percentage(currentProfitPercent)} comparison={percentage(comparisonProfitPercent)} delta={comparisonAvailable ? deltaValue(currentProfitPercent, comparisonProfitPercent) : null} icon={Percent} tone="success" comparisonAvailable={comparisonAvailable} />
            <MetricCard title="Eladott darab" value={`${integer(summary?.itemsSold)} db`} comparison={`${integer(comparison?.itemsSold)} db`} delta={delta?.itemsSold} icon={ShoppingBag} active={chartMetric === "itemsSold"} onClick={() => setChartMetric("itemsSold")} comparisonAvailable={comparisonAvailable} />
            <MetricCard title="Tranzakció" value={integer(summary?.transactions)} comparison={integer(comparison?.transactions)} delta={delta?.transactions} icon={ReceiptText} active={chartMetric === "transactions"} onClick={() => setChartMetric("transactions")} comparisonAvailable={comparisonAvailable} />
            <MetricCard title="Kedvezmény" value={compactMoney(summary?.discountTotal)} comparison={compactMoney(comparison?.discountTotal)} delta={delta?.discountTotal} icon={Tags} tone={numberValue(summary?.discountTotal) > 0 ? "warning" : "normal"} active={chartMetric === "discountTotal"} onClick={() => setChartMetric("discountTotal")} comparisonAvailable={comparisonAvailable} />
            <MetricCard title="Kintlévőség" value={compactMoney(summary?.unpaidTotal)} comparison={compactMoney(comparison?.unpaidTotal)} delta={delta?.unpaidTotal} icon={WalletCards} tone={numberValue(summary?.unpaidTotal) > 0 ? "danger" : "normal"} active={chartMetric === "unpaidTotal"} onClick={() => setChartMetric("unpaidTotal")} comparisonAvailable={comparisonAvailable} />
            <MetricCard title="Befizetendő TVA" value={compactMoney(currentTvaAmount)} comparison={compactMoney(comparisonTvaAmount)} delta={comparisonAvailable ? deltaValue(currentTvaAmount, comparisonTvaAmount) : null} icon={CircleDollarSign} comparisonAvailable={comparisonAvailable} />
            <MetricCard title={`Célprofit ${integer(targetProfitPercent)}%`} value={`${percentage(summary?.costCoveragePercent, 0)} fedett`} comparison={`${percentage(comparison?.costCoveragePercent, 0)} fedett`} delta={null} icon={Gauge} comparisonAvailable={comparisonAvailable} />
          </section>

          {data ? <section className={`${panel} p-3.5`}><div className="mb-3 flex items-center justify-between"><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Adatbiztonság</p><h2 className="mt-0.5 text-base">Lefedettség</h2></div><CheckCircle2 size={18} className="text-[#8ee6e2]" /></div><div className="space-y-2">{[["Vételár", data.coverage.current.cost], ["Nettó", data.coverage.current.net], ["Történeti részletek", data.coverage.current.historyDetail]].map(([label, raw]) => { const value = numberValue(raw); return <div key={String(label)} className="rounded-xl border border-white/9 bg-[#293548] px-3 py-2"><div className="flex items-center justify-between text-[10px]"><span className="text-white/48">{label}</span><span className="text-white/78">{percentage(value, 0)}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#1d2737]"><div className={`h-full rounded-full ${value >= 99 ? "bg-[#54d7ce]" : value >= 75 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>; })}</div></section> : null}

          <section className={`${panel} p-3.5`}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Idősor</p><h2 className="mt-0.5 text-base">{chartMetricConfig[chartMetric].label} alakulása</h2></div><BarChart3 size={18} className="text-[#8ee6e2]" /></div>
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{(Object.keys(chartMetricConfig) as ChartMetric[]).map((key) => <button key={key} type="button" onClick={() => setChartMetric(key)} className={`h-8 shrink-0 rounded-lg border px-2.5 text-[9px] ${chartMetric === key ? "border-[#9be9e5]/44 bg-[#2a8d8b] text-white" : "border-white/10 bg-white/[0.03] text-white/48"}`}>{chartMetricConfig[key].short}</button>)}</div>
            <div className="mt-2"><MiniTrendChart data={data?.trend || { current: [], comparison: [] }} metric={chartMetric} comparisonAvailable={comparisonAvailable} /></div>
            <div className="mt-2 flex items-center justify-between text-[9px] text-white/38"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-[#58d7d0]" />Vizsgált</span>{comparisonAvailable ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-[#9aa7b7]" />Előző év</span> : <span>Előző év: nincs adat</span>}</div>
          </section>

          <section className={`${panel} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5"><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Csapat</p><h2 className="mt-0.5 text-base">Eladók teljesítménye</h2></div><Users size={18} className="text-[#8ee6e2]" /></div>
            <div className="divide-y divide-white/8">{employees.map((row) => { const value = metricValue(row.current, chartMetric); const active = applied.employee.toLowerCase() === row.actor.toLowerCase(); return <button key={row.actor} type="button" onClick={() => patch({ employee: active ? "" : row.actor })} className={`block w-full px-4 py-3 text-left ${active ? "bg-[#2a8d8b]/14" : ""}`}><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/12 bg-[#293548] text-[11px] text-[#bff8f5]">{row.rank}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-[12px] text-white">{row.actor}</p><p className="shrink-0 text-[11px] text-white">{chartMetricConfig[chartMetric].format(value)}</p></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#253143]"><div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#6ee7df]" style={{ width: `${Math.max(value ? 4 : 0, Math.abs(value) / employeeMax * 100)}%` }} /></div><p className="mt-1 text-[9px] text-white/38">{integer(row.current.itemsSold)} db • {integer(row.current.transactions)} eladás</p></div>{comparisonAvailable ? <DeltaPill value={row.deltaPercent?.[chartMetric]} inverse={chartMetric === "discountTotal" || chartMetric === "unpaidTotal"} /> : null}</div></button>; })}{!employees.length ? <div className="px-4 py-9 text-center text-xs text-white/42">Nincs eladói adat.</div> : null}</div>
          </section>

          <section className={`${panel} overflow-hidden`}>
            <div className="border-b border-white/10 px-4 py-3.5"><div className="flex items-center justify-between"><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Értékesítési bontás</p><h2 className="mt-0.5 text-base">Részletes bontás</h2></div><Layers3 size={18} className="text-[#8ee6e2]" /></div><div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{(Object.keys(dimensionLabels) as AifSalesCommandDimensionKey[]).map((key) => <button key={key} type="button" onClick={() => setDimension(key)} className={`h-8 shrink-0 rounded-lg border px-2.5 text-[9px] ${dimension === key ? "border-[#9be9e5]/44 bg-[#2a8d8b]" : "border-white/10 bg-white/[0.03] text-white/48"}`}>{dimensionLabels[key]}</button>)}</div></div>
            <div className="space-y-2 p-3">{dimensionItems.slice(0, 12).map((item) => { const value = metricValue(item.current, chartMetric); const label = dimensionItemLabel(dimension, item); return <button key={`${dimension}:${item.key}`} type="button" onClick={() => { if (dimension === "brand") patch({ brand: item.rawName || item.name }); else if (dimension === "category") patch({ category: item.rawName || item.name }); else if (dimension === "subcategory") patch({ subcategory: item.rawName || item.name }); else if (dimension === "size") patch({ size: item.rawName || item.name }); else if (dimension === "color") patch({ color: item.rawName || item.name }); else if (dimension === "payment") patch({ payment: item.rawName || item.key }); else if (dimension === "store") patch({ location: item.meta || item.key || item.rawName || item.name }); else if (dimension === "product") patch({ product: item.meta || item.rawName || item.name }); }} className="w-full rounded-2xl border border-white/9 bg-[#293548] p-3 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] text-white">{item.rank}. {label}</p><p className="mt-1 truncate text-[9px] text-white/38">{integer(item.current.itemsSold)} db • {integer(item.current.transactions)} tranzakció</p></div><div className="shrink-0 text-right"><p className="text-[11px] text-white">{chartMetricConfig[chartMetric].format(value)}</p>{comparisonAvailable ? <span className="mt-1 inline-flex"><DeltaPill value={item.deltaPercent?.[chartMetric]} inverse={chartMetric === "discountTotal" || chartMetric === "unpaidTotal"} /></span> : null}</div></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1d2737]"><div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#64ddd7]" style={{ width: `${Math.max(value ? 4 : 0, Math.abs(value) / dimensionMax * 100)}%` }} /></div></button>; })}{!dimensionItems.length ? <div className="px-3 py-8 text-center text-xs text-white/42">Nincs adat ebben a bontásban.</div> : null}</div>
          </section>

          <section className={`${panel} overflow-hidden`}>
            <div className="border-b border-white/10 px-4 py-3.5"><div className="flex items-center justify-between"><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Havi teljesítmény</p><h2 className="mt-0.5 text-base">Eladói hőtérkép</h2></div><div className="flex gap-1">{(["revenue", "itemsSold", "transactions", "grossProfit"] as const).map((key) => <button key={key} type="button" onClick={() => setHeatmapMetric(key)} className={`h-7 rounded-lg border px-2 text-[8px] ${heatmapMetric === key ? "border-[#8ce7e2]/40 bg-[#2a8d8b]" : "border-white/9 bg-white/[0.025] text-white/42"}`}>{chartMetricConfig[key].short}</button>)}</div></div></div>
            <div className="overflow-x-auto p-3"><div className="min-w-[620px] grid gap-1.5" style={{ gridTemplateColumns: `120px repeat(${Math.max(1, heatMonths.length)}, 72px)` }}><div /><>{heatMonths.map((month) => <div key={month.index} className="truncate text-center text-[8px] text-white/40">{month.label}</div>)}</>{heatRows.map((row) => <div key={row.actor} className="contents"><div className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-[#293548] px-2 text-[10px] text-white/72"><UserRound size={11} className="text-[#8ee6e2]" /><span className="truncate">{row.actor}</span></div>{heatMonths.map((month, index) => { const value = metricValue(row.values[index]?.current, heatmapMetric); const ratio = Math.min(1, Math.abs(value) / heatMax); return <button key={`${row.actor}:${month.index}`} type="button" onClick={() => { if (month.currentStart && month.currentEnd) patch({ employee: row.actor, from: month.currentStart, to: month.currentEnd }); }} className="h-10 rounded-xl border border-white/7 text-[9px] text-white" style={{ background: `rgba(42,141,139,${0.08 + ratio * 0.78})` }}>{value === 0 ? "–" : chartMetricConfig[heatmapMetric].format(value)}</button>; })}</div>)}</div></div>
          </section>

          <section className={`${panel} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5"><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Eladási adatok</p><h2 className="mt-0.5 text-base">Részletes tételek</h2></div><span className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[9px] text-white/52">{detailRows.length} sor</span></div>
            <div className="space-y-2 p-2.5">{visibleDetails.map((item) => <button key={`${item.source}:${item.id}`} type="button" onClick={() => setDetailTarget(item)} className="w-full rounded-[18px] border border-white/10 bg-[#293548] p-3 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><Store size={11} className="text-[#8ee6e2]" /><span className="truncate text-[9px] text-white/44">{friendlyLocationLabel(item.locationCode, item.locationName)} • {huDate(item.date)}</span></div><p className="mt-1.5 line-clamp-2 text-[12px] text-white">{item.productTitle || "Összesített havi adat"}</p><p className="mt-1 truncate text-[9px] text-white/40">{item.actor} • {[item.brandName, item.colorName, item.size].filter(Boolean).join(" • ") || item.documentNumber || "–"}</p></div><div className="shrink-0 text-right"><span className="inline-flex rounded-lg border border-[#7bd7d4]/20 bg-[#2a8d8b]/12 px-2 py-1 text-[10px] text-[#d7fffd]">{integer(item.quantity)} db</span><p className="mt-2 text-[11px] text-white">{money(item.revenue)}</p><p className={`mt-1 text-[9px] ${item.grossProfit >= 0 ? "text-emerald-100" : "text-rose-100"}`}>Profit {money(item.grossProfit)}</p></div></div></button>)}{!visibleDetails.length ? <div className="px-3 py-9 text-center text-xs text-white/42"><PackageSearch size={24} className="mx-auto mb-2 text-[#8ee6e2]/55" />Nincs részletes adat.</div> : null}</div>
            {detailRows.length > pageSize ? <footer className="flex items-center justify-between border-t border-white/10 bg-[#293548] px-3 py-2.5"><button type="button" disabled={safeDetailsPage <= 1} onClick={() => setDetailsPage((page) => Math.max(1, page - 1))} className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/14 bg-white/[0.05] px-3 text-[10px] disabled:opacity-35"><ChevronLeft size={13} />Előző</button><span className="text-[10px] text-white/46">{safeDetailsPage} / {totalDetailPages}</span><button type="button" disabled={safeDetailsPage >= totalDetailPages} onClick={() => setDetailsPage((page) => Math.min(totalDetailPages, page + 1))} className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/14 bg-white/[0.05] px-3 text-[10px] disabled:opacity-35">Következő<ChevronRight size={13} /></button></footer> : null}
          </section>
        </div>
      </div>

      {filtersOpen ? createPortal(
        <div className="fixed inset-0 z-[900] grid place-items-center bg-slate-950/72 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setFiltersOpen(false); }}>
          <section className="flex max-h-[86dvh] w-full max-w-[356px] flex-col overflow-hidden rounded-[26px] border border-white/18 bg-[#303c4f] shadow-[0_28px_90px_rgba(0,0,0,0.54)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-3.5 py-3"><div><p className="text-[8px] uppercase tracking-[0.14em] text-white/42">Vezetői eladások</p><h2 className="mt-0.5 text-[16px]">Szűrés</h2></div><button type="button" onClick={() => setFiltersOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/14 bg-white/[0.05]"><X size={17} /></button></header>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
              <div className="rounded-2xl border border-white/10 bg-[#2b3749] p-2.5"><div className="mb-2 grid grid-cols-2 gap-1.5"><button type="button" onClick={() => { setPeriodMode("month"); setActivePreset("custom"); }} className={`h-8 rounded-lg border text-[10px] ${periodMode === "month" ? "border-[#8ce7e2]/40 bg-[#2a8d8b]" : "border-white/10 bg-white/[0.03] text-white/48"}`}>Hónap</button><button type="button" onClick={() => { setPeriodMode("range"); setActivePreset("custom"); }} className={`h-8 rounded-lg border text-[10px] ${periodMode === "range" ? "border-[#8ce7e2]/40 bg-[#2a8d8b]" : "border-white/10 bg-white/[0.03] text-white/48"}`}>Egyedi</button></div>{periodMode === "month" ? <label className="grid gap-1 text-[8px] uppercase text-white/44">Hónap<MobileMonthPicker value={draft.from.slice(0, 7)} onChange={setSelectedMonth} /></label> : <div className="grid grid-cols-2 gap-1.5"><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Ettől<MobileDatePicker value={draft.from} onChange={(value) => setDraft(automaticComparison({ ...draft, from: value, to: draft.to < value ? value : draft.to }))} ariaLabel="Kezdő dátum" /></label><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Eddig<MobileDatePicker value={draft.to} onChange={(value) => setDraft(automaticComparison({ ...draft, to: value, from: draft.from > value ? value : draft.from }))} ariaLabel="Záró dátum" /></label></div>}<p className="mt-2 text-[9px] text-white/34">{monthDisplayLabel(draft.from.slice(0, 7))} ↔ előző év azonos időszaka</p></div>
              <label className="grid gap-1 text-[8px] uppercase text-white/44">Üzlet<MobileSelect value={draft.location} onChange={(value) => setDraft({ ...draft, location: value })} options={locationOptions} placeholder="Minden üzlet" /></label>
              <label className="grid gap-1 text-[8px] uppercase text-white/44">Eladó<MobileSelect value={draft.employee} onChange={(value) => setDraft({ ...draft, employee: value })} options={employeeOptions} placeholder="Minden eladó" /></label>
              <div className="grid grid-cols-2 gap-1.5"><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Márka<MobileSelect value={draft.brand} onChange={(value) => setDraft({ ...draft, brand: value })} options={brandOptions} placeholder="Márka" /></label><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Főkategória<MobileSelect value={draft.category} onChange={(value) => setDraft({ ...draft, category: value })} options={categoryOptions} placeholder="Kategória" /></label></div>
              <div className="grid grid-cols-2 gap-1.5"><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Alkategória<MobileSelect value={draft.subcategory} onChange={(value) => setDraft({ ...draft, subcategory: value })} options={subcategoryOptions} placeholder="Alkategória" /></label><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Méret<MobileSelect value={draft.size} onChange={(value) => setDraft({ ...draft, size: value })} options={sizeOptions} placeholder="Méret" /></label></div>
              <div className="grid grid-cols-2 gap-1.5"><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Szín<MobileSelect value={draft.color} onChange={(value) => setDraft({ ...draft, color: value })} options={colorOptions} placeholder="Szín" /></label><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Fizetés<MobileSelect value={draft.payment} onChange={(value) => setDraft({ ...draft, payment: value })} options={paymentOptions} placeholder="Fizetés" /></label></div>
              <div className="grid grid-cols-2 gap-1.5"><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Adatforrás<MobileSelect value={draft.source} onChange={(value) => setDraft({ ...draft, source: value as SourceFilter })} options={[{ value: "all", label: "Élő + történeti" }, { value: "live", label: "Csak élő" }, { value: "history", label: "Csak történeti" }]} placeholder="Forrás" /></label><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Grafikon<MobileSelect value={draft.bucket} onChange={(value) => setDraft({ ...draft, bucket: value as BucketFilter })} options={[{ value: "auto", label: "Automatikus" }, { value: "day", label: "Nap" }, { value: "week", label: "Hét" }, { value: "month", label: "Hónap" }]} placeholder="Bontás" /></label></div>
              <div className="grid grid-cols-2 gap-1.5"><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">Termék<input className={inputClass} value={draft.product} onChange={(e) => setDraft({ ...draft, product: e.target.value })} placeholder="Név / kód" /></label><label className="grid min-w-0 gap-1 text-[8px] uppercase text-white/44">S/N/COD<input className={inputClass} value={draft.snCod} onChange={(e) => setDraft({ ...draft, snCod: e.target.value })} placeholder="CAM007" /></label></div>
              <label className="grid gap-1 text-[8px] uppercase text-white/44">Keresés<div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-3 text-white/32" /><input className={`${inputClass} pl-9`} value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} placeholder="Bizonylat, márka, termék..." /></div></label>
            </div>
            <footer className="grid grid-cols-[0.9fr_1.35fr] gap-2 border-t border-white/10 bg-[#293548] p-2.5"><button type="button" onClick={resetAdvancedFilters} className="h-10 rounded-xl border border-white/14 bg-white/[0.05] text-[11px]">Alaphelyzet</button><button type="button" onClick={() => { setApplied(draft); setFiltersOpen(false); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#8ce7e2]/42 bg-[#2a8d8b] text-[11px]"><Search size={14} />Alkalmazás</button></footer>
          </section>
        </div>, document.body) : null}

      <DetailMobile item={detailTarget} onClose={() => setDetailTarget(null)} />
      <HistoryMobile open={historyOpen} onClose={() => setHistoryOpen(false)} data={data} onChanged={load} />
      {loading ? <div className="fixed inset-0 z-[880] grid place-items-center bg-slate-950/28 backdrop-blur-[2px]"><div className="flex items-center gap-3 rounded-2xl border border-white/18 bg-[#263348] px-5 py-4 shadow-2xl"><Loader2 className="animate-spin text-[#8ee6e2]" size={22} /><span className="text-sm">Vezetői adatok betöltése...</span></div></div> : null}
    </main>
  );
}
