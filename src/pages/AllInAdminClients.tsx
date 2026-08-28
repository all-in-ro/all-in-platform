import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Edit3,
  Filter,
  Home,
  Loader2,
  Mail,
  MapPin,
  Medal,
  Phone,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Trash2,
  TrendingUp,
  Trophy,
  UserCheck,
  UserRound,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifAdminCustomersOverview,
  type AifAdminCustomerActivityFilter,
  type AifAdminCustomerEmployeeSummary,
  type AifAdminCustomerOverviewItem,
  type AifAdminCustomerSellerBreakdown,
  type AifAdminCustomerSort,
  type AifAdminCustomerStoreSummary,
  type AifAdminCustomersOverviewResponse,
} from "../lib/aif/api";

type Props = {
  actor?: string;
  role?: "admin" | "shop";
};

type LocationScope = "all" | "main_warehouse" | "magazin_targu_secuiesc";

const card = "rounded-[24px] border border-white/16 bg-[#344154] shadow-[0_16px_38px_rgba(15,23,42,0.20)]";
const control = "h-11 min-w-0 rounded-xl border border-white/16 bg-[#293548] px-3 text-sm font-normal text-white outline-none transition focus:border-[#7bd7d4]/65 focus:ring-2 focus:ring-[#7bd7d4]/15 [color-scheme:dark]";
const button = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-normal text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const neutralButton = `${button} border-white/16 bg-[#3b485b] hover:border-white/30 hover:bg-[#45546a]`;
const primaryButton = `${button} border-[#9be9e5]/45 bg-[#2a8d8b] hover:bg-[#319c99]`;

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return `${numberValue(value).toLocaleString("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} RON`;
}

function integer(value: unknown) {
  return Math.round(numberValue(value)).toLocaleString("ro-RO");
}

function percent(value: unknown) {
  return `${numberValue(value).toLocaleString("ro-RO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

type AdminShopCustomerRecord = {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  countryCode?: string | null;
  countyCode?: string | null;
  countyName?: string | null;
  localityCode?: string | null;
  localityName?: string | null;
  postalCode?: string | null;
  formattedAddress?: string | null;
  notes?: string | null;
  creditLimit?: number | null;
  openBalance?: number | null;
  openSales?: number | null;
  saleCount?: number | null;
  locationId?: string | null;
  locationCode?: string | null;
  locationName?: string | null;
};

type RomaniaCountyOption = { code: string; name: string };
type RomaniaLocalityOption = { sirutaCode: string; name: string; postalCode?: string | null };

type CustomerEditorForm = {
  fullName: string;
  phone: string;
  email: string;
  countyCode: string;
  localityCode: string;
  city: string;
  address: string;
  postalCode: string;
  notes: string;
  creditLimit: string;
};

function customerEditorFromRecord(record?: AdminShopCustomerRecord | null): CustomerEditorForm {
  return {
    fullName: String(record?.fullName || ""),
    phone: String(record?.phone || ""),
    email: String(record?.email || ""),
    countyCode: String(record?.countyCode || ""),
    localityCode: String(record?.localityCode || ""),
    city: String(record?.city || record?.localityName || ""),
    address: String(record?.address || ""),
    postalCode: String(record?.postalCode || ""),
    notes: String(record?.notes || ""),
    creditLimit: String(numberValue(record?.creditLimit || 0)),
  };
}

async function adminClientJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = body?.code || undefined;
    throw error;
  }
  return body as T;
}

async function apiAdminCustomerRecord(customerId: string, location: string, year: number) {
  const query = new URLSearchParams({ location, year: String(year), salesLimit: "1", paymentsLimit: "1" });
  return adminClientJson<{ ok: true; item: AdminShopCustomerRecord }>(`/api/aif/shop-customers/${encodeURIComponent(customerId)}?${query.toString()}`);
}

async function apiAdminUpdateCustomerRecord(customerId: string, location: string, payload: Record<string, unknown>) {
  return adminClientJson<{ ok: true; item: AdminShopCustomerRecord }>(`/api/aif/shop-customers/${encodeURIComponent(customerId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, location }),
  });
}

async function apiAdminDeleteCustomerRecord(customerId: string, location: string) {
  const query = new URLSearchParams({ location });
  return adminClientJson<{ ok: true; mode: "deleted" | "archived"; usage?: { sales?: number; payments?: number; openBalance?: number } }>(
    `/api/aif/shop-customers/${encodeURIComponent(customerId)}?${query.toString()}`,
    { method: "DELETE" },
  );
}

async function apiAdminRomaniaCounties() {
  return adminClientJson<{ ok: true; items: RomaniaCountyOption[] }>("/api/aif/romania/counties");
}

async function apiAdminRomaniaLocalities(countyCode: string) {
  const query = new URLSearchParams({ county: countyCode, limit: "1000" });
  return adminClientJson<{ ok: true; items: RomaniaLocalityOption[] }>(`/api/aif/romania/localities?${query.toString()}`);
}

