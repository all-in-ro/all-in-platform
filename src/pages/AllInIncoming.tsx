import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, CheckCircle, FileSpreadsheet, RefreshCw, UploadCloud } from "lucide-react";
import {
  AifImportBatchSummary,
  AifLocation,
  AifParsedRow,
  AifSupplier,
  apiAifCommitImportBatch,
  apiAifCreateImportBatch,
  apiAifListImportBatches,
  apiAifMeta,
  apiAifReplaceImportRows,
} from "../lib/aif/api";
import { readAifWorkbook } from "../lib/aif/xls";

type Props = { onLogout?: () => void };

const card = "rounded-2xl border border-white/15 bg-white/8 p-5 shadow-lg font-normal";
const input = "h-11 rounded-xl border border-white/20 bg-slate-900/40 px-3 text-white outline-none focus:border-white/50";
const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-[#354153] px-4 text-sm text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-300/30 bg-[#c90d22] px-4 text-sm text-white hover:bg-[#a90c1d] disabled:cursor-not-allowed disabled:opacity-50 font-normal";

function goHome() {
  window.location.hash = "#allin";
}

function cell(v: unknown) {
  const s = String(v ?? "").trim();
  return s || "-";
}

export default function AllInIncoming(_props: Props) {
  const [suppliers, setSuppliers] = useState<AifSupplier[]>([]);
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [batches, setBatches] = useState<AifImportBatchSummary[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<AifParsedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId]
  );

  const preview = useMemo(() => rows.slice(0, 25), [rows]);
  const rowProblems = useMemo(() => {
    return rows.filter((r) => {
      const n = r.normalized || {};
      return !n.titleRo || !n.size || !n.qty || Number(n.qty) <= 0;
    }).length;
  }, [rows]);

  async function loadMeta() {
    const meta = await apiAifMeta();
    setSuppliers(meta.suppliers.filter((x) => x.is_active));
    setLocations(meta.locations.filter((x) => x.is_active));
    setSupplierId((current) => current || meta.suppliers.find((x) => x.code === "under_armour")?.id || meta.suppliers[0]?.id || "");
    setLocationId((current) => current || meta.locations.find((x) => x.code === "main_warehouse")?.id || meta.locations[0]?.id || "");
  }

  async function loadBatches() {
    const data = await apiAifListImportBatches(25);
    setBatches(data.items || []);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadMeta();
        if (alive) await loadBatches();
      } catch (e: any) {
        if (alive) setMessage(e.message || "Nem sikerült betölteni az AIF adatokat.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onFileChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const parsed = await readAifWorkbook(file, selectedSupplier);
      setFileName(file.name);
      setRows(parsed);
      setMessage(`${parsed.length} sor beolvasva. Ez még csak előnézet, nem készletmozgás.`);
    } catch (e: any) {
      setRows([]);
      setMessage(e.message || "Nem sikerült beolvasni az XLS/XLSX fájlt.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!supplierId || !locationId || !rows.length) return;
    setBusy(true);
    setMessage("");
    try {
      const batch = await apiAifCreateImportBatch({
        supplierId,
        targetLocationId: locationId,
        sourceFileName: fileName || "manual-import.xls",
        sourceFormat: "xls",
        note,
      });
      const saved = await apiAifReplaceImportRows(batch.id, rows);
      await loadBatches();
      setMessage(`Import draft mentve: ${saved.rowCount} sor, hibás sor: ${saved.errorCount}.`);
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni az importot.");
    } finally {
      setBusy(false);
    }
  }

  async function commitBatch(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifCommitImportBatch(id);
      await loadBatches();
      setMessage(`Commit kész. Létrehozott/frissített variánsok: ${result.committed ?? 0}.`);
    } catch (e: any) {
      setMessage(e.message || "A commit nem sikerült. Valószínűleg van hibás import sor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#4b5362] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/60">AllInFashion</p>
            <h1 className="text-2xl font-normal tracking-tight">Áru bevételezés</h1>
            <p className="mt-1 text-sm text-white/70">Beszállító kiválasztás, XLS előnézet, majd tiszta AIF import.</p>
          </div>
          <button className={btn} onClick={goHome}>
            <ArrowLeft size={17} /> Vissza
          </button>
        </header>

        {message && <div className="rounded-xl border border-white/20 bg-slate-900/35 px-4 py-3 text-sm text-white/85">{message}</div>}

        <section className={card}>
          <div className="grid gap-4 lg:grid-cols-4">
            <label className="grid gap-2 text-sm text-white/75">
              Beszállító
              <select className={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900">
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-white/75">
              Cél hely
              <select className={input} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id} className="bg-slate-900">
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-white/75 lg:col-span-2">
              Megjegyzés
              <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="pl. Under Armour új lista" />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className={primaryBtn}>
              <FileSpreadsheet size={18} /> XLS / XLSX kiválasztás
              <input className="hidden" type="file" accept=".xls,.xlsx,.csv" onChange={onFileChange} />
            </label>
            <button className={btn} onClick={saveDraft} disabled={busy || !rows.length || !supplierId || !locationId}>
              <UploadCloud size={18} /> Draft mentése
            </button>
            <button className={btn} onClick={loadBatches} disabled={busy}>
              <RefreshCw size={17} /> Frissítés
            </button>
            <button className={btn} onClick={() => (window.location.hash = "#allinsuppliers")} type="button">
              <Building2 size={17} /> Beszállítók kezelése
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl bg-slate-900/35 p-4">
              <p className="text-xs text-white/55">Fájl</p>
              <p className="mt-1 truncate text-sm">{fileName || "-"}</p>
            </div>
            <div className="rounded-xl bg-slate-900/35 p-4">
              <p className="text-xs text-white/55">Beolvasott sor</p>
              <p className="mt-1 text-lg">{rows.length}</p>
            </div>
            <div className="rounded-xl bg-slate-900/35 p-4">
              <p className="text-xs text-white/55">Gyanús sor</p>
              <p className="mt-1 text-lg">{rowProblems}</p>
            </div>
            <div className="rounded-xl bg-slate-900/35 p-4">
              <p className="text-xs text-white/55">Státusz</p>
              <p className="mt-1 text-sm">{busy ? "Dolgozom rajta" : rows.length ? "Előnézet kész" : "Nincs fájl"}</p>
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="mb-3 text-lg font-normal">Előnézet</h2>
          <div className="overflow-auto rounded-xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-xs uppercase text-white/55">
                <tr>
                  <th className="px-3 py-3">Sor</th>
                  <th className="px-3 py-3">Kód</th>
                  <th className="px-3 py-3">Név</th>
                  <th className="px-3 py-3">Szín</th>
                  <th className="px-3 py-3">Méret</th>
                  <th className="px-3 py-3">Db</th>
                  <th className="px-3 py-3">Vételár</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {preview.map((r, idx) => {
                  const n = r.normalized || {};
                  return (
                    <tr key={`${r.rowNo || idx}-${idx}`} className="bg-white/[0.03]">
                      <td className="px-3 py-3 text-white/55">{r.rowNo || idx + 1}</td>
                      <td className="px-3 py-3">{cell(n.supplierProductCode || n.modelCode)}</td>
                      <td className="px-3 py-3">{cell(n.titleRo)}</td>
                      <td className="px-3 py-3">{cell(n.colorName || n.colorCode)}</td>
                      <td className="px-3 py-3">{cell(n.size)}</td>
                      <td className="px-3 py-3">{cell(n.qty)}</td>
                      <td className="px-3 py-3">{cell(n.buyPrice)}</td>
                    </tr>
                  );
                })}
                {!preview.length && (
                  <tr>
                    <td className="px-3 py-8 text-center text-white/55" colSpan={7}>
                      Nincs beolvasott sor. Az Excel még csak néz minket, mint borjú az új kapura.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={card}>
          <h2 className="mb-3 text-lg font-normal">Import előzmények</h2>
          <div className="grid gap-3">
            {batches.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900/35 p-4">
                <div>
                  <p className="text-sm text-white">{b.supplier_name} • {b.source_file_name || "import"}</p>
                  <p className="mt-1 text-xs text-white/55">
                    {new Date(b.created_at).toLocaleString()} • {b.location_name || "-"} • sor: {b.row_count || 0} • hiba: {b.error_count || 0} • {b.status}
                  </p>
                </div>
                <button className={primaryBtn} disabled={busy || b.status === "committed"} onClick={() => commitBatch(b.id)}>
                  <CheckCircle size={17} /> Commit
                </button>
              </div>
            ))}
            {!batches.length && <p className="text-sm text-white/60">Még nincs import batch.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
