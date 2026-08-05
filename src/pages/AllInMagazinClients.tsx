import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  History,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Save,
  Search,
  ShoppingBag,
  UserPlus,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifCreateShopCustomer,
  apiAifGetShopCustomer,
  apiAifListShopCustomers,
  apiAifRecordShopCustomerPayment,
  type AifShopCustomer,
  type AifShopCustomerDetail,
  type AifShopCustomerPaymentMethod,
} from "../lib/aif/api";

type ClientMode = "search" | "new" | "detail";

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
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_DRAFT);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(EMPTY_PAYMENT);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const paymentRequestKeyRef = useRef("");

  const locationCode = useMemo(() => locationCodeFromName(locationName), [locationName]);
  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, index) => currentYear - index),
    [currentYear],
  );

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setSelected(null);
    setDetail(null);
    setDetailYear(currentYear);
    setError("");
    setSuccess("");
    setPaymentDraft(EMPTY_PAYMENT);
    paymentRequestKeyRef.current = "";
    if (initialMode === "new") {
      setDraft(EMPTY_DRAFT);
    } else {
      setQuery("");
      void loadCustomers("");
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [currentYear, initialMode, open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
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
  }, [mode, onClose, open]);

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
    setError("");
    setSuccess("");
    setPaymentDraft(EMPTY_PAYMENT);
    paymentRequestKeyRef.current = "";
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function openNew(prefillName = "") {
    setMode("new");
    setSelected(null);
    setDetail(null);
    setDraft({ ...EMPTY_DRAFT, fullName: prefillName });
    setError("");
    setSuccess("");
  }

  function openDetail(customer: AifShopCustomer) {
    setSelected(customer);
    setMode("detail");
    setDetail(null);
    setDetailYear(currentYear);
    setPaymentDraft(EMPTY_PAYMENT);
    paymentRequestKeyRef.current = "";
    setError("");
    setSuccess("");
    void loadCustomerDetail(customer.id, currentYear);
  }

  async function saveCustomer() {
    const fullName = draft.fullName.trim();
    const phone = draft.phone.trim();
    if (!fullName || !phone) {
      setError("A név és a telefonszám kötelező.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiAifCreateShopCustomer({
        fullName,
        phone,
        email: draft.email.trim() || null,
        address: draft.address.trim() || null,
        note: draft.note.trim() || null,
      });
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
      setSuccess(response.duplicate ? "A meglévő kliens adatai frissítve." : "A kliens rögzítve.");
      await loadCustomerDetail(saved.id, currentYear);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kliens mentése nem sikerült.");
    } finally {
      setSaving(false);
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
                mode === "search" || mode === "detail"
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
                            {item.address ? <p className="flex items-center gap-2 truncate"><MapPin size={13} className="text-[#8ee6e2]" />{item.address}</p> : null}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                            <span className="rounded-xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 px-2.5 py-2 text-[#d7fffd]">
                              Idén: {formatMoney(item.yearPurchaseTotal)}
                            </span>
                            <span className={`rounded-xl border px-2.5 py-2 ${
                              numberValue(item.openBalance) > 0
                                ? "border-rose-300/30 bg-rose-500/14 text-rose-50"
                                : "border-[#7bd7d4]/25 bg-[#2a8d8b]/14 text-[#d7fffd]"
                            }`}>
                              Tartozás: {formatMoney(item.openBalance)}
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
          ) : mode === "new" ? (
            <div className="mx-auto max-w-[780px] rounded-[22px] border border-white/13 bg-[#374357] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#7bd7d4]/28 bg-[#2a8d8b]/16 text-[#d7fffd]">
                  <UserPlus size={20} />
                </span>
                <h3 className="text-lg text-white">Új kliens</h3>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Név *
                  <input
                    autoFocus
                    value={draft.fullName}
                    onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
                    className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"
                  />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Telefonszám *
                  <input
                    value={draft.phone}
                    onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                    className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"
                  />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  E-mail
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                    className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"
                  />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">
                  Cím
                  <input
                    value={draft.address}
                    onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))}
                    className="h-12 rounded-xl border border-white/16 bg-[#273243] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#72d8d4]"
                  />
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
                  onClick={openSearch}
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
                  Mentés
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

                <label className="flex items-center gap-2 rounded-xl border border-white/14 bg-[#293548] px-3 py-2 text-xs text-white/65">
                  <CalendarDays size={15} className="text-[#8ee6e2]" />
                  Éves összesítés
                  <select
                    value={detailYear}
                    onChange={(event) => {
                      const year = Number(event.target.value);
                      setDetailYear(year);
                      if (selected) void loadCustomerDetail(selected.id, year);
                    }}
                    className="h-8 rounded-lg border border-white/14 bg-[#1f2937] px-2 text-xs text-white outline-none"
                  >
                    {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
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
                          {detail.item.address ? <span className="inline-flex items-center gap-2"><MapPin size={13} className="text-[#8ee6e2]" />{detail.item.address}</span> : null}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 p-3">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-[#d7fffd]/55">{detail.summary.year}. évi vásárlás</p>
                        <p className="mt-2 text-2xl text-[#d7fffd]">{formatMoney(detail.summary.yearPurchaseTotal)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Összes vásárlás</p>
                        <p className="mt-2 text-2xl text-white">{formatMoney(detail.summary.lifetimePurchaseTotal)}</p>
                      </div>
                      <div className={`rounded-2xl border p-3 ${
                        numberValue(detail.summary.openBalance) > 0
                          ? "border-rose-300/30 bg-rose-500/14"
                          : "border-emerald-300/22 bg-emerald-500/10"
                      }`}>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-white/52">Nyitott tartozás</p>
                        <p className="mt-2 text-2xl text-white">{formatMoney(detail.summary.openBalance)}</p>
                        <p className="mt-1 text-[10px] text-white/48">{detail.summary.openSales} nyitott vásárlás</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Vásárlások száma</p>
                        <p className="mt-2 text-2xl text-white">{detail.summary.saleCount}</p>
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

                  <div className="grid gap-3 xl:grid-cols-2">
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

                      <div className="mt-3 max-h-[440px] space-y-2 overflow-y-auto pr-1">
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
                          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center text-white/42">
                            <WalletCards size={30} />
                            <p className="mt-2 text-sm">Még nincs külön tartozásbefizetés.</p>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#d7fffd]"><Receipt size={19} /></span>
                          <div>
                            <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Vásárlások</p>
                            <h3 className="mt-1 text-base text-white">Eladási előzmények</h3>
                          </div>
                        </div>
                        <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">{detail.sales.length} bizonylat</span>
                      </div>

                      <div className="mt-3 max-h-[440px] space-y-2 overflow-y-auto pr-1">
                        {detail.sales.length ? detail.sales.map((sale) => (
                          <div key={sale.id} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm text-white">{sale.saleNumber}</p>
                                <p className="mt-1 text-[11px] text-white/45">{formatDateTime(sale.soldAt)} • {sale.locationName || "–"}</p>
                              </div>
                              <p className="shrink-0 text-lg text-white">{formatMoney(sale.total)}</p>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                              <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1.5 text-white/55">{sale.itemCount} db</span>
                              <span className="rounded-lg border border-emerald-300/16 bg-emerald-500/8 px-2 py-1.5 text-emerald-50">Fizetve: {formatMoney(sale.paidTotal)}</span>
                              <span className={`rounded-lg border px-2 py-1.5 ${numberValue(sale.balanceDue) > 0 ? "border-rose-300/22 bg-rose-500/12 text-rose-50" : "border-white/10 bg-black/10 text-white/55"}`}>Maradt: {formatMoney(sale.balanceDue)}</span>
                            </div>
                          </div>
                        )) : (
                          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center text-white/42">
                            <ShoppingBag size={30} />
                            <p className="mt-2 text-sm">Ehhez a klienshez még nincs eladás kapcsolva.</p>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>

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
    </div>,
    document.body,
  );
}
