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
  ChevronUp,
  Clock3,
  CreditCard,
  Filter,
  History,
  Landmark,
  LockKeyhole,
  Loader2,
  PackageSearch,
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
  apiAifShopCashOverview,
  apiAifShopDailySummary,
  apiAifShopSaleCatalog,
  apiAifShopShiftDayOverview,
  apiAifShopShiftEmployees,
  apiAifShopStockOverview,
  type AifShopCashMovementType,
  type AifShopCashOverview,
  type AifShopDailySummaryResponse,
  type AifShopSaleCatalogItem,
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
  if (["unisex", "universal", "mixt", "mixed"].includes(compact)) return "unisex";
  return compact || "unisex";
}

function genderLabel(value: string) {
  if (value === "women") return "Női";
  if (value === "men") return "Férfi";
  if (value === "kids") return "Gyerek";
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
                  {selected ? <Check size={17} className="shrink-0" /> : null}
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

function shiftStatusLabel(status?: string | null) {
  if (status === "accepted") return "Átvéve";
  if (status === "cancelled") return "Visszavonva";
  return "Átvételre vár";
}

function ProductImage({ src, title, large = false }: { src?: string | null; title: string; large?: boolean }) {
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
      <span className={`flex shrink-0 items-center justify-center rounded-2xl border border-white/14 bg-white/95 ${large ? "h-24 w-24" : "h-20 w-20"}`}>
        <PackageSearch size={large ? 34 : 28} className="text-[#526173]" />
      </span>
    );
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`relative flex shrink-0 touch-manipulation items-center justify-center overflow-hidden rounded-2xl border border-white/14 bg-white/95 ${large ? "h-24 w-24" : "h-20 w-20"}`}
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
  const [cashMoveReference, setCashMoveReference] = useState("");
  const [cashMoveNote, setCashMoveNote] = useState("");
  const [cashMoveSaving, setCashMoveSaving] = useState(false);
  const [cashCancelBusyId, setCashCancelBusyId] = useState<string | null>(null);

  const paymentMap = useMemo(() => {
    const map = new Map<string, { amount: number; transactions: number }>();
    for (const item of summaryData?.payments || []) {
      map.set(item.method, { amount: numberValue(item.amount), transactions: numberValue(item.transactions) });
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

  async function loadCashContext() {
    setCashLoading(true);
    try {
      const response = await apiAifShopCashOverview({ location: locationCode, limit: 80 });
      setCashData(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A kassza naplója nem tölthető be.");
      setCashData(null);
    } finally {
      setCashLoading(false);
    }
  }

  async function refreshSummaryPage(date = summaryDate) {
    await Promise.all([loadDailySummary(date), loadShiftContext(date), loadCashContext()]);
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
    const amount = Number(String(cashMoveAmount || "").replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Add meg az átadott / befizetett készpénz összegét.");
      return;
    }
    if (cashMoveType === "bank_deposit" && !cashMoveReference.trim()) {
      setError("Bankbefizetésnél a referencia vagy bizonylatszám kötelező.");
      return;
    }
    setCashMoveSaving(true);
    setError("");
    try {
      const response = await apiAifCreateShopCashMovement({
        location: locationCode,
        type: cashMoveType,
        amount,
        reference: cashMoveReference.trim() || null,
        note: cashMoveNote.trim() || null,
        idempotencyKey: typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `cash-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });
      setHandoverNotice(
        response.item.type === "manager_handover"
          ? `${formatMoney(response.item.amount)} főnöki átadás rögzítve. A főnök visszaigazolására vár.`
          : `${formatMoney(response.item.amount)} bankbefizetés rögzítve (${response.item.reference || "referencia nélkül"}).`,
      );
      setCashMoveOpen(false);
      setCashMoveAmount("");
      setCashMoveReference("");
      setCashMoveNote("");
      await refreshSummaryPage(summaryDate);
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
      setHandoverNotice("A függő főnöki pénzátadást visszavontad.");
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

  function openCashMovement(type: AifShopCashMovementType) {
    setError("");
    setCashMoveType(type);
    setCashMoveAmount("");
    setCashMoveReference("");
    setCashMoveNote("");
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
      setHandoverNotice("");
      void refreshSummaryPage(today);
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
  }, [cashMoveOpen, cashMoveSaving, dayCloseOpen, dayCloseSaving, handoverOpen, handoverSaving, mode, onClose, open]);

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
                <TouchFilterBar
                  items={stockItems}
                  filters={productFilters}
                  onToggle={toggleProductFilter}
                  onClear={clearProductFilters}
                />
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
                    <div className="mb-3 flex items-start gap-3 rounded-2xl border border-emerald-200/28 bg-emerald-500/12 px-4 py-3">
                      <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-100" size={18} />
                      <div className="min-w-0">
                        <p className="text-sm text-emerald-50">A mai kassza le van zárva</p>
                        <p className="mt-1 text-xs text-white/52">
                          {currentDayClosure.actor} • {formatTime(currentDayClosure.closedAt)} • megszámolva {formatMoney(currentDayClosure.countedCash)} • eltérés {formatMoney(currentDayClosure.cashDifference)}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {pendingBossHandover ? (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200/30 bg-orange-500/10 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Clock3 className="mt-0.5 shrink-0 text-orange-100" size={18} />
                        <div>
                          <p className="text-sm text-orange-50">Főnöki átvétel visszaigazolására vár: {formatMoney(pendingBossHandover.amount)}</p>
                          <p className="mt-1 text-xs text-white/48">{pendingBossHandover.requestedBy} rögzítette • {formatTime(pendingBossHandover.requestedAt)}</p>
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
                          <p className="text-[9px] uppercase tracking-[0.08em] text-white/36">Függő főnöki átadás</p>
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
                            onClick={() => openCashMovement("manager_handover")}
                            disabled={Boolean(pendingBossHandover) || currentCashBalance <= 0}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-orange-200/30 bg-orange-500/14 px-3 text-sm text-orange-50 hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <WalletCards size={17} /> Átadás a főnöknek
                          </button>
                          <button
                            type="button"
                            onClick={() => openCashMovement("bank_deposit")}
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
                      <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1">
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
                                <p className="truncate text-xs text-white">{movement.type === "manager_handover" ? "Átadás a főnöknek" : "Bankbefizetés"}</p>
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
                          <div className="rounded-xl border border-dashed border-white/12 px-3 py-7 text-center text-xs text-white/40">Még nincs főnöki átadás vagy bankbefizetés.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
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

                  {summaryIsToday && handoverPreview?.canCreate === false && !currentOutgoingHandover && !currentIncomingHandover && handoverPreview.reason ? (
                    <div className="mb-3 flex items-start gap-3 rounded-2xl border border-amber-200/28 bg-amber-400/8 px-4 py-3">
                      <TriangleAlert className="mt-0.5 shrink-0 text-amber-100" size={18} />
                      <p className="text-xs leading-relaxed text-amber-50/82">{handoverPreview.reason}</p>
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
                          <p className="text-[9px] uppercase tracking-[0.12em] text-white/38">Összes forgalom</p>
                          <p className="mt-1 text-3xl tracking-tight text-[#d7fffd]">{formatMoney(shiftData?.totals.revenue || 0)}</p>
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
                        <div className="rounded-xl border border-white/10 bg-black/10 p-2.5"><p className="text-[9px] text-white/38">Forgalom</p><p className="mt-1 text-sm text-[#d7fffd]">{formatMoney(currentEmployeeDay?.revenue || 0)}</p></div>
                        <div className="rounded-xl border border-white/10 bg-black/10 p-2.5"><p className="text-[9px] text-white/38">Eladás</p><p className="mt-1 text-sm">{currentEmployeeDay?.transactions || 0}</p></div>
                        <div className="rounded-xl border border-white/10 bg-black/10 p-2.5"><p className="text-[9px] text-white/38">Darab</p><p className="mt-1 text-sm">{currentEmployeeDay?.itemsSold || 0}</p></div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"><p className="text-[9px] text-white/38">Készpénz</p><p className="mt-1 text-sm">{formatMoney(shiftPayment(currentEmployeeDay, "cash").amount)}</p></div>
                        <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"><p className="text-[9px] text-white/38">Bankkártya</p><p className="mt-1 text-sm">{formatMoney(shiftPayment(currentEmployeeDay, "card").amount)}</p></div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 xl:grid-cols-[1.08fr_0.92fr]">
                    <div className="rounded-[22px] border border-white/12 bg-[#344055] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Dolgozónként külön</p>
                          <h4 className="mt-1 text-base text-white">Napi árulás</h4>
                        </div>
                        <UsersRound size={21} className="text-[#8ee6e2]" />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(shiftData?.employees || []).map((employee) => {
                          const active = employeeKey(employee.name) === employeeKey(actor);
                          return (
                            <div key={employee.name} className={`rounded-2xl border p-3 ${active ? "border-[#9be9e5]/42 bg-[#2a8d8b]/16" : "border-white/10 bg-[#293548]"}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0"><p className="truncate text-sm text-white">{employee.name}</p><p className="mt-1 text-[10px] text-white/42">{employee.transactions} eladás • {employee.itemsSold} db</p></div>
                                {active ? <span className="rounded-full border border-[#9be9e5]/32 bg-[#2a8d8b] px-2 py-1 text-[9px] text-white">Te</span> : null}
                              </div>
                              <p className="mt-2 text-xl text-[#d7fffd]">{formatMoney(employee.revenue)}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] text-white/48">
                                <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">KP {formatMoney(shiftPayment(employee, "cash").amount)}</span>
                                <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">Kártya {formatMoney(shiftPayment(employee, "card").amount)}</span>
                              </div>
                            </div>
                          );
                        })}
                        {!shiftLoading && !(shiftData?.employees || []).length ? <div className="col-span-full rounded-2xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/40">Ezen a napon még nincs dolgozóhoz kötött forgalom.</div> : null}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-white/12 bg-[#344055] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.13em] text-white/42">Visszanézhető napló</p>
                          <h4 className="mt-1 text-base text-white">Műszakátadások</h4>
                        </div>
                        <span className="rounded-full border border-white/12 bg-black/10 px-2 py-1 text-[10px] text-white/50">{shiftData?.handovers.length || 0} átadás</span>
                      </div>
                      <div className="mt-3 max-h-[330px] space-y-2 overflow-y-auto pr-1">
                        {(shiftData?.handovers || []).map((item, index) => {
                          const accepted = item.status === "accepted";
                          const pending = item.status === "pending";
                          return (
                            <div key={item.id} className={`rounded-2xl border p-3 ${pending ? "border-amber-200/30 bg-amber-400/8" : accepted ? "border-[#9be9e5]/22 bg-[#2a8d8b]/10" : "border-white/10 bg-[#293548]"}`}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0"><p className="truncate text-sm text-white">{index + 1}. {item.fromActor} <ArrowRight className="mx-1 inline" size={13} /> {item.toActor}</p><p className="mt-1 text-[10px] text-white/42">{formatTime(item.shiftStartAt)} → {formatTime(item.cutoffAt)}</p></div>
                                <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] ${pending ? "border-amber-200/30 bg-amber-300/12 text-amber-50" : accepted ? "border-[#9be9e5]/30 bg-[#2a8d8b] text-white" : "border-white/12 bg-black/10 text-white/50"}`}>{shiftStatusLabel(item.status)}</span>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                                <div><p className="text-white/35">Műszak forgalma</p><p className="mt-1 text-white">{formatMoney(item.snapshot?.shift?.revenue || 0)}</p></div>
                                <div><p className="text-white/35">Műszak KP</p><p className="mt-1 text-white">{formatMoney(shiftPayment(item.snapshot?.shift, "cash").amount)}</p></div>
                                <div><p className="text-white/35">Műszak kártya</p><p className="mt-1 text-white">{formatMoney(shiftPayment(item.snapshot?.shift, "card").amount)}</p></div>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/8 pt-2 text-[10px]">
                                <div><p className="text-white/35">Átadandó KP</p><p className="mt-1 text-white">{formatMoney(item.expectedCash)}</p></div>
                                <div><p className="text-white/35">Megszámolva</p><p className="mt-1 text-white">{item.countedCash == null ? "–" : formatMoney(item.countedCash)}</p></div>
                                <div><p className="text-white/35">Eltérés</p><p className={`mt-1 ${numberValue(item.cashDifference) !== 0 ? "text-red-100" : "text-[#bdf8f5]"}`}>{item.cashDifference == null ? "–" : formatMoney(item.cashDifference)}</p></div>
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

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Mit adtam el?</p><h3 className="mt-1 text-lg">Eladott termékek</h3></div><span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">{summaryData?.products.length || 0} termék</span></div>
                  <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                    {(summaryData?.products || []).map((item) => (
                      <div
                        key={item.key}
                        className="grid grid-cols-[80px_minmax(0,1fr)_96px] items-center gap-3 rounded-2xl border border-white/10 bg-[#293548] p-3 transition hover:border-[#7bd7d4]/24 hover:bg-[#2d3a4d]"
                      >
                        <ProductImage src={item.imageUrl} title={item.title} />
                        <div className="min-w-0 self-stretch py-0.5">
                          <p className="line-clamp-2 min-h-[36px] text-sm leading-[18px] text-white" title={item.title}>
                            {item.title}
                          </p>
                          <p
                            className="mt-1.5 line-clamp-1 text-[11px] text-white/52"
                            title={[item.brandName, item.subcategoryName, item.colorName, item.size].filter(Boolean).join(" • ")}
                          >
                            {[item.brandName, item.subcategoryName, item.colorName, item.size].filter(Boolean).join(" • ") || "Nincs további termékadat"}
                          </p>
                          <div className="mt-2 flex min-w-0">
                            <span
                              className="max-w-full truncate rounded-lg border border-[#7bd7d4]/18 bg-[#2a8d8b]/10 px-2 py-1 font-mono text-[9px] text-[#cffffd]/68"
                              title={item.productCode || "–"}
                            >
                              {item.productCode || "–"}
                            </span>
                          </div>
                        </div>
                        <div className="flex h-full min-w-0 flex-col items-end justify-center border-l border-white/8 pl-3 text-right">
                          <span className="inline-flex min-w-[68px] justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 px-2.5 py-1.5 text-base text-[#d7fffd]">
                            {item.qty} db
                          </span>
                          <p className="mt-2 whitespace-nowrap text-sm text-white">{formatMoney(item.revenue)}</p>
                          {item.discountTotal > 0 ? (
                            <p className="mt-1 whitespace-nowrap text-[10px] text-amber-100">
                              Kedv.: {formatMoney(item.discountTotal)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {!summaryLoading && !(summaryData?.products || []).length ? <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 text-white/42"><ShoppingBag size={34} /><p className="mt-2 text-sm">Ezen a napon még nincs eladott termék.</p></div> : null}
                  </div>
                </section>

                <section className="rounded-[24px] border border-white/14 bg-[#374357] p-4">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Bizonylatok</p><h3 className="mt-1 text-lg">Napi eladások</h3></div><span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/55">{summaryData?.sales.length || 0} bizonylat</span></div>
                  <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                    {(summaryData?.sales || []).map((sale) => (
                      <div key={sale.id} className={`rounded-2xl border p-3 ${sale.balanceDue > 0 ? "border-red-300/32 bg-red-950/18" : "border-white/10 bg-[#293548]"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm">{sale.saleNumber}</p><p className="mt-1 text-[11px] text-white/45">{formatTime(sale.soldAt)} • {sale.paymentLabel}</p></div><p className="shrink-0 text-lg">{formatMoney(sale.total)}</p></div><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/52"><span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1">{sale.itemCount} db</span>{sale.saleType === "exchange" ? <span className="rounded-lg border border-[#9be9e5]/28 bg-[#2a8d8b]/16 px-2 py-1 text-[#d7fffd]">Csere • különbözet</span> : null}{sale.customerName ? <span className="rounded-lg border border-white/10 bg-black/10 px-2 py-1"><UserRound className="mr-1 inline" size={12} />{sale.customerName}</span> : null}{sale.discountTotal > 0 ? <span className="rounded-lg border border-amber-200/18 bg-amber-400/8 px-2 py-1 text-amber-50">Kedv.: {formatMoney(sale.discountTotal)}</span> : null}{sale.balanceDue > 0 ? <span className="rounded-lg border border-red-300/45 bg-red-600 px-2 py-1 text-white">Hátralék: {formatMoney(sale.balanceDue)}</span> : null}</div></div>
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
            <section className="w-full max-w-[820px] overflow-hidden rounded-[30px] border border-[#9be9e5]/42 bg-[#303a4c] text-white shadow-[0_40px_120px_rgba(0,0,0,0.62)]">
              <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#304257] to-[#315a5d] px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#9be9e5]/34 bg-[#2a8d8b]/24"><CircleDollarSign size={23} /></span>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/52">Készpénz útja</p>
                    <h3 className="mt-1 text-xl">{cashMoveType === "manager_handover" ? "Átadás a főnöknek" : "Bankba befizetés"}</h3>
                    <p className="mt-1 text-xs text-white/52">{locationName} • kassza {formatMoney(currentCashBalance)}</p>
                  </div>
                </div>
                <button type="button" disabled={cashMoveSaving} onClick={() => setCashMoveOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] disabled:opacity-45"><X size={18} /></button>
              </header>

              <div className="space-y-4 p-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => setCashMoveType("manager_handover")} className={`min-h-16 rounded-2xl border p-3 text-left ${cashMoveType === "manager_handover" ? "border-orange-200/40 bg-orange-500/16" : "border-white/12 bg-[#374357]"}`}>
                    <p className="flex items-center gap-2 text-sm"><WalletCards size={17} /> Átadás a főnöknek</p>
                    <p className="mt-1 text-[11px] text-white/48">Függő tétel lesz, amíg a főnök a saját felületén vissza nem igazolja.</p>
                  </button>
                  <button type="button" onClick={() => setCashMoveType("bank_deposit")} className={`min-h-16 rounded-2xl border p-3 text-left ${cashMoveType === "bank_deposit" ? "border-[#9be9e5]/40 bg-[#2a8d8b]/16" : "border-white/12 bg-[#374357]"}`}>
                    <p className="flex items-center gap-2 text-sm"><Landmark size={17} /> Bankba befizetés</p>
                    <p className="mt-1 text-[11px] text-white/48">Azonnal naplózott pénzkiadás. A banki referencia / bizonylatszám kötelező.</p>
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="rounded-[22px] border border-white/12 bg-[#374357] p-4">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Összeg</span>
                    <input value={cashMoveAmount} onChange={(event) => setCashMoveAmount(event.target.value)} inputMode="decimal" autoFocus className="mt-2 h-14 w-full rounded-2xl border border-white/16 bg-[#273243] px-4 text-2xl text-white outline-none focus:border-[#72d8d4]" placeholder="0,00" />
                    <button type="button" onClick={() => setCashMoveAmount(currentCashBalance.toFixed(2).replace(".", ","))} className="mt-2 text-[11px] text-[#bdf8f5]">Teljes kassza: {formatMoney(currentCashBalance)}</button>
                  </label>
                  <label className={`rounded-[22px] border p-4 ${cashMoveType === "bank_deposit" ? "border-[#9be9e5]/20 bg-[#374357]" : "border-white/8 bg-[#374357]/60"}`}>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Referencia / bizonylatszám {cashMoveType === "bank_deposit" ? "• kötelező" : "• opcionális"}</span>
                    <input value={cashMoveReference} onChange={(event) => setCashMoveReference(event.target.value.slice(0, 120))} className="mt-2 h-14 w-full rounded-2xl border border-white/16 bg-[#273243] px-4 text-sm text-white outline-none focus:border-[#72d8d4]" placeholder={cashMoveType === "bank_deposit" ? "Pl. DEP-2026-0811-01" : "Pl. boríték / belső hivatkozás"} />
                  </label>
                </div>

                <label className="block rounded-[22px] border border-white/12 bg-[#374357] p-4">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-white/42">Megjegyzés • opcionális</span>
                  <textarea value={cashMoveNote} onChange={(event) => setCashMoveNote(event.target.value.slice(0, 1000))} rows={3} className="mt-2 w-full resize-none rounded-2xl border border-white/14 bg-[#273243] px-4 py-3 text-sm text-white outline-none placeholder:text-white/32 focus:border-[#72d8d4]" placeholder={cashMoveType === "manager_handover" ? "Pl. készpénz átadva személyesen…" : "Pl. bankfiók / automata / megjegyzés…"} />
                </label>

                <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${cashMoveType === "manager_handover" ? "border-orange-200/24 bg-orange-500/8" : "border-[#9be9e5]/22 bg-[#2a8d8b]/8"}`}>
                  <TriangleAlert className="mt-0.5 shrink-0" size={18} />
                  <p className="text-xs leading-relaxed text-white/66">
                    {cashMoveType === "manager_handover"
                      ? "Az összeg addig nem csökken a rendszer szerinti kasszából, amíg a főnök nem igazolja vissza az átvételt. Így nincs több „odaadtam / nem emlékszem” vita."
                      : "A bankbefizetés azonnal csökkenti a kasszát, és a referencia örökre megmarad az auditnaplóban."}
                  </p>
                </div>
              </div>

              <footer className="flex justify-end gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
                <button type="button" disabled={cashMoveSaving} onClick={() => setCashMoveOpen(false)} className="h-11 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm disabled:opacity-45">Mégse</button>
                <button
                  type="button"
                  disabled={cashMoveSaving || !cashMoveAmount.trim() || (cashMoveType === "bank_deposit" && !cashMoveReference.trim())}
                  onClick={() => void createCashMovement()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#b9f5f2]/50 bg-[#2a8d8b] px-5 text-sm text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {cashMoveSaving ? <Loader2 size={17} className="animate-spin" /> : cashMoveType === "manager_handover" ? <WalletCards size={17} /> : <Landmark size={17} />}
                  {cashMoveSaving ? "Rögzítés…" : cashMoveType === "manager_handover" ? "Átadás rögzítése" : "Bankbefizetés rögzítése"}
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
                      <div className="rounded-xl border border-white/10 bg-black/10 p-3"><p className="text-[9px] text-white/38">Műszak forgalma</p><p className="mt-1 text-base text-[#d7fffd]">{formatMoney(handoverShiftPreview?.revenue || 0)}</p></div>
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

        <footer className="flex items-center justify-end border-t border-white/12 bg-[#293548] px-5 py-4">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm text-white hover:bg-white/[0.09]"><X size={17} /> Bezárás</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
