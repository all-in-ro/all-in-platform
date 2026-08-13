import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  History,
  Landmark,
  Loader2,
  Trash2,
  ZoomIn,
  RefreshCw,
  RotateCcw,
  Store,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifCancelShopExchange,
  apiAifConfirmShopCashMovement,
  apiAifRejectShopCashMovement,
  apiAifShopCashOverview,
  apiAifShopReservations,
  apiAifReleaseShopReservation,
  apiAifShopReturnAuthorizationInbox,
  apiAifShopReturnHistory,
  apiAifShopShiftDayOverview,
  type AifShopCashOverview,
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
  if (expiry < today) return { level: "overdue" as const, label: "LEJÁRT" };
  if (expiry === today) return { level: "today" as const, label: "MA LEJÁR" };
  if (expiry === tomorrow) return { level: "warning" as const, label: "HOLNAP LEJÁR" };
  return { level: "normal" as const, label: formatDate(expiry) };
}

function reservationDueTone(level: ReturnType<typeof reservationDueLevel>["level"]) {
  if (level === "overdue") {
    return {
      card: "border-orange-300/46 bg-gradient-to-br from-orange-500/[0.16] via-[#3d4450] to-[#313d4f]",
      badge: "border-orange-200/44 bg-orange-500/24 text-orange-50",
      line: "border-orange-200/20 bg-orange-500/[0.075]",
    };
  }
  if (level === "today") {
    return {
      card: "border-orange-200/34 bg-gradient-to-br from-orange-500/[0.11] via-[#3b4657] to-[#313d4f]",
      badge: "border-orange-200/38 bg-orange-500/20 text-orange-50",
      line: "border-orange-200/16 bg-orange-500/[0.06]",
    };
  }
  if (level === "warning") {
    return {
      card: "border-amber-200/24 bg-gradient-to-br from-amber-500/[0.06] via-[#39475b] to-[#313d4f]",
      badge: "border-amber-200/32 bg-amber-500/14 text-amber-50",
      line: "border-white/10 bg-[#293548]",
    };
  }
  return {
    card: "border-white/12 bg-gradient-to-br from-[#39475b] via-[#344154] to-[#303b4d]",
    badge: "border-white/12 bg-white/[0.05] text-white/60",
    line: "border-white/10 bg-[#293548]",
  };
}

function paymentAmount(handover: AifShopShiftHandover, method: string) {
  const receipts = handover.snapshot?.shift?.receipts || {};
  if (receipts[method]) return numberValue(receipts[method].amount);
  const item = (handover.snapshot?.shift?.payments || []).find((payment) => payment.method === method);
  return numberValue(item?.amount);
}

function settlementMethodLabel(value?: string | null) {
  if (value === "cash") return "Készpénz";
  if (value === "card") return "Bankkártya";
  if (value === "bank_transfer") return "Átutalás";
  return value || "Nincs pénzmozgás";
}

function differenceText(item: AifShopExchangeHistoryItem) {
  const value = numberValue(item.difference);
  if (value > 0.005) return `Kliens fizetett még ${money(value)}`;
  if (value < -0.005) return `Kliens visszakapott ${money(Math.abs(value))}`;
  return "Értékazonos csere";
}