function formatDate(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("hu-HU", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}


function activityText(item: AifAdminCustomerOverviewItem, year: number) {
  if (item.periodTransactions > 0) {
    return `${formatDate(item.periodLastSaleAt)} • ${integer(item.periodTransactions)} vásárlás`;
  }
  if (item.lastSaleAt) return `${year}-ban nem vásárolt • utoljára ${formatDate(item.lastSaleAt)}`;
  return "Még nincs vásárlása";
}

function storeTone(code?: string | null) {
  return code === "main_warehouse"
    ? "border-[#78ded9]/35 bg-[#2a8d8b]/18 text-[#d7fffd]"
    : "border-sky-200/28 bg-sky-400/12 text-sky-50";
}

function StoreBadge({ code, name }: { code?: string | null; name?: string | null }) {
  const label = code === "main_warehouse"
    ? "Csíkszereda"
    : code === "magazin_targu_secuiesc"
      ? "Kézdivásárhely"
      : (name || "Üzlet");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${storeTone(code)}`}>
      <Store size={11} />
      {label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "normal",
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone?: "normal" | "green" | "blue" | "red" | "gold";
}) {
  const toneClass = tone === "green"
    ? "border-emerald-200/28 bg-gradient-to-br from-[#1f7666] via-[#28665f] to-[#344154]"
    : tone === "blue"
      ? "border-sky-200/25 bg-gradient-to-br from-[#315c76] to-[#344154]"
      : tone === "red"
        ? "border-rose-200/28 bg-gradient-to-br from-[#66404c] to-[#344154]"
        : tone === "gold"
          ? "border-amber-200/26 bg-gradient-to-br from-[#65593d] to-[#344154]"
          : "border-white/16 bg-gradient-to-br from-[#3d4b5f] to-[#344154]";
  return (
    <article className={`min-w-0 rounded-[21px] border p-3.5 shadow-[0_12px_28px_rgba(15,23,42,0.16)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/55">{label}</p>
          <p className="mt-2 truncate text-[clamp(1.05rem,1.6vw,1.55rem)] leading-none text-white" title={value}>{value}</p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-white/[0.07] text-[#d7fffd]">
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-2.5 truncate text-[10px] text-white/50" title={hint}>{hint}</p>
    </article>
  );
}

function StorePerformanceCard({ store }: { store: AifAdminCustomerStoreSummary }) {
  return (
    <article className={`${card} min-w-0 p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Üzleti teljesítmény</p>
          <h3 className="mt-1 truncate text-lg text-white">{store.code === "main_warehouse" ? "Csíkszereda" : "Kézdivásárhely"}</h3>
          <p className="mt-1 truncate text-xs text-white/42">{store.name}</p>
        </div>
        <StoreBadge code={store.code} name={store.name} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-white/40">Forgalom</p>
          <p className="mt-2 truncate text-lg text-white" title={money(store.revenue)}>{money(store.revenue)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-white/40">Vásárló kliens</p>
          <p className="mt-2 text-lg text-[#d7fffd]">{integer(store.activeCustomers)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-white/40">Vásárlások</p>
          <p className="mt-2 text-lg text-white">{integer(store.transactions)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
          <p className="text-[9px] uppercase tracking-[0.1em] text-white/40">Átlag / kliens</p>
          <p className="mt-2 truncate text-lg text-white" title={money(store.averageCustomerValue)}>{money(store.averageCustomerValue)}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px] text-white/48">
          <span>Részesedés a kiválasztott forgalomból</span>
          <span>{percent(store.share)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#263144]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#68ddd8]" style={{ width: `${Math.max(0, Math.min(100, store.share))}%` }} />
        </div>
      </div>
    </article>
  );
}

function EmployeePerformance({
  items,
  selected,
  onSelect,
}: {
  items: AifAdminCustomerEmployeeSummary[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const maxRevenue = Math.max(1, ...items.map((item) => item.revenue));
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Eladói kapcsolat</p>
          <h2 className="mt-1 text-base text-white">Ki mennyit adott el a klienseknek?</h2>
        </div>
        {selected ? (
          <button type="button" onClick={() => onSelect("")} className="h-9 rounded-xl border border-[#9be9e5]/30 bg-[#2a8d8b]/16 px-3 text-xs text-[#d7fffd] hover:bg-[#2a8d8b]/26">
            Szűrés törlése
          </button>
        ) : (
          <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[10px] text-white/50">Kattints egy eladóra a szűréshez</span>
        )}
      </div>

      <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 9).map((item, index) => {
          const active = item.actor === selected;
          return (
            <button
              key={item.actor}
              type="button"
              onClick={() => onSelect(active ? "" : item.actor)}
              className={`rounded-2xl border p-3 text-left transition active:scale-[0.99] ${active
                ? "border-[#9be9e5]/60 bg-[#2a8d8b]/22 shadow-[0_0_0_1px_rgba(155,233,229,0.12)]"
                : "border-white/10 bg-[#2b3749] hover:border-[#7bd7d4]/32 hover:bg-[#334156]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-black/10 text-[#9be9e5]">
                    {index < 3 ? <Medal size={15} /> : <UserRound size={15} />}
                  </span>
                  <span className="truncate text-sm text-white">{item.actor}</span>
                </span>
                <span className="shrink-0 text-sm text-white">{money(item.revenue)}</span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#202b3c]">
                <div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#69ddd8]" style={{ width: `${Math.max(3, item.revenue / maxRevenue * 100)}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-white/45">
                <span>{integer(item.customers)} kliens • {integer(item.transactions)} vásárlás</span>
                <span>{money(item.averageBasket)} / kosár</span>
              </div>
            </button>
          );
        })}
        {!items.length ? (
          <div className="col-span-full rounded-2xl border border-dashed border-white/12 bg-black/5 px-4 py-9 text-center text-sm text-white/42">
            Ebben a szűrésben nincs eladói teljesítményadat.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SellerChips({ sellers }: { sellers: AifAdminCustomerSellerBreakdown[] }) {
  if (!sellers.length) return <span className="text-[10px] text-white/35">Nincs idei eladás</span>;
  return (
    <div className="flex max-w-[310px] flex-wrap gap-1.5">
      {sellers.slice(0, 2).map((seller) => (
        <span key={seller.actor} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-white/10 bg-black/10 px-2 py-1 text-[10px] text-white/66" title={`${seller.actor}: ${money(seller.revenue)}`}>
          <UserRound size={10} className="shrink-0 text-[#8ee6e2]" />
          <span className="truncate">{seller.actor}</span>
          <span className="shrink-0 text-white/88">{money(seller.revenue)}</span>
        </span>
      ))}
      {sellers.length > 2 ? (
        <span className="inline-flex items-center rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/45">+{sellers.length - 2}</span>
      ) : null}
    </div>
  );
}

function CustomerDetailModal({
  item,
  year,
  canManage,
  onClose,
  onChanged,
}: {
  item: AifAdminCustomerOverviewItem;
  year: number;
  canManage: boolean;
  onClose: () => void;
  onChanged: (message: string, deleted?: boolean) => Promise<void> | void;
}) {
  const editableStores = useMemo(
    () => item.stores.filter((store) => String(store.customerId || "").trim() && String(store.locationCode || store.locationId || "").trim()),
    [item.stores],
  );
  const firstStoreKey = editableStores[0]
    ? `${editableStores[0].locationId || editableStores[0].locationCode}:${editableStores[0].customerId}`
    : "";
  const [activeStoreKey, setActiveStoreKey] = useState(firstStoreKey);
  const [liveCustomer, setLiveCustomer] = useState<AdminShopCustomerRecord | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editor, setEditor] = useState<CustomerEditorForm>(() => customerEditorFromRecord(null));
  const [counties, setCounties] = useState<RomaniaCountyOption[]>([]);
  const [localities, setLocalities] = useState<RomaniaLocalityOption[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  const activeStore = useMemo(() => {
    return editableStores.find((store) => `${store.locationId || store.locationCode}:${store.customerId}` === activeStoreKey)
      || editableStores[0]
      || null;
  }, [activeStoreKey, editableStores]);
  const activeCustomerId = String(activeStore?.customerId || "").trim();
  const activeLocation = String(activeStore?.locationCode || activeStore?.locationId || "").trim();
  const activeStoreName = activeStore?.locationCode === "main_warehouse"
    ? "Csíkszereda"
    : activeStore?.locationCode === "magazin_targu_secuiesc"
      ? "Kézdivásárhely"
      : String(activeStore?.locationName || "Üzlet");

  const loadLiveCustomer = useCallback(async () => {
    if (!activeCustomerId || !activeLocation) {
      setLiveCustomer(null);
      return null;
    }
    setRecordBusy(true);
    setActionError("");
    try {
      const response = await apiAdminCustomerRecord(activeCustomerId, activeLocation, year);
      setLiveCustomer(response.item);
      if (!editMode) setEditor(customerEditorFromRecord(response.item));
      return response.item;
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "A kliens aktuális adatai nem tölthetők be.");
      return null;
    } finally {
      setRecordBusy(false);
    }
  }, [activeCustomerId, activeLocation, editMode, year]);

  useEffect(() => {
    setActiveStoreKey(firstStoreKey);
    setEditMode(false);
    setDeleteConfirmOpen(false);
    setActionError("");
  }, [firstStoreKey, item.key]);

  useEffect(() => {
    setEditMode(false);
    setDeleteConfirmOpen(false);
    void loadLiveCustomer();
  }, [activeStoreKey]);

  useEffect(() => {
    if (!editMode || counties.length) return;
    let cancelled = false;
    void apiAdminRomaniaCounties()
      .then((response) => { if (!cancelled) setCounties(response.items || []); })
      .catch((caught) => { if (!cancelled) setActionError(caught instanceof Error ? caught.message : "A megyék nem tölthetők be."); });
    return () => { cancelled = true; };
  }, [counties.length, editMode]);

  useEffect(() => {
    if (!editMode || !editor.countyCode) {
      setLocalities([]);
      return;
    }
    let cancelled = false;
    setGeoBusy(true);
    void apiAdminRomaniaLocalities(editor.countyCode)
      .then((response) => {
        if (cancelled) return;
        setLocalities(response.items || []);
      })
      .catch((caught) => { if (!cancelled) setActionError(caught instanceof Error ? caught.message : "A helységek nem tölthetők be."); })
      .finally(() => { if (!cancelled) setGeoBusy(false); });
    return () => { cancelled = true; };
  }, [editMode, editor.countyCode]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (deleteConfirmOpen) {
        setDeleteConfirmOpen(false);
        return;
      }
      if (editMode && !saveBusy) {
        setEditMode(false);
        setEditor(customerEditorFromRecord(liveCustomer));
        setActionError("");
        return;
      }
      if (!saveBusy && !deleteBusy) onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [deleteBusy, deleteConfirmOpen, editMode, liveCustomer, onClose, saveBusy]);

  const maxSeller = Math.max(1, ...item.employees.map((seller) => seller.revenue));
  const yearMetrics: Array<{
    label: string;
    value: string;
    icon: ComponentType<{ size?: number; className?: string }>;
  }> = [
    { label: "Forgalom", value: money(item.periodRevenue), icon: CircleDollarSign },
    { label: "Vásárlás", value: integer(item.periodTransactions), icon: ReceiptText },
    { label: "Darab", value: `${integer(item.periodItemsSold)} db`, icon: ShoppingBag },
    { label: "Átlagkosár", value: money(item.periodAverageBasket), icon: BarChart3 },
    { label: "Kedvezmény", value: money(item.periodDiscountTotal), icon: TrendingUp },
  ];

  const displayName = liveCustomer?.fullName || item.fullName;
  const displayPhone = liveCustomer?.phone ?? item.phone;
  const displayEmail = liveCustomer?.email ?? item.email;
  const displayAddress = liveCustomer?.formattedAddress || liveCustomer?.address || item.address;
  const displayNotes = liveCustomer?.notes ?? item.note;
  const selectedOpenBalance = liveCustomer ? numberValue(liveCustomer.openBalance) : numberValue(item.currentOpenBalance);
  const selectedOpenSales = liveCustomer ? numberValue(liveCustomer.openSales) : numberValue(item.currentOpenSales);
  const deleteBlocked = selectedOpenBalance > 0.005;

  function startEditing() {
    if (!canManage || recordBusy || !activeCustomerId) return;
    if (!liveCustomer) {
      void loadLiveCustomer().then((record) => {
        if (!record) return;
        setEditor(customerEditorFromRecord(record));
        setEditMode(true);
      });
      return;
    }
    setEditor(customerEditorFromRecord(liveCustomer));
    setActionError("");
    setEditMode(true);
  }

  async function saveCustomer() {
    if (!activeCustomerId || !activeLocation) return;
    if (!editor.fullName.trim()) {
      setActionError("A kliens neve kötelező.");
      return;
    }
    if (editor.countyCode && !editor.localityCode) {
      setActionError("A kiválasztott megyéhez helységet is válassz.");
      return;
    }
    const creditLimit = Number(String(editor.creditLimit || "0").replace(",", "."));
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      setActionError("A hitelkeret 0 vagy pozitív szám lehet.");
      return;
    }

    setSaveBusy(true);
    setActionError("");
    try {
      const payload: Record<string, unknown> = {
        fullName: editor.fullName.trim(),
        phone: editor.phone.trim(),
        email: editor.email.trim() || null,
        address: editor.address.trim() || null,
        city: editor.city.trim() || null,
        postalCode: editor.postalCode.trim() || null,
        notes: editor.notes.trim() || null,
        creditLimit,
      };
      if (editor.countyCode || editor.localityCode) {
        payload.countryCode = "RO";
        payload.countyCode = editor.countyCode;
        payload.localityCode = editor.localityCode;
      }
      const response = await apiAdminUpdateCustomerRecord(activeCustomerId, activeLocation, payload);
      setLiveCustomer(response.item);
      setEditor(customerEditorFromRecord(response.item));
      setEditMode(false);
      await onChanged(`Kliens módosítva: ${response.item.fullName} • ${activeStoreName}.`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "A kliens mentése nem sikerült.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function deleteCustomer() {
    if (!activeCustomerId || !activeLocation || deleteBlocked) return;
    setDeleteBusy(true);
    setActionError("");
    try {
      const response = await apiAdminDeleteCustomerRecord(activeCustomerId, activeLocation);
      const message = response.mode === "archived"
        ? `A kliens archiválva lett ${activeStoreName} üzletben. A vásárlási előzmények megmaradtak.`
        : `A kliens végleg törölve lett ${activeStoreName} üzletből.`;
      setDeleteConfirmOpen(false);
      await onChanged(message, true);
    } catch (caught) {
      setDeleteConfirmOpen(false);
      setActionError(caught instanceof Error ? caught.message : "A kliens törlése nem sikerült.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[420] grid place-items-center bg-slate-950/82 px-3 py-5 backdrop-blur-sm"
      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.currentTarget === event.target && !editMode && !saveBusy && !deleteBusy) onClose();
      }}
    >
      <section className="flex max-h-[92vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-[28px] border border-[#9be9e5]/30 bg-[#303a4c] text-white shadow-[0_34px_110px_rgba(0,0,0,0.62)]">
        <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] via-[#28545b] to-[#2a6f70] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/22 bg-white/[0.08] text-[#d7fffd]">
              <UserRound size={23} />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/48">Kliens adatlap és kezelés</p>
              <h2 className="mt-1 truncate text-xl text-white sm:text-2xl">{displayName}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {item.stores.map((store) => <StoreBadge key={`${store.locationId}-${store.customerId}`} code={store.locationCode} name={store.locationName} />)}
                {item.combined ? <span className="rounded-full border border-amber-200/28 bg-amber-400/10 px-2.5 py-1 text-[10px] text-amber-50">Két üzletből összevonva</span> : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canManage ? (
              <button type="button" onClick={startEditing} disabled={recordBusy || saveBusy || deleteBusy} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#9be9e5]/35 bg-[#2a8d8b]/22 px-3 text-xs text-[#d7fffd] transition hover:bg-[#2a8d8b]/34 disabled:opacity-45">
                <Edit3 size={15} /> Szerkesztés
              </button>
            ) : null}
            <button type="button" onClick={onClose} disabled={saveBusy || deleteBusy} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-black/10 text-white transition hover:bg-white/[0.1] disabled:opacity-45" aria-label="Bezárás">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {editableStores.length > 1 ? (
            <div className="mb-3 rounded-2xl border border-amber-200/20 bg-amber-400/7 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-amber-50/50">Melyik üzleti kliensrekordot kezeled?</p>
                  <p className="mt-1 text-xs text-amber-50/72">A két üzlet kliensállománya külön él. A módosítás és törlés csak a kiválasztott üzlet rekordját érinti.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {editableStores.map((store) => {
                    const key = `${store.locationId || store.locationCode}:${store.customerId}`;
                    const active = key === activeStoreKey;
                    return (
                      <button key={key} type="button" disabled={saveBusy || deleteBusy} onClick={() => setActiveStoreKey(key)} className={`h-9 rounded-xl border px-3 text-xs transition ${active ? "border-[#9be9e5]/50 bg-[#2a8d8b] text-white" : "border-white/14 bg-[#293548] text-white/62 hover:bg-[#37445a]"}`}>
                        {store.locationCode === "main_warehouse" ? "Csíkszereda" : store.locationCode === "magazin_targu_secuiesc" ? "Kézdivásárhely" : (store.locationName || "Üzlet")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {actionError ? (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-rose-200/30 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-50">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{actionError}</span>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-white/10 bg-[#293548] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Kapcsolati adatok</p>
                  <p className="mt-1 text-xs text-white/45">{activeStoreName} • {recordBusy ? "frissítés…" : "élő kliensadat"}</p>
                </div>
                {recordBusy ? <Loader2 size={17} className="animate-spin text-[#8ee6e2]" /> : null}
              </div>

              {editMode ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-[10px] text-white/58">Név
                    <input className={`${control} w-full`} value={editor.fullName} onChange={(event) => setEditor((current) => ({ ...current, fullName: event.target.value }))} />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58">Telefonszám
                    <input className={`${control} w-full`} value={editor.phone} onChange={(event) => setEditor((current) => ({ ...current, phone: event.target.value }))} placeholder="pl. 0740 000 000" />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58">E-mail
                    <input className={`${control} w-full`} type="email" value={editor.email} onChange={(event) => setEditor((current) => ({ ...current, email: event.target.value }))} placeholder="nev@email.ro" />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58">Hitelkeret
                    <input className={`${control} w-full`} inputMode="decimal" value={editor.creditLimit} onChange={(event) => setEditor((current) => ({ ...current, creditLimit: event.target.value }))} placeholder="0,00" />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58">Megye
                    <select className={`${control} w-full`} value={editor.countyCode} onChange={(event) => setEditor((current) => ({ ...current, countyCode: event.target.value, localityCode: "" }))}>
                      <option value="">Nincs megadva / régi adat marad</option>
                      {counties.map((county) => <option key={county.code} value={county.code}>{county.name}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58">Helység
                    <select className={`${control} w-full`} disabled={!editor.countyCode || geoBusy} value={editor.localityCode} onChange={(event) => {
                      const locality = localities.find((row) => row.sirutaCode === event.target.value);
                      setEditor((current) => ({
                        ...current,
                        localityCode: event.target.value,
                        city: locality?.name || current.city,
                        postalCode: current.postalCode || locality?.postalCode || "",
                      }));
                    }}>
                      <option value="">{geoBusy ? "Betöltés…" : "Válassz helységet"}</option>
                      {localities.map((locality) => <option key={locality.sirutaCode} value={locality.sirutaCode}>{locality.name}</option>)}
                    </select>
                  </label>
                  {!editor.countyCode ? (
                    <label className="grid gap-1 text-[10px] text-white/58">Város / helység (régi szöveges adat)
                      <input className={`${control} w-full`} value={editor.city} onChange={(event) => setEditor((current) => ({ ...current, city: event.target.value }))} />
                    </label>
                  ) : null}
                  <label className="grid gap-1 text-[10px] text-white/58">Irányítószám
                    <input className={`${control} w-full`} value={editor.postalCode} onChange={(event) => setEditor((current) => ({ ...current, postalCode: event.target.value }))} />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58 sm:col-span-2">Cím
                    <input className={`${control} w-full`} value={editor.address} onChange={(event) => setEditor((current) => ({ ...current, address: event.target.value }))} placeholder="Utca, házszám, tömb, lakrész…" />
                  </label>
                  <label className="grid gap-1 text-[10px] text-white/58 sm:col-span-2">Megjegyzés
                    <textarea className="min-h-[92px] rounded-xl border border-white/16 bg-[#293548] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#7bd7d4]/65 focus:ring-2 focus:ring-[#7bd7d4]/15" value={editor.notes} onChange={(event) => setEditor((current) => ({ ...current, notes: event.target.value }))} placeholder="Belső megjegyzés a klienshez" />
                  </label>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/70">
                  {displayPhone ? <span className="inline-flex items-center gap-2"><Phone size={14} className="text-[#8ee6e2]" />{displayPhone}</span> : null}
                  {displayEmail ? <span className="inline-flex items-center gap-2"><Mail size={14} className="text-[#8ee6e2]" />{displayEmail}</span> : null}
                  {displayAddress ? <span className="inline-flex min-w-0 items-center gap-2"><MapPin size={14} className="shrink-0 text-[#8ee6e2]" /><span>{displayAddress}</span></span> : null}
                  {!displayPhone && !displayEmail && !displayAddress ? <span className="text-white/38">Nincs további kapcsolati adat.</span> : null}
                  {liveCustomer ? (
                    <span className="w-full pt-1 text-[10px] text-white/38">Hitelkeret: {money(liveCustomer.creditLimit || 0)} • Kliensrekord: {activeStoreName}</span>
                  ) : null}
                  {displayNotes ? <span className="w-full rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs leading-relaxed text-white/58">{displayNotes}</span> : null}
                </div>
              )}
            </div>
            <div className={`min-w-[230px] rounded-2xl border p-4 ${selectedOpenBalance > 0.005 ? "border-rose-200/30 bg-rose-500/14" : "border-emerald-200/22 bg-emerald-500/8"}`}>
              <p className="text-[9px] uppercase tracking-[0.12em] text-white/48">Jelenlegi tartozás</p>
              <p className="mt-2 text-2xl text-white">{money(selectedOpenBalance)}</p>
              <p className="mt-1 text-xs text-white/48">{integer(selectedOpenSales)} nyitott vásárlás • {activeStoreName}</p>
            </div>
          </div>

          <section className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Kiválasztott év</p>
                <h3 className="mt-1 text-base text-white">{year}. évi teljesítmény</h3>
              </div>
              <span className="rounded-full border border-[#9be9e5]/25 bg-[#2a8d8b]/12 px-3 py-1 text-xs text-[#d7fffd]">{activityText(item, year)}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {yearMetrics.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-white/40">{label}</p>
                    <Icon size={13} className="text-[#8ee6e2]" />
                  </div>
                  <p className="mt-2 truncate text-base text-white" title={value}>{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-[22px] border border-white/11 bg-[#344154] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Üzleti bontás</p>
                <h3 className="mt-1 text-base text-white">Hol vásárolt?</h3>
              </div>
              <span className="rounded-full border border-white/12 bg-black/10 px-3 py-1 text-[10px] text-white/50">{item.storeCount} üzlet</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {item.stores.map((store) => (
                <div key={`${store.locationId}-${store.customerId}`} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <StoreBadge code={store.locationCode} name={store.locationName} />
                    <span className="text-sm text-white">{money(store.revenue)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <span className="rounded-xl border border-white/8 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/35">Vásárlás</span><strong className="mt-1 block text-sm font-normal">{integer(store.transactions)}</strong></span>
                    <span className="rounded-xl border border-white/8 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/35">Darab</span><strong className="mt-1 block text-sm font-normal">{integer(store.itemsSold)}</strong></span>
                    <span className="rounded-xl border border-white/8 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/35">Utolsó</span><strong className="mt-1 block text-[11px] font-normal">{formatDate(store.lastSaleAt)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-[22px] border border-white/11 bg-[#344154] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Eladói bontás</p>
                <h3 className="mt-1 text-base text-white">Ki szolgálta ki a klienst?</h3>
              </div>
              <span className="rounded-full border border-white/12 bg-black/10 px-3 py-1 text-[10px] text-white/50">{item.employees.length} eladó</span>
            </div>
            <div className="mt-3 space-y-2">
              {item.employees.map((seller) => (
                <div key={seller.actor} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-white"><UserRound size={14} className="text-[#8ee6e2]" />{seller.actor}</span>
                    <span className="text-sm text-white">{money(seller.revenue)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#202b3c]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#69ddd8]" style={{ width: `${Math.max(3, seller.revenue / maxSeller * 100)}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/45">
                    <span>{integer(seller.transactions)} vásárlás • {integer(seller.itemsSold)} db</span>
                    <span>{percent(seller.share)} részesedés • utolsó: {formatDate(seller.lastSaleAt)}</span>
                  </div>
                </div>
              ))}
              {!item.employees.length ? (
                <div className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/40">Ebben az évben nincs eladói adat ehhez a klienshez.</div>
              ) : null}
            </div>
          </section>

          <section className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Első vásárlás", formatDate(item.firstSaleAt)],
              ["Utolsó vásárlás", formatDate(item.lastSaleAt)],
              ["Összes vásárlás", integer(item.lifetimeTransactions)],
              ["Összes érték valaha", money(item.lifetimePurchaseTotal)],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                <p className="text-[9px] uppercase tracking-[0.1em] text-white/38">{String(label)}</p>
                <p className="mt-2 truncate text-sm text-white/80" title={String(value)}>{String(value)}</p>
              </div>
            ))}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/12 bg-[#293548] px-4 py-3.5 sm:px-5">
          <div>
            {canManage ? (
              <button type="button" disabled={recordBusy || saveBusy || deleteBusy || !activeCustomerId} onClick={() => setDeleteConfirmOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200/30 bg-rose-600/90 px-3 text-sm text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-45">
                <Trash2 size={16} /> Kliens törlése
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button type="button" disabled={saveBusy} onClick={() => { setEditMode(false); setEditor(customerEditorFromRecord(liveCustomer)); setActionError(""); }} className={neutralButton}><X size={16} /> Mégse</button>
                <button type="button" disabled={saveBusy || recordBusy} onClick={() => void saveCustomer()} className={primaryButton}>{saveBusy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Mentés</button>
              </>
            ) : (
              <button type="button" onClick={onClose} className={neutralButton}><X size={16} /> Bezárás</button>
            )}
          </div>
        </footer>
      </section>

      {deleteConfirmOpen ? (
        <div className="fixed inset-0 z-[470] grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !deleteBusy) setDeleteConfirmOpen(false); }}>
          <div className="w-full max-w-[520px] rounded-[24px] border border-rose-200/30 bg-[#303a4c] p-4 text-white shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200/25 bg-rose-500/15 text-rose-100"><Trash2 size={20} /></span>
              <div>
                <p className="text-lg">Kliens törlése</p>
                <p className="mt-1 text-sm leading-relaxed text-white/58"><strong className="font-normal text-white">{displayName}</strong> • {activeStoreName}</p>
              </div>
            </div>
            {deleteBlocked ? (
              <div className="mt-4 rounded-2xl border border-rose-200/25 bg-rose-500/12 px-3 py-2.5 text-sm text-rose-50">A kliensnek még {money(selectedOpenBalance)} tartozása van. Ezt előbb rendezni kell, utána törölhető.</div>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/10 bg-[#293548] px-3 py-3 text-sm leading-relaxed text-white/62">Ha van vásárlási vagy befizetési előzménye, a rendszer <strong className="font-normal text-white">archiválja</strong> a klienst és eltünteti az aktív klienslistából, de a bizonylati történetet nem törli. Ha nincs előzménye, a kliensrekord végleg törlődik.</div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={deleteBusy} onClick={() => setDeleteConfirmOpen(false)} className={neutralButton}>Mégse</button>
              <button type="button" disabled={deleteBusy || deleteBlocked} onClick={() => void deleteCustomer()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-200/30 bg-rose-600 px-4 text-sm text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-45">{deleteBusy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Törlés</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export default function AllInAdminClients({ actor = "ADMIN", role = "admin" }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [location, setLocation] = useState<LocationScope>("all");
  const [employee, setEmployee] = useState("");
  const [activity, setActivity] = useState<AifAdminCustomerActivityFilter>("all");
  const [sort, setSort] = useState<AifAdminCustomerSort>("revenue");
  const [topTen, setTopTen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [data, setData] = useState<AifAdminCustomersOverviewResponse | null>(null);
  const [selected, setSelected] = useState<AifAdminCustomerOverviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifAdminCustomersOverview({
        year,
        location,
        employee,
        search,
        activity,
        sort,
        topTen,
        combineStores: topTen && location === "all",
        limit: 3000,
      });
      setData(response);
      if (!response.filterOptions.years.includes(year) && response.filterOptions.years.length) {
        setYear(response.filterOptions.years[0]);
      }
      return response;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A klienskimutatás nem tölthető be.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [activity, employee, location, search, sort, topTen, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const years = useMemo(() => {
    const source = data?.filterOptions.years?.length ? data.filterOptions.years : [currentYear];
    return Array.from(new Set([currentYear, ...source])).sort((a, b) => b - a);
  }, [currentYear, data?.filterOptions.years]);

  const summary = data?.summary;
  const customerRows = data?.customers || [];
  const topRevenue = Math.max(1, ...customerRows.map((item) => item.periodRevenue));

  function selectEmployee(value: string) {
    setEmployee(value);
    if (value && activity === "inactive") setActivity("buyers");
  }

  function applySearch() {
    setSearch(searchDraft.trim());
  }

  function clearFilters() {
    setYear(currentYear);
    setLocation("all");
    setEmployee("");
    setActivity("all");
    setSort("revenue");
    setTopTen(false);
    setSearchDraft("");
    setSearch("");
  }

  async function handleCustomerChanged(message: string, deleted = false) {
    setActionMessage(message);
    const previousIds = new Set((selected?.stores || []).map((store) => String(store.customerId || "")).filter(Boolean));
    const response = await load();
    if (deleted) {
      setSelected(null);
      return;
    }
    if (!response || !previousIds.size) return;
    const refreshed = (response.customers || []).find((customer) => customer.stores.some((store) => previousIds.has(String(store.customerId || ""))));
    if (refreshed) setSelected(refreshed);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#5f6b7b] via-[#566171] to-[#485361] p-3 text-white sm:p-4 lg:p-6">
      <div className="mx-auto max-w-[1580px] space-y-3.5">
        <header className="rounded-[27px] border border-white/20 bg-[#2f3b4f] px-4 py-4 shadow-[0_20px_58px_rgba(15,23,42,0.30)] sm:px-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/38 bg-[#2a8d8b]/22 text-[#cffffd]">
              <Users size={28} />
            </span>
            <div className="min-w-[260px] flex-1 border-l-4 border-[#2a8d8b] pl-3">
              <p className="text-[10px] uppercase tracking-[0.19em] text-[#cffffd]/62">AllInFashion • kliens intelligencia</p>
              <h1 className="mt-1 text-2xl tracking-tight sm:text-3xl">Üzleti kliensek</h1>
              <p className="mt-1 text-sm text-white/52">Éves vásárlási érték, üzleti bontás és eladói teljesítmény egy helyen.</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <span className="hidden rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs text-white/55 lg:inline-flex lg:items-center lg:gap-2">
                <UserRound size={14} className="text-[#8ee6e2]" /> {actor}
              </span>
              <button type="button" className={neutralButton} onClick={() => void load()} disabled={loading}>
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Frissítés
              </button>
              <button type="button" className={neutralButton} onClick={() => { window.location.hash = "#home"; }}>
                <Home size={16} /> Kezdőlap
              </button>
            </div>
          </div>
        </header>

        <section className={`${card} overflow-visible p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 text-[#bff8f5]"><Filter size={17} /></span>
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Kimutatás beállítása</p>
                <h2 className="mt-0.5 text-base text-white">Melyik évet és üzletet nézzük?</h2>
              </div>
            </div>
            <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/14 bg-white/[0.05] px-3 text-xs text-white/65 lg:hidden">
              <SlidersHorizontal size={14} /> További szűrők
            </button>
          </div>

          <div className="mt-4 grid gap-2.5 lg:grid-cols-[150px_minmax(430px,1.6fr)_auto]">
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/45">
              Év
              <select value={year} onChange={(event: ChangeEvent<HTMLSelectElement>) => setYear(Number(event.target.value))} className={`${control} w-full`}>
                {years.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <div className="grid gap-1">
              <p className="text-[9px] uppercase tracking-[0.1em] text-white/45">Üzlet</p>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-white/12 bg-[#293548] p-1">
                {[
                  ["all", "Mindkettő"],
                  ["main_warehouse", "Csíkszereda"],
                  ["magazin_targu_secuiesc", "Kézdivásárhely"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLocation(value as LocationScope)}
                    className={`h-9 rounded-lg border px-2 text-[11px] transition ${location === value
                      ? "border-[#9be9e5]/45 bg-[#2a8d8b] text-white"
                      : "border-transparent bg-transparent text-white/55 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setTopTen((value) => {
                  const next = !value;
                  if (next) {
                    setLocation("all");
                    setActivity("buyers");
                    setSort("revenue");
                  }
                  return next;
                });
              }}
              className={`inline-flex h-11 lg:mt-[17px] min-w-[150px] items-center justify-center gap-2 rounded-xl border px-4 text-sm transition ${topTen
                ? "border-amber-200/48 bg-gradient-to-r from-[#8b6b25] to-[#6f5724] text-white shadow-[0_10px_24px_rgba(245,158,11,0.16)]"
                : "border-white/16 bg-[#3b485b] text-white/72 hover:border-amber-200/28 hover:text-white"
              }`}
            >
              <Trophy size={17} /> Top 10
              {topTen ? <CheckCircle2 size={14} /> : null}
            </button>
          </div>

          <div className={`${advancedOpen ? "grid" : "hidden"} mt-3 gap-2.5 md:grid-cols-2 lg:grid lg:grid-cols-[minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(280px,1.5fr)_auto]`}>
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/45">
              Eladó
              <select value={employee} onChange={(event: ChangeEvent<HTMLSelectElement>) => selectEmployee(event.target.value)} className={`${control} w-full`}>
                <option value="">Minden eladó</option>
                {employee && !(data?.filterOptions.employees || []).includes(employee) ? <option value={employee}>{employee}</option> : null}
                {(data?.filterOptions.employees || []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/45">
              Aktivitás
              <select value={activity} onChange={(event: ChangeEvent<HTMLSelectElement>) => setActivity(event.target.value as AifAdminCustomerActivityFilter)} className={`${control} w-full`}>
                <option value="all">Minden kliens</option>
                <option value="buyers">Vásárolt ebben az évben</option>
                <option value="repeat">Visszatérő kliens</option>
                <option value="inactive">Nem vásárolt ebben az évben</option>
                <option value="debt">Jelenleg tartozik</option>
              </select>
            </label>
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/45">
              Rendezés
              <select value={sort} disabled={topTen} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSort(event.target.value as AifAdminCustomerSort)} className={`${control} w-full disabled:cursor-not-allowed disabled:opacity-45`}>
                <option value="revenue">Forgalom szerint</option>
                <option value="transactions">Vásárlások szerint</option>
                <option value="items">Darabszám szerint</option>
                <option value="average">Átlagkosár szerint</option>
                <option value="last_sale">Utolsó vásárlás szerint</option>
                <option value="debt">Tartozás szerint</option>
                <option value="name">Név szerint</option>
              </select>
            </label>
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/45">
              Keresés
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 text-white/36" size={15} />
                <input
                  value={searchDraft}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchDraft(event.target.value)}
                  onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") applySearch(); }}
                  placeholder="Kliens neve, telefon, e-mail…"
                  className={`${control} w-full pl-9 placeholder:text-white/32`}
                />
              </div>
            </label>
            <div className="flex items-end gap-2 md:col-span-2 lg:col-span-1">
              <button type="button" onClick={applySearch} className={`${primaryButton} flex-1 lg:min-w-[105px]`}><Search size={15} /> Keresés</button>
              <button type="button" onClick={clearFilters} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.04] text-white/55 hover:bg-white/[0.09] hover:text-white" title="Minden szűrő törlése"><X size={16} /></button>
            </div>
          </div>

          {topTen && location === "all" ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200/22 bg-amber-400/8 px-3 py-2.5 text-xs text-amber-50/78">
              <Trophy size={15} className="mt-0.5 shrink-0" />
              A Top 10 nézet ugyanazt a klienst a két üzletből telefonszám alapján összevonja, majd a {year}. évi összesített vásárlási érték szerint rangsorolja.
            </div>
          ) : null}
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200/30 bg-rose-500/14 px-4 py-3 text-sm text-rose-50">{error}</div>
        ) : null}
        {actionMessage ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
            <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> {actionMessage}</span>
            <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-black/10 text-white/55 hover:text-white" onClick={() => setActionMessage("")} aria-label="Üzenet bezárása"><X size={13} /></button>
          </div>
        ) : null}

        {employee ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#9be9e5]/28 bg-[#244f55] px-4 py-3">
            <div className="flex items-center gap-3">
              <UserCheck size={19} className="text-[#9be9e5]" />
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Aktív eladói szűrés</p>
                <p className="mt-1 text-sm text-white"><strong className="font-normal text-[#d7fffd]">{employee}</strong> {year}. évi kliensforgalma</p>
              </div>
            </div>
            <button type="button" onClick={() => setEmployee("")} className="h-9 rounded-xl border border-white/14 bg-black/10 px-3 text-xs text-white/65 hover:bg-white/[0.08]">Szűrés törlése</button>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <SummaryCard label="Forgalom" value={money(summary?.revenue)} hint={`${year} • ${data?.scope.locationName || "Mindkét üzlet"}`} icon={CircleDollarSign} tone="green" />
          <SummaryCard label="Vásárló kliensek" value={integer(summary?.buyingCustomers)} hint={`${integer(summary?.newCustomers)} új • ${integer(summary?.inactiveCustomers)} nem vásárolt ebben az évben`} icon={UserCheck} tone="blue" />
          <SummaryCard label="Vásárlások" value={integer(summary?.transactions)} hint={`${integer(summary?.itemsSold)} eladott darab`} icon={ReceiptText} />
          <SummaryCard label="Átlag / kliens" value={money(summary?.averageCustomerValue)} hint="Csak az adott évben vásárlók alapján" icon={TrendingUp} tone="green" />
          <SummaryCard label="Átlagkosár" value={money(summary?.averageBasket)} hint="Egy lezárt vásárlás átlagértéke" icon={ShoppingBag} />
          <SummaryCard label="Visszatérők" value={integer(summary?.repeatCustomers)} hint="Legalább 2 vásárlás a kiválasztott évben" icon={Users} tone="gold" />
          <SummaryCard label="Jelenlegi tartozás" value={money(summary?.currentOpenBalance)} hint={`${money(summary?.periodBalanceDue)} a kiválasztott év eladásaiból`} icon={WalletCards} tone={numberValue(summary?.currentOpenBalance) > 0 ? "red" : "normal"} />
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          {(data?.stores || []).map((store) => <StorePerformanceCard key={store.id} store={store} />)}
        </section>

        <EmployeePerformance items={data?.employees || []} selected={employee} onSelect={selectEmployee} />

        <section className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
            <div>
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Klienslista</p>
              <h2 className="mt-1 text-base text-white">{topTen ? `Top 10 kliens • ${year}` : `Üzleti kliensek • ${year}`}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[10px] text-white/50">{integer(data?.totalFilteredCustomers || 0)} üzleti kliensrekord</span>
              {topTen ? <span className="rounded-full border border-amber-200/25 bg-amber-400/10 px-3 py-1 text-[10px] text-amber-50">Rangsor</span> : null}
            </div>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1260px] border-collapse text-xs">
              <thead className="bg-[#293548] text-[9px] uppercase tracking-[0.08em] text-white/43">
                <tr>
                  {topTen ? <th className="w-[54px] px-3 py-3 text-center">#</th> : null}
                  <th className="min-w-[270px] px-3 py-3 text-left">Kliens</th>
                  <th className="min-w-[150px] px-3 py-3 text-left">Üzlet</th>
                  <th className="px-3 py-3 text-right">{year}. évi forgalom</th>
                  <th className="px-3 py-3 text-center">Vásárlás / db</th>
                  <th className="px-3 py-3 text-right">Átlagkosár</th>
                  <th className="min-w-[260px] px-3 py-3 text-left">Eladó(k)</th>
                  <th className="min-w-[180px] px-3 py-3 text-left">Aktivitás</th>
                  <th className="px-3 py-3 text-right">Tartozás</th>
                  <th className="w-[48px] px-2 py-3"><span className="sr-only">Részletek</span></th>
                </tr>
              </thead>
              <tbody>
                {customerRows.map((item, index) => (
                  <tr key={item.key} className="group cursor-pointer border-t border-white/8 align-middle transition hover:bg-white/[0.035]" onClick={() => setSelected(item)}>
                    {topTen ? (
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border text-sm ${index < 3 ? "border-amber-200/35 bg-amber-400/12 text-amber-50" : "border-white/10 bg-black/10 text-white/55"}`}>{index + 1}</span>
                      </td>
                    ) : null}
                    <td className="px-3 py-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/12 text-[#bff8f5]"><UserRound size={18} /></span>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm text-white" title={item.fullName}>{item.fullName}</p>
                            {item.periodTransactions >= 2 ? <span className="shrink-0 rounded-full border border-amber-200/22 bg-amber-400/8 px-2 py-0.5 text-[9px] text-amber-50">Visszatérő</span> : null}
                            {item.combined ? <span className="shrink-0 rounded-full border border-[#9be9e5]/22 bg-[#2a8d8b]/10 px-2 py-0.5 text-[9px] text-[#d7fffd]">Összevonva</span> : null}
                          </div>
                          <p className="mt-1 truncate text-[10px] text-white/43">{[item.phone, item.email].filter(Boolean).join(" • ") || "Nincs elérhetőség"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">{item.stores.map((store) => <StoreBadge key={`${store.locationId}-${store.customerId}`} code={store.locationCode} name={store.locationName} />)}</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="text-sm text-white">{money(item.periodRevenue)}</p>
                      {topTen ? (
                        <div className="ml-auto mt-2 h-1.5 w-28 overflow-hidden rounded-full bg-[#233043]"><div className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#69ddd8]" style={{ width: `${Math.max(3, item.periodRevenue / topRevenue * 100)}%` }} /></div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-center"><p className="text-white">{integer(item.periodTransactions)} / {integer(item.periodItemsSold)} db</p></td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-white/78">{money(item.periodAverageBasket)}</td>
                    <td className="px-3 py-3"><SellerChips sellers={item.employees} /></td>
                    <td className="px-3 py-3"><p className={item.periodTransactions > 0 ? "text-white/70" : "text-amber-50/72"}>{activityText(item, year)}</p></td>
                    <td className={`whitespace-nowrap px-3 py-3 text-right ${item.currentOpenBalance > 0.005 ? "text-rose-50" : "text-white/45"}`}>{money(item.currentOpenBalance)}</td>
                    <td className="px-2 py-3 text-center"><ChevronRight size={17} className="text-white/30 transition group-hover:translate-x-0.5 group-hover:text-[#9be9e5]" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 p-3 lg:hidden">
            {customerRows.map((item, index) => (
              <button key={item.key} type="button" onClick={() => setSelected(item)} className="rounded-[20px] border border-white/11 bg-[#2b3749] p-3 text-left transition active:scale-[0.99]">
                <div className="flex items-start gap-3">
                  {topTen ? <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm ${index < 3 ? "border-amber-200/35 bg-amber-400/12 text-amber-50" : "border-white/10 bg-black/10 text-white/55"}`}>{index + 1}</span> : <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/20 bg-[#2a8d8b]/12 text-[#bff8f5]"><UserRound size={17} /></span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-sm text-white">{item.fullName}</p><p className="mt-1 truncate text-[10px] text-white/42">{item.phone || item.email || "Nincs elérhetőség"}</p></div>
                      <p className="shrink-0 text-sm text-white">{money(item.periodRevenue)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">{item.stores.map((store) => <StoreBadge key={`${store.locationId}-${store.customerId}`} code={store.locationCode} name={store.locationName} />)}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <span className="rounded-xl border border-white/8 bg-black/10 px-2 py-2 text-center"><span className="block text-[8px] uppercase text-white/35">Vásárlás</span><strong className="mt-1 block text-sm font-normal text-white">{integer(item.periodTransactions)}</strong></span>
                  <span className="rounded-xl border border-white/8 bg-black/10 px-2 py-2 text-center"><span className="block text-[8px] uppercase text-white/35">Darab</span><strong className="mt-1 block text-sm font-normal text-white">{integer(item.periodItemsSold)}</strong></span>
                  <span className={`rounded-xl border px-2 py-2 text-center ${item.currentOpenBalance > 0.005 ? "border-rose-200/20 bg-rose-500/10" : "border-white/8 bg-black/10"}`}><span className="block text-[8px] uppercase text-white/35">Tartozás</span><strong className="mt-1 block truncate text-sm font-normal text-white">{money(item.currentOpenBalance)}</strong></span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-2.5 text-[10px] text-white/45"><span className="truncate">{activityText(item, year)}</span><ChevronRight size={15} className="shrink-0 text-[#8ee6e2]" /></div>
              </button>
            ))}
          </div>

          {!customerRows.length && !loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center">
              <Users size={38} className="text-white/25" />
              <p className="mt-3 text-base text-white/68">Nincs kliens ebben a szűrésben.</p>
              <p className="mt-1 text-xs text-white/40">Módosítsd az évet, az üzletet vagy az aktivitási feltételt.</p>
            </div>
          ) : null}
        </section>
      </div>

      {selected ? <CustomerDetailModal item={selected} year={year} canManage={role !== "shop"} onClose={() => setSelected(null)} onChanged={handleCustomerChanged} /> : null}

      {loading ? (
        <div className="fixed inset-0 z-[390] grid place-items-center bg-slate-950/24 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/18 bg-[#263348] px-5 py-4 shadow-2xl">
            <Loader2 className="animate-spin text-[#8ee6e2]" size={22} />
            <span className="text-sm text-white">Klienskimutatás betöltése…</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
