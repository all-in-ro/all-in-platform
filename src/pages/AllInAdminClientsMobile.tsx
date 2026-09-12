import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ComponentType,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Filter,
  Home,
  Loader2,
  Mail,
  MapPin,
  Medal,
  Phone,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Store,
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
  type AifAdminCustomerSort,
  type AifAdminCustomerStoreSummary,
  type AifAdminCustomersOverviewResponse,
} from "../lib/aif/api";

type Props = {
  actor?: string;
  role?: "admin" | "shop";
};

type LocationScope = "all" | "main_warehouse" | "magazin_targu_secuiesc";
type MobileView = "clients" | "employees" | "stores";

type FilterDraft = {
  employee: string;
  activity: AifAdminCustomerActivityFilter;
  sort: AifAdminCustomerSort;
};

const FIRE_RED = "#c30d1c";
const panel = "rounded-[22px] border border-white/16 bg-[#344154] shadow-[0_14px_34px_rgba(15,23,42,0.20)]";
const iconButton = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-white/[0.055] text-white transition active:scale-[0.96]";
type MobileSelectOption = { value: string; label: string };

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

function locationLabel(value: LocationScope) {
  if (value === "main_warehouse") return "Csíkszereda";
  if (value === "magazin_targu_secuiesc") return "Kézdivásárhely";
  return "Mindkét üzlet";
}

function storeShortLabel(code?: string | null, fallback?: string | null) {
  if (code === "main_warehouse") return "Csíkszereda";
  if (code === "magazin_targu_secuiesc") return "Kézdivásárhely";
  return fallback || "Üzlet";
}

function activityText(item: AifAdminCustomerOverviewItem, year: number) {
  if (item.periodTransactions > 0) {
    return `${formatDate(item.periodLastSaleAt)} • ${integer(item.periodTransactions)} vásárlás`;
  }
  if (item.lastSaleAt) return `${year}-ban nem vásárolt • utoljára ${formatDate(item.lastSaleAt)}`;
  return "Még nincs vásárlása";
}