function differenceTone(item: AifShopExchangeHistoryItem) {
  const value = numberValue(item.difference);
  if (value > 0.005) return "border-emerald-200/24 bg-emerald-500/10 text-emerald-50";
  if (value < -0.005) return "border-rose-200/24 bg-rose-500/10 text-rose-50";
  return "border-white/12 bg-white/[0.04] text-white/65";
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
  const [cashStores, setCashStores] = useState<Array<{ store: StoreDef; data: AifShopCashOverview }>>([]);
  const [cashActionBusyId, setCashActionBusyId] = useState<string | null>(null);
  const [returnImagePreview, setReturnImagePreview] = useState<{ src: string; title: string } | null>(null);
  const [returnDeleteTarget, setReturnDeleteTarget] = useState<{ store: StoreDef; item: AifShopExchangeHistoryItem } | null>(null);
  const [returnDeleteBusy, setReturnDeleteBusy] = useState(false);
  const [returnDeleteError, setReturnDeleteError] = useState("");
  const [reservationReleaseTarget, setReservationReleaseTarget] = useState<{ store: StoreDef; item: AifShopReservation } | null>(null);
  const [reservationReleaseBusy, setReservationReleaseBusy] = useState(false);
  const [reservationReleaseError, setReservationReleaseError] = useState("");
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
      if (event.key !== "Escape") return;
      if (returnImagePreview) {
        setReturnImagePreview(null);
        return;
      }
      if (reservationReleaseTarget && !reservationReleaseBusy) {
        setReservationReleaseTarget(null);
        setReservationReleaseError("");
        return;
      }
      if (returnDeleteTarget && !returnDeleteBusy) {
        setReturnDeleteTarget(null);
        setReturnDeleteError("");
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose, open, reservationReleaseBusy, reservationReleaseTarget, returnDeleteBusy, returnDeleteTarget, returnImagePreview]);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError("");
    try {
      const reservationResponses = await Promise.all(
        STORES.map(async (store) => ({
          store,
          response: await apiAifShopReservations({ location: store.code, mode: "active" }),
        })),
      );
      setReservations(
        reservationResponses.flatMap(({ store, response }) =>
          (response.items || []).map((item) => ({ store, item })),
        ),
      );

      if (mode === "reservations") {
        // Az aktív foglalások már fent betöltődtek. Így a lejárati jelzés
        // akkor is friss marad, ha az admin másik munkafolyamatot néz.
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
          STORES.map(async (store) => {
            const [data, cash] = await Promise.all([
              apiAifShopShiftDayOverview({ location: store.code, date }),
              apiAifShopCashOverview({ location: store.code, limit: 120 }),
            ]);
            return { store, data, cash };
          }),
        );
        setShiftDays(responses.map(({ store, data }) => ({ store, data })));
        setCashStores(responses.map(({ store, cash }) => ({ store, data: cash })));
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
  const visibleCashStores = useMemo(
    () => cashStores.filter(({ store }) => scope === "all" || store.code === scope),
    [cashStores, scope],
  );
  const pendingBossCash = useMemo(
    () => visibleCashStores.flatMap(({ store, data }) => (data.pendingManagerHandovers || []).map((item) => ({ store, item }))),
    [visibleCashStores],
  );
  const cashHistory = useMemo(
    () => visibleCashStores
      .flatMap(({ store, data }) => (data.movements || []).map((item) => ({ store, item })))
      .sort((a, b) => new Date(b.item.createdAt || b.item.requestedAt || 0).getTime() - new Date(a.item.createdAt || a.item.requestedAt || 0).getTime()),
    [visibleCashStores],
  );

  const reservationSummary = useMemo(() => {
    let tomorrow = 0;
    let today = 0;
    let overdue = 0;
    let qty = 0;
    let value = 0;
    visibleReservations.forEach(({ item }) => {
      const due = reservationDueLevel(item.expiresOn);
      if (due.level === "warning") tomorrow += 1;
      if (due.level === "today") today += 1;
      if (due.level === "overdue") overdue += 1;
      qty += numberValue(item.totalQty);
      value += numberValue(item.totalValue);
    });
    return { tomorrow, today, overdue, urgent: today + overdue, qty, value };
  }, [visibleReservations]);

  const reservationAlertCount = reservationSummary.urgent;

  const shiftHandovers = useMemo(
    () => visibleShiftDays.flatMap(({ store, data }) => (data.handovers || []).map((item) => ({ store, item }))),
    [visibleShiftDays],
  );

  async function confirmBossCash(id: string) {
    setCashActionBusyId(id);
    setError("");
    try {
      await apiAifConfirmShopCashMovement(id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A főnöki pénzátadás visszaigazolása nem sikerült.");
    } finally {
      setCashActionBusyId(null);
    }
  }

  async function rejectBossCash(id: string) {
    setCashActionBusyId(id);
    setError("");
    try {
      await apiAifRejectShopCashMovement(id, "A főnök nem igazolta vissza az átvételt.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A főnöki pénzátadás elutasítása nem sikerült.");
    } finally {
      setCashActionBusyId(null);
    }
  }

  async function releaseReservation() {
    if (!reservationReleaseTarget || reservationReleaseBusy) return;
    setReservationReleaseBusy(true);
    setReservationReleaseError("");
    setError("");
    try {
      await apiAifReleaseShopReservation(reservationReleaseTarget.item.id, {
        location: reservationReleaseTarget.store.code,
        note: `Adminisztrátori feloldás: ${actor}`,
      });
      setReservationReleaseTarget(null);
      await load();
    } catch (caught: any) {
      setReservationReleaseError(String(caught?.message || "A félretétel feloldása nem sikerült."));
    } finally {
      setReservationReleaseBusy(false);
    }
  }

  async function cancelExchange() {
    if (!returnDeleteTarget || returnDeleteBusy) return;
    setReturnDeleteBusy(true);
    setReturnDeleteError("");
    setError("");
    try {
      await apiAifCancelShopExchange(returnDeleteTarget.item.id, {
        location: returnDeleteTarget.store.code,
        note: "Adminisztrátori törlés a visszáru naplóból.",
      });
      setReturnDeleteTarget(null);
      await load();
    } catch (caught: any) {
      const code = String(caught?.code || "");
      const message = code === "exchange_cancel_stock_conflict"
        ? "A csere készlethatása már nem fordítható vissza automatikusan, mert az érintett termékből időközben fogyott vagy foglalás került rá."
        : String(caught?.message || "A csere törlése nem sikerült.");
      setReturnDeleteError(message);
    } finally {
      setReturnDeleteBusy(false);
    }
  }

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
            ] as Array<[AllInAdminShopWorkflowMode, string, typeof Bookmark]>).map(([value, label, Icon]) => {
              const reservationAlert = value === "reservations" && reservationAlertCount > 0;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`relative flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-[11px] transition sm:text-xs ${
                    reservationAlert
                      ? "border-orange-200/55 bg-gradient-to-r from-orange-500/80 to-orange-600/72 text-white shadow-[0_8px_22px_rgba(249,115,22,0.22)] hover:brightness-110"
                      : mode === value
                        ? "border-[#9be9e5]/50 bg-[#2a8d8b] text-white shadow-[0_8px_20px_rgba(42,141,139,0.22)]"
                        : "border-white/14 bg-[#344154] text-white/68 hover:border-[#7bd7d4]/28 hover:text-white"
                  }`}
                >
                  <Icon size={15} />
                  <span className="truncate">{label}</span>
                  {reservationAlert ? (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full border border-white/28 bg-black/12 px-1.5 py-0.5 text-[9px] text-white">
                      {reservationAlertCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
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
                  ["Lejárt", integer(reservationSummary.overdue), AlertTriangle, reservationSummary.overdue > 0 ? "warning" : "normal"],
                  ["Ma / holnap", `${integer(reservationSummary.today)} / ${integer(reservationSummary.tomorrow)}`, Clock3, reservationSummary.today + reservationSummary.tomorrow > 0 ? "warning" : "normal"],
                  ["Foglalt darab", `${integer(reservationSummary.qty)} db`, Store, "normal"],
                  ["Foglalt érték", money(reservationSummary.value), CreditCard, "normal"],
                ].map(([label, value, Icon, tone]) => (
                  <article
                    key={String(label)}
                    className={`rounded-2xl border p-3 ${
                      tone === "warning"
                        ? "border-orange-200/32 bg-gradient-to-br from-orange-500/[0.14] to-[#344154]"
                        : "border-white/12 bg-[#344154]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[9px] uppercase tracking-[0.12em] text-white/45">{String(label)}</p>
                      <Icon size={15} className={tone === "warning" ? "text-orange-100" : "text-[#9be9e5]"} />
                    </div>
                    <p className="mt-2 text-lg text-white">{String(value)}</p>
                  </article>
                ))}
              </section>

              <section className={`${panel} overflow-hidden`}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Aktív foglalások</p>
                    <h3 className="mt-1 text-base text-white">Kliensre félretett termékek</h3>
                  </div>
                  <span className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/52">
                    {visibleReservations.length} foglalás
                  </span>
                </div>

                <div className="grid gap-3 p-3 xl:grid-cols-2">
                  {visibleReservations
                    .slice()
                    .sort((a, b) => String(a.item.expiresOn || "9999").localeCompare(String(b.item.expiresOn || "9999")))
                    .map(({ store, item }) => {
                      const due = reservationDueLevel(item.expiresOn);
                      const dueTone = reservationDueTone(due.level);
                      return (
                        <article
                          key={`${store.code}-${item.id}`}
                          className={`overflow-hidden rounded-[22px] border shadow-[0_10px_26px_rgba(15,23,42,0.16)] ${dueTone.card}`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/9 px-3.5 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 px-2 py-1 text-[9px] text-[#cffffd]">{store.city}</span>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${dueTone.badge}`}>
                                  {due.level === "normal" ? "AKTÍV" : due.label}
                                </span>
                                <span className="truncate text-[9px] text-white/40">{item.reservationNumber}</span>
                              </div>

                              <div className="mt-2.5 flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-[15px] text-white" title={item.customer.name}>{item.customer.name}</p>
                                  <p className="mt-1 truncate text-[11px] text-white/50">
                                    {item.customer.phone || "Nincs telefonszám"}
                                  </p>
                                  <p className="mt-1 truncate text-[10px] text-white/38">
                                    Félretette: {item.createdBy || "-"} • {formatDateTime(item.createdAt)}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-lg text-white">{integer(item.totalQty)} db</p>
                                  <p className="mt-0.5 text-[12px] text-[#d7fffd]">{money(item.totalValue)}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2 p-3">
                            {(item.lines || []).map((line) => {
                              const lineTotal = numberValue(line.unitPrice) * numberValue(line.quantity);
                              return (
                                <div
                                  key={line.id}
                                  className={`grid min-h-[78px] grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-2.5 ${dueTone.line}`}
                                >
                                  <button
                                    type="button"
                                    disabled={!line.imageUrl}
                                    onClick={() => line.imageUrl && setReturnImagePreview({ src: line.imageUrl, title: line.title })}
                                    className="group relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/12 bg-white disabled:cursor-default"
                                    aria-label={line.imageUrl ? `${line.title} képének nagyítása` : undefined}
                                  >
                                    {line.imageUrl
                                      ? <img src={line.imageUrl} alt="" className="h-full w-full object-contain" />
                                      : <Bookmark size={19} className="text-slate-500" />}
                                    {line.imageUrl ? (
                                      <span className="absolute inset-0 grid place-items-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100">
                                        <ZoomIn size={17} />
                                      </span>
                                    ) : null}
                                  </button>

                                  <div className="min-w-0">
                                    <p className="truncate text-[13px] text-white" title={line.title}>{line.title}</p>
                                    <p className="mt-1 truncate text-[10px] text-white/48">
                                      {[line.brandName, line.colorName, line.size].filter(Boolean).join(" • ") || "Nincs variánsadat"}
                                    </p>
                                    <p className="mt-1 truncate font-mono text-[10px] text-[#9be9e5]/70">
                                      {[line.productCode ? `Kód: ${line.productCode}` : "", line.barcode ? `Vonalkód: ${line.barcode}` : ""].filter(Boolean).join(" • ") || "Nincs kód"}
                                    </p>
                                  </div>

                                  <div className="shrink-0 text-right">
                                    <span className="inline-flex min-w-11 justify-center rounded-lg border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 px-2 py-1 text-[11px] text-[#d5fffd]">
                                      {integer(line.quantity)} db
                                    </span>
                                    <p className="mt-1.5 text-[12px] text-white">{money(lineTotal)}</p>
                                    <p className="mt-0.5 text-[9px] text-white/38">{money(line.unitPrice)} / db</p>
                                  </div>
                                </div>
                              );
                            })}

                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/9 bg-black/[0.06] px-3 py-3">
                            <div className={`flex min-w-[240px] flex-1 items-center gap-3 rounded-xl border px-3 py-2.5 ${
                              due.level === "overdue" || due.level === "today"
                                ? "border-orange-200/28 bg-orange-500/10"
                                : due.level === "warning"
                                  ? "border-amber-200/20 bg-amber-500/[0.06]"
                                  : "border-white/9 bg-white/[0.025]"
                            }`}>
                              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                                due.level === "overdue" || due.level === "today"
                                  ? "border-orange-200/30 bg-orange-500/14 text-orange-100"
                                  : "border-[#7bd7d4]/20 bg-[#2a8d8b]/10 text-[#bff8f5]"
                              }`}>
                                <CalendarDays size={16} />
                              </span>
                              <div className="min-w-0">
                                <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Lejárati dátum</p>
                                <p className={`mt-0.5 truncate text-[15px] font-medium ${
                                  due.level === "overdue" || due.level === "today" ? "text-orange-50" : "text-white"
                                }`}>
                                  {item.expiresOn ? formatDate(item.expiresOn) : "Nincs megadva"}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setReservationReleaseError("");
                                setReservationReleaseTarget({ store, item });
                              }}
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-200/34 bg-orange-500/16 px-4 text-[12px] text-orange-50 transition hover:bg-orange-500/26 active:scale-[0.98]"
                            >
                              <RotateCcw size={15} /> Vissza a készletre
                            </button>
                          </div>
                        </article>
                      );
                    })}

                  {!visibleReservations.length ? (
                    <div className="xl:col-span-2 px-4 py-12 text-center text-sm text-white/42">
                      Nincs aktív félretett termék a kiválasztott üzletben.
                    </div>
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
                          <div className="flex min-w-0 items-start gap-3">
                            <button
                              type="button"
                              disabled={!item.product.imageUrl}
                              onClick={() => item.product.imageUrl && setReturnImagePreview({ src: item.product.imageUrl, title: item.product.title })}
                              className="group relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/12 bg-white disabled:cursor-default"
                            >
                              {item.product.imageUrl ? <img src={item.product.imageUrl} alt="" className="h-full w-full object-contain" /> : <Store size={18} className="text-slate-500" />}
                              {item.product.imageUrl ? <span className="absolute inset-0 grid place-items-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100"><ZoomIn size={17} /></span> : null}
                            </button>
                            <div className="min-w-0">
                              <p className="truncate text-sm text-white" title={item.product.title}>{item.product.title}</p>
                              <p className="mt-1 truncate text-[10px] text-white/42">{[item.product.productCode, item.product.colorName, item.product.size].filter(Boolean).join(" • ")}</p>
                              <p className="mt-2 text-[10px] text-white/54">{item.requestingLocation.name} kérte • {item.requestedBy || "-"}</p>
                            </div>
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
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Visszáru napló</p>
                    <h3 className="mt-1 text-base text-white">Legutóbbi cserék és visszavételek</h3>
                  </div>
                  <span className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/50">{visibleReturns.length} tétel</span>
                </div>

                <div className="space-y-2.5 p-3">
                  {visibleReturns
                    .slice()
                    .sort((a, b) => new Date(b.item.createdAt || 0).getTime() - new Date(a.item.createdAt || 0).getTime())
                    .map(({ store, item }) => {
                      const replacements = item.replacementLines || [];
                      return (
                        <article key={`${store.code}-${item.id}`} className="overflow-hidden rounded-[20px] border border-white/11 bg-[#2b3749] shadow-[0_10px_26px_rgba(15,23,42,0.14)]">
                          <div className="flex flex-wrap items-center gap-2 border-b border-white/8 bg-[#303d50] px-3 py-2.5">
                            <span className="rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 px-2 py-1 text-[10px] text-[#d7fffd]">{store.city}</span>
                            <span className="text-[11px] text-white/78">{item.exchangeNumber}</span>
                            <span className="text-[10px] text-white/40">{formatDateTime(item.createdAt)}</span>
                            <span className="ml-auto text-[10px] text-white/45">Intézte: <span className="text-white/76">{item.actor || "-"}</span></span>
                          </div>

                          <div className="grid gap-2.5 p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_330px]">
                            <div className="rounded-2xl border border-rose-200/14 bg-rose-500/[0.055] p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-[9px] uppercase tracking-[0.12em] text-rose-100/55">Visszahozott termék</p>
                                <span className="rounded-lg border border-rose-200/18 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-50">{integer(item.returnedQty)} db</span>
                              </div>
                              <div className="flex min-w-0 items-center gap-3">
                                <button
                                  type="button"
                                  disabled={!item.sourceProduct.imageUrl}
                                  onClick={() => item.sourceProduct.imageUrl && setReturnImagePreview({ src: item.sourceProduct.imageUrl, title: item.sourceProduct.title })}
                                  className="group relative grid h-[70px] w-[70px] shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/12 bg-white disabled:cursor-default"
                                  title={item.sourceProduct.imageUrl ? "Kép nagyítása" : "Nincs kép"}
                                >
                                  {item.sourceProduct.imageUrl ? <img src={item.sourceProduct.imageUrl} alt="" className="h-full w-full object-contain" /> : <RotateCcw size={21} className="text-slate-500" />}
                                  {item.sourceProduct.imageUrl ? <span className="absolute inset-0 grid place-items-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/38 group-hover:opacity-100"><ZoomIn size={18} /></span> : null}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-white" title={item.sourceProduct.title}>{item.sourceProduct.title}</p>
                                  <p className="mt-1 truncate text-[10px] text-white/46">{[item.sourceProduct.brandName, item.sourceProduct.colorName, item.sourceProduct.size].filter(Boolean).join(" • ") || "Nincs további adat"}</p>
                                  <p className="mt-1 truncate text-[10px] text-[#9be9e5]/64">{[item.sourceProduct.productCode ? `Kód: ${item.sourceProduct.productCode}` : "", item.sourceProduct.barcode ? `Vonalkód: ${item.sourceProduct.barcode}` : ""].filter(Boolean).join(" • ")}</p>
                                  <p className="mt-2 text-base text-rose-50">{money(item.returnCredit)}</p>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-emerald-200/14 bg-emerald-500/[0.045] p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-[9px] uppercase tracking-[0.12em] text-emerald-100/55">Kiadott csere-termékek</p>
                                <span className="rounded-lg border border-emerald-200/18 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-50">{integer(replacements.reduce((sum, line) => sum + numberValue(line.quantity), 0))} db</span>
                              </div>
                              <div className="space-y-2">
                                {replacements.map((line) => (
                                  <div key={line.id || `${item.id}-${line.lineNo}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/8 bg-black/[0.08] p-2">
                                    <button
                                      type="button"
                                      disabled={!line.imageUrl}
                                      onClick={() => line.imageUrl && setReturnImagePreview({ src: line.imageUrl, title: line.title })}
                                      className="group relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white disabled:cursor-default"
                                      title={line.imageUrl ? "Kép nagyítása" : "Nincs kép"}
                                    >
                                      {line.imageUrl ? <img src={line.imageUrl} alt="" className="h-full w-full object-contain" /> : <Store size={17} className="text-slate-500" />}
                                      {line.imageUrl ? <span className="absolute inset-0 grid place-items-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/38 group-hover:opacity-100"><ZoomIn size={16} /></span> : null}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs text-white" title={line.title}>{line.title}</p>
                                      <p className="mt-1 truncate text-[10px] text-white/42">{[line.brandName, line.colorName, line.size].filter(Boolean).join(" • ") || "Nincs további adat"}</p>
                                      <p className="mt-1 truncate text-[10px] text-[#9be9e5]/60">{line.productCode ? `Kód: ${line.productCode}` : line.barcode ? `Vonalkód: ${line.barcode}` : ""}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <p className="text-[10px] text-white/42">{integer(line.quantity)} db × {money(line.unitPrice)}</p>
                                      <p className="mt-1 text-sm text-emerald-50">{money(line.lineTotal)}</p>
                                    </div>
                                  </div>
                                ))}
                                {!replacements.length ? (
                                  <div className="rounded-xl border border-dashed border-white/12 px-3 py-5 text-center text-xs text-white/42">Nincs kiadott csere-termék, ez tiszta visszavétel.</div>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex min-w-0 flex-col gap-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl border border-white/9 bg-[#334154] p-2.5">
                                  <p className="text-[9px] uppercase tracking-[0.08em] text-white/38">Visszavett</p>
                                  <p className="mt-1 text-sm text-white">{money(item.returnCredit)}</p>
                                </div>
                                <div className="rounded-xl border border-white/9 bg-[#334154] p-2.5">
                                  <p className="text-[9px] uppercase tracking-[0.08em] text-white/38">Új termékek</p>
                                  <p className="mt-1 text-sm text-white">{money(item.replacementTotal)}</p>
                                </div>
                                <div className={`col-span-2 rounded-xl border p-2.5 ${differenceTone(item)}`}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-[9px] uppercase tracking-[0.08em] opacity-65">Különbözet</p>
                                      <p className="mt-1 text-base">{money(item.difference)}</p>
                                    </div>
                                    <p className="max-w-[150px] text-right text-[10px] leading-relaxed opacity-75">{differenceText(item)}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-white/9 bg-[#334154] px-3 py-2.5 text-[10px]">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-white/42">Rendezés</span>
                                  <span className="text-[#d7fffd]">{settlementMethodLabel(item.settlementMethod)}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/7 pt-2">
                                  <span className="text-white/42">Kliens</span>
                                  <span className="max-w-[185px] truncate text-white/74" title={item.customerName || "Nincs megadva"}>{item.customerName || "Nincs megadva"}</span>
                                </div>
                              </div>

                              {item.note ? <p className="rounded-xl border border-white/8 bg-black/[0.06] px-3 py-2 text-[10px] leading-relaxed text-white/48">{item.note}</p> : null}

                              <button
                                type="button"
                                onClick={() => {
                                  setReturnDeleteError("");
                                  setReturnDeleteTarget({ store, item });
                                }}
                                className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-300/38 bg-rose-600 px-3 text-xs text-white transition hover:bg-rose-500 active:scale-[0.98]"
                              >
                                <Trash2 size={15} /> Csere törlése
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  {!visibleReturns.length ? <div className="px-4 py-12 text-center text-sm text-white/42">Nincs visszáru a kiválasztott nézetben.</div> : null}
                </div>
              </section>
            </div>
          ) : null}

          {mode === "shifts" ? (
            <div className="space-y-3">
              <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {visibleCashStores.map(({ store, data }) => (
                  <article key={`cash-${store.code}`} className="rounded-2xl border border-[#9be9e5]/20 bg-[#344154] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">{store.city} • kassza</p>
                        <p className="mt-2 text-2xl text-[#d7fffd]">{money(data.balance.availableCash)}</p>
                      </div>
                      <Banknote size={20} className="text-[#8ee6e2]" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-white/48">
                        utolsó zárás: {data.closures?.[0]?.date || "nincs"}
                      </span>
                      {data.pendingManagerHandovers?.length ? (
                        <span className="rounded-full border border-orange-200/28 bg-orange-500/12 px-2 py-1 text-orange-50">
                          {data.pendingManagerHandovers.length} főnöki átvétel vár
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </section>

              {pendingBossCash.length ? (
                <section className={`${panel} overflow-hidden border-orange-200/22`}>
                  <div className="flex items-center justify-between gap-3 border-b border-orange-200/14 bg-orange-500/[0.08] px-4 py-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-orange-100/58">Főnöki visszaigazolás</p>
                      <h3 className="mt-1 text-base text-white">Pénzátadások, amelyek rád várnak</h3>
                    </div>
                    <span className="rounded-full border border-orange-200/28 bg-orange-500/14 px-2.5 py-1 text-[10px] text-orange-50">{pendingBossCash.length} tétel</span>
                  </div>
                  <div className="grid gap-2 p-3 lg:grid-cols-2">
                    {pendingBossCash.map(({ store, item }) => (
                      <article key={item.id} className="rounded-2xl border border-orange-200/18 bg-orange-500/[0.07] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.11em] text-orange-100/52">{store.city}</p>
                            <p className="mt-1 text-sm text-white">{item.requestedBy} • átadás a főnöknek</p>
                            <p className="mt-1 text-[10px] text-white/42">{formatDateTime(item.requestedAt)}{item.reference ? ` • ${item.reference}` : ""}</p>
                            {item.note ? <p className="mt-2 text-[11px] leading-relaxed text-white/54">{item.note}</p> : null}
                          </div>
                          <p className="shrink-0 text-xl text-orange-50">{money(item.amount)}</p>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={cashActionBusyId === item.id}
                            onClick={() => void rejectBossCash(item.id)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200/28 bg-rose-500/12 px-3 text-xs text-rose-50 hover:bg-rose-500/18 disabled:opacity-45"
                          >
                            <X size={14} /> Nem vettem át
                          </button>
                          <button
                            type="button"
                            disabled={cashActionBusyId === item.id}
                            onClick={() => void confirmBossCash(item.id)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200/28 bg-emerald-500/16 px-3 text-xs text-emerald-50 hover:bg-emerald-500/22 disabled:opacity-45"
                          >
                            {cashActionBusyId === item.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            Átvettem
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

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
                      {data.dayClosure ? (
                        <span className="rounded-full border border-emerald-200/28 bg-emerald-500/12 px-2.5 py-1 text-emerald-50">
                          Nap lezárva • {data.dayClosure.actor} • {money(data.dayClosure.countedCash)}
                        </span>
                      ) : null}
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

              <section className={`${panel} overflow-hidden`}>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Kassza auditnapló</p>
                    <h3 className="mt-1 text-base text-white">Főnöki átvételek és bankbefizetések</h3>
                  </div>
                  <History size={19} className="text-[#8ee6e2]" />
                </div>
                <div className="divide-y divide-white/8">
                  {cashHistory.slice(0, 80).map(({ store, item }) => (
                    <article key={`${store.code}-${item.id}`} className="p-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                          item.type === "bank_deposit"
                            ? "border-[#9be9e5]/24 bg-[#2a8d8b]/12 text-[#d7fffd]"
                            : item.status === "pending"
                              ? "border-orange-200/28 bg-orange-500/12 text-orange-50"
                              : "border-emerald-200/22 bg-emerald-500/10 text-emerald-50"
                        }`}>
                          {item.type === "bank_deposit" ? <Landmark size={18} /> : <Banknote size={18} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 px-2 py-1 text-[10px] text-[#cffffd]">{store.city}</span>
                            <p className="text-sm text-white">{item.type === "bank_deposit" ? "Bankbefizetés" : "Átadás a főnöknek"}</p>
                            <span className={`rounded-full border px-2 py-1 text-[9px] ${
                              item.status === "confirmed"
                                ? "border-emerald-200/24 bg-emerald-500/10 text-emerald-50"
                                : item.status === "pending"
                                  ? "border-orange-200/28 bg-orange-500/12 text-orange-50"
                                  : item.status === "rejected"
                                    ? "border-rose-200/24 bg-rose-500/10 text-rose-50"
                                    : "border-white/12 bg-white/[0.04] text-white/48"
                            }`}>
                              {item.status === "confirmed" ? "Igazolva" : item.status === "pending" ? "Várakozik" : item.status === "rejected" ? "Elutasítva" : item.status}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] text-white/44">
                            Rögzítette: {item.requestedBy} • {formatDateTime(item.requestedAt)}
                            {item.confirmedBy ? ` • Visszaigazolta: ${item.confirmedBy}` : ""}
                          </p>
                          {item.reference ? <p className="mt-1 text-[10px] text-[#bdf8f5]/64">Referencia: {item.reference}</p> : null}
                          {item.note ? <p className="mt-1 text-[10px] text-white/46">{item.note}</p> : null}
                        </div>
                        <p className="shrink-0 text-lg text-white">{money(item.amount)}</p>
                      </div>
                    </article>
                  ))}
                  {!cashHistory.length ? (
                    <div className="px-4 py-10 text-center text-sm text-white/42">Még nincs főnöki készpénzátadás vagy bankbefizetés.</div>
                  ) : null}
                </div>
              </section>

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

        {reservationReleaseTarget ? (
          <div
            className="fixed inset-0 z-[555] grid place-items-center bg-slate-950/88 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target && !reservationReleaseBusy) {
                setReservationReleaseTarget(null);
                setReservationReleaseError("");
              }
            }}
          >
            <section className="w-full max-w-[680px] overflow-hidden rounded-[26px] border border-orange-200/24 bg-[#303a4c] shadow-[0_34px_110px_rgba(0,0,0,0.66)]">
              <header className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#5a4228] to-[#303a4c] px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-orange-100/62">Művelet megerősítése</p>
                  <h3 className="mt-1 text-lg text-white">Biztosan visszateszed a készletre?</h3>
                  <p className="mt-1 truncate text-xs text-white/48">
                    {reservationReleaseTarget.item.customer.name} • {reservationReleaseTarget.store.city} • {reservationReleaseTarget.item.reservationNumber}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={reservationReleaseBusy}
                  onClick={() => {
                    setReservationReleaseTarget(null);
                    setReservationReleaseError("");
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] text-white disabled:opacity-45"
                  aria-label="Bezárás"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="space-y-3 p-5">
                <div className="rounded-2xl border border-orange-200/22 bg-orange-500/10 px-4 py-3 text-sm leading-relaxed text-orange-50/88">
                  A félretétel megszűnik, és a foglalt mennyiség újra elérhető készlet lesz az üzletben. Fizikai készletet nem duplázunk: a rendszer a foglalást oldja fel.
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-[#293548] p-3">
                    <p className="text-[9px] uppercase text-white/38">Termék</p>
                    <p className="mt-1 text-sm text-white">{reservationReleaseTarget.item.lines.length} sor</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#293548] p-3">
                    <p className="text-[9px] uppercase text-white/38">Foglalt darab</p>
                    <p className="mt-1 text-sm text-white">{integer(reservationReleaseTarget.item.totalQty)} db</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#293548] p-3">
                    <p className="text-[9px] uppercase text-white/38">Foglalt érték</p>
                    <p className="mt-1 text-sm text-white">{money(reservationReleaseTarget.item.totalValue)}</p>
                  </div>
                </div>

                <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
                  {reservationReleaseTarget.item.lines.map((line) => (
                    <div key={line.id} className="flex items-center gap-3 rounded-xl border border-white/9 bg-[#293548] p-2.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white">
                        {line.imageUrl
                          ? <img src={line.imageUrl} alt="" className="h-full w-full object-contain" />
                          : <Bookmark size={15} className="text-slate-500" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-white">{line.title}</p>
                        <p className="mt-1 truncate text-[10px] text-white/42">{[line.productCode, line.colorName, line.size].filter(Boolean).join(" • ")}</p>
                      </div>
                      <span className="shrink-0 rounded-lg border border-orange-200/22 bg-orange-500/10 px-2 py-1 text-[10px] text-orange-50">
                        {integer(line.quantity)} db
                      </span>
                    </div>
                  ))}
                </div>

                {reservationReleaseError ? (
                  <div className="rounded-xl border border-rose-300/34 bg-rose-600/16 px-3 py-3 text-sm leading-relaxed text-rose-50">
                    {reservationReleaseError}
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={reservationReleaseBusy}
                    onClick={() => {
                      setReservationReleaseTarget(null);
                      setReservationReleaseError("");
                    }}
                    className="h-11 rounded-xl border border-white/14 bg-white/[0.05] text-sm text-white hover:bg-white/[0.1] disabled:opacity-45"
                  >
                    Mégse
                  </button>
                  <button
                    type="button"
                    disabled={reservationReleaseBusy}
                    onClick={() => void releaseReservation()}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-orange-200/38 bg-orange-500 text-sm text-white hover:bg-orange-400 disabled:opacity-50"
                  >
                    {reservationReleaseBusy ? <Loader2 size={17} className="animate-spin" /> : <RotateCcw size={17} />}
                    Igen, vissza a készletre
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {returnImagePreview ? (
          <div
            className="fixed inset-0 z-[560] grid place-items-center bg-slate-950/92 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setReturnImagePreview(null);
            }}
          >
            <button
              type="button"
              onClick={() => setReturnImagePreview(null)}
              className="absolute right-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/18 bg-white/[0.08] text-white hover:bg-white/[0.14]"
              aria-label="Kép bezárása"
            >
              <X size={20} />
            </button>
            <div className="w-full max-w-[720px]">
              <div className="grid max-h-[78vh] min-h-[300px] place-items-center overflow-hidden rounded-[26px] border border-white/16 bg-white p-4 shadow-[0_34px_110px_rgba(0,0,0,0.65)]">
                <img src={returnImagePreview.src} alt={returnImagePreview.title} className="max-h-[73vh] max-w-full object-contain" />
              </div>
              <p className="mt-3 truncate text-center text-sm text-white/72">{returnImagePreview.title}</p>
            </div>
          </div>
        ) : null}

        {returnDeleteTarget ? (
          <div
            className="fixed inset-0 z-[570] grid place-items-center bg-slate-950/88 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target && !returnDeleteBusy) {
                setReturnDeleteTarget(null);
                setReturnDeleteError("");
              }
            }}
          >
            <section className="w-full max-w-[640px] overflow-hidden rounded-[26px] border border-rose-200/24 bg-[#303a4c] shadow-[0_34px_110px_rgba(0,0,0,0.66)]">
              <header className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#552d38] to-[#303a4c] px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.14em] text-rose-100/58">Csere törlése</p>
                  <h3 className="mt-1 truncate text-lg text-white">{returnDeleteTarget.item.exchangeNumber}</h3>
                  <p className="mt-1 text-xs text-white/48">{returnDeleteTarget.store.city} • {formatDateTime(returnDeleteTarget.item.createdAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={returnDeleteBusy}
                  onClick={() => {
                    setReturnDeleteTarget(null);
                    setReturnDeleteError("");
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] text-white disabled:opacity-45"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="space-y-3 p-5">
                <div className="rounded-2xl border border-amber-200/22 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-50/88">
                  A rendszer visszafordítja a csere készlethatását, a pénzügyi kimutatásokból kiveszi a cserét, és auditként megtartja, hogy admin törölte. Ha az érintett készletből azóta fogyott vagy foglalás került rá, a törlés biztonsági okból leáll.
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/10 bg-[#293548] p-3">
                    <p className="text-[9px] uppercase text-white/38">Visszavett</p>
                    <p className="mt-1 text-sm text-white">{money(returnDeleteTarget.item.returnCredit)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#293548] p-3">
                    <p className="text-[9px] uppercase text-white/38">Csereérték</p>
                    <p className="mt-1 text-sm text-white">{money(returnDeleteTarget.item.replacementTotal)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#293548] p-3">
                    <p className="text-[9px] uppercase text-white/38">Különbözet</p>
                    <p className="mt-1 text-sm text-white">{money(returnDeleteTarget.item.difference)}</p>
                  </div>
                </div>

                {returnDeleteError ? (
                  <div className="rounded-xl border border-rose-300/34 bg-rose-600/16 px-3 py-3 text-sm leading-relaxed text-rose-50">
                    {returnDeleteError}
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={returnDeleteBusy}
                    onClick={() => {
                      setReturnDeleteTarget(null);
                      setReturnDeleteError("");
                    }}
                    className="h-11 rounded-xl border border-white/14 bg-white/[0.05] text-sm text-white hover:bg-white/[0.1] disabled:opacity-45"
                  >
                    Mégse
                  </button>
                  <button
                    type="button"
                    disabled={returnDeleteBusy}
                    onClick={() => void cancelExchange()}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-300/42 bg-rose-600 text-sm text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    {returnDeleteBusy ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                    Törlés és visszafordítás
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

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
