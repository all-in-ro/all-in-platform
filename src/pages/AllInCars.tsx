import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  CalendarDays,
  PlusCircle,
  Save,
  RefreshCcw,
  Bell,
  AlertTriangle,
  Search,
  LayoutList,
  LayoutGrid,
  ArrowLeft,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2,
  CarFront,
  CheckCircle2,
  Home,
  WalletCards,
} from "lucide-react";

import AllInCarsMobile from "./AllInCarsMobile";

/* ---------- Types ---------- */
type Car = {
  id?: number;
  photo_url?: string;
  plate?: string;
  make_model?: string;
  itp_date?: string;
  itp_years?: number;   // 1 vagy 2 év
  itp_months?: number;  // backend fallback (12 vagy 24)
  rca_date?: string;
  casco_start?: string;
  casco_months?: number;
  rovinieta_start?: string;
  rovinieta_months?: number;
  parking_start?: string;
  parking_months?: number;
  vin?: string;
  civ?: string;
  color?: string;
  engine_cc?: number;
  power_kw?: number;
  total_mass?: number;
  fuel?: string;
  year?: number;
};

// IMPORTANT: default to same-origin so session cookies work (Render/Cloudflare).
// If VITE_API_BASE is set, it can override this.
const API = (import.meta as any).env?.VITE_API_BASE || "/api";

// R2 upload endpoint tipikusan admin-vedelemmel fut (401 ha nincs megfelelo fejlec).
// Frontenden env-bol vesszuk, ugyanugy mint a tobbi admin oldal.
const ADMIN_SECRET = (import.meta as any).env?.VITE_ADMIN_SECRET || "";

const CUPE = {
  blue: "#303a4c",
  bgBlue: "#4b5362",
  green: "#2a8d8b",
  warning: "#f6ca3c",
  danger: "#b60e21",
} as const;

/* ---------- Helpers ---------- */
function normalizeItpYearsLike(obj: any): number {
  const c = obj || {};
  const candidates = [
    Number(c.itp_years),
    Number(c.itp_months) ? Number(c.itp_months) / 12 : undefined,
    Number((c as any).itp_valid_years),
    Number((c as any).itp_interval_years),
    Number((c as any).itp_period_years),
    Number((c as any).years_itp),
    Number((c as any).itpValidityYears),
  ].filter((x) => Number.isFinite(x as any) && Number(x) !== 0);
  const y = candidates.length ? Math.round(Number(candidates[0] as any)) : 1;
  return y <= 0 ? 1 : y > 5 ? 2 : y; // clamp weird values to 1..2 for biztonság
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

type Level = "expired" | "soon" | "ok" | "unknown";

const levelFor = (d: number | null): Level =>
  d == null ? "unknown" : d < 0 ? "expired" : d <= 5 ? "soon" : "ok";

const kwToCp = (kw?: number) => (kw ? Math.round(kw * 1.341) : 0);

function justDate(s?: string | null): string | undefined {
  if (!s) return undefined;
  return String(s).slice(0, 10);
}

function cleanForSave(car: any): any {
  const payload: any = {};
  const copy = { ...car };

  // Normalize date-only strings and allow clearing to NULL
  const dateKeys = ["itp_date","rca_date","casco_start","rovinieta_start","parking_start"];
  for (const dk of dateKeys) {
    const val = justDate((copy as any)[dk]);
    if (val) {
      payload[dk] = val;
    } else {
      payload[dk] = null; // explicit wipe on server
    }
  }

  // Coerce numeric fields and copy non-empty scalars
  for (const [k, v] of Object.entries(copy)) {
    if (dateKeys.includes(k)) continue; // already handled above
    if (v === "" || v == null) continue;
    if (["engine_cc","power_kw","total_mass","year","casco_months","rovinieta_months","parking_months","itp_years","itp_months"].includes(k)) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      payload[k] = n;
    } else {
      payload[k] = v;
    }
  }
  // Default itp_years
  if (payload.itp_years == null || payload.itp_years === 0) payload.itp_years = 1;
  // Fallback: küldjük itp_months-t is, ha a backend azt várja
  if (payload.itp_years != null && payload.itp_months == null) {
    const y = Number(payload.itp_years) || 1;
    payload.itp_months = y * 12;
  }
  // Extra mezőnevek a makacs backendekhez
  if (payload.itp_years != null) {
    const y = Number(payload.itp_years) || 1;
    payload.itp_valid_years = y;
    payload.itp_interval_years = y;
    payload.itp_period_years = y;
    payload.years_itp = y;
    payload.itpValidityYears = y;
  }
  return payload;
}

function toneFor(lvl: Level) {
  if (lvl === "expired") return "bg-[#b60e21] text-white border border-[#b60e21] shadow-[0_7px_18px_rgba(182,14,33,.24)]";
  if (lvl === "soon") return "bg-[#f6ca3c] text-[#2b2300] border border-[#f6ca3c] shadow-[0_7px_18px_rgba(246,202,60,.18)]";
  if (lvl === "ok") return "bg-[#2a8d8b] text-white border border-[#7bd7d4]/35";
  return "bg-[#354153] text-white/65 border border-white/14";
}


const HU_MONTHS = [
  "január", "február", "március", "április", "május", "június",
  "július", "augusztus", "szeptember", "október", "november", "december",
];
const HU_WEEKDAYS = ["H", "K", "SZE", "CS", "P", "SZO", "V"];

