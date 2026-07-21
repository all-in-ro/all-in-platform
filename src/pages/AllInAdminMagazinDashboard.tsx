import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Filter,
  Home,
  Layers3,
  Loader2,
  PackageCheck,
  Percent,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Tags,
  TrendingUp,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  apiAifAdminShopOverview,
  type AifAdminShopOverviewResponse,
  type AifAdminShopRankingItem,
} from "../lib/aif/api";

export type AllInAdminMagazinDashboardProps = {
  actor?: string;
  role?: "admin" | "shop";
  locationCode: string;
  locationName: string;
  cityName: string;
  otherCityHash: string;
  otherCityName: string;
};

type SelectOption = { value: string; label: string };
type PeriodPreset = "today" | "yesterday" | "last7" | "month" | "lastMonth" | "custom";

const card = "rounded-[22px] border border-white/16 bg-[#344154] shadow-[0_14px_34px_rgba(15,23,42,0.18)]";
const button = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45";
const primaryButton = `${button} border-[#8ce7e2]/40 bg-[#2a8d8b] hover:bg-[#319c99]`;
const neutralButton = `${button} border-white/18 bg-[#3d495b] hover:bg-[#465467]`;
const inputClass = "h-10 min-w-0 w-full rounded-xl border border-white/18 bg-[#2d394b] px-3 text-sm font-normal text-white outline-none placeholder:text-white/38 focus:border-[#7bd7d4]/60 focus:ring-2 focus:ring-[#7bd7d4]/15 [color-scheme:dark]";

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
    const from = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: today };
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

function dateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("hu-HU", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function SmartSelect({
  value,
  options,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.value === value);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const roomBelow = window.innerHeight - rect.bottom;
    if (roomBelow < 260 && rect.top > roomBelow) {
      setPosition({ left, width, bottom: Math.max(8, window.innerHeight - rect.top + 6) });
    } else {
      setPosition({ left, width, top: rect.bottom + 6 });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reposition = () => updatePosition();
    document.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        className="flex h-10 min-w-0 w-full items-center justify-between gap-2 overflow-hidden rounded-xl border border-white/18 bg-[#2d394b] px-3 text-left text-sm font-normal text-white outline-none transition hover:bg-[#344256] focus:border-[#7bd7d4]/60 focus:ring-2 focus:ring-[#7bd7d4]/15"
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
      >
        <span title={selected?.label || placeholder} className={selected ? "min-w-0 flex-1 truncate text-white" : "min-w-0 flex-1 truncate text-white/42"}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-white/52 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && position && createPortal(
        <div
          ref={menuRef}
          className="overflow-hidden rounded-xl border border-[#7bd7d4]/40 bg-[#253449] p-1 shadow-[0_22px_54px_rgba(2,6,23,0.65)]"
          style={{
            position: "fixed",
            zIndex: 500,
            left: position.left,
            width: position.width,
            top: position.top,
            bottom: position.bottom,
          }}
        >
          <div className="max-h-64 overflow-y-auto">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__all"}
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-normal transition ${
                    active ? "bg-[#2a8d8b] text-white" : "bg-[#344154] text-white/78 hover:bg-[#435168]"
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{option.label}</span>
                  <CheckCircle2 size={13} className={active ? "opacity-100" : "opacity-0"} />
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const delta = percentChange(current, previous);
  const positive = delta > 0.01;
  const negative = delta < -0.01;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : TrendingUp;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${
      positive
        ? "border-emerald-200/22 bg-emerald-400/10 text-emerald-50"
        : negative
          ? "border-rose-200/22 bg-rose-400/10 text-rose-50"
          : "border-white/12 bg-white/[0.05] text-white/50"
    }`}>
      <Icon size={11} />
      {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
    </span>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  current,
  previous,
  tone = "normal",
}: {
  title: string;
  value: string;
  hint: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  current: number;
  previous: number;
  tone?: "normal" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-200/25 bg-gradient-to-br from-[#593544] to-[#3d394b]"
      : tone === "warning"
        ? "border-amber-200/24 bg-gradient-to-br from-[#5a5039] to-[#3d4452]"
        : "border-white/16 bg-gradient-to-br from-[#3c495c] to-[#344154]";

  return (
    <article className={`min-w-0 rounded-[20px] border p-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.16)] ${toneClass}`}>
      <div className="flex min-w-0 items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/48">{title}</p>
          <p className="mt-2 whitespace-nowrap text-[clamp(1rem,1.3vw,1.38rem)] leading-tight tracking-tight text-white">{value}</p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#bff8f5]">
          <Icon size={17} />
        </span>
      </div>
      <div className="mt-2.5 flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10px] text-white/48" title={hint}>{hint}</span>
        <DeltaBadge current={current} previous={previous} />
      </div>
    </article>
  );
}

function RevenueChart({ data }: { data: AifAdminShopOverviewResponse["trend"] }) {
  const width = 840;
  const height = 290;
  const paddingX = 44;
  const paddingTop = 24;
  const paddingBottom = 44;
  const maxValue = Math.max(1, ...data.map((item) => numberValue(item.revenue)));
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingTop - paddingBottom;
  const points = data.map((item, index) => {
    const x = data.length <= 1 ? width / 2 : paddingX + index * (usableWidth / (data.length - 1));
    const y = paddingTop + usableHeight - (numberValue(item.revenue) / maxValue) * usableHeight;
    return { x, y, item };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const area = points.length
    ? `${line} L ${points[points.length - 1].x.toFixed(2)} ${(paddingTop + usableHeight).toFixed(2)} L ${points[0].x.toFixed(2)} ${(paddingTop + usableHeight).toFixed(2)} Z`
    : "";
  const labelStep = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#2a3547] p-3">
      {!data.length || data.every((item) => numberValue(item.revenue) === 0) ? (
        <div className="absolute inset-0 z-10 grid place-items-center">
          <div className="rounded-2xl border border-white/12 bg-[#253144]/90 px-5 py-4 text-center shadow-xl">
            <BarChart3 className="mx-auto text-[#7bd7d4]" size={26} />
            <p className="mt-2 text-sm text-white">Még nincs eladási adat ebben az időszakban.</p>
            <p className="mt-1 text-xs text-white/45">A grafikon az első üzleti eladások után automatikusan megtelik.</p>
          </div>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full" role="img" aria-label="Forgalmi trend">
        <defs>
          <linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#49d2ca" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#49d2ca" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="revenueLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7bd7d4" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = paddingTop + usableHeight - ratio * usableHeight;
          return (
            <g key={ratio}>
              <line x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
              <text x={paddingX - 8} y={y + 4} fill="rgba(255,255,255,0.38)" fontSize="10" textAnchor="end">
                {Math.round(maxValue * ratio).toLocaleString("ro-RO")}
              </text>
            </g>
          );
        })}

        {area ? <path d={area} fill="url(#revenueArea)" /> : null}
        {line ? <path d={line} fill="none" stroke="url(#revenueLine)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /> : null}

        {points.map((point, index) => (
          <g key={point.item.date}>
            <circle cx={point.x} cy={point.y} r="4.5" fill="#d8fffd" stroke="#2a8d8b" strokeWidth="3" />
            {index % labelStep === 0 || index === points.length - 1 ? (
              <text x={point.x} y={height - 14} fill="rgba(255,255,255,0.48)" fontSize="10" textAnchor="middle">
                {point.item.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function RankingBars({
  title,
  subtitle,
  items,
  valueMode = "money",
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  items: AifAdminShopRankingItem[];
  valueMode?: "money" | "qty";
  icon: ComponentType<{ size?: number; className?: string }>;
}) {
  const max = Math.max(1, ...items.map((item) => valueMode === "money" ? numberValue(item.revenue) : numberValue(item.qty)));
  return (
    <section className={`${card} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">{subtitle}</p>
          <h3 className="mt-1 text-base text-white">{title}</h3>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 text-[#bff8f5]">
          <Icon size={17} />
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {items.slice(0, 7).map((item, index) => {
          const value = valueMode === "money" ? numberValue(item.revenue) : numberValue(item.qty);
          return (
            <div key={`${item.name}-${index}`}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-white/78">{index + 1}. {item.name}</span>
                <span className="shrink-0 text-white">{valueMode === "money" ? money(value) : `${integer(value)} db`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#273244]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2a8d8b] to-[#63d8d3]"
                  style={{ width: `${Math.max(4, value / max * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
        {!items.length ? (
          <div className="rounded-2xl border border-dashed border-white/14 bg-white/[0.03] px-4 py-8 text-center text-xs text-white/42">
            Nincs rangsorolható eladási adat.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PaymentDonut({ items }: { items: AifAdminShopOverviewResponse["payments"] }) {
  const colors = ["#2dd4bf", "#60a5fa", "#f59e0b", "#f43f5e", "#a78bfa", "#94a3b8"];
  const total = items.reduce((sum, item) => sum + numberValue(item.amount), 0);
  let cursor = 0;
  const parts = items.map((item, index) => {
    const share = total > 0 ? numberValue(item.amount) / total * 100 : 0;
    const start = cursor;
    const end = cursor + share;
    cursor = end;
    return `${colors[index % colors.length]} ${start}% ${end}%`;
  });
  const background = parts.length ? `conic-gradient(${parts.join(", ")})` : "conic-gradient(#526071 0 100%)";

  return (
    <section className={`${card} p-4`}>
      <div>
        <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Pénzmozgás</p>
        <h3 className="mt-1 text-base text-white">Fizetési megoszlás</h3>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[150px_1fr] sm:items-center">
        <div className="relative mx-auto h-36 w-36 rounded-full" style={{ background }}>
          <div className="absolute inset-[22px] grid place-items-center rounded-full border border-white/12 bg-[#344154] text-center">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Fizetve</p>
              <p className="mt-1 text-sm text-white">{money(total)}</p>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {items.slice(0, 6).map((item, index) => (
            <div key={item.method} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-xs text-white/70">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="text-xs text-white">{money(item.amount)}</span>
            </div>
          ))}
          {!items.length ? <p className="py-4 text-center text-xs text-white/42">Nincs rögzített fizetés.</p> : null}
        </div>
      </div>
    </section>
  );
}

export default function AllInAdminMagazinDashboard({
  actor = "ADMIN",
  locationCode,
  locationName,
  cityName,
  otherCityHash,
  otherCityName,
}: AllInAdminMagazinDashboardProps) {
  const initialDates = useMemo(() => presetDates("today"), []);
  const [preset, setPreset] = useState<PeriodPreset>("today");
  const [draft, setDraft] = useState({
    from: initialDates.from,
    to: initialDates.to,
    employee: "",
    paymentStatus: "",
    saleType: "",
    brand: "",
    category: "",
    search: "",
  });
  const [applied, setApplied] = useState(draft);
  const [data, setData] = useState<AifAdminShopOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiAifAdminShopOverview({
        location: locationCode,
        ...applied,
      });
      setData(response);
    } catch (loadError: any) {
      setError(loadError?.message || "Az üzleti vezérlőpult adatai nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [locationCode, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyPreset(nextPreset: PeriodPreset) {
    const dates = presetDates(nextPreset);
    const next = { ...draft, ...dates };
    setPreset(nextPreset);
    setDraft(next);
    setApplied(next);
  }

  function applyFilters() {
    setPreset("custom");
    setApplied({ ...draft });
  }

  const summary = data?.summary;
  const previous = data?.previousSummary;
  const stock = data?.stockSnapshot;

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#5f6b7b] via-[#566171] to-[#485361] p-3 text-white sm:p-4 lg:p-6">
      <div className="mx-auto max-w-[1580px] space-y-3.5">
        <header className="rounded-[26px] border border-white/20 bg-[#2f3b4f] px-4 py-4 shadow-[0_20px_55px_rgba(15,23,42,0.28)] sm:px-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/38 bg-[#2a8d8b]/22 text-[#cffffd]">
              <Store size={28} />
            </span>
            <div className="min-w-[280px] border-l-4 border-[#2a8d8b] pl-3">
              <p className="text-[10px] uppercase tracking-[0.19em] text-[#cffffd]/62">AllInFashion • admin üzletmonitor</p>
              <h1 className="mt-1 text-2xl tracking-tight sm:text-3xl">{cityName}</h1>
              <p className="mt-1 text-sm text-white/52">{locationName} • teljes értékesítési áttekintés</p>
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <span className="hidden rounded-2xl border border-white/14 bg-white/[0.055] px-3 py-2 text-xs text-white/58 lg:inline-flex lg:items-center lg:gap-2">
                <UserRound size={14} className="text-[#8ee6e2]" />
                {actor}
              </span>
              <button className={neutralButton} type="button" onClick={() => { window.location.hash = otherCityHash; }}>
                <Store size={15} />
                {otherCityName}
              </button>
              <button className={neutralButton} type="button" onClick={() => void load()} disabled={loading}>
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                Frissítés
              </button>
              <button className={neutralButton} type="button" onClick={() => { window.location.hash = "#home"; }}>
                <Home size={15} />
                Kezdőlap
              </button>
            </div>
          </div>
        </header>

        <section className={`${card} overflow-visible p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter size={17} className="text-[#8ee6e2]" />
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Időszak és szűrés</p>
                <h2 className="mt-0.5 text-base">Mit nézzünk?</h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["today", "Ma"],
                ["yesterday", "Tegnap"],
                ["last7", "7 nap"],
                ["month", "Hónap"],
                ["lastMonth", "Előző hónap"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => applyPreset(value as PeriodPreset)}
                  className={`h-8 rounded-lg border px-3 text-[11px] transition ${
                    preset === value
                      ? "border-[#8ce7e2]/45 bg-[#2a8d8b] text-white"
                      : "border-white/14 bg-white/[0.05] text-white/58 hover:bg-white/[0.09]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[170px_170px_minmax(190px,1fr)_minmax(190px,1fr)_minmax(190px,1fr)]">
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                Ettől
                <input className={inputClass} type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
              </label>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                Eddig
                <input className={inputClass} type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
              </label>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                Eladó
                <SmartSelect
                  value={draft.employee}
                  onChange={(value) => setDraft({ ...draft, employee: value })}
                  placeholder="Minden eladó"
                  options={[{ value: "", label: "Minden eladó" }, ...(data?.filterOptions.employees || []).map((value) => ({ value, label: value }))]}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                Fizetés
                <SmartSelect
                  value={draft.paymentStatus}
                  onChange={(value) => setDraft({ ...draft, paymentStatus: value })}
                  placeholder="Minden fizetés"
                  options={[
                    { value: "", label: "Minden fizetés" },
                    { value: "paid", label: "Kifizetve" },
                    { value: "partial", label: "Részben fizetve" },
                    { value: "unpaid", label: "Nincs fizetve" },
                    { value: "credit", label: "Hitel" },
                  ]}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                Típus
                <SmartSelect
                  value={draft.saleType}
                  onChange={(value) => setDraft({ ...draft, saleType: value })}
                  placeholder="Minden eladás"
                  options={[
                    { value: "", label: "Minden eladás" },
                    { value: "sale", label: "Normál eladás" },
                    { value: "reservation", label: "Félretett" },
                    { value: "credit", label: "Hitel" },
                  ]}
                />
              </label>
            </div>

            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(210px,0.8fr)_minmax(210px,0.8fr)_minmax(340px,2fr)_auto]">
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                Márka
                <SmartSelect
                  value={draft.brand}
                  onChange={(value) => setDraft({ ...draft, brand: value })}
                  placeholder="Minden márka"
                  options={[{ value: "", label: "Minden márka" }, ...(data?.filterOptions.brands || []).map((value) => ({ value, label: value }))]}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                Kategória
                <SmartSelect
                  value={draft.category}
                  onChange={(value) => setDraft({ ...draft, category: value })}
                  placeholder="Minden kategória"
                  options={[{ value: "", label: "Minden kategória" }, ...(data?.filterOptions.categories || []).map((value) => ({ value, label: value }))]}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
                Keresés
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 text-white/38" size={15} />
                  <input
                    className={`${inputClass} pl-9`}
                    value={draft.search}
                    onChange={(event) => setDraft({ ...draft, search: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") applyFilters();
                    }}
                    placeholder="Bizonylat, kliens, termék..."
                  />
                </div>
              </label>
              <div className="flex items-end">
                <button className={`${primaryButton} w-full xl:min-w-[126px]`} type="button" onClick={applyFilters}>
                  <Search size={15} />
                  Alkalmazás
                </button>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-200/30 bg-rose-500/14 px-4 py-3 text-sm text-rose-50">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <MetricCard
            title="Forgalom"
            value={money(summary?.revenue)}
            hint="TVA-val, kedvezmény után"
            icon={CircleDollarSign}
            current={numberValue(summary?.revenue)}
            previous={numberValue(previous?.revenue)}
          />
          <MetricCard
            title="Eladások"
            value={integer(summary?.transactions)}
            hint="Lezárt tranzakció"
            icon={ReceiptText}
            current={numberValue(summary?.transactions)}
            previous={numberValue(previous?.transactions)}
          />
          <MetricCard
            title="Eladott termék"
            value={`${integer(summary?.itemsSold)} db`}
            hint="Összes eladott darab"
            icon={ShoppingBag}
            current={numberValue(summary?.itemsSold)}
            previous={numberValue(previous?.itemsSold)}
          />
          <MetricCard
            title="Átlagkosár"
            value={money(summary?.averageBasket)}
            hint="Tranzakciónként"
            icon={CreditCard}
            current={numberValue(summary?.averageBasket)}
            previous={numberValue(previous?.averageBasket)}
          />
          <MetricCard
            title="Kedvezmény"
            value={money(summary?.discountTotal)}
            hint="Eladási árból engedve"
            icon={Percent}
            current={numberValue(summary?.discountTotal)}
            previous={numberValue(previous?.discountTotal)}
            tone={numberValue(summary?.discountTotal) > 0 ? "warning" : "normal"}
          />
          <MetricCard
            title="Kintlévőség"
            value={money(summary?.unpaidTotal)}
            hint={`${integer(summary?.unpaidSales)} nyitott fizetés`}
            icon={WalletCards}
            current={numberValue(summary?.unpaidTotal)}
            previous={numberValue(previous?.unpaidTotal)}
            tone={numberValue(summary?.unpaidTotal) > 0 ? "danger" : "normal"}
          />
          <MetricCard
            title="Becsült árrés"
            value={money(summary?.grossProfit)}
            hint={`${numberValue(summary?.grossMargin).toFixed(1)}% becsült árrés`}
            icon={TrendingUp}
            current={numberValue(summary?.grossProfit)}
            previous={numberValue(previous?.grossProfit)}
          />
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
          <div className={`${card} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Élő készletpillanat</p>
                <h2 className="mt-1 text-base">Az üzlet jelenlegi állapota</h2>
              </div>
              <span className="rounded-full border border-[#7bd7d4]/22 bg-[#2a8d8b]/10 px-3 py-1 text-[10px] text-[#cffffd]/70">
                {data?.location.name || locationName}
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["Készlet", `${integer(stock?.totalQty)} db`, Boxes],
                ["Elérhető", `${integer(stock?.availableQty)} db`, PackageCheck],
                ["Foglalt", `${integer(stock?.reservedQty)} db`, Clock3],
                ["Eladási érték", money(stock?.retailValue), CircleDollarSign],
                ["Alacsony készlet", integer(stock?.lowStockVariants), AlertTriangle],
              ].map(([title, value, Icon]) => (
                <div key={String(title)} className="rounded-2xl border border-white/10 bg-[#2b3749] px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">{String(title)}</p>
                    <Icon size={14} className="text-[#8ee6e2]" />
                  </div>
                  <p className="mt-2 text-lg text-white">{String(value)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={`${card} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Értékesítési kép</p>
                <h2 className="mt-1 text-base">Csak a kiválasztott üzleti eladások</h2>
              </div>
              <span className="rounded-full border border-[#7bd7d4]/22 bg-[#2a8d8b]/10 px-3 py-1 text-[10px] text-[#cffffd]/70">
                Nem tartalmaz áthelyezést
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ["Eladott", `${integer(summary?.itemsSold)} db`, "text-[#bff8f5]"],
                ["Tranzakció", integer(summary?.transactions), "text-white"],
                ["Fizetve", money(summary?.paidTotal), "text-emerald-100"],
                ["Kedvezmény", money(summary?.discountTotal), "text-amber-50"],
              ].map(([title, value, tone]) => (
                <div key={String(title)} className="min-w-0 rounded-2xl border border-white/10 bg-[#2b3749] px-3 py-3">
                  <p className="text-[9px] uppercase tracking-[0.1em] text-white/42">{String(title)}</p>
                  <p className={`mt-2 truncate text-base ${String(tone)}`} title={String(value)}>{String(value)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-[2fr_1fr]">
          <div className={`${card} p-4`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Forgalmi grafikon</p>
                <h2 className="mt-1 text-base">Napi forgalom alakulása</h2>
              </div>
              <div className="flex items-center gap-4 text-[10px] text-white/48">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#49d2ca]" /> Forgalom</span>
                <span>{data?.period.from} → {data?.period.to}</span>
              </div>
            </div>
            <RevenueChart data={data?.trend || []} />
          </div>

          <PaymentDonut items={data?.payments || []} />
        </section>

        <section className="grid gap-3 xl:grid-cols-3">
          <RankingBars title="Márkák teljesítménye" subtitle="Forgalom szerint" items={data?.brands || []} icon={Tags} />
          <RankingBars title="Kategóriák" subtitle="Eladott darab szerint" items={data?.categories || []} valueMode="qty" icon={Layers3} />
          <RankingBars title="Top termékek" subtitle="Forgalom szerint" items={data?.products || []} icon={ShoppingBag} />
        </section>

        <section className="grid gap-3">
          <div className={`${card} overflow-hidden`}>
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Csapat</p>
              <h2 className="mt-1 text-base">Eladók teljesítménye</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <thead className="bg-[#293548] text-[9px] uppercase tracking-[0.08em] text-white/45">
                  <tr>
                    <th className="px-3 py-3 text-left">Eladó</th>
                    <th className="px-3 py-3 text-right">Forgalom</th>
                    <th className="px-3 py-3 text-center">Eladás</th>
                    <th className="px-3 py-3 text-center">Darab</th>
                    <th className="px-3 py-3 text-right">Kedvezmény</th>
                    <th className="px-3 py-3 text-right">Kintlévőség</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.employees || []).map((item) => (
                    <tr key={item.actor} className="border-t border-white/8 hover:bg-white/[0.035]">
                      <td className="px-3 py-3"><span className="flex items-center gap-2"><UserRound size={14} className="text-[#8ee6e2]" />{item.actor}</span></td>
                      <td className="px-3 py-3 text-right">{money(item.revenue)}</td>
                      <td className="px-3 py-3 text-center">{integer(item.transactions)}</td>
                      <td className="px-3 py-3 text-center">{integer(item.itemsSold)}</td>
                      <td className="px-3 py-3 text-right text-amber-50">{money(item.discountTotal)}</td>
                      <td className="px-3 py-3 text-right text-rose-50">{money(item.unpaidTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.employees.length ? <div className="px-4 py-10 text-center text-xs text-white/42">Nincs eladói teljesítményadat.</div> : null}
            </div>
          </div>

          <div className={`${card} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Eseménynapló</p>
                <h2 className="mt-1 text-base">Legutóbbi eladások és nyitott fizetések</h2>
              </div>
              <span className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-[10px] text-white/50">
                {data?.recentSales.length || 0} sor
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-xs">
                <thead className="bg-[#293548] text-[9px] uppercase tracking-[0.08em] text-white/45">
                  <tr>
                    <th className="px-3 py-3 text-left">Időpont</th>
                    <th className="px-3 py-3 text-left">Bizonylat</th>
                    <th className="px-3 py-3 text-left">Eladó / kliens</th>
                    <th className="px-3 py-3 text-center">Típus</th>
                    <th className="px-3 py-3 text-center">Darab</th>
                    <th className="px-3 py-3 text-right">Kedvezmény</th>
                    <th className="px-3 py-3 text-right">Összeg</th>
                    <th className="px-3 py-3 text-right">Hátralévő</th>
                    <th className="px-3 py-3 text-center">Állapot</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentSales || []).map((sale) => (
                    <tr key={sale.id} className="border-t border-white/8 hover:bg-white/[0.035]">
                      <td className="whitespace-nowrap px-3 py-3 text-white/62">{dateTime(sale.soldAt)}</td>
                      <td className="px-3 py-3"><p className="text-white">{sale.saleNumber}</p><p className="mt-1 text-[10px] text-white/38">{saleTypeLabel(sale.saleType)}</p></td>
                      <td className="px-3 py-3"><p>{sale.actor || "-"}</p><p className="mt-1 text-[10px] text-white/42">{sale.customerName || "Nincs kliens megadva"}</p></td>
                      <td className="px-3 py-3 text-center"><span className="rounded-full border border-white/12 bg-white/[0.05] px-2 py-1 text-[10px]">{saleTypeLabel(sale.saleType)}</span></td>
                      <td className="px-3 py-3 text-center">{integer(sale.itemCount)}</td>
                      <td className="px-3 py-3 text-right text-amber-50">{money(sale.discountTotal)}</td>
                      <td className="px-3 py-3 text-right">{money(sale.total)}</td>
                      <td className="px-3 py-3 text-right text-rose-50">{money(sale.balanceDue)}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-center gap-1.5">
                          <span className={`rounded-full border px-2 py-1 text-[10px] ${statusBadge(sale.status)}`}>{saleStatusLabel(sale.status)}</span>
                          <span className={`rounded-full border px-2 py-1 text-[10px] ${paymentBadge(sale.paymentStatus)}`}>{paymentLabel(sale.paymentStatus)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.recentSales.length ? (
                <div className="px-4 py-12 text-center">
                  <ReceiptText className="mx-auto text-[#7bd7d4]/70" size={28} />
                  <p className="mt-2 text-sm text-white">Még nincs üzleti eladás rögzítve.</p>
                  <p className="mt-1 text-xs text-white/42">Az új eladási modul minden tranzakciót, kedvezményt és nyitott fizetést ide fog naplózni.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {loading ? (
        <div className="fixed inset-0 z-[300] grid place-items-center bg-slate-950/28 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/18 bg-[#263348] px-5 py-4 shadow-2xl">
            <Loader2 className="animate-spin text-[#8ee6e2]" size={22} />
            <span className="text-sm text-white">Üzleti adatok betöltése...</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
