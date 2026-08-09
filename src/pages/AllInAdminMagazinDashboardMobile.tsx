import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Filter,
  Home,
  Image as ImageIcon,
  Loader2,
  Percent,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Store,
  Trash2,
  TrendingUp,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  apiAifAdminDeleteShopSaleLine,
  apiAifAdminShopOverview,
  type AifAdminShopOverviewResponse,
  type AifAdminShopRankingItem,
  type AifAdminShopRecentSale,
  type AifAdminShopSaleLineDeleteMode,
} from "../lib/aif/api";

export type AllInAdminMagazinDashboardMobileProps = {
  actor?: string;
  role?: "admin" | "shop";
  locationCode: string;
  locationName: string;
  cityName: string;
  otherLocationCode: string;
  otherLocationName: string;
  otherCityName: string;
};

type PeriodPreset = "today" | "yesterday" | "last7" | "month" | "lastMonth" | "custom";
type Scope = "all" | "primary" | "other";
type StoreKey = Exclude<Scope, "all">;

type FilterState = {
  from: string;
  to: string;
  employee: string;
  paymentStatus: string;
  saleType: string;
  brand: string;
  category: string;
  search: string;
};

type StoreDataset = {
  key: StoreKey;
  cityName: string;
  locationName: string;
  data: AifAdminShopOverviewResponse | null;
};

type EmployeeRow = AifAdminShopOverviewResponse["employees"][number] & {
  storeKey: StoreKey;
  storeName: string;
};

type MobileSale = AifAdminShopRecentSale & {
  storeKey: StoreKey;
  storeName: string;
  locationName: string;
};

type DeleteTarget = {
  sale: MobileSale;
};

type CombinedSummary = {
  revenue: number;
  salesBeforeDiscount: number;
  transactions: number;
  itemsSold: number;
  averageBasket: number;
  discountTotal: number;
  paidTotal: number;
  unpaidTotal: number;
  unpaidSales: number;
  grossProfit: number;
  grossMargin: number;
};

type SelectOption = { value: string; label: string };

const panel = "rounded-[22px] border border-white/14 bg-[#344154] shadow-[0_14px_34px_rgba(15,23,42,0.18)]";
const inputClass = "h-12 w-full min-w-0 rounded-2xl border border-white/16 bg-[#293649] px-3.5 text-[15px] font-normal text-white outline-none placeholder:text-white/38 focus:border-[#7bd7d4]/60 focus:ring-2 focus:ring-[#7bd7d4]/15 [color-scheme:dark]";

function localIsoDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function presetDates(preset: PeriodPreset) {
  const today = localIsoDate(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === "last7") return { from: addDays(today, -6), to: today };
  if (preset === "month") {
    return {
      from: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`,
      to: today,
    };
  }
  if (preset === "lastMonth") {
    const firstThisMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
    const lastPrevious = new Date(firstThisMonth);
    lastPrevious.setUTCDate(0);
    const firstPrevious = new Date(Date.UTC(lastPrevious.getUTCFullYear(), lastPrevious.getUTCMonth(), 1, 12));
    return {
      from: firstPrevious.toISOString().slice(0, 10),
      to: lastPrevious.toISOString().slice(0, 10),
    };
  }
  return { from: today, to: today };
}

function detectPreset(from: string, to: string): PeriodPreset {
  const candidates: Exclude<PeriodPreset, "custom">[] = ["today", "yesterday", "last7", "month", "lastMonth"];
  const match = candidates.find((candidate) => {
    const dates = presetDates(candidate);
    return dates.from === from && dates.to === to;
  });
  return match || "custom";
}

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

function compactMoney(value: unknown) {
  const amount = numberValue(value);
  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toLocaleString("ro-RO", { maximumFractionDigits: 2 })} M RON`;
  }
  if (Math.abs(amount) >= 10_000) {
    return `${(amount / 1_000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}k RON`;
  }
  return money(amount);
}

function integer(value: unknown) {
  return Math.round(numberValue(value)).toLocaleString("ro-RO");
}

function dateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("hu-HU", {
    timeZone: "Europe/Bucharest",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortDate(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("hu-HU", { month: "short", day: "numeric" });
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function paymentLabel(value: string) {
  if (value === "paid") return "Kifizetve";
  if (value === "partial") return "Részben fizetve";
  if (value === "unpaid") return "Nincs fizetve";
  if (value === "credit") return "Hitel";
  return value || "Ismeretlen";
}

function saleTypeLabel(value: string) {
  if (value === "sale") return "Eladás";
  if (value === "reservation") return "Félretett";
  if (value === "credit") return "Hitel";
  return value || "-";
}

function saleStatusLabel(value: string) {
  if (value === "completed") return "Lezárt";
  if (value === "draft") return "Nyitott";
  if (value === "cancelled") return "Törölt";
  if (value === "refunded") return "Visszáru";
  return value || "-";
}

function paymentBadge(value: string) {
  if (value === "paid") return "border-emerald-200/25 bg-emerald-400/12 text-emerald-50";
  if (value === "partial") return "border-amber-200/30 bg-amber-400/14 text-amber-50";
  if (value === "credit" || value === "unpaid") return "border-rose-200/30 bg-rose-500/16 text-rose-50";
  return "border-white/16 bg-white/[0.06] text-white/65";
}

function statusBadge(value: string) {
  if (value === "completed") return "border-[#7bd7d4]/28 bg-[#2a8d8b]/18 text-[#d5fffd]";
  if (value === "draft") return "border-amber-200/30 bg-amber-400/14 text-amber-50";
  if (value === "cancelled") return "border-rose-200/30 bg-rose-500/16 text-rose-50";
  if (value === "refunded") return "border-violet-200/30 bg-violet-400/14 text-violet-50";
  return "border-white/16 bg-white/[0.06] text-white/65";
}

function emptySummary(): CombinedSummary {
  return {
    revenue: 0,
    salesBeforeDiscount: 0,
    transactions: 0,
    itemsSold: 0,
    averageBasket: 0,
    discountTotal: 0,
    paidTotal: 0,
    unpaidTotal: 0,
    unpaidSales: 0,
    grossProfit: 0,
    grossMargin: 0,
  };
}

function combineSummaries(
  datasets: Array<AifAdminShopOverviewResponse | null>,
  key: "summary" | "previousSummary",
): CombinedSummary {
  const result = emptySummary();
  datasets.forEach((dataset) => {
    const source = dataset?.[key];
    result.revenue += numberValue(source?.revenue);
    result.salesBeforeDiscount += numberValue(source?.salesBeforeDiscount);
    result.transactions += numberValue(source?.transactions);
    result.itemsSold += numberValue(source?.itemsSold);
    result.discountTotal += numberValue(source?.discountTotal);
    result.paidTotal += numberValue(source?.paidTotal);
    result.unpaidTotal += numberValue(source?.unpaidTotal);
    result.unpaidSales += numberValue(source?.unpaidSales);
    result.grossProfit += numberValue(source?.grossProfit);
  });
  result.averageBasket = result.transactions > 0 ? result.revenue / result.transactions : 0;
  result.grossMargin = result.revenue > 0 ? result.grossProfit / result.revenue * 100 : 0;
  return result;
}

function mergeRankings(
  datasets: Array<AifAdminShopOverviewResponse | null>,
  key: "brands" | "categories" | "products",
) {
  const map = new Map<string, AifAdminShopRankingItem>();
  datasets.forEach((dataset) => {
    (dataset?.[key] || []).forEach((item) => {
      const name = String(item.name || "Ismeretlen").trim() || "Ismeretlen";
      const identity = name;
      const previous = map.get(identity);
      map.set(identity, {
        ...item,
        name,
        revenue: numberValue(previous?.revenue) + numberValue(item.revenue),
        qty: numberValue(previous?.qty) + numberValue(item.qty),
      });
    });
  });
  return Array.from(map.values());
}

function uniqueOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "hu"));
}

function MobileSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}) {
  return (
    <div className="relative">
      <select
        className={`${inputClass} appearance-none pr-10`}
        value={value}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value || "__all"} value={option.value}>{option.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-4 text-white/48" size={17} />
    </div>
  );
}

