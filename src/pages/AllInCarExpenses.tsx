import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  PlusCircle,
  Save,
  RefreshCcw,
  Search,
  CalendarDays,
  Wrench,
  Edit,
  Trash2,
  X,
  ArrowLeft,
  CarFront,
  CheckCircle2,
  Home,
  ReceiptText,
} from "lucide-react";

import AllInCarExpensesMobile from "./AllInCarExpensesMobile";
/* ---------- Types ---------- */
type Car = {
  id: number;
  plate?: string;
  make_model?: string;
};

type CarExpense = {
  id?: number;
  car_id: number | null;
  date: string; // YYYY-MM-DD
  odometer_km?: number | null;
  category?: string;
  description?: string;
  cost?: number | null;
  currency?: string; // default RON
  vendor?: string;
  invoice_no?: string;
  created_at?: string;
  updated_at?: string;
};

// IMPORTANT: default to same-origin so session cookies work (Render/Cloudflare).
const API = (import.meta as any).env?.VITE_API_BASE || "/api";

const CUPE = {
  blue: "#303a4c",
  bgBlue: "#4b5362",
  green: "#2a8d8b",
} as const;

/* ---------- Helpers ---------- */
const justDate = (s?: string | null) => (s ? String(s).slice(0, 10) : "");

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

async function listCars(): Promise<Car[]> {
  try {
    const res = await fetchJSON(`${API}/cars`);
    return Array.isArray(res) ? res : res?.rows || [];
  } catch {
    return [];
  }
}

async function listExpenses(params: {
  car_id?: number | "";
  date_from?: string;
  date_to?: string;
  q?: string;
  category?: string;
}): Promise<CarExpense[]> {
  const usp = new URLSearchParams();
  if (params.car_id) usp.set("car_id", String(params.car_id));
  if (params.date_from) usp.set("date_from", params.date_from);
  if (params.date_to) usp.set("date_to", params.date_to);
  if (params.q) usp.set("q", params.q);
  if (params.category) usp.set("category", params.category);
  const url = `${API}/car-expenses?${usp.toString()}`;
  try {
    const res = await fetchJSON(url);
    return Array.isArray(res) ? res : res?.rows || [];
  } catch {
    return [];
  }
}

