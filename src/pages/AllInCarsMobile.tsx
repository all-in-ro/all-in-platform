"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, LayoutGrid, LayoutList, ChevronLeft, ChevronDown, ChevronUp, Edit } from "lucide-react";

/* ---------- Types ---------- */
type Car = {
  id?: number;
  photo_url?: string;
  plate?: string;
  make_model?: string;
  itp_date?: string;
  rca_date?: string;
  casco_start?: string;
  casco_months?: number;
  rovinieta_start?: string;
  rovinieta_months?: number;
  vin?: string;
  civ?: string;
  color?: string;
  engine_cc?: number;
  power_kw?: number;
  total_mass?: number;
  fuel?: string;
  year?: number;
};

/* ---------- API ---------- */
// IMPORTANT: default to same-origin so session cookies work (Render/Cloudflare).
const API = (import.meta as any).env?.VITE_API_BASE || "/api";

/* ---------- Theme ---------- */
const CUPE = { blue: "#344154", bgBlue: "#2E3A4A", green: "#108D8B" } as const;

/* ---------- Helpers ---------- */
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
const kwToCp = (kw?: number) => (kw ? Math.round(kw * 1.341) : 0);
const justDate = (s?: string | null) => (s ? String(s).slice(0, 10) : undefined);

function toneFor(d: number | null) {
  if (d == null) return "bg-slate-600 text-slate-200 border border-slate-500/50";
  if (d < 0) return "bg-[#b90f1e] text-white border border-[#b90f1e]/50";
  if (d <= 5) return "bg-amber-400 text-black border border-amber-900/20";
  return "bg-[var(--cupe-green)] text-white border border-emerald-900/30";
}

function Chip({ label, days }: { label: string; days: number | null }) {
  return (
    <div className={"px-3 py-1 rounded-lg text-[12px] font-semibold " + toneFor(days)} title={`${label} ${days == null ? "-" : days + " nap"}`}>
      {label}: {days == null ? "-" : `${days} nap`}
    </div>
  );
}

async function fetchJSON(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) }, credentials: init?.credentials ?? "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("json")) return null as any;
  return await r.json();
}
async function listCars(): Promise<Car[]> {
  try {
    const data = await fetchJSON(`${API}/cars`);
    return Array.isArray(data) ? data : data?.rows || [];
  } catch { return []; }
}

