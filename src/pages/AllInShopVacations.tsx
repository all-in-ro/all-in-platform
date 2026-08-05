import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BellRing,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  Loader2,
  MessageSquareText,
  Minus,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";

type VacationRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type VacationRequestKind = "vacation" | "short";

type VacationRequestItem = {
  id: string;
  employeeName: string;
  shopId?: string | null;
  kind: VacationRequestKind;
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

type ApprovedEvent = {
  id: string;
  day: string;
  kind: VacationRequestKind;
  hoursOff?: number | null;
  note?: string | null;
  createdAt?: string | null;
  createdBy?: string | null;
};

type VacationOverview = {
  ok: true;
  employeeName: string;
  year: number;
  items: VacationRequestItem[];
  events: ApprovedEvent[];
  summary: {
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
    unseen: number;
    vacationDays: number;
    shortDays: number;
    shortHours: number;
  };
};

type Props = {
  open: boolean;
  actor: string;
  locationName: string;
  apiBase?: string;
  onClose: () => void;
};

function normalizeBase(value?: string) {
  return String(value || "/api").replace(/\/+$/, "");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "–";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: VacationRequestStatus) {
  if (status === "approved") return "Elfogadva";
  if (status === "rejected") return "Elutasítva";
  if (status === "cancelled") return "Visszavonva";
  return "Elbírálás alatt";
}

function statusClass(status: VacationRequestStatus) {
  if (status === "approved") return "border-emerald-300/35 bg-emerald-500/15 text-emerald-50";
  if (status === "rejected") return "border-rose-300/35 bg-rose-500/15 text-rose-50";
  if (status === "cancelled") return "border-white/15 bg-white/[0.05] text-white/55";
  return "border-amber-200/35 bg-amber-500/14 text-amber-50";
}

function periodLabel(item: VacationRequestItem) {
  if (item.kind === "short") return `${formatDate(item.dayFrom)} • ${item.hoursOff || 0} óra`;
  return item.dayFrom === item.dayTo
    ? formatDate(item.dayFrom)
    : `${formatDate(item.dayFrom)} – ${formatDate(item.dayTo)}`;
}

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value || todayIso()}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value || todayIso();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthKeyFromIso(value?: string) {
  const source = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : todayIso();
  return source.slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1, 12));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

