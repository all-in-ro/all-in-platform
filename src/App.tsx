import { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut, UserRound, X } from "lucide-react";
import Login from "./pages/Login";

import AllInHome from "./pages/AllInHome";
import AllInIncoming from "./pages/AllInIncoming";
import AllInOrderHistory from "./pages/AllInOrderHistory";
import AllInShopifyOrders from "./pages/AllInShopifyOrders";
import AllInWarehouse from "./pages/AllInWarehouse";
import AllInWarehouseMobile from "./pages/AllInWarehouseMobile";

import AllInMagazinCiuc from "./pages/AllInMagazinCiuc";
import AllInMagazinTargu from "./pages/AllInMagazinTargu";
import AllInMagazinCiucSale from "./pages/AllInMagazinCiucSale";
import AllInMagazinTarguSale from "./pages/AllInMagazinTarguSale";
import AllInAdminMagazinCiuc from "./pages/AllInAdminMagazinCiuc";
import AllInAdminMagazinTargu from "./pages/AllInAdminMagazinTargu";
import AllInAdminMagazinDashboardMobile from "./pages/AllInAdminMagazinDashboardMobile";
import AllInAdminClients from "./pages/AllInAdminClients";
import AllInAdminClientsMobile from "./pages/AllInAdminClientsMobile";

import AllInReserved from "./pages/AllInReserved";
import AllInStockMoves from "./pages/AllInStockMoves";
import AllInInventory from "./pages/AllInInventory";
import AllInInventoryMobile from "./pages/AllInInventoryMobile";
import AllInSuppliers from "./pages/AllInSuppliers";
import AllInReceptions from "./pages/AllInReceptions";
import AllInBarcodes from "./pages/AllInBarcodes";

import AllInProductMoves from "./pages/AllInProductMoves";
import AllInVacations from "./pages/AllInVacations";
import AllInUsers from "./pages/AllInUsers";
import AllInCars from "./pages/AllInCars";
import AllInCarExpenses from "./pages/AllInCarExpenses";

type ShopId = "csikszereda" | "kezdivasarhely";
type ScreenName =
  | "login"
  | "home"
  | "magazinciuc"
  | "magazintargu"
  | "magazinciucsale"
  | "magazintargusale"
  | "adminmagazinciuc"
  | "adminmagazintargu"
  | "adminclients"
  | "incoming"
  | "orders"
  | "shopifyorders"
  | "warehouse"
  | "reserved"
  | "stockmoves"
  | "inventory"
  | "suppliers"
  | "receptions"
  | "barcodes"
  | "productmoves"
  | "vacations"
  | "users"
  | "cars"
  | "carexpenses";

type Screen = { name: ScreenName };

type Session =
  | { role: "admin"; actor: string }
  | { role: "shop"; shopId: ShopId; actor: string };

const INACTIVITY_LOGOUT_MS = 15 * 60 * 1000;
const INACTIVITY_CHECK_MS = 15 * 1000;

function normalizeHash(raw: string): string {
  const h = (raw || "").trim();
  const noHash = h.startsWith("#") ? h.slice(1) : h;
  const pathOnly = noHash.split("?")[0];
  const noLeading = pathOnly.replace(/^\/+/, "");
  return noLeading.toLowerCase();
}

