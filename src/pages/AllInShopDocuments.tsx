import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  Banknote,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Loader2,
  PackageCheck,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifShopDocumentsOverview,
  apiAifShopProofPdfUrl,
  type AifShopDocumentsOverviewResponse,
} from "../lib/aif/api";

type Props = {
  open: boolean;
  actor: string;
  locationCode: "main_warehouse" | "magazin_targu_secuiesc";
  locationName: string;
  onClose: () => void;
};

type TabKey = "all" | "sales" | "money" | "shifts" | "incoming" | "vacations" | "returns";

const MONTHS = [
  "Január", "Február", "Március", "Április", "Május", "Június",
  "Július", "Augusztus", "Szeptember", "Október", "November", "December",
] as const;
const WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"] as const;

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

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(iso = todayIso()) {
  return `${iso.slice(0, 7)}-01`;
}

function previousMonthRange(iso = todayIso()) {
  const [year, month] = iso.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 2, 1, 12));
  const end = new Date(Date.UTC(year, month - 1, 0, 12));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) return raw;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = ["Vasárnap", "Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat"][date.getUTCDay()];
  return `${weekday} - ${MONTHS[month - 1]} ${day}.`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function calendarCells(month: string) {
  const [year, monthNo] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNo - 1, 1, 12));
  const days = new Date(Date.UTC(year, monthNo, 0, 12)).getUTCDate();
  const offset = first.getUTCDay() === 0 ? 6 : first.getUTCDay() - 1;
  const cells: Array<string | null> = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function DatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(monthKey(value));

  useEffect(() => {
    if (open) setVisibleMonth(monthKey(value));
  }, [open, value]);

  const cells = calendarCells(visibleMonth);
  const [year, monthNo] = visibleMonth.split("-").map(Number);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 min-w-[210px] items-center gap-3 rounded-xl border border-white/16 bg-[#273243] px-3 text-left text-white hover:border-[#7bd7d4]/34"
      >
        <CalendarDays size={17} className="shrink-0 text-[#8ee6e2]" />
        <span className="min-w-0">
          <span className="block text-[9px] uppercase tracking-[0.1em] text-white/40">{label}</span>
          <span className="mt-0.5 block truncate text-[12px]">{formatDate(value)}</span>
        </span>
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[620] grid place-items-center bg-slate-950/84 p-3 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}
        >
          <section className="w-full max-w-[520px] overflow-hidden rounded-[26px] border border-[#9be9e5]/34 bg-[#303a4c] text-white shadow-[0_36px_120px_rgba(0,0,0,0.68)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#1f5f61] to-[#2a8d8b] px-4 py-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/58">{label}</p>
                <h3 className="mt-1 text-lg">{formatDate(value)}</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-black/10"><X size={18} /></button>
            </header>
            <div className="p-4">
              <div className="grid grid-cols-[48px_1fr_48px] items-center gap-2">
                <button type="button" onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))} className="h-12 rounded-xl border border-white/14 bg-[#273243]"><ChevronLeft className="mx-auto" /></button>
                <p className="text-center text-lg">{MONTHS[monthNo - 1]} {year}</p>
                <button type="button" onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))} className="h-12 rounded-xl border border-white/14 bg-[#273243]"><ChevronRight className="mx-auto" /></button>
              </div>
              <div className="mt-3 grid grid-cols-7 gap-1.5 text-center">
                {WEEKDAYS.map((day) => <div key={day} className="py-2 text-[10px] text-white/40">{day}</div>)}
                {cells.map((cell, index) => cell ? (
                  <button
                    key={cell}
                    type="button"
                    onClick={() => { onChange(cell); setOpen(false); }}
                    className={`h-12 rounded-xl border text-sm ${
                      cell === value
                        ? "border-[#b9f5f2]/65 bg-[#2a8d8b] text-white"
                        : cell === todayIso()
                          ? "border-[#7bd7d4]/38 bg-[#2a8d8b]/14 text-[#d7fffd]"
                          : "border-white/10 bg-[#354153] text-white/82 hover:bg-[#405067]"
                    }`}
                  >
                    {Number(cell.slice(-2))}
                  </button>
                ) : <div key={`empty-${index}`} className="h-12" />)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl border border-white/14 bg-[#354153]">Mégse</button>
                <button type="button" onClick={() => { onChange(todayIso()); setOpen(false); }} className="h-11 rounded-xl border border-[#9be9e5]/42 bg-[#2a8d8b]">Mai nap</button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function statusPill(status: string) {
  if (status === "confirmed" || status === "accepted" || status === "approved") {
    return "border-emerald-200/28 bg-emerald-500/12 text-emerald-50";
  }
  if (status === "rejected" || status === "cancelled") {
    return "border-[#ff8691]/48 bg-[#c30d1c] text-white";
  }
  return "border-white/14 bg-white/[0.05] text-white/58";
}

function statusLabel(status: string) {
  if (status === "confirmed") return "Visszaigazolva";
  if (status === "accepted") return "Átvéve";
  if (status === "approved") return "Elfogadva";
  if (status === "rejected") return "Elutasítva";
  if (status === "cancelled") return "Visszavonva";
  if (status === "pending") return "Elbírálás alatt";
  return status || "-";
}

function ProductImage({ src }: { src?: string | null }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white">
      {src ? <img src={src} alt="" className="h-full w-full object-contain" /> : <ShoppingBag size={18} className="text-slate-500" />}
    </span>
  );
}

export default function AllInShopDocuments({ open, actor, locationCode, locationName, onClose }: Props) {
  const today = todayIso();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<AifShopDocumentsOverviewResponse | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(nextFrom = from, nextTo = to) {
    setLoading(true);
    setError("");
    try {
      const result = await apiAifShopDocumentsOverview({
        location: locationCode,
        from: nextFrom,
        to: nextTo,
        employee: actor,
      });
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A bizonylatok nem tölthetők be.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function setRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
    void load(nextFrom, nextTo);
  }

  useEffect(() => {
    if (!open) return;
    setTab("all");
    setFrom(today);
    setTo(today);
    void load(today, today);
  }, [open, locationCode, actor]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, open]);

  const counts = useMemo(() => ({
    all: data?.summary.evidenceCount || 0,
    sales: data?.sales.length || 0,
    money: (data?.cashMovements.length || 0) + (data?.dayClosures.length || 0),
    shifts: data?.shiftHandovers.length || 0,
    incoming: data?.incoming.length || 0,
    vacations: data?.vacations.length || 0,
    returns: data?.exchanges.length || 0,
  }), [data]);

  const maxTrend = Math.max(1, ...(data?.trend || []).map((item) => Math.abs(numberValue(item.revenue))));

  function openPdf(kind: "cash_movement" | "shift_handover" | "day_closure", id: string) {
    const url = apiAifShopProofPdfUrl(kind, id, { location: locationCode, employee: actor });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!open || typeof document === "undefined") return null;

  const summary = data?.summary || {
    revenue: 0, normalRevenue: 0, exchangeNet: 0, transactions: 0, itemsSold: 0,
    discountTotal: 0, evidenceCount: 0, cashHandedOver: 0, incomingQty: 0,
  };

  const tabs: Array<[TabKey, string, typeof Receipt]> = [
    ["all", "Minden", FileText],
    ["sales", "Eladások", Receipt],
    ["money", "Pénzátadások", Banknote],
    ["shifts", "Műszak", ArrowLeftRight],
    ["incoming", "Áruátvétel", PackageCheck],
    ["vacations", "Szabadság", CalendarDays],
    ["returns", "Visszáru", RotateCcw],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0f172a]/88 p-3 backdrop-blur-md sm:p-5">
      <section className="flex max-h-[96vh] w-full max-w-[1540px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_42px_130px_rgba(0,0,0,0.68)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#1e4f54] via-[#247b79] to-[#2a8d8b] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/26 bg-white/12"><FileText size={24} /></span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/62">Saját nyilvántartás és bizonyítékok</p>
              <h2 className="mt-1 text-xl sm:text-2xl">Bizonylatok</h2>
              <p className="mt-1 text-xs text-white/66">{actor} • {locationName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-black/10 px-3 text-xs hover:bg-white/10 disabled:opacity-45">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Frissítés
            </button>
            <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-black/10"><X size={19} /></button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error ? <div className="mb-4 rounded-2xl border border-[#ff8691]/58 bg-[#c30d1c] px-4 py-3 text-sm text-white">{error}</div> : null}

          <section className="rounded-[22px] border border-white/12 bg-[#374357] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setRange(today, today)} className="h-10 rounded-xl border border-[#9be9e5]/35 bg-[#2a8d8b] px-3 text-xs">Ma</button>
              <button type="button" onClick={() => { const day = shiftDate(today, -1); setRange(day, day); }} className="h-10 rounded-xl border border-white/14 bg-[#293548] px-3 text-xs hover:bg-[#354153]">Tegnap</button>
              <button type="button" onClick={() => setRange(monthStart(today), today)} className="h-10 rounded-xl border border-white/14 bg-[#293548] px-3 text-xs hover:bg-[#354153]">Ez a hónap</button>
              <button type="button" onClick={() => { const r = previousMonthRange(today); setRange(r.from, r.to); }} className="h-10 rounded-xl border border-white/14 bg-[#293548] px-3 text-xs hover:bg-[#354153]">Előző hónap</button>
              <button type="button" onClick={() => setRange(shiftDate(today, -6), today)} className="h-10 rounded-xl border border-white/14 bg-[#293548] px-3 text-xs hover:bg-[#354153]">7 nap</button>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <DatePicker label="Ettől" value={from} onChange={(value) => setFrom(value)} />
                <DatePicker label="Eddig" value={to} onChange={(value) => setTo(value)} />
                <button
                  type="button"
                  disabled={loading || from > to}
                  onClick={() => void load(from, to)}
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#9be9e5]/42 bg-[#2a8d8b] px-4 text-sm disabled:opacity-40"
                >
                  <Search size={17} /> Alkalmazás
                </button>
              </div>
            </div>
          </section>

          <section className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-[#9be9e5]/42 bg-[#2a8d8b] p-4 shadow-[0_10px_26px_rgba(42,141,139,0.2)]">
              <p className="text-[9px] uppercase tracking-[0.12em] text-white/65">Saját forgalom</p>
              <p className="mt-2 text-3xl">{money(summary.revenue)}</p>
              <p className="mt-2 text-[10px] text-white/55">Eladás {money(summary.normalRevenue)} • csere {summary.exchangeNet >= 0 ? "+" : ""}{money(summary.exchangeNet)}</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-[#374357] p-4"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Tranzakció</p><p className="mt-2 text-3xl">{summary.transactions}</p></div>
            <div className="rounded-2xl border border-white/12 bg-[#374357] p-4"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Eladott darab</p><p className="mt-2 text-3xl">{summary.itemsSold} db</p></div>
            <div className="rounded-2xl border border-white/12 bg-[#374357] p-4"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Kedvezmény</p><p className="mt-2 text-2xl">{money(summary.discountTotal)}</p></div>
            <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/10 p-4"><p className="text-[9px] uppercase tracking-[0.12em] text-[#d7fffd]/52">Bizonyíték / rekord</p><p className="mt-2 text-3xl text-[#d7fffd]">{summary.evidenceCount}</p><p className="mt-2 text-[10px] text-white/42">Átvett áru: {summary.incomingQty} db</p></div>
          </section>

          {(data?.trend.length || 0) > 1 ? (
            <section className="mt-3 rounded-[22px] border border-white/12 bg-[#344055] p-4">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-[9px] uppercase tracking-[0.12em] text-white/38">Időszak teljesítménye</p><h3 className="mt-1 text-base">Napi forgalom</h3></div>
                <TrendingUp size={19} className="text-[#8ee6e2]" />
              </div>
              <div className="mt-3 flex h-28 items-end gap-1 overflow-x-auto pb-1">
                {(data?.trend || []).map((item) => {
                  const height = Math.max(5, Math.round(Math.abs(item.revenue) / maxTrend * 92));
                  return (
                    <div key={item.date} className="group flex min-w-[24px] flex-1 flex-col items-center justify-end">
                      <div className="relative w-full max-w-[34px] rounded-t-md bg-[#2a8d8b]" style={{ height }}>
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/12 bg-[#202a3a] px-2 py-1 text-[10px] shadow-xl group-hover:block">
                          {formatDate(item.date)} • {money(item.revenue)}
                        </div>
                      </div>
                      <span className="mt-1 text-[8px] text-white/32">{item.date.slice(8, 10)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {tabs.map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs transition ${
                  tab === key
                    ? "border-[#9be9e5]/45 bg-[#2a8d8b] text-white"
                    : "border-white/12 bg-[#344055] text-white/68 hover:border-[#7bd7d4]/28"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2"><Icon size={15} /><span className="truncate">{label}</span></span>
                <span className="rounded-full border border-white/12 bg-black/10 px-1.5 py-0.5 text-[9px]">{counts[key]}</span>
              </button>
            ))}
          </section>

          {loading && !data ? (
            <div className="flex min-h-[360px] items-center justify-center gap-3 text-white/50"><Loader2 className="animate-spin" /> Bizonylatok betöltése…</div>
          ) : (
            <div className="mt-3 space-y-3">
              {(tab === "all" || tab === "money") && (data?.cashMovements.length || data?.dayClosures.length) ? (
                <Section title="Pénzátadások és napi zárások" icon={Banknote}>
                  {(data?.cashMovements || []).map((item) => (
                    <Record key={`cash-${item.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm text-white">{item.type === "bank_deposit" ? "Bankbefizetés" : "Átadás a főnöknek"}</p>
                          <span className={`rounded-full border px-2 py-1 text-[9px] ${statusPill(item.status)}`}>{statusLabel(item.status)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-white/48">{formatDateTime(item.requestedAt)} • {item.requestedBy}{item.confirmedBy ? ` → ${item.confirmedBy}` : ""}</p>
                        <p className="mt-1 text-[10px] text-white/38">{item.reference || "Nincs referencia"}{item.note ? ` • ${item.note}` : ""}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg text-[#d7fffd]">{money(item.amount)}</p>
                        {item.pdfAvailable ? <PdfButton onClick={() => openPdf("cash_movement", item.id)} /> : <span className="mt-2 block text-[9px] text-white/32">PDF visszaigazolás után</span>}
                      </div>
                    </Record>
                  ))}
                  {(data?.dayClosures || []).map((item) => (
                    <Record key={`closure-${item.id}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">Napi kasszazárás • {formatDate(item.date)}</p>
                        <p className="mt-1 text-[11px] text-white/48">{item.actor} • {formatDateTime(item.closedAt)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm text-[#d7fffd]">{money(item.countedCash)}</p>
                        <p className="mt-1 text-[9px] text-white/36">Eltérés {money(item.cashDifference)}</p>
                        <PdfButton onClick={() => openPdf("day_closure", item.id)} />
                      </div>
                    </Record>
                  ))}
                </Section>
              ) : null}

              {(tab === "all" || tab === "shifts") && (data?.shiftHandovers.length || 0) > 0 ? (
                <Section title="Műszakátadások" icon={ArrowLeftRight}>
                  {(data?.shiftHandovers || []).map((item) => (
                    <Record key={`shift-${item.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm">{item.fromActor} → {item.toActor}</p>
                          <span className={`rounded-full border px-2 py-1 text-[9px] ${statusPill(item.status)}`}>{statusLabel(item.status)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-white/48">{formatDate(item.date)} • {formatDateTime(item.cutoffAt)}</p>
                        <p className="mt-1 text-[10px] text-white/38">Átadandó {money(item.expectedCash)} • megszámolva {item.countedCash == null ? "-" : money(item.countedCash)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm">Eltérés {item.cashDifference == null ? "-" : money(item.cashDifference)}</p>
                        {item.pdfAvailable ? <PdfButton onClick={() => openPdf("shift_handover", item.id)} /> : null}
                      </div>
                    </Record>
                  ))}
                </Section>
              ) : null}

              {(tab === "all" || tab === "sales") && (data?.sales.length || 0) > 0 ? (
                <Section title="Eladási bizonylatok" icon={Receipt}>
                  {(data?.sales || []).map((sale) => (
                    <Record key={`sale-${sale.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm">{sale.saleNumber}</p>
                          {sale.customerName ? <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1 text-[9px] text-white/52"><UserRound className="mr-1 inline" size={11} />{sale.customerName}</span> : null}
                        </div>
                        <p className="mt-1 text-[11px] text-white/48">{formatDateTime(sale.soldAt)} • {sale.itemCount} db</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {sale.lines.slice(0, 4).map((line) => (
                            <span key={line.id} className="inline-flex items-center gap-2 rounded-xl border border-white/9 bg-[#263345] px-2 py-1.5">
                              <ProductImage src={line.imageUrl} />
                              <span className="max-w-[220px] truncate text-[10px] text-white/64">{line.title || line.productCode || "Termék"} • {line.quantity} db</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg text-[#d7fffd]">{money(sale.total)}</p>
                        {sale.discountTotal > 0 ? <p className="mt-1 text-[9px] text-white/38">Kedv. {money(sale.discountTotal)}</p> : null}
                      </div>
                    </Record>
                  ))}
                </Section>
              ) : null}

              {(tab === "all" || tab === "returns") && (data?.exchanges.length || 0) > 0 ? (
                <Section title="Visszáru és csere" icon={RotateCcw}>
                  {(data?.exchanges || []).map((item) => (
                    <Record key={`exchange-${item.id}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{item.exchangeNumber}{item.customerName ? ` • ${item.customerName}` : ""}</p>
                        <p className="mt-1 text-[11px] text-white/48">{formatDateTime(item.createdAt)} • visszavett {item.returnedQty} db • kiadott {item.replacementQty} db</p>
                        <p className="mt-1 text-[10px] text-white/38">Visszavett érték {money(item.returnCredit)} • új termék {money(item.replacementTotal)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-lg ${item.difference >= 0 ? "text-[#d7fffd]" : "text-white"}`}>{item.difference >= 0 ? "+" : ""}{money(item.difference)}</p>
                        <p className="mt-1 text-[9px] text-white/36">különbözet</p>
                      </div>
                    </Record>
                  ))}
                </Section>
              ) : null}

              {(tab === "all" || tab === "incoming") && (data?.incoming.length || 0) > 0 ? (
                <Section title="Termékátvételek" icon={PackageCheck}>
                  {(data?.incoming || []).map((item) => (
                    <Record key={`incoming-${item.id}`}>
                      <ProductImage src={item.product.imageUrl} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item.product.title}</p>
                        <p className="mt-1 text-[11px] text-white/48">{item.documentNumber} • {item.sourceName} → {item.targetName}</p>
                        <p className="mt-1 text-[10px] text-white/38">{formatDateTime(item.receivedAt)} • {item.product.productCode || item.product.barcode || "kód nélkül"}</p>
                      </div>
                      <p className="shrink-0 text-lg text-[#d7fffd]">{item.qty} db</p>
                    </Record>
                  ))}
                </Section>
              ) : null}

              {(tab === "all" || tab === "vacations") && (data?.vacations.length || 0) > 0 ? (
                <Section title="Szabadságos és elkérési kérelmek" icon={CalendarDays}>
                  {(data?.vacations || []).map((item) => (
                    <Record key={`vacation-${item.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm">{item.kind === "short" ? "Órás elkérés" : "Szabadság"}</p>
                          <span className={`rounded-full border px-2 py-1 text-[9px] ${statusPill(item.status)}`}>{statusLabel(item.status)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-white/48">{formatDate(item.dayFrom)}{item.dayTo !== item.dayFrom ? ` → ${formatDate(item.dayTo)}` : ""}{item.hoursOff ? ` • ${item.hoursOff} óra` : ""}</p>
                        <p className="mt-1 text-[10px] text-white/38">Beküldve {formatDateTime(item.requestedAt)}{item.decidedBy ? ` • döntött: ${item.decidedBy}` : ""}</p>
                      </div>
                    </Record>
                  ))}
                </Section>
              ) : null}

              {data && counts[tab] === 0 ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/12 bg-[#273243]/35 text-center text-white/42">
                  <History size={34} />
                  <p className="mt-3 text-sm">Ebben az időszakban nincs ilyen saját rekordod.</p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/12 bg-[#293548] px-5 py-4">
          <p className="text-[10px] text-white/38">A PDF pénz- és műszakbizonylatok stabil bizonylatszámot kapnak, újranyomtatáskor ugyanazt.</p>
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm"><X size={17} /> Bezárás</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Receipt; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-white/12 bg-[#374357]">
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#303b4e] px-4 py-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 text-[#bff8f5]"><Icon size={17} /></span>
        <h3 className="text-base">{title}</h3>
      </header>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

function Record({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/9 bg-[#293548] p-3">{children}</div>;
}

function PdfButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#9be9e5]/30 bg-[#2a8d8b]/16 px-3 text-[10px] text-[#d7fffd] hover:bg-[#2a8d8b]/26"
    >
      <Printer size={13} /> PDF
    </button>
  );
}
