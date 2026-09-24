import React, { useEffect, useState } from "react";
import {
  Activity,
  Bookmark,
  Building2,
  Calendar,
  Car,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  History,
  FileText,
  LogOut,
  Package,
  Repeat,
  ShoppingBag,
  Store,
  BarChart3,
  Truck,
  Users,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import AllInAdminShopWorkflows, { type AllInAdminShopWorkflowMode } from "./AllInAdminShopWorkflows";

const API = (import.meta as any).env?.VITE_API_BASE || "/api";
const AIF_LEGACY_IMPORT_MODE_KEY = "allinfashion:incoming:legacy-import:v1";

const LOGO_URL =
  "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/allin-logo-w.png";

type CarLevel = "ok" | "soon" | "expired";
type GroupKey = "shops" | "warehouse" | "incoming";

type CarRow = {
  itp_date?: string;
  itp_years?: number;
  itp_months?: number;
  rca_date?: string;
  casco_start?: string;
  casco_months?: number;
  rovinieta_start?: string;
  rovinieta_months?: number;
};

type MenuItem = {
  key?: string;
  label: string;
  hash?: string;
  adminModule?: AllInAdminShopWorkflowMode;
  icon: React.ComponentType<{ className?: string }>;
};

const shopItems: MenuItem[] = [
  { key: "ciuc", label: "Csíkszereda", hash: "#allinadminmagazinciuc", icon: BarChart3 },
  { key: "targu", label: "Kézdivásárhely", hash: "#allinadminmagazintargu", icon: BarChart3 },
  { key: "clients", label: "Kliensek", hash: "#allinadminclients", icon: Users },
  { key: "reservations", label: "Félretett termékek", adminModule: "reservations", icon: Bookmark },
  { key: "returns", label: "Visszáru", adminModule: "returns", icon: RotateCcw },
  { key: "shifts", label: "Műszakátadások", adminModule: "shifts", icon: WalletCards },
];

const warehouseItems: MenuItem[] = [
  { label: "Raktár", hash: "#allinwarehouse", icon: Package },
  { label: "Leltár", hash: "#allininventory", icon: ClipboardList },
  { label: "Készletmozgások", hash: "#allinstockmoves", icon: Repeat },
  { label: "Készletbizonylatok", hash: "#allinproductmoves", icon: FileText },
  { label: "Lefoglalt termékek", hash: "#allinreserved", icon: Bookmark },
];

const incomingItems: MenuItem[] = [
  { key: "incoming_new", label: "Új bevételezés", hash: "#allinincoming", icon: Truck },
  { key: "receptions", label: "Receptiók", hash: "#allinreceptions", icon: ClipboardList },
  { key: "suppliers", label: "Beszállítók", hash: "#allinsuppliers", icon: Building2 },
  { key: "orders", label: "Rendelések", hash: "#allinorderhistory", icon: History },
  { key: "legacy_import", label: "Régi rendszer import", hash: "#allinincoming", icon: History },
];

function justDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  return String(value).slice(0, 10);
}

function normalizeReservationDate(value?: string | Date | null) {
  if (!value) return "";

  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) return "";
  return `${values.year}-${values.month}-${values.day}`;
}