function hashToScreen(rawHash: string): Screen {
  const key = normalizeHash(rawHash);

  if (key === "home") return { name: "home" };
  if (
    key === "magazinciuc" ||
    key === "allinmagazinciuc" ||
    key === "allin-magazin-ciuc" ||
    key === "shop-ciuc" ||
    key === "csikszereda"
  ) return { name: "magazinciuc" };
  if (
    key === "magazintargu" ||
    key === "allinmagazintargu" ||
    key === "allin-magazin-targu" ||
    key === "shop-targu" ||
    key === "kezdivasarhely"
  ) return { name: "magazintargu" };
  if (
    key === "magazinciucsale" ||
    key === "allinmagazinciucsale" ||
    key === "allin-magazin-ciuc-sale" ||
    key === "shop-ciuc-sale"
  ) return { name: "magazinciucsale" };
  if (
    key === "magazintargusale" ||
    key === "allinmagazintargusale" ||
    key === "allin-magazin-targu-sale" ||
    key === "shop-targu-sale"
  ) return { name: "magazintargusale" };
  if (
    key === "adminmagazinciuc" ||
    key === "allinadminmagazinciuc" ||
    key === "allin-admin-magazin-ciuc" ||
    key === "admin-shop-ciuc"
  ) return { name: "adminmagazinciuc" };
  if (
    key === "adminmagazintargu" ||
    key === "allinadminmagazintargu" ||
    key === "allin-admin-magazin-targu" ||
    key === "admin-shop-targu"
  ) return { name: "adminmagazintargu" };
  if (
    key === "adminclients" ||
    key === "allinadminclients" ||
    key === "allin-admin-clients" ||
    key === "allinclients" ||
    key === "kliensek"
  ) return { name: "adminclients" };
  if (key === "incoming") return { name: "incoming" };
  if (key === "orders") return { name: "orders" };
  if (key === "shopifyorders" || key === "shopify-orders" || key === "webshoporders" || key === "webshop-orders") return { name: "shopifyorders" };
  if (key === "warehouse") return { name: "warehouse" };
  if (key === "reserved") return { name: "reserved" };
  if (key === "stockmoves") return { name: "stockmoves" };
  if (key === "inventory") return { name: "inventory" };
  if (key === "suppliers") return { name: "suppliers" };
  if (key === "receptions") return { name: "receptions" };
  if (key === "barcodes") return { name: "barcodes" };
  if (key === "admin") return { name: "home" };
  if (key === "productmoves" || key === "stockdocuments" || key === "stock-documents") return { name: "productmoves" };
  if (key === "vacations") return { name: "vacations" };
  if (key === "users") return { name: "users" };
  if (key === "cars") return { name: "cars" };
  if (key === "carexpenses" || key === "car-expenses") return { name: "carexpenses" };

  if (key === "allin" || key === "allin-home") return { name: "home" };
  if (key === "allinincoming" || key === "allin-incoming") return { name: "incoming" };
  if (key === "allinorderhistory" || key === "allin-orderhistory") return { name: "orders" };
  if (key === "allinshopifyorders" || key === "allin-shopifyorders" || key === "allin-shopify-orders" || key === "aif-shopify-orders") return { name: "shopifyorders" };
  if (key === "allinwarehouse" || key === "allin-warehouse") return { name: "warehouse" };

  if (key === "allinreserved") return { name: "reserved" };
  if (key === "allinstockmoves" || key === "allin-stockmoves" || key === "allin-stock-moves") return { name: "stockmoves" };
  if (key === "allininventory") return { name: "inventory" };
  if (key === "allinsuppliers" || key === "allin-suppliers" || key === "aif-suppliers") return { name: "suppliers" };
  if (key === "allinreceptions" || key === "allin-receptions" || key === "aif-receptions") return { name: "receptions" };
  if (key === "allinbarcodes" || key === "allin-barcodes" || key === "aif-barcodes" || key === "barcode" || key === "labels") return { name: "barcodes" };

  if (key === "allinadmin") return { name: "home" };
  if (key === "allinproductmoves" || key === "allinstockdocuments" || key === "allin-stock-documents") return { name: "productmoves" };
  if (key === "allinvacations") return { name: "vacations" };
  if (key === "allinusers") return { name: "users" };
  if (key === "allincars") return { name: "cars" };
  if (key === "allincarexpenses" || key === "allin-carexpenses" || key === "allin-car-expenses") return { name: "carexpenses" };
  if (key === "admincars") return { name: "cars" };
  if (key === "admincarexpenses") return { name: "carexpenses" };
  if (key === "adminextras") return { name: "home" };

  return { name: "login" };
}

function shopHomeScreen(shopId: ShopId): ScreenName {
  return shopId === "csikszereda" ? "magazinciucsale" : "magazintargusale";
}

function isShopScreenAllowed(shopId: ShopId, screenName: ScreenName) {
  if (shopId === "csikszereda") {
    return screenName === "magazinciuc" || screenName === "magazinciucsale";
  }
  return screenName === "magazintargu" || screenName === "magazintargusale";
}

function isShopFacingScreen(screenName: ScreenName) {
  return (
    screenName === "magazinciuc" ||
    screenName === "magazintargu" ||
    screenName === "magazinciucsale" ||
    screenName === "magazintargusale"
  );
}

function go(name: ScreenName) {
  if (name === "login") window.location.hash = "";
  else window.location.hash = name;
}

function clearShopBrowserState() {
  const keys: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (
      key && (
        key.startsWith("allin:shop-sale-cart:") ||
        key.startsWith("allin:shop-administration-unlock:") ||
        key === "allin:last_hash"
      )
    ) {
      keys.push(key);
    }
  }
  keys.forEach((key) => sessionStorage.removeItem(key));
}

function useIsWarehouseMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 820px), (pointer: coarse) and (max-width: 920px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 820px), (pointer: coarse) and (max-width: 920px)");
    const update = () => setIsMobile(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  return isMobile;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => hashToScreen(window.location.hash));
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const api = useMemo(() => "/api", []);
  const warehouseMobile = useIsWarehouseMobile();
  const inventoryMobile = warehouseMobile;
  const adminShopMobile = warehouseMobile;
  const adminClientsMobile = warehouseMobile;

  useEffect(() => {
    const onHash = () => setScreen(hashToScreen(window.location.hash || ""));
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch(`${api}/auth/me`, { credentials: "include", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;

        if (!data?.session) {
          setSession(null);
          return;
        }

        const nextSession = data.session as Session;
        setLogoutOpen(false);
        setLogoutBusy(false);
        setLogoutError("");
        setSession(nextSession);
        const current = hashToScreen(window.location.hash);

        if (nextSession.role === "shop") {
          const target = shopHomeScreen(nextSession.shopId);
          if (!isShopScreenAllowed(nextSession.shopId, current.name)) go(target);
          return;
        }

        if (current.name === "login" || isShopFacingScreen(current.name)) {
          go("home");
        }
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!session || session.role !== "shop") return;
    const target = shopHomeScreen(session.shopId);
    if (!isShopScreenAllowed(session.shopId, screen.name)) go(target);
  }, [session, screen.name]);

  useEffect(() => {
    if (session) return;
    setLogoutOpen(false);
    setLogoutBusy(false);
    setLogoutError("");
  }, [session]);

  const requestLogout = () => {
    if (!session) return;
    setLogoutError("");
    setLogoutOpen(true);
  };

  const performLogout = useCallback(async (automatic = false) => {
    setLogoutBusy(true);
    setLogoutError("");

    try {
      const response = await fetch(`${api}/auth/logout`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        keepalive: automatic,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(body?.error || body?.message || `HTTP ${response.status}`));
      }

      clearShopBrowserState();
      setSession(null);
      setScreen({ name: "login" });
      setLogoutOpen(false);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    } catch (error: any) {
      if (automatic) {
        // Inaktivitási kijelentkezésnél a felület akkor is lezár, ha a hálózat épp hibázik.
        clearShopBrowserState();
        setSession(null);
        setScreen({ name: "login" });
        setLogoutOpen(false);
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      } else {
        setLogoutError(String(error?.message || error || "A kijelentkezés nem sikerült."));
      }
    } finally {
      setLogoutBusy(false);
    }
  }, [api]);

  useEffect(() => {
    if (!session) return;

    let lastActivityAt = Date.now();
    let logoutStarted = false;

    const markActivity = () => {
      lastActivityAt = Date.now();
    };

    const checkInactivity = () => {
      if (logoutStarted) return;
      if (Date.now() - lastActivityAt < INACTIVITY_LOGOUT_MS) return;
      logoutStarted = true;
      void performLogout(true);
    };

    const activityEvents = [
      "pointerdown",
      "pointermove",
      "keydown",
      "scroll",
      "wheel",
      "touchstart",
    ] as const;

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    const interval = window.setInterval(checkInactivity, INACTIVITY_CHECK_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkInactivity();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [performLogout, session]);

  if (!authReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#4b5362] px-4 text-white">
        <div className="rounded-2xl border border-white/14 bg-[#303a4c] px-5 py-4 text-sm text-white/70 shadow-2xl">
          Munkamenet ellenőrzése…
        </div>
      </div>
    );
  }

  if (!session || screen.name === "login") {
    return (
      <Login
        api={api}
        onLoggedIn={(nextSession) => {
          clearShopBrowserState();
          setLogoutOpen(false);
          setLogoutBusy(false);
          setLogoutError("");
          setSession(nextSession);

          if (nextSession.role === "shop") {
            go(shopHomeScreen(nextSession.shopId));
            return;
          }

          const current = hashToScreen(window.location.hash);
          if (current.name === "login" || isShopFacingScreen(current.name)) {
            go("home");
          }
        }}
      />
    );
  }

  const commonProps = {
    apiBase: api,
    actor: session.actor,
    role: session.role,
    shopId: session.role === "shop" ? session.shopId : undefined,
    onLogout: requestLogout,
  };

  return (
    <>
      {screen.name === "home" && <AllInHome {...(commonProps as any)} />}
      {screen.name === "magazinciuc" && <AllInMagazinCiuc {...(commonProps as any)} />}
      {screen.name === "magazintargu" && <AllInMagazinTargu {...(commonProps as any)} />}
      {screen.name === "magazinciucsale" && <AllInMagazinCiucSale {...(commonProps as any)} />}
      {screen.name === "magazintargusale" && <AllInMagazinTarguSale {...(commonProps as any)} />}
      {screen.name === "adminmagazinciuc" && (adminShopMobile ? (
        <AllInAdminMagazinDashboardMobile
          actor={session.actor}
          role={session.role}
          locationCode="main_warehouse"
          locationName="Magazin - Miercurea Ciuc"
          cityName="Csíkszereda"
          otherLocationCode="magazin_targu_secuiesc"
          otherLocationName="Magazin - Târgu Secuiesc"
          otherCityName="Kézdivásárhely"
        />
      ) : <AllInAdminMagazinCiuc {...(commonProps as any)} />)}
      {screen.name === "adminmagazintargu" && (adminShopMobile ? (
        <AllInAdminMagazinDashboardMobile
          actor={session.actor}
          role={session.role}
          locationCode="magazin_targu_secuiesc"
          locationName="Magazin - Târgu Secuiesc"
          cityName="Kézdivásárhely"
          otherLocationCode="main_warehouse"
          otherLocationName="Magazin - Miercurea Ciuc"
          otherCityName="Csíkszereda"
        />
      ) : <AllInAdminMagazinTargu {...(commonProps as any)} />)}
      {screen.name === "adminclients" && (adminClientsMobile ? (
        <AllInAdminClientsMobile actor={session.actor} role={session.role} />
      ) : (
        <AllInAdminClients actor={session.actor} role={session.role} />
      ))}
      {screen.name === "incoming" && <AllInIncoming {...(commonProps as any)} />}
      {screen.name === "orders" && <AllInOrderHistory {...(commonProps as any)} />}
      {screen.name === "shopifyorders" && <AllInShopifyOrders {...(commonProps as any)} />}
      {screen.name === "warehouse" && (warehouseMobile ? <AllInWarehouseMobile {...(commonProps as any)} /> : <AllInWarehouse {...(commonProps as any)} />)}

      {screen.name === "reserved" && <AllInReserved {...(commonProps as any)} />}
      {screen.name === "stockmoves" && <AllInStockMoves {...(commonProps as any)} />}
      {screen.name === "inventory" && (inventoryMobile ? <AllInInventoryMobile {...(commonProps as any)} /> : <AllInInventory {...(commonProps as any)} />)}
      {screen.name === "suppliers" && <AllInSuppliers {...(commonProps as any)} />}
      {screen.name === "receptions" && <AllInReceptions {...(commonProps as any)} />}
      {screen.name === "barcodes" && <AllInBarcodes {...(commonProps as any)} />}

      {screen.name === "productmoves" && <AllInProductMoves {...(commonProps as any)} />}
      {screen.name === "vacations" && <AllInVacations {...(commonProps as any)} />}
      {screen.name === "users" && <AllInUsers {...(commonProps as any)} />}
      {screen.name === "carexpenses" && <AllInCarExpenses {...(commonProps as any)} />}
      {screen.name === "cars" && <AllInCars {...(commonProps as any)} />}

      {logoutOpen ? (
        <div
          className="fixed inset-0 z-[600] grid place-items-center bg-slate-950/78 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !logoutBusy) setLogoutOpen(false);
          }}
        >
          <section className="w-full max-w-[470px] overflow-hidden rounded-[26px] border border-[#9be9e5]/36 bg-[#303a4c] text-white shadow-[0_32px_100px_rgba(0,0,0,0.52)]">
            <header className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#25354a] to-[#28565c] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#9be9e5]/32 bg-[#2a8d8b]/22 text-[#d7fffd]">
                  <UserRound size={21} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Kijelentkezés</p>
                  <h2 className="mt-1 truncate text-xl font-normal text-white">{session.actor}</h2>
                </div>
              </div>
              <button
                type="button"
                disabled={logoutBusy}
                onClick={() => setLogoutOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] text-white transition hover:bg-white/[0.1] disabled:opacity-50"
                aria-label="Bezárás"
              >
                <X size={18} />
              </button>
            </header>

            <div className="px-5 py-4">
              <p className="text-lg font-normal text-white">Biztosan kijelentkezel?</p>

              {logoutError ? (
                <div className="mt-4 rounded-xl border border-rose-300/28 bg-rose-500/14 px-3 py-2.5 text-sm text-rose-50">
                  {logoutError}
                </div>
              ) : null}
            </div>

            <footer className="flex justify-end gap-2 border-t border-white/12 bg-[#293548] px-5 py-4">
              <button
                type="button"
                disabled={logoutBusy}
                onClick={() => setLogoutOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/16 bg-white/[0.05] px-4 text-sm font-normal text-white transition hover:bg-white/[0.1] disabled:opacity-50"
              >
                Mégse
              </button>
              <button
                type="button"
                disabled={logoutBusy}
                onClick={() => void performLogout()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#9be9e5]/48 bg-[#2a8d8b] px-5 text-sm font-normal text-white shadow-[0_10px_22px_rgba(42,141,139,0.22)] transition hover:bg-[#319c99] disabled:opacity-55"
              >
                <LogOut size={17} />
                {logoutBusy ? "Kijelentkezés…" : "Kijelentkezés"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
