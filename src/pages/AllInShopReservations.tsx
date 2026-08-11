import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Banknote,
  Barcode,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  History,
  Landmark,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  apiAifCreateShopReservation,
  apiAifFulfillShopReservation,
  apiAifListShopCustomers,
  apiAifReleaseShopReservation,
  apiAifShopReservations,
  apiAifShopSaleCatalog,
  type AifShopCustomer,
  type AifShopReservation,
  type AifShopSaleCatalogItem,
  type AifShopSalePaymentMethod,
} from "../lib/aif/api";

type Props = {
  open: boolean;
  actor: string;
  locationCode: "main_warehouse" | "magazin_targu_secuiesc";
  locationName: string;
  onClose: () => void;
};

type DraftLine = AifShopSaleCatalogItem & { quantity: number };
type ViewMode = "active" | "new" | "history";

const PAYMENT_OPTIONS: Array<{ method: AifShopSalePaymentMethod; label: string; icon: typeof Banknote }> = [
  { method: "cash", label: "Készpénz", icon: Banknote },
  { method: "card", label: "Bankkártya", icon: CreditCard },
  { method: "bank_transfer", label: "Átutalás", icon: Landmark },
  { method: "credit", label: "Utólag fizet", icon: Clock3 },
];

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: unknown) {
  return `${numberValue(value).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "–";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function bucharestDate() {
  try {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function currentMonth() {
  return bucharestDate().slice(0, 7);
}

function createRequestKey(prefix = "reservation") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function exactMatch(item: AifShopSaleCatalogItem, query: string) {
  const wanted = query.trim().toLowerCase();
  return [item.barcode, item.internalSku, item.productCode].filter(Boolean).some((value) => String(value).trim().toLowerCase() === wanted);
}

export default function AllInShopReservations({ open, actor, locationCode, locationName, onClose }: Props) {
  const [mode, setMode] = useState<ViewMode>("active");
  const [items, setItems] = useState<AifShopReservation[]>([]);
  const [historyItems, setHistoryItems] = useState<AifShopReservation[]>([]);
  const [historyMonth, setHistoryMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<AifShopSaleCatalogItem[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<AifShopCustomer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<AifShopCustomer | null>(null);
  const [expiresOn, setExpiresOn] = useState(bucharestDate());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<AifShopReservation | null>(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [fulfillTarget, setFulfillTarget] = useState<AifShopReservation | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<AifShopSalePaymentMethod>("cash");
  const [fulfillBusy, setFulfillBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const searchRef = useRef<HTMLInputElement | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const requestKeyRef = useRef("");

  const today = useMemo(() => bucharestDate(), [clock]);
  const draftTotal = useMemo(() => draftLines.reduce((sum, line) => sum + numberValue(line.sellPrice) * line.quantity, 0), [draftLines]);
  const draftQty = draftLines.reduce((sum, line) => sum + line.quantity, 0);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMode("active");
    setError("");
    setSuccess("");
    void loadActive();
  }, [open, locationCode]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (releaseTarget && !releaseBusy) return setReleaseTarget(null);
      if (fulfillTarget && !fulfillBusy) return setFulfillTarget(null);
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [fulfillBusy, fulfillTarget, onClose, open, releaseBusy, releaseTarget]);

  useEffect(() => {
    if (!open || mode !== "new") return;
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    const value = query.trim();
    if (value.length < 8 || /\s/.test(value)) return;
    scanTimerRef.current = window.setTimeout(() => {
      scanTimerRef.current = null;
      void searchProducts(value, true);
    }, 180);
    return () => {
      if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    };
  }, [mode, open, query]);

  async function loadActive() {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifShopReservations({ location: locationCode, mode: "active" });
      setItems(response.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A félretett termékek nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(month = historyMonth) {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifShopReservations({ location: locationCode, mode: "history", month });
      setHistoryItems(response.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A félretételi előzmény nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setMode("new");
    setQuery("");
    setProducts([]);
    setDraftLines([]);
    setCustomerQuery("");
    setCustomers([]);
    setSelectedCustomer(null);
    setExpiresOn(today);
    setNote("");
    setError("");
    setSuccess("");
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  async function searchProducts(value = query, autoAdd = false) {
    const search = value.trim();
    if (!search) return;
    setProductLoading(true);
    setError("");
    try {
      const response = await apiAifShopSaleCatalog({ location: locationCode, search, limit: 60 });
      const next = response.items || [];
      setProducts(next);
      if (autoAdd) {
        const exact = next.filter((item) => exactMatch(item, search));
        if (exact.length === 1) {
          addLine(exact[0]);
          setQuery("");
          setProducts([]);
          window.setTimeout(() => searchRef.current?.focus(), 0);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A termékkeresés nem sikerült.");
    } finally {
      setProductLoading(false);
    }
  }

  function addLine(item: AifShopSaleCatalogItem) {
    const available = numberValue(item.availableQty);
    if (available <= 0) return setError("Ebből a termékből nincs szabad készlet.");
    setDraftLines((current) => {
      const existing = current.find((line) => line.variantId === item.variantId);
      if (!existing) return [...current, { ...item, quantity: 1 }];
      if (existing.quantity >= available) {
        setError(`Legfeljebb ${available} db tehető félre ebből a termékből.`);
        return current;
      }
      return current.map((line) => line.variantId === item.variantId ? { ...line, quantity: line.quantity + 1 } : line);
    });
  }

  function setQty(variantId: string, qty: number) {
    setDraftLines((current) => current.flatMap((line) => {
      if (line.variantId !== variantId) return [line];
      if (qty <= 0) return [];
      return [{ ...line, quantity: Math.min(numberValue(line.availableQty), qty) }];
    }));
  }

  async function searchCustomers(value = customerQuery) {
    setCustomerLoading(true);
    setError("");
    try {
      const response = await apiAifListShopCustomers({ location: locationCode, search: value.trim(), limit: 60 });
      setCustomers(response.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A klienslista nem tölthető be.");
    } finally {
      setCustomerLoading(false);
    }
  }

  async function saveReservation() {
    if (!selectedCustomer) return setError("Válassz klienst a félretételhez.");
    if (!draftLines.length) return setError("Adj hozzá legalább egy terméket.");
    if (!expiresOn) return setError("Add meg, meddig tartjuk félre.");
    setSaving(true);
    setError("");
    try {
      const response = await apiAifCreateShopReservation({
        location: locationCode,
        customerId: selectedCustomer.id,
        expiresOn,
        note: note.trim() || null,
        lines: draftLines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      });
      setSuccess(`${response.item.reservationNumber} félretétel rögzítve ${selectedCustomer.fullName} részére.`);
      setMode("active");
      await loadActive();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A félretétel nem menthető.");
    } finally {
      setSaving(false);
    }
  }

  async function releaseReservation() {
    if (!releaseTarget) return;
    setReleaseBusy(true);
    setError("");
    try {
      await apiAifReleaseShopReservation(releaseTarget.id, { location: locationCode });
      setSuccess(`${releaseTarget.reservationNumber} visszakerült a szabad készletbe.`);
      setReleaseTarget(null);
      await loadActive();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A félretétel feloldása nem sikerült.");
    } finally {
      setReleaseBusy(false);
    }
  }

  async function fulfillReservation() {
    if (!fulfillTarget) return;
    setFulfillBusy(true);
    setError("");
    if (!requestKeyRef.current) requestKeyRef.current = createRequestKey("reservation-sale");
    try {
      const result = await apiAifFulfillShopReservation(fulfillTarget.id, {
        location: locationCode,
        paymentMethod,
        idempotencyKey: requestKeyRef.current,
      });
      setSuccess(`${result.saleNumber} eladás rögzítve • ${result.attributedTo || fulfillTarget.createdBy || actor} nevére.`);
      requestKeyRef.current = "";
      setFulfillTarget(null);
      await loadActive();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A félretett termék eladása nem sikerült.");
    } finally {
      setFulfillBusy(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  const shownItems = mode === "history" ? historyItems : items;

  return createPortal(
    <div className="fixed inset-0 z-[245] flex items-center justify-center bg-[#111827]/82 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex max-h-[95vh] w-full max-w-[1380px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/36 bg-[#303a4c] text-white shadow-[0_36px_110px_rgba(0,0,0,0.6)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#9be9e5]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><PackageSearch size={24} /></span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Üzleti foglalások</p>
              <h2 className="mt-1 text-xl">Félretett termékek</h2>
              <p className="mt-1 text-xs text-white/45">{locationName} • {actor}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setMode("active"); void loadActive(); }} className={`h-10 rounded-xl border px-3 text-xs ${mode === "active" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.05]"}`}>Aktív</button>
            <button type="button" onClick={openNew} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs ${mode === "new" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.05]"}`}><Plus size={15} /> Új félretétel</button>
            <button type="button" onClick={() => { setMode("history"); void loadHistory(); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs ${mode === "history" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.05]"}`}><History size={15} /> Előzmény</button>
            <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05]"><X size={18} /></button>
          </div>
        </header>

        {error ? <div className="mx-5 mt-4 rounded-2xl border border-rose-300/35 bg-rose-500/16 px-4 py-3 text-sm text-rose-50">{error}</div> : null}
        {success ? <div className="mx-5 mt-4 flex items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-500/14 px-4 py-3 text-sm text-emerald-50"><CheckCircle2 size={18} />{success}</div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {mode === "new" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
              <div className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">1. Termékek</p><h3 className="mt-1 text-lg">Szkenneld vagy keresd ki</h3></div><span className="rounded-full border border-[#7bd7d4]/25 bg-[#2a8d8b]/12 px-3 py-1 text-xs text-[#d7fffd]">{draftQty} db • {formatMoney(draftTotal)}</span></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="relative block"><Barcode className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8ee6e2]" size={21} /><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void searchProducts(e.currentTarget.value, true); }} placeholder="Vonalkód, termékkód, név…" className="h-14 w-full rounded-2xl border border-white/18 bg-[#273243] pl-12 pr-3 text-base outline-none focus:border-[#72d8d4]" /></label>
                  <button type="button" onClick={() => void searchProducts(query, true)} className="inline-flex h-14 items-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm">{productLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />} Keresés</button>
                </div>
                {products.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{products.slice(0, 20).map((item) => <button key={item.variantId} type="button" onClick={() => addLine(item)} className="grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-white/12 bg-[#2c384a] p-3 text-left hover:border-[#72d8d4]/45"><span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-white/95">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain" /> : <ShoppingBag className="text-slate-500" />}</span><span className="min-w-0"><span className="block truncate text-sm">{item.title}</span><span className="mt-1 block text-xs text-white/50">{[item.colorName, item.size, item.productCode].filter(Boolean).join(" • ")}</span><span className="mt-2 block text-xs text-[#d7fffd]">{item.availableQty} db szabad • {formatMoney(item.sellPrice)}</span></span></button>)}</div> : null}
                <div className="mt-4 space-y-2">{draftLines.length ? draftLines.map((line) => <div key={line.variantId} className="grid grid-cols-[58px_1fr_auto] items-center gap-3 rounded-2xl border border-white/12 bg-[#293548] p-3"><span className="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-xl bg-white/95">{line.imageUrl ? <img src={line.imageUrl} alt="" className="h-full w-full object-contain" /> : <ShoppingBag className="text-slate-500" />}</span><div className="min-w-0"><p className="truncate text-sm">{line.title}</p><p className="mt-1 text-xs text-white/48">{[line.colorName, line.size, line.productCode].filter(Boolean).join(" • ")}</p><p className="mt-1 text-sm text-[#d7fffd]">{formatMoney(numberValue(line.sellPrice) * line.quantity)}</p></div><div className="flex items-center gap-2"><div className="inline-grid grid-cols-[38px_42px_38px] overflow-hidden rounded-xl border border-white/14 bg-[#253144]"><button onClick={() => setQty(line.variantId, line.quantity - 1)} className="grid h-10 place-items-center"><Minus size={15} /></button><span className="grid h-10 place-items-center border-x border-white/10">{line.quantity}</span><button onClick={() => setQty(line.variantId, line.quantity + 1)} className="grid h-10 place-items-center"><Plus size={15} /></button></div><button onClick={() => setQty(line.variantId, 0)} className="grid h-10 w-10 place-items-center rounded-xl border border-rose-300/50 bg-rose-600"><Trash2 size={15} /></button></div></div>) : <div className="rounded-2xl border border-dashed border-white/14 py-10 text-center text-sm text-white/40">Még nincs kiválasztott termék.</div>}</div>
              </div>

              <aside className="space-y-3">
                <div className="rounded-[24px] border border-white/14 bg-[#374357] p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">2. Kliens</p>{selectedCustomer ? <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/14 p-3"><UserRound className="text-[#8ee6e2]" /><div className="min-w-0 flex-1"><p className="truncate">{selectedCustomer.fullName}</p><p className="text-xs text-white/50">{selectedCustomer.phone || "–"}</p></div><button onClick={() => setSelectedCustomer(null)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/14"><X size={15} /></button></div> : <><div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void searchCustomers(e.currentTarget.value); }} placeholder="Név vagy telefonszám" className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 outline-none focus:border-[#72d8d4]" /><button onClick={() => void searchCustomers()} className="grid h-12 w-12 place-items-center rounded-xl border border-[#9be9e5]/40 bg-[#2a8d8b]">{customerLoading ? <Loader2 className="animate-spin" size={17} /> : <Search size={17} />}</button></div><div className="mt-2 max-h-[230px] space-y-1 overflow-y-auto">{customers.map((customer) => <button key={customer.id} onClick={() => setSelectedCustomer(customer)} className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-[#293548] px-3 py-2 text-left hover:border-[#72d8d4]/35"><UserRound size={15} className="text-[#8ee6e2]" /><span className="min-w-0"><span className="block truncate text-sm">{customer.fullName}</span><span className="block text-[11px] text-white/45">{customer.phone || "–"}</span></span></button>)}</div></>}</div>
                <div className="rounded-[24px] border border-white/14 bg-[#374357] p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">3. Meddig tartjuk?</p><label className="mt-3 block"><span className="mb-1.5 block text-xs text-white/50">Lejárat dátuma</span><input type="date" min={today} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="h-12 w-full rounded-xl border border-white/16 bg-[#273243] px-3 outline-none focus:border-[#72d8d4]" /></label><label className="mt-3 block"><span className="mb-1.5 block text-xs text-white/50">Megjegyzés</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-white/16 bg-[#273243] px-3 py-3 outline-none focus:border-[#72d8d4]" placeholder="Pl. délután jön érte…" /></label><div className="mt-3 rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 px-3 py-2 text-xs leading-relaxed text-[#d7fffd]/75">A lejárat napján pirosra vált, de a rendszer nem teszi vissza automatikusan készletre. A félretett darab addig nem eladható másnak.</div></div>
                <button type="button" onClick={() => void saveReservation()} disabled={saving || !selectedCustomer || !draftLines.length} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-base disabled:opacity-45">{saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Félretétel rögzítése</button>
              </aside>
            </div>
          ) : mode === "history" ? (
            <div><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Visszanézés</p><h3 className="mt-1 text-lg">Korábbi félretételek</h3></div><div className="flex gap-2"><input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)} className="h-11 rounded-xl border border-white/16 bg-[#293548] px-3" /><button onClick={() => void loadHistory(historyMonth)} className="h-11 rounded-xl border border-[#9be9e5]/40 bg-[#2a8d8b] px-4 text-sm">Betöltés</button></div></div>{loading ? <div className="py-20 text-center text-white/50"><Loader2 className="mx-auto animate-spin" /></div> : <ReservationGrid reservations={shownItems} today={today} history />}</div>
          ) : loading ? (
            <div className="py-20 text-center text-white/50"><Loader2 className="mx-auto animate-spin" /></div>
          ) : (
            <ReservationGrid reservations={shownItems} today={today} onFulfill={(item) => { requestKeyRef.current = ""; setPaymentMethod("cash"); setFulfillTarget(item); }} onRelease={setReleaseTarget} />
          )}
        </div>
      </section>

      {releaseTarget ? <div className="fixed inset-0 z-[270] grid place-items-center bg-slate-950/78 px-4 backdrop-blur-sm"><section className="w-full max-w-[520px] overflow-hidden rounded-[26px] border border-rose-300/35 bg-[#303a4c] text-white"><header className="border-b border-white/12 bg-gradient-to-r from-[#4a2632] to-[#303a4c] px-5 py-4"><h3 className="text-xl">Vissza a szabad készletbe?</h3><p className="mt-1 text-xs text-white/50">{releaseTarget.reservationNumber} • {releaseTarget.customer.name}</p></header><div className="p-5 text-sm text-white/70">A termékek újra eladhatók lesznek. A félretétel előzménye megmarad.</div><footer className="flex justify-end gap-2 border-t border-white/12 px-5 py-4"><button disabled={releaseBusy} onClick={() => setReleaseTarget(null)} className="h-11 rounded-xl border border-white/16 px-4">Mégse</button><button disabled={releaseBusy} onClick={() => void releaseReservation()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-300/50 bg-rose-600 px-5">{releaseBusy ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />} Vissza készletre</button></footer></section></div> : null}

      {fulfillTarget ? <div className="fixed inset-0 z-[270] grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm"><section className="w-full max-w-[600px] overflow-hidden rounded-[28px] border border-[#9be9e5]/38 bg-[#303a4c] text-white"><header className="border-b border-white/12 bg-gradient-to-r from-[#1f5557] to-[#2a8d8b] px-5 py-4"><p className="text-[10px] uppercase tracking-[0.15em] text-white/60">Félretett termék átvétele</p><h3 className="mt-1 text-xl">{fulfillTarget.customer.name}</h3><p className="mt-1 text-sm text-white/70">{fulfillTarget.totalQty} db • {formatMoney(fulfillTarget.totalValue)}</p></header><div className="p-5"><div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/10 p-3 text-sm"><p>Az eladás <strong>{fulfillTarget.createdBy || actor}</strong> nevére kerül.</p><p className="mt-1 text-xs text-white/55">A fizetést most {actor} kezeli; a kassza az ő műszakában jelenik meg.</p></div><p className="mt-4 text-[10px] uppercase tracking-[0.12em] text-white/45">Fizetési mód</p><div className="mt-2 grid grid-cols-2 gap-2">{PAYMENT_OPTIONS.map((option) => { const Icon=option.icon; const active=paymentMethod===option.method; return <button key={option.method} onClick={() => { setPaymentMethod(option.method); requestKeyRef.current=""; }} className={`min-h-14 rounded-2xl border p-3 text-left ${active ? "border-[#9be9e5]/55 bg-[#2a8d8b]" : "border-white/14 bg-[#293548]"}`}><span className="flex items-center gap-2 text-sm"><Icon size={17} />{option.label}</span></button>; })}</div></div><footer className="flex justify-end gap-2 border-t border-white/12 bg-[#293548] px-5 py-4"><button disabled={fulfillBusy} onClick={() => setFulfillTarget(null)} className="h-11 rounded-xl border border-white/16 px-4">Mégse</button><button disabled={fulfillBusy} onClick={() => void fulfillReservation()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5">{fulfillBusy ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />} Eladás lezárása</button></footer></section></div> : null}
    </div>,
    document.body,
  );
}

function ReservationGrid({ reservations, today, history = false, onFulfill, onRelease }: { reservations: AifShopReservation[]; today: string; history?: boolean; onFulfill?: (item: AifShopReservation) => void; onRelease?: (item: AifShopReservation) => void }) {
  if (!reservations.length) return <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/14 bg-black/5 text-center text-white/42"><PackageSearch size={40} /><p className="mt-3 text-base">Nincs megjeleníthető félretétel.</p></div>;
  return <div className="grid gap-3 lg:grid-cols-2">{reservations.map((item) => {
    const expired = item.status === "active" && Boolean(item.expiresOn && item.expiresOn <= today);
    return <article key={item.id} className={`overflow-hidden rounded-[24px] border ${expired ? "border-rose-300/55 bg-[#4a313d]" : "border-white/14 bg-[#374357]"}`}><div className={`flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 ${expired ? "border-rose-200/20 bg-rose-500/10" : "border-white/10 bg-[#303b4e]"}`}><div><p className="text-sm">{item.reservationNumber}</p><p className="mt-1 flex flex-wrap gap-2 text-[11px] text-white/48"><span className="inline-flex items-center gap-1"><UserRound size={12} />{item.customer.name}</span><span>{item.customer.phone || "–"}</span><span>Felvette: {item.createdBy || "–"}</span></p></div><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] ${expired ? "border-rose-200/55 bg-rose-600 text-white" : item.status === "active" ? "border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]" : "border-white/14 bg-black/10 text-white/55"}`}><CalendarDays size={12} />{expired ? (item.expiresOn === today ? "MA LEJÁR" : `LEJÁRT • ${item.expiresOn}`) : item.status === "active" ? `Lejár: ${item.expiresOn || "–"}` : item.status}</span></div><div className="space-y-2 p-3">{item.lines.map((line) => <div key={line.id} className="grid grid-cols-[58px_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-[#293548] p-3"><span className="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-xl bg-white/95">{line.imageUrl ? <img src={line.imageUrl} alt="" className="h-full w-full object-contain" /> : <ShoppingBag className="text-slate-500" />}</span><div className="min-w-0"><p className="truncate text-sm">{line.title}</p><p className="mt-1 text-[11px] text-white/48">{[line.colorName,line.size,line.productCode].filter(Boolean).join(" • ")}</p></div><div className="text-right"><p className="text-lg text-[#d7fffd]">{line.quantity} db</p><p className="text-xs text-white/48">{formatMoney(line.unitPrice)}</p></div></div>)}</div><div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/5 px-4 py-3"><div><p className="text-[10px] text-white/42">{formatDateTime(item.createdAt)}</p><p className="mt-1 text-base text-[#d7fffd]">{item.totalQty} db • {formatMoney(item.totalValue)}</p></div>{!history && item.status === "active" ? <div className="flex gap-2"><button onClick={() => onRelease?.(item)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3 text-xs"><Trash2 size={14} /> Vissza készletre</button><button onClick={() => onFulfill?.(item)} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-xs ${expired ? "border-rose-200/55 bg-rose-600" : "border-[#9be9e5]/45 bg-[#2a8d8b]"}`}><CheckCircle2 size={14} /> Átvétel / eladás</button></div> : null}</div></article>;
  })}</div>;
}
