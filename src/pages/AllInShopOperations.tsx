import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Banknote,
  Barcode,
  Boxes,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  CreditCard,
  Filter,
  History,
  Landmark,
  LockKeyhole,
  Loader2,
  Mail,
  MapPin,
  PackageSearch,
  Phone,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Store,
  TriangleAlert,
  UserCheck,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifCancelShopCashMovement,
  apiAifCancelShopShiftHandover,
  apiAifCloseShopDay,
  apiAifCreateShopCashMovement,
  apiAifCreateShopShiftHandover,
  apiAifGetShopCustomer,
  apiAifShopCashOverview,
  apiAifShopDailySummary,
  apiAifShopSaleCatalog,
  apiAifShopSaleDetail,
  apiAifShopShiftDayOverview,
  apiAifShopShiftEmployees,
  apiAifShopStockOverview,
  type AifShopCashMovementType,
  type AifShopCashOverview,
  type AifShopCustomerDetail,
  type AifShopDailySummaryResponse,
  type AifShopDailySaleItem,
  type AifShopSaleCatalogItem,
  type AifShopSaleDetailResponse,
  type AifShopShiftDayOverview,
  type AifShopShiftHandover,
  type AifShopShiftSnapshot,
  type AifShopStockOverviewResponse,
} from "../lib/aif/api";

export type AllInShopOperationMode = "search" | "stock" | "summary";

type Props = {
  open: boolean;
  mode: AllInShopOperationMode;
  actor: string;
  locationCode: string;
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

type ProductFilterKey = "brand" | "gender" | "subcategory" | "size";
type ProductFilters = Record<ProductFilterKey, string[]>;

const FILTER_META: Array<{ key: ProductFilterKey; label: string }> = [
  { key: "brand", label: "Márka" },
  { key: "gender", label: "Nem" },
  { key: "subcategory", label: "Alkategória" },
  { key: "size", label: "Méret" },
];

function emptyProductFilters(): ProductFilters {
  return { brand: [], gender: [], subcategory: [], size: [] };
}

function normalizeGender(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  const compact = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (["women", "woman", "female", "femei", "femeie", "noi", "no", "dama"].includes(compact)) return "women";
  if (["men", "man", "male", "barbati", "barbat", "ferfi", "ffi"].includes(compact)) return "men";
  if (["kids", "kid", "copii", "copil", "gyerek", "junior", "youth", "children"].includes(compact)) return "kids";
  if (["boy", "boys", "baiat", "baieti", "kisfiu"].includes(compact)) return "boys";
  if (["girl", "girls", "fata", "fete", "kislany"].includes(compact)) return "girls";
  if (["unisex", "universal", "mixt", "mixed"].includes(compact)) return "unisex";
  return compact || "unisex";
}

function genderLabel(value: string) {
  if (value === "women") return "Női";
  if (value === "men") return "Férfi";
  if (value === "kids") return "Gyerek";
  if (value === "boys") return "Kisfiú";
  if (value === "girls") return "Kislány";
  if (value === "unisex") return "Unisex";
  return value || "Nincs megadva";
}

function productFilterValue(item: AifShopSaleCatalogItem, key: ProductFilterKey) {
  if (key === "brand") return String(item.brandName || "").trim();
  if (key === "gender") return normalizeGender(item.gender);
  if (key === "subcategory") return String(item.subcategoryName || item.categoryName || "").trim();
  return String(item.size || "").trim();
}

function uniqueFilterValues(items: AifShopSaleCatalogItem[], key: ProductFilterKey) {
  const found = new Map<string, string>();
  for (const item of items) {
    const value = productFilterValue(item, key);
    if (!value) continue;
    const normalized = value.toLocaleLowerCase("hu-HU");
    if (!found.has(normalized)) found.set(normalized, value);
  }
  return Array.from(found.values()).sort((a, b) => {
    if (key === "size") return a.localeCompare(b, "hu-HU", { numeric: true, sensitivity: "base" });
    return (key === "gender" ? genderLabel(a) : a).localeCompare(key === "gender" ? genderLabel(b) : b, "hu-HU", { sensitivity: "base" });
  });
}

function applyProductFilters<T extends AifShopSaleCatalogItem>(items: T[], filters: ProductFilters) {
  return items.filter((item) => FILTER_META.every(({ key }) => {
    const selected = filters[key];
    if (!selected.length) return true;
    const value = productFilterValue(item, key).toLocaleLowerCase("hu-HU");
    return selected.some((candidate) => candidate.toLocaleLowerCase("hu-HU") === value);
  }));
}

function productMatchesOtherFilters(
  item: AifShopSaleCatalogItem,
  filters: ProductFilters,
  exceptKey: ProductFilterKey,
) {
  return FILTER_META.every(({ key }) => {
    if (key === exceptKey) return true;
    const selected = filters[key];
    if (!selected.length) return true;
    const value = productFilterValue(item, key).toLocaleLowerCase("hu-HU");
    return selected.some((candidate) => candidate.toLocaleLowerCase("hu-HU") === value);
  });
}

function TouchFilterBar({
  items,
  filters,
  onToggle,
  onClear,
}: {
  items: AifShopSaleCatalogItem[];
  filters: ProductFilters;
  onToggle: (key: ProductFilterKey, value: string) => void;
  onClear: () => void;
}) {
  const [openKey, setOpenKey] = useState<ProductFilterKey | null>(null);
  const options = useMemo(() => ({
    brand: uniqueFilterValues(items, "brand"),
    gender: uniqueFilterValues(items, "gender"),
    subcategory: uniqueFilterValues(items, "subcategory"),
    size: uniqueFilterValues(items, "size"),
  }), [items]);
  const activeCount = FILTER_META.reduce((sum, item) => sum + filters[item.key].length, 0);

  return (
    <div className="mt-3 rounded-[22px] border border-[#9be9e5]/24 bg-[#253144]/78 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_META.map((item) => {
          const selectedCount = filters[item.key].length;
          const opened = openKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setOpenKey((current) => current === item.key ? null : item.key)}
              className={`inline-flex min-h-[52px] flex-1 touch-manipulation items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm text-white shadow-[0_8px_20px_rgba(42,141,139,0.16)] transition active:scale-[0.98] sm:min-w-[170px] ${
                opened || selectedCount
                  ? "border-[#b9f5f2]/60 bg-[#2a8d8b]"
                  : "border-[#9be9e5]/38 bg-[#267f7d] hover:bg-[#2a8d8b]"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Filter size={17} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {selectedCount ? <span className="inline-flex min-w-7 items-center justify-center rounded-full border border-white/25 bg-white/14 px-2 py-0.5 text-xs">{selectedCount}</span> : null}
                {opened ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </span>
            </button>
          );
        })}

        {activeCount ? (
          <button
            type="button"
            onClick={() => { onClear(); setOpenKey(null); }}
            className="inline-flex min-h-[52px] touch-manipulation items-center justify-center gap-2 rounded-2xl border border-white/18 bg-[#354153] px-4 py-3 text-sm text-white transition hover:bg-[#3e4d63] active:scale-[0.98]"
          >
            <RotateCcw size={17} /> Törlés
          </button>
        ) : null}
      </div>

      {openKey ? (
        <div className="mt-3 rounded-2xl border border-[#9be9e5]/26 bg-[#303a4c] p-3 shadow-[0_18px_46px_rgba(0,0,0,0.24)]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm text-white">{FILTER_META.find((item) => item.key === openKey)?.label}</p>
            <span className="text-xs text-white/48">Több érték is kijelölhető</span>
          </div>
          <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {options[openKey].map((value) => {
              const selected = filters[openKey].some((item) => item.toLocaleLowerCase("hu-HU") === value.toLocaleLowerCase("hu-HU"));
              const normalizedValue = value.toLocaleLowerCase("hu-HU");
              const optionCount = items.reduce((count, item) => {
                if (!productMatchesOtherFilters(item, filters, openKey)) return count;
                return productFilterValue(item, openKey).toLocaleLowerCase("hu-HU") === normalizedValue ? count + 1 : count;
              }, 0);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onToggle(openKey, value)}
                  className={`flex min-h-12 touch-manipulation items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition active:scale-[0.98] ${
                    selected
                      ? "border-[#b9f5f2]/60 bg-[#2a8d8b] text-white"
                      : "border-white/14 bg-[#3a4557] text-white/78 hover:border-[#7bd7d4]/42 hover:bg-[#425064]"
                  }`}
                >
                  <span className="truncate">{openKey === "gender" ? genderLabel(value) : value}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="inline-flex min-w-7 items-center justify-center rounded-full border border-white/15 bg-black/10 px-2 py-0.5 text-[10px] text-white/70">
                      {optionCount}
                    </span>
                    {selected ? <Check size={17} className="shrink-0" /> : null}
                  </span>
                </button>
              );
            })}
            {!options[openKey].length ? <div className="col-span-full py-5 text-center text-sm text-white/45">Ehhez a szűrőhöz nincs adat.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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

const CASH_HISTORY_MONTHS = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
] as const;
const CASH_HISTORY_MONTHS_SHORT = [
  "jan", "feb", "márc", "ápr", "máj", "jún",
  "júl", "aug", "szept", "okt", "nov", "dec",
] as const;

function monthLabel(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return value;
  const month = Math.max(1, Math.min(12, Number(match[2])));
  return `${match[1]} ${CASH_HISTORY_MONTHS[month - 1]}`;
}

function validHistoryMonth(value?: string | null) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
}

function historyMonthFromDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = date.toLocaleDateString("en-CA", { timeZone: "Europe/Bucharest" });
  return local.slice(0, 7);
}


function formatTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}


function formatExactDateTime(value?: string | null) {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("hu-HU", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function saleStatusLabel(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "completed") return "Lezárva";
  if (status === "cancelled") return "Törölve";
  if (status === "refunded") return "Visszatérítve";
  if (status === "draft") return "Vázlat";
  return value || "–";
}

function paymentStatusLabel(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "paid") return "Fizetve";
  if (status === "partial") return "Részben fizetve";
  if (status === "credit") return "Tartozás";
  if (status === "unpaid") return "Nincs fizetve";
  return value || "–";
}

function safeColorHex(value?: string | null) {
  const raw = String(value || "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(raw) ? raw : "";
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

function employeeKey(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("hu-HU");
}

function shiftPayment(snapshot: AifShopShiftSnapshot | null | undefined, method: string) {
  return (snapshot?.payments || []).find((item) => item.method === method) || {
    method,
    label: method,
    amount: 0,
    salesAmount: 0,
    customerPaymentAmount: 0,
    transactions: 0,
    customerPaymentTransactions: 0,
  };
}

function shiftCollectedTotal(snapshot: AifShopShiftSnapshot | null | undefined) {
  return ["cash", "card", "bank_transfer"].reduce(
    (sum, method) => sum + numberValue(shiftPayment(snapshot, method).amount),
    0,
  );
}

function shiftCustomerPaymentTotal(snapshot: AifShopShiftSnapshot | null | undefined) {
  return ["cash", "card", "bank_transfer"].reduce(
    (sum, method) => sum + numberValue(shiftPayment(snapshot, method).customerPaymentAmount),
    0,
  );
}

function shiftStatusLabel(status?: string | null) {
  if (status === "accepted") return "Átvéve";
  if (status === "cancelled") return "Visszavonva";
  return "Átvételre vár";
}

function ProductImage({ src, title, large = false, compact = false }: { src?: string | null; title: string; large?: boolean; compact?: boolean }) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ left: 12, top: 12, size: 256 });

  function updatePreviewPosition() {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === "undefined") return;
    const rect = anchor.getBoundingClientRect();
    const margin = 12;
    const gap = 12;
    const size = Math.max(190, Math.min(288, window.innerWidth - margin * 2, window.innerHeight - margin * 2));
    let left = rect.right + gap;
    if (left + size > window.innerWidth - margin) left = rect.left - size - gap;
    left = Math.max(margin, Math.min(left, window.innerWidth - size - margin));

    let top = rect.top;
    if (top + size > window.innerHeight - margin) top = window.innerHeight - size - margin;
    top = Math.max(margin, top);
    setPreviewPosition({ left, top, size });
  }

  useEffect(() => {
    if (!previewOpen) return;
    updatePreviewPosition();
    const onMove = () => updatePreviewPosition();
    const onPointer = (event: PointerEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) setPreviewOpen(false);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [previewOpen]);

  if (!src) {
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-2xl border border-white/14 bg-white/95 ${large ? "h-24 w-24" : compact ? "h-[78px] w-[78px]" : "h-20 w-20"}`}>
        <PackageSearch size={large ? 34 : compact ? 24 : 28} className="text-[#526173]" />
      </span>
    );
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`relative flex shrink-0 touch-manipulation items-center justify-center overflow-hidden rounded-2xl border border-white/14 bg-white/95 ${large ? "h-24 w-24" : compact ? "h-[78px] w-[78px]" : "h-20 w-20"}`}
        onMouseEnter={() => { updatePreviewPosition(); setPreviewOpen(true); }}
        onMouseLeave={() => setPreviewOpen(false)}
        onClick={(event) => { event.stopPropagation(); updatePreviewPosition(); setPreviewOpen((current) => !current); }}
        aria-label={`${title} képének nagyítása`}
      >
        <img src={src} alt="" className="h-full w-full rounded-2xl object-contain" />
      </button>
      {previewOpen && typeof document !== "undefined" ? createPortal(
        <span
          className="pointer-events-none fixed z-[420] flex items-center justify-center rounded-[22px] border border-[#9be9e5]/55 bg-white p-3 shadow-[0_28px_90px_rgba(0,0,0,0.52)]"
          style={{
            left: previewPosition.left,
            top: previewPosition.top,
            width: previewPosition.size,
            height: previewPosition.size,
          }}
        >
          <img src={src} alt={title} className="max-h-full max-w-full object-contain" />
        </span>,
        document.body,
      ) : null}
    </>
  );
}



