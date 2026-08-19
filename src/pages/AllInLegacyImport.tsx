import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Home,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";
import {
  apiAifCommitLegacyImportChunk,
  apiAifGetLegacyImport,
  apiAifListLegacyImports,
  apiAifMeta,
  apiAifStartLegacyImport,
  type AifLegacyImportCompactRow,
  type AifLegacyImportDetailResponse,
  type AifLocation,
} from "../lib/aif/api";

const LEGACY_MODE_KEY = "allinfashion:incoming:legacy-import:v1";
const LEGACY_ACTIVE_MIGRATION_KEY = "allinfashion:legacy-import:active:v1";
const REQUIRED_HEADERS = [
  "SOURCE_ROW",
  "DENUMIRE",
  "CODPRODUS",
  "QTY",
  "PRET_VANZARE_RON",
] as const;

type CsvRow = Record<string, string>;
type StatusFilter = "all" | "new" | "existing" | "review" | "conflict" | "done" | "error";

const page = "min-h-screen bg-[#4e5969] p-3 text-white font-normal sm:p-4 lg:p-6";
const wrap = "mx-auto max-w-[1580px] space-y-3.5";
const topCard = "sticky top-2 z-40 overflow-hidden rounded-[28px] border border-[#9be9e5]/20 bg-gradient-to-r from-[#263448] via-[#2f3b4f] to-[#294a51] px-4 py-4 shadow-[0_22px_62px_rgba(15,23,42,0.30)] backdrop-blur-xl sm:px-5";
const card = "rounded-[22px] border border-white/16 bg-gradient-to-br from-[#39475b] via-[#344154] to-[#303b4d] p-3 shadow-[0_16px_36px_rgba(15,23,42,0.20)] sm:p-4";
const input = "h-11 w-full rounded-[13px] border border-white/18 bg-gradient-to-b from-[#2d394b] to-[#293548] px-3 text-sm text-white outline-none placeholder:text-white/38 transition hover:border-white/28 focus:border-[#7bd7d4]/65 focus:ring-2 focus:ring-[#7bd7d4]/15";
const btnBase = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45";
const primaryBtn = `${btnBase} border-[#9be9e5]/48 bg-gradient-to-r from-[#238985] to-[#2a9a96] shadow-[0_8px_20px_rgba(42,141,139,0.18)] hover:brightness-110`;
const neutralBtn = `${btnBase} border-white/18 bg-[#3a475a]/90 hover:border-[#8ce7e2]/28 hover:bg-[#445369]`;
const dangerBtn = `${btnBase} border-red-300/30 bg-[#b71528] hover:bg-[#ca1830]`;
const statCard = "rounded-2xl border border-white/10 bg-[#2b3749] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]";

function clearLegacyMode() {
  try { window.sessionStorage.removeItem(LEGACY_MODE_KEY); } catch {}
}

function goHome() {
  clearLegacyMode();
  window.location.hash = "#allin";
}

function goNormalIncoming() {
  clearLegacyMode();
  window.location.hash = "#allin";
  window.setTimeout(() => { window.location.hash = "#allinincoming"; }, 0);
}

function money(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n)
    ? `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON`
    : "0,00 RON";
}

function integer(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("ro-RO") : "0";
}

function parseSemicolonCsv(source: string): CsvRow[] {
  const text = String(source || "").replace(/^\uFEFF/, "");
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      matrix.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    matrix.push(row);
  }
  if (!matrix.length) return [];

  const headers = matrix[0].map((value) => String(value || "").trim());
  return matrix.slice(1)
    .filter((cells) => cells.some((value) => String(value || "").trim()))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, String(cells[index] ?? "").trim()])) as CsvRow);
}

function actionLabel(row: AifLegacyImportCompactRow) {
  if (row.processStatus === "done") return "Kész";
  if (row.processStatus === "error") return "Hiba";
  if (row.previewAction === "conflict") return "Ütközés";
  if (row.previewAction === "existing") return "Meglévő";
  return "Új";
}