function datePickerIso(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function datePickerLabel(value?: string | null) {
  const iso = justDate(value);
  if (!iso) return "Válassz dátumot";
  const [y, m, d] = iso.split("-");
  return `${y}. ${m}. ${d}.`;
}

function AllInDatePicker({
  value,
  onChange,
  ariaLabel,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const selectedIso = justDate(value) || "";
  const selectedDate = selectedIso ? new Date(`${selectedIso}T12:00:00`) : null;
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate || new Date());
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const updatePosition = useCallback(() => {
    if (typeof window === "undefined" || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const padding = 12;
    const gap = 7;
    const estimatedHeight = 360;
    let left = Math.min(
      Math.max(padding, rect.left),
      Math.max(padding, window.innerWidth - width - padding),
    );
    let top = rect.bottom + gap;
    let transform = "none";
    if (top + estimatedHeight > window.innerHeight - padding && rect.top > estimatedHeight + padding) {
      top = rect.top - gap;
      transform = "translateY(-100%)";
    }
    setPopupStyle({
      position: "fixed",
      left,
      top,
      width,
      transform,
      zIndex: 2147483200,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setViewDate(selectedDate || new Date());
    updatePosition();

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || buttonRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onMove = () => updatePosition();

    document.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, selectedIso, updatePosition]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1, 12, 0, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayOffset, 12, 0, 0);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
  const todayIso = datePickerIso(new Date());

  const popup = open && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={popupRef}
          style={popupStyle}
          className="overflow-hidden rounded-[18px] border border-white/35 bg-[#303a4c] text-white shadow-[0_26px_70px_rgba(0,0,0,.55)]"
          role="dialog"
          aria-label={`${ariaLabel} naptár`}
        >
          <div className="border-b border-white/14 px-3 pt-2.5 pb-2">
            <div className="text-[9px] uppercase tracking-[0.14em] text-white/45">Naptár</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/14 bg-[#354153] text-white/80 hover:bg-[#3e4d63]"
                onClick={() => setViewDate(new Date(year, month - 1, 1, 12, 0, 0))}
                aria-label="Előző hónap"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-[13px]">{year}. {HU_MONTHS[month]}</div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/14 bg-[#354153] text-white/80 hover:bg-[#3e4d63]"
                onClick={() => setViewDate(new Date(year, month + 1, 1, 12, 0, 0))}
                aria-label="Következő hónap"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-7 text-center text-[9px] uppercase tracking-[0.06em] text-white/42">
              {HU_WEEKDAYS.map((day) => <div key={day} className="py-1">{day}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((day) => {
                const iso = datePickerIso(day);
                const inMonth = day.getMonth() === month;
                const selected = iso === selectedIso;
                const today = iso === todayIso;
                return (
                  <button
                    type="button"
                    key={iso}
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    className={`relative h-9 rounded-lg text-[11px] transition ${
                      selected
                        ? "bg-[#2a8d8b] text-white shadow-[0_0_0_1px_rgba(123,215,212,.35)]"
                        : inMonth
                          ? "bg-[#354153] text-white/88 hover:bg-[#415064]"
                          : "bg-[#2a3342] text-white/28 hover:text-white/48"
                    } ${today && !selected ? "ring-1 ring-inset ring-[#7bd7d4]/55" : ""}`}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/14 px-3 py-2.5">
            <span className="text-[9px] text-white/35">A hét hétfővel kezdődik.</span>
            <div className="flex gap-1.5">
              {selectedIso ? (
                <button
                  type="button"
                  className="h-8 rounded-lg border border-white/14 bg-[#354153] px-2.5 text-[10px] text-white/70 hover:bg-[#3e4d63]"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Törlés
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#7bd7d4]/35 bg-[#2a8d8b] px-2.5 text-[10px] text-white"
                onClick={() => {
                  onChange(todayIso);
                  setOpen(false);
                }}
              >
                <CalendarDays className="h-3.5 w-3.5" /> Ma
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-[12px] outline-none transition ${
          open
            ? "border-[#7bd7d4]/70 bg-[#3f4959] ring-2 ring-[#7bd7d4]/16"
            : "border-white/18 bg-[#3f4959] hover:border-white/30"
        } ${selectedIso ? "text-white" : "text-white/42"}`}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-[#9ee5e2]" />
          <span className="truncate">{datePickerLabel(selectedIso)}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/45 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {popup}
    </>
  );
}

async function fetchJSON(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    credentials: init?.credentials ?? "include",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("json")) return null as any;
  return await r.json();
}

async function uploadToR2(file: File): Promise<string> {
  // Backend upload (CUPE-style): frontend POST -> backend -> R2 (API TOKEN).
  const fd = new FormData();
  fd.append("file", file);

  const r = await fetch(`${API}/uploads/r2`, {
    method: "POST",
    headers: ADMIN_SECRET ? { "x-admin-secret": ADMIN_SECRET } : undefined,
    body: fd,
    credentials: "include",
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Feltöltés sikertelen (HTTP ${r.status}) ${t}`.slice(0, 300));
  }

  const j = await r.json().catch(() => null as any);
  const url = j?.url || j?.publicUrl || j?.public_url;
  if (!url) throw new Error("Nincs url a feltöltés válaszában.");
  return String(url);
}

async function listCars(): Promise<Car[]> {
  try {
    const data = await fetchJSON(`${API}/cars`);
    const rows = (Array.isArray(data) ? data : data?.rows || []) as any[];
    // Bármilyen backend-féle mezőből értelmezzük az éveket
    return rows.map((r) => {
      r.itp_years = normalizeItpYearsLike(r);
      return r;
    });
  } catch {
    return [];
  }
}

async function createCar(car: Car): Promise<Car | null> {
  try {
    return await fetchJSON(`${API}/cars`, {
      method: "POST",
      body: JSON.stringify(car),
    });
  } catch {
    return null;
  }
}

async function updateCar(id: number, car: Car): Promise<Car | null> {
  try {
    return await fetchJSON(`${API}/cars/${id}`, {
      method: "PATCH",
      body: JSON.stringify(car),
    });
  } catch {
    return null;
  }
}

/* ---------- UI atoms ---------- */
function Chip({ label, days }: { label: string; days: number | null }) {
  const lvl = levelFor(days);
  const style = lvl === "ok" ? { backgroundColor: CUPE.green } : undefined;
  return (
    <div
      className={"rounded-full px-2.5 py-1 text-[10px] font-normal " + toneFor(lvl)}
      style={style}
      title={`${label} ${days == null ? "-" : days + " nap"}`}
    >
      {label}: {days == null ? "-" : `${days} nap`}
    </div>
  );
}

function Kpi({
  title,
  value,
  hint,
  tone = "",
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    // NOTE: shadcn <Card> kap alap "bg-card" osztalyt, amit dark theme-ben felulirhat.
    // Itt direkt div-et hasznalunk, hogy a KPI mindig CUPE-feher maradjon.
    <div
      className={"rounded-2xl border border-white/14 bg-white/[0.06] text-white shadow-sm " + tone}
    >
      <div className="p-3.5 md:p-4">
        <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">{title}</div>
        <div className="mt-2 text-2xl font-normal text-white">{value}</div>
        {hint && <div className="mt-1 text-[11px] text-white/45">{hint}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-white/65">
        {label}
      </span>
      {children}
    </label>
  );
}

/* ---------- Views ---------- */
function BoardView({ rows }: { rows: any[] }) {
  const colCls = "overflow-hidden rounded-2xl border border-white/14 bg-white/[0.055] text-white shadow-sm";
  const expiredRows = rows.filter((r) => r.hasExpired);
  const soonRows = rows.filter((r) => r.hasSoon);
  const okRows = rows.filter((r) => !r.hasExpired && !r.hasSoon);
  const renderCard = (c: any) => (
    <div
      key={String(c.id ?? c.plate)}
      className="rounded-2xl border border-white/12 bg-[#404a5b] p-3 text-white transition hover:border-[#7bd7d4]/30 hover:bg-[#465264]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="truncate">
          <div className="text-white text-[15px] font-medium leading-tight">
            {c.plate || "Ismeretlen"}
          </div>
          <div className="text-white/58 text-[12px] truncate">
            {c.make_model || "—"}
          </div>
        </div>
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white shadow-sm">
          {c.photo_url ? (
            <img src={c.photo_url} alt={`${c.plate || "Jármű"} kép`} className="h-full w-full object-contain p-1.5" />
          ) : (
            <div className="grid h-full w-full place-items-center text-white/35">
              <PlusCircle className="w-5 h-5" />
            </div>
          )}
        </div>
      </div>
      <div className="my-2 border-t border-white/10" />
      <div className="mt-2 flex flex-wrap gap-2">
        {c.itp_date && c.itp != null && <Chip label="ITP" days={c.itp} />}
        {c.rca_date && c.rca != null && <Chip label="RCA" days={c.rca} />}
        {c.casco_start && c.cas != null && <Chip label="Casco" days={c.cas} />}
        {c.rovinieta_start && c.rov != null && <Chip label="Rovigneta" days={c.rov} />}
        {c.parking_start && c.park != null && <Chip label="Parkolás" days={c.park} />}
      </div>
    </div>
  );
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className={colCls}>
        <div className="flex items-center gap-2 border-b border-[#b60e21]/70 bg-[#b60e21] px-4 py-3 text-sm text-white">
          <Bell className="w-4 h-4" />
          <span>Lejárt</span>
        </div>
        <div className="p-3 grid gap-3">{expiredRows.map(renderCard)}</div>
      </div>
      <div className={colCls}>
        <div className="flex items-center gap-2 border-b border-[#f6ca3c]/80 bg-[#f6ca3c] px-4 py-3 text-sm text-[#2b2300]">
          <AlertTriangle className="w-4 h-4" />
          <span>Közelgő</span>
        </div>
        <div className="p-3 grid gap-3">{soonRows.map(renderCard)}</div>
      </div>
      <div className={colCls}>
        <div className="flex items-center gap-2 border-b border-white/12 bg-[#404a5b] px-4 py-3 text-sm text-white">
          <CalendarDays className="w-4 h-4" />
          <span>Rendben</span>
        </div>
        <div className="p-3 grid gap-3">{okRows.map(renderCard)}</div>
      </div>
    </div>
  );
}

function ListView({
  rows,
  expandedDefault = false,
  onEdit,
  deletingId,
  onDelete,
}: {
  rows: any[];
  expandedDefault?: boolean;
  onEdit?: (car: any) => void;
  deletingId?: number | null;
  onDelete?: (id?: number) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (expandedDefault) {
      const m: Record<string, boolean> = {};
      rows.forEach((r) => {
        m[String(r.id ?? r.plate)] = true;
      });
      setExpanded(m);
    }
  }, [expandedDefault, rows]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/14 bg-white/[0.055] text-white shadow-sm">
      <div className="grid grid-cols-[1.2fr,1fr,1fr,2fr,180px] gap-0 border-b border-white/12 bg-[#303a4c] px-4 py-2.5 text-[10px] uppercase tracking-[0.09em] text-white/55">
        <div>Autó</div>
        <div className="text-center">ITP</div>
        <div className="text-center">RCA</div>
        <div className="text-center">Casco / Rovi / Parkolás</div>
        <div className="text-right pr-4 flex items-center justify-end gap-2 whitespace-nowrap">
          Műveletek
        </div>
      </div>
      <div className="divide-y divide-white/10">
        {rows.map((c) => {
          const key = String(c.id ?? c.plate ?? Math.random());
          const open = !!expanded[key];
          return (
            <div key={key} className="px-4 py-2.5 transition hover:bg-white/[0.035]">
              <div className="grid grid-cols-[1.2fr,1fr,1fr,2fr,180px] items-center gap-2">
                <div className="flex items-center gap-3 min-w-0">
	                  <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white shadow-sm">
	                    {c.photo_url ? (
	                      <img src={c.photo_url} alt={`${c.plate || "Jármű"} kép`} className="h-full w-full object-contain p-1.5" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-white/35">
                        <PlusCircle className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="truncate">
                    <div className="text-white text-[15px] font-medium leading-tight">
                      {c.plate || "Ismeretlen"}
                    </div>
                    <div className="text-white/58 text-[12px] truncate">
                      {c.make_model || "—"}
                    </div>
                  </div>
                </div>
                <div className="flex justify-center flex-wrap gap-2">
                  {c.itp_date && c.itp != null && <Chip label="ITP" days={c.itp} />}
                </div>
                <div className="flex justify-center flex-wrap gap-2">
                  {c.rca_date && c.rca != null && <Chip label="RCA" days={c.rca} />}
                </div>
                <div className="flex justify-center flex-wrap gap-2 mt-1 mb-1 min-w-[180px]">
                  {c.casco_start && c.cas != null && <Chip label="Casco" days={c.cas} />}
                  {c.rovinieta_start && c.rov != null && <Chip label="Rovigneta" days={c.rov} />}
                  {c.parking_start && c.park != null && <Chip label="Parkolás" days={c.park} />}
                </div>
                <div className="text-right pr-4 flex items-center justify-end gap-2 whitespace-nowrap">
                  {onEdit && (
                    <button
                      className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/14 bg-white/[0.06] px-2.5 text-[11px] text-white/78 transition hover:bg-white/[0.11] hover:text-white"
                      onClick={() => onEdit(c)}
                      type="button"
                      disabled={!!deletingId && deletingId === Number(c.id)}
                      aria-busy={deletingId === Number(c.id)}
                    >
                      <Edit className="w-4 h-4" /> Szerkesztés
                    </button>
                  )}
                  <button
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/14 bg-white/[0.06] px-2.5 text-[11px] text-white/78 transition hover:bg-white/[0.11] hover:text-white"
                    onClick={() => setExpanded((m) => ({ ...m, [key]: !open }))}
                    type="button"
                  >
                    {open ? (
                      <>
                        Bezár <ChevronUp className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        Részletek <ChevronDown className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
              {open && (
                <>
                  <div className="my-2 border-t border-white/10" />
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-white/10 bg-[#303a4c]/55 p-3 text-[12px] text-white/65 md:grid-cols-4">
                    <div>
                      <span className="text-white/42">VIN:</span> {c.vin || "—"}
                    </div>
                    <div>
                      <span className="text-white/42">CIV:</span> {c.civ || "—"}
                    </div>
                    <div>
                      <span className="text-white/42">Szín:</span> {c.color || "—"}
                    </div>
                    <div>
                      <span className="text-white/42">cm³:</span> {c.engine_cc ?? "—"}
                    </div>
                    <div>
                      <span className="text-white/42">kW/CP:</span>{" "}
                      {c.power_kw ?? "—"}
                      {c.power_kw ? ` / ${kwToCp(c.power_kw)}` : ""}
                    </div>
                    <div>
                      <span className="text-white/42">Össztömeg:</span> {c.total_mass ?? "—"}
                    </div>
                    <div>
                      <span className="text-white/42">Üzemanyag:</span> {c.fuel || "—"}
                    </div>
                    <div>
                      <span className="text-white/42">Gyártási év:</span> {c.year ?? "—"}
                    </div>
                    <div>
                      <span className="text-white/42">Parkolási bérlet:</span> {c.parking_start ? `${datePickerLabel(c.parking_start)} • ${c.parking_months || 12} hó` : "—"}
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      className="h-8 px-3 inline-flex items-center gap-1 rounded-md bg-[#b90f1e] hover:bg-[#a10d19] text-white text-[12px]"
                      onClick={() => onDelete && onDelete(Number(c.id))}
                      type="button"
                      disabled={!!deletingId && deletingId === Number(c.id)}
                      aria-busy={deletingId === Number(c.id)}
                    >
                      {deletingId === Number(c.id) ? (
                        "Törlés…"
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" /> Törlés
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {!rows.length && (
          <div className="px-4 py-10 text-center text-white/45">Nincs találat.</div>
        )}
      </div>
    </div>
  );
}

/* ---------- Main ---------- */
function AllInCarsDesktop() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const [photoEdit, setPhotoEdit] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadErr, setPhotoUploadErr] = useState<string>("");

  const [q, setQ] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [view, setView] = useState<"list" | "board">("board");

  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Styled confirm/info modal (copied in spirit from AllInUsers)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");
  const [confirmVariant, setConfirmVariant] = useState<"confirm" | "info">("confirm");
  const [confirmAction, setConfirmAction] = useState<null | { kind: "delete"; id: number }>(null);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  const defaultForm: Car = {
    photo_url: "",
    plate: "",
    make_model: "",
    itp_date: "",
    itp_years: 1, // default 1 év
    rca_date: "",
    casco_start: "",
    casco_months: 12,
    rovinieta_start: "",
    rovinieta_months: 12,
    parking_start: "",
    parking_months: 12,
    vin: "",
    civ: "",
    color: "",
    engine_cc: undefined,
    power_kw: undefined,
    total_mass: undefined,
    fuel: "",
    year: undefined,
  };
  const [form, setForm] = useState<Car>({ ...defaultForm });

  const itpDays = useMemo(
    () => daysLeft(form.itp_date || undefined, form.itp_years || 1, 0),
    [form.itp_date, form.itp_years]
  );
  const rcaDays = useMemo(
    () => daysLeft(form.rca_date || undefined, 1, 0),
    [form.rca_date]
  );
  const cascoDays = useMemo(
    () => daysLeft(form.casco_start || undefined, 0, form.casco_months || 0),
    [form.casco_start, form.casco_months]
  );
  const roviDays = useMemo(
    () => daysLeft(form.rovinieta_start || undefined, 0, form.rovinieta_months || 0),
    [form.rovinieta_start, form.rovinieta_months]
  );

  const parkingDays = useMemo(
    () => daysLeft(form.parking_start || undefined, 0, form.parking_months || 0),
    [form.parking_start, form.parking_months]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listCars()
      .then((rows) => {
        if (!alive) return;
        setCars(rows || []);
      })
      .finally(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const onChange = <K extends keyof Car>(key: K, value: Car[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onPhotoPick(file: File) {
    if (!file) return;
    setPhotoUploadErr("");
    setPhotoUploading(true);
    try {
      const url = await uploadToR2(file);
      setForm((f) => ({ ...f, photo_url: url }));
      setPhotoEdit(false);
    } catch (e: any) {
      setPhotoUploadErr(e?.message || "Képfeltöltés sikertelen.");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = cleanForSave(form);
    const saved = form.id
      ? await updateCar(form.id, payload)
      : await createCar(payload);
    if (!saved) setError("Mentés sikertelen.");
    const rows = await listCars();
    setCars(rows);
    setSaving(false);
    setForm({ ...defaultForm });
    setPhotoEdit(false);
    setPhotoUploading(false);
    setPhotoUploadErr("");
    setShowForm(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteCar(id?: number) {
    if (!id || !Number.isFinite(id)) {
      setConfirmVariant("info");
      setConfirmTitle("Hiba");
      setConfirmMsg("Nincs azonosító ehhez a sorhoz, nem tudom törölni.");
      setConfirmAction(null);
      setConfirmOpen(true);
      return;
    }

    setConfirmVariant("confirm");
    setConfirmTitle("Végleges törlés");
    setConfirmMsg("Biztos törlöd? Ez nem visszavonható.");
    setConfirmAction({ kind: "delete", id });
    setConfirmOpen(true);
  }

  async function runConfirm() {
    const a = confirmAction;
    setConfirmOpen(false);
    setConfirmAction(null);
    if (!a) return;
    if (a.kind !== "delete") return;

    setMsg("");
    try {
      setDeletingId(a.id);
      const url = `${API}/cars/${a.id}`;
      let r = await fetch(url, { method: "DELETE", credentials: "include" });
      if (r.status === 204 || r.ok) {
        const rows = await listCars();
        setCars(rows);
        setMsg("Törölve.");
        return;
      }
      if (r.status === 405 || r.status === 404) {
        r = await fetch(url, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ _action: "delete" }),
        });
        if (r.ok) {
          const rows = await listCars();
          setCars(rows);
          setMsg("Törölve.");
          return;
        }
      }
      const txt = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} ${txt}`);
    } catch (e: any) {
      console.error(e);
      setConfirmVariant("info");
      setConfirmTitle("Törlés sikertelen");
      setConfirmMsg(String(e?.message || "ismeretlen hiba"));
      setConfirmAction(null);
      setConfirmOpen(true);
    } finally {
      setDeletingId(null);
    }
  }

  /* ---------- Derived ---------- */
  const enriched = useMemo(() => {
    return (cars || []).map((c) => {
      const years = normalizeItpYearsLike(c);
      const itp = daysLeft(justDate(c.itp_date), years || 1, 0);
      const rca = daysLeft(justDate(c.rca_date), 1, 0);
      const cas = daysLeft(justDate(c.casco_start), 0, c.casco_months || 0);
      const rov = daysLeft(justDate(c.rovinieta_start), 0, c.rovinieta_months || 0);
      const park = daysLeft(justDate(c.parking_start), 0, c.parking_months || 0);
      const minDays = Math.min(...[itp, rca, cas, rov, park].map((v) => (v == null ? 9999 : v)));
      const worst = levelFor(
        [itp, rca, cas, rov, park].reduce<null | number>((acc, v) => {
          const n = v == null ? null : v;
          if (acc == null) return n;
          if (n == null) return acc;
          return Math.min(acc, n);
        }, null)
      );
      const hasExpired = [itp, rca, cas, rov, park].some((v) => v != null && v < 0);
      const hasSoon = [itp, rca, cas, rov, park].some((v) => v != null && v >= 0 && v <= 5);
      return { ...c, itp, rca, cas, rov, park, minDays, worst, hasExpired, hasSoon };
    });
  }, [cars]);

  const metrics = useMemo(() => {
    const total = enriched.length;
    const soon = enriched.filter((x) => x.hasSoon).length;
    const expired = enriched.filter((x) => x.hasExpired).length;
    return { total, soon, expired };
  }, [enriched]);

  const filtered = useMemo(() => {
    let arr = [...enriched];
    if (alertsOnly) arr = arr.filter((x) => x.worst === "soon" || x.worst === "expired");
    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      arr = arr.filter(
        (x) =>
          (x.plate || "").toLowerCase().includes(qq) ||
          (x.make_model || "").toLowerCase().includes(qq) ||
          (x.vin || "").toLowerCase().includes(qq)
      );
    }
    // Üzemanyag + rendezés szűrők direkt kivéve (fölösleges a napi használathoz)
    arr.sort((a, b) => a.minDays - b.minDays);
    return arr;
  }, [enriched, q, alertsOnly]);

  const cssVars = { "--cupe-green": CUPE.green } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-4 sm:py-5" style={cssVars}>
      <style>{`
        .allin-select { color-scheme: dark; }
        .allin-select option { background: #354153; color: #fff; }
      `}</style>
      <div className="mx-auto max-w-[1500px] space-y-4">
      {/* Header */}
      <header className="sticky top-2 z-40 rounded-2xl border border-white/20 bg-[#303a4c]/96 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[250px] items-center gap-3 border-l-4 border-[#7bd7d4]/70 pl-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]">
              <CarFront className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">AllInFashion</div>
              <h1 className="mt-0.5 text-xl leading-tight">Járművek</h1>
              <div className="mt-0.5 text-[11px] text-white/48">Járműtörzs, okmányok és lejáratok kezelése</div>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/[0.07] px-3 text-xs text-white transition hover:bg-white/[0.11]"
              onClick={() => {
                window.location.hash = "#admincarexpenses";
              }}
            >
              <WalletCards className="h-4 w-4" /> Kiadások
            </Button>

            <Button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/40 !bg-[#2a8d8b] px-3 text-xs !text-white transition hover:!bg-[#319c99]"
              onClick={() => {
                setShowForm((s) => !s);
                if (!showForm) {
                  setForm({ ...defaultForm });
                  setPhotoEdit(false);
                  setPhotoUploading(false);
                  setPhotoUploadErr("");
                  setTimeout(
                    () =>
                      document
                        .getElementById("carForm")
                        ?.scrollIntoView({ behavior: "smooth" }),
                    50
                  );
                }
              }}
            >
              {showForm ? (
                <>
                  <X className="h-4 w-4" /> Űrlap bezárása
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4" /> Új jármű
                </>
              )}
            </Button>

            <Button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-3 text-xs text-white transition hover:bg-[#3e4d63]"
              onClick={() => { window.location.hash = "#allin"; }}
            >
              <Home className="h-4 w-4" /> Kezdőlap
            </Button>
          </div>
        </div>
      </header>

      {msg && (
        <div>
          <div className="flex items-center rounded-2xl border border-[#7bd7d4]/28 bg-[#174c55]/72 px-4 py-3 text-sm text-[#e5fffd]">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {msg}
          </div>
        </div>
      )}

      <main className="space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Kpi title="Összes autó" value={String(metrics.total)} hint="Nyilvántartott tétel" />
          <Kpi title="Közelgő lejárat" value={String(metrics.soon)} hint="≤ 5 nap" tone={metrics.soon > 0 ? "border-[#f6ca3c]/75 bg-[#f6ca3c]/14" : ""} />
          <Kpi title="Lejárt" value={String(metrics.expired)} hint="Azonnali intézkedés" tone={metrics.expired > 0 ? "border-[#b60e21]/75 bg-[#b60e21]/18" : ""} />
        </div>

        {/* Tools bar */}
        <Card className="overflow-visible rounded-2xl border border-white/14 bg-white/[0.06] text-white shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/36" />
                <Input
                  className="h-10 min-w-[280px] rounded-xl border border-white/18 !bg-[#3f4959] pl-9 !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                  placeholder="Keresés (rendszám, típus, VIN)"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              <label className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl border border-white/14 bg-white/[0.06] px-3 text-xs text-white/78 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#2a8d8b]"
                  checked={alertsOnly}
                  onChange={(e) => setAlertsOnly(e.target.checked)}
                />
                Csak problémás
              </label>

              <Button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-3 text-xs text-white transition hover:bg-[#3e4d63]"
                onClick={async () => {
                  setLoading(true);
                  const rows = await listCars();
                  setCars(rows);
                  setLoading(false);
                }}
              >
                <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Frissítés
              </Button>

              <div className="flex items-center gap-1 rounded-xl border border-white/14 bg-[#303a4c] p-1">
                <button
                  className={"h-8 px-3 rounded " + (view === "board" ? "bg-[#2a8d8b] text-white" : "text-white/55 hover:bg-white/[0.08]")}
                  onClick={() => setView("board")}
                  type="button"
                >
                  <LayoutGrid className="inline w-4 h-4 mr-1" /> Board
                </button>
                <button
                  className={"h-8 px-3 rounded " + (view === "list" ? "bg-[#2a8d8b] text-white" : "text-white/55 hover:bg-white/[0.08]")}
                  onClick={() => setView("list")}
                  type="button"
                >
                  <LayoutList className="inline w-4 h-4 mr-1" /> Lista
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content views */}
        {view === "board" ? (
          <BoardView rows={filtered} />
        ) : (
          <ListView
            rows={filtered}
            expandedDefault={filtered.length <= 10}
            onEdit={(car: any) => {
              setShowForm(true);
              setForm({
                ...car,
                itp_date: justDate(car.itp_date),
                itp_years: normalizeItpYearsLike(car),
                rca_date: justDate(car.rca_date),
                casco_start: justDate(car.casco_start),
                rovinieta_start: justDate(car.rovinieta_start),
                parking_start: justDate(car.parking_start),
                parking_months: Number(car.parking_months || 12),
              });
              setPhotoEdit(false);
              setPhotoUploading(false);
              setPhotoUploadErr("");
              setTimeout(
                () =>
                  document
                    .getElementById("carForm")
                    ?.scrollIntoView({ behavior: "smooth" }),
                50
              );
            }}
            deletingId={deletingId}
            onDelete={deleteCar}
          />
        )}

        {/* Form drawer */}
        <div id="carForm" className="mt-6">
          {showForm && (
            <Card className="overflow-hidden rounded-2xl border border-white/14 bg-white/[0.06] text-white shadow-sm">
              <div
                className="flex items-center justify-between border-b border-white/12 bg-[#404a5b] px-4 py-3 text-sm text-white md:text-base"
              >
                <div>
                  {form.id
                    ? `Autó szerkesztése: ${form.plate || "—"}${form.make_model ? " · " + form.make_model : ""}`
                    : "Új autó"}
                </div>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/18 bg-[#354153] text-white transition hover:bg-[#3e4d63]"
                  onClick={() => {
                    setShowForm(false);
                    setForm({ ...defaultForm });
                    setPhotoEdit(false);
                    setPhotoUploading(false);
                    setPhotoUploadErr("");
                  }}
                  aria-label="Bezár"
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <CardContent className="space-y-4 bg-transparent p-4 text-white md:p-5">
                <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 pt-1 text-[10px] uppercase tracking-[0.15em] text-white/42">
                    Alap adatok
                  </div>
                  <Field label="Fotó">
                    <div className="flex items-center gap-3">
                      <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white shadow-sm">
                        {form.photo_url ? (
                          <img src={form.photo_url} alt={`${form.plate || "Jármű"} előnézet`} className="h-full w-full object-contain p-1.5" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-white/35">
                            <PlusCircle className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 grid gap-2">
                        {!form.photo_url || photoEdit ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onPhotoPick(f);
                              }}
                              disabled={photoUploading}
                              className="block w-full text-sm text-white/55 file:mr-3 file:rounded-xl file:border file:border-white/14 file:bg-[#354153] file:px-3 file:py-2 file:text-white hover:file:bg-[#3e4d63]"
                            />
                            {form.photo_url && (
                              <button
                                type="button"
                                className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/14 bg-[#354153] px-3 text-white transition hover:bg-[#3e4d63]"
                                onClick={() => {
                                  setPhotoEdit(false);
                                  setPhotoUploadErr("");
                                }}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex h-9 w-fit items-center gap-2 rounded-xl border border-white/14 bg-[#354153] px-3 text-white transition hover:bg-[#3e4d63]"
                            onClick={() => setPhotoEdit(true)}
                            title="Másik kép feltöltése"
                          >
                            <Edit className="w-4 h-4" /> Kép módosítása
                          </button>
                        )}

                        {photoUploading && (
                          <div className="text-[11px] text-white/48">Feltöltés…</div>
                        )}
                        {photoUploadErr && (
                          <div className="text-[11px] text-red-600">{photoUploadErr}</div>
                        )}
                      </div>
                    </div>
                  </Field>
                  <Field label="Rendszám">
                    <Input
                      className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="ABC-123"
                      value={form.plate || ""}
                      onChange={(e) =>
                        onChange("plate", e.target.value.toUpperCase())
                      }
                    />
                  </Field>
                  <Field label="Márka / Típus">
                    <Input
                      className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="Volkswagen Passat"
                      value={form.make_model || ""}
                      onChange={(e) => onChange("make_model", e.target.value)}
                    />
                  </Field>

                  {/* ITP: dátum + év select jobbra */}
                  <div className="grid grid-cols-[1fr,auto] gap-2">
                    <Field label="ITP dátum">
                      <AllInDatePicker
                        value={form.itp_date || ""}
                        onChange={(value) => onChange("itp_date", value)}
                        ariaLabel="ITP dátum"
                      />
                    </Field>
                    <Field label="Érvényesség">
                      <select
                        className="allin-select h-9 rounded-xl border border-white/18 !bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                        value={form.itp_years || 1}
                        onChange={(e) => {
                          const y = Number(e.target.value) || 1;
                          setForm((f) => ({ ...f, itp_years: y, itp_months: y * 12 }));
                        }}
                      >
                        {[1, 2].map((y) => (
                          <option key={y} value={y}>
                            {y} év
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="RCA dátum">
                    <AllInDatePicker
                      value={form.rca_date || ""}
                      onChange={(value) => onChange("rca_date", value)}
                      ariaLabel="RCA dátum"
                    />
                  </Field>
                  {/* üres helykitöltő a rácsban */}
                  <div />

                  <div className="col-span-2 grid grid-cols-2 gap-3 -mt-1 text-[11px] text-white/48">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>ITP: {itpDays ?? "-"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>RCA: {rcaDays ?? "-"}</span>
                    </div>
                  </div>

                  <div className="col-span-2 mt-1 mb-1 border-t border-white/10" />
                  <div className="col-span-2 text-[10px] uppercase tracking-[0.15em] text-white/42">
                    Biztosítások, útdíjak és parkolás
                  </div>
                  <Field label="Casco kezdete">
                    <AllInDatePicker
                      value={form.casco_start || ""}
                      onChange={(value) => onChange("casco_start", value)}
                      ariaLabel="Casco kezdete"
                    />
                  </Field>
                  <Field label="Casco érvényesség">
                    <select
                      className="allin-select h-9 rounded-xl border border-white/18 !bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      value={form.casco_months || 12}
                      onChange={(e) =>
                        onChange("casco_months", Number(e.target.value))
                      }
                    >
                      {[
                        [1, "Havi"],
                        [3, "Negyedéves"],
                        [6, "Féléves"],
                        [12, "Éves"],
                      ].map(([m, labelText]) => (
                        <option key={m} value={m}>{labelText}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Rovinieta kezdete">
                    <AllInDatePicker
                      value={form.rovinieta_start || ""}
                      onChange={(value) => onChange("rovinieta_start", value)}
                      ariaLabel="Rovinieta kezdete"
                    />
                  </Field>
                  <Field label="Rovinieta érvényesség">
                    <select
                      className="allin-select h-9 rounded-xl border border-white/18 !bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      value={form.rovinieta_months || 12}
                      onChange={(e) =>
                        onChange("rovinieta_months", Number(e.target.value))
                      }
                    >
                      {[
                        [1, "Havi"],
                        [12, "Éves"],
                      ].map(([m, labelText]) => (
                        <option key={m} value={m}>{labelText}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Parkolási bérlet kezdete">
                    <AllInDatePicker
                      value={form.parking_start || ""}
                      onChange={(value) => onChange("parking_start", value)}
                      ariaLabel="Parkolási bérlet kezdete"
                    />
                  </Field>
                  <Field label="Parkolási bérlet érvényesség">
                    <select
                      className="allin-select h-9 rounded-xl border border-white/18 !bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      value={form.parking_months || 12}
                      onChange={(e) => onChange("parking_months", Number(e.target.value))}
                    >
                      {[
                        [1, "Havi"],
                        [3, "Negyedéves"],
                        [6, "Féléves"],
                        [12, "Éves"],
                      ].map(([m, labelText]) => (
                        <option key={m} value={m}>{labelText}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="col-span-2 -mt-1 grid grid-cols-1 gap-2 text-[11px] text-white/48 sm:grid-cols-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>Casco: {cascoDays ?? "-"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>Rovigneta: {roviDays ?? "-"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>Parkolás: {parkingDays ?? "-"}</span>
                    </div>
                  </div>

                  <div className="col-span-2 mt-1 mb-1 border-t border-white/10" />
                  <div className="col-span-2 text-[10px] uppercase tracking-[0.15em] text-white/42">
                    Azonosítók és műszaki
                  </div>
                  <Field label="VIN">
                    <Input
                      className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="WVWZZZ..."
                      value={form.vin || ""}
                      onChange={(e) => onChange("vin", e.target.value.toUpperCase())}
                    />
                  </Field>
                  <Field label="CIV">
                    <Input
                      className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="CIV..."
                      value={form.civ || ""}
                      onChange={(e) => onChange("civ", e.target.value)}
                    />
                  </Field>
                  <Field label="Szín">
                    <Input
                      className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="Fekete"
                      value={form.color || ""}
                      onChange={(e) => onChange("color", e.target.value)}
                    />
                  </Field>
                  <Field label="cm³">
                    <Input
                      type="number"
                      className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="1968"
                      value={form.engine_cc ?? ""}
                      onChange={(e) =>
                        onChange("engine_cc", Number(e.target.value) || undefined)
                      }
                    />
                  </Field>
                  <Field label="kW">
                    <Input
                      type="number"
                      className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="110"
                      value={form.power_kw ?? ""}
                      onChange={(e) =>
                        onChange("power_kw", Number(e.target.value) || undefined)
                      }
                    />
                  </Field>
                  <Field label="Össztömeg (kg)">
                    <Input
                      type="number"
                      className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="2100"
                      value={form.total_mass ?? ""}
                      onChange={(e) =>
                        onChange("total_mass", Number(e.target.value) || undefined)
                      }
                    />
                  </Field>
                  <Field label="Üzemanyag">
                    <Input
                      className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="Benzin / Diesel / Hibrid"
                      value={form.fuel || ""}
                      onChange={(e) => onChange("fuel", e.target.value)}
                    />
                  </Field>
                  <Field label="Gyártási év">
                    <Input
                      type="number"
                      className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="2018"
                      value={form.year ?? ""}
                      onChange={(e) =>
                        onChange("year", Number(e.target.value) || undefined)
                      }
                    />
                  </Field>

                  <div className="col-span-2 flex items-center justify-between gap-3 pt-1">
                    <Button
                      type="button"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-4 text-xs text-white transition hover:bg-[#3e4d63]"
                      onClick={() => {
                        setShowForm(false);
                        setForm({ ...defaultForm });
                        setPhotoEdit(false);
                        setPhotoUploading(false);
                        setPhotoUploadErr("");
                      }}
                    >
                      Bezár
                    </Button>
                    <div className="flex-1" />
                    {error && <div className="text-red-600 text-xs">{error}</div>}
                    <Button
                      type="submit"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/40 !bg-[#2a8d8b] px-4 text-xs !text-white transition hover:!bg-[#319c99]"
                      disabled={saving}
                    >
                      {saving ? (
                        "Mentés…"
                      ) : (
                        <>
                          <Save className="h-4 w-4" /> Mentés
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Confirm / Info modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/78 px-3 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-white/18 bg-[#4b5362] p-5 shadow-2xl">
            <div className="text-white font-medium">{confirmTitle}</div>
            <div className="text-white/70 text-sm mt-2 whitespace-pre-wrap">{confirmMsg}</div>
            <div className="mt-5 flex items-center justify-end gap-2">
              {confirmVariant === "confirm" && (
                <button
                  type="button"
                  className="h-10 rounded-xl border border-white/18 bg-[#354153] px-4 text-white transition hover:bg-[#3e4d63]"
                  onClick={() => setConfirmOpen(false)}
                >
                  Mégse
                </button>
              )}
              <button
                type="button"
                className={
                  confirmVariant === "confirm"
                    ? "h-10 rounded-xl bg-red-600 px-4 text-white transition hover:bg-red-500"
                    : "h-10 rounded-xl bg-[#2a8d8b] px-4 text-white transition hover:bg-[#319c99]"
                }
                onClick={confirmVariant === "confirm" ? runConfirm : () => setConfirmOpen(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/* ====== Auto mobile/desktop switch (cars) ====== */
export const AllInCarsDesktopPage = AllInCarsDesktop;

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia
      ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches
      : window.innerWidth <= breakpoint;
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia ? window.matchMedia(`(max-width: ${breakpoint}px)`) : null;
    const update = () => {
      const v = mq ? mq.matches : window.innerWidth <= breakpoint;
      setIsMobile(v);
    };

    update();
    if (!mq) {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    // Safari compatibility
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    // @ts-ignore
    mq.addListener(update);
    // @ts-ignore
    return () => mq.removeListener(update);
  }, [breakpoint]);

  return isMobile;
}

export default function AllInCarsAuto() {
  const isMobile = useIsMobile(768);
  return isMobile ? <AllInCarsMobile /> : <AllInCarsDesktop />;
}
