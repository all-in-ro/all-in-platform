import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  Check,
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

const page = "min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-5 sm:py-5";
const wrap = "mx-auto max-w-7xl space-y-3";
const card = "rounded-xl border border-white/14 bg-white/[0.052] p-3 shadow-md sm:p-4";
const sectionTitle = "flex items-center gap-2 text-base text-white/92";
const label = "grid gap-1.5 text-xs text-white/72";
const input = "h-8 rounded-lg border border-white/18 !bg-[#2f3848] px-3 text-sm !text-white caret-white outline-none transition placeholder:text-white/38 selection:bg-emerald-300/35 focus:border-white/45 [color-scheme:dark] font-normal";
const textarea = "min-h-[68px] rounded-lg border border-white/18 !bg-[#2f3848] px-3 py-2 text-sm !text-white caret-white outline-none transition placeholder:text-white/38 selection:bg-emerald-300/35 focus:border-white/45 font-normal";
const btnBase = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs text-white transition disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = `${btnBase} border-emerald-300/20 bg-[#2f6959] hover:bg-[#347564]`;
const neutralBtn = `${btnBase} border-white/18 bg-[#354153] hover:bg-[#3d495b]`;
const dangerBtn = `${btnBase} border-red-300/20 bg-[#c90d22] hover:bg-[#a90c1d]`;
const tinyBtn = "inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-white/16 bg-white/[0.055] px-2 text-xs text-white/86 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const tinyDangerBtn = "inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-red-300/20 bg-[#c90d22] px-2 text-xs text-white transition hover:bg-[#a90c1d] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const chip = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-normal";
const statCard = "rounded-lg border border-white/10 bg-slate-950/22 px-3 py-2";
const modalBackdrop = "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4 py-6 backdrop-blur-sm";
const modalCard = "w-full max-w-sm rounded-xl border border-white/16 bg-[#4b5362] p-4 text-white shadow-2xl";

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
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberFmt(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ro-RO");
}

function percentFmt(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0%";
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

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
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

export default function AllInSuppliers() {
  const [suppliers, setSuppliers] = useState<AifSupplierDetail[]>([]);
  const [report, setReport] = useState<AifSupplierReportItem[]>([]);
  const [totals, setTotals] = useState<AifSupplierReportTotals>(emptyTotals());
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [form, setForm] = useState<FormState>({ name: "", code: "", notes: "" });
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState<FormState>({ name: "", code: "", notes: "" });
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AifSupplierDetail | null>(null);

  const reportBySupplier = useMemo(() => {
    const map = new Map<string, AifSupplierReportItem>();
    for (const r of report) map.set(r.id, r);
    return map;
  }, [report]);

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
    return [...report].sort((a, b) => Number(b.purchase_value || 0) - Number(a.purchase_value || 0));
  }, [report]);

  const selectedReport = useMemo(() => {
    if (selectedSupplierId) {
      const found = reportBySupplier.get(selectedSupplierId);
      if (found) return found;
    }
    return sortedReport[0] || null;
  }, [reportBySupplier, selectedSupplierId, sortedReport]);

  const selectedSupplier = useMemo(() => {
    if (!selectedReport) return null;
    return suppliers.find((s) => s.id === selectedReport.id) || null;
  }, [selectedReport, suppliers]);

  const maxReportValue = useMemo(() => {
    return Math.max(1, ...sortedReport.map((r) => Number(r.purchase_value || 0)));
  }, [sortedReport]);

  const totalPurchaseValue = Number(totals.purchase_value || 0);
  const selectedPurchaseValue = Number(selectedReport?.purchase_value || 0);
  const selectedShare = totalPurchaseValue > 0 ? (selectedPurchaseValue / totalPurchaseValue) * 100 : 0;
  const selectedAvgBatch = Number(selectedReport?.purchase_batches || 0) > 0
    ? selectedPurchaseValue / Number(selectedReport?.purchase_batches || 1)
    : 0;
  const selectedAvgQtyValue = Number(selectedReport?.purchase_qty || 0) > 0
    ? selectedPurchaseValue / Number(selectedReport?.purchase_qty || 1)
    : 0;

  async function load(next?: { from?: string; to?: string; includeInactive?: boolean }) {
    const nextFrom = next?.from ?? from;
    const nextTo = next?.to ?? to;
    const nextIncludeInactive = next?.includeInactive ?? includeInactive;

    setBusy(true);
    setMessage("");
    try {
      const [sData, rData] = await Promise.all([
        apiAifListSuppliers({ includeInactive: nextIncludeInactive, withStats: true }),
        apiAifSupplierReport({ from: nextFrom, to: nextTo, includeInactive: nextIncludeInactive }),
      ]);
      setSuppliers(sData.items || []);
      setReport(rData.items || []);
      setTotals(rData.totals || emptyTotals());
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
    load({ from: "", to: "" });
  }

  function updateFormName(name: string) {
    setForm((f) => ({ ...f, name, code: f.code ? f.code : normalizeCode(name) }));
  }

  async function createSupplier() {
    if (!form.name.trim()) {
      setMessage("A beszállító neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiAifCreateSupplier({ name: form.name, code: form.code || normalizeCode(form.name), notes: form.notes });
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
    setEditForm({ name: s.name || "", code: s.code || "", notes: s.notes || "" });
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
      setMessage(s.is_active ? "Beszállító inaktiválva." : "Beszállító aktiválva.");
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
      setMessage(result.mode === "deleted" ? "Beszállító törölve." : "Beszállító inaktiválva, mert van hozzá előzmény.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={page}>
      {deleteTarget && (
        <div className={modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="supplier-delete-title">
          <div className={modalCard}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg border border-red-300/20 bg-red-500/12 p-2 text-red-100">
                <Trash2 size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p id="supplier-delete-title" className="text-base font-normal">Beszállító törlése</p>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Biztosan törlöd ezt a beszállítót?
                </p>
                <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/28 px-3 py-2.5">
                  <p className="text-sm font-normal text-white">{deleteTarget.name}</p>
                  <p className="mt-1 font-mono text-xs text-white/55">{deleteTarget.code}</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/62">
                  Ha már kapcsolódik hozzá bevételezés, a rendszer nem törli fizikailag, csak inaktívra állítja, hogy a kimutatások megmaradjanak.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className={`${neutralBtn} w-full sm:w-auto`} onClick={() => setDeleteTarget(null)} disabled={busy} type="button">
                <X size={15} /> Mégse
              </button>
              <button className={`${dangerBtn} w-full sm:w-auto`} onClick={confirmRemoveSupplier} disabled={busy} type="button">
                <Trash2 size={15} /> Törlés
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={wrap}>
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-white/55">AllInFashion</p>
            <h1 className="mt-1 text-xl font-normal tracking-tight sm:text-2xl">Beszállítók</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-white/68">
              Beszállítói törzsadatok, import alapadatok és vásárlási kimutatások kezelése.
            </p>
          </div>
          <button className={neutralBtn} onClick={goHome} type="button">
            <ArrowLeft size={15} /> Vissza
          </button>
        </header>

        {message && (
          <div className="rounded-lg border border-white/18 bg-slate-950/25 px-3 py-2 text-sm text-white/82">
            {message}
          </div>
        )}

        <section className={card}>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={`${label} sm:col-span-2 lg:col-span-1`}>
                Keresés
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/42" size={15} />
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
                <input className={`${input} w-full`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className={label}>
                Időszak vége
                <input className={`${input} w-full`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
            <button className={neutralBtn} onClick={() => load()} disabled={busy} type="button">
              <RefreshCw size={14} /> Frissítés
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button className={tinyBtn} onClick={() => applyPeriod(currentYearRange())} type="button">Idei év</button>
            <button className={tinyBtn} onClick={() => applyPeriod(previousYearRange())} type="button">Tavaly</button>
            <button className={tinyBtn} onClick={() => applyPeriod(currentMonthRange())} type="button">Aktuális hónap</button>
            <button className={tinyBtn} onClick={() => applyPeriod(last12MonthsRange())} type="button">Utolsó 12 hónap</button>
            <button className={tinyBtn} onClick={clearPeriod} type="button">Teljes időszak</button>
          </div>
        </section>

        <section className={card}>
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className={sectionTitle}>
              <BarChart3 size={17} />
              <h2 className="text-base font-normal">Vásárlási kimutatás</h2>
            </div>
            <label className="grid gap-1.5 text-xs text-white/72 lg:w-72">
              Beszállító részletezése
              <select
                className={`${input} w-full`}
                value={selectedReport?.id || selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                {sortedReport.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
                {!sortedReport.length && <option value="">Nincs adat</option>}
              </select>
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className={statCard}>
              <p className="text-xs text-white/48">Beszállítók</p>
              <p className="mt-1 text-lg font-normal">{numberFmt(suppliers.length)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-white/48">Batch</p>
              <p className="mt-1 text-lg font-normal">{numberFmt(totals.purchase_batches)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-white/48">Sor</p>
              <p className="mt-1 text-lg font-normal">{numberFmt(totals.purchase_rows)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-white/48">Darab</p>
              <p className="mt-1 text-lg font-normal">{numberFmt(totals.purchase_qty)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-white/48">Érték</p>
              <p className="mt-1 text-lg font-normal">{money(totals.purchase_value)}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.25fr]">
            <div className="rounded-xl border border-white/10 bg-slate-950/18 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm text-white/86">Kiválasztott beszállító</p>
                {selectedSupplier && (
                  <span className={`${chip} ${selectedSupplier.is_active ? "border-emerald-300/35 text-emerald-100" : "border-white/18 text-white/52"}`}>
                    {selectedSupplier.is_active ? "Aktív" : "Inaktív"}
                  </span>
                )}
              </div>
              <p className="text-lg font-normal text-white">{selectedReport?.name || "Nincs adat"}</p>
              <p className="mt-1 font-mono text-xs text-white/50">{selectedReport?.code || "-"}</p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white/[0.055] p-2.5">
                  <p className="text-xs text-white/46">Érték</p>
                  <p className="mt-1">{money(selectedReport?.purchase_value)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.055] p-2.5">
                  <p className="text-xs text-white/46">Részesedés</p>
                  <p className="mt-1">{percentFmt(selectedShare)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.055] p-2.5">
                  <p className="text-xs text-white/46">Darab</p>
                  <p className="mt-1">{numberFmt(selectedReport?.purchase_qty)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.055] p-2.5">
                  <p className="text-xs text-white/46">Batch</p>
                  <p className="mt-1">{numberFmt(selectedReport?.purchase_batches)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.055] p-2.5">
                  <p className="text-xs text-white/46">Átlag / batch</p>
                  <p className="mt-1">{money(selectedAvgBatch)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.055] p-2.5">
                  <p className="text-xs text-white/46">Átlag / darab</p>
                  <p className="mt-1">{money(selectedAvgQtyValue)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.055] p-2.5">
                  <p className="text-xs text-white/46">Vételár nélküli sor</p>
                  <p className="mt-1">{numberFmt(selectedReport?.rows_without_buy_price)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.055] p-2.5">
                  <p className="text-xs text-white/46">Utolsó vásárlás</p>
                  <p className="mt-1">{dateOnly(selectedReport?.last_purchase_at)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/18 p-3">
              <p className="mb-3 text-sm text-white/86">Beszállítói rangsor</p>
              <div className="grid gap-2">
                {sortedReport.map((r) => {
                  const value = Number(r.purchase_value || 0);
                  const width = Math.max(2, Math.round((value / maxReportValue) * 100));
                  const active = selectedReport?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      className={`rounded-lg border px-3 py-2 text-left transition ${active ? "border-emerald-300/40 bg-emerald-400/8" : "border-white/10 bg-white/[0.035] hover:bg-white/[0.06]"}`}
                      onClick={() => setSelectedSupplierId(r.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-white/90">{r.name}</span>
                        <span className="shrink-0 text-white/78">{money(r.purchase_value)}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-950/38">
                        <div className="h-full rounded-full bg-emerald-300/70" style={{ width: `${width}%` }} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/50">
                        <span>{numberFmt(r.purchase_qty)} db</span>
                        <span>{numberFmt(r.purchase_batches)} batch</span>
                        <span>{dateOnly(r.last_purchase_at)}</span>
                      </div>
                    </button>
                  );
                })}
                {!sortedReport.length && (
                  <p className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-6 text-center text-sm text-white/55">
                    Nincs vásárlási adat a kiválasztott időszakban.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={card}>
          <div className={sectionTitle}>
            <Plus size={16} />
            <h2 className="text-base font-normal">Új beszállító</h2>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[2fr_1fr_2fr_auto] lg:items-end">
            <label className={label}>
              Név
              <input className={`${input} w-full`} value={form.name} onChange={(e) => updateFormName(e.target.value)} placeholder="pl. Under Armour Europe" />
            </label>
            <label className={label}>
              Kód
              <input className={`${input} w-full`} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: normalizeCode(e.target.value) }))} placeholder="under_armour_eu" />
            </label>
            <label className={label}>
              Megjegyzés
              <input className={`${input} w-full`} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="kapcsolat, feltétel, árlista típusa" />
            </label>
            <button className={primaryBtn} onClick={createSupplier} disabled={busy} type="button">
              <Save size={14} /> Mentés
            </button>
          </div>
        </section>

        <section className={card}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className={sectionTitle}>
              <Building2 size={16} />
              <h2 className="text-base font-normal">Beszállítói lista</h2>
            </div>
            <p className="text-xs text-white/48">{filtered.length} találat</p>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((s) => {
              const r = reportBySupplier.get(s.id);
              const editing = editingId === s.id;
              return (
                <div key={s.id} className="rounded-xl border border-white/10 bg-slate-950/20 p-3">
                  {editing ? (
                    <div className="grid gap-2.5">
                      <input className={`${input} w-full`} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                      <input className={`${input} w-full`} value={editForm.code} onChange={(e) => setEditForm((f) => ({ ...f, code: normalizeCode(e.target.value) }))} />
                      <textarea className={textarea} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
                      <div className="grid grid-cols-2 gap-2">
                        <button className={primaryBtn} onClick={() => saveEdit(s.id)} disabled={busy} type="button"><Check size={14} /> Mentés</button>
                        <button className={neutralBtn} onClick={() => setEditingId("")} type="button"><X size={14} /> Mégse</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <button className="min-w-0 text-left" onClick={() => setSelectedSupplierId(s.id)} type="button">
                          <p className="text-sm font-normal text-white">{s.name}</p>
                          <p className="mt-1 break-all font-mono text-xs text-white/52">{s.code}</p>
                        </button>
                        <span className={`${chip} ${s.is_active ? "border-emerald-300/35 text-emerald-100" : "border-white/18 text-white/52"}`}>
                          {s.is_active ? "Aktív" : "Inaktív"}
                        </span>
                      </div>
                      {s.notes && <p className="mt-2 text-sm leading-6 text-white/62">{s.notes}</p>}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-white/[0.055] p-2.5"><p className="text-xs text-white/44">Batch</p><p>{numberFmt(r?.purchase_batches)}</p></div>
                        <div className="rounded-lg bg-white/[0.055] p-2.5"><p className="text-xs text-white/44">Db</p><p>{numberFmt(r?.purchase_qty)}</p></div>
                        <div className="rounded-lg bg-white/[0.055] p-2.5"><p className="text-xs text-white/44">Érték</p><p>{money(r?.purchase_value)}</p></div>
                        <div className="rounded-lg bg-white/[0.055] p-2.5"><p className="text-xs text-white/44">Utolsó</p><p>{dateOnly(r?.last_purchase_at)}</p></div>
                      </div>
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        <button className={tinyBtn} onClick={() => setSelectedSupplierId(s.id)} type="button">Kimut.</button>
                        <button className={tinyBtn} onClick={() => startEdit(s)} type="button"><Edit3 size={13} /> Szerk.</button>
                        <button className={tinyBtn} onClick={() => toggleActive(s)} disabled={busy} type="button"><Power size={13} /> {s.is_active ? "Inaktív" : "Aktív"}</button>
                        <button className={tinyDangerBtn} onClick={() => askRemoveSupplier(s)} disabled={busy} type="button"><Trash2 size={13} /> Törlés</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {!filtered.length && <p className="rounded-xl border border-white/10 bg-slate-950/20 px-3 py-6 text-center text-sm text-white/58">Nincs beszállító ebben a szűrésben.</p>}
          </div>

          <div className="hidden overflow-auto rounded-xl border border-white/10 md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-950/35 text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th className="px-3 py-2 font-normal">Beszállító</th>
                  <th className="px-3 py-2 font-normal">Kód</th>
                  <th className="px-3 py-2 font-normal">Státusz</th>
                  <th className="px-3 py-2 text-right font-normal">Batch</th>
                  <th className="px-3 py-2 text-right font-normal">Db</th>
                  <th className="px-3 py-2 text-right font-normal">Érték</th>
                  <th className="px-3 py-2 font-normal">Utolsó vásárlás</th>
                  <th className="px-3 py-2 text-right font-normal">Művelet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/9">
                {filtered.map((s) => {
                  const r = reportBySupplier.get(s.id);
                  const editing = editingId === s.id;
                  return (
                    <tr key={s.id} className="bg-white/[0.025] align-top hover:bg-white/[0.045]">
                      <td className="px-3 py-2.5">
                        {editing ? (
                          <input className={`${input} w-full min-w-[210px]`} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                        ) : (
                          <div>
                            <button className="text-left font-normal text-white hover:text-emerald-100" onClick={() => setSelectedSupplierId(s.id)} type="button">
                              {s.name}
                            </button>
                            {s.notes && <p className="mt-1 max-w-[360px] text-xs leading-5 text-white/50">{s.notes}</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {editing ? (
                          <input className={`${input} w-40`} value={editForm.code} onChange={(e) => setEditForm((f) => ({ ...f, code: normalizeCode(e.target.value) }))} />
                        ) : (
                          <span className="font-mono text-xs text-white/68">{s.code}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`${chip} ${s.is_active ? "border-emerald-300/35 text-emerald-100" : "border-white/18 text-white/52"}`}>
                          {s.is_active ? "Aktív" : "Inaktív"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{numberFmt(r?.purchase_batches)}</td>
                      <td className="px-3 py-2.5 text-right">{numberFmt(r?.purchase_qty)}</td>
                      <td className="px-3 py-2.5 text-right">{money(r?.purchase_value)}</td>
                      <td className="px-3 py-2.5">{dateOnly(r?.last_purchase_at)}</td>
                      <td className="px-3 py-2.5">
                        {editing ? (
                          <div className="flex justify-end gap-2">
                            <button className={primaryBtn} onClick={() => saveEdit(s.id)} disabled={busy} type="button"><Check size={14} /> Mentés</button>
                            <button className={neutralBtn} onClick={() => setEditingId("")} type="button"><X size={14} /> Mégse</button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5 whitespace-nowrap">
                            <button className={tinyBtn} onClick={() => setSelectedSupplierId(s.id)} type="button">Kimut.</button>
                            <button className={tinyBtn} onClick={() => startEdit(s)} type="button"><Edit3 size={13} /> Szerk.</button>
                            <button className={tinyBtn} onClick={() => toggleActive(s)} disabled={busy} type="button"><Power size={13} /> {s.is_active ? "Inaktív" : "Aktív"}</button>
                            <button className={tinyDangerBtn} onClick={() => askRemoveSupplier(s)} disabled={busy} type="button"><Trash2 size={13} /> Törlés</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr>
                    <td className="px-3 py-7 text-center text-white/55" colSpan={8}>Nincs beszállító ebben a szűrésben.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
