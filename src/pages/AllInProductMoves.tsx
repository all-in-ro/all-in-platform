import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Home,
  MapPin,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";

const page = "min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-4 sm:py-5";
const shell = "mx-auto max-w-[1500px] space-y-4";
const panel = "overflow-hidden rounded-2xl border border-white/14 bg-white/[0.07] shadow-lg";
const panelHead = "flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3";
const btn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/18 bg-[#354153] px-3 text-xs text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50";
const btnSoft = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/14 bg-white/[0.07] px-3 text-xs text-white transition hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50";
const primaryBtn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/40 bg-[#2a8d8b] px-3 text-xs text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50";
const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/18 bg-[#354153] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50";
const input = "h-10 w-full rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/20";
const select = "h-10 w-full rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/20";
const label = "grid min-w-0 gap-1.5 text-xs text-white/65";

const API_BASE = "/api/aif";

type LocationItem = {
  id: string;
  code?: string | null;
  name: string;
};

type TransferDocumentSettings = {
  series: string;
  nextNumber: number;
  digits: number;
  includeYear: boolean;
  yearlyReset: boolean;
  sequenceYear: number;
  documentTitle: string;
  documentSubtitle: string;
  previewNumber: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type TransferDocumentListItem = {
  id: string;
  transfer_id: string;
  document_number: string;
  series?: string | null;
  sequence_number?: number | string | null;
  sequence_year?: number | string | null;
  title?: string | null;
  subtitle?: string | null;
  note?: string | null;
  status?: "issued" | "cancelled" | "legacy" | string;
  actor?: string | null;
  owner_key?: string | null;
  line_count?: number | string | null;
  total_qty?: number | string | null;
  from_location_summary?: string | null;
  to_location_summary?: string | null;
  raw?: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
  isLegacy?: boolean;
  source?: "official" | "legacy" | string;
};

type TransferDocumentLine = {
  id?: string;
  line_no: number | string;
  variant_id?: string | null;
  product_title?: string | null;
  brand_name?: string | null;
  category_name?: string | null;
  product_code?: string | null;
  barcode?: string | null;
  color_name?: string | null;
  size?: string | null;
  image_url?: string | null;
  from_location_id?: string | null;
  from_location_name?: string | null;
  to_location_id?: string | null;
  to_location_name?: string | null;
  qty: number | string;
  source_before?: number | string | null;
  source_after?: number | string | null;
  target_before?: number | string | null;
  target_after?: number | string | null;
  raw?: Record<string, unknown> | null;
};

type TransferDocumentDetail = {
  document: TransferDocumentListItem;
  lines: TransferDocumentLine[];
};

type ListTotals = {
  total: number;
  official: number;
  legacy: number;
  cancelled: number;
  totalQty: number;
};

type ListResponse = {
  items: TransferDocumentListItem[];
  totals: ListTotals;
  page: number;
  pages: number;
  limit: number;
  total: number;
  locations: LocationItem[];
};

type DocumentTypeFilter = "all" | "official" | "legacy" | "cancelled";

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function qty(value: unknown) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(n(value));
}

function dateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateOnly(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function roDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[;\n\r"]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(String(body?.error || body?.message || `${response.status} ${response.statusText}`));
  }
  return body as T;
}

function goHome() {
  window.location.hash = "#allin";
}

function documentBadge(item: TransferDocumentListItem) {
  if (item.isLegacy || item.status === "legacy") {
    return {
      label: "Régi átadás",
      cls: "border-amber-200/28 bg-amber-500/12 text-amber-50",
      icon: Archive,
    };
  }
  if (item.status === "cancelled") {
    return {
      label: "Sztornózott",
      cls: "border-rose-200/30 bg-rose-500/12 text-rose-50",
      icon: X,
    };
  }
  return {
    label: "Hivatalos",
    cls: "border-[#7bd7d4]/38 bg-[#2a8d8b]/18 text-[#d7fffd]",
    icon: ShieldCheck,
  };
}

function makePrintHtml(detail: TransferDocumentDetail) {
  const doc = detail.document;
  const lines = detail.lines || [];
  const totalQty = lines.reduce((sum, line) => sum + n(line.qty), 0);
  const fromLocations = Array.from(new Set(lines.map((line) => String(line.from_location_name || "").trim()).filter(Boolean)));
  const toLocations = Array.from(new Set(lines.map((line) => String(line.to_location_name || "").trim()).filter(Boolean)));
  const fromSummary = doc.from_location_summary || (fromLocations.length === 1 ? fromLocations[0] : "Conform tabelului");
  const toSummary = doc.to_location_summary || (toLocations.length === 1 ? toLocations[0] : "Conform tabelului");
  const legacyMark = doc.isLegacy || doc.status === "legacy"
    ? `<div class="legacy">ARHIVĂ TEHNICĂ · document reconstruit din jurnalul de stoc</div>`
    : "";
  const rows = lines.map((line, index) => {
    const image = line.image_url
      ? `<img class="img" src="${escapeHtml(line.image_url)}" alt="" />`
      : `<div class="img empty">Fără foto</div>`;
    const variant = [line.brand_name, line.category_name, line.color_name, line.size]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" • ");
    return `<tr>
      <td class="center">${index + 1}</td>
      <td><div class="product">${image}<div><strong>${escapeHtml(line.product_title || "Produs")}</strong>${variant ? `<small>${escapeHtml(variant)}</small>` : ""}</div></div></td>
      <td class="code">${escapeHtml(line.product_code || "-")}</td>
      <td class="code">${escapeHtml(line.barcode || "-")}</td>
      <td>${escapeHtml(line.from_location_name || "-")}</td>
      <td>${escapeHtml(line.to_location_name || "-")}</td>
      <td class="center">buc.</td>
      <td class="qty">${escapeHtml(qty(line.qty))}</td>
    </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(`${doc.title || "Proces-verbal"} ${doc.document_number}`)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; background:#fff; color:#172033; }
  body { font-family:Arial,Helvetica,sans-serif; font-size:11px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .top { display:grid; grid-template-columns:minmax(0,1fr) minmax(68mm,.9fr); gap:9mm; align-items:start; padding-bottom:5mm; border-bottom:2px solid #255f54; }
  .company { color:#183d36; font-size:17px; font-weight:700; letter-spacing:.03em; }
  .companyMeta { margin-top:2.5mm; color:#465467; font-size:9.5px; line-height:1.45; }
  .docBox { border:1px solid #b9c7c4; border-radius:3mm; overflow:hidden; }
  .docBox h3 { margin:0; padding:2.2mm 3mm; background:#255f54; color:#fff; font-size:9px; letter-spacing:.09em; text-transform:uppercase; }
  .docBoxBody { padding:2.5mm 3mm; background:#f5f8f7; }
  .docLine { display:flex; justify-content:space-between; gap:5mm; padding:1.1mm 0; border-bottom:1px solid #d8e0de; }
  .docLine:last-child { border-bottom:0; }
  .docLine span { color:#667382; }
  .docLine strong { text-align:right; color:#172033; }
  .title { padding:5mm 0 3.5mm; text-align:center; }
  .eyebrow { color:#255f54; font-size:8.5px; font-weight:700; letter-spacing:.15em; text-transform:uppercase; }
  h1 { margin:1.5mm 0 0; font-size:20px; line-height:1.15; letter-spacing:.02em; }
  .subtitle { margin-top:1.5mm; color:#526070; }
  .legacy { margin:2.5mm auto 0; display:inline-block; border:1px solid #d69d28; border-radius:999px; padding:1.2mm 2.5mm; background:#fff8e8; color:#8a5b00; font-size:8px; font-weight:700; letter-spacing:.05em; }
  .route { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:3mm; margin-bottom:3.5mm; }
  .routeCard { border:1px solid #ccd7d4; border-radius:2.5mm; padding:2.5mm 3mm; background:#f7faf9; }
  .routeCard span { display:block; color:#6a7683; font-size:8px; letter-spacing:.08em; text-transform:uppercase; }
  .routeCard strong { display:block; margin-top:1mm; font-size:11px; }
  .declaration { margin-bottom:3.5mm; border-left:3px solid #255f54; background:#f5f8f7; padding:2.5mm 3mm; color:#354353; line-height:1.45; }
  .note { margin-bottom:3.5mm; border:1px solid #d3dcda; border-radius:2.5mm; padding:2.5mm 3mm; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; }
  thead { display:table-header-group; }
  tr { break-inside:avoid; page-break-inside:avoid; }
  th { background:#26384b; color:#fff; border:1px solid #26384b; padding:2.2mm 1.4mm; font-size:7.7px; line-height:1.2; text-transform:uppercase; text-align:left; }
  td { border:1px solid #d4dcdf; padding:1.7mm 1.4mm; font-size:8.5px; line-height:1.25; vertical-align:middle; overflow-wrap:anywhere; }
  tbody tr:nth-child(even) td { background:#f8fafb; }
  th:nth-child(1),td:nth-child(1){width:7mm} th:nth-child(2),td:nth-child(2){width:51mm} th:nth-child(3),td:nth-child(3){width:24mm} th:nth-child(4),td:nth-child(4){width:27mm} th:nth-child(5),td:nth-child(5),th:nth-child(6),td:nth-child(6){width:27mm} th:nth-child(7),td:nth-child(7){width:10mm} th:nth-child(8),td:nth-child(8){width:12mm}
  .center{text-align:center}.qty{text-align:center;font-size:11px;font-weight:700;color:#255f54}.code{font-family:"Courier New",monospace;font-size:8px}
  .product{display:flex;align-items:center;gap:2mm;min-width:0}.product strong{display:block;font-size:9px}.product small{display:block;margin-top:.7mm;color:#667382;font-size:7.5px}
  .img{width:9mm;height:11mm;flex:0 0 auto;object-fit:contain;border:1px solid #d4dcdf;border-radius:1.5mm;background:#fff}.img.empty{display:flex;align-items:center;justify-content:center;padding:1mm;color:#9aa4ae;font-size:5.5px;text-align:center}
  .total { display:grid; grid-template-columns:minmax(0,1fr) auto; margin-top:2.5mm; border:1px solid #b9c7c4; border-radius:2.5mm; overflow:hidden; }
  .total span { padding:2.4mm 3mm; color:#536171; background:#f5f8f7; }.total strong { min-width:30mm; padding:2.4mm 3mm; text-align:center; color:#fff; background:#255f54; font-size:13px; }
  .signatures { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4mm; margin-top:13mm; break-inside:avoid; }
  .signature { min-height:27mm; border:1px solid #ccd7d4; border-radius:2.5mm; padding:2.5mm; }.signatureTitle{color:#255f54;font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}.signatureLine{margin-top:9mm;border-top:1px solid #667382;padding-top:1.3mm;color:#667382;font-size:7.2px;text-align:center}.signatureDate{margin-top:2.5mm;color:#7b8793;font-size:7.2px;text-align:center}
  .footer { display:flex; justify-content:space-between; gap:8mm; margin-top:5mm; padding-top:2.5mm; border-top:1px solid #d7dfdd; color:#7b8793; font-size:7.2px; }
</style>
</head>
<body>
<div class="top">
  <div><div class="company">TITAN EURO-COM SRL</div><div class="companyMeta"><div><strong>CUI:</strong> RO17495362</div><div><strong>Nr. Reg. Com.:</strong> J19/420/2005</div><div><strong>Sediu:</strong> Str. Mihail Sadoveanu nr. 33, sc. C, et. 4, ap. 17, Miercurea-Ciuc, jud. Harghita, România</div></div></div>
  <div class="docBox"><h3>Datele documentului</h3><div class="docBoxBody"><div class="docLine"><span>Nr. document</span><strong>${escapeHtml(doc.document_number)}</strong></div><div class="docLine"><span>Data emiterii</span><strong>${escapeHtml(roDateTime(doc.created_at))}</strong></div><div class="docLine"><span>Tip operațiune</span><strong>Transfer intern de stoc</strong></div></div></div>
</div>
<div class="title"><div class="eyebrow">Document intern de gestiune</div><h1>${escapeHtml(doc.title || "PROCES-VERBAL DE PREDARE-PRIMIRE")}</h1><div class="subtitle">${escapeHtml(doc.subtitle || "Transfer intern de stoc")}</div>${legacyMark}</div>
<div class="route"><div class="routeCard"><span>Gestiune predătoare</span><strong>${escapeHtml(fromSummary || "Conform tabelului")}</strong></div><div class="routeCard"><span>Gestiune primitoare</span><strong>${escapeHtml(toSummary || "Conform tabelului")}</strong></div></div>
<div class="declaration">Prin prezentul document se confirmă predarea și primirea produselor enumerate mai jos, în cantitățile indicate, pentru transfer intern între gestiuni. Persoanele semnatare confirmă verificarea cantitativă a bunurilor.</div>
${doc.note ? `<div class="note"><strong>Observații:</strong> ${escapeHtml(doc.note)}</div>` : ""}
<table><thead><tr><th>Nr. crt.</th><th>Denumirea produsului / varianta</th><th>Cod produs</th><th>Cod de bare</th><th>Gestiune predătoare</th><th>Gestiune primitoare</th><th>U.M.</th><th>Cant.</th></tr></thead><tbody>${rows}</tbody></table>
<div class="total"><span>Total produse transferate: ${lines.length} poziții</span><strong>${qty(totalQty)} buc.</strong></div>
<div class="signatures"><div class="signature"><div class="signatureTitle">Predat de</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div><div class="signature"><div class="signatureTitle">Transportat de</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div><div class="signature"><div class="signatureTitle">Primit de</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div><div class="signature"><div class="signatureTitle">Verificat de</div><div class="signatureLine">Nume, prenume și semnătură</div><div class="signatureDate">Data: __________________</div></div></div>
<div class="footer"><span>Document generat din sistemul AllInFashion.</span><span>${escapeHtml(doc.document_number)} • ${escapeHtml(roDateTime(doc.created_at))}</span></div>
</body></html>`;
}

function printDetail(detail: TransferDocumentDetail) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error("A böngésző nem engedte megnyitni a nyomtatási keretet.");
  }
  let cleaned = false;
  let timer: number | undefined;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (timer) window.clearTimeout(timer);
    iframe.remove();
  };
  win.addEventListener("afterprint", cleanup, { once: true });
  doc.open();
  doc.write(makePrintHtml(detail));
  doc.close();
  win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
    win.focus();
    win.print();
    timer = window.setTimeout(cleanup, 60000);
  }));
}

