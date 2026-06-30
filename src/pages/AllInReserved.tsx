import React from "react";
import { ArrowLeft } from "lucide-react";

const btn = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-[#354153] px-4 text-sm text-white hover:bg-[#3e4d63] font-normal";
function goHome() { window.location.hash = "#allin"; }

export default function AllInReserved() {
  return (
    <main className="min-h-screen bg-[#4b5362] px-4 py-8 text-white font-normal">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/60">AllInFashion</p>
            <h1 className="text-2xl font-normal tracking-tight">Lefoglalt termékek</h1>
            <p className="mt-1 text-sm text-white/70">Az új AIF foglalási logikát külön építjük, nem a régi termékes próbából.</p>
          </div>
          <button className={btn} onClick={goHome}><ArrowLeft size={17} /> Vissza</button>
        </header>
        <section className="rounded-2xl border border-white/15 bg-white/8 p-5 shadow-lg">
          <p className="text-sm text-white/75">Itt jön majd a Shopify rendelésből, kézi foglalásból és üzleti félretételből származó készletfoglalás. Most szándékosan nincs régi API-ra kötve.</p>
        </section>
      </div>
    </main>
  );
}
