import React, { useMemo, useState } from "react";
import { Plus, CheckCircle2, Trash2 } from "lucide-react";
import type { IncomingItemDraft, IncomingSourceMeta, Location } from "../../lib/incoming/types";

function uid(prefix = "m") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

type Row = {
  sku: string;
  name: string;
  colorCode: string;
  colorName: string;
  size: string;
  category: string;
  qty: string;
};

const EMPTY_ROW: Row = { sku: "", name: "", colorCode: "", colorName: "", size: "", category: "", qty: "1" };

export default function IncomingManualEntry(props: {
  locations: Location[];
  existingCount: number;
  onAddBatch: (items: IncomingItemDraft[], meta: IncomingSourceMeta) => void;
}) {
  const { locations, existingCount, onAddBatch } = props;

  const [supplier, setSupplier] = useState<string>("Kézi bevitel");
  const [locationId, setLocationId] = useState<string>(() => locations[0]?.id || "");
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);

  const issues = useMemo(() => {
    const bad: string[] = [];
    if (!locationId) bad.push("Válassz helyszínt.");
    return bad;
  }, [locationId]);

  const addRow = () => setRows((p) => [...p, { ...EMPTY_ROW }]);

  const deleteRow = (idx: number) => setRows((p) => p.filter((_, i) => i !== idx));

  const setCell = (idx: number, k: keyof Row, v: string) => {
    setRows((p) => p.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  };

  const canAdd = rows.some((r) => r.sku.trim() && r.name.trim() && Number(r.qty) > 0) && issues.length === 0;

  const addBatch = () => {
    if (!canAdd) return;
    const metaId = uid("manual");
    const meta: IncomingSourceMeta = {
      id: metaId,
      kind: "manual",
      label: "Kézi bevitel",
      supplier: supplier.trim() || "Kézi bevitel",
      createdAtISO: new Date().toISOString(),
      locationId,
    };

    const items: IncomingItemDraft[] = rows
      .map((r) => {
        const qty = Math.round(Number((r.qty || "").replace(",", ".")));
        return {
          sku: r.sku.trim(),
          name: r.name.trim(),
          colorCode: r.colorCode.trim(),
          colorName: r.colorName.trim(),
          size: r.size.trim(),
          category: r.category.trim(),
          qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
          sourceMetaId: metaId,
        };
      })
      .filter((x) => x.sku && x.name && x.qty > 0);

    onAddBatch(items, meta);
    setRows([{ ...EMPTY_ROW }]);
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold text-slate-800">Kézi bevitel</div>
        <button
          type="button"
          onClick={addRow}
          className="h-9 px-3 rounded-xl border border-slate-300 bg-white text-[12px] font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Sor hozzáadása
        </button>
      </div>

      <div className="p-4 grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Beszállító</div>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-300 px-3 text-[12px]"
            />
          </div>
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Helyszín</div>
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

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="max-h-[340px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Kód</th>
                  <th className="text-left px-3 py-2 font-semibold">Termék</th>
                  <th className="text-left px-3 py-2 font-semibold">Színkód</th>
                  <th className="text-left px-3 py-2 font-semibold">Szín</th>
                  <th className="text-left px-3 py-2 font-semibold">Méret</th>
                  <th className="text-left px-3 py-2 font-semibold">Kategória</th>
                  <th className="text-right px-3 py-2 font-semibold">Db</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-t border-slate-200">
                    <td className="px-3 py-2">
                      <input value={r.sku} onChange={(e) => setCell(idx, "sku", e.target.value)} className="w-full h-9 rounded-lg border border-slate-300 px-2 text-[12px]" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={r.name} onChange={(e) => setCell(idx, "name", e.target.value)} className="w-full h-9 rounded-lg border border-slate-300 px-2 text-[12px]" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={r.colorCode} onChange={(e) => setCell(idx, "colorCode", e.target.value)} className="w-full h-9 rounded-lg border border-slate-300 px-2 text-[12px]" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={r.colorName} onChange={(e) => setCell(idx, "colorName", e.target.value)} className="w-full h-9 rounded-lg border border-slate-300 px-2 text-[12px]" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={r.size} onChange={(e) => setCell(idx, "size", e.target.value)} className="w-full h-9 rounded-lg border border-slate-300 px-2 text-[12px]" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={r.category} onChange={(e) => setCell(idx, "category", e.target.value)} className="w-full h-9 rounded-lg border border-slate-300 px-2 text-[12px]" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        value={r.qty}
                        onChange={(e) => setCell(idx, "qty", e.target.value)}
                        className="w-[80px] h-9 rounded-lg border border-slate-300 px-2 text-[12px] text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => deleteRow(idx)} className="h-9 w-9 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 inline-flex items-center justify-center" title="Sor törlése">
                        <Trash2 className="w-4 h-4 text-slate-600" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-500">Sorok: {rows.length}</div>
            <button
              type="button"
              disabled={!canAdd}
              onClick={addBatch}
              className="h-9 px-3 rounded-xl bg-slate-900 text-white text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Hozzáadás ({existingCount}+)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
