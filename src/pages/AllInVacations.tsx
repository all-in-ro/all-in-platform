import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  Clock3,
  History,
  Home,
  RefreshCw,
  Save,
  Scale,
  Search,
  Settings2,
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

function yyyymmNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function fmtKind(k: TimeEvent["kind"]) {
  return k === "vacation" ? "Szabadság" : "Elkérezés";
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

function mergeVacationSummaryRows(groups: SummaryRow[][]): SummaryRow[] {
  const map = new Map<string, SummaryRow>();
  for (const rows of groups) {
    for (const row of rows || []) {
      const key = empKey(row.employeeName);
      if (!key) continue;
      const current = map.get(key) || {
        employeeName: row.employeeName,
        vacationDays: 0,
        shortDays: 0,
        shortHours: 0,
      };
      current.vacationDays += Number(row.vacationDays || 0);
      current.shortDays += Number(row.shortDays || 0);
      current.shortHours += Number(row.shortHours || 0);
      map.set(key, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName, "hu", { sensitivity: "base" }));
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

export default function AllInVacations({ api }: { api?: string }) {
  const apiBase = useMemo(() => {
    const fromProp = typeof api === "string" && api.trim() ? api.trim() : "";
    const fromEnv = (import.meta as any)?.env?.VITE_API_BASE ? String((import.meta as any).env.VITE_API_BASE) : "";
    const base = fromProp || fromEnv || "/api";
    return normBase(base);
  }, [api]);

  const isMobile = useIsMobile();

  const card = "overflow-hidden rounded-2xl border border-white/14 bg-white/[0.07] shadow-lg";
  const panel = "overflow-hidden rounded-2xl border border-white/14 bg-white/[0.06] shadow-sm";
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
    "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/30 bg-rose-600 text-white transition hover:bg-rose-500";

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
  const [kindOpen, setKindOpen] = useState(false);
  const kindRef = useRef<HTMLDivElement | null>(null);
  const [shortHours, setShortHours] = useState<number>(4);
  const [note, setNote] = useState<string>("");
  const [saveErr, setSaveErr] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  // Compensation (tartozas / kompenzacio)
  const [compDay, setCompDay] = useState<string>(new Date().toISOString().slice(0, 10));
  const [compUnit, setCompUnit] = useState<"day" | "hour">("hour");
  const [compDir, setCompDir] = useState<"credit" | "debit">("credit");
  const [compDirOpen, setCompDirOpen] = useState(false);
  const [compUnitOpen, setCompUnitOpen] = useState(false);
  const compDirRef = useRef<HTMLDivElement | null>(null);
  const compUnitRef = useRef<HTMLDivElement | null>(null);
  const [compAmount, setCompAmount] = useState<number>(2);
  const [compNote, setCompNote] = useState<string>("");
  const [compChecked, setCompChecked] = useState(false);
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
  const [pdfEmpOpen, setPdfEmpOpen] = useState(false);
  const [pdfYearOpen, setPdfYearOpen] = useState(false);
  const pdfEmpRef = useRef<HTMLDivElement | null>(null);
  const pdfYearRef = useRef<HTMLDivElement | null>(null);

  const [vacationSettings, setVacationSettings] = useState<VacationSettings>({ workingDays: [1, 2, 3, 4, 5] });
  const [settingsDraft, setSettingsDraft] = useState<number[]>([1, 2, 3, 4, 5]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [pageNotice, setPageNotice] = useState("");
  const [activityMonths, setActivityMonths] = useState<VacationActivityMonth[]>([]);
  const [activityMonthsBusy, setActivityMonthsBusy] = useState(false);
  const [archiveYearOpen, setArchiveYearOpen] = useState(false);
  const [archiveFromMonthOpen, setArchiveFromMonthOpen] = useState(false);
  const [archiveToMonthOpen, setArchiveToMonthOpen] = useState(false);
  const archiveYearRef = useRef<HTMLDivElement | null>(null);
  const archiveFromMonthRef = useRef<HTMLDivElement | null>(null);
  const archiveToMonthRef = useRef<HTMLDivElement | null>(null);

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
  const activeArchiveFromMonth = useMemo(
    () => activityMonthsForYear.find((item) => item.month === monthFrom) || activityMonthsForYear[0] || null,
    [activityMonthsForYear, monthFrom]
  );
  const activeArchiveToMonth = useMemo(
    () => activityMonthsForYear.find((item) => item.month === monthTo) || activityMonthsForYear[activityMonthsForYear.length - 1] || null,
    [activityMonthsForYear, monthTo]
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
    const months = activityMonths
      .filter((item) => String(item.month || "").startsWith(`${nextYear}-`))
      .slice()
      .sort((a, b) => String(a.month || "").localeCompare(String(b.month || "")));
    if (months.length) {
      setMonthFrom(months[0].month);
      setMonthTo(months[months.length - 1].month);
    }
    setArchiveYearOpen(false);
    setArchiveFromMonthOpen(false);
    setArchiveToMonthOpen(false);
  };

  const changeArchiveMonthFrom = (nextMonth: string) => {
    if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
    setMonthFrom(nextMonth);
    if (nextMonth > monthTo) setMonthTo(nextMonth);
    setArchiveFromMonthOpen(false);
  };

  const changeArchiveMonthTo = (nextMonth: string) => {
    if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
    setMonthTo(nextMonth);
    if (nextMonth < monthFrom) setMonthFrom(nextMonth);
    setArchiveToMonthOpen(false);
  };

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!confirmOpen && !summaryOpen && !pdfOpen && !settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmOpen(false);
        setSummaryOpen(false);
        setPdfOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, summaryOpen, pdfOpen, settingsOpen]);

  // Custom dropdowns use only the AllIn palette, never the browser's blue native menu.
  useEffect(() => {
    if (!compDirOpen && !compUnitOpen && !pdfEmpOpen && !pdfYearOpen && !archiveYearOpen && !archiveFromMonthOpen && !archiveToMonthOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (compDirOpen && compDirRef.current && !compDirRef.current.contains(t)) setCompDirOpen(false);
      if (compUnitOpen && compUnitRef.current && !compUnitRef.current.contains(t)) setCompUnitOpen(false);
      if (pdfEmpOpen && pdfEmpRef.current && !pdfEmpRef.current.contains(t)) setPdfEmpOpen(false);
      if (pdfYearOpen && pdfYearRef.current && !pdfYearRef.current.contains(t)) setPdfYearOpen(false);
      if (archiveYearOpen && archiveYearRef.current && !archiveYearRef.current.contains(t)) setArchiveYearOpen(false);
      if (archiveFromMonthOpen && archiveFromMonthRef.current && !archiveFromMonthRef.current.contains(t)) setArchiveFromMonthOpen(false);
      if (archiveToMonthOpen && archiveToMonthRef.current && !archiveToMonthRef.current.contains(t)) setArchiveToMonthOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCompDirOpen(false);
        setCompUnitOpen(false);
        setPdfEmpOpen(false);
        setPdfYearOpen(false);
        setArchiveYearOpen(false);
        setArchiveFromMonthOpen(false);
        setArchiveToMonthOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [compDirOpen, compUnitOpen, pdfEmpOpen, pdfYearOpen, archiveYearOpen, archiveFromMonthOpen, archiveToMonthOpen]);

  // Custom "Típus" dropdown: force ONLY our colors (no OS/browser blue highlight).
  useEffect(() => {
    if (!kindOpen) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (kindRef.current && !kindRef.current.contains(t)) setKindOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setKindOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [kindOpen]);

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

      if (!orderedItems.length) return;

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

      const monthResults = await Promise.all(
        rangeMonths.map(async (currentMonth) => {
          const sumUrl = `${apiBase}/admin/vacations?month=${encodeURIComponent(currentMonth)}`;
          const itemUrl = emp
            ? `${apiBase}/admin/vacations?month=${encodeURIComponent(currentMonth)}&employee=${encodeURIComponent(emp)}`
            : "";

          const [summaryResponse, itemResponse] = await Promise.all([
            fetch(sumUrl, { credentials: "include", cache: "no-store" }),
            itemUrl ? fetch(itemUrl, { credentials: "include", cache: "no-store" }) : Promise.resolve(null),
          ]);

          const summaryBody = await summaryResponse.json().catch(() => null);
          if (!summaryResponse.ok) {
            throw new Error(String(summaryBody?.error || summaryBody?.message || `HTTP ${summaryResponse.status}`));
          }

          let itemBody: any = null;
          if (itemResponse) {
            itemBody = await itemResponse.json().catch(() => null);
            if (!itemResponse.ok) {
              throw new Error(String(itemBody?.error || itemBody?.message || `HTTP ${itemResponse.status}`));
            }
          }

          return {
            summary: Array.isArray(summaryBody?.summary) ? summaryBody.summary as SummaryRow[] : [],
            compSummary: Array.isArray(summaryBody?.compSummary) ? summaryBody.compSummary as CompSummaryRow[] : [],
            items: Array.isArray(itemBody?.items) ? itemBody.items as TimeEvent[] : [],
            compItems: Array.isArray(itemBody?.compItems) ? itemBody.compItems as CompEvent[] : [],
          };
        })
      );

      if (requestId !== listRequestIdRef.current) return;

      setSummary(mergeVacationSummaryRows(monthResults.map((result) => result.summary)));
      setCompSummary(mergeVacationCompSummaryRows(monthResults.map((result) => result.compSummary)));

      if (emp) {
        const mergedItems = monthResults
          .flatMap((result) => result.items)
          .filter((item, index, all) => all.findIndex((candidate) => String(candidate.id) === String(item.id)) === index)
          .sort((a, b) => String(b.day || "").localeCompare(String(a.day || "")));
        const mergedCompItems = monthResults
          .flatMap((result) => result.compItems)
          .filter((item, index, all) => all.findIndex((candidate) => String(candidate.id) === String(item.id)) === index)
          .sort((a, b) => String(b.day || "").localeCompare(String(a.day || "")));
        setItems(mergedItems);
        setCompItems(mergedCompItems);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    if (!selected) {
      setActivityMonths([]);
      return;
    }
    void fetchActivityMonths(selected, { resetRange: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, apiBase]);

  useEffect(() => {
    if (!monthFrom || !monthTo) return;
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthFrom, monthTo, selected, apiBase]);

  const selectedSummary = useMemo(() => {
    const s = summary.find((x) => empKey(x.employeeName) === empKey(selected));
    return s || { employeeName: selected, vacationDays: 0, shortDays: 0, shortHours: 0 };
  }, [summary, selected]);

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
      setCompErr("A megjegyzés kötelező (ez a bizonyíték).");
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
      setCompChecked(false);
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
    setConfirmMsg(
      "Biztos mented? Ez kompenzációs esemény lesz (tartozás / kiegyenlítés), és nem csökkenti a rendes szabadságot."
    );
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

              return (
                <button
                  key={e.name}
                  data-emp={e.name}
                  type="button"
                  className={
                    "group w-full rounded-2xl border px-3 py-3 text-left transition " +
                    (active
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
                        (active
                          ? "border-white/45 bg-white text-[#247f7d]"
                          : "border-white/25 bg-[#e7faf8] text-[#247f7d]")
                      }
                    >
                      {initials(e.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm text-white">{e.name}</div>
                        <ChevronRight
                          className={
                            "h-4 w-4 " +
                            (active
                              ? "text-[#7bd7d4]"
                              : "text-white/28 transition group-hover:text-white/55")
                          }
                        />
                      </div>
                      <div className="mt-1 text-[10px] text-white/42">{monthLabel}</div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                    <span className="rounded-lg border border-white/12 bg-white/[0.14] px-1.5 py-1.5 text-[10px] text-white/80">
                      <strong className="block text-xs font-normal text-white">{vacationDays}</strong>
                      szab. nap
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
    <div className="relative space-y-4">
      <section className="relative z-[60] overflow-visible rounded-2xl border border-white/14 bg-white/[0.06] shadow-sm">
        <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#303a4c] via-[#354153] to-[#2a8d8b]/34 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-white/80 text-sm">Kiválasztva</div>
          <div className="text-white text-lg font-medium mt-1">{selected || "-"}</div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div ref={archiveYearRef} className="relative grid gap-1">
            <div className="text-[10px] uppercase tracking-[0.1em] text-white/48">Év</div>
            <button
              type="button"
              className="flex h-11 min-w-[112px] items-center justify-between gap-3 rounded-xl border border-white/22 bg-[#3f4959] px-3 text-sm text-white outline-none transition hover:bg-[#465264] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
              onClick={() => {
                setArchiveYearOpen((value) => !value);
                setArchiveFromMonthOpen(false);
                setArchiveToMonthOpen(false);
              }}
              aria-haspopup="listbox"
              aria-expanded={archiveYearOpen}
            >
              <span>{archiveYear}</span>
              <ChevronDown className={`h-4 w-4 text-white/55 transition ${archiveYearOpen ? "rotate-180" : ""}`} />
            </button>
            {archiveYearOpen ? (
              <div className="absolute right-0 top-full z-[320] mt-2 min-w-full overflow-hidden rounded-xl border border-white/18 bg-[#354153] shadow-2xl" role="listbox">
                {archiveYears.map((year) => (
                  <button
                    key={year}
                    type="button"
                    className={`block w-full px-4 py-2.5 text-left text-sm transition ${year === archiveYear ? "bg-[#2a8d8b] text-white" : "text-white/82 hover:bg-[#415064]"}`}
                    onClick={() => changeArchiveYear(year)}
                  >
                    {year}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div ref={archiveFromMonthRef} className="relative grid gap-1">
            <div className="text-[10px] uppercase tracking-[0.1em] text-white/48">Mettől</div>
            <button
              type="button"
              className="flex h-11 min-w-[158px] items-center justify-between gap-3 rounded-xl border border-white/22 bg-[#3f4959] px-3 text-sm text-white outline-none transition hover:bg-[#465264] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!activityMonthsForYear.length}
              onClick={() => {
                setArchiveFromMonthOpen((value) => !value);
                setArchiveYearOpen(false);
                setArchiveToMonthOpen(false);
              }}
              aria-haspopup="listbox"
              aria-expanded={archiveFromMonthOpen}
            >
              <span>{activeArchiveFromMonth ? formatMonthLabel(activeArchiveFromMonth.month).replace(`${archiveYear}. `, "") : "Nincs hónap"}</span>
              <ChevronDown className={`h-4 w-4 text-white/55 transition ${archiveFromMonthOpen ? "rotate-180" : ""}`} />
            </button>
            {archiveFromMonthOpen && activityMonthsForYear.length ? (
              <div className="absolute right-0 top-full z-[320] mt-2 min-w-full overflow-hidden rounded-xl border border-white/18 bg-[#354153] shadow-2xl" role="listbox">
                {activityMonthsForYear.map((item) => (
                  <button
                    key={item.month}
                    type="button"
                    className={`flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm transition ${item.month === monthFrom ? "bg-[#2a8d8b] text-white" : "text-white/82 hover:bg-[#415064]"}`}
                    onClick={() => changeArchiveMonthFrom(item.month)}
                  >
                    <span>{formatMonthLabel(item.month).replace(`${archiveYear}. `, "")}</span>
                    <span className="text-[10px] text-white/55">{item.vacationDays} nap</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div ref={archiveToMonthRef} className="relative grid gap-1">
            <div className="text-[10px] uppercase tracking-[0.1em] text-white/48">Meddig</div>
            <button
              type="button"
              className="flex h-11 min-w-[158px] items-center justify-between gap-3 rounded-xl border border-white/22 bg-[#3f4959] px-3 text-sm text-white outline-none transition hover:bg-[#465264] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!activityMonthsForYear.length}
              onClick={() => {
                setArchiveToMonthOpen((value) => !value);
                setArchiveYearOpen(false);
                setArchiveFromMonthOpen(false);
              }}
              aria-haspopup="listbox"
              aria-expanded={archiveToMonthOpen}
            >
              <span>{activeArchiveToMonth ? formatMonthLabel(activeArchiveToMonth.month).replace(`${archiveYear}. `, "") : "Nincs hónap"}</span>
              <ChevronDown className={`h-4 w-4 text-white/55 transition ${archiveToMonthOpen ? "rotate-180" : ""}`} />
            </button>
            {archiveToMonthOpen && activityMonthsForYear.length ? (
              <div className="absolute right-0 top-full z-[320] mt-2 min-w-full overflow-hidden rounded-xl border border-white/18 bg-[#354153] shadow-2xl" role="listbox">
                {activityMonthsForYear.map((item) => (
                  <button
                    key={item.month}
                    type="button"
                    className={`flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm transition ${item.month === monthTo ? "bg-[#2a8d8b] text-white" : "text-white/82 hover:bg-[#415064]"}`}
                    onClick={() => changeArchiveMonthTo(item.month)}
                  >
                    <span>{formatMonthLabel(item.month).replace(`${archiveYear}. `, "")}</span>
                    <span className="text-[10px] text-white/55">{item.vacationDays} nap</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <Button type="button" className={btn} onClick={() => fetchList()} disabled={listBusy}>
            <RefreshCw className={`h-4 w-4 ${listBusy ? "animate-spin" : ""}`} />
            {listBusy ? "Frissítés…" : "Frissítés"}
          </Button>
        </div>
        </div>
      </section>

      <section className="relative z-0 rounded-2xl border border-[#7bd7d4]/20 bg-[#315c62]/72 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#d7fffd]/58">Gyors visszakeresés</div>
            <div className="mt-1 text-sm text-white">{archiveYear}. év szabadságos hónapjai</div>
          </div>
          {activityMonthsBusy ? <span className="text-xs text-white/48"><RefreshCw className="mr-1 inline h-3.5 w-3.5 animate-spin" />Betöltés…</span> : null}
        </div>
        <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
          {activityMonthsForYear.length ? activityMonthsForYear.map((item) => (
            <button
              key={item.month}
              type="button"
              className={`rounded-xl border px-3 py-2 text-left text-xs transition ${item.month >= monthFrom && item.month <= monthTo ? "border-white/55 bg-white text-[#236d6b]" : "border-[#b7f1ed]/24 bg-[#2a8d8b]/28 text-[#e5fffd] hover:bg-[#2a8d8b]/45"}`}
              onClick={() => {
                setMonthFrom(item.month);
                setMonthTo(item.month);
              }}
              title={`${item.vacationDays} szabadságnap • kattintásra csak ezt a hónapot mutatja`}
            >
              <span className="block">{formatMonthLabel(item.month)}</span>
              <span className={`mt-0.5 block text-[10px] ${item.month >= monthFrom && item.month <= monthTo ? "text-[#236d6b]/70" : "text-white/52"}`}>{item.vacationDays} nap</span>
            </button>
          )) : !activityMonthsBusy ? <span className="text-xs text-white/48">{archiveYear}-ban ennél a dolgozónál nincs rögzített szabadság.</span> : null}
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

      <section id="vacation-new-entry" className={panel}>
        <div className={panelHead}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.17em] text-white/40">Új távollét</div>
            <div className="mt-1 flex items-center gap-2 text-base"><CalendarPlus className="h-4 w-4" /> Szabadság vagy elkérezés rögzítése</div>
          </div>
          <span className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-[10px] text-white/55">{selected || "Nincs kiválasztva"}</span>
        </div>
        <div className="p-4">

        <div className="mt-3 grid gap-3 grid-cols-1 sm:grid-cols-3">
          {kind === "vacation" ? (
            <>
              <div className="grid gap-2">
                <div className={label}>Kezdő nap</div>
                <input
                  type="date"
                  className={input}
                  value={day}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDay(v);
                    if (!dayTo || dayTo.trim() === "" || (dayTo.trim() && dayTo.trim() < v)) setDayTo(v);
                  }}
                />
              </div>
              <div className="grid gap-2">
                <div className={label}>Vége</div>
                <input type="date" className={input} value={dayTo} onChange={(e) => setDayTo(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <div className={label}>Dátum</div>
              <input type="date" className={input} value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
          )}

          <div className="grid gap-2">
            <div className={label}>Típus</div>
            <div ref={kindRef} className="relative">
              <button
                type="button"
                className="w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
                onClick={() => setKindOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={kindOpen}
              >
                <span className="text-sm">{kind === "vacation" ? "Szabadság nap" : "Elkérezés (óra)"}</span>
                <span className="text-white/70 text-xs">▾</span>
              </button>

              {kindOpen && (
                <div
                  role="listbox"
                  className="absolute z-[200] mt-2 w-full overflow-hidden rounded-xl border border-white/30"
                  style={{ backgroundColor: "#354153" }}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={kind === "vacation"}
                    className={
                      "w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0 "
                    }
                    style={{ backgroundColor: kind === "vacation" ? "#208d8b" : "#354153" }}
                    onClick={() => {
                      setKind("vacation");
                      setKindOpen(false);
                    }}
                  >
                    Szabadság nap
                  </button>

                  <button
                    type="button"
                    role="option"
                    aria-selected={kind === "short"}
                    className={"w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"}
                    style={{ backgroundColor: kind === "short" ? "#208d8b" : "#354153" }}
                    onClick={() => {
                      setKind("short");
                      setKindOpen(false);
                    }}
                  >
                    Elkérezés (óra)
                  </button>
                </div>
              )}
            </div>
          </div>

          {kind === "vacation" ? (
            <div className="sm:col-span-3 text-white/50 text-xs">Kezdő nap · Vége. Ha ugyanaz, egy napot jelent.</div>
          ) : null}

          {kind === "short" ? (
            <div className="grid gap-2">
              <div className={label}>Óra</div>
              <input
                type="number"
                min={1}
                max={12}
                step={1}
                className={input}
                value={shortHours}
                onChange={(e) => setShortHours(Number(e.target.value))}
              />
            </div>
          ) : null}

          <div className="grid gap-2 sm:col-span-3">
            <div className={label}>Megjegyzés (opcionális)</div>
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pl. orvos" />
          </div>
        </div>

        {kind === "vacation" ? (
          <div className="mt-3 grid gap-2 rounded-2xl border border-[#7bd7d4]/22 bg-[#174c55]/52 p-3 sm:grid-cols-3">
            <div><div className="text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/50">Naptári időszak</div><div className="mt-1 text-lg text-white">{vacationPreview.calendarDays} nap</div></div>
            <div><div className="text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/50">Elszámolt szabadság</div><div className="mt-1 text-lg text-[#d7fffd]">{vacationPreview.workingDays} nap</div></div>
            <div><div className="text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/50">Kihagyott pihenőnap</div><div className="mt-1 text-lg text-white">{vacationPreview.excludedDays} nap</div></div>
            <div className="sm:col-span-3 text-[11px] text-white/58">Munkanapok: {WEEK_DAYS.filter((item) => vacationSettings.workingDays.includes(item.id)).map((item) => item.label).join(", ")}.</div>
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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-white/80 text-sm">Kompenzáció (tartozás)</div>
            <div className="text-white/50 text-xs mt-1">
              Ha hivatalos szabadság alatt dolgozik vagy túlórázik: te tartozol. Ha kiadod/kompenzálod: kiegyenlítés.
            </div>
          </div>
          <div className="rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 px-2.5 py-1 text-[11px] text-[#d7fffd]">
            Egyenleg: {selectedComp.balanceDays} nap, {selectedComp.balanceHours} óra
          </div>
        </div>
        <div className="p-4">

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-4">
          <div className="grid gap-2">
            <div className={label}>Dátum</div>
            <input type="date" className={input} value={compDay} onChange={(e) => setCompDay(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <div className={label}>Típus</div>
	          <div ref={compDirRef} className="relative">
	            <button
	              type="button"
	              className="w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
	              onClick={() => setCompDirOpen((v) => !v)}
	              aria-haspopup="listbox"
	              aria-expanded={compDirOpen}
	            >
	              <span className="text-sm">{compDir === "credit" ? "Tartozunk neki (+)" : "Kiegyenlítve (-)"}</span>
	              <span className="text-white/70 text-xs">▾</span>
	            </button>

	            {compDirOpen && (
	              <div
	                role="listbox"
	                className="absolute z-[200] mt-2 w-full overflow-hidden rounded-xl border border-white/30"
	                style={{ backgroundColor: "#354153" }}
	              >
	                <button
	                  type="button"
	                  role="option"
	                  aria-selected={compDir === "credit"}
	                  className="w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"
	                  style={{ backgroundColor: compDir === "credit" ? "#208d8b" : "#354153" }}
	                  onClick={() => {
	                    setCompDir("credit");
	                    setCompDirOpen(false);
	                  }}
	                >
	                  Tartozunk neki (+)
	                </button>
	
	                <button
	                  type="button"
	                  role="option"
	                  aria-selected={compDir === "debit"}
	                  className="w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"
	                  style={{ backgroundColor: compDir === "debit" ? "#208d8b" : "#354153" }}
	                  onClick={() => {
	                    setCompDir("debit");
	                    setCompDirOpen(false);
	                  }}
	                >
	                  Kiegyenlítve (-)
	                </button>
	              </div>
	            )}
	          </div>
          </div>

          <div className="grid gap-2">
            <div className={label}>Mérték</div>
	          <div ref={compUnitRef} className="relative">
	            <button
	              type="button"
	              className="w-full h-11 rounded-xl px-4 border border-white/30 bg-white/5 text-white outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-between"
	              onClick={() => setCompUnitOpen((v) => !v)}
	              aria-haspopup="listbox"
	              aria-expanded={compUnitOpen}
	            >
	              <span className="text-sm">{compUnit === "hour" ? "Óra" : "Nap"}</span>
	              <span className="text-white/70 text-xs">▾</span>
	            </button>

	            {compUnitOpen && (
	              <div
	                role="listbox"
	                className="absolute z-[200] mt-2 w-full overflow-hidden rounded-xl border border-white/30"
	                style={{ backgroundColor: "#354153" }}
	              >
	                <button
	                  type="button"
	                  role="option"
	                  aria-selected={compUnit === "hour"}
	                  className="w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"
	                  style={{ backgroundColor: compUnit === "hour" ? "#208d8b" : "#354153" }}
	                  onClick={() => {
	                    const u = "hour" as const;
	                    setCompUnit(u);
	                    if (compAmount > 12) setCompAmount(2);
	                    setCompUnitOpen(false);
	                  }}
	                >
	                  Óra
	                </button>
	
	                <button
	                  type="button"
	                  role="option"
	                  aria-selected={compUnit === "day"}
	                  className="w-full text-left px-4 py-3 text-sm text-white border-t border-white/10 first:border-t-0"
	                  style={{ backgroundColor: compUnit === "day" ? "#208d8b" : "#354153" }}
	                  onClick={() => {
	                    const u = "day" as const;
	                    setCompUnit(u);
	                    if (compAmount > 31) setCompAmount(1);
	                    setCompUnitOpen(false);
	                  }}
	                >
	                  Nap
	                </button>
	              </div>
	            )}
	          </div>
          </div>

          <div className="grid gap-2">
            <div className={label}>Mennyiség</div>
            <input
              type="number"
              min={1}
              max={compUnit === "hour" ? 12 : 31}
              step={1}
              className={input}
              value={compAmount}
              onChange={(e) => setCompAmount(Number(e.target.value))}
            />
          </div>

          <div className="grid gap-2 sm:col-span-4">
            <div className={label}>Megjegyzés (kötelező)</div>
            <input
              className={input}
              value={compNote}
              onChange={(e) => setCompNote(e.target.value)}
              placeholder="Pl. behívva szabadság alatt / túlóra / kompenzáció kiadva"
            />
          </div>

          <div className="sm:col-span-4 flex items-center justify-between gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 text-white/80 text-sm select-none">
              <input
                type="checkbox"
                checked={compChecked}
                onChange={(e) => setCompChecked(e.target.checked)}
                className="h-4 w-4 accent-[#208d8b]"
              />
              Kompenzációs esemény (nem csökkenti a rendes szabadságot)
            </label>

            <Button
              type="button"
              className={`${btnPrimary} w-full sm:w-auto`}
              disabled={compBusy || !selected}
              onClick={() => {
                setCompErr("");
                if (!compChecked) {
                  setCompErr("Előbb pipáld ki, hogy ez kompenzáció (külön tábla), majd mentés.");
                  return;
                }
                openSaveCompConfirm();
              }}
            >
              <Save className="h-4 w-4" />
              {compBusy ? "Mentés…" : "Kompenzáció mentése"}
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
                    <div className="text-white text-sm">{it.day}</div>
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
                    <div className="col-span-3 text-white text-sm">{it.day}</div>
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
                      <div className="col-span-4 text-white text-sm">{it.day}</div>
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
                      <div className="col-span-4 text-white text-sm">{it.day}</div>
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
    <div className="min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-4 sm:py-5">
      <style>{`
        input[type="date"], input[type="month"] { color-scheme: dark; }
        select.allin-select { color-scheme: dark; accent-color: #2a8d8b; }
        select.allin-select option { background-color: #354153 !important; color: #ffffff !important; }
        select.allin-select option:checked { background-color: #2a8d8b !important; color: #ffffff !important; }
      `}</style>

      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="sticky top-2 z-40 rounded-2xl border border-white/20 bg-[#303a4c]/96 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[240px] items-center gap-3 border-l-4 border-[#7bd7d4]/70 pl-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">AllInFashion</div>
                <h1 className="mt-0.5 text-xl leading-tight">Szabadságok</h1>
                <div className="mt-0.5 text-[11px] text-white/48">Távollét, elkérezés és kompenzáció kezelése</div>
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
              <Button className={btnSoft} type="button" onClick={openYearSummary} disabled={yearBusy}>
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Éves összesítés</span>
                <span className="sm:hidden">Összesítés</span>
              </Button>
              <Button className={`${btnSoft} hidden sm:inline-flex`} type="button" onClick={openPdf} disabled={yearBusy}>
                <PdfIcon className="h-5 w-5" />
                PDF
              </Button>
              <Button
                className={btnSoft}
                type="button"
                title="Munkanapok és hétvégi elszámolás beállítása"
                aria-label="Munkanapok beállítása"
                onClick={() => { setSettingsDraft(vacationSettings.workingDays); setSettingsOpen(true); }}
              >
                <Settings2 className="h-4 w-4" />
                <span>Munkanapok</span>
              </Button>
              <Button
                className={btnSoft}
                type="button"
                onClick={() => {
                  void fetchEmployees();
                  void fetchList();
                }}
                disabled={empBusy || listBusy}
              >
                <RefreshCw className={`h-4 w-4 ${empBusy || listBusy ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Frissítés</span>
              </Button>
              <Button className={btn} onClick={() => (window.location.hash = "#allin")} type="button">
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Kezdőlap</span>
              </Button>
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

        <section className={card}>
          <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">Munkafolyamat</div>
              <div className="mt-1 text-base text-white">1. Dolgozó kiválasztása → 2. Művelet → 3. Mentés vagy visszakeresés</div>
              <div className="mt-1 text-xs text-white/42">A kiválasztott időszak és dolgozó minden kapcsolódó adatot együtt tart.</div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:flex">
              <button
                type="button"
                className={btnSoft}
                disabled={!selected}
                onClick={() => document.getElementById("vacation-new-entry")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <CalendarPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Új távollét</span>
                <span className="sm:hidden">Új</span>
              </button>
              <button
                type="button"
                className={btnSoft}
                disabled={!selected}
                onClick={() => document.getElementById("vacation-compensation")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <Scale className="h-4 w-4" />
                <span className="hidden sm:inline">Kompenzáció</span>
                <span className="sm:hidden">Komp.</span>
              </button>
              <button
                type="button"
                className={btnSoft}
                disabled={!selected}
                onClick={() => document.getElementById("vacation-history")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">Előzmények</span>
                <span className="sm:hidden">Előz.</span>
              </button>
            </div>
          </div>
        </section>

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
                <div className="mt-1 text-xs text-white/55">Éves kimutatás minden dolgozóról vagy egy kiválasztott alkalmazottról.</div>
              </div>
              <button type="button" className={iconBtn} onClick={() => setPdfOpen(false)} aria-label="Bezárás"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-[132px_minmax(220px,1fr)_44px] sm:items-end">
              <div ref={pdfYearRef} className="relative grid gap-1">
                <div className="text-[10px] uppercase tracking-[0.1em] text-white/48">Év</div>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between rounded-xl border border-white/22 bg-[#3f4959] px-3 text-sm text-white transition hover:bg-[#465264] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                  onClick={() => { setPdfYearOpen((value) => !value); setPdfEmpOpen(false); }}
                  aria-haspopup="listbox"
                  aria-expanded={pdfYearOpen}
                >
                  <span>{pdfYear}</span>
                  <ChevronDown className={`h-4 w-4 text-white/55 transition ${pdfYearOpen ? "rotate-180" : ""}`} />
                </button>
                {pdfYearOpen ? (
                  <div className="absolute bottom-full left-0 z-[300] mb-2 max-h-64 min-w-full overflow-y-auto rounded-xl border border-white/18 bg-[#354153] shadow-2xl" role="listbox">
                    {pdfYearOptions.map((year) => (
                      <button
                        key={year}
                        type="button"
                        className={`block w-full px-4 py-2.5 text-left text-sm transition ${year === pdfYear ? "bg-[#2a8d8b] text-white" : "text-white/82 hover:bg-[#415064]"}`}
                        onClick={() => { setPdfYear(year); setPdfYearOpen(false); }}
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div ref={pdfEmpRef} className="relative grid gap-1">
                <div className="text-[10px] uppercase tracking-[0.1em] text-white/48">Alkalmazott</div>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-white/22 bg-[#3f4959] px-3 text-sm text-white transition hover:bg-[#465264] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                  onClick={() => { setPdfEmpOpen((value) => !value); setPdfYearOpen(false); }}
                  aria-haspopup="listbox"
                  aria-expanded={pdfEmpOpen}
                >
                  <span className="truncate">{pdfEmployee.trim() ? pdfEmployee.trim() : "Összes dolgozó"}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-white/55 transition ${pdfEmpOpen ? "rotate-180" : ""}`} />
                </button>
                {pdfEmpOpen ? (
                  <div className="absolute bottom-full left-0 z-[300] mb-2 max-h-72 w-full overflow-y-auto rounded-xl border border-white/18 bg-[#354153] shadow-2xl" role="listbox">
                    <button
                      type="button"
                      className={`block w-full px-4 py-2.5 text-left text-sm transition ${!pdfEmployee.trim() ? "bg-[#2a8d8b] text-white" : "text-white/82 hover:bg-[#415064]"}`}
                      onClick={() => { setPdfEmployee(""); setPdfEmpOpen(false); }}
                    >
                      Összes dolgozó
                    </button>
                    {employees.map((employee) => (
                      <button
                        key={employee.name}
                        type="button"
                        className={`block w-full px-4 py-2.5 text-left text-sm transition ${pdfEmployee.trim() === employee.name ? "bg-[#2a8d8b] text-white" : "text-white/82 hover:bg-[#415064]"}`}
                        onClick={() => { setPdfEmployee(employee.name); setPdfEmpOpen(false); }}
                      >
                        {employee.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#7bd7d4]/35 bg-[#2a8d8b] transition hover:bg-[#319c99]"
                onClick={downloadPdf}
                title="PDF létrehozása"
                aria-label="PDF létrehozása"
              >
                <PdfIcon className="h-6 w-6" />
              </button>
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
