import React, { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Building2,
  Calendar,
  Car,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  History,
  LogOut,
  Package,
  Repeat,
  Search,
  ShoppingBag,
  Truck,
  Users,
  X,
} from "lucide-react";

const API = (import.meta as any).env?.VITE_API_BASE || "/api";

const LOGO_URL =
  "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/allin-logo-w.png";
const MENU_STATE_KEY = "allinfashion:home:menu-groups:v2";

type IconType = React.ComponentType<{
  className?: string;
  size?: number;
  strokeWidth?: number;
}>;

type MenuItem = {
  label: string;
  description: string;
  hash: string;
  icon: IconType;
  group?: string;
};

type MenuGroupKey = "warehouse" | "incoming";
type MenuGroupState = Record<MenuGroupKey, boolean>;
type CarLevel = "ok" | "soon" | "expired";

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

const warehouseItems: MenuItem[] = [
  {
    label: "Raktár",
    description: "Termékek, variánsok és aktuális készlet",
    hash: "#allinwarehouse",
    icon: Package,
    group: "Raktár / Termékek",
  },
  {
    label: "Leltár",
    description: "Készletellenőrzés helyszínenként",
    hash: "#allininventory",
    icon: ClipboardList,
    group: "Raktár / Termékek",
  },
  {
    label: "Raktármozgás",
    description: "Bevételek, kiadások és készletváltozások",
    hash: "#allinstockmoves",
    icon: Repeat,
    group: "Raktár / Termékek",
  },
  {
    label: "Termékmozgás",
    description: "Átadások, proces-verbálok és bizonylatok",
    hash: "#allinproductmoves",
    icon: History,
    group: "Raktár / Termékek",
  },
  {
    label: "Lefoglalt termékek",
    description: "Foglalások és elkülönített készlet",
    hash: "#allinreserved",
    icon: Bookmark,
    group: "Raktár / Termékek",
  },
];

const incomingItems: MenuItem[] = [
  {
    label: "Áru bevételezés",
    description: "Új receptió és terméksorok rögzítése",
    hash: "#allinincoming",
    icon: Truck,
    group: "Áru bevételezés",
  },
  {
    label: "Receptiók",
    description: "Mentett bevételezések és ellenőrzés",
    hash: "#allinreceptions",
    icon: ClipboardList,
    group: "Áru bevételezés",
  },
  {
    label: "Beszállítók",
    description: "Beszállítók, márkák és kapcsolatok",
    hash: "#allinsuppliers",
    icon: Building2,
    group: "Áru bevételezés",
  },
  {
    label: "Rendelések",
    description: "Beszerzési rendelések és előzmények",
    hash: "#allinorderhistory",
    icon: History,
    group: "Áru bevételezés",
  },
];

const directItems: MenuItem[] = [
  {
    label: "Shopify rendelések",
    description: "Online rendelések, fizetések és teljesítés",
    hash: "#allinshopifyorders",
    icon: ShoppingBag,
    group: "Közvetlen menüpont",
  },
  {
    label: "Szabadságok",
    description: "Távollétek, kérelmek és kompenzáció",
    hash: "#allinvacations",
    icon: Calendar,
    group: "Közvetlen menüpont",
  },
  {
    label: "Felhasználók",
    description: "Hozzáférések és felhasználói fiókok",
    hash: "#allinusers",
    icon: Users,
    group: "Közvetlen menüpont",
  },
  {
    label: "Autók",
    description: "Járművek, lejáratok és kiadások",
    hash: "#allincars",
    icon: Car,
    group: "Közvetlen menüpont",
  },
];

function justDate(s?: string | null): string | undefined {
  if (!s) return undefined;
  return String(s).slice(0, 10);
}

