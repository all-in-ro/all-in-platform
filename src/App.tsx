import { useEffect, useMemo, useRef, useState } from "react";
import Login from "./pages/Login";

import AllInHome from "./pages/AllInHome";
import AllInIncoming from "./pages/AllInIncoming";
import AllInOrderHistory from "./pages/AllInOrderHistory";
import AllInShopifyOrders from "./pages/AllInShopifyOrders";
import AllInWarehouse from "./pages/AllInWarehouse";
import AllInWarehouseMobile from "./pages/AllInWarehouseMobile";

import AllInMagazinCiuc from "./pages/AllInMagazinCiuc";
import AllInMagazinTargu from "./pages/AllInMagazinTargu";
import AllInAdminMagazinCiuc from "./pages/AllInAdminMagazinCiuc";
import AllInAdminMagazinTargu from "./pages/AllInAdminMagazinTargu";

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
  | "adminmagazinciuc"
  | "adminmagazintargu"
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
  return key.length > 0;
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
  return shopId === "csikszereda" ? "magazinciuc" : "magazintargu";
}

function go(name: ScreenName) {
  if (name === "login") window.location.hash = "";
  else window.location.hash = name;
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
  const api = useMemo(() => "/api", []);
  const warehouseMobile = useIsWarehouseMobile();
  const inventoryMobile = warehouseMobile;
  const restoredRef = useRef(false);

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

  useEffect(() => {
    fetch(`${api}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.session) {
          setSession(data.session);

          const current = hashToScreen(window.location.hash);
          if (data.session.role === "shop") {
            const target = shopHomeScreen(data.session.shopId);
            if (current.name !== target) go(target);
          } else if (current.name === "login") {
            const last = sessionStorage.getItem(LAST_HASH_KEY) || "";
            if (last && isNonLoginHash(last)) window.location.hash = last;
            else go("home");
          }
        }
      })
      .catch(() => {});
  }, [api]);

  useEffect(() => {
    if (!session || session.role !== "shop") return;
    const target = shopHomeScreen(session.shopId);
    if (screen.name !== target) go(target);
  }, [session, screen.name]);

  const logout = async () => {
    await fetch(`${api}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setSession(null);
    sessionStorage.removeItem(LAST_HASH_KEY);
    go("login");
  };

  if (!session || screen.name === "login") {
    return (
      <Login
        api={api}
        onLoggedIn={(s) => {
          setSession(s);
          if (s.role === "shop") {
            sessionStorage.removeItem(LAST_HASH_KEY);
            go(shopHomeScreen(s.shopId));
            return;
          }
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
    onLogout: logout,
  };

  return (
    <>
      {screen.name === "home" && <AllInHome {...(commonProps as any)} />}
      {screen.name === "magazinciuc" && <AllInMagazinCiuc {...(commonProps as any)} />}
      {screen.name === "magazintargu" && <AllInMagazinTargu {...(commonProps as any)} />}
      {screen.name === "adminmagazinciuc" && <AllInAdminMagazinCiuc {...(commonProps as any)} />}
      {screen.name === "adminmagazintargu" && <AllInAdminMagazinTargu {...(commonProps as any)} />}
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
    </>
  );
}
