"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CalendarDays,
  CarFront,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Home,
  ImageIcon,
  LayoutGrid,
  LayoutList,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";

type Car = {
  id?: number;
  photo_url?: string;
  plate?: string;
  make_model?: string;
  itp_date?: string;
  itp_years?: number;
  itp_months?: number;
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

type SortKey = "urgency" | "plate" | "make";
type ViewMode = "board" | "list";
type SelectOption = { value: string; label: string };

const API = (import.meta as any).env?.VITE_API_BASE || "/api";
const MARLBORO = "#E21C2A";

const page = "min-h-screen overflow-x-hidden bg-gradient-to-b from-[#5a6575] via-[#505b6b] to-[#454f5e] pb-8 text-white font-normal";
const shell = "mx-auto w-full min-w-0 max-w-[760px] space-y-3 px-3";
const panel = "overflow-hidden rounded-[22px] border border-white/14 bg-[#344154] shadow-[0_14px_34px_rgba(15,23,42,0.16)]";
const iconBtn = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.055] text-white transition active:scale-[0.97] disabled:opacity-45";
const iconBtnActive = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#8ce7e2]/42 bg-[#2a8d8b] text-white shadow-[0_8px_18px_rgba(42,141,139,0.22)] transition active:scale-[0.97]";
const softBtn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.055] px-3 text-[11px] text-white transition active:scale-[0.98] disabled:opacity-45";

function normalizeItpYearsLike(obj: any): number {
  const c = obj || {};
  const candidates = [
    Number(c.itp_years),
    Number(c.itp_months) ? Number(c.itp_months) / 12 : undefined,
    Number(c.itp_valid_years),
    Number(c.itp_interval_years),
    Number(c.itp_period_years),
    Number(c.years_itp),
    Number(c.itpValidityYears),
  ].filter((x) => Number.isFinite(x as any) && Number(x) !== 0);
  const y = candidates.length ? Math.round(Number(candidates[0])) : 1;
  if (y <= 0) return 1;
  if (y > 5) return 2;
  return Math.max(1, Math.min(2, y));
}

function justDate(s?: string | null) {
  return s ? String(s).slice(0, 10) : undefined;
}

