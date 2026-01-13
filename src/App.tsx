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

function parseHash(): Screen {
  const h = (window.location.hash || "").replace("#", "");
  // Accept both styles: "#incoming" and "#/incoming"
  const key = h.startsWith("/") ? h.slice(1) : h;

  if (key === "incoming") return { name: "incoming" };
  if (key === "orders") return { name: "orders" };
  if (key === "warehouse") return { name: "warehouse" };
  if (key === "home") return { name: "home" };

  // default (empty or unknown) -> login screen (will be redirected to home if already logged in)
  return { name: "login" };
}

function go(name: ScreenName) {
  if (name === "login") window.location.hash = "";
  else window.location.hash = name;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => parseHash());
  const [session, setSession] = useState<Session | null>(null);
  const api = useMemo(() => "/api", []);

  // hash router
  useEffect(() => {
    const onHash = () => setScreen(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // session check: DO NOT force home if user already navigated to a deep link
  useEffect(() => {
    fetch(`${api}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.session) {
          setSession(data.session);

          // Only redirect to home if there is no valid screen in hash (login/empty/unknown)
          const current = parseHash();
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

  // If not logged in OR hash still on login: show login
  if (!session || screen.name === "login") {
    return (
      <Login
        api={api}
        onLoggedIn={(s) => {
          setSession(s);
          // After login, go home (user can navigate further from home)
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
