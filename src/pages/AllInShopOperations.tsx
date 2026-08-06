import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Barcode,
  Boxes,
  CalendarDays,
  Clock3,
  CreditCard,
  Landmark,
  Loader2,
  PackageSearch,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  TriangleAlert,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifShopDailySummary,
  apiAifShopSaleCatalog,
  apiAifShopStockOverview,
  type AifShopDailySummaryResponse,
  type AifShopSaleCatalogItem,
  type AifShopStockOverviewResponse,
} from "../lib/aif/api";

export type AllInShopOperationMode = "search" | "stock" | "summary";

type Props = {
  open: boolean;
  mode: AllInShopOperationMode;
  actor: string;
  locationCode: "main_warehouse" | "magazin_targu_secuiesc";
  locationName: string;
  onClose: () => void;
};

const MODE_META: Record<AllInShopOperationMode, { title: string; eyebrow: string; icon: typeof Search }> = {
  search: { title: "Termék keresése", eyebrow: "Gyors termékellenőrzés", icon: Search },
  stock: { title: "Üzleti készlet", eyebrow: "Aktuális bolti készlet", icon: Boxes },
  summary: { title: "Napi összesítés", eyebrow: "Saját műszak és eladások", icon: Receipt },
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

function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Bucharest" });
}

function shiftIsoDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return todayIso();
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "UTC",
  });
}

function formatTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
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

function ProductImage({ src, title, large = false }: { src?: string | null; title: string; large?: boolean }) {
  return (
    <span className={`group/image relative flex shrink-0 items-center justify-center overflow-visible rounded-2xl border border-white/14 bg-white/95 ${large ? "h-24 w-24" : "h-20 w-20"}`}>
      {src ? (
        <>
          <img src={src} alt="" className="h-full w-full rounded-2xl object-contain" />
          <span className="pointer-events-none absolute left-full top-0 z-[360] ml-3 hidden h-64 w-64 items-center justify-center rounded-[22px] border border-[#9be9e5]/45 bg-white p-3 shadow-[0_28px_90px_rgba(0,0,0,0.46)] group-hover/image:flex">
            <img src={src} alt={title} className="max-h-full max-w-full object-contain" />
          </span>
        </>
      ) : (
        <PackageSearch size={large ? 34 : 28} className="text-[#526173]" />
      )}
    </span>
  );
}