function daysLeft(fromIso: string | undefined, years = 0, months = 0): number | null {
  if (!fromIso) return null;
  const start = new Date(`${fromIso}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;

  const expiry = new Date(start);
  if (years) expiry.setFullYear(expiry.getFullYear() + years);
  if (months) expiry.setMonth(expiry.getMonth() + months);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((expiry.getTime() - todayStart.getTime()) / 86_400_000);
}

function normalizeItpYearsLike(row: CarRow): number {
  const years = Number(row.itp_years);
  if (Number.isFinite(years) && years > 0) return years > 5 ? 2 : Math.round(years);

  const months = Number(row.itp_months);
  if (Number.isFinite(months) && months > 0) {
    return Math.max(1, Math.min(2, Math.round(months / 12)));
  }

  return 1;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function navigate(hash: string) {
  window.location.hash = hash;
}

function ChildMenuButton({
  item,
  onSelect,
  tone = "normal",
  badge,
}: {
  item: MenuItem;
  onSelect?: (item: MenuItem) => void;
  tone?: "normal" | "warning" | "danger" | "accent";
  badge?: string;
}) {
  const Icon = item.icon;
  const toneClass = tone === "danger"
    ? "border-red-300/55 bg-[#a7192a] hover:bg-[#b51d30]"
    : tone === "warning"
      ? "border-orange-200/70 bg-gradient-to-r from-[#e67817] to-[#bd5410] shadow-[0_7px_18px_rgba(234,88,12,0.24)] hover:from-[#f28724] hover:to-[#ce6016]"
      : tone === "accent"
        ? "border-[#7bd7d4]/55 bg-gradient-to-r from-[#247f7c] to-[#2c6674] shadow-[0_8px_20px_rgba(42,141,139,0.20)] hover:from-[#2b918d] hover:to-[#337989]"
        : "border-white/14 bg-[#354153] hover:border-[#67d4d1]/55 hover:bg-[#3e4d63]";

  return (
    <button
      className={`group flex h-10 w-full items-center gap-2.5 rounded-lg border px-3 text-left text-sm text-white transition ${toneClass}`}
      onClick={() => {
        if (onSelect) onSelect(item);
        else if (item.hash) navigate(item.hash);
      }}
      type="button"
    >
      <Icon className="h-4 w-4 shrink-0 text-[#9ee5e2]" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge ? <span className="rounded-full border border-white/28 bg-black/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.04em]">{badge}</span> : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-white/38 transition group-hover:translate-x-0.5 group-hover:text-white/75" />
    </button>
  );
}

function MenuGroup({
  title,
  count,
  icon: Icon,
  open,
  onToggle,
  items,
  onItemSelect,
  itemDecorations,
  alertCount = 0,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  open: boolean;
  onToggle: () => void;
  items: MenuItem[];
  onItemSelect?: (item: MenuItem) => void;
  itemDecorations?: Record<string, { tone?: "normal" | "warning" | "danger" | "accent"; badge?: string }>;
  alertCount?: number;
}) {
  return (
    <section>
      <button
        className={`flex h-12 w-full items-center gap-3 rounded-xl border px-3.5 text-left text-white transition ${
          open
            ? "border-[#67d4d1]/65 bg-[#303b4e] shadow-[0_0_0_1px_rgba(103,212,209,0.08)]"
            : "border-white/30 bg-[#354153] hover:border-white/45 hover:bg-[#3c485b]"
        }`}
        onClick={onToggle}
        type="button"
        aria-expanded={open}
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#67d4d1]/30 bg-[#208d8b]/14 text-[#cffffd]">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm uppercase tracking-[0.045em]">{title}</span>
        {alertCount > 0 ? (
          <span
            className="inline-flex min-w-7 items-center justify-center rounded-full border border-orange-200/65 bg-[#d66b12] px-2 py-0.5 text-[10px] font-semibold text-white shadow-[0_4px_12px_rgba(234,88,12,0.24)]"
            title={`${alertCount} figyelmeztetés az almenüben`}
          >
            ({alertCount})
          </span>
        ) : null}
        <span className="rounded-full border border-white/18 bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/62">
          {count}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-white/65 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="ml-4 mt-2 space-y-1.5 border-l-2 border-[#67d4d1]/28 pl-3">
          {items.map((item) => {
            const decoration = itemDecorations?.[item.key || ""] || {};
            return (
              <ChildMenuButton
                key={item.key || item.hash || item.label}
                item={item}
                onSelect={onItemSelect}
                tone={decoration.tone}
                badge={decoration.badge}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function MainMenuButton({
  label,
  hash,
  icon: Icon,
  tone = "normal",
  badge,
}: {
  label: string;
  hash: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "normal" | "warning" | "danger" | "accent";
  badge?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-300/55 bg-[#c90d22] hover:bg-[#ad0b1d]"
      : tone === "warning"
        ? "border-amber-200/50 bg-[#7a6226] hover:bg-[#8b712c]"
        : tone === "accent"
          ? "border-[#7bd7d4]/55 bg-gradient-to-r from-[#247f7c] to-[#2c6674] hover:brightness-110"
          : "border-white/30 bg-[#354153] hover:border-white/45 hover:bg-[#3c485b]";

  return (
    <button
      className={`group flex h-12 w-full items-center gap-3 rounded-xl border px-3.5 text-left text-white transition ${toneClass}`}
      onClick={() => navigate(hash)}
      type="button"
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/18 bg-black/10">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm uppercase tracking-[0.045em]">{label}</span>
      {badge ? (
        <span className="rounded-full border border-white/28 bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.05em]">
          {badge}
        </span>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-white/55 transition group-hover:translate-x-0.5 group-hover:text-white" />
    </button>
  );
}

export default function AllInHome(props: { onLogout?: () => void }) {
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(null);
  const [carsLevel, setCarsLevel] = useState<CarLevel>("ok");
  const [vacationPendingCount, setVacationPendingCount] = useState(0);
  const [shopAdminModule, setShopAdminModule] = useState<AllInAdminShopWorkflowMode | null>(null);
  const [reservationAlert, setReservationAlert] = useState({ overdue: 0, today: 0, tomorrow: 0 });

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const data = await fetchJson(`${API}/cars`);
        const rows = (Array.isArray(data) ? data : data?.rows || []) as CarRow[];
        let hasExpired = false;
        let hasSoon = false;

        for (const car of rows) {
          const values = [
            daysLeft(justDate(car.itp_date), normalizeItpYearsLike(car), 0),
            daysLeft(justDate(car.rca_date), 1, 0),
            daysLeft(justDate(car.casco_start), 0, Number(car.casco_months || 0)),
            daysLeft(justDate(car.rovinieta_start), 0, Number(car.rovinieta_months || 0)),
          ];

          if (values.some((days) => days != null && days < 0)) hasExpired = true;
          if (values.some((days) => days != null && days >= 0 && days <= 5)) hasSoon = true;
          if (hasExpired) break;
        }

        if (alive) setCarsLevel(hasExpired ? "expired" : hasSoon ? "soon" : "ok");
      } catch {
        if (alive) setCarsLevel("ok");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let timer = 0;

    const loadPendingVacations = async () => {
      try {
        const data = await fetchJson(`${API}/admin/vacations/requests/pending-count`);
        if (alive) setVacationPendingCount(Math.max(0, Number(data?.count || 0)));
      } catch {
        if (alive) setVacationPendingCount(0);
      }
    };

    void loadPendingVacations();
    timer = window.setInterval(() => void loadPendingVacations(), 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let timer = 0;

    const loadReservationAlerts = async () => {
      try {
        const stores = ["main_warehouse", "magazin_targu_secuiesc"];
        const responses = await Promise.all(
          stores.map((location) => fetchJson(`${API}/aif/shop-reservations?location=${encodeURIComponent(location)}&mode=active`)),
        );
        const today = new Date();
        const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const tomorrowDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        const tomorrowIso = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;
        let overdue = 0;
        let dueToday = 0;
        let tomorrow = 0;
        for (const response of responses) {
          for (const item of response?.items || []) {
            const expiry = normalizeReservationDate(item?.expiresOn);
            if (!expiry) continue;
            if (expiry < todayIso) overdue += 1;
            else if (expiry === todayIso) dueToday += 1;
            else if (expiry === tomorrowIso) tomorrow += 1;
          }
        }
        if (alive) setReservationAlert({ overdue, today: dueToday, tomorrow });
      } catch {
        if (alive) setReservationAlert({ overdue: 0, today: 0, tomorrow: 0 });
      }
    };

    void loadReservationAlerts();
    timer = window.setInterval(() => void loadReservationAlerts(), 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const toggleGroup = (group: GroupKey) => {
    setOpenGroup((current) => (current === group ? null : group));
  };

  const logout = async () => {
    try {
      await props.onLogout?.();
    } finally {
      window.location.hash = "";
    }
  };

  const carTone = carsLevel === "expired" ? "danger" : carsLevel === "soon" ? "warning" : "normal";
  const carBadge = carsLevel === "expired" ? "Lejárt" : carsLevel === "soon" ? "5 napon belül" : undefined;
  const reservationTone =
    reservationAlert.overdue > 0 || reservationAlert.today > 0 || reservationAlert.tomorrow > 0
      ? "warning"
      : "normal";
  const reservationBadge = reservationAlert.overdue > 0
    ? `${reservationAlert.overdue} lejárt`
    : reservationAlert.today > 0
      ? `${reservationAlert.today} ma lejár`
      : reservationAlert.tomorrow > 0
        ? `${reservationAlert.tomorrow} holnap`
        : undefined;
  const shopItemDecorations = {
    reservations: { tone: reservationTone, badge: reservationBadge },
  } satisfies Record<string, { tone?: "normal" | "warning" | "danger" | "accent"; badge?: string }>;

  const handleShopItem = (item: MenuItem) => {
    if (item.adminModule) {
      setShopAdminModule(item.adminModule);
      return;
    }
    if (item.hash) navigate(item.hash);
  };

  const handleIncomingItem = (item: MenuItem) => {
    try {
      if (item.key === "legacy_import") window.sessionStorage.setItem(AIF_LEGACY_IMPORT_MODE_KEY, "1");
      else window.sessionStorage.removeItem(AIF_LEGACY_IMPORT_MODE_KEY);
    } catch {
      // A sessionStorage hiánya nem akadályozhatja a navigációt.
    }
    if (item.hash) navigate(item.hash);
  };

  return (
    <main className="min-h-screen bg-[#474c59] px-3 py-4 font-normal text-white sm:grid sm:place-items-center sm:py-6">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/20 bg-white/[0.045] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.22)] sm:p-5">
        <header className="mb-4 border-b border-white/12 pb-4">
          <div className="grid place-items-center">
            <img
              src={LOGO_URL}
              alt="ALL IN"
              className="h-11 w-auto object-contain sm:h-12"
              loading="eager"
            />
            <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white/42">Belső rendszer</p>
          </div>
        </header>

        <div className="space-y-2.5">
          <MainMenuButton
            label="Vezetői eladási központ"
            hash="#allinsalescenter"
            icon={Activity}
            tone="accent"
            badge="ELEMZÉSEK"
          />

          <div className="my-3 border-t border-white/12" />

          <MenuGroup
            title="Üzletek"
            count={shopItems.length}
            icon={Store}
            open={openGroup === "shops"}
            onToggle={() => toggleGroup("shops")}
            items={shopItems}
            onItemSelect={handleShopItem}
            itemDecorations={shopItemDecorations}
            alertCount={reservationAlert.overdue + reservationAlert.today + reservationAlert.tomorrow}
          />

          <MenuGroup
            title="Raktár / Termékek"
            count={warehouseItems.length}
            icon={Package}
            open={openGroup === "warehouse"}
            onToggle={() => toggleGroup("warehouse")}
            items={warehouseItems}
          />

          <MenuGroup
            title="Áru bevételezés"
            count={incomingItems.length}
            icon={Truck}
            open={openGroup === "incoming"}
            onToggle={() => toggleGroup("incoming")}
            items={incomingItems}
            onItemSelect={handleIncomingItem}
          />

          <div className="my-3 border-t border-white/12" />

          <MainMenuButton
            label="Shopify rendelések"
            hash="#allinshopifyorders"
            icon={ShoppingBag}
          />
          <MainMenuButton
            label="Szabadságok"
            hash="#allinvacations"
            icon={Calendar}
            tone={vacationPendingCount > 0 ? "danger" : "normal"}
            badge={vacationPendingCount > 0 ? `${vacationPendingCount} kérés` : undefined}
          />
          <MainMenuButton label="Felhasználók" hash="#allinusers" icon={Users} />
          <MainMenuButton
            label="Autók"
            hash="#allincars"
            icon={Car}
            tone={carTone}
            badge={carBadge}
          />
        </div>

        <footer className="mt-4 flex justify-center border-t border-white/10 pt-4">
          <button
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/18 bg-[#354153] px-4 text-xs text-white/72 transition hover:border-white/35 hover:text-white"
            onClick={logout}
            type="button"
          >
            <LogOut className="h-4 w-4" />
            Kilépés
          </button>
        </footer>
      </div>

      <AllInAdminShopWorkflows
        open={shopAdminModule !== null}
        initialMode={shopAdminModule || "reservations"}
        actor="ADMIN"
        onClose={() => setShopAdminModule(null)}
      />
    </main>
  );
}