function DeltaPill({ current, previous }: { current: number; previous: number }) {
  const delta = percentChange(current, previous);
  const positive = delta > 0.01;
  const negative = delta < -0.01;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : TrendingUp;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${
      positive
        ? "border-emerald-100/25 bg-emerald-300/13 text-emerald-50"
        : negative
          ? "border-rose-100/25 bg-rose-300/13 text-rose-50"
          : "border-white/16 bg-white/[0.06] text-white/56"
    }`}>
      <Icon size={11} />
      {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
    </span>
  );
}

function KpiCard({
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
  tone?: "normal" | "danger" | "warning" | "success";
}) {
  const toneClass = tone === "danger"
    ? "border-rose-200/22 bg-gradient-to-br from-[#533543] to-[#344154]"
    : tone === "warning"
      ? "border-amber-200/22 bg-gradient-to-br from-[#544c39] to-[#344154]"
      : tone === "success"
        ? "border-emerald-200/22 bg-gradient-to-br from-[#27665b] to-[#344154]"
        : "border-white/14 bg-[#344154]";
  return (
    <article className={`min-w-0 rounded-[20px] border p-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.14)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.12em] text-white/48">{label}</p>
          <p className="mt-2 truncate text-[17px] leading-tight text-white" title={value}>{value}</p>
        </div>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.06] text-[#bff8f5]">
          <Icon size={15} />
        </span>
      </div>
      <p className="mt-2 truncate text-[10px] text-white/44" title={hint}>{hint}</p>
    </article>
  );
}

function StorePerformanceCard({
  cityName,
  locationName,
  data,
  totalRevenue,
  active,
  onClick,
}: {
  cityName: string;
  locationName: string;
  data: AifAdminShopOverviewResponse | null;
  totalRevenue: number;
  active: boolean;
  onClick: () => void;
}) {
  const revenue = numberValue(data?.summary.revenue);
  const share = totalRevenue > 0 ? revenue / totalRevenue * 100 : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-w-0 rounded-[20px] border p-3.5 text-left shadow-[0_12px_30px_rgba(15,23,42,0.15)] transition active:scale-[0.99] ${
        active
          ? "border-[#8ce7e2]/48 bg-gradient-to-br from-[#276c69] via-[#315d63] to-[#344154]"
          : "border-white/14 bg-[#344154]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] text-white/76">{cityName}</p>
          <p className="mt-0.5 truncate text-[9px] text-white/38" title={locationName}>{locationName}</p>
          <p className="mt-2 truncate text-[clamp(1rem,5vw,1.25rem)] text-white" title={money(revenue)}>{compactMoney(revenue)}</p>
        </div>
        {active
          ? <CheckCircle2 size={18} className="shrink-0 text-[#bff8f5]" />
          : <Store size={18} className="shrink-0 text-white/38" />}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#263244]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#70e2dd]"
          style={{ width: `${Math.max(revenue > 0 ? 5 : 0, share)}%` }}
        />
      </div>
      <div className="mt-2.5 space-y-1 text-[10px] text-white/52">
        <div className="flex items-center justify-between gap-2">
          <span>{share.toFixed(1)}%</span>
          <span>{integer(data?.summary.itemsSold)} db</span>
        </div>
        <p className="truncate">{integer(data?.summary.transactions)} lezárt eladás</p>
      </div>
    </button>
  );
}

