import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Barcode,
  CheckCircle2,
  Clock3,
  CreditCard,
  Landmark,
  Loader2,
  LogOut,
  Minus,
  PackageSearch,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  apiAifCompleteShopSale,
  apiAifShopSaleCatalog,
  type AifShopSaleCatalogItem,
  type AifShopSalePaymentMethod,
  type AifShopSaleResult,
} from "../lib/aif/api";

type Props = {
  locationCode: "main_warehouse" | "magazin_targu_secuiesc";
  locationName: string;
  cityName: string;
  homeHash: string;
  actor?: string;
  role?: "admin" | "shop";
  onLogout?: () => void | Promise<void>;
};

type CartLine = AifShopSaleCatalogItem & {
  quantity: number;
  discountPercent: number;
};

type CustomerDraft = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  note: string;
};

const EMPTY_CUSTOMER: CustomerDraft = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  note: "",
};

const PAYMENT_OPTIONS: Array<{
  method: AifShopSalePaymentMethod;
  label: string;
  description: string;
  icon: typeof Banknote;
}> = [
  { method: "cash", label: "Készpénz", description: "Teljes összeg készpénzben", icon: Banknote },
  { method: "card", label: "Bankkártya", description: "POS terminálos fizetés", icon: CreditCard },
  { method: "bank_transfer", label: "Átutalás", description: "Banki átutalással rendezve", icon: Landmark },
  { method: "credit", label: "Utólag fizet", description: "Hitelként, vevőhöz kapcsolva", icon: Clock3 },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function catalogIdentity(item: AifShopSaleCatalogItem) {
  return String(item.variantId || "");
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

export default function AllInMagazinSale({
  locationCode,
  locationName,
  cityName,
  homeHash,
  actor = "Üzleti felhasználó",
  role = "shop",
  onLogout,
}: Props) {
  const storageKey = `allin:shop-sale-cart:${locationCode}`;
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<AifShopSaleCatalogItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [paymentMethod, setPaymentMethod] = useState<AifShopSalePaymentMethod>("cash");
  const [customer, setCustomer] = useState<CustomerDraft>(EMPTY_CUSTOMER);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<AifShopSaleResult | null>(null);
  const requestKeyRef = useRef("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(cart));
  }, [cart, storageKey]);

  useEffect(() => {
    void runSearch("", false);
  }, [locationCode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (success) {
          setSuccess(null);
          window.setTimeout(() => searchInputRef.current?.focus(), 0);
          return;
        }
        window.location.hash = homeHash;
      }
      if (event.key === "F2") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [homeHash, success]);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + numberValue(line.sellPrice) * line.quantity, 0),
    [cart],
  );
  const total = useMemo(
    () => cart.reduce((sum, line) => {
      const listPrice = numberValue(line.sellPrice);
      const unitPrice = listPrice * (1 - line.discountPercent / 100);
      return sum + unitPrice * line.quantity;
    }, 0),
    [cart],
  );
  const discountTotal = Math.max(0, subtotal - total);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  function invalidateRequestKey() {
    requestKeyRef.current = "";
  }

  async function runSearch(value = query, autoAddExact = false) {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifShopSaleCatalog({
        location: locationCode,
        search: value.trim(),
        limit: value.trim() ? 80 : 36,
      });
      const items = response.items || [];
      setProducts(items);
      if (autoAddExact && value.trim()) {
        const exact = items.filter((item) => exactCatalogMatch(item, value));
        if (exact.length === 1) {
          addToCart(exact[0]);
          setQuery("");
          window.setTimeout(() => searchInputRef.current?.focus(), 0);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A termékek betöltése nem sikerült.");
    } finally {
      setLoading(false);
    }
  }

  function addToCart(item: AifShopSaleCatalogItem) {
    const available = numberValue(item.availableQty);
    if (available <= 0) {
      setError("Ebből a termékből nincs eladható készlet ebben az üzletben.");
      return;
    }
    invalidateRequestKey();
    setError("");
    setCart((current) => {
      const id = catalogIdentity(item);
      const existing = current.find((line) => catalogIdentity(line) === id);
      if (existing) {
        if (existing.quantity >= available) {
          setError(`Legfeljebb ${available} db adható a kosárhoz.`);
          return current;
        }
        return current.map((line) =>
          catalogIdentity(line) === id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { ...item, quantity: 1, discountPercent: 0 }];
    });
  }

  function setQuantity(variantId: string, nextQuantity: number) {
    invalidateRequestKey();
    setCart((current) => current.flatMap((line) => {
      if (catalogIdentity(line) !== variantId) return [line];
      const maximum = Math.max(0, numberValue(line.availableQty));
      if (nextQuantity <= 0) return [];
      return [{ ...line, quantity: Math.min(maximum, nextQuantity) }];
    }));
  }

  function setDiscount(variantId: string, value: number) {
    invalidateRequestKey();
    const safe = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    setCart((current) => current.map((line) =>
      catalogIdentity(line) === variantId ? { ...line, discountPercent: safe } : line,
    ));
  }

  function applyDiscountToAll(value: number) {
    invalidateRequestKey();
    setCart((current) => current.map((line) => ({ ...line, discountPercent: value })));
  }

  function clearCart() {
    invalidateRequestKey();
    setCart([]);
    setCustomer(EMPTY_CUSTOMER);
    setNote("");
    setError("");
  }

  async function completeSale() {
    if (!cart.length) {
      setError("A kosár üres. A pénztárgép még gondolatolvasással nem működik.");
      return;
    }
    if (paymentMethod === "credit" && (!customer.fullName.trim() || !customer.phone.trim())) {
      setError("Utólagos fizetésnél a kliens neve és telefonszáma kötelező.");
      return;
    }

    setSubmitting(true);
    setError("");
    if (!requestKeyRef.current) requestKeyRef.current = createRequestKey();

    try {
      const result = await apiAifCompleteShopSale({
        location: locationCode,
        paymentMethod,
        idempotencyKey: requestKeyRef.current,
        note: note.trim() || null,
        customer: paymentMethod === "credit"
          ? {
              fullName: customer.fullName.trim(),
              phone: customer.phone.trim(),
              email: customer.email.trim() || null,
              address: customer.address.trim() || null,
              note: customer.note.trim() || null,
            }
          : undefined,
        lines: cart.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          discountPercent: line.discountPercent,
        })),
      });
      setSuccess(result);
      setCart([]);
      setCustomer(EMPTY_CUSTOMER);
      setNote("");
      requestKeyRef.current = "";
      void runSearch(query, false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Az eladás lezárása nem sikerült.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#6a7585] via-[#5e6979] to-[#515b6a] p-2 text-white sm:p-3 lg:p-4">
      <div className="mx-auto max-w-[1720px] space-y-3">
        <header className="rounded-[24px] border border-white/18 bg-[#303a4c] px-4 py-3 shadow-[0_18px_48px_rgba(15,23,42,0.28)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/40 bg-[#2a8d8b]/22 text-[#cffffd]">
              <Store size={28} strokeWidth={1.8} />
            </span>
            <div className="min-w-[240px] border-l-4 border-[#2a8d8b] pl-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#cffffd]/65">AllInFashion • értékesítés</p>
              <h1 className="mt-1 text-2xl tracking-tight sm:text-3xl">Új eladás</h1>
              <p className="mt-1 text-sm text-white/58">{cityName} • {locationName}</p>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="hidden rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2 md:block">
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Eladó</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-white">
                  <UserRound size={15} className="text-[#8ee6e2]" />
                  {actor}
                  {role === "admin" ? <span className="text-white/45">• admin előnézet</span> : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { window.location.hash = homeHash; }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/18 bg-[#354153] px-4 text-sm transition hover:bg-[#3e4d63] active:scale-[0.98]"
              >
                <ArrowLeft size={18} /> Vissza
              </button>
              <button
                type="button"
                onClick={() => void onLogout?.()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/18 bg-[#354153] px-4 text-sm transition hover:bg-[#3e4d63] active:scale-[0.98]"
              >
                <LogOut size={18} /> Kilépés
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-300/35 bg-red-500/16 px-4 py-3 text-sm text-red-50">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(420px,0.72fr)]">
          <section className="min-w-0 rounded-[24px] border border-white/18 bg-[#3a4557] p-3 shadow-[0_16px_36px_rgba(15,23,42,0.18)] sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Gyors termékfelvétel</p>
                <h2 className="mt-1 text-xl">Keresés és vonalkódolvasás</h2>
              </div>
              <span className="rounded-full border border-[#8de7e3]/30 bg-[#2a8d8b]/18 px-3 py-1 text-xs text-[#d5fffd]">
                F2 • kereső fókusz
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="relative block">
                <Barcode className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#91e5e1]" size={23} />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void runSearch(query, true);
                  }}
                  autoFocus
                  placeholder="Olvasd be a vonalkódot, vagy keress név, kód, méret alapján…"
                  className="h-16 w-full rounded-2xl border border-white/20 bg-[#283243] pl-14 pr-4 text-lg text-white outline-none transition placeholder:text-white/35 focus:border-[#72d8d4] focus:ring-4 focus:ring-[#2a8d8b]/20"
                />
              </label>
              <button
                type="button"
                onClick={() => void runSearch(query, true)}
                disabled={loading}
                className="inline-flex h-16 min-w-[150px] touch-manipulation items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-base transition hover:bg-[#319c99] active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={21} /> : <Search size={21} />}
                Keresés
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <p className="text-sm text-white/60">
                {query.trim() ? `Találatok: ${products.length}` : "Az üzlet elérhető készlete"}
              </p>
              <button
                type="button"
                onClick={() => { setQuery(""); void runSearch("", false); }}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/14 bg-white/[0.06] px-3 text-xs text-white/70 hover:bg-white/[0.1]"
              >
                <RotateCcw size={15} /> Alaplista
              </button>
            </div>

            {loading ? (
              <div className="flex min-h-[420px] items-center justify-center gap-3 text-white/60">
                <Loader2 className="animate-spin" /> Termékek betöltése…
              </div>
            ) : products.length ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {products.map((item) => (
                  <button
                    key={item.variantId}
                    type="button"
                    onClick={() => addToCart(item)}
                    className="group grid min-h-[132px] touch-manipulation grid-cols-[78px_1fr] gap-3 rounded-[20px] border border-white/15 bg-[#465266] p-3 text-left transition hover:border-[#77dcd8]/50 hover:bg-[#4d5b70] active:scale-[0.985]"
                  >
                    <span className="flex h-[78px] w-[78px] items-center justify-center overflow-hidden rounded-2xl border border-white/14 bg-white/90">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <PackageSearch size={30} className="text-[#506174]" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-base text-white">{item.title}</span>
                      <span className="mt-1 block truncate text-xs text-white/56">
                        {[item.brandName, item.colorName, item.size].filter(Boolean).join(" • ")}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-white/12 bg-black/10 px-2 py-1 text-[10px] text-white/65">
                          {productCode(item)}
                        </span>
                        <span className="rounded-full border border-[#7bd7d4]/28 bg-[#2a8d8b]/20 px-2 py-1 text-[10px] text-[#d7fffd]">
                          {numberValue(item.availableQty)} db
                        </span>
                      </span>
                      <span className="mt-2 block text-lg text-[#d7fffd]">{formatMoney(numberValue(item.sellPrice))}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex min-h-[420px] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-black/5 px-6 text-center">
                <PackageSearch size={40} className="text-white/35" />
                <p className="mt-3 text-lg text-white/75">Nincs találat</p>
                <p className="mt-1 max-w-md text-sm text-white/45">Ellenőrizd a kódot, a méretet vagy a termék nevét.</p>
              </div>
            )}
          </section>

          <aside className="min-w-0 rounded-[24px] border border-white/18 bg-[#303a4c] p-3 shadow-[0_18px_44px_rgba(15,23,42,0.25)] sm:p-4 xl:sticky xl:top-3 xl:self-start">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#7bd7d4]/35 bg-[#2a8d8b]/20 text-[#d7fffd]">
                  <ShoppingCart size={24} />
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Aktuális kosár</p>
                  <h2 className="mt-1 text-xl">{itemCount} db • {cart.length} tétel</h2>
                </div>
              </div>
              {cart.length ? (
                <button
                  type="button"
                  onClick={clearCart}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-300/25 bg-red-500/12 px-3 text-xs text-red-50 hover:bg-red-500/20"
                >
                  <Trash2 size={15} /> Ürítés
                </button>
              ) : null}
            </div>

            <div className="mt-3 max-h-[43vh] space-y-2 overflow-y-auto pr-1">
              {cart.length ? cart.map((line) => {
                const listPrice = numberValue(line.sellPrice);
                const discountedUnit = listPrice * (1 - line.discountPercent / 100);
                const lineTotal = discountedUnit * line.quantity;
                return (
                  <div key={line.variantId} className="rounded-[18px] border border-white/13 bg-[#3b475a] p-3">
                    <div className="grid grid-cols-[52px_1fr_auto] gap-2">
                      <span className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-xl border border-white/12 bg-white/90">
                        {line.imageUrl ? <img src={line.imageUrl} alt="" className="h-full w-full object-contain" /> : <PackageSearch className="text-[#526173]" size={22} />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{line.title}</p>
                        <p className="mt-1 truncate text-[11px] text-white/50">
                          {[line.colorName, line.size, productCode(line)].filter(Boolean).join(" • ")}
                        </p>
                        <p className="mt-1 text-sm text-[#d7fffd]">{formatMoney(lineTotal)}</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Tétel törlése"
                        onClick={() => setQuantity(line.variantId, 0)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] text-white/60 hover:bg-red-500/15 hover:text-red-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                      <div className="inline-grid grid-cols-[42px_50px_42px] overflow-hidden rounded-xl border border-white/16 bg-[#273243]">
                        <button type="button" onClick={() => setQuantity(line.variantId, line.quantity - 1)} className="inline-flex h-11 items-center justify-center hover:bg-white/[0.08]"><Minus size={17} /></button>
                        <span className="inline-flex h-11 items-center justify-center border-x border-white/12 text-base">{line.quantity}</span>
                        <button type="button" onClick={() => setQuantity(line.variantId, line.quantity + 1)} className="inline-flex h-11 items-center justify-center hover:bg-white/[0.08]"><Plus size={17} /></button>
                      </div>
                      <label className="grid grid-cols-[1fr_72px] items-center gap-2 rounded-xl border border-white/14 bg-[#273243] px-3">
                        <span className="text-xs text-white/56">Kedvezmény</span>
                        <span className="flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step={1}
                            value={line.discountPercent}
                            onChange={(event) => setDiscount(line.variantId, Number(event.target.value))}
                            className="h-9 w-12 bg-transparent text-right text-sm outline-none"
                          />
                          <span className="text-xs text-white/50">%</span>
                        </span>
                      </label>
                    </div>
                  </div>
                );
              }) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[20px] border border-dashed border-white/14 bg-black/5 px-5 text-center">
                  <ShoppingCart size={38} className="text-white/28" />
                  <p className="mt-3 text-base text-white/65">A kosár még üres</p>
                  <p className="mt-1 text-xs text-white/40">Olvass be egy vonalkódot vagy válassz terméket balról.</p>
                </div>
              )}
            </div>

            {cart.length ? (
              <>
                <div className="mt-3 rounded-[18px] border border-white/12 bg-black/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-white/48">Gyors kedvezmény minden tételre</span>
                    <div className="flex gap-1">
                      {[0, 5, 10, 15].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => applyDiscountToAll(value)}
                          className="min-h-9 rounded-xl border border-white/13 bg-white/[0.05] px-3 text-xs hover:border-[#72d8d4]/45 hover:bg-[#2a8d8b]/16"
                        >
                          {value}%
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-sm">
                    <div className="flex justify-between text-white/58"><span>Eredeti összeg</span><span>{formatMoney(subtotal)}</span></div>
                    <div className="flex justify-between text-amber-100"><span>Kedvezmény</span><span>-{formatMoney(discountTotal)}</span></div>
                    <div className="flex items-end justify-between pt-1"><span className="text-base text-white/75">Fizetendő</span><span className="text-3xl tracking-tight text-[#d7fffd]">{formatMoney(total)}</span></div>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Fizetési mód</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {PAYMENT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const active = paymentMethod === option.method;
                      return (
                        <button
                          key={option.method}
                          type="button"
                          onClick={() => { invalidateRequestKey(); setPaymentMethod(option.method); setError(""); }}
                          className={`min-h-[78px] touch-manipulation rounded-2xl border p-3 text-left transition active:scale-[0.98] ${active ? "border-[#93e5e1]/55 bg-[#2a8d8b]/36" : "border-white/13 bg-white/[0.05] hover:bg-white/[0.08]"}`}
                        >
                          <span className="flex items-center gap-2 text-sm"><Icon size={18} className={active ? "text-[#d7fffd]" : "text-white/58"} />{option.label}</span>
                          <span className="mt-1 block text-[10px] leading-snug text-white/42">{option.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {paymentMethod === "credit" ? (
                  <div className="mt-3 rounded-[18px] border border-amber-200/25 bg-amber-500/10 p-3">
                    <div className="flex items-center gap-2 text-sm text-amber-50"><UserRound size={18} /> Kliens adatai</div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input value={customer.fullName} onChange={(event) => { invalidateRequestKey(); setCustomer((current) => ({ ...current, fullName: event.target.value })); }} placeholder="Név *" className="h-11 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm outline-none focus:border-[#72d8d4]" />
                      <input value={customer.phone} onChange={(event) => { invalidateRequestKey(); setCustomer((current) => ({ ...current, phone: event.target.value })); }} placeholder="Telefonszám *" className="h-11 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm outline-none focus:border-[#72d8d4]" />
                      <input value={customer.email} onChange={(event) => { invalidateRequestKey(); setCustomer((current) => ({ ...current, email: event.target.value })); }} placeholder="E-mail" className="h-11 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm outline-none focus:border-[#72d8d4]" />
                      <input value={customer.address} onChange={(event) => { invalidateRequestKey(); setCustomer((current) => ({ ...current, address: event.target.value })); }} placeholder="Cím" className="h-11 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm outline-none focus:border-[#72d8d4]" />
                    </div>
                    <input value={customer.note} onChange={(event) => { invalidateRequestKey(); setCustomer((current) => ({ ...current, note: event.target.value })); }} placeholder="Kliens megjegyzés" className="mt-2 h-11 w-full rounded-xl border border-white/16 bg-[#273243] px-3 text-sm outline-none focus:border-[#72d8d4]" />
                  </div>
                ) : null}

                <input
                  value={note}
                  onChange={(event) => { invalidateRequestKey(); setNote(event.target.value); }}
                  placeholder="Eladási megjegyzés (opcionális)"
                  className="mt-3 h-11 w-full rounded-xl border border-white/14 bg-[#273243] px-3 text-sm outline-none focus:border-[#72d8d4]"
                />

                <button
                  type="button"
                  onClick={() => void completeSale()}
                  disabled={submitting || total < 0}
                  className="mt-3 inline-flex min-h-16 w-full touch-manipulation items-center justify-center gap-3 rounded-[20px] border border-[#a4efeb]/55 bg-gradient-to-r from-[#2a8d8b] to-[#207572] px-5 text-lg shadow-[0_12px_28px_rgba(22,120,117,0.28)] transition hover:brightness-110 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="animate-spin" size={24} /> : <Receipt size={24} />}
                  {submitting ? "Eladás mentése…" : `Eladás lezárása • ${formatMoney(total)}`}
                </button>
              </>
            ) : null}
          </aside>
        </div>
      </div>

      {success ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#111827]/76 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] rounded-[28px] border border-[#9be9e5]/45 bg-[#303a4c] p-5 text-center shadow-[0_30px_90px_rgba(0,0,0,0.45)] sm:p-7">
            <span className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full border border-[#9be9e5]/45 bg-[#2a8d8b]/28 text-[#d7fffd]">
              <CheckCircle2 size={42} />
            </span>
            <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-white/45">Eladás rögzítve</p>
            <h2 className="mt-2 text-2xl text-white">{success.saleNumber}</h2>
            <p className="mt-2 text-4xl tracking-tight text-[#d7fffd]">{formatMoney(success.total)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-left">
              <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-3"><p className="text-[9px] uppercase text-white/38">Tételek</p><p className="mt-1 text-lg">{success.lineCount}</p></div>
              <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-3"><p className="text-[9px] uppercase text-white/38">Darab</p><p className="mt-1 text-lg">{success.itemCount}</p></div>
              <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-3"><p className="text-[9px] uppercase text-white/38">Állapot</p><p className="mt-1 text-sm">{success.paymentStatus === "credit" ? "Utólag fizet" : "Kifizetve"}</p></div>
            </div>
            <button
              type="button"
              onClick={() => { setSuccess(null); window.setTimeout(() => searchInputRef.current?.focus(), 0); }}
              className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-base hover:bg-[#319c99]"
            >
              <Plus size={20} /> Következő eladás
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
