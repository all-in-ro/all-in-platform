import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import { AifInventoryItem, apiAifInventory } from "../lib/aif/api";

const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-[#354153] px-4 text-sm text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50";
const input = "h-11 rounded-xl border border-white/20 bg-slate-900/40 px-3 text-white outline-none focus:border-white/50";
const card = "rounded-2xl border border-white/15 bg-white/8 p-5 shadow-lg";

function goHome() {
  window.location.hash = "#allin";
}

function money(v: unknown) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : String(v);
}

export default function AllInWarehouse() {
  const [items, setItems] = useState<AifInventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const totals = useMemo(() => {
    return items.reduce(
      (acc, x) => {
        acc.qty += Number(x.total_qty || 0);
        acc.available += Number(x.available_qty || 0);
        acc.variants += 1;
        return acc;
      },
      { variants: 0, qty: 0, available: 0 }
    );
  }, [items]);

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const data = await apiAifInventory(search, 500);
      setItems(data.items || []);
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült betölteni a raktárt.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-[#4b5362] px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/60">AllInFashion</p>
            <h1 className="text-2xl font-semibold tracking-tight">Raktár</h1>
            <p className="mt-1 text-sm text-white/70">Új AIF készletnézet, belső variáns azonosítóval.</p>
          </div>
          <button className={btn} onClick={goHome}><ArrowLeft size={17} /> Vissza</button>
        </header>

        {message && <div className="rounded-xl border border-white/20 bg-slate-900/35 px-4 py-3 text-sm text-white/85">{message}</div>}

        <section className={card}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-[260px] flex-1 gap-2 text-sm text-white/75">
              Keresés
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 text-white/40" size={18} />
                <input className={`${input} w-full pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="SKU, név, márka, szín, méret" />
              </div>
            </label>
            <button className={btn} onClick={load} disabled={busy}><RefreshCw size={17} /> Frissítés</button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-slate-900/35 p-4"><p className="text-xs text-white/55">Variáns</p><p className="mt-1 text-lg">{totals.variants}</p></div>
            <div className="rounded-xl bg-slate-900/35 p-4"><p className="text-xs text-white/55">Össz készlet</p><p className="mt-1 text-lg">{totals.qty}</p></div>
            <div className="rounded-xl bg-slate-900/35 p-4"><p className="text-xs text-white/55">Elérhető</p><p className="mt-1 text-lg">{totals.available}</p></div>
          </div>
        </section>

        <section className={card}>
          <div className="overflow-auto rounded-xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-xs uppercase text-white/55">
                <tr>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">Márka</th>
                  <th className="px-3 py-3">Termék</th>
                  <th className="px-3 py-3">Kategória</th>
                  <th className="px-3 py-3">Nem</th>
                  <th className="px-3 py-3">Szín</th>
                  <th className="px-3 py-3">Méret</th>
                  <th className="px-3 py-3 text-right">Készlet</th>
                  <th className="px-3 py-3 text-right">Elérhető</th>
                  <th className="px-3 py-3 text-right">Ár</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {items.map((it) => (
                  <tr key={it.variant_id} className="bg-white/[0.03] hover:bg-white/[0.06]">
                    <td className="px-3 py-3 font-mono text-xs text-white/70">{it.internal_sku}</td>
                    <td className="px-3 py-3">{it.brand_name || "-"}</td>
                    <td className="px-3 py-3">{it.title_ro}</td>
                    <td className="px-3 py-3">{it.category_name_ro || it.category_code || "-"}</td>
                    <td className="px-3 py-3">{it.gender || "-"}</td>
                    <td className="px-3 py-3">{it.color_name || it.color_code || "-"}</td>
                    <td className="px-3 py-3">{it.size}</td>
                    <td className="px-3 py-3 text-right">{it.total_qty}</td>
                    <td className="px-3 py-3 text-right">{it.available_qty}</td>
                    <td className="px-3 py-3 text-right">{money(it.sell_price)}</td>
                  </tr>
                ))}
                {!items.length && (
                  <tr><td className="px-3 py-8 text-center text-white/55" colSpan={10}>Nincs termék az új AIF rendszerben. Előbb import, aztán lesz mit nézegetni.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
