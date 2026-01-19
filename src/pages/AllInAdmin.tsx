import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Repeat, Calendar, Users, Car } from "lucide-react";

type CarRow = {
  itp_date?: string;
  itp_years?: number;
  itp_months?: number;
  rca_date?: string;
  casco_start?: string;
  casco_months?: number;
  rovinieta_start?: string;
  rovinieta_months?: number;
};

const API = (import.meta as any).env?.VITE_API_BASE || "/api";

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
  if (Number.isFinite(m) && m > 0) return Math.max(1, Math.min(2, Math.round(m / 12)));
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

export default function AllInAdmin() {
  const [carsLevel, setCarsLevel] = useState<"ok" | "soon" | "expired">("ok");

  const mainBtn =
    "w-full h-12 rounded-xl px-4 bg-[#354153] text-white hover:bg-[#3c5069] flex items-center justify-between border border-white/40";

  const carsBtn = useMemo(() => {
    if (carsLevel === "expired") {
      return "w-full h-12 rounded-xl px-4 bg-[#b90f1e] text-white hover:bg-[#a10d19] flex items-center justify-between border border-white/40";
    }
    if (carsLevel === "soon") {
      return "w-full h-12 rounded-xl px-4 bg-amber-400 text-black hover:bg-amber-300 flex items-center justify-between border border-white/40";
    }
    return mainBtn;
  }, [carsLevel, mainBtn]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchJSON(`${API}/cars`);
        const rows = (Array.isArray(data) ? data : data?.rows || []) as CarRow[];
        let hasExpired = false;
        let hasSoon = false;

        for (const c of rows) {
          const itpYears = normalizeItpYearsLike(c);
          const itp = daysLeft(justDate(c.itp_date), itpYears || 1, 0);
          const rca = daysLeft(justDate(c.rca_date), 1, 0);
          const casco = daysLeft(justDate(c.casco_start), 0, c.casco_months || 0);
          const rovi = daysLeft(justDate(c.rovinieta_start), 0, c.rovinieta_months || 0);
          const all = [itp, rca, casco, rovi];

          if (all.some((d) => d != null && d < 0)) hasExpired = true;
          if (all.some((d) => d != null && d >= 0 && d <= 5)) hasSoon = true;
          if (hasExpired) break;
        }

        if (!alive) return;
        setCarsLevel(hasExpired ? "expired" : hasSoon ? "soon" : "ok");
      } catch {
        // ha nem érhető el a cars endpoint, ne borítsuk fel az admin menüt
        if (!alive) return;
        setCarsLevel("ok");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen w-screen grid place-items-center" style={{ backgroundColor: "#474c59" }}>
      <div className="w-full max-w-lg px-4">
        <div className="rounded-lg border border-white/20 bg-white/5 shadow-sm px-6 py-8">
          <div className="flex items-center justify-between">
            <h1 className="text-white text-xl font-semibold">ADMINISZTRÁCIÓ</h1>
            <Button
              className="h-10 px-4 rounded-xl text-white bg-[#354153] hover:bg-[#3c5069] border border-white/40"
              onClick={() => (window.location.hash = "#allin")}
              type="button"
            >
              <span className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                Vissza
              </span>
            </Button>
          </div>

          <div className="mt-6 space-y-3">
            <Button className={mainBtn} onClick={() => (window.location.hash = "#allinproductmoves")}>
              <span>TERMÉKMOZGÁS</span>
              <Repeat className="h-4 w-4" />
            </Button>

            <Button className={mainBtn} onClick={() => (window.location.hash = "#allinvacations")}>
              <span>SZABADSÁGOK</span>
              <Calendar className="h-4 w-4" />
            </Button>

            <Button className={mainBtn} onClick={() => (window.location.hash = "#allinusers")}>
              <span>FELHASZNÁLÓK</span>
              <Users className="h-4 w-4" />
            </Button>

            <div className="pt-4 mt-2 border-t border-white/15">
              <Button className={carsBtn} onClick={() => (window.location.hash = "#allincars")}>
                <span>AUTÓK</span>
                <Car className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
