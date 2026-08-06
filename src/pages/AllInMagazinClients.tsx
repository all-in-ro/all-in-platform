import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  History,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Pencil,
  Save,
  Search,
  ShoppingBag,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifCreateShopCustomer,
  apiAifDeleteShopCustomer,
  apiAifDetachShopCustomerSale,
  apiAifGetShopCustomer,
  apiAifListRomaniaCounties,
  apiAifListRomaniaLocalities,
  apiAifListShopCustomers,
  apiAifRecordShopCustomerPayment,
  apiAifUpdateShopCustomer,
  type AifRomaniaCounty,
  type AifRomaniaLocality,
  type AifShopCustomer,
  type AifShopCustomerDetail,
  type AifShopCustomerPaymentMethod,
  type AifShopCustomerSaleHistoryItem,
} from "../lib/aif/api";

type ClientMode = "search" | "new" | "edit" | "detail";

type Props = {
  open: boolean;
  initialMode?: "search" | "new";
  locationName: string;
  onClose: () => void;
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

type PaymentDraft = {
  amount: string;
  method: AifShopCustomerPaymentMethod;
  reference: string;
  note: string;
};

const EMPTY_DRAFT: CustomerDraft = {
  fullName: "",
  phone: "",
  email: "",
  countyCode: "",
  localityCode: "",
  postalCode: "",
  address: "",
  note: "",
};

const EMPTY_PAYMENT: PaymentDraft = {
  amount: "",
  method: "cash",
  reference: "",
  note: "",
};

const PAYMENT_METHODS: Array<{
  value: AifShopCustomerPaymentMethod;
  label: string;
  icon: typeof Banknote;
}> = [
  { value: "cash", label: "Készpénz", icon: Banknote },
  { value: "card", label: "Bankkártya", icon: CreditCard },
  { value: "bank_transfer", label: "Átutalás", icon: Landmark },
];

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

function parseMoneyInput(value: string) {
  const normalized = value.trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `customer-payment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function locationCodeFromName(locationName: string) {
  const normalized = locationName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalized.includes("targu") || normalized.includes("kezdi")
    ? "magazin_targu_secuiesc"
    : "main_warehouse";
}

function preferredCountyCode(locationName: string) {
  const normalized = locationName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalized.includes("targu") || normalized.includes("kezdi") ? "CV" : "HR";
}

function customerAddressLabel(customer: AifShopCustomer) {
  const locality = customer.localityName || customer.city || "";
  const county = customer.countyName || "";
  const place = [locality, county].filter(Boolean).join(", ");
  return [place, customer.address, customer.postalCode].filter(Boolean).join(" • ");
}

function paymentMethodLabel(method: string) {
  const found = PAYMENT_METHODS.find((item) => item.value === method);
  return found?.label || method || "Egyéb";
}

export default function AllInMagazinClients({
  open,
  initialMode = "search",
  locationName,
  onClose,
}: Props) {
  const currentYear = new Date().getFullYear();
  const [mode, setMode] = useState<ClientMode>(initialMode);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AifShopCustomer[]>([]);
  const [selected, setSelected] = useState<AifShopCustomer | null>(null);
  const [detail, setDetail] = useState<AifShopCustomerDetail | null>(null);
  const [detailYear, setDetailYear] = useState(currentYear);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_DRAFT);
  const [counties, setCounties] = useState<AifRomaniaCounty[]>([]);
  const [localities, setLocalities] = useState<AifRomaniaLocality[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(EMPTY_PAYMENT);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [saleDetachTarget, setSaleDetachTarget] = useState<AifShopCustomerSaleHistoryItem | null>(null);
  const [saleDetaching, setSaleDetaching] = useState(false);
  const [customerDeleteOpen, setCustomerDeleteOpen] = useState(false);
  const [customerDeleting, setCustomerDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const paymentRequestKeyRef = useRef("");

  const locationCode = useMemo(() => locationCodeFromName(locationName), [locationName]);
  const defaultCountyCode = useMemo(() => preferredCountyCode(locationName), [locationName]);
  const yearOptions = useMemo(
    () => Array.from({ length: Math.max(1, currentYear - 2025 + 1) }, (_, index) => currentYear - index),
    [currentYear],
  );
  const customerHasHistory = Boolean(
    detail && (numberValue(detail.summary.saleCount) > 0 || detail.payments.length > 0),
  );
  const customerHasOpenBalance = numberValue(detail?.summary.openBalance) > 0.005;

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
        setDraft((current) => ({ ...current, localityCode: "", postalCode: "" }));
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

  function changeDraftCounty(countyCode: string) {
    setDraft((current) => ({ ...current, countyCode, localityCode: "", postalCode: "" }));
    void loadLocalities(countyCode);
  }

  function changeDraftLocality(localityCode: string) {
    const locality = localities.find((item) => item.code === localityCode);
    setDraft((current) => ({
      ...current,
      localityCode,
      postalCode: locality?.postalCode || current.postalCode || "",
    }));
  }

  useEffect(() => {
    if (!open) return;
    void loadCountiesForForm();
    setMode(initialMode);
    setSelected(null);
    setDetail(null);
    setDetailYear(currentYear);
    setYearPickerOpen(false);
    setError("");
    setSuccess("");
    setPaymentDraft(EMPTY_PAYMENT);
    setSaleDetachTarget(null);
    setSaleDetaching(false);
    setCustomerDeleteOpen(false);
    setCustomerDeleting(false);
    paymentRequestKeyRef.current = "";
    if (initialMode === "new") {
      const nextDraft = { ...EMPTY_DRAFT, countyCode: defaultCountyCode };
      setDraft(nextDraft);
      void loadLocalities(defaultCountyCode);
    } else {
      setQuery("");
      void loadCustomers("");
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [currentYear, defaultCountyCode, initialMode, open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (yearPickerOpen) {
        setYearPickerOpen(false);
        return;
      }
      if (customerDeleteOpen) {
        if (!customerDeleting) setCustomerDeleteOpen(false);
        return;
      }
      if (saleDetachTarget) {
        if (!saleDetaching) setSaleDetachTarget(null);
        return;
      }
      if (mode === "edit") {
        setMode("detail");
        setError("");
        return;
      }
      if (mode === "detail") {
        openSearch();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [customerDeleteOpen, customerDeleting, mode, onClose, open, saleDetachTarget, saleDetaching, yearPickerOpen]);

  async function loadCustomers(value = query) {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifListShopCustomers({
        search: value.trim(),
        limit: 100,
      });
      setItems(response.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A klienslista nem tölthető be.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomerDetail(customerId: string, year = detailYear) {
    setDetailLoading(true);
    setError("");
    try {
      const response = await apiAifGetShopCustomer(customerId, { year, salesLimit: 200, paymentsLimit: 200 });
      setDetail(response);
      setSelected(response.item);
      setItems((current) => current.map((item) => item.id === response.item.id ? response.item : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kliens adatlapja nem tölthető be.");
    } finally {
      setDetailLoading(false);
    }
  }

  function openSearch() {
    setMode("search");
    setSelected(null);
    setDetail(null);
    setDraft(EMPTY_DRAFT);
    setError("");
    setSuccess("");
    setPaymentDraft(EMPTY_PAYMENT);
    setSaleDetachTarget(null);
    setCustomerDeleteOpen(false);
    setYearPickerOpen(false);
    paymentRequestKeyRef.current = "";
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function openNew(prefillName = "") {
    setMode("new");
    setSelected(null);
    setDetail(null);
    setDraft({ ...EMPTY_DRAFT, fullName: prefillName, countyCode: defaultCountyCode });
    setLocalities([]);
    void loadLocalities(defaultCountyCode);
    if (!counties.length) void loadCountiesForForm();
    setCustomerDeleteOpen(false);
    setYearPickerOpen(false);
    setError("");
    setSuccess("");
  }

  function openDetail(customer: AifShopCustomer) {
    setSelected(customer);
    setMode("detail");
    setDetail(null);
    setDetailYear(currentYear);
    setPaymentDraft(EMPTY_PAYMENT);
    setSaleDetachTarget(null);
    setCustomerDeleteOpen(false);
    paymentRequestKeyRef.current = "";
    setError("");
    setSuccess("");
    void loadCustomerDetail(customer.id, currentYear);
  }

  function openEdit() {
    const customer = detail?.item || selected;
    if (!customer) return;
    const countyCode = customer.countyCode || defaultCountyCode;
    const localityCode = customer.localityCode || "";
    setDraft({
      fullName: customer.fullName || "",
      phone: customer.phone || "",
      email: customer.email || "",
      countyCode,
      localityCode,
      postalCode: customer.postalCode || "",
      address: customer.address || "",
      note: customer.notes || "",
    });
    setLocalities([]);
    void loadLocalities(countyCode, localityCode);
    if (!counties.length) void loadCountiesForForm();
    setMode("edit");
    setCustomerDeleteOpen(false);
    setError("");
    setSuccess("");
  }

  function cancelCustomerForm() {
    if (mode === "edit" && selected) {
      setMode("detail");
      setDraft(EMPTY_DRAFT);
      setError("");
      return;
    }
    openSearch();
  }

  async function saveCustomer() {
    const fullName = draft.fullName.trim();
    const phone = draft.phone.trim();
    if (!fullName || !phone) {
      setError("A név és a telefonszám kötelező.");
      return;
    }
    if (!draft.countyCode || !draft.localityCode) {
      setError("A megye és a helység kiválasztása kötelező.");
      return;
    }
    if (mode === "edit" && !selected) {
      setError("A szerkesztendő kliens nem található.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const input = {
        fullName,
        phone,
        email: draft.email.trim() || null,
        countryCode: "RO",
        countyCode: draft.countyCode,
        localityCode: draft.localityCode,
        postalCode: draft.postalCode.trim() || null,
        address: draft.address.trim() || null,
        note: draft.note.trim() || null,
      };
      const response = mode === "edit" && selected
        ? await apiAifUpdateShopCustomer(selected.id, input)
        : await apiAifCreateShopCustomer(input);
      const saved = response.item;
      setItems((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists
          ? current.map((item) => item.id === saved.id ? saved : item)
          : [saved, ...current];
      });
      setSelected(saved);
      setMode("detail");
      setDraft(EMPTY_DRAFT);
      setSuccess(
        mode === "edit"
          ? "A kliens adatai frissítve."
          : ("duplicate" in response && response.duplicate ? "A meglévő kliens adatai frissítve." : "A kliens rögzítve."),
      );
      await loadCustomerDetail(saved.id, detailYear || currentYear);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kliens mentése nem sikerült.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer() {
    if (!selected) return;
    setCustomerDeleting(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiAifDeleteShopCustomer(selected.id);
      const deletedName = selected.fullName;
      setItems((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      setDetail(null);
      setDraft(EMPTY_DRAFT);
      setCustomerDeleteOpen(false);
      setMode("search");
      setSuccess(
        response.mode === "archived"
          ? `${deletedName} archiválva. A korábbi vásárlások és befizetések megmaradtak.`
          : `${deletedName} végleg törölve.`,
      );
      await loadCustomers(query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kliens törlése nem sikerült.");
    } finally {
      setCustomerDeleting(false);
    }
  }

  async function recordPayment() {
    if (!selected || !detail) return;
    const amount = parseMoneyInput(paymentDraft.amount);
    const openBalance = numberValue(detail.summary.openBalance);
    if (amount <= 0) {
      setError("A befizetés összege legyen nagyobb nullánál.");
      return;
    }
    if (amount > openBalance + 0.005) {
      setError(`A befizetés nem lehet nagyobb a nyitott tartozásnál: ${formatMoney(openBalance)}.`);
      return;
    }

    setPaymentSaving(true);
    setError("");
    setSuccess("");
    if (!paymentRequestKeyRef.current) paymentRequestKeyRef.current = createRequestKey();
    try {
      const response = await apiAifRecordShopCustomerPayment(selected.id, {
        amount,
        method: paymentDraft.method,
        location: locationCode,
        reference: paymentDraft.reference.trim() || null,
        note: paymentDraft.note.trim() || null,
        idempotencyKey: paymentRequestKeyRef.current,
      });
      setSuccess(
        `${formatMoney(response.payment.amount)} befizetés rögzítve. Fennmaradó tartozás: ${formatMoney(response.openBalance)}.`,
      );
      setPaymentDraft(EMPTY_PAYMENT);
      paymentRequestKeyRef.current = "";
      await Promise.all([
        loadCustomerDetail(selected.id, detailYear),
        loadCustomers(query),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A befizetés rögzítése nem sikerült.");
    } finally {
      setPaymentSaving(false);
    }
  }

  async function detachCustomerSale() {
    if (!selected || !saleDetachTarget) return;
    setSaleDetaching(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiAifDetachShopCustomerSale(selected.id, saleDetachTarget.id);
      setSuccess(`${response.saleNumber} törölve a kliens vásárlási előzményeiből. Fennmaradó tartozás: ${formatMoney(response.openBalance)}.`);
      setSaleDetachTarget(null);
      await Promise.all([
        loadCustomerDetail(selected.id, detailYear),
        loadCustomers(query),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A vásárlás leválasztása nem sikerült.");
    } finally {
      setSaleDetaching(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-[#111827]/82 p-3 backdrop-blur-sm sm:p-5">
      <div
        style={{ color: "#ffffff" }}
        className="flex max-h-[95vh] w-full max-w-[1240px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_36px_110px_rgba(0,0,0,0.58)] [&_button]:font-normal [&_input]:font-normal [&_select]:font-normal [&_textarea]:font-normal"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#9be9e5]/35 bg-[#2a8d8b]/24 text-[#d7fffd]">
              <Users size={24} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Vevői nyilvántartás</p>
              <h2 className="mt-1 truncate text-xl text-white">Kliensek és vásárlási előzmények</h2>
              <p className="mt-1 truncate text-xs text-white/45">{locationName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openSearch}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs text-white transition ${
                mode === "search" || mode === "detail" || mode === "edit"
                  ? "border-[#9be9e5]/45 bg-[#2a8d8b]"
                  : "border-white/15 bg-white/[0.05] hover:bg-white/[0.09]"
              }`}
            >
              <Search size={15} /> Lista
            </button>
            <button
              type="button"
              onClick={() => openNew()}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs text-white transition ${
                mode === "new"
                  ? "border-[#9be9e5]/45 bg-[#2a8d8b]"
                  : "border-white/15 bg-white/[0.05] hover:bg-white/[0.09]"
              }`}
            >
              <UserPlus size={15} /> Új kliens
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Bezárás"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white hover:bg-white/[0.1]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="mx-4 mt-4 rounded-2xl border border-rose-300/35 bg-rose-500/16 px-4 py-3 text-sm text-rose-50 sm:mx-5">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-500/14 px-4 py-3 text-sm text-emerald-50 sm:mx-5">
            <CheckCircle2 size={18} className="shrink-0" />
            {success}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {mode === "search" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8ee6e2]" size={20} />
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void loadCustomers(query);
                    }}
                    placeholder="Név, telefonszám vagy e-mail…"
                    className="h-14 w-full rounded-2xl border border-white/18 bg-[#273243] pl-12 pr-4 text-base text-white outline-none placeholder:text-white/45 focus:border-[#72d8d4] focus:ring-4 focus:ring-[#2a8d8b]/16"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadCustomers(query)}
                  className="inline-flex h-14 min-w-[140px] items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99]"
                >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                  Keresés
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs text-white/48">{items.length} kliens</span>
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      void loadCustomers("");
                    }}
                    className="h-9 rounded-xl border border-white/14 bg-white/[0.05] px-3 text-xs text-white/70 hover:bg-white/[0.09]"
                  >
                    Szűrés törlése
                  </button>
                ) : null}
              </div>

              {loading ? (
                <div className="flex min-h-[320px] items-center justify-center gap-3 text-white/55">
                  <Loader2 className="animate-spin" /> Kliensek betöltése…
                </div>
              ) : items.length ? (
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openDetail(item)}
                      className="group rounded-[20px] border border-white/13 bg-[#374357] p-4 text-left text-white transition hover:border-[#72d8d4]/50 hover:bg-[#3d4a5f] active:scale-[0.99]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/28 bg-[#2a8d8b]/16 text-[#d7fffd]">
                          <UserRound size={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-base text-white">{item.fullName}</p>
                            <span className="rounded-full border border-white/12 bg-black/10 px-2 py-1 text-[10px] text-white/60">
                              {numberValue(item.saleCount)} vásárlás
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-white/55">
                            {item.phone ? <p className="flex items-center gap-2"><Phone size={13} className="text-[#8ee6e2]" />{item.phone}</p> : null}
                            {item.email ? <p className="flex items-center gap-2 truncate"><Mail size={13} className="text-[#8ee6e2]" />{item.email}</p> : null}
                            {customerAddressLabel(item) ? <p className="flex items-center gap-2 truncate"><MapPin size={13} className="text-[#8ee6e2]" />{customerAddressLabel(item)}</p> : null}
                          </div>
                          <div className="mt-3 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2">
                            <span className="rounded-xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 px-3 py-2 text-[#d7fffd]">
                              <span className="block text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/58">Idei vásárlás</span>
                              <strong className="mt-1 block text-base font-normal tabular-nums">{formatMoney(item.yearPurchaseTotal)}</strong>
                            </span>
                            <span className={`rounded-xl border px-3 py-2 ${
                              numberValue(item.openBalance) > 0
                                ? "border-red-300/80 bg-red-600 text-white shadow-[0_8px_20px_rgba(220,38,38,0.28)]"
                                : "border-[#7bd7d4]/25 bg-[#2a8d8b]/14 text-[#d7fffd]"
                            }`}>
                              <span className="block text-[9px] uppercase tracking-[0.1em] opacity-75">Tartozás</span>
                              <strong className="mt-1 block text-lg font-normal tabular-nums">{formatMoney(item.openBalance)}</strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex min-h-[320px] flex-col items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-black/5 px-5 text-center">
                  <Users size={38} className="text-white/30" />
                  <p className="mt-3 text-base text-white/70">Nincs találat</p>
                  <button
                    type="button"
                    onClick={() => openNew(query)}
                    className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/40 bg-[#2a8d8b] px-4 text-sm text-white"
                  >
                    <UserPlus size={17} /> Új kliens
                  </button>
                </div>
              )}
            </>
          ) : mode === "new" || mode === "edit" ? (
            <div className="mx-auto max-w-[780px] rounded-[22px] border border-white/13 bg-[#374357] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#7bd7d4]/28 bg-[#2a8d8b]/16 text-[#d7fffd]">
                  {mode === "edit" ? <Pencil size={20} /> : <UserPlus size={20} />}
                </span>
                <div>
                  <h3 className="text-lg text-white">{mode === "edit" ? "Kliens szerkesztése" : "Új kliens"}</h3>
                  {mode === "edit" ? <p className="mt-1 text-xs text-white/45">A régi adatokat itt lehet egységes megye- és helységadatra javítani.</p> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Név *
                  <input autoFocus value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]" />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Telefonszám *
                  <input value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]" />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  E-mail
                  <input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]" />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Megye *
                  <select value={draft.countyCode} onChange={(event) => changeDraftCounty(event.target.value)} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]">
                    <option value="">Válassz megyét</option>
                    {counties.map((county) => <option key={county.code} value={county.code}>{county.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Helység *
                  <select value={draft.localityCode} onChange={(event) => changeDraftLocality(event.target.value)} disabled={!draft.countyCode || geoLoading} className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4] disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="">{geoLoading ? "Helységek betöltése…" : "Válassz helységet"}</option>
                    {localities.map((locality) => <option key={locality.code} value={locality.code}>{locality.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Irányítószám
                  <input value={draft.postalCode} onChange={(event) => setDraft((current) => ({ ...current, postalCode: event.target.value.replace(/[^0-9]/g, "").slice(0, 6) }))} placeholder="Automatikusan kitöltődik" className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/35 focus:border-[#72d8d4]" />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50 sm:col-span-2">
                  Pontos cím
                  <input value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} placeholder="Utca, házszám, tömbház, lépcsőház, lakás…" className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/35 focus:border-[#72d8d4]" />
                </label>
              </div>

              <label className="mt-3 grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                Megjegyzés
                <textarea
                  value={draft.note}
                  onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                  rows={3}
                  className="resize-none rounded-xl border border-white/16 bg-[#273243] px-3 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"
                />
              </label>

              <div className="mt-4 flex justify-end gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={cancelCustomerForm}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.09]"
                >
                  <X size={17} /> Mégse
                </button>
                <button
                  type="button"
                  onClick={() => void saveCustomer()}
                  disabled={saving}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
                  {mode === "edit" ? "Módosítások mentése" : "Mentés"}
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="mx-auto max-w-[1160px]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={openSearch}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3 text-xs text-white hover:bg-white/[0.09]"
                >
                  <ArrowLeft size={15} /> Vissza a listához
                </button>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={openEdit}
                    disabled={!detail || detailLoading}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#9be9e5]/40 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] disabled:opacity-50"
                  >
                    <Pencil size={15} /> Szerkesztés
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerDeleteOpen(true)}
                    disabled={!detail || detailLoading}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-300/50 bg-rose-600 px-3 text-xs text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    <Trash2 size={15} /> Kliens törlése
                  </button>
                  <button
                    type="button"
                    onClick={() => setYearPickerOpen(true)}
                    className="inline-flex h-11 min-w-[112px] touch-manipulation items-center justify-between gap-3 rounded-xl border border-white/16 bg-[#293548] px-3 text-sm text-white transition hover:border-[#72d8d4]/45 hover:bg-[#354153] active:bg-[#2a8d8b]"
                    title="Éves összesítés"
                  >
                    <CalendarDays size={17} className="text-[#8ee6e2]" />
                    <span className="text-base tabular-nums">{detailYear}</span>
                    <ChevronDown size={17} className="text-white/55" />
                  </button>
                </div>
              </div>

              {detailLoading && !detail ? (
                <div className="flex min-h-[420px] items-center justify-center gap-3 rounded-[24px] border border-white/14 bg-[#374357] text-white/55">
                  <Loader2 className="animate-spin" /> Kliensadatlap betöltése…
                </div>
              ) : detail ? (
                <div className="space-y-3">
                  <div className="rounded-[24px] border border-white/14 bg-[#374357] p-4 sm:p-5">
                    <div className="flex flex-wrap items-start gap-4">
                      <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]">
                        <UserRound size={25} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-2xl text-white">{detail.item.fullName}</h3>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
                          {detail.item.phone ? <span className="inline-flex items-center gap-2"><Phone size={13} className="text-[#8ee6e2]" />{detail.item.phone}</span> : null}
                          {detail.item.email ? <span className="inline-flex items-center gap-2"><Mail size={13} className="text-[#8ee6e2]" />{detail.item.email}</span> : null}
                          {customerAddressLabel(detail.item) ? <span className="inline-flex items-center gap-2"><MapPin size={13} className="text-[#8ee6e2]" />{customerAddressLabel(detail.item)}</span> : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 p-3">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-[#d7fffd]/55">{detail.summary.year}. évi vásárlás</p>
                        <p className="mt-2 text-3xl text-[#d7fffd] tabular-nums">{formatMoney(detail.summary.yearPurchaseTotal)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Összes vásárlás</p>
                        <p className="mt-2 text-3xl text-white tabular-nums">{formatMoney(detail.summary.lifetimePurchaseTotal)}</p>
                      </div>
                      <div className={`rounded-2xl border p-4 ${
                        numberValue(detail.summary.openBalance) > 0
                          ? "border-red-300/80 bg-red-600 text-white shadow-[0_12px_28px_rgba(220,38,38,0.30)]"
                          : "border-[#7bd7d4]/30 bg-[#2a8d8b]/16 text-[#d7fffd]"
                      }`}>
                        <p className="text-[10px] uppercase tracking-[0.13em] opacity-75">Nyitott tartozás</p>
                        <p className="mt-2 text-3xl tabular-nums sm:text-4xl">{formatMoney(detail.summary.openBalance)}</p>
                        <p className="mt-1 text-xs opacity-70">{detail.summary.openSales} nyitott vásárlás</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Vásárlások száma</p>
                        <p className="mt-2 text-3xl text-white tabular-nums">{detail.summary.saleCount}</p>
                        <p className="mt-1 text-[10px] text-white/48">Utolsó: {formatDateTime(detail.summary.lastSaleAt)}</p>
                      </div>
                    </div>
                  </div>

                  {numberValue(detail.summary.openBalance) > 0 ? (
                    <div className="rounded-[24px] border border-amber-200/24 bg-[#3a424f] p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200/25 bg-amber-300/10 text-amber-50">
                            <WalletCards size={21} />
                          </span>
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Tartozás rendezése</p>
                            <h3 className="mt-1 text-lg text-white">Befizetés rögzítése</h3>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPaymentDraft((current) => ({ ...current, amount: String(numberValue(detail.summary.openBalance).toFixed(2)) }))}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-200/30 bg-amber-300/10 px-3 text-xs text-amber-50 hover:bg-amber-300/16"
                        >
                          Teljes tartozás: {formatMoney(detail.summary.openBalance)}
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(320px,1.2fr)]">
                        <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                          Befizetett összeg *
                          <div className="grid grid-cols-[1fr_auto] overflow-hidden rounded-xl border border-white/16 bg-[#273243] focus-within:border-[#72d8d4]">
                            <input
                              inputMode="decimal"
                              value={paymentDraft.amount}
                              onChange={(event) => {
                                paymentRequestKeyRef.current = "";
                                setPaymentDraft((current) => ({ ...current, amount: event.target.value.replace(/[^0-9.,]/g, "") }));
                              }}
                              className="h-12 min-w-0 bg-transparent px-3 text-right text-lg normal-case tracking-normal text-white outline-none"
                              placeholder="0,00"
                            />
                            <span className="inline-flex h-12 items-center border-l border-white/12 px-3 text-sm text-white/55">RON</span>
                          </div>
                        </label>

                        <div>
                          <p className="text-[10px] uppercase tracking-[0.1em] text-white/48">Fizetési mód</p>
                          <div className="mt-1.5 grid grid-cols-3 gap-2">
                            {PAYMENT_METHODS.map((option) => {
                              const Icon = option.icon;
                              const active = paymentDraft.method === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => {
                                    paymentRequestKeyRef.current = "";
                                    setPaymentDraft((current) => ({ ...current, method: option.value }));
                                  }}
                                  className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-xs transition ${
                                    active
                                      ? "border-[#9be9e5]/45 bg-[#2a8d8b] text-white"
                                      : "border-white/14 bg-[#273243] text-white/65 hover:bg-white/[0.08]"
                                  }`}
                                >
                                  <Icon size={16} /> {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                          Hivatkozás
                          <input
                            value={paymentDraft.reference}
                            onChange={(event) => {
                              paymentRequestKeyRef.current = "";
                              setPaymentDraft((current) => ({ ...current, reference: event.target.value }));
                            }}
                            placeholder="Nyugtaszám, átutalási azonosító…"
                            className="h-11 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/35 focus:border-[#72d8d4]"
                          />
                        </label>
                        <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                          Megjegyzés
                          <input
                            value={paymentDraft.note}
                            onChange={(event) => {
                              paymentRequestKeyRef.current = "";
                              setPaymentDraft((current) => ({ ...current, note: event.target.value }));
                            }}
                            placeholder="Opcionális"
                            className="h-11 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/35 focus:border-[#72d8d4]"
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                        <p className="max-w-2xl text-xs leading-relaxed text-white/48">
                          A befizetés a legrégebbi nyitott vásárlástól indulva csökkenti a tartozást. Minden részlet és időpont megmarad az előzményekben.
                        </p>
                        <button
                          type="button"
                          onClick={() => void recordPayment()}
                          disabled={paymentSaving}
                          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99] disabled:opacity-60"
                        >
                          {paymentSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                          Befizetés rögzítése
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#d7fffd]"><ShoppingBag size={20} /></span>
                        <div>
                          <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Vásárolt termékek</p>
                          <h3 className="mt-1 text-lg text-white">{detail.summary.year}. évi terméklista</h3>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">{detail.sales.length} bizonylat</span>
                        <span className="rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 px-2.5 py-1 text-[10px] text-[#d7fffd]">
                          {detail.sales.reduce((sum, sale) => sum + (sale.lines?.length || 0), 0)} terméksor
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 max-h-[640px] space-y-3 overflow-y-auto pr-1">
                      {detail.sales.length ? detail.sales.map((sale) => (
                        <article key={sale.id} className="overflow-hidden rounded-[22px] border border-white/12 bg-[#293548]">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#303b4e] px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm text-white">{sale.saleNumber}</p>
                              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/48">
                                <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} className="text-[#8ee6e2]" />{formatDateTime(sale.soldAt)}</span>
                                <span>{sale.locationName || "–"}</span>
                                {sale.actor ? <span>Eladó: {sale.actor}</span> : null}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <div className="text-right">
                                <p className="text-[10px] uppercase tracking-[0.08em] text-white/40">Bizonylat összege</p>
                                <p className="mt-1 text-xl text-white tabular-nums">{formatMoney(sale.total)}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSaleDetachTarget(sale)}
                                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rose-300/55 bg-rose-600 px-3 text-[11px] text-white shadow-[0_6px_14px_rgba(225,29,72,0.22)] hover:bg-rose-500"
                                title="Törlés a kliens vásárlási előzményeiből"
                              >
                                <Trash2 size={14} /> Törlés
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2 p-3">
                            {sale.lines?.length ? sale.lines.map((line) => (
                              <div
                                key={line.id || `${sale.id}-${line.lineNo}`}
                                className="grid grid-cols-[68px_minmax(0,1fr)] gap-3 rounded-2xl border border-white/10 bg-[#253144] p-3 sm:grid-cols-[68px_minmax(0,1fr)_minmax(210px,auto)] sm:items-center"
                              >
                                <span className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/12 bg-white/95">
                                  {line.imageUrl ? (
                                    <img src={line.imageUrl} alt={line.productTitle || "Termék"} className="h-full w-full object-contain" />
                                  ) : (
                                    <ShoppingBag size={26} className="text-[#526173]" />
                                  )}
                                </span>

                                <div className="min-w-0">
                                  <p className="truncate text-sm text-white">{line.productTitle || "Névtelen termék"}</p>
                                  <p className="mt-1 truncate text-[11px] text-white/50">
                                    {[line.brandName, line.subcategoryName || line.categoryName, line.colorName, line.size].filter(Boolean).join(" • ") || "–"}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-white/55">
                                    <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/10 px-2 py-1"><CalendarDays size={11} />{formatDateTime(sale.soldAt)}</span>
                                    {line.productCode ? <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">Kód: {line.productCode}</span> : null}
                                    {line.barcode ? <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">Vonalkód: {line.barcode}</span> : null}
                                  </div>
                                </div>

                                <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:min-w-[230px]">
                                  <span className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-center">
                                    <span className="block text-[9px] uppercase tracking-[0.08em] text-white/40">Darab</span>
                                    <strong className="mt-1 block text-lg font-normal text-[#d7fffd]">{line.quantity} db</strong>
                                  </span>
                                  <span className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-right">
                                    <span className="block text-[9px] uppercase tracking-[0.08em] text-white/40">Egységár</span>
                                    <strong className="mt-1 block text-sm font-normal text-white">{formatMoney(line.unitPrice)}</strong>
                                  </span>
                                  {numberValue(line.discountPercent) > 0 ? (
                                    <span className="rounded-xl border border-amber-200/20 bg-amber-400/10 px-3 py-2 text-center text-amber-50">
                                      <span className="block text-[9px] uppercase tracking-[0.08em] text-amber-100/60">Kedvezmény</span>
                                      <strong className="mt-1 block text-sm font-normal">{numberValue(line.discountPercent).toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%</strong>
                                    </span>
                                  ) : (
                                    <span className="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-center text-white/48">
                                      <span className="block text-[9px] uppercase tracking-[0.08em]">Kedvezmény</span>
                                      <strong className="mt-1 block text-sm font-normal">0%</strong>
                                    </span>
                                  )}
                                  <span className="rounded-xl border border-[#7bd7d4]/25 bg-[#2a8d8b]/14 px-3 py-2 text-right text-[#d7fffd]">
                                    <span className="block text-[9px] uppercase tracking-[0.08em] text-[#d7fffd]/58">Sorösszeg</span>
                                    <strong className="mt-1 block text-base font-normal">{formatMoney(line.lineTotal)}</strong>
                                  </span>
                                </div>
                              </div>
                            )) : (
                              <div className="rounded-2xl border border-dashed border-white/12 px-4 py-6 text-center text-sm text-white/42">
                                Ehhez a régi bizonylathoz nincs mentett terméksor.
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-2 border-t border-white/10 bg-black/5 px-3 py-3 text-[10px]">
                            <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1.5 text-white/55">{sale.itemCount} db összesen</span>
                            <span className="rounded-lg border border-[#7bd7d4]/18 bg-[#2a8d8b]/10 px-2 py-1.5 text-[#d7fffd]">Fizetve: {formatMoney(sale.paidTotal)}</span>
                            <span className={`rounded-lg border px-2 py-1.5 ${numberValue(sale.balanceDue) > 0 ? "border-rose-300/35 bg-rose-600 text-white" : "border-white/10 bg-black/10 text-white/55"}`}>Maradt: {formatMoney(sale.balanceDue)}</span>
                          </div>
                        </article>
                      )) : (
                        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center text-white/42">
                          <ShoppingBag size={34} />
                          <p className="mt-2 text-sm">Ebben az évben nincs a klienshez kapcsolt vásárlás.</p>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#d7fffd]"><History size={19} /></span>
                        <div>
                          <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Pénzmozgások</p>
                          <h3 className="mt-1 text-base text-white">Befizetési előzmények</h3>
                        </div>
                      </div>
                      <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">{detail.payments.length} bejegyzés</span>
                    </div>

                    <div className="mt-3 grid max-h-[360px] gap-2 overflow-y-auto pr-1 lg:grid-cols-2">
                      {detail.payments.length ? detail.payments.map((payment) => (
                        <div key={payment.id} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm text-white">{paymentMethodLabel(payment.method)}</p>
                              <p className="mt-1 text-[11px] text-white/45">{formatDateTime(payment.paidAt)} • {payment.actor || "–"}</p>
                            </div>
                            <p className="shrink-0 text-lg text-[#d7fffd]">+{formatMoney(payment.amount)}</p>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/55">
                            {payment.locationName ? <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">{payment.locationName}</span> : null}
                            {payment.reference ? <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">Hiv.: {payment.reference}</span> : null}
                          </div>
                          {payment.note ? <p className="mt-2 text-xs leading-relaxed text-white/58">{payment.note}</p> : null}
                          {payment.allocations.length ? (
                            <div className="mt-2 space-y-1 border-t border-white/8 pt-2">
                              {payment.allocations.map((allocation) => (
                                <div key={`${payment.id}-${allocation.saleId}`} className="flex items-center justify-between gap-3 text-[11px] text-white/52">
                                  <span className="truncate">{allocation.saleNumber}</span>
                                  <span className="shrink-0">{formatMoney(allocation.amount)}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )) : (
                        <div className="col-span-full flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center text-white/42">
                          <WalletCards size={30} />
                          <p className="mt-2 text-sm">Még nincs külön tartozásbefizetés.</p>
                        </div>
                      )}
                    </div>
                  </section>

                  {detail.item.notes ? (
                    <div className="rounded-[20px] border border-white/12 bg-[#293548] p-4">
                      <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Kliens megjegyzése</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/70">{detail.item.notes}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end border-t border-white/12 bg-[#293548] px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.09]"
          >
            <X size={17} /> Bezárás
          </button>
        </div>
      </div>

      {yearPickerOpen ? (
        <div
          className="fixed inset-0 z-[292] grid place-items-center bg-slate-950/82 px-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.currentTarget === event.target) setYearPickerOpen(false); }}
        >
          <section className="w-full max-w-[460px] overflow-hidden rounded-[28px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_34px_110px_rgba(0,0,0,0.62)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#1e4f54] to-[#2a8d8b] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/12"><CalendarDays size={21} /></span>
                <div><p className="text-[10px] uppercase tracking-[0.14em] text-white/60">Éves összesítés</p><h3 className="mt-1 text-xl">Válassz évet</h3></div>
              </div>
              <button type="button" onClick={() => setYearPickerOpen(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-black/10 hover:bg-white/12"><X size={19} /></button>
            </header>
            <div className="grid grid-cols-2 gap-3 p-5">
              {yearOptions.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => {
                    setDetailYear(year);
                    setYearPickerOpen(false);
                    if (selected) void loadCustomerDetail(selected.id, year);
                  }}
                  className={`min-h-16 touch-manipulation rounded-2xl border text-2xl tabular-nums transition active:scale-[0.98] ${year === detailYear ? "border-[#9be9e5]/60 bg-[#2a8d8b] text-white shadow-[0_10px_24px_rgba(42,141,139,0.24)]" : "border-white/14 bg-[#374357] text-white hover:border-[#72d8d4]/45 hover:bg-[#3f4c60]"}`}
                >
                  {year}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {customerDeleteOpen && selected && detail ? (
        <div className="fixed inset-0 z-[285] grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <section className="w-full max-w-[560px] overflow-hidden rounded-[26px] border border-rose-300/36 bg-[#303a4c] text-white shadow-[0_32px_100px_rgba(0,0,0,0.58)]">
            <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#4a2632] to-[#303a4c] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200/35 bg-rose-500/18 text-rose-50"><Trash2 size={20} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-rose-100/60">Kliens törlése</p>
                  <h3 className="mt-1 truncate text-xl text-white">{selected.fullName}</h3>
                </div>
              </div>
              <button type="button" disabled={customerDeleting} onClick={() => setCustomerDeleteOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white hover:bg-white/[0.1] disabled:opacity-50"><X size={18} /></button>
            </header>
            <div className="space-y-3 px-5 py-5">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-white/10 bg-[#273243] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Vásárlások</p><p className="mt-2 text-lg text-white">{detail.summary.saleCount}</p></div>
                <div className="rounded-2xl border border-white/10 bg-[#273243] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Befizetések</p><p className="mt-2 text-lg text-white">{detail.payments.length}</p></div>
                <div className={`rounded-2xl border p-3 ${customerHasOpenBalance ? "border-rose-300/25 bg-rose-500/12" : "border-emerald-300/20 bg-emerald-500/8"}`}><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Nyitott tartozás</p><p className="mt-2 text-lg text-white">{formatMoney(detail.summary.openBalance)}</p></div>
              </div>

              {customerHasOpenBalance ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200/28 bg-amber-400/10 px-4 py-3 text-amber-50">
                  <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm">A kliens addig nem törölhető, amíg nyitott tartozása van.</p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-100/70">Előbb rendezd a tartozást vagy válaszd le a hibásan hozzárendelt vásárlást.</p>
                  </div>
                </div>
              ) : customerHasHistory ? (
                <div className="rounded-2xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/10 px-4 py-3">
                  <p className="text-sm text-white/78">A kliensnek van korábbi előzménye, ezért biztonságosan archiválódik.</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#d7fffd]/68">Eltűnik az aktív klienslistából, de a vásárlások, befizetések, bizonylatok és készletmozgások megmaradnak.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3">
                  <p className="text-sm text-white/78">A kliensnek nincs vásárlási vagy befizetési előzménye.</p>
                  <p className="mt-1 text-xs leading-relaxed text-rose-100/70">A rekord végleg törlődik az adatbázisból.</p>
                </div>
              )}
            </div>
            <footer className="flex justify-end gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
              <button type="button" disabled={customerDeleting} onClick={() => setCustomerDeleteOpen(false)} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.1] disabled:opacity-50">Mégse</button>
              <button type="button" disabled={customerDeleting || customerHasOpenBalance} onClick={() => void deleteCustomer()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-300/55 bg-rose-600 px-5 text-sm text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-45">
                {customerDeleting ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />}
                {customerDeleting ? "Törlés…" : customerHasHistory ? "Kliens archiválása" : "Végleges törlés"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {saleDetachTarget ? (
        <div className="fixed inset-0 z-[280] grid place-items-center bg-slate-950/78 px-4 backdrop-blur-sm">
          <section className="w-full max-w-[520px] overflow-hidden rounded-[26px] border border-rose-300/36 bg-[#303a4c] text-white shadow-[0_32px_100px_rgba(0,0,0,0.56)]">
            <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#4a2632] to-[#303a4c] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200/35 bg-rose-500/18 text-rose-50"><Trash2 size={20} /></span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-rose-100/60">Vásárlás törlése a klienstől</p>
                  <h3 className="mt-1 truncate text-xl text-white">{saleDetachTarget.saleNumber}</h3>
                </div>
              </div>
              <button type="button" disabled={saleDetaching} onClick={() => setSaleDetachTarget(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white hover:bg-white/[0.1] disabled:opacity-50"><X size={18} /></button>
            </header>
            <div className="space-y-3 px-5 py-5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/10 bg-[#273243] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Vásárlás összege</p><p className="mt-2 text-lg text-white">{formatMoney(saleDetachTarget.total)}</p></div>
                <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-rose-100/60">Tartozás ebből</p><p className="mt-2 text-lg text-rose-50">{formatMoney(saleDetachTarget.balanceDue)}</p></div>
              </div>
              <p className="text-sm leading-relaxed text-white/72">A vásárlás lekerül erről a kliensről, ezért a tartozása és vásárlási összesítése is azonnal csökken.</p>
              <p className="rounded-xl border border-[#7bd7d4]/18 bg-[#2a8d8b]/10 px-3 py-2.5 text-xs leading-relaxed text-[#d7fffd]/76">Az eladási bizonylat és a készletmozgás megmarad. Kizárólag a klienskapcsolat kerül eltávolításra.</p>
            </div>
            <footer className="flex justify-end gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
              <button type="button" disabled={saleDetaching} onClick={() => setSaleDetachTarget(null)} className="inline-flex h-11 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.1] disabled:opacity-50">Mégse</button>
              <button type="button" disabled={saleDetaching} onClick={() => void detachCustomerSale()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-300/55 bg-rose-600 px-5 text-sm text-white hover:bg-rose-500 disabled:opacity-55">
                {saleDetaching ? <Loader2 className="animate-spin" size={17} /> : <Trash2 size={17} />}
                {saleDetaching ? "Törlés…" : "Törlés a klienstől"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
