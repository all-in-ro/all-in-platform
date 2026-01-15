import React, { useMemo, useState } from "react";
import type { DocDraft, IncomingItemDraft, IncomingSourceMeta, Location, TransferDraft } from "../../lib/incoming/types";

function niceLoc(locations: Location[], id: string) {
  return locations.find((l) => l.id === id)?.name || id;
}

function toPrintableHtml(doc: DocDraft, locations: Location[]) {
  const title = doc.docType === "aviz" ? "AVIZ / Aviz de însoțire a mărfii" : "RECEPȚIE / Proces verbal de recepție";
  const fromName = niceLoc(locations, doc.fromLocationId);
  const toName = niceLoc(locations, doc.toLocationId);

  const rows = doc.items
    .map(
      (it, i) => `
      <tr>
        <td style="padding:6px;border:1px solid #ddd">${i + 1}</td>
        <td style="padding:6px;border:1px solid #ddd">${escapeHtml(it.sku || "")}</td>
        <td style="padding:6px;border:1px solid #ddd">${escapeHtml(it.name || "")}</td>
        <td style="padding:6px;border:1px solid #ddd">${escapeHtml(it.colorName || "")} ${it.colorCode ? `(${escapeHtml(it.colorCode)})` : ""}</td>
        <td style="padding:6px;border:1px solid #ddd">${escapeHtml(it.size || "")}</td>
        <td style="padding:6px;border:1px solid #ddd;text-align:right">${it.qty}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .meta { font-size: 12px; color: #333; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; background: #f2f2f2; padding: 6px; border:1px solid #ddd; }
    .box { border: 1px solid #ddd; padding: 10px; border-radius: 8px; margin: 10px 0; }
    .sign { display:flex; gap:24px; margin-top: 18px; }
    .sign > div { flex:1; border-top:1px solid #777; padding-top: 8px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    Dátum: <b>${escapeHtml(doc.dateISO || "")}</b> &nbsp; | &nbsp;
    Szám: <b>${escapeHtml(doc.number || "-")}</b>
  </div>

  <div class="box">
    <div><b>Honnan:</b> ${escapeHtml(fromName)}</div>
    <div><b>Hová:</b> ${escapeHtml(toName)}</div>
    ${doc.partnerName ? `<div><b>Partner:</b> ${escapeHtml(doc.partnerName)}</div>` : ""}
    ${doc.notes ? `<div style="margin-top:6px"><b>Megjegyzés:</b> ${escapeHtml(doc.notes)}</div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>Kód</th><th>Termék</th><th>Szín</th><th>Méret</th><th style="text-align:right">Db</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="6" style="padding:10px;border:1px solid #ddd;color:#666">Nincs tétel.</td></tr>`}
    </tbody>
  </table>

  <div class="sign">
    <div>Átadó aláírás</div>
    <div>Átvevő aláírás</div>
  </div>

  <script>window.focus();</script>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function IncomingDocs({
  locations,
  incoming,
  incomingMeta,
  transfer,
  value,
  onChange
}: {
  locations: Location[];
  incoming: IncomingItemDraft[];
  incomingMeta: Record<string, IncomingSourceMeta>;
  transfer: TransferDraft;
  value: DocDraft;
  onChange: (v: DocDraft) => void;
}) {
  const canFromTransfer = transfer.items.length > 0;

  const fillFromTransfer = () => {
    onChange({
      ...value,
      fromLocationId: transfer.fromLocationId,
      toLocationId: transfer.toLocationId,
      items: transfer.items.map((x) => ({
        sku: x.sku,
        name: x.name,
        brand: x.brand,
        category: x.category,
        colorName: x.colorName,
        colorCode: x.colorCode,
        size: x.size,
        qty: x.qty
      }))
    });
  };

  const fillFromIncoming = () => {
    onChange({
      ...value,
      items: incoming.map((x) => ({
        sku: x.sku,
        name: x.name,
        brand: x.brand,
        category: x.category,
        colorName: x.colorName,
        colorCode: x.colorCode,
        size: x.size,
        qty: x.qty
      }))
    });
  };

  const openPrint = () => {
    const html = toPrintableHtml(value, locations);
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    // user prints to PDF (browser). Later: server-side PDF with proper numbering.
  };

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="text-[12px] font-semibold text-slate-800">Dokumentum (PDF / nyomtatás)</div>
        <div className="text-[11px] text-slate-500">Most böngésző-nyomtatás. Később rendes szerver-PDF.</div>
      </div>

      <div className="p-4 grid gap-4">
        <div className="grid gap-3 md:grid-cols-5 items-end">
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Típus</div>
            <select
              value={value.docType}
              onChange={(e) => onChange({ ...value, docType: e.target.value as any })}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]"
            >
              <option value="aviz">Aviz</option>
              <option value="receptie">Recepție</option>
            </select>
          </div>

          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Dátum</div>
            <input
              type="date"
              value={value.dateISO || ""}
              onChange={(e) => onChange({ ...value, dateISO: e.target.value })}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px]"
            />
          </div>

          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Szám (opcionális)</div>
            <input
              value={value.number || ""}
              onChange={(e) => onChange({ ...value, number: e.target.value })}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px]"
              placeholder="pl. AV-2026-001"
            />
          </div>

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
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Partner (opcionális)</div>
            <input
              value={value.partnerName || ""}
              onChange={(e) => onChange({ ...value, partnerName: e.target.value })}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px]"
              placeholder="pl. ALL IN Shop Kézdi"
            />
          </div>

          <div>
            <div className="text-[11px] text-slate-600 mb-1 font-medium">Megjegyzés</div>
            <input
              value={value.notes || ""}
              onChange={(e) => onChange({ ...value, notes: e.target.value })}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px]"
              placeholder="pl. szezonális feltöltés"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={fillFromTransfer}
              disabled={!canFromTransfer}
              className={
                "h-9 px-4 rounded-xl text-white text-[12px] " +
                (canFromTransfer ? "bg-[#208d8b] hover:bg-[#1b7a78]" : "bg-slate-300 cursor-not-allowed")
              }
              title="Mozgatás listából tölti"
            >
              Tételek: Mozgatásból
            </button>

            <button
              type="button"
              onClick={fillFromIncoming}
              disabled={!incoming.length}
              className={
                "h-9 px-4 rounded-xl text-white text-[12px] " +
                (incoming.length ? "bg-[#354153] hover:bg-[#3c5069]" : "bg-slate-300 cursor-not-allowed")
              }
              title="Bejövő tételekből tölti"
            >
              Tételek: Bejövőből
            </button>
          </div>

          <button
            type="button"
            onClick={openPrint}
            className="h-9 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[12px]"
            title="Nyomtatás / Mentés PDF-be"
          >
            Nyomtatás / PDF
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 text-[12px] font-semibold text-slate-800">
            Tételek ({value.items.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-white" style={{ backgroundColor: "#354153" }}>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[44px]">#</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[160px]">Kód</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] min-w-[240px]">Termék</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[160px]">Szín</th>
                  <th className="px-2 py-2 text-left font-normal text-[11px] w-[90px]">Méret</th>
                  <th className="px-2 py-2 text-right font-normal text-[11px] w-[90px] bg-white/5">Db</th>
                </tr>
              </thead>
              <tbody>
                {value.items.map((it, idx) => (
                  <tr key={idx} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-2 py-2 text-[11px] text-slate-700">{idx + 1}</td>
                    <td className="px-2 py-2 text-[11px] text-slate-700">
                      <span className="inline-flex px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200">{it.sku || "—"}</span>
                    </td>
                    <td className="px-2 py-2 text-[11px] text-slate-800">{it.name || "—"}</td>
                    <td className="px-2 py-2 text-[11px] text-slate-700">
                      {it.colorName || "—"} {it.colorCode ? <span className="text-slate-400">({it.colorCode})</span> : null}
                    </td>
                    <td className="px-2 py-2 text-[11px] text-slate-700">{it.size || "—"}</td>
                    <td className="px-2 py-2 text-[11px] text-right font-semibold text-slate-800 bg-slate-50">{it.qty}</td>
                  </tr>
                ))}
                {!value.items.length ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[12px] text-slate-500">
                      Nincs tétel. Töltsd fel Mozgatásból vagy Bejövőből.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Fontos: a „Nyomtatás / PDF” jelenleg böngészőből ment PDF-be. A végleges verzióhoz szerver oldali PDF kell (sorszám, logó, sablon, archiválás).
        </div>
      </div>
    </div>
  );
}