function StoreBadge({ code, name }: { code?: string | null; name?: string | null }) {
  const isCiuc = code === "main_warehouse";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] ${isCiuc
      ? "border-[#78ded9]/40 bg-[#2a8d8b]/20 text-[#d7fffd]"
      : "border-sky-200/35 bg-sky-400/14 text-sky-50"
    }`}>
      <Store size={11} />
      {storeShortLabel(code, name)}
    </span>
  );
}

function normalizeSelectText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function MobileSelect({
  value,
  options,
  onChange,
  ariaLabel,
  compact = false,
}: {
  value: string;
  options: MobileSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const selected = options.find((item) => String(item.value) === String(value)) || options[0] || null;
  const showSearch = options.length > 10;
  const searchKey = normalizeSelectText(search);
  const visibleOptions = searchKey
    ? options.filter((item) => normalizeSelectText(item.label).includes(searchKey))
    : options;

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  const updatePosition = useCallback(() => {
    if (typeof window === "undefined") return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const edge = 10;
    const gap = 6;
    const minWidth = compact ? 120 : 210;
    const width = Math.min(
      Math.max(rect.width, minWidth),
      Math.max(minWidth, window.innerWidth - edge * 2),
    );
    const desiredHeight = Math.min(310, 18 + (showSearch ? 48 : 0) + Math.max(1, options.length) * 34);
    const roomBelow = Math.max(0, window.innerHeight - rect.bottom - edge);
    const roomAbove = Math.max(0, rect.top - edge);
    const openUp = roomBelow < Math.min(170, desiredHeight) && roomAbove > roomBelow;
    const maxHeight = Math.max(110, Math.min(desiredHeight, openUp ? roomAbove - gap : roomBelow - gap));
    const left = Math.min(
      Math.max(edge, rect.left),
      Math.max(edge, window.innerWidth - width - edge),
    );
    setMenuStyle({
      position: "fixed",
      left,
      top: openUp ? Math.max(edge, rect.top - gap) : Math.min(window.innerHeight - edge, rect.bottom + gap),
      width,
      maxHeight,
      transform: openUp ? "translateY(-100%)" : "none",
      zIndex: 2147483200,
    });
  }, [compact, options.length, showSearch]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    const outside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const reposition = () => updatePosition();
    document.addEventListener("mousedown", outside);
    window.addEventListener("keydown", escape);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [close, open, updatePosition]);

  useEffect(() => {
    if (open) updatePosition();
  }, [open, search, visibleOptions.length, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (open) close();
          else {
            setSearch("");
            updatePosition();
            setOpen(true);
          }
        }}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border text-left font-normal text-white outline-none transition focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/20 ${
          compact ? "h-10 px-2.5 text-[12px]" : "h-10 px-3 text-[12px]"
        } ${
          open
            ? "border-[#7bd7d4]/58 bg-[#3f4959] shadow-[0_0_0_1px_rgba(123,215,212,0.08),0_8px_20px_rgba(15,23,42,0.18)]"
            : "border-white/18 bg-[#3f4959] hover:bg-[#475365]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={selected?.label || ariaLabel}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label || "–"}</span>
        <ChevronDown size={14} className={`shrink-0 text-white/58 transition ${open ? "rotate-180 text-[#d7fffd]" : ""}`} />
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          data-allin-client-select="open"
          className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#7bd7d4]/30 bg-[#293344] text-white shadow-[0_24px_70px_rgba(2,6,23,0.72)]"
          style={menuStyle}
          role="listbox"
          aria-label={ariaLabel}
        >
          {showSearch ? (
            <div className="shrink-0 border-b border-white/10 bg-[#303a4c] p-1.5">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/42" />
                <input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-8 w-full rounded-xl border border-white/16 bg-[#202b3b] pl-8 pr-8 text-[11px] text-white outline-none placeholder:text-white/38 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/20"
                  placeholder="Keresés..."
                />
                {search ? (
                  <button type="button" onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Keresés törlése">
                    <X size={11} />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 [scrollbar-gutter:stable]">
            <div className="grid gap-1">
              {visibleOptions.map((option) => {
                const active = String(option.value) === String(value);
                return (
                  <button
                    key={option.value || "__all"}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      close();
                    }}
                    className={`flex min-h-8 w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-[11px] transition ${
                      active
                        ? "border-[#7bd7d4]/60 bg-[#2a8d8b] text-white shadow-[0_8px_20px_rgba(42,141,139,0.18)]"
                        : "border-transparent bg-[#303a4c] text-white/78 hover:border-white/10 hover:bg-[#3b485d] hover:text-white"
                    }`}
                    role="option"
                    aria-selected={active}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {active ? <CheckCircle2 size={13} className="shrink-0 text-[#d7fffd]" /> : null}
                  </button>
                );
              })}
            </div>
            {!visibleOptions.length ? <div className="px-3 py-4 text-center text-[11px] text-white/45">Nincs találat.</div> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function BrightDebt({
  amount,
  caption,
  compact = false,
}: {
  amount: number;
  caption?: string;
  compact?: boolean;
}) {
  if (amount <= 0.005) return null;
  return (
    <div
      className={`rounded-2xl border border-red-200/80 text-white shadow-[0_12px_28px_rgba(195,13,28,0.38)] ${compact ? "px-3 py-2.5" : "p-4"}`}
      style={{ backgroundColor: FIRE_RED }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-[0.13em] text-white/78">Tartozás</p>
          <p className={`${compact ? "mt-1 text-lg" : "mt-2 text-3xl"} truncate font-normal tabular-nums text-white`} title={money(amount)}>
            {money(amount)}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/30 bg-black/10">
          <WalletCards size={17} />
        </span>
      </div>
      {caption ? <p className="mt-1.5 text-[10px] text-white/72">{caption}</p> : null}
    </div>
  );
}

function HeroSummary({
  year,
  location,
  data,
  debtActive,
  onDebtClick,
}: {
  year: number;
  location: LocationScope;
  data: AifAdminCustomersOverviewResponse | null;
  debtActive: boolean;
  onDebtClick: () => void;
}) {
  const summary = data?.summary;
  const debt = numberValue(summary?.currentOpenBalance);
  return (
    <section className="overflow-hidden rounded-[24px] border border-[#9be9e5]/32 bg-gradient-to-br from-[#1f766f] via-[#28625f] to-[#344154] shadow-[0_18px_44px_rgba(15,23,42,0.28)]">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.16em] text-[#d7fffd]/68">{year} • {locationLabel(location)}</p>
            <p className="mt-1 text-xs text-white/60">Kliensforgalom</p>
          </div>
          <CircleDollarSign size={21} className="text-[#d7fffd]" />
        </div>
        <p className="mt-3 text-[2rem] leading-none tracking-tight text-white">{money(summary?.revenue)}</p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/14 bg-black/10 px-2.5 py-2.5 text-center">
            <p className="text-[8px] uppercase tracking-[0.1em] text-white/48">Kliensek</p>
            <p className="mt-1 text-lg text-white">{integer(summary?.buyingCustomers)}</p>
          </div>
          <div className="rounded-2xl border border-white/14 bg-black/10 px-2.5 py-2.5 text-center">
            <p className="text-[8px] uppercase tracking-[0.1em] text-white/48">Vásárlás</p>
            <p className="mt-1 text-lg text-white">{integer(summary?.transactions)}</p>
          </div>
          {debt > 0.005 ? (
            <button
              type="button"
              onClick={onDebtClick}
              className={`rounded-2xl border px-2.5 py-2.5 text-center text-white shadow-[0_8px_20px_rgba(195,13,28,0.30)] transition active:scale-[0.97] ${debtActive ? "border-white ring-2 ring-white/20" : "border-white/80 hover:border-white"}`}
              style={{ backgroundColor: FIRE_RED }}
              aria-label="Tartozó kliensek megjelenítése"
              title="Tartozó kliensek megjelenítése"
            >
              <span className="flex items-center justify-center gap-1 text-[8px] uppercase tracking-[0.1em] text-white/82">
                Tartozás {debtActive ? <CheckCircle2 size={10} /> : null}
              </span>
              <span className="mt-1 block truncate text-[13px] text-white" title={money(debt)}>{money(debt)}</span>
            </button>
          ) : (
            <div className="rounded-2xl border border-white/14 bg-black/10 px-2.5 py-2.5 text-center text-white">
              <p className="text-[8px] uppercase tracking-[0.1em] text-white/48">Tartozás</p>
              <p className="mt-1 truncate text-[13px] text-white" title={money(debt)}>{money(debt)}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MobileFilterSheet({
  open,
  draft,
  employees,
  onChange,
  onApply,
  onClear,
  onClose,
}: {
  open: boolean;
  draft: FilterDraft;
  employees: string[];
  onChange: (next: FilterDraft) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector('[data-allin-client-select="open"]')) return;
      onClose();
    };
    window.addEventListener("keydown", close, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close, true);
    };
  }, [onClose, open]);

  if (!open) return null;

  const employeeOptions: MobileSelectOption[] = [
    { value: "", label: "Minden eladó" },
    ...employees.map((name) => ({ value: name, label: name })),
  ];
  const activityOptions: MobileSelectOption[] = [
    { value: "all", label: "Minden kliens" },
    { value: "buyers", label: "Vásárolt ebben az évben" },
    { value: "repeat", label: "Visszatérő kliens" },
    { value: "inactive", label: "Nem vásárolt ebben az évben" },
    { value: "debt", label: "Jelenleg tartozik" },
  ];
  const sortOptions: MobileSelectOption[] = [
    { value: "revenue", label: "Forgalom szerint" },
    { value: "transactions", label: "Vásárlások szerint" },
    { value: "items", label: "Darabszám szerint" },
    { value: "average", label: "Átlagkosár szerint" },
    { value: "last_sale", label: "Utolsó vásárlás szerint" },
    { value: "debt", label: "Tartozás szerint" },
    { value: "name", label: "Név szerint" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[520] flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-sm"
      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="flex max-h-[82dvh] w-[calc(100%-28px)] max-w-[356px] flex-col overflow-hidden rounded-[26px] border border-white/18 bg-[#303a4c] text-white shadow-[0_32px_100px_rgba(0,0,0,0.58)]">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#303c4f] px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#9be9e5]/30 bg-[#2a8d8b]/20 text-[#d7fffd]"><SlidersHorizontal size={17} /></span>
            <div className="min-w-0">
              <p className="text-[8px] uppercase tracking-[0.14em] text-white/42">Részletes szűrés</p>
              <h2 className="mt-0.5 truncate text-[16px] text-white">Mit mutasson a lista?</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white active:scale-[0.97]" aria-label="Bezárás"><X size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
          <label className="grid min-w-0 gap-1 text-[8px] uppercase tracking-[0.09em] text-white/46">
            Eladó
            <MobileSelect
              value={draft.employee}
              onChange={(value) => onChange({ ...draft, employee: value })}
              options={employeeOptions}
              ariaLabel="Eladó"
            />
          </label>

          <label className="grid min-w-0 gap-1 text-[8px] uppercase tracking-[0.09em] text-white/46">
            Aktivitás
            <MobileSelect
              value={draft.activity}
              onChange={(value) => onChange({ ...draft, activity: value as AifAdminCustomerActivityFilter })}
              options={activityOptions}
              ariaLabel="Aktivitás"
            />
          </label>

          <label className="grid min-w-0 gap-1 text-[8px] uppercase tracking-[0.09em] text-white/46">
            Rendezés
            <MobileSelect
              value={draft.sort}
              onChange={(value) => onChange({ ...draft, sort: value as AifAdminCustomerSort })}
              options={sortOptions}
              ariaLabel="Rendezés"
            />
          </label>
        </div>

        <footer className="grid grid-cols-[0.9fr_1.35fr] gap-2 border-t border-white/10 bg-[#293548] p-2.5">
          <button type="button" onClick={onClear} className="h-10 rounded-xl border border-white/14 bg-white/[0.05] px-3 text-[11px] text-white active:scale-[0.98]">Alaphelyzet</button>
          <button type="button" onClick={onApply} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#8ce7e2]/42 bg-[#2a8d8b] px-3 text-[11px] text-white shadow-[0_8px_20px_rgba(42,141,139,0.18)] active:scale-[0.98]"><Filter size={14} />Szűrés alkalmazása</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function CustomerMobileCard({
  item,
  index,
  year,
  topTen,
  onOpen,
}: {
  item: AifAdminCustomerOverviewItem;
  index: number;
  year: number;
  topTen: boolean;
  onOpen: () => void;
}) {
  const debt = numberValue(item.currentOpenBalance);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[22px] border border-white/14 bg-[#2b3749] p-3.5 text-left text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${topTen && index < 3
          ? "border-amber-200/45 bg-amber-400/14 text-amber-50"
          : "border-[#7bd7d4]/25 bg-[#2a8d8b]/14 text-[#bff8f5]"
        }`}>
          {topTen ? <span className="text-sm">{index + 1}</span> : <UserRound size={18} />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[15px] text-white" title={item.fullName}>{item.fullName}</p>
              <p className="mt-1 truncate text-[11px] text-white/48">{item.phone || item.email || "Nincs elérhetőség"}</p>
            </div>
            <p className="shrink-0 text-[15px] text-white">{money(item.periodRevenue)}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.stores.map((store) => <StoreBadge key={`${store.locationId}-${store.customerId}`} code={store.locationCode} name={store.locationName} />)}
            {item.periodTransactions >= 2 ? <span className="rounded-full border border-amber-200/30 bg-amber-400/10 px-2.5 py-1 text-[10px] text-amber-50">Visszatérő</span> : null}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <span className="rounded-xl border border-white/9 bg-black/10 px-2 py-2.5 text-center">
          <span className="block text-[8px] uppercase tracking-[0.08em] text-white/38">Vásárlás</span>
          <strong className="mt-1 block text-base font-normal text-white">{integer(item.periodTransactions)}</strong>
        </span>
        <span className="rounded-xl border border-white/9 bg-black/10 px-2 py-2.5 text-center">
          <span className="block text-[8px] uppercase tracking-[0.08em] text-white/38">Darab</span>
          <strong className="mt-1 block text-base font-normal text-white">{integer(item.periodItemsSold)}</strong>
        </span>
        <span className="rounded-xl border border-white/9 bg-black/10 px-2 py-2.5 text-center">
          <span className="block text-[8px] uppercase tracking-[0.08em] text-white/38">Átlagkosár</span>
          <strong className="mt-1 block truncate text-[12px] font-normal text-white" title={money(item.periodAverageBasket)}>{money(item.periodAverageBasket)}</strong>
        </span>
      </div>

      {debt > 0.005 ? (
        <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-red-200/80 px-3 py-2.5 text-white shadow-[0_8px_20px_rgba(195,13,28,0.32)]" style={{ backgroundColor: FIRE_RED }}>
          <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.09em]"><WalletCards size={14} /> Tartozás</span>
          <strong className="text-base font-normal tabular-nums">{money(debt)}</strong>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/9 pt-2.5">
        <div className="min-w-0">
          <p className="truncate text-[10px] text-white/48">{activityText(item, year)}</p>
          {item.employees.length ? <p className="mt-1 truncate text-[10px] text-[#9be9e5]/72">Eladó: {item.employees.slice(0, 2).map((seller) => seller.actor).join(", ")}{item.employees.length > 2 ? ` +${item.employees.length - 2}` : ""}</p> : null}
        </div>
        <ChevronRight size={17} className="shrink-0 text-[#8ee6e2]" />
      </div>
    </button>
  );
}

