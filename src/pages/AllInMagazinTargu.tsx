import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Boxes,
  Clock3,
  LogOut,
  PackageSearch,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import AllInMagazinClients from "./AllInMagazinClients";

type Props = {
  apiBase?: string;
  actor?: string;
  role?: "admin" | "shop";
  shopId?: "csikszereda" | "kezdivasarhely";
  onLogout?: () => void | Promise<void>;
};

type ActionCard = {
  key: string;
  title: string;
  description: string;
  icon: typeof ShoppingCart;
  primary?: boolean;
};

const actions: ActionCard[] = [
  {
    key: "sale",
    title: "Új eladás",
    description: "Gyors termékfelvétel, kosár és fizetés.",
    icon: ShoppingCart,
    primary: true,
  },
  {
    key: "search",
    title: "Termék keresése",
    description: "Vonalkód, név, méret vagy termékkód alapján.",
    icon: Search,
  },
  {
    key: "stock",
    title: "Üzleti készlet",
    description: "A kézdivásárhelyi üzlet elérhető készlete.",
    icon: Boxes,
  },
  {
    key: "reserved",
    title: "Félretett termékek",
    description: "Foglalások, átvételek és lejáró félretételek.",
    icon: PackageSearch,
  },
  {
    key: "transfers",
    title: "Beérkező áru",
    description: "Központi átadások és átvételre váró csomagok.",
    icon: Truck,
  },
  {
    key: "returns",
    title: "Visszáru",
    description: "Vevői visszáru és cserefolyamat.",
    icon: RotateCcw,
  },
  {
    key: "receipts",
    title: "Mai bizonylatok",
    description: "A mai eladások és bizonylatok gyors visszakeresése.",
    icon: Receipt,
  },
  {
    key: "summary",
    title: "Napi összesítés",
    description: "Forgalom, darabszám és műszakzárás.",
    icon: BarChart3,
  },
];

