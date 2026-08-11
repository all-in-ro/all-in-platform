import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Clock3,
  CreditCard,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
} from "lucide-react";
import {
  apiAifAcceptShopShiftHandover,
  apiAifShopShiftPending,
  type AifShopShiftHandover,
  type AifShopShiftSnapshot,
} from "../lib/aif/api";

type Props = {
  actor: string;
  locationCode: "main_warehouse" | "magazin_targu_secuiesc";
  locationName: string;
};

const PAYMENT_META = [
  { method: "cash", label: "Készpénz", icon: Banknote },
  { method: "card", label: "Bankkártya", icon: CreditCard },
  { method: "bank_transfer", label: "Átutalás", icon: Landmark },
  { method: "credit", label: "Utólag fizet", icon: WalletCards },
] as const;

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: unknown) {
  return `${numberValue(value).toLocaleString("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} RON`;
}

function formatTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleTimeString("hu-HU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  });
}

function payment(snapshot: AifShopShiftSnapshot | null | undefined, method: string) {
  return (snapshot?.payments || []).find((item) => item.method === method) || {
    method,
    label: method,
    amount: 0,
    salesAmount: 0,
    customerPaymentAmount: 0,
    transactions: 0,
    customerPaymentTransactions: 0,
  };
}

function parseCash(value: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default function AllInShiftHandoverInbox({ actor, locationCode, locationName }: Props) {
  const [incoming, setIncoming] = useState<AifShopShiftHandover | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  const countedValue = useMemo(() => parseCash(countedCash), [countedCash]);
  const expectedCash = numberValue(incoming?.expectedCash);
  const difference = countedValue === null ? null : Math.round((countedValue - expectedCash + Number.EPSILON) * 100) / 100;
  const cashMatches = countedValue !== null && difference !== null && Math.abs(difference) < 0.01;
  const shiftSnapshot = incoming?.snapshot?.shift || null;
  const daySnapshot = incoming?.snapshot?.day || null;

  async function loadPending(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await apiAifShopShiftPending({ location: locationCode });
      setIncoming(response.incoming || null);
      if (!response.incoming) {
        setCountedCash("");
        setNote("");
        setError("");
      }
    } catch (caught) {
      if (!silent) setError(caught instanceof Error ? caught.message : "A műszakátadás nem tölthető be.");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }

  async function acceptHandover() {
    if (!incoming || countedValue === null || !cashMatches) return;
    setAccepting(true);
    setError("");
    try {
      await apiAifAcceptShopShiftHandover(incoming.id, {
        countedCash: countedValue,
        note: note.trim() || null,
      });
      window.dispatchEvent(new CustomEvent("allin:shift-handover-changed", { detail: { locationCode } }));
      setAccepted(true);
      window.setTimeout(() => {
        setIncoming(null);
        setCountedCash("");
        setNote("");
        setAccepted(false);
      }, 1100);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kassza átvétele nem sikerült.");
    } finally {
      setAccepting(false);
    }
  }

  useEffect(() => {
    setAccepted(false);
    setCountedCash("");
    setNote("");
    setError("");
    void loadPending(false);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !accepting) void loadPending(true);
    }, 15000);
    return () => window.clearInterval(timer);
    // Az actor/location váltása új üzleti munkamenetet jelent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, locationCode]);

  if (loading || !incoming || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[520] flex items-center justify-center bg-[#0b1220]/90 p-3 backdrop-blur-md sm:p-5">
      <section className="flex max-h-[95vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/48 bg-[#303a4c] text-white shadow-[0_42px_130px_rgba(0,0,0,0.66)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#1d4a50] via-[#247b79] to-[#2a8d8b] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/28 bg-white/12"><ArrowRightLeft size={24} /></span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.17em] text-white/65">Műszakátadás vár rád</p>
              <h2 className="mt-1 text-xl sm:text-2xl">{incoming.fromActor} <ArrowRight className="mx-1 inline" size={18} /> {incoming.toActor}</h2>
              <p className="mt-1 text-xs text-white/66">{locationName} • lezárva {formatTime(incoming.cutoffAt)}-kor</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadPending(true)}
            disabled={refreshing || accepting}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-black/10 px-3 text-xs text-white hover:bg-white/12 disabled:opacity-45"
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} size={16} /> Frissítés
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {accepted ? (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#b9f5f2]/48 bg-[#2a8d8b]/28 px-4 py-4 text-[#e8fffd]">
              <CheckCircle2 size={23} />
              <div><p className="text-base">Kassza átvéve, a műszak a te neveden folytatódik.</p><p className="mt-1 text-xs text-white/58">A rendszer lezárta az átadást.</p></div>
            </div>
          ) : null}

          {error ? <div className="mb-4 rounded-2xl border border-red-300/45 bg-red-600/20 px-4 py-3 text-sm text-red-50">{error}</div> : null}

          <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-[24px] border border-white/13 bg-[#374357] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Az átadó lezárt műszaka</p>
                  <h3 className="mt-1 text-lg">{incoming.fromActor}</h3>
                </div>
                <div className="text-right text-[11px] text-white/48"><Clock3 className="mr-1 inline" size={14} />{formatTime(incoming.shiftStartAt)} → {formatTime(incoming.cutoffAt)}</div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-[#9be9e5]/24 bg-[#2a8d8b]/14 p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Forgalom</p><p className="mt-2 text-xl text-[#d7fffd]">{formatMoney(shiftSnapshot?.revenue || 0)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Eladás</p><p className="mt-2 text-xl">{shiftSnapshot?.transactions || 0}</p></div>
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Darab</p><p className="mt-2 text-xl">{shiftSnapshot?.itemsSold || 0}</p></div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {PAYMENT_META.map((item) => {
                  const Icon = item.icon;
                  const itemPayment = payment(shiftSnapshot, item.method);
                  const transactionCount = itemPayment.transactions + itemPayment.customerPaymentTransactions;
                  return (
                    <div key={item.method} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs text-white/55"><Icon size={15} className="text-[#8ee6e2]" />{item.label}</span><span className="text-[9px] text-white/36">{transactionCount} tétel</span></div>
                      <p className="mt-2 text-lg">{formatMoney(itemPayment.amount)}</p>
                      {itemPayment.customerPaymentAmount > 0 ? <p className="mt-1 text-[9px] text-white/38">ebből tartozás befizetés: {formatMoney(itemPayment.customerPaymentAmount)}</p> : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[24px] border border-[#9be9e5]/38 bg-[#24585d] p-4 shadow-[0_12px_28px_rgba(42,141,139,0.16)]">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] uppercase tracking-[0.14em] text-[#d7fffd]/65">Átadandó készpénz</p><p className="mt-2 text-4xl tracking-tight">{formatMoney(expectedCash)}</p></div>
                <Banknote size={26} className="text-[#cffffd]" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-white/58">Ez az üzlet kasszájában a rendszer szerint eddig összegyűlt mai készpénz. Ezt kell fizikailag átvenned és megszámolnod.</p>
              <div className="mt-3 rounded-2xl border border-white/12 bg-black/10 p-3">
                <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Teljes üzleti nap eddig</p>
                <p className="mt-1 text-lg text-white">{formatMoney(daySnapshot?.revenue || 0)}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-white/50"><span>{daySnapshot?.transactions || 0} eladás</span><span>•</span><span>{daySnapshot?.itemsSold || 0} db</span></div>
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-[24px] border border-white/13 bg-[#374357] p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#9be9e5]/30 bg-[#2a8d8b]/18 text-[#d7fffd]"><ShieldCheck size={21} /></span>
              <div><p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Kasszaellenőrzés</p><h3 className="mt-1 text-lg">Számold meg a készpénzt</h3></div>
            </div>

            <label className="mt-4 block">
              <span className="text-[10px] uppercase tracking-[0.12em] text-white/45">Megszámolt készpénz</span>
              <div className={`mt-2 grid grid-cols-[1fr_auto] overflow-hidden rounded-2xl border bg-[#273243] transition ${countedValue === null ? "border-white/18" : cashMatches ? "border-[#9be9e5]/60 ring-4 ring-[#2a8d8b]/14" : "border-red-300/65 ring-4 ring-red-500/10"}`}>
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={countedCash}
                  onChange={(event) => setCountedCash(event.target.value.replace(/[^0-9.,\s]/g, ""))}
                  onKeyDown={(event) => { if (event.key === "Enter" && cashMatches && !accepting) void acceptHandover(); }}
                  placeholder="0,00"
                  className="h-16 min-w-0 bg-transparent px-5 text-right text-3xl text-white outline-none placeholder:text-white/22"
                />
                <span className="inline-flex h-16 min-w-20 items-center justify-center border-l border-white/12 bg-white/[0.04] text-lg text-white/55">RON</span>
              </div>
            </label>

            <div className={`mt-3 rounded-2xl border px-4 py-3 ${countedValue === null ? "border-white/12 bg-black/8" : cashMatches ? "border-[#9be9e5]/38 bg-[#2a8d8b]/14" : "border-red-300/38 bg-red-600/13"}`}>
              {countedValue === null ? (
                <p className="text-sm text-white/48">Írd be a ténylegesen megszámolt kasszaösszeget.</p>
              ) : cashMatches ? (
                <div className="flex items-center gap-3"><CheckCircle2 size={20} className="text-[#9ff3ef]" /><div><p className="text-sm text-[#e5fffd]">Egyezik • eltérés 0,00 RON</p><p className="mt-1 text-[10px] text-white/45">A műszak átvehető.</p></div></div>
              ) : (
                <div className="flex items-center gap-3"><TriangleAlert size={20} className="text-red-100" /><div><p className="text-sm text-red-50">Eltérés: {formatMoney(difference || 0)}</p><p className="mt-1 text-[10px] text-white/48">Rendszer: {formatMoney(expectedCash)} • megszámolva: {formatMoney(countedValue)}</p></div></div>
              )}
            </div>

            <label className="mt-3 block">
              <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Átvételi megjegyzés • opcionális</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 1000))}
                placeholder="Pl. kassza és POS ellenőrizve"
                className="mt-2 h-12 w-full rounded-xl border border-white/14 bg-[#273243] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#72d8d4]"
              />
            </label>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 bg-[#293548] px-5 py-4">
          <p className="max-w-[560px] text-xs leading-relaxed text-white/45">Az értékesítés addig zárolva marad, amíg a megszámolt készpénz nem egyezik a rendszerrel és az átvételt jóvá nem hagyod.</p>
          <button
            type="button"
            disabled={!cashMatches || accepting || accepted}
            onClick={() => void acceptHandover()}
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-[#b9f5f2]/55 bg-[#2a8d8b] px-5 text-sm text-white shadow-[0_10px_24px_rgba(42,141,139,0.24)] hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-42"
          >
            {accepting ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
            {accepting ? "Átvétel mentése…" : accepted ? "Átvéve" : "Átvétel rendben, műszak folytatása"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
