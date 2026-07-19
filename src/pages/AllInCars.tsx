import React, { useEffect, useMemo, useState } from "react";
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
  const dateKeys = ["itp_date","rca_date","casco_start","rovinieta_start"];
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
    if (["engine_cc","power_kw","total_mass","year","casco_months","rovinieta_months","itp_years","itp_months"].includes(k)) {
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
  if (lvl === "expired") return "bg-[#b90f1e] text-white border border-[#b90f1e]/50";
  if (lvl === "soon") return "bg-amber-400/90 text-[#241a00] border border-amber-200/35";
  if (lvl === "ok") return "bg-[#2a8d8b] text-white border border-[#7bd7d4]/35";
  return "bg-[#354153] text-white/65 border border-white/14";
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
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/14 bg-white/[0.07]">
          {c.photo_url ? (
            <img src={c.photo_url} className="max-w-full max-h-full object-contain" />
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
        {c.rovinieta_start && c.rov != null && (
          <Chip label="Rovigneta" days={c.rov} />
        )}
      </div>
    </div>
  );
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className={colCls}>
        <div className="flex items-center gap-2 border-b border-white/12 bg-[#404a5b] px-4 py-3 text-sm text-white">
          <Bell className="w-4 h-4" />
          <span>Lejárt</span>
        </div>
        <div className="p-3 grid gap-3">{expiredRows.map(renderCard)}</div>
      </div>
      <div className={colCls}>
        <div className="flex items-center gap-2 border-b border-white/12 bg-[#404a5b] px-4 py-3 text-sm text-white">
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
      <div className="grid grid-cols-[1.2fr,1fr,1fr,1.6fr,180px] gap-0 border-b border-white/12 bg-[#303a4c] px-4 py-2.5 text-[10px] uppercase tracking-[0.09em] text-white/55">
        <div>Autó</div>
        <div className="text-center">ITP</div>
        <div className="text-center">RCA</div>
        <div className="text-center">Casco/Rovi</div>
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
              <div className="grid grid-cols-[1.2fr,1fr,1fr,1.6fr,180px] items-center gap-2">
                <div className="flex items-center gap-3 min-w-0">
	                  <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/14 bg-white/[0.07]">
	                    {c.photo_url ? (
	                      <img src={c.photo_url} className="max-w-full max-h-full object-contain" />
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
                  {c.rovinieta_start && c.rov != null && (
                    <Chip label="Rovigneta" days={c.rov} />
                  )}
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
      const minDays = Math.min(...[itp, rca, cas, rov].map((v) => (v == null ? 9999 : v)));
      const worst = levelFor(
        [itp, rca, cas, rov].reduce<null | number>((acc, v) => {
          const n = v == null ? null : v;
          if (acc == null) return n;
          if (n == null) return acc;
          return Math.min(acc, n);
        }, null)
      );
      const hasExpired = [itp, rca, cas, rov].some((v) => v != null && v < 0);
      const hasSoon = [itp, rca, cas, rov].some((v) => v != null && v >= 0 && v <= 5);
      return { ...c, itp, rca, cas, rov, minDays, worst, hasExpired, hasSoon };
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
      <style>{`input[type="date"]{color-scheme:dark}.allin-select{color-scheme:dark}.allin-select option{background:#354153;color:#fff}`}</style>
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
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/40 bg-[#2a8d8b] px-3 text-xs text-white transition hover:bg-[#319c99]"
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
              onClick={() => { window.location.hash = "#allinadmin"; }}
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
          <Kpi title="Közelgő lejárat" value={String(metrics.soon)} hint="≤ 5 nap" />
          <Kpi title="Lejárt" value={String(metrics.expired)} hint="Azonnali intézkedés" />
        </div>

        {/* Tools bar */}
        <Card className="overflow-visible rounded-2xl border border-white/14 bg-white/[0.06] text-white shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/36" />
                <Input
                  className="h-10 min-w-[280px] rounded-xl border border-white/18 bg-[#3f4959] pl-9 text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
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
                      <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-white/14 bg-white/[0.07]">
                        {form.photo_url ? (
                          <img src={form.photo_url} className="w-full h-full object-cover" />
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
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="ABC-123"
                      value={form.plate || ""}
                      onChange={(e) =>
                        onChange("plate", e.target.value.toUpperCase())
                      }
                    />
                  </Field>
                  <Field label="Márka / Típus">
                    <Input
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="Volkswagen Passat"
                      value={form.make_model || ""}
                      onChange={(e) => onChange("make_model", e.target.value)}
                    />
                  </Field>

                  {/* ITP: dátum + év select jobbra */}
                  <div className="grid grid-cols-[1fr,auto] gap-2">
                    <Field label="ITP dátum">
                      <Input
                        type="date"
                        className="rounded-xl border-white/18 bg-[#3f4959] text-white focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                        value={form.itp_date || ""}
                        onChange={(e) =>
                          onChange("itp_date", justDate(e.target.value))
                        }
                      />
                    </Field>
                    <Field label="Érvényesség">
                      <select
                        className="allin-select h-9 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
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
                    <Input
                      type="date"
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      value={form.rca_date || ""}
                      onChange={(e) =>
                        onChange("rca_date", justDate(e.target.value))
                      }
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
                    Biztosítások
                  </div>
                  <Field label="Casco kezdete">
                    <Input
                      type="date"
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      value={form.casco_start || ""}
                      onChange={(e) =>
                        onChange("casco_start", justDate(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Casco hónap">
                    <select
                      className="allin-select h-9 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      value={form.casco_months || 12}
                      onChange={(e) =>
                        onChange("casco_months", Number(e.target.value))
                      }
                    >
                      {[1, 3, 6, 12].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Rovinieta kezdete">
                    <Input
                      type="date"
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      value={form.rovinieta_start || ""}
                      onChange={(e) =>
                        onChange("rovinieta_start", justDate(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Rovinieta hónap">
                    <select
                      className="allin-select h-9 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      value={form.rovinieta_months || 12}
                      onChange={(e) =>
                        onChange("rovinieta_months", Number(e.target.value))
                      }
                    >
                      {[1, 12].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="col-span-2 -mt-1 text-[11px] text-white/48 flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>Casco: {cascoDays ?? "-"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>Rovigneta: {roviDays ?? "-"}</span>
                    </div>
                  </div>

                  <div className="col-span-2 mt-1 mb-1 border-t border-white/10" />
                  <div className="col-span-2 text-[10px] uppercase tracking-[0.15em] text-white/42">
                    Azonosítók és műszaki
                  </div>
                  <Field label="VIN">
                    <Input
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="WVWZZZ..."
                      value={form.vin || ""}
                      onChange={(e) => onChange("vin", e.target.value.toUpperCase())}
                    />
                  </Field>
                  <Field label="CIV">
                    <Input
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="CIV..."
                      value={form.civ || ""}
                      onChange={(e) => onChange("civ", e.target.value)}
                    />
                  </Field>
                  <Field label="Szín">
                    <Input
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="Fekete"
                      value={form.color || ""}
                      onChange={(e) => onChange("color", e.target.value)}
                    />
                  </Field>
                  <Field label="cm³">
                    <Input
                      type="number"
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
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
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
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
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="2100"
                      value={form.total_mass ?? ""}
                      onChange={(e) =>
                        onChange("total_mass", Number(e.target.value) || undefined)
                      }
                    />
                  </Field>
                  <Field label="Üzemanyag">
                    <Input
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                      placeholder="Benzin / Diesel / Hibrid"
                      value={form.fuel || ""}
                      onChange={(e) => onChange("fuel", e.target.value)}
                    />
                  </Field>
                  <Field label="Gyártási év">
                    <Input
                      type="number"
                      className="rounded-xl border-white/18 bg-[#3f4959] text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
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
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/40 bg-[#2a8d8b] px-4 text-xs text-white transition hover:bg-[#319c99]"
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
