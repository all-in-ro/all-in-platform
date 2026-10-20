import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  Filter,
  Layers,
  Search,
  Tag,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import {
  apiAifReceiveAllShopIncoming,
  apiAifReceiveShopIncomingLine,
  apiAifShopIncoming,
  apiAifShopIncomingHistory,
  apiAifShopIncomingReport,
  type AifShopIncomingDocument,
  type AifShopIncomingReportGroup,
  type AifShopIncomingHistoryItem,
} from "../lib/aif/api";

type Props = {
  open: boolean;
  actor: string;
  locationCode: "main_warehouse" | "magazin_targu_secuiesc";
  locationName: string;
  onClose: () => void;
};

type Mode = "waiting" | "history";

function currentMonth() {
  try {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 7);
  }
}

const HU_MONTHS = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
] as const;

function HungarianMonthPicker({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  const initialYear = match ? Number(match[1]) : new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [yearMode, setYearMode] = useState(false);
  const [year, setYear] = useState(initialYear);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const currentYear = Number(currentMonth().slice(0, 4));
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
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      setOpen(false); triggerRef.current?.focus();
    };
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
            <div className="mt-3 grid grid-cols-3 gap-2">{HU_MONTHS.map((monthName, index) => { const active = selectedYear === year && selectedMonth === index; return <button key={monthName} type="button" onClick={() => { onChange(`${year}-${String(index + 1).padStart(2, "0")}`); setOpen(false); }} className={`min-h-12 rounded-xl border px-2 text-xs transition ${active ? "border-[#bff8f5]/60 bg-[#2a8d8b] text-white" : "border-white/8 bg-[#2e3b4f] text-white/76 hover:border-[#7bd7d4]/28 hover:bg-[#3a4a61] hover:text-white"}`}>{monthName}</button>; })}</div>
          )}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("hu-HU", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatMoney(value?: number | string | null, currency = "RON") {
  const amount = Number(String(value ?? 0).replace(",", "."));
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const code = String(currency || "RON").trim().toUpperCase() || "RON";
  return `${new Intl.NumberFormat("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeAmount)} ${code}`;
}

function receivedByLabel(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "–";
  if (raw.toUpperCase() === "LEGACY_BACKFILL") return "Korábban átvéve";
  return raw;
}

function boundsOfMonth(value: string) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : Number(currentMonth().slice(0, 4));
  const month = match ? Number(match[2]) : Number(currentMonth().slice(5, 7));
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` };
}

function formatDateOnly(value?: string | null) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '–';
  const date = new Date(`${raw}T12:00:00Z`);
  return date.toLocaleDateString('hu-HU', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
}

type PickerOption = { value: string; label: string; description?: string };

/** Közös, portálos AllIn-legördülő: a hosszú márkalista sem vágódik le a modalban. */
function AllInPicker({ value, options, allLabel, onChange, ariaLabel, icon: PickerIcon = Filter }: {
  value: string;
  options: PickerOption[];
  allLabel: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  icon?: typeof Filter;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const visible = options.filter((option) => `${option.label} ${option.description || ''}`.toLocaleLowerCase('hu-HU').includes(query.trim().toLocaleLowerCase('hu-HU')));

  const reposition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const edge = 10;
    const width = Math.min(Math.max(rect.width, 300), 460, window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const below = window.innerHeight - rect.bottom - edge;
    const above = rect.top - edge;
    if (below < 280 && above > below) setPosition({ left, width, bottom: Math.max(edge, window.innerHeight - rect.top + 6) });
    else setPosition({ left, width, top: Math.max(edge, rect.bottom + 6) });
  }, []);

  useEffect(() => {
    if (!expanded) return;
    setQuery('');
    reposition();
    if (options.length > 6) searchRef.current?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!buttonRef.current?.contains(node) && !popupRef.current?.contains(node)) setExpanded(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      setExpanded(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutside, true);
    window.addEventListener('keydown', onEscape, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside, true);
      window.removeEventListener('keydown', onEscape, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [expanded, reposition, options.length]);

  return (
    <>
      <button ref={buttonRef} type="button" aria-label={ariaLabel} aria-expanded={expanded} aria-haspopup="listbox"
        onClick={() => { if (!expanded) reposition(); setExpanded((v) => !v); }}
        className={`flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-[13px] border px-3 text-left text-[13px] text-white transition ${expanded ? 'border-[#8ce7e2]/70 bg-[#315268] ring-2 ring-[#7bd7d4]/14' : 'border-white/18 bg-gradient-to-b from-[#2d394b] to-[#293548] hover:border-[#7bd7d4]/38'}`}>
        <span className="flex min-w-0 items-center gap-2"><PickerIcon size={16} className="shrink-0 text-[#8fe9e5]" /><span className="truncate">{selected?.label || allLabel}</span></span>
        <ChevronDown size={15} className={`shrink-0 text-white/55 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && position ? createPortal(
        <div ref={popupRef} role="listbox" aria-label={ariaLabel} className="fixed z-[1160] flex max-h-[min(420px,70dvh)] flex-col overflow-hidden rounded-[18px] border border-[#8ce7e2]/44 bg-[#223146] p-2 text-white shadow-[0_28px_75px_rgba(2,6,23,0.74)]"
          style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom }}>
          {options.length > 6 ? (
            <div className="relative mb-2 shrink-0"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8fe9e5]" /><input ref={searchRef} value={query} onChange={(event: { target: { value: string } }) => setQuery(event.target.value)} placeholder="Keresés…" className="h-10 w-full rounded-xl border border-white/14 bg-[#162337] pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-[#7bd7d4]/70" /></div>
          ) : null}
          <div className="min-h-0 space-y-1 overflow-y-auto overscroll-contain">
            <button type="button" role="option" aria-selected={!value} onClick={() => { onChange(''); setExpanded(false); }} className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left text-[13px] transition ${!value ? 'border-[#9be9e5]/46 bg-[#2a8d8b] text-white' : 'border-transparent bg-[#303e51] text-white/78 hover:bg-[#3c4e63]'}`}><span>{allLabel}</span>{!value ? <Check size={16} /> : null}</button>
            {visible.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} onClick={() => { onChange(option.value); setExpanded(false); }} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${option.value === value ? 'border-[#9be9e5]/46 bg-[#2a8d8b] text-white' : 'border-transparent bg-[#303e51] text-white/85 hover:bg-[#3c4e63]'}`}><span className="min-w-0"><span className="block truncate text-[13px]">{option.label}</span>{option.description ? <span className="mt-0.5 block truncate text-[10px] text-white/54">{option.description}</span> : null}</span>{option.value === value ? <Check size={16} className="shrink-0" /> : null}</button>)}
            {query && !visible.length ? <p className="px-3 py-4 text-center text-[12px] text-white/50">Nincs találat.</p> : null}
          </div>
        </div>, document.body,
      ) : null}
    </>
  );
}

