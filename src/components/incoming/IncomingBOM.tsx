import React from "react";
import { Layers } from "lucide-react";

export default function IncomingBOM() {
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold text-slate-800 inline-flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-700" /> Összetevők (BOM)
        </div>
        <div className="text-[11px] text-slate-500">Később: kabát/póló összetevők kezelése.</div>
      </div>
      <div className="p-4 text-[12px] text-slate-600">
        Itt lesz a termék → összetevők lista (anyagok, cipzár, címke, stb.). Backend nélkül most csak placeholder, hogy a menü már éljen.
      </div>
    </div>
  );
}
