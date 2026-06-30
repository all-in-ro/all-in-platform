import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  AifSupplierDetail,
  AifSupplierReportItem,
  AifSupplierReportTotals,
  apiAifCreateSupplier,
  apiAifDeleteSupplier,
  apiAifListSuppliers,
  apiAifSupplierReport,
  apiAifUpdateSupplier,
} from "../lib/aif/api";

type FormState = {
  name: string;
  code: string;
  notes: string;
};

type CompareMode =
  | "none"
  | "same_period_last_year"
  | "previous_period"
  | "previous_year";

const page =
  "min-h-screen bg-[#37404f] px-3 py-3 text-white font-normal sm:px-5 sm:py-4";
const wrap = "mx-auto max-w-7xl space-y-4";
const card =
  "rounded-2xl border border-white/34 bg-[#485467] p-3 shadow-lg shadow-slate-950/20 sm:p-4";
const compactCard =
  "rounded-2xl border border-white/26 bg-[#435064] p-3 shadow-lg shadow-slate-950/15 sm:p-4";
const sectionHeader =
  "flex w-full items-center justify-between gap-3 rounded-xl border border-white/30 border-l-4 border-l-emerald-300 bg-[#111a28] px-3 py-2.5 text-left shadow-sm shadow-slate-950/20";
const sectionTitle =
  "flex items-center gap-2 text-sm uppercase tracking-[0.12em] text-white";
const sectionHint = "hidden text-xs text-white/72 sm:inline";
const label = "grid gap-1.5 text-xs uppercase tracking-[0.05em] text-white/94";
const input =
  "h-8 rounded-lg border border-white/38 !bg-[#111a28] px-3 text-sm !text-white caret-white outline-none transition placeholder:text-white/55 selection:bg-emerald-300/35 focus:border-emerald-200/90 focus:ring-1 focus:ring-emerald-200/35 [color-scheme:dark] font-normal";
const textarea =
  "min-h-[68px] rounded-lg border border-white/38 !bg-[#111a28] px-3 py-2 text-sm !text-white caret-white outline-none transition placeholder:text-white/55 selection:bg-emerald-300/35 focus:border-emerald-200/90 focus:ring-1 focus:ring-emerald-200/35 font-normal";
const btnBase =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs text-white transition disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = `${btnBase} border-emerald-300/24 bg-[#276454] hover:bg-[#2d735f]`;
const neutralBtn = `${btnBase} border-white/28 bg-[#2d3748] hover:bg-[#374457]`;
const dangerBtn = `${btnBase} border-red-300/24 bg-[#c90d22] hover:bg-[#a90c1d]`;
const tinyBtn =
  "inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-white/28 bg-[#2d3748] px-2 text-xs text-white/92 transition hover:bg-[#374457] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const tinyDangerBtn =
  "inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-red-300/24 bg-[#c90d22] px-2 text-xs text-white transition hover:bg-[#a90c1d] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const chip =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-normal";
const statCard =
  "rounded-xl border border-white/24 bg-[#374254] px-3 py-2.5 shadow-sm shadow-slate-950/15";
const focusPanel = "rounded-2xl border border-white/20 bg-[#343f51] p-3";
const modalBackdrop =
  "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/74 px-4 py-6 backdrop-blur-sm";
const modalCard =
  "w-full max-w-sm rounded-2xl border border-white/24 bg-[#4b5566] p-4 text-white shadow-2xl";

function goHome() {
  window.location.hash = "#allin";
}

function normalizeCode(v: string) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function money(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0,00";
  return n.toLocaleString("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numberFmt(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ro-RO");
}

function percentFmt(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0.0%";
  return `${n.toFixed(1)}%`;
}

function dateOnly(v?: string | null) {
  if (!v) return "-";
  return String(v).slice(0, 10);
}

function emptyTotals(): AifSupplierReportTotals {
  return {
    purchase_batches: 0,
    purchase_rows: 0,
    purchase_qty: 0,
    purchase_value: 0,
    rows_without_buy_price: 0,
  };
}

function parseLocalDate(value: string) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftYears(value: string, years: number) {
  const d = parseLocalDate(value);
  if (!d) return "";
  d.setFullYear(d.getFullYear() + years);
  return isoDate(d);
}

function currentYearRange() {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function previousYearRange() {
  const y = new Date().getFullYear() - 1;
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    from: isoDate(new Date(y, m, 1)),
    to: isoDate(new Date(y, m + 1, 0)),
  };
}

