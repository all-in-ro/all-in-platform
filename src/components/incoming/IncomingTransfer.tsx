import React, { useMemo, useState } from "react";
import type { IncomingItemDraft, IncomingSourceMeta, Location, TransferDraft, TransferItemDraft } from "../../lib/incoming/types";

function niceLoc(locations: Location[], id: string) {
  return locations.find((l) => l.id === id)?.name || id;
}

export default function IncomingTransfer({
  locations,
  incoming,
  incomingMeta,
  value,
  onChange
}: {
  locations: Location[];
  incoming: IncomingItemDraft[];
  incomingMeta: Record<string, IncomingSourceMeta>;
  value: TransferDraft;
  onChange: (v: TransferDraft) => void;
}) {
  // NOTE: Backend hiányában itt csak "draft" mozgatási lista épül. Később:
  // - készlet ellenőrzés (fromLocation onHand)
  // - POST /api/transfers létrehozás
  // - PDF aviz generálás a docs fülön

  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return incoming;
    return incoming.filter((it) => {
      const hay = `${it.brand} ${it.sku} ${it.name} ${it.category} ${it.colorName} ${it.colorCode} ${it.size}`.toLowerCase();
      return hay.includes(s);
    });
  }, [incoming, q]);

  const addItem = (it: IncomingItemDraft) => {
    const key = [it.sku || "", it.size || "", it.colorCode || ""].join("|").toLowerCase();
    const existingIdx = value.items.findIndex((x) => x.key === key);
    if (existingIdx >= 0) {
      const next = value.items.map((x, i) => (i === existingIdx ? { ...x, qty: x.qty + it.qty } : x));
      onChange({ ...value, items: next });
      return;
    }
    const add: TransferItemDraft = {
      key,
      sku: it.sku || "",
      name: it.name || "",
      brand: it.brand || "",
      category: it.category || "",
      colorName: it.colorName || "",
      colorCode: it.colorCode || "",
      size: it.size || "",
      qty: it.qty
    };
    onChange({ ...value, items: [...value.items, add] });
  };

  const setItemQty = (idx: number, qty: number) => {
    const next = value.items.map((x, i) => (i === idx ? { ...x, qty } : x));
    onChange({ ...value, items: next });
  };

  const removeItem = (idx: number) => {
    onChange({ ...value, items: value.items.filter((_, i) => i !== idx) });
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold text-slate-800">Mozgatás (draft)</div>
        <div className="text-[11px] text-slate-500">Raktár ↔ Üzlet. Jelenleg csak összeíró.</div>
      </div>

      <div className="p-4 grid gap-4">
        <div className="grid gap-3 md:grid-cols-3 items-end">
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Honnan</div>
            <select
              value={value.fromLocationId}
              onChange={(e) => onChange({ ...value, fromLocationId: e.target.value })}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]"
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
              value={value.toLocationId}
              onChange={(e) => onChange({ ...value, toLocationId: e.target.value })}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Keresés (bejövő tételekben)</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px]"
              placeholder="márka, kód, név, szín, méret..."
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* Left: incoming list */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 text-[12px] font-semibold text-slate-800">Bejövő tételek</div>

            <div className="max-h-[360px] overflow-y-auto">
              {filtered.map((it, idx) => (
                <div key={idx} className="px-3 py-2 border-t border-slate-100 flex items-center justify-between gap-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="text-[12px] text-slate-800 font-semibold truncate">
                      {it.sku || "—"} <span className="text-slate-400 font-normal">·</span> {it.name || "—"}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {it.brand || "—"} · {it.category || "—"} · {it.colorName || "—"} {it.colorCode ? `(${it.colorCode})` : ""} · {it.size || "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-nowrap">
                    <span className="inline-flex w-[52px] justify-center px-2 py-1 rounded-md text-[12px] border bg-[#dde4ef] text-slate-700 border-[#dde4ef]">
                      {it.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => addItem(it)}
                      className="h-8 px-3 rounded-md bg-[#208d8b] hover:bg-[#1b7a78] text-white text-[12px]"
                      title="Hozzáad a mozgatáshoz"
                    >
                      + Mozgatás
                    </button>
                  </div>
                </div>
              ))}
              {!filtered.length ? <div className="px-3 py-6 text-[12px] text-slate-500">Nincs találat.</div> : null}
            </div>
          </div>

          {/* Right: transfer basket */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 text-[12px] font-semibold text-slate-800">
              Mozgatási lista: {niceLoc(locations, value.fromLocationId)} → {niceLoc(locations, value.toLocationId)}
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {value.items.map((it, idx) => (
                <div key={it.key} className="px-3 py-2 border-t border-slate-100 flex items-center justify-between gap-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="text-[12px] text-slate-800 font-semibold truncate">
                      {it.sku || "—"} <span className="text-slate-400 font-normal">·</span> {it.name || "—"}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {it.brand || "—"} · {it.category || "—"} · {it.colorName || "—"} {it.colorCode ? `(${it.colorCode})` : ""} · {it.size || "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-nowrap">
                    <input
                      type="number"
                      min={0}
                      value={it.qty}
                      onChange={(e) => setItemQty(idx, Math.max(0, Number(e.target.value || 0)))}
                      className="h-8 w-[78px] rounded-md border border-slate-200 bg-white px-2 text-[12px] text-center"
                      title="Darab"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="h-8 px-3 rounded-md bg-red-600 hover:bg-red-700 text-white text-[12px]"
                      title="Törlés"
                    >
                      Törlés
                    </button>
                  </div>
                </div>
              ))}

              {!value.items.length ? <div className="px-3 py-6 text-[12px] text-slate-500">Üres a mozgatási lista.</div> : null}
            </div>

            <div className="px-3 py-2 border-t border-slate-200 text-[11px] text-slate-500">
              Következő lépés: backend készletellenőrzés + mentés + dokumentum generálás.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
