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

const page = "min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-5 sm:py-6";
const wrap = "mx-auto max-w-7xl space-y-4";
const card = "rounded-2xl border border-white/14 bg-white/[0.055] p-3 shadow-md sm:p-4";
const sectionTitle = "flex items-center gap-2 text-base text-white/92";
const label = "grid gap-1.5 text-xs text-white/70";
const input = "h-9 rounded-lg border border-white/18 bg-slate-950/28 px-3 text-sm text-white outline-none transition placeholder:text-white/34 focus:border-white/45 font-normal";
const textarea = "min-h-[74px] rounded-lg border border-white/18 bg-slate-950/28 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/34 focus:border-white/45 font-normal";
const btnBase = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm text-white transition disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = `${btnBase} border-emerald-300/20 bg-[#2f6959] hover:bg-[#347564]`;
const neutralBtn = `${btnBase} border-white/18 bg-[#354153] hover:bg-[#3d495b]`;
const dangerBtn = `${btnBase} border-red-300/20 bg-[#c90d22] hover:bg-[#a90c1d]`;
const tinyBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/16 bg-white/[0.055] px-2.5 text-xs text-white/86 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const tinyDangerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-300/20 bg-[#c90d22] px-2.5 text-xs text-white transition hover:bg-[#a90c1d] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const chip = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-normal";
const statCard = "rounded-xl border border-white/10 bg-slate-950/22 px-3 py-2.5";
const modalBackdrop = "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4 py-6 backdrop-blur-sm";
const modalCard = "w-full max-w-sm rounded-2xl border border-white/16 bg-[#4b5362] p-4 text-white shadow-2xl";

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
      setMessage(e.message || "Nu s-au putut încărca furnizorii.");
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
                <Trash2 size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p id="supplier-delete-title" className="text-base font-normal">Beszállító törlése</p>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Biztosan törölni szeretnéd ezt a beszállítót?
                </p>
                <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/28 px-3 py-2.5">
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
          <button className={`${neutralBtn} self-start`} onClick={goHome} type="button">
            <ArrowLeft size={16} /> Vissza
          </button>
        </header>

        {message && (
          <div className="rounded-xl border border-white/18 bg-slate-950/25 px-3 py-2.5 text-sm text-white/82">
            {message}
          </div>
        )}

        <section className={card}>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={`${label} sm:col-span-2 lg:col-span-1`}>
                Keresés
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/38" size={16} />
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
              <label className="flex h-9 items-center gap-2 self-end rounded-lg border border-white/18 bg-slate-950/22 px-3 text-sm text-white/78">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
                Inaktívak is
              </label>
            </div>
            <button className={neutralBtn} onClick={load} disabled={busy} type="button">
              <RefreshCw size={15} /> Frissítés
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className={statCard}>
              <p className="text-xs text-white/48">Beszállítók</p>
              <p className="mt-1 text-lg font-normal">{suppliers.length}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-white/48">Batch</p>
              <p className="mt-1 text-lg font-normal">{totals.purchase_batches}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-white/48">Sor</p>
              <p className="mt-1 text-lg font-normal">{totals.purchase_rows}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-white/48">Darab</p>
              <p className="mt-1 text-lg font-normal">{totals.purchase_qty}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs text-white/48">Érték</p>
              <p className="mt-1 text-lg font-normal">{money(totals.purchase_value)}</p>
            </div>
          </div>
        </section>

        <section className={card}>
          <div className={sectionTitle}>
            <Plus size={17} />
            <h2 className="text-base font-normal">Új beszállító</h2>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[2fr_1fr_2fr_auto] lg:items-end">
            <label className={label}>
              Név
              <input className={input} value={form.name} onChange={(e) => updateFormName(e.target.value)} placeholder="pl. Under Armour Europe" />
            </label>
            <label className={label}>
              Kód
              <input className={input} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: normalizeCode(e.target.value) }))} placeholder="under_armour_eu" />
            </label>
            <label className={label}>
              Megjegyzés
              <input className={input} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="kapcsolat, feltétel, árlista típusa" />
            </label>
            <button className={primaryBtn} onClick={createSupplier} disabled={busy} type="button">
              <Save size={15} /> Mentés
            </button>
          </div>
        </section>

        <section className={card}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className={sectionTitle}>
              <Building2 size={17} />
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
                      <input className={input} value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                      <input className={input} value={editForm.code} onChange={(e) => setEditForm((f) => ({ ...f, code: normalizeCode(e.target.value) }))} />
                      <textarea className={textarea} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
                      <div className="grid grid-cols-2 gap-2">
                        <button className={primaryBtn} onClick={() => saveEdit(s.id)} disabled={busy} type="button"><Check size={15} /> Mentés</button>
                        <button className={neutralBtn} onClick={() => setEditingId("")} type="button"><X size={15} /> Mégse</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-normal text-white">{s.name}</p>
                          <p className="mt-1 break-all font-mono text-xs text-white/52">{s.code}</p>
                        </div>
                        <span className={`${chip} ${s.is_active ? "border-emerald-300/35 text-emerald-100" : "border-white/18 text-white/52"}`}>
                          {s.is_active ? "Aktív" : "Inaktív"}
                        </span>
                      </div>
                      {s.notes && <p className="mt-2 text-sm leading-6 text-white/62">{s.notes}</p>}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-white/[0.055] p-2.5"><p className="text-xs text-white/44">Batch</p><p>{r?.purchase_batches || 0}</p></div>
                        <div className="rounded-lg bg-white/[0.055] p-2.5"><p className="text-xs text-white/44">Db</p><p>{r?.purchase_qty || 0}</p></div>
                        <div className="rounded-lg bg-white/[0.055] p-2.5"><p className="text-xs text-white/44">Érték</p><p>{money(r?.purchase_value)}</p></div>
                        <div className="rounded-lg bg-white/[0.055] p-2.5"><p className="text-xs text-white/44">Utolsó</p><p>{dateOnly(r?.last_purchase_at)}</p></div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button className={tinyBtn} onClick={() => startEdit(s)} type="button"><Edit3 size={14} /> Szerk.</button>
                        <button className={tinyBtn} onClick={() => toggleActive(s)} disabled={busy} type="button"><Power size={14} /> {s.is_active ? "Inaktív" : "Aktív"}</button>
                        <button className={tinyDangerBtn} onClick={() => askRemoveSupplier(s)} disabled={busy} type="button"><Trash2 size={14} /> Törlés</button>
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
                  <th className="px-3 py-2.5 font-normal">Beszállító</th>
                  <th className="px-3 py-2.5 font-normal">Kód</th>
                  <th className="px-3 py-2.5 font-normal">Státusz</th>
                  <th className="px-3 py-2.5 text-right font-normal">Batch</th>
                  <th className="px-3 py-2.5 text-right font-normal">Db</th>
                  <th className="px-3 py-2.5 text-right font-normal">Érték</th>
                  <th className="px-3 py-2.5 font-normal">Utolsó vásárlás</th>
                  <th className="px-3 py-2.5 text-right font-normal">Művelet</th>
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
                            <p className="font-normal text-white">{s.name}</p>
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
                      <td className="px-3 py-2.5 text-right">{r?.purchase_batches || 0}</td>
                      <td className="px-3 py-2.5 text-right">{r?.purchase_qty || 0}</td>
                      <td className="px-3 py-2.5 text-right">{money(r?.purchase_value)}</td>
                      <td className="px-3 py-2.5">{dateOnly(r?.last_purchase_at)}</td>
                      <td className="px-3 py-2.5">
                        {editing ? (
                          <div className="flex justify-end gap-2">
                            <button className={primaryBtn} onClick={() => saveEdit(s.id)} disabled={busy} type="button"><Check size={15} /> Mentés</button>
                            <button className={neutralBtn} onClick={() => setEditingId("")} type="button"><X size={15} /> Mégse</button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2 whitespace-nowrap">
                            <button className={tinyBtn} onClick={() => startEdit(s)} type="button"><Edit3 size={14} /> Szerk.</button>
                            <button className={tinyBtn} onClick={() => toggleActive(s)} disabled={busy} type="button"><Power size={14} /> {s.is_active ? "Inaktív" : "Aktív"}</button>
                            <button className={tinyDangerBtn} onClick={() => askRemoveSupplier(s)} disabled={busy} type="button"><Trash2 size={14} /> Törlés</button>
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

        <section className={card}>
          <div className="mb-2 flex items-center gap-2 text-white/90">
            <BarChart3 size={17} />
            <h2 className="text-base font-normal">Kimutatás értelmezése</h2>
          </div>
          <p className="text-sm leading-6 text-white/68">
            A vásárlási érték a lezárt import sorokból számol: darab × vételár. Ha egy import sorban nincs vételár, a darabszám szerepel a kimutatásban, az érték pedig 0 lesz. Ezeket a sorokat az import előnézetben külön jelöljük.
          </p>
        </section>
      </div>
    </main>
  );
}
