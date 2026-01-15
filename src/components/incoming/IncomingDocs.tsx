import React, { useMemo, useState } from "react";
import { Printer, FileText } from "lucide-react";
import type { DocDraft, Location, TransferDraft } from "../../lib/incoming/types";

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

    const title = docType === "aviz" ? "AVIZ DE ÎNSOȚIRE A MĂRFII" : "PROCES-VERBAL DE RECEPȚIE";
    const docNo = number || "(nincs szám)";
    const partner = partnerName || "(partner)";

    const rows = items
      .map(
        (it, i) => `
          <tr>
            <td style="padding:6px 8px;border:1px solid #ddd;">${i + 1}</td>
            <td style="padding:6px 8px;border:1px solid #ddd;"><b>${escapeHtml(it.sku)}</b><br/><span style="color:#666">${escapeHtml(
          it.name
        )}</span></td>
            <td style="padding:6px 8px;border:1px solid #ddd;">${escapeHtml(it.colorCode)} ${it.colorName ? "· " + escapeHtml(it.colorName) : ""}</td>
            <td style="padding:6px 8px;border:1px solid #ddd;">${escapeHtml(it.size)}</td>
            <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;"><b>${it.qty}</b></td>
            <td style="padding:6px 8px;border:1px solid #ddd;">${escapeHtml(it.category)}</td>
          </tr>
        `
      )
      .join("");

    const html = `
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 24px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
          <div>
            <div style="font-size:18px;font-weight:700;">${title}</div>
            <div style="color:#666;margin-top:4px;">Nr: <b>${escapeHtml(docNo)}</b> · Data: <b>${escapeHtml(dateISO)}</b></div>
          </div>
          <div style="text-align:right;color:#333;">
            <div style="font-weight:700;">ALL IN</div>
            <div style="color:#666;font-size:12px;">Document generat din sistem</div>
          </div>
        </div>

        <div style="margin-top:16px; display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="border:1px solid #ddd;border-radius:10px;padding:10px;">
            <div style="font-size:12px;color:#666;">De la</div>
            <div style="font-weight:700;">${escapeHtml(fromName)}</div>
          </div>
          <div style="border:1px solid #ddd;border-radius:10px;padding:10px;">
            <div style="font-size:12px;color:#666;">Către</div>
            <div style="font-weight:700;">${escapeHtml(toName)}</div>
          </div>
          <div style="border:1px solid #ddd;border-radius:10px;padding:10px; grid-column: 1 / span 2;">
            <div style="font-size:12px;color:#666;">Partener</div>
            <div style="font-weight:700;">${escapeHtml(partner)}</div>
            ${notes ? `<div style="color:#666;margin-top:6px;font-size:12px;">${escapeHtml(notes)}</div>` : ""}
          </div>
        </div>

        <table style="width:100%; border-collapse: collapse; margin-top: 16px; font-size: 12px;">
          <thead>
            <tr style="background:#f6f6f6;">
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">#</th>
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Produs</th>
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Culoare</th>
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Mărime</th>
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Cant</th>
              <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Categorie</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <div style="margin-top:24px; display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <div style="color:#666;font-size:12px;">Predat</div>
            <div style="margin-top:30px;border-top:1px solid #ddd;"></div>
          </div>
          <div>
            <div style="color:#666;font-size:12px;">Primit</div>
            <div style="margin-top:30px;border-top:1px solid #ddd;"></div>
          </div>
        </div>
      </body>
      </html>
    `;
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

function escapeHtml(s: any) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