function daysLeft(fromISO: string | undefined, years = 0, months = 0): number | null {
  if (!fromISO) return null;
  const start = new Date(`${fromISO}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const expiry = new Date(start);
  if (years) expiry.setFullYear(expiry.getFullYear() + years);
  if (months) expiry.setMonth(expiry.getMonth() + months);
  const today = new Date();
  const ms = expiry.getTime() - new Date(today.toDateString()).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function normalizeItpYearsLike(obj: any): number {
  const c = obj || {};
  const y = Number(c.itp_years);
  if (Number.isFinite(y) && y > 0) return y > 5 ? 2 : Math.round(y);
  const m = Number(c.itp_months);
  if (Number.isFinite(m) && m > 0) {
    return Math.max(1, Math.min(2, Math.round(m / 12)));
  }
  return 1;
}

async function fetchJSON(url: string) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function readMenuState(): MenuGroupState {
  const fallback: MenuGroupState = { warehouse: true, incoming: false };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MENU_STATE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      warehouse: parsed.warehouse !== false,
      incoming: parsed.incoming === true,
    };
  } catch {
    return fallback;
  }
}

function navigate(hash: string) {
  window.location.hash = hash;
}

function MenuItemButton(props: {
  item: MenuItem;
  badge?: string;
  tone?: "normal" | "warning" | "danger";
  compact?: boolean;
}) {
  const Icon = props.item.icon;
  const tone = props.tone || "normal";
  const toneClass =
    tone === "danger"
      ? "border-red-300/45 bg-[#5a2834] hover:border-red-200/70 hover:bg-[#67303c]"
      : tone === "warning"
        ? "border-amber-200/45 bg-[#5a4d30] hover:border-amber-100/70 hover:bg-[#665737]"
        : "border-white/18 bg-[#354153] hover:border-[#79d4d0]/55 hover:bg-[#3b495d]";
  const iconClass =
    tone === "danger"
      ? "border-red-200/35 bg-red-400/15 text-red-50"
      : tone === "warning"
        ? "border-amber-100/35 bg-amber-300/15 text-amber-50"
        : "border-[#79d4d0]/25 bg-[#208d8b]/13 text-[#cffffd]";

  return (
    <button
      className={`group flex w-full items-center gap-3 rounded-2xl border text-left text-white shadow-sm transition ${
        props.compact ? "min-h-[66px] px-3 py-2.5" : "min-h-[76px] px-3.5 py-3"
      } ${toneClass}`}
      onClick={() => navigate(props.item.hash)}
      type="button"
    >
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconClass}`}>
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm uppercase tracking-[0.045em] text-white">{props.item.label}</span>
          {props.badge ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.05em] ${
                tone === "danger"
                  ? "border-red-200/40 bg-red-300/12 text-red-50"
                  : "border-amber-100/40 bg-amber-200/12 text-amber-50"
              }`}
            >
              {props.badge}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs leading-4 text-white/56">{props.item.description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/42 transition group-hover:translate-x-0.5 group-hover:text-white/80" />
    </button>
  );
}

function MenuGroup(props: {
  groupKey: MenuGroupKey;
  title: string;
  description: string;
  icon: IconType;
  items: MenuItem[];
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = props.icon;
  return (
    <section className="overflow-hidden rounded-2xl border border-white/18 bg-white/[0.035] shadow-sm">
      <button
        className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left text-white transition hover:bg-white/[0.055]"
        onClick={props.onToggle}
        type="button"
        aria-expanded={props.open}
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#79d4d0]/28 bg-[#208d8b]/16 text-[#d7fffd]">
          <Icon size={20} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base uppercase tracking-[0.055em]">{props.title}</span>
            <span className="rounded-full border border-white/14 bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/62">
              {props.items.length} menüpont
            </span>
          </span>
          <span className="mt-1 block text-xs leading-4 text-white/52">{props.description}</span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-white/58 transition-transform duration-200 ${props.open ? "rotate-180" : ""}`}
        />
      </button>

      {props.open ? (
        <div className="border-t border-white/10 bg-[#303a4b]/55 p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            {props.items.map((item) => (
              <MenuItemButton key={item.hash} item={item} compact />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function AllInHome(props: { onLogout?: () => void }) {
  const [carsLevel, setCarsLevel] = useState<CarLevel>("ok");
  const [openGroups, setOpenGroups] = useState<MenuGroupState>(() => readMenuState());
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      window.localStorage.setItem(MENU_STATE_KEY, JSON.stringify(openGroups));
    } catch {
      // A menü nyitott állapota kényelmi beállítás, hibája nem akadályozhatja a használatot.
    }
  }, [openGroups]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchJSON(`${API}/cars`);
        const rows = (Array.isArray(data) ? data : data?.rows || []) as CarRow[];
        let hasExpired = false;
        let hasSoon = false;

        for (const car of rows) {
          const itpYears = normalizeItpYearsLike(car);
          const itp = daysLeft(justDate(car.itp_date), itpYears || 1, 0);
          const rca = daysLeft(justDate(car.rca_date), 1, 0);
          const casco = daysLeft(justDate(car.casco_start), 0, car.casco_months || 0);
          const rovinieta = daysLeft(
            justDate(car.rovinieta_start),
            0,
            car.rovinieta_months || 0
          );
          const values = [itp, rca, casco, rovinieta];

          if (values.some((days) => days != null && days < 0)) hasExpired = true;
          if (values.some((days) => days != null && days >= 0 && days <= 5)) hasSoon = true;
          if (hasExpired) break;
        }

        if (!alive) return;
        setCarsLevel(hasExpired ? "expired" : hasSoon ? "soon" : "ok");
      } catch {
        if (!alive) return;
        setCarsLevel("ok");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const searchResults = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return [];
    return [...warehouseItems, ...incomingItems, ...directItems].filter((item) =>
      normalizeSearch(`${item.label} ${item.description} ${item.group || ""}`).includes(query)
    );
  }, [search]);

  const carBadge = carsLevel === "expired" ? "Lejárt" : carsLevel === "soon" ? "Hamarosan" : undefined;
  const carTone = carsLevel === "expired" ? "danger" : carsLevel === "soon" ? "warning" : "normal";

  const toggleGroup = (key: MenuGroupKey) => {
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }));
  };

  const logout = async () => {
    try {
      await props.onLogout?.();
    } finally {
      window.location.hash = "";
    }
  };

  return (
    <main className="min-h-screen bg-[#474f5e] px-3 py-5 font-normal text-white sm:px-5 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="overflow-hidden rounded-[26px] border border-white/18 bg-[#4d5666] shadow-[0_24px_70px_rgba(15,23,42,0.28)]">
          <header className="border-b border-white/12 bg-[#303a4c] px-4 py-4 sm:px-5">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-32 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] px-3 sm:w-36">
                <img
                  src={LOGO_URL}
                  alt="ALL IN"
                  className="max-h-11 w-auto object-contain"
                  loading="eager"
                />
              </div>
              <div className="min-w-0 flex-1 border-l-4 border-[#79d4d0]/65 pl-3">
                <p className="text-[10px] uppercase tracking-[0.19em] text-[#cffffd]/62">AllInFashion</p>
                <h1 className="mt-1 text-xl leading-tight tracking-tight text-white sm:text-2xl">Rendszerközpont</h1>
                <p className="mt-1 text-xs leading-4 text-white/50">Termékek, bevételezés, rendelések és adminisztráció egy helyen</p>
              </div>
            </div>
          </header>

          <div className="space-y-3 p-3 sm:p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/42" />
              <input
                className="h-11 w-full rounded-xl border border-white/18 bg-[#303a4c] pl-10 pr-11 text-sm text-white outline-none placeholder:text-white/38 focus:border-[#79d4d0]/60 focus:ring-1 focus:ring-[#79d4d0]/22"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Menüpont keresése..."
                aria-label="Menüpont keresése"
              />
              {search ? (
                <button
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg border border-white/12 bg-white/[0.055] text-white/65 hover:text-white"
                  onClick={() => setSearch("")}
                  type="button"
                  aria-label="Keresés törlése"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>

            {search.trim() ? (
              <section className="rounded-2xl border border-white/16 bg-[#303a4c]/55 p-2.5">
                <div className="flex items-center justify-between px-1 pb-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.08em] text-white/72">Keresési találatok</p>
                    <p className="mt-0.5 text-[11px] text-white/42">{searchResults.length} menüpont</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {searchResults.map((item) => {
                    const isCar = item.hash === "#allincars";
                    return (
                      <MenuItemButton
                        key={item.hash}
                        item={item}
                        compact
                        badge={isCar ? carBadge : undefined}
                        tone={isCar ? carTone : "normal"}
                      />
                    );
                  })}
                </div>
                {!searchResults.length ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-6 text-center text-sm text-white/55">
                    Nincs a keresésnek megfelelő menüpont.
                  </div>
                ) : null}
              </section>
            ) : (
              <>
                <MenuGroup
                  groupKey="warehouse"
                  title="Raktár / Termékek"
                  description="Termékek, készlet, leltár, mozgások és foglalások"
                  icon={Package}
                  items={warehouseItems}
                  open={openGroups.warehouse}
                  onToggle={() => toggleGroup("warehouse")}
                />

                <MenuGroup
                  groupKey="incoming"
                  title="Áru bevételezés"
                  description="Bevételezés, receptiók, beszállítók és beszerzési rendelések"
                  icon={Truck}
                  items={incomingItems}
                  open={openGroups.incoming}
                  onToggle={() => toggleGroup("incoming")}
                />

                <section className="rounded-2xl border border-white/16 bg-white/[0.025] p-2.5">
                  <div className="mb-2 px-1">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/42">Közvetlen elérés</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {directItems.map((item) => {
                      const isCar = item.hash === "#allincars";
                      return (
                        <MenuItemButton
                          key={item.hash}
                          item={item}
                          compact
                          badge={isCar ? carBadge : undefined}
                          tone={isCar ? carTone : "normal"}
                        />
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#303a4c]/72 px-4 py-3 sm:px-5">
            <p className="text-[11px] text-white/36">A csoportok nyitott állapotát a böngésző megjegyzi.</p>
            <button
              onClick={logout}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/18 bg-white/[0.055] px-3 text-xs text-white/72 transition hover:border-white/32 hover:bg-white/[0.085] hover:text-white"
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Kilépés
            </button>
          </footer>
        </div>
      </div>
    </main>
  );
}
