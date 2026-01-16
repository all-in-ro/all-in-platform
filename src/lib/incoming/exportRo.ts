/*
  ALL IN – Incoming export (RO)

  Requirement:
  - Internal UI uses Hungarian field labels/shape.
  - Official documents (Aviz + Recepție) must be generated in Romanian.

  This module centralizes Romanian labels + printable HTML generation,
  so TSX components do not hardcode headers/labels.
*/

export type ExportDocType = "aviz" | "receptie";

export type ExportItem = {
  sku: string;
  brand?: string;
  name: string;
  gender?: string;
  colorCode?: string;
  colorName?: string;
  size?: string;
  category?: string;
  qty: number;
  buyPrice?: number | string | null;
};

function escapeHtml(s: any) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildIncomingDocHtml(args: {
  docType: ExportDocType;
  number: string;
  dateISO: string;
  partnerName: string;
  notes: string;
  fromName: string;
  toName: string;
  items: ExportItem[];
}): string {
  const { docType, number, dateISO, partnerName, notes, fromName, toName, items } = args;

  const title = docType === "aviz" ? "AVIZ DE ÎNSOȚIRE A MĂRFII" : "PROCES-VERBAL DE RECEPȚIE";
  const docNo = number || "(nincs szám)";
  const partner = partnerName || "(partner)";

  const rows = (items || [])
    .map(
      (it, i) => `
        <tr>
          <td style="padding:6px 8px;border:1px solid #ddd;">${i + 1}</td>
          <td style="padding:6px 8px;border:1px solid #ddd;"><b>${escapeHtml(it.sku)}</b><br/><span style="color:#666">${escapeHtml(
        it.name
      )}</span></td>
          <td style="padding:6px 8px;border:1px solid #ddd;">${escapeHtml(it.colorCode || "")} ${it.colorName ? "· " + escapeHtml(it.colorName) : ""}</td>
          <td style="padding:6px 8px;border:1px solid #ddd;">${escapeHtml(it.size || "")}</td>
          <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;"><b>${Number(it.qty || 0)}</b></td>
          <td style="padding:6px 8px;border:1px solid #ddd;">${escapeHtml(it.category || "")}</td>
        </tr>
      `
    )
    .join("");

  return `
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
}
