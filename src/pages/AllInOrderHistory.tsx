import React from "react";
import { ArrowLeft } from "lucide-react";

const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-[#354153] px-4 text-sm text-white hover:bg-[#3e4d63]";
function goHome() { window.location.hash = "#allin"; }

export default function AllInOrderHistory() {
  return (
    <main className="min-h-screen bg-[#4b5362] px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/60">AllInFashion</p>
            <h1 className="text-2xl font-semibold tracking-tight">Rendelés – history</h1>
            <p className="mt-1 text-sm text-white/70">Shopify rendelés history később, tiszta AIF/Shopify mappingből.</p>
          </div>
          <button className={btn} onClick={goHome}><ArrowLeft size={17} /> Vissza</button>
        </header>
        <section className="rounded-2xl border border-white/15 bg-white/8 p-5 shadow-lg">
          <p className="text-sm text-white/75">Ez a rész még nincs rákötve semmilyen régi termékes API-ra. Így legalább nem hazudik, ami ritka luxus egy adminfelületen.</p>
        </section>
      </div>
    </main>
  );
}
