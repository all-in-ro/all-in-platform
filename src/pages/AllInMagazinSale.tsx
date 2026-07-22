import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  UserPlus,
  UserRound,
  Users,
  X,
  Percent,
  Save,
  Phone,
  Mail,
  MapPin,
} from "lucide-react";
import {
  apiAifCompleteShopSale,
  apiAifCreateShopCustomer,
  apiAifListShopCustomers,
  apiAifShopSaleCatalog,
  type AifShopCustomer,
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

type DiscountEditor = {
  variantId: string;
  value: string;
};

type CustomerModalMode = "search" | "new";

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
  const [selectedCustomer, setSelectedCustomer] = useState<AifShopCustomer | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerModalMode, setCustomerModalMode] = useState<CustomerModalMode>("search");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<AifShopCustomer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(EMPTY_CUSTOMER);
  const [discountEditor, setDiscountEditor] = useState<DiscountEditor | null>(null);
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
        if (discountEditor) {
          setDiscountEditor(null);
          return;
        }
        if (customerModalOpen) {
          setCustomerModalOpen(false);
          return;
        }
        if (success) {
          setSuccess(null);
          window.setTimeout(() => searchInputRef.current?.focus(), 0);
          return;
        }
        window.location.hash = homeHash;
      }
      if (event.key === "F2" && !customerModalOpen && !discountEditor) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customerModalOpen, discountEditor, homeHash, success]);

  useEffect(() => {
    if (!customerModalOpen && !discountEditor) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [customerModalOpen, discountEditor]);

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
  const selectedQuickDiscount = useMemo(() => {
    if (!cart.length) return null;
    const first = Number(cart[0]?.discountPercent || 0);
    return cart.every((line) => Number(line.discountPercent || 0) === first) ? first : null;
  }, [cart]);

  const editingDiscountLine = useMemo(
    () => discountEditor ? cart.find((line) => line.variantId === discountEditor.variantId) || null : null,
    [cart, discountEditor],
  );
  const editingDiscountValue = Math.max(0, Math.min(100, numberValue(discountEditor?.value)));
  const editingDiscountOriginal = editingDiscountLine
    ? numberValue(editingDiscountLine.sellPrice) * editingDiscountLine.quantity
    : 0;
  const editingDiscountFinal = editingDiscountOriginal * (1 - editingDiscountValue / 100);

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

  function openDiscountEditor(line: CartLine) {
    setDiscountEditor({
      variantId: line.variantId,
      value: String(line.discountPercent || 0),
    });
  }

  function applyDiscountEditor() {
    if (!discountEditor) return;
    setDiscount(discountEditor.variantId, editingDiscountValue);
    setDiscountEditor(null);
  }

  async function loadCustomers(value = customerQuery) {
    setCustomerLoading(true);
    setError("");
    try {
      const response = await apiAifListShopCustomers({
        search: value.trim(),
        limit: 60,
      });
      setCustomerResults(response.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kliensek betöltése nem sikerült.");
    } finally {
      setCustomerLoading(false);
    }
  }

  function openCustomerModal(mode: CustomerModalMode = "search") {
    setCustomerModalMode(mode);
    setCustomerModalOpen(true);
    setError("");
    if (mode === "search") {
      setCustomerQuery("");
      void loadCustomers("");
    } else {
      setCustomerDraft(EMPTY_CUSTOMER);
    }
  }

  function chooseCustomer(customer: AifShopCustomer) {
    invalidateRequestKey();
    setSelectedCustomer(customer);
    setCustomerModalOpen(false);
    setCustomerModalMode("search");
    setError("");
  }

  function clearSelectedCustomer() {
    invalidateRequestKey();
    setSelectedCustomer(null);
    setError("");
  }

  async function saveNewCustomer() {
    const fullName = customerDraft.fullName.trim();
    const phone = customerDraft.phone.trim();
    if (!fullName || !phone) {
      setError("Új kliensnél a név és a telefonszám kötelező.");
      return;
    }

    setCustomerSaving(true);
    setError("");
    try {
      const response = await apiAifCreateShopCustomer({
        fullName,
        phone,
        email: customerDraft.email.trim() || null,
        address: customerDraft.address.trim() || null,
        note: customerDraft.note.trim() || null,
      });
      chooseCustomer(response.item);
      setCustomerDraft(EMPTY_CUSTOMER);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kliens mentése nem sikerült.");
    } finally {
      setCustomerSaving(false);
    }
  }

  function clearCart() {
    invalidateRequestKey();
    setCart([]);
    setSelectedCustomer(null);
    setNote("");
    setError("");
  }

  async function completeSale() {
    if (!cart.length) {
      setError("A kosár üres. A pénztárgép még gondolatolvasással nem működik.");
      return;
    }
    if (paymentMethod === "credit" && !selectedCustomer) {
      setError("Utólagos fizetésnél válassz ki egy klienst.");
      openCustomerModal("search");
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
        customer: paymentMethod === "credit" && selectedCustomer
          ? {
              id: selectedCustomer.id,
              fullName: selectedCustomer.fullName,
              phone: selectedCustomer.phone || "",
              email: selectedCustomer.email || null,
              address: selectedCustomer.address || null,
              note: selectedCustomer.notes || null,
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
      setSelectedCustomer(null);
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
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/48 bg-[#2a8d8b] px-4 text-sm font-normal text-white shadow-[0_10px_22px_rgba(42,141,139,0.20)] transition hover:bg-[#319c99] active:scale-[0.98]"
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
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-300/70 bg-red-600 px-3 text-xs text-white shadow-[0_8px_18px_rgba(220,38,38,0.28)] hover:bg-red-500"
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
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-300/70 bg-red-600 text-white shadow-[0_8px_18px_rgba(220,38,38,0.24)] hover:bg-red-500"
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
                      <button
                        type="button"
                        onClick={() => openDiscountEditor(line)}
                        className={`flex h-11 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-left transition ${line.discountPercent > 0 ? "border-[#9be9e5]/55 bg-[#2a8d8b] text-white shadow-[0_8px_18px_rgba(42,141,139,0.18)]" : "border-white/14 bg-[#273243] text-white/62 hover:border-[#72d8d4]/40"}`}
                      >
                        <span className="flex min-w-0 items-center gap-2 truncate text-xs">
                          <Percent size={15} className={line.discountPercent > 0 ? "text-[#d7fffd]" : "text-[#8ee6e2]"} />
                          Kedvezmény
                        </span>
                        <span className={`shrink-0 rounded-lg border px-2 py-1 text-sm text-white ${
                          line.discountPercent > 0
                            ? "border-white/24 bg-white/12"
                            : "border-white/12 bg-black/10"
                        }`}>
                          {line.discountPercent.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%
                        </span>
                      </button>
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
                          className={`min-h-9 rounded-xl border px-3 text-xs transition ${
                            selectedQuickDiscount === value
                              ? "border-[#9be9e5]/55 bg-[#2a8d8b] text-white shadow-[0_6px_16px_rgba(42,141,139,0.18)]"
                              : "border-white/13 bg-white/[0.05] text-white/72 hover:border-[#72d8d4]/45 hover:bg-[#2a8d8b]/16"
                          }`}
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
                          onClick={() => { invalidateRequestKey(); setPaymentMethod(option.method); setError(""); if (option.method === "credit" && !selectedCustomer) openCustomerModal("search"); }}
                          className={`min-h-[78px] touch-manipulation rounded-2xl border p-3 text-left transition active:scale-[0.98] ${active ? "border-[#9be9e5]/60 bg-[#2a8d8b] text-white shadow-[0_10px_22px_rgba(42,141,139,0.20)] ring-1 ring-[#7bd7d4]/25" : "border-white/13 bg-white/[0.05] hover:bg-white/[0.08]"}`}
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
                    {selectedCustomer ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-200/25 bg-amber-300/10 text-amber-100">
                          <UserRound size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-amber-50">{selectedCustomer.fullName}</p>
                          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/48">
                            {selectedCustomer.phone ? <span>{selectedCustomer.phone}</span> : null}
                            {selectedCustomer.email ? <span>{selectedCustomer.email}</span> : null}
                            {numberValue(selectedCustomer.openBalance) > 0 ? <span className="text-rose-100">Hátralék: {formatMoney(numberValue(selectedCustomer.openBalance))}</span> : null}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openCustomerModal("search")}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-xs text-white/72 hover:bg-white/[0.1]"
                        >
                          <Users size={15} /> Másik kliens
                        </button>
                        <button
                          type="button"
                          onClick={clearSelectedCustomer}
                          aria-label="Kliens törlése az eladásból"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-300/25 bg-rose-500/12 text-rose-50 hover:bg-rose-500/22"
                        >
                          <X size={17} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openCustomerModal("search")}
                        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-amber-200/30 bg-amber-300/10 px-4 text-left text-amber-50 transition hover:bg-amber-300/16"
                      >
                        <span className="flex items-center gap-3"><Users size={20} /> Kliens kiválasztása</span>
                        <span className="text-xs text-white/45">Kötelező</span>
                      </button>
                    )}
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

      {discountEditor && editingDiscountLine && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#111827]/78 p-4 backdrop-blur-sm">
          <div style={{ color: "#ffffff" }} className="w-full max-w-[620px] overflow-hidden rounded-[28px] border border-[#9be9e5]/40 bg-[#303a4c] text-white [&_button]:!text-white [&_input]:!text-white [&_label]:!text-white [&_span]:!text-white [&_p]:!text-white [&_h2]:!text-white shadow-[0_34px_100px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#9be9e5]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><Percent size={22} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-white/42">Tételkedvezmény</p>
                  <h2 className="mt-1 truncate text-xl text-white">{editingDiscountLine.title}</h2>
                </div>
              </div>
              <button type="button" onClick={() => setDiscountEditor(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.06] hover:bg-white/[0.1]"><X size={18} /></button>
            </div>

            <div className="p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-[#273243] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Eredeti egységár</p><p className="mt-2 text-lg text-white">{formatMoney(numberValue(editingDiscountLine.sellPrice))}</p></div>
                <div className="rounded-2xl border border-white/10 bg-[#273243] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Darabszám</p><p className="mt-2 text-lg text-white">{editingDiscountLine.quantity} db</p></div>
                <div className="rounded-2xl border border-white/10 bg-[#273243] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Eredeti összeg</p><p className="mt-2 text-lg text-white">{formatMoney(editingDiscountOriginal)}</p></div>
              </div>

              <label className="mt-4 block">
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/48">Kedvezmény százalékban</span>
                <div className="mt-2 grid grid-cols-[1fr_auto] overflow-hidden rounded-2xl border border-[#7bd7d4]/40 bg-[#253144] focus-within:ring-4 focus-within:ring-[#2a8d8b]/18">
                  <input
                    autoFocus
                    type="text"
                    inputMode="decimal"
                    value={discountEditor.value}
                    onChange={(event) => setDiscountEditor((current) => current ? { ...current, value: event.target.value.replace(/[^0-9.,]/g, "").replace(",", ".") } : current)}
                    onFocus={(event) => event.currentTarget.select()}
                    onClick={(event) => event.currentTarget.select()}
                    onKeyDown={(event) => { if (event.key === "Enter") applyDiscountEditor(); }}
                    className="h-16 min-w-0 bg-transparent px-5 text-right text-3xl text-white caret-[#8ee6e2] outline-none selection:bg-[#2a8d8b] selection:text-white"
                    placeholder="0"
                  />
                  <span className="inline-flex h-16 min-w-16 items-center justify-center border-l border-white/12 bg-white/[0.04] text-xl text-white/58">%</span>
                </div>
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                {[0, 5, 10, 15, 20, 25, 30].map((value) => (
                  <button key={value} type="button" onClick={() => setDiscountEditor((current) => current ? { ...current, value: String(value) } : current)} className={`h-10 rounded-xl border px-4 text-sm transition ${editingDiscountValue === value ? "border-[#9be9e5]/55 bg-[#2a8d8b] text-white" : "border-white/14 bg-white/[0.05] text-white hover:bg-white/[0.09]"}`}>{value}%</button>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-amber-200/20 bg-amber-400/10 p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-amber-100/60">Kedvezmény</p><p className="mt-2 text-lg text-amber-50">-{formatMoney(editingDiscountOriginal - editingDiscountFinal)}</p></div>
                <div className="rounded-2xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 p-3 sm:col-span-2"><p className="text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/55">Új tételösszeg</p><p className="mt-2 text-2xl text-[#d7fffd]">{formatMoney(editingDiscountFinal)}</p></div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
              <button type="button" onClick={() => setDiscountEditor(null)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.09]"><X size={17} /> Mégse</button>
              <button type="button" onClick={applyDiscountEditor} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99]"><CheckCircle2 size={17} /> Alkalmazás</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {customerModalOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-[#111827]/80 p-3 backdrop-blur-sm sm:p-5">
          <div style={{ color: "#ffffff" }} className="flex max-h-[92vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/38 bg-[#303a4c] text-white [&_button]:!text-white [&_input]:!text-white [&_textarea]:!text-white [&_label]:!text-white [&_p]:!text-white [&_h2]:!text-white [&_h3]:!text-white shadow-[0_36px_110px_rgba(0,0,0,0.55)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#9be9e5]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><Users size={24} /></span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/42">Utólagos fizetés</p>
                  <h2 className="mt-1 text-xl text-white">Kliens kiválasztása</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setCustomerModalMode("search"); setCustomerQuery(""); void loadCustomers(""); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs text-white ${customerModalMode === "search" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/15 bg-white/[0.05]"}`}><Search size={15} /> Keresés</button>
                <button type="button" onClick={() => { setCustomerModalMode("new"); setCustomerDraft(EMPTY_CUSTOMER); setError(""); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs text-white ${customerModalMode === "new" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/15 bg-white/[0.05]"}`}><UserPlus size={15} /> Új kliens</button>
                <button type="button" onClick={() => setCustomerModalOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white hover:bg-white/[0.1]"><X size={18} /></button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {customerModalMode === "search" ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label className="relative block">
                      <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8ee6e2]" size={20} />
                      <input
                        autoFocus
                        value={customerQuery}
                        onChange={(event) => setCustomerQuery(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") void loadCustomers(customerQuery); }}
                        placeholder="Keresés név, telefonszám vagy e-mail alapján…"
                        className="h-14 w-full rounded-2xl border border-white/18 bg-[#273243] pl-12 pr-4 text-base text-white outline-none placeholder:text-white/48 focus:border-[#72d8d4] focus:ring-4 focus:ring-[#2a8d8b]/16"
                      />
                    </label>
                    <button type="button" onClick={() => void loadCustomers(customerQuery)} className="inline-flex h-14 min-w-[140px] items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99]">{customerLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />} Keresés</button>
                  </div>

                  <div className="mt-4 grid gap-2 lg:grid-cols-2">
                    {customerLoading ? (
                      <div className="col-span-full flex min-h-[260px] items-center justify-center gap-3 text-white/55"><Loader2 className="animate-spin" /> Kliensek betöltése…</div>
                    ) : customerResults.length ? customerResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => chooseCustomer(item)}
                        className={`group rounded-[20px] border p-4 text-left text-white transition hover:border-[#72d8d4]/50 hover:bg-[#3c4a5f] ${selectedCustomer?.id === item.id ? "border-[#9be9e5]/55 bg-[#2a8d8b]/20" : "border-white/13 bg-[#374357]"}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/28 bg-[#2a8d8b]/16 text-[#d7fffd]"><UserRound size={20} /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="truncate text-base text-white">{item.fullName}</p>
                              {selectedCustomer?.id === item.id ? <span className="rounded-full border border-[#9be9e5]/40 bg-[#2a8d8b] px-2 py-1 text-[10px]">Kijelölve</span> : null}
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-white/52">
                              {item.phone ? <p className="flex items-center gap-2"><Phone size={13} className="text-[#8ee6e2]" />{item.phone}</p> : null}
                              {item.email ? <p className="flex items-center gap-2 truncate"><Mail size={13} className="text-[#8ee6e2]" />{item.email}</p> : null}
                              {item.address ? <p className="flex items-center gap-2 truncate"><MapPin size={13} className="text-[#8ee6e2]" />{item.address}</p> : null}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                              <span className="rounded-full border border-white/12 bg-black/10 px-2 py-1">{numberValue(item.saleCount)} vásárlás</span>
                              <span className={`rounded-full border px-2 py-1 ${numberValue(item.openBalance) > 0 ? "border-rose-300/30 bg-rose-500/14 text-rose-50" : "border-emerald-300/22 bg-emerald-400/10 text-emerald-50"}`}>Hátralék: {formatMoney(numberValue(item.openBalance))}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    )) : (
                      <div className="col-span-full flex min-h-[260px] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-black/5 px-5 text-center">
                        <Users size={38} className="text-white/28" />
                        <p className="mt-3 text-base text-white/68">Nincs találat</p>
                        <p className="mt-1 text-xs text-white/42">Keress másképp, vagy rögzíts új klienst.</p>
                        <button type="button" onClick={() => { setCustomerModalMode("new"); setCustomerDraft({ ...EMPTY_CUSTOMER, fullName: customerQuery }); }} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/40 bg-[#2a8d8b] px-4 text-sm text-white"><UserPlus size={17} /> Új kliens</button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="mx-auto max-w-[760px]">
                  <div className="rounded-[22px] border border-white/13 bg-[#374357] p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#7bd7d4]/28 bg-[#2a8d8b]/16 text-[#d7fffd]"><UserPlus size={20} /></span>
                      <div><p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Új kliens</p><h3 className="mt-1 text-lg text-white">Adatok rögzítése</h3></div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Név *<input autoFocus value={customerDraft.fullName} onChange={(event) => setCustomerDraft((current) => ({ ...current, fullName: event.target.value }))} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/42 focus:border-[#72d8d4]" /></label>
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Telefonszám *<input value={customerDraft.phone} onChange={(event) => setCustomerDraft((current) => ({ ...current, phone: event.target.value }))} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/42 focus:border-[#72d8d4]" /></label>
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">E-mail<input type="email" value={customerDraft.email} onChange={(event) => setCustomerDraft((current) => ({ ...current, email: event.target.value }))} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/42 focus:border-[#72d8d4]" /></label>
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Cím<input value={customerDraft.address} onChange={(event) => setCustomerDraft((current) => ({ ...current, address: event.target.value }))} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/42 focus:border-[#72d8d4]" /></label>
                    </div>
                    <label className="mt-3 grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Megjegyzés<textarea value={customerDraft.note} onChange={(event) => setCustomerDraft((current) => ({ ...current, note: event.target.value }))} rows={3} className="resize-none rounded-xl border border-white/16 bg-[#273243] px-3 py-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/42 focus:border-[#72d8d4]" /></label>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
              <p className="text-xs text-white/42">A kiválasztott kliens automatikusan visszakerül az eladáshoz.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCustomerModalOpen(false)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm hover:bg-white/[0.09]"><X size={17} /> Mégse</button>
                {customerModalMode === "new" ? <button type="button" onClick={() => void saveNewCustomer()} disabled={customerSaving} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99] disabled:opacity-60">{customerSaving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} Mentés és kiválasztás</button> : null}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

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
