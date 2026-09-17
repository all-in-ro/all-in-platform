import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BadgePercent,
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
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
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
  apiAifReturnShopCustomerCreditLine,
  apiAifSetShopCustomerSaleLineDiscount,
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
  locationCode?: string;
  locationName: string;
  role?: "admin" | "shop";
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

type CustomerSalePaymentView = {
  method?: string | null;
  amount?: number | null;
  paidAt?: string | null;
};

type CustomerSaleHistoryWithPayments = AifShopCustomerSaleHistoryItem & {
  payments?: CustomerSalePaymentView[];
};

type CustomerReturnTarget = {
  sale: AifShopCustomerSaleHistoryItem;
  line: AifShopCustomerSaleHistoryItem["lines"][number];
  maxQty: number;
};

type CustomerDiscountTarget = {
  sale: AifShopCustomerSaleHistoryItem;
  line: AifShopCustomerSaleHistoryItem["lines"][number];
};

type ProductImagePreview = {
  url: string;
  title: string;
  left: number;
  top: number;
  size: number;
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

function roundMoney(value: unknown) {
  return Math.round((numberValue(value) + Number.EPSILON) * 100) / 100;
}

function discountedUnitPrice(listPrice: unknown, discountPercent: unknown) {
  const price = numberValue(listPrice);
  const discount = Math.max(0, Math.min(100, numberValue(discountPercent)));
  if (discount <= 0) return roundMoney(price);
  return Math.ceil((price * (1 - discount / 100)) * 100 - 1e-9) / 100;
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

function paymentMethodPresentation(method: string) {
  const key = String(method || "").trim().toLowerCase();
  if (key === "cash") return { label: "Készpénz", icon: Banknote, tone: "text-[#8ee6e2]" };
  if (key === "card") return { label: "Kártya", icon: CreditCard, tone: "text-[#a9c8ff]" };
  if (key === "bank_transfer") return { label: "Átutalás", icon: Landmark, tone: "text-[#cbbcff]" };
  if (key === "credit") return { label: "Utólag", icon: WalletCards, tone: "text-amber-100" };
  return { label: paymentMethodLabel(key || "other"), icon: WalletCards, tone: "text-white/48" };
}

export default function AllInMagazinClients({
  open,
  initialMode = "search",
  locationCode: locationCodeProp,
  locationName,
  role = "shop",
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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [returnTarget, setReturnTarget] = useState<CustomerReturnTarget | null>(null);
  const [discountTarget, setDiscountTarget] = useState<CustomerDiscountTarget | null>(null);
  const [discountPercentDraft, setDiscountPercentDraft] = useState("");
  const [discountNote, setDiscountNote] = useState("");
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountError, setDiscountError] = useState("");
  const [returnQty, setReturnQty] = useState(1);
  const [returnNote, setReturnNote] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnError, setReturnError] = useState("");
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
  const [productImagePreview, setProductImagePreview] = useState<ProductImagePreview | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const paymentRequestKeyRef = useRef("");
  const returnRequestKeyRef = useRef("");

  const locationCode = useMemo(
    () => locationCodeProp || locationCodeFromName(locationName),
    [locationCodeProp, locationName],
  );
  const defaultCountyCode = useMemo(() => preferredCountyCode(locationName), [locationName]);
  const yearOptions = useMemo(
    () => Array.from({ length: Math.max(1, currentYear - 2025 + 1) }, (_, index) => currentYear - index),
    [currentYear],
  );
  const customerHasHistory = Boolean(
    detail && (numberValue(detail.summary.saleCount) > 0 || detail.payments.length > 0),
  );
  const customerHasOpenBalance = numberValue(detail?.summary.openBalance) > 0.005;
  const canManageCustomerData = role === "admin";

  const discountPreview = useMemo(() => {
    if (!discountTarget) return null;
    const currentPercent = numberValue(discountTarget.line.discountPercent);
    const proposedPercent = Math.max(0, Math.min(100, parseMoneyInput(discountPercentDraft)));
    const quantity = Math.max(1, numberValue(discountTarget.line.quantity));
    const listPrice = numberValue(discountTarget.line.listPrice);
    const currentLineTotal = numberValue(discountTarget.line.lineTotal);
    const unitPrice = discountedUnitPrice(listPrice, proposedPercent);
    const lineTotal = roundMoney(unitPrice * quantity);
    const discountAmount = roundMoney(Math.max(0, listPrice * quantity - lineTotal));
    const saleTotal = roundMoney(numberValue(discountTarget.sale.total) - currentLineTotal + lineTotal);
    const paidTotal = roundMoney(discountTarget.sale.paidTotal);
    const balanceDue = roundMoney(Math.max(0, saleTotal - paidTotal));
    return {
      currentPercent,
      proposedPercent,
      listPrice,
      unitPrice,
      lineTotal,
      discountAmount,
      saleTotal,
      paidTotal,
      balanceDue,
      wouldRefund: saleTotal + 0.005 < paidTotal,
      changed: Math.abs(proposedPercent - currentPercent) > 0.0001,
    };
  }, [discountPercentDraft, discountTarget]);

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
    setProductImagePreview(null);
    setPaymentDraft(EMPTY_PAYMENT);
    setPaymentOpen(false);
    setPaymentError("");
    setDiscountTarget(null);
    setDiscountPercentDraft("");
    setDiscountNote("");
    setDiscountSaving(false);
    setDiscountError("");
    setReturnTarget(null);
    setReturnQty(1);
    setReturnNote("");
    setReturnSaving(false);
    setReturnError("");
    setSaleDetachTarget(null);
    setSaleDetaching(false);
    setCustomerDeleteOpen(false);
    setCustomerDeleting(false);
    paymentRequestKeyRef.current = "";
    returnRequestKeyRef.current = "";
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
      if (productImagePreview) {
        setProductImagePreview(null);
        return;
      }
      if (discountTarget) {
        if (!discountSaving) {
          setDiscountTarget(null);
          setDiscountPercentDraft("");
          setDiscountNote("");
          setDiscountError("");
        }
        return;
      }
      if (returnTarget) {
        if (!returnSaving) {
          setReturnTarget(null);
          setReturnError("");
          returnRequestKeyRef.current = "";
        }
        return;
      }
      if (paymentOpen) {
        if (!paymentSaving) {
          setPaymentOpen(false);
          setPaymentError("");
          paymentRequestKeyRef.current = "";
        }
        return;
      }
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
  }, [customerDeleteOpen, customerDeleting, discountSaving, discountTarget, mode, onClose, open, paymentOpen, paymentSaving, productImagePreview, returnSaving, returnTarget, saleDetachTarget, saleDetaching, yearPickerOpen]);

  async function loadCustomers(value = query) {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifListShopCustomers({
        location: locationCode,
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
      const response = await apiAifGetShopCustomer(customerId, {
        location: locationCode,
        year,
        salesLimit: 200,
        paymentsLimit: 200,
      });
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
    setProductImagePreview(null);
    setPaymentDraft(EMPTY_PAYMENT);
    setPaymentOpen(false);
    setPaymentError("");
    setDiscountTarget(null);
    setDiscountPercentDraft("");
    setDiscountNote("");
    setDiscountSaving(false);
    setDiscountError("");
    setReturnTarget(null);
    setReturnQty(1);
    setReturnNote("");
    setReturnError("");
    setSaleDetachTarget(null);
    setCustomerDeleteOpen(false);
    setYearPickerOpen(false);
    paymentRequestKeyRef.current = "";
    returnRequestKeyRef.current = "";
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
    setPaymentOpen(false);
    setPaymentError("");
    setDiscountTarget(null);
    setDiscountPercentDraft("");
    setDiscountNote("");
    setDiscountSaving(false);
    setDiscountError("");
    setReturnTarget(null);
    setReturnQty(1);
    setReturnNote("");
    setReturnError("");
    setSaleDetachTarget(null);
    setCustomerDeleteOpen(false);
    paymentRequestKeyRef.current = "";
    returnRequestKeyRef.current = "";
    setError("");
    setSuccess("");
    void loadCustomerDetail(customer.id, currentYear);
  }

  function openEdit() {
    if (!canManageCustomerData) {
      setError("A kliens adatainak módosítása csak adminisztrátori jogosultsággal engedélyezett.");
      return;
    }
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
    if (mode === "edit" && !canManageCustomerData) {
      setError("A kliens adatainak módosítása csak adminisztrátori jogosultsággal engedélyezett.");
      return;
    }
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
        location: locationCode,
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
      const duplicateProtected = Boolean((response as { protected?: boolean }).protected);
      setSuccess(
        mode === "edit"
          ? "A kliens adatai frissítve."
          : ("duplicate" in response && response.duplicate
            ? (duplicateProtected
              ? "Ez a telefonszám már egy meglévő klienshez tartozik. A meglévő kliens adatai nem módosultak."
              : "A meglévő kliens adatai frissítve.")
            : "A kliens rögzítve."),
      );
      await loadCustomerDetail(saved.id, detailYear || currentYear);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kliens mentése nem sikerült.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer() {
    if (!canManageCustomerData) {
      setError("Kliens törlése vagy archiválása csak adminisztrátori jogosultsággal engedélyezett.");
      return;
    }
    if (!selected) return;
    setCustomerDeleting(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiAifDeleteShopCustomer(selected.id, { location: locationCode });
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

  function openPaymentModal() {
    if (!detail || numberValue(detail.summary.openBalance) <= 0.005) return;
    setPaymentDraft(EMPTY_PAYMENT);
    setPaymentError("");
    paymentRequestKeyRef.current = "";
    setPaymentOpen(true);
  }

  function closePaymentModal() {
    if (paymentSaving) return;
    setPaymentOpen(false);
    setPaymentError("");
    setPaymentDraft(EMPTY_PAYMENT);
    paymentRequestKeyRef.current = "";
  }

  async function recordPayment() {
    if (!selected || !detail) return;
    const amount = parseMoneyInput(paymentDraft.amount);
    const openBalance = numberValue(detail.summary.openBalance);
    if (amount <= 0) {
      setPaymentError("A befizetés összege legyen nagyobb nullánál.");
      return;
    }
    if (amount > openBalance + 0.005) {
      setPaymentError(`A befizetés nem lehet nagyobb a nyitott tartozásnál: ${formatMoney(openBalance)}.`);
      return;
    }

    setPaymentSaving(true);
    setPaymentError("");
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
      setPaymentOpen(false);
      await Promise.all([
        loadCustomerDetail(selected.id, detailYear),
        loadCustomers(query),
      ]);
    } catch (caught) {
      setPaymentError(caught instanceof Error ? caught.message : "A befizetés rögzítése nem sikerült.");
    } finally {
      setPaymentSaving(false);
    }
  }

  function openDiscountModal(
    sale: AifShopCustomerSaleHistoryItem,
    line: AifShopCustomerSaleHistoryItem["lines"][number],
  ) {
    if (numberValue(sale.balanceDue) <= 0.005) return;
    const currentPercent = numberValue(line.discountPercent);
    setDiscountTarget({ sale, line });
    setDiscountPercentDraft(currentPercent > 0 ? String(currentPercent) : "");
    setDiscountNote("");
    setDiscountError("");
  }

  function closeDiscountModal() {
    if (discountSaving) return;
    setDiscountTarget(null);
    setDiscountPercentDraft("");
    setDiscountNote("");
    setDiscountError("");
  }

  async function saveLateDiscount() {
    if (!selected || !discountTarget || !discountPreview) return;
    if (!discountPreview.changed) {
      setDiscountError(
        `A kedvezmény nem változott. Jelenlegi érték: ${discountPreview.currentPercent.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%.`,
      );
      return;
    }
    if (discountPreview.wouldRefund) {
      setDiscountError("Ekkora kedvezmény már pénzvisszatérítést igényelne. Itt csak a fennálló tartozás csökkenthető.");
      return;
    }

    setDiscountSaving(true);
    setDiscountError("");
    setError("");
    setSuccess("");
    try {
      const response = await apiAifSetShopCustomerSaleLineDiscount(
        selected.id,
        discountTarget.sale.id,
        discountTarget.line.id,
        {
          location: locationCode,
          discountPercent: discountPreview.proposedPercent,
          note: discountNote.trim() || null,
        },
      );
      setSuccess(
        response.discountPercent <= 0.0001
          ? `${discountTarget.line.productTitle || "A termék"}: a kedvezmény törölve. Fennmaradó tartozás: ${formatMoney(response.openBalance)}.`
          : `${discountTarget.line.productTitle || "A termék"}: ${response.discountPercent.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}% kedvezmény mentve. Kedvezmény: ${formatMoney(response.discountAmount)}. Fennmaradó tartozás: ${formatMoney(response.openBalance)}.`,
      );
      setDiscountTarget(null);
      setDiscountPercentDraft("");
      setDiscountNote("");
      await Promise.all([
        loadCustomerDetail(selected.id, detailYear),
        loadCustomers(query),
      ]);
    } catch (caught) {
      setDiscountError(caught instanceof Error ? caught.message : "Az utólagos kedvezmény mentése nem sikerült.");
    } finally {
      setDiscountSaving(false);
    }
  }

  function openReturnModal(
    sale: AifShopCustomerSaleHistoryItem,
    line: AifShopCustomerSaleHistoryItem["lines"][number],
  ) {
    const unitPrice = numberValue(line.unitPrice);
    const due = numberValue(sale.balanceDue);
    const remainingQty = Math.max(0, Math.floor(numberValue(line.quantity)));
    const maxByDebt = unitPrice > 0 ? Math.floor((due + 0.005) / unitPrice) : 0;
    const maxQty = Math.max(0, Math.min(remainingQty, maxByDebt));
    if (!line.variantId || maxQty <= 0) {
      setError("Ezt a terméket innen nem lehet biztonságosan visszavenni. Ha pénzvisszatérítés szükséges, használd a normál visszáru/csere folyamatot.");
      return;
    }
    setReturnTarget({ sale, line, maxQty });
    setReturnQty(1);
    setReturnNote("");
    setReturnError("");
    returnRequestKeyRef.current = "";
  }

  function closeReturnModal() {
    if (returnSaving) return;
    setReturnTarget(null);
    setReturnQty(1);
    setReturnNote("");
    setReturnError("");
    returnRequestKeyRef.current = "";
  }

  async function returnCustomerCreditLine() {
    if (!selected || !detail || !returnTarget) return;
    const quantity = Math.max(1, Math.min(returnTarget.maxQty, Math.floor(numberValue(returnQty))));
    const returnCredit = numberValue(returnTarget.line.unitPrice) * quantity;
    if (quantity <= 0 || quantity > returnTarget.maxQty) {
      setReturnError(`Legfeljebb ${returnTarget.maxQty} db vehető vissza ebből a tételből.`);
      return;
    }
    if (returnCredit > numberValue(returnTarget.sale.balanceDue) + 0.005) {
      setReturnError("Ez a visszavétel már pénzvisszatérítést igényelne. Használd a normál visszáru/csere folyamatot.");
      return;
    }

    setReturnSaving(true);
    setReturnError("");
    setError("");
    setSuccess("");
    if (!returnRequestKeyRef.current) returnRequestKeyRef.current = createRequestKey();

    try {
      const response = await apiAifReturnShopCustomerCreditLine({
        location: locationCode,
        customerId: selected.id,
        saleLineId: returnTarget.line.id,
        returnedQty: quantity,
        note: returnNote.trim() || null,
        idempotencyKey: returnRequestKeyRef.current,
      });
      setSuccess(
        `${returnTarget.line.productTitle || "A termék"} visszavéve készletre. Jóváírás: ${formatMoney(response.returnCredit)}. Fennmaradó tartozás: ${formatMoney(response.openBalance)}.`,
      );
      setReturnTarget(null);
      setReturnQty(1);
      setReturnNote("");
      setReturnError("");
      returnRequestKeyRef.current = "";
      await Promise.all([
        loadCustomerDetail(selected.id, detailYear),
        loadCustomers(query),
      ]);
    } catch (caught) {
      setReturnError(caught instanceof Error ? caught.message : "A termék visszavétele nem sikerült.");
    } finally {
      setReturnSaving(false);
    }
  }

  async function detachCustomerSale() {
    if (!canManageCustomerData) {
      setError("Vásárlás leválasztása a klienstől csak adminisztrátori jogosultsággal engedélyezett.");
      return;
    }
    if (!selected || !saleDetachTarget) return;
    setSaleDetaching(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiAifDetachShopCustomerSale(
        selected.id,
        saleDetachTarget.id,
        { location: locationCode },
      );
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

  function showProductImagePreview(target: HTMLElement, url: string, title: string) {
    const rect = target.getBoundingClientRect();
    const viewportPadding = 16;
    const gap = 14;
    const size = Math.max(
      200,
      Math.min(340, window.innerWidth - viewportPadding * 2, window.innerHeight - viewportPadding * 2),
    );

    let left = rect.right + gap;
    if (left + size > window.innerWidth - viewportPadding) {
      left = rect.left - size - gap;
    }
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - size - viewportPadding));

    let top = rect.top + rect.height / 2 - size / 2;
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - size - viewportPadding));

    setProductImagePreview({ url, title, left, top, size });
  }

  function hideProductImagePreview() {
    setProductImagePreview(null);
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5" onScroll={hideProductImagePreview}>
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
                  {canManageCustomerData ? (
                    <>
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
                    </>
                  ) : (
                    <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#9be9e5]/24 bg-[#2a8d8b]/12 px-3 text-xs text-[#d7fffd]">
                      <ShieldCheck size={15} /> Védett kliensadat • módosítás és törlés csak ADMIN
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setYearPickerOpen(true)}
                    className="inline-flex h-10 min-w-[104px] touch-manipulation items-center justify-between gap-2.5 rounded-xl border border-white/16 bg-[#293548] px-3 text-sm text-white transition hover:border-[#72d8d4]/45 hover:bg-[#354153] active:bg-[#2a8d8b]"
                    title="Éves összesítés"
                  >
                    <CalendarDays size={16} className="text-[#8ee6e2]" />
                    <span className="text-[15px] tabular-nums">{detailYear}</span>
                    <ChevronDown size={16} className="text-white/55" />
                  </button>
                </div>
              </div>

              {detailLoading && !detail ? (
                <div className="flex min-h-[420px] items-center justify-center gap-3 rounded-[24px] border border-white/14 bg-[#374357] text-white/55">
                  <Loader2 className="animate-spin" /> Kliensadatlap betöltése…
                </div>
              ) : detail ? (
                <div className="space-y-3">
                  <div className="rounded-[22px] border border-white/12 bg-[#374357] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/26 bg-[#2a8d8b]/16 text-[#d7fffd]">
                          <UserRound size={22} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-[21px] text-white">{detail.item.fullName}</h3>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/55">
                            {detail.item.phone ? <span className="inline-flex items-center gap-2"><Phone size={13} className="text-[#8ee6e2]" />{detail.item.phone}</span> : null}
                            {detail.item.email ? <span className="inline-flex items-center gap-2"><Mail size={13} className="text-[#8ee6e2]" />{detail.item.email}</span> : null}
                            {customerAddressLabel(detail.item) ? <span className="inline-flex items-center gap-2"><MapPin size={13} className="text-[#8ee6e2]" />{customerAddressLabel(detail.item)}</span> : null}
                          </div>
                        </div>
                      </div>

                      {numberValue(detail.summary.openBalance) > 0.005 ? (
                        <button
                          type="button"
                          onClick={openPaymentModal}
                          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-[#9be9e5]/55 bg-[#2a8d8b] px-4 text-[12px] text-white shadow-[0_8px_20px_rgba(42,141,139,0.22)] transition hover:bg-[#319c99] active:scale-[0.99]"
                          title="Tartozás befizetése"
                        >
                          <WalletCards size={16} />
                          <span>
                            <span className="block text-left leading-none">Befizetés</span>
                            <span className="mt-1 block text-left text-[9px] leading-none text-white/68">
                              {formatMoney(detail.summary.openBalance)}
                            </span>
                          </span>
                        </button>
                      ) : (
                        <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#2a8d8b]/12 px-3 text-[11px] text-[#d7fffd]/78">
                          <CheckCircle2 size={14} />
                          Nincs tartozás
                        </span>
                      )}
                    </div>

                    <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="min-h-[104px] rounded-[17px] bg-[#293548] px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.055)]">
                        <p className="text-[9px] uppercase tracking-[0.13em] text-[#9be9e5]/58">{detail.summary.year}. évi vásárlás</p>
                        <p className="mt-2.5 whitespace-nowrap text-[30px] leading-none tracking-tight text-[#d7fffd] tabular-nums">
                          {formatMoney(detail.summary.yearPurchaseTotal)}
                        </p>
                      </div>

                      <div className="min-h-[104px] rounded-[17px] bg-[#293548] px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.055)]">
                        <p className="text-[9px] uppercase tracking-[0.13em] text-white/42">Összes vásárlás</p>
                        <p className="mt-2.5 whitespace-nowrap text-[30px] leading-none tracking-tight text-white tabular-nums">
                          {formatMoney(detail.summary.lifetimePurchaseTotal)}
                        </p>
                      </div>

                      <div className={`min-h-[104px] rounded-[17px] px-4 py-3.5 ${
                        numberValue(detail.summary.openBalance) > 0.005
                          ? "bg-[#E21C2A] text-white shadow-[0_10px_24px_rgba(226,28,42,0.21)]"
                          : "bg-[#2a8d8b]/18 text-[#d7fffd] shadow-[inset_0_0_0_1px_rgba(155,233,229,0.16)]"
                      }`}>
                        <p className="text-[9px] uppercase tracking-[0.13em] opacity-72">Nyitott tartozás</p>
                        <p className="mt-2 whitespace-nowrap text-[33px] leading-none tracking-tight tabular-nums">
                          {formatMoney(detail.summary.openBalance)}
                        </p>
                        <p className="mt-2 text-[10px] opacity-72">{detail.summary.openSales} nyitott vásárlás</p>
                      </div>

                      <div className="min-h-[104px] rounded-[17px] bg-[#293548] px-4 py-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.055)]">
                        <p className="text-[9px] uppercase tracking-[0.13em] text-white/42">Vásárlások száma</p>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <p className="text-[32px] leading-none tracking-tight text-white tabular-nums">{detail.summary.saleCount}</p>
                          <p className="pb-0.5 text-right text-[9px] leading-tight text-white/38">
                            Utolsó<br />{formatDateTime(detail.summary.lastSaleAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <section className="rounded-[24px] bg-[#344055]/82 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.16)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#2a8d8b]/16 text-[#d7fffd]"><ShoppingBag size={20} /></span>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Vásárolt termékek</p>
                          <h3 className="mt-1 text-[19px] text-white">{detail.summary.year}. évi terméklista</h3>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">{detail.sales.length} bizonylat</span>
                        <span className="rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 px-2.5 py-1 text-[10px] text-[#d7fffd]">
                          {detail.sales.reduce((sum, sale) => sum + (sale.lines?.length || 0), 0)} terméksor
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {detail.sales.length ? detail.sales.map((sale) => {
                        const rawSalePayments = Array.isArray((sale as CustomerSaleHistoryWithPayments).payments)
                          ? ((sale as CustomerSaleHistoryWithPayments).payments || [])
                          : [];
                        const paymentMap = new Map<string, CustomerSalePaymentView>();
                        for (const payment of rawSalePayments) {
                          const key = String(payment?.method || "other").trim().toLowerCase() || "other";
                          const current = paymentMap.get(key);
                          paymentMap.set(key, {
                            method: key,
                            amount: numberValue(current?.amount) + numberValue(payment?.amount),
                            paidAt: payment?.paidAt || current?.paidAt || null,
                          });
                        }
                        const salePaymentRows = Array.from(paymentMap.values());
                        if (numberValue(sale.balanceDue) > 0.005 && !salePaymentRows.some((item) => String(item.method) === "credit")) {
                          salePaymentRows.push({
                            method: "credit",
                            amount: numberValue(sale.balanceDue),
                            paidAt: null,
                          });
                        }
                        if (!salePaymentRows.length) {
                          salePaymentRows.push({
                            method: numberValue(sale.balanceDue) > 0.005 ? "credit" : "other",
                            amount: numberValue(sale.paidTotal),
                            paidAt: null,
                          });
                        }

                        return (
                        <article key={sale.id} className="overflow-hidden rounded-[20px] bg-[#293548] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.10] bg-[#303b4e] px-4 py-3.5">
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-white">
                                <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-[#8ee6e2]" />{formatDateTime(sale.soldAt)}</span>
                                {sale.actor ? <span className="text-[#d7fffd]">Eladó: {sale.actor}</span> : null}
                              </p>
                              <p className="mt-1 truncate text-[9px] uppercase tracking-[0.08em] text-white/28">
                                {sale.locationName || "–"} • Bizonylat: {sale.saleNumber}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <div className="text-right">
                                <p className="text-[9px] uppercase tracking-[0.11em] text-white/36">Vásárlás összege</p>
                                <p className="mt-1 text-[24px] leading-none tracking-tight text-white tabular-nums">{formatMoney(sale.total)}</p>
                              </div>
                              {canManageCustomerData ? (
                                <button
                                  type="button"
                                  onClick={() => setSaleDetachTarget(sale)}
                                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rose-300/55 bg-rose-600 px-3 text-[11px] text-white shadow-[0_6px_14px_rgba(225,29,72,0.22)] hover:bg-rose-500"
                                  title="Törlés a kliens vásárlási előzményeiből"
                                >
                                  <Trash2 size={14} /> Törlés
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className="p-3">
                            <div className="mb-1 hidden grid-cols-[66px_minmax(220px,1fr)_52px_108px_104px_118px_100px_104px] items-center gap-2.5 px-3 pb-2 text-[8px] uppercase tracking-[0.10em] text-white/30 lg:grid">
                              <span />
                              <span>Termék</span>
                              <span className="text-center">Db</span>
                              <span className="text-right">Ár / db</span>
                              <span className="text-right">Kedvezmény</span>
                              <span className="text-right">Fizetendő</span>
                              <span className="text-center">Fizetés</span>
                              <span className="text-right">Művelet</span>
                            </div>
                            <div className="overflow-hidden rounded-2xl bg-[#263245] divide-y divide-white/[0.12]">
                            {sale.lines?.length ? sale.lines.map((line) => {
                              const unitPrice = numberValue(line.unitPrice);
                              const saleBalance = numberValue(sale.balanceDue);
                              const remainingQty = Math.max(0, Math.floor(numberValue(line.quantity)));
                              const maxByDebt = unitPrice > 0 ? Math.floor((saleBalance + 0.005) / unitPrice) : 0;
                              const maxReturnQty = Math.max(0, Math.min(remainingQty, maxByDebt));
                              const canQuickReturn = Boolean(
                                line.variantId
                                && saleBalance > 0.005
                                && maxReturnQty > 0
                              );
                              const originalUnitPrice = numberValue(line.listPrice);
                              const finalUnitPrice = numberValue(line.unitPrice);
                              const quantity = Math.max(0, numberValue(line.quantity));
                              const calculatedDiscount = Math.max(0, (originalUnitPrice - finalUnitPrice) * quantity);
                              const discountAmount = Math.max(numberValue(line.discountAmount), calculatedDiscount);
                              const discountPercent = numberValue(line.discountPercent);
                              const hasDiscount = discountAmount > 0.005 || discountPercent > 0.005 || originalUnitPrice > finalUnitPrice + 0.005;

                              return (
                                <div
                                  key={line.id || `${sale.id}-${line.lineNo}`}
                                  className="grid min-h-[92px] grid-cols-[66px_minmax(0,1fr)] items-center gap-3 px-3 py-2.5 transition hover:bg-white/[0.025] lg:grid-cols-[66px_minmax(220px,1fr)_52px_108px_104px_118px_100px_104px] lg:gap-2.5"
                                >
                                  <span
                                    className={`flex h-[66px] w-[66px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95 transition ${line.imageUrl ? "cursor-zoom-in hover:ring-4 hover:ring-[#2a8d8b]/18" : ""}`}
                                    onMouseEnter={(event) => {
                                      if (line.imageUrl) showProductImagePreview(event.currentTarget, line.imageUrl, line.productTitle || "Termék");
                                    }}
                                    onMouseLeave={hideProductImagePreview}
                                  >
                                    {line.imageUrl ? (
                                      <img src={line.imageUrl} alt={line.productTitle || "Termék"} className="h-full w-full object-contain" />
                                    ) : (
                                      <ShoppingBag size={24} className="text-[#526173]" />
                                    )}
                                  </span>

                                  <div className="min-w-0">
                                    <p className="truncate text-[14px] leading-5 text-white">{line.productTitle || "Névtelen termék"}</p>
                                    <p className="mt-0.5 truncate text-[11px] text-white/56">
                                      {[line.brandName, line.subcategoryName || line.categoryName, line.colorName, line.size].filter(Boolean).join(" • ") || "–"}
                                    </p>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-white/30">
                                      {line.productCode ? <span>{line.productCode}</span> : null}
                                      {line.barcode ? <span>• {line.barcode}</span> : null}
                                      {numberValue(line.returnedQty) > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[#9be9e5]">
                                          <RotateCcw size={10} /> Visszahozva: {numberValue(line.returnedQty)} db
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="col-span-2 flex items-center justify-between border-t border-white/[0.08] pt-2.5 lg:col-span-1 lg:block lg:border-0 lg:pt-0 lg:text-center">
                                    <span className="text-[13px] tabular-nums text-white">{line.quantity} db</span>
                                  </div>

                                  <div className="hidden min-h-[38px] flex-col items-end justify-center lg:flex">
                                    {hasDiscount ? (
                                      <>
                                        <span className="text-[10px] tabular-nums text-white/30 line-through">
                                          {formatMoney(originalUnitPrice)}
                                        </span>
                                        <span className="mt-0.5 text-[13px] tabular-nums text-white/86">
                                          {formatMoney(finalUnitPrice)}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-[13px] tabular-nums text-white/78">
                                        {formatMoney(finalUnitPrice)}
                                      </span>
                                    )}
                                  </div>

                                  <div className="hidden min-h-[38px] items-center justify-end lg:flex">
                                    {saleBalance > 0.005 ? (
                                      <button
                                        type="button"
                                        onClick={() => openDiscountModal(sale, line)}
                                        className={`inline-flex min-h-8 items-center justify-end gap-1.5 rounded-lg px-2 py-1 text-right transition ${
                                          hasDiscount
                                            ? "bg-amber-300/[0.07] text-amber-100 hover:bg-amber-300/[0.12]"
                                            : "bg-[#2a8d8b]/10 text-[#bff8f5] hover:bg-[#2a8d8b]/20"
                                        }`}
                                        title={hasDiscount ? "További kedvezmény adása" : "Utólagos kedvezmény adása"}
                                      >
                                        <BadgePercent size={13} className="shrink-0 opacity-80" />
                                        {hasDiscount ? (
                                          <span className="leading-tight">
                                            <span className="block text-[11px] tabular-nums">−{discountPercent.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%</span>
                                            <span className="block text-[9px] tabular-nums opacity-68">−{formatMoney(discountAmount)}</span>
                                          </span>
                                        ) : (
                                          <span className="text-[10px]">Kedvezmény</span>
                                        )}
                                      </button>
                                    ) : hasDiscount ? (
                                      <span className="text-right leading-tight text-amber-100">
                                        <span className="block text-[11px] tabular-nums">−{discountPercent.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%</span>
                                        <span className="block text-[9px] tabular-nums opacity-68">−{formatMoney(discountAmount)}</span>
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-white/18">—</span>
                                    )}
                                  </div>

                                  <div className="hidden text-right lg:block">
                                    <p className="text-[18px] leading-none tracking-tight text-white tabular-nums">
                                      {formatMoney(line.lineTotal)}
                                    </p>
                                  </div>

                                  <div className="hidden min-w-0 flex-col items-center justify-center gap-1 lg:flex">
                                    {salePaymentRows.slice(0, 2).map((payment, paymentIndex) => {
                                      const visual = paymentMethodPresentation(String(payment.method || ""));
                                      const PaymentIcon = visual.icon;
                                      return (
                                        <span
                                          key={`${sale.id}-${String(payment.method || "other")}-${paymentIndex}`}
                                          className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap text-[10px] text-white/66"
                                          title={`${visual.label}: ${formatMoney(payment.amount)}`}
                                        >
                                          <PaymentIcon size={13} className={visual.tone} />
                                          <span className="truncate">{visual.label}</span>
                                        </span>
                                      );
                                    })}
                                    {salePaymentRows.length > 2 ? (
                                      <span className="text-[9px] text-white/30">+{salePaymentRows.length - 2}</span>
                                    ) : null}
                                  </div>

                                  <div className="hidden justify-end lg:flex">
                                    {canQuickReturn ? (
                                      <button
                                        type="button"
                                        onClick={() => openReturnModal(sale, line)}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#8ee6e2]/26 bg-[#2a8d8b]/10 px-2.5 text-[10px] text-[#d7fffd] transition hover:border-[#b9f5f2]/55 hover:bg-[#2a8d8b]/24 hover:text-white"
                                        title="Próbára elvitt termék visszavétele készletre"
                                      >
                                        <RotateCcw size={13} /> Visszahozta
                                      </button>
                                    ) : numberValue(line.returnedQty) > 0 ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-[#9be9e5]">
                                        <CheckCircle2 size={12} /> Visszavéve
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-white/18">–</span>
                                    )}
                                  </div>

                                  <div className="col-span-2 grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-2.5 lg:hidden">
                                    <div>
                                      <p className="text-[9px] uppercase tracking-[0.08em] text-white/30">Ár</p>
                                      {hasDiscount ? (
                                        <>
                                          <p className="mt-1 text-[10px] text-white/28 line-through">{formatMoney(originalUnitPrice)}</p>
                                          <p className="text-[14px] text-white">{formatMoney(finalUnitPrice)}</p>
                                          <button
                                            type="button"
                                            onClick={() => openDiscountModal(sale, line)}
                                            disabled={saleBalance <= 0.005}
                                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-100/80 disabled:pointer-events-none"
                                          >
                                            <BadgePercent size={11} />
                                            −{discountPercent.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}% • −{formatMoney(discountAmount)}
                                          </button>
                                        </>
                                      ) : saleBalance > 0.005 ? (
                                        <>
                                          <p className="mt-1 text-[14px] text-white">{formatMoney(finalUnitPrice)}</p>
                                          <button
                                            type="button"
                                            onClick={() => openDiscountModal(sale, line)}
                                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#bff8f5]"
                                          >
                                            <BadgePercent size={11} /> Kedvezmény adása
                                          </button>
                                        </>
                                      ) : (
                                        <p className="mt-1 text-[14px] text-white">{formatMoney(finalUnitPrice)}</p>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[9px] uppercase tracking-[0.08em] text-white/30">Fizetendő</p>
                                      <p className="mt-1 text-[17px] text-white">{formatMoney(line.lineTotal)}</p>
                                      <div className="mt-1 flex flex-wrap justify-end gap-2">
                                        {salePaymentRows.slice(0, 2).map((payment, paymentIndex) => {
                                          const visual = paymentMethodPresentation(String(payment.method || ""));
                                          const PaymentIcon = visual.icon;
                                          return (
                                            <span key={`m-${sale.id}-${paymentIndex}`} className="inline-flex items-center gap-1 text-[10px] text-white/58">
                                              <PaymentIcon size={12} className={visual.tone} />
                                              {visual.label}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                    {canQuickReturn ? (
                                      <div className="col-span-2 flex justify-end">
                                        <button
                                          type="button"
                                          onClick={() => openReturnModal(sale, line)}
                                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#8ee6e2]/26 bg-[#2a8d8b]/10 px-2.5 text-[10px] text-[#d7fffd]"
                                        >
                                          <RotateCcw size={13} /> Visszahozta
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            }) : (
                              <div className="px-4 py-8 text-center text-sm text-white/42">
                                Ehhez a régi bizonylathoz nincs mentett terméksor.
                              </div>
                            )}
                            </div>
                          </div>

                          <div className="grid border-t border-white/[0.10] bg-[#242f41] sm:grid-cols-[0.62fr_0.86fr_1fr_1.12fr]">
                            <div className="px-4 py-3">
                              <p className="text-[8px] uppercase tracking-[0.11em] text-white/30">Termékek</p>
                              <p className="mt-1 text-[17px] tabular-nums text-white">{sale.itemCount} db</p>
                            </div>
                            <div className="border-t border-white/[0.08] px-4 py-3 sm:border-l sm:border-t-0">
                              <p className="text-[8px] uppercase tracking-[0.11em] text-amber-100/48">Kedvezmény</p>
                              <p className={`mt-1 text-[18px] tabular-nums ${numberValue(sale.discountTotal) > 0.005 ? "text-amber-100" : "text-white/28"}`}>
                                {numberValue(sale.discountTotal) > 0.005 ? `−${formatMoney(sale.discountTotal)}` : formatMoney(0)}
                              </p>
                            </div>
                            <div className="border-t border-white/[0.08] px-4 py-3 sm:border-l sm:border-t-0">
                              <p className="text-[8px] uppercase tracking-[0.11em] text-[#9be9e5]/56">Fizetve</p>
                              <p className="mt-1 text-[19px] tabular-nums text-[#d7fffd]">{formatMoney(sale.paidTotal)}</p>
                            </div>
                            <div className={`border-t px-4 py-3 sm:border-l sm:border-t-0 ${
                              numberValue(sale.balanceDue) > 0
                                ? "border-red-300/22 bg-[#E21C2A] text-white"
                                : "border-white/[0.08]"
                            }`}>
                              <p className={`text-[8px] uppercase tracking-[0.11em] ${
                                numberValue(sale.balanceDue) > 0 ? "text-white/70" : "text-white/30"
                              }`}>
                                {numberValue(sale.balanceDue) > 0 ? "Fennmaradó tartozás" : "Tartozás"}
                              </p>
                              <p className={`mt-1 text-[22px] leading-none tabular-nums ${
                                numberValue(sale.balanceDue) > 0 ? "text-white" : "text-[#d7fffd]"
                              }`}>
                                {formatMoney(sale.balanceDue)}
                              </p>
                            </div>
                          </div>
                        </article>
                        );
                      }) : (
                        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center text-white/42">
                          <ShoppingBag size={34} />
                          <p className="mt-2 text-sm">Ebben az évben nincs a klienshez kapcsolt vásárlás.</p>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-[24px] bg-[#374357] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]">
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

                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
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

      </div>


      {discountTarget && discountPreview && detail && selected ? (
        <div
          className="fixed inset-0 z-[332] grid place-items-center bg-slate-950/82 px-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !discountSaving) closeDiscountModal();
          }}
        >
          <section className="w-full max-w-[760px] overflow-hidden rounded-[28px] border border-[#9be9e5]/34 bg-[#303a4c] text-white shadow-[0_40px_130px_rgba(0,0,0,0.68)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#26384b] via-[#295e64] to-[#2a8d8b] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/22 bg-white/10"><BadgePercent size={21} /></span>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.15em] text-white/58">Nyitott tartozás • utólagos kedvezmény</p>
                  <h3 className="mt-1 truncate text-xl">{discountTarget.line.productTitle || "Termék"}</h3>
                </div>
              </div>
              <button type="button" disabled={discountSaving} onClick={closeDiscountModal} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-black/10 text-white hover:bg-white/10 disabled:opacity-50"><X size={18} /></button>
            </header>

            <div className="p-5">
              {discountError ? <div className="mb-4 rounded-xl bg-[#E21C2A] px-3 py-2.5 text-[12px] text-white">{discountError}</div> : null}

              <div className="grid gap-4 sm:grid-cols-[250px_minmax(0,1fr)]">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Kedvezmény</p>
                  <div className="mt-2 grid grid-cols-[1fr_auto] overflow-hidden rounded-2xl bg-[#232e3f] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)] focus-within:shadow-[inset_0_0_0_1px_rgba(114,216,212,0.75)]">
                    <input
                      autoFocus
                      inputMode="decimal"
                      value={discountPercentDraft}
                      onChange={(event) => {
                        setDiscountError("");
                        setDiscountPercentDraft(event.target.value.replace(/[^0-9.,]/g, ""));
                      }}
                      className="h-20 min-w-0 bg-transparent px-4 text-right text-[34px] tracking-tight text-white outline-none"
                      placeholder="0"
                    />
                    <span className="inline-flex h-20 items-center border-l border-white/10 px-4 text-xl text-white/48">%</span>
                  </div>
                  <div className="mt-2 grid grid-cols-6 gap-1.5">
                    {[0, 5, 10, 15, 20, 30].map((percent) => (
                      <button
                        key={percent}
                        type="button"
                        onClick={() => { setDiscountError(""); setDiscountPercentDraft(String(percent)); }}
                        className={`h-9 rounded-lg text-[11px] transition ${
                          Math.abs(discountPreview.proposedPercent - percent) < 0.001
                            ? percent === 0
                              ? "bg-white/14 text-white ring-1 ring-white/24"
                              : "bg-[#2a8d8b] text-white"
                            : percent === 0
                              ? "bg-white/[0.06] text-white/72 hover:bg-white/[0.10]"
                              : "bg-[#273243] text-white/58 hover:bg-[#344055]"
                        }`}
                        title={percent === 0 ? "Kedvezmény törlése" : `${percent}% kedvezmény`}
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                  {discountPreview.currentPercent > 0 ? (
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-[10px] text-amber-100/65">
                        Jelenlegi: {discountPreview.currentPercent.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%. Szabadon módosítható.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountError("");
                          setDiscountPercentDraft("0");
                        }}
                        className="shrink-0 text-[10px] text-white/55 underline decoration-white/20 underline-offset-4 transition hover:text-white"
                      >
                        Kedvezmény törlése
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-[#293548] p-3"><p className="text-[9px] uppercase tracking-[0.10em] text-white/34">Eredeti ár / db</p><p className="mt-2 text-[20px] tabular-nums text-white">{formatMoney(discountPreview.listPrice)}</p></div>
                  <div className="rounded-2xl bg-[#293548] p-3"><p className="text-[9px] uppercase tracking-[0.10em] text-[#9be9e5]/54">Új ár / db</p><p className="mt-2 text-[20px] tabular-nums text-[#d7fffd]">{formatMoney(discountPreview.unitPrice)}</p></div>
                  <div className="rounded-2xl bg-[#293548] p-3"><p className="text-[9px] uppercase tracking-[0.10em] text-amber-100/52">Kedvezmény összesen</p><p className={`mt-2 text-[20px] tabular-nums ${discountPreview.discountAmount > 0.005 ? "text-amber-100" : "text-white/42"}`}>{discountPreview.discountAmount > 0.005 ? `−${formatMoney(discountPreview.discountAmount)}` : formatMoney(0)}</p></div>
                  <div className={`rounded-2xl p-3 ${discountPreview.balanceDue > 0.005 ? "bg-[#E21C2A] text-white" : "bg-[#2a8d8b]/18 text-[#d7fffd]"}`}><p className="text-[9px] uppercase tracking-[0.10em] opacity-70">Tartozás utána</p><p className="mt-2 text-[20px] tabular-nums">{formatMoney(discountPreview.balanceDue)}</p></div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-[#242f41] px-4 py-3">
                <div><p className="text-[9px] uppercase tracking-[0.10em] text-white/32">Új sorösszeg</p><p className="mt-1 text-[22px] tabular-nums text-white">{formatMoney(discountPreview.lineTotal)}</p></div>
                <div className="text-right"><p className="text-[9px] uppercase tracking-[0.10em] text-white/32">Vásárlás új végösszege</p><p className="mt-1 text-[22px] tabular-nums text-[#d7fffd]">{formatMoney(discountPreview.saleTotal)}</p></div>
              </div>

              <label className="mt-4 grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/42">Megjegyzés<input value={discountNote} onChange={(event) => setDiscountNote(event.target.value)} placeholder="Opcionális" className="h-11 rounded-xl bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/28 focus:ring-1 focus:ring-[#72d8d4]" /></label>

              <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.08] pt-4">
                <button type="button" disabled={discountSaving} onClick={closeDiscountModal} className="h-11 rounded-xl bg-white/[0.06] px-4 text-sm text-white/74 hover:bg-white/[0.10] disabled:opacity-50">Mégse</button>
                <button type="button" disabled={discountSaving || !discountPreview.changed || discountPreview.wouldRefund} onClick={() => void saveLateDiscount()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-45">{discountSaving ? <Loader2 size={17} className="animate-spin" /> : <BadgePercent size={17} />}Kedvezmény mentése</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {paymentOpen && detail && selected ? (
        <div
          className="fixed inset-0 z-[330] grid place-items-center bg-slate-950/78 px-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !paymentSaving) closePaymentModal();
          }}
        >
          <section className="w-full max-w-[760px] overflow-hidden rounded-[28px] border border-[#9be9e5]/36 bg-[#303a4c] text-white shadow-[0_38px_120px_rgba(0,0,0,0.66)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#234b52] via-[#276f70] to-[#2a8d8b] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10">
                  <WalletCards size={21} />
                </span>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.15em] text-white/58">Tartozás rendezése</p>
                  <h3 className="mt-1 text-xl">Befizetés • {selected.fullName}</h3>
                </div>
              </div>
              <button
                type="button"
                disabled={paymentSaving}
                onClick={closePaymentModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-black/10 text-white hover:bg-white/10 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </header>

            <div className="p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/38">Jelenlegi tartozás</p>
                  <p className="mt-1 text-[34px] tracking-tight text-red-100 tabular-nums">{formatMoney(detail.summary.openBalance)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    paymentRequestKeyRef.current = "";
                    setPaymentDraft((current) => ({ ...current, amount: String(numberValue(detail.summary.openBalance).toFixed(2)) }));
                  }}
                  className="h-9 rounded-xl border border-[#9be9e5]/28 bg-[#2a8d8b]/14 px-3 text-[11px] text-[#d7fffd] hover:bg-[#2a8d8b]/24"
                >
                  Teljes tartozás
                </button>
              </div>

              {paymentError ? (
                <div className="mt-4 rounded-xl bg-[#E21C2A] px-3 py-2.5 text-[12px] text-white">{paymentError}</div>
              ) : null}

              <label className="mt-4 block">
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/45">Befizetni kívánt összeg</span>
                <div className="mt-2 grid grid-cols-[1fr_auto] overflow-hidden rounded-2xl bg-[#232e3f] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)] focus-within:shadow-[inset_0_0_0_1px_rgba(114,216,212,0.75)]">
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={paymentDraft.amount}
                    onChange={(event) => {
                      paymentRequestKeyRef.current = "";
                      setPaymentError("");
                      setPaymentDraft((current) => ({ ...current, amount: event.target.value.replace(/[^0-9.,]/g, "") }));
                    }}
                    className="h-20 min-w-0 bg-transparent px-5 text-right text-[34px] tracking-tight text-white outline-none"
                    placeholder="0,00"
                  />
                  <span className="inline-flex h-20 items-center border-l border-white/10 px-5 text-lg text-white/48">RON</span>
                </div>
              </label>

              <div className="mt-4">
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Fizetési mód</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
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
                        className={`flex h-12 items-center justify-center gap-2 rounded-xl px-3 text-[12px] transition ${
                          active
                            ? "bg-[#2a8d8b] text-white shadow-[0_8px_18px_rgba(42,141,139,0.22)]"
                            : "bg-[#273243] text-white/62 hover:bg-[#344055]"
                        }`}
                      >
                        <Icon size={16} /> {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/45">
                  Hivatkozás
                  <input
                    value={paymentDraft.reference}
                    onChange={(event) => {
                      paymentRequestKeyRef.current = "";
                      setPaymentDraft((current) => ({ ...current, reference: event.target.value }));
                    }}
                    placeholder="Nyugtaszám, átutalási azonosító…"
                    className="h-11 rounded-xl bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/28 focus:ring-1 focus:ring-[#72d8d4]"
                  />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/45">
                  Megjegyzés
                  <input
                    value={paymentDraft.note}
                    onChange={(event) => {
                      paymentRequestKeyRef.current = "";
                      setPaymentDraft((current) => ({ ...current, note: event.target.value }));
                    }}
                    placeholder="Opcionális"
                    className="h-11 rounded-xl bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/28 focus:ring-1 focus:ring-[#72d8d4]"
                  />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.08] pt-4">
                <button
                  type="button"
                  disabled={paymentSaving}
                  onClick={closePaymentModal}
                  className="h-11 rounded-xl bg-white/[0.06] px-4 text-sm text-white/74 hover:bg-white/[0.10] disabled:opacity-50"
                >
                  Mégse
                </button>
                <button
                  type="button"
                  disabled={paymentSaving}
                  onClick={() => void recordPayment()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99] disabled:opacity-55"
                >
                  {paymentSaving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                  Befizetés rögzítése
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {returnTarget && detail && selected ? (
        <div
          className="fixed inset-0 z-[335] grid place-items-center bg-slate-950/80 px-4 backdrop-blur-md"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !returnSaving) closeReturnModal();
          }}
        >
          <section className="w-full max-w-[720px] overflow-hidden rounded-[28px] border border-[#9be9e5]/34 bg-[#303a4c] text-white shadow-[0_38px_120px_rgba(0,0,0,0.68)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#234b52] via-[#276f70] to-[#2a8d8b] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10">
                  <RotateCcw size={21} />
                </span>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.15em] text-white/58">Próbára elvitt termék</p>
                  <h3 className="mt-1 text-xl">Visszahozta</h3>
                </div>
              </div>
              <button
                type="button"
                disabled={returnSaving}
                onClick={closeReturnModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-black/10 text-white hover:bg-white/10 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </header>

            <div className="p-5">
              <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-4">
                <span className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden rounded-2xl bg-white/95">
                  {returnTarget.line.imageUrl ? (
                    <img src={returnTarget.line.imageUrl} alt={returnTarget.line.productTitle || "Termék"} className="h-full w-full object-contain" />
                  ) : (
                    <ShoppingBag size={32} className="text-[#526173]" />
                  )}
                </span>
                <div className="min-w-0 self-center">
                  <p className="truncate text-lg text-white">{returnTarget.line.productTitle || "Névtelen termék"}</p>
                  <p className="mt-1 truncate text-[12px] text-white/52">
                    {[returnTarget.line.brandName, returnTarget.line.subcategoryName || returnTarget.line.categoryName, returnTarget.line.colorName, returnTarget.line.size].filter(Boolean).join(" • ") || "–"}
                  </p>
                  <p className="mt-2 text-[11px] text-white/34">
                    {formatDateTime(returnTarget.sale.soldAt)} • {returnTarget.sale.actor || "–"}
                  </p>
                </div>
              </div>

              {returnError ? (
                <div className="mt-4 rounded-xl bg-[#E21C2A] px-3 py-2.5 text-[12px] text-white">{returnError}</div>
              ) : null}

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-[#293548] p-3">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Darab</p>
                  {returnTarget.maxQty > 1 ? (
                    <input
                      type="number"
                      min={1}
                      max={returnTarget.maxQty}
                      value={returnQty}
                      onChange={(event) => {
                        returnRequestKeyRef.current = "";
                        setReturnError("");
                        setReturnQty(Math.max(1, Math.min(returnTarget.maxQty, Number(event.target.value) || 1)));
                      }}
                      className="mt-2 h-11 w-full rounded-xl bg-[#202a3a] px-3 text-center text-xl text-white outline-none focus:ring-1 focus:ring-[#72d8d4]"
                    />
                  ) : (
                    <p className="mt-2 text-[28px] text-white">1 db</p>
                  )}
                </div>
                <div className="rounded-2xl bg-[#293548] p-3">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Jóváírás</p>
                  <p className="mt-2 text-[24px] text-[#d7fffd] tabular-nums">
                    {formatMoney(numberValue(returnTarget.line.unitPrice) * returnQty)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#293548] p-3">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Tartozás utána</p>
                  <p className="mt-2 text-[24px] text-white tabular-nums">
                    {formatMoney(Math.max(0, numberValue(returnTarget.sale.balanceDue) - numberValue(returnTarget.line.unitPrice) * returnQty))}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-[#2a8d8b]/12 px-4 py-3 text-[12px] leading-relaxed text-[#d7fffd]/78">
                <p className="flex items-center gap-2 text-[#d7fffd]">
                  <RotateCcw size={15} />
                  A termék visszakerül a <span className="text-white">{locationName}</span> készletébe.
                </p>
                <p className="mt-1.5">A kliens tartozása ugyanebben a műveletben automatikusan csökken. Készlet és pénzügyi audit is készül.</p>
              </div>

              <label className="mt-4 grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/45">
                Megjegyzés
                <input
                  value={returnNote}
                  onChange={(event) => {
                    returnRequestKeyRef.current = "";
                    setReturnNote(event.target.value);
                  }}
                  placeholder="Opcionális"
                  className="h-11 rounded-xl bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none placeholder:text-white/28 focus:ring-1 focus:ring-[#72d8d4]"
                />
              </label>

              <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.08] pt-4">
                <button
                  type="button"
                  disabled={returnSaving}
                  onClick={closeReturnModal}
                  className="h-11 rounded-xl bg-white/[0.06] px-4 text-sm text-white/74 hover:bg-white/[0.10] disabled:opacity-50"
                >
                  Mégse
                </button>
                <button
                  type="button"
                  disabled={returnSaving}
                  onClick={() => void returnCustomerCreditLine()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99] disabled:opacity-55"
                >
                  {returnSaving ? <Loader2 size={17} className="animate-spin" /> : <RotateCcw size={17} />}
                  Visszavétel és készletre tétel
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {productImagePreview ? (
        <div
          className="pointer-events-none fixed z-[410] overflow-hidden rounded-[22px] border-2 border-[#72d8d4] bg-white shadow-[0_24px_70px_rgba(0,0,0,0.62)]"
          style={{
            left: productImagePreview.left,
            top: productImagePreview.top,
            width: productImagePreview.size,
            height: productImagePreview.size,
          }}
          aria-hidden="true"
        >
          <img
            src={productImagePreview.url}
            alt={productImagePreview.title}
            className="h-full w-full object-contain"
          />
        </div>
      ) : null}

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

      {canManageCustomerData && customerDeleteOpen && selected && detail ? (
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

      {canManageCustomerData && saleDetachTarget ? (
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