function EmployeeCard({
  item,
  index,
  onSelect,
}: {
  item: AifAdminCustomerEmployeeSummary;
  index: number;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className="w-full rounded-[22px] border border-white/13 bg-[#2b3749] p-3.5 text-left text-white transition active:scale-[0.99]">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${index < 3 ? "border-amber-200/35 bg-amber-400/12 text-amber-50" : "border-[#7bd7d4]/24 bg-[#2a8d8b]/13 text-[#bff8f5]"}`}>
            {index < 3 ? <Medal size={18} /> : <UserRound size={18} />}
          </span>
          <span className="truncate text-[15px]">{item.actor}</span>
        </span>
        <span className="shrink-0 text-[15px]">{money(item.revenue)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <span className="rounded-xl border border-white/9 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/38">Kliens</span><strong className="mt-1 block font-normal">{integer(item.customers)}</strong></span>
        <span className="rounded-xl border border-white/9 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/38">Vásárlás</span><strong className="mt-1 block font-normal">{integer(item.transactions)}</strong></span>
        <span className="rounded-xl border border-white/9 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/38">Átlag</span><strong className="mt-1 block truncate text-[11px] font-normal">{money(item.averageBasket)}</strong></span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/9 pt-2.5 text-[10px] text-[#9be9e5]/72"><span>Kliensek megnyitása</span><ChevronRight size={16} /></div>
    </button>
  );
}

function StoreCard({ store, onSelect }: { store: AifAdminCustomerStoreSummary; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} className="w-full rounded-[22px] border border-white/13 bg-[#2b3749] p-3.5 text-left text-white transition active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <StoreBadge code={store.code} name={store.name} />
          <p className="mt-3 text-2xl text-white">{money(store.revenue)}</p>
          <p className="mt-1 truncate text-[11px] text-white/44">{store.name}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/14 text-[#bff8f5]"><Store size={19} /></span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <span className="rounded-xl border border-white/9 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/38">Kliensek</span><strong className="mt-1 block font-normal">{integer(store.activeCustomers)}</strong></span>
        <span className="rounded-xl border border-white/9 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/38">Vásárlás</span><strong className="mt-1 block font-normal">{integer(store.transactions)}</strong></span>
        <span className="rounded-xl border border-white/9 bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/38">Részesedés</span><strong className="mt-1 block font-normal">{percent(store.share)}</strong></span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-white/9 pt-2.5 text-[10px] text-[#9be9e5]/72"><span>Üzlet kliensei</span><ChevronRight size={16} /></div>
    </button>
  );
}

function CustomerDetailSheet({
  item,
  year,
  onClose,
}: {
  item: AifAdminCustomerOverviewItem;
  year: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close, true);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[540] bg-[#303a4c] text-white">
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] via-[#28545b] to-[#2a6f70] px-4 py-4" style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}>
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/22 bg-white/[0.08] text-[#d7fffd]"><UserRound size={21} /></span>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/48">Kliens teljesítménylap</p>
              <h2 className="mt-1 truncate text-xl">{item.fullName}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">{item.stores.map((store) => <StoreBadge key={`${store.locationId}-${store.customerId}`} code={store.locationCode} name={store.locationName} />)}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className={iconButton} aria-label="Bezárás"><X size={18} /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
          <section className="rounded-[22px] border border-[#9be9e5]/28 bg-gradient-to-br from-[#1f766f] via-[#28625f] to-[#344154] p-4">
            <p className="text-[9px] uppercase tracking-[0.14em] text-[#d7fffd]/68">{year}. évi forgalom</p>
            <p className="mt-2 text-3xl text-white">{money(item.periodRevenue)}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <span className="rounded-xl border border-white/14 bg-black/10 px-2 py-2.5"><span className="block text-[8px] uppercase text-white/42">Vásárlás</span><strong className="mt-1 block text-lg font-normal">{integer(item.periodTransactions)}</strong></span>
              <span className="rounded-xl border border-white/14 bg-black/10 px-2 py-2.5"><span className="block text-[8px] uppercase text-white/42">Darab</span><strong className="mt-1 block text-lg font-normal">{integer(item.periodItemsSold)}</strong></span>
              <span className="rounded-xl border border-white/14 bg-black/10 px-2 py-2.5"><span className="block text-[8px] uppercase text-white/42">Átlag</span><strong className="mt-1 block truncate text-[12px] font-normal">{money(item.periodAverageBasket)}</strong></span>
            </div>
          </section>

          <BrightDebt amount={numberValue(item.currentOpenBalance)} caption={`${integer(item.currentOpenSales)} nyitott vásárlás`} />

          <section className={`${panel} p-4`}>
            <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Kapcsolati adatok</p>
            <div className="mt-3 space-y-2.5 text-sm text-white/72">
              {item.phone ? <p className="flex items-center gap-2"><Phone size={15} className="text-[#8ee6e2]" />{item.phone}</p> : null}
              {item.email ? <p className="flex min-w-0 items-center gap-2"><Mail size={15} className="shrink-0 text-[#8ee6e2]" /><span className="truncate">{item.email}</span></p> : null}
              {item.address ? <p className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-[#8ee6e2]" /><span>{item.address}</span></p> : null}
              {!item.phone && !item.email && !item.address ? <p className="text-white/38">Nincs további kapcsolati adat.</p> : null}
            </div>
          </section>

          <section className={`${panel} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Üzleti bontás</p><h3 className="mt-1 text-base">Hol vásárolt?</h3></div>
              <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/50">{item.storeCount} üzlet</span>
            </div>
            <div className="mt-3 space-y-2">
              {item.stores.map((store) => (
                <div key={`${store.locationId}-${store.customerId}`} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <div className="flex items-center justify-between gap-3"><StoreBadge code={store.locationCode} name={store.locationName} /><span className="text-sm">{money(store.revenue)}</span></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                    <span className="rounded-xl bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/38">Vásárlás</span><strong className="mt-1 block font-normal">{integer(store.transactions)}</strong></span>
                    <span className="rounded-xl bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/38">Darab</span><strong className="mt-1 block font-normal">{integer(store.itemsSold)}</strong></span>
                    <span className="rounded-xl bg-black/10 px-2 py-2"><span className="block text-[8px] uppercase text-white/38">Utolsó</span><strong className="mt-1 block font-normal">{formatDate(store.lastSaleAt)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`${panel} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Eladói bontás</p><h3 className="mt-1 text-base">Ki szolgálta ki?</h3></div>
              <span className="rounded-full border border-white/12 bg-black/10 px-2.5 py-1 text-[10px] text-white/50">{item.employees.length} eladó</span>
            </div>
            <div className="mt-3 space-y-2">
              {item.employees.map((seller) => (
                <div key={seller.actor} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                  <div className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><UserRound size={14} className="shrink-0 text-[#8ee6e2]" /><span className="truncate text-sm">{seller.actor}</span></span><span className="shrink-0 text-sm">{money(seller.revenue)}</span></div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-white/45"><span>{integer(seller.transactions)} vásárlás • {integer(seller.itemsSold)} db</span><span>{percent(seller.share)}</span></div>
                </div>
              ))}
              {!item.employees.length ? <div className="rounded-2xl border border-dashed border-white/12 px-4 py-7 text-center text-sm text-white/40">Ebben az évben nincs eladói adat.</div> : null}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            {[
              ["Első vásárlás", formatDate(item.firstSaleAt)],
              ["Utolsó vásárlás", formatDate(item.lastSaleAt)],
              ["Összes vásárlás", integer(item.lifetimeTransactions)],
              ["Összes érték valaha", money(item.lifetimePurchaseTotal)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-[#293548] p-3">
                <p className="text-[8px] uppercase tracking-[0.09em] text-white/38">{label}</p>
                <p className="mt-2 truncate text-sm text-white/82" title={value}>{value}</p>
              </div>
            ))}
          </section>

          {item.note ? <section className="rounded-2xl border border-white/10 bg-[#293548] p-4"><p className="text-[9px] uppercase tracking-[0.1em] text-white/38">Megjegyzés</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/68">{item.note}</p></section> : null}
        </div>

        <footer className="border-t border-white/12 bg-[#293548] px-4 py-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={onClose} className="h-12 w-full rounded-xl border border-white/18 bg-white/[0.06] text-sm text-white">Bezárás</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export default function AllInAdminClientsMobile({ actor = "ADMIN" }: Props) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [location, setLocation] = useState<LocationScope>("all");
  const [employee, setEmployee] = useState("");
  const [activity, setActivity] = useState<AifAdminCustomerActivityFilter>("all");
  const [sort, setSort] = useState<AifAdminCustomerSort>("revenue");
  const [topTen, setTopTen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<MobileView>("clients");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<FilterDraft>({ employee: "", activity: "all", sort: "revenue" });
  const [data, setData] = useState<AifAdminCustomersOverviewResponse | null>(null);
  const [selected, setSelected] = useState<AifAdminCustomerOverviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A klienskimutatás nem tölthető be.");
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

  const customers = data?.customers || [];
  const employees = data?.employees || [];
  const stores = data?.stores || [];
  const activeAdvancedCount = (employee ? 1 : 0) + (activity !== "all" ? 1 : 0) + (sort !== "revenue" ? 1 : 0);

  function changeLocation(next: LocationScope) {
    setLocation(next);
    if (next !== "all" && topTen) setTopTen(false);
  }

  function toggleTopTen() {
    setTopTen((current) => {
      const next = !current;
      if (next) {
        setLocation("all");
        setActivity("buyers");
        setSort("revenue");
        setView("clients");
      }
      return next;
    });
  }

  function openFilters() {
    setFilterDraft({ employee, activity, sort });
    setFilterOpen(true);
  }

  function applyFilters() {
    setEmployee(filterDraft.employee);
    setActivity(filterDraft.activity);
    setSort(filterDraft.sort);
    setFilterOpen(false);
    setView("clients");
  }

  function clearAdvancedFilters() {
    const clean: FilterDraft = { employee: "", activity: "all", sort: "revenue" };
    setFilterDraft(clean);
    setEmployee("");
    setActivity("all");
    setSort("revenue");
    setFilterOpen(false);
  }

  function showDebtors() {
    setTopTen(false);
    setEmployee("");
    setActivity("debt");
    setSort("debt");
    setSearchDraft("");
    setSearch("");
    setFilterDraft({ employee: "", activity: "debt", sort: "debt" });
    setView("clients");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("aif-client-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setView("clients");
  }

  function selectEmployee(name: string) {
    setEmployee(name);
    if (activity === "inactive") setActivity("buyers");
    setView("clients");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectStore(code: string) {
    if (code === "main_warehouse" || code === "magazin_targu_secuiesc") {
      changeLocation(code);
      setView("clients");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#586474] via-[#505b6b] to-[#474f5c] text-white">
      <header className="sticky top-0 z-40 border-b border-white/12 bg-[#2f3b4f]/96 px-3 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.28)] backdrop-blur" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/36 bg-[#2a8d8b]/20 text-[#cffffd]"><Users size={22} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] uppercase tracking-[0.16em] text-[#cffffd]/58">Vezetői kliensnézet</p>
            <h1 className="mt-0.5 truncate text-lg">Üzleti kliensek</h1>
            <p className="truncate text-[10px] text-white/43">{actor}</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className={iconButton} aria-label="Frissítés"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button>
          <button type="button" onClick={() => { window.location.hash = "#home"; }} className={iconButton} aria-label="Kezdőlap"><Home size={17} /></button>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-3 px-3 py-3.5">
        <HeroSummary year={year} location={location} data={data} debtActive={activity === "debt"} onDebtClick={showDebtors} />

        <section className={`${panel} p-3`}>
          <div className="grid grid-cols-[92px_1fr_auto] gap-2">
            <MobileSelect
              value={String(year)}
              onChange={(value) => setYear(Number(value))}
              options={years.map((option) => ({ value: String(option), label: String(option) }))}
              ariaLabel="Év"
              compact
            />
            <button type="button" onClick={toggleTopTen} className={`inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs transition ${topTen ? "border-amber-200/50 bg-[#7b6124] text-white" : "border-white/16 bg-[#3b485b] text-white/70"}`}>
              <Trophy size={15} /> Top 10 {topTen ? <CheckCircle2 size={13} /> : null}
            </button>
            <button type="button" onClick={openFilters} className={`relative inline-flex h-10 w-11 items-center justify-center rounded-xl border ${activeAdvancedCount ? "border-[#9be9e5]/48 bg-[#2a8d8b]" : "border-white/16 bg-[#3b485b]"}`} aria-label="Szűrők">
              <Filter size={16} />
              {activeAdvancedCount ? <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-white/30 bg-[#c30d1c] px-1 text-[9px] text-white">{activeAdvancedCount}</span> : null}
            </button>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-white/12 bg-[#293548] p-1">
            {([
              ["all", "Mindkettő"],
              ["main_warehouse", "Csíkszereda"],
              ["magazin_targu_secuiesc", "Kézdi"],
            ] as Array<[LocationScope, string]>).map(([value, label]) => (
              <button key={value} type="button" onClick={() => changeLocation(value)} className={`h-9 rounded-lg px-1 text-[10px] transition ${location === value ? "bg-[#2a8d8b] text-white shadow" : "text-white/55"}`}>{label}</button>
            ))}
          </div>

          {employee ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[#9be9e5]/25 bg-[#2a8d8b]/12 px-3 py-2">
              <span className="min-w-0 truncate text-[11px] text-[#d7fffd]">Eladó: {employee}</span>
              <button type="button" onClick={() => setEmployee("")} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/14 bg-black/10"><X size={13} /></button>
            </div>
          ) : null}

          {activity === "debt" ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-white/32 px-3 py-2 text-white shadow-[0_8px_20px_rgba(195,13,28,0.22)]" style={{ backgroundColor: FIRE_RED }}>
              <span className="inline-flex min-w-0 items-center gap-2 truncate text-[11px]"><WalletCards size={13} /> Csak tartozó kliensek</span>
              <button type="button" onClick={() => { setActivity("all"); setSort("revenue"); setFilterDraft({ employee, activity: "all", sort: "revenue" }); }} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/28 bg-black/10 text-white"><X size={13} /></button>
            </div>
          ) : null}
        </section>

        {error ? <div className="rounded-2xl border border-red-200/45 bg-red-600 px-4 py-3 text-sm text-white">{error}</div> : null}

        <nav className="grid grid-cols-3 gap-1 rounded-2xl border border-white/14 bg-[#303b4e] p-1">
          {([
            ["clients", `Kliensek ${customers.length}`],
            ["employees", `Eladók ${employees.length}`],
            ["stores", `Üzletek ${stores.length}`],
          ] as Array<[MobileView, string]>).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setView(value)} className={`h-10 rounded-xl text-[11px] transition ${view === value ? "bg-[#2a8d8b] text-white" : "text-white/55"}`}>{label}</button>
          ))}
        </nav>

        {view === "clients" ? (
          <section id="aif-client-list" className="scroll-mt-28 space-y-2.5">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <p className={`text-[9px] uppercase tracking-[0.13em] ${activity === "debt" ? "text-red-100/72" : "text-white/42"}`}>{activity === "debt" ? "Tartozás" : topTen ? "Rangsor" : "Klienslista"}</p>
                <h2 className="mt-1 text-lg">{activity === "debt" ? `Tartozó kliensek • ${year}` : topTen ? `Top 10 • ${year}` : `${year}. évi kliensek`}</h2>
              </div>
              <span className="rounded-full border border-white/14 bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/55">{integer(data?.totalFilteredCustomers || 0)} rekord</span>
            </div>

            <form onSubmit={submitSearch} className="grid grid-cols-[1fr_auto] gap-2">
              <label className="relative block">
                <Search size={16} className="pointer-events-none absolute left-3 top-3 text-white/38" />
                <input value={searchDraft} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchDraft(event.target.value)} placeholder="Név, telefon, e-mail…" className="h-10 w-full rounded-xl border border-white/16 bg-[#293548] pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#78ded9]/55" />
              </label>
              <button type="submit" className="inline-flex h-10 w-11 items-center justify-center rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b]"><Search size={16} /></button>
            </form>

            {customers.map((item, index) => <CustomerMobileCard key={item.key} item={item} index={index} year={year} topTen={topTen} onOpen={() => setSelected(item)} />)}
            {!customers.length && !loading ? <div className="rounded-[22px] border border-dashed border-white/14 bg-black/5 px-4 py-12 text-center"><Users size={34} className="mx-auto text-white/25" /><p className="mt-3 text-sm text-white/68">Nincs kliens ebben a szűrésben.</p></div> : null}
          </section>
        ) : null}

        {view === "employees" ? (
          <section className="space-y-2.5">
            <div className="px-1"><p className="text-[9px] uppercase tracking-[0.13em] text-white/42">Eladói teljesítmény</p><h2 className="mt-1 text-lg">Ki mennyit adott el?</h2><p className="mt-1 text-[11px] text-white/45">Koppints egy eladóra, és rögtön az ő klienseit látod.</p></div>
            {employees.map((item, index) => <EmployeeCard key={item.actor} item={item} index={index} onSelect={() => selectEmployee(item.actor)} />)}
            {!employees.length && !loading ? <div className="rounded-[22px] border border-dashed border-white/14 px-4 py-12 text-center text-sm text-white/42">Nincs eladói adat ebben a szűrésben.</div> : null}
          </section>
        ) : null}

        {view === "stores" ? (
          <section className="space-y-2.5">
            <div className="px-1"><p className="text-[9px] uppercase tracking-[0.13em] text-white/42">Üzleti teljesítmény</p><h2 className="mt-1 text-lg">Csíkszereda és Kézdivásárhely</h2><p className="mt-1 text-[11px] text-white/45">Koppints az üzletre a klienslista szűréséhez.</p></div>
            {stores.map((store) => <StoreCard key={store.id} store={store} onSelect={() => selectStore(store.code)} />)}
            {!stores.length && !loading ? <div className="rounded-[22px] border border-dashed border-white/14 px-4 py-12 text-center text-sm text-white/42">Nincs üzleti adat ebben a szűrésben.</div> : null}
          </section>
        ) : null}
      </div>

      <MobileFilterSheet
        open={filterOpen}
        draft={filterDraft}
        employees={data?.filterOptions.employees || []}
        onChange={setFilterDraft}
        onApply={applyFilters}
        onClear={clearAdvancedFilters}
        onClose={() => setFilterOpen(false)}
      />

      {selected ? <CustomerDetailSheet item={selected} year={year} onClose={() => setSelected(null)} /> : null}

      {loading ? (
        <div className="fixed inset-0 z-[500] grid place-items-center bg-slate-950/24 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/18 bg-[#263348] px-5 py-4 shadow-2xl">
            <Loader2 className="animate-spin text-[#8ee6e2]" size={22} />
            <span className="text-sm text-white">Klienskimutatás betöltése…</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
