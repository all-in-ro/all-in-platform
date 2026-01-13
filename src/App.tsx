import { useEffect, useMemo, useState } from "react";
import Login from "./pages/Login";

import AllInHome from "./pages/AllInHome";
import AllInIncoming from "./pages/AllInIncoming";
import AllInOrderHistory from "./pages/AllInOrderHistory";
import AllInWarehouse from "./pages/AllInWarehouse";

type ShopId = "csikszereda" | "kezdivasarhely";
type Screen = { name: "login" } | { name: "home" } | { name: "incoming" } | { name: "orders" } | { name: "warehouse" };

type Session =
  | { role: "admin"; actor: string }
  | { role: "shop"; shopId: ShopId; actor: string };

function parseHash(): Screen {
  const h = (window.location.hash || "").replace("#", "");
  if (h === "incoming") return { name: "incoming" };
  if (h === "orders") return { name: "orders" };
  if (h === "warehouse") return { name: "warehouse" };
  if (h === "home") return { name: "home" };
  return { name: "login" };
}

function go(screen: Screen) {
  if (screen.name === "login") window.location.hash = "";
  else window.location.hash = screen.name;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => parseHash());
  const [session, setSession] = useState<Session | null>(null);
  const api = useMemo(() => "/api", []);

  useEffect(() => {
    const onHash = () => setScreen(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    fetch(`${api}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.session) {
          setSession(data.session);
          go({ name: "home" });
        }
      })
      .catch(() => {});
  }, [api]);

  const logout = async () => {
    await fetch(`${api}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setSession(null);
    go({ name: "login" });
  };

  if (!session || screen.name === "login") {
    return (
      <Login
        api={api}
        onLoggedIn={(s) => {
          setSession(s);
          go({ name: "home" });
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
