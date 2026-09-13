import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  CarFront,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileText,
  Home,
  Plus,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";

type Car = { id: number; plate?: string; make_model?: string };
type CarExpense = {
  id?: number;
  car_id: number | null;
  date: string;
  odometer_km?: number | null;
  category?: string;
  description?: string;
  cost?: number | null;
  currency?: string;
  vendor?: string;
  invoice_no?: string;
  created_at?: string;
  updated_at?: string;
};
type SelectOption = { value: string; label: string };

const API = (import.meta as any).env?.VITE_API_BASE || "/api";
const MARLBORO = "#E21C2A";
const CATEGORIES = ["Kötelező szerviz", "Olajcsere", "Gumicsere", "Javítás", "Vizsga", "Egyéb"];

const page = "min-h-screen overflow-x-hidden bg-gradient-to-b from-[#5a6575] via-[#505b6b] to-[#454f5e] pb-8 text-white font-normal";
const shell = "mx-auto w-full min-w-0 max-w-[760px] space-y-3 px-3";
const panel = "overflow-hidden rounded-[22px] border border-white/14 bg-[#344154] shadow-[0_14px_34px_rgba(15,23,42,.16)]";
const input = "h-10 w-full min-w-0 rounded-xl border border-white/16 bg-[#293649] px-3 text-[12px] text-white outline-none placeholder:text-white/34 focus:border-[#7bd7d4]/60 focus:ring-2 focus:ring-[#7bd7d4]/15";
const label = "grid min-w-0 gap-1 text-[9px] uppercase tracking-[0.09em] text-[#dbe7f3]";
const iconBtn = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/14 bg-white/[0.055] text-white transition active:scale-[0.97] disabled:opacity-45";
const iconBtnActive = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#8ce7e2]/42 bg-[#2a8d8b] text-white shadow-[0_8px_18px_rgba(42,141,139,.22)] transition active:scale-[0.97]";
const softBtn = "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.055] px-3 text-[11px] text-white transition active:scale-[0.98] disabled:opacity-45";
const primaryBtn = "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[#8ce7e2]/42 bg-[#2a8d8b] px-3 text-[11px] text-white shadow-[0_8px_18px_rgba(42,141,139,.18)] transition active:scale-[0.98] disabled:opacity-45";
const dangerBtn = "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/75 bg-[#E21C2A] px-3 text-[11px] text-white shadow-[0_8px_18px_rgba(226,28,42,.24)] transition active:scale-[0.98] disabled:opacity-45";

function justDate(s?: string | null) {
  return s ? String(s).slice(0, 10) : "";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  const key = justDate(value);
  if (!key) return "-";
  const date = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(date);
}

function formatDateCompact(value?: string | null) {
  const key = justDate(value);
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return key || "-";
  const [year, month, day] = key.split("-");
  return `${year}.${month}.${day}`;
}

function money(value?: number | null, currency = "RON") {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))} ${currency}`;
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
    const result = await fetchJSON(`${API}/cars`);
    return Array.isArray(result) ? result : result?.rows || [];
  } catch { return []; }
}

async function listExpenses(params: { car_id?: number | ""; date_from?: string; date_to?: string; q?: string; category?: string }): Promise<CarExpense[]> {
  const query = new URLSearchParams();
  if (params.car_id) query.set("car_id", String(params.car_id));
  if (params.date_from) query.set("date_from", params.date_from);
  if (params.date_to) query.set("date_to", params.date_to);
  if (params.q) query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  try {
    const result = await fetchJSON(`${API}/car-expenses?${query.toString()}`);
    return Array.isArray(result) ? result : result?.rows || [];
  } catch { return []; }
}

async function createExpense(payload: CarExpense): Promise<CarExpense | null> {
  try { return await fetchJSON(`${API}/car-expenses`, { method: "POST", body: JSON.stringify(payload) }); } catch { return null; }
}

async function updateExpense(id: number, payload: CarExpense): Promise<CarExpense | null> {
  try { return await fetchJSON(`${API}/car-expenses/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); } catch { return null; }
}

async function deleteExpense(id: number) {
  const url = `${API}/car-expenses/${id}`;
  let response = await fetch(url, { method: "DELETE", credentials: "include" });
  if (response.status === 204 || response.ok) return true;
  if (response.status === 405 || response.status === 404) {
    response = await fetch(url, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ _action: "delete" }) });
    return response.ok;
  }
  return false;
}