/** Egyedi magyar naptár a két dátumhoz, ugyanazzal a megjelenéssel mint a hónapválasztó. */
function AllInDatePicker({ value, ariaLabel, onChange }: { value: string; ariaLabel: string; onChange: (value: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [monthAt, setMonthAt] = useState(() => String(value || currentMonth()).slice(0, 7));
  const [yearMode, setYearMode] = useState(false);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const monthMatch = monthAt.match(/^(\d{4})-(\d{2})$/);
  const y = monthMatch ? Number(monthMatch[1]) : new Date().getFullYear();
  const m = monthMatch ? Number(monthMatch[2]) : 1;
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1, 12)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : 0;
  });
  const chosen = String(value || '').slice(0, 10);
  const yearChoices = Array.from({ length: 16 }, (_, index) => y + 2 - index);

  const reposition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const edge = 10;
    const width = Math.min(332, window.innerWidth - edge * 2);
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    const below = window.innerHeight - rect.bottom - edge;
    const above = rect.top - edge;
    if (below < 325 && above > below) setPosition({ left, width, bottom: Math.max(edge, window.innerHeight - rect.top + 7) });
    else setPosition({ left, width, top: Math.max(edge, rect.bottom + 7) });
  }, []);

  useEffect(() => {
    if (!expanded) return;
    setMonthAt(String(value || currentMonth()).slice(0, 7));
    setYearMode(false);
    reposition();
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!buttonRef.current?.contains(node) && !popupRef.current?.contains(node)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      setExpanded(false); buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [expanded, value, reposition]);

  function shiftMonth(amount: number) {
    const date = new Date(Date.UTC(y, m - 1 + amount, 1, 12));
    setMonthAt(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <>
      <button ref={buttonRef} type="button" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={expanded} onClick={() => { if (!expanded) reposition(); setExpanded((v) => !v); }}
        className={`flex h-11 w-full items-center justify-between gap-2 rounded-[13px] border px-3 text-[13px] text-white transition ${expanded ? 'border-[#8ce7e2]/70 bg-[#315268] ring-2 ring-[#7bd7d4]/14' : 'border-white/18 bg-gradient-to-b from-[#2d394b] to-[#293548] hover:border-[#7bd7d4]/38'}`}>
        <span className="flex min-w-0 items-center gap-2"><CalendarDays size={16} className="shrink-0 text-[#8fe9e5]" /><span className="truncate">{formatDateOnly(value)}</span></span><ChevronDown size={15} className={`shrink-0 text-white/55 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && position ? createPortal(
        <div ref={popupRef} role="dialog" aria-label={ariaLabel} className="fixed z-[1160] rounded-[19px] border border-[#8ce7e2]/44 bg-[#223146] p-3 text-white shadow-[0_28px_75px_rgba(2,6,23,0.74)]" style={{ left: position.left, width: position.width, top: position.top, bottom: position.bottom }}>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#2d3d50] px-1.5 py-1.5">
            <button type="button" onClick={() => shiftMonth(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/75 hover:bg-[#2a8d8b]/25"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => setYearMode((v) => !v)} className={`min-w-0 rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-white/8 ${yearMode ? 'bg-[#2a8d8b]/30' : ''}`}>{y}. {HU_MONTHS[m - 1]}</button>
            <button type="button" onClick={() => shiftMonth(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/75 hover:bg-[#2a8d8b]/25"><ChevronRight size={18} /></button>
          </div>
          {yearMode ? (
            <div className="mt-3 grid max-h-[248px] grid-cols-4 gap-1.5 overflow-y-auto">{yearChoices.map((year) => <button key={year} type="button" onClick={() => { setMonthAt(`${year}-${String(m).padStart(2, '0')}`); setYearMode(false); }} className={`h-10 rounded-lg border text-xs ${year === y ? 'border-[#b9f5f2]/55 bg-[#2a8d8b]' : 'border-white/10 bg-[#334358] hover:bg-[#40536a]'}`}>{year}</button>)}</div>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-white/43">{['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="mt-1 grid grid-cols-7 gap-1">{cells.map((day, index) => {
                if (!day) return <span key={`blank-${index}`} className="h-9" />;
                const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const selected = iso === chosen;
                const today = iso === new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                return <button key={iso} type="button" onClick={() => { onChange(iso); setExpanded(false); }} aria-pressed={selected} className={`h-9 rounded-lg border text-xs transition ${selected ? 'border-[#c5f9f6]/75 bg-[#2a8d8b] text-white' : today ? 'border-[#8ce7e2]/45 bg-[#315268] text-white' : 'border-transparent bg-[#2d3d50] text-white/85 hover:border-[#7bd7d4]/45 hover:bg-[#3e5367]'}`}>{day}</button>;
              })}</div>
            </>
          )}
        </div>, document.body,
      ) : null}
    </>
  );
}

function moneyBreakdown(rows: AifShopIncomingReportGroup[]) {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const currency = String(row.currencyCode || 'RON').trim().toUpperCase() || 'RON';
    sums.set(currency, (sums.get(currency) || 0) + Number(row.lineValue || 0));
  }
  return Array.from(sums.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function groupedValue(rows: AifShopIncomingReportGroup[]) {
  const groups = moneyBreakdown(rows);
  return groups.length ? groups.map(([currency, amount]) => formatMoney(amount, currency)).join(' • ') : formatMoney(0);
}

type IncomingHistoryDocument = {
  id: string;
  source: AifShopIncomingReportGroup;
  groups: AifShopIncomingReportGroup[];
  qty: number;
  lines: number;
  unpriced: number;
  brands: string[];
  lastReceivedAt?: string | null;
};

function toHistoryDocuments(groups: AifShopIncomingReportGroup[]): IncomingHistoryDocument[] {
  const map = new Map<string, IncomingHistoryDocument>();
  for (const group of groups) {
    let document = map.get(group.documentId);
    if (!document) {
      document = { id: group.documentId, source: group, groups: [], qty: 0, lines: 0, unpriced: 0, brands: [], lastReceivedAt: group.lastReceivedAt };
      map.set(group.documentId, document);
    }
    document.groups.push(group);
    document.qty += Number(group.qty || 0);
    document.lines += Number(group.lineCount || 0);
    document.unpriced += Number(group.unpricedLines || 0);
    if (!document.brands.includes(group.brandName)) document.brands.push(group.brandName);
    if (String(group.lastReceivedAt || '') > String(document.lastReceivedAt || '')) document.lastReceivedAt = group.lastReceivedAt;
  }
  return Array.from(map.values()).sort((a, b) => String(b.lastReceivedAt || '').localeCompare(String(a.lastReceivedAt || '')) || a.source.documentNumber.localeCompare(b.source.documentNumber, 'hu-HU'));
}

export default function AllInShopIncoming({ open, actor, locationCode, locationName, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("waiting");
  const [items, setItems] = useState<AifShopIncomingDocument[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [historyFrom, setHistoryFrom] = useState(() => boundsOfMonth(currentMonth()).from);
  const [historyTo, setHistoryTo] = useState(() => boundsOfMonth(currentMonth()).to);
  const [historyGroups, setHistoryGroups] = useState<AifShopIncomingReportGroup[]>([]);
  const [brandFilter, setBrandFilter] = useState("");
  const [documentFilter, setDocumentFilter] = useState("");
  const [receptionFilter, setReceptionFilter] = useState("");
  const [historyView, setHistoryView] = useState<"documents" | "brands">("documents");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyDetailCache, setHistoryDetailCache] = useState<Record<string, AifShopIncomingHistoryItem[]>>({});
  const [historyDetailLoading, setHistoryDetailLoading] = useState<string | null>(null);
  const [historyDetailError, setHistoryDetailError] = useState("");
  const historyRequestRef = useRef(0);
  const [expandedDocumentId, setExpandedDocumentId] = useState<string | null>(null);
  const [waitingLoading, setWaitingLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("waiting");
    setError("");
    setSuccess("");
    historyRequestRef.current += 1;
    const initialMonth = currentMonth();
    const dates = boundsOfMonth(initialMonth);
    setMonth(initialMonth);
    setHistoryFrom(dates.from);
    setHistoryTo(dates.to);
    setHistoryGroups([]);
    setBrandFilter("");
    setDocumentFilter("");
    setReceptionFilter("");
    setHistoryView("documents");
    setExpandedHistoryId(null);
    setHistoryDetailCache({});
    setHistoryDetailError("");
    setExpandedDocumentId(null);
    void loadWaiting();
  }, [open, locationCode]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busyKey) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [busyKey, onClose, open]);

  async function loadWaiting() {
    setWaitingLoading(true);
    setError("");
    try {
      const response = await apiAifShopIncoming({ location: locationCode });
      const nextItems = response.items || [];
      setItems(nextItems);
      setExpandedDocumentId((current) =>
        current && nextItems.some((item) => item.id === current) ? current : null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A beérkező áru nem tölthető be.");
    } finally {
      setWaitingLoading(false);
    }
  }

  async function loadHistory(from = historyFrom, to = historyTo) {
    const requestId = ++historyRequestRef.current;
    if (!from || !to || from > to) {
      setError("Érvénytelen dátumintervallum.");
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    setHistoryGroups([]);
    setError("");
    try {
      const response = await apiAifShopIncomingReport({ location: locationCode, from, to });
      if (requestId !== historyRequestRef.current) return;
      setHistoryGroups(response.groups || []);
      setExpandedHistoryId(null);
      setHistoryDetailCache({});
      setHistoryDetailError("");
    } catch (caught) {
      if (requestId !== historyRequestRef.current) return;
      setError(caught instanceof Error ? caught.message : "A beérkezési előzmény nem tölthető be.");
      setHistoryGroups([]);
    } finally {
      if (requestId === historyRequestRef.current) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!open || mode !== "history") return;
    void loadHistory(historyFrom, historyTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, locationCode, historyFrom, historyTo]);

  function chooseMonth(value: string) {
    const bounds = boundsOfMonth(value);
    setMonth(value);
    setHistoryFrom(bounds.from);
    setHistoryTo(bounds.to);
  }

  function resetHistoryFilters() {
    const initial = currentMonth();
    chooseMonth(initial);
    setBrandFilter("");
    setDocumentFilter("");
    setReceptionFilter("");
    setExpandedHistoryId(null);
    setHistoryView("documents");
  }

  async function expandHistoryDocument(docId: string) {
    if (expandedHistoryId === docId) { setExpandedHistoryId(null); return; }
    setExpandedHistoryId(docId);
    setHistoryDetailError("");
    const key = `${docId}|${historyFrom}|${historyTo}|${brandFilter}`;
    if (historyDetailCache[key]) return;
    setHistoryDetailLoading(key);
    try {
      const response = await apiAifShopIncomingHistory({ location: locationCode, from: historyFrom, to: historyTo, documentId: docId, brand: brandFilter || undefined });
      setHistoryDetailCache((current) => ({ ...current, [key]: response.items || [] }));
    } catch (caught) {
      setHistoryDetailError(caught instanceof Error ? caught.message : "Az Aviz tételei nem tölthetők be.");
    } finally {
      setHistoryDetailLoading((current) => current === key ? null : current);
    }
  }

  async function receiveLine(lineId: string) {
    setBusyKey(lineId);
    setError("");
    try {
      const result = await apiAifReceiveShopIncomingLine(lineId, { location: locationCode });
      setSuccess(result.stockApplied ? "A termék megérkezett és bekerült az üzlet készletébe." : "A termék átvétele rögzítve. Ennél a korábbi Aviznál a készlet már előzőleg könyvelve volt.");
      await loadWaiting();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A termék átvétele nem sikerült.");
    } finally {
      setBusyKey("");
    }
  }

  async function receiveAll(document: AifShopIncomingDocument) {
    setBusyKey(`doc:${document.id}`);
    setError("");
    try {
      const result = await apiAifReceiveAllShopIncoming(document.id, { location: locationCode });
      setSuccess(`${result.received} tétel átvéve${result.duplicates ? ` • ${result.duplicates} már korábban átvéve` : ""}.`);
      await loadWaiting();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az Aviz átvétele nem sikerült.");
    } finally {
      setBusyKey("");
    }
  }

  // A riportot az Avizhoz tartozó átvételi bizonylatsorokból építjük.
  // Márkaszűréskor CSAK az adott márka sorait összesítjük; az Aviz teljes
  // értéke külön adat marad, és soha nem kerül újra hozzáadásra.
  const allDocuments = useMemo(() => toHistoryDocuments(historyGroups), [historyGroups]);
  const brandOptions = useMemo(() => Array.from(new Set(historyGroups.map((row) => row.brandName)))
    .sort((a, b) => a.localeCompare(b, "hu-HU"))
    .map((name) => ({ value: name, label: name })), [historyGroups]);
  const documentOptions = useMemo(() => allDocuments.map((doc) => ({
    value: doc.id, label: doc.source.documentNumber,
    description: `${formatDateOnly(doc.source.documentDate)} • ${doc.qty} db`,
  })), [allDocuments]);
  const receptionOptions = useMemo(() => {
    const seen = new Map<string, PickerOption>();
    for (const doc of allDocuments) {
      const reception = doc.source;
      if (!reception.receptionId || seen.has(reception.receptionId)) continue;
      seen.set(reception.receptionId, {
        value: reception.receptionId,
        label: reception.receptionAvizNumber || reception.receptionInvoiceNumber || `ID: ${reception.receptionId}`,
        description: reception.receptionInvoiceNumber && reception.receptionAvizNumber ? `Számla: ${reception.receptionInvoiceNumber}` : undefined,
      });
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, "hu-HU"));
  }, [allDocuments]);
  const filteredHistoryGroups = useMemo(() => historyGroups.filter((row) =>
    (!brandFilter || row.brandName === brandFilter) &&
    (!documentFilter || row.documentId === documentFilter) &&
    (!receptionFilter || row.receptionId === receptionFilter)
  ), [historyGroups, brandFilter, documentFilter, receptionFilter]);
  const filteredDocuments = useMemo(() => toHistoryDocuments(filteredHistoryGroups), [filteredHistoryGroups]);
  const totalQty = filteredHistoryGroups.reduce((sum, group) => sum + Number(group.qty || 0), 0);
  const totalLines = filteredHistoryGroups.reduce((sum, group) => sum + Number(group.lineCount || 0), 0);
  const missingPrices = filteredHistoryGroups.reduce((sum, group) => sum + Number(group.unpricedLines || 0), 0);
  const brandReport = useMemo(() => {
    const brands = new Map<string, { name: string; groups: AifShopIncomingReportGroup[]; qty: number; lines: number; documents: Set<string> }>();
    for (const group of filteredHistoryGroups) {
      let brand = brands.get(group.brandName);
      if (!brand) {
        brand = { name: group.brandName, groups: [], qty: 0, lines: 0, documents: new Set<string>() };
        brands.set(group.brandName, brand);
      }
      brand.groups.push(group);
      brand.qty += Number(group.qty || 0);
      brand.lines += Number(group.lineCount || 0);
      brand.documents.add(group.documentId);
    }
    return Array.from(brands.values()).sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "hu-HU"));
  }, [filteredHistoryGroups]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[245] flex items-center justify-center bg-[#111827]/82 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex max-h-[95vh] w-full max-w-[1380px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/36 bg-[#303a4c] text-white shadow-[0_36px_110px_rgba(0,0,0,0.6)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#9be9e5]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><Truck size={24} /></span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Üzletközi átvétel</p>
              <h2 className="mt-1 text-xl">Beérkező áru</h2>
              <p className="mt-1 text-xs text-white/45">{locationName} • {actor}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setMode("waiting"); setExpandedDocumentId(null); void loadWaiting(); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs ${mode === "waiting" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.05]"}`}><Truck size={15} /> Érkezésre vár</button>
            <button type="button" onClick={() => { setMode("history"); setExpandedDocumentId(null); setSuccess(""); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs ${mode === "history" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.05]"}`}><History size={15} /> Beérkezési előzmény</button>
            <button type="button" onClick={() => mode === "waiting" ? void loadWaiting() : void loadHistory()} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05]"><RefreshCw size={16} /></button>
            <button type="button" onClick={onClose} disabled={Boolean(busyKey)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] disabled:opacity-50"><X size={18} /></button>
          </div>
        </header>

        {error ? <div className="mx-5 mt-4 rounded-2xl border border-rose-300/35 bg-rose-500/16 px-4 py-3 text-sm text-rose-50">{error}</div> : null}
        {success ? <div className="mx-5 mt-4 flex items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/14 px-4 py-3 text-sm text-emerald-50"><CheckCircle2 size={18} />{success}</div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {mode === "history" ? (
            <div className="space-y-3">
              <section className="rounded-[22px] border border-[#9be9e5]/22 bg-[#263548] p-3.5 sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#9be9e5]/24 bg-[#2a8d8b]/18 text-[#a8f1ee]"><Filter size={17} /></span>
                    <h3 className="text-[15px] text-white">Beérkezési kimutatás</h3>
                  </div>
                  <div className="w-full sm:w-[250px]"><HungarianMonthPicker value={month} onChange={chooseMonth} ariaLabel="Gyors hónapválasztás" /></div>
                </div>
                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-5">
                  <div className="min-w-0"><span className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-white/48">Mettől</span><AllInDatePicker value={historyFrom} onChange={(next) => { setMonth(""); setHistoryFrom(next); if (next > historyTo) setHistoryTo(next); }} ariaLabel="Beérkezés kezdődátuma" /></div>
                  <div className="min-w-0"><span className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-white/48">Meddig</span><AllInDatePicker value={historyTo} onChange={(next) => { setMonth(""); setHistoryTo(next); if (next < historyFrom) setHistoryFrom(next); }} ariaLabel="Beérkezés záródátuma" /></div>
                  <div className="min-w-0"><span className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-white/48">Márka</span><AllInPicker icon={Tag} value={brandFilter} onChange={(next) => { setBrandFilter(next); setExpandedHistoryId(null); }} options={brandOptions} allLabel="Összes márka" ariaLabel="Márka szűrő" /></div>
                  <div className="min-w-0"><span className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-white/48">Aviz</span><AllInPicker icon={FileText} value={documentFilter} onChange={(next) => { setDocumentFilter(next); setExpandedHistoryId(null); }} options={documentOptions} allLabel="Összes Aviz" ariaLabel="Aviz szűrő" /></div>
                  <div className="min-w-0"><span className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-white/48">Receptio</span><AllInPicker icon={Layers} value={receptionFilter} onChange={(next) => { setReceptionFilter(next); setExpandedHistoryId(null); }} options={receptionOptions} allLabel="Összes Receptio" ariaLabel="Receptio szűrő" /></div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/9 pt-3">
                  <p className="text-[11px] text-white/48">{formatDateOnly(historyFrom)} – {formatDateOnly(historyTo)}</p>
                  <button type="button" onClick={resetHistoryFilters} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-white/16 bg-[#354153] px-3 text-xs text-white/82 transition hover:border-[#7bd7d4]/35 hover:bg-[#405069]"><RefreshCw size={13} /> Szűrők törlése</button>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="rounded-[18px] border border-white/13 bg-[#374357] px-3 py-3.5"><p className="text-[10px] text-white/52">Avizok</p><p className="mt-1 text-[25px] tabular-nums text-white">{filteredDocuments.length}</p></div>
                <div className="rounded-[18px] border border-white/13 bg-[#374357] px-3 py-3.5"><p className="text-[10px] text-white/52">Átvett tételek</p><p className="mt-1 text-[25px] tabular-nums text-white">{totalLines} <span className="text-xs text-white/45">tétel</span></p></div>
                <div className="rounded-[18px] border border-[#9be9e5]/28 bg-[#2a8d8b]/17 px-3 py-3.5"><p className="text-[10px] text-[#d7fffd]/65">Átvett mennyiség</p><p className="mt-1 text-[25px] tabular-nums text-[#d7fffd]">{totalQty} <span className="text-xs text-[#d7fffd]/65">db</span></p></div>
                <div className="rounded-[18px] border border-[#f8cb2e]/43 bg-[#f8cb2e]/10 px-3 py-3.5"><p className="text-[10px] text-[#f8cb2e]/72">Átvett eladási érték</p><p className="mt-2 break-words text-[17px] font-semibold tabular-nums text-[#f8cb2e]">{groupedValue(filteredHistoryGroups)}</p></div>
              </div>
              {missingPrices ? <p className="px-2 text-[11px] text-amber-200/83">{missingPrices} tételnél nincs bizonylaton rögzített eladási ár. Ezek értéke nincs hozzászámítva.</p> : null}

              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/12 pb-2">
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setHistoryView("documents")} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[12px] transition ${historyView === 'documents' ? 'border-[#9be9e5]/55 bg-[#2a8d8b] text-white' : 'border-white/12 bg-[#354153] text-white/62 hover:text-white'}`}><FileText size={16} /> Avizok</button>
                  <button type="button" onClick={() => setHistoryView("brands")} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[12px] transition ${historyView === 'brands' ? 'border-[#9be9e5]/55 bg-[#2a8d8b] text-white' : 'border-white/12 bg-[#354153] text-white/62 hover:text-white'}`}><Tag size={16} /> Márkák</button>
                </div>
                <span className="text-[11px] text-white/45">{historyView === 'documents' ? `${filteredDocuments.length} Aviz` : `${brandReport.length} márka`}</span>
              </div>
              {historyLoading ? <Loading /> : !filteredHistoryGroups.length ? (
                <Empty text="A megadott feltételekkel nincs rögzített áruátvétel." />
              ) : historyView === "brands" ? (
                <div className="space-y-2.5">
                  {brandReport.map((brand) => (
                    <section key={brand.name} className="rounded-[20px] border border-white/14 bg-[#344154] p-3.5 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0"><p className="text-[16px] text-white">{brand.name}</p><p className="mt-1 text-[11px] text-white/48">{brand.documents.size} Aviz • {brand.lines} tétel</p></div>
                        <div className="flex flex-wrap items-center gap-3 text-right"><div><p className="text-[10px] text-white/42">Darabszám</p><p className="mt-1 text-lg text-[#d7fffd]">{brand.qty} db</p></div><div className="border-l border-white/16 pl-3"><p className="text-[10px] text-[#f8cb2e]/72">Eladási érték</p><p className="mt-1 text-lg text-[#f8cb2e]">{groupedValue(brand.groups)}</p></div></div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/9 pt-3">
                        {Array.from(brand.documents).map((id) => {
                          const doc = allDocuments.find((item) => item.id === id);
                          return doc ? <button key={id} type="button" onClick={() => { setBrandFilter(brand.name); setDocumentFilter(doc.id); setHistoryView('documents'); setExpandedHistoryId(null); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#9be9e5]/28 bg-[#263d4f] px-3 text-[11px] text-[#d7fffd] transition hover:border-[#9be9e5]/60 hover:bg-[#2a8d8b] hover:text-white"><FileText size={13} />{doc.source.documentNumber}</button> : null;
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredDocuments.map((doc) => {
                    const expanded = expandedHistoryId === doc.id;
                    const key = `${doc.id}|${historyFrom}|${historyTo}|${brandFilter}`;
                    const detailLines = historyDetailCache[key];
                    const receptionLabel = doc.source.receptionAvizNumber || doc.source.receptionInvoiceNumber || doc.source.receptionId || null;
                    return <article key={doc.id} className={`overflow-hidden rounded-[21px] border bg-[#374357] transition ${expanded ? 'border-[#9be9e5]/50' : 'border-white/14'}`}>
                      <button type="button" onClick={() => void expandHistoryDocument(doc.id)} aria-expanded={expanded} className={`flex w-full flex-wrap items-center justify-between gap-3 px-3.5 py-3.5 text-left transition sm:px-4 ${expanded ? 'bg-[#254853]' : 'bg-[#303d50] hover:bg-[#36475b]'}`}>
                        <span className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#9be9e5]/28 bg-[#2a8d8b]/17 text-[#a8f1ee]"><FileText size={19} /></span>
                          <span className="min-w-0"><span className="block text-[16px] text-white">{doc.source.documentNumber}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-white/62">Átvétel: {formatDateTime(doc.lastReceivedAt)} • Aviz kelte: {formatDateOnly(doc.source.documentDate)}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-white/42">{doc.source.sourceName} → {doc.source.targetName}</span>
                            <span className="mt-1.5 block text-[11px] text-white/65">{doc.source.receptionAvizNumber ? 'Receptio / Aviz: ' : doc.source.receptionInvoiceNumber ? 'Receptio / számla: ' : doc.source.receptionId ? 'Receptio ID: ' : 'Receptio: '}<span className={receptionLabel ? 'text-[#c5f7f3]' : 'text-white/40'}>{receptionLabel || 'Nincs összerendelve'}</span>{doc.source.receptionInvoiceNumber && doc.source.receptionAvizNumber ? <span className="ml-2 text-white/43">Számla: {doc.source.receptionInvoiceNumber}</span> : null}</span>
                          </span>
                        </span>
                        <span className="flex min-w-0 items-center gap-2.5 sm:gap-4">
                          <span className="hidden text-right sm:block"><span className="block text-[10px] text-white/42">Átvett</span><span className="mt-1 block text-[14px] text-[#d7fffd]">{doc.qty} db • {doc.lines} tétel</span></span>
                          <span className="min-w-[135px] text-right"><span className="block text-[10px] text-[#f8cb2e]/65">Eladási érték</span><span className="mt-1 block text-[14px] text-[#f8cb2e] sm:text-[16px]">{groupedValue(doc.groups)}</span></span>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/13 bg-black/10"><ChevronDown size={18} className={`transition ${expanded ? 'rotate-180' : ''}`} /></span>
                        </span>
                      </button>
                      {expanded ? (
                        <div className="space-y-3 border-t border-white/10 p-3.5 sm:p-4">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-xl border border-white/10 bg-[#293548] px-3 py-2.5"><p className="text-[10px] text-white/40">Aviz teljes értéke</p><p className="mt-1 text-[14px] text-white">{formatMoney(doc.source.documentTotalValue, doc.source.documentCurrencyCode)}</p></div>
                            <div className="rounded-xl border border-[#9be9e5]/18 bg-[#274652] px-3 py-2.5"><p className="text-[10px] text-white/45">Átvett érték (szűrve)</p><p className="mt-1 text-[14px] text-[#d7fffd]">{groupedValue(doc.groups)}</p></div>
                            <div className="rounded-xl border border-white/10 bg-[#293548] px-3 py-2.5"><p className="text-[10px] text-white/40">Legutóbbi átvétel</p><p className="mt-1 text-[12px] text-white">{formatDateTime(doc.lastReceivedAt)}</p></div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {doc.groups.map((group) => <span key={`${group.brandName}|${group.currencyCode}`} className="inline-flex items-center gap-2 rounded-lg border border-[#7bd7d4]/22 bg-[#2a8d8b]/11 px-3 py-2 text-[11px] text-[#d7fffd]"><Tag size={13} />{group.brandName} <span className="text-white/48">{group.qty} db</span><span className="text-[#f8cb2e]">{formatMoney(group.lineValue, group.currencyCode)}</span></span>)}
                          </div>
                          {historyDetailLoading === key ? <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-white/50"><Loader2 size={16} className="animate-spin" /> Tételek betöltése…</div> : historyDetailError && !detailLines ? <p className="rounded-xl border border-red-300/35 bg-red-600/13 p-3 text-xs text-red-100">{historyDetailError}</p> : detailLines?.length ? <div className="space-y-1.5 border-t border-white/9 pt-3">{detailLines.map((item) => <HistoryRow key={item.id} item={item} />)}</div> : <p className="py-4 text-center text-xs text-white/44">Nincs átvett terméksor.</p>}
                        </div>
                      ) : null}
                    </article>;
                  })}
                </div>
              )}
            </div>
          ) : waitingLoading ? <Loading /> : items.length ? (
            <div className="space-y-3">
              {items.map((document) => (
                <IncomingDocument
                  key={document.id}
                  document={document}
                  expanded={expandedDocumentId === document.id}
                  busyKey={busyKey}
                  onToggle={() => setExpandedDocumentId((current) => current === document.id ? null : document.id)}
                  onReceiveLine={receiveLine}
                  onReceiveAll={receiveAll}
                />
              ))}
            </div>
          ) : <Empty text="Nincs átvételre váró Aviz ennél az üzletnél." />}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function IncomingDocument({
  document,
  expanded,
  busyKey,
  onToggle,
  onReceiveLine,
  onReceiveAll,
}: {
  document: AifShopIncomingDocument;
  expanded: boolean;
  busyKey: string;
  onToggle: () => void;
  onReceiveLine: (id: string) => void;
  onReceiveAll: (doc: AifShopIncomingDocument) => void;
}) {
  const issued = document.status === "issued";
  const pendingLines = document.lines.filter((line) => !line.received);
  const legacy = document.inventoryMode !== "in_transit_until_received";

  return (
    <article className={`overflow-hidden rounded-[24px] border transition ${expanded ? "border-[#7bd7d4]/42 shadow-[0_16px_34px_rgba(15,23,42,0.20)]" : "border-white/14"} ${issued ? "bg-[#374357]" : "bg-[#414454]"}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left transition ${
          expanded
            ? issued ? "border-b border-white/10 bg-[#303b4e]" : "border-b border-amber-100/12 bg-amber-400/8"
            : issued ? "bg-[#303b4e] hover:bg-[#364459]" : "bg-amber-400/8 hover:bg-amber-400/12"
        }`}
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${issued ? "border-[#7bd7d4]/28 bg-[#2a8d8b]/14 text-[#a9f3ef]" : "border-amber-200/25 bg-amber-400/10 text-amber-100"}`}>
            <Truck size={18} />
          </span>

          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[17px] text-white">{document.documentNumber}</span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] ${issued ? "border-emerald-300/30 bg-emerald-500/12 text-emerald-50" : "border-amber-200/35 bg-amber-400/10 text-amber-50"}`}>
                {issued ? "LEZÁRT AVIZ • átvehető" : "ELŐKÉSZÍTÉS • még nem vehető át"}
              </span>
              {legacy ? (
                <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/50">
                  Korábbi készletlogika
                </span>
              ) : null}
            </span>

            <span className="mt-1.5 block truncate text-xs text-white/50">
              {document.sourceLocation.name} → {document.targetLocation.name} • {formatDateTime(document.createdAt)}
            </span>
            {document.note ? <span className="mt-1 block truncate text-xs text-white/55">{document.note}</span> : null}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-3">
          <span className="hidden text-right sm:block">
            <span className="block text-[9px] uppercase tracking-[0.1em] text-white/38">Állapot</span>
            <span className="mt-1 block text-base text-[#d7fffd]">
              {document.receivedCount}/{document.lineCount} tétel átvéve
            </span>
            <span className="block text-[11px] text-white/42">{document.totalQty} db az Avizon</span>
            <span className="mt-0.5 block text-[11px] font-medium text-[#f8cb2e]">Összérték: {formatMoney(document.totalValue, document.currencyCode)}</span>
          </span>

          <span className="rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 px-2.5 py-1.5 text-[11px] text-[#d7fffd] sm:hidden">
            <span className="block">{document.receivedCount}/{document.lineCount} • {document.totalQty} db</span>
            <span className="mt-0.5 block text-[10px] font-medium text-[#f8cb2e]">{formatMoney(document.totalValue, document.currencyCode)}</span>
          </span>

          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition ${expanded ? "border-[#9be9e5]/42 bg-[#2a8d8b] text-white" : "border-white/14 bg-black/10 text-white/62"}`}>
            <ChevronDown size={19} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </span>
        </span>
      </button>

      {expanded ? (
        <>
          {!issued ? (
            <div className="flex items-start gap-3 border-b border-amber-200/15 bg-amber-400/8 px-4 py-3 text-sm text-amber-50">
              <Clock3 className="mt-0.5 shrink-0" size={18} />
              <div>
                <p>Az áru látszik, de még nem pipálható ki.</p>
                <p className="mt-1 text-xs text-amber-100/65">A „Megjött” csak akkor aktiválódik, amikor a főnök lezárta az Avizt.</p>
              </div>
            </div>
          ) : null}

          <div className="space-y-2 p-3">
            {document.lines.map((line) => (
              <div
                key={line.id}
                className={`grid grid-cols-[64px_1fr_auto] items-center gap-3 rounded-2xl border p-3 ${
                  line.received ? "border-emerald-300/18 bg-emerald-500/8" : "border-white/10 bg-[#293548]"
                }`}
              >
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-white/95">
                  {line.imageUrl ? (
                    <img src={line.imageUrl} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ShoppingBag className="text-slate-500" />
                  )}
                </span>

                <div className="min-w-0">
                  <p className="truncate text-sm">{line.title}</p>
                  <p className="mt-1 text-[11px] text-white/48">
                    {[line.brandName, line.colorName, line.size, line.productCode].filter(Boolean).join(" • ")}
                  </p>
                  {line.received ? (
                    <p className="mt-2 text-xs text-emerald-100">
                      Átvette: {receivedByLabel(line.receivedBy)} • {formatDateTime(line.receivedAt)}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-white/42">{line.qty} db érkezik</p>
                  )}
                </div>

                {line.received ? (
                  <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/12 px-3 text-xs text-emerald-50">
                    <CheckCircle2 size={15} /> Megérkezett
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={!issued || Boolean(busyKey)}
                    onClick={() => onReceiveLine(line.id)}
                    className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                      issued ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.05]"
                    }`}
                  >
                    {busyKey === line.id ? <Loader2 className="animate-spin" size={16} /> : <PackageCheck size={16} />}
                    Megjött
                  </button>
                )}
              </div>
            ))}
          </div>

          {issued && pendingLines.length > 1 ? (
            <footer className="flex justify-end border-t border-white/10 bg-black/5 px-4 py-3">
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => onReceiveAll(document)}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-4 text-sm disabled:opacity-45"
              >
                {busyKey === `doc:${document.id}` ? <Loader2 className="animate-spin" size={16} /> : <PackageCheck size={16} />}
                Minden tétel megjött
              </button>
            </footer>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

function HistoryRow({ item }: { item: AifShopIncomingHistoryItem }) {
  return (
    <div className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-white/10 bg-[#293548] p-2.5 sm:gap-3 sm:p-3">
      <span className="flex h-[54px] w-[54px] items-center justify-center overflow-hidden rounded-lg bg-white/95">
        {item.product.imageUrl ? <img src={item.product.imageUrl} alt="" className="h-full w-full object-contain" /> : <ShoppingBag size={20} className="text-slate-500" />}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] text-white">{item.product.title}</p>
        <p className="mt-1 truncate text-[11px] text-white/48">{[item.product.brandName, item.product.colorName, item.product.size, item.product.productCode].filter(Boolean).join(" • ")}</p>
        <p className="mt-1 truncate text-[10px] text-white/42">{formatDateTime(item.receivedAt)} • {receivedByLabel(item.receivedBy)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14px] text-[#d7fffd]">{item.qty} db</p>
        <p className="mt-1 text-[13px] text-[#f8cb2e]">{item.lineValue === null ? "Nincs ár" : formatMoney(item.lineValue, item.currencyCode)}</p>
      </div>
    </div>
  );
}

function Loading() {
  return <div className="flex min-h-[360px] items-center justify-center gap-3 text-white/50"><Loader2 className="animate-spin" /> Betöltés…</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/14 bg-black/5 text-center text-white/42"><Truck size={40} /><p className="mt-3 text-base">{text}</p></div>;
}
