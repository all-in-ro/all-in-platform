import { useEffect, useMemo, useRef, useState } from "react";
import Login from "./pages/Login";

import AllInHome from "./pages/AllInHome";
import AllInIncoming from "./pages/AllInIncoming";
import AllInOrderHistory from "./pages/AllInOrderHistory";
import AllInWarehouse from "./pages/AllInWarehouse";

import AllInReserved from "./pages/AllInReserved";
import AllInStockMoves from "./pages/AllInStockMoves";
import AllInInventory from "./pages/AllInInventory";

import AllInAdmin from "./pages/AllInAdmin";
import AllInProductMoves from "./pages/AllInProductMoves";
import AllInVacations from "./pages/AllInVacations";
import AllInUsers from "./pages/AllInUsers";
import AllInCars from "./pages/AllInCars";
import AllInCarExpenses from "./pages/AllInCarExpenses";

type ShopId = "csikszereda" | "kezdivasarhely";
type ScreenName =
  | "login"
  | "home"
  | "incoming"
  | "orders"
  | "warehouse"
  | "reserved"
  | "stockmoves"
  | "inventory"
  | "admin"
  | "productmoves"
  | "vacations"
  | "users"
  | "cars"
  | "carexpenses";

type Screen = { name: ScreenName };

type Session =
  | { role: "admin"; actor: string }
  | { role: "shop"; shopId: ShopId; actor: string };

const LAST_HASH_KEY = "allin:last_hash";

function normalizeHash(raw: string): string {
  const h = (raw || "").trim();
  const noHash = h.startsWith("#") ? h.slice(1) : h;
  const pathOnly = noHash.split("?")[0];
  const noLeading = pathOnly.replace(/^\/+/, "");
  return noLeading.toLowerCase();
}

function isNonLoginHash(hash: string) {
  const key = normalizeHash(hash);
  return key.length > 0; // anything non-empty is a "real" screen in our app
}

function hashToScreen(rawHash: string): Screen {
  const key = normalizeHash(rawHash);

  // canonical
  if (key === "home") return { name: "home" };
  if (key === "incoming") return { name: "incoming" };
  if (key === "orders") return { name: "orders" };
  if (key === "warehouse") return { name: "warehouse" };
  if (key === "reserved") return { name: "reserved" };
  if (key === "stockmoves") return { name: "stockmoves" };
  if (key === "inventory") return { name: "inventory" };
  if (key === "admin") return { name: "admin" };
  if (key === "productmoves") return { name: "productmoves" };
  if (key === "vacations") return { name: "vacations" };
  if (key === "users") return { name: "users" };
  if (key === "cars") return { name: "cars" };
  if (key === "carexpenses" || key === "car-expenses") return { name: "carexpenses" };

  // ALL IN aliases used by buttons/pages
  if (key === "allin" || key === "allin-home") return { name: "home" };
  if (key === "allinincoming" || key === "allin-incoming") return { name: "incoming" };
  if (key === "allinorderhistory" || key === "allin-orderhistory") return { name: "orders" };
  if (key === "allinwarehouse" || key === "allin-warehouse") return { name: "warehouse" };

  if (key === "allinreserved") return { name: "reserved" };
  if (key === "allinstockmoves" || key === "allin-stockmoves" || key === "allin-stock-moves") return { name: "stockmoves" };
  if (key === "allininventory") return { name: "inventory" };

  if (key === "allinadmin") return { name: "admin" };
  if (key === "allinproductmoves") return { name: "productmoves" };
  if (key === "allinvacations") return { name: "vacations" };
  if (key === "allinusers") return { name: "users" };
  if (key === "allincars") return { name: "cars" };
  if (key === "allincarexpenses" || key === "allin-carexpenses" || key === "allin-car-expenses") return { name: "carexpenses" };
  if (key === "admincarexpenses") return { name: "carexpenses" };
  if (key === "adminextras") return { name: "admin" };

  // empty/unknown -> login
  return { name: "login" };
}

function go(name: ScreenName) {
  if (name === "login") window.location.hash = "";
  else window.location.hash = name; // canonical hashes
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => hashToScreen(window.location.hash));
  const [session, setSession] = useState<Session | null>(null);
  const api = useMemo(() => "/api", []);

  const restoredRef = useRef(false);

  // Restore last hash on hard refresh (mobile pull-to-refresh can sometimes reset to base URL)
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const current = window.location.hash || "";
    if (!isNonLoginHash(current)) {
      const last = sessionStorage.getItem(LAST_HASH_KEY) || "";
      if (last && isNonLoginHash(last)) {
        window.location.hash = last;
        setScreen(hashToScreen(last));
      }
    }
  }, []);

  // hash router + remember last visited screen (so refresh does NOT drop to start)
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash || "";
      if (isNonLoginHash(h)) sessionStorage.setItem(LAST_HASH_KEY, h);
      setScreen(hashToScreen(h));
    };
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // session check: NEVER force home if user is on a deeper screen
  useEffect(() => {
    fetch(`${api}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.session) {
          setSession(data.session);

          // If we are on login (empty hash), prefer last saved hash, otherwise go home.
          const current = hashToScreen(window.location.hash);
          if (current.name === "login") {
            const last = sessionStorage.getItem(LAST_HASH_KEY) || "";
            if (last && isNonLoginHash(last)) window.location.hash = last;
            else go("home");
          }
        }
      })
      .catch(() => {});
  }, [api]);

  const logout = async () => {
    await fetch(`${api}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setSession(null);
    // Clear saved hash so we don't "jump back" after logout
    sessionStorage.removeItem(LAST_HASH_KEY);
    go("login");
  };

  if (!session || screen.name === "login") {
    return (
      <Login
        api={api}
        onLoggedIn={(s) => {
          setSession(s);
          // after login: go back to last page if it exists, else home
          const last = sessionStorage.getItem(LAST_HASH_KEY) || "";
          if (last && isNonLoginHash(last)) window.location.hash = last;
          else go("home");
        }}
      />
    );
  }

  const commonProps = {
    apiBase: api,
    actor: session.actor,
    role: session.role,
    shopId: session.role === "shop" ? session.shopId : undefined,
    onLogout: logout
  };

  return (
    <>
      {screen.name === "home" && <AllInHome {...(commonProps as any)} />}
      {screen.name === "incoming" && <AllInIncoming {...(commonProps as any)} />}
      {screen.name === "orders" && <AllInOrderHistory {...(commonProps as any)} />}
      {screen.name === "warehouse" && <AllInWarehouse {...(commonProps as any)} />}

      {screen.name === "reserved" && <AllInReserved {...(commonProps as any)} />}
      {screen.name === "stockmoves" && <AllInStockMoves {...(commonProps as any)} />}
      {screen.name === "inventory" && <AllInInventory {...(commonProps as any)} />}

      {screen.name === "admin" && <AllInAdmin {...(commonProps as any)} />}
      {screen.name === "productmoves" && <AllInProductMoves {...(commonProps as any)} />}
      {screen.name === "vacations" && <AllInVacations {...(commonProps as any)} />}
      {screen.name === "users" && <AllInUsers {...(commonProps as any)} />}
      {screen.name === "carexpenses" && <AllInCarExpenses {...(commonProps as any)} />}
      {screen.name === "cars" && <AllInCars {...(commonProps as any)} />}
    </>
  );
} 