function AllInSelect({ value, options, onChange, ariaLabel, placeholder = "Válassz" }: { value: string; options: SelectOption[]; onChange: (value: string) => void; ariaLabel: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const selected = options.find((option) => option.value === value) || null;
  const searchable = options.length > 9;
  const visible = query.trim() ? options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase())) : options;

  const updatePosition = useCallback(() => {
    const node = triggerRef.current;
    if (!node || typeof window === "undefined") return;
    const rect = node.getBoundingClientRect();
    const edge = 10;
    const width = Math.min(Math.max(rect.width, 210), window.innerWidth - edge * 2);
    const left = Math.min(Math.max(edge, rect.left), Math.max(edge, window.innerWidth - width - edge));
    const wanted = Math.min(300, 18 + (searchable ? 46 : 0) + options.length * 36);
    const below = window.innerHeight - rect.bottom - edge;
    const above = rect.top - edge;
    const up = below < 170 && above > below;
    setStyle({ position: "fixed", left, width, top: up ? rect.top - 6 : rect.bottom + 6, transform: up ? "translateY(-100%)" : "none", maxHeight: Math.max(110, Math.min(wanted, up ? above - 6 : below - 6)), zIndex: 2147483200 });
  }, [options.length, searchable]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const outside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setQuery(""); } };
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
      <button ref={triggerRef} type="button" aria-label={ariaLabel} aria-expanded={open} onClick={() => { if (!open) updatePosition(); setOpen((value) => !value); }} className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-white/16 bg-[#293649] px-3 text-left text-[12px] text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/15">
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-white" : "text-white/42"}`}>{selected?.label || placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/52 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div ref={menuRef} style={style} className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#7bd7d4]/30 bg-[#293344] text-white shadow-[0_24px_70px_rgba(2,6,23,.72)]">
          {searchable ? <div className="border-b border-white/10 p-1.5"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/38" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés..." className="h-8 w-full rounded-xl border border-white/14 bg-[#202b3b] pl-8 pr-3 text-[11px] text-white outline-none" /></div></div> : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {visible.map((option) => {
              const active = option.value === value;
              return <button key={option.value || "__empty"} type="button" onClick={() => { onChange(option.value); setOpen(false); setQuery(""); }} className={`mb-1 flex min-h-9 w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-[11px] last:mb-0 ${active ? "border-[#7bd7d4]/55 bg-[#2a8d8b] text-white" : "border-transparent bg-[#303a4c] text-white/78 hover:bg-[#3b485d]"}`}><span className="min-w-0 flex-1 truncate">{option.label}</span>{active ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : null}</button>;
            })}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

const MONTHS = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"];
const WEEKDAYS = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];

function AllInDatePicker({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const key = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayKey();
  const [initialYear, initialMonth] = key.split("-").map(Number);
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth - 1);

  useEffect(() => {
    if (!open) return;
    const current = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayKey();
    const [year, month] = current.split("-").map(Number);
    setViewYear(year);
    setViewMonth(month - 1);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", escape, true);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape, true); };
  }, [open, value]);

  const first = new Date(Date.UTC(viewYear, viewMonth, 1, 12));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setUTCDate(start.getUTCDate() + index); return date; });
  const toIso = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  const shift = (delta: number) => { const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1, 12)); setViewYear(next.getUTCFullYear()); setViewMonth(next.getUTCMonth()); };

  return (
    <>
      <button type="button" aria-label={ariaLabel} onClick={() => setOpen(true)} className="flex h-10 w-full min-w-0 items-center justify-between gap-1.5 overflow-hidden rounded-xl border border-white/16 bg-[#293649] px-2.5 text-left text-[11px] text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/15"><span className="flex min-w-0 flex-1 items-center gap-1.5 text-white"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#8ee6e2]" /><span className="min-w-0 truncate text-white">{formatDateCompact(value)}</span></span><ChevronDown className="h-3 w-3 shrink-0 text-white/60" /></button>
      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[2147483300] grid place-items-center bg-slate-950/72 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <div className="w-full max-w-[310px] overflow-hidden rounded-[24px] border border-[#8ce7e2]/42 bg-[#202c3d] p-3 text-white shadow-[0_32px_90px_rgba(2,6,23,.78)]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/9 bg-[#29374b] px-2 py-2"><button type="button" onClick={() => shift(-1)} className={iconBtn}><ChevronLeft className="h-4 w-4" /></button><div className="text-center"><div className="text-[8px] uppercase tracking-[0.14em] text-[#cffffd]/45">Dátum</div><div className="mt-0.5 text-[14px]">{viewYear}. {MONTHS[viewMonth]}</div></div><button type="button" onClick={() => shift(1)} className={iconBtn}><ChevronRight className="h-4 w-4" /></button></div>
            <div className="mt-3 grid grid-cols-7 gap-1">{WEEKDAYS.map((day) => <div key={day} className="py-1 text-center text-[9px] uppercase text-white/42">{day}</div>)}{days.map((date) => { const iso = toIso(date); const currentMonth = date.getUTCMonth() === viewMonth; const active = iso === value; return <button key={iso} type="button" onClick={() => { onChange(iso); setOpen(false); }} className={`h-9 rounded-lg border text-[11px] ${active ? "border-[#bff8f5]/60 bg-[#2a8d8b] text-white" : currentMonth ? "border-transparent bg-white/[0.025] text-white/82" : "border-transparent text-white/22"}`}>{date.getUTCDate()}</button>; })}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/8 pt-3"><button type="button" onClick={() => { onChange(todayKey()); setOpen(false); }} className="h-9 rounded-xl border border-[#8ce7e2]/28 bg-[#2a8d8b]/18 text-[10px] text-[#d7fffd]">Ma</button><button type="button" onClick={() => setOpen(false)} className="h-9 rounded-xl border border-white/12 bg-white/[0.04] text-[10px] text-white/70">Bezárás</button></div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export default function AllInCarExpensesMobile() {
  const today = todayKey();
  const emptyItem: CarExpense = { car_id: null, date: today, odometer_km: null, category: "", description: "", cost: null, currency: "RON", vendor: "", invoice_no: "" };
  const [cars, setCars] = useState<Car[]>([]);
  const [rows, setRows] = useState<CarExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [carId, setCarId] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState(`${today.slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(today);
  const [item, setItem] = useState<CarExpense>({ ...emptyItem });

  useEffect(() => { let alive = true; void listCars().then((data) => { if (alive) setCars(data); }); return () => { alive = false; }; }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listExpenses({ car_id: carId === "" ? undefined : Number(carId), date_from: dateFrom || undefined, date_to: dateTo || undefined, q: q.trim() || undefined, category: category || undefined });
      setRows(data);
    } finally { setLoading(false); }
  }, [carId, category, dateFrom, dateTo, q]);

  useEffect(() => { void reload(); }, [carId, category, dateFrom, dateTo]);

  useEffect(() => {
    if (!formOpen && confirmId == null && !filtersOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmId != null) setConfirmId(null);
      else if (formOpen && !saving) setFormOpen(false);
      else if (filtersOpen) setFiltersOpen(false);
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [confirmId, filtersOpen, formOpen, saving]);

  const carMap = useMemo(() => new Map(cars.map((car) => [car.id, car])), [cars]);
  const enriched = useMemo(() => rows.map((row) => ({ ...row, car: row.car_id ? carMap.get(row.car_id) : undefined })), [rows, carMap]);
  const total = useMemo(() => enriched.reduce((sum, row) => sum + (Number(row.cost) || 0), 0), [enriched]);
  const visibleRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return enriched;
    return enriched.filter((row) => [row.description, row.vendor, row.invoice_no, row.car?.plate, row.car?.make_model].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [enriched, q]);
  const activeFilters = [carId !== "" ? 1 : 0, category ? 1 : 0, q.trim() ? 1 : 0].reduce((sum, value) => sum + value, 0);

  function openEditor(row?: CarExpense) {
    setError("");
    setItem({ ...emptyItem, ...(row || {}), date: justDate(row?.date) || today });
    setFormOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload: CarExpense = {
      ...item,
      date: justDate(item.date),
      car_id: item.car_id ? Number(item.car_id) : null,
      odometer_km: item.odometer_km == null || item.odometer_km === ("" as any) ? null : Number(item.odometer_km),
      cost: item.cost == null || item.cost === ("" as any) ? null : Number(item.cost),
    };
    const result = item.id ? await updateExpense(Number(item.id), payload) : await createExpense(payload);
    if (!result) { setError("Mentés sikertelen."); setSaving(false); return; }
    await reload();
    setSaving(false);
    setFormOpen(false);
    setItem({ ...emptyItem });
    setMsg("Mentve.");
    window.setTimeout(() => setMsg(""), 1800);
  }

  async function runDelete() {
    const id = confirmId;
    setConfirmId(null);
    if (!id) return;
    const ok = await deleteExpense(id);
    if (!ok) { setError("Törlés sikertelen."); return; }
    await reload();
    setMsg("Tétel törölve.");
    window.setTimeout(() => setMsg(""), 1800);
  }

  return (
    <div className={page}>
      <div className={shell}>
        <header className="sticky top-0 z-40 -mx-3 border-b border-white/12 bg-[#2d394b]/96 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] shadow-[0_14px_34px_rgba(15,23,42,.28)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#8ce7e2]/34 bg-[#2a8d8b]/22 text-[#d7fffd]"><ReceiptText className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><div className="text-[9px] uppercase tracking-[0.16em] text-[#bff8f5]/58">AllInFashion • járművek</div><h1 className="mt-0.5 truncate text-lg leading-tight">Autó kiadások</h1><div className="mt-0.5 truncate text-[10px] text-white/44">{visibleRows.length} tétel • {money(total)}</div></div>
            <div className="flex shrink-0 items-center gap-1.5"><button type="button" onClick={() => openEditor()} className={iconBtnActive} title="Új tétel"><Plus className="h-4 w-4" /></button><button type="button" onClick={() => void reload()} disabled={loading} className={iconBtn} title="Frissítés"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button><button type="button" onClick={() => (window.location.hash = "#allin")} className={iconBtn} title="Kezdőlap"><Home className="h-4 w-4" /></button></div>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_40px] gap-2"><div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/34" /><input value={q} onChange={(event) => setQ(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void reload(); }} placeholder="Leírás, számla, szerviz..." className={`${input} pl-9 pr-9`} />{q ? <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/45"><X className="h-3.5 w-3.5" /></button> : null}</div><button type="button" onClick={() => setFiltersOpen(true)} className={activeFilters ? iconBtnActive : iconBtn} aria-label="Szűrők"><SlidersHorizontal className="h-4 w-4" /></button></div>
        </header>

        {msg ? <div className="rounded-2xl border border-[#7bd7d4]/28 bg-[#174c55]/72 px-3 py-2 text-[12px] text-[#e5fffd]"><CheckCircle2 className="mr-1.5 inline h-4 w-4" />{msg}</div> : null}
        {error && !formOpen ? <div className="rounded-2xl border border-red-300/28 bg-red-500/12 px-3 py-2 text-[12px] text-red-50">{error}</div> : null}

        <section className="grid grid-cols-2 gap-2">
          <div className="rounded-[20px] border border-white/12 bg-[#344154] p-3"><div className="text-[8px] uppercase tracking-[0.1em] text-white/42">Tételek</div><div className="mt-1.5 text-[22px] leading-none">{visibleRows.length}</div><div className="mt-1 text-[9px] text-white/40">{formatDate(dateFrom)} – {formatDate(dateTo)}</div></div>
          <div className="rounded-[20px] border border-[#7bd7d4]/28 bg-[#2a8d8b]/13 p-3"><div className="text-[8px] uppercase tracking-[0.1em] text-[#d7fffd]/52">Összes kiadás</div><div className="mt-1.5 truncate text-[20px] leading-none">{money(total)}</div><div className="mt-1 text-[9px] text-white/40">szűrt időszak</div></div>
        </section>

        <section className="grid gap-2">
          {loading ? <div className={`${panel} grid min-h-[120px] place-items-center text-sm text-white/55`}><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" /> Betöltés...</div> : null}
          {!loading && visibleRows.map((row) => (
            <article key={String(row.id)} className="overflow-hidden rounded-[22px] border border-white/12 bg-[#344154] shadow-[0_12px_28px_rgba(15,23,42,.14)]">
              <div className="p-3">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-1.5 text-[10px] text-[#9ee4e2]"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(row.date)}</div><div className="mt-1 truncate text-[16px] text-white">{row.car?.plate || "Ismeretlen autó"}</div><div className="mt-0.5 truncate text-[10px] text-white/42">{row.car?.make_model || "-"}</div></div><div className="shrink-0 text-right"><div className="text-[17px] text-white">{money(row.cost, row.currency || "RON")}</div><div className="mt-1 text-[9px] text-white/38">{row.category || "Egyéb"}</div></div></div>
                <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px]"><div className="rounded-xl border border-white/9 bg-white/[0.035] px-2.5 py-2"><div className="text-[8px] uppercase text-white/32">Leírás</div><div className="mt-1 line-clamp-2 text-white/72">{row.description || "-"}</div></div><div className="rounded-xl border border-white/9 bg-white/[0.035] px-2.5 py-2"><div className="text-[8px] uppercase text-white/32">km óra</div><div className="mt-1 text-white/72">{row.odometer_km ?? "-"} km</div></div><div className="rounded-xl border border-white/9 bg-white/[0.035] px-2.5 py-2"><div className="text-[8px] uppercase text-white/32">Szerviz / beszállító</div><div className="mt-1 truncate text-white/72">{row.vendor || "-"}</div></div><div className="rounded-xl border border-white/9 bg-white/[0.035] px-2.5 py-2"><div className="text-[8px] uppercase text-white/32">Számla</div><div className="mt-1 truncate text-white/72">{row.invoice_no || "-"}</div></div></div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/9 pt-2.5"><button type="button" onClick={() => openEditor(row)} className={softBtn}><Edit3 className="h-3.5 w-3.5" /> Szerkesztés</button><button type="button" onClick={() => row.id && setConfirmId(row.id)} className={dangerBtn}><Trash2 className="h-3.5 w-3.5" /> Törlés</button></div>
              </div>
            </article>
          ))}
          {!loading && !visibleRows.length ? <div className={`${panel} px-4 py-10 text-center text-sm text-white/45`}>Nincs találat.</div> : null}
        </section>
      </div>

      {filtersOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[900] grid place-items-center bg-slate-950/72 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setFiltersOpen(false); }}>
          <section className="flex max-h-[84dvh] w-[calc(100vw-28px)] max-w-[344px] flex-col overflow-hidden rounded-[26px] border border-white/18 bg-[#303c4f] text-white shadow-[0_32px_100px_rgba(0,0,0,.58)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-3.5 py-3"><div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#8ce7e2]/28 bg-[#2a8d8b]/16 text-[#d7fffd]"><SlidersHorizontal className="h-4 w-4" /></span><div><div className="text-[8px] uppercase tracking-[0.14em] text-[#dbe7f3]/70">Részletes szűrés</div><h2 className="mt-0.5 text-[16px] text-white">Autó kiadások</h2></div></div><button type="button" onClick={() => setFiltersOpen(false)} className={iconBtn}><X className="h-4 w-4" /></button></header>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
              <label className={label}>Autó<AllInSelect value={String(carId)} onChange={(value) => setCarId(value ? Number(value) : "")} ariaLabel="Autó" options={[{ value: "", label: "Minden autó" }, ...cars.map((car) => ({ value: String(car.id), label: `${car.plate || "-"} • ${car.make_model || "-"}` }))]} /></label>
              <label className={label}>Kategória<AllInSelect value={category} onChange={setCategory} ariaLabel="Kategória" options={[{ value: "", label: "Minden kategória" }, ...CATEGORIES.map((name) => ({ value: name, label: name }))]} /></label>
              <div className="grid min-w-0 grid-cols-2 gap-2"><label className={`${label} min-w-0`}>Dátumtól<AllInDatePicker value={dateFrom} onChange={setDateFrom} ariaLabel="Kezdő dátum" /></label><label className={`${label} min-w-0`}>Dátumig<AllInDatePicker value={dateTo} onChange={setDateTo} ariaLabel="Záró dátum" /></label></div>
            </div>
            <footer className="grid grid-cols-[.9fr_1.3fr] gap-2 border-t border-white/10 bg-[#293548] p-3"><button type="button" className={softBtn} onClick={() => { setCarId(""); setCategory(""); setQ(""); setDateFrom(`${today.slice(0, 7)}-01`); setDateTo(today); }}>Alaphelyzet</button><button type="button" className={primaryBtn} onClick={() => { void reload(); setFiltersOpen(false); }}><Search className="h-3.5 w-3.5" /> Alkalmazás</button></footer>
          </section>
        </div>,
        document.body,
      ) : null}

      {formOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[920] grid place-items-center bg-slate-950/76 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setFormOpen(false); }}>
          <section className="flex max-h-[90dvh] w-[calc(100vw-24px)] max-w-[360px] flex-col overflow-hidden rounded-[26px] border border-white/18 bg-[#303c4f] text-white shadow-[0_32px_100px_rgba(0,0,0,.62)]">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#303c4f] px-3.5 py-3"><div className="flex min-w-0 items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#8ce7e2]/28 bg-[#2a8d8b]/16 text-[#d7fffd]"><Wrench className="h-4 w-4" /></span><div className="min-w-0"><div className="text-[8px] uppercase tracking-[0.14em] text-[#dbe7f3]/70">{item.id ? "Kiadás szerkesztése" : "Új kiadás"}</div><h2 className="mt-0.5 truncate text-[16px] text-white">{item.id ? "Tétel módosítása" : "Új autókiadás"}</h2></div></div><button type="button" disabled={saving} onClick={() => setFormOpen(false)} className={iconBtn}><X className="h-4 w-4" /></button></header>
            <form onSubmit={submit} className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="grid gap-2.5">
                <label className={label}>Autó<AllInSelect value={String(item.car_id ?? "")} onChange={(value) => setItem((current) => ({ ...current, car_id: value ? Number(value) : null }))} ariaLabel="Autó" placeholder="Válassz autót" options={[{ value: "", label: "Válassz autót" }, ...cars.map((car) => ({ value: String(car.id), label: `${car.plate || "-"} • ${car.make_model || "-"}` }))]} /></label>
                <div className="grid min-w-0 grid-cols-2 gap-2"><label className={`${label} min-w-0`}>Dátum<AllInDatePicker value={item.date} onChange={(value) => setItem((current) => ({ ...current, date: value }))} ariaLabel="Kiadás dátuma" /></label><label className={`${label} min-w-0`}>km óra<input className={input} type="number" value={item.odometer_km ?? ""} onChange={(event) => setItem((current) => ({ ...current, odometer_km: event.target.value ? Number(event.target.value) : null }))} placeholder="156000" /></label></div>
                <label className={label}>Kategória<AllInSelect value={item.category || ""} onChange={(value) => setItem((current) => ({ ...current, category: value }))} ariaLabel="Kategória" options={[{ value: "", label: "Nincs megadva" }, ...CATEGORIES.map((name) => ({ value: name, label: name }))]} /></label>
                <label className={label}>Leírás<input className={input} value={item.description || ""} onChange={(event) => setItem((current) => ({ ...current, description: event.target.value }))} placeholder="Munkalap, tételes leírás..." /></label>
                <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2"><label className={label}>Összeg<input className={input} type="number" step="0.01" value={item.cost ?? ""} onChange={(event) => setItem((current) => ({ ...current, cost: event.target.value ? Number(event.target.value) : null }))} placeholder="0.00" /></label><label className={label}>Pénznem<input className={input} value={item.currency || "RON"} onChange={(event) => setItem((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></label></div>
                <label className={label}>Szerviz / beszállító<input className={input} value={item.vendor || ""} onChange={(event) => setItem((current) => ({ ...current, vendor: event.target.value }))} placeholder="Szerviz neve" /></label>
                <label className={label}>Számla száma<input className={input} value={item.invoice_no || ""} onChange={(event) => setItem((current) => ({ ...current, invoice_no: event.target.value }))} placeholder="Opcionális" /></label>
                {error ? <div className="rounded-xl border border-red-300/28 bg-red-500/12 px-3 py-2 text-[11px] text-red-50">{error}</div> : null}
              </div>
              <div className="sticky bottom-0 -mx-3 -mb-3 mt-3 grid grid-cols-2 gap-2 border-t border-white/10 bg-[#293548] p-3"><button type="button" className={softBtn} disabled={saving} onClick={() => setFormOpen(false)}>Mégse</button><button type="submit" className={primaryBtn} disabled={saving || !item.car_id || !item.date}>{saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{saving ? "Mentés..." : "Mentés"}</button></div>
            </form>
          </section>
        </div>,
        document.body,
      ) : null}

      {confirmId != null && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[940] grid place-items-center bg-slate-950/78 p-4 backdrop-blur-sm">
          <section className="w-full max-w-[340px] overflow-hidden rounded-[26px] border border-white/18 bg-[#303c4f] shadow-[0_32px_100px_rgba(0,0,0,.62)]"><div className="flex items-start gap-3 border-b border-white/10 px-4 py-4"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/75 bg-[#E21C2A] text-white"><Trash2 className="h-4 w-4" /></span><div><div className="text-[9px] uppercase tracking-[0.14em] text-white/42">Törlés</div><h3 className="mt-1 text-[17px]">Tétel törlése</h3><p className="mt-1 text-[11px] leading-relaxed text-white/55">Ez a kiadási tétel véglegesen törlődik.</p></div></div><footer className="grid grid-cols-2 gap-2 bg-[#293548] p-3"><button type="button" className={softBtn} onClick={() => setConfirmId(null)}>Mégse</button><button type="button" className={dangerBtn} onClick={() => void runDelete()}><Trash2 className="h-3.5 w-3.5" /> Törlés</button></footer></section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
