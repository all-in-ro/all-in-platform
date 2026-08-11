import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Store,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifShopReservations,
  apiAifShopReturnAuthorizationInbox,
  apiAifShopReturnHistory,
  apiAifShopShiftDayOverview,
  type AifShopExchangeHistoryItem,
  type AifShopReservation,
  type AifShopReturnAuthorizationInboxItem,
  type AifShopShiftDayOverview,
  type AifShopShiftHandover,
} from "../lib/aif/api";

export type AllInAdminShopWorkflowMode = "reservations" | "returns" | "shifts";

type Props = {
  open: boolean;
  initialMode?: AllInAdminShopWorkflowMode;
  actor?: string;
  onClose: () => void;
};

type StoreDef = {
  code: "main_warehouse" | "magazin_targu_secuiesc";
  city: string;
  name: string;
};

type StoreScope = "all" | StoreDef["code"];

const STORES: StoreDef[] = [
  { code: "main_warehouse", city: "Csíkszereda", name: "Magazin - Miercurea Ciuc" },
  { code: "magazin_targu_secuiesc", city: "Kézdivásárhely", name: "Magazin - Târgu Secuiesc" },
];

const panel = "rounded-[22px] border border-white/14 bg-gradient-to-br from-[#39475b] via-[#344154] to-[#303b4d] shadow-[0_14px_34px_rgba(15,23,42,0.18)]";
const smallButton = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45";

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function localIsoDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "Nincs dátum";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatDateTime(value?: string | null) {
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
  const todayIso = localIsoDate(new Date());

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
        className={`group flex h-11 min-w-[172px] items-center justify-between rounded-[13px] border px-3 text-left text-sm font-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none transition ${
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
            zIndex: 980,
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

function reservationDueLevel(expiresOn?: string | null) {
  if (!expiresOn) return { level: "normal" as const, label: "Nincs lejárat" };
  const expiry = String(expiresOn).slice(0, 10);
  const today = localIsoDate(new Date());
  const tomorrow = addDays(today, 1);
  if (expiry < today) return { level: "danger" as const, label: "LEJÁRT" };
  if (expiry === today) return { level: "danger" as const, label: "MA LEJÁR" };
  if (expiry === tomorrow) return { level: "warning" as const, label: "HOLNAP LEJÁR" };
  return { level: "normal" as const, label: formatDate(expiry) };
}

function paymentAmount(handover: AifShopShiftHandover, method: string) {
  const receipts = handover.snapshot?.shift?.receipts || {};
  if (receipts[method]) return numberValue(receipts[method].amount);
  const item = (handover.snapshot?.shift?.payments || []).find((payment) => payment.method === method);
  return numberValue(item?.amount);
}

function storeByCode(code: string) {
  return STORES.find((store) => store.code === code) || STORES[0];
}

export default function AllInAdminShopWorkflows({
  open,
  initialMode = "reservations",
  actor = "ADMIN",
  onClose,
}: Props) {
  const [mode, setMode] = useState<AllInAdminShopWorkflowMode>(initialMode);
  const [scope, setScope] = useState<StoreScope>("all");
  const [date, setDate] = useState(() => localIsoDate(new Date()));
  const [reservations, setReservations] = useState<Array<{ store: StoreDef; item: AifShopReservation }>>([]);
  const [returns, setReturns] = useState<Array<{ store: StoreDef; item: AifShopExchangeHistoryItem }>>([]);
  const [authorizations, setAuthorizations] = useState<Array<{ store: StoreDef; item: AifShopReturnAuthorizationInboxItem }>>([]);
  const [shiftDays, setShiftDays] = useState<Array<{ store: StoreDef; data: AifShopShiftDayOverview }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
  }, [initialMode, open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose, open]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "reservations") {
        const responses = await Promise.all(
          STORES.map(async (store) => ({
            store,
            response: await apiAifShopReservations({ location: store.code, mode: "active" }),
          })),
        );
        setReservations(responses.flatMap(({ store, response }) => (response.items || []).map((item) => ({ store, item }))));
      } else if (mode === "returns") {
        const responses = await Promise.all(
          STORES.map(async (store) => {
            const [history, inbox] = await Promise.all([
              apiAifShopReturnHistory({ location: store.code, limit: 120 }),
              apiAifShopReturnAuthorizationInbox({ location: store.code }),
            ]);
            return { store, history, inbox };
          }),
        );
        setReturns(responses.flatMap(({ store, history }) => (history.items || []).map((item) => ({ store, item }))));
        setAuthorizations(responses.flatMap(({ store, inbox }) => (inbox.items || []).map((item) => ({ store, item }))));
      } else {
        const responses = await Promise.all(
          STORES.map(async (store) => ({
            store,
            data: await apiAifShopShiftDayOverview({ location: store.code, date }),
          })),
        );
        setShiftDays(responses);
      }
    } catch (loadError: any) {
      setError(loadError?.message || "Az üzleti felügyeleti adatok nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [date, mode, open]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  const visibleReservations = useMemo(
    () => reservations.filter(({ store }) => scope === "all" || store.code === scope),
    [reservations, scope],
  );
  const visibleReturns = useMemo(
    () => returns.filter(({ store }) => scope === "all" || store.code === scope),
    [returns, scope],
  );
  const visibleAuthorizations = useMemo(
    () => authorizations.filter(({ store }) => scope === "all" || store.code === scope),
    [authorizations, scope],
  );
  const visibleShiftDays = useMemo(
    () => shiftDays.filter(({ store }) => scope === "all" || store.code === scope),
    [scope, shiftDays],
  );

  const reservationSummary = useMemo(() => {
    let tomorrow = 0;
    let urgent = 0;
    let qty = 0;
    let value = 0;
    visibleReservations.forEach(({ item }) => {
      const due = reservationDueLevel(item.expiresOn);
      if (due.level === "warning") tomorrow += 1;
      if (due.level === "danger") urgent += 1;
      qty += numberValue(item.totalQty);
      value += numberValue(item.totalValue);
    });
    return { tomorrow, urgent, qty, value };
  }, [visibleReservations]);

  const shiftHandovers = useMemo(
    () => visibleShiftDays.flatMap(({ store, data }) => (data.handovers || []).map((item) => ({ store, item }))),
    [visibleShiftDays],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[420] bg-slate-950/82 p-2 backdrop-blur-md sm:p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="mx-auto flex h-full w-full max-w-[1540px] flex-col overflow-hidden rounded-[28px] border border-[#9be9e5]/28 bg-[#303a4c] text-white shadow-[0_34px_120px_rgba(0,0,0,0.64)]">
        <header className="border-b border-white/12 bg-gradient-to-r from-[#263448] via-[#2d3d50] to-[#28565c] px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#8ce7e2]/36 bg-[#2a8d8b]/22 text-[#d7fffd]">
              <Store size={21} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.16em] text-[#cffffd]/58">Vezetői üzletfelügyelet</p>
              <h2 className="mt-1 text-xl text-white sm:text-2xl">Üzletek • működési napló</h2>
              <p className="mt-1 text-xs text-white/46">{actor} • Csíkszereda + Kézdivásárhely</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className={`${smallButton} border-white/16 bg-white/[0.05] hover:bg-white/[0.09]`}
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                <span className="hidden sm:inline">Frissítés</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white hover:bg-white/[0.1]"
                aria-label="Bezárás"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {([
              ["reservations", "Félretett termékek", Bookmark],
              ["returns", "Visszáru", RotateCcw],
              ["shifts", "Műszakátadások", WalletCards],
            ] as Array<[AllInAdminShopWorkflowMode, string, typeof Bookmark]>).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-[11px] transition sm:text-xs ${
                  mode === value
                    ? "border-[#9be9e5]/50 bg-[#2a8d8b] text-white shadow-[0_8px_20px_rgba(42,141,139,0.22)]"
                    : "border-white/14 bg-[#344154] text-white/68 hover:border-[#7bd7d4]/28 hover:text-white"
                }`}
              >
                <Icon size={15} />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(["all", ...STORES.map((store) => store.code)] as StoreScope[]).map((value) => {
                const label = value === "all" ? "Mindkét üzlet" : storeByCode(value).city;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScope(value)}
                    className={`h-9 rounded-xl border px-3 text-[11px] transition ${
                      scope === value
                        ? "border-[#8ce7e2]/45 bg-[#2a8d8b] text-white"
                        : "border-white/12 bg-[#344154] text-white/56 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {mode === "shifts" ? (
              <div className="min-w-[172px]">
                <p className="mb-1 text-[9px] uppercase tracking-[0.1em] text-white/45">Dátum</p>
                <HungarianDatePicker
                  value={date}
                  onChange={setDate}
                  ariaLabel="Műszakátadás dátuma"
                />
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mb-3 rounded-2xl border border-rose-200/28 bg-rose-500/14 px-4 py-3 text-sm text-rose-50">
              {error}
            </div>
          ) : null}

          {mode === "reservations" ? (
            <div className="space-y-3">
              <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ["Aktív félretétel", integer(visibleReservations.length), Bookmark, "normal"],
                  ["Holnap lejár", integer(reservationSummary.tomorrow), Clock3, reservationSummary.tomorrow > 0 ? "warning" : "normal"],
                  ["Ma / lejárt", integer(reservationSummary.urgent), AlertTriangle, reservationSummary.urgent > 0 ? "danger" : "normal"],
                  ["Foglalt darab", `${integer(reservationSummary.qty)} db`, Store, "normal"],
                  ["Foglalt érték", money(reservationSummary.value), CreditCard, "normal"],
                ].map(([label, value, Icon, tone]) => (
                  <article
                    key={String(label)}
                    className={`rounded-2xl border p-3 ${
                      tone === "danger"
                        ? "border-rose-200/28 bg-rose-500/14"
                        : tone === "warning"
                          ? "border-orange-200/32 bg-orange-500/16"
                          : "border-white/12 bg-[#344154]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[9px] uppercase tracking-[0.12em] text-white/45">{String(label)}</p>
                      <Icon size={15} className="text-[#9be9e5]" />
                    </div>
                    <p className="mt-2 text-lg text-white">{String(value)}</p>
                  </article>
                ))}
              </section>

              <section className={`${panel} overflow-hidden`}>
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Aktív foglalások</p>
                  <h3 className="mt-1 text-base text-white">Kliensre félretett termékek</h3>
                </div>
                <div className="divide-y divide-white/8">
                  {visibleReservations
                    .slice()
                    .sort((a, b) => String(a.item.expiresOn || "9999").localeCompare(String(b.item.expiresOn || "9999")))
                    .map(({ store, item }) => {
                      const due = reservationDueLevel(item.expiresOn);
                      return (
                        <article
                          key={`${store.code}-${item.id}`}
                          className={`p-4 ${
                            due.level === "danger"
                              ? "bg-rose-500/[0.08]"
                              : due.level === "warning"
                                ? "bg-orange-500/[0.10]"
                                : ""
                          }`}
                        >
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 px-2 py-1 text-[10px] text-[#cffffd]">{store.city}</span>
                                <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${
                                  due.level === "danger"
                                    ? "border-rose-200/35 bg-rose-500/20 text-rose-50"
                                    : due.level === "warning"
                                      ? "border-orange-200/42 bg-orange-500/24 text-orange-50"
                                      : "border-white/12 bg-white/[0.05] text-white/60"
                                }`}>{due.label}</span>
                                <span className="text-[10px] text-white/38">{item.reservationNumber}</span>
                              </div>
                              <p className="mt-2 text-base text-white">{item.customer.name}</p>
                              <p className="mt-1 text-xs text-white/45">{item.customer.phone || "Nincs telefonszám"} • Félretette: {item.createdBy || "-"} • {formatDateTime(item.createdAt)}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm text-white">{integer(item.totalQty)} db</p>
                              <p className="mt-1 text-xs text-[#cffffd]/78">{money(item.totalValue)}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {(item.lines || []).map((line) => (
                              <div key={line.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/9 bg-[#293548] p-2.5">
                                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white">
                                  {line.imageUrl ? <img src={line.imageUrl} alt={line.title} className="h-full w-full object-contain" /> : <Bookmark size={16} className="text-slate-500" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs text-white">{line.title}</p>
                                  <p className="mt-1 truncate text-[10px] text-white/42">{[line.productCode, line.colorName, line.size].filter(Boolean).join(" • ")}</p>
                                </div>
                                <span className="shrink-0 rounded-lg border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 px-2 py-1 text-[10px] text-[#cffffd]">{integer(line.quantity)} db</span>
                              </div>
                            ))}
                          </div>
                        </article>
                      );
                    })}
                  {!visibleReservations.length ? (
                    <div className="px-4 py-12 text-center text-sm text-white/42">Nincs aktív félretett termék a kiválasztott üzletben.</div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {mode === "returns" ? (
            <div className="space-y-3">
              <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Visszáru / csere", integer(visibleReturns.length), RotateCcw],
                  ["Visszavett érték", money(visibleReturns.reduce((sum, row) => sum + numberValue(row.item.returnCredit), 0)), CreditCard],
                  ["Csereérték", money(visibleReturns.reduce((sum, row) => sum + numberValue(row.item.replacementTotal), 0)), Store],
                  ["Árfeloldás vár", integer(visibleAuthorizations.length), AlertTriangle],
                ].map(([label, value, Icon]) => (
                  <article key={String(label)} className="rounded-2xl border border-white/12 bg-[#344154] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[9px] uppercase tracking-[0.12em] text-white/45">{String(label)}</p>
                      <Icon size={15} className="text-[#9be9e5]" />
                    </div>
                    <p className="mt-2 text-lg text-white">{String(value)}</p>
                  </article>
                ))}
              </section>

              {visibleAuthorizations.length ? (
                <section className={`${panel} overflow-hidden border-orange-200/20`}>
                  <div className="border-b border-orange-200/14 bg-orange-500/[0.08] px-4 py-3">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-orange-100/58">Üzletközi árfeloldás</p>
                    <h3 className="mt-1 text-base text-white">Függő engedélykérések</h3>
                  </div>
                  <div className="grid gap-2 p-3 lg:grid-cols-2">
                    {visibleAuthorizations.map(({ store, item }) => (
                      <article key={`${store.code}-${item.id}`} className="rounded-2xl border border-orange-200/18 bg-orange-500/[0.07] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-white">{item.product.title}</p>
                            <p className="mt-1 text-[10px] text-white/42">{[item.product.productCode, item.product.colorName, item.product.size].filter(Boolean).join(" • ")}</p>
                            <p className="mt-2 text-[10px] text-white/54">{item.requestingLocation.name} kérte • {item.requestedBy || "-"}</p>
                          </div>
                          <div className="shrink-0 text-center">
                            <p className="text-[9px] uppercase tracking-[0.1em] text-orange-100/55">Egyszeri kód</p>
                            <p className="mt-1 rounded-xl border border-orange-200/35 bg-black/15 px-3 py-1.5 text-lg tracking-[0.22em] text-orange-50">{item.code}</p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className={`${panel} overflow-hidden`}>
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Visszáru napló</p>
                  <h3 className="mt-1 text-base text-white">Legutóbbi cserék és visszavételek</h3>
                </div>
                <div className="divide-y divide-white/8">
                  {visibleReturns
                    .slice()
                    .sort((a, b) => new Date(b.item.createdAt || 0).getTime() - new Date(a.item.createdAt || 0).getTime())
                    .map(({ store, item }) => (
                      <article key={`${store.code}-${item.id}`} className="p-4">
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-[10px]">
                              <span className="rounded-full border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 px-2 py-1 text-[#cffffd]">{store.city}</span>
                              <span className="text-white/42">{item.exchangeNumber}</span>
                              <span className="text-white/42">{formatDateTime(item.createdAt)}</span>
                            </div>
                            <p className="mt-2 text-sm text-white">{item.sourceProduct.title}</p>
                            <p className="mt-1 text-[10px] text-white/42">{[item.sourceProduct.productCode, item.sourceProduct.colorName, item.sourceProduct.size].filter(Boolean).join(" • ")}</p>
                            <p className="mt-2 text-[10px] text-white/52">Kliens: {item.customerName || "Nincs megadva"} • Intézte: {item.actor || "-"}</p>
                          </div>
                          <div className="grid min-w-[260px] grid-cols-2 gap-2 text-right text-[10px] sm:grid-cols-4">
                            <div><p className="text-white/38">Visszavett</p><p className="mt-1 text-white">{money(item.returnCredit)}</p></div>
                            <div><p className="text-white/38">Új termék</p><p className="mt-1 text-white">{money(item.replacementTotal)}</p></div>
                            <div><p className="text-white/38">Különbözet</p><p className="mt-1 text-white">{money(item.difference)}</p></div>
                            <div><p className="text-white/38">Rendezés</p><p className="mt-1 text-[#cffffd]">{item.settlementMethod || "-"}</p></div>
                          </div>
                        </div>
                      </article>
                    ))}
                  {!visibleReturns.length ? <div className="px-4 py-12 text-center text-sm text-white/42">Nincs visszáru a kiválasztott nézetben.</div> : null}
                </div>
              </section>
            </div>
          ) : null}

          {mode === "shifts" ? (
            <div className="space-y-3">
              {visibleShiftDays.map(({ store, data }) => (
                <section key={store.code} className={`${panel} overflow-hidden`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">{store.city}</p>
                      <h3 className="mt-1 text-base text-white">Műszakok és kasszaátadások • {formatDate(data.date)}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px]">
                      <span className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-white/56">{integer(data.handovers.length)} átadás</span>
                      <span className="rounded-full border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 px-2.5 py-1 text-[#cffffd]">Napi forgalom: {money(data.totals.revenue)}</span>
                    </div>
                  </div>

                  <div className="divide-y divide-white/8">
                    {(data.handovers || []).map((handover) => {
                      const cash = paymentAmount(handover, "cash");
                      const card = paymentAmount(handover, "card");
                      const bank = paymentAmount(handover, "bank_transfer");
                      const credit = paymentAmount(handover, "credit");
                      const accepted = handover.status === "accepted";
                      const pending = handover.status === "pending";
                      return (
                        <article key={handover.id} className="p-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                                accepted
                                  ? "border-emerald-200/24 bg-emerald-500/12 text-emerald-50"
                                  : pending
                                    ? "border-orange-200/28 bg-orange-500/14 text-orange-50"
                                    : "border-white/12 bg-white/[0.05] text-white/50"
                              }`}>
                                {accepted ? <CheckCircle2 size={18} /> : <WalletCards size={18} />}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm text-white">{handover.fromActor}</p>
                                  <ArrowRight size={14} className="text-[#8ee6e2]" />
                                  <p className="text-sm text-white">{handover.toActor}</p>
                                </div>
                                <p className="mt-1 text-[10px] text-white/42">{formatDateTime(handover.cutoffAt)} • {accepted ? `Átvette: ${handover.acceptedBy || handover.toActor}` : pending ? "Átvételre vár" : handover.status}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Átadandó kassza</p>
                              <p className="mt-1 text-lg text-white">{money(handover.expectedCash)}</p>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                            {[
                              ["Műszak forgalom", money(handover.snapshot?.shift?.revenue)],
                              ["Készpénzes eladás", money(cash)],
                              ["Bankkártya", money(card)],
                              ["Átutalás", money(bank)],
                              ["Utólag fizet", money(credit)],
                              ["Megszámolt kassza", handover.countedCash == null ? "Még nincs" : money(handover.countedCash)],
                              ["Eltérés", handover.cashDifference == null ? "-" : money(handover.cashDifference)],
                            ].map(([label, value]) => (
                              <div key={String(label)} className="rounded-xl border border-white/9 bg-[#293548] px-3 py-2.5">
                                <p className="text-[9px] uppercase tracking-[0.08em] text-white/36">{String(label)}</p>
                                <p className="mt-1 truncate text-xs text-white" title={String(value)}>{String(value)}</p>
                              </div>
                            ))}
                          </div>
                        </article>
                      );
                    })}
                    {!data.handovers.length ? (
                      <div className="px-4 py-10 text-center text-sm text-white/42">Ezen a napon még nincs rögzített műszakátadás.</div>
                    ) : null}
                  </div>
                </section>
              ))}

              {!shiftHandovers.length && !visibleShiftDays.length ? (
                <div className={`${panel} px-4 py-12 text-center text-sm text-white/42`}>Nincs műszakadat.</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="flex justify-end border-t border-white/12 bg-[#293548] px-4 py-3">
          <button type="button" onClick={onClose} className={`${smallButton} border-white/16 bg-white/[0.05] hover:bg-white/[0.1]`}>
            <X size={15} /> Bezárás
          </button>
        </footer>

        {loading ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-slate-950/20 backdrop-blur-[1px]">
            <div className="flex items-center gap-3 rounded-2xl border border-white/16 bg-[#263348] px-5 py-4 shadow-2xl">
              <Loader2 size={20} className="animate-spin text-[#8ee6e2]" />
              <span className="text-sm text-white">Üzleti felügyelet betöltése...</span>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