/* ---------- Board view (with badges) ---------- */
function BoardView({ rows }:{ rows: any[] }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {rows.map((c:any) => {
        const itp = daysLeft(justDate(c.itp_date), 1, 0);
        const rca = daysLeft(justDate(c.rca_date), 1, 0);
        const cas = daysLeft(justDate(c.casco_start), 0, c.casco_months || 0);
        const rov = daysLeft(justDate(c.rovinieta_start), 0, c.rovinieta_months || 0);
        return (
          <div key={String(c.id ?? c.plate)} className="rounded-lg bg-white border border-slate-300 p-3 text-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[#344154] text-[15px] font-bold leading-tight truncate whitespace-nowrap">{c.plate || "Ismeretlen"}</div>
                <div className="text-slate-700 text-[13px] whitespace-normal break-words">{c.make_model || "—"}</div>
              </div>
              <div className="w-20 h-14 rounded bg-white overflow-hidden shrink-0 border border-slate-300">
                {c.photo_url ? <img src={c.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-slate-600"><PlusCircle className="w-5 h-5" /></div>}
              </div>
            </div>
            <div className="border-t border-slate-300/60 my-2" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip label="ITP" days={itp} />
              <Chip label="RCA" days={rca} />
              <Chip label="Casco" days={cas} />
              <Chip label="Rovigneta" days={rov} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- List view (no badges, centered actions) ---------- */
function ListView({ rows, expandedDefault=false, onEdit }:{ rows:any[]; expandedDefault?:boolean; onEdit?:(car:any)=>void; }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (expandedDefault) {
      const m: Record<string, boolean> = {};
      rows.forEach((r) => { m[String(r.id ?? r.plate)] = true; });
      setExpanded(m);
    }
  }, [expandedDefault, rows]);

  return (
    <div className="rounded-xl border border-slate-300 bg-white text-slate-800 overflow-hidden">
      {/* widen the first column, keep actions auto width so it doesn't squeeze the plate */}
      <div className="[grid-template-columns:minmax(0,1.6fr)_minmax(0,1fr)_auto] grid gap-0 text-[12px] px-3 py-2 bg-white text-slate-800 border-b border-slate-300 shadow-sm">
        <div>Autó</div><div className="text-center">Részletek</div><div className="text-center">Műveletek</div>
      </div>
      <div className="divide-y divide-slate-200">
        {rows.map((c:any) => {
          const key = String(c.id ?? c.plate ?? Math.random());
          const open = !!expanded[key];
          return (
            <div key={key} className="px-3 py-2.5">
              <div className="[grid-template-columns:minmax(0,1.6fr)_minmax(0,1fr)_auto] grid items-center gap-2">
                <div className="flex items-center gap-3 min-w-0 w-full">
                  <div className="w-14 h-11 rounded bg-white overflow-hidden shrink-0 border border-slate-300">
                    {c.photo_url ? <img src={c.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-slate-600"><PlusCircle className="w-5 h-5" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* plate stays on one line */}
                    <div className="text-[#344154] text-[15px] font-bold leading-tight truncate whitespace-nowrap">{c.plate || "Ismeretlen"}</div>
                    {/* type can wrap fully */}
                    <div className="text-slate-700 text-[13px] whitespace-normal break-words">{c.make_model || "—"}</div>
                  </div>
                </div>
                <div className="text-center"></div>
                <div className="text-right flex items-center justify-end gap-3 whitespace-nowrap shrink-0">
                  {onEdit && (
                    <button className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900" onClick={() => onEdit(c)} type="button">
                      <Edit className="w-4 h-4" /> Szerkesztés
                    </button>
                  )}
                  <button className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900" onClick={() => setExpanded((m)=>({ ...m, [key]: !open }))} type="button">
                    {open ? <>Bezár <ChevronUp className="w-4 h-4" /></> : <>Részletek <ChevronDown className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>

              {open ? (
                <>
                  <div className="border-t border-slate-300/60 my-2" />
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] text-slate-600">
                    <div><span className="text-slate-600">VIN:</span> {c.vin || "—"}</div>
                    <div><span className="text-slate-600">CIV:</span> {c.civ || "—"}</div>
                    <div><span className="text-slate-600">Szín:</span> {c.color || "—"}</div>
                    <div><span className="text-slate-600">cm³:</span> {c.engine_cc ?? "—"}</div>
                    <div><span className="text-slate-600">kW/CP:</span> {c.power_kw ?? "—"}{c.power_kw ? ` / ${kwToCp(c.power_kw)}` : ""}</div>
                    <div><span className="text-slate-600">Össztömeg:</span> {c.total_mass ?? "—"}</div>
                    <div><span className="text-slate-600">Üzemanyag:</span> {c.fuel || "—"}</div>
                    <div><span className="text-slate-600">Gyártási év:</span> {c.year ?? "—"}</div>
                    <div><span className="text-slate-600">ITP:</span> {daysLeft(justDate(c.itp_date), 1, 0) ?? "—"}</div>
                    <div><span className="text-slate-600">RCA:</span> {daysLeft(justDate(c.rca_date), 1, 0) ?? "—"}</div>
                    <div><span className="text-slate-600">Casco:</span> {daysLeft(justDate(c.casco_start), 0, c.casco_months || 0) ?? "—"}</div>
                    <div><span className="text-slate-600">Rovigneta:</span> {daysLeft(justDate(c.rovinieta_start), 0, c.rovinieta_months || 0) ?? "—"}</div>
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
        {!rows.length && <div className="px-3 py-8 text-center text-slate-600">Nincs találat.</div>}
      </div>
    </div>
  );
}

/* ---------- Main (mobile shell) ---------- */
export default function AllInCarsMobile() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [sort, setSort] = useState<"urgency" | "plate" | "make">("urgency");
  const [view, setView] = useState<"list" | "board">("board");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listCars().then((rows) => { if (alive) setCars(rows || []); }).finally(() => setLoading(false));
    return () => { alive = false; };
  }, []);

  const enriched = useMemo(() => {
    return (cars || []).map((c) => {
      const itp = daysLeft(justDate(c.itp_date), 1, 0);
      const rca = daysLeft(justDate(c.rca_date), 1, 0);
      const cas = daysLeft(justDate(c.casco_start), 0, c.casco_months || 0);
      const rov = daysLeft(justDate(c.rovinieta_start), 0, c.rovinieta_months || 0);
      const minDays = Math.min(...[itp, rca, cas, rov].map((v) => (v == null ? 9999 : v)));
      return { ...c, itp, rca, cas, rov, minDays };
    });
  }, [cars]);

  const filtered = useMemo(() => {
    let arr = [...enriched];
    if (alertsOnly) arr = arr.filter((x) => (x.itp ?? 9999) <= 5 || (x.rca ?? 9999) <= 5 || (x.cas ?? 9999) <= 5 || (x.rov ?? 9999) <= 5);
    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      arr = arr.filter((x) => (x.plate || "").toLowerCase().includes(qq) || (x.make_model || "").toLowerCase().includes(qq) || (x.vin || "").toLowerCase().includes(qq));
    }
    if (sort === "plate") arr.sort((a, b) => (a.plate || "").localeCompare(b.plate || ""));
    else if (sort === "make") arr.sort((a, b) => (a.make_model || "").localeCompare(b.make_model || ""));
    else arr.sort((a, b) => (a.minDays ?? 9999) - (b.minDays ?? 9999));
    return arr;
  }, [enriched, q, alertsOnly, sort]);

  const pageSize = 20;
  const [page, setPage] = useState(1);
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), pageCount);
  const start = (clamped - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const cssVars = { "--cupe-green": CUPE.green } as React.CSSProperties;

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: CUPE.bgBlue, ...cssVars }}>
      {/* Header */}
      <div className="sticky top-0 z-10 shadow-md" style={{ backgroundColor: CUPE.blue }}>
        <div className="px-3 py-3 flex items-center justify-between gap-2">
          <div className="text-white font-medium">Autók nyilvántartása</div>
          <div className="flex items-center gap-2">
            <Button type="button" className="h-8 px-3 text-white" style={{ backgroundColor: CUPE.green }} onClick={() => (window.location.hash = "#admincarexpenses")}>Kiadások</Button>
            <Button type="button" variant="outline" className="h-8 px-3 text-white border-white/40" onClick={() => (window.location.hash = "#adminextras")} title="Vissza">
              <ChevronLeft className="w-4 h-4" /> Vissza
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-3 pb-3 grid grid-cols-1 gap-2">
          <Input className="bg-white text-slate-800" placeholder="Gyorskereső (rendszám, típus, VIN)" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex items-center gap-2">
            <select value={sort} onChange={(e)=>setSort(e.target.value as any)} className="h-9 rounded-md bg-white border border-slate-300 text-slate-800 px-2">
              <option value="urgency">Rendezés: lejárat</option>
              <option value="plate">Rendezés: rendszám</option>
              <option value="make">Rendezés: márka/típus</option>
            </select>
            <label className="ml-auto flex items-center gap-2 text-slate-200 text-sm cursor-pointer select-none">
              <input type="checkbox" className="accent-white" checked={alertsOnly} onChange={(e)=>setAlertsOnly(e.target.checked)} />
              Csak problémás
            </label>
          </div>
        </div>
      </div>

      {/* View toggles */}
      <div className="px-3 pt-2">
        <div className="flex items-center gap-1 rounded-md bg-white border border-slate-300 px-1 py-1">
          <button className={"h-8 px-3 rounded " + (view === "board" ? "bg-slate-700 text-white" : "text-slate-600")} onClick={() => setView("board")} type="button">
            <LayoutGrid className="inline w-4 h-4 mr-1" /> Kártyák
          </button>
          <button className={"h-8 px-3 rounded " + (view === "list" ? "bg-slate-700 text-white" : "text-slate-600")} onClick={() => setView("list")} type="button">
            <LayoutList className="inline w-4 h-4 mr-1" /> Lista
          </button>
        </div>
      </div>

      {/* Content views */}
      <div className="px-2 pt-2">
        {loading && <div className="text-center py-6 text-white/80">Betöltés…</div>}
        {!loading && paged.length === 0 && <div className="text-center py-6 text-white/80">Nincs találat.</div>}

        {view === "board" ? <BoardView rows={paged} /> : <ListView rows={paged} expandedDefault={paged.length <= 10} />}
      </div>

      {/* Pagination */}
      <div className="sticky bottom-0 bg-[#2E3A4A]/95 backdrop-blur px-3 py-2 flex items-center justify-between text-sm text-white">
        <Button className="h-8 px-3 border text-sm" variant="outline" disabled={clamped <= 1} onClick={() => setPage((p)=>Math.max(1,p-1))}>‹ Előző</Button>
        <div>{clamped} / {pageCount}</div>
        <Button className="h-8 px-3 border text-sm" variant="outline" disabled={clamped >= pageCount} onClick={() => setPage((p)=>Math.min(pageCount,p+1))}>Következő ›</Button>
      </div>
    </div>
  );
}