function shiftMonthKey(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function calendarCells(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const jsDay = first.getUTCDay();
  const mondayOffset = jsDay === 0 ? 6 : jsDay - 1;
  const cells: Array<string | null> = Array.from({ length: mondayOffset }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const CALENDAR_WEEK_DAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

function TouchDateControl({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => monthKeyFromIso(value));

  useEffect(() => {
    if (!pickerOpen) return;
    setVisibleMonth(monthKeyFromIso(value));
  }, [pickerOpen, value]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  const shift = (days: number) => {
    const next = shiftIsoDate(value, days);
    if (min && next < min) return;
    onChange(next);
  };

  const selectDate = (next: string) => {
    if (min && next < min) return;
    onChange(next);
    setPickerOpen(false);
  };

  const cells = calendarCells(visibleMonth);
  const today = todayIso();

  return (
    <>
      <div className="grid gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] text-white/48">{label}</span>
        <div className="grid grid-cols-[58px_minmax(0,1fr)_58px] overflow-hidden rounded-2xl border border-white/18 bg-[#273243] shadow-[0_8px_20px_rgba(15,23,42,0.16)]">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="inline-flex h-16 touch-manipulation items-center justify-center border-r border-white/12 text-white transition hover:bg-white/[0.08] active:bg-[#2a8d8b]"
            aria-label={`${label}: előző nap`}
          >
            <ChevronLeft size={26} />
          </button>

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex h-16 min-w-0 touch-manipulation items-center justify-center px-2 text-center text-white transition hover:bg-white/[0.06] active:bg-[#2a8d8b]"
            aria-label={`${label}: ${formatDate(value)}, naptár megnyitása`}
          >
            <span className="whitespace-nowrap text-[17px] tabular-nums sm:text-lg">{formatDate(value)}</span>
          </button>

          <button
            type="button"
            onClick={() => shift(1)}
            className="inline-flex h-16 touch-manipulation items-center justify-center border-l border-white/12 text-white transition hover:bg-white/[0.08] active:bg-[#2a8d8b]"
            aria-label={`${label}: következő nap`}
          >
            <ChevronRight size={26} />
          </button>
        </div>
      </div>

      {pickerOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[420] grid place-items-center bg-slate-950/82 p-3 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPickerOpen(false);
          }}
        >
          <section className="w-full max-w-[560px] overflow-hidden rounded-[28px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_36px_120px_rgba(0,0,0,0.64)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#1f5f61] to-[#2a8d8b] px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/12">
                  <CalendarDays size={22} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/60">{label}</p>
                  <h3 className="mt-1 truncate text-lg">{formatDate(value)}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-white/22 bg-black/10 text-white active:bg-white/15"
                aria-label="Naptár bezárása"
              >
                <X size={20} />
              </button>
            </header>

            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-[58px_minmax(0,1fr)_58px] items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleMonth((current) => shiftMonthKey(current, -1))}
                  className="inline-flex h-14 touch-manipulation items-center justify-center rounded-2xl border border-white/16 bg-[#273243] text-white active:bg-[#2a8d8b]"
                  aria-label="Előző hónap"
                >
                  <ChevronLeft size={27} />
                </button>
                <div className="text-center text-xl capitalize text-white">{monthLabel(visibleMonth)}</div>
                <button
                  type="button"
                  onClick={() => setVisibleMonth((current) => shiftMonthKey(current, 1))}
                  className="inline-flex h-14 touch-manipulation items-center justify-center rounded-2xl border border-white/16 bg-[#273243] text-white active:bg-[#2a8d8b]"
                  aria-label="Következő hónap"
                >
                  <ChevronRight size={27} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
                {CALENDAR_WEEK_DAYS.map((dayName) => (
                  <div key={dayName} className="py-2 text-[11px] uppercase tracking-[0.08em] text-white/45">{dayName}</div>
                ))}
                {cells.map((cell, index) => {
                  if (!cell) return <div key={`empty-${index}`} className="h-12 sm:h-14" />;
                  const dayNumber = Number(cell.slice(-2));
                  const selected = cell === value;
                  const isToday = cell === today;
                  const disabled = Boolean(min && cell < min);
                  return (
                    <button
                      key={cell}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectDate(cell)}
                      className={`relative flex h-12 touch-manipulation items-center justify-center rounded-xl border text-base transition sm:h-14 sm:text-lg ${
                        selected
                          ? "border-[#b7f1ed] bg-[#2a8d8b] text-white shadow-[0_8px_20px_rgba(42,141,139,0.26)]"
                          : disabled
                            ? "border-transparent bg-transparent text-white/18"
                            : isToday
                              ? "border-[#7bd7d4]/55 bg-[#2a8d8b]/20 text-[#d7fffd] active:bg-[#2a8d8b]"
                              : "border-white/10 bg-[#354153] text-white active:bg-[#2a8d8b]"
                      }`}
                    >
                      {dayNumber}
                      {isToday && !selected ? <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-[#9ff3ef]" /> : null}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="inline-flex min-h-12 touch-manipulation items-center justify-center rounded-2xl border border-white/16 bg-[#354153] px-4 text-sm text-white active:bg-white/12"
                >
                  Mégse
                </button>
                <button
                  type="button"
                  disabled={Boolean(min && today < min)}
                  onClick={() => selectDate(today)}
                  className="inline-flex min-h-12 touch-manipulation items-center justify-center rounded-2xl border border-[#9be9e5]/42 bg-[#2a8d8b] px-4 text-sm text-white active:bg-[#237b79] disabled:opacity-35"
                >
                  Mai nap
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export default function AllInShopVacations({ open, actor, locationName, apiBase, onClose }: Props) {
  const base = useMemo(() => normalizeBase(apiBase), [apiBase]);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [overview, setOverview] = useState<VacationOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelBusyId, setCancelBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState<VacationRequestKind>("vacation");
  const [dayFrom, setDayFrom] = useState(todayIso());
  const [dayTo, setDayTo] = useState(todayIso());
  const [hoursOff, setHoursOff] = useState(4);
  const [note, setNote] = useState("");

  async function fetchJson(path: string, init?: RequestInit) {
    const response = await fetch(`${base}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
    return body;
  }

  async function loadOverview(targetYear = year) {
    setLoading(true);
    setError("");
    try {
      const body = await fetchJson(`/admin/vacations/my/requests?year=${encodeURIComponent(String(targetYear))}`);
      setOverview(body as VacationOverview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A szabadságadataid nem tölthetők be.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setYear(currentYear);
    setError("");
    setNotice("");
    setKind("vacation");
    setDayFrom(todayIso());
    setDayTo(todayIso());
    setHoursOff(4);
    setNote("");
    void loadOverview(currentYear);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, open, saving]);

  async function submitRequest() {
    if (!dayFrom || !dayTo) {
      setError("A dátum megadása kötelező.");
      return;
    }
    if (dayTo < dayFrom) {
      setError("A záró dátum nem lehet a kezdő dátum előtt.");
      return;
    }
    if (kind === "short" && (hoursOff < 1 || hoursOff > 12)) {
      setError("Az elkérés 1 és 12 óra között lehet.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = await fetchJson("/admin/vacations/my/requests", {
        method: "POST",
        body: JSON.stringify({
          employeeName: actor,
          kind,
          dayFrom,
          dayTo: kind === "short" ? dayFrom : dayTo,
          hoursOff: kind === "short" ? hoursOff : null,
          note: note.trim() || null,
        }),
      });
      setNotice(body?.duplicate ? "Ez a kérés már elbírálás alatt van." : "A szabadságkérés elküldve a vezetőnek.");
      setNote("");
      await loadOverview(year);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A szabadságkérés elküldése nem sikerült.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelRequest(id: string) {
    setCancelBusyId(id);
    setError("");
    setNotice("");
    try {
      await fetchJson(`/admin/vacations/my/requests/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      setNotice("A még el nem bírált kérés visszavonva.");
      await loadOverview(year);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kérés visszavonása nem sikerült.");
    } finally {
      setCancelBusyId("");
    }
  }

  async function markDecisionsSeen() {
    setError("");
    try {
      await fetchJson("/admin/vacations/my/requests/seen", { method: "POST" });
      await loadOverview(year);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az értesítés lezárása nem sikerült.");
    }
  }

  if (!open || typeof document === "undefined") return null;

  const summary = overview?.summary || {
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    unseen: 0,
    vacationDays: 0,
    shortDays: 0,
    shortHours: 0,
  };
  const unseenItems = (overview?.items || []).filter(
    (item) => ["approved", "rejected"].includes(item.status) && !item.employeeSeenAt,
  );

  return createPortal(
    <div className="fixed inset-0 z-[270] flex items-center justify-center bg-[#101827]/84 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex max-h-[95vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/40 bg-[#303a4c] text-white shadow-[0_38px_120px_rgba(0,0,0,0.58)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#1e4f54] via-[#247b79] to-[#2a8d8b] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/28 bg-white/12 text-white">
              <CalendarDays size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/62">Saját távollétek</p>
              <h2 className="mt-1 truncate text-xl">Szabadságok és elkérések</h2>
              <p className="mt-1 truncate text-xs text-white/68">{actor} • {locationName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-white/22 bg-black/10 px-3 text-xs">
              Év
              <select
                value={year}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setYear(next);
                  void loadOverview(next);
                }}
                className="h-8 rounded-lg border border-white/18 bg-[#24585c] px-2 text-xs text-white outline-none"
              >
                {Array.from({ length: 6 }, (_, index) => currentYear - index).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/22 bg-black/10 text-white hover:bg-white/12"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {unseenItems.length ? (
            <div className="mb-4 rounded-[22px] border border-emerald-200/38 bg-gradient-to-r from-emerald-600/22 to-[#2a8d8b]/22 p-4 shadow-[0_12px_34px_rgba(16,185,129,0.12)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-200/30 bg-emerald-400/14 text-emerald-50"><BellRing size={21} /></span>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-50/65">Új vezetői döntés</p>
                    <h3 className="mt-1 text-lg text-white">{unseenItems.length} szabadságkérésedet elbírálták</h3>
                    <div className="mt-2 space-y-1 text-sm text-white/72">
                      {unseenItems.slice(0, 3).map((item) => (
                        <p key={item.id}>{periodLabel(item)} • <span className={item.status === "approved" ? "text-emerald-100" : "text-rose-100"}>{statusLabel(item.status)}</span>{item.decisionNote ? ` • ${item.decisionNote}` : ""}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => void markDecisionsSeen()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200/35 bg-emerald-500/20 px-4 text-xs text-emerald-50 hover:bg-emerald-500/28"><CheckCircle2 size={16} /> Elolvastam</button>
              </div>
            </div>
          ) : null}

          {error ? <div className="mb-4 rounded-2xl border border-rose-300/35 bg-rose-500/16 px-4 py-3 text-sm text-rose-50">{error}</div> : null}
          {notice ? <div className="mb-4 rounded-2xl border border-emerald-300/30 bg-emerald-500/14 px-4 py-3 text-sm text-emerald-50">{notice}</div> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-amber-200/24 bg-amber-500/10 p-3"><p className="text-[9px] uppercase tracking-[0.11em] text-amber-100/60">Elbírálás alatt</p><p className="mt-2 text-2xl text-white">{summary.pending}</p></div>
            <div className="rounded-2xl border border-emerald-300/24 bg-emerald-500/10 p-3"><p className="text-[9px] uppercase tracking-[0.11em] text-emerald-100/60">Elfogadott kérelmek</p><p className="mt-2 text-2xl text-white">{summary.approved}</p></div>
            <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase tracking-[0.11em] text-[#d7fffd]/60">{year}. évi szabadság</p><p className="mt-2 text-2xl text-[#d7fffd]">{summary.vacationDays} nap</p></div>
            <div className="rounded-2xl border border-sky-200/20 bg-sky-500/9 p-3"><p className="text-[9px] uppercase tracking-[0.11em] text-sky-100/60">Elkérések</p><p className="mt-2 text-2xl text-white">{summary.shortDays} nap</p></div>
            <div className="rounded-2xl border border-violet-200/20 bg-violet-500/9 p-3"><p className="text-[9px] uppercase tracking-[0.11em] text-violet-100/60">Elkért idő</p><p className="mt-2 text-2xl text-white">{summary.shortHours} óra</p></div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-[24px] border border-[#7bd7d4]/22 bg-gradient-to-br from-[#35555d] to-[#374357] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/20 text-[#d7fffd]"><CalendarClock size={21} /></span>
                <h3 className="text-lg">Új igénylés</h3>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setKind("vacation")} className={`min-h-14 touch-manipulation rounded-2xl border px-3 text-base transition active:scale-[0.985] ${kind === "vacation" ? "border-[#9be9e5]/55 bg-[#2a8d8b] text-white" : "border-white/14 bg-[#293548] text-white/72 hover:bg-white/[0.08]"}`}><CalendarDays className="mr-2 inline" size={20} /> Szabadság</button>
                <button type="button" onClick={() => { setKind("short"); setDayTo(dayFrom); }} className={`min-h-14 touch-manipulation rounded-2xl border px-3 text-base transition active:scale-[0.985] ${kind === "short" ? "border-[#9be9e5]/55 bg-[#2a8d8b] text-white" : "border-white/14 bg-[#293548] text-white/72 hover:bg-white/[0.08]"}`}><Clock3 className="mr-2 inline" size={20} /> Órás elkérés</button>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <TouchDateControl
                  label={kind === "short" ? "Nap" : "Kezdő nap"}
                  value={dayFrom}
                  onChange={(value) => {
                    setDayFrom(value);
                    if (kind === "short" || dayTo < value) setDayTo(value);
                  }}
                />
                {kind === "vacation" ? (
                  <TouchDateControl
                    label="Utolsó nap"
                    value={dayTo}
                    min={dayFrom}
                    onChange={setDayTo}
                  />
                ) : (
                  <div className="grid gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-white/48">Óraszám</span>
                    <div className="grid grid-cols-[68px_minmax(0,1fr)_68px] overflow-hidden rounded-2xl border border-white/18 bg-[#273243] shadow-[0_8px_20px_rgba(15,23,42,0.16)]">
                      <button
                        type="button"
                        onClick={() => setHoursOff((current) => Math.max(1, current - 1))}
                        className="inline-flex h-16 touch-manipulation items-center justify-center border-r border-white/12 text-white transition hover:bg-white/[0.08] active:bg-[#2a8d8b]"
                        aria-label="Egy órával kevesebb"
                      >
                        <Minus size={26} />
                      </button>
                      <div className="flex h-16 items-center justify-center gap-2 text-2xl text-white">
                        <span>{hoursOff}</span>
                        <span className="text-sm text-white/55">óra</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHoursOff((current) => Math.min(12, current + 1))}
                        className="inline-flex h-16 touch-manipulation items-center justify-center border-l border-white/12 text-white transition hover:bg-white/[0.08] active:bg-[#2a8d8b]"
                        aria-label="Egy órával több"
                      >
                        <Plus size={26} />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 4, 8].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setHoursOff(value)}
                          className={`h-11 touch-manipulation rounded-xl border text-sm transition active:scale-[0.98] ${hoursOff === value ? "border-[#9be9e5]/55 bg-[#2a8d8b] text-white" : "border-white/14 bg-[#293548] text-white/65 hover:bg-white/[0.08]"}`}
                        >
                          {value} óra
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <label className="mt-4 grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Megjegyzés<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Megjegyzés" className="resize-none rounded-2xl border border-white/16 bg-[#273243] px-4 py-3 text-base normal-case tracking-normal text-white outline-none placeholder:text-white/35 focus:border-[#72d8d4]" /></label>

              <button type="button" disabled={saving} onClick={() => void submitRequest()} className="mt-4 inline-flex min-h-14 w-full touch-manipulation items-center justify-center gap-2 rounded-2xl border border-[#a4efeb]/50 bg-gradient-to-r from-[#2a8d8b] to-[#207572] px-4 text-base text-white shadow-[0_10px_24px_rgba(42,141,139,0.22)] transition hover:brightness-110 active:scale-[0.985] disabled:opacity-55">{saving ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}{saving ? "Küldés…" : "Kérés elküldése"}</button>
            </section>

            <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#d7fffd]"><History size={20} /></span><h3 className="text-lg">Saját előzmények</h3></div>
                <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">{overview?.items.length || 0} kérés</span>
              </div>

              <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {loading ? <div className="flex min-h-[220px] items-center justify-center gap-2 text-white/50"><Loader2 className="animate-spin" size={18} /> Betöltés…</div> : overview?.items.length ? overview.items.map((item) => (
                  <article key={item.id} className={`rounded-2xl border p-3 ${item.status === "pending" ? "border-amber-200/24 bg-amber-500/8" : "border-white/10 bg-[#293548]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[10px] ${statusClass(item.status)}`}>{statusLabel(item.status)}</span><span className="text-[10px] text-white/38">Beküldve: {formatDateTime(item.requestedAt)}</span></div>
                        <p className="mt-2 text-sm text-white">{item.kind === "vacation" ? "Szabadság" : "Órás elkérés"} • {periodLabel(item)}</p>
                        {item.note ? <p className="mt-1.5 text-xs leading-relaxed text-white/55"><MessageSquareText className="mr-1 inline" size={13} />{item.note}</p> : null}
                        {item.decisionNote ? <p className={`mt-2 rounded-xl border px-3 py-2 text-xs ${item.status === "approved" ? "border-emerald-300/18 bg-emerald-500/8 text-emerald-50" : "border-rose-300/18 bg-rose-500/8 text-rose-50"}`}>Vezetői megjegyzés: {item.decisionNote}</p> : null}
                        {item.decidedAt ? <p className="mt-1.5 text-[10px] text-white/38">Döntés: {formatDateTime(item.decidedAt)} • {item.decidedBy || "Vezető"}</p> : null}
                      </div>
                      {item.status === "pending" ? <button type="button" disabled={cancelBusyId === item.id} onClick={() => void cancelRequest(item.id)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-rose-300/35 bg-rose-500/12 px-2.5 text-[11px] text-rose-50 hover:bg-rose-500/20 disabled:opacity-50">{cancelBusyId === item.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} Visszavonás</button> : null}
                    </div>
                  </article>
                )) : <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center text-white/42"><CalendarCheck2 size={32} /><p className="mt-2 text-sm">Nincs még kérés ebben az évben.</p></div>}
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-[24px] border border-white/14 bg-[#374357] p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Hivatalosan rögzített távollétek</p><h3 className="mt-1 text-lg">{year}. évi elfogadott napok</h3></div><span className="rounded-full border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 px-2.5 py-1 text-[10px] text-[#d7fffd]">{overview?.events.length || 0} esemény</span></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {overview?.events.length ? overview.events.slice(0, 24).map((event) => (
                <div key={event.id} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-sm text-white">{formatDate(event.day)}</span>{event.kind === "vacation" ? <CheckCircle2 size={16} className="text-emerald-300" /> : <Clock3 size={16} className="text-sky-300" />}</div>
                  <p className="mt-1 text-xs text-white/52">{event.kind === "vacation" ? "Szabadság" : `${event.hoursOff || 0} óra elkérés`}</p>
                  {event.note ? <p className="mt-2 truncate text-[10px] text-white/38">{event.note}</p> : null}
                </div>
              )) : <div className="col-span-full flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-white/12 text-sm text-white/42">Nincs még elfogadott távollét.</div>}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-end border-t border-white/12 bg-[#293548] px-5 py-4">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.09]"><X size={17} /> Bezárás</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
