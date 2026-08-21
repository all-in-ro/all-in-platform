import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Banknote,
  Barcode,
  CheckCircle2,
  Clock3,
  CreditCard,
  Landmark,
  KeyRound,
  Loader2,
  LogOut,
  Minus,
  PackageSearch,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
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
  apiAifListRomaniaCounties,
  apiAifListRomaniaLocalities,
  apiAifListShopCustomers,
  apiAifShopSaleCatalog,
  type AifRomaniaCounty,
  type AifRomaniaLocality,
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
  countyCode: string;
  localityCode: string;
  postalCode: string;
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
  countyCode: "",
  localityCode: "",
  postalCode: "",
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

function roundMoney(value: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function roundMoneyUp(value: number) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.ceil(amount * 100 - 1e-9) / 100;
}

function discountedUnitPrice(listPrice: number, discountPercent: number) {
  const price = numberValue(listPrice);
  const discount = Math.max(0, Math.min(100, numberValue(discountPercent)));
  if (discount <= 0) return roundMoney(price);
  return roundMoneyUp(price * (1 - discount / 100));
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

function preferredCountyCode(locationCode: Props["locationCode"]) {
  return locationCode === "magazin_targu_secuiesc" ? "CV" : "HR";
}

function customerAddressLabel(customer: AifShopCustomer) {
  const locality = customer.localityName || customer.city || "";
  const county = customer.countyName || "";
  return [[locality, county].filter(Boolean).join(", "), customer.address, customer.postalCode]
    .filter(Boolean)
    .join(" • ");
}

function exactCatalogMatch(item: AifShopSaleCatalogItem, query: string) {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return false;
  return [item.barcode, item.internalSku, item.productCode]
    .filter(Boolean)
    .some((value) => String(value).trim().toLowerCase() === wanted);
}

const SHOP_ADMIN_UNLOCK_TTL_MS = 10 * 60 * 1000;

function shopAdministrationUnlockKey(shopId: "csikszereda" | "kezdivasarhely") {
  return `allin:shop-administration-unlock:${shopId}`;
}

function normalizeEmployeeAccessCode(value: string) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const prefixed = normalized.match(/^AIF-(?:C|K)-([A-Z0-9]{4,64})$/);
  return (prefixed?.[1] || normalized.replace(/[^A-Z0-9]/g, "")).slice(0, 64);
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
  const shopId = locationCode === "main_warehouse" ? "csikszereda" : "kezdivasarhely";
  const defaultCountyCode = preferredCountyCode(locationCode);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<AifShopSaleCatalogItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
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
  const [counties, setCounties] = useState<AifRomaniaCounty[]>([]);
  const [localities, setLocalities] = useState<AifRomaniaLocality[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [administrationAccessOpen, setAdministrationAccessOpen] = useState(false);
  const [administrationCode, setAdministrationCode] = useState("");
  const [administrationBusy, setAdministrationBusy] = useState(false);
  const [administrationError, setAdministrationError] = useState("");
  const [discountEditor, setDiscountEditor] = useState<DiscountEditor | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<AifShopSaleResult | null>(null);
  const requestKeyRef = useRef("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const automaticLookupTimerRef = useRef<number | null>(null);
  const searchRequestIdRef = useRef(0);
  const administrationScanTimerRef = useRef<number | null>(null);
  const administrationUnlockingRef = useRef(false);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(cart));
  }, [cart, storageKey]);

  useEffect(() => {
    cancelAutomaticLookup();
    searchRequestIdRef.current += 1;
    setLoading(false);
    setQuery("");
    setProducts([]);
    setHasSearched(false);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [locationCode]);

  useEffect(() => {
    cancelAutomaticLookup();
    const value = query.trim();
    const looksLikeScannedCode = value.length >= 8 && !/\s/.test(value);
    if (!looksLikeScannedCode || customerModalOpen || discountEditor || administrationAccessOpen) return;

    automaticLookupTimerRef.current = window.setTimeout(() => {
      automaticLookupTimerRef.current = null;
      void runSearch(value, true);
    }, 180);

    return () => cancelAutomaticLookup();
  }, [administrationAccessOpen, customerModalOpen, discountEditor, locationCode, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (administrationAccessOpen) {
          setAdministrationAccessOpen(false);
          setAdministrationCode("");
          setAdministrationError("");
          return;
        }
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
        resetSearchResults();
      }
      if (event.key === "F2" && !customerModalOpen && !discountEditor && !administrationAccessOpen) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [administrationAccessOpen, customerModalOpen, discountEditor, homeHash, success]);

  useEffect(() => {
    if (!customerModalOpen && !discountEditor && !administrationAccessOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [administrationAccessOpen, customerModalOpen, discountEditor]);


  useEffect(() => {
    if (!administrationAccessOpen || administrationBusy) return;
    const code = normalizeEmployeeAccessCode(administrationCode);
    if (code.length < 8) return;

    if (administrationScanTimerRef.current !== null) {
      window.clearTimeout(administrationScanTimerRef.current);
    }
    administrationScanTimerRef.current = window.setTimeout(() => {
      administrationScanTimerRef.current = null;
      void unlockAdministration(code);
    }, 160);

    return () => {
      if (administrationScanTimerRef.current !== null) {
        window.clearTimeout(administrationScanTimerRef.current);
        administrationScanTimerRef.current = null;
      }
    };
  }, [administrationAccessOpen, administrationBusy, administrationCode]);

  const subtotal = useMemo(
    () => roundMoney(cart.reduce((sum, line) => sum + roundMoney(numberValue(line.sellPrice)) * line.quantity, 0)),
    [cart],
  );
  const total = useMemo(
    () => roundMoney(cart.reduce((sum, line) => {
      const unitPrice = discountedUnitPrice(numberValue(line.sellPrice), line.discountPercent);
      return sum + unitPrice * line.quantity;
    }, 0)),
    [cart],
  );
  const discountTotal = Math.max(0, roundMoney(subtotal - total));
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
    ? roundMoney(numberValue(editingDiscountLine.sellPrice) * editingDiscountLine.quantity)
    : 0;
  const editingDiscountFinal = editingDiscountLine
    ? roundMoney(discountedUnitPrice(numberValue(editingDiscountLine.sellPrice), editingDiscountValue) * editingDiscountLine.quantity)
    : 0;

  function cancelAutomaticLookup() {
    if (automaticLookupTimerRef.current !== null) {
      window.clearTimeout(automaticLookupTimerRef.current);
      automaticLookupTimerRef.current = null;
    }
  }

  function resetSearchResults() {
    cancelAutomaticLookup();
    searchRequestIdRef.current += 1;
    setLoading(false);
    setQuery("");
    setProducts([]);
    setHasSearched(false);
    setError("");
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function invalidateRequestKey() {
    requestKeyRef.current = "";
  }

  function openAdministrationAccess() {
    if (role === "admin") {
      window.location.hash = homeHash;
      return;
    }
    if (administrationScanTimerRef.current !== null) {
      window.clearTimeout(administrationScanTimerRef.current);
      administrationScanTimerRef.current = null;
    }
    administrationUnlockingRef.current = false;
    setAdministrationCode("");
    setAdministrationError("");
    setAdministrationAccessOpen(true);
  }

  async function unlockAdministration(rawValue = administrationCode) {
    if (administrationBusy || administrationUnlockingRef.current) return;
    const code = normalizeEmployeeAccessCode(rawValue);
    if (!code) {
      setAdministrationError("Olvasd be a saját kártyádat vagy írd be a belépőkódodat.");
      return;
    }

    if (administrationScanTimerRef.current !== null) {
      window.clearTimeout(administrationScanTimerRef.current);
      administrationScanTimerRef.current = null;
    }
    administrationUnlockingRef.current = true;
    setAdministrationBusy(true);
    setAdministrationError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ kind: "shop", shopId, code }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      }

      window.sessionStorage.setItem(shopAdministrationUnlockKey(shopId), JSON.stringify({
        shopId,
        verifiedAt: Date.now(),
        expiresAt: Date.now() + SHOP_ADMIN_UNLOCK_TTL_MS,
      }));
      setAdministrationAccessOpen(false);
      setAdministrationCode("");
      window.location.hash = homeHash;
      window.location.reload();
    } catch (caught) {
      setAdministrationError(caught instanceof Error ? caught.message : "A kód ellenőrzése nem sikerült.");
    } finally {
      administrationUnlockingRef.current = false;
      setAdministrationBusy(false);
    }
  }

  async function runSearch(value = query, autoAddExact = false) {
    cancelAutomaticLookup();
    const searchValue = value.trim();
    if (!searchValue) {
      resetSearchResults();
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setLoading(true);
    setHasSearched(true);
    setError("");
    try {
      const response = await apiAifShopSaleCatalog({
        location: locationCode,
        search: searchValue,
        limit: 80,
      });
      if (requestId !== searchRequestIdRef.current) return;

      const items = response.items || [];
      setProducts(items);
      if (autoAddExact) {
        const exact = items.filter((item) => exactCatalogMatch(item, searchValue));
        if (exact.length === 1) {
          addToCart(exact[0]);
          setQuery("");
          setProducts([]);
          setHasSearched(false);
          window.setTimeout(() => searchInputRef.current?.focus(), 0);
        }
      }
    } catch (caught) {
      if (requestId === searchRequestIdRef.current) {
        setError(caught instanceof Error ? caught.message : "A termékek betöltése nem sikerült.");
      }
    } finally {
      if (requestId === searchRequestIdRef.current) setLoading(false);
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

  async function loadLocalities(countyCode: string, selectedCode = "") {
    if (!countyCode) {
      setLocalities([]);
      return;
    }
    setGeoLoading(true);
    try {
      const response = await apiAifListRomaniaLocalities({ countyCode, limit: 1000 });
      setLocalities(response.items || []);
      if (selectedCode && !(response.items || []).some((item) => item.code === selectedCode)) {
        setCustomerDraft((current) => ({ ...current, localityCode: "", postalCode: "" }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A helységek nem tölthetők be.");
      setLocalities([]);
    } finally {
      setGeoLoading(false);
    }
  }

  async function loadCountiesForForm() {
    try {
      const response = await apiAifListRomaniaCounties();
      setCounties(response.items || []);
      return response.items || [];
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A megyék nem tölthetők be.");
      return [];
    }
  }

  function changeCustomerCounty(countyCode: string) {
    setCustomerDraft((current) => ({ ...current, countyCode, localityCode: "", postalCode: "" }));
    void loadLocalities(countyCode);
  }

  function changeCustomerLocality(localityCode: string) {
    const locality = localities.find((item) => item.code === localityCode);
    setCustomerDraft((current) => ({
      ...current,
      localityCode,
      postalCode: locality?.postalCode || current.postalCode || "",
    }));
  }

  function openCustomerModal(mode: CustomerModalMode = "search") {
    setCustomerModalMode(mode);
    setCustomerModalOpen(true);
    setError("");
    if (mode === "search") {
      setCustomerQuery("");
      void loadCustomers("");
    } else {
      setCustomerDraft({ ...EMPTY_CUSTOMER, countyCode: defaultCountyCode });
      setLocalities([]);
      void loadLocalities(defaultCountyCode);
      if (!counties.length) void loadCountiesForForm();
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
    if (!fullName) {
      setError("Új kliensnél a név kötelező.");
      return;
    }
    if (!customerDraft.countyCode || !customerDraft.localityCode) {
      setError("Új kliensnél a megye és a helység kiválasztása kötelező.");
      return;
    }

    setCustomerSaving(true);
    setError("");
    try {
      const response = await apiAifCreateShopCustomer({
        fullName,
        phone,
        email: customerDraft.email.trim() || null,
        countryCode: "RO",
        countyCode: customerDraft.countyCode,
        localityCode: customerDraft.localityCode,
        postalCode: customerDraft.postalCode.trim() || null,
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
      setError("A kosár üres. Adj hozzá legalább egy terméket az eladás lezárása előtt.");
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
        customer: selectedCustomer
          ? {
              id: selectedCustomer.id,
              fullName: selectedCustomer.fullName,
              phone: selectedCustomer.phone || "",
              email: selectedCustomer.email || null,
              address: selectedCustomer.address || null,
              countryCode: selectedCustomer.countryCode || "RO",
              countyCode: selectedCustomer.countyCode || null,
              localityCode: selectedCustomer.localityCode || null,
              postalCode: selectedCustomer.postalCode || null,
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
      resetSearchResults();
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
                onClick={openAdministrationAccess}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/18 bg-[#354153] px-4 text-sm transition hover:border-[#7bd7d4]/45 hover:bg-[#3e4d63] active:scale-[0.98]"
              >
                <ShieldCheck size={18} /> Adminisztráció
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
                    if (event.key === "Enter") {
                      cancelAutomaticLookup();
                      void runSearch(event.currentTarget.value, true);
                    }
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
                {hasSearched ? `Találatok: ${products.length}` : "A termékek csak keresés vagy vonalkódolvasás után jelennek meg"}
              </p>
              {hasSearched || query.trim() ? (
                <button
                  type="button"
                  onClick={resetSearchResults}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/14 bg-white/[0.06] px-3 text-xs text-white/70 hover:bg-white/[0.1]"
                >
                  <RotateCcw size={15} /> Találatok törlése
                </button>
              ) : null}
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
            ) : hasSearched ? (
              <div className="mt-3 flex min-h-[320px] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-black/5 px-6 text-center">
                <PackageSearch size={40} className="text-white/35" />
                <p className="mt-3 text-lg text-white/75">Nincs találat</p>
                <p className="mt-1 max-w-md text-sm text-white/45">Ellenőrizd a kódot, a méretet vagy a termék nevét.</p>
              </div>
            ) : (
              <div className="mt-3 flex min-h-[320px] flex-col items-center justify-center rounded-[22px] border border-dashed border-[#7bd7d4]/18 bg-[#273243]/45 px-6 text-center">
                <Barcode size={44} className="text-[#8ee6e2]/55" />
                <p className="mt-3 text-lg text-white/78">Olvasd be a termék vonalkódját</p>
                <p className="mt-1 max-w-lg text-sm leading-relaxed text-white/45">A teljes készletlista nem foglalja el a képernyőt. A találatok csak akkor jelennek meg, amikor valóban keresel valamit.</p>
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

            <div className={`mt-3 rounded-[18px] border p-3 shadow-[0_10px_24px_rgba(15,23,42,0.16)] ${selectedCustomer ? "border-[#9be9e5]/46 bg-[#247f7d]" : "border-[#9be9e5]/58 bg-gradient-to-r from-[#2a8d8b] to-[#237a78]"}`}>
              {selectedCustomer ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/20 text-[#d7fffd]">
                    <UserRound size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{selectedCustomer.fullName}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/48">
                      {selectedCustomer.phone ? <span>{selectedCustomer.phone}</span> : null}
                      <span>{numberValue(selectedCustomer.saleCount)} korábbi vásárlás</span>
                      {numberValue(selectedCustomer.openBalance) > 0 ? <span className="text-rose-100">Hátralék: {formatMoney(numberValue(selectedCustomer.openBalance))}</span> : null}
                    </p>
                    {customerAddressLabel(selectedCustomer) ? <p className="mt-1 truncate text-[10px] text-white/62">{customerAddressLabel(selectedCustomer)}</p> : null}
                    <p className="mt-1 text-[10px] text-[#bdf8f5]/70">Ez a vásárlás is bekerül a kliens előzményeibe.</p>
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
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-1 text-left text-white transition hover:bg-white/[0.08]"
                >
                  <span className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/28 bg-white/14 text-white"><Users size={20} /></span>
                    <span>
                      <span className="block text-sm">Vásárló hozzárendelése</span>
                      <span className="mt-1 block text-[10px] text-white/72">Hűség, kedvezmény és vásárlási előzmény alapja</span>
                    </span>
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-[10px] ${paymentMethod === "credit" ? "border-amber-100/55 bg-amber-300/22 text-amber-50" : "border-white/28 bg-white/12 text-white/85"}`}>
                    {paymentMethod === "credit" ? "Kötelező" : "Opcionális"}
                  </span>
                </button>
              )}
            </div>

            <div className="mt-3 max-h-[43vh] space-y-2 overflow-y-auto pr-1">
              {cart.length ? cart.map((line) => {
                const listPrice = numberValue(line.sellPrice);
                const discountedUnit = discountedUnitPrice(listPrice, line.discountPercent);
                const lineTotal = roundMoney(discountedUnit * line.quantity);
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

                {paymentMethod === "credit" && !selectedCustomer ? (
                  <div className="mt-3 rounded-xl border border-amber-200/28 bg-amber-500/10 px-3 py-2 text-xs text-amber-50">
                    Utólagos fizetéshez előbb válassz klienst a kosár tetején.
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

      {administrationAccessOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-[#111827]/82 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !administrationBusy) setAdministrationAccessOpen(false); }}>
          <section className="w-full max-w-[500px] overflow-hidden rounded-[28px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_36px_110px_rgba(0,0,0,0.55)]">
            <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#9be9e5]/32 bg-[#2a8d8b]/22 text-[#d7fffd]"><ShieldCheck size={21} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Védett menü</p>
                  <h2 className="mt-1 text-xl font-normal text-white">Adminisztráció megnyitása</h2>
                </div>
              </div>
              <button type="button" disabled={administrationBusy} onClick={() => setAdministrationAccessOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white hover:bg-white/[0.1] disabled:opacity-50"><X size={18} /></button>
            </header>
            <div className="px-5 py-5">
              <p className="text-sm leading-relaxed text-white/62">Olvasd be a saját belépőkártyádat. A rendszer automatikusan megnyitja az adminisztrációt.</p>
              <label className="mt-4 block">
                <span className="mb-2 block text-[10px] uppercase tracking-[0.12em] text-white/45">Belépőkód</span>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8ee6e2]" size={19} />
                  <input
                    autoFocus
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={administrationCode}
                    onChange={(event) => setAdministrationCode(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") void unlockAdministration(event.currentTarget.value); }}
                    placeholder="Olvasd be a kártyát…"
                    className="h-14 w-full rounded-2xl border border-white/18 bg-[#273243] pl-12 pr-4 text-lg text-white outline-none placeholder:text-white/35 focus:border-[#72d8d4] focus:ring-4 focus:ring-[#2a8d8b]/16"
                  />
                </div>
              </label>
              {administrationError ? <div className="mt-3 rounded-xl border border-rose-300/28 bg-rose-500/14 px-3 py-2.5 text-sm text-rose-50">{administrationError}</div> : null}
              <div className="mt-3 rounded-xl border border-[#7bd7d4]/18 bg-[#2a8d8b]/10 px-3 py-2 text-[11px] leading-relaxed text-[#d7fffd]/72">Beolvasás után automatikusan megnyílik. A feloldás 10 percig érvényes ezen a gépen.</div>
            </div>
            <footer className="flex justify-end gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
              <button type="button" disabled={administrationBusy} onClick={() => setAdministrationAccessOpen(false)} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.1] disabled:opacity-50">Mégse</button>
              <button type="button" disabled={administrationBusy} onClick={() => void unlockAdministration()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#9be9e5]/48 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99] disabled:opacity-55">
                {administrationBusy ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />}
                {administrationBusy ? "Ellenőrzés…" : "Megnyitás"}
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}

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
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/42">Vevői nyilvántartás</p>
                  <h2 className="mt-1 text-xl text-white">Vásárló hozzárendelése</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setCustomerModalMode("search"); setCustomerQuery(""); void loadCustomers(""); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs text-white ${customerModalMode === "search" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/15 bg-white/[0.05]"}`}><Search size={15} /> Keresés</button>
                <button type="button" onClick={() => { setCustomerModalMode("new"); setCustomerDraft({ ...EMPTY_CUSTOMER, countyCode: defaultCountyCode }); setLocalities([]); void loadLocalities(defaultCountyCode); if (!counties.length) void loadCountiesForForm(); setError(""); }} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs text-white ${customerModalMode === "new" ? "border-[#9be9e5]/45 bg-[#2a8d8b]" : "border-white/15 bg-white/[0.05]"}`}><UserPlus size={15} /> Új kliens</button>
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
                              {customerAddressLabel(item) ? <p className="flex items-center gap-2 truncate"><MapPin size={13} className="text-[#8ee6e2]" />{customerAddressLabel(item)}</p> : null}
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
                        <button type="button" onClick={() => { setCustomerModalMode("new"); setCustomerDraft({ ...EMPTY_CUSTOMER, fullName: customerQuery, countyCode: defaultCountyCode }); setLocalities([]); void loadLocalities(defaultCountyCode); if (!counties.length) void loadCountiesForForm(); }} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/40 bg-[#2a8d8b] px-4 text-sm text-white"><UserPlus size={17} /> Új kliens</button>
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
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Telefonszám <span className="normal-case tracking-normal text-white/35">(opcionális)</span><input value={customerDraft.phone} onChange={(event) => setCustomerDraft((current) => ({ ...current, phone: event.target.value }))} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/42 focus:border-[#72d8d4]" /></label>
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">E-mail<input type="email" value={customerDraft.email} onChange={(event) => setCustomerDraft((current) => ({ ...current, email: event.target.value }))} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/42 focus:border-[#72d8d4]" /></label>
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Megye *<select value={customerDraft.countyCode} onChange={(event) => changeCustomerCounty(event.target.value)} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"><option value="">Válassz megyét</option>{counties.map((county) => <option key={county.code} value={county.code}>{county.name}</option>)}</select></label>
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Helység *<select value={customerDraft.localityCode} onChange={(event) => changeCustomerLocality(event.target.value)} disabled={!customerDraft.countyCode || geoLoading} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4] disabled:cursor-not-allowed disabled:opacity-50"><option value="">{geoLoading ? "Helységek betöltése…" : "Válassz helységet"}</option>{localities.map((locality) => <option key={locality.code} value={locality.code}>{locality.name}</option>)}</select></label>
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Irányítószám<input value={customerDraft.postalCode} onChange={(event) => setCustomerDraft((current) => ({ ...current, postalCode: event.target.value.replace(/[^0-9]/g, "").slice(0, 6) }))} placeholder="Automatikusan kitöltődik" className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/42 focus:border-[#72d8d4]" /></label>
                      <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48 sm:col-span-2">Pontos cím<input value={customerDraft.address} onChange={(event) => setCustomerDraft((current) => ({ ...current, address: event.target.value }))} placeholder="Utca, házszám, tömbház, lépcsőház, lakás…" className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/42 focus:border-[#72d8d4]" /></label>
                    </div>
                    <label className="mt-3 grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">Megjegyzés<textarea value={customerDraft.note} onChange={(event) => setCustomerDraft((current) => ({ ...current, note: event.target.value }))} rows={3} className="resize-none rounded-xl border border-white/16 bg-[#273243] px-3 py-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/42 focus:border-[#72d8d4]" /></label>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
              <p className="text-xs text-white/42">A kiválasztott kliens minden fizetési módnál hozzákapcsolódik a vásárláshoz.</p>
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