async function createExpense(payload: CarExpense): Promise<CarExpense | null> {
  try {
    return await fetchJSON(`${API}/car-expenses`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch {
    return null;
  }
}

async function updateExpense(id: number, payload: CarExpense): Promise<CarExpense | null> {
  try {
    return await fetchJSON(`${API}/car-expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } catch {
    return null;
  }
}

async function deleteExpense(id: number) {
  const url = `${API}/car-expenses/${id}`;
  let r = await fetch(url, { method: "DELETE", credentials: "include" });
  if (r.status === 204 || r.ok) return true;
  if (r.status === 405 || r.status === 404) {
    r = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "delete" }),
    });
    return r.ok;
  }
  return false;
}


/* ---------- UI subcomponents ---------- */
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

function Money({ value }: { value?: number | null }) {
  if (value == null) return <span>—</span>;
  return <span>{value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
}

/* ---------- Main Page ---------- */
function AllInCarExpenses() {
  const [cars, setCars] = useState<Car[]>([]);
  const [rows, setRows] = useState<CarExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  // Styled confirm/info modal (same as Users page) so we stop using window.confirm/alert.
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

  // Filters
  const [carId, setCarId] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const today = justDate(new Date().toISOString());
  const [dateFrom, setDateFrom] = useState<string>(today?.slice(0,7) + "-01");
  const [dateTo, setDateTo] = useState<string>(today);

  // Drawer/form state
  const emptyItem: CarExpense = {
    car_id: null,
    date: today,
    odometer_km: null,
    category: "",
    description: "",
    cost: null,
    currency: "RON",
    vendor: "",
    invoice_no: "",
  };
  const [openForm, setOpenForm] = useState(false);
  const [item, setItem] = useState<CarExpense>({ ...emptyItem });

  useEffect(() => {
    let alive = true;
    listCars().then((c) => alive && setCars(c));
    return () => {
      alive = false;
    };
  }, []);

  async function reload() {
    setLoading(true);
    const data = await listExpenses({
      car_id: carId === "" ? undefined : Number(carId),
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      q: q || undefined,
      category: category || undefined,
    });
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, [carId, dateFrom, dateTo, category]);

  const enriched = useMemo(() => {
    const carById = new Map<number, Car>();
    cars.forEach((c) => c.id && carById.set(c.id, c));
    return rows.map((r) => {
      const c = r.car_id ? carById.get(r.car_id) : undefined;
      return {
        ...r,
        plate: c?.plate || "",
        make_model: c?.make_model || "",
      };
    });
  }, [rows, cars]);

  const total = useMemo(() => {
    const sum = enriched.reduce((s, r) => s + (Number(r.cost) || 0), 0);
    return Number(sum.toFixed(2));
  }, [enriched]);

  const categories = useMemo(() => {
    const setC = new Set<string>();
    ["Kötelező szerviz", "Olajcsere", "Gumicsere", "Javítás", "Vizsga", "Egyéb"].forEach((x) => setC.add(x));
    enriched.forEach((r) => r.category && setC.add(r.category));
    return Array.from(setC);
  }, [enriched]);

  function onEdit(row?: CarExpense) {
    setItem({
      ...emptyItem,
      ...(row || {}),
      date: justDate(row?.date) || today,
    });
    setOpenForm(true);
    setTimeout(() => {
      document.getElementById("expenseForm")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload: CarExpense = {
      ...item,
      date: justDate(item.date),
      car_id: item.car_id ? Number(item.car_id) : null,
      odometer_km: item.odometer_km == null || item.odometer_km === ("" as any) ? null : Number(item.odometer_km),
      cost: item.cost == null || item.cost === ("" as any) ? null : Number(item.cost),
    };
    const ok = item.id
      ? await updateExpense(Number(item.id), payload)
      : await createExpense(payload);
    if (!ok) setError("Mentés sikertelen.");
    await reload();
    setSaving(false);
    setOpenForm(false);
    setItem({ ...emptyItem });
    setMsg("Mentve.");
    setTimeout(() => setMsg(""), 2000);
  }

  async function onDelete(id?: number) {
    if (!id) {
      setConfirmVariant("info");
      setConfirmTitle("Hiba");
      setConfirmMsg("Nincs azonosító ehhez a sorhoz, nem tudom törölni.");
      setConfirmAction(null);
      setConfirmOpen(true);
      return;
    }

    setConfirmVariant("confirm");
    setConfirmTitle("Végleges törlés");
    setConfirmMsg("Biztos törlöd ezt a tételt? Ez nem visszavonható.");
    setConfirmAction({ kind: "delete", id });
    setConfirmOpen(true);
  }

  async function runConfirm() {
    const a = confirmAction;
    setConfirmOpen(false);
    setConfirmAction(null);
    if (!a) return;
    if (a.kind !== "delete") return;

    const ok = await deleteExpense(a.id);
    if (!ok) {
      setConfirmVariant("info");
      setConfirmTitle("Törlés sikertelen");
      setConfirmMsg("A tételt nem sikerült törölni.");
      setConfirmAction(null);
      setConfirmOpen(true);
      return;
    }
    await reload();
    setMsg("Törölve.");
    setTimeout(() => setMsg(""), 2000);
  }


  const cssVars = { "--cupe-green": CUPE.green } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-4 sm:py-5" style={cssVars}>
      <style>{`
        input[type="date"].allin-date {
          color-scheme: dark !important;
          background-color: #3f4959 !important;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }
        input[type="date"].allin-date::-webkit-calendar-picker-indicator {
          filter: invert(1) brightness(1.8);
          opacity: 0.82;
          cursor: pointer;
        }
        .allin-select { color-scheme: dark; }
        .allin-select option { background: #354153; color: #fff; }
      `}</style>
      <div className="mx-auto max-w-[1500px] space-y-4">
      {/* Header */}
      <header className="sticky top-2 z-40 rounded-2xl border border-white/20 bg-[#303a4c]/96 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[250px] items-center gap-3 border-l-4 border-[#7bd7d4]/70 pl-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]">
              <ReceiptText className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">AllInFashion</div>
              <h1 className="mt-0.5 text-xl leading-tight">Járműkiadások</h1>
              <div className="mt-0.5 text-[11px] text-white/48">Javítások, szervizek és költségek nyilvántartása</div>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/40 !bg-[#2a8d8b] px-3 text-xs !text-white transition hover:!bg-[#319c99]"
              onClick={() => onEdit()}
            >
              <PlusCircle className="h-4 w-4" /> Új tétel
            </Button>
            <Button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/[0.07] px-3 text-xs text-white transition hover:bg-white/[0.11]"
              onClick={() => { window.location.hash = "#admincars"; }}
            >
              <CarFront className="h-4 w-4" /> Járművek
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
        {/* Filters & tools */}
        <Card className="overflow-visible rounded-2xl border border-white/14 bg-white/[0.06] text-white shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/36" />
                <Input
                  className="h-10 min-w-[280px] rounded-xl border border-white/18 !bg-[#3f4959] pl-9 !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                  placeholder="Keresés (leírás, számla, beszállító)"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") reload();
                  }}
                />
              </div>

              <select
                value={carId}
                onChange={(e) => setCarId(e.target.value === "" ? "" : Number(e.target.value))}
                className="allin-select h-10 rounded-xl border border-white/18 !bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
              >
                <option value="">Autó: mind</option>
                {cars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.plate} — {c.make_model}
                  </option>
                ))}
              </select>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="allin-select h-10 rounded-xl border border-white/18 !bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
              >
                <option value="">Kategória: mind</option>
                {["Kötelező szerviz", "Olajcsere", "Gumicsere", "Javítás", "Vizsga", "Egyéb"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  className="allin-date h-10 rounded-xl border-white/18 !bg-[#3f4959] !text-white focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(justDate(e.target.value))}
                />
                <span className="text-white/35 text-sm">→</span>
                <Input
                  type="date"
                  className="allin-date h-10 rounded-xl border-white/18 !bg-[#3f4959] !text-white focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                  value={dateTo}
                  onChange={(e) => setDateTo(justDate(e.target.value))}
                />
              </div>

              <Button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-3 text-xs text-white transition hover:bg-[#3e4d63]"
                onClick={reload}
                disabled={loading}
              >
                <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Szűrés
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Totals */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {/* NOTE: div-et hasznalunk, hogy dark theme ne tudja felulirni a feher kartya hatteret */}
          <div className="rounded-2xl border border-white/14 bg-white/[0.06] text-white shadow-sm">
            <div className="p-3.5 md:p-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Összes tétel</div>
              <div className="mt-2 text-2xl font-normal text-white">{enriched.length}</div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/14 bg-white/[0.06] text-white shadow-sm">
            <div className="p-3.5 md:p-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Időszak</div>
              <div className="text-sm">{dateFrom} → {dateTo}</div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/14 bg-white/[0.06] text-white shadow-sm">
            <div className="p-3.5 md:p-4">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Összeg (RON)</div>
              <div className="mt-2 text-2xl font-normal text-white"><Money value={total} /></div>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="overflow-x-auto rounded-2xl border border-white/14 bg-white/[0.055] text-white shadow-sm">
          {/* HEADER: fixed widths + centered labels */}
          <div className="grid min-w-[1030px] grid-cols-[115px,160px,100px,120px,minmax(220px,1fr),170px,110px] items-center border-b border-white/12 bg-[#303a4c] px-4 py-2.5 text-[10px] uppercase tracking-[0.08em] text-white/55">
            <div className="text-center">Dátum</div>
            <div className="text-center">Autó</div>
            <div className="text-center pl-6">km óra</div>
            <div className="text-center pl-10">Kategória</div>
            <div className="text-center">Leírás</div>
            <div className="text-left pl-2">Összeg</div>
            <div className="text-right pr-2"></div>
          </div>
          <div className="min-w-[1030px] divide-y divide-white/10">
            {enriched
              .filter((r) => {
                if (!q.trim()) return true;
                const qq = q.trim().toLowerCase();
                return (
                  (r.description || "").toLowerCase().includes(qq) ||
                  (r.vendor || "").toLowerCase().includes(qq) ||
                  (r.invoice_no || "").toLowerCase().includes(qq)
                );
              })
              .map((r) => (
                <div key={r.id || Math.random()} className="px-4 py-2.5 transition hover:bg-white/[0.035]">
                  {/* ROW: match header grid exactly; center content */}
                  <div className="grid grid-cols-[115px,160px,100px,120px,minmax(220px,1fr),180px,110px] items-center gap-2 h-[36px]">
                    <div className="flex items-center justify-end gap-2 pr-2">
                      <CalendarDays className="h-4 w-4 text-white/38" />
                      <span>{justDate(r.date)}</span>
                    </div>
                    <div className="truncate text-center">
                      <div className="truncate font-medium text-white">{r.plate || "Ismeretlen"}</div>
                      <div className="truncate text-[11px] text-white/45">{r.make_model || "—"}</div>
                    </div>
                    <div className="grid place-items-center text-center h-[36px] m-0 p-0">{r.odometer_km ? r.odometer_km : "—"}</div>
                    <div className="flex items-center justify-center gap-2 min-h-[24px]">
                      <Wrench className="h-4 w-4 text-white/38" />
                      <span>{r.category || "—"}</span>
                    </div>
                    <div className="truncate text-center">{r.description || "—"}</div>
                    <div className="font-medium text-left pl-2"><Money value={r.cost} /> {r.currency || ""}</div>
                    <div className="flex items-center justify-end gap-2 pr-2">
                      <button
                        className="inline-flex h-8 items-center gap-1 rounded-xl border border-white/14 bg-white/[0.06] px-2.5 text-[11px] text-white/78 transition hover:bg-white/[0.11] hover:text-white"
                        onClick={() => onEdit(r)}
                        type="button"
                      >
                        <Edit className="w-4 h-4" /> Szerkeszt
                      </button>
                      <button
  type="button"
  onClick={() => {
    onDelete(r.id);
  }}
  className="flex items-center justify-center gap-1 text-white text-[12px] font-medium rounded-[4px] shadow-sm"
  style={{ backgroundColor: '#b60e21', height: '30px', padding: '0 10px', borderRadius: '4px' }}
>
  <Trash2 className="w-4 h-4 text-white" />
  <span>Törlés</span>
</button>
                    </div>
                  </div>
                </div>
              ))}
            {!enriched.length && (
              <div className="px-4 py-10 text-center text-white/45">Nincs találat.</div>
            )}
          </div>
        </div>

        {/* Drawer */}
        {openForm && (
          <Card className="overflow-hidden rounded-2xl border border-white/14 bg-white/[0.06] text-white shadow-sm" id="expenseForm">
            <div
              className="flex items-center justify-between border-b border-white/12 bg-[#404a5b] px-4 py-3 text-sm text-white md:text-base"
            >
              <div>{item.id ? "Tétel szerkesztése" : "Új tétel"}</div>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/18 bg-[#354153] text-white transition hover:bg-[#3e4d63]"
                onClick={() => {
                  setOpenForm(false);
                  setItem({ ...emptyItem });
                }}
                aria-label="Bezár"
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <CardContent className="space-y-4 bg-transparent p-4 text-white md:p-5">
              <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
                <Field label="Autó">
                  <select
                    className="allin-select h-10 rounded-xl border border-white/18 !bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                    value={item.car_id ?? ""}
                    onChange={(e) => setItem((s) => ({ ...s, car_id: e.target.value === "" ? null : Number(e.target.value) }))}
                    required
                  >
                    <option value="">Válassz…</option>
                    {cars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.plate} — {c.make_model}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Dátum">
                  <Input
                    type="date"
                    className="allin-date rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                    value={item.date || ""}
                    onChange={(e) => setItem((s) => ({ ...s, date: justDate(e.target.value) }))}
                    required
                  />
                </Field>
                <Field label="km óra állás">
                  <Input
                    type="number"
                    className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                    value={item.odometer_km ?? ""}
                    onChange={(e) => setItem((s) => ({ ...s, odometer_km: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="pl. 156000"
                  />
                </Field>
                <Field label="Kategória">
                  <select
                    className="allin-select h-10 rounded-xl border border-white/18 !bg-[#3f4959] px-3 text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                    value={item.category || ""}
                    onChange={(e) => setItem((s) => ({ ...s, category: e.target.value }))}
                  >
                    <option value="">—</option>
                    <option>Kötelező szerviz</option>
                    <option>Olajcsere</option>
                    <option>Gumicsere</option>
                    <option>Javítás</option>
                    <option>Vizsga</option>
                    <option>Egyéb</option>
                  </select>
                </Field>
                <Field label="Leírás">
                  <Input
                    className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                    value={item.description || ""}
                    onChange={(e) => setItem((s) => ({ ...s, description: e.target.value }))}
                    placeholder="Munkalap, tételes leírás…"
                  />
                </Field>
                <Field label="Összeg">
                  <Input
                    type="number"
                    step="0.01"
                    className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                    value={item.cost ?? ""}
                    onChange={(e) => setItem((s) => ({ ...s, cost: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Pénznem">
                  <Input
                    className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                    value={item.currency || "RON"}
                    onChange={(e) => setItem((s) => ({ ...s, currency: e.target.value }))}
                    placeholder="RON"
                  />
                </Field>
                <Field label="Beszállító / Szerviz">
                  <Input
                    className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                    value={item.vendor || ""}
                    onChange={(e) => setItem((s) => ({ ...s, vendor: e.target.value }))}
                    placeholder="Szerviz neve"
                  />
                </Field>
                <Field label="Számla száma">
                  <Input
                    className="rounded-xl border-white/18 !bg-[#3f4959] !text-white placeholder:text-white/36 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18"
                    value={item.invoice_no || ""}
                    onChange={(e) => setItem((s) => ({ ...s, invoice_no: e.target.value }))}
                    placeholder="Opció"
                  />
                </Field>

                <div className="col-span-2 flex items-center justify-between gap-3 pt-1">
                  <Button
                    type="button"
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-4 text-xs text-white transition hover:bg-[#3e4d63]"
                    onClick={() => {
                      setOpenForm(false);
                      setItem({ ...emptyItem });
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


/* ====== Auto mobile/desktop switch (car expenses) ====== */
export const AllInCarExpensesDesktop = AllInCarExpenses;

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth <= breakpoint
  );
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

export default function AllInCarExpensesAuto() {
  const isMobile = useIsMobile(768);
  return isMobile ? <AllInCarExpensesMobile /> : <AllInCarExpensesDesktop />;
}
