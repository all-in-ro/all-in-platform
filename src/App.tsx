import { useEffect, useMemo, useState } from "react";
import Login from "./pages/Login";

import AllInHome from "./pages/AllInHome";
import AllInIncoming from "./pages/AllInIncoming";
import AllInOrderHistory from "./pages/AllInOrderHistory";
import AllInWarehouse from "./pages/AllInWarehouse";

type ShopId = "csikszereda" | "kezdivasarhely";

/**
 * We accept multiple hash spellings, because the buttons/pages may use:
 *  - #home / #incoming / #orders / #warehouse
 *  - #allin / #allinincoming / #allinorderhistory / #allinwarehouse
 *  - legacy aliases like #allin-incoming etc.
 */
type ScreenName =
  | "login"
  | "home"
  | "incoming"
  | "orders"
  | "warehouse";

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

  // direct
  if (key === "home") return { name: "home" };
  if (key === "incoming") return { name: "incoming" };
  if (key === "orders") return { name: "orders" };
  if (key === "warehouse") return { name: "warehouse" };

  // all-in aliases (CUPE style)
  if (key === "allin" || key === "allin-home") return { name: "home" };
  if (key === "allinincoming" || key === "allin-incoming") return { name: "incoming" };
  if (key === "allinorderhistory" || key === "allin-orderhistory") return { name: "orders" };
  if (key === "allinwarehouse" || key === "allin-warehouse") return { name: "warehouse" };

  // empty/unknown -> login
  return { name: "login" };
}

function go(name: ScreenName) {
  if (name === "login") window.location.hash = "";
  else window.location.hash = name; // canonical hashes are: home/incoming/orders/warehouse
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => hashToScreen(window.location.hash));
  const [session, setSession] = useState<Session | null>(null);
  const api = useMemo(() => "/api", []);

  // hash router
  useEffect(() => {
    const onHash = () => setScreen(hashToScreen(window.location.hash));
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // session check: only redirect to home if hash is empty/unknown (login screen)
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

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>
          ALL IN – {session.role === "admin" ? "ADMIN" : `ÜZLET (${session.shopId})`} – {session.actor}
        </div>
        <button onClick={logout} style={{ padding: "8px 12px" }}>
          Kilépés
        </button>
      </div>

      {screen.name === "home" && <AllInHome />}
      {screen.name === "incoming" && <AllInIncoming />}
      {screen.name === "orders" && <AllInOrderHistory />}
      {screen.name === "warehouse" && <AllInWarehouse />}
    </div>
  );
}