function last12MonthsRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() + 1);
  return { from: isoDate(start), to: isoDate(end) };
}

function previousPeriodRange(from: string, to: string) {
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);
  if (!start || !end || end < start) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const span = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
  const cmpEnd = new Date(start);
  cmpEnd.setDate(cmpEnd.getDate() - 1);
  const cmpStart = new Date(cmpEnd);
  cmpStart.setDate(cmpStart.getDate() - span + 1);
  return { from: isoDate(cmpStart), to: isoDate(cmpEnd) };
}

function comparisonRange(mode: CompareMode, from: string, to: string) {
  if (mode === "none") return null;
  if (mode === "previous_year") return previousYearRange();
  if (mode === "same_period_last_year") {
    if (from && to)
      return { from: shiftYears(from, -1), to: shiftYears(to, -1) };
    return previousYearRange();
  }
  if (mode === "previous_period") return previousPeriodRange(from, to);
  return null;
}

function comparisonLabel(mode: CompareMode, from: string, to: string) {
  const range = comparisonRange(mode, from, to);
  if (!range) return "Nincs összehasonlítás";
  if (mode === "same_period_last_year")
    return `Azonos időszak tavaly: ${range.from} - ${range.to}`;
  if (mode === "previous_period")
    return `Előző azonos hosszú időszak: ${range.from} - ${range.to}`;
  if (mode === "previous_year") return `Előző év: ${range.from} - ${range.to}`;
  return `${range.from} - ${range.to}`;
}

function diffPercent(current: unknown, previous: unknown) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return ((c - p) / p) * 100;
}

function clampWidth(value: number, max: number) {
  if (!Number.isFinite(value) || value <= 0) return 2;
  return Math.max(
    2,
    Math.min(100, Math.round((value / Math.max(1, max)) * 100)),
  );
}

function SectionToggle(props: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={sectionHeader}
      onClick={props.onToggle}
      type="button"
      aria-expanded={props.open}
    >
      <span className={sectionTitle}>
        {props.icon}
        <span>{props.title}</span>
      </span>
      <span className="flex items-center gap-2">
        {props.subtitle && (
          <span className={sectionHint}>{props.subtitle}</span>
        )}
        {props.open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </span>
    </button>
  );
}

