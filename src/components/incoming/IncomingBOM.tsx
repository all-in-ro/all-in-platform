import React from "react";

export default function IncomingBOM() {
  // BOM = termék összetevők / receptúra.
  // Később: termék kiválasztás, összetevő lista (SKU + mennyiség), verziózás, beszállítói alternatívák.
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold text-slate-800">Összetevők (BOM)</div>
        <div className="text-[11px] text-slate-500">Későbbi modul. Mert nyilván minden „később” lesz kész.</div>
      </div>

      <div className="p-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[12px] text-slate-600">
          Itt fogod kezelni, hogy egy termék (kabát/póló stb.) milyen összetevőkből áll (anyag, címke, csomagolás, kiegészítők).
          <div className="mt-2 text-[11px] text-slate-500">
            Backend javaslat: <span className="font-mono">products</span>, <span className="font-mono">bom_items</span> (product_id → component_sku + qty), verzió mezővel.
          </div>
        </div>
      </div>
    </div>
  );
}
