import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ArrowRight, Check, Clock3, Search, Send, X, XCircle } from "lucide-react";
import {
  apiAifShopDailySummary,
  apiAifShopShiftEmployees,
  apiAifSellerTransfers,
  apiAifCreateSellerTransfer,
  apiAifDecideSellerTransfer,
  type AifSellerTransfer,
  type AifShopDailyProductItem,
} from "../lib/aif/api";

type Props = { locationCode: string; actor: string; role?: "shop" | "admin"; onChanged?: () => void };
const money = (v: number) => `${new Intl.NumberFormat("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)} RON`;
const dateTime = (v: string) => new Date(v).toLocaleString("hu-HU", { timeZone: "Europe/Bucharest", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
function localDate() {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
const employeeKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const panel = "rounded-[22px] border border-white/20 bg-[#354153] text-white shadow-[0_28px_90px_rgba(0,0,0,.42)]";
const softButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-[#465468] px-4 text-sm font-normal text-white transition hover:bg-[#536277] disabled:cursor-not-allowed disabled:opacity-45";
const greenButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#9fe6dd]/40 bg-[#108D8B] px-4 text-sm font-normal text-white transition hover:bg-[#159d9a] disabled:cursor-not-allowed disabled:opacity-45";

export default function AllInSellerTransfers({ locationCode, actor, role = "shop", onChanged }: Props) {
  const [items, setItems] = useState<AifSellerTransfer[]>([]);
  const [incoming, setIncoming] = useState<AifSellerTransfer | null>(null);
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
  const dismissedRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const currentIncomingId = incoming?.id || "";
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
  useEffect(() => {
    if (sendOpen || manualInbox || currentIncomingId) return;
    const next = pending.find(item => !dismissedRef.current.has(item.id));
    if (next) setIncoming(next);
  }, [pending, sendOpen, manualInbox, currentIncomingId]);

  const loadSend = async (initialLineId = "") => {
    setSendOpen(true); setError(""); setSuccess(""); setLoading(true);setLineId("");setTarget("");setFilter("");
    try {
      const [people, summary] = await Promise.all([
        apiAifShopShiftEmployees({ location: locationCode }),
        apiAifShopDailySummary({ location: locationCode, date: localDate() }),
      ]);
      setEmployees(people.items.filter(p => !p.current && employeeKey(p.name) !== employeeKey(actor)).map(p => p.name));
      const ownLines = (summary.productLines || []).filter(line => line.dailyCategory === "sale" && line.recordType === "sale"
        && Boolean(line.lineId && line.saleId) && !line.transferredFrom && line.qty > 0);
      setSaleLines(ownLines);
      if (initialLineId && ownLines.some(line => line.lineId === initialLineId)) setLineId(initialLineId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "A saját eladások nem tölthetők be.");
      setSaleLines([]);
    } finally { setLoading(false); }
  };

  // A napi összesítés konkrét terméksorának átadási gombja ugyanazt a biztonságos
  // szerveroldali kérelmi folyamatot indítja, mint a fő gomb. Nincs készletművelet.
  useEffect(() => {
    if (!active) return;
    const onRequestLine = (event: Event) => {
      const detail = (event as CustomEvent<{lineId?: string; locationCode?: string}>).detail;
      if (detail?.locationCode !== locationCode || !detail?.lineId) return;
      void loadSend(detail.lineId);
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
    busyRef.current = true; setSending(true);setError("");
    try {
      await apiAifCreateSellerTransfer({ location: locationCode, lineId, toActor: target });
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
      setSuccess(decision === "accept" ? "Az átadás elfogadva. A termék és a pénz átvezetve a kimutatásban." : decision === "reject" ? "Az átadási kérés elutasítva." : "Az átadási kérés visszavonva.");
      const data = await apiAifSellerTransfers({ location: locationCode });setItems(data.items || []);
      notify();
    } catch (err) {setError(err instanceof Error ? err.message : "Az átadás elbírálása nem sikerült.");}
    finally {setSending(false);busyRef.current = false;}
  };
  const dismissIncoming = () => { if (incoming) dismissedRef.current.add(incoming.id);setIncoming(null); };
  const selectedLine = saleLines.find(line => line.lineId === lineId);
  const filtered = saleLines.filter(line => `${line.title} ${line.productCode || ""} ${line.saleNumber || ""} ${line.size || ""}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const open = Boolean(sendOpen || manualInbox || incoming);
  const closeInbox = () => { setManualInbox(false);setError(""); };

  if (!active) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void loadSend()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#9fe6dd]/50 bg-[#108D8B] px-4 text-sm text-white transition hover:bg-[#159d9a]">
          <ArrowLeftRight size={17} strokeWidth={1.8} /> Eladás átadása
        </button>
        <button type="button" onClick={() => {setManualInbox(true);setError("");setSuccess("");}} className={softButton}>
          <Clock3 size={16} /> Átadási kérelmek
          {pending.length > 0 ? <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white">{pending.length}</span> : null}
        </button>
        {success && !open ? <span className="text-xs text-[#bbf5e4]">{success}</span> : null}
      </div>

      {open && <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-[#101927]/80 p-3 backdrop-blur-[3px] sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !sending) { if (incoming) dismissIncoming();else {setSendOpen(false);closeInbox();} } }}>
        {incoming && !sendOpen && !manualInbox ? (
          <div role="dialog" aria-modal="true" aria-label="Eladói átadás jóváhagyása" className={`${panel} w-full max-w-lg overflow-hidden`}>
            <header className="flex items-center justify-between border-b border-white/15 bg-[#108D8B] px-5 py-4">
              <div><p className="text-[10px] uppercase tracking-[.14em] text-white/65">Új eladói átadás</p><h2 className="mt-1 text-xl font-normal">Jóváhagyás szükséges</h2></div>
              <button type="button" onClick={dismissIncoming} className="rounded-lg p-2 hover:bg-white/10" aria-label="Bezárás"><X size={20} /></button>
            </header>
            <div className="space-y-4 p-5">
              <p className="text-sm text-white/80"><span className="text-[#b1e8e5]">{incoming.fromActor}</span> át szeretne adni neked egy eladást.</p>
              <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-[#2d3949] p-3">
                {incoming.imageUrl ? <img src={incoming.imageUrl} alt="" className="h-20 w-20 rounded-xl bg-white object-contain" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white/10"><ArrowLeftRight /></div>}
                <div className="min-w-0 flex-1"><p className="text-base">{incoming.title}</p><p className="mt-1 text-xs text-white/55">{[incoming.productCode, incoming.colorName, incoming.size].filter(Boolean).join(" • ")}</p><p className="mt-1 text-xs text-white/55">{incoming.saleNumber} • {dateTime(incoming.soldAt)} • {incoming.qty} db</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/15 bg-[#2b3545] p-4"><div><p className="text-[10px] text-white/50">Átvezetendő összeg</p><p className="mt-1 text-xl">{money(incoming.netTotal)}</p></div><div><p className="text-[10px] text-white/50">Fizetés módja</p><p className="mt-1 text-sm">{incoming.paymentMethod === "cash" ? "Készpénz" : incoming.paymentMethod === "card" ? "Bankkártya" : "Átutalás"}</p></div></div>
              <p className="text-xs leading-relaxed text-white/60">Elfogadás után ez a termék és az összege a te napi és műszakos elszámolásodba kerül. Az eredeti nyugta és a készlet változatlan marad.</p>
              {error && <p className="rounded-lg border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">{error}</p>}
              <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => void decide(incoming, "reject")} disabled={sending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#b83545] px-3 text-white hover:bg-[#c84252] disabled:opacity-50"><XCircle size={18} /> Elutasítom</button><button type="button" onClick={() => void decide(incoming, "accept")} disabled={sending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#108D8B] px-3 text-white hover:bg-[#159d9a] disabled:opacity-50"><Check size={18} /> Elfogadom</button></div>
            </div>
          </div>
        ) : sendOpen ? (
          <div role="dialog" aria-modal="true" aria-label="Eladás átadása másik eladónak" className={`${panel} flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden`}>
            <header className="flex items-center justify-between border-b border-white/15 bg-[#108D8B] px-5 py-4"><div><p className="text-[10px] uppercase tracking-[.14em] text-white/65">Eladói korrekció</p><h2 className="mt-1 text-xl font-normal">Eladott termék átadása</h2></div><button type="button" onClick={() => {setSendOpen(false);setError("");}} disabled={sending} className="rounded-lg p-2 hover:bg-white/10"><X size={20} /></button></header>
            <div className="min-h-0 space-y-4 overflow-y-auto p-5">
              <p className="text-sm text-white/70">Válaszd ki a mai saját eladásodat. A másik eladó felugró értesítést kap, és csak a jóváhagyása után kerül át a termék és a hozzá tartozó pénz.</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr]"><label className="block text-xs text-white/65">Átvevő eladó<select value={target} onChange={e => setTarget(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-white/20 bg-[#273243] px-3 text-sm text-white outline-none focus:border-[#96e0d9]"><option value="">Válassz eladót…</option>{employees.map(name => <option key={name} value={name}>{name}</option>)}</select></label><label className="block text-xs text-white/65">Termék keresése<div className="mt-1 flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-[#273243] px-3"><Search size={16} className="text-white/40" /><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Név, kód, bizonylat" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35" /></div></label></div>
              <div className="space-y-2">{loading ? <p className="py-8 text-center text-sm text-white/55">Mai eladások betöltése…</p> : filtered.length ? filtered.map(line => <button type="button" key={line.lineId || line.key} onClick={() => setLineId(line.lineId || "")} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${lineId === line.lineId ? "border-[#7ae2d9] bg-[#108D8B]/25" : "border-white/12 bg-[#293647] hover:border-white/30"}`}><div className={`h-4 w-4 shrink-0 rounded-full border ${lineId === line.lineId ? "border-[#84e2d9] bg-[#108D8B]" : "border-white/35"}`} />{line.imageUrl ? <img src={line.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain" /> : <div className="h-12 w-12 shrink-0 rounded-lg bg-white/10" />}<div className="min-w-0 flex-1"><p className="truncate text-sm">{line.title}</p><p className="mt-1 text-xs text-white/50">{[line.productCode, line.colorName, line.size, line.saleNumber].filter(Boolean).join(" • ")}</p></div><div className="shrink-0 text-right"><p className="text-sm">{money(line.netTotal || line.revenue)}</p><p className="mt-1 text-xs text-white/45">{line.qty} db • {line.soldAt ? dateTime(line.soldAt) : ""}</p></div></button>) : <p className="py-8 text-center text-sm text-white/55">Nincs ilyen saját eladási tétel a mai listában.</p>}</div>
              {selectedLine && <div className="rounded-xl border border-[#7ae2d9]/35 bg-[#108D8B]/15 p-3 text-sm">{selectedLine.title} <ArrowRight size={14} className="mx-2 inline" /> {target || "Átvevő kiválasztása"} • {money(selectedLine.netTotal || selectedLine.revenue)}</div>}
              {error && <p className="rounded-lg border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">{error}</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-white/15 p-4"><button type="button" onClick={() => {setSendOpen(false);setError("");}} disabled={sending} className={softButton}>Vissza</button><button type="button" onClick={() => void submit()} disabled={!lineId || !target || sending} className={greenButton}><Send size={16} /> Átadás kérése</button></footer>
          </div>
        ) : (
          <div role="dialog" aria-modal="true" aria-label="Eladói átadási kérelmek" className={`${panel} flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden`}>
            <header className="flex items-center justify-between border-b border-white/15 bg-[#108D8B] px-5 py-4"><div><p className="text-[10px] uppercase tracking-[.14em] text-white/65">Eladók között</p><h2 className="mt-1 text-xl font-normal">Átadási kérelmek</h2></div><button type="button" onClick={closeInbox} className="rounded-lg p-2 hover:bg-white/10"><X size={20} /></button></header>
            <div className="min-h-0 space-y-4 overflow-y-auto p-5">
              <p className="text-xs text-white/60">Beérkezett kérelmek: {pending.length} • Saját kérések: {outgoing.length}</p>
              {pending.map(item => <div key={item.id} className="rounded-xl border border-[#82dad5]/40 bg-[#29434e] p-4"><p className="text-sm">{item.fromActor} → {item.toActor}</p><p className="mt-1 text-sm text-white/80">{item.title} • {item.qty} db • {money(item.netTotal)}</p><p className="mt-1 text-xs text-white/50">{item.saleNumber} • {dateTime(item.requestedAt)}</p><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" disabled={sending} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#b83545] px-3 text-sm text-white disabled:opacity-50" onClick={() => void decide(item, "reject")}><XCircle size={16} /> Elutasítás</button><button type="button" disabled={sending} className={greenButton} onClick={() => void decide(item, "accept")}><Check size={16} /> Elfogadás</button></div></div>)}
              {outgoing.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-[#293647] p-3"><div className="min-w-0"><p className="truncate text-sm">{item.title} • {money(item.netTotal)}</p><p className="mt-1 text-xs text-white/50">{item.toActor} • {dateTime(item.requestedAt)} • {item.status === "pending" ? "Várakozik" : item.status === "accepted" ? "Elfogadva" : item.status === "rejected" ? "Elutasítva" : "Visszavonva"}</p></div>{item.status === "pending" ? <button type="button" disabled={sending} onClick={() => void decide(item, "cancel")} className={softButton}><X size={16} /> Visszavonás</button> : null}</div>)}
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