function ComparisonMiniCard(props: {
  title: string;
  current: number;
  previous: number;
  type?: "money" | "number";
}) {
  const max = Math.max(1, props.current, props.previous);
  const diff = diffPercent(props.current, props.previous);
  const format = props.type === "money" ? money : numberFmt;

  return (
    <div className="rounded-xl border border-white/16 bg-[#3b4659] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.06em] text-white/72">
          {props.title}
        </p>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${diff == null ? "border-white/16 text-white/62" : diff >= 0 ? "border-emerald-300/34 text-emerald-100" : "border-red-300/34 text-red-100"}`}
        >
          {diff == null ? "-" : `${diff >= 0 ? "+" : ""}${percentFmt(diff)}`}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        <div>
          <div className="mb-1 flex justify-between gap-2 text-xs text-white/70">
            <span>Aktuális</span>
            <span>{format(props.current)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-950/40">
            <div
              className="h-full rounded-full bg-emerald-300/80"
              style={{ width: `${clampWidth(props.current, max)}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between gap-2 text-xs text-white/70">
            <span>Összehasonlítás</span>
            <span>{format(props.previous)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-950/40">
            <div
              className="h-full rounded-full bg-white/45"
              style={{ width: `${clampWidth(props.previous, max)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AllInSuppliers() {
  const [suppliers, setSuppliers] = useState<AifSupplierDetail[]>([]);
  const [report, setReport] = useState<AifSupplierReportItem[]>([]);
  const [compareReport, setCompareReport] = useState<AifSupplierReportItem[]>(
    [],
  );
  const [totals, setTotals] = useState<AifSupplierReportTotals>(emptyTotals());
  const [compareTotals, setCompareTotals] =
    useState<AifSupplierReportTotals>(emptyTotals());
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [compareMode, setCompareMode] = useState<CompareMode>("none");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [form, setForm] = useState<FormState>({
    name: "",
    code: "",
    notes: "",
  });
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState<FormState>({
    name: "",
    code: "",
    notes: "",
  });
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AifSupplierDetail | null>(
    null,
  );

  const reportBySupplier = useMemo(() => {
    const map = new Map<string, AifSupplierReportItem>();
    for (const r of report) map.set(r.id, r);
    return map;
  }, [report]);

  const compareBySupplier = useMemo(() => {
    const map = new Map<string, AifSupplierReportItem>();
    for (const r of compareReport) map.set(r.id, r);
    return map;
  }, [compareReport]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      return [s.name, s.code, s.notes]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [suppliers, query]);

  const sortedReport = useMemo(() => {
    return [...report].sort(
      (a, b) => Number(b.purchase_value || 0) - Number(a.purchase_value || 0),
    );
  }, [report]);

  const selectedReport = useMemo(() => {
    if (selectedSupplierId) {
      const found = reportBySupplier.get(selectedSupplierId);
      if (found) return found;
    }
    return sortedReport[0] || null;
  }, [reportBySupplier, selectedSupplierId, sortedReport]);

  const selectedCompareReport = useMemo(() => {
    if (!selectedReport) return null;
    return compareBySupplier.get(selectedReport.id) || null;
  }, [compareBySupplier, selectedReport]);

  const selectedSupplier = useMemo(() => {
    if (!selectedReport) return null;
    return suppliers.find((s) => s.id === selectedReport.id) || null;
  }, [selectedReport, suppliers]);

  const maxReportValue = useMemo(() => {
    return Math.max(
      1,
      ...sortedReport.map((r) => Number(r.purchase_value || 0)),
    );
  }, [sortedReport]);

  const totalPurchaseValue = Number(totals.purchase_value || 0);
  const selectedPurchaseValue = Number(selectedReport?.purchase_value || 0);
  const selectedShare =
    totalPurchaseValue > 0
      ? (selectedPurchaseValue / totalPurchaseValue) * 100
      : 0;
  const selectedAvgReceipt =
    Number(selectedReport?.purchase_batches || 0) > 0
      ? selectedPurchaseValue / Number(selectedReport?.purchase_batches || 1)
      : 0;
  const selectedAvgQtyValue =
    Number(selectedReport?.purchase_qty || 0) > 0
      ? selectedPurchaseValue / Number(selectedReport?.purchase_qty || 1)
      : 0;

  const activeCompareLabel = comparisonLabel(compareMode, from, to);

  async function load(next?: {
    from?: string;
    to?: string;
    includeInactive?: boolean;
    compareMode?: CompareMode;
  }) {
    const nextFrom = next?.from ?? from;
    const nextTo = next?.to ?? to;
    const nextIncludeInactive = next?.includeInactive ?? includeInactive;
    const nextCompareMode = next?.compareMode ?? compareMode;
    const cmpRange = comparisonRange(nextCompareMode, nextFrom, nextTo);

    setBusy(true);
    setMessage("");
    try {
      const supplierPromise = apiAifListSuppliers({
        includeInactive: nextIncludeInactive,
        withStats: true,
      });
      const reportPromise = apiAifSupplierReport({
        from: nextFrom,
        to: nextTo,
        includeInactive: nextIncludeInactive,
      });
      const comparePromise = cmpRange
        ? apiAifSupplierReport({
            from: cmpRange.from,
            to: cmpRange.to,
            includeInactive: nextIncludeInactive,
          })
        : Promise.resolve({ items: [], totals: emptyTotals() });

      const [sData, rData, cData] = await Promise.all([
        supplierPromise,
        reportPromise,
        comparePromise,
      ]);
      setSuppliers(sData.items || []);
      setReport(rData.items || []);
      setTotals(rData.totals || emptyTotals());
      setCompareReport(cData.items || []);
      setCompareTotals(cData.totals || emptyTotals());
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült betölteni a beszállítókat.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load({ includeInactive });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  useEffect(() => {
    if (!selectedSupplierId && sortedReport.length) {
      setSelectedSupplierId(sortedReport[0].id);
    }
  }, [selectedSupplierId, sortedReport]);

  function applyPeriod(range: { from: string; to: string }) {
    setFrom(range.from);
    setTo(range.to);
    load({ from: range.from, to: range.to });
  }

  function clearPeriod() {
    setFrom("");
    setTo("");
    setCompareMode("none");
    load({ from: "", to: "", compareMode: "none" });
  }

  function changeCompareMode(mode: CompareMode) {
    setCompareMode(mode);
    load({ compareMode: mode });
  }

  function updateFormName(name: string) {
    setForm((f) => ({
      ...f,
      name,
      code: f.code ? f.code : normalizeCode(name),
    }));
  }

  async function createSupplier() {
    if (!form.name.trim()) {
      setMessage("A beszállító neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiAifCreateSupplier({
        name: form.name,
        code: form.code || normalizeCode(form.name),
        notes: form.notes,
      });
      setForm({ name: "", code: "", notes: "" });
      await load();
      setMessage("Beszállító mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a beszállítót.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(s: AifSupplierDetail) {
    setEditingId(s.id);
    setEditForm({
      name: s.name || "",
      code: s.code || "",
      notes: s.notes || "",
    });
  }

  async function saveEdit(id: string) {
    if (!editForm.name.trim()) {
      setMessage("A név nem maradhat üresen.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateSupplier(id, {
        name: editForm.name,
        code: editForm.code || normalizeCode(editForm.name),
        notes: editForm.notes,
      });
      setEditingId("");
      await load();
      setMessage("Beszállító frissítve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült frissíteni.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: AifSupplierDetail) {
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateSupplier(s.id, { is_active: !s.is_active });
      await load();
      setMessage(
        s.is_active ? "Beszállító inaktiválva." : "Beszállító aktiválva.",
      );
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani az állapotot.");
    } finally {
      setBusy(false);
    }
  }

  function askRemoveSupplier(s: AifSupplierDetail) {
    setDeleteTarget(s);
  }

  async function confirmRemoveSupplier() {
    if (!deleteTarget) return;
    const s = deleteTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifDeleteSupplier(s.id);
      setDeleteTarget(null);
      await load();
      setMessage(
        result.mode === "deleted"
          ? "Beszállító törölve."
          : "Beszállító inaktiválva, mert van hozzá előzmény.",
      );
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={page}>
      {deleteTarget && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-labelledby="supplier-delete-title"
        >
          <div className={modalCard}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg border border-red-300/20 bg-red-500/12 p-2 text-red-100">
                <Trash2 size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p id="supplier-delete-title" className="text-base font-normal">
                  Beszállító törlése
                </p>
                <p className="mt-2 text-sm leading-6 text-white/78">
                  Biztosan törlöd ezt a beszállítót?
                </p>
                <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/28 px-3 py-2.5">
                  <p className="text-sm font-normal text-white">
                    {deleteTarget.name}
                  </p>
                  <p className="mt-1 font-mono text-xs text-white/78">
                    {deleteTarget.code}
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/74">
                  Ha már kapcsolódik hozzá bevételezés, a rendszer nem törli
                  fizikailag, csak inaktívra állítja, hogy a kimutatások
                  megmaradjanak.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className={`${neutralBtn} w-full sm:w-auto`}
                onClick={() => setDeleteTarget(null)}
                disabled={busy}
                type="button"
              >
                <X size={15} /> Mégse
              </button>
              <button
                className={`${dangerBtn} w-full sm:w-auto`}
                onClick={confirmRemoveSupplier}
                disabled={busy}
                type="button"
              >
                <Trash2 size={15} /> Törlés
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={wrap}>
        <header className="rounded-2xl border border-white/26 bg-[#465164] px-4 py-3 shadow-lg shadow-slate-950/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/82">
                AllInFashion
              </p>
              <h1 className="mt-1 text-2xl font-normal tracking-tight text-white sm:text-3xl">
                Beszállítók
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-white/82">
                Beszállítói törzsadatok, import alapadatok és vásárlási
                kimutatások kezelése.
              </p>
            </div>
            <button className={neutralBtn} onClick={goHome} type="button">
              <ArrowLeft size={15} /> Vissza
            </button>
          </div>
        </header>

        {message && (
          <div className="rounded-xl border border-emerald-200/34 bg-emerald-400/12 px-3 py-2 text-sm text-white/92">
            {message}
          </div>
        )}

        <section className={compactCard}>
          <SectionToggle
            icon={<Search size={15} />}
            title="Szűrés és időszakok"
            subtitle="Keresés, gyors időszakok, összehasonlítás"
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
          />
          {filtersOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className={`${label} sm:col-span-2 lg:col-span-1`}>
                    Keresés
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/42"
                        size={15}
                      />
                      <input
                        className={`${input} w-full pl-9`}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="név, kód, megjegyzés"
                      />
                    </div>
                  </label>
                  <label className={label}>
                    Időszak kezdete
                    <input
                      className={`${input} w-full`}
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label className={label}>
                    Időszak vége
                    <input
                      className={`${input} w-full`}
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                  <label className="flex h-8 items-center gap-2 self-end rounded-lg border border-white/18 bg-slate-950/22 px-3 text-sm text-white/78">
                    <input
                      type="checkbox"
                      checked={includeInactive}
                      onChange={(e) => setIncludeInactive(e.target.checked)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    Inaktívak is
                  </label>
                </div>
                <button
                  className={neutralBtn}
                  onClick={() => load()}
                  disabled={busy}
                  type="button"
                >
                  <RefreshCw size={14} /> Frissítés
                </button>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_280px] lg:items-end">
                <div className="flex flex-wrap gap-2">
                  <button
                    className={tinyBtn}
                    onClick={() => applyPeriod(currentYearRange())}
                    type="button"
                  >
                    Idei év
                  </button>
                  <button
                    className={tinyBtn}
                    onClick={() => applyPeriod(previousYearRange())}
                    type="button"
                  >
                    Tavaly
                  </button>
                  <button
                    className={tinyBtn}
                    onClick={() => applyPeriod(currentMonthRange())}
                    type="button"
                  >
                    Aktuális hónap
                  </button>
                  <button
                    className={tinyBtn}
                    onClick={() => applyPeriod(last12MonthsRange())}
                    type="button"
                  >
                    Utolsó 12 hónap
                  </button>
                  <button
                    className={tinyBtn}
                    onClick={clearPeriod}
                    type="button"
                  >
                    Teljes időszak
                  </button>
                </div>
                <label className={label}>
                  Összehasonlítás
                  <select
                    className={`${input} w-full`}
                    value={compareMode}
                    onChange={(e) =>
                      changeCompareMode(e.target.value as CompareMode)
                    }
                  >
                    <option value="none">Nincs összehasonlítás</option>
                    <option value="same_period_last_year">
                      Azonos időszak tavaly
                    </option>
                    <option value="previous_period">
                      Előző azonos hosszú időszak
                    </option>
                    <option value="previous_year">Előző év</option>
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-white/14 bg-slate-950/18 px-3 py-2 text-xs text-white/72">
                <CalendarRange size={14} />
                <span>
                  {from && to
                    ? `Aktuális időszak: ${from} - ${to}`
                    : "Aktuális időszak: teljes időszak"}
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="hidden sm:inline">{activeCompareLabel}</span>
              </div>
            </div>
          )}
        </section>

        <section className={card}>
          <SectionToggle
            icon={<BarChart3 size={17} />}
            title="Vásárlási kimutatás"
            subtitle="Összesítés, rangsor, grafikonok"
            open={reportOpen}
            onToggle={() => setReportOpen((v) => !v)}
          />

          {reportOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 lg:grid-cols-[1fr_290px] lg:items-end">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <div className={statCard}>
                    <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                      Beszállítók
                    </p>
                    <p className="mt-1 text-lg font-normal">
                      {numberFmt(suppliers.length)}
                    </p>
                  </div>
                  <div className={statCard}>
                    <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                      Bevételezések
                    </p>
                    <p className="mt-1 text-lg font-normal">
                      {numberFmt(totals.purchase_batches)}
                    </p>
                  </div>
                  <div className={statCard}>
                    <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                      Terméksorok
                    </p>
                    <p className="mt-1 text-lg font-normal">
                      {numberFmt(totals.purchase_rows)}
                    </p>
                  </div>
                  <div className={statCard}>
                    <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                      Darab
                    </p>
                    <p className="mt-1 text-lg font-normal">
                      {numberFmt(totals.purchase_qty)}
                    </p>
                  </div>
                  <div className={statCard}>
                    <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                      Vásárlási érték
                    </p>
                    <p className="mt-1 text-lg font-normal">
                      {money(totals.purchase_value)}
                    </p>
                  </div>
                </div>
                <label className="grid gap-1.5 text-xs uppercase tracking-[0.04em] text-white/82">
                  Részletek beszállító szerint
                  <select
                    className={`${input} w-full`}
                    value={selectedReport?.id || selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                  >
                    {sortedReport.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                    {!sortedReport.length && (
                      <option value="">Nincs adat</option>
                    )}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <ComparisonMiniCard
                  title="Vásárlási érték"
                  current={Number(totals.purchase_value || 0)}
                  previous={Number(compareTotals.purchase_value || 0)}
                  type="money"
                />
                <ComparisonMiniCard
                  title="Darab"
                  current={Number(totals.purchase_qty || 0)}
                  previous={Number(compareTotals.purchase_qty || 0)}
                />
                <ComparisonMiniCard
                  title="Bevételezések"
                  current={Number(totals.purchase_batches || 0)}
                  previous={Number(compareTotals.purchase_batches || 0)}
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_1.25fr]">
                <div className={focusPanel}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-white/86">
                      Kiválasztott beszállító
                    </p>
                    {selectedSupplier && (
                      <span
                        className={`${chip} ${selectedSupplier.is_active ? "border-emerald-300/35 text-emerald-100" : "border-white/18 text-white/66"}`}
                      >
                        {selectedSupplier.is_active ? "Aktív" : "Inaktív"}
                      </span>
                    )}
                  </div>
                  <p className="text-lg font-normal text-white">
                    {selectedReport?.name || "Nincs adat"}
                  </p>
                  <p className="mt-1 font-mono text-xs text-white/64">
                    {selectedReport?.code || "-"}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                      <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                        Vásárlási érték
                      </p>
                      <p className="mt-1">
                        {money(selectedReport?.purchase_value)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                      <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                        Részesedés
                      </p>
                      <p className="mt-1">{percentFmt(selectedShare)}</p>
                    </div>
                    <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                      <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                        Darab
                      </p>
                      <p className="mt-1">
                        {numberFmt(selectedReport?.purchase_qty)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                      <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                        Bevételezések
                      </p>
                      <p className="mt-1">
                        {numberFmt(selectedReport?.purchase_batches)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                      <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                        Átlag / bevételezés
                      </p>
                      <p className="mt-1">{money(selectedAvgReceipt)}</p>
                    </div>
                    <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                      <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                        Átlag / darab
                      </p>
                      <p className="mt-1">{money(selectedAvgQtyValue)}</p>
                    </div>
                    <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                      <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                        Ár nélküli terméksor
                      </p>
                      <p className="mt-1">
                        {numberFmt(selectedReport?.rows_without_buy_price)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                      <p className="text-xs uppercase tracking-[0.06em] text-white/72">
                        Utolsó vásárlás
                      </p>
                      <p className="mt-1">
                        {dateOnly(selectedReport?.last_purchase_at)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/12 bg-[#3b4659] p-3">
                    <p className="mb-2 text-xs uppercase tracking-[0.06em] text-white/72">
                      Kiválasztott beszállító összehasonlítás
                    </p>
                    <ComparisonMiniCard
                      title="Vásárlási érték"
                      current={Number(selectedReport?.purchase_value || 0)}
                      previous={Number(
                        selectedCompareReport?.purchase_value || 0,
                      )}
                      type="money"
                    />
                  </div>
                </div>

                <div className={focusPanel}>
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-white/86">Vásárlási rangsor</p>
                    <p className="text-xs text-white/58">
                      {activeCompareLabel}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {sortedReport.map((r) => {
                      const value = Number(r.purchase_value || 0);
                      const compareValue = Number(
                        compareBySupplier.get(r.id)?.purchase_value || 0,
                      );
                      const active = selectedReport?.id === r.id;
                      return (
                        <button
                          key={r.id}
                          className={`rounded-lg border px-3 py-2 text-left transition ${active ? "border-emerald-300/50 bg-emerald-400/12" : "border-white/14 bg-[#414c5f] hover:bg-[#485468]"}`}
                          onClick={() => setSelectedSupplierId(r.id)}
                          type="button"
                        >
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-white/90">
                              {r.name}
                            </span>
                            <span className="shrink-0 text-white/78">
                              {money(r.purchase_value)}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-1">
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-950/38">
                              <div
                                className="h-full rounded-full bg-emerald-300/70"
                                style={{
                                  width: `${clampWidth(value, maxReportValue)}%`,
                                }}
                              />
                            </div>
                            {compareMode !== "none" && (
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-950/38">
                                <div
                                  className="h-full rounded-full bg-white/42"
                                  style={{
                                    width: `${clampWidth(compareValue, maxReportValue)}%`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/64">
                            <span>{numberFmt(r.purchase_qty)} darab</span>
                            <span>
                              {numberFmt(r.purchase_batches)} bevételezés
                            </span>
                            <span>{dateOnly(r.last_purchase_at)}</span>
                          </div>
                        </button>
                      );
                    })}
                    {!sortedReport.length && (
                      <p className="rounded-xl border border-white/14 bg-[#414c5f] px-3 py-6 text-center text-sm text-white/78">
                        Nincs vásárlási adat a kiválasztott időszakban.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className={compactCard}>
          <SectionToggle
            icon={<Plus size={16} />}
            title="Új beszállító"
            subtitle="Törzsadat felvétele"
            open={createOpen}
            onToggle={() => setCreateOpen((v) => !v)}
          />
          {createOpen && (
            <div className="mt-3 grid gap-3 lg:grid-cols-[2fr_1fr_2fr_auto] lg:items-end">
              <label className={label}>
                Név
                <input
                  className={`${input} w-full`}
                  value={form.name}
                  onChange={(e) => updateFormName(e.target.value)}
                  placeholder="pl. Under Armour Europe"
                />
              </label>
              <label className={label}>
                Kód
                <input
                  className={`${input} w-full`}
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      code: normalizeCode(e.target.value),
                    }))
                  }
                  placeholder="under_armour_eu"
                />
              </label>
              <label className={label}>
                Megjegyzés
                <input
                  className={`${input} w-full`}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="kapcsolat, feltétel, árlista típusa"
                />
              </label>
              <button
                className={primaryBtn}
                onClick={createSupplier}
                disabled={busy}
                type="button"
              >
                <Save size={14} /> Mentés
              </button>
            </div>
          )}
        </section>

        <section className={card}>
          <SectionToggle
            icon={<Building2 size={16} />}
            title="Beszállítói lista"
            subtitle={`${filtered.length} találat`}
            open={listOpen}
            onToggle={() => setListOpen((v) => !v)}
          />

          {listOpen && (
            <div className="mt-3">
              <div className="grid gap-3 md:hidden">
                {filtered.map((s) => {
                  const r = reportBySupplier.get(s.id);
                  const editing = editingId === s.id;
                  return (
                    <div
                      key={s.id}
                      className="rounded-2xl border border-white/18 bg-[#343f51] p-3"
                    >
                      {editing ? (
                        <div className="grid gap-2.5">
                          <input
                            className={`${input} w-full`}
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                name: e.target.value,
                              }))
                            }
                          />
                          <input
                            className={`${input} w-full`}
                            value={editForm.code}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                code: normalizeCode(e.target.value),
                              }))
                            }
                          />
                          <textarea
                            className={textarea}
                            value={editForm.notes}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                notes: e.target.value,
                              }))
                            }
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              className={primaryBtn}
                              onClick={() => saveEdit(s.id)}
                              disabled={busy}
                              type="button"
                            >
                              <Check size={14} /> Mentés
                            </button>
                            <button
                              className={neutralBtn}
                              onClick={() => setEditingId("")}
                              type="button"
                            >
                              <X size={14} /> Mégse
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <button
                              className="min-w-0 text-left"
                              onClick={() => setSelectedSupplierId(s.id)}
                              type="button"
                            >
                              <p className="text-sm font-normal text-white">
                                {s.name}
                              </p>
                              <p className="mt-1 break-all font-mono text-xs text-white/66">
                                {s.code}
                              </p>
                            </button>
                            <span
                              className={`${chip} ${s.is_active ? "border-emerald-300/35 text-emerald-100" : "border-white/18 text-white/66"}`}
                            >
                              {s.is_active ? "Aktív" : "Inaktív"}
                            </span>
                          </div>
                          {s.notes && (
                            <p className="mt-2 text-sm leading-6 text-white/74">
                              {s.notes}
                            </p>
                          )}
                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                              <p className="text-xs uppercase tracking-[0.06em] text-white/68">
                                Bevételezések
                              </p>
                              <p>{numberFmt(r?.purchase_batches)}</p>
                            </div>
                            <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                              <p className="text-xs uppercase tracking-[0.06em] text-white/68">
                                Darab
                              </p>
                              <p>{numberFmt(r?.purchase_qty)}</p>
                            </div>
                            <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                              <p className="text-xs uppercase tracking-[0.06em] text-white/68">
                                Vásárlási érték
                              </p>
                              <p>{money(r?.purchase_value)}</p>
                            </div>
                            <div className="rounded-xl border border-white/12 bg-[#414c5f] p-2.5">
                              <p className="text-xs uppercase tracking-[0.06em] text-white/68">
                                Utolsó
                              </p>
                              <p>{dateOnly(r?.last_purchase_at)}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-4 gap-2">
                            <button
                              className={tinyBtn}
                              onClick={() => setSelectedSupplierId(s.id)}
                              type="button"
                            >
                              Adatok
                            </button>
                            <button
                              className={tinyBtn}
                              onClick={() => startEdit(s)}
                              type="button"
                            >
                              <Edit3 size={13} /> Módosít
                            </button>
                            <button
                              className={tinyBtn}
                              onClick={() => toggleActive(s)}
                              disabled={busy}
                              type="button"
                            >
                              <Power size={13} />{" "}
                              {s.is_active ? "Inaktív" : "Aktív"}
                            </button>
                            <button
                              className={tinyDangerBtn}
                              onClick={() => askRemoveSupplier(s)}
                              disabled={busy}
                              type="button"
                            >
                              <Trash2 size={13} /> Törlés
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {!filtered.length && (
                  <p className="rounded-xl border border-white/10 bg-slate-950/20 px-3 py-6 text-center text-sm text-white/72">
                    Nincs beszállító ebben a szűrésben.
                  </p>
                )}
              </div>

              <div className="hidden overflow-auto rounded-xl border border-white/18 md:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#151f2d] text-xs uppercase tracking-[0.09em] text-white/92">
                    <tr>
                      <th className="px-3 py-2 font-normal">Beszállító</th>
                      <th className="px-3 py-2 font-normal">Kód</th>
                      <th className="px-3 py-2 font-normal">Státusz</th>
                      <th className="px-3 py-2 text-right font-normal">
                        Bevételezések
                      </th>
                      <th className="px-3 py-2 text-right font-normal">
                        Darab
                      </th>
                      <th className="px-3 py-2 text-right font-normal">
                        Vásárlási érték
                      </th>
                      <th className="px-3 py-2 font-normal">Utolsó vásárlás</th>
                      <th className="px-3 py-2 text-right font-normal">
                        Műveletek
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/18">
                    {filtered.map((s) => {
                      const r = reportBySupplier.get(s.id);
                      const editing = editingId === s.id;
                      return (
                        <tr
                          key={s.id}
                          className="bg-[#4a5669] align-top hover:bg-[#536176]"
                        >
                          <td className="px-3 py-2.5">
                            {editing ? (
                              <input
                                className={`${input} w-full min-w-[210px]`}
                                value={editForm.name}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    name: e.target.value,
                                  }))
                                }
                              />
                            ) : (
                              <div>
                                <button
                                  className="text-left font-normal text-white hover:text-emerald-100"
                                  onClick={() => setSelectedSupplierId(s.id)}
                                  type="button"
                                >
                                  {s.name}
                                </button>
                                {s.notes && (
                                  <p className="mt-1 max-w-[360px] text-xs leading-5 text-white/64">
                                    {s.notes}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {editing ? (
                              <input
                                className={`${input} w-40`}
                                value={editForm.code}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    code: normalizeCode(e.target.value),
                                  }))
                                }
                              />
                            ) : (
                              <span className="font-mono text-xs text-white/78">
                                {s.code}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`${chip} ${s.is_active ? "border-emerald-300/35 text-emerald-100" : "border-white/18 text-white/66"}`}
                            >
                              {s.is_active ? "Aktív" : "Inaktív"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {numberFmt(r?.purchase_batches)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {numberFmt(r?.purchase_qty)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {money(r?.purchase_value)}
                          </td>
                          <td className="px-3 py-2.5">
                            {dateOnly(r?.last_purchase_at)}
                          </td>
                          <td className="px-3 py-2.5">
                            {editing ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  className={primaryBtn}
                                  onClick={() => saveEdit(s.id)}
                                  disabled={busy}
                                  type="button"
                                >
                                  <Check size={14} /> Mentés
                                </button>
                                <button
                                  className={neutralBtn}
                                  onClick={() => setEditingId("")}
                                  type="button"
                                >
                                  <X size={14} /> Mégse
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-1.5 whitespace-nowrap">
                                <button
                                  className={tinyBtn}
                                  onClick={() => setSelectedSupplierId(s.id)}
                                  type="button"
                                >
                                  Adatok
                                </button>
                                <button
                                  className={tinyBtn}
                                  onClick={() => startEdit(s)}
                                  type="button"
                                >
                                  <Edit3 size={13} /> Módosít
                                </button>
                                <button
                                  className={tinyBtn}
                                  onClick={() => toggleActive(s)}
                                  disabled={busy}
                                  type="button"
                                >
                                  <Power size={13} />{" "}
                                  {s.is_active ? "Inaktív" : "Aktív"}
                                </button>
                                <button
                                  className={tinyDangerBtn}
                                  onClick={() => askRemoveSupplier(s)}
                                  disabled={busy}
                                  type="button"
                                >
                                  <Trash2 size={13} /> Törlés
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!filtered.length && (
                      <tr>
                        <td
                          className="px-3 py-7 text-center text-white/78"
                          colSpan={8}
                        >
                          Nincs beszállító ebben a szűrésben.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
