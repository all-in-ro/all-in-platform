import React, { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, CheckCircle2, CircleAlert, Download, FileCheck2,
  FileSpreadsheet, FolderSearch, LoaderCircle, RefreshCw, ShieldCheck,
  UploadCloud, X,
} from 'lucide-react';

const EXPORT_VERSION = '20261015.3';
type CandidateComparison = { variantId: string; title: string; productCode: string; color: string; size: string;
  sellPrice: number | null; buyPrice: number | null; category?: string; gender?: string; material?: string;
  snCodes: string[]; sourceSellPrices: number[]; sourceBuyPrices: number[]; exactName: boolean; exactCode: boolean;
  comparisons?: { kind: string; source: string; equal: string[]; different: string[]; unknown: string[] }[] };
type Problem = { rowNo: number; cell?: string; code: string; name: string; reason: string; reasonCode?: string;
  sellPrice?: string; buyPrice?: string; category?: string; gender?: string; material?: string; candidates?: CandidateComparison[] };
type FilledRow = { rowNo: number; cell: string; code: string; name: string; barcode: string; source: string;
  variantId?: string; matchMethod?: string; matchFields?: string[]; resolvedAmbiguity?: boolean;
  candidateCount?: number; sellPrice?: string; buyPrice?: string };
type Result = {
  fileName: string;
  url: string | null;
  verified: boolean;
  message: string;
  barcodeColumn: string;
  resolved: number;
  sourceCounts: { variant: number; supplier: number; import: number };
  filledRows: FilledRow[];
  count: number;
  filled: number;
  existing: number;
  missing: number;
  ambiguous: number;
  problems: Problem[];
};
type Progress = { percent: number; step: string; done: number; total: number };

function formatPrice(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'nincs adat';
  const amount = Number(String(value).replace(',', '.'));
  return Number.isFinite(amount) ? amount.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value);
}

function downloadName(value: string) {
  return String(value || 'ForIT_AIF_BARKODOK.xlsx').replace(/[\\/]/g, '_');
}

