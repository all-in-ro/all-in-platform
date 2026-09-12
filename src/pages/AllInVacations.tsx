import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BarChart3,
  BellRing,
  CheckCircle2,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ClipboardList,
  Clock3,
  History,
  MessageSquareText,
  Pencil,
  Home,
  RefreshCw,
  Save,
  Scale,
  Search,
  Settings2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
  Users2,
  X,
} from "lucide-react";

type Employee = { name: string };

type TimeEvent = {
  id: string;
  employeeName: string;
  day: string; // YYYY-MM-DD
  kind: "vacation" | "short";
  hoursOff: number | null;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
};

type SummaryRow = { employeeName: string; vacationDays: number; shortDays: number; shortHours: number };

type CompEvent = {
  id: string;
  employeeName: string;
  day: string; // YYYY-MM-DD
  unit: "day" | "hour";
  amount: number; // + = tartozunk neki, - = kompenzaltuk
  note: string;
  createdAt: string;
  createdBy: string | null;
};

type CompSummaryRow = {
  employeeName: string;
  creditDays: number;
  creditHours: number;
  debitDays: number;
  debitHours: number;
  balanceDays: number;
  balanceHours: number;
};

type YearSummaryRow = {
  employeeName: string;
  vacationDays: number;
  shortDays: number;
  shortHours: number;
  compCreditDays?: number;
  compCreditHours?: number;
  compDebitDays?: number;
  compDebitHours?: number;
  compBalanceDays?: number;
  compBalanceHours?: number;
};

type VacationSettings = {
  workingDays: number[];
  dayNames?: string[];
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type VacationActivityMonth = {
  month: string;
  vacationDays: number;
  firstDay?: string | null;
  lastDay?: string | null;
};

type SavedVacationPeriod = {
  key: string;
  dayFrom: string;
  dayTo: string;
  workingDays: number;
  calendarDays: number;
  note: string | null;
};

type VacationRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

type VacationRequestItem = {
  id: string;
  employeeName: string;
  shopId?: string | null;
  kind: "vacation" | "short";
  dayFrom: string;
  dayTo: string;
  hoursOff?: number | null;
  note?: string | null;
  status: VacationRequestStatus;
  requestedAt?: string | null;
  requestedBy?: string | null;
  decidedAt?: string | null;
  decidedBy?: string | null;
  decisionNote?: string | null;
  employeeSeenAt?: string | null;
};

const WEEK_DAYS = [
  { id: 1, short: "H", label: "Hétfő" },
  { id: 2, short: "K", label: "Kedd" },
  { id: 3, short: "Sze", label: "Szerda" },
  { id: 4, short: "Cs", label: "Csütörtök" },
  { id: 5, short: "P", label: "Péntek" },
  { id: 6, short: "Szo", label: "Szombat" },
  { id: 7, short: "V", label: "Vasárnap" },
];


const PDF_ICON_URL = "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/PDF.png";

function PdfIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <img src={PDF_ICON_URL} alt="" aria-hidden="true" className={`${className} shrink-0 object-contain`} />;
}

function normBase(s: string) {
  return s.replace(/\/+$/, "");
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function yyyymmNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function fmtKind(k: TimeEvent["kind"]) {
  return k === "vacation" ? "Szabadság" : "Elkérezés";
}

function formatRequestDate(value?: string | null) {
  if (!value) return "–";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}

function formatRequestDateTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function requestPeriodLabel(request: VacationRequestItem) {
  if (request.kind === "short") return `${formatRequestDate(request.dayFrom)} • ${request.hoursOff || 0} óra`;
  return request.dayFrom === request.dayTo
    ? formatRequestDate(request.dayFrom)
    : `${formatRequestDate(request.dayFrom)} – ${formatRequestDate(request.dayTo)}`;
}

function empKey(name: string) {
  return String(name || "").trim().replace(/\s+/g, " " ).toLowerCase();
}

function formatMonthLabel(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value || "-";
  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long" }).format(date);
}

function normalizeMonthRange(monthFrom: string, monthTo: string) {
  const from = /^\d{4}-\d{2}$/.test(monthFrom) ? monthFrom : yyyymmNow();
  const to = /^\d{4}-\d{2}$/.test(monthTo) ? monthTo : from;
  return from <= to ? { from, to } : { from: to, to: from };
}

function monthValuesBetween(monthFrom: string, monthTo: string) {
  const range = normalizeMonthRange(monthFrom, monthTo);
  const [fromYear, fromMonth] = range.from.split("-").map(Number);
  const [toYear, toMonth] = range.to.split("-").map(Number);
  const values: string[] = [];
  const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, 1));
  const end = new Date(Date.UTC(toYear, toMonth - 1, 1));
  while (cursor <= end && values.length < 120) {
    values.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return values;
}

function formatMonthRangeLabel(monthFrom: string, monthTo: string) {
  const range = normalizeMonthRange(monthFrom, monthTo);
  if (range.from === range.to) return formatMonthLabel(range.from);
  const [fromYear, fromMonth] = range.from.split("-").map(Number);
  const [toYear, toMonth] = range.to.split("-").map(Number);
  if (fromYear === toYear) {
    const fromName = new Intl.DateTimeFormat("hu-HU", { month: "long" }).format(new Date(fromYear, fromMonth - 1, 1));
    const toName = new Intl.DateTimeFormat("hu-HU", { month: "long" }).format(new Date(toYear, toMonth - 1, 1));
    return `${fromYear}. ${fromName} – ${toName}`;
  }
  return `${formatMonthLabel(range.from)} – ${formatMonthLabel(range.to)}`;
}

function isoWeekdayForDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return null;
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function normalizeTimeEvents(rows: TimeEvent[], workingDays: number[]): TimeEvent[] {
  const enabledDays = new Set(
    (workingDays?.length ? workingDays : [1, 2, 3, 4, 5])
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
  );
  const unique = new Map<string, TimeEvent>();

  for (const row of rows || []) {
    const employeeName = String(row?.employeeName || "").trim().replace(/\s+/g, " ");
    const day = String(row?.day || "").slice(0, 10);
    const kind = row?.kind;
    if (!employeeName || !/^\d{4}-\d{2}-\d{2}$/.test(day) || (kind !== "vacation" && kind !== "short")) continue;

    // A szabadságkártyák ugyanazt a központi munkanap-beállítást kövessék,
    // mint a mentés. Régi vagy hibás hétvégi sor ne növelje a napok számát.
    if (kind === "vacation") {
      const isoDay = isoWeekdayForDay(day);
      if (isoDay == null || !enabledDays.has(isoDay)) continue;
    }

    const normalized: TimeEvent = { ...row, employeeName, day };
    const key = `${empKey(employeeName)}__${day}__${kind}`;
    const current = unique.get(key);
    if (!current) {
      unique.set(key, normalized);
      continue;
    }

    // Elvileg az adatbázis egyedi kulcsa kizárja a duplát. Ha régi adatból mégis
    // maradt kettő, a frissebb sort tartjuk meg, nem számoljuk kétszer ugyanazt a napot.
    const currentTime = current.createdAt ? new Date(current.createdAt).getTime() : 0;
    const nextTime = normalized.createdAt ? new Date(normalized.createdAt).getTime() : 0;
    if (nextTime >= currentTime) unique.set(key, normalized);
  }

  return Array.from(unique.values());
}

function summarizeTimeEvents(rows: TimeEvent[], workingDays: number[]): SummaryRow[] {
  const summary = new Map<string, SummaryRow>();
  for (const row of normalizeTimeEvents(rows, workingDays)) {
    const key = empKey(row.employeeName);
    if (!key) continue;
    const current = summary.get(key) || {
      employeeName: row.employeeName,
      vacationDays: 0,
      shortDays: 0,
      shortHours: 0,
    };
    if (row.kind === "vacation") current.vacationDays += 1;
    if (row.kind === "short") {
      current.shortDays += 1;
      current.shortHours += Number(row.hoursOff || 0);
    }
    summary.set(key, current);
  }
  return Array.from(summary.values()).sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName, "hu", { sensitivity: "base" })
  );
}

function mergeVacationCompSummaryRows(groups: CompSummaryRow[][]): CompSummaryRow[] {
  const map = new Map<string, CompSummaryRow>();
  for (const rows of groups) {
    for (const row of rows || []) {
      const key = empKey(row.employeeName);
      if (!key) continue;
      const current = map.get(key) || {
        employeeName: row.employeeName,
        creditDays: 0,
        creditHours: 0,
        debitDays: 0,
        debitHours: 0,
        balanceDays: 0,
        balanceHours: 0,
      };
      current.creditDays += Number(row.creditDays || 0);
      current.creditHours += Number(row.creditHours || 0);
      current.debitDays += Number(row.debitDays || 0);
      current.debitHours += Number(row.debitHours || 0);
      current.balanceDays += Number(row.balanceDays || 0);
      current.balanceHours += Number(row.balanceHours || 0);
      map.set(key, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName, "hu", { sensitivity: "base" }));
}

function initials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "-").slice(0, 2);
}

