import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Package,
  Truck,
  History,
  Bookmark,
  Repeat,
  ClipboardList,
  Settings,
  LogOut,
} from "lucide-react";

const API = (import.meta as any).env?.VITE_API_BASE || "/api";

const LOGO_URL =
  "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/allin-logo-w.png";

function justDate(s?: string | null): string | undefined {
  if (!s) return undefined;
  return String(s).slice(0, 10);
}

function daysLeft(fromISO: string | undefined, years = 0, months = 0): number | null {
  if (!fromISO) return null;
  const start = new Date(fromISO + "T00:00:00");
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
  if (Number.isFinite(m) && m > 0)
    return Math.max(1, Math.min(2, Math.round(m / 12)));
  return 1;
}

async function fetchJSON(url: string) {
  const r = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

export default function AllInHome(props: { onLogout?: () => void }) {
  const [adminLevel, setAdminLevel] = useState<"ok" | "soon" | "expired">("ok");

  const mainBtn =
    "w-full h-12 rounded-xl px-4 bg-[#354153] text-white hover:bg-[#3c5069] flex items-center justify-between border border-white/40";

  const adminBtn = useMemo(() => {
    if (adminLevel === "expired") {
      return "w-full h-12 rounded-xl px-4 bg-[#b90f1e] text-white hover:bg-[#a10d19] flex items-center justify-between border border-white/40";
    }
    if (adminLevel === "soon") {
      return "w-full h-12 rounded-xl px-4 bg-amber-400 text-black hover:bg-amber-300 flex items-center justify-between border border-white/40";
    }
    return mainBtn;
  }, [adminLevel, mainBtn]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchJSON(`${API}/cars`);
        const rows = (Array.isArray(data) ? data : data?.rows || []) as any[];
        let hasExpired = false;
        let hasSoon = false;

        for (const c of rows) {
          const itpYears = normalizeItpYearsLike(c);
          const itp = daysLeft(justDate(c.itp_date), itpYears || 1, 0);
          const rca = daysLeft(justDate(c.rca_date), 1, 0);
          const casco = daysLeft(justDate(c.casco_start), 0, c.casco_months || 0);
          const rovi = daysLeft(
            justDate(c.rovinieta_start),
            0,
            c.rovinieta_months || 0
          );
          const all = [itp, rca, casco, rovi];

          if (all.some((d) => d != null && d < 0)) hasExpired = true;
          if (all.some((d) => d != null && d >= 0 && d <= 5)) hasSoon = true;
          if (hasExpired) break;
        }

        if (!alive) return;
        setAdminLevel(hasExpired ? "expired" : hasSoon ? "soon" : "ok");
      } catch {
        if (!alive) return;
        setAdminLevel("ok");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const logout = async () => {
    try {
      await props.onLogout?.();
    } finally {
      window.location.hash = "";
    }
  };

  return (
    <div
      className="min-h-screen w-screen grid place-items-center"
      style={{ backgroundColor: "#474c59" }}
    >
      <div className="w-full max-w-lg px-4">
        <div className="rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8">
          <div className="grid place-items-center mb-5">
            <img
              src={LOGO_URL}
              alt="ALL IN"
              className="h-10 sm:h-12 w-auto object-contain"
              loading="eager"
            />
          </div>

          <div className="space-y-3">
            <Button
              className={mainBtn}
              onClick={() => (window.location.hash = "#allinwarehouse")}
            >
              <span>RAKTÁR</span>
              <Package className="h-4 w-4" />
            </Button>

            <Button
              className={mainBtn}
              onClick={() => (window.location.hash = "#allinincoming")}
            >
              <span>ÁRU BEVÉTELEZÉS</span>
              <Truck className="h-4 w-4" />
            </Button>

            <div className="pt-4 mt-2 border-t border-white/15 space-y-3">
              <Button
                className={mainBtn}
                onClick={() => (window.location.hash = "#allinorderhistory")}
              >
                <span>RENDELÉS – HISTORY</span>
                <History className="h-4 w-4" />
              </Button>

              <Button
                className={mainBtn}
                onClick={() => (window.location.hash = "#allinreserved")}
              >
                <span>LEFOGLALT TERMÉKEK</span>
                <Bookmark className="h-4 w-4" />
              </Button>

              <Button
                className={mainBtn}
                onClick={() => (window.location.hash = "#allinstockmoves")}
              >
                <span>RAKTÁRMOZGÁS</span>
                <Repeat className="h-4 w-4" />
              </Button>

              <Button
                className={mainBtn}
                onClick={() => (window.location.hash = "#allininventory")}
              >
                <span>LELTÁR</span>
                <ClipboardList className="h-4 w-4" />
              </Button>

              <Button
                className={adminBtn}
                onClick={() => (window.location.hash = "#allinadmin")}
              >
                <span>ADMINISZTRÁCIÓ</span>
                <Settings className="h-4 w-4" />
              </Button>
            </div>

            <div className="pt-6 mt-4 border-t border-white/10 flex justify-center">
              <button
                onClick={logout}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-md border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition"
                type="button"
              >
                <LogOut className="h-4 w-4" />
                Kilépés
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