function base64Blob(encoded: string) {
  // Decode in slices to avoid quadratic memory usage on larger ForIT workbooks.
  const parts: BlobPart[] = [];
  for (let pos = 0; pos < encoded.length; pos += 16384) {
    const text = atob(encoded.slice(pos, pos + 16384));
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    parts.push(bytes.buffer);
  }
  return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export default function AllInLegacyExport({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>({ percent: 0, step: '', done: 0, total: 0 });
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [filledOpen, setFilledOpen] = useState(false);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const downloadRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onEscape, true);
    return () => { window.removeEventListener('keydown', onEscape, true); document.body.style.overflow = oldOverflow; };
  }, [busy, onClose]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
  }, []);

  const chooseFile = (next: File | null) => {
    if (!next || busyRef.current) return;
    if (downloadRef.current) { URL.revokeObjectURL(downloadRef.current); downloadRef.current = null; }
    setFile(null);
    setProblemsOpen(false);
    setFilledOpen(false);
    setError('');
    setResult(null);
    setProgress({ percent: 0, step: '', done: 0, total: 0 });
    if (!/\.xlsx$/i.test(next.name)) { setError('Csak .xlsx formátumú ForIT-fájlt válassz.'); return; }
    if (next.size > 12 * 1024 * 1024) { setError('Legfeljebb 12 MB méretű XLSX tölthető fel.'); return; }
    setFile(next);
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0] || null);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (!busy) chooseFile(event.dataTransfer.files?.[0] || null);
  };

  async function convert() {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    if (downloadRef.current) { URL.revokeObjectURL(downloadRef.current); downloadRef.current = null; }
    setResult(null);
    setError('');
    setProblemsOpen(false);
    setFilledOpen(false);
    setProgress({ percent: 2, step: 'Fájl feltöltése', done: 0, total: 0 });
    setBusy(true);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const response = await fetch('/api/aif/legacy-export/convert', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'X-Forit-Filename': encodeURIComponent(file.name),
        },
        body: file,
        signal: abort.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `A szerver HTTP ${response.status} hibával válaszolt.`);
      }
      if (!response.body) throw new Error('A szerver nem tudta megnyitni a feldolgozás eredményét.');
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let lineBuffer = '';
      let hasResult = false;
      const readEvent = (line: string) => {
        if (!line.trim()) return;
        const message = JSON.parse(line);
        if (message.type === 'progress') {
          setProgress({ percent: Number(message.percent || 0), step: String(message.step || ''), done: Number(message.done || 0), total: Number(message.total || 0) });
        } else if (message.type === 'error') {
          throw new Error(message.message || 'A ForIT-export nem sikerült.');
        } else if (message.type === 'result') {
          if (hasResult) throw new Error('A szerver több, egymásnak ellentmondó eredményt küldött.');
          if (message.version !== EXPORT_VERSION) {
            throw new Error('A szerveren még nem a javított ForIT-export fut. A csomag három backendfájljának telepítése és a Render deploy befejezése szükséges.');
          }
          const count = Number(message.count), filled = Number(message.filled);
          const existing = Number(message.existing), missing = Number(message.missing), ambiguous = Number(message.ambiguous);
          if (![count, filled, existing, missing, ambiguous].every(v => Number.isInteger(v) && v >= 0) ||
              filled + existing + missing + ambiguous !== count) throw new Error('A feldolgozott sorok összesítése hibás. A letöltést leállítottam.');
          let url: string | null = null;
          if (message.downloadable) {
            if (filled < 1 || message.verified !== true || message.changed !== true || typeof message.base64 !== 'string' || !message.base64) {
              throw new Error('A szerver nem igazolta a vonalkódok tényleges beírását. Változatlan fájlt nem töltünk le.');
            }
            url = URL.createObjectURL(base64Blob(message.base64));
            downloadRef.current = url;
          } else if (filled || message.base64) {
            throw new Error('Hiányos exporteredmény érkezett. A letöltést leállítottam.');
          }
          hasResult = true;
          setResult({ fileName: url ? downloadName(message.fileName) : '', url,
            count, filled, existing, missing, ambiguous, verified: message.verified === true,
            message: String(message.message || ''), barcodeColumn: String(message.barcodeColumn || 'Codbare'),
            resolved: Number(message.resolved || 0),
            sourceCounts: { variant: Number(message.sourceCounts?.variant || 0), supplier: Number(message.sourceCounts?.supplier || 0), import: Number(message.sourceCounts?.import || 0) },
            problems: Array.isArray(message.problems) ? message.problems : [],
            filledRows: Array.isArray(message.filledRows) ? message.filledRows : [],
          });
          setProblemsOpen(missing + ambiguous > 0);
          setProgress({ percent: 100, step: url ? 'A kész Excel ellenőrizve' : 'Ellenőrzés befejezve, új fájl nem készült', done: count, total: count });
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = lineBuffer.indexOf('\n')) >= 0) {
          const line = lineBuffer.slice(0, newline);
          lineBuffer = lineBuffer.slice(newline + 1);
          readEvent(line);
        }
      }
      lineBuffer += decoder.decode();
      if (lineBuffer.trim()) readEvent(lineBuffer);
      if (!hasResult) throw new Error('A szerver nem adott letölthető eredményt.');
    } catch (caught) {
      abort.abort();
      if (downloadRef.current) { URL.revokeObjectURL(downloadRef.current); downloadRef.current = null; }
      setResult(null);
      setError(caught instanceof Error ? caught.message : 'Nem sikerült kitölteni a ForIT-fájlt.');
      setProgress({ percent: 0, step: '', done: 0, total: 0 });
    } finally {
      abortRef.current = null;
      busyRef.current = false;
      setBusy(false);
    }
  }

  function download() {
    if (!result?.url || !result.verified || result.filled < 1) return;
    const link = document.createElement('a');
    link.href = result.url;
    link.download = result.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const skipped = result ? result.missing + result.ambiguous : 0;

  return createPortal(
    <div className="fixed inset-0 z-[890] flex items-center justify-center overflow-y-auto bg-[#0d1728]/90 px-3 py-5 text-white backdrop-blur-lg"
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Régi rendszer export – ForIT" className="flex max-h-[94vh] w-full max-w-[900px] flex-col overflow-hidden rounded-[28px] border border-[#8aeee2]/35 bg-[#2d3c50] shadow-[0_40px_140px_rgba(0,0,0,0.66)]">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/12 bg-gradient-to-r from-[#243a4c] via-[#255d60] to-[#278a81] px-5 py-5 sm:px-7">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#9bf3e8]/45 bg-[#153f44]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              <FileSpreadsheet size={28} className="text-[#c3fff1]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.20em] text-[#d3fff5]/55">ALL IN • FORIT HÍD</p>
              <h2 className="mt-1 truncate text-xl tracking-tight text-white sm:text-2xl">Régi rendszer export</h2>
              <p className="mt-1 text-xs text-[#efffff]/63">Ugyanaz az Excel. Az AllInFashion vonalkódjaival.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-black/15 text-white/85 transition hover:bg-white/10 disabled:opacity-40" aria-label="Bezárás"><X size={18}/></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-4 md:grid-cols-[1.35fr_0.85fr]">
            <div className="space-y-4">
              <div
                role="button" tabIndex={busy ? -1 : 0}
                onKeyDown={e => { if (!busy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
                onClick={() => !busy && inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); if (!busy) setDragOver(true); }}
                onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
                onDrop={onDrop}
                className={`group flex min-h-[242px] cursor-pointer flex-col items-center justify-center rounded-[22px] border-2 border-dashed px-5 py-6 text-center transition ${dragOver ? 'border-[#8ff7c4] bg-[#277968]/30' : file ? 'border-[#8fe4d2]/60 bg-[#244b50]/50' : 'border-[#7ed1ce]/35 bg-[#243346] hover:border-[#9cf0e4]/75 hover:bg-[#26424d]'} ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                <div className="mb-4 flex h-[68px] w-[68px] items-center justify-center rounded-2xl border border-[#a8eae3]/30 bg-[#2b7b75]/25 text-[#b5fff0] shadow-[0_12px_34px_rgba(8,38,40,0.25)]">
                  {file ? <FileSpreadsheet size={32}/> : <UploadCloud size={32}/>}
                </div>
                <div className="max-w-full break-words text-base font-medium text-[#f3fffd]">
                  {file ? file.name : 'Húzd ide a ForIT Excel-fájlt'}
                </div>
                <p className="mt-2 text-xs text-white/53">{file ? `${(file.size / 1024).toLocaleString('hu-HU', { maximumFractionDigits: 0 })} KB · Kattints egy másik fájl választásához` : 'vagy kattints a fájlválasztáshoz'}</p>
                <span className="mt-4 rounded-full border border-[#a4e9e2]/25 bg-white/[0.05] px-3 py-1 text-[10px] tracking-[0.07em] text-[#d4fffa]/72">.XLSX • FORIT</span>
                <input ref={inputRef} type="file" className="hidden" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFile}/>
              </div>
              <button type="button" disabled={!file || busy} onClick={() => void convert()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#bcffe0]/45 bg-gradient-to-r from-[#2c9b8a] to-[#287e73] px-5 text-sm font-medium text-white shadow-[0_10px_28px_rgba(30,148,130,0.25)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? <LoaderCircle className="animate-spin" size={19}/> : <ArrowRight size={19}/>}
                {busy ? 'Feldolgozás...' : result ? 'Újra ellenőrzés és kitöltés' : 'Vonalkódok kitöltése'}
              </button>
              {error && !busy ? <div className="flex items-start gap-2 rounded-xl border border-[#ff9d9d]/45 bg-[#852e3a]/25 px-3 py-3 text-xs leading-relaxed text-[#ffe8e9]"><CircleAlert className="shrink-0" size={17}/>{error}</div> : null}
            </div>
            <div className="flex flex-col gap-3">
              <div className="rounded-[22px] border border-[#9fefe3]/20 bg-[#263448] p-5">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#8ddace]/20 bg-[#2a8d8b]/20 text-[#9ce8dd]"><FolderSearch size={20}/></div>
                <h3 className="text-sm font-medium text-white">Teljes sor alapján keres</h3>
                <p className="mt-2 text-xs leading-[1.8] text-white/60">Az A oszlop teljes neve, cikkszám, szín, méret és S/N alapján; több találatnál az eladási és vételár, terméktípus, nem és összetétel is segít azonosítani.</p>
              </div>
              <div className="rounded-[22px] border border-[#9fefe3]/20 bg-[#263448] p-5">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#8ddace]/20 bg-[#2a8d8b]/20 text-[#9ce8dd]"><ShieldCheck size={20}/></div>
                <h3 className="text-sm font-medium text-white">Az eredeti fájl megmarad</h3>
                <p className="mt-2 text-xs leading-[1.8] text-white/60">Csak a hiányzó <strong className="font-medium text-white">Codbare</strong> értékeket tölti ki. A raktári készletet nem módosítja.</p>
              </div>
            </div>
          </div>

          {result && !busy ? (
            <section className={`mt-5 overflow-hidden rounded-[22px] border shadow-[0_12px_35px_rgba(0,0,0,0.16)] ${skipped ? 'border-[#f4c780]/45 bg-[#3a3d44]' : 'border-[#8eedd1]/40 bg-[#254b50]/55'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${skipped || !result.url ? 'border-[#f1cf9c]/35 bg-[#b58b45]/15 text-[#ffdfa7]' : 'border-[#a0ffe0]/35 bg-[#27a786]/25 text-[#a9ffdf]'}`}>{skipped || !result.url ? <CircleAlert size={24}/> : <CheckCircle2 size={24}/>}</div>
                  <div className="min-w-0">
                    <h3 className="text-base font-medium text-white">{!result.url ? 'Új fájl nem készült' : skipped ? 'Részben kitöltve, ellenőrzött Excel' : 'A vonalkódok beírva, az Excel ellenőrizve'}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-white/80">{result.message}</p>
                    {result.fileName ? <p className="mt-2 break-all text-[11px] text-white/55">{result.fileName}</p> : null}
                  </div>
                </div>
                {result.url ? <button type="button" onClick={download} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#b7ffd6]/60 bg-[#259c7e] px-5 text-sm font-medium text-white shadow-[0_6px_22px_rgba(37,156,126,0.30)] transition hover:bg-[#2dac8d]"><Download size={17}/> Kitöltött Excel letöltése</button> : null}
              </div>
              <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 sm:grid-cols-4">
                <div className="bg-[#273d4b] p-3 text-center"><p className="text-[11px] text-white/70">Összes terméksor</p><p className="mt-1 text-xl font-medium text-white">{result.count}</p></div>
                <div className="bg-[#273d4b] p-3 text-center"><p className="text-[11px] text-white/70">Most beírt vonalkód</p><p className="mt-1 text-xl font-medium text-[#adffe1]">{result.filled}</p></div>
                <div className="bg-[#273d4b] p-3 text-center"><p className="text-[11px] text-white/70">Már ki volt töltve</p><p className="mt-1 text-xl font-medium text-white">{result.existing}</p></div>
                <div className="bg-[#273d4b] p-3 text-center"><p className="text-[11px] text-white/70">Üresen / érintetlenül maradt</p><p className={`mt-1 text-xl font-medium ${skipped ? 'text-[#ffd49d]' : 'text-white'}`}>{skipped}</p></div>
              </div>
              {result.filled > 0 ? <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-relaxed text-white/75">
                Cél: <strong className="text-white">{result.barcodeColumn} · Codbare</strong> · Variánsnál mentett: {result.sourceCounts.variant} · Beszállítónál mentett: {result.sourceCounts.supplier} · Importban mentett: {result.sourceCounts.import}
                {result.resolved > 0 ? <p className="mt-1 text-[#bcffe7]">Több lehetséges variánsból a teljes sor alapján azonosítva: <strong>{result.resolved} sor</strong>.</p> : null}
              </div> : null}
              {result.filledRows.length ? <div className="border-t border-white/10 p-4">
                <div className="mb-3 flex items-center justify-between gap-2"><h4 className="text-sm text-[#bcffe7]">Ezek már a kész Excelben vannak</h4>{result.filledRows.length > 4 ? <button type="button" className="text-xs text-white/75 underline underline-offset-4" onClick={() => setFilledOpen(v => !v)}>{filledOpen ? 'Kevesebb sor' : `Kitöltött sorok (${result.filledRows.length})`}</button> : null}</div>
                <div className="space-y-2">
                  {(filledOpen ? result.filledRows : result.filledRows.slice(0, 4)).map(item => <div key={item.rowNo} className="grid grid-cols-[3rem_1fr] gap-x-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5 text-xs sm:grid-cols-[3rem_1fr_auto]">
                    <span className="font-mono text-white/60">{item.cell}</span>
                    <span className="min-w-0 break-words text-white/85" title={item.name}>
                      {item.name.split('--')[1] || item.name || item.code}
                      <span className="mt-1 block text-[11px] text-white/65">{item.name.split('--')[2] || ''}{item.sellPrice ? ` · ${formatPrice(item.sellPrice)} RON` : ''}</span>
                    </span>
                    <strong className="col-start-2 mt-1 break-all font-mono text-sm tracking-wide text-[#baffdf] sm:col-start-auto sm:mt-0">{item.barcode}</strong>
                    {item.matchFields?.length ? <p className="col-span-full mt-1 text-[10px] leading-relaxed text-[#baf7e2]/75">Egyezés: {item.matchFields.join(' · ')}</p> : null}
                  </div>)}
                </div>
                {result.filled > result.filledRows.length ? <p className="mt-2 text-[11px] text-white/60">A lista az első {result.filledRows.length} kitöltött sort mutatja; az Excel mind a {result.filled} beírt vonalkódot tartalmazza.</p> : null}
              </div> : null}
              {skipped > 0 ? (
                <div className="border-t border-white/10 p-4">
                  <button type="button" className="flex w-full items-center justify-between gap-2 text-left text-sm text-[#ffdfa7]" onClick={() => setProblemsOpen(v => !v)}><span><CircleAlert size={15} className="mr-2 inline"/>{skipped} kimaradt sor, pontos okkal</span><span>{problemsOpen ? 'Elrejtés' : 'Részletek'}</span></button>
                  {problemsOpen ? <div className="mt-3 space-y-2">
                    {result.problems.map(problem => <div key={problem.rowNo} className="rounded-xl border border-[#f4c780]/20 bg-black/10 px-3 py-3 text-xs">
                      <span className="text-white">{problem.cell || `${problem.rowNo}. sor`} · {problem.name.split('--')[1] || problem.name || problem.code}</span>
                      <p className="mt-1 break-all text-[11px] text-white/65">A: {problem.name}</p>
                      <p className="mt-1 break-all text-[11px] text-white/55">D: {problem.code}</p>
                      <p className="mt-1 text-[11px] text-white/70">Excel eladási ár: {formatPrice(problem.sellPrice)} RON · Vételár: {formatPrice(problem.buyPrice)} RON</p>
                      <p className="mt-2 leading-relaxed text-[#ffdbad]">{problem.reason}</p>
                      {problem.candidates?.length ? <details className="mt-3 rounded-lg border border-white/15 bg-[#233346]/60 p-3">
                        <summary className="cursor-pointer text-[#d6fff1]">Jelöltek és az egyező / eltérő adatok ({problem.candidates.length})</summary>
                        <div className="mt-3 space-y-3">{problem.candidates.map(candidate => <div key={candidate.variantId} className="rounded-lg border border-white/10 bg-black/10 p-3">
                          <p className="break-words text-white">{candidate.title} · {candidate.color} · {candidate.size}</p>
                          <p className="mt-1 break-all font-mono text-[10px] text-white/50">{candidate.variantId}</p>
                          <p className="mt-1 text-white/80">Aktuális eladási ár: {formatPrice(candidate.sellPrice)} RON · Vételár: {formatPrice(candidate.buyPrice)} RON</p>
                          <p className="mt-1 text-[11px] text-white/65">Importsorok eladási árai: {candidate.sourceSellPrices?.map(formatPrice).join(' / ') || 'nincs adat'} · Vételárai: {candidate.sourceBuyPrices?.map(formatPrice).join(' / ') || 'nincs adat'}</p>
                          <p className="mt-1 break-words text-[11px] text-white/65">S/N: {candidate.snCodes?.join(' / ') || 'nincs adat'} · Típus: {candidate.category || 'nincs adat'}</p>
                          {(candidate.exactName || candidate.exactCode) ? <p className="mt-1 text-[#bcffe7]">{[candidate.exactName ? 'Teljes A oszlop egyezik' : '', candidate.exactCode ? 'Teljes D / SKU egyezik' : ''].filter(Boolean).join(' · ')}</p> : null}
                          {candidate.comparisons?.map((comparison, index) => <p key={index} className="mt-2 text-[10px] leading-relaxed text-white/75">
                            {comparison.kind === 'source' ? 'Összetartozó importsor' : 'Aktuális termékadat'}: {comparison.equal.length ? `egyezik: ${comparison.equal.join(', ')}` : 'nincs további igazolt egyezés'}.
                            {comparison.different.length ? <span className="text-[#ffceab]"> Eltér: {comparison.different.join(', ')}.</span> : null}
                            {comparison.unknown.length ? <span className="text-white/45"> Nincs összehasonlítható adat: {comparison.unknown.join(', ')}.</span> : null}
                          </p>)}
                        </div>)}</div>
                      </details> : null}
                    </div>)}
                    {skipped > result.problems.length ? <p className="text-[11px] text-white/60">Az első {result.problems.length} kimaradt sor részletei láthatók.</p> : null}
                  </div> : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/12 bg-[#263346] px-5 py-3 text-xs text-white/43 sm:px-7">
          <span><FileCheck2 size={13} className="mr-1.5 inline"/>Csak olvasó művelet · ForIT v3 <span className="ml-1 font-mono text-white/50">{EXPORT_VERSION}</span></span>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-white/15 bg-white/[0.06] px-4 py-2 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-40">Bezárás</button>
        </footer>
      </section>

      {busy ? (
        <div className="fixed inset-0 z-[920] flex items-center justify-center bg-[#09151b]/68 px-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="ForIT Excel feldolgozása">
          <div className="w-full max-w-[480px] rounded-[26px] border border-[#a4f4d3]/50 bg-[#263c46] px-6 py-7 text-white shadow-[0_35px_110px_rgba(0,0,0,.65)]">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[#a0ffda]/40 bg-[#2b9b7e]/25 text-[#aaffdd]"><RefreshCw size={28} className="animate-spin"/></div>
            <p className="mt-5 text-center text-xl font-medium">Vonalkódok egyeztetése</p>
            <p className="mt-2 min-h-[20px] text-center text-xs text-[#d6fff4]/67">{progress.step || 'Fájl feldolgozása...'}</p>
            <div className="mt-6 h-3 overflow-hidden rounded-full border border-[#8fe5c8]/25 bg-[#102d32]">
              <div style={{ width: `${Math.max(2, Math.min(100, progress.percent))}%` }} className="h-full rounded-full bg-gradient-to-r from-[#30c483] via-[#6aefa8] to-[#a6ffc1] shadow-[0_0_25px_rgba(84,243,167,.65)] transition-[width] duration-300"/>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[#bdffda]/80"><span>{progress.done && progress.total ? `${progress.done} / ${progress.total} termék` : 'Feldolgozás'}</span><span className="font-mono text-base font-medium text-[#baffdd]">{progress.percent}%</span></div>
            <p className="mt-5 text-center text-[11px] text-white/43">A munkafüzet többi oszlopa és formázása változatlan.</p>
          </div>
        </div>
      ) : null}
    </div>, document.body,
  );
}