function daysLeft(fromISO: string | undefined, years = 0, months = 0): number | null {
  if (!fromISO) return null;
  const start = new Date(`${fromISO}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const expiry = new Date(start);
  if (years) expiry.setFullYear(expiry.getFullYear() + years);
  if (months) expiry.setMonth(expiry.getMonth() + months);
  const today = new Date();
  const ms = expiry.getTime() - new Date(today.toDateString()).getTime();
  return Math.ceil(ms / 86400000);
}

function kwToCp(kw?: number) {
  return kw ? Math.round(kw * 1.341) : 0;
}

function formatDate(value?: string | null) {
  const key = justDate(value);
  if (!key) return "-";
  const date = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(date);
}

async function fetchJSON(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const ct = response.headers.get("content-type") || "";
  return ct.includes("json") ? response.json() : null;
}

async function listCars(): Promise<Car[]> {
  try {
    const data = await fetchJSON(`${API}/cars`);
    const rows = (Array.isArray(data) ? data : data?.rows || []) as any[];
    return rows.map((row) => ({ ...row, itp_years: normalizeItpYearsLike(row) }));
  } catch {
    return [];
  }
}

function statusTone(days: number | null) {
  if (days == null) return "border-white/12 bg-white/[0.05] text-white/45";
  if (days < 0) return "border-white/75 bg-[#E21C2A] text-white shadow-[0_7px_18px_rgba(226,28,42,.24)]";
  if (days <= 5) return "border-amber-200/32 bg-amber-400/13 text-amber-50";
  return "border-[#7bd7d4]/30 bg-[#2a8d8b]/14 text-[#d7fffd]";
}

function StatusChip({ label, days }: { label: string; days: number | null }) {
  if (days == null) return null;
  return (
    <div className={`flex min-w-0 items-center justify-between gap-2 rounded-xl border px-2.5 py-2 ${statusTone(days)}`}>
      <span className="truncate text-[9px] uppercase tracking-[0.08em] opacity-70">{label}</span>
      <span className="shrink-0 text-[11px]">{days < 0 ? `${Math.abs(days)} napja lejárt` : `${days} nap`}</span>
    </div>
  );
}

function AllInSelect({ value, options, onChange, ariaLabel }: { value: string; options: SelectOption[]; onChange: (value: string) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const selected = options.find((item) => item.value === value) || options[0] || null;

  const updatePosition = useCallback(() => {
    const node = triggerRef.current;
    if (!node || typeof window === "undefined") return;
    const rect = node.getBoundingClientRect();
    const edge = 10;
    const width = Math.min(Math.max(rect.width, 210), window.innerWidth - edge * 2);
    const left = Math.min(Math.max(edge, rect.left), Math.max(edge, window.innerWidth - width - edge));
    const wanted = Math.min(290, 18 + options.length * 38);
    const below = window.innerHeight - rect.bottom - edge;
    const above = rect.top - edge;
    const up = below < 160 && above > below;
    setStyle({
      position: "fixed",
      left,
      width,
      top: up ? rect.top - 6 : rect.bottom + 6,
      transform: up ? "translateY(-100%)" : "none",
      maxHeight: Math.max(110, Math.min(wanted, up ? above - 6 : below - 6)),
      zIndex: 2147483200,
    });
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const outside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const reposition = () => updatePosition();
    document.addEventListener("mousedown", outside, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => { if (!open) updatePosition(); setOpen((current) => !current); }}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-white/16 bg-[#293649] px-3 text-left text-[12px] text-white outline-none transition focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/15"
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label || "-"}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/52 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} style={style} className="overflow-hidden rounded-2xl border border-[#7bd7d4]/30 bg-[#293344] p-1.5 text-white shadow-[0_24px_70px_rgba(2,6,23,.72)]" role="listbox">
          <div className="max-h-[270px] overflow-y-auto">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { onChange(option.value); setOpen(false); }}
                  className={`mb-1 flex min-h-9 w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] last:mb-0 ${active ? "border-[#7bd7d4]/55 bg-[#2a8d8b] text-white" : "border-transparent bg-[#303a4c] text-white/78 hover:bg-[#3b485d]"}`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {active ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : null}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function CarImage({ car }: { car: Car }) {
  return (
    <div className="grid h-[76px] w-[92px] shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/14 bg-white shadow-sm">
      {car.photo_url ? <img src={car.photo_url} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : <ImageIcon className="h-6 w-6 text-slate-400" />}
    </div>
  );
}

function CarCard({ car, compact = false }: { car: any; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const statuses = [
    ["ITP", car.itp],
    ["RCA", car.rca],
    ["Casco", car.cas],
    ["Rovinieta", car.rov],
  ] as Array<[string, number | null]>;
  const visibleStatuses = statuses.filter(([, value]) => value != null);
  const warning = visibleStatuses.some(([, value]) => value != null && value <= 5);

  return (
    <article className={`overflow-hidden rounded-[22px] border bg-[#344154] shadow-[0_12px_28px_rgba(15,23,42,.16)] ${warning ? "border-red-300/30" : "border-white/13"}`}>
      <div className="p-3">
        <div className="flex min-w-0 items-center gap-3">
          <CarImage car={car} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[17px] leading-tight text-white">{car.plate || "Ismeretlen"}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/52">{car.make_model || "-"}</p>
              </div>
              {warning ? <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/75 bg-[#E21C2A] text-white"><AlertTriangle className="h-4 w-4" /></span> : <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#7bd7d4]/24 bg-[#2a8d8b]/13 text-[#d7fffd]"><ShieldCheck className="h-4 w-4" /></span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-[9px] text-white/52">
              {car.year ? <span className="rounded-lg border border-white/9 bg-white/[0.04] px-1.5 py-0.5">{car.year}</span> : null}
              {car.fuel ? <span className="rounded-lg border border-white/9 bg-white/[0.04] px-1.5 py-0.5">{car.fuel}</span> : null}
              {car.power_kw ? <span className="rounded-lg border border-white/9 bg-white/[0.04] px-1.5 py-0.5">{car.power_kw} kW / {kwToCp(car.power_kw)} CP</span> : null}
            </div>
          </div>
        </div>

        {!compact ? (
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {visibleStatuses.length ? visibleStatuses.map(([label, value]) => <StatusChip key={label} label={label} days={value} />) : <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[10px] text-white/42">Nincs rögzített lejárati adat.</div>}
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/9 pt-2.5">
          <span className="min-w-0 truncate text-[10px] text-white/38">{car.vin ? `VIN: ${car.vin}` : "Részletes járműadatok"}</span>
          <button type="button" onClick={() => setOpen((value) => !value)} className={softBtn}>{open ? "Bezár" : "Részletek"}<ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} /></button>
        </div>
      </div>

      {open ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-white/10 bg-[#2d394b] px-3 py-3 text-[10px]">
          {[
            ["VIN", car.vin || "-"],
            ["CIV", car.civ || "-"],
            ["Szín", car.color || "-"],
            ["Motor", car.engine_cc ? `${car.engine_cc} cm³` : "-"],
            ["Teljesítmény", car.power_kw ? `${car.power_kw} kW / ${kwToCp(car.power_kw)} CP` : "-"],
            ["Össztömeg", car.total_mass ? `${car.total_mass} kg` : "-"],
            ["ITP alapdátum", formatDate(car.itp_date)],
            ["RCA alapdátum", formatDate(car.rca_date)],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl border border-white/8 bg-white/[0.035] px-2.5 py-2">
              <div className="text-[8px] uppercase tracking-[0.08em] text-white/35">{label}</div>
              <div className="mt-1 truncate text-[11px] text-white/78" title={String(value)}>{value}</div>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function AllInCarsMobile() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("urgency");
  const [view, setView] = useState<ViewMode>("board");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageNo, setPageNo] = useState(1);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setCars(await listCars()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const enriched = useMemo(() => (cars || []).map((car) => {
    const itpYears = normalizeItpYearsLike(car);
    const itp = daysLeft(justDate(car.itp_date), itpYears, 0);
    const rca = daysLeft(justDate(car.rca_date), 1, 0);
    const cas = daysLeft(justDate(car.casco_start), 0, car.casco_months || 0);
    const rov = daysLeft(justDate(car.rovinieta_start), 0, car.rovinieta_months || 0);
    const minDays = Math.min(...[itp, rca, cas, rov].map((value) => value == null ? 9999 : value));
    return { ...car, itp_years: itpYears, itp, rca, cas, rov, minDays };
  }), [cars]);

  const alertCount = useMemo(() => enriched.filter((car) => [car.itp, car.rca, car.cas, car.rov].some((value) => value != null && value <= 5)).length, [enriched]);

  const filtered = useMemo(() => {
    let result = [...enriched];
    if (alertsOnly) result = result.filter((car) => [car.itp, car.rca, car.cas, car.rov].some((value) => value != null && value <= 5));
    if (q.trim()) {
      const query = q.trim().toLowerCase();
      result = result.filter((car) => [car.plate, car.make_model, car.vin].some((value) => String(value || "").toLowerCase().includes(query)));
    }
    if (sort === "plate") result.sort((a, b) => String(a.plate || "").localeCompare(String(b.plate || ""), "hu"));
    else if (sort === "make") result.sort((a, b) => String(a.make_model || "").localeCompare(String(b.make_model || ""), "hu"));
    else result.sort((a, b) => (a.minDays ?? 9999) - (b.minDays ?? 9999));
    return result;
  }, [alertsOnly, enriched, q, sort]);

  useEffect(() => { setPageNo(1); }, [q, alertsOnly, sort, view]);

  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(pageNo, 1), pages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className={page}>
      <div className={shell}>
        <header className="sticky top-0 z-40 -mx-3 border-b border-white/12 bg-[#2d394b]/96 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-[0_14px_34px_rgba(15,23,42,.28)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#8ce7e2]/34 bg-[#2a8d8b]/22 text-[#d7fffd]"><CarFront className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] uppercase tracking-[0.16em] text-[#bff8f5]/58">AllInFashion • járművek</div>
              <h1 className="mt-0.5 truncate text-lg leading-tight text-white">Autók</h1>
              <div className="mt-0.5 truncate text-[10px] text-white/44">{cars.length} jármű • {alertCount} figyelmeztetés</div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => (window.location.hash = "#admincarexpenses")} className={iconBtnActive} title="Autó kiadások" aria-label="Autó kiadások"><ReceiptText className="h-4 w-4" /></button>
              <button type="button" onClick={() => void reload()} disabled={loading} className={iconBtn} title="Frissítés" aria-label="Frissítés"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
              <button type="button" onClick={() => (window.location.hash = "#allin")} className={iconBtn} title="Kezdőlap" aria-label="Kezdőlap"><Home className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_40px] gap-2">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/34" />
              <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Rendszám, típus, VIN..." className="h-10 w-full rounded-xl border border-white/16 bg-[#293649] pl-9 pr-9 text-[12px] text-white outline-none placeholder:text-white/34 focus:border-[#7bd7d4]/60" />
              {q ? <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/45"><X className="h-3.5 w-3.5" /></button> : null}
            </div>
            <button type="button" onClick={() => setFiltersOpen(true)} className={alertsOnly || sort !== "urgency" ? iconBtnActive : iconBtn} aria-label="Szűrők"><SlidersHorizontal className="h-4 w-4" /></button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setAlertsOnly(false)} className={`rounded-[20px] border p-3 text-left ${!alertsOnly ? "border-[#7bd7d4]/35 bg-[#2a8d8b]/16" : "border-white/12 bg-[#344154]"}`}>
            <div className="text-[8px] uppercase tracking-[0.1em] text-white/42">Járművek</div>
            <div className="mt-1.5 text-[22px] leading-none text-white">{cars.length}</div>
            <div className="mt-1 text-[9px] text-white/40">összes aktív autó</div>
          </button>
          <button type="button" onClick={() => setAlertsOnly(true)} className={`rounded-[20px] border p-3 text-left ${alertsOnly ? "border-white/75 bg-[#E21C2A]" : alertCount ? "border-red-300/28 bg-red-500/12" : "border-white/12 bg-[#344154]"}`}>
            <div className="text-[8px] uppercase tracking-[0.1em] text-white/60">Figyelmeztetés</div>
            <div className="mt-1.5 text-[22px] leading-none text-white">{alertCount}</div>
            <div className="mt-1 text-[9px] text-white/55">lejárt vagy ≤ 5 nap</div>
          </button>
        </section>

        <section className="grid grid-cols-2 gap-1.5 rounded-[20px] border border-white/12 bg-[#303a4c] p-1.5">
          <button type="button" onClick={() => setView("board")} className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[11px] ${view === "board" ? "bg-[#2a8d8b] text-white" : "text-white/58"}`}><LayoutGrid className="h-4 w-4" /> Kártyák</button>
          <button type="button" onClick={() => setView("list")} className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[11px] ${view === "list" ? "bg-[#2a8d8b] text-white" : "text-white/58"}`}><LayoutList className="h-4 w-4" /> Kompakt</button>
        </section>

        <section className="grid gap-2">
          {loading ? <div className={`${panel} grid min-h-[140px] place-items-center text-sm text-white/55`}><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" /> Betöltés...</div> : null}
          {!loading && paged.map((car) => <CarCard key={String(car.id ?? car.plate)} car={car} compact={view === "list"} />)}
          {!loading && !paged.length ? <div className={`${panel} px-4 py-10 text-center text-sm text-white/45`}>Nincs találat.</div> : null}
        </section>

        {filtered.length > pageSize ? (
          <section className="flex items-center justify-between gap-2 rounded-[20px] border border-white/12 bg-[#303a4c] p-2">
            <button type="button" className={iconBtn} disabled={safePage <= 1} onClick={() => setPageNo((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></button>
            <div className="text-center"><div className="text-[11px] text-white/72">{safePage} / {pages}. oldal</div><div className="mt-0.5 text-[9px] text-white/38">{filtered.length} találat</div></div>
            <button type="button" className={iconBtn} disabled={safePage >= pages} onClick={() => setPageNo((value) => Math.min(pages, value + 1))}><ChevronRight className="h-4 w-4" /></button>
          </section>
        ) : null}
      </div>

      {filtersOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[900] grid place-items-center bg-slate-950/72 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setFiltersOpen(false); }}>
          <section className="w-full max-w-[346px] overflow-hidden rounded-[26px] border border-white/18 bg-[#303c4f] text-white shadow-[0_32px_100px_rgba(0,0,0,.58)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-3.5 py-3">
              <div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#8ce7e2]/28 bg-[#2a8d8b]/16 text-[#d7fffd]"><SlidersHorizontal className="h-4 w-4" /></span><div><div className="text-[8px] uppercase tracking-[0.14em] text-white/42">Szűrés</div><h2 className="mt-0.5 text-[16px]">Mit mutassunk?</h2></div></div>
              <button type="button" onClick={() => setFiltersOpen(false)} className={iconBtn}><X className="h-4 w-4" /></button>
            </header>
            <div className="grid gap-3 p-3">
              <label className="grid gap-1 text-[9px] uppercase tracking-[0.09em] text-white/46">Rendezés
                <AllInSelect value={sort} onChange={(value) => setSort(value as SortKey)} ariaLabel="Rendezés" options={[{ value: "urgency", label: "Lejárat szerint" }, { value: "plate", label: "Rendszám szerint" }, { value: "make", label: "Márka / típus szerint" }]} />
              </label>
              <button type="button" onClick={() => setAlertsOnly((value) => !value)} className={`flex h-12 items-center justify-between rounded-2xl border px-3 ${alertsOnly ? "border-white/75 bg-[#E21C2A] text-white" : "border-white/14 bg-[#293649] text-white/72"}`}>
                <span className="flex items-center gap-2 text-[12px]"><AlertTriangle className="h-4 w-4" /> Csak problémás</span>
                <span className={`inline-flex h-6 w-10 items-center rounded-full border p-0.5 transition ${alertsOnly ? "justify-end border-white/40 bg-white/18" : "justify-start border-white/12 bg-black/10"}`}><span className="h-4 w-4 rounded-full bg-white" /></span>
              </button>
            </div>
            <footer className="grid grid-cols-2 gap-2 border-t border-white/10 bg-[#293548] p-3">
              <button type="button" className={softBtn} onClick={() => { setSort("urgency"); setAlertsOnly(false); }}>Alaphelyzet</button>
              <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-[#8ce7e2]/42 bg-[#2a8d8b] px-3 text-[11px] text-white" onClick={() => setFiltersOpen(false)}>Alkalmazás</button>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