function RankingList({
  title,
  items,
  mode,
}: {
  title: string;
  items: AifAdminShopRankingItem[];
  mode: "money" | "qty";
}) {
  const sorted = [...items]
    .sort((a, b) => mode === "money"
      ? numberValue(b.revenue) - numberValue(a.revenue)
      : numberValue(b.qty) - numberValue(a.qty))
    .slice(0, 6);
  const max = Math.max(1, ...sorted.map((item) => mode === "money" ? numberValue(item.revenue) : numberValue(item.qty)));

  return (
    <div className="rounded-2xl border border-white/10 bg-[#2b3749] p-3.5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-white/46">{title}</p>
      <div className="mt-3 space-y-3">
        {sorted.map((item, index) => {
          const value = mode === "money" ? numberValue(item.revenue) : numberValue(item.qty);
          return (
            <div key={`${item.name}-${index}`}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-white/78">{index + 1}. {item.name}</span>
                <span className="shrink-0 text-white">{mode === "money" ? compactMoney(value) : `${integer(value)} db`}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#212c3d]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#6ee7df]"
                  style={{ width: `${Math.max(4, value / max * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
        {!sorted.length ? <p className="py-4 text-center text-xs text-white/40">Nincs rangsorolható adat.</p> : null}
      </div>
    </div>
  );
}

function SaleImage({
  src,
  alt,
  onOpen,
}: {
  src?: string | null;
  alt: string;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div className="grid h-[66px] w-[66px] shrink-0 place-items-center rounded-2xl border border-white/12 bg-[#263244] text-white/30">
        <ImageIcon size={20} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-[66px] w-[66px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/14 bg-white shadow-sm active:scale-[0.98]"
      aria-label="Termékkép nagyítása"
    >
      <img src={src} alt={alt} className="h-full w-full object-contain" loading="lazy" onError={() => setFailed(true)} />
    </button>
  );
}

export default function AllInAdminMagazinDashboardMobile({
  actor = "ADMIN",
  locationCode,
  locationName,
  cityName,
  otherLocationCode,
  otherLocationName,
  otherCityName,
}: AllInAdminMagazinDashboardMobileProps) {
  const initialDates = useMemo(() => presetDates("today"), []);
  const initialFilters = useMemo<FilterState>(() => ({
    from: initialDates.from,
    to: initialDates.to,
    employee: "",
    paymentStatus: "",
    saleType: "",
    brand: "",
    category: "",
    search: "",
  }), [initialDates.from, initialDates.to]);

  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [scope, setScope] = useState<Scope>("all");
  const [draft, setDraft] = useState<FilterState>(initialFilters);
  const [applied, setApplied] = useState<FilterState>(initialFilters);
  const [primaryData, setPrimaryData] = useState<AifAdminShopOverviewResponse | null>(null);
  const [otherData, setOtherData] = useState<AifAdminShopOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterError, setFilterError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showAllEmployees, setShowAllEmployees] = useState(false);
  const [showAllSales, setShowAllSales] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ src: string; alt: string } | null>(null);
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    setError("");

    const [primaryResult, otherResult] = await Promise.allSettled([
      apiAifAdminShopOverview({ location: locationCode, ...applied }),
      apiAifAdminShopOverview({ location: otherLocationCode, ...applied }),
    ]);

    if (loadId !== loadIdRef.current) return;

    const messages: string[] = [];
    if (primaryResult.status === "fulfilled") {
      setPrimaryData(primaryResult.value);
    } else {
      setPrimaryData(null);
      messages.push(`${cityName} adatai nem tölthetők be.`);
    }

    if (otherResult.status === "fulfilled") {
      setOtherData(otherResult.value);
    } else {
      setOtherData(null);
      messages.push(`${otherCityName} adatai nem tölthetők be.`);
    }

    if (messages.length === 2) {
      const reason = primaryResult.status === "rejected"
        ? primaryResult.reason
        : otherResult.status === "rejected"
          ? otherResult.reason
          : null;
      setError(reason?.message || "Az üzleti adatok nem tölthetők be.");
    } else if (messages.length === 1) {
      setError(`${messages[0]} A másik üzlet adatai ettől még láthatók.`);
    }

    setLoading(false);
  }, [applied, cityName, locationCode, otherCityName, otherLocationCode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const modalOpen = filtersOpen || Boolean(deleteTarget) || Boolean(imagePreview);
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [deleteTarget, filtersOpen, imagePreview]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (imagePreview) setImagePreview(null);
      else if (deleteTarget && !deleteSaving) setDeleteTarget(null);
      else if (filtersOpen) setFiltersOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [deleteSaving, deleteTarget, filtersOpen, imagePreview]);

  const stores = useMemo<StoreDataset[]>(() => [
    {
      key: "primary",
      cityName,
      locationName,
      data: primaryData,
    },
    {
      key: "other",
      cityName: otherCityName,
      locationName: otherLocationName,
      data: otherData,
    },
  ], [cityName, locationCode, locationName, otherCityName, otherData, otherLocationCode, otherLocationName, primaryData]);

  const scopedStores = useMemo(() => {
    if (scope === "all") return stores;
    return stores.filter((store) => store.key === scope);
  }, [scope, stores]);

  const scopedData = useMemo(() => scopedStores.map((store) => store.data), [scopedStores]);
  const summary = useMemo(() => combineSummaries(scopedData, "summary"), [scopedData]);
  const previousSummary = useMemo(() => combineSummaries(scopedData, "previousSummary"), [scopedData]);
  const networkRevenue = numberValue(primaryData?.summary.revenue) + numberValue(otherData?.summary.revenue);
  const scopeLabel = scope === "all" ? "Mindkét üzlet" : scope === "primary" ? cityName : otherCityName;
  const periodLabel = applied.from === applied.to
    ? shortDate(applied.from)
    : `${shortDate(applied.from)} – ${shortDate(applied.to)}`;

  const filterOptions = useMemo(() => ({
    employees: uniqueOptions([
      ...(primaryData?.filterOptions.employees || []),
      ...(otherData?.filterOptions.employees || []),
    ]),
    brands: uniqueOptions([
      ...(primaryData?.filterOptions.brands || []),
      ...(otherData?.filterOptions.brands || []),
    ]),
    categories: uniqueOptions([
      ...(primaryData?.filterOptions.categories || []),
      ...(otherData?.filterOptions.categories || []),
    ]),
  }), [otherData, primaryData]);

  const activeAdvancedFilterCount = [
    applied.employee,
    applied.paymentStatus,
    applied.saleType,
    applied.brand,
    applied.category,
    applied.search,
  ].filter(Boolean).length + (preset === "custom" ? 1 : 0);

  const employees = useMemo<EmployeeRow[]>(() => {
    return scopedStores
      .flatMap((store) => (store.data?.employees || []).map((employee) => ({
        ...employee,
        storeKey: store.key,
        storeName: store.cityName,
      })))
      .sort((a, b) => numberValue(b.revenue) - numberValue(a.revenue));
  }, [scopedStores]);

  const recentSales = useMemo<MobileSale[]>(() => {
    return scopedStores
      .flatMap((store) => (store.data?.recentSales || []).map((sale) => ({
        ...sale,
        storeKey: store.key,
        storeName: store.cityName,
        locationName: store.locationName,
      })))
      .sort((a, b) => {
        const aTime = new Date(a.soldAt || 0).getTime();
        const bTime = new Date(b.soldAt || 0).getTime();
        return bTime - aTime;
      });
  }, [scopedStores]);

  const brands = useMemo(() => mergeRankings(scopedData, "brands"), [scopedData]);
  const categories = useMemo(() => mergeRankings(scopedData, "categories"), [scopedData]);
  const products = useMemo(() => mergeRankings(scopedData, "products"), [scopedData]);

  const paymentTotals = useMemo(() => {
    const map = new Map<string, { method: string; label: string; amount: number }>();
    scopedData.forEach((dataset) => {
      (dataset?.payments || []).forEach((item) => {
        const key = String(item.method || item.label || "unknown");
        const previous = map.get(key);
        map.set(key, {
          method: key,
          label: item.label || previous?.label || key,
          amount: numberValue(previous?.amount) + numberValue(item.amount),
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [scopedData]);

  const visibleEmployees = showAllEmployees ? employees : employees.slice(0, 6);
  const visibleSales = showAllSales ? recentSales : recentSales.slice(0, 12);
  const maxEmployeeRevenue = Math.max(1, ...employees.map((item) => numberValue(item.revenue)));

  function applyPreset(nextPreset: Exclude<PeriodPreset, "custom">) {
    const dates = presetDates(nextPreset);
    const next = { ...draft, ...dates };
    setPreset(nextPreset);
    setDraft(next);
    setApplied(next);
    setFilterError("");
    setShowAllSales(false);
  }

  function applyFilters() {
    if (!draft.from || !draft.to) {
      setFilterError("Az időszak kezdete és vége kötelező.");
      return;
    }
    if (draft.from > draft.to) {
      setFilterError("A kezdő dátum nem lehet későbbi a záró dátumnál.");
      return;
    }
    setPreset(detectPreset(draft.from, draft.to));
    setApplied({ ...draft, search: draft.search.trim() });
    setFilterError("");
    setFiltersOpen(false);
    setShowAllSales(false);
  }

  function resetFilters() {
    const dates = presetDates("today");
    const next: FilterState = {
      from: dates.from,
      to: dates.to,
      employee: "",
      paymentStatus: "",
      saleType: "",
      brand: "",
      category: "",
      search: "",
    };
    setPreset("today");
    setDraft(next);
    setApplied(next);
    setFilterError("");
    setFiltersOpen(false);
    setShowAllSales(false);
  }

  async function deleteSaleLine(mode: AifAdminShopSaleLineDeleteMode) {
    if (!deleteTarget || deleteSaving) return;
    setDeleteSaving(true);
    setError("");
    try {
      await apiAifAdminDeleteShopSaleLine(deleteTarget.sale.lineId, mode);
      setDeleteTarget(null);
      await load();
    } catch (deleteError: any) {
      setError(deleteError?.message || "Az eladási sor törlése nem sikerült.");
    } finally {
      setDeleteSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#5a6575] via-[#505b6b] to-[#454f5e] text-white">
      <div className="mx-auto w-full max-w-[760px] pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-40 border-b border-white/12 bg-[#2d394b]/96 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-[0_14px_34px_rgba(15,23,42,0.28)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#8ce7e2]/34 bg-[#2a8d8b]/22 text-[#d7fffd]">
              <Building2 size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.16em] text-[#bff8f5]/58">Vezetői eladások</p>
              <h1 className="mt-0.5 truncate text-lg leading-tight text-white">AllInFashion</h1>
              <p className="mt-0.5 truncate text-[11px] text-white/48">{periodLabel} • {actor}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setFilterError(""); setFiltersOpen(true); }}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-white/[0.055] text-white active:scale-[0.97]"
                aria-label="Szűrők"
              >
                <Filter size={17} />
                {activeAdvancedFilterCount > 0 ? (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border border-[#2d394b] bg-[#2a8d8b] px-1 text-[9px] text-white">
                    {activeAdvancedFilterCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-white/[0.055] text-white active:scale-[0.97] disabled:opacity-45"
                aria-label="Frissítés"
              >
                <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
              </button>
              <button
                type="button"
                onClick={() => { window.location.hash = "#home"; }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-white/[0.055] text-white active:scale-[0.97]"
                aria-label="Kezdőlap"
              >
                <Home size={17} />
              </button>
            </div>
          </div>

          <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {([
              ["today", "Ma"],
              ["yesterday", "Tegnap"],
              ["last7", "7 nap"],
              ["month", "Hónap"],
              ["lastMonth", "Előző hónap"],
            ] as Array<[Exclude<PeriodPreset, "custom">, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => applyPreset(value)}
                className={`h-9 shrink-0 rounded-xl border px-3 text-[11px] transition active:scale-[0.98] ${
                  preset === value
                    ? "border-[#8ce7e2]/44 bg-[#2a8d8b] text-white"
                    : "border-white/12 bg-white/[0.045] text-white/58"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="space-y-3 px-3 py-3">
          {error ? (
            <div className="rounded-2xl border border-rose-200/28 bg-rose-500/14 px-3.5 py-3 text-sm leading-relaxed text-rose-50">
              {error}
            </div>
          ) : null}

          <section className="overflow-hidden rounded-[24px] border border-[#9be9e5]/30 bg-gradient-to-br from-[#227c72] via-[#2d6968] to-[#344154] p-4 shadow-[0_18px_42px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#d7fffd]/62">{scopeLabel} forgalma</p>
                <p className="mt-2 break-words text-[clamp(1.75rem,8.7vw,2.5rem)] leading-none tracking-tight text-white">{money(summary.revenue)}</p>
              </div>
              <DeltaPill current={summary.revenue} previous={previousSummary.revenue} />
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/14 rounded-2xl border border-white/12 bg-black/10 py-3 text-center">
              <div className="min-w-0 px-2">
                <p className="text-[9px] uppercase tracking-[0.09em] text-white/45">Eladás</p>
                <p className="mt-1 truncate text-base text-white">{integer(summary.transactions)}</p>
              </div>
              <div className="min-w-0 px-2">
                <p className="text-[9px] uppercase tracking-[0.09em] text-white/45">Darab</p>
                <p className="mt-1 truncate text-base text-white">{integer(summary.itemsSold)}</p>
              </div>
              <div className="min-w-0 px-2">
                <p className="text-[9px] uppercase tracking-[0.09em] text-white/45">Átlagkosár</p>
                <p className="mt-1 truncate text-sm text-white" title={money(summary.averageBasket)}>{compactMoney(summary.averageBasket)}</p>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-end justify-between gap-3 px-0.5">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Üzletek összehasonlítása</p>
                <h2 className="mt-0.5 text-base text-white">Melyik üzlet mennyit árult?</h2>
              </div>
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] ${scope === "all" ? "border-[#8ce7e2]/40 bg-[#2a8d8b] text-white" : "border-white/12 bg-white/[0.04] text-white/52"}`}
              >
                Mindkettő
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <StorePerformanceCard
                cityName={cityName}
                locationName={locationName}
                data={primaryData}
                totalRevenue={networkRevenue}
                active={scope === "primary"}
                onClick={() => setScope((current) => current === "primary" ? "all" : "primary")}
              />
              <StorePerformanceCard
                cityName={otherCityName}
                locationName={otherLocationName}
                data={otherData}
                totalRevenue={networkRevenue}
                active={scope === "other"}
                onClick={() => setScope((current) => current === "other" ? "all" : "other")}
              />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2.5">
            <KpiCard
              label="Fizetve"
              value={compactMoney(summary.paidTotal)}
              hint="Rögzített befizetés"
              icon={CircleDollarSign}
              tone="success"
            />
            <KpiCard
              label="Kintlévőség"
              value={compactMoney(summary.unpaidTotal)}
              hint={`${integer(summary.unpaidSales)} nyitott fizetés`}
              icon={WalletCards}
              tone={summary.unpaidTotal > 0 ? "danger" : "normal"}
            />
            <KpiCard
              label="Kedvezmény"
              value={compactMoney(summary.discountTotal)}
              hint={`${summary.salesBeforeDiscount > 0 ? (summary.discountTotal / summary.salesBeforeDiscount * 100).toFixed(1) : "0.0"}% a listaárból`}
              icon={Percent}
              tone={summary.discountTotal > 0 ? "warning" : "normal"}
            />
            <KpiCard
              label="Becsült árrés"
              value={`${summary.grossMargin.toFixed(1)}%`}
              hint={`${compactMoney(summary.grossProfit)} becsült eredmény`}
              icon={TrendingUp}
              tone="success"
            />
          </section>

          <section className={`${panel} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Csapat</p>
                <h2 className="mt-0.5 text-base text-white">Ki mennyit adott el?</h2>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 text-[#bff8f5]">
                <UsersRound size={17} />
              </span>
            </div>

            <div className="divide-y divide-white/8">
              {visibleEmployees.map((item, index) => {
                const revenue = numberValue(item.revenue);
                return (
                  <div key={`${item.storeKey}-${item.actor}-${index}`} className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/12 bg-[#293649] text-sm text-[#bff8f5]">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm text-white">{item.actor || "Névtelen eladó"}</p>
                          <span className="shrink-0 rounded-full border border-white/12 bg-white/[0.045] px-2 py-0.5 text-[9px] text-white/52">{item.storeName}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#253143]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#6ee7df]"
                            style={{ width: `${Math.max(revenue > 0 ? 4 : 0, revenue / maxEmployeeRevenue * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-[10px] text-white/42">
                          {integer(item.transactions)} eladás • {integer(item.itemsSold)} db • átlag {compactMoney(numberValue(item.transactions) > 0 ? revenue / numberValue(item.transactions) : 0)}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-sm text-white">{compactMoney(revenue)}</p>
                    </div>
                  </div>
                );
              })}

              {!employees.length ? (
                <div className="px-4 py-9 text-center text-xs text-white/42">Nincs eladói teljesítményadat ebben az időszakban.</div>
              ) : null}
            </div>

            {employees.length > 6 ? (
              <button
                type="button"
                onClick={() => setShowAllEmployees((current) => !current)}
                className="flex w-full items-center justify-center gap-2 border-t border-white/10 bg-[#2d394b] px-4 py-3 text-xs text-[#bff8f5] active:bg-[#334256]"
              >
                {showAllEmployees ? "Kevesebb eladó" : `Minden eladó (${employees.length})`}
                <ChevronDown size={14} className={showAllEmployees ? "rotate-180" : ""} />
              </button>
            ) : null}
          </section>

          <section className={`${panel} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Eladási napló</p>
                <h2 className="mt-0.5 text-base text-white">Egyenként minden eladott termék</h2>
              </div>
              <span className="rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/52">{recentSales.length} sor</span>
            </div>

            <div className="space-y-2.5 p-3">
              {visibleSales.map((sale) => (
                <article key={`${sale.storeKey}-${sale.lineId}`} className="rounded-[20px] border border-white/11 bg-[#2a3648] p-3 shadow-[0_8px_22px_rgba(15,23,42,0.14)]">
                  <div className="flex items-center justify-between gap-3 text-[10px] text-white/44">
                    <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                      <Store size={12} className="shrink-0 text-[#8ee6e2]" />
                      <span className="truncate">{sale.storeName}</span>
                    </span>
                    <span className="shrink-0">{dateTime(sale.soldAt)}</span>
                  </div>

                  <div className="mt-2.5 flex items-start gap-3">
                    <SaleImage
                      src={sale.imageUrl}
                      alt={sale.productTitle || sale.saleNumber}
                      onOpen={() => {
                        if (sale.imageUrl) setImagePreview({ src: sale.imageUrl, alt: sale.productTitle || sale.saleNumber });
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[14px] leading-snug text-white">{sale.productTitle || "Nincs mentett terméknév"}</p>
                      <p className="mt-1 line-clamp-1 text-[10px] text-white/46">
                        {[sale.brandName, sale.subcategoryName, sale.colorName, sale.size].filter(Boolean).join(" • ") || "Nincs további termékadat"}
                      </p>
                      <p className="mt-1 line-clamp-1 text-[10px] text-[#9be9e5]/64">
                        {[sale.productCode ? `Kód: ${sale.productCode}` : "", sale.barcode ? `Vonalkód: ${sale.barcode}` : ""].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="inline-flex min-w-10 justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 px-2 py-1.5 text-sm text-[#d5fffd]">{integer(sale.quantity)} db</span>
                      <p className="mt-2 text-sm text-white">{money(sale.lineTotal)}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-[#263244] p-2.5 text-[10px]">
                    <div className="min-w-0">
                      <p className="text-white/38">Eladó</p>
                      <p className="mt-0.5 truncate text-white/78">{sale.actor || "-"}</p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-white/38">Bizonylat</p>
                      <p className="mt-0.5 truncate text-white/78">{sale.saleNumber}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white/38">Kliens</p>
                      <p className="mt-0.5 truncate text-white/62">{sale.customerName || "Nincs kliens"}</p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-white/38">Típus</p>
                      <p className="mt-0.5 truncate text-white/62">{saleTypeLabel(sale.saleType)}</p>
                    </div>
                  </div>

                  {(numberValue(sale.balanceDue) > 0 || numberValue(sale.lineDiscountAmount) > 0) ? (
                    <div className="mt-2.5 flex flex-wrap gap-2 text-[10px]">
                      {numberValue(sale.balanceDue) > 0 ? (
                        <span className="rounded-full border border-rose-200/25 bg-rose-500/14 px-2.5 py-1 text-rose-50">Hátralévő: {money(sale.balanceDue)}</span>
                      ) : null}
                      {numberValue(sale.lineDiscountAmount) > 0 ? (
                        <span className="rounded-full border border-amber-200/25 bg-amber-400/12 px-2.5 py-1 text-amber-50">Kedvezmény: {money(sale.lineDiscountAmount)}</span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/8 pt-3">
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      <span className={`rounded-full border px-2 py-1 text-[9px] ${statusBadge(sale.status)}`}>{saleStatusLabel(sale.status)}</span>
                      <span className={`rounded-full border px-2 py-1 text-[9px] ${paymentBadge(sale.paymentStatus)}`}>{paymentLabel(sale.paymentStatus)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ sale })}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-rose-300/38 bg-rose-600 px-3 text-[11px] text-white active:scale-[0.98]"
                    >
                      <Trash2 size={13} /> Törlés
                    </button>
                  </div>
                </article>
              ))}

              {!recentSales.length ? (
                <div className="px-3 py-10 text-center">
                  <ReceiptText className="mx-auto text-[#7bd7d4]/52" size={28} />
                  <p className="mt-2 text-sm text-white">Nincs eladás ebben az időszakban.</p>
                  <p className="mt-1 text-xs text-white/40">A kiválasztott üzlet és szűrés alapján nincs megjeleníthető terméksor.</p>
                </div>
              ) : null}
            </div>

            {recentSales.length > 12 ? (
              <button
                type="button"
                onClick={() => setShowAllSales((current) => !current)}
                className="flex w-full items-center justify-center gap-2 border-t border-white/10 bg-[#2d394b] px-4 py-3 text-xs text-[#bff8f5] active:bg-[#334256]"
              >
                {showAllSales ? "Kevesebb eladás" : `Minden eladási sor (${recentSales.length})`}
                <ChevronDown size={14} className={showAllSales ? "rotate-180" : ""} />
              </button>
            ) : null}
          </section>

          <section className={`${panel} overflow-hidden`}>
            <button
              type="button"
              onClick={() => setDetailsOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left active:bg-white/[0.035]"
            >
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Másodlagos adatok</p>
                <h2 className="mt-0.5 text-base text-white">Fizetések és toplisták</h2>
              </div>
              <ChevronDown size={18} className={`text-white/48 transition ${detailsOpen ? "rotate-180" : ""}`} />
            </button>

            {detailsOpen ? (
              <div className="space-y-3 border-t border-white/10 p-3">
                <div className="rounded-2xl border border-white/10 bg-[#2b3749] p-3.5">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/46">Fizetési megoszlás</p>
                  <div className="mt-3 space-y-2">
                    {paymentTotals.slice(0, 8).map((item) => (
                      <div key={item.method} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2.5 text-xs">
                        <span className="min-w-0 truncate text-white/68">{item.label}</span>
                        <span className="shrink-0 text-white">{money(item.amount)}</span>
                      </div>
                    ))}
                    {!paymentTotals.length ? <p className="py-4 text-center text-xs text-white/40">Nincs rögzített fizetés.</p> : null}
                  </div>
                </div>
                <RankingList title="Márkák forgalom szerint" items={brands} mode="money" />
                <RankingList title="Alkategóriák darab szerint" items={categories} mode="qty" />
                <RankingList title="Top termékek forgalom szerint" items={products} mode="money" />
              </div>
            ) : null}
          </section>

          <section className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setScope("all")}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#8ce7e2]/30 bg-[#2a8d8b] px-3 text-xs text-white active:scale-[0.98]"
            >
              <Store size={15} /> Mindkét üzlet
            </button>
            <button
              type="button"
              onClick={() => { window.location.hash = "#home"; }}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/14 bg-[#344154] px-3 text-xs text-white active:scale-[0.98]"
            >
              <ArrowLeft size={15} /> Kezdőlap
            </button>
          </section>
        </div>
      </div>

      {filtersOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end bg-slate-950/72 backdrop-blur-sm"
          onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
            if (event.currentTarget === event.target) setFiltersOpen(false);
          }}
        >
          <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border-x border-t border-white/18 bg-[#303c4f] pb-[env(safe-area-inset-bottom)] shadow-[0_-28px_80px_rgba(0,0,0,0.46)]">
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[#303c4f]/96 px-4 py-4 backdrop-blur-xl">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Részletes szűrés</p>
                <h2 className="mt-0.5 text-lg text-white">Csak amikor tényleg kell</h2>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] text-white"
                aria-label="Bezárás"
              >
                <X size={18} />
              </button>
            </header>

            <div className="space-y-4 p-4">
              {filterError ? (
                <div className="rounded-xl border border-rose-200/28 bg-rose-500/14 px-3 py-2.5 text-sm text-rose-50">{filterError}</div>
              ) : null}

              <div className="grid grid-cols-2 gap-2.5">
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                  Ettől
                  <input className={inputClass} type="date" value={draft.from} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, from: event.target.value })} />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                  Eddig
                  <input className={inputClass} type="date" value={draft.to} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, to: event.target.value })} />
                </label>
              </div>

              <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                Eladó
                <MobileSelect
                  value={draft.employee}
                  onChange={(value) => setDraft({ ...draft, employee: value })}
                  options={[{ value: "", label: "Minden eladó" }, ...filterOptions.employees.map((value) => ({ value, label: value }))]}
                />
              </label>

              <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                  Fizetés
                  <MobileSelect
                    value={draft.paymentStatus}
                    onChange={(value) => setDraft({ ...draft, paymentStatus: value })}
                    options={[
                      { value: "", label: "Minden fizetés" },
                      { value: "paid", label: "Kifizetve" },
                      { value: "partial", label: "Részben fizetve" },
                      { value: "unpaid", label: "Nincs fizetve" },
                      { value: "credit", label: "Hitel" },
                    ]}
                  />
                </label>
                <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                  Típus
                  <MobileSelect
                    value={draft.saleType}
                    onChange={(value) => setDraft({ ...draft, saleType: value })}
                    options={[
                      { value: "", label: "Minden eladás" },
                      { value: "sale", label: "Normál eladás" },
                      { value: "reservation", label: "Félretett" },
                      { value: "credit", label: "Hitel" },
                    ]}
                  />
                </label>
              </div>

              <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                Márka
                <MobileSelect
                  value={draft.brand}
                  onChange={(value) => setDraft({ ...draft, brand: value })}
                  options={[{ value: "", label: "Minden márka" }, ...filterOptions.brands.map((value) => ({ value, label: value }))]}
                />
              </label>

              <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                Alkategória
                <MobileSelect
                  value={draft.category}
                  onChange={(value) => setDraft({ ...draft, category: value })}
                  options={[{ value: "", label: "Minden alkategória" }, ...filterOptions.categories.map((value) => ({ value, label: value }))]}
                />
              </label>

              <label className="grid gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/48">
                Keresés
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-4 text-white/36" size={17} />
                  <input
                    className={`${inputClass} pl-10`}
                    value={draft.search}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, search: event.target.value })}
                    onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                      if (event.key === "Enter") applyFilters();
                    }}
                    placeholder="Bizonylat, kliens, termék..."
                  />
                </div>
              </label>
            </div>

            <footer className="sticky bottom-0 grid grid-cols-[0.9fr_1.4fr] gap-2 border-t border-white/10 bg-[#293548]/98 px-4 py-3 backdrop-blur-xl">
              <button
                type="button"
                onClick={resetFilters}
                className="h-12 rounded-2xl border border-white/14 bg-white/[0.05] px-3 text-xs text-white active:scale-[0.98]"
              >
                Alaphelyzet
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#8ce7e2]/42 bg-[#2a8d8b] px-4 text-sm text-white active:scale-[0.98]"
              >
                <Search size={16} /> Alkalmazás
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[260] flex items-end bg-slate-950/82 backdrop-blur-sm"
          onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
            if (event.currentTarget === event.target && !deleteSaving) setDeleteTarget(null);
          }}
        >
          <section className="w-full rounded-t-[28px] border-x border-t border-white/18 bg-[#303a4c] pb-[env(safe-area-inset-bottom)] shadow-[0_-30px_90px_rgba(0,0,0,0.58)]">
            <header className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#4b2834] to-[#303a4c] px-4 py-4">
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.14em] text-rose-100/58">Eladási sor törlése</p>
                <h3 className="mt-1 line-clamp-2 text-lg leading-snug text-white">{deleteTarget.sale.productTitle || deleteTarget.sale.saleNumber}</h3>
                <p className="mt-1 text-[11px] text-white/48">{deleteTarget.sale.storeName} • {dateTime(deleteTarget.sale.soldAt)} • {integer(deleteTarget.sale.quantity)} db</p>
              </div>
              <button
                type="button"
                disabled={deleteSaving}
                onClick={() => setDeleteTarget(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.05] text-white disabled:opacity-45"
                aria-label="Bezárás"
              >
                <X size={18} />
              </button>
            </header>

            <div className="space-y-2.5 p-4">
              <p className="pb-1 text-sm text-white/72">Mit csináljon a rendszer a készlettel?</p>
              <button
                type="button"
                disabled={deleteSaving}
                onClick={() => void deleteSaleLine("restore_stock")}
                className="flex w-full items-start gap-3 rounded-2xl border border-[#9be9e5]/42 bg-[#2a8d8b] p-4 text-left text-white active:scale-[0.99] disabled:opacity-50"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/24 bg-black/10">
                  {deleteSaving ? <Loader2 size={19} className="animate-spin" /> : <RotateCcw size={19} />}
                </span>
                <span>
                  <strong className="block text-sm font-normal">Törlés + készlet visszaállítása</strong>
                  <span className="mt-1 block text-xs leading-relaxed text-white/72">{integer(deleteTarget.sale.quantity)} db visszakerül a(z) {deleteTarget.sale.locationName} készletébe.</span>
                </span>
              </button>

              <button
                type="button"
                disabled={deleteSaving}
                onClick={() => void deleteSaleLine("permanent")}
                className="flex w-full items-start gap-3 rounded-2xl border border-rose-300/48 bg-rose-600 p-4 text-left text-white active:scale-[0.99] disabled:opacity-50"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/24 bg-black/10">
                  {deleteSaving ? <Loader2 size={19} className="animate-spin" /> : <Trash2 size={19} />}
                </span>
                <span>
                  <strong className="block text-sm font-normal">Végleges törlés</strong>
                  <span className="mt-1 block text-xs leading-relaxed text-white/76">Az eladási sor eltűnik, a jelenlegi készlethez a rendszer nem nyúl.</span>
                </span>
              </button>

              <p className="rounded-xl border border-white/10 bg-[#273243] px-3 py-2.5 text-[11px] leading-relaxed text-white/48">
                Többtermékes bizonylatnál csak ez a terméksor törlődik. Az utolsó terméksor törlésekor maga a bizonylat is megszűnik.
              </p>
            </div>
          </section>
        </div>
      ) : null}

      {imagePreview ? (
        <div
          className="fixed inset-0 z-[300] grid place-items-center bg-slate-950/94 p-4 backdrop-blur-sm"
          onClick={() => setImagePreview(null)}
        >
          <button
            type="button"
            onClick={() => setImagePreview(null)}
            className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/18 bg-white/[0.08] text-white"
            aria-label="Bezárás"
          >
            <X size={20} />
          </button>
          <div className="w-full max-w-[560px]" onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}>
            <div className="grid max-h-[72dvh] min-h-[260px] place-items-center overflow-hidden rounded-[24px] border border-white/16 bg-white p-3 shadow-2xl">
              <img src={imagePreview.src} alt={imagePreview.alt} className="max-h-[68dvh] max-w-full object-contain" />
            </div>
            <p className="mt-3 line-clamp-2 text-center text-sm text-white/72">{imagePreview.alt}</p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="fixed inset-0 z-[180] grid place-items-center bg-slate-950/28 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/18 bg-[#263348] px-5 py-4 shadow-2xl">
            <Loader2 className="animate-spin text-[#8ee6e2]" size={22} />
            <span className="text-sm text-white">Eladási adatok betöltése...</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
