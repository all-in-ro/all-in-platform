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
  X,
  ChevronDown,
  ChevronUp,
  Edit,
  Trash2,
} from "lucide-react";

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

const API =
  (import.meta as any).env?.VITE_API_BASE || "https://all-in-platform.onrender.com/api";

// R2 upload endpoint tipikusan admin-vedelemmel fut (401 ha nincs megfelelo fejlec).
// Frontenden env-bol vesszuk, ugyanugy mint a tobbi admin oldal.
const ADMIN_SECRET = (import.meta as any).env?.VITE_ADMIN_SECRET || "";

const CUPE = {
  blue: "#344154",
  bgBlue: "#2E3A4A",
  green: "#108D8B",
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
  if (lvl === "soon") return "bg-amber-400 text-black border border-amber-900/20";
  if (lvl === "ok") return "bg-[var(--cupe-green)] text-white border border-emerald-900/30";
  return "bg-slate-600 text-slate-200 border border-slate-500/50";
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

async function uploadToR2(file: File, folder: string, name: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  fd.append("name", name);

  const r = await fetch(`${API}/uploads/r2`, {
    method: "POST",
    body: fd,
    headers: ADMIN_SECRET ? ({ "x-admin-secret": ADMIN_SECRET } as any) : undefined,
    credentials: "include",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data: any = await r.json().catch(() => ({}));
  const url =
    data?.url ||
    data?.public_url ||
    data?.publicUrl ||
    data?.result?.url ||
    data?.data?.url ||
    data?.data?.publicUrl;
  if (!url || typeof url !== "string") throw new Error("Nincs URL az upload válaszban.");
  return url;
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
      className={"px-2 py-[3px] rounded text-[11px] font-medium " + toneFor(lvl)}
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
  tone = "bg-white",
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className={"rounded-xl border-slate-300 text-slate-800 " + tone}>
      <CardContent className="p-3 md:p-3">
        <div className="text-[12px] text-slate-600">{title}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {hint && <div className="text-[11px] text-slate-600 mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[12px] text-slate-600 font-medium tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

/* ---------- Views ---------- */
function BoardView({ rows }: { rows: any[] }) {
  const colCls = "rounded-xl border border-slate-300 bg-white text-slate-800";
  const expiredRows = rows.filter((r) => r.hasExpired);
  const soonRows = rows.filter((r) => r.hasSoon);
  const okRows = rows.filter((r) => !r.hasExpired && !r.hasSoon);
  const renderCard = (c: any) => (
    <div
      key={String(c.id ?? c.plate)}
      className="rounded-lg bg-white border border-slate-300 p-3 text-slate-800"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="truncate">
          <div className="text-[#344154] text-[15px] font-bold leading-tight">
            {c.plate || "Ismeretlen"}
          </div>
          <div className="text-slate-700 text-[13px] truncate">
            {c.make_model || "—"}
          </div>
        </div>
        <div className="w-20 h-14 rounded bg-slate-700 overflow-hidden shrink-0 border border-slate-300">
          {c.photo_url ? (
            <img src={c.photo_url} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full grid place-items-center text-slate-600">
              <PlusCircle className="w-5 h-5" />
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-slate-300/60 my-2" />
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
        <div className="px-4 py-3 border-b border-slate-300 flex items-center gap-2">
          <Bell className="w-4 h-4" />
          <span>Lejárt</span>
        </div>
        <div className="p-3 grid gap-3">{expiredRows.map(renderCard)}</div>
      </div>
      <div className={colCls}>
        <div className="px-4 py-3 border-b border-slate-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>Közelgő</span>
        </div>
        <div className="p-3 grid gap-3">{soonRows.map(renderCard)}</div>
      </div>
      <div className={colCls}>
        <div className="px-4 py-3 border-b border-slate-300 flex items-center gap-2">
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
    <div className="rounded-xl border border-slate-300 bg-white text-slate-800 overflow-hidden">
      <div className="grid grid-cols-[1.2fr,1fr,1fr,1.6fr,180px] gap-0 text-[12px] px-4 py-2 bg-white text-slate-800 border-b border-slate-300 shadow-sm ">
        <div>Autó</div>
        <div className="text-center">ITP</div>
        <div className="text-center">RCA</div>
        <div className="text-center">Casco/Rovi</div>
        <div className="text-right pr-4 flex items-center justify-end gap-2 whitespace-nowrap">
          Műveletek
        </div>
      </div>
      <div className="divide-y divide-slate-200 pt-1">
        {rows.map((c) => {
          const key = String(c.id ?? c.plate ?? Math.random());
          const open = !!expanded[key];
          return (
            <div key={key} className="px-4 py-2.5 hover:bg-white">
              <div className="grid grid-cols-[1.2fr,1fr,1fr,1.6fr,180px] items-center gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-16 h-11 rounded bg-slate-700 overflow-hidden shrink-0 border border-slate-300">
                    {c.photo_url ? (
                      <img src={c.photo_url} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-slate-600">
                        <PlusCircle className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="truncate">
                    <div className="text-[#344154] text-[15px] font-bold leading-tight">
                      {c.plate || "Ismeretlen"}
                    </div>
                    <div className="text-slate-700 text-[13px] truncate">
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
                      className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
                      onClick={() => onEdit(c)}
                      type="button"
                      disabled={!!deletingId && deletingId === Number(c.id)}
                      aria-busy={deletingId === Number(c.id)}
                    >
                      <Edit className="w-4 h-4" /> Szerkesztés
                    </button>
                  )}
                  <button
                    className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
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
                  <div className="border-t border-slate-300/60 my-2" />
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-[12px] text-slate-600">
                    <div>
                      <span className="text-slate-600">VIN:</span> {c.vin || "—"}
                    </div>
                    <div>
                      <span className="text-slate-600">CIV:</span> {c.civ || "—"}
                    </div>
                    <div>
                      <span className="text-slate-600">Szín:</span> {c.color || "—"}
                    </div>
                    <div>
                      <span className="text-slate-600">cm³:</span> {c.engine_cc ?? "—"}
                    </div>
                    <div>
                      <span className="text-slate-600">kW/CP:</span>{" "}
                      {c.power_kw ?? "—"}
                      {c.power_kw ? ` / ${kwToCp(c.power_kw)}` : ""}
                    </div>
                    <div>
                      <span className="text-slate-600">Össztömeg:</span> {c.total_mass ?? "—"}
                    </div>
                    <div>
                      <span className="text-slate-600">Üzemanyag:</span> {c.fuel || "—"}
                    </div>
                    <div>
                      <span className="text-slate-600">Gyártási év:</span> {c.year ?? "—"}
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
          <div className="px-4 py-10 text-center text-slate-600">Nincs találat.</div>
        )}
      </div>
    </div>
  );
}

/* ---------- Main ---------- */
export default function AllInCars() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  const [photoEdit, setPhotoEdit] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadErr, setPhotoUploadErr] = useState<string>("");

  const [q, setQ] = useState("");
  const [fuel, setFuel] = useState<string>("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [sort, setSort] = useState<"urgency" | "plate" | "make">("urgency");
  const [view, setView] = useState<"list" | "board">("board");

  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
      const safePlate = (form.plate || "car").replace(/[^a-zA-Z0-9_-]+/g, "-");
      const ext = (file.name.split(".").pop() || "jpg").slice(0, 5).toLowerCase();
      const name = `${safePlate}-${Date.now()}.${ext}`;
      const folder = form.id ? `cars/${form.id}` : "cars/new";
      const url = await uploadToR2(file, folder, name);
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
      alert("Nincs azonosító ehhez a sorhoz, nem tudom törölni.");
      return;
    }
    const yes = window.confirm("Biztos törlöd?");
    if (!yes) return;
    setMsg("");
    try {
      setDeletingId(id);
      const url = `${API}/cars/${id}`;
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
      alert("Törlés sikertelen: " + (e?.message || "ismeretlen hiba"));
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
    if (fuel) arr = arr.filter((x) => (x.fuel || "").toLowerCase() === fuel.toLowerCase());
    if (sort === "plate") arr.sort((a, b) => (a.plate || "").localeCompare(b.plate || ""));
    else if (sort === "make") arr.sort((a, b) => (a.make_model || "").localeCompare(b.make_model || ""));
    else arr.sort((a, b) => a.minDays - b.minDays);
    return arr;
  }, [enriched, q, fuel, alertsOnly, sort]);

  const cssVars = { "--cupe-green": CUPE.green } as React.CSSProperties;

  return (
    <div className="min-h-screen" style={{ backgroundColor: CUPE.bgBlue, ...cssVars }}>
      {/* Header */}
      <div className="sticky top-0 z-10 shadow-md" style={{ backgroundColor: CUPE.blue }}>
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="text-white font-semibold">Autók nyílvántartása / Kiadások</div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="h-8 px-3 text-white"
              style={{ backgroundColor: CUPE.green }}
              onClick={() => {
                window.location.hash = "#allincarexpenses";
              }}
            >
              Kiadások
            </Button>

            <Button
              type="button"
              className="h-8 px-3 text-white"
              style={{ backgroundColor: CUPE.green }}
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
              {showForm ? "Űrlap elrejtése" : "Új autó"}
            </Button>

            <Button
              type="button"
              className="h-8 px-3 text-white"
              style={{ backgroundColor: CUPE.blue }}
              onClick={() => {
                window.location.hash = "#allinextras";
              }}
            >
              Egyebek
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-8 px-3 text-white border-white/40"
              onClick={() => (window.location.hash = "#allinadmin")}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#495465"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              Vissza
            </Button>
          </div>
        </div>
      </div>

      {msg && (
        <div className="mx-auto max-w-6xl px-4 mt-4">
          <div className="rounded-md border border-emerald-400/40 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
            {msg}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* KPI row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-4">
          <Kpi title="Összes autó" value={String(metrics.total)} hint="Nyilvántartott tétel" />
          <Kpi title="Közelgő lejárat" value={String(metrics.soon)} hint="≤ 5 nap" tone="bg-amber-500/20" />
          <Kpi title="Lejárt" value={String(metrics.expired)} hint="Azonnali intézkedés" tone="bg-red-600/20" />
        </div>

        {/* Tools bar */}
        <Card className="rounded-xl border-slate-300 bg-white text-slate-800 mb-4">
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
                <Input
                  className="pl-7 bg-slate-100 border-slate-300 text-slate-800 placeholder:text-slate-600"
                  placeholder="Keresés (rendszám, típus, VIN)"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              <select
                value={fuel}
                onChange={(e) => setFuel(e.target.value)}
                className="h-9 rounded-md bg-slate-100 border border-slate-300 text-slate-800 px-2"
              >
                <option value="">Üzemanyag: mind</option>
                <option value="Benzin">Benzin</option>
                <option value="Diesel">Diesel</option>
                <option value="Hibrid">Hibrid</option>
                <option value="Elektromos">Elektromos</option>
              </select>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="h-9 rounded-md bg-slate-100 border border-slate-300 text-slate-800 px-2"
              >
                <option value="urgency">Rendezés: lejárat</option>
                <option value="plate">Rendezés: rendszám</option>
                <option value="make">Rendezés: márka/típus</option>
              </select>

              <label className="ml-auto flex items-center gap-2 text-slate-600 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-white"
                  checked={alertsOnly}
                  onChange={(e) => setAlertsOnly(e.target.checked)}
                />
                Csak problémás
              </label>

              <Button
                type="button"
                variant="outline"
                className="h-9 px-3 text-white border-white/40 hover:bg-slate-50"
                onClick={async () => {
                  setLoading(true);
                  const rows = await listCars();
                  setCars(rows);
                  setLoading(false);
                }}
              >
                <RefreshCcw className="w-4 h-4 mr-1" /> Frissít
              </Button>

              <div className="flex items<center gap-1 rounded-md bg-white border border-slate-300 px-1 py-1">
                <button
                  className={"h-8 px-3 rounded " + (view === "board" ? "bg-slate-700 text-white" : "text-slate-600")}
                  onClick={() => setView("board")}
                  type="button"
                >
                  <LayoutGrid className="inline w-4 h-4 mr-1" /> Board
                </button>
                <button
                  className={"h-8 px-3 rounded " + (view === "list" ? "bg-slate-700 text-white" : "text-slate-600")}
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
            <Card className="rounded-xl overflow-hidden border-slate-300 bg-white">
              <div
                className="px-4 py-3 text-white text-sm md:text-base flex items-center justify-between"
                style={{ backgroundColor: CUPE.blue }}
              >
                <div>
                  {form.id
                    ? `Autó szerkesztése: ${form.plate || "—"}${form.make_model ? " · " + form.make_model : ""}`
                    : "Új autó"}
                </div>
                <button
                  className="text-slate-200 hover:text-white"
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
              <CardContent className="p-4 md:p-5 space-y-4 bg-white text-slate-800">
                <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 text-xs uppercase tracking-wider text-slate-600 pt-1">
                    Alap adatok
                  </div>
                  <Field label="Fotó">
                    <div className="flex items-center gap-3">
                      <div className="w-28 h-20 rounded-md overflow-hidden border border-slate-300 bg-slate-100 shrink-0">
                        {form.photo_url ? (
                          <img src={form.photo_url} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-slate-500">
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
                              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded file:border file:border-slate-300 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-800 hover:file:bg-slate-200"
                            />
                            {form.photo_url && (
                              <button
                                type="button"
                                className="h-9 px-3 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
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
                            className="h-9 px-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 w-fit"
                            onClick={() => setPhotoEdit(true)}
                            title="Másik kép feltöltése"
                          >
                            <Edit className="w-4 h-4" /> Kép módosítása
                          </button>
                        )}

                        {photoUploading && (
                          <div className="text-[11px] text-slate-600">Feltöltés…</div>
                        )}
                        {photoUploadErr && (
                          <div className="text-[11px] text-red-600">{photoUploadErr}</div>
                        )}
                      </div>
                    </div>
                  </Field>
                  <Field label="Rendszám">
                    <Input
                      className="bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-500"
                      placeholder="ABC-123"
                      value={form.plate || ""}
                      onChange={(e) =>
                        onChange("plate", e.target.value.toUpperCase())
                      }
                    />
                  </Field>
                  <Field label="Márka / Típus">
                    <Input
                      className="bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-500"
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
                        className="bg-slate-100 border-slate-300 text-slate-900"
                        value={form.itp_date || ""}
                        onChange={(e) =>
                          onChange("itp_date", justDate(e.target.value))
                        }
                      />
                    </Field>
                    <Field label="Érvényesség">
                      <select
                        className="h-9 rounded-md border border-slate-300 px-2 bg-slate-100 text-slate-900"
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
                      className="bg-slate-100 border-slate-300 text-slate-900"
                      value={form.rca_date || ""}
                      onChange={(e) =>
                        onChange("rca_date", justDate(e.target.value))
                      }
                    />
                  </Field>
                  {/* üres helykitöltő a rácsban */}
                  <div />

                  <div className="col-span-2 grid grid-cols-2 gap-3 -mt-1 text-[11px] text-slate-600">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>ITP: {itpDays ?? "-"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>RCA: {rcaDays ?? "-"}</span>
                    </div>
                  </div>

                  <div className="col-span-2 mt-1 mb-1 border-t border-slate-300/70" />
                  <div className="col-span-2 text-xs uppercase tracking-wider text-slate-600">
                    Biztosítások
                  </div>
                  <Field label="Casco kezdete">
                    <Input
                      type="date"
                      className="bg-slate-100 border-slate-300 text-slate-900"
                      value={form.casco_start || ""}
                      onChange={(e) =>
                        onChange("casco_start", justDate(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Casco hónap">
                    <select
                      className="h-9 rounded-md border border-slate-300 px-2 bg-slate-100 text-slate-900"
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
                      className="bg-slate-100 border-slate-300 text-slate-900"
                      value={form.rovinieta_start || ""}
                      onChange={(e) =>
                        onChange("rovinieta_start", justDate(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Rovinieta hónap">
                    <select
                      className="h-9 rounded-md border border-slate-300 px-2 bg-slate-100 text-slate-900"
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
                  <div className="col-span-2 -mt-1 text-[11px] text-slate-600 flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>Casco: {cascoDays ?? "-"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>Rovigneta: {roviDays ?? "-"}</span>
                    </div>
                  </div>

                  <div className="col-span-2 mt-1 mb-1 border-t border-slate-300/70" />
                  <div className="col-span-2 text-xs uppercase tracking-wider text-slate-600">
                    Azonosítók és műszaki
                  </div>
                  <Field label="VIN">
                    <Input
                      className="bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-500"
                      placeholder="WVWZZZ..."
                      value={form.vin || ""}
                      onChange={(e) => onChange("vin", e.target.value.toUpperCase())}
                    />
                  </Field>
                  <Field label="CIV">
                    <Input
                      className="bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-500"
                      placeholder="CIV..."
                      value={form.civ || ""}
                      onChange={(e) => onChange("civ", e.target.value)}
                    />
                  </Field>
                  <Field label="Szín">
                    <Input
                      className="bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-500"
                      placeholder="Fekete"
                      value={form.color || ""}
                      onChange={(e) => onChange("color", e.target.value)}
                    />
                  </Field>
                  <Field label="cm³">
                    <Input
                      type="number"
                      className="bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-500"
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
                      className="bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-500"
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
                      className="bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-500"
                      placeholder="2100"
                      value={form.total_mass ?? ""}
                      onChange={(e) =>
                        onChange("total_mass", Number(e.target.value) || undefined)
                      }
                    />
                  </Field>
                  <Field label="Üzemanyag">
                    <Input
                      className="bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-500"
                      placeholder="Benzin / Diesel / Hibrid"
                      value={form.fuel || ""}
                      onChange={(e) => onChange("fuel", e.target.value)}
                    />
                  </Field>
                  <Field label="Gyártási év">
                    <Input
                      type="number"
                      className="bg-slate-100 border-slate-300 text-slate-900 placeholder:text-slate-500"
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
                      variant="outline"
                      className="h-9 px-4 text-white border-white/40 hover:bg-slate-50"
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
                      className="h-9 px-4 text-white"
                      style={{ backgroundColor: CUPE.blue }}
                      disabled={saving}
                    >
                      {saving ? (
                        "Mentés…"
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-1" /> Mentés
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
