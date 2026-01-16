import React, { useMemo, useState } from "react";
import { Printer, FileText } from "lucide-react";
import type { DocDraft, Location, TransferDraft } from "../../lib/incoming/types";
import { buildIncomingDocHtml } from "../../lib/incoming/exportRo";

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function openPrintWindow(html: string) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

export default function IncomingDocs(props: {
  locations: Location[];
  transfer: TransferDraft;
  incomingCount: number;
}) {
  const { locations, transfer, incomingCount } = props;

  const [docType, setDocType] = useState<DocDraft["docType"]>("aviz");
  const [number, setNumber] = useState<string>("");
  const [dateISO, setDateISO] = useState<string>(todayISO());
  const [partnerName, setPartnerName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const fromName = useMemo(() => locations.find((l) => l.id === transfer.fromLocationId)?.name || "", [locations, transfer.fromLocationId]);
  const toName = useMemo(() => locations.find((l) => l.id === transfer.toLocationId)?.name || "", [locations, transfer.toLocationId]);

  const items = transfer.items;

  const canPrint = items.length > 0 && transfer.fromLocationId && transfer.toLocationId;

  const print = () => {
    if (!canPrint) return;

    const html = buildIncomingDocHtml({
      docType,
      number,
      dateISO,
      partnerName,
      notes,
      fromName,
      toName,
      items,
    });

    openPrintWindow(html);
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold text-slate-800 inline-flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-700" /> Dokumentumok (print → PDF)
        </div>
        <div className="text-[11px] text-slate-500">Aviz / Recepție generálás. Most browser-print, később backend PDF.</div>
      </div>

      <div className="p-4 grid gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Típus</div>
            <select value={docType} onChange={(e) => setDocType(e.target.value as any)} className="w-full h-10 rounded-xl border border-slate-300 px-3 text-[12px] bg-white">
              <option value="aviz">Aviz</option>
              <option value="receptie">Recepție</option>
            </select>
          </div>
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Szám</div>
            <input value={number} onChange={(e) => setNumber(e.target.value)} className="w-full h-10 rounded-xl border border-slate-300 px-3 text-[12px]" placeholder="pl. AVZ-2026-001" />
          </div>
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Dátum</div>
            <input type="date" value={dateISO} onChange={(e) => setDateISO(e.target.value)} className="w-full h-10 rounded-xl border border-slate-300 px-3 text-[12px]" />
          </div>
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Partner</div>
            <input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} className="w-full h-10 rounded-xl border border-slate-300 px-3 text-[12px]" placeholder="pl. ALL IN Shop" />
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-600 mb-1 font-medium">Megjegyzés</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full min-h-[80px] rounded-xl border border-slate-300 px-3 py-2 text-[12px]" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
          Tételek: <b>{items.length}</b> · Incoming tételek: <b>{incomingCount}</b>
        </div>

        <button
          type="button"
          disabled={!canPrint}
          onClick={print}
          className="h-10 px-4 rounded-xl bg-slate-900 text-white text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2 w-fit"
          title={canPrint ? "Nyomtatás (Print to PDF)" : "Előbb tegyél tételeket a Mozgatás részbe"}
        >
          <Printer className="w-4 h-4" /> Nyomtatás / PDF
        </button>
      </div>
    </div>
  );
}
