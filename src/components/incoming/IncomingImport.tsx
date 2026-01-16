import React, { useMemo, useRef, useState } from "react";
import { Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import type { IncomingItemDraft, IncomingSourceMeta, Location } from "../../lib/incoming/types";
import { parseCsvText, guessDelimiter } from "../../lib/incoming/csvParsers";
import type { ImportMappedRow } from "../../lib/incoming/importMapper";
import { mapTableToIncomingRows } from "../../lib/incoming/importMapper";

function uid(prefix = "m") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

type TableParsed = { headers: string[]; rows: string[][] };

function extLower(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

async function parseFileToTable(f: File): Promise<TableParsed> {
  const ext = extLower(f.name);

  // CSV
  if (ext === "csv" || f.type === "text/csv") {
    const text = await f.text();
    const delim = guessDelimiter(text);
    const parsed = parseCsvText(text, delim);
    return parsed;
  }

  // XLS / XLSX
  if (ext === "xlsx" || ext === "xls") {
    // NOTE: requires dependency: npm i xlsx
    // Using dynamic import so the file stays readable, but the package must exist at build time.
    const XLSX = await import("xlsx");
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return { headers: [], rows: [] };

    const ws = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    }) as any[];

    const first = Array.isArray(matrix?.[0]) ? (matrix[0] as any[]) : [];
    const headers = first.map((x) => String(x ?? "").trim());

    const rows = (matrix.slice(1) as any[])
      .filter((r) => Array.isArray(r))
      .map((r) => (r as any[]).map((x) => String(x ?? "").trim()));

    return { headers, rows };
  }

  return { headers: [], rows: [] };
}

export default function IncomingImport(props: {
  locations: Location[];
  existingCount: number;
  onAddBatch: (items: IncomingItemDraft[], meta: IncomingSourceMeta) => void;
}) {
  const { locations, existingCount, onAddBatch } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [supplierName, setSupplierName] = useState<string>("");
  const [locationId, setLocationId] = useState<string>(() => locations[0]?.id || "");
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<TableParsed | null>(null);
  const [mapped, setMapped] = useState<ImportMappedRow[] | null>(null);
  const [error, setError] = useState<string>("");

  const invalidCount = useMemo(() => (mapped ? mapped.filter((x) => x.issues.length).length : 0), [mapped]);

  const canAdd = !!mapped && mapped.length > 0 && invalidCount === 0 && !!locationId;

  const onPickFile = async (f: File) => {
    setError("");
    setPreview(null);
    setMapped(null);
    setFileName(f.name);

    try {
      const parsed = await parseFileToTable(f);
      if (!parsed.headers.length) {
        setError("Üres vagy nem értelmezhető fájl (CSV/XLSX/XLS). ");
        return;
      }
      setPreview(parsed);

      const mappedRows = mapTableToIncomingRows(
        { headers: parsed.headers, rows: parsed.rows },
        { source: "auto", parseCode: true }
      );
      setMapped(mappedRows);
    } catch (e: any) {
      // Most common reason: xlsx dependency missing
      const msg = String(e?.message || e || "");
      if (msg.toLowerCase().includes("xlsx")) {
        setError("XLS/XLSX importhoz hiányzik a 'xlsx' csomag. Add hozzá: npm i xlsx");
      } else {
        setError("Nem sikerült beolvasni a fájlt.");
      }
    }
  };

  const addToIncoming = () => {
    if (!mapped) return;
    const metaId = uid("file");
    const label = fileName || "Import";
    const meta: IncomingSourceMeta = {
      id: metaId,
      kind: "csv", // keep existing type contract
      label,
      supplier: supplierName.trim() || "Import",
      createdAtISO: new Date().toISOString(),
      locationId: locationId,
    };

    const items: IncomingItemDraft[] =
      mapped.map((m) =>
        ({
          sku: m.sku,
          brand: m.brand ?? "",
          name: m.name,
          gender: m.gender ?? "",
          colorCode: m.colorCode,
          colorName: m.colorName,
          size: m.size,
          category: m.category,
          buyPrice: m.buyPrice ?? null,
          qty: m.qty,
          sourceMetaId: metaId,
        } as any)
      ) as any;

    onAddBatch(items, meta);
    setPreview(null);
    setMapped(null);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold text-slate-800">Import (CSV / XLSX / XLS)</div>
        <div className="text-[11px] text-slate-500">Standard import. Nincs profilválasztás, mert nem sorsjegy.</div>
      </div>

      <div className="p-4 grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Beszállító neve (opcionális)</div>
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="pl. Beszállító Kft."
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

        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
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
            Fájl kiválasztása
          </button>

          {fileName ? <div className="text-[12px] text-slate-600 truncate">{fileName}</div> : <div className="text-[12px] text-slate-400">Nincs fájl</div>}
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div> : null}

        {mapped ? (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <div className="text-[11px] text-slate-600">
                Sorok: <span className="font-semibold text-slate-800">{mapped.length}</span> | Hibás: {" "}
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
                    <th className="text-left px-3 py-2 font-semibold">Márka</th>
                    <th className="text-left px-3 py-2 font-semibold">Terméknév</th>
                    <th className="text-left px-3 py-2 font-semibold">Nem</th>
                    <th className="text-left px-3 py-2 font-semibold">Színkód</th>
                    <th className="text-left px-3 py-2 font-semibold">Szín</th>
                    <th className="text-left px-3 py-2 font-semibold">Méret</th>
                    <th className="text-left px-3 py-2 font-semibold">Kategória</th>
                    <th className="text-right px-3 py-2 font-semibold">Beszerzési ár</th>
                    <th className="text-right px-3 py-2 font-semibold">Db</th>
                    <th className="text-left px-3 py-2 font-semibold">Állapot</th>
                  </tr>
                </thead>
                <tbody>
                  {mapped.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-t border-slate-200">
                      <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{r.sku}</td>
                      <td className="px-3 py-2 text-slate-800 whitespace-nowrap">
                        {(r as any).brand ? <span className="font-semibold">{(r as any).brand}</span> : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-800">{r.name}</td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                        {(r as any).gender ? <span className="font-semibold">{(r as any).gender}</span> : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                        {r.colorCode ? <span className="font-semibold">{r.colorCode}</span> : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                        {r.colorName ? <span className="font-semibold">{r.colorName}</span> : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.size || <span className="text-slate-400">-</span>}</td>
                      <td className="px-3 py-2 text-slate-700">{r.category || <span className="text-slate-400">-</span>}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">
                        {(() => {
                          const bp = (r as any).buyPrice ?? (r as any).buy_price ?? null;
                          if (bp === null || bp === undefined || String(bp).trim() === "") return <span className="text-slate-400">-</span>;
                          const n = Number(String(bp).replace(",", "."));
                          return Number.isFinite(n) ? n.toFixed(2) : <span className="text-slate-400">-</span>;
                        })()}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{r.qty}</td>
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
              {mapped.length > 200 ? <div className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-200">Csak az első 200 sor látszik preview-ban.</div> : null}
            </div>
          </div>
        ) : (
          <div className="text-[12px] text-slate-500">Tölts fel egy CSV/XLSX/XLS fájlt, és megmutatom mit értettem belőle.</div>
        )}
      </div>
    </div>
  );
}
