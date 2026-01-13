import { useEffect, useMemo, useState } from "react";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import Shop from "./pages/Shop";

type ShopId = "csikszereda" | "kezdivasarhely";
type Screen =
  | { name: "login" }
  | { name: "admin" }
  | { name: "shop"; shopId: ShopId };

type Session =
  | { role: "admin"; actor: string }
  | { role: "shop"; shopId: ShopId; actor: string };

function parseHash(): Screen {
  const h = (window.location.hash || "").replace("#", "");
  if (h === "admin") return { name: "admin" };
  if (h === "shop-csikszereda") return { name: "shop", shopId: "csikszereda" };
  if (h === "shop-kezdivasarhely") return { name: "shop", shopId: "kezdivasarhely" };
  return { name: "login" };
}

function go(screen: Screen) {
  if (screen.name === "login") window.location.hash = "";
  if (screen.name === "admin") window.location.hash = "admin";
  if (screen.name === "shop" && screen.shopId === "csikszereda") window.location.hash = "shop-csikszereda";
  if (screen.name === "shop" && screen.shopId === "kezdivasarhely") window.location.hash = "shop-kezdivasarhely";
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
          if (data.session.role === "admin") go({ name: "admin" });
          if (data.session.role === "shop") go({ name: "shop", shopId: data.session.shopId });
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
          if (s.role === "admin") go({ name: "admin" });
          else go({ name: "shop", shopId: s.shopId });
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

      {session.role === "admin" && <Admin api={api} actor={session.actor} />}
      {session.role === "shop" && <Shop api={api} shopId={session.shopId} actor={session.actor} />}
    </div>
  );
}