function downloadDetailCsv(detail: TransferDocumentDetail) {
  const rows = [
    ["Număr document", detail.document.document_number],
    ["Data emiterii", roDateTime(detail.document.created_at)],
    ["Gestiune predătoare", detail.document.from_location_summary || ""],
    ["Gestiune primitoare", detail.document.to_location_summary || ""],
    ["Observații", detail.document.note || ""],
    [],
    ["Nr. crt.", "Denumire produs", "Marcă", "Categorie", "Cod produs", "Cod de bare", "Culoare", "Mărime", "Gestiune predătoare", "Gestiune primitoare", "Cantitate"],
    ...detail.lines.map((line, index) => [
      index + 1,
      line.product_title || "",
      line.brand_name || "",
      line.category_name || "",
      line.product_code || "",
      line.barcode || "",
      line.color_name || "",
      line.size || "",
      line.from_location_name || "",
      line.to_location_name || "",
      qty(line.qty),
    ]),
  ];
  const csv = "\ufeff" + rows.map((row) => row.map(safeCsv).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `proces_verbal_${detail.document.document_number.replace(/[^a-zA-Z0-9._-]+/g, "_")}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function SummaryCard({ labelText, value, hint, tone = "neutral" }: { labelText: string; value: React.ReactNode; hint: string; tone?: "neutral" | "green" | "amber" | "blue" }) {
  const toneClass = tone === "green"
    ? "border-[#7bd7d4]/28 bg-[#2a8d8b]/13"
    : tone === "amber"
      ? "border-amber-200/22 bg-amber-500/10"
      : tone === "blue"
        ? "border-sky-200/22 bg-sky-500/10"
        : "border-white/12 bg-white/[0.06]";
  return <div className={`rounded-2xl border p-3 ${toneClass}`}><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">{labelText}</p><p className="mt-1 text-[26px] leading-none text-white">{value}</p><p className="mt-1.5 text-[11px] text-white/45">{hint}</p></div>;
}

export default function AllInProductMoves() {
  const [items, setItems] = useState<TransferDocumentListItem[]>([]);
  const [totals, setTotals] = useState<ListTotals>({ total: 0, official: 0, legacy: 0, cancelled: 0, totalQty: 0 });
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [pageNo, setPageNo] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit, setLimit] = useState(30);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [type, setType] = useState<DocumentTypeFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<TransferDocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [settings, setSettings] = useState<TransferDocumentSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<TransferDocumentSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    const result = await fetchJson<{ settings: TransferDocumentSettings }>("/stock-transfer-documents/settings");
    setSettings(result.settings);
    setSettingsDraft(result.settings);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      query.set("page", String(pageNo));
      query.set("limit", String(limit));
      if (search.trim()) query.set("search", search.trim());
      if (from) query.set("from", from);
      if (to) query.set("to", to);
      if (fromLocation) query.set("fromLocation", fromLocation);
      if (toLocation) query.set("toLocation", toLocation);
      if (type !== "all") query.set("type", type);
      const result = await fetchJson<ListResponse>(`/stock-transfer-documents?${query.toString()}`);
      setItems(result.items || []);
      setTotals(result.totals || { total: 0, official: 0, legacy: 0, cancelled: 0, totalQty: 0 });
      setPageNo(result.page || 1);
      setPages(result.pages || 1);
      setLocations(result.locations || []);
    } catch (loadError: any) {
      setError(loadError?.message || "A készletátadások betöltése nem sikerült.");
    } finally {
      setLoading(false);
    }
  }, [from, fromLocation, limit, pageNo, search, to, toLocation, type]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadSettings().catch((loadError) => setError(loadError?.message || "A számozási beállítás betöltése nem sikerült."));
  }, [loadSettings]);

  useEffect(() => {
    if (!detail && !settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (settingsOpen) setSettingsOpen(false);
      else setDetail(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [detail, settingsOpen]);

  const openDetail = useCallback(async (item: TransferDocumentListItem) => {
    setDetailLoading(true);
    setError("");
    try {
      const result = await fetchJson<TransferDocumentDetail>(`/stock-transfer-documents/${encodeURIComponent(item.id)}`);
      setDetail(result);
    } catch (loadError: any) {
      setError(loadError?.message || "A bizonylat részleteinek betöltése nem sikerült.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const ensureDetail = useCallback(async (item: TransferDocumentListItem) => {
    if (detail?.document.id === item.id) return detail;
    return fetchJson<TransferDocumentDetail>(`/stock-transfer-documents/${encodeURIComponent(item.id)}`);
  }, [detail]);

  async function printItem(item: TransferDocumentListItem) {
    try {
      const current = await ensureDetail(item);
      printDetail(current);
    } catch (printError: any) {
      setError(printError?.message || "A PDF megnyitása nem sikerült.");
    }
  }

  async function csvItem(item: TransferDocumentListItem) {
    try {
      const current = await ensureDetail(item);
      downloadDetailCsv(current);
    } catch (csvError: any) {
      setError(csvError?.message || "A CSV export nem sikerült.");
    }
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setSettingsSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await fetchJson<{ settings: TransferDocumentSettings }>("/stock-transfer-documents/settings", {
        method: "PUT",
        body: JSON.stringify({ settings: settingsDraft }),
      });
      setSettings(result.settings);
      setSettingsDraft(result.settings);
      setSettingsOpen(false);
      setMessage(`Proces-verbal számozás elmentve. Következő szám: ${result.settings.previewNumber}.`);
    } catch (saveError: any) {
      setError(saveError?.message || "A számozási beállítás mentése nem sikerült.");
    } finally {
      setSettingsSaving(false);
    }
  }

  function applySearch() {
    setPageNo(1);
    setSearch(searchDraft.trim());
  }

  function clearFilters() {
    setSearchDraft("");
    setSearch("");
    setFrom("");
    setTo("");
    setFromLocation("");
    setToLocation("");
    setType("all");
    setPageNo(1);
  }

  const activeFilterCount = useMemo(() => [search, from, to, fromLocation, toLocation, type !== "all" ? type : ""].filter(Boolean).length, [from, fromLocation, search, to, toLocation, type]);

  return <div className={page}>
    <div className={shell}>
      <header className="sticky top-2 z-40 rounded-2xl border border-white/20 bg-[#303a4c]/96 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[260px] items-center gap-3 border-l-4 border-[#7bd7d4]/70 pl-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/18 text-[#d7fffd]"><ArrowRightLeft size={20} /></span>
            <div><p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">AllInFashion</p><h1 className="mt-0.5 text-xl leading-tight">Termékátadások</h1><p className="mt-0.5 text-[11px] text-white/48">Proces-verbal, aviz és készletátadási archívum</p></div>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {settings ? <span className="hidden rounded-full border border-[#7bd7d4]/24 bg-[#2a8d8b]/12 px-2.5 py-1 text-[10px] text-[#cffffd]/78 sm:inline">Következő: {settings.previewNumber}</span> : null}
            <button type="button" className={iconBtn} onClick={() => { setSettingsDraft(settings); setSettingsOpen(true); }} title="Admin beállítások" aria-label="Admin beállítások"><Settings size={16} /></button>
            <button type="button" className={btnSoft} onClick={() => void loadList()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Frissítés</button>
            <button type="button" className={btn} onClick={goHome}><Home size={15} /> Kezdőlap</button>
          </div>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-rose-200/25 bg-rose-500/12 px-4 py-3 text-sm text-rose-50">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-[#7bd7d4]/24 bg-[#174c55]/72 px-4 py-3 text-sm text-cyan-50">{message}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard labelText="Összes átadás" value={qty(totals.total)} hint="A jelenlegi szűrésben" />
        <SummaryCard labelText="Hivatalos bizonylat" value={qty(totals.official)} hint="Sorszámozott proces-verbal" tone="green" />
        <SummaryCard labelText="Régi archívum" value={qty(totals.legacy)} hint="Korábbi mozgásnaplóból" tone="amber" />
        <SummaryCard labelText="Átadott mennyiség" value={`${qty(totals.totalQty)} db`} hint="Összesített darabszám" tone="blue" />
        <SummaryCard labelText="Következő sorszám" value={settings?.previewNumber || "-"} hint="Admin beállítás alapján" tone="green" />
      </div>

      <section className={panel}>
        <div className={panelHead}><div><p className="text-[10px] uppercase tracking-[0.17em] text-white/40">Szűrés és keresés</p><h2 className="mt-1 flex items-center gap-2 text-base"><SlidersHorizontal size={17} /> Bizonylatok gyors visszakeresése</h2></div>{activeFilterCount ? <span className="rounded-full border border-amber-200/25 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-50">{activeFilterCount} aktív szűrő</span> : null}</div>
        <div className="grid gap-3 p-4 lg:grid-cols-4 xl:grid-cols-7">
          <label className={`${label} lg:col-span-2 xl:col-span-2`}>Keresés<div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/38" /><input className={`${input} pl-9`} value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }} placeholder="Bizonylatszám, termék, vonalkód, helyszín..." /></div></label>
          <label className={label}>Ettől<input className={input} type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPageNo(1); }} /></label>
          <label className={label}>Eddig<input className={input} type="date" value={to} onChange={(event) => { setTo(event.target.value); setPageNo(1); }} /></label>
          <label className={label}>Forrás<select className={select} value={fromLocation} onChange={(event) => { setFromLocation(event.target.value); setPageNo(1); }}><option value="">Minden forrás</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className={label}>Cél<select className={select} value={toLocation} onChange={(event) => { setToLocation(event.target.value); setPageNo(1); }}><option value="">Minden célhely</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className={label}>Típus<select className={select} value={type} onChange={(event) => { setType(event.target.value as DocumentTypeFilter); setPageNo(1); }}><option value="all">Minden bizonylat</option><option value="official">Hivatalos</option><option value="legacy">Régi archívum</option><option value="cancelled">Sztornózott</option></select></label>
          <div className="flex items-end gap-2 lg:col-span-4 xl:col-span-7"><button type="button" className={primaryBtn} onClick={applySearch}><Search size={15} /> Keresés</button><button type="button" className={btnSoft} onClick={clearFilters}><X size={15} /> Szűrők törlése</button></div>
        </div>
      </section>

      <section className={panel}>
        <div className={panelHead}>
          <div><p className="text-[10px] uppercase tracking-[0.17em] text-white/40">Átadási archívum</p><h2 className="mt-1 flex items-center gap-2 text-base"><FileText size={17} /> Proces-verbal és aviz előzmények</h2></div>
          <div className="flex items-center gap-2 text-xs text-white/55"><span>{qty(totals.total)} találat</span><select className="h-9 rounded-xl border border-white/14 bg-[#354153] px-2 text-xs text-white" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPageNo(1); }}><option value={30}>30 / oldal</option><option value={50}>50 / oldal</option><option value={100}>100 / oldal</option></select></div>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead className="bg-[#293448] text-[10px] uppercase tracking-[0.08em] text-white/60"><tr><th className="px-4 py-3 text-left">Bizonylat</th><th className="px-4 py-3 text-left">Dátum</th><th className="px-4 py-3 text-left">Útvonal</th><th className="px-4 py-3 text-center">Sor / db</th><th className="px-4 py-3 text-left">Rögzítette</th><th className="px-4 py-3 text-left">Megjegyzés</th><th className="px-4 py-3 text-right">Művelet</th></tr></thead>
            <tbody>
              {items.map((item) => {
                const badge = documentBadge(item);
                const BadgeIcon = badge.icon;
                return <tr key={item.id} className="border-t border-white/10 align-middle transition hover:bg-white/[0.035]">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06]"><FileText size={18} /></span><div><p className="font-medium text-white">{item.document_number}</p><span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${badge.cls}`}><BadgeIcon size={11} /> {badge.label}</span></div></div></td>
                  <td className="px-4 py-3 text-white/72">{dateTime(item.created_at)}</td>
                  <td className="px-4 py-3"><div className="grid gap-1"><span className="inline-flex items-center gap-1.5 text-white/76"><ArrowLeft size={13} className="text-[#7bd7d4]" /> {item.from_location_summary || "Conform tabelului"}</span><span className="inline-flex items-center gap-1.5 text-white/76"><ArrowRight size={13} className="text-[#7bd7d4]" /> {item.to_location_summary || "Conform tabelului"}</span></div></td>
                  <td className="px-4 py-3 text-center"><span className="rounded-full border border-[#7bd7d4]/26 bg-[#2a8d8b]/13 px-2.5 py-1 text-xs text-[#d7fffd]">{qty(item.line_count)} sor • {qty(item.total_qty)} db</span></td>
                  <td className="px-4 py-3 text-white/65">{item.actor || "-"}</td>
                  <td className="max-w-[240px] px-4 py-3"><p className="truncate text-white/58" title={item.note || item.subtitle || ""}>{item.note || item.subtitle || "-"}</p></td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1.5"><button type="button" className={btnSoft} onClick={() => void openDetail(item)}><PackageCheck size={14} /> Részletek</button><button type="button" className={iconBtn} onClick={() => void printItem(item)} title="PDF / nyomtatás"><Printer size={15} /></button><button type="button" className={iconBtn} onClick={() => void csvItem(item)} title="CSV"><FileSpreadsheet size={15} /></button></div></td>
                </tr>;
              })}
              {!items.length && !loading ? <tr><td colSpan={7} className="px-4 py-14 text-center text-white/45">Nincs találat a megadott szűrésre.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-3 lg:hidden">
          {items.map((item) => {
            const badge = documentBadge(item);
            const BadgeIcon = badge.icon;
            return <article key={item.id} className="rounded-2xl border border-white/12 bg-white/[0.05] p-3">
              <div className="flex items-start justify-between gap-3"><div><p className="text-base text-white">{item.document_number}</p><p className="mt-1 text-xs text-white/48">{dateTime(item.created_at)}</p></div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${badge.cls}`}><BadgeIcon size={11} /> {badge.label}</span></div>
              <div className="mt-3 grid gap-2 text-xs"><div className="rounded-xl bg-[#354153] px-3 py-2"><span className="text-white/42">Forrás</span><p className="mt-0.5 text-white/78">{item.from_location_summary || "Conform tabelului"}</p></div><div className="rounded-xl bg-[#354153] px-3 py-2"><span className="text-white/42">Cél</span><p className="mt-0.5 text-white/78">{item.to_location_summary || "Conform tabelului"}</p></div></div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3"><span className="text-xs text-[#d7fffd]">{qty(item.line_count)} sor • {qty(item.total_qty)} db</span><div className="flex gap-1.5"><button type="button" className={btnSoft} onClick={() => void openDetail(item)}>Részletek</button><button type="button" className={iconBtn} onClick={() => void printItem(item)}><Printer size={15} /></button><button type="button" className={iconBtn} onClick={() => void csvItem(item)}><Download size={15} /></button></div></div>
            </article>;
          })}
          {!items.length && !loading ? <div className="rounded-2xl border border-white/12 bg-white/[0.05] p-8 text-center text-sm text-white/45">Nincs találat.</div> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 bg-[#303a4c] px-4 py-3">
          <span className="text-xs text-white/45">Oldal {pageNo} / {pages}</span>
          <div className="flex items-center gap-2"><button type="button" className={btnSoft} disabled={pageNo <= 1 || loading} onClick={() => setPageNo((current) => Math.max(1, current - 1))}><ChevronLeft size={15} /> Előző</button><span className="rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/72">{pageNo} / {pages}</span><button type="button" className={btnSoft} disabled={pageNo >= pages || loading} onClick={() => setPageNo((current) => Math.min(pages, current + 1))}>Következő <ChevronRight size={15} /></button></div>
        </div>
      </section>
    </div>

    {detailLoading ? <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 backdrop-blur-sm"><div className="rounded-2xl border border-white/18 bg-[#303a4c] px-5 py-4 text-sm text-white shadow-2xl"><RefreshCw size={16} className="mr-2 inline animate-spin" /> Bizonylat betöltése...</div></div> : null}

    {detail ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setDetail(null); }}>
      <div className="flex max-h-[95vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#263246] via-[#334154] to-[#2a8d8b]/55 px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-3"><span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#7bd7d4]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><FileText size={21} /></span><div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">Proces-verbal részletei</p><h2 className="mt-0.5 truncate text-[22px]">{detail.document.document_number}</h2><p className="mt-1 truncate text-xs text-white/58">{detail.document.subtitle || "Transfer intern de stoc"}</p></div></div>
          <div className="flex flex-wrap gap-2"><button type="button" className={primaryBtn} onClick={() => printDetail(detail)}><Printer size={15} /> PDF / nyomtatás</button><button type="button" className={btnSoft} onClick={() => downloadDetailCsv(detail)}><FileSpreadsheet size={15} /> CSV</button><button type="button" className={btn} onClick={() => setDetail(null)}><X size={15} /> Bezárás</button></div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3.5">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Bizonylatszám</p><p className="mt-1 text-sm">{detail.document.document_number}</p></div>
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Kibocsátva</p><p className="mt-1 text-sm">{dateTime(detail.document.created_at)}</p></div>
            <div className="rounded-2xl border border-[#7bd7d4]/22 bg-[#2a8d8b]/12 px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-[#cffffd]/55">Sor / darab</p><p className="mt-1 text-sm text-[#d7fffd]">{detail.lines.length} sor • {qty(detail.document.total_qty)} db</p></div>
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Rögzítette</p><p className="mt-1 truncate text-sm">{detail.document.actor || "-"}</p></div>
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Forrás</p><p className="mt-1 truncate text-sm">{detail.document.from_location_summary || "Conform tabelului"}</p></div>
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-white/42">Célhely</p><p className="mt-1 truncate text-sm">{detail.document.to_location_summary || "Conform tabelului"}</p></div>
          </div>
          {detail.document.note ? <div className="mt-3 rounded-2xl border border-white/12 bg-white/[0.05] px-3 py-2.5 text-sm text-white/70"><span className="text-white/42">Megjegyzés: </span>{detail.document.note}</div> : null}
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/12 bg-[#404a5b]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5"><div className="flex items-center gap-2 text-sm"><PackageCheck size={16} /> Átadott termékek</div><span className="rounded-full border border-[#7bd7d4]/25 bg-[#2a8d8b]/13 px-2 py-0.5 text-[10px] text-[#d7fffd]">{detail.lines.length} sor</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-xs"><thead className="bg-[#303a4c] text-[9px] uppercase tracking-[0.08em] text-white/48"><tr><th className="px-2 py-2">#</th><th className="px-2 py-2">Kép</th><th className="px-2 py-2">Termék</th><th className="px-2 py-2">Márka / kategória</th><th className="px-2 py-2">Azonosítók</th><th className="px-2 py-2">Variáns</th><th className="px-2 py-2">Forrás</th><th className="px-2 py-2">Cél</th><th className="px-2 py-2 text-right">Db</th><th className="px-2 py-2">Készletváltozás</th></tr></thead><tbody>
              {detail.lines.map((line, index) => <tr key={line.id || `${line.line_no}-${index}`} className="border-t border-white/[0.08] align-middle hover:bg-white/[0.035]"><td className="px-2 py-2 text-white/42">{index + 1}</td><td className="px-2 py-2">{line.image_url ? <img src={line.image_url} alt="" className="h-11 w-11 rounded-lg border border-white/12 bg-white object-contain p-0.5" loading="lazy" /> : <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] text-white/28">-</span>}</td><td className="px-2 py-2"><p className="max-w-[240px] truncate text-white">{line.product_title || "Névtelen termék"}</p></td><td className="px-2 py-2"><p className="max-w-[180px] truncate">{line.brand_name || "-"}</p><p className="mt-0.5 max-w-[180px] truncate text-[10px] text-white/40">{line.category_name || "-"}</p></td><td className="px-2 py-2"><p className="max-w-[150px] truncate font-mono text-[11px] text-[#cffffd]/75">{line.product_code || "-"}</p><p className="mt-0.5 max-w-[150px] truncate font-mono text-[10px] text-white/42">{line.barcode || "-"}</p></td><td className="px-2 py-2">{[line.color_name, line.size].filter(Boolean).join(" • ") || "-"}</td><td className="px-2 py-2">{line.from_location_name || "-"}</td><td className="px-2 py-2">{line.to_location_name || "-"}</td><td className="px-2 py-2 text-right text-sm text-[#d7fffd]">{qty(line.qty)}</td><td className="px-2 py-2 text-[10px] text-white/52"><span>{qty(line.source_before)} → {qty(line.source_after)}</span><br /><span>{qty(line.target_before)} → {qty(line.target_after)}</span></td></tr>)}
            </tbody></table></div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/12 bg-[#303a4c] px-4 py-3 text-[11px] text-white/42"><span>ESC: bezárás • a PDF román nyelvű hivatalos átadás-átvételi formátum</span><button type="button" className={btnSoft} onClick={() => setDetail(null)}><X size={14} /> Bezárás</button></div>
      </div>
    </div> : null}

    {settingsOpen && settingsDraft ? <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) setSettingsOpen(false); }}>
      <div className="w-full max-w-3xl overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/12 bg-gradient-to-r from-[#263246] via-[#334154] to-[#2a8d8b]/55 px-4 py-3.5"><div className="flex items-start gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#7bd7d4]/35 bg-[#2a8d8b]/24 text-[#d7fffd]"><Settings size={19} /></span><div><p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">Admin settings</p><h2 className="mt-0.5 text-xl">Proces-verbal számozás</h2><p className="mt-1 text-xs text-white/55">A következő hivatalos átadás sorszámának és fejlécének beállítása.</p></div></div><button type="button" className={iconBtn} onClick={() => setSettingsOpen(false)}><X size={16} /></button></div>
        <div className="space-y-4 p-4">
          <div className="rounded-2xl border border-[#7bd7d4]/26 bg-[#174c55]/62 p-4"><p className="text-[10px] uppercase tracking-[0.13em] text-[#cffffd]/60">Következő bizonylatszám</p><p className="mt-1 text-[30px] leading-none text-white">{settingsDraft.previewNumber}</p><p className="mt-2 text-xs text-cyan-50/65">A sorszám kiosztása tranzakcióban történik, ezért két párhuzamos átadás sem kaphat azonos számot.</p></div>
          <div className="grid gap-3 sm:grid-cols-3"><label className={label}>Sorozat<input className={input} value={settingsDraft.series} onChange={(event) => setSettingsDraft((current) => current ? { ...current, series: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20), previewNumber: current.includeYear ? `${event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") || "PV"}/${current.sequenceYear}/${String(current.nextNumber).padStart(current.digits, "0")}` : `${event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") || "PV"}/${String(current.nextNumber).padStart(current.digits, "0")}` } : current)} /></label><label className={label}>Következő sorszám<input className={input} type="number" min={1} value={settingsDraft.nextNumber} onChange={(event) => setSettingsDraft((current) => current ? { ...current, nextNumber: Math.max(1, Number(event.target.value || 1)), previewNumber: current.includeYear ? `${current.series}/${current.sequenceYear}/${String(Math.max(1, Number(event.target.value || 1))).padStart(current.digits, "0")}` : `${current.series}/${String(Math.max(1, Number(event.target.value || 1))).padStart(current.digits, "0")}` } : current)} /></label><label className={label}>Számjegyek<input className={input} type="number" min={3} max={10} value={settingsDraft.digits} onChange={(event) => setSettingsDraft((current) => current ? { ...current, digits: Math.min(10, Math.max(3, Number(event.target.value || 6))), previewNumber: current.includeYear ? `${current.series}/${current.sequenceYear}/${String(current.nextNumber).padStart(Math.min(10, Math.max(3, Number(event.target.value || 6))), "0")}` : `${current.series}/${String(current.nextNumber).padStart(Math.min(10, Math.max(3, Number(event.target.value || 6))), "0")}` } : current)} /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.05] px-3 py-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#2a8d8b]" checked={settingsDraft.includeYear} onChange={(event) => setSettingsDraft((current) => current ? { ...current, includeYear: event.target.checked, previewNumber: event.target.checked ? `${current.series}/${current.sequenceYear}/${String(current.nextNumber).padStart(current.digits, "0")}` : `${current.series}/${String(current.nextNumber).padStart(current.digits, "0")}` } : current)} /><span><span className="block text-white">Év szerepeljen a számban</span><span className="mt-0.5 block text-xs text-white/42">Példa: PV/2026/000001</span></span></label><label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.05] px-3 py-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#2a8d8b]" checked={settingsDraft.yearlyReset} onChange={(event) => setSettingsDraft((current) => current ? { ...current, yearlyReset: event.target.checked } : current)} /><span><span className="block text-white">Évente induljon újra</span><span className="mt-0.5 block text-xs text-white/42">Új évben a számozás ismét 1-ről indul.</span></span></label></div>
          <div className="grid gap-3"><label className={label}>Dokumentum címe<input className={input} value={settingsDraft.documentTitle} onChange={(event) => setSettingsDraft((current) => current ? { ...current, documentTitle: event.target.value } : current)} /></label><label className={label}>Alcím / művelet megnevezése<input className={input} value={settingsDraft.documentSubtitle} onChange={(event) => setSettingsDraft((current) => current ? { ...current, documentSubtitle: event.target.value } : current)} /></label></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/12 bg-[#303a4c] px-4 py-3"><button type="button" className={btnSoft} onClick={() => setSettingsOpen(false)}>Mégse</button><button type="button" className={primaryBtn} onClick={() => void saveSettings()} disabled={settingsSaving}><CheckCircle2 size={15} /> {settingsSaving ? "Mentés..." : "Beállítások mentése"}</button></div>
      </div>
    </div> : null}
  </div>;
}
