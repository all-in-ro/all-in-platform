import { useEffect, useMemo, useState } from "react";
import Login from "./pages/Login";

import AllInHome from "./pages/AllInHome";
import AllInIncoming from "./pages/AllInIncoming";
import AllInOrderHistory from "./pages/AllInOrderHistory";
import AllInWarehouse from "./pages/AllInWarehouse";

type ShopId = "csikszereda" | "kezdivasarhely";
type ScreenName = "login" | "home" | "incoming" | "orders" | "warehouse";
type Screen = { name: ScreenName };

type Session =
  | { role: "admin"; actor: string }
  | { role: "shop"; shopId: ShopId; actor: string };

function normalizeHash(raw: string): string {
  const h = (raw || "").trim();
  const noHash = h.startsWith("#") ? h.slice(1) : h;
  const pathOnly = noHash.split("?")[0];
  const noLeading = pathOnly.replace(/^\/+/, "");
  return noLeading.toLowerCase();
}

function hashToScreen(rawHash: string): Screen {
  const key = normalizeHash(rawHash);

  // canonical
  if (key === "home") return { name: "home" };
  if (key === "incoming") return { name: "incoming" };
  if (key === "orders") return { name: "orders" };
  if (key === "warehouse") return { name: "warehouse" };

  // aliases (CUPE-style)
  if (key === "allin" || key === "allin-home") return { name: "home" };
  if (key === "allinincoming" || key === "allin-incoming") return { name: "incoming" };
  if (key === "allinorderhistory" || key === "allin-orderhistory") return { name: "orders" };
  if (key === "allinwarehouse" || key === "allin-warehouse") return { name: "warehouse" };

  return { name: "login" };
}

function go(name: ScreenName) {
  if (name === "login") window.location.hash = "";
  else window.location.hash = name;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => hashToScreen(window.location.hash));
  const [session, setSession] = useState<Session | null>(null);
  const api = useMemo(() => "/api", []);

  useEffect(() => {
    const onHash = () => setScreen(hashToScreen(window.location.hash));
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    fetch(`${api}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.session) {
          setSession(data.session);
          const current = hashToScreen(window.location.hash);
          if (current.name === "login") go("home");
        }
      })
      .catch(() => {});
  }, [api]);

  const logout = async () => {
    await fetch(`${api}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setSession(null);
    go("login");
  };

  if (!session || screen.name === "login") {
    return (
      <Login
        api={api}
        onLoggedIn={(s) => {
          setSession(s);
          go("home");
        }}
      />
    );
  }

  // IMPORTANT: No top header here.
  // The ALL IN pages (copied from CUPE) already render their own header/topbar.
  // This avoids the "double header" problem.
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
    </>
  );
} 