function actionClass(row: AifLegacyImportCompactRow) {
  if (row.processStatus === "done") return "border-emerald-200/30 bg-emerald-400/12 text-emerald-50";
  if (row.processStatus === "error" || row.previewAction === "conflict") return "border-red-200/35 bg-red-500/14 text-red-50";
  if (row.previewAction === "existing") return "border-sky-200/28 bg-sky-400/10 text-sky-50";
  return "border-[#8ce7e2]/30 bg-[#2a8d8b]/14 text-[#d9fffd]";
}

function sourceNeedsReview(row: AifLegacyImportCompactRow) {
  return row.sourceStatus === "REVIEW" || Boolean(row.warningCount) || row.rawQty < 0;
}

export default function AllInLegacyImport() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [locationId, setLocationId] = useState("");
  const [fileName, setFileName] = useState("");
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [migration, setMigration] = useState<AifLegacyImportDetailResponse | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; status: string; sourceFileName?: string | null; sourceDate?: string | null; locationName?: string | null; rowCount: number; processedRows: number; totalQty: number; createdAt?: string | null }>>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [confirmExactStock, setConfirmExactStock] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pageNo, setPageNo] = useState(1);
  const pageSize = 50;

  const summary = migration?.summary || null;
  const migrationRows = migration?.rows || [];

  async function loadHistory() {
    try {
      const response = await apiAifListLegacyImports(20);
      setHistory(response.items || []);
    } catch {
      // A történeti lista nem blokkolja magát a migrációt.
    }
  }

  async function loadMigration(id: string) {
    const response = await apiAifGetLegacyImport(id);
    setMigration(response);
    setLocationId(String(response.item?.targetLocationId || ""));
    setFileName(response.item?.sourceFileName || "");
    setConfirmExactStock(false);
    try { window.sessionStorage.setItem(LEGACY_ACTIVE_MIGRATION_KEY, id); } catch {}
    return response;
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const meta = await apiAifMeta();
        if (!alive) return;
        setLocations((meta.locations || []).filter((item) => item.is_active !== false && ["shop", "warehouse"].includes(String(item.location_type || ""))));
        await loadHistory();
        let stored = "";
        try { stored = window.sessionStorage.getItem(LEGACY_ACTIVE_MIGRATION_KEY) || ""; } catch {}
        if (stored) {
          try { await loadMigration(stored); } catch { try { window.sessionStorage.removeItem(LEGACY_ACTIVE_MIGRATION_KEY); } catch {} }
        }
      } catch (e: any) {
        if (alive) setError(e?.message || "A migrációs oldal alapadatai nem tölthetők be.");
      }
    })();
    return () => { alive = false; };
  }, []);

  const localStats = useMemo(() => {
    let positive = 0;
    let zero = 0;
    let negative = 0;
    let totalQty = 0;
    let missingBarcode = 0;
    let missingBrand = 0;
    for (const row of csvRows) {
      const qty = Number(String(row.QTY || "0").replace(",", ".")) || 0;
      if (qty > 0) positive += 1;
      else if (qty < 0) negative += 1;
      else zero += 1;
      totalQty += Math.max(0, Math.trunc(qty));
      if (!String(row.BARCODE || "").trim()) missingBarcode += 1;
      if (!String(row.BRAND || "").trim()) missingBrand += 1;
    }
    return { positive, zero, negative, totalQty, missingBarcode, missingBrand };
  }, [csvRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("hu-HU");
    return migrationRows.filter((row) => {
      if (statusFilter === "new" && row.previewAction !== "new") return false;
      if (statusFilter === "existing" && row.previewAction !== "existing") return false;
      if (statusFilter === "conflict" && row.previewAction !== "conflict") return false;
      if (statusFilter === "review" && !sourceNeedsReview(row)) return false;
      if (statusFilter === "done" && row.processStatus !== "done") return false;
      if (statusFilter === "error" && row.processStatus !== "error") return false;
      if (!q) return true;
      return [row.title, row.barcode, row.productCode, row.originalProductCode, row.brandName, row.modelCode, row.colorCode, row.size, row.message]
        .some((value) => String(value || "").toLocaleLowerCase("hu-HU").includes(q));
    });
  }, [migrationRows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice((pageNo - 1) * pageSize, pageNo * pageSize);

  useEffect(() => { setPageNo(1); }, [search, statusFilter, migration?.item?.id]);
  useEffect(() => { if (pageNo > totalPages) setPageNo(totalPages); }, [pageNo, totalPages]);

  async function handleFile(file: File) {
    setError("");
    setMessage("");
    setMigration(null);
    setConfirmExactStock(false);
    try { window.sessionStorage.removeItem(LEGACY_ACTIVE_MIGRATION_KEY); } catch {}
    const content = await file.text();
    const parsed = parseSemicolonCsv(content);
    if (!parsed.length) throw new Error("A CSV üres vagy nem olvasható.");
    const headers = new Set(Object.keys(parsed[0] || {}));
    const missing = REQUIRED_HEADERS.filter((header) => !headers.has(header));
    if (missing.length) {
      throw new Error(`Ez nem az előkészített AllIn ForIT migrációs CSV. Hiányzó oszlopok: ${missing.join(", ")}.`);
    }
    setFileName(file.name);
    setCsvRows(parsed);
    setMessage(`${parsed.length.toLocaleString("ro-RO")} sor beolvasva. Ez még csak helyi előnézet, az adatbázis nem változott.`);
  }

  async function startPreview() {
    if (!locationId) {
      setError("Válaszd ki, melyik AllIn üzlethez tartozik a régi ForIT készlet.");
      return;
    }
    if (!csvRows.length) {
      setError("Előbb töltsd be a teljes ForIT migrációs CSV-t.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("Szerveres ellenőrzés: vonalkódok, meglévő AllIn variánsok és célhely készlete...");
    try {
      const response = await apiAifStartLegacyImport({
        sourceSystem: "ForIT",
        sourceDate: csvRows[0]?.SOURCE_DATE || "2026-08-19",
        sourceFileName: fileName || "AllIn_ForIT_LEGACY_IMPORT_FULL_20260819.csv",
        targetLocationId: locationId,
        note: "Régi rendszer nyitókészlet és teljes terméktörzs migráció",
        rows: csvRows,
      });
      setMigration(response);
      setMessage(response.duplicate
        ? "Ez a fájl ehhez az üzlethez már elő lett készítve. A meglévő migrációt töltöttem vissza, nem készítettem másolatot."
        : "Ellenőrzés kész. Még semmilyen termék vagy készlet nem változott.");
      try { window.sessionStorage.setItem(LEGACY_ACTIVE_MIGRATION_KEY, response.item.id); } catch {}
      await loadHistory();
    } catch (e: any) {
      setError(e?.message || "A migráció szerveres ellenőrzése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function commitMigration() {
    const id = migration?.item?.id;
    if (!id) return;
    if (!summary?.canCommit) {
      setError("Az ellenőrzésben ütközés van. A véglegesítés addig nem indulhat el.");
      return;
    }
    if (!confirmExactStock) {
      setError("A véglegesítéshez jelöld be, hogy érted: a kiválasztott üzlet készlete a CSV szerinti pontos értékre áll.");
      return;
    }

    setCommitting(true);
    setError("");
    setMessage("Migráció indítása. Az oldal most kis, újraindítható csomagokban dolgozik.");
    try {
      let done = false;
      let guard = 0;
      let retryErrors = migration.item.status === "failed";
      while (!done && guard < 1000) {
        guard += 1;
        const part = await apiAifCommitLegacyImportChunk(id, { limit: 200, retryErrors });
        retryErrors = false;
        setMigration((current) => current ? {
          ...current,
          item: { ...current.item, status: part.status, processedRows: part.processedRows },
          summary: { ...current.summary, ...part.summary },
          rows: part.changedRows?.length
            ? current.rows.map((row) => part.changedRows!.find((changed) => changed.rowNo === row.rowNo) || row)
            : current.rows,
        } : current);
        setMessage(`Migráció: ${part.processedRows.toLocaleString("ro-RO")} / ${part.rowCount.toLocaleString("ro-RO")} sor • ${Math.round(part.progressPercent)}%`);
        done = Boolean(part.done);
        if (part.status === "failed" && done) {
          throw new Error(part.firstError || "A migráció néhány sora hibára futott. A sikeres sorok megmaradtak, a hibák az ellenőrző listában látszanak.");
        }
      }
      const fresh = await loadMigration(id);
      if (fresh.item.status === "committed") {
        setMessage(`KÉSZ. ${fresh.summary.rowCount.toLocaleString("ro-RO")} régi ForIT sor feldolgozva, a nyitókészlet beállítva.`);
        setConfirmExactStock(false);
      }
      await loadHistory();
    } catch (e: any) {
      setError(e?.message || "A migráció megszakadt. A már elkészült csomagok megmaradtak; ugyaninnen folytatható.");
      try { await loadMigration(id); } catch {}
    } finally {
      setCommitting(false);
    }
  }

  const status = migration?.item?.status || "";
  const processed = Number(migration?.item?.processedRows || 0);
  const rowCount = Number(summary?.rowCount || migration?.item?.rowCount || 0);
  const progressPercent = rowCount > 0 ? Math.min(100, processed / rowCount * 100) : 0;

  return (
    <main
      className={page}
      style={{
        backgroundImage: "radial-gradient(circle at 14% 8%, rgba(42,141,139,0.18), transparent 24%), radial-gradient(circle at 88% 12%, rgba(104,221,216,0.08), transparent 22%), linear-gradient(135deg, #5c6878 0%, #535f70 42%, #46515f 100%)",
      }}
    >
      <div className={wrap}>
        <header className={topCard}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#8ce7e2]/45 bg-[#208d8b]/22 text-[#d7fffd]"><Database size={22} /></span>
              <div>
                <p className="text-[9px] uppercase tracking-[0.18em] text-[#9ee5e2]/68">ALLINFASHION • EGYSZERI ADATMIGRÁCIÓ</p>
                <h1 className="mt-1 text-2xl text-white">Régi rendszer import • ForIT</h1>
                <p className="mt-1 text-sm text-white/64">Teljes terméktörzs, vonalkódok, árak és a kiválasztott üzlet pontos nyitókészlete. Beszállítói receptió nélkül.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button className={neutralBtn} onClick={goNormalIncoming} type="button"><ArrowLeft size={14} /> Normál bevételezés</button>
              <button className={neutralBtn} onClick={goHome} type="button"><Home size={14} /> Kezdőlap</button>
            </div>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-red-300/35 bg-[#b71528]/20 px-4 py-3 text-sm text-red-50"><AlertTriangle size={16} className="mr-2 inline" />{error}</div> : null}
        {message ? <div className="rounded-2xl border border-[#8ce7e2]/24 bg-[#208d8b]/12 px-4 py-3 text-sm text-white/82">{message}</div> : null}

        <section className={card}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-[0.14em] text-white/46">1. FORRÁS ÉS CÉLHELY</p>
              <h2 className="mt-1 text-lg text-white">Melyik készletet hozzuk át?</h2>
              <p className="mt-1 text-sm text-white/58">A ForIT csak egy üzletet kezelt, ezért itt egyszer kell megmondani, melyik AllIn helyhez tartozik.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-amber-300/8 px-3 py-1 text-[11px] text-amber-50"><ShieldCheck size={13} /> A preview semmit nem ír a készletbe</span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.5fr_auto] lg:items-end">
            <label className="grid gap-1 text-[9px] uppercase tracking-[0.1em] text-white/48">
              Cél üzlet / hely
              <select className={input} value={locationId} onChange={(event) => { setLocationId(event.target.value); setMigration(null); setConfirmExactStock(false); }} disabled={committing}>
                <option value="">Válassz célhelyet</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
            <div>
              <p className="mb-1 text-[9px] uppercase tracking-[0.1em] text-white/48">Előkészített migrációs CSV</p>
              <button className={`${neutralBtn} h-11 w-full justify-start`} onClick={() => fileInputRef.current?.click()} disabled={busy || committing} type="button">
                <FileSpreadsheet size={16} />
                <span className="min-w-0 flex-1 truncate text-left">{fileName || "AllIn_ForIT_LEGACY_IMPORT_FULL_20260819.csv kiválasztása"}</span>
              </button>
              <input ref={fileInputRef} className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file).catch((e) => setError(e?.message || "A CSV nem olvasható.")); event.currentTarget.value = ""; }} />
            </div>
            <button className={`${primaryBtn} h-11`} onClick={startPreview} disabled={busy || committing || !locationId || !csvRows.length} type="button">
              {busy ? <RefreshCw size={15} className="animate-spin" /> : <UploadCloud size={15} />}
              {busy ? "Ellenőrzés..." : "Szerveres ellenőrzés"}
            </button>
          </div>

          {csvRows.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">CSV sor</p><p className="mt-1 text-base">{csvRows.length.toLocaleString("ro-RO")}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Pozitív készlet</p><p className="mt-1 text-base">{localStats.positive.toLocaleString("ro-RO")}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">0 készlet</p><p className="mt-1 text-base">{localStats.zero.toLocaleString("ro-RO")}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Régi negatív</p><p className="mt-1 text-base text-amber-100">{localStats.negative.toLocaleString("ro-RO")}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Nyitókészlet</p><p className="mt-1 text-base">{integer(localStats.totalQty)} db</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Barcode nélkül</p><p className="mt-1 text-base">{localStats.missingBarcode.toLocaleString("ro-RO")}</p></div>
            </div>
          ) : null}
        </section>

        {summary ? (
          <section className={card}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/46">2. SZERVERES ELLENŐRZÉS</p>
                <h2 className="mt-1 text-lg text-white">Mit fog csinálni az AllIn?</h2>
                <p className="mt-1 text-sm text-white/58">Vonalkód az elsődleges egyezési kulcs. Beszállító nem jön létre; a régi beszállító csak legacy információként marad.</p>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${summary.canCommit ? "border-emerald-200/30 bg-emerald-400/10 text-emerald-50" : "border-red-200/35 bg-red-500/12 text-red-50"}`}>
                {summary.canCommit ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {summary.canCommit ? "Véglegesíthető" : `${summary.conflictRows} ütközés blokkolja`}
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Összes termék</p><p className="mt-1 text-base">{integer(summary.rowCount)}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Új variáns</p><p className="mt-1 text-base text-[#bff8f5]">{integer(summary.newRows)}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Már létezik</p><p className="mt-1 text-base text-sky-100">{integer(summary.existingRows)}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Ellenőrzendő</p><p className="mt-1 text-base text-amber-100">{integer(summary.reviewRows)}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Ütközés</p><p className="mt-1 text-base text-red-100">{integer(summary.conflictRows)}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">0 készletes</p><p className="mt-1 text-base">{integer(summary.zeroStockRows)}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Nyitókészlet</p><p className="mt-1 text-base">{integer(summary.totalQty)} db</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Készlet eladási érték</p><p className="mt-1 text-sm">{money(summary.retailValueRon)}</p></div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Készlet vételi érték</p><p className="mt-1 text-sm">{money(summary.purchaseValueRon)}</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Negatív ForIT → 0</p><p className="mt-1 text-sm text-amber-100">{integer(summary.normalizedNegativeRows)} sor</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Barcode nélkül</p><p className="mt-1 text-sm">{integer(summary.missingBarcodeRows)} sor</p></div>
              <div className={statCard}><p className="text-[9px] uppercase text-white/46">Márka nélkül</p><p className="mt-1 text-sm">{integer(summary.missingBrandRows)} sor</p></div>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200/28 bg-amber-300/8 p-3 text-sm leading-6 text-amber-50">
              <strong>Készletlogika:</strong> a kiválasztott célhely készlete <strong>pontosan</strong> a CSV `QTY` értékére áll. Nem hozzáadjuk a ForIT darabot az AllIn jelenlegi darabjához. A régi negatív készletű {summary.normalizedNegativeRows} sor terméke is létrejön, de a nyitókészlete 0 lesz; az eredeti negatív érték az auditban megmarad.
            </div>
          </section>
        ) : null}

        {migrationRows.length ? (
          <section className={card}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/46">3. SORONKÉNTI KONTROLL</p>
                <h2 className="mt-1 text-lg text-white">Egyezések és problémák</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[240px] flex-1"><Search size={14} className="pointer-events-none absolute left-3 top-3.5 text-white/35" /><input className={`${input} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Név, barcode, kód, márka..." /></div>
                <select className={`${input} w-auto min-w-[170px]`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                  <option value="all">Minden sor</option>
                  <option value="new">Új</option>
                  <option value="existing">Meglévő</option>
                  <option value="review">Ellenőrzendő</option>
                  <option value="conflict">Ütközés</option>
                  <option value="done">Kész</option>
                  <option value="error">Hibás</option>
                </select>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-2xl border border-white/12">
              <table className="w-full min-w-[1180px] text-xs">
                <thead className="bg-[#273447] text-[9px] uppercase tracking-[0.08em] text-white/50">
                  <tr><th className="px-3 py-2 text-left">Sor</th><th className="px-3 py-2 text-left">Állapot</th><th className="px-3 py-2 text-left">Termék</th><th className="px-3 py-2 text-left">Márka</th><th className="px-3 py-2 text-left">Kód</th><th className="px-3 py-2 text-left">Barcode</th><th className="px-3 py-2 text-left">Szín / méret</th><th className="px-3 py-2 text-right">ForIT db</th><th className="px-3 py-2 text-right">AllIn → cél</th><th className="px-3 py-2 text-left">Megjegyzés</th></tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.rowNo} className="border-t border-white/8 bg-[#344154] align-top">
                      <td className="px-3 py-2.5 text-white/55">{row.sourceRow || row.rowNo}</td>
                      <td className="px-3 py-2.5"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] ${actionClass(row)}`}>{actionLabel(row)}</span>{sourceNeedsReview(row) ? <span className="ml-1 inline-flex rounded-full border border-amber-200/20 bg-amber-300/8 px-2 py-1 text-[10px] text-amber-50">review</span> : null}</td>
                      <td className="px-3 py-2.5 text-white">{row.title || "-"}</td>
                      <td className="px-3 py-2.5 text-white/72">{row.brandName || "-"}</td>
                      <td className="px-3 py-2.5 font-mono text-white/76">{row.productCode || "-"}</td>
                      <td className="px-3 py-2.5 font-mono text-white/76">{row.barcode || "-"}</td>
                      <td className="px-3 py-2.5 text-white/72">{[row.colorCode || row.colorName, row.size].filter(Boolean).join(" • ") || "-"}</td>
                      <td className={`px-3 py-2.5 text-right ${row.rawQty < 0 ? "text-amber-100" : "text-white"}`}>{row.rawQty}</td>
                      <td className="px-3 py-2.5 text-right text-white/80">{row.existingStockQty ?? 0} → {row.targetStockQty}</td>
                      <td className="max-w-[360px] px-3 py-2.5 text-white/58">{row.processError || row.message || "-"}</td>
                    </tr>
                  ))}
                  {!visibleRows.length ? <tr><td colSpan={10} className="px-4 py-10 text-center text-white/42">Nincs ilyen sor.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/55">
              <span>{filteredRows.length.toLocaleString("ro-RO")} találat • {pageNo} / {totalPages}. oldal</span>
              <div className="flex gap-2"><button className={neutralBtn} type="button" disabled={pageNo <= 1} onClick={() => setPageNo((value) => Math.max(1, value - 1))}>Előző</button><button className={neutralBtn} type="button" disabled={pageNo >= totalPages} onClick={() => setPageNo((value) => Math.min(totalPages, value + 1))}>Következő</button></div>
            </div>
          </section>
        ) : null}

        {summary ? (
          <section className={card}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-white/46">4. VÉGLEGESÍTÉS</p>
                <h2 className="mt-1 text-lg text-white">ForIT → AllIn migráció</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-white/60">A 0 készletes termékek is bekerülnek a terméktörzsbe. Csak a pozitív, illetve már meglévő célhelyi készlet eltérése kap készletmozgást. Más AllIn üzlet készletéhez nem nyúl.</p>
              </div>
              {status === "committed" ? <span className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200/30 bg-emerald-400/12 px-4 py-3 text-sm text-emerald-50"><PackageCheck size={18} /> Migráció befejezve</span> : null}
            </div>

            {status !== "committed" ? (
              <div className="mt-4 rounded-2xl border border-white/12 bg-[#2b3749] p-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm text-white/84">
                  <input className="mt-1 h-4 w-4 accent-[#2a8d8b]" type="checkbox" checked={confirmExactStock} onChange={(event) => setConfirmExactStock(event.target.checked)} disabled={committing || !summary.canCommit} />
                  <span><strong>Értem és jóváhagyom:</strong> a kiválasztott üzlet készlete a ForIT CSV szerinti pontos darabszámra áll. Ez nyitókészlet-migráció, nem normál bevételezés és nem összeadás.</span>
                </label>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[280px] flex-1">
                    <div className="flex items-center justify-between text-[10px] text-white/52"><span>{status === "prepared" ? "Előkészítve" : status === "failed" ? "Megszakadt / hibás" : status === "committing" ? "Folyamatban" : status || "Előkészítve"}</span><span>{Math.round(progressPercent)}%</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-950/45"><div className="h-full rounded-full bg-[#63d8d3] transition-all" style={{ width: `${progressPercent}%` }} /></div>
                    <p className="mt-1 text-[10px] text-white/42">{processed.toLocaleString("ro-RO")} / {rowCount.toLocaleString("ro-RO")} sor feldolgozva</p>
                  </div>
                  <button className={summary.canCommit ? primaryBtn : dangerBtn} onClick={commitMigration} disabled={committing || busy || !summary.canCommit || !confirmExactStock} type="button">
                    {committing ? <RefreshCw size={15} className="animate-spin" /> : <Database size={15} />}
                    {committing ? "Migráció folyamatban..." : processed > 0 ? "Migráció folytatása" : "FORIT MIGRÁCIÓ VÉGLEGESÍTÉSE"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap justify-end gap-2"><button className={neutralBtn} type="button" onClick={() => { clearLegacyMode(); window.location.hash = "#allinwarehouse"; }}><PackageCheck size={14} /> Raktár megnyitása</button></div>
            )}
          </section>
        ) : null}

        {history.length ? (
          <section className={card}>
            <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/46">MIGRÁCIÓS NAPLÓ</p><h2 className="mt-1 text-lg">Legutóbbi régi rendszer importok</h2></div><button className={neutralBtn} type="button" onClick={() => void loadHistory()}><RefreshCw size={14} /> Frissítés</button></div>
            <div className="mt-3 grid gap-2">
              {history.map((item) => <button key={item.id} className="flex w-full flex-col gap-2 rounded-2xl border border-white/12 bg-[#354153] p-3 text-left transition hover:border-[#7bd7d4]/28 sm:flex-row sm:items-center sm:justify-between" type="button" onClick={() => void loadMigration(item.id)}><div><p className="text-sm text-white">{item.sourceFileName || "ForIT migráció"}</p><p className="mt-1 text-xs text-white/48">{item.locationName || "-"} • {item.sourceDate || "-"} • {item.rowCount.toLocaleString("ro-RO")} sor</p></div><div className="text-right"><p className="text-xs text-white/80">{item.status}</p><p className="mt-1 text-[10px] text-white/42">{item.processedRows.toLocaleString("ro-RO")} / {item.rowCount.toLocaleString("ro-RO")} • {integer(item.totalQty)} db</p></div></button>)}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
