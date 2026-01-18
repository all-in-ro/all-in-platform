import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  PlusCircle,
  Save,
  
  Search,
  CalendarDays,
  Wrench,
  
  Edit,
  Trash2,
  X,
  ChevronDown,
  ChevronUp, ChevronLeft
} from "lucide-react";

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

/* ---------- Config ---------- */
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

/* ---------- UI bits ---------- */
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
  return (
    <span>
      {value.toLocaleString("ro-RO", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

/* ---------- Mobile Page ---------- */
export default function AllInCarExpensesMobile() {
  const [cars, setCars] = useState<Car[]>([]);
  const [rows, setRows] = useState<CarExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [msg, setMsg] = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filters
  const [carId, setCarId] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const today = justDate(new Date().toISOString());
  const [dateFrom, setDateFrom] = useState<string>(today?.slice(0, 7) + "-01");
  const [dateTo, setDateTo] = useState<string>(today);

  // Form state
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
      document.getElementById("expenseFormMobile")?.scrollIntoView({ behavior: "smooth" });
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
    if (!id) return;
    const yes = window.confirm("Biztos törlöd ezt a tételt?");
    if (!yes) return;
    const ok = await deleteExpense(id);
    if (!ok) {
      alert("Törlés sikertelen.");
      return;
    }
    await reload();
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
        <div className="px-3 py-3 flex items-center justify-between">
          <div className="text-white font-semibold text-[15px]">Autó kiadások</div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="h-8 px-3 text-white"
              style={{ backgroundColor: CUPE.green }}
              onClick={() => onEdit()}
            >
              <PlusCircle className="w-4 h-4 mr-1" /> Új tétel
            </Button><Button type="button" variant="outline" className="h-8 px-3 text-white border-white/40" onClick={() => window.history.back()}><ChevronLeft className="w-4 h-4 mr-1" /> Vissza</Button>
            
          </div>
        </div>
      </div>

      {msg && (
        <div className="px-3 mt-3">
          <div className="rounded-md border border-emerald-400/40 bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
            {msg}
          </div>
        </div>
      )}

      {/* Filters collapsed for mobile */}
      <div className="p-3">
        <Card className="rounded-lg border border-slate-300 bg-white text-slate-800 overflow-hidden">
          <button
  type="button"
  onClick={() => setFiltersOpen((s) => !s)}
  aria-expanded={filtersOpen}
  className="w-full flex items-center justify-between px-3 py-2 border-b border-slate-200 text-left hover:bg-slate-50 rounded-lg"
>
  <div className="flex flex-col">
    <div className="text-[13px] font-medium text-slate-700">Szűrők és eszközök</div>
    <div className="text-[11px] text-slate-500">{filtersOpen ? "Koppints a bezáráshoz" : "Koppints a megnyitáshoz"}</div>
  </div>
  <span className="text-slate-600" aria-hidden="true">
    {filtersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
  </span>
</button>{filtersOpen && (
            <CardContent className="p-3 grid gap-3">
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

              <label className="grid gap-1">
                <span className="text-[12px] text-slate-600">Autó</span>
                <select
                  value={carId}
                  onChange={(e) => setCarId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="h-9 rounded-md bg-white border border-slate-300 text-slate-800 px-2"
                >
                  <option value="">Mind</option>
                  {cars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.plate} — {c.make_model}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-[12px] text-slate-600">Kategória</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-9 rounded-md bg-white border border-slate-300 text-slate-800 px-2"
                >
                  <option value="">Mind</option>
                  {["Kötelező szerviz", "Olajcsere", "Gumicsere", "Javítás", "Vizsga", "Egyéb"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-[12px] text-slate-600">Dátumtól</span>
                  <Input
                    type="date"
                    className="bg-white border-slate-300 text-slate-800"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(justDate(e.target.value))}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[12px] text-slate-600">Dátumig</span>
                  <Input
                    type="date"
                    className="bg-white border-slate-300 text-slate-800"
                    value={dateTo}
                    onChange={(e) => setDateTo(justDate(e.target.value))}
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Totals */}
      <div className="p-3 grid grid-cols-3 gap-2">
        <Card className="rounded-md border-slate-300 bg-white text-slate-800">
          <CardContent className="p-2">
            <div className="text-[10px] text-slate-600">Tételek</div>
            <div className="text-lg font-semibold">{enriched.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-md border-slate-300 bg-white text-slate-800">
          <CardContent className="p-2">
            <div className="text-[10px] text-slate-600">Időszak</div>
            <div className="text-[11px] leading-tight">{dateFrom}<br/>→ {dateTo}</div>
          </CardContent>
        </Card>
        <Card className="rounded-md border-slate-300 bg-white text-slate-800">
          <CardContent className="p-2">
            <div className="text-[10px] text-slate-600">Összeg (RON)</div>
            <div className="text-lg font-semibold"><Money value={total} /></div>
          </CardContent>
        </Card>
      </div>

      {/* List as stacked cards */}
      <div className="p-3 grid gap-2">
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
            <Card key={r.id || Math.random()} className="rounded-lg border-slate-300 bg-white text-slate-800" style={{ backgroundColor: "#fff" }}>
              <CardContent className="p-3 grid gap-2 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[13px]">
                    <CalendarDays className="w-4 h-4 text-slate-600" />
                    <span className="font-medium">{justDate(r.date)}</span>
                  </div>
                  <div className="text-right text-[13px] font-semibold">
                    <Money value={r.cost} /> {r.currency || ""}
                  </div>
                </div>

                <div className="grid gap-1 text-[12px]">
                  <div>
                    <span className="text-slate-500">Autó:</span>{" "}
                    <span className="font-medium">{r.plate || "Ismeretlen"}</span>
                  </div>
                  <div className="text-slate-500">{r.make_model || "—"}</div>
                  <div className="flex items-center gap-2">
                    <Wrench className="w-3.5 h-3.5 text-slate-600" />
                    <span>{r.category || "—"}</span>
                  </div>
                  <div><span className="text-slate-500">Leírás:</span> {r.description || "—"}</div>
                  <div><span className="text-slate-500">km óra:</span> {r.odometer_km ?? "—"}</div>
                  <div><span className="text-slate-500">Beszállító:</span> {r.vendor || "—"}</div>
                  <div><span className="text-slate-500">Számla:</span> {r.invoice_no || "—"}</div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900 text-[12px]"
                    onClick={() => onEdit(r)}
                    type="button"
                  >
                    <Edit className="w-4 h-4" /> Szerkeszt
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Biztosan törlöd ezt a tételt?")) onDelete(r.id);
                    }}
                    className="flex items-center justify-center gap-1 text-white text-[12px] font-medium rounded-[4px] shadow-sm"
                    style={{ backgroundColor: '#b60e21', height: '30px', padding: '0 10px', borderRadius: '4px' }}
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                    <span>Törlés</span>
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}

        {!enriched.length && (
          <div className="text-center text-slate-300 text-sm py-16">Nincs találat.</div>
        )}
      </div>

      {/* Drawer / Form — strictly mobile-first, with "Autó" on its own row, then Dátum underneath */}
      {openForm && (
        <div className="fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40 z-10" onClick={() => { setOpenForm(false); setItem({ ...emptyItem }); }} />
          <div className="relative z-20 ml-auto h-full w-full max-w-[480px] bg-white shadow-xl rounded-l-2xl overflow-y-auto" id="expenseFormMobile">
            <div className="px-4 py-3 text-white text-sm flex items-center justify-between" style={{ backgroundColor: CUPE.blue }}>
              <div>{item.id ? "Tétel szerkesztése" : "Új tétel"}</div>
              <button
                className="text-slate-200 hover:text-white"
                onClick={() => { setOpenForm(false); setItem({ ...emptyItem }); }}
                aria-label="Bezár"
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4">
              <form onSubmit={onSubmit} className="grid gap-3">
                {/* Autó külön sor */}
                <Field label="Autó">
                  <select
                    className="h-10 rounded-md border border-slate-300 px-2 bg-white"
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

                {/* Alája Dátum (külön sor) */}
                <Field label="Dátum">
                  <Input
                    type="date"
                    className="bg-white h-10"
                    value={item.date || ""}
                    onChange={(e) => setItem((s) => ({ ...s, date: justDate(e.target.value) }))}
                    required
                  />
                </Field>

                {/* A többi, ahogy van */}
                <Field label="km óra állás">
                  <Input
                    type="number"
                    className="bg-white h-10"
                    value={item.odometer_km ?? ""}
                    onChange={(e) => setItem((s) => ({ ...s, odometer_km: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="pl. 156000"
                  />
                </Field>

                <Field label="Kategória">
                  <select
                    className="h-10 rounded-md border border-slate-300 px-2 bg-white"
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
                    className="bg-white h-10"
                    value={item.description || ""}
                    onChange={(e) => setItem((s) => ({ ...s, description: e.target.value }))}
                    placeholder="Munkalap, tételes leírás…"
                  />
                </Field>

                <Field label="Összeg">
                  <Input
                    type="number"
                    step="0.01"
                    className="bg-white h-10"
                    value={item.cost ?? ""}
                    onChange={(e) => setItem((s) => ({ ...s, cost: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="0.00"
                  />
                </Field>

                <Field label="Pénznem">
                  <Input
                    className="bg-white h-10"
                    value={item.currency || "RON"}
                    onChange={(e) => setItem((s) => ({ ...s, currency: e.target.value }))}
                    placeholder="RON"
                  />
                </Field>

                <Field label="Beszállító / Szerviz">
                  <Input
                    className="bg-white h-10"
                    value={item.vendor || ""}
                    onChange={(e) => setItem((s) => ({ ...s, vendor: e.target.value }))}
                    placeholder="Szerviz neve"
                  />
                </Field>

                <Field label="Számla száma">
                  <Input
                    className="bg-white h-10"
                    value={item.invoice_no || ""}
                    onChange={(e) => setItem((s) => ({ ...s, invoice_no: e.target.value }))}
                    placeholder="Opció"
                  />
                </Field>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 px-4"
                    onClick={() => { setOpenForm(false); setItem({ ...emptyItem }); }}
                  >
                    Bezár
                  </Button>
                  <div className="flex-1" />
                  {error && <div className="text-red-600 text-xs">{error}</div>}
                  <Button
                    type="submit"
                    className="h-10 px-4 text-white"
                    style={{ backgroundColor: CUPE.blue }}
                    disabled={saving}
                  >
                    {saving ? "Mentés…" : (<><Save className="h-4 w-4 mr-1" /> Mentés</>)}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
