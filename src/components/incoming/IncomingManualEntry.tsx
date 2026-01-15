import React, { useMemo, useState } from "react";
import type { IncomingItemDraft, IncomingSourceMeta, Location } from "../../lib/incoming/types";

function uid(prefix = "m") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

const blankRow = (): IncomingItemDraft => ({
  sku: "",
  name: "",
  brand: "",
  category: "",
  colorName: "",
  colorCode: "",
  size: "",
  qty: 1,
  sourceMetaId: ""
});

export default function IncomingManualEntry({
  locations,
  onAddBatch
}: {
  locations: Location[];
  onAddBatch: (items: IncomingItemDraft[], meta: IncomingSourceMeta) => void;
}) {
  const [supplier, setSupplier] = useState("Kézi bevitel");
  const [rows, setRows] = useState<IncomingItemDraft[]>([blankRow()]);

  const validRows = useMemo(() => rows.filter((r) => (r.sku || r.name) && r.qty > 0), [rows]);

  const addRow = () => setRows((p) => [...p, blankRow()]);
  const removeRow = (idx: number) => setRows((p) => p.filter((_, i) => i !== idx));

  const set = (idx: number, patch: Partial<IncomingItemDraft>) => {
    setRows((p) => p.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const submit = () => {
    const meta: IncomingSourceMeta = {
      id: uid("manual"),
      kind: "manual",
      label: supplier.trim() || "Kézi",
      supplier: supplier.trim() || "Kézi",
      createdAtISO: new Date().toISOString()
    };
    const items = validRows.map((x) => ({ ...x, sourceMetaId: meta.id }));
    onAddBatch(items, meta);
    setRows([blankRow()]);
  };

  const th = "px-2 py-2 text-left font-normal text-[11px] whitespace-nowrap";
  const td = "px-2 py-2 text-[11px] text-slate-700";

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold text-slate-800">Kézi bevitel</div>
        <div className="text-[11px] text-slate-500">Amikor a beszállító „CSV-t küld” csak épp nem.</div>
      </div>

      <div className="p-4 grid gap-3">
        <div className="grid gap-2 md:grid-cols-[260px_1fr] items-end">
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Beszállító / Megjegyzés</div>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px]"
              placeholder="Pl. Malfini, Renbut..."
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={addRow}
              className="h-9 px-4 rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-[12px]"
              title="Új sor"
            >
              + Sor
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!validRows.length}
              className={
                "h-9 px-4 rounded-xl text-white text-[12px] " +
                (validRows.length ? "bg-[#208d8b] hover:bg-[#1b7a78]" : "bg-slate-300 cursor-not-allowed")
              }
              title="Hozzáadás"
            >
              Hozzáadás ({validRows.length})
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-white" style={{ backgroundColor: "#354153" }}>
                  <th className={th + " w-[44px]"}>#</th>
                  <th className={th + " w-[140px]"}>Márka</th>
                  <th className={th + " w-[180px]"}>Termékkód</th>
                  <th className={th + " min-w-[220px]"}>Terméknév</th>
                  <th className={th + " w-[140px]"}>Kategória</th>
                  <th className={th + " w-[140px]"}>Szín</th>
                  <th className={th + " w-[90px]"}>Színkód</th>
                  <th className={th + " w-[80px]"}>Méret</th>
                  <th className={th + " w-[80px] text-center bg-white/5"}>Darab</th>
                  <th className={th + " w-[90px] text-center sticky right-0 z-20"} style={{ backgroundColor: "#354153" }}>
                    Művelet
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className={td}>{idx + 1}</td>

                    <td className={td}>
                      <input
                        value={r.brand || ""}
                        onChange={(e) => set(idx, { brand: e.target.value })}
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]"
                        placeholder="Pl. Malfini"
                      />
                    </td>

                    <td className={td}>
                      <input
                        value={r.sku || ""}
                        onChange={(e) => set(idx, { sku: e.target.value })}
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]"
                        placeholder="Pl. MLF-TSH-001-S"
                      />
                    </td>

                    <td className={td}>
                      <input
                        value={r.name || ""}
                        onChange={(e) => set(idx, { name: e.target.value })}
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]"
                        placeholder="Pl. Póló basic"
                      />
                    </td>

                    <td className={td}>
                      <input
                        value={r.category || ""}
                        onChange={(e) => set(idx, { category: e.target.value })}
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]"
                        placeholder="Pl. Pólók"
                      />
                    </td>

                    <td className={td}>
                      <input
                        value={r.colorName || ""}
                        onChange={(e) => set(idx, { colorName: e.target.value })}
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]"
                        placeholder="Pl. Fekete"
                      />
                    </td>

                    <td className={td}>
                      <input
                        value={r.colorCode || ""}
                        onChange={(e) => set(idx, { colorCode: e.target.value })}
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]"
                        placeholder="001"
                      />
                    </td>

                    <td className={td}>
                      <input
                        value={r.size || ""}
                        onChange={(e) => set(idx, { size: e.target.value })}
                        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[12px]"
                        placeholder="S / 21-22"
                      />
                    </td>

                    <td className={td + " text-center bg-slate-50"}>
                      <input
                        type="number"
                        value={r.qty}
                        min={0}
                        onChange={(e) => set(idx, { qty: Math.max(0, Number(e.target.value || 0)) })}
                        className="h-8 w-[90px] rounded-md border border-slate-200 bg-white px-2 text-[12px] text-center"
                      />
                    </td>

                    <td className={td + " text-center sticky right-0 bg-white"}>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="h-8 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-[12px]"
                        title="Sor törlése"
                      >
                        Törlés
                      </button>
                    </td>
                  </tr>
                ))}

                {!rows.length ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-[12px] text-slate-500">
                      Nincs sor.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Tipp: minimálisan a <span className="font-semibold">Termékkód</span> vagy a <span className="font-semibold">Terméknév</span> legyen meg, és a darab &gt; 0.
        </div>
      </div>
    </div>
  );
}