function countVacationPeriod(dayFrom: string, dayTo: string, workingDays: number[]) {
  const start = new Date(`${dayFrom}T00:00:00Z`);
  const end = new Date(`${dayTo || dayFrom}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { calendarDays: 0, workingDays: 0, excludedDays: 0 };
  }
  const enabled = new Set((workingDays?.length ? workingDays : [1, 2, 3, 4, 5]).map(Number));
  let calendarDays = 0;
  let counted = 0;
  for (let time = start.getTime(); time <= end.getTime(); time += 24 * 60 * 60 * 1000) {
    const current = new Date(time);
    const jsDay = current.getUTCDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    calendarDays += 1;
    if (enabled.has(isoDay)) counted += 1;
  }
  return { calendarDays, workingDays: counted, excludedDays: calendarDays - counted };
}

function buildSavedVacationPeriods(items: TimeEvent[], workingDays: number[]): SavedVacationPeriod[] {
  const vacationItems = items
    .filter((item) => item.kind === "vacation" && /^\d{4}-\d{2}-\d{2}$/.test(item.day))
    .slice()
    .sort((a, b) => a.day.localeCompare(b.day));

  const groupedByRequest = new Map<string, TimeEvent[]>();
  for (const item of vacationItems) {
    const createdKey = item.createdAt ? new Date(item.createdAt).toISOString() : item.id;
    const key = `${createdKey}__${String(item.note || "").trim()}`;
    const current = groupedByRequest.get(key) || [];
    current.push(item);
    groupedByRequest.set(key, current);
  }

  return Array.from(groupedByRequest.entries())
    .map(([key, rows]) => {
      const ordered = rows.slice().sort((a, b) => a.day.localeCompare(b.day));
      const dayFrom = ordered[0]?.day || "";
      const dayTo = ordered[ordered.length - 1]?.day || dayFrom;
      const preview = countVacationPeriod(dayFrom, dayTo, workingDays);
      return {
        key,
        dayFrom,
        dayTo,
        workingDays: rows.length || preview.workingDays,
        calendarDays: preview.calendarDays,
        note: ordered.find((row) => String(row.note || "").trim())?.note || null,
      };
    })
    .filter((period) => period.dayFrom && period.dayTo)
    .sort((a, b) => b.dayFrom.localeCompare(a.dayFrom));
}

function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();

    if ("addEventListener" in mq) mq.addEventListener("change", onChange);
    else (mq as any).addListener(onChange);

    return () => {
      if ("removeEventListener" in mq) mq.removeEventListener("change", onChange);
      else (mq as any).removeListener(onChange);
    };
  }, [breakpointPx]);

  return isMobile;
}


type AllInSelectOption = { value: string; label: string; disabled?: boolean };

function AllInSelect({
  value,
  options,
  onChange,
  placeholder = "Válassz",
  ariaLabel,
  compact = false,
}: {
  value: string;
  options: AllInSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const selectedOption = options.find((option) => String(option.value) === String(value)) || null;
  const searchable = options.length > 10;
  const normalizedQuery = normalize(String(query || ""));
  const visibleOptions = normalizedQuery
    ? options.filter((option) => normalize(option.label).includes(normalizedQuery))
    : options;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const updatePosition = useCallback(() => {
    const node = triggerRef.current;
    if (!node || typeof window === "undefined") return;
    const rect = node.getBoundingClientRect();
    const edge = 10;
    const width = Math.min(Math.max(rect.width, 180), Math.max(180, window.innerWidth - edge * 2));
    const left = Math.min(Math.max(edge, rect.left), Math.max(edge, window.innerWidth - width - edge));
    const wanted = Math.min(310, 18 + (searchable ? 46 : 0) + Math.max(1, options.length) * 36);
    const below = Math.max(0, window.innerHeight - rect.bottom - edge);
    const above = Math.max(0, rect.top - edge);
    const up = below < Math.min(170, wanted) && above > below;
    const maxHeight = Math.max(110, Math.min(wanted, up ? above - 6 : below - 6));
    setStyle({
      position: "fixed",
      left,
      width,
      top: up ? Math.max(edge, rect.top - 6) : Math.min(window.innerHeight - edge, rect.bottom + 6),
      maxHeight,
      transform: up ? "translateY(-100%)" : "none",
      zIndex: 2147483200,
    });
  }, [options.length, searchable]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    const outside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } };
    const reposition = () => updatePosition();
    document.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [close, open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (open) close();
          else {
            setQuery("");
            updatePosition();
            setOpen(true);
          }
        }}
        className={`flex w-full min-w-0 items-center justify-between gap-2 border border-white/18 bg-[#344154] px-3 text-left font-normal text-white outline-none transition hover:bg-[#3d4b5f] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/16 ${compact ? "h-9 rounded-xl text-[11px]" : "h-10 rounded-xl text-[12px]"}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selectedOption ? "text-white" : "text-white/42"}`}>{selectedOption?.label || placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/52 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#7bd7d4]/34 bg-[#263246] text-white shadow-[0_24px_70px_rgba(2,6,23,0.72)]"
          style={style}
        >
          {searchable ? (
            <div className="shrink-0 border-b border-white/10 bg-[#303a4c] p-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-8 w-full rounded-xl border border-white/14 bg-[#202b3b] pl-8 pr-8 text-[11px] text-white outline-none placeholder:text-white/34 focus:border-[#7bd7d4]/55"
                  placeholder="Keresés..."
                />
                {query ? <button type="button" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/46"><X className="h-3 w-3" /></button> : null}
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            <div className="grid gap-1">
              {visibleOptions.map((option) => {
                const active = String(option.value) === String(value);
                return (
                  <button
                    key={option.value || "__empty"}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                      close();
                    }}
                    className={`flex min-h-8 w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-left text-[11px] transition disabled:opacity-40 ${active ? "border-[#7bd7d4]/48 bg-[#2a8d8b] text-white" : "border-transparent bg-[#354153] text-white/80 hover:bg-[#415064]"}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {active ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#d7fffd]" /> : null}
                  </button>
                );
              })}
              {!visibleOptions.length ? <div className="px-3 py-5 text-center text-[11px] text-white/42">Nincs találat.</div> : null}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

const VAC_MONTHS = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"] as const;
const VAC_WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"] as const;

function VacationDatePicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
  const [year, month] = normalized.split("-").map(Number);
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month - 1);

  useEffect(() => {
    if (!open) return;
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
    const [y, m] = valid.split("-").map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); } };
    window.addEventListener("keydown", escape, true);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", escape, true);
    };
  }, [open, value]);

  const first = new Date(Date.UTC(viewYear, viewMonth, 1, 12));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(1 - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  });
  const today = new Date().toISOString().slice(0, 10);
  const toIso = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  const shiftMonth = (delta: number) => {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1, 12));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  };

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl border border-white/18 bg-[#344154] px-3 text-left text-[12px] text-white outline-none transition hover:bg-[#3d4b5f] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/16"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#8ee6e2]" /><span className="truncate">{formatRequestDate(value)}</span></span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/50" />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[2147483300] grid place-items-center bg-slate-950/72 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <div className="w-full max-w-[310px] overflow-hidden rounded-[24px] border border-[#8ce7e2]/42 bg-[#202c3d] p-3 text-white shadow-[0_32px_90px_rgba(2,6,23,0.78)]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/9 bg-[#29374b] px-2 py-2">
              <button type="button" onClick={() => shiftMonth(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/78"><ChevronLeft className="h-4 w-4" /></button>
              <div className="min-w-0 text-center"><div className="text-[8px] uppercase tracking-[0.14em] text-[#cffffd]/45">Dátum</div><div className="mt-0.5 text-[14px] text-white">{viewYear}. {VAC_MONTHS[viewMonth]}</div></div>
              <button type="button" onClick={() => shiftMonth(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/78"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1">
              {VAC_WEEKDAYS.map((day) => <div key={day} className="py-1 text-center text-[9px] uppercase text-white/42">{day}</div>)}
              {days.map((date) => {
                const iso = toIso(date);
                const currentMonth = date.getUTCMonth() === viewMonth;
                const active = iso === value;
                const isToday = iso === today;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => { onChange(iso); setOpen(false); }}
                    className={`relative flex h-9 items-center justify-center rounded-lg border text-[11px] transition ${active ? "border-[#bff8f5]/60 bg-[#2a8d8b] text-white" : currentMonth ? "border-transparent bg-white/[0.025] text-white/82 hover:bg-white/[0.08]" : "border-transparent text-white/22"}`}
                  >
                    {date.getUTCDate()}
                    {isToday && !active ? <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#7bd7d4]" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/8 pt-3">
              <button type="button" onClick={() => { onChange(today); setOpen(false); }} className="h-9 rounded-xl border border-[#8ce7e2]/28 bg-[#2a8d8b]/18 text-[10px] text-[#d7fffd]">Ma</button>
              <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-xl border border-white/12 bg-white/[0.04] text-[10px] text-white/70">Bezárás</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export default function AllInVacations({ api }: { api?: string }) {
  const apiBase = useMemo(() => {
    const fromProp = typeof api === "string" && api.trim() ? api.trim() : "";
    const fromEnv = (import.meta as any)?.env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE) : "";
    const base = fromProp || fromEnv || "/api";
    return normBase(base);
  }, [api]);

  const isMobile = useIsMobile();

  const card = "overflow-hidden rounded-[22px] border border-white/14 bg-[#344154] shadow-[0_14px_34px_rgba(15,23,42,0.16)]";
  const panel = "overflow-hidden rounded-[22px] border border-white/14 bg-[#344154] shadow-[0_14px_34px_rgba(15,23,42,0.14)]";
  const panelHead = "flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3";
  const label = "text-white/65 text-xs";
  const input =
    "w-full h-10 rounded-xl px-3 border border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18";
  const btn =
    "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-3 text-xs text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap";
  const btnPrimary =
    "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/40 bg-[#2a8d8b] px-3 text-xs text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap";
  const btnSoft =
    "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/[0.07] px-3 text-xs text-white transition hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap";
  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/18 bg-[#354153] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-45";
  const dangerIconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/75 bg-[#E21C2A] text-white shadow-[0_8px_18px_rgba(226,28,42,0.24)] transition hover:bg-[#C91522] active:scale-[0.97]";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empErr, setEmpErr] = useState("");
  const [empBusy, setEmpBusy] = useState(false);

  const [q, setQ] = useState("");
  const filteredEmployees = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(s));
  }, [employees, q]);

  const [selected, setSelected] = useState<string>("");

  const [monthFrom, setMonthFrom] = useState<string>(yyyymmNow());
  const [monthTo, setMonthTo] = useState<string>(yyyymmNow());
  const [items, setItems] = useState<TimeEvent[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [compItems, setCompItems] = useState<CompEvent[]>([]);
  const [compSummary, setCompSummary] = useState<CompSummaryRow[]>([]);
  const [listErr, setListErr] = useState("");
  const [listBusy, setListBusy] = useState(false);
  const listRequestIdRef = useRef(0);
  const activityMonthsRequestIdRef = useRef(0);
  // A közös időszakot csak az első sikeres betöltés állíthatja be automatikusan.
  // Dolgozóváltáskor tilos odébb húzni a teljes lista mérési időszakát.
  const rangeInitializedRef = useRef(false);

  // Mobile UI state
  const [mobilePane, setMobilePane] = useState<"employees" | "details">("employees");
  useEffect(() => {
    if (!isMobile) return;
    // If we already have a selected employee, land on details; otherwise employees list.
    setMobilePane(selected ? "details" : "employees");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // Create
  const [day, setDay] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dayTo, setDayTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<TimeEvent["kind"]>("vacation");
  const [shortHours, setShortHours] = useState<number>(4);
  const [note, setNote] = useState<string>("");
  const [saveErr, setSaveErr] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  // Compensation (tartozas / kompenzacio)
  const [compDay, setCompDay] = useState<string>(new Date().toISOString().slice(0, 10));
  const [compUnit, setCompUnit] = useState<"day" | "hour">("hour");
  const [compDir, setCompDir] = useState<"credit" | "debit">("credit");
  const [compAmount, setCompAmount] = useState<number>(2);
  const [compNote, setCompNote] = useState<string>("");
  const [compErr, setCompErr] = useState<string>("");
  const [compBusy, setCompBusy] = useState(false);

  // Keep period end sane when switching types / changing start day.
  useEffect(() => {
    if (kind !== "vacation") return;
    if (!dayTo) setDayTo(day);
    // If start > end, align end to start.
    if (day && dayTo && day > dayTo) setDayTo(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, day]);

  // Confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"deleteTime" | "deleteComp" | "saveComp" | null>(null);

  // Year summary + PDF
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryYear, setSummaryYear] = useState<number>(new Date().getFullYear());
  const [yearRows, setYearRows] = useState<YearSummaryRow[]>([]);
  const [yearErr, setYearErr] = useState("");
  const [yearBusy, setYearBusy] = useState(false);

  // Only show employees in the yearly summary that actually have any data.
  const yearRowsNonZero = useMemo(() => {
    return (yearRows || []).filter((r) => {
      const v = Number(r.vacationDays ?? 0) || 0;
      const sd = Number(r.shortDays ?? 0) || 0;
      const sh = Number(r.shortHours ?? 0) || 0;
      const cbd = Number(r.compBalanceDays ?? 0) || 0;
      const cbh = Number(r.compBalanceHours ?? 0) || 0;
      const ccd = Number(r.compCreditDays ?? 0) || 0;
      const cch = Number(r.compCreditHours ?? 0) || 0;
      const cdd = Number(r.compDebitDays ?? 0) || 0;
      const cdh = Number(r.compDebitHours ?? 0) || 0;
      return v !== 0 || sd !== 0 || sh !== 0 || cbd !== 0 || cbh !== 0 || ccd !== 0 || cch !== 0 || cdd !== 0 || cdh !== 0;
    });
  }, [yearRows]);

  // PDF settings modal (desktop only)
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfYear, setPdfYear] = useState<number>(new Date().getFullYear());
  const [pdfEmployee, setPdfEmployee] = useState<string>(""); // empty = all

  const [vacationSettings, setVacationSettings] = useState<VacationSettings>({ workingDays: [1, 2, 3, 4, 5] });
  const [settingsDraft, setSettingsDraft] = useState<number[]>([1, 2, 3, 4, 5]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [pageNotice, setPageNotice] = useState("");
  const [pendingRequests, setPendingRequests] = useState<VacationRequestItem[]>([]);
  const [pendingRequestsBusy, setPendingRequestsBusy] = useState(false);
  const [pendingRequestsError, setPendingRequestsError] = useState("");
  const [decisionTarget, setDecisionTarget] = useState<VacationRequestItem | null>(null);
  const [decisionMode, setDecisionMode] = useState<"approved" | "rejected" | "edit">("approved");
  const [decisionNote, setDecisionNote] = useState("");
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [requestEditDayFrom, setRequestEditDayFrom] = useState("");
  const [requestEditDayTo, setRequestEditDayTo] = useState("");
  const [requestEditHoursOff, setRequestEditHoursOff] = useState(4);
  const [requestEditNote, setRequestEditNote] = useState("");
  const pendingByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const request of pendingRequests) {
      const key = empKey(request.employeeName);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [pendingRequests]);
  const pendingRequestedByEmployee = useMemo(() => {
    const map = new Map<string, { vacationWorkingDays: number; shortHours: number }>();
    for (const request of pendingRequests) {
      const key = empKey(request.employeeName);
      const current = map.get(key) || { vacationWorkingDays: 0, shortHours: 0 };
      if (request.kind === "vacation") {
        current.vacationWorkingDays += countVacationPeriod(
          request.dayFrom,
          request.dayTo || request.dayFrom,
          vacationSettings.workingDays,
        ).workingDays;
      } else {
        current.shortHours += Number(request.hoursOff || 0);
      }
      map.set(key, current);
    }
    return map;
  }, [pendingRequests, vacationSettings.workingDays]);
  const selectedPendingRequests = useMemo(
    () => pendingRequests.filter((request) => empKey(request.employeeName) === empKey(selected)),
    [pendingRequests, selected],
  );
  const [activityMonths, setActivityMonths] = useState<VacationActivityMonth[]>([]);
  const [activityMonthsBusy, setActivityMonthsBusy] = useState(false);

  const archiveYear = Number(monthFrom.slice(0, 4)) || new Date().getFullYear();
  const archiveYears = useMemo(() => {
    const years = Array.from(
      new Set<number>(
        activityMonths
          .map((item) => Number(String(item.month || "").slice(0, 4)))
          .filter((year) => Number.isFinite(year) && year >= 2000 && year <= 2100)
      )
    ).sort((a, b) => b - a);
    return years.length ? years : [new Date().getFullYear()];
  }, [activityMonths]);
  const activityMonthsForYear = useMemo(
    () => activityMonths
      .filter((item) => String(item.month || "").startsWith(`${archiveYear}-`))
      .slice()
      .sort((a, b) => String(a.month || "").localeCompare(String(b.month || ""))),
    [activityMonths, archiveYear]
  );
  const pdfYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set<number>([currentYear, pdfYear, summaryYear]);
    for (let offset = 0; offset <= 10; offset += 1) years.add(currentYear - offset);
    for (const item of activityMonths) {
      const year = Number(String(item.month || "").slice(0, 4));
      if (Number.isFinite(year) && year >= 2000 && year <= 2100) years.add(year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [activityMonths, pdfYear, summaryYear]);

  const changeArchiveYear = (nextYear: number) => {
    if (!Number.isFinite(nextYear)) return;
    rangeInitializedRef.current = true;
    const months = activityMonths
      .filter((item) => String(item.month || "").startsWith(`${nextYear}-`))
      .slice()
      .sort((a, b) => String(a.month || "").localeCompare(String(b.month || "")));
    if (months.length) {
      setMonthFrom(months[0].month);
      setMonthTo(months[months.length - 1].month);
    }
  };

  const changeArchiveMonthFrom = (nextMonth: string) => {
    if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
    rangeInitializedRef.current = true;
    setMonthFrom(nextMonth);
    if (nextMonth > monthTo) setMonthTo(nextMonth);
  };

  const changeArchiveMonthTo = (nextMonth: string) => {
    if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
    rangeInitializedRef.current = true;
    setMonthTo(nextMonth);
    if (nextMonth < monthFrom) setMonthFrom(nextMonth);
  };

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!confirmOpen && !summaryOpen && !pdfOpen && !settingsOpen && !decisionTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmOpen(false);
        setSummaryOpen(false);
        setPdfOpen(false);
        setSettingsOpen(false);
        if (!decisionBusy) setDecisionTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, summaryOpen, pdfOpen, settingsOpen, decisionTarget, decisionBusy]);

  const fetchVacationSettings = async () => {
    try {
      const response = await fetch(`${apiBase}/admin/vacations/settings`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      const settings: VacationSettings = body?.settings || { workingDays: [1, 2, 3, 4, 5] };
      const workingDays = Array.isArray(settings.workingDays) && settings.workingDays.length ? settings.workingDays.map(Number) : [1, 2, 3, 4, 5];
      setVacationSettings({ ...settings, workingDays });
      setSettingsDraft(workingDays);
    } catch (error: any) {
      setYearErr(String(error?.message || error || "A munkanap-beállítás nem tölthető be."));
    }
  };

  const saveVacationSettings = async () => {
    if (!settingsDraft.length) {
      setYearErr("Legalább egy munkanapot ki kell választani.");
      return;
    }
    setSettingsBusy(true);
    setYearErr("");
    try {
      const response = await fetch(`${apiBase}/admin/vacations/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ workingDays: settingsDraft }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      const settings: VacationSettings = body?.settings || { workingDays: settingsDraft };
      setVacationSettings(settings);
      setSettingsDraft(settings.workingDays || settingsDraft);
      setSettingsOpen(false);
      const removed = Number(body?.removedVacationRows || 0);
      setPageNotice(removed > 0 ? `${removed} korábbi, nem munkanapra eső szabadságsor törölve. Az összesítések frissültek.` : "Munkanap-beállítás elmentve. Az összesítések frissültek.");
      await fetchList();
      if (selected) await fetchActivityMonths(selected);
      if (summaryOpen) await fetchYearSummary(summaryYear);
    } catch (error: any) {
      setYearErr(String(error?.message || error || "A munkanap-beállítás mentése nem sikerült."));
    } finally {
      setSettingsBusy(false);
    }
  };

  const fetchActivityMonths = async (
    employeeName?: string,
    options: { resetRange?: boolean } = {}
  ) => {
    const employee = String(employeeName ?? selected).trim();
    const requestId = ++activityMonthsRequestIdRef.current;
    if (!employee) {
      setActivityMonths([]);
      return;
    }
    setActivityMonthsBusy(true);
    try {
      const response = await fetch(`${apiBase}/admin/vacations/activity-months?employee=${encodeURIComponent(employee)}`, { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      if (requestId !== activityMonthsRequestIdRef.current) return;

      const nextItems: VacationActivityMonth[] = Array.isArray(body?.items) ? body.items : [];
      const orderedItems = nextItems
        .filter((item) => /^\d{4}-\d{2}$/.test(String(item.month || "")))
        .slice()
        .sort((a, b) => String(a.month || "").localeCompare(String(b.month || "")));
      setActivityMonths(orderedItems);

      // A gyorshónapok dolgozónként változhatnak, a teljes oldal időszaka viszont közös.
      // Ez volt a csúszkáló 5 → 6 → 7 napos kijelzés fő oka.
      if (!orderedItems.length || !options.resetRange || rangeInitializedRef.current) return;

      const latestYear = Number(String(orderedItems[orderedItems.length - 1].month).slice(0, 4));
      const currentYear = Number(String(monthFrom || "").slice(0, 4));
      const currentYearItems = orderedItems.filter((item) => String(item.month || "").startsWith(`${currentYear}-`));
      const targetYearItems = options.resetRange || !currentYearItems.length
        ? orderedItems.filter((item) => String(item.month || "").startsWith(`${latestYear}-`))
        : currentYearItems;

      if (!targetYearItems.length) return;

      const validMonths = new Set(targetYearItems.map((item) => item.month));
      const nextFrom = options.resetRange || !validMonths.has(monthFrom)
        ? targetYearItems[0].month
        : monthFrom;
      const nextTo = options.resetRange || !validMonths.has(monthTo)
        ? targetYearItems[targetYearItems.length - 1].month
        : monthTo;

      if (nextFrom <= nextTo) {
        setMonthFrom(nextFrom);
        setMonthTo(nextTo);
      } else {
        setMonthFrom(targetYearItems[0].month);
        setMonthTo(targetYearItems[targetYearItems.length - 1].month);
      }
      rangeInitializedRef.current = true;
    } catch (error: any) {
      if (requestId !== activityMonthsRequestIdRef.current) return;
      setListErr(String(error?.message || error || "A szabadságos hónapok nem tölthetők be."));
      setActivityMonths([]);
    } finally {
      if (requestId === activityMonthsRequestIdRef.current) setActivityMonthsBusy(false);
    }
  };

  const openVacationRequestPdfForPeriod = (dayFrom: string, dayUntil: string, noteValue?: string | null) => {
    setSaveErr("");
    setListErr("");
    const employee = selected.trim();
    const start = String(dayFrom || "").trim();
    const end = String(dayUntil || dayFrom || "").trim();
    if (!employee) {
      setSaveErr("Válassz dolgozót a szabadságkéréshez.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
      setSaveErr("Ellenőrizd a szabadság kezdő és záró dátumát.");
      return;
    }
    const preview = countVacationPeriod(start, end, vacationSettings.workingDays);
    if (preview.workingDays <= 0) {
      setSaveErr("A kiválasztott időszakban nincs elszámolható munkanap.");
      return;
    }
    const params = new URLSearchParams({ employee, dayFrom: start, dayTo: end });
    const pdfNote = String(noteValue || "").trim();
    if (pdfNote) params.set("note", pdfNote);
    const win = window.open(`${apiBase}/admin/vacations/request.pdf?${params.toString()}`, "_blank", "noopener,noreferrer");
    if (!win) setSaveErr("A böngésző letiltotta a PDF megnyitását.");
  };

  const openVacationRequestPdf = () => {
    if (kind !== "vacation") {
      setSaveErr("Hivatalos szabadságkérés csak szabadság időszakra készül.");
      return;
    }
    openVacationRequestPdfForPeriod(day, (dayTo || day).trim(), note);
  };

  const fetchEmployees = async () => {
    setEmpErr("");
    setEmpBusy(true);
    try {
      const r = await fetch(`${apiBase}/admin/vacations/employees`, { credentials: "include" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      const list: Employee[] = Array.isArray(j?.items) ? j.items : [];
      setEmployees(list);
      if (!selected && list.length) {
        setSelected(list[0].name);
        if (isMobile) setMobilePane("details");
      }
    } catch (e: any) {
      setEmpErr(String(e?.message || e || "Hiba"));
      setEmployees([]);
    } finally {
      setEmpBusy(false);
    }
  };

  const fetchPendingRequests = async () => {
    setPendingRequestsBusy(true);
    setPendingRequestsError("");
    try {
      const response = await fetch(`${apiBase}/admin/vacations/requests?status=pending`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      setPendingRequests(Array.isArray(body?.items) ? body.items : []);
    } catch (error: any) {
      setPendingRequestsError(String(error?.message || error || "A függő szabadságkérelmek nem tölthetők be."));
      setPendingRequests([]);
    } finally {
      setPendingRequestsBusy(false);
    }
  };

  const openRequestDecision = (request: VacationRequestItem, decision: "approved" | "rejected" | "edit") => {
    setDecisionTarget(request);
    setDecisionMode(decision);
    setDecisionNote("");
    setDecisionError("");
    setRequestEditDayFrom(request.dayFrom || "");
    setRequestEditDayTo(request.dayTo || request.dayFrom || "");
    setRequestEditHoursOff(Number(request.hoursOff || 4));
    setRequestEditNote(String(request.note || ""));
    setPendingRequestsError("");
  };

  const decisionPeriodPreview = useMemo(() => {
    if (!decisionTarget || decisionTarget.kind !== "vacation") return null;
    return countVacationPeriod(
      requestEditDayFrom,
      requestEditDayTo || requestEditDayFrom,
      vacationSettings.workingDays,
    );
  }, [decisionTarget, requestEditDayFrom, requestEditDayTo, vacationSettings.workingDays]);

  const decisionRequestChanged = useMemo(() => {
    if (!decisionTarget) return false;
    return requestEditDayFrom !== String(decisionTarget.dayFrom || "")
      || requestEditDayTo !== String(decisionTarget.dayTo || decisionTarget.dayFrom || "")
      || Number(requestEditHoursOff || 0) !== Number(decisionTarget.hoursOff || (decisionTarget.kind === "short" ? 4 : 0))
      || requestEditNote.trim() !== String(decisionTarget.note || "").trim();
  }, [decisionTarget, requestEditDayFrom, requestEditDayTo, requestEditHoursOff, requestEditNote]);

  const persistPendingRequestEdits = async (target: VacationRequestItem) => {
    const start = String(requestEditDayFrom || "").trim();
    const end = String(requestEditDayTo || requestEditDayFrom || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) {
      throw new Error("Ellenőrizd a módosított kezdő és záró dátumot.");
    }
    if (target.kind === "vacation") {
      const preview = countVacationPeriod(start, end, vacationSettings.workingDays);
      if (preview.workingDays <= 0) throw new Error("A módosított időszakban nincs elszámolható munkanap.");
    } else {
      const hours = Math.trunc(Number(requestEditHoursOff || 0));
      if (!Number.isFinite(hours) || hours < 1 || hours > 12) {
        throw new Error("Az órás elkérés 1 és 12 óra között lehet.");
      }
    }

    if (!decisionRequestChanged) return target;

    const response = await fetch(`${apiBase}/admin/vacations/requests/${encodeURIComponent(target.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify({
        dayFrom: start,
        dayTo: target.kind === "short" ? start : end,
        hoursOff: target.kind === "short" ? Math.trunc(Number(requestEditHoursOff || 4)) : null,
        note: requestEditNote.trim() || null,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
    const updated = body?.item as VacationRequestItem | undefined;
    if (!updated?.id) throw new Error("A módosított szabadságkérés nem érkezett vissza a szervertől.");
    setPendingRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
    setDecisionTarget(updated);
    return updated;
  };

  const savePendingRequestEdit = async () => {
    if (!decisionTarget || decisionBusy) return;
    setDecisionBusy(true);
    setDecisionError("");
    try {
      const updated = await persistPendingRequestEdits(decisionTarget);
      const preview = updated.kind === "vacation"
        ? countVacationPeriod(updated.dayFrom, updated.dayTo || updated.dayFrom, vacationSettings.workingDays)
        : null;
      setDecisionTarget(null);
      setPageNotice(
        updated.kind === "vacation"
          ? `${updated.employeeName} kérelme módosítva: ${updated.dayFrom} – ${updated.dayTo} • ${preview?.workingDays || 0} munkanap.`
          : `${updated.employeeName} órás elkérése módosítva.`,
      );
      await fetchPendingRequests();
    } catch (error: any) {
      setDecisionError(String(error?.message || error || "A szabadságkérés módosítása nem sikerült."));
    } finally {
      setDecisionBusy(false);
    }
  };

  const submitRequestDecision = async () => {
    if (!decisionTarget) return;
    if (decisionMode === "edit") {
      await savePendingRequestEdit();
      return;
    }
    if (decisionMode === "rejected" && !decisionNote.trim()) {
      setDecisionError("Elutasításnál rövid indoklást kell írni az alkalmazottnak.");
      return;
    }
    setDecisionBusy(true);
    setDecisionError("");
    try {
      let target = decisionTarget;
      if (decisionMode === "approved" && decisionRequestChanged) {
        target = await persistPendingRequestEdits(target);
      }

      const response = await fetch(`${apiBase}/admin/vacations/requests/${encodeURIComponent(target.id)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision: decisionMode, note: decisionNote.trim() || null }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      const employeeName = target.employeeName;
      const approvedPreview = target.kind === "vacation"
        ? countVacationPeriod(target.dayFrom, target.dayTo || target.dayFrom, vacationSettings.workingDays)
        : null;
      setDecisionTarget(null);
      setDecisionNote("");
      setPageNotice(
        decisionMode === "approved"
          ? `${employeeName} szabadságkérése elfogadva${approvedPreview ? ` • ${approvedPreview.workingDays} munkanap rögzítve` : ""}.`
          : `${employeeName} szabadságkérése elutasítva. Az alkalmazott értesítést kap.`,
      );
      await fetchPendingRequests();
      if (selected && empKey(selected) === empKey(employeeName)) {
        await Promise.all([fetchList(employeeName), fetchActivityMonths(employeeName)]);
      }
      if (summaryOpen) await fetchYearSummary(summaryYear);
    } catch (error: any) {
      setDecisionError(String(error?.message || error || "A szabadságkérés elbírálása nem sikerült."));
    } finally {
      setDecisionBusy(false);
    }
  };

  const fetchYearSummary = async (year?: number) => {
    const y = Number(year ?? summaryYear);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return;
    setYearErr("");
    setYearBusy(true);
    try {
      const r = await fetch(`${apiBase}/admin/vacations/summary?year=${encodeURIComponent(String(y))}`, {
        credentials: "include",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
      setYearRows(Array.isArray(j?.items) ? j.items : []);
    } catch (e: any) {
      setYearErr(String(e?.message || e || "Hiba"));
      setYearRows([]);
    } finally {
      setYearBusy(false);
    }
  };

  const openYearSummary = async () => {
    setSummaryOpen(true);
    await fetchYearSummary(summaryYear);
  };

  const openPdf = () => {
    setYearErr("");
    setPdfYear(Number.isFinite(summaryYear) ? summaryYear : new Date().getFullYear());
    setPdfEmployee("");
    setPdfOpen(true);
  };

  const downloadPdf = async () => {
    const y = Number(pdfYear);
    if (!Number.isFinite(y)) return;
    setYearErr("");
    try {
      const params = new URLSearchParams();
      params.set("year", String(y));
      if (pdfEmployee.trim()) params.set("employee", pdfEmployee.trim());
      const url = `${apiBase}/admin/vacations/summary.pdf?${params.toString()}`;
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) setYearErr("A böngésző letiltotta az új ablakot a PDF-hez.");
    } catch (e: any) {
      setYearErr(String(e?.message || e || "Hiba PDF-nél"));
    }
  };

  const fetchList = async (employeeName?: string) => {
    const emp = (employeeName ?? selected).trim();
    const rangeMonths = monthValuesBetween(monthFrom, monthTo);
    const requestId = ++listRequestIdRef.current;
    setListErr("");
    setListBusy(true);

    try {
      if (!rangeMonths.length) throw new Error("A kiválasztott hónaptartomány hibás.");

      // Hónaponként egyetlen, közös választ kérünk le. Ebből készül egyszerre
      // az alkalmazotti lista és a kiválasztott dolgozó részlete, így a kettő
      // többé nem tud két eltérő pillanatból származó adatot mutatni.
      const monthResults = await Promise.all(
        rangeMonths.map(async (currentMonth) => {
          const response = await fetch(
            `${apiBase}/admin/vacations?month=${encodeURIComponent(currentMonth)}`,
            { credentials: "include", cache: "no-store" }
          );
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
          }
          return {
            items: Array.isArray(body?.items) ? body.items as TimeEvent[] : [],
            compItems: Array.isArray(body?.compItems) ? body.compItems as CompEvent[] : [],
            compSummary: Array.isArray(body?.compSummary) ? body.compSummary as CompSummaryRow[] : [],
          };
        })
      );

      if (requestId !== listRequestIdRef.current) return;

      const allTimeItems = normalizeTimeEvents(
        monthResults.flatMap((result) => result.items),
        vacationSettings.workingDays
      ).sort((a, b) => {
        const byDay = String(b.day || "").localeCompare(String(a.day || ""));
        return byDay || a.employeeName.localeCompare(b.employeeName, "hu", { sensitivity: "base" });
      });

      const allCompItems = monthResults
        .flatMap((result) => result.compItems)
        .filter((item, index, all) =>
          all.findIndex((candidate) => String(candidate.id) === String(item.id)) === index
        )
        .sort((a, b) => String(b.day || "").localeCompare(String(a.day || "")));

      setSummary(summarizeTimeEvents(allTimeItems, vacationSettings.workingDays));
      setCompSummary(mergeVacationCompSummaryRows(monthResults.map((result) => result.compSummary)));

      if (emp) {
        const employeeKey = empKey(emp);
        setItems(allTimeItems.filter((item) => empKey(item.employeeName) === employeeKey));
        setCompItems(allCompItems.filter((item) => empKey(item.employeeName) === employeeKey));
      } else {
        setItems([]);
        setCompItems([]);
      }
    } catch (e: any) {
      if (requestId !== listRequestIdRef.current) return;
      setListErr(String(e?.message || e || "Hiba"));
      setItems([]);
      setSummary([]);
      setCompItems([]);
      setCompSummary([]);
    } finally {
      if (requestId === listRequestIdRef.current) setListBusy(false);
    }
  };

  useEffect(() => {
    void fetchEmployees();
    void fetchVacationSettings();
    void fetchPendingRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    if (!selected) {
      setActivityMonths([]);
      return;
    }
    void fetchActivityMonths(selected, { resetRange: !rangeInitializedRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, apiBase]);

  useEffect(() => {
    if (!monthFrom || !monthTo) return;
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthFrom, monthTo, selected, apiBase, vacationSettings.workingDays.join(",")]);

  const selectedSummary = useMemo(() => {
    const s = summarizeTimeEvents(items, vacationSettings.workingDays)
      .find((row) => empKey(row.employeeName) === empKey(selected));
    return s || { employeeName: selected, vacationDays: 0, shortDays: 0, shortHours: 0 };
  }, [items, selected, vacationSettings.workingDays]);

  const selectedComp = useMemo(() => {
    const s = compSummary.find((x) => empKey(x.employeeName) === empKey(selected));
    return (
      s || {
        employeeName: selected,
        creditDays: 0,
        creditHours: 0,
        debitDays: 0,
        debitHours: 0,
        balanceDays: 0,
        balanceHours: 0,
      }
    );
  }, [compSummary, selected]);

  const monthLabel = useMemo(() => formatMonthRangeLabel(monthFrom, monthTo), [monthFrom, monthTo]);
  const vacationPreview = useMemo(
    () => countVacationPeriod(day, dayTo || day, vacationSettings.workingDays),
    [day, dayTo, vacationSettings.workingDays]
  );

  const selectedShortHours = useMemo(() => {
    const emp = selected.trim();
    if (!emp) return 0;
    let sum = 0;
    for (const it of items) {
      if (empKey(it.employeeName) != empKey(emp)) continue;
      if (it.kind !== "short") continue;
      const h = Number(it.hoursOff ?? 0);
      if (Number.isFinite(h) && h > 0) sum += h;
    }
    return sum;
  }, [items, selected]);

  const save = async () => {
    setSaveErr("");
    const emp = selected.trim();
    if (!emp) {
      setSaveErr("Válassz alkalmazottat.");
      return;
    }
    if (!/\d{4}-\d{2}-\d{2}/.test(day)) {
      setSaveErr("A dátum formátuma hibás.");
      return;
    }

    if (kind === "vacation") {
      const end = (dayTo || day).trim();
      if (!/\d{4}-\d{2}-\d{2}/.test(end)) {
        setSaveErr("A periódus vége dátum formátuma hibás.");
        return;
      }
      if (end < day) {
        setSaveErr("A periódus vége nem lehet a kezdő dátum előtt.");
        return;
      }
    }

    if (kind === "short") {
      const h = Number(shortHours);
      if (!Number.isFinite(h) || h < 1 || h > 12) {
        setSaveErr("Az elkérezés óraszáma 1 és 12 között kell legyen.");
        return;
      }
    }

    setSaveBusy(true);
    try {
      const payload: any = {
        employeeName: emp,
        kind,
        note: note.trim() ? note.trim() : null,
      };
      if (kind === "short") {
        payload.day = day;
        payload.hoursOff = Math.trunc(Number(shortHours) || 4);
      } else {
        payload.dayFrom = day;
        payload.dayTo = (dayTo || day).trim();
      }

      const r = await fetch(`${apiBase}/admin/vacations`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));

      setNote("");
      if (kind === "vacation") {
        const savedDays = Number(j?.savedDays ?? vacationPreview.workingDays);
        const skippedDays = Number(j?.skippedDays ?? vacationPreview.excludedDays);
        setPageNotice(`${savedDays} szabadságnap rögzítve${skippedDays > 0 ? `, ${skippedDays} pihenőnap kihagyva` : ""}.`);
      }
      await fetchList(emp);
      await fetchActivityMonths(emp);
    } catch (e: any) {
      setSaveErr(String(e?.message || e || "Hiba"));
    } finally {
      setSaveBusy(false);
    }
  };

  async function saveComp() {
    setCompErr("");
    const emp = selected.trim();
    if (!emp) {
      setCompErr("Válassz alkalmazottat.");
      return;
    }
    if (!/\d{4}-\d{2}-\d{2}/.test(compDay)) {
      setCompErr("A dátum formátuma hibás.");
      return;
    }
    if (!compNote.trim()) {
      setCompErr("A megjegyzés kötelező.");
      return;
    }

    const a = Math.trunc(Number(compAmount));
    if (!Number.isFinite(a) || a <= 0) {
      setCompErr("A mennyiség legyen pozitív szám.");
      return;
    }
    if (compUnit === "hour" && a > 12) {
      setCompErr("Óránál maximum 12 legyen.");
      return;
    }
    if (compUnit === "day" && a > 31) {
      setCompErr("Napnál maximum 31 legyen.");
      return;
    }

    const signed = compDir === "credit" ? a : -a;

    setCompBusy(true);
    try {
      const payload = {
        employeeName: emp,
        day: compDay,
        unit: compUnit,
        amount: signed,
        note: compNote.trim(),
      };

      const r = await fetch(`${apiBase}/admin/vacations/comp`, {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));

      setCompNote("");
      await fetchList(emp);
    } catch (e: any) {
      setCompErr(String(e?.message || e || "Hiba"));
    } finally {
      setCompBusy(false);
    }
  }

  const openDeleteTime = (id: string) => {
    setConfirmTitle("Törlés");
    setConfirmMsg("Biztos törlöd? Ez csak a bejegyzést törli, nem a dolgozót.");
    setConfirmId(id);
    setConfirmAction("deleteTime");
    setConfirmOpen(true);
  };

  const openDeleteComp = (id: string) => {
    setConfirmTitle("Törlés");
    setConfirmMsg("Biztos törlöd ezt a kompenzációs bejegyzést?");
    setConfirmId(id);
    setConfirmAction("deleteComp");
    setConfirmOpen(true);
  };

  const openSaveCompConfirm = () => {
    setConfirmTitle("Kompenzáció mentése");
    setConfirmMsg("Mentsem ezt a kompenzációs eseményt?");
    setConfirmId(null);
    setConfirmAction("saveComp");
    setConfirmOpen(true);
  };

  const runConfirm = async () => {
    const action = confirmAction;
    const id = confirmId;
    setConfirmOpen(false);
    setConfirmId(null);
    setConfirmAction(null);

    if (!action) return;

    if (action === "deleteTime") {
      if (!id) return;
      setListErr("");
      try {
        const r = await fetch(`${apiBase}/admin/vacations/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
        await fetchList();
        if (selected) await fetchActivityMonths(selected);
      } catch (e: any) {
        setListErr(String(e?.message || e || "Hiba törlésnél"));
      }
      return;
    }

    if (action === "deleteComp") {
      if (!id) return;
      setListErr("");
      try {
        const r = await fetch(`${apiBase}/admin/vacations/comp/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(String(j?.error || j?.message || `HTTP ${r.status}`));
        await fetchList();
      } catch (e: any) {
        setListErr(String(e?.message || e || "Hiba törlésnél"));
      }
      return;
    }

    if (action === "saveComp") {
      await saveComp();
    }
  };

  const grouped = useMemo(() => {
    const byDay = new Map<string, TimeEvent[]>();
    for (const it of items) {
      const k = it.day;
      const arr = byDay.get(k) || [];
      arr.push(it);
      byDay.set(k, arr);
    }
    const keys = Array.from(byDay.keys()).sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => ({ day: k, items: byDay.get(k) || [] }));
  }, [items]);

  const savedVacationPeriods = useMemo(
    () => buildSavedVacationPeriods(items, vacationSettings.workingDays),
    [items, vacationSettings.workingDays]
  );

  const scrollToSelected = () => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`button[data-emp="${CSS.escape(selected)}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    scrollToSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const EmployeesPane = (
    <section className={`${panel} border-[#7bd7d4]/22 bg-gradient-to-b from-[#496b70] via-[#455f68] to-[#3f5360]`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#7bd7d4]/18 bg-gradient-to-r from-[#2a8d8b] via-[#347f7d] to-[#426775] px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.17em] text-white/40">Dolgozói törzs</div>
          <div className="mt-1 flex items-center gap-2 text-base text-white">
            <Users2 className="h-4 w-4" />
            Alkalmazott kiválasztása
          </div>
        </div>
        <span className="rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 px-2.5 py-1 text-[11px] text-[#d7fffd]">
          {employees.length} fő
        </span>
      </div>

      <div className="border-b border-white/10 p-3">
        <div className={label}>Név szerinti keresés</div>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/36" />
          <input
            className={`${input} pl-9`}
            placeholder="Kezdj el gépelni…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {empErr ? (
          <div className="mt-3 rounded-xl border border-rose-200/25 bg-rose-500/12 px-3 py-2 text-sm text-rose-50 whitespace-pre-wrap">
            {empErr}
          </div>
        ) : null}
      </div>

      <div
        ref={listRef}
        className="max-h-[calc(100vh-300px)] min-h-[280px] overflow-y-auto p-2 sm:max-h-[720px]"
      >
        {empBusy ? (
          <div className="flex min-h-[220px] items-center justify-center text-sm text-white/48">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Dolgozók betöltése…
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center px-5 text-center">
            <Users2 className="h-8 w-8 text-white/22" />
            <div className="mt-3 text-sm text-white/55">Nincs dolgozó a listában.</div>
          </div>
        ) : (
          <div className="grid gap-2">
            {filteredEmployees.map((e) => {
              const active = empKey(e.name) === empKey(selected);
              const employeeSummary = summary.find((x) => empKey(x.employeeName) === empKey(e.name));
              const employeeComp = compSummary.find((x) => empKey(x.employeeName) === empKey(e.name));
              const vacationDays = employeeSummary?.vacationDays ?? 0;
              const shortDaysValue = employeeSummary?.shortDays ?? 0;
              const shortHoursValue = employeeSummary?.shortHours ?? 0;
              const balanceDays = employeeComp?.balanceDays ?? 0;
              const balanceHours = employeeComp?.balanceHours ?? 0;
              const pendingCount = pendingByEmployee.get(empKey(e.name)) || 0;
              const pendingRequested = pendingRequestedByEmployee.get(empKey(e.name)) || { vacationWorkingDays: 0, shortHours: 0 };

              return (
                <button
                  key={e.name}
                  data-emp={e.name}
                  type="button"
                  className={
                    "group w-full rounded-2xl border px-3 py-3 text-left transition " +
                    (pendingCount > 0
                      ? "border-rose-200/72 bg-gradient-to-br from-[#b6132b] to-[#7f1023] shadow-[0_12px_30px_rgba(190,18,60,0.30)] hover:brightness-110"
                      : active
                        ? "border-[#b7f1ed]/62 bg-[#247f7d] shadow-[0_10px_26px_rgba(21,92,91,0.24)]"
                        : "border-[#b7f1ed]/18 bg-[#55717a] hover:border-[#b7f1ed]/34 hover:bg-[#607d84]")
                  }
                  onClick={() => {
                    setSelected(e.name);
                    if (isMobile) setMobilePane("details");
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm " +
                        (pendingCount > 0
                          ? "border-rose-100/65 bg-white text-[#a31128]"
                          : active
                            ? "border-white/45 bg-white text-[#247f7d]"
                            : "border-white/25 bg-[#e7faf8] text-[#247f7d]")
                      }
                    >
                      {initials(e.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm text-white">{e.name}</div>
                          {pendingCount > 0 ? (
                            <span className="mt-1 inline-flex rounded-full border border-rose-100/45 bg-white/12 px-2 py-0.5 text-[9px] uppercase tracking-[0.08em] text-rose-50">
                              {pendingCount} elbírálatlan kérés
                            </span>
                          ) : null}
                        </div>
                        <ChevronRight
                          className={
                            "h-4 w-4 " +
                            (pendingCount > 0
                              ? "text-rose-100"
                              : active
                                ? "text-[#7bd7d4]"
                                : "text-white/28 transition group-hover:text-white/55")
                          }
                        />
                      </div>
                      <div className="mt-1 text-[10px] text-white/42">{monthLabel}</div>
                    </div>
                  </div>

                  {pendingCount > 0 ? (
                    <div className="mt-3 rounded-xl border border-rose-100/36 bg-white/[0.13] px-3 py-2.5">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-[9px] uppercase tracking-[0.14em] text-rose-50/72">Most ezt kéri</div>
                          {pendingRequested.vacationWorkingDays > 0 ? (
                            <div className="mt-0.5 flex items-baseline gap-1.5 text-white">
                              <strong className="text-2xl font-medium leading-none">{pendingRequested.vacationWorkingDays}</strong>
                              <span className="text-xs uppercase tracking-[0.08em] text-rose-50/82">munkanap szabadság</span>
                            </div>
                          ) : null}
                          {pendingRequested.shortHours > 0 ? (
                            <div className="mt-1 flex items-baseline gap-1.5 text-white">
                              <strong className="text-xl font-medium leading-none">{pendingRequested.shortHours}</strong>
                              <span className="text-xs uppercase tracking-[0.08em] text-rose-50/82">óra elkérés</span>
                            </div>
                          ) : null}
                        </div>
                        <CalendarRange className="h-6 w-6 shrink-0 text-rose-50/72" />
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                    <span className="rounded-lg border border-white/12 bg-white/[0.14] px-1.5 py-1.5 text-[10px] text-white/80">
                      <strong className="block text-xs font-normal text-white">{vacationDays}</strong>
                      rögz. szab.
                    </span>
                    <span className="rounded-lg border border-[#b7f1ed]/18 bg-[#174c55]/52 px-1.5 py-1.5 text-[10px] text-[#d7fffd]">
                      <strong className="block text-xs font-normal text-white">{shortDaysValue} / {shortHoursValue}</strong>
                      nap / óra
                    </span>
                    <span className="rounded-lg border border-white/10 bg-white/[0.09] px-1.5 py-1.5 text-[10px] text-white/78">
                      <strong className="block text-xs font-normal text-white">{balanceDays}n / {balanceHours}ó</strong>
                      egyenleg
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );

  const DetailsPane = (
    <div className="relative space-y-3 sm:space-y-4">
      <section className="overflow-hidden rounded-[22px] border border-white/14 bg-[#344154] shadow-[0_12px_28px_rgba(15,23,42,0.16)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#303b4d] px-3.5 py-3">
          <div className="min-w-0">
            <div className="text-[8px] uppercase tracking-[0.14em] text-white/38">Kiválasztott dolgozó</div>
            <div className="mt-0.5 truncate text-[17px] text-white">{selected || "-"}</div>
          </div>
          <button type="button" onClick={() => void fetchList()} disabled={listBusy} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] text-white active:scale-[0.97] disabled:opacity-45" aria-label="Frissítés">
            <RefreshCw className={`h-4 w-4 ${listBusy ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="p-3">
          <div className="grid min-w-0 grid-cols-[78px_minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <label className="grid min-w-0 gap-1 text-[8px] uppercase tracking-[0.08em] text-white/42">Év
              <AllInSelect
                value={String(archiveYear)}
                options={archiveYears.map((year) => ({ value: String(year), label: String(year) }))}
                onChange={(next) => changeArchiveYear(Number(next))}
                ariaLabel="Év"
                compact
              />
            </label>
            <label className="grid min-w-0 gap-1 text-[8px] uppercase tracking-[0.08em] text-white/42">Mettől
              <AllInSelect
                value={monthFrom}
                options={activityMonthsForYear.map((item) => ({ value: item.month, label: formatMonthLabel(item.month).replace(`${archiveYear}. `, "") }))}
                onChange={changeArchiveMonthFrom}
                placeholder="Hónap"
                ariaLabel="Kezdő hónap"
                compact
              />
            </label>
            <label className="grid min-w-0 gap-1 text-[8px] uppercase tracking-[0.08em] text-white/42">Meddig
              <AllInSelect
                value={monthTo}
                options={activityMonthsForYear.map((item) => ({ value: item.month, label: formatMonthLabel(item.month).replace(`${archiveYear}. `, "") }))}
                onChange={changeArchiveMonthTo}
                placeholder="Hónap"
                ariaLabel="Záró hónap"
                compact
              />
            </label>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[#7bd7d4]/16 bg-[#2a8d8b]/9 px-2.5 py-2">
            <span className="truncate text-[9px] text-white/48">{monthLabel}</span>
            {activityMonthsBusy ? <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-[#8ee6e2]" /> : null}
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-[#7bd7d4]/18 bg-[#315c62]/58 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[9px] uppercase tracking-[0.13em] text-[#d7fffd]/52">Hónapok</div>
          {activityMonthsBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#8ee6e2]" /> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {activityMonthsForYear.length ? activityMonthsForYear.map((item) => (
            <button
              key={item.month}
              type="button"
              className={`rounded-xl border px-2.5 py-1.5 text-left text-[10px] transition ${item.month >= monthFrom && item.month <= monthTo ? "border-[#9be9e5]/55 bg-[#2a8d8b] text-white" : "border-[#b7f1ed]/18 bg-white/[0.04] text-white/68 hover:bg-white/[0.08]"}`}
              onClick={() => {
                rangeInitializedRef.current = true;
                setMonthFrom(item.month);
                setMonthTo(item.month);
              }}
            >
              <span>{formatMonthLabel(item.month).replace(`${archiveYear}. `, "")}</span>
              <span className="ml-1.5 text-[8px] text-white/48">{item.vacationDays} nap</span>
            </button>
          )) : !activityMonthsBusy ? <span className="text-[10px] text-white/38">Nincs adat ebben az évben.</span> : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-sky-200/20 bg-sky-500/9 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-sky-100/60"><CalendarRange className="h-4 w-4" /> Szabadság</div>
          <div className="mt-2 text-xl text-white">{selectedSummary.vacationDays} nap</div>
        </div>
        <div className="rounded-2xl border border-amber-200/20 bg-amber-500/9 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-amber-100/60"><Clock3 className="h-4 w-4" /> Elkérezés</div>
          <div className="mt-2 text-xl text-white">{selectedShortHours} óra</div>
        </div>
        <div className="rounded-2xl border border-white/12 bg-white/[0.055] p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-white/42"><ClipboardList className="h-4 w-4" /> Elkérezési nap</div>
          <div className="mt-2 text-xl text-white">{selectedSummary.shortDays} nap</div>
        </div>
        <div className="rounded-2xl border border-[#7bd7d4]/26 bg-[#2a8d8b]/13 p-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-[#d7fffd]/60"><Scale className="h-4 w-4" /> Kompenzáció</div>
          <div className="mt-2 text-xl text-white">{selectedComp.balanceDays}n / {selectedComp.balanceHours}ó</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 rounded-[20px] border border-white/12 bg-[#303a4c] p-1.5">
        <button type="button" disabled={!selected} onClick={() => document.getElementById("vacation-new-entry")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-[10px] text-white/72 transition active:scale-[0.98] disabled:opacity-35"><CalendarPlus className="h-3.5 w-3.5" /> Új</button>
        <button type="button" disabled={!selected} onClick={() => document.getElementById("vacation-compensation")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-[10px] text-white/72 transition active:scale-[0.98] disabled:opacity-35"><Scale className="h-3.5 w-3.5" /> Kompenzáció</button>
        <button type="button" disabled={!selected} onClick={() => document.getElementById("vacation-history")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-[10px] text-white/72 transition active:scale-[0.98] disabled:opacity-35"><History className="h-3.5 w-3.5" /> Előzmények</button>
      </div>

      {selectedPendingRequests.length ? (
        <section className="overflow-hidden rounded-2xl border border-rose-200/34 bg-gradient-to-r from-[#6f1729] via-[#5b2431] to-[#3d3744] shadow-[0_12px_28px_rgba(127,16,35,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100/12 px-4 py-3">
            <div>
              <div className="text-[9px] uppercase tracking-[0.14em] text-rose-100/58">Függő szabadságkérés</div>
              <div className="mt-1 text-sm text-white">A kért teljes időszak, nem csak a kiválasztott hónap</div>
            </div>
            <span className="rounded-full border border-rose-100/28 bg-white/10 px-2.5 py-1 text-[10px] text-rose-50">{selectedPendingRequests.length} kérelem</span>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {selectedPendingRequests.map((request) => {
              const preview = request.kind === "vacation"
                ? countVacationPeriod(request.dayFrom, request.dayTo || request.dayFrom, vacationSettings.workingDays)
                : null;
              return (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => openRequestDecision(request, "edit")}
                  className="rounded-2xl border border-white/12 bg-black/12 p-3 text-left transition hover:border-rose-100/32 hover:bg-black/18"
                >
                  <div className="grid gap-3 sm:grid-cols-[145px_minmax(0,1fr)] sm:items-center">
                    <div className="rounded-xl border border-rose-100/28 bg-gradient-to-br from-[#a90f2b] to-[#741326] px-3 py-3 text-center">
                      <div className="text-[8px] uppercase tracking-[0.15em] text-rose-50/70">{request.kind === "vacation" ? "Kért szabadság" : "Kért elkérés"}</div>
                      <div className="mt-1 flex items-baseline justify-center gap-1.5 text-white">
                        <strong className="text-3xl font-medium leading-none">{request.kind === "vacation" ? (preview?.workingDays || 0) : (request.hoursOff || 0)}</strong>
                        <span className="text-[11px] uppercase tracking-[0.08em] text-rose-50/86">{request.kind === "vacation" ? "munkanap" : "óra"}</span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-medium text-white">{requestPeriodLabel(request)}</div>
                      <div className="mt-1 text-[10px] text-white/48">{request.kind === "vacation" ? `${preview?.calendarDays || 0} naptári nap • ${preview?.excludedDays || 0} pihenőnap kihagyva` : `${request.hoursOff || 0} óra`}</div>
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-rose-100/70"><Pencil className="h-3.5 w-3.5" /> Kattints a dátum javításához</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section id="vacation-new-entry" className={panel}>
        <div className={panelHead}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.17em] text-white/40">Új távollét</div>
            <div className="mt-1 flex items-center gap-2 text-base"><CalendarPlus className="h-4 w-4" /> Szabadság vagy elkérezés rögzítése</div>
          </div>
          <span className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/55">{selected || "Nincs kiválasztva"}</span>
        </div>
        <div className="p-4">

        <div className="grid gap-2.5 sm:grid-cols-3">
          <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46 sm:col-span-1">Típus
            <AllInSelect
              value={kind}
              options={[{ value: "vacation", label: "Szabadság" }, { value: "short", label: "Elkérezés" }]}
              onChange={(next) => setKind(next as TimeEvent["kind"])}
              ariaLabel="Távollét típusa"
            />
          </label>

          {kind === "vacation" ? (
            <>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46">Kezdő nap
                <VacationDatePicker
                  value={day}
                  ariaLabel="Kezdő nap"
                  onChange={(value) => {
                    setDay(value);
                    if (!dayTo || dayTo < value) setDayTo(value);
                  }}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46">Vége
                <VacationDatePicker value={dayTo} ariaLabel="Szabadság vége" onChange={setDayTo} />
              </label>
            </>
          ) : (
            <>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46">Dátum
                <VacationDatePicker value={day} ariaLabel="Elkérezés dátuma" onChange={setDay} />
              </label>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46">Óra
                <input type="number" min={1} max={12} step={1} className={input} value={shortHours} onChange={(event) => setShortHours(Number(event.target.value))} />
              </label>
            </>
          )}

          <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46 sm:col-span-3">Megjegyzés
            <input className={input} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcionális" />
          </label>
        </div>

        {kind === "vacation" ? (
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 rounded-2xl border border-[#7bd7d4]/18 bg-[#174c55]/42 p-2.5 text-center">
            <div className="rounded-xl bg-black/10 px-2 py-2"><div className="text-[7px] uppercase tracking-[0.08em] text-white/38">Naptári</div><div className="mt-1 text-[15px] text-white">{vacationPreview.calendarDays}</div></div>
            <div className="rounded-xl border border-[#7bd7d4]/18 bg-[#2a8d8b]/12 px-2 py-2"><div className="text-[7px] uppercase tracking-[0.08em] text-[#d7fffd]/52">Szabadság</div><div className="mt-1 text-[15px] text-[#d7fffd]">{vacationPreview.workingDays}</div></div>
            <div className="rounded-xl bg-black/10 px-2 py-2"><div className="text-[7px] uppercase tracking-[0.08em] text-white/38">Pihenőnap</div><div className="mt-1 text-[15px] text-white">{vacationPreview.excludedDays}</div></div>
          </div>
        ) : null}

        {saveErr ? <div className="mt-3 rounded-xl border border-rose-200/25 bg-rose-500/12 px-3 py-2 text-sm text-rose-50 whitespace-pre-wrap">{saveErr}</div> : null}

        <div className="mt-4 flex flex-col-reverse items-stretch justify-end gap-2 sm:flex-row sm:items-center">
          {kind === "vacation" ? (
            <Button type="button" className={`${btnSoft} w-full sm:w-auto`} disabled={!selected || vacationPreview.workingDays <= 0} onClick={openVacationRequestPdf}>
              <PdfIcon className="h-5 w-5" />
              Szabadságkérés PDF
            </Button>
          ) : null}
          <Button type="button" className={`${btnPrimary} w-full sm:w-auto`} disabled={saveBusy || !selected || (kind === "vacation" && vacationPreview.workingDays <= 0)} onClick={save}>
            <Save className="h-4 w-4" />
            {saveBusy ? "Mentés…" : "Bejegyzés mentése"}
          </Button>
        </div>
        </div>
      </section>

      <section id="vacation-compensation" className={panel}>
        <div className={panelHead}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.17em] text-white/40">Kompenzáció</div>
            <div className="mt-1 flex items-center gap-2 text-base"><Scale className="h-4 w-4" /> Tartozás / kiegyenlítés</div>
          </div>
          <span className="rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 px-2.5 py-1 text-[10px] text-[#d7fffd]">{selectedComp.balanceDays}n / {selectedComp.balanceHours}ó</span>
        </div>
        <div className="p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <label className="col-span-2 grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46 sm:col-span-1">Dátum
              <VacationDatePicker value={compDay} ariaLabel="Kompenzáció dátuma" onChange={setCompDay} />
            </label>
            <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46">Típus
              <AllInSelect
                value={compDir}
                options={[{ value: "credit", label: "Tartozunk (+)" }, { value: "debit", label: "Kiegyenlítés (-)" }]}
                onChange={(next) => setCompDir(next as "credit" | "debit")}
                ariaLabel="Kompenzáció típusa"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46">Mérték
              <AllInSelect
                value={compUnit}
                options={[{ value: "hour", label: "Óra" }, { value: "day", label: "Nap" }]}
                onChange={(next) => {
                  const unit = next as "hour" | "day";
                  setCompUnit(unit);
                  if (unit === "hour" && compAmount > 12) setCompAmount(2);
                  if (unit === "day" && compAmount > 31) setCompAmount(1);
                }}
                ariaLabel="Kompenzáció mértéke"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46">Mennyiség
              <input type="number" min={1} max={compUnit === "hour" ? 12 : 31} step={1} className={input} value={compAmount} onChange={(event) => setCompAmount(Number(event.target.value))} />
            </label>
            <label className="col-span-2 grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46 sm:col-span-4">Megjegyzés
              <input className={input} value={compNote} onChange={(event) => setCompNote(event.target.value)} placeholder="Kötelező rövid indok" />
            </label>
            <div className="col-span-2 sm:col-span-4">
              <Button type="button" className={`${btnPrimary} w-full sm:w-auto`} disabled={compBusy || !selected} onClick={() => { setCompErr(""); openSaveCompConfirm(); }}>
                <Save className="h-4 w-4" /> {compBusy ? "Mentés…" : "Kompenzáció mentése"}
              </Button>
            </div>
          </div>

        {compErr ? <div className="mt-3 rounded-xl border border-rose-200/25 bg-rose-500/12 px-3 py-2 text-sm text-rose-50 whitespace-pre-wrap">{compErr}</div> : null}

        <div className="mt-4 overflow-hidden rounded-2xl border border-white/12 bg-white/[0.035]">
          {isMobile ? (
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
              <div className="col-span-4">Dátum</div>
              <div className="col-span-7">Típus</div>
              <div className="col-span-1 text-right"> </div>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
              <div className="col-span-3">Dátum</div>
              <div className="col-span-3">Típus</div>
              <div className="col-span-2 text-right">Nap</div>
              <div className="col-span-2 text-right">Óra</div>
              <div className="col-span-1">Megjegyzés</div>
              <div className="col-span-1 text-right"> </div>
            </div>
          )}

          {compItems.length === 0 ? (
            <div className="px-3 py-6 text-white/60 text-sm">Nincs kompenzáció ebben a hónapban.</div>
          ) : (
            compItems.map((it) => {
              const isDay = it.unit === "day";
              const isCredit = Number(it.amount) > 0;
              const labelType = isCredit ? "Tartozás (+)" : "Kiegyenlítés (-)";
              const dayVal = isDay ? Math.abs(Number(it.amount) || 0) : 0;
              const hourVal = !isDay ? Math.abs(Number(it.amount) || 0) : 0;
              return isMobile ? (
                <div key={it.id} className="border-t border-white/10 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-white text-sm">{formatRequestDate(it.day)}</div>
                    <button
                      type="button"
                      aria-label="Törlés"
                      title="Törlés"
                      className={dangerIconBtn}
                      onClick={() => openDeleteComp(it.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-1 text-white/80 text-sm">
                    {labelType} · {isDay ? `${dayVal} nap` : `${hourVal} óra`}
                  </div>

                  {it.note ? (
                    <div className="mt-2 text-white/60 text-xs whitespace-normal break-words">{it.note}</div>
                  ) : null}
                </div>
              ) : (
                <div key={it.id} className="border-t border-white/10 px-3 py-3">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3 text-white text-sm">{formatRequestDate(it.day)}</div>
                    <div className="col-span-3 text-white/80 text-sm">{labelType}</div>
                    <div className="col-span-2 text-right text-white/80 text-sm">{dayVal || "-"}</div>
                    <div className="col-span-2 text-right text-white/80 text-sm">{hourVal || "-"}</div>
                    <div className="col-span-2 text-right">
                      <button
                        type="button"
                        aria-label="Törlés"
                        title="Törlés"
                        className={dangerIconBtn}
                        onClick={() => openDeleteComp(it.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {it.note && (
                    <div className="mt-2 text-white/70 text-sm whitespace-normal break-words">
                      {it.note}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      </section>

      <section id="vacation-history" className={panel}>
        <div className={panelHead}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.17em] text-white/40">Időszaki előzmények</div>
            <div className="mt-1 flex items-center gap-2 text-base"><History className="h-4 w-4" /> Bejegyzések ({monthLabel})</div>
          </div>
          <span className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/55">{items.length + compItems.length} esemény</span>
        </div>
        <div className="p-4">
        {listErr ? <div className="mt-2 rounded-xl border border-rose-200/25 bg-rose-500/12 px-3 py-2 text-sm text-rose-50 whitespace-pre-wrap">{listErr}</div> : null}

        {savedVacationPeriods.length ? (
          <div className="mt-3 overflow-hidden rounded-2xl border border-[#7bd7d4]/22 bg-[#174c55]/38">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#7bd7d4]/16 bg-[#315c62]/72 px-3 py-2.5">
              <div>
                <div className="text-[9px] uppercase tracking-[0.13em] text-[#d7fffd]/52">Utólagos nyomtatás</div>
                <div className="mt-0.5 text-sm text-white">Mentett szabadságkérelmek</div>
              </div>
              <span className="rounded-full border border-[#7bd7d4]/22 bg-[#2a8d8b]/22 px-2 py-0.5 text-[10px] text-[#e5fffd]">{savedVacationPeriods.length} időszak</span>
            </div>
            <div className="grid gap-2 p-2 sm:grid-cols-2">
              {savedVacationPeriods.map((period) => (
                <div key={period.key} className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.07] px-3 py-2.5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/22 text-[#d7fffd]">
                    <CalendarRange className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white">{period.dayFrom === period.dayTo ? period.dayFrom : `${period.dayFrom} – ${period.dayTo}`}</div>
                    <div className="mt-0.5 truncate text-[10px] text-white/48">{period.workingDays} szabadságnap{period.calendarDays > period.workingDays ? ` • ${period.calendarDays - period.workingDays} pihenőnap kihagyva` : ""}{period.note ? ` • ${period.note}` : ""}</div>
                  </div>
                  <button
                    type="button"
                    className={btnSoft}
                    onClick={() => openVacationRequestPdfForPeriod(period.dayFrom, period.dayTo, period.note)}
                    title="Szabadságkérés PDF újranyomtatása"
                  >
                    <PdfIcon className="h-5 w-5" />
                    PDF
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-3 rounded-xl border border-white/30 overflow-hidden">
          {isMobile ? (
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
              <div className="col-span-4">Dátum</div>
              <div className="col-span-7">Típus</div>
              <div className="col-span-1 text-right"> </div>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
              <div className="col-span-4">Dátum</div>
              <div className="col-span-4">Típus</div>
              <div className="col-span-3">Megjegyzés</div>
              <div className="col-span-1 text-right"> </div>
            </div>
          )}

          {grouped.length === 0 ? (
            <div className="px-3 py-6 text-white/60 text-sm">Nincs bejegyzés ebben a hónapban.</div>
          ) : (
            grouped.map((g) => (
              <div key={g.day} className="border-t border-white/10">
                {g.items.map((it) => (
                  isMobile ? (
                    <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-3 items-start">
                      <div className="col-span-4 text-white text-sm">{formatRequestDate(it.day)}</div>
                      <div className="col-span-7 text-white/80 text-sm">
                        <div>
                          {fmtKind(it.kind)}
                          {it.kind === "short" ? (
                            <span className="text-white/50"> ({it.hoursOff ?? 4} óra)</span>
                          ) : null}
                        </div>
                        {it.note ? (
                          <div className="text-white/60 text-xs mt-1 break-words">{it.note}</div>
                        ) : null}
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          aria-label="Törlés"
                          title="Törlés"
                          className={dangerIconBtn}
                          onClick={() => openDeleteTime(it.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-3 items-start">
                      <div className="col-span-4 text-white text-sm">{formatRequestDate(it.day)}</div>
                      <div className="col-span-4 text-white/80 text-sm">
                        {fmtKind(it.kind)}
                        {it.kind === "short" ? <span className="text-white/50"> ({it.hoursOff ?? 4} óra)</span> : null}
                      </div>
                      <div className="col-span-3 text-white/70 text-sm break-words">{it.note || "-"}</div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          aria-label="Törlés"
                          title="Törlés"
                          className={dangerIconBtn}
                          onClick={() => openDeleteTime(it.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            ))
          )}
        </div>

        <div className="hidden" aria-hidden="true">
          API base: <span>{apiBase}</span>
        </div>
        </div>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#5a6575] via-[#505b6b] to-[#454f5e] px-3 pb-6 pt-0 text-white font-normal sm:px-4 sm:py-5">
      <div className="mx-auto max-w-[1500px] space-y-3 sm:space-y-4">
        <header className="sticky top-0 z-40 -mx-3 border-b border-white/12 bg-[#2d394b]/96 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-[0_14px_34px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:top-2 sm:mx-0 sm:rounded-2xl sm:border sm:border-white/20 sm:px-4 sm:py-3">
          <div className="sm:hidden">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#8ce7e2]/34 bg-[#2a8d8b]/22 text-[#d7fffd]">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] uppercase tracking-[0.16em] text-[#bff8f5]/58">AllInFashion • személyzet</div>
                <h1 className="mt-0.5 truncate text-lg leading-tight text-white">Szabadságok</h1>
                <div className="mt-0.5 truncate text-[10px] text-white/44">{pendingRequests.length ? `${pendingRequests.length} függő kérelem` : "Távollét és kompenzáció"}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { void fetchEmployees(); void fetchList(); void fetchPendingRequests(); }}
                  disabled={empBusy || listBusy}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-white/[0.055] text-white active:scale-[0.97] disabled:opacity-45"
                  aria-label="Frissítés"
                >
                  <RefreshCw className={`h-4 w-4 ${empBusy || listBusy ? "animate-spin" : ""}`} />
                </button>
                <button type="button" onClick={() => (window.location.hash = "#allin")} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-white/[0.055] text-white active:scale-[0.97]" aria-label="Kezdőlap">
                  <Home className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-[#263246]/72 p-1">
              <button type="button" onClick={openYearSummary} disabled={yearBusy} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-transparent bg-transparent px-2 text-[10px] text-white/72 transition active:scale-[0.98] disabled:opacity-45"><BarChart3 className="h-3.5 w-3.5" /> Összesítés</button>
              <button type="button" onClick={() => { setSettingsDraft(vacationSettings.workingDays); setSettingsOpen(true); }} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-transparent bg-transparent px-2 text-[10px] text-white/72 transition active:scale-[0.98]"><Settings2 className="h-3.5 w-3.5" /> Munkanapok</button>
            </div>
          </div>

          <div className="hidden flex-wrap items-center gap-3 sm:flex">
            <div className="flex min-w-[240px] items-center gap-3 border-l-4 border-[#7bd7d4]/70 pl-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]"><CalendarDays className="h-5 w-5" /></span>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">AllInFashion</div>
                <h1 className="mt-0.5 text-xl leading-tight">Szabadságok</h1>
                <div className="mt-0.5 text-[11px] text-white/48">Távollét, elkérezés és kompenzáció kezelése</div>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              <Button className={btnSoft} type="button" onClick={openYearSummary} disabled={yearBusy}><BarChart3 className="h-4 w-4" /> Éves összesítés</Button>
              <Button className={btnSoft} type="button" onClick={openPdf} disabled={yearBusy}><PdfIcon className="h-5 w-5" /> PDF</Button>
              <Button className={btnSoft} type="button" onClick={() => { setSettingsDraft(vacationSettings.workingDays); setSettingsOpen(true); }}><Settings2 className="h-4 w-4" /> Munkanapok</Button>
              <Button className={btnSoft} type="button" onClick={() => { void fetchEmployees(); void fetchList(); void fetchPendingRequests(); }} disabled={empBusy || listBusy}><RefreshCw className={`h-4 w-4 ${empBusy || listBusy ? "animate-spin" : ""}`} /> Frissítés</Button>
              <Button className={btn} onClick={() => (window.location.hash = "#allin")} type="button"><Home className="h-4 w-4" /> Kezdőlap</Button>
            </div>
          </div>
        </header>

        {pageNotice ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#7bd7d4]/28 bg-[#174c55]/72 px-4 py-3 text-sm text-[#e5fffd]">
            <span><CheckCircle2 className="mr-2 inline h-4 w-4" />{pageNotice}</span>
            <button type="button" className="text-white/55 hover:text-white" onClick={() => setPageNotice("")}><X className="h-4 w-4" /></button>
          </div>
        ) : null}

        {yearErr ? (
          <div className="rounded-2xl border border-rose-200/25 bg-rose-500/12 px-4 py-3 text-sm text-rose-50 whitespace-pre-wrap">
            {yearErr}
          </div>
        ) : null}

        {pendingRequestsError ? (
          <div className="rounded-2xl border border-rose-200/30 bg-rose-500/14 px-4 py-3 text-sm text-rose-50 whitespace-pre-wrap">
            {pendingRequestsError}
          </div>
        ) : null}

        {pendingRequests.length > 0 || pendingRequestsBusy ? (
          <section className="overflow-hidden rounded-[20px] border border-rose-200/42 bg-[#3b2c37] shadow-[0_14px_34px_rgba(95,15,38,0.22)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100/14 bg-gradient-to-r from-[#7c1025] via-[#681125] to-[#4c1b28] px-3 py-2.5 sm:px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-100/30 bg-white/10 text-rose-50">
                  <BellRing className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-[0.16em] text-rose-100/56">Vezetői döntésre vár</div>
                  <div className="truncate text-sm text-white sm:text-base">Függő kérelmek</div>
                </div>
              </div>
              <span className="rounded-full border border-rose-100/28 bg-white/10 px-2.5 py-1 text-[10px] text-rose-50">
                {pendingRequests.length} új
              </span>
            </div>

            <div className="grid gap-2 p-2.5 xl:grid-cols-2">
              {pendingRequestsBusy ? (
                <div className="col-span-full flex min-h-[76px] items-center justify-center gap-2 rounded-xl border border-rose-100/14 bg-black/10 text-sm text-rose-50/72">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Kérelmek betöltése…
                </div>
              ) : pendingRequests.map((request) => {
                const requestPreview = request.kind === "vacation"
                  ? countVacationPeriod(request.dayFrom, request.dayTo || request.dayFrom, vacationSettings.workingDays)
                  : null;
                return (
                <article
                  key={request.id}
                  className="grid gap-2 rounded-2xl border border-rose-100/18 bg-[#303746] px-3 py-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.14)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-200/36 bg-rose-50 text-xs text-[#9f1730] transition hover:bg-white"
                        onClick={() => {
                          setSelected(request.employeeName);
                          if (isMobile) setMobilePane("details");
                        }}
                        title={`${request.employeeName} adatlapjának megnyitása`}
                      >
                        {initials(request.employeeName)}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <button
                            type="button"
                            className="truncate text-left text-sm text-white transition hover:text-[#bdf8f5]"
                            onClick={() => {
                              setSelected(request.employeeName);
                              if (isMobile) setMobilePane("details");
                            }}
                          >
                            {request.employeeName}
                          </button>
                          <span className="rounded-full border border-amber-200/25 bg-amber-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.08em] text-amber-50">
                            Elbírálás alatt
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-white/40">
                          {formatRequestDateTime(request.requestedAt)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
                      <div className="rounded-xl border border-rose-100/34 bg-gradient-to-br from-[#a90f2b] to-[#741326] px-3 py-2.5 text-center shadow-[0_8px_20px_rgba(150,15,43,0.20)]">
                        <div className="text-[8px] uppercase tracking-[0.16em] text-rose-50/72">{request.kind === "vacation" ? "Kért szabadság" : "Kért elkérés"}</div>
                        <div className="mt-1 flex items-baseline justify-center gap-1.5 text-white">
                          <strong className="text-3xl font-medium leading-none">{request.kind === "vacation" ? (requestPreview?.workingDays || 0) : (request.hoursOff || 0)}</strong>
                          <span className="text-[11px] uppercase tracking-[0.08em] text-rose-50/86">{request.kind === "vacation" ? "munkanap" : "óra"}</span>
                        </div>
                      </div>

                      <div className="min-w-0 rounded-xl border border-white/8 bg-black/10 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-rose-200/20 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-50">
                            {request.kind === "vacation" ? "Szabadság" : "Órás elkérés"}
                          </span>
                          <span className="text-base font-medium text-white">{requestPeriodLabel(request)}</span>
                        </div>
                        {request.kind === "vacation" ? (
                          <div className="mt-1.5 text-[10px] text-white/48">
                            {requestPreview?.calendarDays || 0} naptári nap • {requestPreview?.excludedDays || 0} pihenőnap kihagyva
                          </div>
                        ) : null}
                        {request.note ? (
                          <div className="mt-1.5 truncate text-[11px] text-white/48" title={request.note}>
                            <MessageSquareText className="mr-1 inline h-3.5 w-3.5" />{request.note}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:w-[326px]">
                    <button
                      type="button"
                      onClick={() => openRequestDecision(request, "edit")}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-amber-200/28 bg-amber-400/10 px-3 text-[11px] text-amber-50 transition hover:bg-amber-400/18 active:scale-[0.98]"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Szerkesztés
                    </button>
                    <button
                      type="button"
                      onClick={() => openRequestDecision(request, "rejected")}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-200/22 bg-rose-950/26 px-3 text-[11px] text-rose-50 transition hover:bg-rose-950/42 active:scale-[0.98]"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" /> Elutasítás
                    </button>
                    <button
                      type="button"
                      onClick={() => openRequestDecision(request, "approved")}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#9be9e5]/45 bg-[#208d8b] px-3 text-[11px] text-white shadow-[0_6px_16px_rgba(32,141,139,0.24)] transition hover:bg-[#267f7d] active:scale-[0.98]"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" /> Elfogadás
                    </button>
                  </div>
                </article>
                );
              })}            </div>
          </section>
        ) : null}

        <div className="grid gap-2 rounded-2xl border border-white/12 bg-[#303a4c] p-1.5 sm:hidden">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={
                "inline-flex h-10 items-center justify-center gap-2 rounded-xl text-xs transition " +
                (mobilePane === "employees" ? "bg-[#2a8d8b] text-white" : "text-white/55")
              }
              onClick={() => setMobilePane("employees")}
            >
              <Users2 className="h-4 w-4" />
              Dolgozók
            </button>
            <button
              type="button"
              className={
                "inline-flex h-10 items-center justify-center gap-2 rounded-xl text-xs transition disabled:opacity-35 " +
                (mobilePane === "details" ? "bg-[#2a8d8b] text-white" : "text-white/55")
              }
              onClick={() => setMobilePane("details")}
              disabled={!selected}
            >
              <ClipboardList className="h-4 w-4" />
              Munkalap
            </button>
          </div>
        </div>

        <main className="grid items-start gap-4 sm:grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className={`${mobilePane === "employees" ? "block" : "hidden"} sm:block`}>
            {EmployeesPane}
          </div>
          <div className={`${mobilePane === "details" ? "block" : "hidden"} sm:block`}>
            {isMobile && selected ? (
              <button type="button" className={`${btnSoft} mb-3`} onClick={() => setMobilePane("employees")}>
                <ArrowLeft className="h-4 w-4" />
                Dolgozóváltás
              </button>
            ) : null}
            {selected ? (
              DetailsPane
            ) : (
              <section className={`${panel} flex min-h-[430px] items-center justify-center p-6 text-center`}>
                <div className="max-w-md">
                  <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-3xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#d7fffd]">
                    <UserRound className="h-8 w-8" />
                  </span>
                  <div className="mt-4 text-xl text-white">Válassz egy dolgozót</div>
                  <div className="mt-2 text-sm leading-6 text-white/48">A listából válaszd ki, kinek szeretnél szabadságot, elkérezést vagy kompenzációt rögzíteni.</div>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      {decisionTarget && (
        <div className="fixed inset-0 z-[136] grid place-items-center bg-slate-950/80 px-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !decisionBusy) setDecisionTarget(null); }}>
          <section className={`w-full max-w-[680px] overflow-hidden rounded-[26px] border text-white shadow-[0_34px_110px_rgba(0,0,0,0.58)] ${decisionMode === "approved" ? "border-[#7bd7d4]/38 bg-[#344452]" : decisionMode === "edit" ? "border-amber-200/34 bg-[#443f3a]" : "border-rose-200/38 bg-[#4b3039]"}`}>
            <header className={`flex items-start justify-between gap-3 border-b border-white/12 px-5 py-4 ${decisionMode === "approved" ? "bg-gradient-to-r from-[#1f6d62] to-[#2a8d8b]" : decisionMode === "edit" ? "bg-gradient-to-r from-[#705925] to-[#4f4737]" : "bg-gradient-to-r from-[#8f1730] to-[#5c2230]"}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/28 bg-white/12">
                  {decisionMode === "approved" ? <ThumbsUp className="h-5 w-5" /> : decisionMode === "edit" ? <Pencil className="h-5 w-5" /> : <ThumbsDown className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-white/60">Szabadságkérés kezelése</div>
                  <div className="mt-1 truncate text-xl">{decisionMode === "approved" ? "Kérés ellenőrzése és elfogadása" : decisionMode === "edit" ? "Kérés szerkesztése" : "Kérés elutasítása"}</div>
                </div>
              </div>
              <button type="button" disabled={decisionBusy} className={iconBtn} onClick={() => setDecisionTarget(null)}><X className="h-4 w-4" /></button>
            </header>

            <div className="max-h-[72vh] space-y-4 overflow-y-auto p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/12 bg-black/10 p-3">
                  <div className="text-[9px] uppercase tracking-[0.11em] text-white/42">Alkalmazott</div>
                  <div className="mt-2 text-lg text-white">{decisionTarget.employeeName}</div>
                </div>
                <div className="rounded-2xl border border-white/12 bg-black/10 p-3">
                  <div className="text-[9px] uppercase tracking-[0.11em] text-white/42">Eredetileg kért időszak</div>
                  <div className="mt-2 text-lg text-white">{requestPeriodLabel(decisionTarget)}</div>
                </div>
              </div>

              {decisionMode !== "rejected" ? (
                <div className="rounded-2xl border border-[#7bd7d4]/20 bg-[#263745] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.12em] text-white/42">Adminisztrátori korrekció</div>
                      <div className="mt-1 text-sm text-white">Elfogadás előtt javíthatod a téves dátumot.</div>
                    </div>
                    {decisionRequestChanged ? <span className="rounded-full border border-amber-200/28 bg-amber-400/10 px-2.5 py-1 text-[10px] text-amber-50">Módosítva</span> : null}
                  </div>

                  {decisionTarget.kind === "vacation" ? (
                    <>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                          Kezdő nap
                          <VacationDatePicker value={requestEditDayFrom} ariaLabel="Kezdő nap" onChange={(value) => { setRequestEditDayFrom(value); if (!requestEditDayTo || requestEditDayTo < value) setRequestEditDayTo(value); }} />
                        </label>
                        <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                          Utolsó szabadságnap
                          <VacationDatePicker value={requestEditDayTo} ariaLabel="Utolsó szabadságnap" onChange={setRequestEditDayTo} />
                        </label>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl border border-[#7bd7d4]/22 bg-[#174c55]/52 p-3 text-center">
                        <div><div className="text-[8px] uppercase tracking-[0.09em] text-white/42">Naptári nap</div><div className="mt-1 text-lg text-white">{decisionPeriodPreview?.calendarDays || 0}</div></div>
                        <div><div className="text-[8px] uppercase tracking-[0.09em] text-[#d7fffd]/55">Munkanap</div><div className="mt-1 text-lg text-[#d7fffd]">{decisionPeriodPreview?.workingDays || 0}</div></div>
                        <div><div className="text-[8px] uppercase tracking-[0.09em] text-white/42">Pihenőnap</div><div className="mt-1 text-lg text-white">{decisionPeriodPreview?.excludedDays || 0}</div></div>
                      </div>
                      <div className="mt-2 text-[10px] text-white/48">Munkanapok: {WEEK_DAYS.filter((item) => vacationSettings.workingDays.includes(item.id)).map((item) => item.label).join(", ")}.</div>
                    </>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                        Dátum
                        <VacationDatePicker value={requestEditDayFrom} ariaLabel="Elkérezés dátuma" onChange={(value) => { setRequestEditDayFrom(value); setRequestEditDayTo(value); }} />
                      </label>
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                        Óra
                        <input type="number" min={1} max={12} value={requestEditHoursOff} onChange={(event) => setRequestEditHoursOff(Number(event.target.value))} className={input} />
                      </label>
                    </div>
                  )}

                  <label className="mt-3 grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                    Kérelem megjegyzése
                    <input value={requestEditNote} onChange={(event) => setRequestEditNote(event.target.value)} placeholder="Opcionális" className={input} />
                  </label>
                </div>
              ) : decisionTarget.note ? (
                <div className="rounded-2xl border border-white/12 bg-black/10 px-4 py-3 text-sm leading-relaxed text-white/70">
                  <MessageSquareText className="mr-2 inline h-4 w-4" />{decisionTarget.note}
                </div>
              ) : null}

              {decisionMode !== "edit" ? (
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.11em] text-white/50">
                  {decisionMode === "approved" ? "Vezetői megjegyzés az alkalmazottnak" : "Elutasítás indoka *"}
                  <textarea
                    autoFocus={decisionMode === "rejected"}
                    rows={3}
                    value={decisionNote}
                    onChange={(event) => setDecisionNote(event.target.value)}
                    placeholder={decisionMode === "approved" ? "Opcionális, pl. jó pihenést…" : "Írd le röviden, miért nem elfogadható az időpont…"}
                    className="resize-none rounded-xl border border-white/16 bg-[#273243] px-3 py-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/34 focus:border-[#72d8d4]"
                  />
                </label>
              ) : null}

              {decisionError ? <div className="rounded-2xl border border-rose-200/30 bg-rose-500/14 px-4 py-3 text-sm text-rose-50">{decisionError}</div> : null}

              <div className={`rounded-2xl border px-4 py-3 text-xs leading-relaxed ${decisionMode === "approved" ? "border-[#7bd7d4]/24 bg-[#2a8d8b]/10 text-[#e5fffd]" : decisionMode === "edit" ? "border-amber-200/24 bg-amber-400/10 text-amber-50" : "border-rose-200/24 bg-rose-500/10 text-rose-50"}`}>
                {decisionMode === "approved"
                  ? `Elfogadáskor a kijavított időszak kerül a nyilvántartásba. Jelenleg ${decisionTarget.kind === "vacation" ? `${decisionPeriodPreview?.workingDays || 0} munkanap` : `${requestEditHoursOff || 0} óra`} kerülne rögzítésre.`
                  : decisionMode === "edit"
                    ? "A módosítás a függő kérelmet javítja, de még nem fogadja el. Az eredeti kérés auditként megmarad a szerveren."
                    : "Elutasításkor nem készül távolléti bejegyzés. Az alkalmazott az indoklással együtt látni fogja a döntést."}
              </div>
            </div>

            <footer className="flex flex-wrap justify-end gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
              <button type="button" disabled={decisionBusy} className={btnSoft} onClick={() => setDecisionTarget(null)}>Mégse</button>
              <button
                type="button"
                disabled={decisionBusy || (decisionMode === "rejected" && !decisionNote.trim()) || (decisionMode !== "rejected" && decisionTarget.kind === "vacation" && (decisionPeriodPreview?.workingDays || 0) <= 0)}
                onClick={() => void submitRequestDecision()}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5 text-sm text-white transition disabled:opacity-50 ${decisionMode === "approved" ? "border-[#9be9e5]/45 bg-[#208d8b] hover:bg-[#267f7d]" : decisionMode === "edit" ? "border-amber-200/42 bg-[#8a6b25] hover:bg-[#9b792b]" : "border-rose-200/45 bg-rose-600 hover:bg-rose-500"}`}
              >
                {decisionBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : decisionMode === "approved" ? <ThumbsUp className="h-4 w-4" /> : decisionMode === "edit" ? <Save className="h-4 w-4" /> : <ThumbsDown className="h-4 w-4" />}
                {decisionBusy ? "Mentés…" : decisionMode === "approved" ? "Elfogadás és rögzítés" : decisionMode === "edit" ? "Módosítás mentése" : "Elutasítás"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-[118] grid place-items-center bg-slate-950/76 px-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !settingsBusy) setSettingsOpen(false); }}>
          <div className="w-full max-w-2xl overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#236d6b] via-[#2a8d8b] to-[#426775] px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/30 bg-white/[0.14] text-white"><Settings2 className="h-5 w-5" /></span>
                <div><div className="text-[10px] uppercase tracking-[0.18em] text-white/65">Admin settings</div><div className="mt-0.5 text-xl text-white">Heti munkanapok</div><div className="mt-1 text-xs text-white/62">Csak a kijelölt napok számítanak bele a szabadságkeretbe.</div></div>
              </div>
              <button type="button" className={iconBtn} disabled={settingsBusy} onClick={() => setSettingsOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#174c55]/54 px-4 py-3 text-sm leading-6 text-[#e5fffd]">A kikapcsolt napokra eső korábbi szabadságsorok törlődnek az elszámolásból. A vasárnap alapból pihenőnap, a szombat pedig itt külön kapcsolható.</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {WEEK_DAYS.map((item) => {
                  const active = settingsDraft.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`rounded-2xl border px-3 py-3 text-center transition ${active ? "border-[#b7f1ed]/55 bg-[#2a8d8b] text-white shadow-[0_8px_20px_rgba(42,141,139,0.23)]" : "border-white/12 bg-[#3f5360] text-white/52 hover:bg-[#4d6570]"}`}
                      onClick={() => setSettingsDraft((current) => active ? current.filter((dayId) => dayId !== item.id) : [...current, item.id].sort((a, b) => a - b))}
                    >
                      <span className="block text-lg">{item.short}</span>
                      <span className="mt-1 block text-[10px]">{item.label}</span>
                      <span className="mt-2 inline-flex h-5 items-center rounded-full border border-current/20 px-2 text-[9px]">{active ? "Munkanap" : "Pihenőnap"}</span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-xs text-white/58">Aktív munkanapok: <span className="text-white">{WEEK_DAYS.filter((item) => settingsDraft.includes(item.id)).map((item) => item.label).join(", ") || "nincs kiválasztva"}</span></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/12 bg-[#303a4c] px-4 py-3">
              <button type="button" className={btnSoft} disabled={settingsBusy} onClick={() => setSettingsOpen(false)}>Mégse</button>
              <button type="button" className={btnPrimary} disabled={settingsBusy || settingsDraft.length === 0} onClick={() => void saveVacationSettings()}><CheckCircle2 className="h-4 w-4" />{settingsBusy ? "Mentés…" : "Beállítás mentése"}</button>
            </div>
          </div>
        </div>
      )}

      {summaryOpen && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/74 px-3 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-[24px] border border-white/18 bg-[#4b5362] p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-white font-medium">Összesítés ({summaryYear})</div>
                <div className="text-white/70 text-sm mt-1">Alkalmazottak éves szabadság napok + elkérezés órák.</div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  className="h-10 w-28 rounded-xl px-3 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20"
                  value={summaryYear}
                  onChange={(e) => setSummaryYear(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => fetchYearSummary(summaryYear)}
                  disabled={yearBusy}
                >
                  {yearBusy ? "Frissítés…" : "Frissítés"}
                </button>
                <button
                  type="button"
                  className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => setSummaryOpen(false)}
                >
                  Mégse
                </button>
              </div>
            </div>

            {yearErr ? <div className="mt-3 rounded-xl border border-rose-200/25 bg-rose-500/12 px-3 py-2 text-sm text-rose-50 whitespace-pre-wrap">{yearErr}</div> : null}

            <div className="mt-4 rounded-xl border border-white/30 overflow-hidden">
              {isMobile ? (
                <div className="grid grid-cols-10 gap-0 bg-white/5 text-white/70 text-[11px] px-3 py-2">
                  <div className="col-span-4">Név</div>
                  <div className="col-span-2 text-right">Szab. (nap)</div>
                  <div className="col-span-2 text-right">Elk. (nap)</div>
                  <div className="col-span-2 text-right">Elk. (óra)</div>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
                  <div className="col-span-6">Név</div>
                  <div className="col-span-2 text-right">Szabadság (nap)</div>
                  <div className="col-span-2 text-right">Elkérezés (nap)</div>
                  <div className="col-span-2 text-right">Elkérezés (óra)</div>
                </div>
              )}

              {yearRowsNonZero.length === 0 ? (
                <div className="px-3 py-6 text-white/60 text-sm">Nincs adat.</div>
              ) : (
                yearRowsNonZero.map((r) => (
                  isMobile ? (
                    <div
                      key={r.employeeName}
                      className="grid grid-cols-10 gap-0 px-3 py-3 items-center border-t border-white/10"
                    >
                      <div className="col-span-4 text-white text-sm truncate">{r.employeeName}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.vacationDays}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.shortDays}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.shortHours}</div>
                    </div>
                  ) : (
                    <div
                      key={r.employeeName}
                      className="grid grid-cols-12 gap-0 px-3 py-3 items-center border-t border-white/10"
                    >
                      <div className="col-span-6 text-white text-sm">{r.employeeName}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.vacationDays}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.shortDays}</div>
                      <div className="col-span-2 text-right text-white/80 text-sm">{r.shortHours}</div>
                    </div>
                  )
                ))
              )}
            </div>

            <div className="mt-4 rounded-xl border border-white/30 overflow-hidden">
              {isMobile ? (
                <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-[11px] px-3 py-2">
                  <div className="col-span-4">Név</div>
                  <div className="col-span-4 text-right">Tartozás egyenleg (nap)</div>
                  <div className="col-span-4 text-right">Tartozás egyenleg (óra)</div>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-0 bg-white/5 text-white/70 text-xs px-3 py-2">
                  <div className="col-span-6">Név</div>
                  <div className="col-span-3 text-right">Tartozás egyenleg (nap)</div>
                  <div className="col-span-3 text-right">Tartozás egyenleg (óra)</div>
                </div>
              )}

              {yearRowsNonZero.length === 0 ? (
                <div className="px-3 py-6 text-white/60 text-sm">Nincs adat.</div>
              ) : (
                yearRowsNonZero.map((r) => {
                  const bd = Number(r.compBalanceDays ?? 0) || 0;
                  const bh = Number(r.compBalanceHours ?? 0) || 0;
                  return isMobile ? (
                    <div
                      key={r.employeeName + "__comp"}
                      className="grid grid-cols-12 gap-0 px-3 py-3 items-center border-t border-white/10"
                    >
                      <div className="col-span-4 text-white text-sm truncate">{r.employeeName}</div>
                      <div className="col-span-4 text-right text-white/80 text-sm">{bd}</div>
                      <div className="col-span-4 text-right text-white/80 text-sm">{bh}</div>
                    </div>
                  ) : (
                    <div
                      key={r.employeeName + "__comp"}
                      className="grid grid-cols-12 gap-0 px-3 py-3 items-center border-t border-white/10"
                    >
                      <div className="col-span-6 text-white text-sm">{r.employeeName}</div>
                      <div className="col-span-3 text-right text-white/80 text-sm">{bd}</div>
                      <div className="col-span-3 text-right text-white/80 text-sm">{bh}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {pdfOpen && (
        <div className="fixed inset-0 z-[125] grid place-items-center bg-slate-950/74 px-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setPdfOpen(false); }}>
          <div className="w-full max-w-[620px] overflow-visible rounded-[24px] border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-start justify-between gap-3 rounded-t-[24px] border-b border-white/12 bg-[#303a4c] px-4 py-3.5">
              <div>
                <div className="flex items-center gap-2 text-base text-white"><PdfIcon className="h-6 w-6" /> PDF generálás</div>
                
              </div>
              <button type="button" className={iconBtn} onClick={() => setPdfOpen(false)} aria-label="Bezárás"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid gap-2.5 p-4 sm:grid-cols-[132px_minmax(220px,1fr)_44px] sm:items-end">
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46">Év
                <AllInSelect
                  value={String(pdfYear)}
                  options={pdfYearOptions.map((year) => ({ value: String(year), label: String(year) }))}
                  onChange={(next) => setPdfYear(Number(next))}
                  ariaLabel="PDF év"
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46">Alkalmazott
                <AllInSelect
                  value={pdfEmployee}
                  options={[{ value: "", label: "Összes dolgozó" }, ...employees.map((employee) => ({ value: employee.name, label: employee.name }))]}
                  onChange={setPdfEmployee}
                  ariaLabel="PDF alkalmazott"
                />
              </label>
              <button type="button" className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-[#7bd7d4]/35 bg-[#2a8d8b] transition hover:bg-[#319c99] sm:w-10" onClick={downloadPdf} title="PDF létrehozása" aria-label="PDF létrehozása"><PdfIcon className="h-6 w-6" /></button>
            </div>

            {yearErr ? <div className="mx-4 mb-4 rounded-xl border border-rose-200/25 bg-rose-500/12 px-3 py-2 text-sm text-rose-50 whitespace-pre-wrap">{yearErr}</div> : null}
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/78 px-3 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-white/18 bg-[#4b5362] p-5 shadow-2xl">
            <div className="text-white font-medium">{confirmTitle}</div>
            <div className="text-white/70 text-sm mt-2 whitespace-pre-wrap">{confirmMsg}</div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setConfirmOpen(false)}
              >
                Mégse
              </button>
              <button
                type="button"
                className={
                  "h-10 px-4 rounded-xl text-white font-medium " +
                  (confirmAction === "saveComp" ? "bg-[#208d8b] hover:bg-[#1b7a78]" : "bg-red-600 hover:bg-red-700")
                }
                onClick={runConfirm}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
