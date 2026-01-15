import React, { useMemo, useRef, useState } from "react";
import { Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import type { IncomingItemDraft, IncomingSourceMeta, Location } from "../../lib/incoming/types";
import { parseCsvText, guessDelimiter, mapCsvRowsToIncoming, SUPPLIER_PROFILES } from "../../lib/incoming/csvParsers";

// STRICT: csak a "Generic" profil marad, amíg nincs valódi beszállító rendszer a DB-ben.
const ACTIVE_SUPPLIER_PROFILES = SUPPLIER_PROFILES.filter((p) => p.key === "generic");

function uid(prefix = "m") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export default function IncomingImport(props: {
  locations: Location[];
  existingCount: number;
  onAddBatch: (items: IncomingItemDraft[], meta: IncomingSourceMeta) => void;
}) {
  const { locations, existingCount, onAddBatch } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [supplierKey, setSupplierKey] = useState<string>("generic");
  const [supplierName, setSupplierName] = useState<string>("");
  const [locationId, setLocationId] = useState<string>(() => locations[0]?.id || "");
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapped, setMapped] = useState<ReturnType<typeof mapCsvRowsToIncoming> | null>(null);
  const [error, setError] = useState<string>("");

  const profile = useMemo(() => ACTIVE_SUPPLIER_PROFILES.find((p) => p.key === supplierKey) || ACTIVE_SUPPLIER_PROFILES[0], [supplierKey]);

  const invalidCount = useMemo(() => (mapped ? mapped.filter((x) => x.issues.length).length : 0), [mapped]);

  const canAdd = !!mapped && mapped.length > 0 && invalidCount === 0 && !!locationId;

  const onPickFile = async (f: File) => {
    setError("");
    setPreview(null);
    setMapped(null);
    setFileName(f.name);

    const text = await f.text();
    const delim = guessDelimiter(text);
    const parsed = parseCsvText(text, delim);
    if (!parsed.headers.length) {
      setError("Üres vagy nem értelmezhető CSV.");
      return;
    }
    setPreview(parsed);

    const mappedRows = mapCsvRowsToIncoming({ headers: parsed.headers, rows: parsed.rows, profile });
    setMapped(mappedRows);
  };

  const addToIncoming = () => {
    if (!mapped) return;
    const metaId = uid("csv");
    const label = fileName || "CSV import";
    const meta: IncomingSourceMeta = {
      id: metaId,
      kind: "csv",
      label,
      supplier: supplierName.trim() || profile.label,
      createdAtISO: new Date().toISOString(),
      locationId: locationId,
    };

    const items: IncomingItemDraft[] = mapped.map((m) => ({
      sku: m.sku,
      name: m.name,
      colorCode: m.colorCode,
      colorName: m.colorName,
      size: m.size,
      category: m.category,
      qty: m.qty,
      sourceMetaId: metaId,
    }));

    onAddBatch(items, meta);
    setPreview(null);
    setMapped(null);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  };

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
              onChange={(e) => setSupplierKey(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-300 px-3 text-[12px] bg-white"
            >
              {ACTIVE_SUPPLIER_PROFILES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Beszállító neve (opcionális)</div>
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder={profile.label}
                className="w-full h-10 rounded-xl border border-slate-300 px-3 text-[12px]"
              />
            </div>

            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Helyszín (ahová bejön)</div>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-300 px-3 text-[12px] bg-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-10 px-4 rounded-xl border border-slate-300 bg-white text-[12px] font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            CSV kiválasztása
          </button>

          {fileName ? <div className="text-[12px] text-slate-600 truncate">{fileName}</div> : <div className="text-[12px] text-slate-400">Nincs fájl</div>}
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>
        ) : null}

        {mapped ? (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <div className="text-[11px] text-slate-600">
                Sorok: <span className="font-semibold text-slate-800">{mapped.length}</span> | Hibás:{" "}
                <span className={invalidCount ? "font-semibold text-red-700" : "font-semibold text-slate-800"}>{invalidCount}</span>
              </div>

              <button
                type="button"
                disabled={!canAdd}
                onClick={addToIncoming}
                className="h-9 px-3 rounded-xl bg-slate-900 text-white text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                title={canAdd ? "Hozzáadás a bejövő tételekhez" : "Javítsd a hibákat és válassz helyszínt"}
              >
                <CheckCircle2 className="w-4 h-4" />
                Hozzáadás ({existingCount}+)
              </button>
            </div>

            <div className="max-h-[340px] overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-slate-50 text-slate-600 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Kód</th>
                    <th className="text-left px-3 py-2 font-semibold">Termék</th>
                    <th className="text-left px-3 py-2 font-semibold">Szín</th>
                    <th className="text-left px-3 py-2 font-semibold">Méret</th>
                    <th className="text-right px-3 py-2 font-semibold">Db</th>
                    <th className="text-left px-3 py-2 font-semibold">Kategória</th>
                    <th className="text-left px-3 py-2 font-semibold">Állapot</th>
                  </tr>
                </thead>
                <tbody>
                  {mapped.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-t border-slate-200">
                      <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{r.sku}</td>
                      <td className="px-3 py-2 text-slate-800">{r.name}</td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                        {r.colorCode ? <span className="font-semibold">{r.colorCode}</span> : <span className="text-slate-400">-</span>}
                        {r.colorName ? <span className="text-slate-500"> · {r.colorName}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.size || <span className="text-slate-400">-</span>}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{r.qty}</td>
                      <td className="px-3 py-2 text-slate-700">{r.category || <span className="text-slate-400">-</span>}</td>
                      <td className="px-3 py-2">
                        {r.issues.length ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-red-700">
                            <AlertTriangle className="w-3.5 h-3.5" /> {r.issues[0]}
                          </span>
                        ) : (
                          <span className="text-[11px] text-emerald-700">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mapped.length > 200 ? (
                <div className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-200">Csak az első 200 sor látszik preview-ban.</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="text-[12px] text-slate-500">Tölts fel egy CSV-t, és megmutatom mit értettem belőle.</div>
        )}
      </div>
    </div>
  );
}