export default function AllInShopOperations({
  open,
  mode,
  actor,
  locationCode,
  locationName,
  onClose,
}: Props) {
  const meta = MODE_META[mode];
  const HeaderIcon = meta.icon;
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchItems, setSearchItems] = useState<AifShopSaleCatalogItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchRan, setSearchRan] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const autoTimerRef = useRef<number | null>(null);

  const [stockQuery, setStockQuery] = useState("");
  const [stockData, setStockData] = useState<AifShopStockOverviewResponse | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  const [summaryDate, setSummaryDate] = useState(todayIso());
  const [summaryData, setSummaryData] = useState<AifShopDailySummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const paymentMap = useMemo(() => {
    const map = new Map<string, { amount: number; transactions: number }>();
    for (const item of summaryData?.payments || []) {
      map.set(item.method, { amount: numberValue(item.amount), transactions: numberValue(item.transactions) });
    }
    return map;
  }, [summaryData]);

  function cancelAutoSearch() {
    if (autoTimerRef.current !== null) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }

  async function runProductSearch(value = searchQuery) {
    const query = value.trim();
    if (!query) {
      setSearchItems([]);
      setSearchRan(false);
      return;
    }
    setSearchLoading(true);
    setSearchRan(true);
    setError("");
    try {
      const response = await apiAifShopSaleCatalog({ location: locationCode, search: query, limit: 150 });
      const exact = (response.items || []).filter((item) => exactCatalogMatch(item, query));
      setSearchItems(exact.length === 1 ? exact : response.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A termékkeresés nem sikerült.");
      setSearchItems([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadStock(value = stockQuery) {
    setStockLoading(true);
    setError("");
    try {
      const response = await apiAifShopStockOverview({
        location: locationCode,
        search: value.trim() || undefined,
        limit: 1000,
      });
      setStockData(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az üzleti készlet nem tölthető be.");
      setStockData(null);
    } finally {
      setStockLoading(false);
    }
  }

  async function loadDailySummary(date = summaryDate) {
    setSummaryLoading(true);
    setError("");
    try {
      const response = await apiAifShopDailySummary({
        location: locationCode,
        date,
        employee: actor,
      });
      setSummaryData(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A napi összesítés nem tölthető be.");
      setSummaryData(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setError("");
    if (mode === "search") {
      setSearchQuery("");
      setSearchItems([]);
      setSearchRan(false);
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    } else if (mode === "stock") {
      setStockQuery("");
      void loadStock("");
    } else {
      const today = todayIso();
      setSummaryDate(today);
      void loadDailySummary(today);
    }
  }, [open, mode, locationCode]);

  useEffect(() => {
    if (!open || mode !== "search") return;
    cancelAutoSearch();
    const value = searchQuery.trim();
    if (value.length < 8 || /\s/.test(value)) return;
    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = null;
      void runProductSearch(value);
    }, 180);
    return cancelAutoSearch;
  }, [open, mode, searchQuery]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "F2" && mode === "search") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      cancelAutoSearch();
    };
  }, [mode, onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const stockSummary = stockData?.summary || {
    variantCount: 0,
    totalQty: 0,
    reservedQty: 0,
    availableQty: 0,
    retailValue: 0,
    lowStockVariants: 0,
  };
  const daySummary = summaryData?.summary || {
    revenue: 0,
    salesBeforeDiscount: 0,
    transactions: 0,
    itemsSold: 0,
    averageBasket: 0,
    discountTotal: 0,
    paidTotal: 0,
    unpaidTotal: 0,
    unpaidSales: 0,
    customerSales: 0,
    firstSaleAt: null,
    lastSaleAt: null,
  };

  return createPortal(
    <div className="fixed inset-0 z-[255] flex items-center justify-center bg-[#111827]/84 p-3 backdrop-blur-sm sm:p-5">
      <section className="flex max-h-[95vh] w-full max-w-[1380px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_38px_120px_rgba(0,0,0,0.58)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#1e4f54] via-[#247b79] to-[#2a8d8b] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/28 bg-white/12 text-white">
              <HeaderIcon size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/62">{meta.eyebrow}</p>
              <h2 className="mt-1 truncate text-xl">{meta.title}</h2>
              <p className="mt-1 truncate text-xs text-white/68">{actor} • {locationName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl border border-white/22 bg-black/10 text-white hover:bg-white/12">
            <X size={19} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error ? <div className="mb-4 rounded-2xl border border-red-300/50 bg-red-600/22 px-4 py-3 text-sm text-red-50">{error}</div> : null}

          {mode === "search" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="relative block">
                  <Barcode className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#91e5e1]" size={23} />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void runProductSearch(event.currentTarget.value); }}
                    placeholder="Vonalkód, termékkód, név vagy méret…"
                    className="h-16 w-full rounded-2xl border border-white/20 bg-[#273243] pl-14 pr-4 text-lg text-white outline-none placeholder:text-white/35 focus:border-[#72d8d4] focus:ring-4 focus:ring-[#2a8d8b]/18"
                  />
                </label>
                <button type="button" disabled={searchLoading} onClick={() => void runProductSearch()} className="inline-flex h-16 min-w-[150px] touch-manipulation items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-base text-white hover:bg-[#319c99] disabled:opacity-55">
                  {searchLoading ? <Loader2 className="animate-spin" size={21} /> : <Search size={21} />} Keresés
                </button>
              </div>

              {searchLoading ? (
                <div className="flex min-h-[420px] items-center justify-center gap-3 text-white/55"><Loader2 className="animate-spin" /> Keresés…</div>
              ) : searchItems.length ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {searchItems.map((item) => (
                    <article key={item.variantId} className="grid min-h-[142px] grid-cols-[80px_1fr] gap-3 rounded-[22px] border border-white/14 bg-[#3b475a] p-3">
                      <ProductImage src={item.imageUrl} title={item.title} />
                      <div className="min-w-0">
                        <h3 className="truncate text-base text-white">{item.title}</h3>
                        <p className="mt-1 truncate text-xs text-white/52">{[item.brandName, item.subcategoryName || item.categoryName, item.colorName, item.size].filter(Boolean).join(" • ")}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-lg border border-white/12 bg-black/10 px-2 py-1 text-[10px] text-white/62">{productCode(item)}</span>
                          {item.barcode ? <span className="rounded-lg border border-white/12 bg-black/10 px-2 py-1 text-[10px] text-white/62">{item.barcode}</span> : null}
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-2">
                          <span className="text-xl text-[#d7fffd]">{formatMoney(item.sellPrice)}</span>
                          <span className={`rounded-xl border px-3 py-1.5 text-sm ${numberValue(item.availableQty) <= 2 ? "border-red-300/60 bg-red-600 text-white" : "border-[#9be9e5]/40 bg-[#2a8d8b]/24 text-[#d7fffd]"}`}>{numberValue(item.availableQty)} db</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : searchRan ? (
                <div className="mt-4 flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/14 bg-black/5 text-center text-white/46"><PackageSearch size={42} /><p className="mt-3 text-lg">Nincs találat</p></div>
              ) : (
                <div className="mt-4 flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#7bd7d4]/18 bg-[#273243]/45 text-center"><Barcode size={45} className="text-[#8ee6e2]/58" /><p className="mt-3 text-lg text-white/75">Olvasd be a vonalkódot</p></div>
              )}
            </>
          ) : null}

          {mode === "stock" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Termékváltozat</p><p className="mt-2 text-2xl">{stockSummary.variantCount}</p></div>
                <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/58">Elérhető készlet</p><p className="mt-2 text-2xl text-[#d7fffd]">{stockSummary.availableQty} db</p></div>
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Foglalt</p><p className="mt-2 text-2xl">{stockSummary.reservedQty} db</p></div>
                <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/58">Eladási érték</p><p className="mt-2 text-2xl text-[#d7fffd]">{formatMoney(stockSummary.retailValue)}</p></div>
                <div className={`rounded-2xl border p-3 ${stockSummary.lowStockVariants > 0 ? "border-red-300/55 bg-red-600/25" : "border-white/12 bg-[#374357]"}`}><p className="text-[9px] uppercase tracking-[0.1em] text-white/52">Alacsony készlet</p><p className="mt-2 text-2xl">{stockSummary.lowStockVariants}</p></div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8ee6e2]" size={20} /><input value={stockQuery} onChange={(event) => setStockQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadStock(event.currentTarget.value); }} placeholder="Keresés vonalkód, név, kód, szín vagy méret alapján…" className="h-14 w-full rounded-2xl border border-white/18 bg-[#273243] pl-12 pr-4 text-base text-white outline-none placeholder:text-white/40 focus:border-[#72d8d4]" /></label>
                <button type="button" onClick={() => void loadStock()} disabled={stockLoading} className="inline-flex h-14 min-w-[150px] items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm hover:bg-[#319c99] disabled:opacity-55">{stockLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />} Keresés</button>
              </div>

              {stockLoading && !stockData ? <div className="flex min-h-[380px] items-center justify-center gap-3 text-white/55"><Loader2 className="animate-spin" /> Készlet betöltése…</div> : (
                <div className="mt-4 grid gap-2 lg:grid-cols-2">
                  {(stockData?.items || []).map((item) => (
                    <article key={item.variantId} className={`grid grid-cols-[80px_1fr_auto] items-center gap-3 rounded-[20px] border p-3 ${item.lowStock ? "border-red-300/48 bg-red-950/18" : "border-white/13 bg-[#374357]"}`}>
                      <ProductImage src={item.imageUrl} title={item.title} />
                      <div className="min-w-0"><h3 className="truncate text-base">{item.title}</h3><p className="mt-1 truncate text-xs text-white/50">{[item.brandName, item.subcategoryName || item.categoryName, item.colorName, item.size].filter(Boolean).join(" • ")}</p><p className="mt-2 text-[11px] text-white/48">{productCode(item)}{item.barcode ? ` • ${item.barcode}` : ""}</p><p className="mt-2 text-sm text-[#d7fffd]">{formatMoney(item.sellPrice)}</p></div>
                      <div className="text-right"><span className={`inline-flex min-w-[78px] justify-center rounded-xl border px-3 py-2 text-lg ${item.lowStock ? "border-red-300/60 bg-red-600 text-white" : "border-[#9be9e5]/40 bg-[#2a8d8b]/24 text-[#d7fffd]"}`}>{item.availableQty} db</span>{item.reservedQty > 0 ? <p className="mt-2 text-[10px] text-white/45">Foglalt: {item.reservedQty}</p> : null}</div>
                    </article>
                  ))}
                  {!stockLoading && !(stockData?.items || []).length ? <div className="col-span-full flex min-h-[260px] items-center justify-center rounded-[22px] border border-dashed border-white/14 text-white/45">Nincs találat.</div> : null}
                </div>
              )}
            </>
          ) : null}

          {mode === "summary" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-white/14 bg-[#374357] p-3">
                <div className="flex items-center gap-3"><Store size={20} className="text-[#8ee6e2]" /><div><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Eladó</p><p className="mt-1 text-base">{actor}</p></div></div>
                <div className="grid grid-cols-[58px_minmax(160px,1fr)_58px_auto] overflow-hidden rounded-2xl border border-white/16 bg-[#273243]">
                  <button type="button" onClick={() => { const next = shiftIsoDate(summaryDate, -1); setSummaryDate(next); void loadDailySummary(next); }} className="inline-flex h-14 items-center justify-center border-r border-white/12 hover:bg-white/[0.08]"><ArrowLeft size={22} /></button>
                  <div className="flex h-14 items-center justify-center px-4 text-base tabular-nums">{formatDate(summaryDate)}</div>
                  <button type="button" onClick={() => { const next = shiftIsoDate(summaryDate, 1); setSummaryDate(next); void loadDailySummary(next); }} className="inline-flex h-14 items-center justify-center border-l border-white/12 hover:bg-white/[0.08]"><ArrowRight size={22} /></button>
                  <button type="button" onClick={() => { const next = todayIso(); setSummaryDate(next); void loadDailySummary(next); }} className="h-14 border-l border-white/12 px-4 text-sm text-[#d7fffd] hover:bg-[#2a8d8b]/20">Ma</button>
                </div>
                <button type="button" onClick={() => void loadDailySummary()} disabled={summaryLoading} className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/16 bg-[#354153] px-4 text-sm hover:bg-[#3e4d63] disabled:opacity-55"><RefreshCw className={summaryLoading ? "animate-spin" : ""} size={17} /> Frissítés</button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] p-4 shadow-[0_10px_26px_rgba(42,141,139,0.20)] xl:col-span-2"><p className="text-[10px] uppercase tracking-[0.12em] text-white/70">Napi forgalom</p><p className="mt-2 text-4xl tracking-tight">{formatMoney(daySummary.revenue)}</p></div>
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Eladások</p><p className="mt-2 text-3xl">{daySummary.transactions}</p></div>
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Eladott darab</p><p className="mt-2 text-3xl">{daySummary.itemsSold}</p></div>
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Átlagkosár</p><p className="mt-2 text-2xl">{formatMoney(daySummary.averageBasket)}</p></div>
                <div className={`rounded-2xl border p-4 ${daySummary.unpaidTotal > 0 ? "border-red-300/55 bg-red-600/24" : "border-white/12 bg-[#374357]"}`}><p className="text-[10px] uppercase tracking-[0.12em] text-white/55">Kintlévőség</p><p className="mt-2 text-2xl">{formatMoney(daySummary.unpaidTotal)}</p></div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {PAYMENT_META.map((item) => {
                  const Icon = item.icon;
                  const payment = paymentMap.get(item.method) || { amount: 0, transactions: 0 };
                  return <div key={item.method} className="rounded-2xl border border-white/12 bg-[#374357] p-3"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs text-white/58"><Icon size={16} className="text-[#8ee6e2]" />{item.label}</span><span className="text-[10px] text-white/38">{payment.transactions} eladás</span></div><p className="mt-2 text-xl">{formatMoney(payment.amount)}</p></div>;
                })}
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Mit adtam el?</p><h3 className="mt-1 text-lg">Eladott termékek</h3></div><span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">{summaryData?.products.length || 0} termék</span></div>
                  <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                    {(summaryData?.products || []).map((item) => (
                      <div key={item.key} className="grid grid-cols-[68px_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-[#293548] p-3"><ProductImage src={item.imageUrl} title={item.title} /><div className="min-w-0"><p className="truncate text-sm">{item.title}</p><p className="mt-1 truncate text-[11px] text-white/48">{[item.brandName, item.subcategoryName, item.colorName, item.size].filter(Boolean).join(" • ")}</p><p className="mt-1 text-[10px] text-white/38">{item.productCode || "–"}</p></div><div className="text-right"><p className="text-xl text-[#d7fffd]">{item.qty} db</p><p className="mt-1 text-sm">{formatMoney(item.revenue)}</p>{item.discountTotal > 0 ? <p className="mt-1 text-[10px] text-amber-100">Kedv.: {formatMoney(item.discountTotal)}</p> : null}</div></div>
                    ))}
                    {!summaryLoading && !(summaryData?.products || []).length ? <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-white/42"><ShoppingBag size={34} /><p className="mt-2 text-sm">Ezen a napon még nincs eladott termék.</p></div> : null}
                  </div>
                </section>

                <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Bizonylatok</p><h3 className="mt-1 text-lg">Napi eladások</h3></div><span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">{summaryData?.sales.length || 0} bizonylat</span></div>
                  <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                    {(summaryData?.sales || []).map((sale) => (
                      <div key={sale.id} className={`rounded-2xl border p-3 ${sale.balanceDue > 0 ? "border-red-300/32 bg-red-950/18" : "border-white/10 bg-[#293548]"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm">{sale.saleNumber}</p><p className="mt-1 text-[11px] text-white/45">{formatTime(sale.soldAt)} • {sale.paymentLabel}</p></div><p className="shrink-0 text-lg">{formatMoney(sale.total)}</p></div><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/52"><span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">{sale.itemCount} db</span>{sale.customerName ? <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1"><UserRound className="mr-1 inline" size={12} />{sale.customerName}</span> : null}{sale.discountTotal > 0 ? <span className="rounded-lg border border-amber-200/18 bg-amber-400/8 px-2 py-1 text-amber-50">Kedv.: {formatMoney(sale.discountTotal)}</span> : null}{sale.balanceDue > 0 ? <span className="rounded-lg border border-red-300/45 bg-red-600 px-2 py-1 text-white">Hátralék: {formatMoney(sale.balanceDue)}</span> : null}</div></div>
                    ))}
                    {!summaryLoading && !(summaryData?.sales || []).length ? <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-white/42"><Receipt size={34} /><p className="mt-2 text-sm">Ezen a napon még nincs eladás.</p></div> : null}
                  </div>
                </section>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Kedvezmény összesen</p><p className="mt-2 text-xl text-amber-50">{formatMoney(daySummary.discountTotal)}</p></div>
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Klienshez kapcsolva</p><p className="mt-2 text-xl">{daySummary.customerSales} eladás</p></div>
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Első / utolsó eladás</p><p className="mt-2 text-xl">{formatTime(daySummary.firstSaleAt)} • {formatTime(daySummary.lastSaleAt)}</p></div>
              </div>
            </>
          ) : null}
        </div>

        <footer className="flex items-center justify-end border-t border-white/12 bg-[#293548] px-5 py-4">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.09]"><X size={17} /> Bezárás</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