function formatDateTime(value: Date) {
  return value.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AllInMagazinTargu({
  actor = "Üzleti felhasználó",
  role = "shop",
  onLogout,
}: Props) {
  const [now, setNow] = useState(() => new Date());
  const [notice, setNotice] = useState("");
  const [clientsOpen, setClientsOpen] = useState(false);
  const [clientsInitialMode, setClientsInitialMode] = useState<"search" | "new">("search");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const sessionLabel = useMemo(
    () => role === "admin" ? "Admin előnézet" : "Üzleti munkamenet",
    [role],
  );

  function openClients(mode: "search" | "new") {
    setClientsInitialMode(mode);
    setClientsOpen(true);
    setNotice("");
  }

  function openModule(action: ActionCard) {
    if (action.key === "sale") {
      window.location.hash = "magazintargusale";
      return;
    }
    setNotice(`${action.title}: a modul a következő fejlesztési lépésben kerül bekötésre.`);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#626d7d] via-[#596373] to-[#505a69] p-3 text-white sm:p-4 lg:p-6">
      <div className="mx-auto max-w-[1480px] space-y-4">
        <header className="rounded-[24px] border border-white/18 bg-[#303a4c] px-4 py-4 shadow-[0_18px_48px_rgba(15,23,42,0.28)] sm:px-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/40 bg-[#2a8d8b]/22 text-[#cffffd]">
              <Store size={28} strokeWidth={1.8} />
            </span>
            <div className="min-w-[240px] border-l-4 border-[#2a8d8b] pl-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#cffffd]/65">AllInFashion • értékesítés</p>
              <h1 className="mt-1 text-2xl tracking-tight sm:text-3xl">ÜZLET – Kézdivásárhely</h1>
              <p className="mt-1 text-sm text-white/55">Magazin - Târgu Secuiesc</p>
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <div className="hidden min-w-[210px] rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2 sm:block">
                <div className="flex items-center gap-2 text-xs text-white/55">
                  <Clock3 size={14} />
                  <span>{formatDateTime(now)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-white">
                  <UserRound size={14} className="text-[#8ee6e2]" />
                  <span className="truncate">{actor}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void onLogout?.()}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/18 bg-[#354153] px-4 text-sm text-white transition hover:bg-[#3e4d63] active:scale-[0.98]"
              >
                <LogOut size={18} />
                Kilépés
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border border-[#7bd7d4]/28 bg-[#244750] px-4 py-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 shrink-0 text-[#9ff3ef]" size={20} />
              <div>
                <p className="text-sm text-white">Kézdivásárhelyi értékesítési felület</p>
                <p className="mt-1 text-xs leading-relaxed text-white/58">
                  A főoldal külön üzleti munkakörnyezetként működik. Az eladási, készlet- és napi zárási modulok innen fognak megnyílni.
                </p>
              </div>
            </div>
          </div>
          <div className="flex min-w-[210px] items-center justify-between gap-3 rounded-2xl border border-white/14 bg-[#354153] px-4 py-3">
            <div>
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/42">Munkamenet</p>
              <p className="mt-1 text-sm text-white">{sessionLabel}</p>
            </div>
            <span className="h-3 w-3 rounded-full bg-[#37c7c2] shadow-[0_0_14px_rgba(55,199,194,0.85)]" />
          </div>
        </section>

        {notice ? (
          <div className="rounded-2xl border border-amber-200/28 bg-amber-500/12 px-4 py-3 text-sm text-amber-50">
            {notice}
          </div>
        ) : null}

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Gyors műveletek</p>
              <h2 className="mt-1 text-xl">Értékesítési központ</h2>
            </div>
            <span className="rounded-full border border-white/14 bg-white/[0.06] px-3 py-1 text-[11px] text-white/55">Érintőképernyőre optimalizált</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => openModule(action)}
                  className={`group min-h-[154px] touch-manipulation rounded-[22px] border p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.16)] transition active:scale-[0.985] ${
                    action.primary
                      ? "border-[#9be9e5]/45 bg-gradient-to-br from-[#2a8d8b] to-[#207572] hover:brightness-110"
                      : "border-white/16 bg-[#3d485a] hover:border-[#7bd7d4]/38 hover:bg-[#465366]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${
                      action.primary
                        ? "border-white/25 bg-white/14 text-white"
                        : "border-[#7bd7d4]/28 bg-[#2a8d8b]/16 text-[#bdf8f5]"
                    }`}>
                      <Icon size={24} strokeWidth={1.8} />
                    </span>
                    <span className="rounded-full border border-white/14 bg-black/10 px-2 py-1 text-[9px] uppercase tracking-[0.1em] text-white/55">
                      {action.primary ? "Megnyitás" : "Következő lépés"}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg text-white">{action.title}</h3>
                  <p className="mt-1.5 text-sm leading-snug text-white/58">{action.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[22px] border border-white/18 bg-[#3b4759] p-3 shadow-[0_12px_28px_rgba(15,23,42,0.14)]">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openClients("search")}
              className="flex min-h-14 min-w-0 flex-1 touch-manipulation items-center gap-3 rounded-2xl px-2 text-left text-white transition hover:bg-white/[0.05] active:scale-[0.995]"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]">
                <Users size={21} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] uppercase tracking-[0.14em] text-white/42">Vevői nyilvántartás</span>
                <span className="mt-1 block text-lg text-white">Kliensek</span>
              </span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openClients("search")}
                className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-4 text-sm text-white transition hover:bg-[#465366] active:scale-[0.98]"
              >
                <Search size={17} /> Lista
              </button>
              <button
                type="button"
                onClick={() => openClients("new")}
                className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border border-[#9be9e5]/45 bg-[#2a8d8b] px-4 text-sm text-white transition hover:bg-[#319c99] active:scale-[0.98]"
              >
                <UserPlus size={17} /> Új kliens
              </button>
            </div>
          </div>
        </section>

      </div>

      <AllInMagazinClients
        open={clientsOpen}
        initialMode={clientsInitialMode}
        locationName="Magazin - Târgu Secuiesc"
        onClose={() => setClientsOpen(false)}
      />
    </main>
  );
}
