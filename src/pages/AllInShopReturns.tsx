import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Banknote,
  Barcode,
  CheckCircle2,
  CreditCard,
  History,
  Landmark,
  Loader2,
  LockKeyhole,
  Minus,
  PackageSearch,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import {
  apiAifCompleteShopExchange,
  apiAifRequestShopReturnAuthorization,
  apiAifSearchShopReturnSales,
  apiAifShopReturnAuthorizationStatus,
  apiAifShopReturnHistory,
  apiAifShopSaleCatalog,
  apiAifUnlockShopReturnAuthorization,
  type AifShopExchangeHistoryItem,
  type AifShopExchangeResult,
  type AifShopReturnAuthorizationRequest,
  type AifShopReturnSaleMatch,
  type AifShopSaleCatalogItem,
} from "../lib/aif/api";

type Props = {
  open: boolean;
  actor: string;
  locationCode: "main_warehouse" | "magazin_targu_secuiesc";
  locationName: string;
  onClose: () => void;
};

type ReplacementLine = AifShopSaleCatalogItem & { quantity: number };

type AuthorizationState = {
  saleLineId: string;
  item: AifShopReturnAuthorizationRequest;
  code: string;
  status: string;
  unlockToken?: string | null;
  unlockExpiresAt?: string | null;
};

const SETTLEMENT_OPTIONS = [
  { value: "cash", label: "Készpénz", icon: Banknote },
  { value: "card", label: "Bankkártya", icon: CreditCard },
  { value: "bank_transfer", label: "Átutalás", icon: Landmark },
] as const;

type SettlementMethod = (typeof SETTLEMENT_OPTIONS)[number]["value"];

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

function productCode(item: AifShopSaleCatalogItem) {
  return item.productCode || item.modelCode || item.internalSku || item.barcode || "–";
}

function exactCatalogMatch(item: AifShopSaleCatalogItem, query: string) {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return false;
  return [item.barcode, item.internalSku, item.productCode]
    .filter(Boolean)
    .some((value) => String(value).trim().toLowerCase() === wanted);
}

function createRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `exchange-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function SaleProductImage({ item }: { item: AifShopReturnSaleMatch }) {
  return (
    <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/14 bg-white/95">
      {item.product.imageUrl ? (
        <img src={item.product.imageUrl} alt="" className="h-full w-full object-contain" />
      ) : (
        <PackageSearch size={28} className="text-[#526173]" />
      )}
    </span>
  );
}

export default function AllInShopReturns({ open, actor, locationCode, locationName, onClose }: Props) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [matches, setMatches] = useState<AifShopReturnSaleMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchRan, setSearchRan] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchTimerRef = useRef<number | null>(null);

  const [authorization, setAuthorization] = useState<AuthorizationState | null>(null);
  const [authorizationBusy, setAuthorizationBusy] = useState(false);

  const [selectedSource, setSelectedSource] = useState<AifShopReturnSaleMatch | null>(null);
  const [selectedAuthorizationId, setSelectedAuthorizationId] = useState<string | null>(null);
  const [selectedUnlockToken, setSelectedUnlockToken] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState(1);

  const [replacementQuery, setReplacementQuery] = useState("");
  const [replacementResults, setReplacementResults] = useState<AifShopSaleCatalogItem[]>([]);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementCart, setReplacementCart] = useState<ReplacementLine[]>([]);
  const replacementInputRef = useRef<HTMLInputElement | null>(null);
  const replacementTimerRef = useRef<number | null>(null);

  const [settlementMethod, setSettlementMethod] = useState<SettlementMethod>("cash");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<AifShopExchangeResult | null>(null);
  const requestKeyRef = useRef("");

  const [history, setHistory] = useState<AifShopExchangeHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const returnCredit = useMemo(
    () => numberValue(selectedSource?.unitPrice) * returnQty,
    [returnQty, selectedSource?.unitPrice],
  );
  const replacementTotal = useMemo(
    () => replacementCart.reduce((sum, item) => sum + numberValue(item.sellPrice) * item.quantity, 0),
    [replacementCart],
  );
  const difference = Math.round((replacementTotal - returnCredit + Number.EPSILON) * 100) / 100;
  const settlementDirection = difference > 0.005 ? "in" : difference < -0.005 ? "out" : "none";

  function cancelSearchTimer() {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }

  function cancelReplacementTimer() {
    if (replacementTimerRef.current !== null) {
      window.clearTimeout(replacementTimerRef.current);
      replacementTimerRef.current = null;
    }
  }

  function invalidateRequest() {
    requestKeyRef.current = "";
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await apiAifShopReturnHistory({ location: locationCode, limit: 60 });
      setHistory(response.items || []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function searchSales(value = searchQuery) {
    const query = value.trim();
    cancelSearchTimer();
    if (!query) {
      setMatches([]);
      setSearchRan(false);
      return;
    }
    setSearchLoading(true);
    setSearchRan(true);
    setError("");
    setNotice("");
    setAuthorization(null);
    try {
      const response = await apiAifSearchShopReturnSales({ location: locationCode, search: query, limit: 100 });
      setMatches(response.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A korábbi eladások nem tölthetők be.");
      setMatches([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function requestAuthorization(item: AifShopReturnSaleMatch) {
    setAuthorizationBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiAifRequestShopReturnAuthorization({ location: locationCode, saleLineId: item.saleLineId });
      if (!response.required || !response.item) {
        selectSource(item);
        return;
      }
      setAuthorization({
        saleLineId: item.saleLineId,
        item: response.item,
        code: "",
        status: response.item.status || "pending",
      });
      setNotice(`${response.item.sourceLocation.name} üzletében megjelent az egyszer használható 4 számjegyű feloldókód.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az árlekérés nem indítható el.");
    } finally {
      setAuthorizationBusy(false);
    }
  }

  async function unlockAuthorization() {
    if (!authorization || !/^\d{4}$/.test(authorization.code)) {
      setError("Írd be a másik üzlettől kapott 4 számjegyű kódot.");
      return;
    }
    setAuthorizationBusy(true);
    setError("");
    try {
      const response = await apiAifUnlockShopReturnAuthorization(authorization.item.id, {
        location: locationCode,
        code: authorization.code,
      });
      setMatches((current) => current.map((item) => item.saleLineId === response.item.saleLineId ? response.item : item));
      setAuthorization((current) => current ? {
        ...current,
        status: "unlocked",
        unlockToken: response.unlockToken,
        unlockExpiresAt: response.unlockExpiresAt,
      } : current);
      selectSource(response.item, authorization.item.id, response.unlockToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A feloldókód ellenőrzése nem sikerült.");
    } finally {
      setAuthorizationBusy(false);
    }
  }

  function selectSource(item: AifShopReturnSaleMatch, authorizationId: string | null = null, unlockToken: string | null = null) {
    if (item.eligible === false) {
      setError("Ehhez az eredeti eladáshoz még nyitott tartozás tartozik. A csere előtt előbb rendezd a tartozást.");
      return;
    }
    if (!item.priceVisible || item.unitPrice === null || item.unitPrice === undefined) {
      setError("Az eredeti eladási ár még nincs feloldva.");
      return;
    }
    setSelectedSource(item);
    setSelectedAuthorizationId(authorizationId);
    setSelectedUnlockToken(unlockToken);
    setReturnQty(1);
    setReplacementQuery("");
    setReplacementResults([]);
    setReplacementCart([]);
    setSettlementMethod("cash");
    setNote("");
    setError("");
    setNotice("");
    invalidateRequest();
    window.setTimeout(() => replacementInputRef.current?.focus(), 100);
  }

  function resetWorkflow({ keepSearch = false } = {}) {
    setSelectedSource(null);
    setSelectedAuthorizationId(null);
    setSelectedUnlockToken(null);
    setReturnQty(1);
    setReplacementQuery("");
    setReplacementResults([]);
    setReplacementCart([]);
    setSettlementMethod("cash");
    setNote("");
    setAuthorization(null);
    setError("");
    setNotice("");
    invalidateRequest();
    if (!keepSearch) {
      setSearchQuery("");
      setMatches([]);
      setSearchRan(false);
    }
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  async function searchReplacement(value = replacementQuery, autoAddExact = false) {
    const query = value.trim();
    cancelReplacementTimer();
    if (!query) {
      setReplacementResults([]);
      return;
    }
    setReplacementLoading(true);
    setError("");
    try {
      const response = await apiAifShopSaleCatalog({ location: locationCode, search: query, limit: 80 });
      const items = response.items || [];
      setReplacementResults(items);
      if (autoAddExact) {
        const exact = items.filter((item) => exactCatalogMatch(item, query));
        if (exact.length === 1) {
          addReplacement(exact[0]);
          setReplacementQuery("");
          setReplacementResults([]);
          window.setTimeout(() => replacementInputRef.current?.focus(), 0);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A csere-termék keresése nem sikerült.");
    } finally {
      setReplacementLoading(false);
    }
  }

  function addReplacement(item: AifShopSaleCatalogItem) {
    const available = numberValue(item.availableQty);
    if (available <= 0) {
      setError("Ebből a termékből nincs elérhető készlet ebben az üzletben.");
      return;
    }
    invalidateRequest();
    setReplacementCart((current) => {
      const existing = current.find((line) => line.variantId === item.variantId);
      if (existing) {
        if (existing.quantity >= available) {
          setError(`Legfeljebb ${available} db adható ehhez a cseréhez.`);
          return current;
        }
        return current.map((line) => line.variantId === item.variantId ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { ...item, quantity: 1 }];
    });
  }

  function setReplacementQty(variantId: string, next: number) {
    invalidateRequest();
    setReplacementCart((current) => current.flatMap((line) => {
      if (line.variantId !== variantId) return [line];
      if (next <= 0) return [];
      return [{ ...line, quantity: Math.min(numberValue(line.availableQty), next) }];
    }));
  }

  async function completeExchange() {
    if (!selectedSource) return;
    if (returnQty <= 0 || returnQty > selectedSource.remainingQty) {
      setError(`Legfeljebb ${selectedSource.remainingQty} db vehető vissza ebből a tételből.`);
      return;
    }
    setSubmitting(true);
    setError("");
    if (!requestKeyRef.current) requestKeyRef.current = createRequestKey();
    try {
      const result = await apiAifCompleteShopExchange({
        location: locationCode,
        saleLineId: selectedSource.saleLineId,
        returnedQty: returnQty,
        replacements: replacementCart.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        settlementMethod: settlementDirection === "none" ? null : settlementMethod,
        authorizationId: selectedAuthorizationId,
        unlockToken: selectedUnlockToken,
        note: note.trim() || null,
        idempotencyKey: requestKeyRef.current,
      });
      setSuccess(result);
      requestKeyRef.current = "";
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A visszáru/csere lezárása nem sikerült.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setError("");
    setNotice("");
    setSearchQuery("");
    setMatches([]);
    setSearchRan(false);
    setAuthorization(null);
    setSuccess(null);
    resetWorkflow();
    void loadHistory();
  }, [locationCode, open]);

  useEffect(() => {
    if (!open || selectedSource) return;
    cancelSearchTimer();
    const value = searchQuery.trim();
    if (value.length < 8 || /\s/.test(value)) return;
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = null;
      void searchSales(value);
    }, 180);
    return cancelSearchTimer;
  }, [open, searchQuery, selectedSource]);

  useEffect(() => {
    if (!open || !selectedSource) return;
    cancelReplacementTimer();
    const value = replacementQuery.trim();
    if (value.length < 8 || /\s/.test(value)) return;
    replacementTimerRef.current = window.setTimeout(() => {
      replacementTimerRef.current = null;
      void searchReplacement(value, true);
    }, 180);
    return cancelReplacementTimer;
  }, [open, replacementQuery, selectedSource]);

  useEffect(() => {
    if (!authorization || authorization.status !== "pending") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await apiAifShopReturnAuthorizationStatus(authorization.item.id, { location: locationCode });
        if (response.status === "rejected" || response.status === "expired") {
          setAuthorization((current) => current ? { ...current, status: response.status } : current);
          setError(response.status === "rejected" ? "A másik üzlet elutasította az árlekérést." : "A feloldókód lejárt. Kérj új kódot.");
        }
      } catch {
        // A kézi kódbevitel ettől még működjön.
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [authorization?.item.id, authorization?.status, locationCode]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (success) {
        setSuccess(null);
        resetWorkflow();
        return;
      }
      if (selectedSource) {
        resetWorkflow({ keepSearch: true });
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      cancelSearchTimer();
      cancelReplacementTimer();
    };
  }, [onClose, open, selectedSource, success]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[270] flex items-center justify-center bg-[#111827]/84 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex max-h-[96vh] w-full max-w-[1480px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_40px_120px_rgba(0,0,0,0.62)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] via-[#28565c] to-[#2a8d8b] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/12">
              <RotateCcw size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.17em] text-white/58">Vevői visszáru és csere</p>
              <h2 className="mt-1 truncate text-xl">Visszáru központ</h2>
              <p className="mt-1 truncate text-xs text-white/62">{actor} • {locationName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen((value) => !value)}
              className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm ${historyOpen ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/16 bg-black/10 hover:bg-white/10"}`}
            >
              <History size={17} /> Előzmények
            </button>
            <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-black/10 hover:bg-white/12"><X size={19} /></button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error ? <div className="mb-4 rounded-2xl border border-rose-300/40 bg-rose-500/16 px-4 py-3 text-sm text-rose-50">{error}</div> : null}
          {notice ? <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/14 px-4 py-3 text-sm text-[#d7fffd]"><ShieldCheck size={18} className="mt-0.5 shrink-0" />{notice}</div> : null}

          {historyOpen ? (
            <section className="mb-4 rounded-[24px] border border-white/14 bg-[#374357] p-4">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Visszanézhető napló</p><h3 className="mt-1 text-lg">Legutóbbi visszáruk és cserék</h3></div>
                <button type="button" onClick={() => void loadHistory()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/14 bg-[#293548] px-3 text-xs hover:bg-[#354153]"><RefreshCw className={historyLoading ? "animate-spin" : ""} size={15} /> Frissítés</button>
              </div>
              <div className="mt-3 max-h-[310px] space-y-2 overflow-y-auto pr-1">
                {history.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-2xl border border-white/10 bg-[#293548] p-3 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                    <div className="min-w-0"><p className="truncate text-sm">{item.exchangeNumber} • {item.sourceProduct.title}</p><p className="mt-1 text-[11px] text-white/45">{formatDateTime(item.createdAt)} • {item.actor || "–"} • Eredet: {item.sourceLocation.name}</p></div>
                    <div><p className="text-[9px] uppercase text-white/38">Visszavett érték</p><p className="mt-1 text-sm text-[#d7fffd]">{formatMoney(item.returnCredit)}</p></div>
                    <div><p className="text-[9px] uppercase text-white/38">Új termékek</p><p className="mt-1 text-sm">{formatMoney(item.replacementTotal)}</p></div>
                    <div className={`rounded-xl border px-3 py-2 text-right ${item.difference > 0 ? "border-amber-200/25 bg-amber-400/10 text-amber-50" : item.difference < 0 ? "border-sky-200/25 bg-sky-400/10 text-sky-50" : "border-[#7bd7d4]/25 bg-[#2a8d8b]/12 text-[#d7fffd]"}`}>
                      <p className="text-[9px] uppercase opacity-60">Különbözet</p><p className="mt-1 text-sm">{formatMoney(item.difference)}</p>
                    </div>
                  </div>
                ))}
                {!historyLoading && !history.length ? <div className="rounded-2xl border border-dashed border-white/12 py-8 text-center text-sm text-white/42">Még nincs rögzített visszáru vagy csere ebben az üzletben.</div> : null}
              </div>
            </section>
          ) : null}

          {!selectedSource ? (
            <>
              <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><p className="text-[10px] uppercase tracking-[0.13em] text-white/42">1. lépés</p><h3 className="mt-1 text-lg">Olvasd be a visszahozott terméket</h3><p className="mt-1 text-xs text-white/46">A rendszer mindkét üzlet korábbi eladásait megkeresi, soronként.</p></div>
                  <span className="rounded-full border border-white/12 bg-black/10 px-3 py-1 text-[10px] text-white/50">Árak üzletenként védve</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="relative block">
                    <Barcode className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#91e5e1]" size={23} />
                    <input
                      ref={searchInputRef}
                      autoFocus
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void searchSales(event.currentTarget.value); }}
                      placeholder="Vonalkód / termékkód beolvasása…"
                      className="h-16 w-full rounded-2xl border border-white/20 bg-[#273243] pl-14 pr-4 text-lg text-white outline-none placeholder:text-white/35 focus:border-[#72d8d4] focus:ring-4 focus:ring-[#2a8d8b]/18"
                    />
                  </label>
                  <button type="button" disabled={searchLoading} onClick={() => void searchSales()} className="inline-flex h-16 min-w-[150px] items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-base hover:bg-[#319c99] disabled:opacity-55">
                    {searchLoading ? <Loader2 className="animate-spin" size={21} /> : <Search size={21} />} Keresés
                  </button>
                </div>
              </section>

              {searchLoading ? <div className="flex min-h-[360px] items-center justify-center gap-3 text-white/55"><Loader2 className="animate-spin" /> Korábbi eladások keresése…</div> : matches.length ? (
                <div className="mt-4 space-y-3">
                  {matches.map((item) => {
                    const authHere = authorization?.saleLineId === item.saleLineId ? authorization : null;
                    const crossLocked = !item.sameStore && !item.priceVisible;
                    return (
                      <article key={item.saleLineId} className={`rounded-[22px] border p-4 ${item.sameStore ? "border-[#7bd7d4]/26 bg-[#374357]" : "border-amber-200/20 bg-[#3d414b]"}`}>
                        <div className="grid gap-4 lg:grid-cols-[76px_minmax(0,1fr)_minmax(290px,0.7fr)] lg:items-center">
                          <SaleProductImage item={item} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-base">{item.product.title}</h3>
                              <span className={`rounded-full border px-2 py-1 text-[9px] ${item.sameStore ? "border-[#9be9e5]/30 bg-[#2a8d8b]/14 text-[#d7fffd]" : "border-amber-200/25 bg-amber-400/10 text-amber-50"}`}>{item.saleLocation.name}</span>
                            </div>
                            <p className="mt-1 truncate text-xs text-white/52">{[item.product.brandName, item.product.colorName, item.product.size].filter(Boolean).join(" • ") || "–"}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/52">
                              <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">{item.product.productCode || item.product.barcode || "kód nélkül"}</span>
                              <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">{item.saleNumber}</span>
                              <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">{formatDateTime(item.soldAt)}</span>
                            </div>
                            <p className="mt-2 flex items-center gap-2 text-xs text-white/55"><UserRound size={14} className="text-[#8ee6e2]" />{item.customerName || "Kliens nem volt hozzárendelve"}</p>
                            <p className="mt-1 text-[11px] text-white/42">Eladó: {item.actor || "–"} • Visszavehető: {item.remainingQty} / {item.quantity} db</p>
                            {item.eligible === false ? <p className="mt-2 inline-flex rounded-lg border border-rose-300/30 bg-rose-500/14 px-2 py-1 text-[10px] text-rose-50">{item.balanceDue !== null && item.balanceDue !== undefined ? `Nyitott tartozás: ${formatMoney(item.balanceDue)} • csere előtt rendezendő` : "Ehhez az eladáshoz nyitott tartozás tartozik • csere előtt rendezendő"}</p> : null}
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                            {item.priceVisible ? (
                              <>
                                <div className="grid grid-cols-2 gap-2">
                                  <div><p className="text-[9px] uppercase tracking-[0.09em] text-white/38">Eredeti ár</p><p className="mt-1 text-sm text-white/65">{formatMoney(item.listPrice)}</p></div>
                                  <div><p className="text-[9px] uppercase tracking-[0.09em] text-white/38">Ténylegesen fizetett / db</p><p className="mt-1 text-lg text-[#d7fffd]">{formatMoney(item.unitPrice)}</p></div>
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-3"><span className="text-xs text-white/50">Kedvezmény</span><span className="rounded-lg border border-amber-200/20 bg-amber-400/10 px-2 py-1 text-sm text-amber-50">{numberValue(item.discountPercent).toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%</span></div>
                                <button type="button" disabled={item.eligible === false} onClick={() => selectSource(item)} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] text-sm hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={17} /> {item.eligible === false ? "Tartozás rendezése szükséges" : "Ezt veszem vissza"}</button>
                              </>
                            ) : (
                              <>
                                <div className="flex items-start gap-3 rounded-xl border border-amber-200/18 bg-amber-400/8 px-3 py-2.5">
                                  <LockKeyhole size={18} className="mt-0.5 shrink-0 text-amber-100" />
                                  <div><p className="text-sm text-amber-50">Másik üzlet ára védett</p><p className="mt-1 text-[11px] leading-relaxed text-amber-100/62">Az eladás látszik, az ár és kedvezmény csak egyszer használható feloldókóddal jelenik meg.</p></div>
                                </div>
                                {!authHere ? (
                                  <button type="button" disabled={authorizationBusy || item.eligible === false} onClick={() => void requestAuthorization(item)} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-200/28 bg-amber-400/12 text-sm text-amber-50 hover:bg-amber-400/18 disabled:cursor-not-allowed disabled:opacity-45"><ShieldCheck size={17} /> {item.eligible === false ? "Tartozás rendezése szükséges" : "Ár lekérése"}</button>
                                ) : authHere.status === "pending" ? (
                                  <div className="mt-3">
                                    <p className="text-[10px] uppercase tracking-[0.09em] text-white/42">Feloldókód</p>
                                    <div className="mt-1.5 grid grid-cols-[1fr_auto] overflow-hidden rounded-xl border border-[#7bd7d4]/28 bg-[#253144]">
                                      <input
                                        value={authHere.code}
                                        inputMode="numeric"
                                        maxLength={4}
                                        onChange={(event) => setAuthorization((current) => current ? { ...current, code: event.target.value.replace(/\D/g, "").slice(0, 4) } : current)}
                                        onKeyDown={(event) => { if (event.key === "Enter") void unlockAuthorization(); }}
                                        placeholder="0000"
                                        className="h-12 min-w-0 bg-transparent px-4 text-center font-mono text-2xl tracking-[0.28em] outline-none placeholder:text-white/20"
                                      />
                                      <button type="button" disabled={authorizationBusy || authHere.code.length !== 4} onClick={() => void unlockAuthorization()} className="h-12 border-l border-white/10 bg-[#2a8d8b] px-4 text-sm disabled:opacity-45">Feloldás</button>
                                    </div>
                                    <p className="mt-2 text-[10px] text-white/45">A kód a {authHere.item.sourceLocation.name} üzlet adminisztrációjában jelenik meg.</p>
                                  </div>
                                ) : (
                                  <button type="button" onClick={() => { setAuthorization(null); void requestAuthorization(item); }} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/[0.06] text-sm hover:bg-white/[0.1]"><RefreshCw size={16} /> Új kód kérése</button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : searchRan ? (
                <div className="mt-4 flex min-h-[320px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/14 bg-[#273243]/40 text-center text-white/45"><PackageSearch size={40} /><p className="mt-3 text-base text-white/70">Ehhez a kódhoz nincs visszavehető korábbi eladás.</p></div>
              ) : (
                <div className="mt-4 flex min-h-[280px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#7bd7d4]/18 bg-[#273243]/40 text-center"><Barcode size={44} className="text-[#8ee6e2]/55" /><p className="mt-3 text-lg text-white/75">A terméket kell először beolvasni</p><p className="mt-1 text-sm text-white/42">Nem kell bizonylatot keresgélni. A rendszer kilistázza, mikor és hol adták el.</p></div>
              )}
            </>
          ) : (
            <>
              <button type="button" onClick={() => resetWorkflow({ keepSearch: true })} className="mb-3 inline-flex h-10 items-center gap-2 rounded-xl border border-white/14 bg-white/[0.05] px-3 text-xs hover:bg-white/[0.1]"><ArrowLeft size={15} /> Vissza az eladásokhoz</button>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
                <section className="rounded-[24px] border border-[#7bd7d4]/24 bg-[#374357] p-4">
                  <div className="flex items-center gap-3"><SaleProductImage item={selectedSource} /><div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Visszahozott termék</p><h3 className="mt-1 truncate text-lg">{selectedSource.product.title}</h3><p className="mt-1 text-xs text-white/50">{selectedSource.saleNumber} • {selectedSource.saleLocation.name}</p></div></div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[9px] uppercase text-white/38">Eredeti ár / db</p><p className="mt-1 text-sm text-white/58">{formatMoney(selectedSource.listPrice)}</p></div>
                    <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase text-[#d7fffd]/55">Ténylegesen fizetett / db</p><p className="mt-1 text-xl text-[#d7fffd]">{formatMoney(selectedSource.unitPrice)}</p></div>
                    <div className="rounded-2xl border border-amber-200/18 bg-amber-400/8 p-3"><p className="text-[9px] uppercase text-amber-100/50">Eredeti kedvezmény</p><p className="mt-1 text-lg text-amber-50">{numberValue(selectedSource.discountPercent).toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%</p></div>
                    <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[9px] uppercase text-white/38">Kliens</p><p className="mt-1 truncate text-sm">{selectedSource.customerName || "Nem volt hozzárendelve"}</p></div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-[#293548] p-3">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] uppercase tracking-[0.09em] text-white/38">Visszavett mennyiség</p><p className="mt-1 text-xs text-white/45">Még visszavehető: {selectedSource.remainingQty} db</p></div><div className="inline-grid grid-cols-[42px_54px_42px] overflow-hidden rounded-xl border border-white/14 bg-[#253144]"><button type="button" onClick={() => { invalidateRequest(); setReturnQty((q) => Math.max(1, q - 1)); }} className="h-11 hover:bg-white/8"><Minus size={16} className="mx-auto" /></button><span className="inline-flex h-11 items-center justify-center border-x border-white/10 text-lg">{returnQty}</span><button type="button" onClick={() => { invalidateRequest(); setReturnQty((q) => Math.min(selectedSource.remainingQty, q + 1)); }} className="h-11 hover:bg-white/8"><Plus size={16} className="mx-auto" /></button></div></div>
                  </div>

                  <div className="mt-4 rounded-[22px] border border-[#9be9e5]/38 bg-[#244b50] p-4">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[#d7fffd]/58">Levásárolható / visszajáró alap</p>
                    <p className="mt-2 text-4xl tracking-tight text-white">{formatMoney(returnCredit)}</p>
                    <p className="mt-2 text-xs leading-relaxed text-[#d7fffd]/65">Pontosan a korábban ténylegesen kifizetett összeggel számolunk, nem a mostani teljes árral.</p>
                  </div>
                </section>

                <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                  <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">2. lépés</p><h3 className="mt-1 text-lg">Mire cseréli?</h3><p className="mt-1 text-xs text-white/46">Olvasd be az új terméket. Több terméket is hozzáadhatsz.</p></div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label className="relative block"><Barcode className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#91e5e1]" size={21} /><input ref={replacementInputRef} value={replacementQuery} onChange={(event) => setReplacementQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchReplacement(event.currentTarget.value, true); }} placeholder="Új termék vonalkódja…" className="h-14 w-full rounded-2xl border border-white/18 bg-[#273243] pl-12 pr-4 text-base outline-none placeholder:text-white/35 focus:border-[#72d8d4]" /></label>
                    <button type="button" disabled={replacementLoading} onClick={() => void searchReplacement(replacementQuery, true)} className="inline-flex h-14 min-w-[130px] items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/40 bg-[#2a8d8b] px-4 text-sm disabled:opacity-50">{replacementLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />} Keresés</button>
                  </div>

                  {replacementResults.length ? <div className="mt-3 grid max-h-[220px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{replacementResults.map((item) => <button key={item.variantId} type="button" onClick={() => addReplacement(item)} className="grid grid-cols-[58px_1fr_auto] items-center gap-2 rounded-2xl border border-white/10 bg-[#293548] p-2 text-left hover:border-[#72d8d4]/40"><span className="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-xl bg-white/95">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain" /> : <PackageSearch size={22} className="text-[#526173]" />}</span><span className="min-w-0"><span className="block truncate text-sm">{item.title}</span><span className="mt-1 block truncate text-[10px] text-white/45">{[item.colorName, item.size, productCode(item)].filter(Boolean).join(" • ")}</span></span><span className="text-right"><span className="block text-sm text-[#d7fffd]">{formatMoney(item.sellPrice)}</span><span className="mt-1 block text-[10px] text-white/40">{item.availableQty} db</span></span></button>)}</div> : null}

                  <div className="mt-4 space-y-2">
                    {replacementCart.map((line) => (
                      <div key={line.variantId} className="grid grid-cols-[58px_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-[#293548] p-3">
                        <span className="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-xl bg-white/95">{line.imageUrl ? <img src={line.imageUrl} alt="" className="h-full w-full object-contain" /> : <PackageSearch size={22} className="text-[#526173]" />}</span>
                        <div className="min-w-0"><p className="truncate text-sm">{line.title}</p><p className="mt-1 truncate text-[10px] text-white/45">{[line.colorName, line.size, productCode(line)].filter(Boolean).join(" • ")}</p><p className="mt-1 text-sm text-[#d7fffd]">{formatMoney(numberValue(line.sellPrice) * line.quantity)}</p></div>
                        <div className="inline-grid grid-cols-[36px_42px_36px] overflow-hidden rounded-xl border border-white/12 bg-[#253144]"><button type="button" onClick={() => setReplacementQty(line.variantId, line.quantity - 1)} className="h-10 hover:bg-white/8"><Minus size={14} className="mx-auto" /></button><span className="inline-flex h-10 items-center justify-center border-x border-white/10">{line.quantity}</span><button type="button" onClick={() => setReplacementQty(line.variantId, line.quantity + 1)} className="h-10 hover:bg-white/8"><Plus size={14} className="mx-auto" /></button></div>
                      </div>
                    ))}
                    {!replacementCart.length ? <div className="flex min-h-[120px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center text-white/40"><ShoppingBag size={28} /><p className="mt-2 text-xs">Ha nem adsz hozzá új terméket, a folyamat sima visszáruként zárható le.</p></div> : null}
                  </div>
                </section>
              </div>

              <section className="mt-4 rounded-[24px] border border-white/14 bg-[#374357] p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/55">Visszavett érték</p><p className="mt-2 text-2xl text-[#d7fffd]">{formatMoney(returnCredit)}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Új termékek értéke</p><p className="mt-2 text-2xl">{formatMoney(replacementTotal)}</p></div>
                  <div className={`rounded-2xl border p-3 ${difference > 0 ? "border-amber-200/25 bg-amber-400/10" : difference < 0 ? "border-sky-200/25 bg-sky-400/10" : "border-[#7bd7d4]/30 bg-[#2a8d8b]/16"}`}><p className="text-[9px] uppercase tracking-[0.1em] opacity-60">{difference > 0 ? "Még fizetendő" : difference < 0 ? "Visszajár" : "Különbözet"}</p><p className="mt-2 text-3xl">{formatMoney(Math.abs(difference))}</p></div>
                </div>

                {settlementDirection !== "none" ? (
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">{settlementDirection === "in" ? "A különbözet fizetési módja" : "A visszajáró rendezése"}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {SETTLEMENT_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const active = settlementMethod === option.value;
                        return <button key={option.value} type="button" onClick={() => { invalidateRequest(); setSettlementMethod(option.value); }} className={`min-h-14 rounded-2xl border px-4 text-sm ${active ? "border-[#9be9e5]/50 bg-[#2a8d8b]" : "border-white/12 bg-[#293548] hover:bg-[#354153]"}`}><span className="inline-flex items-center gap-2"><Icon size={17} />{option.label}</span></button>;
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/10 px-4 py-3 text-sm text-[#d7fffd]"><CheckCircle2 size={19} /> Az érték pontosan egyezik, nincs pénzügyi különbözet.</div>
                )}

                <input value={note} onChange={(event) => { invalidateRequest(); setNote(event.target.value); }} placeholder="Megjegyzés a visszáruhoz / cseréhez (opcionális)" className="mt-4 h-11 w-full rounded-xl border border-white/14 bg-[#293548] px-3 text-sm outline-none placeholder:text-white/32 focus:border-[#72d8d4]" />

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <p className="max-w-3xl text-xs leading-relaxed text-white/45">A visszahozott termék készlete ebben az üzletben nő, a kiadott csere-termékek készlete csökken. A rendszer az eredeti ténylegesen fizetett árral számol, így a korábbi kedvezmény nem vész el és nem is duplázódik.</p>
                  <button type="button" disabled={submitting} onClick={() => void completeExchange()} className="inline-flex min-h-14 items-center gap-2 rounded-2xl border border-[#a4efeb]/50 bg-gradient-to-r from-[#2a8d8b] to-[#207572] px-6 text-base shadow-[0_12px_26px_rgba(42,141,139,0.22)] hover:brightness-110 disabled:opacity-55">
                    {submitting ? <Loader2 className="animate-spin" size={21} /> : <Receipt size={21} />} {replacementCart.length ? "Csere lezárása" : "Visszáru lezárása"}
                  </button>
                </div>
              </section>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end border-t border-white/12 bg-[#293548] px-5 py-4">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm hover:bg-white/[0.09]"><X size={17} /> Bezárás</button>
        </footer>
      </section>

      {success ? (
        <div className="fixed inset-0 z-[390] flex items-center justify-center bg-[#111827]/82 p-4 backdrop-blur-sm">
          <section className="w-full max-w-[600px] overflow-hidden rounded-[30px] border border-[#9be9e5]/42 bg-[#303a4c] text-white shadow-[0_38px_120px_rgba(0,0,0,0.62)]">
            <div className="p-6 text-center">
              <span className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full border border-[#9be9e5]/45 bg-[#2a8d8b]/24 text-[#d7fffd]"><CheckCircle2 size={42} /></span>
              <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-white/45">Sikeresen lezárva</p>
              <h3 className="mt-2 text-2xl">{success.exchangeNumber}</h3>
              <div className="mt-5 grid grid-cols-3 gap-2 text-left">
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[9px] uppercase text-white/38">Visszavett</p><p className="mt-1 text-lg text-[#d7fffd]">{formatMoney(success.returnCredit)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3"><p className="text-[9px] uppercase text-white/38">Új termék</p><p className="mt-1 text-lg">{formatMoney(success.replacementTotal)}</p></div>
                <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase text-[#d7fffd]/55">Különbözet</p><p className="mt-1 text-lg text-[#d7fffd]">{formatMoney(success.difference)}</p></div>
              </div>
              <button type="button" onClick={() => { setSuccess(null); resetWorkflow(); }} className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] text-base hover:bg-[#319c99]"><Plus size={20} /> Következő visszáru / csere</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
