import React, { useMemo, useState } from "react";
import { ArrowRightLeft, Trash2 } from "lucide-react";
import type { Location, TransferDraft, TransferDraftItem, IncomingItemDraft, IncomingSourceMeta } from "../../lib/incoming/types";

function mergeKey(it: { sku: string; size: string; colorCode: string; category: string; name: string }) {
  return [it.sku || "", it.size || "", it.colorCode || "", it.category || "", it.name || ""].join("|").toLowerCase();
}

export default function IncomingTransfer(props: {
  locations: Location[];
  incoming: IncomingItemDraft[];
  incomingMeta: Record<string, IncomingSourceMeta>;
  transfer: TransferDraft;
  onChange: (next: TransferDraft) => void;
}) {
  const { locations, incoming, transfer, onChange } = props;

  const [pickSource, setPickSource] = useState<string>("all");

  const sourceOptions = useMemo(() => {
    const ids = Array.from(new Set(incoming.map((x) => x.sourceMetaId)));
    return ids;
  }, [incoming]);

  const filteredIncoming = useMemo(() => {
    if (pickSource === "all") return incoming;
    return incoming.filter((x) => x.sourceMetaId === pickSource);
  }, [incoming, pickSource]);

  const canAdd = (it: IncomingItemDraft) => it.qty > 0;

  const addItem = (it: IncomingItemDraft) => {
    const key = mergeKey(it);
    const nextItems = [...transfer.items];
    const idx = nextItems.findIndex((x) => mergeKey(x) === key);
    if (idx >= 0) {
      nextItems[idx] = { ...nextItems[idx], qty: nextItems[idx].qty + it.qty };
    } else {
      const item: TransferDraftItem = {
        sku: it.sku,
        name: it.name,
        colorCode: it.colorCode,
        colorName: it.colorName,
        size: it.size,
        category: it.category,
        qty: it.qty,
      };
      nextItems.push(item);
    }
    onChange({ ...transfer, items: nextItems });
  };

  const setQty = (idx: number, qty: number) => {
    const nextItems = transfer.items.map((x, i) => (i === idx ? { ...x, qty } : x)).filter((x) => x.qty > 0);
    onChange({ ...transfer, items: nextItems });
  };

  const remove = (idx: number) => {
    onChange({ ...transfer, items: transfer.items.filter((_, i) => i !== idx) });
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-[12px] font-semibold text-slate-800 inline-flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-slate-700" /> Mozgatás (draft)
          </div>
          <div className="text-[11px] text-slate-500">From → To, tételek, mennyiség</div>
        </div>

        <div className="p-4 grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Honnan</div>
              <select
                value={transfer.fromLocationId}
                onChange={(e) => onChange({ ...transfer, fromLocationId: e.target.value })}
                className="w-full h-10 rounded-xl border border-slate-300 px-3 text-[12px] bg-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Hová</div>
              <select
                value={transfer.toLocationId}
                onChange={(e) => onChange({ ...transfer, toLocationId: e.target.value })}
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

          <div className="grid gap-3 md:grid-cols-[260px_1fr] items-end">
            <div>
              <div className="text-[11px] text-slate-600 mb-1 font-medium">Forrás (import)</div>
              <select
                value={pickSource}
                onChange={(e) => setPickSource(e.target.value)}
                className="w-full h-10 rounded-xl border border-slate-300 px-3 text-[12px] bg-white"
              >
                <option value="all">Összes</option>
                {sourceOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[11px] text-slate-500">Tipp: előbb importálsz/viszel be, aztán innen átrakod tételekbe.</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="text-[12px] font-semibold text-slate-800">Bejövő tételek</div>
            <div className="text-[11px] text-slate-500">Kattints a sorra, hogy hozzáadd a mozgatáshoz.</div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Kód</th>
                  <th className="text-left px-3 py-2 font-semibold">Termék</th>
                  <th className="text-left px-3 py-2 font-semibold">Szín</th>
                  <th className="text-left px-3 py-2 font-semibold">Méret</th>
                  <th className="text-right px-3 py-2 font-semibold">Db</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncoming.map((it, i) => (
                  <tr
                    key={i}
                    className={"border-t border-slate-200 " + (canAdd(it) ? "hover:bg-slate-50 cursor-pointer" : "opacity-50")}
                    onClick={() => (canAdd(it) ? addItem(it) : null)}
                    title={canAdd(it) ? "Hozzáadás" : "Nincs darabszám"}
                  >
                    <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{it.sku}</td>
                    <td className="px-3 py-2 text-slate-800">{it.name}</td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {it.colorCode ? <span className="font-semibold">{it.colorCode}</span> : <span className="text-slate-400">-</span>}
                      {it.colorName ? <span className="text-slate-500"> · {it.colorName}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{it.size || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">{it.qty}</td>
                  </tr>
                ))}
                {!filteredIncoming.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>
                      Nincs bejövő tétel.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <div className="text-[12px] font-semibold text-slate-800">Mozgatás tételek</div>
            <div className="text-[11px] text-slate-500">Ebből fog Aviz készülni, és később backend transfer is.</div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Kód</th>
                  <th className="text-left px-3 py-2 font-semibold">Termék</th>
                  <th className="text-left px-3 py-2 font-semibold">Szín</th>
                  <th className="text-left px-3 py-2 font-semibold">Méret</th>
                  <th className="text-right px-3 py-2 font-semibold">Db</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {transfer.items.map((it, idx) => (
                  <tr key={idx} className="border-t border-slate-200">
                    <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap">{it.sku}</td>
                    <td className="px-3 py-2 text-slate-800">{it.name}</td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                      {it.colorCode ? <span className="font-semibold">{it.colorCode}</span> : <span className="text-slate-400">-</span>}
                      {it.colorName ? <span className="text-slate-500"> · {it.colorName}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{it.size || <span className="text-slate-400">-</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        value={String(it.qty)}
                        onChange={(e) => {
                          const q = Math.round(Number((e.target.value || "").replace(",", ".")));
                          setQty(idx, Number.isFinite(q) ? q : 0);
                        }}
                        className="w-[90px] h-9 rounded-lg border border-slate-300 px-2 text-[12px] text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="h-9 w-9 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 inline-flex items-center justify-center"
                        title="Törlés"
                      >
                        <Trash2 className="w-4 h-4 text-slate-600" />
                      </button>
                    </td>
                  </tr>
                ))}
                {!transfer.items.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                      Üres. Kattints balról sorokat.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
