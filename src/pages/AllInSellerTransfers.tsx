import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Landmark,
  Loader2,
  PackageSearch,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import {
  apiAifShopDailySummary,
  apiAifShopShiftEmployees,
  apiAifSellerTransfers,
  apiAifCreateSellerTransfer,
  apiAifDecideSellerTransfer,
  apiAifAcknowledgeSellerTransfer,
  type AifSellerTransfer,
  type AifShopDailyProductItem,
} from "../lib/aif/api";

type Props = { locationCode: string; actor: string; role?: "shop" | "admin"; onChanged?: () => void };
const money = (v: number) => `${new Intl.NumberFormat("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)} RON`;
const dateTime = (v: string) => new Date(v).toLocaleString("hu-HU", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
function localDate() {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
const employeeKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const panel = "rounded-[22px] border border-white/20 bg-[#354153] text-white shadow-[0_28px_90px_rgba(0,0,0,.42)]";
const softButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-[#465468] px-4 text-sm font-normal text-white transition hover:bg-[#536277] disabled:cursor-not-allowed disabled:opacity-45";
const greenButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#9fe6dd]/40 bg-[#108D8B] px-4 text-sm font-normal text-white transition hover:bg-[#159d9a] disabled:cursor-not-allowed disabled:opacity-45";

/** Egyértelmű eladótól eladóig jel: két kolléga, köztük jobbra mutató nyíl. */
function SellerHandoffIcon({ compact = false }: { compact?: boolean }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center ${compact ? "gap-[3px]" : "gap-[4px]"}`}>
      <span className={`inline-flex shrink-0 items-center justify-center rounded-[6px] border border-white/35 bg-white/13 text-white ${compact ? "h-[20px] w-[20px]" : "h-[24px] w-[24px]"}`}>
        <UserRound size={compact ? 13 : 15} strokeWidth={1.85} />
      </span>
      <ArrowRight size={compact ? 12 : 15} strokeWidth={2.4} className="text-[#d3fffc] transition-transform duration-200 group-hover:translate-x-[2px]" />
      <span className={`inline-flex shrink-0 items-center justify-center rounded-[6px] border border-[#d2fffa]/55 bg-white/20 text-white ${compact ? "h-[20px] w-[20px]" : "h-[24px] w-[24px]"}`}>
        <UserRound size={compact ? 13 : 15} strokeWidth={1.85} />
      </span>
    </span>
  );
}

export default function AllInSellerTransfers({ locationCode, actor, role = "shop", onChanged }: Props) {
  const [items, setItems] = useState<AifSellerTransfer[]>([]);
  const [incoming, setIncoming] = useState<AifSellerTransfer | null>(null);
  const [confirmation, setConfirmation] = useState<AifSellerTransfer | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const acknowledgedIdsRef = useRef<Set<string>>(new Set());
  const notifiedSenderIdsRef = useRef<Set<string>>(new Set());
  const senderConfirmationButtonRef = useRef<HTMLButtonElement | null>(null);
  const [manualInbox, setManualInbox] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [employees, setEmployees] = useState<string[]>([]);
  const [saleLines, setSaleLines] = useState<AifShopDailyProductItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("");
  const [lineId, setLineId] = useState("");
  const [target, setTarget] = useState("");
  const [selectedDate, setSelectedDate] = useState(localDate);
  const [reason, setReason] = useState("");
  const requestIdRef = useRef(0);
  const dismissedRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const active = role === "shop";

  const refresh = useCallback(async (showError = false) => {
    if (!active || busyRef.current) return;
    try {
      const response = await apiAifSellerTransfers({ location: locationCode });
      setItems(response.items || []);
      if (showError) setError("");
    } catch (err) {
      if (showError) setError(err instanceof Error ? err.message : "Az átadások nem ellenőrizhetők.");
    }
  }, [active, locationCode]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 8000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [active, refresh]);

  const pending = useMemo(() => items.filter(item => item.status === "pending" && employeeKey(item.toActor) === employeeKey(actor)), [items, actor]);
  const outgoing = useMemo(() => items.filter(item => employeeKey(item.fromActor) === employeeKey(actor)), [items, actor]);
  // Accepted outgoing requests take priority over incoming requests. The server
  // tracks acknowledgments, so a reload/login/device switch never loses one.
  useEffect(() => {
    if (sendOpen || manualInbox || incoming || confirmation) return;
    const accepted = outgoing.find(item => item.senderNotificationPending && !acknowledgedIdsRef.current.has(item.id));
    if (accepted) { setError(""); setConfirmation(accepted); return; }
    const next = pending.find(item => !dismissedRef.current.has(item.id));
    if (next) setIncoming(next);
  }, [pending, outgoing, sendOpen, manualInbox, incoming, confirmation]);

  // The confirmation also refreshes any daily summary open in this browser.
  // The remote employee's approval must never leave stale figures on screen.
  useEffect(() => {
    if (!confirmation || notifiedSenderIdsRef.current.has(confirmation.id)) return;
    notifiedSenderIdsRef.current.add(confirmation.id);
    window.dispatchEvent(new CustomEvent("aif:shop-seller-transfer-changed", { detail: { locationCode } }));
    senderConfirmationButtonRef.current?.focus();
  }, [confirmation, locationCode]);

  // Another browser tab may acknowledge the same notification. Close it once
  // polling confirms the server has recorded the acknowledgment.
  useEffect(() => {
    if (!confirmation || acknowledging) return;
    const latest = items.find(item => item.id === confirmation.id);
    if (latest && !latest.senderNotificationPending) {
      setConfirmation(null);
      setError("");
    }
  }, [items, confirmation, acknowledging]);

  const loadSend = async (initialLineId = "", date = localDate()) => {
    const requestId = ++requestIdRef.current;
    setSendOpen(true);setError("");setSuccess("");setLoading(true);
    setLineId("");setTarget("");setFilter("");setReason("");setSelectedDate(date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localDate()){
      setSaleLines([]);setError("Csak a mai vagy korábbi nap választható.");setLoading(false);return;
    }
    try {
      const [people, summary] = await Promise.all([
        apiAifShopShiftEmployees({ location: locationCode }),
        apiAifShopDailySummary({ location: locationCode, date, employee: actor }),
      ]);
      if(requestId!==requestIdRef.current)return;
      setEmployees(people.items.filter(p => employeeKey(p.name) !== employeeKey(actor)).map(p => p.name));
      const ownLines = (summary.productLines || []).filter(line => line.dailyCategory === "sale" && line.recordType === "sale"
        && Boolean(line.lineId && line.saleId) && !line.transferredFrom && line.qty > 0);
      setSaleLines(ownLines);
      if (initialLineId && ownLines.some(line => line.lineId === initialLineId)) setLineId(initialLineId);
    } catch (err) {
      if(requestId!==requestIdRef.current)return;
      setError(err instanceof Error ? err.message : "Az adott napi saját eladások nem tölthetők be.");
      setSaleLines([]);
    } finally { if(requestId===requestIdRef.current)setLoading(false); }
  };

  // A napi összesítés konkrét terméksorának átadási gombja ugyanazt a biztonságos
  // szerveroldali kérelmi folyamatot indítja, mint a fő gomb. Nincs készletművelet.
  useEffect(() => {
    if (!active) return;
    const onRequestLine = (event: Event) => {
      const detail = (event as CustomEvent<{lineId?: string; locationCode?: string; date?: string}>).detail;
      if (detail?.locationCode !== locationCode || !detail?.lineId) return;
      void loadSend(detail.lineId,detail.date || localDate());
    };
    window.addEventListener("aif:seller-transfer-request-line", onRequestLine);
    return () => window.removeEventListener("aif:seller-transfer-request-line", onRequestLine);
    // The handler must always use the current seller/location, even after user switches.
  }, [active, locationCode, actor]);

  const notify = () => {
    window.dispatchEvent(new Event("aif:shop-seller-transfer-changed"));
    onChanged?.();
  };
  const submit = async () => {
    if (!lineId || !target || sending) return;
    if(selectedDate < localDate() && reason.trim().length < 5){
      setError("Korábbi nap javításához legalább öt karakteres indoklás szükséges.");return;
    }
    busyRef.current = true; setSending(true);setError("");
    try {
      await apiAifCreateSellerTransfer({ location: locationCode, lineId, toActor: target,
        reason: reason.trim() || undefined });
      setSendOpen(false);setSuccess("Átadás elküldve. A másik eladónak jóvá kell hagynia.");
      await apiAifSellerTransfers({ location: locationCode }).then(data => setItems(data.items || []));
      notify();
    } catch (err) { setError(err instanceof Error ? err.message : "Az átadási kérés nem sikerült."); }
    finally { setSending(false);busyRef.current = false; }
  };
  const decide = async (item: AifSellerTransfer, decision: "accept" | "reject" | "cancel") => {
    if (sending) return;
    busyRef.current = true;setSending(true);setError("");
    try {
      await apiAifDecideSellerTransfer(item.id, { location: locationCode, decision });
      dismissedRef.current.add(item.id);
      setIncoming(null);
      setSuccess(decision === "accept" ? "Elfogadva. A terméksor elszámolása a kiválasztott eladóhoz került; a lezárt kassza és a bizonylat változatlan." : decision === "reject" ? "Az átadási kérés elutasítva." : "Az átadási kérés visszavonva.");
      const data = await apiAifSellerTransfers({ location: locationCode });setItems(data.items || []);
      notify();
    } catch (err) {setError(err instanceof Error ? err.message : "Az átadás elbírálása nem sikerült.");}
    finally {setSending(false);busyRef.current = false;}
  };
  const dismissIncoming = () => { if (incoming) dismissedRef.current.add(incoming.id);setIncoming(null); };
  const acknowledgeConfirmation = async () => {
    if (!confirmation || acknowledging) return;
    setAcknowledging(true);
    setError("");
    try {
      await apiAifAcknowledgeSellerTransfer(confirmation.id, { location: locationCode });
      acknowledgedIdsRef.current.add(confirmation.id);
      setItems(current => current.map(item => item.id === confirmation.id
        ? { ...item, senderNotificationPending: false } : item));
      setConfirmation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "A visszajelzés nyugtázása nem sikerült.");
    } finally {
      setAcknowledging(false);
    }
  };
  const selectedLine = saleLines.find(line => line.lineId === lineId);
  const filtered = saleLines.filter(line => `${line.title} ${line.productCode || ""} ${line.saleNumber || ""} ${line.size || ""}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const open = Boolean(sendOpen || manualInbox || incoming || confirmation);
  const closeInbox = () => { setManualInbox(false);setError(""); };

  if (!active) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void loadSend()} title="Eladás elszámolásának átadása egy másik eladónak, korábbi napról is"
          className="group inline-flex min-h-[49px] items-center gap-2.5 rounded-[13px] border border-[#bcfff9]/55 bg-gradient-to-r from-[#267d7e] to-[#108D8B] px-3.5 py-2 text-sm font-normal text-white shadow-[0_9px_22px_rgba(16,141,139,0.22)] transition hover:border-[#dcfffc]/75 hover:from-[#2d9493] hover:to-[#159f9c] hover:shadow-[0_11px_27px_rgba(16,141,139,0.35)] active:scale-[0.98]">
          <SellerHandoffIcon />
          <span>Eladás / régi nap javítása</span>
        </button>
        <button type="button" onClick={() => {setManualInbox(true);setError("");setSuccess("");}} className={softButton}>
          <Clock3 size={16} /> Átadási kérelmek
          {pending.length > 0 ? <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white">{pending.length}</span> : null}
        </button>
        {success && !open ? <span className="text-xs text-[#bbf5e4]">{success}</span> : null}
      </div>

      {open && <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-[#101927]/80 p-3 backdrop-blur-[3px] sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !sending && !confirmation) { if (incoming) dismissIncoming();else {setSendOpen(false);closeInbox();} } }}>
        {confirmation && !sendOpen && !manualInbox && !incoming ? (
          <section role="alertdialog" aria-modal="true" aria-labelledby="aif-seller-confirmation-title"
            className="relative flex w-full max-w-[550px] flex-col overflow-hidden rounded-[27px] border border-[#8dece5]/50 bg-[#303a4c] text-white shadow-[0_38px_110px_rgba(2,12,26,0.72)]">
            <header className="relative overflow-hidden bg-gradient-to-br from-[#22505b] via-[#207477] to-[#108D8B] px-5 pb-6 pt-6 sm:px-7">
              <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border border-white/15 bg-white/[0.04]" />
              <span aria-hidden="true" className="pointer-events-none absolute right-12 top-7 h-20 w-20 rounded-full border border-white/10" />
              <div className="relative flex items-center gap-4">
                <span className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-[20px] border border-[#cffffa]/55 bg-white/15 shadow-[0_10px_30px_rgba(0,0,0,0.13)]">
                  <CheckCircle2 size={35} strokeWidth={1.7} className="text-white" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.17em] text-white/72">AllInFashion · Visszaigazolás</p>
                  <h2 id="aif-seller-confirmation-title" className="mt-1 text-[25px] font-normal tracking-tight sm:text-[29px]">Átadás elfogadva</h2>
                  <p className="mt-1 text-[13px] text-[#e6fffd]/85">{confirmation.toActor} jóváhagyta az átadást.</p>
                </div>
              </div>
            </header>
            <div className="space-y-3.5 p-4 sm:p-5">
              <article className="flex items-center gap-3.5 rounded-[19px] border border-white/14 bg-[#39475b] p-3">
                <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[15px] border border-white/20 bg-white">
                  {confirmation.imageUrl ? <img src={confirmation.imageUrl} alt="" className="h-full w-full object-contain p-1" />
                    : <PackageSearch size={30} className="text-[#526173]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] leading-snug text-white">{confirmation.title}</p>
                  <p className="mt-1.5 text-[11px] text-white/56">{[confirmation.productCode, confirmation.size].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[#bdfaf3]/75">
                    <ReceiptText size={12} /> {confirmation.saleNumber} · {dateTime(confirmation.soldAt)}
                  </p>
                </div>
              </article>
              <div className="rounded-[19px] border border-[#a6f0e9]/43 bg-gradient-to-br from-[#19787a] to-[#155c65] px-4 py-3.5">
                <p className="text-[10px] uppercase tracking-[0.13em] text-[#d3fffb]/73">Átvezetett összeg</p>
                <p className="mt-1.5 text-[29px] font-normal tracking-tight text-white sm:text-[33px]">{money(confirmation.netTotal)}</p>
              </div>
              {error ? <p role="alert" className="rounded-xl border border-red-300/50 bg-red-500/15 px-3 py-2.5 text-xs text-red-50">{error}</p> : null}
            </div>
            <footer className="border-t border-white/12 bg-[#283548] px-4 py-4 sm:px-5">
              <button ref={senderConfirmationButtonRef} type="button" onClick={() => void acknowledgeConfirmation()} disabled={acknowledging}
                className="flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-[15px] border border-[#b6fff9]/56 bg-[#108D8B] text-[15px] font-normal text-white shadow-[0_10px_24px_rgba(16,141,139,0.20)] transition hover:bg-[#159f9c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6fff9]/90 active:scale-[0.985] disabled:cursor-wait disabled:opacity-50">
                {acknowledging ? <Loader2 size={19} className="animate-spin" /> : <Check size={19} strokeWidth={1.9} />}
                {acknowledging ? "Nyugtázás…" : "Rendben"}
              </button>
            </footer>
          </section>
        ) : incoming && !sendOpen && !manualInbox ? (
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="aif-transfer-accept-title"
            aria-describedby="aif-transfer-accept-help"
            className="relative flex max-h-[94dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-[30px] border border-[#95e6df]/55 bg-[#303a4c] text-white shadow-[0_40px_120px_rgba(2,8,20,0.75),0_0_0_1px_rgba(255,255,255,0.07)]"
          >
            {/* AIF SELLER TRANSFER: THE RECIPIENT'S CONFIRMATION IS THE ONLY ACTION THAT MOVES OWNERSHIP. */}
            <header className="relative shrink-0 overflow-hidden border-b border-white/15 bg-gradient-to-br from-[#204655] via-[#236e73] to-[#108D8B] px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-24 h-60 w-60 rounded-full border border-white/15 bg-white/[0.06]" />
              <div aria-hidden="true" className="pointer-events-none absolute right-14 top-6 h-28 w-28 rounded-full border border-white/10" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#d6fffb]/85 to-transparent" />
              <div className="relative flex items-start gap-3.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-[#d8fffb]/50 bg-white/15 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
                  <ArrowLeftRight size={27} strokeWidth={1.65} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.17em] text-[#d8fffb]/78">AllInFashion · Eladói korrekció</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d8fffb]/40 bg-black/10 px-2.5 py-1 text-[9px] uppercase tracking-[0.08em] text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#bafff6]" />
                      Jóváhagyásra vár
                    </span>
                  </div>
                  <h2 id="aif-transfer-accept-title" className="mt-2 text-[25px] font-normal leading-tight tracking-tight text-white sm:text-[29px]">Eladás átvétele</h2>
                  <p className="mt-1.5 max-w-[430px] text-[12px] leading-5 text-white/78">
                    Egy kollégád a te elszámolásodhoz szeretné átvezetni ezt az eladott terméket.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissIncoming}
                  disabled={sending}
                  title="Később döntök"
                  aria-label="Később döntök, kérelem bezárása"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-black/10 text-white transition hover:border-white/55 hover:bg-white/15 disabled:opacity-40"
                >
                  <X size={19} />
                </button>
              </div>
            </header>

            <div className="min-h-0 space-y-3.5 overflow-y-auto overscroll-contain bg-[#303a4c] p-4 sm:space-y-4 sm:p-5">
              <div className="relative grid grid-cols-[minmax(0,1fr)_36px_minmax(0,1fr)] items-center gap-2 rounded-[20px] border border-white/12 bg-[#273548] p-3 sm:gap-3 sm:p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-white/46"><UserRound size={12} /> Átadó</p>
                  <p className="mt-1.5 truncate text-[16px] text-white sm:text-[18px]" title={incoming.fromActor}>{incoming.fromActor}</p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#86e8e1]/40 bg-[#108D8B]/25 text-[#b9fff6]"><ArrowRight size={18} /></span>
                <div className="min-w-0 text-right">
                  <p className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-[0.12em] text-white/46"><UserRound size={12} /> Átvevő</p>
                  <p className="mt-1.5 truncate text-[16px] text-[#bffff7] sm:text-[18px]" title={incoming.toActor}>{incoming.toActor}</p>
                </div>
              </div>

              <article className="grid gap-3 rounded-[22px] border border-white/15 bg-[#39475b] p-3 sm:grid-cols-[100px_minmax(0,1fr)] sm:gap-4 sm:p-4">
                <span className="flex h-[100px] w-[100px] items-center justify-center overflow-hidden rounded-[17px] border border-white/25 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
                  {incoming.imageUrl ? (
                    <img src={incoming.imageUrl} alt={incoming.title || "Átadásra váró termék"} className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <PackageSearch size={35} className="text-[#526173]" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-[#a4f2ea]/26 bg-[#108D8B]/15 px-2.5 py-1 text-[9px] uppercase tracking-[0.1em] text-[#c6fff9]">Átadott termék</span>
                    <span className="rounded-lg border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/70">{incoming.qty} db</span>
                  </div>
                  <h3 className="mt-2 text-[16px] font-normal leading-snug text-white sm:text-[18px]">{incoming.title}</h3>
                  <p className="mt-1.5 break-words text-[11px] leading-5 text-white/60">
                    {[incoming.productCode, incoming.colorName, incoming.size].filter(Boolean).join("  ·  ") || "A termék adatai az eredeti bizonylaton találhatók."}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/10 pt-2.5 text-[11px] text-white/56">
                    <span className="inline-flex items-center gap-1.5"><ReceiptText size={13} className="text-[#8ce7e2]" /> {incoming.saleNumber}</span>
                    <span className="inline-flex items-center gap-1.5"><Clock3 size={13} className="text-[#8ce7e2]" /> {dateTime(incoming.soldAt)}</span>
                  </div>
                </div>
              </article>

              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
                <div className="relative overflow-hidden rounded-[19px] border border-[#8ae3dc]/45 bg-gradient-to-br from-[#1e7375] to-[#166468] px-4 py-3.5 shadow-[0_10px_26px_rgba(16,141,139,0.15)]">
                  <span aria-hidden="true" className="pointer-events-none absolute -right-4 -top-10 h-24 w-24 rounded-full border border-white/10" />
                  <p className="relative text-[10px] uppercase tracking-[0.13em] text-[#cffffb]/72">Hozzád átvezetendő összeg</p>
                  <p className="relative mt-1.5 whitespace-nowrap text-[clamp(1.45rem,4.1vw,2rem)] font-normal tracking-tight text-white">{money(incoming.netTotal)}</p>
                </div>
                <div className="rounded-[19px] border border-white/13 bg-[#273548] px-4 py-3.5">
                  <p className="text-[10px] uppercase tracking-[0.13em] text-white/45">Fizetési mód</p>
                  <p className="mt-3 flex items-center gap-2 text-[14px] text-white">
                    {incoming.paymentMethod === "cash" ? <Banknote size={18} className="text-[#8ce7e2]" /> : incoming.paymentMethod === "card" ? <CreditCard size={18} className="text-[#8ce7e2]" /> : incoming.paymentMethod === "credit" ? <Clock3 size={18} className="text-[#8ce7e2]" /> : incoming.paymentMethod === "mixed" ? <WalletCards size={18} className="text-[#8ce7e2]" /> : <Landmark size={18} className="text-[#8ce7e2]" />}
                    {incoming.paymentMethod === "cash" ? "Készpénz" : incoming.paymentMethod === "card" ? "Bankkártya" : incoming.paymentMethod === "bank_transfer" ? "Banki átutalás" : incoming.paymentMethod === "mixed" ? "Vegyes fizetés" : incoming.paymentMethod === "credit" ? "Utólag fizet" : incoming.paymentMethod || "Nincs megadva"}
                  </p>
                </div>
              </div>

              {incoming.isHistorical ? (
                <div className="rounded-[15px] border border-amber-200/35 bg-amber-500/10 px-3.5 py-2.5 text-[11px] leading-5 text-amber-50">
                  Korábbi nap utólagos elszámolási javítása. Az eredeti napzárás, kassza és műszakátadás bizonylatai nem változnak.
                  {incoming.reason ? <p className="mt-1 text-white/75">Indok: {incoming.reason}</p> : null}
                </div>
              ) : null}
              <div id="aif-transfer-accept-help" className="flex gap-3 rounded-[17px] border border-[#a9e9e4]/18 bg-[#253b48] px-3.5 py-3">
                <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[#9ce7de]" strokeWidth={1.7} />
                <p className="text-[11px] leading-[19px] text-white/72">
                  <span className="text-[#d8fffb]">Csak elfogadás után kerül át</span> a termék és az összege a te napi és műszakos elszámolásodba. Nem keletkezik új eladás vagy készletmozgás, az eredeti bizonylat megmarad.
                </p>
              </div>

              {error ? (
                <div role="alert" className="rounded-[15px] border border-red-300/50 bg-[#a82235]/25 px-4 py-3 text-[12px] leading-5 text-red-50">{error}</div>
              ) : null}
            </div>

            <footer className="grid shrink-0 grid-cols-2 gap-2.5 border-t border-white/12 bg-[#283548] p-4 sm:gap-3 sm:px-5 sm:py-4">
              <button
                type="button"
                onClick={() => void decide(incoming, "reject")}
                disabled={sending}
                className="group inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[15px] border border-[#ff8792]/65 bg-[#d82438] px-2 text-[13px] font-normal text-white shadow-[0_9px_20px_rgba(216,36,56,0.15)] transition hover:border-[#ffb1b9] hover:bg-[#ed2b40] active:scale-[0.985] disabled:cursor-wait disabled:opacity-50 sm:px-4 sm:text-[15px]"
              >
                <XCircle size={18} strokeWidth={1.8} /> Elutasítom
              </button>
              <button
                type="button"
                onClick={() => void decide(incoming, "accept")}
                disabled={sending}
                className="group inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[15px] border border-[#b5fff8]/62 bg-[#108D8B] px-2 text-[13px] font-normal text-white shadow-[0_10px_28px_rgba(16,141,139,0.24)] transition hover:border-[#d9fffb] hover:bg-[#159f9c] active:scale-[0.985] disabled:cursor-wait disabled:opacity-50 sm:px-4 sm:text-[15px]"
              >
                {sending ? <Loader2 size={19} className="animate-spin" /> : <CheckCircle2 size={19} strokeWidth={1.8} />}
                {sending ? "Feldolgozás…" : "Elfogadom"}
              </button>
            </footer>
          </section>
        ) : sendOpen ? (
          <div role="dialog" aria-modal="true" aria-label="Eladás átadása másik eladónak" className={`${panel} flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden`}>
            <header className="flex items-center justify-between border-b border-white/15 bg-[#108D8B] px-5 py-4"><div><p className="text-[10px] uppercase tracking-[.14em] text-white/65">Eladói korrekció</p><h2 className="mt-1 text-xl font-normal">Eladott termék átadása</h2></div><button type="button" onClick={() => {setSendOpen(false);setError("");}} disabled={sending} className="rounded-lg p-2 hover:bg-white/10"><X size={20} /></button></header>
            <div className="min-h-0 space-y-4 overflow-y-auto p-5">
              <p className="text-sm text-white/70">Válaszd ki a napot és a saját eladott terméksort. A másik eladó külön felugró ablakban hagyja jóvá. A jóváhagyás utólagos elszámolás, nem új pénz- vagy készletmozgás.</p>
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#9be9e5]/30 bg-[#244854]/70 px-4 py-3">
                <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[11px] text-[#d7fffd]">
                  <span className="inline-flex items-center gap-2"><Clock3 size={15}/> Ellenőrzendő eladási nap</span>
                  <input type="date" value={selectedDate} max={localDate()} onChange={e=>void loadSend("",e.currentTarget.value)}
                    className="h-11 max-w-[250px] rounded-xl border border-white/25 bg-[#273243] px-3 text-sm text-white outline-none focus:border-[#8ce7e2] [color-scheme:dark]" />
                </label>
                <button type="button" onClick={()=>void loadSend("",localDate())} className={softButton}>Mai nap</button>
                {selectedDate < localDate() ? <span className="text-[11px] text-amber-100">Utólagos elszámolási javítás</span> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr]"><label className="block text-xs text-white/65">Átvevő eladó<select value={target} onChange={e => setTarget(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-white/20 bg-[#273243] px-3 text-sm text-white outline-none focus:border-[#96e0d9]"><option value="">Válassz eladót…</option>{employees.map(name => <option key={name} value={name}>{name}</option>)}</select></label><label className="block text-xs text-white/65">Termék keresése<div className="mt-1 flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-[#273243] px-3"><Search size={16} className="text-white/40" /><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Név, kód, bizonylat" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35" /></div></label></div>
              <div className="space-y-2">{loading ? <p className="py-8 text-center text-sm text-white/55">Kiválasztott napi eladások betöltése…</p> : filtered.length ? filtered.map(line => <button type="button" key={line.lineId || line.key} onClick={() => setLineId(line.lineId || "")} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${lineId === line.lineId ? "border-[#7ae2d9] bg-[#108D8B]/25" : "border-white/12 bg-[#293647] hover:border-white/30"}`}><div className={`h-4 w-4 shrink-0 rounded-full border ${lineId === line.lineId ? "border-[#84e2d9] bg-[#108D8B]" : "border-white/35"}`} />{line.imageUrl ? <img src={line.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain" /> : <div className="h-12 w-12 shrink-0 rounded-lg bg-white/10" />}<div className="min-w-0 flex-1"><p className="truncate text-sm">{line.title}</p><p className="mt-1 text-xs text-white/50">{[line.productCode, line.colorName, line.size, line.saleNumber].filter(Boolean).join(" • ")}</p></div><div className="shrink-0 text-right"><p className="text-sm">{money(line.netTotal || line.revenue)}</p><p className="mt-1 text-xs text-white/45">{line.qty} db • {line.soldAt ? dateTime(line.soldAt) : ""}</p></div></button>) : <p className="py-8 text-center text-sm text-white/55">Nincs ilyen saját eladási tétel a mai listában.</p>}</div>
              {selectedLine && <div className="rounded-xl border border-[#7ae2d9]/35 bg-[#108D8B]/15 p-3 text-sm">{selectedLine.title} <ArrowRight size={14} className="mx-2 inline" /> {target || "Átvevő kiválasztása"} • {money(selectedLine.netTotal ?? selectedLine.revenue)}</div>}
              {selectedDate < localDate() ? (
                <label className="block rounded-xl border border-amber-200/30 bg-amber-500/10 p-3 text-xs text-amber-50">
                  Indoklás a múltbeli javításhoz (kötelező)
                  <textarea value={reason} rows={2} maxLength={400} onChange={e=>setReason(e.target.value)}
                    placeholder="Pl. a félretett terméket a másik eladó adta ki és ő fogadta a fizetést"
                    className="mt-2 w-full resize-y rounded-xl border border-white/20 bg-[#273243] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#8ce7e2]" />
                  <p className="mt-1.5 text-[10px] text-amber-50/70">Az eredeti bizonylat, pénztárzárás és készletnapló sértetlen marad. A javítás időpontja és a jóváhagyás naplózott.</p>
                </label>
              ) : null}
              {error && <p className="rounded-lg border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">{error}</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-white/15 p-4"><button type="button" onClick={() => {setSendOpen(false);setError("");}} disabled={sending} className={softButton}>Vissza</button><button type="button" onClick={() => void submit()} disabled={!lineId || !target || sending || loading || (selectedDate < localDate() && reason.trim().length < 5)} className={greenButton}><Send size={16} /> Átadás kérése</button></footer>
          </div>
        ) : (
          <div role="dialog" aria-modal="true" aria-label="Eladói átadási kérelmek" className={`${panel} flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden`}>
            <header className="flex items-center justify-between border-b border-white/15 bg-[#108D8B] px-5 py-4"><div><p className="text-[10px] uppercase tracking-[.14em] text-white/65">Eladók között</p><h2 className="mt-1 text-xl font-normal">Átadási kérelmek</h2></div><button type="button" onClick={closeInbox} className="rounded-lg p-2 hover:bg-white/10"><X size={20} /></button></header>
            <div className="min-h-0 space-y-4 overflow-y-auto p-5">
              <p className="text-xs text-white/60">Beérkezett kérelmek: {pending.length} • Saját kérések: {outgoing.length}</p>
              {pending.map(item => <div key={item.id} className="rounded-xl border border-[#82dad5]/40 bg-[#29434e] p-4"><p className="text-sm">{item.fromActor} → {item.toActor}</p><p className="mt-1 text-sm text-white/80">{item.title} • {item.qty} db • {money(item.netTotal)}</p><p className="mt-1 text-xs text-white/50">{item.saleNumber} • Eladás: {dateTime(item.soldAt)} • Kérés: {dateTime(item.requestedAt)}</p>{item.reason ? <p className="mt-1 text-xs text-amber-50/80">Indok: {item.reason}</p> : null}<div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" disabled={sending} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#b83545] px-3 text-sm text-white disabled:opacity-50" onClick={() => void decide(item, "reject")}><XCircle size={16} /> Elutasítás</button><button type="button" disabled={sending} className={greenButton} onClick={() => void decide(item, "accept")}><Check size={16} /> Elfogadás</button></div></div>)}
              {outgoing.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-[#293647] p-3"><div className="min-w-0"><p className="truncate text-sm">{item.title} • {money(item.netTotal)}</p><p className="mt-1 text-xs text-white/50">{item.toActor} • Eladás: {dateTime(item.soldAt)} • Kérés: {dateTime(item.requestedAt)} • {item.status === "pending" ? "Várakozik" : item.status === "accepted" ? "Elfogadva" : item.status === "rejected" ? "Elutasítva" : "Visszavonva"}</p></div>{item.status === "pending" ? <button type="button" disabled={sending} onClick={() => void decide(item, "cancel")} className={softButton}><X size={16} /> Visszavonás</button> : null}</div>)}
              {!pending.length && !outgoing.length && <p className="py-8 text-center text-sm text-white/55">Nincs átadási kérelem.</p>}
              {success && <p className="rounded-lg border border-[#7ae2d9]/35 bg-[#108D8B]/15 p-3 text-sm text-[#cafff9]">{success}</p>}
              {error && <p className="rounded-lg border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">{error}</p>}
            </div>
            <footer className="flex justify-end border-t border-white/15 p-4"><button type="button" onClick={closeInbox} className={softButton}>Bezárás</button></footer>
          </div>
        )}
      </div>}
    </>
  );
}
