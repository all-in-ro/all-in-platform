import React, { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { AifLocation, AifStockItem, apiAifMeta, apiAifStock } from "../lib/aif/api";

const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-[#354153] px-4 text-sm text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const input = "h-11 rounded-xl border border-white/20 bg-slate-900/40 px-3 text-white outline-none focus:border-white/50";
const card = "rounded-2xl border border-white/15 bg-white/8 p-5 shadow-lg";

function goHome() { window.location.hash = "#allin"; }

export default function AllInStockMoves() {
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [location, setLocation] = useState("");
  const [items, setItems] = useState<AifStockItem[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadMeta() {
    const meta = await apiAifMeta();
    const active = meta.locations.filter((x) => x.is_active);
    setLocations(active);
    setLocation((current) => current || active.find((x) => x.code === "main_warehouse")?.code || active[0]?.code || "");
  }

  async function load(loc = location) {
    if (!loc) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await apiAifStock(loc);
      setItems(data.items || []);
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült betölteni a készletet.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadMeta();
    })().catch((e) => setMessage(e.message || "Meta hiba"));
  }, []);

  useEffect(() => {
    if (location) load(location);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return (
    <main className="min-h-screen bg-[#4b5362] px-4 py-8 text-white font-normal">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/60">AllInFashion</p>
            <h1 className="text-2xl font-normal tracking-tight">Raktármozgás / készlet</h1>
            <p className="mt-1 text-sm text-white/70">Első körben helyszínenkénti készletnézet. A részletes mozgásnapló következő API kör.</p>
          </div>
          <button className={btn} onClick={goHome}><ArrowLeft size={17} /> Vissza</button>
        </header>

        {message && <div className="rounded-xl border border-white/20 bg-slate-900/35 px-4 py-3 text-sm text-white/85">{message}</div>}

        <section className={card}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-[260px] gap-2 text-sm text-white/75">
              Helyszín
              <select className={input} value={location} onChange={(e) => setLocation(e.target.value)}>
                {locations.map((l) => <option key={l.id} value={l.code} className="bg-slate-900">{l.name}</option>)}
              </select>
            </label>
            <button className={btn} disabled={busy} onClick={() => load()}><RefreshCw size={17} /> Frissítés</button>
          </div>
        </section>

        <section className={card}>
          <div className="overflow-auto rounded-xl border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-xs uppercase text-white/55">
                <tr>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">Termék</th>
                  <th className="px-3 py-3">Szín</th>
                  <th className="px-3 py-3">Méret</th>
                  <th className="px-3 py-3 text-right">Készlet</th>
                  <th className="px-3 py-3 text-right">Foglalt</th>
                  <th className="px-3 py-3 text-right">Elérhető</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {items.map((it) => (
                  <tr key={`${it.location_code}-${it.variant_id}`} className="bg-white/[0.03]">
                    <td className="px-3 py-3 font-mono text-xs text-white/70">{it.internal_sku}</td>
                    <td className="px-3 py-3">{it.title_ro}</td>
                    <td className="px-3 py-3">{it.color_name || it.color_code || "-"}</td>
                    <td className="px-3 py-3">{it.size}</td>
                    <td className="px-3 py-3 text-right">{it.qty}</td>
                    <td className="px-3 py-3 text-right">{it.reserved_qty}</td>
                    <td className="px-3 py-3 text-right">{it.available_qty}</td>
                  </tr>
                ))}
                {!items.length && <tr><td className="px-3 py-8 text-center text-white/55" colSpan={7}>Nincs készlet ezen a helyszínen.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
