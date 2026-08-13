import React, { useEffect, useState } from "react";
import {
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
  { label: "Új bevételezés", hash: "#allinincoming", icon: Truck },
  { label: "Receptiók", hash: "#allinreceptions", icon: ClipboardList },
  { label: "Beszállítók", hash: "#allinsuppliers", icon: Building2 },
  { label: "Rendelések", hash: "#allinorderhistory", icon: History },
];

function justDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  return String(value).slice(0, 10);
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
  tone?: "normal" | "warning" | "danger";
  badge?: string;
}) {
  const Icon = item.icon;
  const toneClass = tone === "danger"
    ? "border-red-300/55 bg-[#a7192a] hover:bg-[#b51d30]"
    : tone === "warning"
      ? "border-orange-200/55 bg-[#8a5a22] hover:bg-[#9a6728]"
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
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  open: boolean;
  onToggle: () => void;
  items: MenuItem[];
  onItemSelect?: (item: MenuItem) => void;
  itemDecorations?: Record<string, { tone?: "normal" | "warning" | "danger"; badge?: string }>;
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
  tone?: "normal" | "warning" | "danger";
  badge?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-300/55 bg-[#c90d22] hover:bg-[#ad0b1d]"
      : tone === "warning"
        ? "border-amber-200/50 bg-[#7a6226] hover:bg-[#8b712c]"
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
            const expiry = String(item?.expiresOn || "").slice(0, 10);
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
  } satisfies Record<string, { tone?: "normal" | "warning" | "danger"; badge?: string }>;

  const handleShopItem = (item: MenuItem) => {
    if (item.adminModule) {
      setShopAdminModule(item.adminModule);
      return;
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
          <MenuGroup
            title="Üzletek"
            count={shopItems.length}
            icon={Store}
            open={openGroup === "shops"}
            onToggle={() => toggleGroup("shops")}
            items={shopItems}
            onItemSelect={handleShopItem}
            itemDecorations={shopItemDecorations}
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