function CustomerQuickViewModal({
  detail,
  loading,
  error,
  fallbackName,
  year,
  onClose,
}: {
  detail: AifShopCustomerDetail | null;
  loading: boolean;
  error: string;
  fallbackName: string;
  year: number;
  onClose: () => void;
}) {
  const customer = detail?.item || null;
  const summary = detail?.summary || null;
  const address = customer
    ? [
        [customer.localityName || customer.city, customer.countyName].filter(Boolean).join(", "),
        customer.address,
        customer.postalCode,
      ].filter(Boolean).join(" • ")
    : "";

  return createPortal(
    <div
      className="fixed inset-0 z-[535] flex items-center justify-center bg-[#0f172a]/88 p-3 backdrop-blur-md sm:p-5"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="flex max-h-[91vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[28px] border border-[#9be9e5]/42 bg-[#303a4c] text-white shadow-[0_42px_130px_rgba(0,0,0,0.68)]">
        <header className="flex items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#234b52] via-[#276f70] to-[#2a8d8b] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/28 bg-white/10 text-white">
              <UserRound size={23} />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/58">Kliens adatlap</p>
              <h3 className="mt-1 truncate text-xl text-white sm:text-2xl">
                {customer?.fullName || fallbackName || "Kliens"}
              </h3>
              <p className="mt-1 text-[11px] text-white/62">A kiválasztott kliens összes fontos adata</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/22 bg-black/10 text-white transition hover:bg-white/10"
            aria-label="Kliens adatlap bezárása"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center gap-3 text-white/58">
              <Loader2 size={22} className="animate-spin text-[#8ee6e2]" />
              Kliensadatlap betöltése…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-300/45 bg-red-600/18 px-4 py-4 text-sm text-red-50">
              {error}
            </div>
          ) : customer && summary ? (
            <div className="space-y-3">
              <section className="rounded-[22px] border border-white/12 bg-[#374357] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h4 className="truncate text-xl text-white">{customer.fullName}</h4>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-white/58">
                      {customer.phone ? (
                        <span className="inline-flex items-center gap-2">
                          <Phone size={14} className="text-[#8ee6e2]" /> {customer.phone}
                        </span>
                      ) : null}
                      {customer.email ? (
                        <span className="inline-flex items-center gap-2">
                          <Mail size={14} className="text-[#8ee6e2]" /> {customer.email}
                        </span>
                      ) : null}
                    </div>
                    {address ? (
                      <p className="mt-2 flex items-start gap-2 text-[12px] leading-relaxed text-white/52">
                        <MapPin size={14} className="mt-0.5 shrink-0 text-[#8ee6e2]" />
                        <span>{address}</span>
                      </p>
                    ) : null}
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-xl border border-[#9be9e5]/28 bg-[#2a8d8b]/14 px-3 py-2 text-[11px] text-[#d7fffd]">
                    <ShoppingBag size={14} />
                    {summary.saleCount} vásárlás
                  </span>
                </div>
              </section>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 p-3">
                  <p className="text-[9px] uppercase tracking-[0.11em] text-[#d7fffd]/56">{year}. évi vásárlás</p>
                  <p className="mt-2 text-2xl tabular-nums text-[#d7fffd]">{formatMoney(summary.yearPurchaseTotal)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <p className="text-[9px] uppercase tracking-[0.11em] text-white/42">Összes vásárlás</p>
                  <p className="mt-2 text-2xl tabular-nums text-white">{formatMoney(summary.lifetimePurchaseTotal)}</p>
                </div>
                <div className={`rounded-2xl border p-3 ${
                  numberValue(summary.openBalance) > 0.005
                    ? "border-red-300/70 bg-[#E21C2A] text-white shadow-[0_8px_20px_rgba(226,28,42,0.20)]"
                    : "border-[#7bd7d4]/25 bg-[#2a8d8b]/14 text-[#d7fffd]"
                }`}>
                  <p className="text-[9px] uppercase tracking-[0.11em] opacity-75">Nyitott tartozás</p>
                  <p className="mt-2 text-2xl tabular-nums">{formatMoney(summary.openBalance)}</p>
                  <p className="mt-1 text-[10px] opacity-70">{summary.openSales} nyitott vásárlás</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <p className="text-[9px] uppercase tracking-[0.11em] text-white/42">Utolsó vásárlás</p>
                  <p className="mt-2 text-sm text-white">{summary.lastSaleAt ? formatExactDateTime(summary.lastSaleAt) : "–"}</p>
                </div>
              </div>

              <section className="rounded-[22px] border border-white/12 bg-[#374357] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Vásárlási előzmények</p>
                    <h4 className="mt-1 text-base text-white">Legutóbbi bizonylatok</h4>
                  </div>
                  <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">
                    {detail.sales.length} bizonylat
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {detail.sales.slice(0, 12).map((sale) => (
                    <div
                      key={sale.id}
                      className={`grid gap-2 rounded-xl border px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_150px_150px] sm:items-center ${
                        numberValue(sale.balanceDue) > 0.005
                          ? "border-red-300/30 bg-red-950/16"
                          : "border-white/10 bg-[#293548]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-white">
                          <span className="whitespace-nowrap tabular-nums">{formatExactDateTime(sale.soldAt)}</span>
                          <span className="text-white/26">•</span>
                          <span className="truncate text-[#d7fffd]">{sale.actor || "–"}</span>
                        </p>
                        <p className="mt-1 truncate text-[9px] uppercase tracking-[0.08em] text-white/30">
                          Bizonylat: {sale.saleNumber}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-[9px] uppercase tracking-[0.08em] text-white/35">Összeg</p>
                        <p className="mt-1 text-sm text-white">{formatMoney(sale.total)}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-[9px] uppercase tracking-[0.08em] text-white/35">Tartozás</p>
                        <p className={`mt-1 text-sm ${numberValue(sale.balanceDue) > 0.005 ? "text-red-100" : "text-[#bdf8f5]"}`}>
                          {formatMoney(sale.balanceDue)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {!detail.sales.length ? (
                    <div className="rounded-xl border border-dashed border-white/12 px-4 py-7 text-center text-sm text-white/40">
                      Nincs vásárlási előzmény.
                    </div>
                  ) : null}
                </div>
              </section>

              {customer.notes ? (
                <section className="rounded-2xl border border-white/10 bg-[#293548] px-4 py-3">
                  <p className="text-[9px] uppercase tracking-[0.11em] text-white/38">Kliens megjegyzése</p>
                  <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-white/66">{customer.notes}</p>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}


function DailySaleDetailModal({
  sale,
  detail,
  loading,
  error,
  onClose,
}: {
  sale: AifShopDailySaleItem;
  detail: AifShopSaleDetailResponse | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const source = detail || sale;
  const isExchange = String(detail?.recordType || sale.recordType || "sale") === "exchange";
  const hasDiscount = numberValue(source.discountTotal) > 0.005;

  return createPortal(
    <div
      className="fixed inset-0 z-[470] flex items-center justify-center bg-[#0f172a]/90 p-3 backdrop-blur-md sm:p-5"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="flex max-h-[94vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-[28px] border border-[#9be9e5]/38 bg-[#303a4c] text-white shadow-[0_40px_120px_rgba(0,0,0,0.66)]">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/12 bg-[#285d60] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/22 bg-white/[0.08] text-white">
              {isExchange ? <ArrowRightLeft size={22} /> : <Receipt size={22} />}
            </span>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/55">
                {isExchange ? "Csere részletei" : "Eladás részletei"}
              </p>
              <h3 className="mt-1 truncate text-xl text-white sm:text-2xl">{source.saleNumber}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/18 bg-black/10 px-2.5 py-1 text-[10px] text-white/80">
                  {formatExactDateTime(source.soldAt)}
                </span>
                <span className="rounded-full border border-[#9be9e5]/30 bg-[#2a8d8b]/20 px-2.5 py-1 text-[10px] text-[#efffff]">
                  {saleStatusLabel(detail?.status || "completed")}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${
                  numberValue(source.balanceDue) > 0.005
                    ? "border-rose-200/28 bg-rose-500/14 text-rose-50"
                    : "border-[#9be9e5]/30 bg-[#2a8d8b]/20 text-[#efffff]"
                }`}>
                  {paymentStatusLabel(detail?.paymentStatus || (numberValue(source.balanceDue) > 0.005 ? "credit" : "paid"))}
                </span>
                <span className="rounded-full border border-[#9be9e5]/35 bg-[#237c7a] px-2.5 py-1 text-[10px] text-white">
                  {detail?.paymentLabel || sale.paymentLabel}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-black/10 text-white transition hover:bg-white/[0.1]"
            aria-label="Eladás részleteinek bezárása"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 sm:p-5 sm:pb-28">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#9be9e5]/28 bg-[#2a8d8b] px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.12em] text-[#dffffd]/72">Végösszeg</p>
              <p className="mt-1.5 text-2xl text-white">{formatMoney(source.total)}</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${hasDiscount ? "border-[#9be9e5]/30 bg-[#244f55]" : "border-white/10 bg-[#293548]"}`}>
              <p className="text-[9px] uppercase tracking-[0.12em] text-white/55">Kedvezmény</p>
              <p className={`mt-1.5 text-xl ${hasDiscount ? "text-[#efffff]" : "text-white/55"}`}>{formatMoney(source.discountTotal)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#293548] px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.12em] text-white/45">Fizetve</p>
              <p className="mt-1.5 text-xl text-white">{formatMoney(source.paidTotal)}</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3 ${numberValue(source.balanceDue) > 0.005 ? "border-rose-200/30 bg-rose-500/13" : "border-white/10 bg-[#293548]"}`}>
              <p className="text-[9px] uppercase tracking-[0.12em] text-white/45">Tartozás</p>
              <p className={`mt-1.5 text-xl ${numberValue(source.balanceDue) > 0.005 ? "text-rose-50" : "text-white/60"}`}>{formatMoney(source.balanceDue)}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-white/10 bg-[#293548] px-4 py-3">
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-white/64">
                <span>Eladó: <strong className="font-normal text-white">{detail?.actor || "–"}</strong></span>
                <span>Üzlet: <strong className="font-normal text-white">{detail?.location?.name || "–"}</strong></span>
                <span>Darab: <strong className="font-normal text-white">{detail?.itemCount ?? sale.itemCount}</strong></span>
                <span>Terméksor: <strong className="font-normal text-white">{detail?.lineCount ?? sale.lineCount}</strong></span>
              </div>
              {(detail?.customerName || sale.customerName) ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/8 pt-2 text-[12px]">
                  <span className="text-white/54">Kliens: <strong className="font-normal text-[#d7fffd]">{detail?.customerName || sale.customerName}</strong></span>
                  {(detail?.customerPhone || sale.customerPhone) ? <span className="text-white/54">Telefon: <strong className="font-normal text-white">{detail?.customerPhone || sale.customerPhone}</strong></span> : null}
                </div>
              ) : null}
              {detail?.note ? <p className="mt-2 border-t border-white/8 pt-2 text-xs leading-relaxed text-white/52">{detail.note}</p> : null}
            </div>

            <div className="min-w-[250px] rounded-2xl border border-[#9be9e5]/22 bg-[#244f55] px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.12em] text-[#cffffd]/62">Fizetési mód</p>
              <p className="mt-1.5 text-lg text-white">{detail?.paymentLabel || sale.paymentLabel}</p>
              {detail?.payments?.length ? (
                <div className="mt-2 space-y-1 text-[11px] text-white/62">
                  {detail.payments.map((payment, index) => (
                    <div key={`${payment.method}-${index}`} className="flex items-center justify-between gap-3">
                      <span>{payment.label}</span>
                      <span className="text-white">{formatMoney(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {isExchange && detail?.returnedLine ? (
            <section className="mt-4 rounded-[22px] border border-[#9be9e5]/24 bg-[#244f55] p-3">
              <p className="mb-2 text-[9px] uppercase tracking-[0.14em] text-[#cffffd]/65">Visszahozott termék</p>
              <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center">
                <ProductImage src={detail.returnedLine.imageUrl} title={detail.returnedLine.productTitle || "Termék"} large />
                <div className="min-w-0">
                  <p className="text-base text-white">{detail.returnedLine.productTitle || "Ismeretlen termék"}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/72">
                    {detail.returnedLine.brandName ? <span>{detail.returnedLine.brandName}</span> : null}
                    {detail.returnedLine.size ? <span>Méret: {detail.returnedLine.size}</span> : null}
                    {detail.returnedLine.colorName ? <span>Szín: {detail.returnedLine.colorName}</span> : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/45">Visszahozva</p>
                  <p className="mt-1 text-xl text-white">{detail.exchange?.returnedQty || 0} db</p>
                  <p className="mt-1 text-sm text-[#d7fffd]">{formatMoney(detail.exchange?.returnCredit || 0)}</p>
                </div>
              </div>
            </section>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200/30 bg-rose-500/14 px-4 py-3 text-sm text-rose-50">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center gap-3 text-white/58">
              <Loader2 size={22} className="animate-spin text-[#8ee6e2]" /> Eladás részleteinek betöltése…
            </div>
          ) : detail?.lines?.length ? (
            <div className="mt-4 space-y-2">
              {detail.lines.map((line) => {
                const lineDiscount = numberValue(line.discountAmount) > 0.005 || numberValue(line.discountPercent) > 0.005;
                const colorHex = safeColorHex(line.colorHex);
                return (
                  <article
                    key={line.id}
                    className="grid gap-3 rounded-[22px] border border-white/11 bg-[#344154] p-3 sm:grid-cols-[96px_minmax(0,1fr)] lg:grid-cols-[96px_minmax(0,1fr)_270px] lg:items-center"
                  >
                    <ProductImage src={line.imageUrl} title={line.productTitle || "Termékkép"} large />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="min-w-0 text-base leading-snug text-white">{line.productTitle || "Ismeretlen termék"}</h4>
                        {line.brandName ? <span className="rounded-full border border-white/12 bg-black/10 px-2 py-0.5 text-[10px] text-white/68">{line.brandName}</span> : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {line.size ? <span className="rounded-lg border border-white/10 bg-[#293548] px-2.5 py-1.5 text-[11px] text-white/82">Méret: <strong className="font-normal text-white">{line.size}</strong></span> : null}
                        {line.colorName ? (
                          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#293548] px-2.5 py-1.5 text-[11px] text-white/82">
                            <span
                              className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/35"
                              style={{ backgroundColor: colorHex || "transparent" }}
                            />
                            Szín: <strong className="font-normal text-white">{line.colorName}</strong>
                          </span>
                        ) : null}
                        <span className="rounded-lg border border-white/10 bg-[#293548] px-2.5 py-1.5 text-[11px] text-white/82">Darab: <strong className="font-normal text-white">{line.quantity}</strong></span>
                      </div>

                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                        {line.productCode ? (
                          <div className="rounded-xl border border-white/9 bg-[#293548] px-3 py-2">
                            <span className="block text-[9px] uppercase tracking-[0.1em] text-white/42">Termékkód</span>
                            <span className="mt-1 block break-all font-mono text-[12px] text-white/90">{line.productCode}</span>
                          </div>
                        ) : null}
                        {line.barcode ? (
                          <div className="rounded-xl border border-white/9 bg-[#293548] px-3 py-2">
                            <span className="block text-[9px] uppercase tracking-[0.1em] text-white/42">Vonalkód</span>
                            <span className="mt-1 block break-all font-mono text-[12px] text-white/90">{line.barcode}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                      <div className="rounded-2xl border border-[#a9f3ef]/38 bg-[#2a8d8b] px-4 py-3">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-[#dffffd]/72">{numberValue(line.quantity) > 1 ? "Eladási ár / db" : "Eladási ár"}</p>
                        <p className="mt-1 text-xl text-white">{formatMoney(line.unitPrice)}</p>
                      </div>
                      <div className="rounded-2xl border border-[#7bd7d4]/28 bg-[#244f55] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[10px] uppercase tracking-[0.1em] text-[#cffffd]/62">Listaár</span>
                          <span className="text-[13px] text-white/88">{formatMoney(line.listPrice)}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#9be9e5]/18 pt-2">
                          <span className="text-[10px] uppercase tracking-[0.1em] text-[#bff8f5]/78">Kedvezmény</span>
                          <span className={`text-[13px] ${lineDiscount ? "text-white" : "text-white/55"}`}>
                            {lineDiscount
                              ? `${formatMoney(line.discountAmount)}${numberValue(line.discountPercent) > 0.005 ? ` • ${numberValue(line.discountPercent).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%` : ""}`
                              : "Nincs"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !error ? (
            <div className="mt-4 flex min-h-[260px] items-center justify-center rounded-[22px] border border-dashed border-white/12 text-sm text-white/42">
              Ehhez a bizonylathoz nincs részletes terméksor.
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end border-t border-white/12 bg-[#293548] px-4 py-3.5 sm:px-5">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.09]">
            <X size={16} /> Bezárás
          </button>
        </footer>
      </section>
    </div>,
    document.body,
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
  const [stockSummaryOpen, setStockSummaryOpen] = useState(false);
  const [productFilters, setProductFilters] = useState<ProductFilters>(() => emptyProductFilters());

  const [summaryDate, setSummaryDate] = useState(todayIso());
  const [summaryData, setSummaryData] = useState<AifShopDailySummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [salesPanelOpen, setSalesPanelOpen] = useState(false);
  const [customerQuickId, setCustomerQuickId] = useState<string | null>(null);
  const [customerQuickName, setCustomerQuickName] = useState("");
  const [customerQuickYear, setCustomerQuickYear] = useState(new Date().getFullYear());
  const [customerQuickDetail, setCustomerQuickDetail] = useState<AifShopCustomerDetail | null>(null);
  const [customerQuickLoading, setCustomerQuickLoading] = useState(false);
  const [customerQuickError, setCustomerQuickError] = useState("");
  const [selectedDailySale, setSelectedDailySale] = useState<AifShopDailySaleItem | null>(null);
  const [saleDetail, setSaleDetail] = useState<AifShopSaleDetailResponse | null>(null);
  const [saleDetailLoading, setSaleDetailLoading] = useState(false);
  const [saleDetailError, setSaleDetailError] = useState("");
  const [shiftData, setShiftData] = useState<AifShopShiftDayOverview | null>(null);
  const [shiftEmployees, setShiftEmployees] = useState<Array<{ name: string; current?: boolean }>>([]);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverTarget, setHandoverTarget] = useState("");
  const [handoverNote, setHandoverNote] = useState("");
  const [handoverSaving, setHandoverSaving] = useState(false);
  const [handoverNotice, setHandoverNotice] = useState("");
  const [handoverCancelBusyId, setHandoverCancelBusyId] = useState<string | null>(null);

  const [cashData, setCashData] = useState<AifShopCashOverview | null>(null);
  const [cashLoading, setCashLoading] = useState(false);
  const [dayCloseOpen, setDayCloseOpen] = useState(false);
  const [dayCloseCounted, setDayCloseCounted] = useState("");
  const [dayCloseNote, setDayCloseNote] = useState("");
  const [dayCloseSaving, setDayCloseSaving] = useState(false);
  const [dayCloseTodayConfirmed, setDayCloseTodayConfirmed] = useState(false);
  const [cashMoveOpen, setCashMoveOpen] = useState(false);
  const [cashMoveType, setCashMoveType] = useState<AifShopCashMovementType>("manager_handover");
  const [cashMoveAmount, setCashMoveAmount] = useState("");
  const [cashHandoverToDate, setCashHandoverToDate] = useState("");
  const [cashHistoryMonth, setCashHistoryMonth] = useState(() => todayIso().slice(0, 7));
  const [cashMoveReference, setCashMoveReference] = useState("");
  const [cashMoveNote, setCashMoveNote] = useState("");
  const [cashMoveSaving, setCashMoveSaving] = useState(false);
  const [cashCancelBusyId, setCashCancelBusyId] = useState<string | null>(null);

  const paymentMap = useMemo(() => {
    const map = new Map<string, {
      amount: number;
      transactions: number;
      customerPaymentAmount: number;
      customerPaymentTransactions: number;
    }>();
    for (const item of summaryData?.payments || []) {
      map.set(item.method, {
        amount: numberValue(item.amount),
        transactions: numberValue(item.transactions),
        customerPaymentAmount: numberValue(item.customerPaymentAmount),
        customerPaymentTransactions: numberValue(item.customerPaymentTransactions),
      });
    }
    return map;
  }, [summaryData]);

  const currentEmployeeDay = useMemo(
    () => (shiftData?.employees || []).find((item) => employeeKey(item.name) === employeeKey(actor)) || null,
    [actor, shiftData],
  );
  const currentOutgoingHandover = useMemo(
    () => (shiftData?.handovers || []).find((item) => item.status === "pending" && employeeKey(item.fromActor) === employeeKey(actor)) || null,
    [actor, shiftData],
  );
  const currentIncomingHandover = useMemo(
    () => (shiftData?.handovers || []).find((item) => item.status === "pending" && employeeKey(item.toActor) === employeeKey(actor)) || null,
    [actor, shiftData],
  );
  const selectableShiftEmployees = useMemo(
    () => shiftEmployees.filter((item) => employeeKey(item.name) !== employeeKey(actor)),
    [actor, shiftEmployees],
  );
  const summaryIsToday = summaryDate === todayIso();
  const handoverPreview = shiftData?.handoverPreview || null;
  const handoverShiftPreview = handoverPreview?.shift || currentEmployeeDay;
  const handoverExpectedCash = handoverPreview?.expectedCash ?? shiftPayment(shiftData?.totals, "cash").amount;
  const currentCashBalance = numberValue(
    summaryIsToday
      ? (cashData?.balance.availableCash ?? shiftData?.cashBalance?.availableCash ?? handoverExpectedCash)
      : (shiftData?.cashBalance?.availableCash ?? 0),
  );
  const currentDayClosure = summaryIsToday
    ? (shiftData?.dayClosure || cashData?.todayClosure || null)
    : (shiftData?.dayClosure || null);
  const pendingBossHandover = (cashData?.pendingManagerHandovers || [])[0] || null;
  const cashHandoverPlan = cashData?.handoverPlan || null;
  const cashHandoverDays = useMemo(() => {
    const serverDays = cashHandoverPlan?.days || [];
    const hasUsableServerDay = serverDays.some((day) => day.status !== "pending" && numberValue(day.amount) > 0);
    if (hasUsableServerDay || currentCashBalance <= 0) return serverDays;
    return [{
      date: todayIso(),
      amount: currentCashBalance,
      closed: Boolean(currentDayClosure),
      closingCash: currentDayClosure ? numberValue(currentDayClosure.countedCash) : null,
      closedAt: currentDayClosure?.closedAt || null,
      closedBy: currentDayClosure?.actor || null,
      status: "available",
    }];
  }, [cashHandoverPlan?.days, currentCashBalance, currentDayClosure]);
  const selectedCashHandoverDay = cashHandoverDays.find((day) => day.date === cashHandoverToDate) || null;
  const cashHandoverHistory = useMemo(() => {
    const serverHistory = cashData?.managerHandoverHistory || [];
    if (serverHistory.length) return serverHistory;
    return (cashData?.movements || []).filter(
      (item) => item.type === "manager_handover" && historyMonthFromDateTime(item.requestedAt) === cashHistoryMonth,
    );
  }, [cashData?.managerHandoverHistory, cashData?.movements, cashHistoryMonth]);
  const cashHistoryAvailableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const month of cashData?.handoverHistoryMonths || []) {
      if (validHistoryMonth(month)) months.add(month);
    }
    for (const item of cashData?.movements || []) {
      if (item.type !== "manager_handover") continue;
      const month = historyMonthFromDateTime(item.requestedAt);
      if (validHistoryMonth(month)) months.add(month);
    }
    const currentMonth = todayIso().slice(0, 7);
    months.add(currentMonth);
    if (validHistoryMonth(cashHistoryMonth)) months.add(cashHistoryMonth);
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [cashData?.handoverHistoryMonths, cashData?.movements, cashHistoryMonth]);
  const cashHistoryAvailableMonthSet = useMemo(
    () => new Set(cashHistoryAvailableMonths),
    [cashHistoryAvailableMonths],
  );
  const cashHistorySelectedYear = Number(cashHistoryMonth.slice(0, 4)) || Number(todayIso().slice(0, 4));
  const cashHistoryYears = useMemo(
    () => Array.from(new Set(cashHistoryAvailableMonths.map((month) => Number(month.slice(0, 4)))))
      .filter((year) => Number.isFinite(year))
      .sort((a, b) => b - a),
    [cashHistoryAvailableMonths],
  );
  const cashHistoryYearIndex = cashHistoryYears.indexOf(cashHistorySelectedYear);
  const cashHistoryNewerYear = cashHistoryYearIndex > 0 ? cashHistoryYears[cashHistoryYearIndex - 1] : null;
  const cashHistoryOlderYear = cashHistoryYearIndex >= 0 && cashHistoryYearIndex < cashHistoryYears.length - 1
    ? cashHistoryYears[cashHistoryYearIndex + 1]
    : null;
  const dayCloseCountedValue = Number(String(dayCloseCounted || "").replace(",", "."));
  const dayCloseDifference = Number.isFinite(dayCloseCountedValue)
    ? Math.round((dayCloseCountedValue - currentCashBalance + Number.EPSILON) * 100) / 100
    : null;

  const filteredSearchItems = useMemo(
    () => applyProductFilters(searchItems, productFilters),
    [productFilters, searchItems],
  );
  const stockItems = stockData?.items || [];
  const filteredStockItems = useMemo(
    () => applyProductFilters(stockItems, productFilters),
    [productFilters, stockItems],
  );

  function selectCashHistoryPeriod(month: string) {
    if (!validHistoryMonth(month)) return;
    setCashHistoryMonth(month);
    void loadCashContext(month);
  }

  function selectCashHistoryYear(year: number) {
    if (!Number.isFinite(year)) return;
    const sameMonth = `${year}-${cashHistoryMonth.slice(5, 7)}`;
    const candidates = cashHistoryAvailableMonths
      .filter((month) => Number(month.slice(0, 4)) === year)
      .sort((a, b) => b.localeCompare(a));
    const next = candidates.includes(sameMonth) ? sameMonth : candidates[0];
    if (next) selectCashHistoryPeriod(next);
  }

  function toggleProductFilter(key: ProductFilterKey, value: string) {
    setProductFilters((current) => {
      const selected = current[key];
      const exists = selected.some((item) => item.toLocaleLowerCase("hu-HU") === value.toLocaleLowerCase("hu-HU"));
      return {
        ...current,
        [key]: exists
          ? selected.filter((item) => item.toLocaleLowerCase("hu-HU") !== value.toLocaleLowerCase("hu-HU"))
          : [...selected, value],
      };
    });
  }

  function clearProductFilters() {
    setProductFilters(emptyProductFilters());
  }

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
      const response = await apiAifShopSaleCatalog({ location: locationCode, search: query, limit: 5000 });
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
        full: true,
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

  async function loadShiftContext(date = summaryDate) {
    setShiftLoading(true);
    try {
      const [overview, employees] = await Promise.all([
        apiAifShopShiftDayOverview({ location: locationCode, date }),
        date === todayIso()
          ? apiAifShopShiftEmployees({ location: locationCode })
          : Promise.resolve({ items: [] as Array<{ name: string; current?: boolean }> }),
      ]);
      setShiftData(overview);
      setShiftEmployees(employees.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A műszakadatok nem tölthetők be.");
      setShiftData(null);
      setShiftEmployees([]);
    } finally {
      setShiftLoading(false);
    }
  }

  async function loadCashContext(month = cashHistoryMonth) {
    setCashLoading(true);
    try {
      const response = await apiAifShopCashOverview({ location: locationCode, limit: 160, month });
      setCashData(response);
      return response;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kassza naplója nem tölthető be.");
      setCashData(null);
      return null;
    } finally {
      setCashLoading(false);
    }
  }

  async function refreshSummaryPage(date = summaryDate, month = cashHistoryMonth) {
    await Promise.all([loadDailySummary(date), loadShiftContext(date), loadCashContext(month)]);
  }


  function closeCustomerQuickView() {
    setCustomerQuickId(null);
    setCustomerQuickName("");
    setCustomerQuickDetail(null);
    setCustomerQuickError("");
    setCustomerQuickLoading(false);
  }

  async function openCustomerQuickView(customerId: string, customerName = "") {
    const id = String(customerId || "").trim();
    if (!id) return;
    const year = Number(String(summaryDate || "").slice(0, 4)) || new Date().getFullYear();
    setCustomerQuickId(id);
    setCustomerQuickName(customerName);
    setCustomerQuickYear(year);
    setCustomerQuickDetail(null);
    setCustomerQuickError("");
    setCustomerQuickLoading(true);
    try {
      const response = await apiAifGetShopCustomer(id, {
        location: locationCode,
        year,
        salesLimit: 50,
        paymentsLimit: 50,
      });
      setCustomerQuickDetail(response);
    } catch (caught) {
      setCustomerQuickError(caught instanceof Error ? caught.message : "A kliens adatlapja nem tölthető be.");
    } finally {
      setCustomerQuickLoading(false);
    }
  }

  function closeSaleDetail() {
    setSelectedDailySale(null);
    setSaleDetail(null);
    setSaleDetailError("");
    setSaleDetailLoading(false);
  }

  async function openSaleDetail(sale: AifShopDailySaleItem) {
    setSelectedDailySale(sale);
    setSaleDetail(null);
    setSaleDetailError("");
    setSaleDetailLoading(true);
    try {
      const detail = await apiAifShopSaleDetail({
        location: locationCode,
        id: sale.id,
        recordType: sale.recordType || "sale",
      });
      setSaleDetail(detail);
    } catch (caught) {
      setSaleDetailError(caught instanceof Error ? caught.message : "Az eladás részletei nem tölthetők be.");
    } finally {
      setSaleDetailLoading(false);
    }
  }

  async function createShiftHandover() {
    if (!handoverTarget) {
      setError("Válaszd ki, melyik kolléga veszi át a műszakot.");
      return;
    }
    setHandoverSaving(true);
    setError("");
    try {
      const response = await apiAifCreateShopShiftHandover({
        location: locationCode,
        toActor: handoverTarget,
        note: handoverNote.trim() || null,
      });
      setHandoverNotice(`${response.item.toActor} részére elkészült a műszakátadás. Az értékesítés addig zárolt, amíg át nem veszi a kasszát.`);
      setHandoverOpen(false);
      setHandoverTarget("");
      setHandoverNote("");
      await refreshSummaryPage(todayIso());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A műszakátadás létrehozása nem sikerült.");
    } finally {
      setHandoverSaving(false);
    }
  }

  async function cancelShiftHandover(item: AifShopShiftHandover) {
    setHandoverCancelBusyId(item.id);
    setError("");
    try {
      await apiAifCancelShopShiftHandover(item.id);
      setHandoverNotice("A függőben lévő műszakátadást visszavontad. Az értékesítés újra folytatható a saját neveden.");
      await refreshSummaryPage(todayIso());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A műszakátadás visszavonása nem sikerült.");
    } finally {
      setHandoverCancelBusyId(null);
    }
  }

  async function closeShopDay() {
    const counted = Number(String(dayCloseCounted || "").replace(",", "."));
    if (!Number.isFinite(counted) || counted < 0) {
      setError("Add meg a megszámolt záró készpénzt.");
      return;
    }
    setDayCloseSaving(true);
    setError("");
    try {
      const response = await apiAifCloseShopDay({
        location: locationCode,
        countedCash: counted,
        workDate: summaryDate,
        note: dayCloseNote.trim() || null,
      });
      setHandoverNotice(
        `${formatDate(summaryDate)} napi kassza lezárva: ${formatMoney(response.item.countedCash)} • eltérés ${formatMoney(response.item.cashDifference)}.`,
      );
      setDayCloseOpen(false);
      setDayCloseCounted("");
      setDayCloseNote("");
      setDayCloseTodayConfirmed(false);
      await refreshSummaryPage(summaryDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A napi kassza lezárása nem sikerült.");
    } finally {
      setDayCloseSaving(false);
    }
  }

  async function createCashMovement() {
    const bankAmount = Number(String(cashMoveAmount || "").replace(",", "."));

    if (cashMoveType === "manager_handover") {
      if (!selectedCashHandoverDay || !cashHandoverToDate) {
        setError("Válaszd ki, melyik napig adod át a készpénzt.");
        return;
      }
      if (numberValue(selectedCashHandoverDay.amount) <= 0) {
        setError("A kiválasztott napig nincs átadható készpénz.");
        return;
      }
    } else {
      if (!Number.isFinite(bankAmount) || bankAmount <= 0) {
        setError("Add meg a bankba befizetett készpénz összegét.");
        return;
      }
      if (!cashMoveReference.trim()) {
        setError("Bankbefizetésnél a referencia vagy bizonylatszám kötelező.");
        return;
      }
    }

    setCashMoveSaving(true);
    setError("");
    try {
      const response = await apiAifCreateShopCashMovement({
        location: locationCode,
        type: cashMoveType,
        amount: cashMoveType === "bank_deposit" ? bankAmount : undefined,
        handoverToDate: cashMoveType === "manager_handover" ? cashHandoverToDate : null,
        reference: cashMoveType === "bank_deposit" ? (cashMoveReference.trim() || null) : null,
        note: cashMoveNote.trim() || null,
        idempotencyKey: typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `cash-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });
      setHandoverNotice(
        response.item.type === "manager_handover"
          ? `${formatMoney(response.item.amount)} készpénzátadás rögzítve (${response.item.handoverFromDate || "–"} → ${response.item.handoverToDate || "–"}). Átvételre vár.`
          : `${formatMoney(response.item.amount)} bankbefizetés rögzítve (${response.item.reference || "referencia nélkül"}).`,
      );
      setCashMoveOpen(false);
      setCashMoveAmount("");
      setCashHandoverToDate("");
      setCashMoveReference("");
      setCashMoveNote("");
      await refreshSummaryPage(summaryDate, cashHistoryMonth);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kasszamozgás rögzítése nem sikerült.");
    } finally {
      setCashMoveSaving(false);
    }
  }

  async function cancelCashMovement(id: string) {
    setCashCancelBusyId(id);
    setError("");
    try {
      await apiAifCancelShopCashMovement(id);
      setHandoverNotice("Az átvételre váró készpénzátadást visszavontad.");
      await refreshSummaryPage(summaryDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A pénzátadás visszavonása nem sikerült.");
    } finally {
      setCashCancelBusyId(null);
    }
  }

  function openDayClose() {
    setError("");
    setDayCloseCounted(currentCashBalance.toFixed(2).replace(".", ","));
    setDayCloseNote("");
    setDayCloseTodayConfirmed(false);
    setDayCloseOpen(true);
  }

  function selectCashMovementType(
    type: AifShopCashMovementType,
    days = cashHandoverDays,
  ) {
    setCashMoveType(type);
    setCashMoveAmount("");
    setCashMoveReference("");
    if (type === "manager_handover") {
      const selectableDays = (days || []).filter((day) => day.status !== "pending" && numberValue(day.amount) > 0);
      setCashHandoverToDate(selectableDays[selectableDays.length - 1]?.date || "");
    } else {
      setCashHandoverToDate("");
    }
  }

  async function openCashMovement(type: AifShopCashMovementType) {
    setError("");
    setCashMoveNote("");

    if (type === "manager_handover") {
      if (pendingBossHandover) {
        setError("Már van átvételre váró készpénzátadás. Előbb azt kell átvenni vagy visszavonni.");
        return;
      }

      let days = cashHandoverDays;
      const hasSelectableDay = days.some((day) => day.status !== "pending" && numberValue(day.amount) > 0);
      if (!hasSelectableDay) {
        const refreshed = await loadCashContext(cashHistoryMonth);
        const refreshedDays = refreshed?.handoverPlan?.days || [];
        const refreshedHasDay = refreshedDays.some((day) => day.status !== "pending" && numberValue(day.amount) > 0);
        days = refreshedHasDay
          ? refreshedDays
          : currentCashBalance > 0
            ? [{
                date: todayIso(),
                amount: currentCashBalance,
                closed: Boolean(currentDayClosure),
                closingCash: currentDayClosure ? numberValue(currentDayClosure.countedCash) : null,
                closedAt: currentDayClosure?.closedAt || null,
                closedBy: currentDayClosure?.actor || null,
                status: "available",
              }]
            : [];
      }

      if (!days.some((day) => day.status !== "pending" && numberValue(day.amount) > 0)) {
        setError("Nincs átadható készpénz a kasszában.");
        return;
      }

      selectCashMovementType(type, days);
      setCashMoveOpen(true);
      return;
    }

    selectCashMovementType(type);
    setCashMoveOpen(true);
  }

  function openShiftHandover() {
    if (!summaryIsToday) return;
    setError("");
    setHandoverNotice("");
    setHandoverTarget(selectableShiftEmployees[0]?.name || "");
    setHandoverNote("");
    setHandoverOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    setError("");
    setProductFilters(emptyProductFilters());
    setStockSummaryOpen(false);
    setOutstandingOnly(false);
    setSalesPanelOpen(false);
    setCustomerQuickId(null);
    setCustomerQuickName("");
    setCustomerQuickDetail(null);
    setCustomerQuickError("");
    setCustomerQuickLoading(false);
    setSelectedDailySale(null);
    setSaleDetail(null);
    setSaleDetailError("");
    setSaleDetailLoading(false);
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
      const currentMonth = today.slice(0, 7);
      setSummaryDate(today);
      setCashHistoryMonth(currentMonth);
      setHandoverNotice("");
      void refreshSummaryPage(today, currentMonth);
    }
  }, [open, mode, locationCode]);

  useEffect(() => {
    const onShiftChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ locationCode?: string }>).detail;
      if (!open || mode !== "summary") return;
      if (detail?.locationCode && detail.locationCode !== locationCode) return;
      void refreshSummaryPage(summaryDate);
    };
    window.addEventListener("allin:shift-handover-changed", onShiftChanged as EventListener);
    return () => window.removeEventListener("allin:shift-handover-changed", onShiftChanged as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationCode, mode, open, summaryDate]);

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
      if (event.key === "Escape") {
        if (customerQuickId) {
          closeCustomerQuickView();
          return;
        }
        if (selectedDailySale) {
          closeSaleDetail();
          return;
        }
        if (dayCloseOpen && !dayCloseSaving) {
          setDayCloseOpen(false);
          return;
        }
        if (cashMoveOpen && !cashMoveSaving) {
          setCashMoveOpen(false);
          return;
        }
        if (handoverOpen && !handoverSaving) {
          setHandoverOpen(false);
          return;
        }
        onClose();
      }
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
  }, [cashMoveOpen, cashMoveSaving, customerQuickId, dayCloseOpen, dayCloseSaving, handoverOpen, handoverSaving, mode, onClose, open, selectedDailySale]);

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
    salesRevenue: 0,
    collectedTotal: 0,
    customerPaymentTotal: 0,
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
  // Rolling deploy kompatibilitás: ha a frontend egy rövid időre még a régi
  // backenddel beszél, ne mutasson 0 RON-t, hanem essen vissza a régi revenue-ra.
  const daySalesRevenue = numberValue(daySummary.salesRevenue ?? daySummary.revenue);
  const dayCollectedTotal = numberValue(daySummary.collectedTotal ?? daySummary.revenue);
  const dayCustomerPaymentTotal = numberValue(daySummary.customerPaymentTotal);
  const dailyProductLines = summaryData?.productLines?.length
    ? summaryData.productLines
    : (summaryData?.products || []);

  const isOutstandingProductLine = (item: (typeof dailyProductLines)[number]) => {
    const settlement = String(item.recordType || "") === "payment_settlement";
    if (settlement) return false;
    const paymentStatus = String(item.paymentStatus || "").toLowerCase();
    return (
      numberValue(item.balanceDue) > 0.005 ||
      ["unpaid", "partial", "credit"].includes(paymentStatus)
    );
  };

  const visibleDailyProductLines = dailyProductLines.filter((item) =>
    outstandingOnly ? isOutstandingProductLine(item) : !isOutstandingProductLine(item)
  );

  const dailySales = summaryData?.sales || [];
  const visibleDailySales = dailySales.filter((sale) => {
    const outstanding = numberValue(sale.balanceDue) > 0.005;
    return outstandingOnly ? outstanding : !outstanding;
  });

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

        <div className="min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-4">
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

              {searchItems.length ? (
                <TouchFilterBar
                  items={searchItems}
                  filters={productFilters}
                  onToggle={toggleProductFilter}
                  onClear={clearProductFilters}
                />
              ) : null}

              {searchLoading ? (
                <div className="flex min-h-[420px] items-center justify-center gap-3 text-white/55"><Loader2 className="animate-spin" /> Keresés…</div>
              ) : searchItems.length ? (
                filteredSearchItems.length ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {filteredSearchItems.map((item) => (
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
                ) : (
                  <div className="mt-4 flex min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#7bd7d4]/24 bg-[#273243]/45 text-center text-white/52">
                    <Filter size={40} />
                    <p className="mt-3 text-lg text-white/72">A szűréssel nincs találat</p>
                    <button type="button" onClick={clearProductFilters} className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-4 text-sm text-white hover:bg-[#319c99]"><RotateCcw size={17} /> Szűrők törlése</button>
                  </div>
                )
              ) : searchRan ? (
                <div className="mt-4 flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-dashed border-white/14 bg-black/5 text-center text-white/46"><PackageSearch size={42} /><p className="mt-3 text-lg">Nincs találat</p></div>
              ) : (
                <div className="mt-4 flex min-h-[360px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#7bd7d4]/18 bg-[#273243]/45 text-center"><Barcode size={45} className="text-[#8ee6e2]/58" /><p className="mt-3 text-lg text-white/75">Olvasd be a vonalkódot</p></div>
              )}
            </>
          ) : null}

          {mode === "stock" ? (
            <>
              <div className="rounded-[22px] border border-white/14 bg-[#374357]">
                <button
                  type="button"
                  onClick={() => setStockSummaryOpen((current) => !current)}
                  className="flex min-h-14 w-full touch-manipulation items-center justify-between gap-3 rounded-[22px] px-4 py-3 text-left transition hover:bg-white/[0.04] active:scale-[0.995]"
                >
                  <span className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#9be9e5]/35 bg-[#2a8d8b]/20 text-[#d7fffd]"><Boxes size={19} /></span>
                    <span>
                      <span className="block text-sm text-white">Készlet összesítés</span>
                      <span className="mt-0.5 block text-[11px] text-white/45">Termékváltozat, darabszám és készletérték</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2 rounded-xl border border-[#9be9e5]/30 bg-[#2a8d8b] px-3 py-2 text-xs text-white">
                    {stockSummaryOpen ? "Összecsukás" : "Megnyitás"}
                    {stockSummaryOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                  </span>
                </button>
                {stockSummaryOpen ? (
                  <div className="grid gap-3 border-t border-white/10 p-3 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-2xl border border-white/12 bg-[#303a4c] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Termékváltozat</p><p className="mt-2 text-2xl">{stockSummary.variantCount}</p></div>
                    <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/58">Elérhető készlet</p><p className="mt-2 text-2xl text-[#d7fffd]">{stockSummary.availableQty} db</p></div>
                    <div className="rounded-2xl border border-white/12 bg-[#303a4c] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Foglalt</p><p className="mt-2 text-2xl">{stockSummary.reservedQty} db</p></div>
                    <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-[#d7fffd]/58">Eladási érték</p><p className="mt-2 text-2xl text-[#d7fffd]">{formatMoney(stockSummary.retailValue)}</p></div>
                    <div className={`rounded-2xl border p-3 ${stockSummary.lowStockVariants > 0 ? "border-red-300/55 bg-red-600/25" : "border-white/12 bg-[#303a4c]"}`}><p className="text-[9px] uppercase tracking-[0.1em] text-white/52">Alacsony készlet</p><p className="mt-2 text-2xl">{stockSummary.lowStockVariants}</p></div>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8ee6e2]" size={20} /><input value={stockQuery} onChange={(event) => setStockQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadStock(event.currentTarget.value); }} placeholder="Keresés vonalkód, név, kód, szín vagy méret alapján…" className="h-14 w-full rounded-2xl border border-white/18 bg-[#273243] pl-12 pr-4 text-base text-white outline-none placeholder:text-white/40 focus:border-[#72d8d4]" /></label>
                <button type="button" onClick={() => void loadStock()} disabled={stockLoading} className="inline-flex h-14 min-w-[150px] items-center justify-center gap-2 rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-5 text-sm hover:bg-[#319c99] disabled:opacity-55">{stockLoading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />} Keresés</button>
              </div>

              {stockItems.length ? (
                <>
                  <TouchFilterBar
                    items={stockItems}
                    filters={productFilters}
                    onToggle={toggleProductFilter}
                    onClear={clearProductFilters}
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-white/52">
                    <span>
                      <strong className="font-normal text-[#d7fffd]">{filteredStockItems.length}</strong>
                      {stockQuery.trim() ? " találat" : " készletes variáns"}
                      {filteredStockItems.length !== stockItems.length ? ` • ${stockItems.length} betöltött találatból` : ""}
                    </span>
                    <span>
                      Teljes eladható üzleti készlet: <strong className="font-normal text-white">{stockSummary.variantCount} variáns</strong>
                    </span>
                  </div>
                  {!stockQuery.trim() && stockData?.complete === true && stockItems.length !== numberValue(stockSummary.variantCount) ? (
                    <div className="mt-2 rounded-xl border border-red-300/45 bg-red-600/18 px-3 py-2 text-xs text-red-50">
                      Figyelem: a szerver {stockSummary.variantCount} készletes variánst jelez, de csak {stockItems.length} érkezett vissza. A lista nem teljes.
                    </div>
                  ) : null}
                </>
              ) : null}

              {stockLoading && !stockData ? <div className="flex min-h-[380px] items-center justify-center gap-3 text-white/55"><Loader2 className="animate-spin" /> Készlet betöltése…</div> : (
                <div className="mt-4 grid gap-2 lg:grid-cols-2">
                  {filteredStockItems.map((item) => (
                    <article key={item.variantId} className={`grid grid-cols-[80px_1fr_auto] items-center gap-3 rounded-[20px] border p-3 ${item.lowStock ? "border-red-300/48 bg-red-950/18" : "border-white/13 bg-[#374357]"}`}>
                      <ProductImage src={item.imageUrl} title={item.title} />
                      <div className="min-w-0"><h3 className="truncate text-base">{item.title}</h3><p className="mt-1 truncate text-xs text-white/50">{[item.brandName, item.subcategoryName || item.categoryName, item.colorName, item.size].filter(Boolean).join(" • ")}</p><p className="mt-2 text-[11px] text-white/48">{productCode(item)}{item.barcode ? ` • ${item.barcode}` : ""}</p><p className="mt-2 text-sm text-[#d7fffd]">{formatMoney(item.sellPrice)}</p></div>
                      <div className="text-right"><span className={`inline-flex min-w-[78px] justify-center rounded-xl border px-3 py-2 text-lg ${item.lowStock ? "border-red-300/60 bg-red-600 text-white" : "border-[#9be9e5]/40 bg-[#2a8d8b]/24 text-[#d7fffd]"}`}>{item.availableQty} db</span>{item.reservedQty > 0 ? <p className="mt-2 text-[10px] text-white/45">Foglalt: {item.reservedQty}</p> : null}</div>
                    </article>
                  ))}
                  {!stockLoading && !stockItems.length ? <div className="col-span-full flex min-h-[260px] items-center justify-center rounded-[22px] border border-dashed border-white/14 text-white/45">Nincs találat.</div> : null}
                  {!stockLoading && stockItems.length > 0 && !filteredStockItems.length ? (
                    <div className="col-span-full flex min-h-[260px] flex-col items-center justify-center rounded-[22px] border border-dashed border-[#7bd7d4]/24 bg-[#273243]/45 text-white/52">
                      <Filter size={38} />
                      <p className="mt-3 text-base text-white/72">A szűréssel nincs találat</p>
                      <button type="button" onClick={clearProductFilters} className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-4 text-sm text-white hover:bg-[#319c99]"><RotateCcw size={17} /> Szűrők törlése</button>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : null}

          {mode === "summary" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-white/14 bg-[#374357] p-3">
                <div className="flex items-center gap-3"><Store size={20} className="text-[#8ee6e2]" /><div><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Eladó</p><p className="mt-1 text-base">{actor}</p></div></div>
                <div className="grid grid-cols-[58px_minmax(160px,1fr)_58px_auto] overflow-hidden rounded-2xl border border-white/16 bg-[#273243]">
                  <button type="button" onClick={() => { const next = shiftIsoDate(summaryDate, -1); setSummaryDate(next); setHandoverNotice(""); void refreshSummaryPage(next); }} className="inline-flex h-14 items-center justify-center border-r border-white/12 hover:bg-white/[0.08]"><ArrowLeft size={22} /></button>
                  <div className="flex h-14 items-center justify-center px-4 text-base tabular-nums">{formatDate(summaryDate)}</div>
                  <button type="button" onClick={() => { const next = shiftIsoDate(summaryDate, 1); setSummaryDate(next); setHandoverNotice(""); void refreshSummaryPage(next); }} className="inline-flex h-14 items-center justify-center border-l border-white/12 hover:bg-white/[0.08]"><ArrowRight size={22} /></button>
                  <button type="button" onClick={() => { const next = todayIso(); setSummaryDate(next); setHandoverNotice(""); void refreshSummaryPage(next); }} className="h-14 border-l border-white/12 px-4 text-sm text-[#d7fffd] hover:bg-[#2a8d8b]/20">Ma</button>
                </div>
                <button type="button" onClick={() => void refreshSummaryPage()} disabled={summaryLoading || shiftLoading || cashLoading} className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/16 bg-[#354153] px-4 text-sm hover:bg-[#3e4d63] disabled:opacity-55"><RefreshCw className={summaryLoading || shiftLoading || cashLoading ? "animate-spin" : ""} size={17} /> Frissítés</button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-[#9be9e5]/45 bg-[#2a8d8b] p-4 shadow-[0_10px_26px_rgba(42,141,139,0.20)] xl:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/70">Napi befolyt összeg</p>
                    <span className="rounded-full border border-white/20 bg-black/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.08em] text-white/68">Tényleges pénzmozgás</span>
                  </div>
                  <p className="mt-2 text-4xl tracking-tight">{formatMoney(dayCollectedTotal)}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/16 pt-2 text-[10px] text-white/72">
                    <span>Mai eladási forgalom: <strong className="font-normal text-white">{formatMoney(daySalesRevenue)}</strong></span>
                    <span>Tartozásrendezés: <strong className="font-normal text-white">{formatMoney(dayCustomerPaymentTotal)}</strong></span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Eladások</p><p className="mt-2 text-3xl">{daySummary.transactions}</p></div>
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-white/45">Eladott darab</p><p className="mt-2 text-3xl">{daySummary.itemsSold}</p></div>
                <button
                  type="button"
                  onClick={() => setOutstandingOnly((current) => !current)}
                  className={`relative overflow-hidden rounded-2xl border border-[#ff9aa4]/85 bg-[#E21C2A] p-4 text-left text-white shadow-[0_10px_26px_rgba(226,28,42,0.28)] transition hover:bg-[#C91522] active:scale-[0.99] ${
                    outstandingOnly ? "ring-2 ring-white/70 ring-offset-2 ring-offset-[#303a4c]" : ""
                  }`}
                  aria-pressed={outstandingOnly}
                  title={outstandingOnly ? "Vissza a normál nézethez" : "Kintlévőséges termékek megjelenítése"}
                >
                  <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/82">Kintlévőség</p>
                    <WalletCards size={17} className="text-white" />
                  </div>
                  <p className="mt-2 text-2xl">{formatMoney(daySummary.unpaidTotal)}</p>
                  <p className="mt-1.5 text-[10px] text-white/76">
                    {outstandingOnly ? "Kintlévőség nézet aktív • kattints vissza" : "Kattints a nyitott tételekhez"}
                  </p>
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {PAYMENT_META.map((item) => {
                  const Icon = item.icon;
                  const payment = paymentMap.get(item.method) || {
                    amount: 0,
                    transactions: 0,
                    customerPaymentAmount: 0,
                    customerPaymentTransactions: 0,
                  };
                  return (
                    <div key={item.method} className="rounded-2xl border border-white/12 bg-[#374357] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-xs text-white/58"><Icon size={16} className="text-[#8ee6e2]" />{item.label}</span>
                        <span className="text-[10px] text-white/38">{payment.transactions} {item.method === "credit" ? "hitel" : "fizetés"}</span>
                      </div>
                      <p className="mt-2 text-xl">{formatMoney(payment.amount)}</p>
                      {item.method !== "credit" && payment.customerPaymentAmount > 0.005 ? (
                        <p className="mt-1.5 text-[10px] text-[#bdf8f5]/72">
                          ebből tartozásrendezés: {formatMoney(payment.customerPaymentAmount)} • {payment.customerPaymentTransactions} befizetés
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <section className="mt-4 overflow-hidden rounded-[26px] border border-[#9be9e5]/28 bg-[#2d394b] shadow-[0_16px_38px_rgba(15,23,42,0.20)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#304257] to-[#315a5d] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#9be9e5]/32 bg-[#2a8d8b]/24 text-[#d7fffd]"><Banknote size={21} /></span>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-white/50">Fizikai készpénz útja</p>
                      <h3 className="mt-1 text-lg text-white">Kassza és pénzátadás</h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-white/38">Rendszer szerint az üzletben</p>
                    <p className="mt-1 text-2xl tracking-tight text-[#d7fffd]">{formatMoney(currentCashBalance)}</p>
                  </div>
                </div>

                <div className="p-4">
                  {currentDayClosure ? (
                    <div className="mb-2 grid min-h-[46px] grid-cols-[44px_minmax(150px,1fr)_180px_88px_160px_130px] items-stretch overflow-hidden rounded-xl border border-white/58 bg-[#E21C2A] text-white shadow-[0_8px_20px_rgba(226,28,42,0.20)]">
                      <span className="flex items-center justify-center border-r border-white/30 bg-black/8">
                        <LockKeyhole size={17} />
                      </span>
                      <div className="flex min-w-0 items-center px-3">
                        <span className="truncate text-[13px] text-white">A mai kassza le van zárva</span>
                      </div>
                      <div className="flex min-w-0 items-center border-l border-white/28 px-3">
                        <span className="truncate text-[11px] text-white/92">{currentDayClosure.actor}</span>
                      </div>
                      <div className="flex items-center justify-center border-l border-white/28 px-2 text-[11px] tabular-nums text-white">
                        {formatTime(currentDayClosure.closedAt)}
                      </div>
                      <div className="flex items-center justify-end border-l border-white/28 px-3 text-[11px] tabular-nums text-white">
                        {formatMoney(currentDayClosure.countedCash)}
                      </div>
                      <div className="flex items-center justify-end border-l border-white/28 px-3 text-[11px] tabular-nums text-white">
                        Eltérés&nbsp; {formatMoney(currentDayClosure.cashDifference)}
                      </div>
                    </div>
                  ) : null}

                  {pendingBossHandover ? (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200/30 bg-orange-500/10 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Clock3 className="mt-0.5 shrink-0 text-orange-100" size={18} />
                        <div>
                          <p className="text-sm text-orange-50">Készpénzátadás átvételre vár: {formatMoney(pendingBossHandover.amount)}</p>
                          <p className="mt-1 text-xs text-white/48">{pendingBossHandover.requestedBy} rögzítette • {formatTime(pendingBossHandover.requestedAt)}</p>
                          {(pendingBossHandover.handoverFromDate || pendingBossHandover.handoverToDate) ? (
                            <p className="mt-1 text-[11px] text-[#fff4a5]/78">Időszak: {pendingBossHandover.handoverFromDate || pendingBossHandover.handoverToDate} → {pendingBossHandover.handoverToDate || pendingBossHandover.handoverFromDate}</p>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void cancelCashMovement(pendingBossHandover.id)}
                        disabled={cashCancelBusyId === pendingBossHandover.id}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-orange-200/24 bg-orange-300/10 px-3 text-xs text-orange-50 hover:bg-orange-300/16 disabled:opacity-45"
                      >
                        {cashCancelBusyId === pendingBossHandover.id ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                        Visszavonás
                      </button>
                    </div>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-[22px] border border-[#9be9e5]/22 bg-[#263345] p-4">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/10 bg-[#303c4f] p-3">
                          <p className="text-[9px] uppercase tracking-[0.08em] text-white/36">Jelenlegi kassza</p>
                          <p className="mt-1 text-lg text-[#d7fffd]">{formatMoney(currentCashBalance)}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-[#303c4f] p-3">
                          <p className="text-[9px] uppercase tracking-[0.08em] text-white/36">Átvételre vár</p>
                          <p className="mt-1 text-lg text-orange-50">{formatMoney(cashData?.balance.pendingOut || 0)}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-[#303c4f] p-3">
                          <p className="text-[9px] uppercase tracking-[0.08em] text-white/36">Utolsó zárás</p>
                          <p className="mt-1 truncate text-sm text-white">{cashData?.closures?.[0] ? `${cashData.closures[0].date || ""} • ${formatMoney(cashData.closures[0].countedCash)}` : "Még nincs"}</p>
                        </div>
                      </div>

                      {summaryIsToday ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <button
                            type="button"
                            onClick={() => void openCashMovement("manager_handover")}
                            disabled={Boolean(pendingBossHandover) || currentCashBalance <= 0 || cashLoading}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#ffe66b] bg-[#fed700] px-3 text-sm text-[#243044] shadow-[0_8px_20px_rgba(254,215,0,0.18)] hover:bg-[#eac600] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <WalletCards size={17} /> Készpénz átadása
                          </button>
                          <button
                            type="button"
                            onClick={() => void openCashMovement("bank_deposit")}
                            disabled={currentCashBalance <= 0}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#9be9e5]/34 bg-[#2a8d8b]/18 px-3 text-sm text-[#d7fffd] hover:bg-[#2a8d8b]/28 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Landmark size={17} /> Bankba befizetés
                          </button>
                          <button
                            type="button"
                            onClick={openDayClose}
                            disabled={Boolean(currentDayClosure) || Boolean(currentOutgoingHandover) || Boolean(currentIncomingHandover)}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#b9f5f2]/48 bg-[#2a8d8b] px-3 text-sm text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <LockKeyhole size={17} /> Napi kassza lezárása
                          </button>
                        </div>
                      ) : null}

                      {!summaryIsToday && summaryDate <= todayIso() && !currentDayClosure ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={openDayClose}
                            disabled={Boolean(currentOutgoingHandover) || Boolean(currentIncomingHandover)}
                            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#b9f5f2]/48 bg-[#2a8d8b] px-4 text-sm text-white shadow-[0_8px_20px_rgba(42,141,139,0.18)] hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <LockKeyhole size={17} />
                            {formatDate(summaryDate)} napi kassza lezárása
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-[22px] border border-white/12 bg-[#344055] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Auditnapló</p>
                          <h4 className="mt-1 text-base text-white">Legutóbbi pénzmozgások</h4>
                        </div>
                        <History size={20} className="text-[#8ee6e2]" />
                      </div>
                      <div className="mt-3 space-y-2">
                        {(cashData?.movements || []).slice(0, 8).map((movement) => (
                          <div key={movement.id} className={`rounded-xl border px-3 py-2.5 ${
                            movement.status === "pending"
                              ? "border-orange-200/24 bg-orange-500/8"
                              : movement.status === "confirmed"
                                ? "border-emerald-200/16 bg-emerald-500/7"
                                : "border-white/10 bg-[#293548]"
                          }`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-xs text-white">{movement.type === "manager_handover" ? "Készpénz átadása" : "Bankbefizetés"}</p>
                                <p className="mt-1 truncate text-[10px] text-white/42">{movement.requestedBy} • {formatTime(movement.requestedAt)}{movement.reference ? ` • ${movement.reference}` : ""}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-sm text-white">{formatMoney(movement.amount)}</p>
                                <p className={`mt-1 text-[9px] ${movement.status === "confirmed" ? "text-emerald-100" : movement.status === "pending" ? "text-orange-100" : "text-white/45"}`}>
                                  {movement.status === "confirmed" ? "Visszaigazolva" : movement.status === "pending" ? "Visszaigazolásra vár" : movement.status}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {!cashLoading && !(cashData?.movements || []).length ? (
                          <div className="rounded-xl border border-dashed border-white/12 px-3 py-7 text-center text-xs text-white/40">Még nincs készpénzátadás vagy bankbefizetés.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="mt-4 overflow-hidden rounded-[26px] border border-[#ffe66b]/35 bg-[#2d394b] shadow-[0_16px_38px_rgba(15,23,42,0.20)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#303a4c] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#ffe66b]/55 bg-[#fed700] text-[#243044]"><History size={20} /></span>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-white/50">Üzleti átadási előzmények</p>
                      <h3 className="mt-1 text-lg text-white">Készpénzátadások</h3>
                    </div>
                  </div>
                  <div className="w-full rounded-2xl border border-[#ffe66b]/18 bg-[#273243] p-2.5 sm:w-auto sm:min-w-[430px]">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={!cashHistoryOlderYear}
                        onClick={() => cashHistoryOlderYear && selectCashHistoryYear(cashHistoryOlderYear)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/70 transition hover:border-[#ffe66b]/35 hover:bg-[#fed700]/10 disabled:cursor-not-allowed disabled:opacity-25"
                        aria-label="Régebbi év"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <div className="text-center">
                        <p className="text-[9px] uppercase tracking-[0.14em] text-white/38">Átadási history</p>
                        <p className="mt-0.5 text-sm text-white">{cashHistorySelectedYear}</p>
                      </div>
                      <button
                        type="button"
                        disabled={!cashHistoryNewerYear}
                        onClick={() => cashHistoryNewerYear && selectCashHistoryYear(cashHistoryNewerYear)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] text-white/70 transition hover:border-[#ffe66b]/35 hover:bg-[#fed700]/10 disabled:cursor-not-allowed disabled:opacity-25"
                        aria-label="Újabb év"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-6 gap-1">
                      {CASH_HISTORY_MONTHS.map((_, index) => {
                        const month = `${cashHistorySelectedYear}-${String(index + 1).padStart(2, "0")}`;
                        const enabled = cashHistoryAvailableMonthSet.has(month);
                        const selected = cashHistoryMonth === month;
                        return (
                          <button
                            key={month}
                            type="button"
                            disabled={!enabled}
                            onClick={() => selectCashHistoryPeriod(month)}
                            className={`h-8 rounded-lg border px-1 text-[10px] transition ${
                              selected
                                ? "border-[#ffe66b] bg-[#fed700] text-[#243044]"
                                : enabled
                                  ? "border-white/10 bg-white/[0.04] text-white/68 hover:border-[#ffe66b]/30 hover:bg-[#fed700]/10 hover:text-white"
                                  : "border-transparent bg-transparent text-white/18"
                            } disabled:cursor-default`}
                          >
                            {CASH_HISTORY_MONTHS_SHORT[index]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 p-3 lg:grid-cols-2">
                  {cashHandoverHistory.map((movement) => {
                    const confirmed = movement.status === "confirmed";
                    const pending = movement.status === "pending";
                    return (
                      <article key={`handover-history-${movement.id}`} className={`rounded-2xl border p-3 ${
                        pending
                          ? "border-[#ffe66b]/35 bg-[#fed700]/[0.07]"
                          : confirmed
                            ? "border-emerald-200/18 bg-emerald-500/[0.06]"
                            : "border-white/10 bg-[#303a4c]"
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2 py-1 text-[9px] ${
                                confirmed
                                  ? "border-emerald-200/24 bg-emerald-500/10 text-emerald-50"
                                  : pending
                                    ? "border-[#ffe66b]/45 bg-[#fed700]/12 text-[#fff4a5]"
                                    : "border-white/12 bg-white/[0.04] text-white/55"
                              }`}>
                                {confirmed ? "Átvéve" : pending ? "Átvételre vár" : movement.status === "cancelled" ? "Visszavonva" : movement.status === "rejected" ? "Elutasítva" : movement.status}
                              </span>
                              <span className="text-[10px] text-white/42">
                                {(movement.handoverFromDate || movement.handoverToDate)
                                  ? `${movement.handoverFromDate || movement.handoverToDate} → ${movement.handoverToDate || movement.handoverFromDate}`
                                  : formatDate(String(movement.requestedAt || "").slice(0, 10))}
                              </span>
                            </div>
                            <p className="mt-2 text-[11px] text-white/58">
                              Átadó: <span className="text-white/82">{movement.requestedBy || "–"}</span>
                              {" • "}
                              Rögzítve: {movement.requestedAt ? formatExactDateTime(movement.requestedAt) : "–"}
                            </p>
                            {movement.confirmedAt ? (
                              <p className="mt-1 text-[11px] text-emerald-100/70">Átvéve: {formatExactDateTime(movement.confirmedAt)}</p>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xl text-white">{formatMoney(movement.amount)}</p>
                            <p className="mt-1 text-[9px] text-white/36">{movement.coveredDayCount || 1} nap</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {!cashLoading && !cashHandoverHistory.length ? (
                    <div className="lg:col-span-2 rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/42">
                      {monthLabel(cashHistoryMonth)} hónapban nincs készpénzátadás.
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="mt-4 overflow-hidden rounded-[26px] border border-[#9be9e5]/28 bg-[#2d394b] shadow-[0_16px_38px_rgba(15,23,42,0.20)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#23464e] to-[#2a6266] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#9be9e5]/32 bg-[#2a8d8b]/24 text-[#d7fffd]"><ArrowRightLeft size={21} /></span>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-white/50">Üzleti nap • több váltás</p>
                      <h3 className="mt-1 text-lg text-white">Műszakok és kasszaátadás</h3>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/14 bg-black/10 px-3 py-1.5 text-[11px] text-white/58">
                      {shiftData?.handovers.filter((item) => item.status === "accepted").length || 0} lezárt átadás
                    </span>
                    {summaryIsToday && !currentOutgoingHandover && !currentIncomingHandover ? (
                      <button
                        type="button"
                        onClick={openShiftHandover}
                        disabled={shiftLoading || selectableShiftEmployees.length === 0 || handoverPreview?.canCreate === false}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#b9f5f2]/52 bg-[#2a8d8b] px-4 text-sm text-white shadow-[0_8px_20px_rgba(42,141,139,0.22)] hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <ArrowRightLeft size={17} /> Műszak átadása
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="p-4">
                  {handoverNotice ? (
                    <div className="mb-3 flex items-start gap-3 rounded-2xl border border-[#9be9e5]/35 bg-[#2a8d8b]/16 px-4 py-3 text-sm text-[#e6fffd]">
                      <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
                      <span>{handoverNotice}</span>
                    </div>
                  ) : null}

                  {currentOutgoingHandover ? (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/32 bg-amber-400/10 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Clock3 className="mt-0.5 shrink-0 text-amber-100" size={19} />
                        <div>
                          <p className="text-sm text-amber-50">Átadás vár {currentOutgoingHandover.toActor} átvételére</p>
                          <p className="mt-1 text-xs text-white/52">A pillanatkép {formatTime(currentOutgoingHandover.cutoffAt)}-kor lezárult. Addig új eladás nem rögzíthető a saját neveden.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void cancelShiftHandover(currentOutgoingHandover)}
                        disabled={handoverCancelBusyId === currentOutgoingHandover.id}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-100/30 bg-amber-300/12 px-3 text-xs text-amber-50 hover:bg-amber-300/18 disabled:opacity-50"
                      >
                        {handoverCancelBusyId === currentOutgoingHandover.id ? <Loader2 className="animate-spin" size={15} /> : <RotateCcw size={15} />}
                        Átadás visszavonása
                      </button>
                    </div>
                  ) : null}

                  {currentIncomingHandover ? (
                    <div className="mb-3 flex items-start gap-3 rounded-2xl border border-[#9be9e5]/42 bg-[#2a8d8b]/18 px-4 py-3">
                      <UserCheck className="mt-0.5 shrink-0 text-[#cffffd]" size={19} />
                      <div>
                        <p className="text-sm text-white">{currentIncomingHandover.fromActor} műszakátadása rád vár.</p>
                        <p className="mt-1 text-xs text-white/55">A kassza átvételét a belépéskor megjelenő átadási ablakban kell jóváhagyni.</p>
                      </div>
                    </div>
                  ) : null}

                  {summaryIsToday &&
                  handoverPreview?.canCreate === false &&
                  !currentOutgoingHandover &&
                  !currentIncomingHandover &&
                  handoverPreview.reason &&
                  !currentDayClosure &&
                  !String(handoverPreview.reason).toLocaleLowerCase("hu-HU").includes("lezár") ? (
                    <div className="mb-3 flex items-center gap-3 rounded-xl border border-amber-200/28 bg-amber-400/8 px-3 py-2.5 text-amber-50">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-100/20 bg-amber-300/10 text-amber-100">
                        <TriangleAlert size={17} />
                      </span>
                      <p className="text-[12px] leading-relaxed text-amber-50/88">{handoverPreview.reason}</p>
                    </div>
                  ) : null}

                  <div className="grid gap-3 xl:grid-cols-[1.25fr_1fr]">
                    <div className="rounded-[22px] border border-[#9be9e5]/24 bg-[#263345] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.13em] text-[#bdf8f5]/55">Teljes üzleti nap</p>
                          <p className="mt-1 text-sm text-white/55">Minden dolgozó együtt • {formatDate(summaryDate)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] uppercase tracking-[0.12em] text-white/38">Napi befolyt összeg</p>
                          <p className="mt-1 text-3xl tracking-tight text-[#d7fffd]">{formatMoney(shiftCollectedTotal(shiftData?.totals))}</p>
                          <p className="mt-1 text-[9px] text-white/38">
                            Eladás {formatMoney(shiftData?.totals.revenue || 0)} • Tartozásrendezés {formatMoney(shiftCustomerPaymentTotal(shiftData?.totals))}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {PAYMENT_META.map((metaItem) => {
                          const Icon = metaItem.icon;
                          const payment = shiftPayment(shiftData?.totals, metaItem.method);
                          return (
                            <div key={metaItem.method} className="rounded-2xl border border-white/10 bg-[#303c4f] p-3">
                              <div className="flex items-center gap-2 text-[11px] text-white/52"><Icon size={15} className="text-[#8ee6e2]" />{metaItem.label}</div>
                              <p className="mt-2 text-lg text-white">{formatMoney(payment.amount)}</p>
                              {payment.customerPaymentAmount > 0 ? <p className="mt-1 text-[9px] text-white/38">ebből tartozás befizetés: {formatMoney(payment.customerPaymentAmount)}</p> : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-white/12 bg-[#344055] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Saját napi eredmény</p>
                          <p className="mt-1 text-base text-white">{actor}</p>
                        </div>
                        <UserRound size={22} className="text-[#8ee6e2]" />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-white/10 bg-black/10 p-2.5">
                          <p className="text-[9px] text-white/38">Befolyt összeg</p>
                          <p className="mt-1 text-sm text-[#d7fffd]">{formatMoney(shiftCollectedTotal(currentEmployeeDay))}</p>
                          {shiftCustomerPaymentTotal(currentEmployeeDay) > 0.005 ? (
                            <p className="mt-1 text-[8px] text-[#bdf8f5]/60">ebből tartozás {formatMoney(shiftCustomerPaymentTotal(currentEmployeeDay))}</p>
                          ) : null}
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/10 p-2.5"><p className="text-[9px] text-white/38">Eladás</p><p className="mt-1 text-sm">{currentEmployeeDay?.transactions || 0}</p></div>
                        <div className="rounded-xl border border-white/10 bg-black/10 p-2.5"><p className="text-[9px] text-white/38">Darab</p><p className="mt-1 text-sm">{currentEmployeeDay?.itemsSold || 0}</p></div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"><p className="text-[9px] text-white/38">Készpénz</p><p className="mt-1 text-sm">{formatMoney(shiftPayment(currentEmployeeDay, "cash").amount)}</p></div>
                        <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"><p className="text-[9px] text-white/38">Bankkártya</p><p className="mt-1 text-sm">{formatMoney(shiftPayment(currentEmployeeDay, "card").amount)}</p></div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    <div className="rounded-[20px] border border-white/12 bg-[#344055] p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[9px] uppercase tracking-[0.13em] text-white/42">Dolgozónként külön</p>
                          <h4 className="mt-1 text-lg text-white">Napi árulás</h4>
                        </div>
                        <UsersRound size={22} className="text-[#8ee6e2]" />
                      </div>
                      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2.5">
                        {(shiftData?.employees || []).map((employee) => {
                          const active = employeeKey(employee.name) === employeeKey(actor);
                          return (
                            <div key={employee.name} className={`rounded-2xl border p-3.5 ${active ? "border-[#9be9e5]/42 bg-[#2a8d8b]/16" : "border-white/10 bg-[#293548]"}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-base text-white">{employee.name}</p>
                                  <p className="mt-1 text-[11px] text-white/48">{employee.transactions} eladás • {employee.itemsSold} db</p>
                                </div>
                                {active ? <span className="rounded-full border border-[#9be9e5]/32 bg-[#2a8d8b] px-2.5 py-1 text-[10px] text-white">Te</span> : null}
                              </div>
                              <p className="mt-3 text-2xl tracking-tight text-[#d7fffd]">{formatMoney(shiftCollectedTotal(employee))}</p>
                              <p className="mt-1 text-[9px] uppercase tracking-[0.08em] text-white/32">Befolyt összeg</p>
                              <p className="mt-1 text-[9px] text-white/36">
                                Eladás {formatMoney(employee.revenue)}{shiftCustomerPaymentTotal(employee) > 0.005 ? ` • tartozás ${formatMoney(shiftCustomerPaymentTotal(employee))}` : ""}
                              </p>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                                  <p className="text-white/40">Készpénz</p>
                                  <p className="mt-1 text-sm text-white">{formatMoney(shiftPayment(employee, "cash").amount)}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                                  <p className="text-white/40">Bankkártya</p>
                                  <p className="mt-1 text-sm text-white">{formatMoney(shiftPayment(employee, "card").amount)}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {!shiftLoading && !(shiftData?.employees || []).length ? <div className="col-span-full rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/40">Ezen a napon még nincs dolgozóhoz kötött forgalom.</div> : null}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-white/12 bg-[#344055] p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[9px] uppercase tracking-[0.13em] text-white/42">Visszanézhető napló</p>
                          <h4 className="mt-1 text-lg text-white">Műszakátadások</h4>
                        </div>
                        <span className="rounded-full border border-white/12 bg-black/10 px-3 py-1.5 text-[11px] text-white/58">{shiftData?.handovers.length || 0} átadás</span>
                      </div>
                      <div className="mt-3 space-y-2.5">
                        {(shiftData?.handovers || []).map((item, index) => {
                          const accepted = item.status === "accepted";
                          const pending = item.status === "pending";
                          return (
                            <div key={item.id} className={`rounded-2xl border p-3.5 ${pending ? "border-amber-200/30 bg-amber-400/8" : accepted ? "border-[#9be9e5]/28 bg-[#2a8d8b]/10" : "border-white/10 bg-[#293548]"}`}>
                              <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="truncate text-base text-white">{index + 1}. {item.fromActor} <ArrowRight className="mx-1.5 inline" size={15} /> {item.toActor}</p>
                                  <p className="mt-1 text-[11px] text-white/46">{formatTime(item.shiftStartAt)} → {formatTime(item.cutoffAt)}</p>
                                </div>
                                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] ${pending ? "border-amber-200/30 bg-amber-300/12 text-amber-50" : accepted ? "border-[#9be9e5]/30 bg-[#2a8d8b] text-white" : "border-white/12 bg-black/10 text-white/50"}`}>{shiftStatusLabel(item.status)}</span>
                              </div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                                {[
                                  ["Műszak befolyt", formatMoney(shiftCollectedTotal(item.snapshot?.shift))],
                                  ["Műszak KP", formatMoney(shiftPayment(item.snapshot?.shift, "cash").amount)],
                                  ["Műszak kártya", formatMoney(shiftPayment(item.snapshot?.shift, "card").amount)],
                                  ["Átadandó KP", formatMoney(item.expectedCash)],
                                  ["Megszámolva", item.countedCash == null ? "–" : formatMoney(item.countedCash)],
                                  ["Eltérés", item.cashDifference == null ? "–" : formatMoney(item.cashDifference)],
                                ].map(([label, value], metricIndex) => (
                                  <div key={`${item.id}-${metricIndex}`} className="rounded-xl border border-white/9 bg-black/10 px-3 py-2.5">
                                    <p className="text-[9px] uppercase tracking-[0.06em] text-white/38">{label}</p>
                                    <p className={`mt-1.5 text-sm ${label === "Eltérés" && numberValue(item.cashDifference) !== 0 ? "text-red-100" : label === "Eltérés" ? "text-[#bdf8f5]" : "text-white"}`}>{value}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {!shiftLoading && !(shiftData?.handovers || []).length ? <div className="rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/40">Ezen a napon még nem volt műszakátadás.</div> : null}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className={`mt-3 grid gap-2.5 ${salesPanelOpen ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.48fr)]" : "xl:grid-cols-[minmax(0,1fr)_52px]"}`}>
                <section className="rounded-[22px] bg-[#344055]/72 p-3 shadow-[0_10px_30px_rgba(15,23,42,0.16)]">
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/8 px-1 pb-2.5">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[#9be9e5]/62">Mit adtam el / mit fizettek ki?</p>
                      <h3 className="mt-1 text-[19px] text-white">
                        {outstandingOnly ? "Kintlévőséges termékek" : "Termékek és későbbi kifizetések"}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-white/42">{visibleDailyProductLines.length} eseménysor</span>
                      {daySummary.unpaidSales > 0 ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E21C2A] px-2.5 py-1 text-[10px] text-white shadow-[0_4px_12px_rgba(226,28,42,0.18)]">
                          <TriangleAlert size={11} /> {daySummary.unpaidSales} nyitott fizetés
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 overflow-hidden rounded-2xl bg-[#293548] divide-y divide-white/[0.14]">
                    {visibleDailyProductLines.map((item) => {
                      const settlement = String(item.recordType || "") === "payment_settlement";
                      const paymentStatus = String(item.paymentStatus || "").toLowerCase();
                      const unpaid = !settlement && (
                        numberValue(item.balanceDue) > 0.005 ||
                        ["unpaid", "partial", "credit"].includes(paymentStatus)
                      );

                      const linkedSale = settlement
                        ? null
                        : (summaryData?.sales || []).find(
                            (sale) =>
                              String(sale.id || "") === String(item.saleId || "") &&
                              String(sale.recordType || "sale") === String(item.recordType || "sale"),
                          );
                      const paymentLabel = String(
                        item.paymentLabel ||
                        linkedSale?.paymentLabel ||
                        (unpaid ? "Utólag fizet" : "Nincs adat"),
                      );
                      const paymentKey = paymentLabel.toLocaleLowerCase("hu-HU");
                      const normalPriceTotal = numberValue(item.listTotal) > 0.005
                        ? numberValue(item.listTotal)
                        : Math.max(
                            numberValue(item.netTotal || item.revenue) + numberValue(item.discountTotal),
                            numberValue(item.revenue),
                          );
                      const netPriceTotal = numberValue(item.netTotal) > 0.005 || normalPriceTotal <= 0.005
                        ? numberValue(item.netTotal)
                        : Math.max(0, normalPriceTotal - numberValue(item.discountTotal));
                      const discountValue = Math.max(0, numberValue(item.discountTotal));
                      const discountPercent = numberValue(item.discountPercent) > 0.005
                        ? numberValue(item.discountPercent)
                        : normalPriceTotal > 0.005 && discountValue > 0.005
                          ? (discountValue / normalPriceTotal) * 100
                          : 0;
                      const PaymentIcon = paymentKey.includes("készpénz")
                        ? Banknote
                        : paymentKey.includes("bankkártya") || paymentKey.includes("kártya")
                          ? CreditCard
                          : paymentKey.includes("átutalás")
                            ? Landmark
                            : WalletCards;

                      return (
                        <div
                          key={`${item.recordType || "sale"}-${item.lineId || item.key}-${item.saleId || ""}`}
                          className={`group relative grid min-h-[108px] grid-cols-[78px_minmax(0,1fr)_260px] items-center gap-4 border-t border-white/[0.10] px-4 py-3.5 first:border-t-0 transition ${
                            settlement
                              ? "bg-[#334b5c] shadow-[inset_4px_0_0_#4fb8b2] hover:bg-[#39576a]"
                              : unpaid
                                ? "bg-[#2c3546] hover:bg-[#303a4b]"
                                : "bg-[#293548] hover:bg-[#2d3b4f]"
                          }`}
                        >
                          {unpaid ? (
                            <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-[#E21C2A]" aria-hidden="true" />
                          ) : null}

                          <ProductImage src={item.imageUrl} title={item.title} compact />

                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <p className="truncate text-[16px] leading-5 text-white" title={item.title}>
                                {item.title}
                              </p>
                              {item.recordType === "exchange" ? (
                                <span className="shrink-0 rounded-md bg-[#2a8d8b]/16 px-2 py-0.5 text-[10px] text-[#cffffd]">Csere</span>
                              ) : null}
                              {settlement ? (
                                <span className="shrink-0 rounded-md border border-[#b9f5f2]/52 bg-[#2a8d8b] px-2.5 py-1 text-[10px] text-white shadow-[0_3px_10px_rgba(42,141,139,0.22)]">
                                  Korábbi vásárlás rendezve
                                </span>
                              ) : null}
                            </div>

                            <p
                              className="mt-1 truncate text-[12px] text-white/58"
                              title={[item.brandName, item.subcategoryName, item.colorName, item.size].filter(Boolean).join(" • ")}
                            >
                              {[item.brandName, item.subcategoryName, item.colorName, item.size].filter(Boolean).join(" • ") || "Nincs további termékadat"}
                            </p>
                            {settlement && item.originalSoldAt ? (
                              <p className="mt-1 text-[10px] text-[#cfe5ff]/82">
                                Eredeti eladás: {formatExactDateTime(item.originalSoldAt)}
                              </p>
                            ) : null}

                            <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.08] pt-2.5">
                              {item.customerName ? (
                                item.customerId ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void openCustomerQuickView(item.customerId, item.customerName || "");
                                    }}
                                    className="group/customer inline-flex max-w-[430px] items-center gap-1.5 text-[12px] text-[#d7fffd] transition hover:text-white"
                                    title="Kliens adatlap megnyitása"
                                  >
                                    <UserRound size={13} className="shrink-0 text-[#8ee6e2]" />
                                    <span className="truncate">{item.customerName}</span>
                                    <ChevronRight size={12} className="shrink-0 text-white/32 transition group-hover/customer:translate-x-0.5 group-hover/customer:text-white/65" />
                                  </button>
                                ) : (
                                  <span
                                    className="inline-flex max-w-[430px] items-center gap-1.5 text-[12px] text-white/62"
                                    title={item.customerName}
                                  >
                                    <UserRound size={13} className="shrink-0 text-[#8ee6e2]/72" />
                                    <span className="truncate">{item.customerName}</span>
                                  </span>
                                )
                              ) : (
                                <span className="text-[11px] text-white/28">Nincs klienshez csatolva</span>
                              )}

                              <span className="h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />

                              <span
                                className="inline-flex items-center gap-1.5 text-[11px] text-white/66"
                                title={`Fizetés: ${paymentLabel}`}
                              >
                                <PaymentIcon
                                  size={14}
                                  className={
                                    paymentKey.includes("készpénz")
                                      ? "text-[#8ee6e2]"
                                      : paymentKey.includes("kártya")
                                        ? "text-[#a9c8ff]"
                                        : paymentKey.includes("átutalás")
                                          ? "text-[#c7b5ff]"
                                          : "text-white/52"
                                  }
                                />
                                <span>{paymentLabel}</span>
                              </span>

                              {item.soldAt ? (
                                <>
                                  <span className="h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
                                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] tabular-nums text-white/42">
                                    <Clock3 size={13} className="text-white/32" />
                                    {settlement ? "Fizetve " : ""}{formatTime(item.soldAt)}
                                  </span>
                                </>
                              ) : null}

                              {unpaid ? (
                                <>
                                  <span className="h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
                                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#E21C2A] px-2.5 py-1 text-[11px] text-white shadow-[0_3px_10px_rgba(226,28,42,0.16)]">
                                    <TriangleAlert size={12} />
                                    {paymentStatus === "partial" ? "Részben fizetve" : "Nincs kifizetve"}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex h-full min-w-0 items-center justify-end">
                            <div className="w-full max-w-[260px] text-right">
                              <p className="text-[11px] uppercase tracking-[0.08em] text-white/34">
                                {item.qty} db
                              </p>

                              <div className="mt-1.5 space-y-1">
                                <div className="flex items-center justify-between gap-3 text-[10px]">
                                  <span className="uppercase tracking-[0.06em] text-white/40">Rendes eladási ár</span>
                                  <span className="whitespace-nowrap tabular-nums text-[13px] text-white/82">
                                    {formatMoney(normalPriceTotal)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between gap-3 text-[10px]">
                                  <span className="uppercase tracking-[0.06em] text-amber-100/68">Akció</span>
                                  {discountValue > 0.005 ? (
                                    <span className="whitespace-nowrap tabular-nums text-[12px] text-amber-100">
                                      −{discountPercent.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}% • −{formatMoney(discountValue)}
                                    </span>
                                  ) : (
                                    <span className="whitespace-nowrap text-[11px] text-white/32">Nincs</span>
                                  )}
                                </div>

                                <div className="flex items-center justify-between gap-3 border-t border-white/[0.10] pt-1.5">
                                  <span className="text-[10px] uppercase tracking-[0.08em] text-[#bdf8f5]/74">Nettó ár</span>
                                  <span className="whitespace-nowrap text-[19px] tracking-tight tabular-nums text-[#d7fffd]">
                                    {formatMoney(netPriceTotal)}
                                  </span>
                                </div>
                              </div>

                              {settlement ? (
                                <div className="mt-2 border-t border-white/[0.08] pt-1.5">
                                  <p className="text-[9px] uppercase tracking-[0.08em] text-[#cfe5ff]/58">Kifizetve ezen a napon</p>
                                  <p className="mt-0.5 whitespace-nowrap text-[13px] tabular-nums text-[#d9ecff]">
                                    {formatMoney(item.settlementAmount ?? item.revenue)}
                                  </p>
                                  <p className="mt-0.5 whitespace-nowrap text-[9px] text-white/32">
                                    Készletmozgás: 0 db
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {!summaryLoading && !visibleDailyProductLines.length ? (
                      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-center text-white/42">
                        <ShoppingBag size={34} />
                        <p className="mt-2 text-sm">
                          {outstandingOnly
                            ? "Ezen a napon nincs nyitott kintlévőséges termék."
                            : "Ezen a napon még nincs megjeleníthető eladási vagy későbbi kifizetési termékesemény."}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className={`self-start overflow-hidden border border-white/14 bg-[#374357] ${salesPanelOpen ? "rounded-[18px]" : "rounded-2xl"}`}>
                  <button
                    type="button"
                    onClick={() => setSalesPanelOpen((current) => !current)}
                    className={`w-full transition hover:bg-white/[0.05] ${
                      salesPanelOpen
                        ? "flex items-center justify-between gap-3 px-3 py-3 text-left"
                        : "flex min-h-[78px] flex-col items-center justify-center gap-2 px-1.5 py-2"
                    }`}
                    aria-expanded={salesPanelOpen}
                    title={salesPanelOpen ? "Bizonylatok összecsukása" : "Bizonylatok megnyitása"}
                  >
                    {salesPanelOpen ? (
                      <>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#d7fffd]">
                            <Receipt size={16} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[9px] uppercase tracking-[0.12em] text-white/42">Bizonylatok</span>
                            <span className="mt-0.5 block truncate text-sm text-white">{visibleDailySales.length} db</span>
                          </span>
                        </span>
                        <ChevronRight size={18} className="shrink-0 text-[#bff8f5]" />
                      </>
                    ) : (
                      <>
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/26 bg-[#2a8d8b]/14 text-[#d7fffd]">
                          <Receipt size={17} />
                        </span>
                        <ChevronLeft size={17} className="text-[#bff8f5]" />
                      </>
                    )}
                  </button>

                  {salesPanelOpen ? (
                    <div className="space-y-1.5 border-t border-white/10 p-2.5">
                      {visibleDailySales.map((sale) => (
                        <button
                          key={sale.id}
                          type="button"
                          onClick={() => void openSaleDetail(sale)}
                          className={`group w-full rounded-xl border p-2.5 text-left transition hover:border-[#9be9e5]/38 hover:bg-[#314156] ${sale.balanceDue > 0 ? "border-red-300/32 bg-red-950/18" : "border-white/10 bg-[#293548]"}`}
                          title="Kattints az eladás részleteihez"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] text-white">{sale.saleNumber}</p>
                              <p className="mt-1 text-[10px] text-white/45">{formatTime(sale.soldAt)} • {sale.paymentLabel}</p>
                            </div>
                            <p className="shrink-0 text-sm text-white">{formatMoney(sale.total)}</p>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[9px] text-white/52">
                            <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">{sale.itemCount} db</span>
                            {sale.customerName ? <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1"><UserRound className="mr-1 inline" size={11} />{sale.customerName}</span> : null}
                            {sale.balanceDue > 0 ? <span className="rounded-lg border border-red-300/45 bg-[#E21C2A] px-2 py-1 text-white">Hátralék: {formatMoney(sale.balanceDue)}</span> : null}
                          </div>
                        </button>
                      ))}
                      {!summaryLoading && !visibleDailySales.length ? (
                        <div className="rounded-xl border border-dashed border-white/12 px-3 py-8 text-center text-xs text-white/42">
                          {outstandingOnly ? "Ezen a napon nincs nyitott kintlévőséges bizonylat." : "Ezen a napon még nincs megjeleníthető eladás."}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              </div>

              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Kedvezmény összesen</p><p className="mt-2 text-xl text-amber-50">{formatMoney(daySummary.discountTotal)}</p></div>
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Klienshez kapcsolva</p><p className="mt-2 text-xl">{daySummary.customerSales} eladás</p></div>
                <div className="rounded-2xl border border-white/12 bg-[#374357] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/42">Első / utolsó eladás</p><p className="mt-2 text-xl">{formatTime(daySummary.firstSaleAt)} • {formatTime(daySummary.lastSaleAt)}</p></div>
              </div>
            </>
          ) : null}
        </div>

        {customerQuickId ? (
          <CustomerQuickViewModal
            detail={customerQuickDetail}
            loading={customerQuickLoading}
            error={customerQuickError}
            fallbackName={customerQuickName}
            year={customerQuickYear}
            onClose={closeCustomerQuickView}
          />
        ) : null}

        {selectedDailySale ? (
          <DailySaleDetailModal
            sale={selectedDailySale}
            detail={saleDetail}
            loading={saleDetailLoading}
            error={saleDetailError}
            onClose={closeSaleDetail}
          />
        ) : null}

        {dayCloseOpen ? createPortal(
          <div className="fixed inset-0 z-[435] flex items-center justify-center bg-[#0f172a]/90 p-3 backdrop-blur-md sm:p-5">
            <section className="w-full max-w-[760px] overflow-hidden rounded-[30px] border border-[#9be9e5]/42 bg-[#303a4c] text-white shadow-[0_40px_120px_rgba(0,0,0,0.62)]">
              <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#9be9e5]/34 bg-[#2a8d8b]/24"><LockKeyhole size={23} /></span>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/52">Kiválasztott üzleti nap</p>
                    <h3 className="mt-1 text-xl">Napi kassza lezárása</h3>
                    <p className="mt-1 text-base font-medium text-[#d7fffd]">{formatDate(summaryDate)}</p>
                    <p className="mt-1 text-xs text-white/52">{actor} • {locationName}</p>
                  </div>
                </div>
                <button type="button" disabled={dayCloseSaving} onClick={() => setDayCloseOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] disabled:opacity-45"><X size={18} /></button>
              </header>

              <div className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-[#9be9e5]/30 bg-[#24585d] p-4">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[#d7fffd]/62">
                      {formatDate(summaryDate)} • rendszer szerinti záró kassza
                    </p>
                    <p className="mt-2 text-4xl tracking-tight">{formatMoney(currentCashBalance)}</p>
                    <p className="mt-2 text-xs text-white/50">
                      {summaryIsToday
                        ? "Az aktuális pillanatig számolt kassza."
                        : "A kiválasztott üzleti nap végéig számolt kassza. A mai mozgások nem kerülnek bele."}
                    </p>
                  </div>
                  <label className="rounded-[22px] border border-white/12 bg-[#374357] p-4">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Megszámolt készpénz</span>
                    <input
                      value={dayCloseCounted}
                      onChange={(event) => setDayCloseCounted(event.target.value)}
                      inputMode="decimal"
                      autoFocus
                      className="mt-2 h-14 w-full rounded-2xl border border-white/16 bg-[#273243] px-4 text-2xl text-white outline-none focus:border-[#72d8d4]"
                      placeholder="0,00"
                    />
                    <div className={`mt-2 rounded-xl border px-3 py-2 text-sm ${
                      dayCloseDifference === null
                        ? "border-white/10 bg-black/10 text-white/45"
                        : Math.abs(dayCloseDifference) < 0.01
                          ? "border-emerald-200/26 bg-emerald-500/10 text-emerald-50"
                          : "border-rose-200/30 bg-rose-500/12 text-rose-50"
                    }`}>
                      {dayCloseDifference === null
                        ? "Add meg a megszámolt összeget."
                        : Math.abs(dayCloseDifference) < 0.01
                          ? "✓ Egyezik • eltérés 0,00 RON"
                          : `Eltérés: ${formatMoney(dayCloseDifference)}`}
                    </div>
                  </label>
                </div>

                <label className="block rounded-[22px] border border-white/12 bg-[#374357] p-4">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Zárási megjegyzés • opcionális</span>
                  <textarea value={dayCloseNote} onChange={(event) => setDayCloseNote(event.target.value.slice(0, 1000))} rows={3} className="mt-2 w-full resize-none rounded-2xl border border-white/14 bg-[#273243] px-4 py-3 text-sm text-white outline-none placeholder:text-white/32 focus:border-[#72d8d4]" placeholder="Pl. kassza és POS ellenőrizve…" />
                </label>

                <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
                  summaryIsToday
                    ? "border-[#ff8792] bg-[#c30d1c] shadow-[0_10px_28px_rgba(195,13,28,0.22)]"
                    : "border-[#9be9e5]/24 bg-[#2a8d8b]/10"
                }`}>
                  <TriangleAlert
                    className={`mt-0.5 shrink-0 ${summaryIsToday ? "text-white" : "text-[#bff8f5]"}`}
                    size={18}
                  />
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${summaryIsToday ? "text-white" : "text-white"}`}>
                      {summaryIsToday
                        ? `FIGYELEM: a MAI napot zárod le • ${formatDate(summaryDate)}`
                        : `Ezt az üzleti napot zárod le: ${formatDate(summaryDate)}`}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-white/58">
                      A lezárás után ezen a napon új eladás, tartozásbefizetés, visszáru vagy félretett termék értékesítése már nem rögzíthető.
                    </p>
                  </div>
                </div>

                {summaryIsToday ? (
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#ff8792]/70 bg-[#c30d1c]/24 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={dayCloseTodayConfirmed}
                      onChange={(event) => setDayCloseTodayConfirmed(event.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[#c30d1c]"
                    />
                    <span className="text-sm leading-relaxed text-white">
                      Igen, tudom, hogy a <strong>mai napot</strong> zárom le, és utána ma már nem lehet új eladást rögzíteni.
                    </span>
                  </label>
                ) : null}
              </div>

              <footer className="flex justify-end gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
                <button type="button" disabled={dayCloseSaving} onClick={() => setDayCloseOpen(false)} className="h-11 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm disabled:opacity-45">Mégse</button>
                <button
                  type="button"
                  disabled={
                    dayCloseSaving ||
                    dayCloseDifference === null ||
                    Math.abs(dayCloseDifference) >= 0.01 ||
                    (summaryIsToday && !dayCloseTodayConfirmed)
                  }
                  onClick={() => void closeShopDay()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#ff8792]/70 bg-[#c30d1c] px-5 text-sm text-white shadow-[0_8px_20px_rgba(195,13,28,0.20)] hover:bg-[#a90b18] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {dayCloseSaving ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                  {dayCloseSaving ? "Lezárás…" : `${formatDate(summaryDate)} lezárása`}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        ) : null}

        {cashMoveOpen ? createPortal(
          <div className="fixed inset-0 z-[434] flex items-center justify-center bg-[#0f172a]/90 p-3 backdrop-blur-md sm:p-5">
            <section className="flex max-h-[94vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[30px] border border-white/18 bg-[#303a4c] text-white shadow-[0_40px_120px_rgba(0,0,0,0.62)]">
              <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-[#354153] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${
                    cashMoveType === "manager_handover"
                      ? "border-[#ffe66b] bg-[#fed700] text-[#243044]"
                      : "border-[#9be9e5]/34 bg-[#2a8d8b]/24 text-white"
                  }`}><CircleDollarSign size={23} /></span>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/52">Készpénz útja</p>
                    <h3 className="mt-1 text-xl">{cashMoveType === "manager_handover" ? "Készpénz átadása" : "Bankba befizetés"}</h3>
                    <p className="mt-1 text-xs text-white/52">{locationName} • jelenlegi kassza {formatMoney(currentCashBalance)}</p>
                  </div>
                </div>
                <button type="button" disabled={cashMoveSaving} onClick={() => setCashMoveOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] disabled:opacity-45"><X size={18} /></button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => selectCashMovementType("manager_handover")}
                    className={`min-h-16 rounded-2xl border p-3 text-left transition ${
                      cashMoveType === "manager_handover"
                        ? "border-[#ffe66b] bg-[#fed700] text-[#243044] shadow-[0_8px_24px_rgba(254,215,0,0.18)]"
                        : "border-white/12 bg-[#374357] text-white hover:border-[#ffe66b]/45"
                    }`}
                  >
                    <p className="flex items-center gap-2 text-sm"><WalletCards size={17} /> Készpénz átadása</p>
                    <p className={`mt-1 text-[11px] ${cashMoveType === "manager_handover" ? "text-[#243044]/70" : "text-white/48"}`}>Válaszd ki, melyik üzleti napig adod át az összegyűlt készpénzt.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => selectCashMovementType("bank_deposit")}
                    className={`min-h-16 rounded-2xl border p-3 text-left transition ${
                      cashMoveType === "bank_deposit"
                        ? "border-[#9be9e5]/40 bg-[#2a8d8b]/18"
                        : "border-white/12 bg-[#374357]"
                    }`}
                  >
                    <p className="flex items-center gap-2 text-sm"><Landmark size={17} /> Bankba befizetés</p>
                    <p className="mt-1 text-[11px] text-white/48">Azonnal naplózott pénzkiadás. A banki referencia / bizonylatszám kötelező.</p>
                  </button>
                </div>

                {cashMoveType === "manager_handover" ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
                      <div className="rounded-[22px] border border-[#ffe66b]/42 bg-[#2a3445] p-4">
                        <p className="text-[10px] uppercase tracking-[0.13em] text-[#fff4a5]/68">Átadási időszak</p>
                        <p className="mt-2 text-xl text-white">
                          {cashHandoverPlan?.nextFrom || cashHandoverDays[0]?.date || "–"} → {cashHandoverToDate || "válassz napot"}
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-white/50">
                          Az előző átvett készpénz után csak a még le nem fedett üzleti napok választhatók.
                        </p>
                        {cashHandoverPlan?.lastConfirmedTo ? (
                          <p className="mt-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-[11px] text-white/58">
                            Utolsó átvett időszak vége: <span className="text-white">{cashHandoverPlan.lastConfirmedTo}</span>
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-[22px] border border-[#ffe66b]/55 bg-[#fed700] p-4 text-[#243044] shadow-[0_12px_28px_rgba(254,215,0,0.15)]">
                        <p className="text-[10px] uppercase tracking-[0.13em] opacity-65">Átadandó készpénz</p>
                        <p className="mt-2 text-4xl tracking-tight">{formatMoney(selectedCashHandoverDay?.amount || 0)}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                          <span className="rounded-full border border-[#243044]/18 bg-white/30 px-2 py-1">
                            {selectedCashHandoverDay?.closed ? "Napzárással ellenőrizve" : "Rendszer szerinti érték"}
                          </span>
                          {selectedCashHandoverDay?.closingCash != null ? (
                            <span className="rounded-full border border-[#243044]/18 bg-white/30 px-2 py-1">
                              Záró kassza: {formatMoney(selectedCashHandoverDay.closingCash)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <section className="overflow-hidden rounded-[22px] border border-white/12 bg-[#374357]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Átadás eddig a napig</p>
                          <h4 className="mt-1 text-base text-white">Válaszd ki a zárónapot</h4>
                        </div>
                        <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/52">
                          {cashHandoverDays.length} nap
                        </span>
                      </div>
                      <div className="grid max-h-[320px] gap-2 overflow-y-auto p-3 sm:grid-cols-2">
                        {cashHandoverDays.map((day) => {
                          const selected = day.date === cashHandoverToDate;
                          const blocked = day.status === "pending" || numberValue(day.amount) <= 0;
                          return (
                            <button
                              key={day.date}
                              type="button"
                              disabled={blocked}
                              onClick={() => setCashHandoverToDate(day.date)}
                              className={`flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                                selected
                                  ? "border-[#ffe66b] bg-[#fed700] text-[#243044] shadow-[0_8px_20px_rgba(254,215,0,0.16)]"
                                  : blocked
                                    ? "border-white/8 bg-black/[0.07] text-white/32"
                                    : "border-white/12 bg-[#293548] text-white hover:border-[#ffe66b]/40 hover:bg-[#313e52]"
                              }`}
                            >
                              <span className="min-w-0">
                                <span className="block text-sm">{formatDate(day.date)}</span>
                                <span className={`mt-1 block text-[10px] ${selected ? "text-[#243044]/65" : "text-white/42"}`}>
                                  {day.status === "pending" ? "Már átvételre vár" : day.closed ? "Napzárás rögzítve" : "Nincs külön napzárás"}
                                </span>
                              </span>
                              <span className="shrink-0 text-right">
                                <span className="block text-base">{formatMoney(day.amount)}</span>
                                <span className={`mt-1 block text-[9px] ${selected ? "text-[#243044]/55" : "text-white/35"}`}>eddig átadható</span>
                              </span>
                            </button>
                          );
                        })}
                        {!cashLoading && !cashHandoverDays.length ? (
                          <div className="sm:col-span-2 rounded-xl border border-dashed border-white/12 px-4 py-7 text-center text-sm text-white/42">
                            Nincs még átadható készpénzes időszak.
                          </div>
                        ) : null}
                      </div>
                    </section>

                    <label className="block rounded-[22px] border border-white/12 bg-[#374357] p-4">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Megjegyzés • opcionális</span>
                      <textarea value={cashMoveNote} onChange={(event) => setCashMoveNote(event.target.value.slice(0, 1000))} rows={3} className="mt-2 w-full resize-none rounded-2xl border border-white/14 bg-[#273243] px-4 py-3 text-sm text-white outline-none placeholder:text-white/32 focus:border-[#fed700]" placeholder="Pl. boríték azonosító, megjegyzés…" />
                    </label>

                    <div className="flex items-start gap-3 rounded-2xl border border-[#ffe66b]/26 bg-[#fed700]/[0.07] px-4 py-3">
                      <TriangleAlert className="mt-0.5 shrink-0 text-[#ffe66b]" size={18} />
                      <p className="text-xs leading-relaxed text-white/68">
                        A rendszer számolja az összeget a kiválasztott napig. Kézzel nem írható át. A kassza csak akkor csökken, amikor az Admin ténylegesen visszaigazolja az átvételt.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="rounded-[22px] border border-white/12 bg-[#374357] p-4">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Befizetett összeg</span>
                        <input value={cashMoveAmount} onChange={(event) => setCashMoveAmount(event.target.value)} inputMode="decimal" autoFocus className="mt-2 h-14 w-full rounded-2xl border border-white/16 bg-[#273243] px-4 text-2xl text-white outline-none focus:border-[#72d8d4]" placeholder="0,00" />
                        <button type="button" onClick={() => setCashMoveAmount(currentCashBalance.toFixed(2).replace(".", ","))} className="mt-2 text-[11px] text-[#bdf8f5]">Teljes kassza: {formatMoney(currentCashBalance)}</button>
                      </label>
                      <label className="rounded-[22px] border border-[#9be9e5]/20 bg-[#374357] p-4">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Referencia / bizonylatszám • kötelező</span>
                        <input value={cashMoveReference} onChange={(event) => setCashMoveReference(event.target.value.slice(0, 120))} className="mt-2 h-14 w-full rounded-2xl border border-white/16 bg-[#273243] px-4 text-sm text-white outline-none focus:border-[#72d8d4]" placeholder="Pl. DEP-2026-0811-01" />
                      </label>
                    </div>

                    <label className="block rounded-[22px] border border-white/12 bg-[#374357] p-4">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Megjegyzés • opcionális</span>
                      <textarea value={cashMoveNote} onChange={(event) => setCashMoveNote(event.target.value.slice(0, 1000))} rows={3} className="mt-2 w-full resize-none rounded-2xl border border-white/14 bg-[#273243] px-4 py-3 text-sm text-white outline-none placeholder:text-white/32 focus:border-[#72d8d4]" placeholder="Pl. bankfiók / automata / megjegyzés…" />
                    </label>

                    <div className="flex items-start gap-3 rounded-2xl border border-[#9be9e5]/22 bg-[#2a8d8b]/8 px-4 py-3">
                      <TriangleAlert className="mt-0.5 shrink-0" size={18} />
                      <p className="text-xs leading-relaxed text-white/66">A bankbefizetés azonnal csökkenti a kasszát, és a referencia megmarad az auditnaplóban.</p>
                    </div>
                  </div>
                )}
              </div>

              <footer className="flex justify-end gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
                <button type="button" disabled={cashMoveSaving} onClick={() => setCashMoveOpen(false)} className="h-11 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm disabled:opacity-45">Mégse</button>
                <button
                  type="button"
                  disabled={
                    cashMoveSaving ||
                    (cashMoveType === "manager_handover"
                      ? !selectedCashHandoverDay || numberValue(selectedCashHandoverDay.amount) <= 0
                      : !cashMoveAmount.trim() || !cashMoveReference.trim())
                  }
                  onClick={() => void createCashMovement()}
                  className={`inline-flex h-11 items-center gap-2 rounded-xl border px-5 text-sm disabled:cursor-not-allowed disabled:opacity-45 ${
                    cashMoveType === "manager_handover"
                      ? "border-[#ffe66b] bg-[#fed700] text-[#243044] hover:bg-[#eac600]"
                      : "border-[#b9f5f2]/50 bg-[#2a8d8b] text-white hover:bg-[#319c99]"
                  }`}
                >
                  {cashMoveSaving ? <Loader2 size={17} className="animate-spin" /> : cashMoveType === "manager_handover" ? <WalletCards size={17} /> : <Landmark size={17} />}
                  {cashMoveSaving ? "Rögzítés…" : cashMoveType === "manager_handover" ? "Készpénzátadás rögzítése" : "Bankbefizetés rögzítése"}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        ) : null}

        {handoverOpen ? createPortal(
          <div className="fixed inset-0 z-[430] flex items-center justify-center bg-[#0f172a]/88 p-3 backdrop-blur-md sm:p-5">
            <section className="flex max-h-[94vh] w-full max-w-[980px] flex-col overflow-hidden rounded-[30px] border border-[#9be9e5]/42 bg-[#303a4c] text-white shadow-[0_40px_120px_rgba(0,0,0,0.62)]">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#214e55] via-[#25716f] to-[#2a8d8b] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/12"><ArrowRightLeft size={24} /></span>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/62">Váltás lezárása</p>
                    <h3 className="mt-1 text-xl">Műszak átadása</h3>
                    <p className="mt-1 text-xs text-white/66">{actor} • {locationName}</p>
                  </div>
                </div>
                <button type="button" disabled={handoverSaving} onClick={() => setHandoverOpen(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-black/10 hover:bg-white/12 disabled:opacity-45"><X size={18} /></button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <div className="rounded-[22px] border border-[#9be9e5]/25 bg-[#263345] p-4">
                    <p className="text-[10px] uppercase tracking-[0.13em] text-[#bdf8f5]/55">Amit most lezársz</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                        <p className="text-[9px] text-white/38">Műszak befolyt összeg</p>
                        <p className="mt-1 text-base text-[#d7fffd]">{formatMoney(shiftCollectedTotal(handoverShiftPreview))}</p>
                        <p className="mt-1 text-[8px] text-white/36">Eladás {formatMoney(handoverShiftPreview?.revenue || 0)}{shiftCustomerPaymentTotal(handoverShiftPreview) > 0.005 ? ` • tartozás ${formatMoney(shiftCustomerPaymentTotal(handoverShiftPreview))}` : ""}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/10 p-3"><p className="text-[9px] text-white/38">Eladás</p><p className="mt-1 text-base">{handoverShiftPreview?.transactions || 0}</p></div>
                      <div className="rounded-xl border border-white/10 bg-black/10 p-3"><p className="text-[9px] text-white/38">Darab</p><p className="mt-1 text-base">{handoverShiftPreview?.itemsSold || 0}</p></div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {PAYMENT_META.map((item) => {
                        const Icon = item.icon;
                        const payment = shiftPayment(handoverShiftPreview, item.method);
                        return <div key={item.method} className="rounded-xl border border-white/10 bg-[#303c4f] p-3"><p className="flex items-center gap-2 text-[10px] text-white/46"><Icon size={14} className="text-[#8ee6e2]" />{item.label}</p><p className="mt-1 text-sm">{formatMoney(payment.amount)}</p></div>;
                      })}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[#9be9e5]/34 bg-[#24585d] p-4">
                    <p className="text-[10px] uppercase tracking-[0.13em] text-[#d7fffd]/65">Fizikailag átadandó kassza</p>
                    <p className="mt-2 text-4xl tracking-tight text-white">{formatMoney(handoverExpectedCash)}</p>
                    <p className="mt-2 text-xs leading-relaxed text-white/58">Ez az előző átvett kassza és a mostani műszak új készpénzbevétele együtt. Az átvételkor a kolléga ezt az összeget számolja meg és igazolja.</p>
                    {handoverPreview ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                        <div className="rounded-xl border border-white/12 bg-black/10 px-3 py-2"><p className="text-white/42">Nyitó kassza</p><p className="mt-1 text-white">{formatMoney(handoverPreview.openingCash)}</p></div>
                        <div className="rounded-xl border border-white/12 bg-black/10 px-3 py-2"><p className="text-white/42">Új KP ebben a műszakban</p><p className="mt-1 text-white">{formatMoney(handoverPreview.newCashDuringShift)}</p></div>
                      </div>
                    ) : null}
                    {shiftPayment(shiftData?.totals, "cash").customerPaymentAmount > 0 ? (
                      <div className="mt-3 rounded-xl border border-white/12 bg-black/10 px-3 py-2 text-[10px] text-white/55">Tartozásból beérkezett készpénz is van benne: {formatMoney(shiftPayment(shiftData?.totals, "cash").customerPaymentAmount)}</div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 rounded-[22px] border border-white/12 bg-[#374357] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Következő műszak</p><h4 className="mt-1 text-base">Ki veszi át?</h4></div>
                    <UsersRound size={21} className="text-[#8ee6e2]" />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {selectableShiftEmployees.map((employee) => {
                      const selected = employeeKey(handoverTarget) === employeeKey(employee.name);
                      return (
                        <button
                          key={employee.name}
                          type="button"
                          onClick={() => setHandoverTarget(employee.name)}
                          className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.985] ${selected ? "border-[#b9f5f2]/55 bg-[#2a8d8b] shadow-[0_8px_20px_rgba(42,141,139,0.20)]" : "border-white/12 bg-[#293548] hover:border-[#7bd7d4]/36 hover:bg-[#344055]"}`}
                        >
                          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${selected ? "border-white/24 bg-white/12" : "border-[#7bd7d4]/22 bg-[#2a8d8b]/12"}`}><UserRound size={18} /></span>
                          <span className="min-w-0 flex-1 truncate text-sm">{employee.name}</span>
                          {selected ? <Check size={18} /> : null}
                        </button>
                      );
                    })}
                    {!selectableShiftEmployees.length ? <div className="col-span-full rounded-2xl border border-dashed border-white/12 px-4 py-7 text-center text-sm text-white/42">Nincs másik aktív dolgozó ehhez az üzlethez rendelve.</div> : null}
                  </div>
                </div>

                <label className="mt-4 block rounded-[22px] border border-white/12 bg-[#374357] p-4">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Átadási megjegyzés • opcionális</span>
                  <textarea
                    value={handoverNote}
                    onChange={(event) => setHandoverNote(event.target.value.slice(0, 1000))}
                    rows={3}
                    placeholder="Pl. POS terminál egyezik, egy félretett csomag várható…"
                    className="mt-2 w-full resize-none rounded-2xl border border-white/14 bg-[#273243] px-4 py-3 text-sm text-white outline-none placeholder:text-white/32 focus:border-[#72d8d4]"
                  />
                </label>

                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200/22 bg-amber-400/8 px-4 py-3">
                  <TriangleAlert className="mt-0.5 shrink-0 text-amber-100" size={18} />
                  <p className="text-xs leading-relaxed text-amber-50/82">Az átadás létrehozásakor a rendszer befagyasztja az addigi összegeket. Utána sem te, sem az átvevő kolléga nem tud új eladást vagy tartozásbefizetést rögzíteni, amíg a kasszaátvétel nincs rendben jóváhagyva.</p>
                </div>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 bg-[#293548] px-5 py-4">
                <p className="text-xs text-white/42">{handoverTarget ? `${actor} → ${handoverTarget}` : "Válassz átvevő kollégát"}</p>
                <div className="flex gap-2">
                  <button type="button" disabled={handoverSaving} onClick={() => setHandoverOpen(false)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm hover:bg-white/[0.09] disabled:opacity-45"><X size={16} /> Mégse</button>
                  <button type="button" disabled={handoverSaving || !handoverTarget} onClick={() => void createShiftHandover()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#b9f5f2]/50 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-45">
                    {handoverSaving ? <Loader2 className="animate-spin" size={17} /> : <ArrowRightLeft size={17} />}
                    {handoverSaving ? "Átadás rögzítése…" : "Műszak átadása"}
                  </button>
                </div>
              </footer>
            </section>
          </div>,
          document.body,
        ) : null}

      </section>
    </div>,
    document.body,
  );
}
