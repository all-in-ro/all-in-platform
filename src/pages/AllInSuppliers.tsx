import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
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

const page = "min-h-screen bg-[#4b5362] px-4 py-6 text-white font-normal sm:py-8";
const wrap = "mx-auto max-w-7xl space-y-5";
const card = "rounded-2xl border border-white/15 bg-white/8 p-4 shadow-lg sm:p-5";
const input = "h-11 rounded-xl border border-white/20 bg-slate-900/40 px-3 text-white outline-none focus:border-white/50 font-normal placeholder:text-white/35";
const textarea = "min-h-[88px] rounded-xl border border-white/20 bg-slate-900/40 px-3 py-3 text-white outline-none focus:border-white/50 font-normal placeholder:text-white/35";
const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-[#354153] px-4 text-sm text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal transition";
const redBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-300/30 bg-[#c90d22] px-4 text-sm text-white hover:bg-[#a90c1d] disabled:cursor-not-allowed disabled:opacity-50 font-normal transition";
const softBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/8 px-3 text-sm text-white/85 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50 font-normal transition";
const chip = "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-normal";
const modalBackdrop = "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm";
const modalCard = "w-full max-w-md rounded-2xl border border-white/15 bg-[#4b5362] p-5 text-white shadow-2xl";

type FormState = {
  name: string;
  code: string;
  notes: string;
};

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
  return n.toFixed(2);
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

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const [sData, rData] = await Promise.all([
        apiAifListSuppliers({ includeInactive, withStats: true }),
        apiAifSupplierReport({ from, to, includeInactive }),
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  function updateFormName(name: string) {
    setForm((f) => ({ ...f, name, code: f.code ? f.code : normalizeCode(name) }));
  }

  async function createSupplier() {
    if (!form.name.trim()) {
      setMessage("A beszállító neve kötelező. Sajnos a gondolatolvasó modul még mindig nem termel pénzt.");
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
      setMessage(s.is_active ? "Beszállító kikapcsolva." : "Beszállító újra aktív.");
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
      setMessage(result.mode === "deleted" ? "Beszállító törölve." : "Beszállító kikapcsolva, mert már van hozzá előzmény.");
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
              <div className="mt-0.5 rounded-xl border border-red-300/25 bg-red-500/15 p-2 text-red-100">
                <AlertTriangle size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p id="supplier-delete-title" className="text-lg font-normal">Beszállító törlése</p>
                <p className="mt-2 text-sm leading-6 text-white/72">
                  Biztos törlöd ezt a beszállítót?
                </p>
                <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 px-3 py-3">
                  <p className="text-base font-normal text-white">{deleteTarget.name}</p>
                  <p className="mt-1 font-mono text-xs text-white/55">{deleteTarget.code}</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/60">
                  Ha már van hozzá bevételezés, fizikailag nem töröljük, csak inaktívra kapcsoljuk, hogy a kimutatás ne menjen levesbe. Tudom, radikális ötlet: adatot nem rontunk el szándékosan.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className={`${softBtn} w-full sm:w-auto`} onClick={() => setDeleteTarget(null)} disabled={busy} type="button">
                <X size={16} /> Mégse
              </button>
              <button className={`${redBtn} w-full sm:w-auto`} onClick={confirmRemoveSupplier} disabled={busy} type="button">
                <Trash2 size={16} /> Törlés
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={wrap}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/60">AllInFashion</p>
            <h1 className="text-2xl font-normal tracking-tight">Beszállítók</h1>
            <p className="mt-1 text-sm text-white/70">
              Valódi beszállítók kezelése, vásárlási kimutatás, import alapadatok. ForIT nem beszállító, hanem rendszer, nehogy már a kalapácsot is számlázzuk mint árut.
            </p>
          </div>
          <button className={btn} onClick={goHome} type="button">
            <ArrowLeft size={17} /> Vissza
          </button>
        </header>

        {message && (
          <div className="rounded-xl border border-white/20 bg-slate-900/35 px-4 py-3 text-sm text-white/85">
            {message}
          </div>
        )}

        <section className={card}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl bg-slate-900/35 p-4">
              <p className="text-xs text-white/55">Aktív beszállító</p>
              <p className="mt-1 text-xl font-normal">{suppliers.filter((s) => s.is_active).length}</p>
            </div>
            <div className="rounded-xl bg-slate-900/35 p-4">
              <p className="text-xs text-white/55">Import batch</p>
              <p className="mt-1 text-xl font-normal">{totals.purchase_batches}</p>
            </div>
            <div className="rounded-xl bg-slate-900/35 p-4">
              <p className="text-xs text-white/55">Vásárolt db</p>
              <p className="mt-1 text-xl font-normal">{totals.purchase_qty}</p>
            </div>
            <div className="rounded-xl bg-slate-900/35 p-4">
              <p className="text-xs text-white/55">Vásárlási érték</p>
              <p className="mt-1 text-xl font-normal">{money(totals.purchase_value)}</p>
            </div>
            <div className="rounded-xl bg-slate-900/35 p-4">
              <p className="text-xs text-white/55">Ár nélküli sor</p>
              <p className="mt-1 text-xl font-normal">{totals.rows_without_buy_price}</p>
            </div>
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-[220px] flex-1 gap-2 text-sm text-white/75">
              Keresés
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 text-white/40" size={18} />
                <input
                  className={`${input} w-full pl-10`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="név, kód, megjegyzés"
                />
              </div>
            </label>

            <label className="grid gap-2 text-sm text-white/75">
              Ettől
              <input className={input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm text-white/75">
              Eddig
              <input className={input} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>

            <label className="flex h-11 items-center gap-2 rounded-xl border border-white/20 bg-slate-900/30 px-3 text-sm text-white/75">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Inaktívak is
            </label>

            <button className={btn} onClick={load} disabled={busy} type="button">
              <RefreshCw size={17} /> Frissítés
            </button>
          </div>
        </section>

        <section className={card}>
          <div className="mb-4 flex items-center gap-2 text-white/90">
            <Plus size={18} />
            <h2 className="text-lg font-normal">Új beszállító</h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-5">
            <label className="grid gap-2 text-sm text-white/75 lg:col-span-2">
              Név
              <input className={input} value={form.name} onChange={(e) => updateFormName(e.target.value)} placeholder="pl. Under Armour Europe" />
            </label>
            <label className="grid gap-2 text-sm text-white/75">
              Kód
              <input className={input} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: normalizeCode(e.target.value) }))} placeholder="under_armour_eu" />
            </label>
            <label className="grid gap-2 text-sm text-white/75 lg:col-span-2">
              Megjegyzés
              <input className={input} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="kapcsolat, feltétel, árlista típusa" />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button className={redBtn} onClick={createSupplier} disabled={busy} type="button">
              <Save size={17} /> Mentés
            </button>
          </div>
        </section>

        <section className={card}>
          <div className="mb-4 flex items-center gap-2 text-white/90">
            <Building2 size={18} />
            <h2 className="text-lg font-normal">Beszállítói lista</h2>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((s) => {
              const r = reportBySupplier.get(s.id);
              const editing = editingId === s.id;
              return (
                <div key={s.id} className="rounded-xl border border-white/10 bg-slate-900/30 p-4">
                  {editing ? (
                    <div className="grid gap-3">
                      <input className={input} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                      <input className={input} value={editForm.code} onChange={(e) => setEditForm((f) => ({ ...f, code: normalizeCode(e.target.value) }))} />
                      <textarea className={textarea} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
                      <div className="flex flex-wrap gap-2">
                        <button className={redBtn} onClick={() => saveEdit(s.id)} disabled={busy} type="button"><Check size={16} /> Mentés</button>
                        <button className={softBtn} onClick={() => setEditingId("")} type="button"><X size={16} /> Mégse</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-normal text-white">{s.name}</p>
                          <p className="mt-1 text-xs text-white/50">{s.code}</p>
                        </div>
                        <span className={`${chip} ${s.is_active ? "border-emerald-300/35 text-emerald-100" : "border-white/20 text-white/50"}`}>
                          {s.is_active ? "Aktív" : "Inaktív"}
                        </span>
                      </div>
                      {s.notes && <p className="mt-3 text-sm text-white/65">{s.notes}</p>}
                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-white/6 p-3"><p className="text-xs text-white/45">Batch</p><p>{r?.purchase_batches || 0}</p></div>
                        <div className="rounded-lg bg-white/6 p-3"><p className="text-xs text-white/45">Db</p><p>{r?.purchase_qty || 0}</p></div>
                        <div className="rounded-lg bg-white/6 p-3"><p className="text-xs text-white/45">Érték</p><p>{money(r?.purchase_value)}</p></div>
                        <div className="rounded-lg bg-white/6 p-3"><p className="text-xs text-white/45">Utolsó</p><p>{dateOnly(r?.last_purchase_at)}</p></div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button className={softBtn} onClick={() => startEdit(s)} type="button"><Edit3 size={16} /> Szerkesztés</button>
                        <button className={softBtn} onClick={() => toggleActive(s)} disabled={busy} type="button"><Power size={16} /> {s.is_active ? "Kikapcs." : "Aktív"}</button>
                        <button className={redBtn} onClick={() => askRemoveSupplier(s)} disabled={busy} type="button"><Trash2 size={16} /> Törlés</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {!filtered.length && <p className="text-sm text-white/60">Nincs beszállító ebben a szűrésben.</p>}
          </div>

          <div className="hidden overflow-auto rounded-xl border border-white/10 md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-xs uppercase text-white/55">
                <tr>
                  <th className="px-3 py-3 font-normal">Beszállító</th>
                  <th className="px-3 py-3 font-normal">Kód</th>
                  <th className="px-3 py-3 font-normal">Státusz</th>
                  <th className="px-3 py-3 text-right font-normal">Batch</th>
                  <th className="px-3 py-3 text-right font-normal">Db</th>
                  <th className="px-3 py-3 text-right font-normal">Érték</th>
                  <th className="px-3 py-3 font-normal">Utolsó vásárlás</th>
                  <th className="px-3 py-3 font-normal">Művelet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map((s) => {
                  const r = reportBySupplier.get(s.id);
                  const editing = editingId === s.id;
                  return (
                    <tr key={s.id} className="bg-white/[0.03] align-top hover:bg-white/[0.06]">
                      <td className="px-3 py-3">
                        {editing ? (
                          <input className={`${input} w-full min-w-[220px]`} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                        ) : (
                          <div>
                            <p className="font-normal text-white">{s.name}</p>
                            {s.notes && <p className="mt-1 max-w-[360px] text-xs text-white/50">{s.notes}</p>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {editing ? (
                          <input className={`${input} w-44`} value={editForm.code} onChange={(e) => setEditForm((f) => ({ ...f, code: normalizeCode(e.target.value) }))} />
                        ) : (
                          <span className="font-mono text-xs text-white/70">{s.code}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`${chip} ${s.is_active ? "border-emerald-300/35 text-emerald-100" : "border-white/20 text-white/50"}`}>
                          {s.is_active ? "Aktív" : "Inaktív"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">{r?.purchase_batches || 0}</td>
                      <td className="px-3 py-3 text-right">{r?.purchase_qty || 0}</td>
                      <td className="px-3 py-3 text-right">{money(r?.purchase_value)}</td>
                      <td className="px-3 py-3">{dateOnly(r?.last_purchase_at)}</td>
                      <td className="px-3 py-3">
                        {editing ? (
                          <div className="flex flex-wrap gap-2">
                            <button className={redBtn} onClick={() => saveEdit(s.id)} disabled={busy} type="button"><Check size={16} /> Mentés</button>
                            <button className={softBtn} onClick={() => setEditingId("")} type="button"><X size={16} /> Mégse</button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button className={softBtn} onClick={() => startEdit(s)} type="button"><Edit3 size={16} /> Szerkesztés</button>
                            <button className={softBtn} onClick={() => toggleActive(s)} disabled={busy} type="button"><Power size={16} /> {s.is_active ? "Kikapcs." : "Aktív"}</button>
                            <button className={redBtn} onClick={() => askRemoveSupplier(s)} disabled={busy} type="button"><Trash2 size={16} /> Törlés</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr>
                    <td className="px-3 py-8 text-center text-white/55" colSpan={8}>Nincs beszállító ebben a szűrésben.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={card}>
          <div className="mb-3 flex items-center gap-2 text-white/90">
            <BarChart3 size={18} />
            <h2 className="text-lg font-normal">Kimutatás értelmezése</h2>
          </div>
          <p className="text-sm leading-6 text-white/70">
            A vásárlási érték a commitolt import sorokból számol: darab × vételár. Ha egy XLS nem küld vételárat, a sor darabszáma látszik, de az értéke 0 lesz, mert az adatbázis sem jósnő. Ezt később külön hibaként kiemeljük az import előnézetben.
          </p>
        </section>
      </div>
    </main>
  );
}
