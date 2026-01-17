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
  FileSpreadsheet,
  Edit,
  Trash2,
  X,
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
  blue: "#344154",
  bgBlue: "#2E3A4A",
  green: "#108D8B",
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

/* ---------- CSV ---------- */
function toCSV(rows: any[]) {
  const cols = [
    "date",
    "plate",
    "make_model",
    "odometer_km",
    "category",
    "description",
    "cost",
    "currency",
    "vendor",
    "invoice_no",
  ];
  const header = cols.join(",");
  const lines = rows.map((r) =>
    cols
      .map((k) => {
        const v = r[k] == null ? "" : String(r[k]).replace(/"/g, '""');
        return /[",\n]/.test(v) ? `"${v}"` : v;
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- UI subcomponents ---------- */
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

  function exportCSV() {
    const csv = toCSV(enriched);
    downloadCSV(`auto-kiadasok_${dateFrom}_to_${dateTo}.csv`, csv);
  }

  const cssVars = { "--cupe-green": CUPE.green } as React.CSSProperties;

  return (
    <div className="min-h-screen" style={{ backgroundColor: CUPE.bgBlue, ...cssVars }}>
      {/* Header */}
      <div className="sticky top-0 z-10 shadow-md" style={{ backgroundColor: CUPE.blue }}>
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="text-white font-semibold">Autó kiadások - Javítások</div>
          <div className="flex items-center gap-2">
            <Button
  type="button"
  variant="outline"
  className="h-8 px-3 text-white border-white/40"
  onClick={() => window.history.back()}
  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#495465"; }}
  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
>
  Vissza
</Button>
            <Button
              type="button"
              className="h-8 px-3 text-white"
              style={{ backgroundColor: CUPE.green }}
              onClick={() => onEdit()}
            >
              <PlusCircle className="w-4 h-4 mr-1" /> Új tétel
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
        {/* Filters & tools */}
        <Card className="rounded-xl border-slate-300 bg-white text-slate-800 mb-4">
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
                <Input
                  className="pl-7 bg-white border-slate-300 text-slate-800 placeholder:text-slate-600"
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
                className="h-9 rounded-md bg-white border border-slate-300 text-slate-800 px-2"
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
                className="h-9 rounded-md bg-white border border-slate-300 text-slate-800 px-2"
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
                  className="bg-white border-slate-300 text-slate-800"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(justDate(e.target.value))}
                />
                <span className="text-slate-500 text-sm">→</span>
                <Input
                  type="date"
                  className="bg-white border-slate-300 text-slate-800"
                  value={dateTo}
                  onChange={(e) => setDateTo(justDate(e.target.value))}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-9 px-3 text-white border-white/40 hover:bg-slate-50"
                onClick={reload}
                disabled={loading}
              >
                <RefreshCcw className="w-4 h-4 mr-1" /> Szűrés
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-9 px-3 text-white border-white/40 hover:bg-slate-50"
                onClick={exportCSV}
              >
                <FileSpreadsheet className="w-4 h-4 mr-1" /> CSV export
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Totals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-4">
          <Card className="rounded-xl border-slate-300 bg-white text-slate-800">
            <CardContent className="p-3 md:p-3">
              <div className="text-[12px] text-slate-600">Összes tétel</div>
              <div className="text-2xl font-semibold">{enriched.length}</div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-slate-300 bg-white text-slate-800">
            <CardContent className="p-3 md:p-3">
              <div className="text-[12px] text-slate-600">Időszak</div>
              <div className="text-sm">{dateFrom} → {dateTo}</div>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-slate-300 bg-white text-slate-800">
            <CardContent className="p-3 md:p-3">
              <div className="text-[12px] text-slate-600">Összeg (RON)</div>
              <div className="text-2xl font-semibold"><Money value={total} /></div>
            </CardContent>
          </Card>
        </div>

        {/* List */}
        <div className="rounded-xl border border-slate-300 bg-white text-slate-800 overflow-hidden">
          {/* HEADER: fixed widths + centered labels */}
          <div className="grid grid-cols-[115px,160px,100px,120px,minmax(220px,1fr),170px,110px] items-center text-[12px] px-4 py-2.5 bg-white text-slate-800 border-b border-slate-300 shadow-sm h-[36px] items-center">
            <div className="text-center">Dátum</div>
            <div className="text-center">Autó</div>
            <div className="text-center pl-6">km óra</div>
            <div className="text-center pl-10">Kategória</div>
            <div className="text-center">Leírás</div>
            <div className="text-left pl-2">Összeg</div>
            <div className="text-right pr-2"></div>
          </div>
          <div className="divide-y divide-slate-200">
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
                <div key={r.id || Math.random()} className="px-4 py-2.5">
                  {/* ROW: match header grid exactly; center content */}
                  <div className="grid grid-cols-[115px,160px,100px,120px,minmax(220px,1fr),180px,110px] items-center gap-2 h-[36px]">
                    <div className="flex items-center justify-end gap-2 pr-2">
                      <CalendarDays className="w-4 h-4 text-slate-600" />
                      <span>{justDate(r.date)}</span>
                    </div>
                    <div className="truncate text-center">
                      <div className="font-semibold text-[#344154] truncate">{r.plate || "Ismeretlen"}</div>
                      <div className="text-[12px] text-slate-600 truncate">{r.make_model || "—"}</div>
                    </div>
                    <div className="grid place-items-center text-center h-[36px] m-0 p-0">{r.odometer_km ? r.odometer_km : "—"}</div>
                    <div className="flex items-center justify-center gap-2 min-h-[24px]">
                      <Wrench className="w-4 h-4 text-slate-600" />
                      <span>{r.category || "—"}</span>
                    </div>
                    <div className="truncate text-center">{r.description || "—"}</div>
                    <div className="font-medium text-left pl-2"><Money value={r.cost} /> {r.currency || ""}</div>
                    <div className="flex items-center justify-end gap-2 pr-2">
                      <button
                        className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
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
              <div className="px-4 py-10 text-center text-slate-600">Nincs találat.</div>
            )}
          </div>
        </div>

        {/* Drawer */}
        {openForm && (
          <Card className="rounded-xl overflow-hidden border-slate-300 bg-white mt-6" id="expenseForm">
            <div
              className="px-4 py-3 text-white text-sm md:text-base flex items-center justify-between"
              style={{ backgroundColor: CUPE.blue }}
            >
              <div>{item.id ? "Tétel szerkesztése" : "Új tétel"}</div>
              <button
                className="text-slate-200 hover:text-white"
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
            <CardContent className="p-4 md:p-5 space-y-4 bg-white text-slate-800">
              <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
                <Field label="Autó">
                  <select
                    className="h-9 rounded-md border border-slate-300 px-2 bg-white"
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
                    className="bg-white"
                    value={item.date || ""}
                    onChange={(e) => setItem((s) => ({ ...s, date: justDate(e.target.value) }))}
                    required
                  />
                </Field>
                <Field label="km óra állás">
                  <Input
                    type="number"
                    className="bg-white"
                    value={item.odometer_km ?? ""}
                    onChange={(e) => setItem((s) => ({ ...s, odometer_km: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="pl. 156000"
                  />
                </Field>
                <Field label="Kategória">
                  <select
                    className="h-9 rounded-md border border-slate-300 px-2 bg-white"
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
                    className="bg-white"
                    value={item.description || ""}
                    onChange={(e) => setItem((s) => ({ ...s, description: e.target.value }))}
                    placeholder="Munkalap, tételes leírás…"
                  />
                </Field>
                <Field label="Összeg">
                  <Input
                    type="number"
                    step="0.01"
                    className="bg-white"
                    value={item.cost ?? ""}
                    onChange={(e) => setItem((s) => ({ ...s, cost: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Pénznem">
                  <Input
                    className="bg-white"
                    value={item.currency || "RON"}
                    onChange={(e) => setItem((s) => ({ ...s, currency: e.target.value }))}
                    placeholder="RON"
                  />
                </Field>
                <Field label="Beszállító / Szerviz">
                  <Input
                    className="bg-white"
                    value={item.vendor || ""}
                    onChange={(e) => setItem((s) => ({ ...s, vendor: e.target.value }))}
                    placeholder="Szerviz neve"
                  />
                </Field>
                <Field label="Számla száma">
                  <Input
                    className="bg-white"
                    value={item.invoice_no || ""}
                    onChange={(e) => setItem((s) => ({ ...s, invoice_no: e.target.value }))}
                    placeholder="Opció"
                  />
                </Field>

                <div className="col-span-2 flex items-center justify-between gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-4 text-white border-white/40 hover:bg-slate-50"
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

      {/* Confirm / Info modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl border border-white/30 bg-[#354153] p-5 shadow-xl">
            <div className="text-white font-semibold">{confirmTitle}</div>
            <div className="text-white/70 text-sm mt-2 whitespace-pre-wrap">{confirmMsg}</div>
            <div className="mt-5 flex items-center justify-end gap-2">
              {confirmVariant === "confirm" && (
                <button
                  type="button"
                  className="h-10 px-4 rounded-xl border border-white/30 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => setConfirmOpen(false)}
                >
                  Mégse
                </button>
              )}
              <button
                type="button"
                className={
                  confirmVariant === "confirm"
                    ? "h-10 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold"
                    : "h-10 px-4 rounded-xl bg-[#208d8b] hover:bg-[#1b7a78] text-white font-semibold"
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
