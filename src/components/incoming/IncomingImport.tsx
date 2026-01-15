import React, { useMemo, useRef, useState } from "react";
import { Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import type { IncomingItemDraft, IncomingSourceMeta, Location } from "../../lib/incoming/types";
import { parseCsvText, guessDelimiter, mapCsvRowsToIncoming, SupplierProfile, SUPPLIER_PROFILES } from "../../lib/incoming/csvParsers";

const HEADER = "#354153";

function uid(prefix = "m") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export default function IncomingImport({
  locations,
  existingCount,
  onAddBatch
}: {
  locations: Location[];
  existingCount: number;
  onAddBatch: (items: IncomingItemDraft[], meta: IncomingSourceMeta) => void;
}) {
  const [supplierKey, setSupplierKey] = useState<string>("generic");
  const supplier: SupplierProfile = useMemo(() => SUPPLIER_PROFILES[supplierKey] || SUPPLIER_PROFILES.generic, [supplierKey]);

  const [rawText, setRawText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [mapped, setMapped] = useState<{ items: IncomingItemDraft[]; issues: string[] } | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const pickFile = () => fileRef.current?.click();

  const onFile = async (f: File) => {
    setErr("");
    setFileName(f.name);
    const txt = await f.text();
    setRawText(txt);
    processText(txt, f.name);
  };

  const processText = (txt: string, label?: string) => {
    setErr("");
    try {
      const delimiter = guessDelimiter(txt) || supplier.delimiter || ",";
      const parsed = parseCsvText(txt, { delimiter });
      setPreview({ headers: parsed.headers, rows: parsed.rows.slice(0, 50) });

      const mapped2 = mapCsvRowsToIncoming(parsed, supplier);
      setMapped(mapped2);
    } catch (e: any) {
      setErr(String(e?.message || e || "Hiba CSV feldolgozásnál"));
      setPreview(null);
      setMapped(null);
    }
  };

  const add = () => {
    if (!mapped?.items?.length) return;
    const meta: IncomingSourceMeta = {
      id: uid("csv"),
      kind: "csv",
      label: fileName || supplier.label,
      supplier: supplier.label,
      createdAtISO: new Date().toISOString()
    };
    onAddBatch(mapped.items, meta);
    // keep preview, but clear file input
    if (fileRef.current) fileRef.current.value = "";
  };

  const badge = (ok: boolean) =>
    "inline-flex items-center gap-2 px-3 py-1 rounded-xl text-xs border " +
    (ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200");

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold text-slate-800">CSV import</div>
        <div className="text-[11px] text-slate-500">Beszállító profillal (oszlopnevek eltérhetnek). Igen, természetesen.</div>
      </div>

      <div className="p-4 grid gap-4">
        <div className="grid gap-3 md:grid-cols-[260px_1fr] items-end">
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Beszállító profil</div>
            <select
              value={supplierKey}
              onChange={(e) => {
                const k = e.target.value;
                setSupplierKey(k);
                if (rawText) processText(rawText, fileName);
              }}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]"
            >
              {Object.keys(SUPPLIER_PROFILES).map((k) => (
                <option key={k} value={k}>
                  {SUPPLIER_PROFILES[k].label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <button
              type="button"
              onClick={pickFile}
              className="h-9 px-4 rounded-xl bg-[#354153] hover:bg-[#3c5069] text-white border border-white/30 inline-flex items-center text-[12px]"
              title="CSV kiválasztása"
            >
              <Upload className="h-4 w-4 mr-2" />
              CSV kiválasztása
            </button>

            <button
              type="button"
              onClick={add}
              disabled={!mapped?.items?.length}
              className={
                "h-9 px-4 rounded-xl text-white inline-flex items-center text-[12px] " +
                (mapped?.items?.length ? "bg-[#208d8b] hover:bg-[#1b7a78]" : "bg-slate-300 cursor-not-allowed")
              }
              title="Bejövő tételekhez ad"
            >
              Hozzáadás ({mapped?.items?.length || 0})
            </button>
          </div>
        </div>

        {err ? <div className="text-red-600 text-[12px] whitespace-pre-wrap">{err}</div> : null}

        {/* Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={badge(Boolean(mapped?.items?.length))}>
            {mapped?.items?.length ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {mapped?.items?.length ? `${mapped.items.length} tétel értelmezve` : "Nincs feldolgozott tétel"}
          </span>
          <span className="text-[11px] text-slate-500">Jelenlegi bejövő tételek: {existingCount}</span>
        </div>

        {mapped?.issues?.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-[12px] font-semibold text-amber-900 mb-1">Figyelmeztetések</div>
            <ul className="text-[11px] text-amber-800 list-disc pl-5 space-y-1">
              {mapped.issues.slice(0, 10).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Preview table */}
        {preview ? (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 text-[12px] font-semibold text-slate-800">Előnézet (első 50 sor)</div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-white" style={{ backgroundColor: HEADER }}>
                    {preview.headers.map((h) => (
                      <th key={h} className="px-2 py-2 text-left font-normal text-[11px] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, idx) => (
                    <tr key={idx} className="border-t border-slate-200">
                      {preview.headers.map((h) => (
                        <td key={h} className="px-2 py-2 text-[11px] text-slate-700 whitespace-nowrap">
                          {r[h] || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!preview.rows.length ? (
                    <tr>
                      <td className="px-3 py-6 text-[12px] text-slate-500" colSpan={preview.headers.length}>
                        Üres CSV? Ez művészet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[12px] text-slate-600">
            Válassz egy CSV-t. A parser kezeli a vesszőt és a pontosvesszőt is, idézőjelekkel együtt.
          </div>
        )}
      </div>
    </div>
  );
}
