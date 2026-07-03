import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  Edit3,
  FileSpreadsheet,
  FileText,
  Download,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UploadCloud,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  AifCurrency,
  AifReceptionSummary,
  AifReceptionDetail,
  AifImportBatchSummary,
  AifLocation,
  AifLocationType,
  AifParsedRow,
  AifSupplier,
  AifBrandColorCode,
  AifColorType,
  apiAifCommitImportBatch,
  apiAifCreateCurrency,
  apiAifCreateFullImportBatch,
  apiAifCreateLocation,
  apiAifCreateLocationType,
  apiAifDeleteCurrency,
  apiAifDeleteLocation,
  apiAifDeleteLocationType,
  apiAifListCurrencies,
  apiAifListReceptions,
  apiAifGetReception,
  apiAifListLocationTypes,
  apiAifUpdateLocation,
  apiAifUpdateLocationType,
  apiAifListImportBatches,
  apiAifMeta,
  apiAifUpdateCurrency,
} from "../lib/aif/api";
import {
  AIF_COLUMN_FIELD_OPTIONS,
  AifColumnField,
  AifWorkbookAnalysis,
  aifRowErrors,
  applyAifColumnMapping,
  readAifWorkbookWithAnalysis,
} from "../lib/aif/xls";

type Props = { onLogout?: () => void };

type LocationType = string;
type EditableImportField =
  | "supplierProductCode"
  | "titleRo"
  | "brandCode"
  | "categoryCode"
  | "gender"
  | "colorName"
  | "colorCode"
  | "size"
  | "qty"
  | "buyPrice";

type AifBrandOption = { id: string; code?: string; name?: string; is_active?: boolean };
type AifCategoryOption = { id: string; code?: string; name_ro?: string; name_hu?: string | null; name?: string; aliases?: string[] | null; sort_order?: number | string | null; is_active?: boolean };
type AifGenderOption = { code: string; name: string; aliases?: string[] | null; sort_order?: number | string | null; is_active?: boolean };
type AifSupplierBrandLink = { id: string; supplier_id: string; brand_id: string; supplier_name?: string; brand_name?: string; is_preferred?: boolean; is_active?: boolean };

const page = "min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-5 sm:py-6";
const wrap = "mx-auto max-w-7xl space-y-4";
const topCard = "rounded-2xl border border-white/24 bg-[#465164] px-4 py-3 shadow-lg shadow-slate-950/10";
const card = "rounded-2xl border border-white/18 bg-[#4d5869] p-3 shadow-lg shadow-slate-950/15 sm:p-4 font-normal";
const sectionHeader = "flex w-full items-center justify-between gap-3 rounded-xl border border-white/22 border-l-4 border-l-emerald-300 bg-[#303b4e] px-3 py-2.5 text-left shadow-sm shadow-slate-950/20 font-normal";
const label = "grid gap-1.5 text-xs uppercase tracking-[0.05em] text-white/86 font-normal";
const input = "h-9 rounded-lg border border-white/24 bg-[#303b4e] px-3 text-sm text-white caret-white outline-none transition placeholder:text-white/50 selection:bg-emerald-300/35 focus:border-emerald-200/80 focus:ring-1 focus:ring-emerald-200/30 [color-scheme:dark] font-normal";
const selectInput = `${input} aif-native-select [color-scheme:dark]`;
const optionStyle = { backgroundColor: "#303b4e", color: "#ffffff" };
const mutedOptionStyle = { backgroundColor: "#303b4e", color: "#a9b3c7" };
const btnBase = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs text-white transition disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = `${btnBase} border-[#67d4d1]/45 bg-[#208d8b] shadow-sm shadow-[#208d8b]/20 hover:bg-[#249b99] active:bg-[#1a7270]`;
const compactPrimaryBtn = "inline-flex h-7 items-center justify-center gap-1 rounded-md border border-[#67d4d1]/45 bg-[#208d8b] px-2 text-[11px] text-white shadow-sm shadow-[#208d8b]/20 transition hover:bg-[#249b99] active:bg-[#1a7270] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const neutralBtn = `${btnBase} border-white/24 bg-[#354153] hover:bg-[#3e4d63]`;
const tinyBtn = "inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/20 bg-[#354153] px-2 text-[11px] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const dangerBtn = `${btnBase} border-red-300/24 bg-[#c90d22] hover:bg-[#a90c1d]`;
const fileBtn = `${btnBase} border-red-300/24 bg-[#c90d22] hover:bg-[#a90c1d] h-9 px-3`;
const statCard = "rounded-xl border border-white/12 bg-[#354153] px-3 py-2.5";
const compactFieldLabel = "text-[9px] uppercase tracking-[0.05em] text-white/45";
const compactInput = "h-7 rounded-md border border-white/18 bg-[#303b4e] px-2 text-[11px] text-white outline-none placeholder:text-white/38 focus:border-emerald-200/65 focus:ring-1 focus:ring-emerald-200/20 font-normal";
const compactSelect = `${compactInput} aif-native-select pr-6`;
const modalBackdrop = "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/74 px-4 py-6 backdrop-blur-sm";
const modalCard = "w-full max-w-2xl rounded-2xl border border-white/22 bg-[#4b5566] p-4 text-white shadow-2xl";

function goHome() {
  window.location.hash = "#allin";
}

function cell(v: unknown) {
  const s = String(v ?? "").trim();
  return s || "-";
}

function valueString(v: unknown) {
  return String(v ?? "");
}

function toNumber(v: unknown) {
  if (v === null || v === undefined || String(v).trim() === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(v?: string | null) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function receptionStatusLabel(value?: string | null) {
  const v = String(value || "").toLowerCase();
  if (v === "committed") return "Készletre vett";
  if (v === "parsed") return "Ellenőrizve";
  if (v === "needs_review") return "Ellenőrzendő";
  if (v === "draft") return "Folyamatban";
  if (v === "cancelled") return "Törölt";
  return value || "-";
}

function moneyText(value: number, currency = "") {
  const n = Number.isFinite(value) ? value : 0;
  return `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}

function pdfEscape(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fileSafe(v: unknown) {
  return String(v ?? "receptie")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "receptie";
}

function pdfNumber(v: unknown, digits = 2) {
  const x = toNumber(v);
  return x.toLocaleString("ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pdfDate(v?: string | null) {
  const s = dateOnly(v);
  return s || "-";
}

function normPdfKey(v: unknown) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function rowCheckSku(row: any) {
  const normalized = row?.normalized || {};
  return cell(row?.supplier_product_code || normalized.supplierProductCode || normalized.modelCode || row?.supplier_variant_code || normalized.supplierVariantCode);
}

function buildReceptionVerificationHtml(detail: AifReceptionDetail, categories: AifCategoryOption[] = [], genderTypes: AifGenderOption[] = []) {
  const item: any = detail.item || {};
  const rows = (detail.rows || []).filter((row: any) => row.status !== "ignored");
  const title = `Fisa verificare marfa ${item.invoice_number || item.id || ""}`;
  const today = new Date().toLocaleDateString("ro-RO");
  const lines = rows.map((row: any, index: number) => {
    const normalized = row.normalized || {};
    const rawCategory = normalized.categoryName || normalized.categoryCode;
    const rawGender = normalized.gender;
    const qty = toNumber(row.qty ?? normalized.qty);
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td>${pdfEscape(rowCheckSku(row))}</td>
        <td>${pdfEscape(cell(normalized.titleRo || normalized.productName || row.supplier_product_code))}</td>
        <td>${pdfEscape(cell(normalized.brandName || normalized.brandCode))}</td>
        <td>${pdfEscape(categoryDisplay(rawCategory, categories))}</td>
        <td>${pdfEscape(genderLabel(rawGender, genderTypes))}</td>
        <td>${pdfEscape(cell(normalized.colorName))}</td>
        <td>${pdfEscape(cell(row.supplier_color_code || normalized.colorCode))}</td>
        <td>${pdfEscape(cell(row.supplier_size || normalized.size))}</td>
        <td class="num">${pdfNumber(qty, 0)}</td>
        <td class="write"></td>
        <td class="check"></td>
        <td class="write"></td>
        <td class="write wide"></td>
      </tr>`;
  }).join("");
  const totalQty = rows.reduce((sum: number, row: any) => sum + toNumber(row.qty ?? row.normalized?.qty), 0);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${pdfEscape(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 9px; }
    .doc { width: 100%; }
    .header { display: grid; grid-template-columns: 1.15fr 1fr; gap: 14px; border-bottom: 2px solid #111827; padding-bottom: 7px; margin-bottom: 8px; }
    .company { font-size: 9px; line-height: 1.42; }
    .company-name { font-size: 14px; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 2px; }
    .title { text-align: right; }
    .title h1 { margin: 0 0 5px; font-size: 20px; letter-spacing: .05em; text-transform: uppercase; }
    .title .sub { font-size: 10px; border: 1px solid #111827; display: inline-block; padding: 3px 8px; margin-top: 3px; }
    .meta { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; margin-bottom: 8px; }
    .box { border: 1px solid #9ca3af; border-radius: 4px; padding: 4px 5px; min-height: 30px; }
    .box .label { color: #6b7280; text-transform: uppercase; font-size: 7px; letter-spacing: .05em; margin-bottom: 2px; }
    .box .value { font-size: 9px; }
    .note { border: 1px solid #f59e0b; background: #fffbeb; padding: 5px 7px; margin: 7px 0 8px; line-height: 1.35; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th { background: #111827; color: #fff; font-weight: 400; text-transform: uppercase; font-size: 7px; letter-spacing: .02em; padding: 4px 3px; border: 1px solid #111827; }
    td { padding: 3px; border: 1px solid #d1d5db; vertical-align: top; font-size: 8px; line-height: 1.18; overflow-wrap: anywhere; min-height: 18px; }
    tbody tr:nth-child(even) td { background: #f9fafb; }
    .num { text-align: right; white-space: nowrap; }
    .write { min-height: 20px; background: #fff; }
    .wide { min-width: 56px; }
    .check::before { content: ''; display: block; width: 12px; height: 12px; border: 1.5px solid #111827; margin: 0 auto; }
    .totals td { border-top: 2px solid #111827; background: #f3f4f6; font-size: 9px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 16px; font-size: 9px; }
    .sig { padding-top: 20px; border-top: 1px solid #111827; }
    .footer { margin-top: 8px; color: #6b7280; font-size: 7px; display: flex; justify-content: space-between; }
    .screen-actions { margin: 0 0 8px; display: flex; gap: 8px; }
    .screen-actions button { border: 1px solid #111827; background: #111827; color: #fff; border-radius: 6px; padding: 7px 10px; cursor: pointer; }
    @media print { .screen-actions { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="screen-actions">
    <button onclick="window.print()">Tiparire / Salvare PDF</button>
    <button onclick="window.close()">Inchide</button>
  </div>
  <div class="doc">
    <div class="header">
      <div class="company">
        <div class="company-name">SC TITAN EURO-COM SRL</div>
        <div>Cod Fiscal: RO17495362</div>
        <div>Nr. Reg. Com.: J19/420/2005</div>
        <div>Miercurea Ciuc, Jud. Harghita, Str. Mihail Sadoveanu 33/c/17</div>
      </div>
      <div class="title">
        <h1>Fisa verificare marfa</h1>
        <div>Data: ${pdfEscape(pdfDate(item.reception_date) || today)}</div>
        <div class="sub">Document fara preturi</div>
      </div>
    </div>
    <div class="meta">
      <div class="box"><div class="label">Furnizor</div><div class="value">${pdfEscape(item.supplier_name || "-")}</div></div>
      <div class="box"><div class="label">Factura</div><div class="value">${pdfEscape(item.invoice_number || "-")}</div></div>
      <div class="box"><div class="label">Data factura</div><div class="value">${pdfEscape(pdfDate(item.invoice_date))}</div></div>
      <div class="box"><div class="label">Gestiune</div><div class="value">${pdfEscape(item.location_name || "-")}</div></div>
      <div class="box"><div class="label">Total factura</div><div class="value">${pdfNumber(totalQty, 0)} buc.</div></div>
    </div>
    <div class="note">Lista pentru verificarea fizica a marfii primite. Nu contine preturi. Completeaza cantitatea receptionata, bifeaza OK sau noteaza problema si observatiile.</div>
    <table>
      <colgroup>
        <col style="width: 3%" />
        <col style="width: 8%" />
        <col style="width: 19%" />
        <col style="width: 9%" />
        <col style="width: 9%" />
        <col style="width: 7%" />
        <col style="width: 8%" />
        <col style="width: 7%" />
        <col style="width: 6%" />
        <col style="width: 6%" />
        <col style="width: 7%" />
        <col style="width: 4%" />
        <col style="width: 8%" />
        <col style="width: 9%" />
      </colgroup>
      <thead>
        <tr>
          <th>Nr.</th>
          <th>Cod produs</th>
          <th>Denumire produs</th>
          <th>Brand</th>
          <th>Categorie</th>
          <th>Gen</th>
          <th>Culoare</th>
          <th>Cod culoare</th>
          <th>Marime</th>
          <th>Cant. factura</th>
          <th>Cant. receptionata</th>
          <th>OK</th>
          <th>Lipsa / problema</th>
          <th>Observatii</th>
        </tr>
      </thead>
      <tbody>
        ${lines || `<tr><td colspan="14" style="text-align:center;padding:18px;">Nu exista linii de verificat.</td></tr>`}
      </tbody>
      <tfoot>
        <tr class="totals"><td colspan="9">TOTAL</td><td class="num">${pdfNumber(totalQty, 0)}</td><td colspan="4"></td></tr>
      </tfoot>
    </table>
    <div class="signatures">
      <div class="sig">Verificat de</div>
      <div class="sig">Semnatura</div>
      <div class="sig">Data</div>
    </div>
    <div class="footer">
      <span>SC TITAN EURO-COM SRL - fisa verificare marfa</span>
      <span>Generat: ${pdfEscape(today)}</span>
    </div>
  </div>
</body>
</html>`;
}

function openReceptionVerificationPdf(detail: AifReceptionDetail, categories: AifCategoryOption[] = [], genderTypes: AifGenderOption[] = []) {
  const fileName = `verificare_marfa_${fileSafe((detail.item as any)?.invoice_number || (detail.item as any)?.id)}.pdf`;
  const html = buildReceptionVerificationHtml(detail, categories, genderTypes).replace(
    "</head>",
    `<script>
      document.title=${JSON.stringify(fileName)};
      window.addEventListener('load', function () {
        setTimeout(function () {
          try { window.focus(); window.print(); } catch (e) {}
        }, 450);
      });
    </script></head>`
  );
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "width=1200,height=850,scrollbars=yes,resizable=yes");
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error("Browserul a blocat fereastra PDF. Permite ferestre pop-up pentru aceasta pagina.");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function confidenceText(value: number) {
  if (value >= 85) return "Magas";
  if (value >= 60) return "Közepes";
  if (value > 0) return "Alacsony";
  return "Nincs";
}

function confidenceClass(value: number) {
  if (value >= 85) return "text-emerald-100";
  if (value >= 60) return "text-amber-100";
  if (value > 0) return "text-red-100";
  return "text-white/55";
}

function locationTypeLabel(v: string) {
  const map: Record<string, string> = {
    warehouse: "Raktár",
    shop: "Üzlet / helyszín",
    online: "Online",
    reserved: "Foglalás",
    other: "Egyéb",
  };
  return map[v] || "Egyéb";
}

function categoryLabel(c: AifCategoryOption) {
  return c.name_hu || c.name_ro || c.name || c.code || "-";
}

function categoryAliasValues(c: AifCategoryOption) {
  return [c.code, c.id, c.name_ro, c.name_hu, c.name, ...(Array.isArray(c.aliases) ? c.aliases : [])]
    .filter(Boolean)
    .map((x) => String(x));
}

function normMatchKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const sourceCategoryAliases: Record<string, string[]> = {
  apparel: ["imbracaminte", "îmbrăcăminte", "haine", "ruha", "clothing", "apparel"],
  tricou: ["tricou", "tricouri", "trikó", "póló", "polo", "t shirt", "t-shirt", "tee", "training tee"],
  tricouri: ["tricou", "tricouri", "trikó", "póló", "polo", "t shirt", "t-shirt", "tee"],
  pantaloni: ["pantaloni", "nadrag", "nadrág", "pants", "trousers"],
  shorts: ["shorts", "pantaloni scurti", "pantaloni scurți", "rövidnadrág", "rovidnadrag"],
  hanorac: ["hanorac", "hoodie", "pulover", "sweatshirt", "kapucnis", "pulóver", "puloverek"],
  jacheta: ["jacheta", "jachetă", "geaca", "geacă", "jacket", "kabát", "dzseki"],
  vesta: ["vesta", "vestă", "vest", "melleny", "mellény"],
  incaltaminte: ["incaltaminte", "încălțăminte", "pantofi", "adidasi", "adidași", "shoes", "sneakers", "cipő", "cipo"],
  rochie: ["rochie", "rochii", "dress", "ruha"],
  fusta: ["fusta", "fustă", "fuste", "skirt", "szoknya"],
  geanta: ["geanta", "geantă", "genti", "genți", "bag", "táska", "taska"],
  curea: ["curea", "belt", "öv", "ov"],
  sosete: ["sosete", "șosete", "socks", "zokni"],
};

function categorySearchKeys(value: unknown) {
  const raw = normMatchKey(value);
  if (!raw) return [];
  const direct = sourceCategoryAliases[raw] || [];
  const byToken = raw.split(" ").flatMap((token) => sourceCategoryAliases[token] || []);
  return Array.from(new Set([raw, ...direct, ...byToken].map(normMatchKey).filter(Boolean)));
}

function categoryMatches(c: AifCategoryOption, value: unknown) {
  const sourceKeys = categorySearchKeys(value);
  if (!sourceKeys.length) return false;
  const optionKeys = categoryAliasValues(c).map(normMatchKey).filter(Boolean);
  return sourceKeys.some((sourceKey) =>
    optionKeys.some((optionKey) =>
      optionKey === sourceKey ||
      (sourceKey.length >= 4 && optionKey.length >= 4 && (optionKey.startsWith(sourceKey) || sourceKey.startsWith(optionKey)))
    )
  );
}

function rawValueByHeader(row: any, headers: string[]) {
  const raw = row?.raw;
  if (!raw || typeof raw !== "object") return "";
  const wanted = headers.map(normMatchKey);
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = normMatchKey(key);
    if (wanted.includes(normalizedKey)) return value;
  }
  return "";
}

function categoryCandidatesForRow(row: any) {
  const normalized = row?.normalized || row || {};
  return [
    rawValueByHeader(row, ["SUBCATEGORIE", "SUB CATEGORY", "SUBCATEGORY", "ALKATEGORIA", "ALKATEGÓRIA", "ALCATEGORIE", "PRODUCT TYPE"]),
    (normalized as any).subCategoryCode,
    (normalized as any).subcategoryCode,
    (normalized as any).subCategoryName,
    (normalized as any).subcategoryName,
    (normalized as any).productType,
    (normalized as any).type,
    (normalized as any).categoryCode,
    (normalized as any).categoryName,
    rawValueByHeader(row, ["CATEGORIE", "CATEGORY"]),
  ].filter((x) => String(x ?? "").trim());
}

function findCategoryForRow(row: any, categories: AifCategoryOption[]) {
  const candidates = categoryCandidatesForRow(row);
  for (const candidate of candidates) {
    const found = categories.find((c) => categoryMatches(c, candidate));
    if (found) return found;
  }
  return null;
}

function categoryDisplay(value: unknown, categories: AifCategoryOption[]) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const found = categories.find((c) => categoryMatches(c, raw));
  return found ? categoryLabel(found) : raw;
}

function genderAliasValues(g: AifGenderOption) {
  return [g.code, g.name, ...(Array.isArray(g.aliases) ? g.aliases : [])]
    .filter(Boolean)
    .map((x) => String(x).trim().toLowerCase());
}

function genderLabel(code: unknown, items: AifGenderOption[]) {
  const key = String(code ?? "").trim().toLowerCase();
  return items.find((g) => genderAliasValues(g).some((x) => x === key))?.name || String(code || "-");
}

function rowStatusText(value?: string | null) {
  const v = String(value || "").toLowerCase();
  if (v === "committed") return "Készleten";
  if (v === "parsed") return "Feldolgozható";
  if (v === "error") return "Javítandó";
  if (v === "ignored") return "Kihagyva";
  if (v === "draft") return "Vázlat";
  return value || "-";
}

function normValue(row: any, key: string, fallback?: unknown) {
  return cell((row?.normalized || {})[key] ?? fallback);
}

function SectionTitle(props: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className={sectionHeader}>
      <div className="flex items-center gap-2 text-sm uppercase tracking-[0.11em] text-white/94">
        {props.icon}
        <span>{props.title}</span>
      </div>
      {props.right}
    </div>
  );
}


function rowKey(row: AifParsedRow, index: number) {
  return `${row.rowNo || index + 1}-${index}`;
}

function splitCodProdus(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { fullCode: "", modelCode: "", colorCode: "" };
  const match = raw.match(/^(.+)-([A-Za-z0-9]{1,16})$/);
  if (!match) return { fullCode: raw, modelCode: raw, colorCode: "" };
  return { fullCode: raw, modelCode: match[1].trim(), colorCode: match[2].trim() };
}

function sameLoose(a: unknown, b: unknown) {
  return normMatchKey(a) === normMatchKey(b);
}

function colorCodeKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export default function AllInIncoming(_props: Props) {
  const [suppliers, setSuppliers] = useState<AifSupplier[]>([]);
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [locationTypes, setLocationTypes] = useState<AifLocationType[]>([]);
  const [currencies, setCurrencies] = useState<AifCurrency[]>([]);
  const [brands, setBrands] = useState<AifBrandOption[]>([]);
  const [categories, setCategories] = useState<AifCategoryOption[]>([]);
  const [genderTypes, setGenderTypes] = useState<AifGenderOption[]>([]);
  const [supplierBrands, setSupplierBrands] = useState<AifSupplierBrandLink[]>([]);
  const [brandColorCodes, setBrandColorCodes] = useState<AifBrandColorCode[]>([]);
  const [colorTypes, setColorTypes] = useState<AifColorType[]>([]);
  const [defaultBrandCode, setDefaultBrandCode] = useState("");
  const [defaultCategoryCode, setDefaultCategoryCode] = useState("");
  const [defaultGender, setDefaultGender] = useState("");
  const [receptions, setReceptions] = useState<AifReceptionSummary[]>([]);
  const [selectedReceptionId, setSelectedReceptionId] = useState("");
  const [receptionPickerId, setReceptionPickerId] = useState("");
  const [loadedReception, setLoadedReception] = useState<AifReceptionDetail | null>(null);
  const [receptionListOpen, setReceptionListOpen] = useState(false);
  const [batches, setBatches] = useState<AifImportBatchSummary[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [receptionOpen, setReceptionOpen] = useState(true);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [receptionDate, setReceptionDate] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [exchangeRateToRon, setExchangeRateToRon] = useState("");
  const [tvaMode, setTvaMode] = useState<"" | "without_tva" | "with_tva" | "no_tva">("");
  const [tvaRate, setTvaRate] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [invoiceGross, setInvoiceGross] = useState("");
  const [newCurrencyCode, setNewCurrencyCode] = useState("");
  const [newCurrencyName, setNewCurrencyName] = useState("");
  const [newCurrencySymbol, setNewCurrencySymbol] = useState("");
  const [editingCurrencyCode, setEditingCurrencyCode] = useState("");
  const [editCurrencyName, setEditCurrencyName] = useState("");
  const [editCurrencySymbol, setEditCurrencySymbol] = useState("");
  const [deleteCurrencyTarget, setDeleteCurrencyTarget] = useState<AifCurrency | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<AifParsedRow[]>([]);
  const [workbench, setWorkbench] = useState<AifWorkbookAnalysis | null>(null);
  const [workbenchOpen, setWorkbenchOpen] = useState(true);
  const [previewLimit, setPreviewLimit] = useState(25);
  const [approvedRows, setApprovedRows] = useState<Record<string, boolean>>({});
  const [manualProductCode, setManualProductCode] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualBrandCode, setManualBrandCode] = useState("");
  const [manualCategoryCode, setManualCategoryCode] = useState("");
  const [manualGender, setManualGender] = useState("");
  const [manualColorName, setManualColorName] = useState("");
  const [manualColorCode, setManualColorCode] = useState("");
  const [manualSize, setManualSize] = useState("");
  const [manualQty, setManualQty] = useState("");
  const [manualBuyPrice, setManualBuyPrice] = useState("");
  const [manualRowsOpen, setManualRowsOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationType, setNewLocationType] = useState<LocationType>("warehouse");
  const [newLocationTypeName, setNewLocationTypeName] = useState("");
  const [editingLocationTypeId, setEditingLocationTypeId] = useState("");
  const [editLocationTypeName, setEditLocationTypeName] = useState("");
  const [deleteLocationTypeTarget, setDeleteLocationTypeTarget] = useState<AifLocationType | null>(null);
  const [editingLocationId, setEditingLocationId] = useState("");
  const [editLocationName, setEditLocationName] = useState("");
  const [editLocationType, setEditLocationType] = useState<LocationType>("warehouse");
  const [deleteLocationTarget, setDeleteLocationTarget] = useState<AifLocation | null>(null);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) || null,
    [suppliers, supplierId]
  );

  const activeBrands = useMemo(() => brands.filter((b) => b.is_active !== false), [brands]);
  const activeCategories = useMemo(
    () => categories
      .filter((c) => c.is_active !== false)
      .slice()
      .sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "hu", { sensitivity: "base" })),
    [categories]
  );
  const activeGenderTypes = useMemo(() => genderTypes.filter((g) => g.is_active !== false), [genderTypes]);
  const brandOptionsForSupplier = useMemo(() => {
    if (!supplierId) return activeBrands;
    const linkedBrandIds = new Set(
      supplierBrands
        .filter((link) => link.is_active !== false && String(link.supplier_id) === String(supplierId))
        .map((link) => String(link.brand_id))
    );
    if (!linkedBrandIds.size) return activeBrands;
    return activeBrands.filter((brand) => linkedBrandIds.has(String(brand.id)));
  }, [activeBrands, supplierBrands, supplierId]);

  const selectedReceptionSummary = useMemo(
    () => receptions.find((r) => String(r.id) === String(selectedReceptionId)) || loadedReception?.item || null,
    [receptions, selectedReceptionId, loadedReception]
  );

  const loadedReceptionRows = useMemo(() => loadedReception?.rows || [], [loadedReception]);
  const loadedReceptionRowTotals = useMemo(() => {
    return loadedReceptionRows.reduce(
      (acc: { total: number; committed: number; remaining: number; qty: number; value: number }, row: any) => {
        acc.total += 1;
        if (row.status === "committed") acc.committed += 1;
        else if (row.status !== "ignored") acc.remaining += 1;
        if (row.status !== "ignored") {
          acc.qty += toNumber(row.qty ?? row.normalized?.qty);
          acc.value += toNumber(row.qty ?? row.normalized?.qty) * toNumber(row.buy_price ?? row.normalized?.buyPrice);
        }
        return acc;
      },
      { total: 0, committed: 0, remaining: 0, qty: 0, value: 0 }
    );
  }, [loadedReceptionRows]);

  const activeLocationTypes = useMemo(() => locationTypes.filter((t) => t.is_active), [locationTypes]);
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.is_active), [currencies]);
  const locationTypeOptions = useMemo(() => {
    if (activeLocationTypes.length) return activeLocationTypes;
    return [{ id: "warehouse", code: "warehouse", name: "Raktár", is_active: true } as AifLocationType];
  }, [activeLocationTypes]);

  function typeLabel(code: string) {
    return locationTypes.find((t) => t.code === code)?.name || locationTypeLabel(code);
  }

  useEffect(() => {
    if (defaultBrandCode && !brandOptionsForSupplier.some((b) => (b.code || b.id) === defaultBrandCode)) {
      setDefaultBrandCode("");
    }
  }, [brandOptionsForSupplier, defaultBrandCode]);

  function brandForNormalized(n: Record<string, unknown>) {
    const raw = String(n.brandCode || n.brandName || "").trim();
    if (!raw) return null;
    return activeBrands.find((b) =>
      sameLoose(b.code, raw) || sameLoose(b.id, raw) || sameLoose(b.name, raw)
    ) || null;
  }

  function brandColorCodeForNormalized(n: Record<string, unknown>) {
    const brand = brandForNormalized(n);
    const code = colorCodeKey(n.colorCode || (n as any).supplierColorCode);
    if (!brand || !code) return null;
    return brandColorCodes.find((item: any) =>
      item.is_active !== false &&
      String(item.brand_id) === String(brand.id) &&
      colorCodeKey(item.color_code) === code
    ) || null;
  }

  function applyProductCodeAndBrandColor(row: AifParsedRow) {
    const normalized = { ...(row.normalized || {}) } as any;
    const rawProductCode = rawValueByHeader(row, ["CODPRODUS", "COD PRODUS", "COD_PRODUS", "Cod produs", "product code"]);
    const sourceProductCode = normalized.supplierProductCode || normalized.productCode || normalized.modelCode || rawProductCode;
    const split = splitCodProdus(sourceProductCode);
    if (split.fullCode) normalized.supplierProductCode = normalized.supplierProductCode || split.fullCode;
    if (split.modelCode && (!normalized.modelCode || String(normalized.modelCode) === String(split.fullCode))) normalized.modelCode = split.modelCode;
    if (split.colorCode && !normalized.colorCode) normalized.colorCode = split.colorCode;
    if (split.colorCode && !normalized.supplierColorCode) normalized.supplierColorCode = split.colorCode;

    const brandColor = brandColorCodeForNormalized(normalized) as any;
    if (brandColor) {
      normalized.colorName = brandColor.color_name_ro || normalized.colorName || "";
      normalized.colorHex = brandColor.color_hex || normalized.colorHex || "";
      normalized.brandColorCodeId = brandColor.id;
      normalized.colorTypeCode = brandColor.color_type_code || normalized.colorTypeCode || "";
    } else if (normalized.colorName) {
      const rawColor = String(normalized.colorName || "").trim();
      const found = colorTypes.find((c) => {
        const aliases = Array.isArray(c.aliases) ? c.aliases : [];
        return [c.code, c.name_ro, c.name_hu, c.name_en, c.name_de, ...aliases].filter(Boolean).some((x) => sameLoose(x, rawColor));
      });
      if (found?.name_ro) {
        normalized.colorName = found.name_ro;
        normalized.colorHex = found.hex || normalized.colorHex || "";
        normalized.colorTypeCode = found.code || normalized.colorTypeCode || "";
      }
    }
    return { ...row, normalized };
  }

  function brandColorMissingHint(row: AifParsedRow) {
    const n = row.normalized || {};
    const brand = brandForNormalized(n);
    const code = String((n as any).colorCode || (n as any).supplierColorCode || "").trim();
    if (!brand || !code) return "";
    if (brandColorCodeForNormalized(n)) return "";
    return `${brand.name || brand.code} / ${code}`;
  }

  function brandValueForRow(n: Record<string, unknown>) {
    const raw = String(n.brandCode || n.brandName || "").trim();
    if (!raw) return "";
    const rawLower = raw.toLowerCase();
    const match = brandOptionsForSupplier.find((b) =>
      String(b.code || "").toLowerCase() === rawLower ||
      String(b.id || "").toLowerCase() === rawLower ||
      String(b.name || "").toLowerCase() === rawLower
    );
    return match ? String(match.code || match.id) : raw;
  }

  function categoryValueForRow(rowOrNormalized: AifParsedRow | Record<string, unknown>) {
    const row = (rowOrNormalized as any)?.normalized ? rowOrNormalized : { normalized: rowOrNormalized };
    const match = findCategoryForRow(row, activeCategories);
    return match ? String(match.code || match.id) : "";
  }

  function importedCategoryHint(row: AifParsedRow) {
    const raw = categoryCandidatesForRow(row).find((x) => String(x ?? "").trim());
    return String(raw ?? "").trim();
  }

  function normalizeImportedRowsWithMeta(inputRows: AifParsedRow[]) {
    return inputRows.map((row) => {
      const rowWithCode = applyProductCodeAndBrandColor(row);
      const normalized = { ...(rowWithCode.normalized || {}) } as any;
      const match = findCategoryForRow({ ...rowWithCode, normalized }, activeCategories);
      if (match) {
        normalized.categoryCode = String(match.code || match.id);
        normalized.categoryName = categoryLabel(match);
      } else if (String(normalized.categoryCode || normalized.categoryName || "").trim()) {
        normalized.sourceCategory = normalized.sourceCategory || normalized.categoryCode || normalized.categoryName;
        normalized.categoryCode = "";
        normalized.categoryName = "";
      }
      return { ...rowWithCode, normalized };
    });
  }

  const preview = useMemo(() => rows.slice(0, previewLimit), [rows, previewLimit]);
  const rowProblems = useMemo(() => rows.filter((r) => aifRowErrors(r).length > 0).length, [rows]);
  const approvedRowList = useMemo(() => rows.filter((row, index) => approvedRows[rowKey(row, index)]), [rows, approvedRows]);
  const approvedProblems = useMemo(() => approvedRowList.filter((r) => aifRowErrors(r).length > 0).length, [approvedRowList]);
  const approvedCount = approvedRowList.length;
  const excludedCount = Math.max(0, rows.length - approvedCount);
  const approvedGoodsValue = useMemo(() => approvedRowList.reduce((sum, row) => {
    const n = row.normalized || {};
    return sum + toNumber(n.qty) * toNumber(n.buyPrice);
  }, 0), [approvedRowList]);
  const approvedQty = useMemo(() => approvedRowList.reduce((sum, row) => sum + toNumber(row.normalized?.qty), 0), [approvedRowList]);
  const savedReceptionGoodsValue = selectedReceptionId ? loadedReceptionRowTotals.value : 0;
  const totalReceptionGoodsValue = savedReceptionGoodsValue + approvedGoodsValue;
  const rateValue = exchangeRateToRon.trim() ? toNumber(exchangeRateToRon) : 0;
  const shippingValue = shippingCost.trim() ? toNumber(shippingCost) : 0;
  const vatRateValue = tvaMode === "with_tva" && tvaRate.trim() ? toNumber(tvaRate) : 0;
  const goodsPlusShipping = totalReceptionGoodsValue + shippingValue;
  const invoiceGrossProvided = invoiceGross.trim().length > 0;
  const invoiceGrossValue = invoiceGrossProvided ? toNumber(invoiceGross) : 0;
  const tvaRateRequired = tvaMode === "with_tva";
  const requiredMissing = {
    invoiceNumber: !invoiceNumber.trim(),
    invoiceDate: !invoiceDate,
    receptionDate: !receptionDate,
    currencyCode: !currencyCode,
    exchangeRateToRon: !exchangeRateToRon.trim() || rateValue <= 0,
    tvaMode: !tvaMode,
    tvaRate: tvaRateRequired && (!tvaRate.trim() || vatRateValue < 0),
    invoiceGross: !invoiceGrossProvided,
  };
  const computedReception = useMemo(() => {
    if (!tvaMode) return { net: 0, vat: 0, gross: goodsPlusShipping };
    const vatFactor = 1 + Math.max(0, vatRateValue) / 100;
    if (tvaMode === "with_tva") {
      const gross = goodsPlusShipping;
      const net = vatFactor > 0 ? gross / vatFactor : gross;
      const vat = gross - net;
      return { net, vat, gross };
    }
    return { net: goodsPlusShipping, vat: 0, gross: goodsPlusShipping };
  }, [goodsPlusShipping, tvaMode, vatRateValue]);
  const invoiceDifference = invoiceGrossProvided ? invoiceGrossValue - computedReception.gross : 0;
  const receptionRonValue = (invoiceGrossProvided ? invoiceGrossValue : computedReception.gross) * (rateValue || 0);
  const receptionReady = Boolean(
    invoiceNumber.trim() &&
    invoiceDate &&
    receptionDate &&
    currencyCode &&
    rateValue > 0 &&
    tvaMode &&
    (!tvaRateRequired || tvaRate.trim()) &&
    invoiceGrossProvided
  );
  const requiredInput = (missing: boolean) => `${input} w-full ${missing ? "border-red-300/80 bg-red-500/10 focus:border-red-200/90 focus:ring-red-200/25" : ""}`;
  const requiredSelectInput = (missing: boolean) => `${selectInput} w-full ${missing ? "border-red-300/80 bg-[#303b4e] focus:border-red-200/90 focus:ring-red-200/25" : ""}`;
  const canSaveApprovedRows = Boolean(supplierId && locationId && approvedCount > 0 && approvedProblems === 0 && receptionReady);
  const columnWarnings = useMemo(() => {
    if (!workbench) return 0;
    return workbench.columns.reduce((sum, c) => sum + c.warnings.length + (c.field !== "ignore" && c.confidence < 60 ? 1 : 0), 0) + workbench.warnings.length;
  }, [workbench]);

  function updateColumnField(index: number, field: AifColumnField) {
    if (!workbench) return;
    const next: AifWorkbookAnalysis = {
      ...workbench,
      columns: workbench.columns.map((col) => (col.index === index ? { ...col, field, label: AIF_COLUMN_FIELD_OPTIONS.find((x) => x.value === field)?.label || col.label } : col)),
    };
    setWorkbench(next);
    setRows((current) => normalizeImportedRowsWithMeta(applyAifColumnMapping(current, next, selectedSupplier)));
  }

  function updateRowField(index: number, field: EditableImportField, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const normalized = { ...(row.normalized || {}) };
        if (field === "qty") normalized[field] = value === "" ? null : Number(value);
        else if (field === "buyPrice") normalized[field] = value === "" ? null : Number(String(value).replace(",", "."));
        else normalized[field] = value;
        if (field === "brandCode") {
          const brand = activeBrands.find((b) => (b.code || b.id) === value);
          normalized.brandName = brand?.name || "";
        }
        if (field === "categoryCode") {
          const category = activeCategories.find((c) => (c.code || c.id) === value);
          normalized.categoryName = category ? categoryLabel(category) : "";
        }
        if (field === "supplierProductCode") normalized.modelCode = value || normalized.modelCode;
        return applyProductCodeAndBrandColor({ ...row, normalized });
      })
    );
  }

  function applyImportDefaults(scope: "missing" | "approved" | "all") {
    if (!rows.length) {
      setMessage("Nincs beolvasott sor.");
      return;
    }
    const hasAnyDefault = Boolean(defaultBrandCode || defaultCategoryCode || defaultGender);
    if (!hasAnyDefault) {
      setMessage("Nincs kiválasztott alap besorolás.");
      return;
    }
    let changed = 0;
    setRows((current) =>
      current.map((row, index) => {
        if (scope === "approved" && !approvedRows[rowKey(row, index)]) return row;
        const normalized = { ...(row.normalized || {}) };
        let touched = false;
        const assign = (key: "brandCode" | "categoryCode" | "gender", value: string) => {
          if (!value) return;
          if (scope === "missing" && normalized[key]) return;
          if (normalized[key] === value) return;
          normalized[key] = value;
          touched = true;
        };
        assign("brandCode", defaultBrandCode);
        assign("categoryCode", defaultCategoryCode);
        assign("gender", defaultGender);
        if (defaultBrandCode && normalized.brandCode === defaultBrandCode) {
          normalized.brandName = activeBrands.find((b) => (b.code || b.id) === defaultBrandCode)?.name || normalized.brandName;
        }
        if (defaultCategoryCode && normalized.categoryCode === defaultCategoryCode) {
          const category = activeCategories.find((c) => (c.code || c.id) === defaultCategoryCode);
          normalized.categoryName = category ? categoryLabel(category) : normalized.categoryName;
        }
        if (touched) changed += 1;
        return touched ? { ...row, normalized } : row;
      })
    );
    if (scope === "approved") setMessage(`${changed} kijelölt sor besorolása frissítve.`);
    else if (scope === "all") setMessage(`${changed} beolvasott sor besorolása frissítve.`);
    else setMessage(`${changed} sor hiányzó besorolása kitöltve.`);
  }

  function toggleApprovedRow(index: number, checked: boolean) {
    const row = rows[index];
    if (!row) return;
    const key = rowKey(row, index);
    setApprovedRows((current) => ({ ...current, [key]: checked }));
  }

  function selectCleanRows() {
    const next: Record<string, boolean> = {};
    rows.forEach((row, index) => {
      if (aifRowErrors(row).length === 0) next[rowKey(row, index)] = true;
    });
    setApprovedRows(next);
    setMessage("A hibátlan sorok ki lettek jelölve. Mentés előtt ellenőrizd az előnézetet.");
  }

  function clearApprovedRows() {
    setApprovedRows({});
    setMessage("A kijelölés törölve. A beolvasott adatok továbbra is csak előnézetben vannak.");
  }

  function resetManualRowForm() {
    setManualProductCode("");
    setManualTitle("");
    setManualBrandCode(defaultBrandCode);
    setManualCategoryCode(defaultCategoryCode);
    setManualGender(defaultGender);
    setManualColorName("");
    setManualColorCode("");
    setManualSize("");
    setManualQty("");
    setManualBuyPrice("");
  }

  function clearImportedRows() {
    setFileName("");
    setRows([]);
    setWorkbench(null);
    setApprovedRows({});
    setPreviewLimit(25);
  }

  function startNewEmptyReception(showMessage = true) {
    setSelectedReceptionId("");
    setReceptionPickerId("");
    setLoadedReception(null);
    setSupplierId("");
    setLocationId("");
    setNote("");
    setInvoiceNumber("");
    setInvoiceDate("");
    setReceptionDate("");
    setCurrencyCode("");
    setExchangeRateToRon("");
    setTvaMode("");
    setTvaRate("");
    setShippingCost("");
    setInvoiceGross("");
    setDefaultBrandCode("");
    setDefaultCategoryCode("");
    setDefaultGender("");
    clearImportedRows();
    resetManualRowForm();
    setManualRowsOpen(true);
    setReceptionOpen(true);
    setWorkbenchOpen(false);
    if (showMessage) setMessage("Új üres bevételezés indítva. Előbb válassz beszállítót és töltsd ki a receptiót, majd jöhet kézi sor vagy XLS.");
  }

  function fillReceptionHeader(detail: AifReceptionDetail) {
    const item = detail.item;
    setSelectedReceptionId(item.id);
    setReceptionPickerId(item.id);
    setLoadedReception(detail);
    setSupplierId(String(item.supplier_id || ""));
    setLocationId(String(item.target_location_id || ""));
    setInvoiceNumber(String(item.invoice_number || ""));
    setInvoiceDate(dateOnly(item.invoice_date));
    setReceptionDate(dateOnly(item.reception_date));
    setCurrencyCode(String(item.currency_code || ""));
    setExchangeRateToRon(String(item.exchange_rate_to_ron || ""));
    setTvaMode((String(item.tva_mode || "") as any) || "");
    setTvaRate(String(item.tva_rate ?? ""));
    setShippingCost(String(item.shipping_cost ?? ""));
    setInvoiceGross(String(item.invoice_gross ?? ""));
    setNote(String((item as any).note || ""));
    clearImportedRows();
    resetManualRowForm();
    setManualRowsOpen(true);
    setReceptionOpen(true);
    setWorkbenchOpen(false);
  }

  async function loadReceptionIntoWorkspace(id?: string) {
    const rid = id || receptionPickerId;
    if (!rid) {
      setMessage("Válassz receptiót a listából.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const detail = await apiAifGetReception(rid);
      fillReceptionHeader(detail);
      const remaining = Number((detail.item as any).remaining_rows || 0);
      setMessage(`Receptió betöltve: ${detail.item.invoice_number || "számlaszám nélkül"}. ${remaining ? `${remaining} még dolgozandó sor van benne.` : "Új sorokat is hozzáadhatsz ehhez a receptióhoz."}`);
    } catch (e: any) {
      setMessage(e?.message || "A receptió betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function addManualRow() {
    const nextRowNo = rows.length + 1;
    const brandCode = manualBrandCode || defaultBrandCode;
    const categoryCode = manualCategoryCode || defaultCategoryCode;
    const gender = manualGender || defaultGender;
    const brand = activeBrands.find((b) => (b.code || b.id) === brandCode);
    const category = activeCategories.find((c) => (c.code || c.id) === categoryCode);
    const qty = manualQty.trim() ? Number(String(manualQty).replace(",", ".")) : null;
    const buyPrice = manualBuyPrice.trim() ? Number(String(manualBuyPrice).replace(",", ".")) : null;

    const manualRow: AifParsedRow = {
      rowNo: nextRowNo,
      raw: {
        source: "manual",
        productCode: manualProductCode,
        title: manualTitle,
        brandCode,
        categoryCode,
        gender,
        colorName: manualColorName,
        colorCode: manualColorCode,
        size: manualSize,
        qty,
        buyPrice,
      },
      normalized: {
        supplierProductCode: manualProductCode.trim(),
        modelCode: manualProductCode.trim(),
        titleRo: manualTitle.trim(),
        brandCode,
        brandName: brand?.name || "",
        categoryCode,
        categoryName: category ? categoryLabel(category) : "",
        gender,
        colorName: manualColorName.trim(),
        colorCode: manualColorCode.trim(),
        size: manualSize.trim(),
        qty,
        buyPrice,
        source: "manual",
      },
    };

    const mappedManualRow = applyProductCodeAndBrandColor(manualRow);
    const errors = aifRowErrors(mappedManualRow);
    const rowIndex = rows.length;
    const key = rowKey(mappedManualRow, rowIndex);
    setRows((current) => [...current, mappedManualRow]);
    setFileName((current) => current || "Manuális bevételezés");
    setWorkbenchOpen(false);
    setPreviewLimit((current) => Math.max(current, rowIndex + 1));
    setApprovedRows((current) => ({ ...current, [key]: errors.length === 0 }));
    resetManualRowForm();
    setMessage(errors.length ? "A manuális sor hozzáadva előnézethez, de javítás szükséges." : "A manuális sor hozzáadva és mentésre kijelölve.");
  }

  async function loadMeta() {
    const [meta, typeData, currencyData] = await Promise.all([
      apiAifMeta(),
      apiAifListLocationTypes({ includeInactive: true }),
      apiAifListCurrencies({ includeInactive: true }),
    ]);
    const activeSuppliers = meta.suppliers.filter((x) => x.is_active);
    const activeLocations = meta.locations.filter((x) => x.is_active);
    const allTypes = typeData.items || meta.locationTypes || [];
    const activeTypes = allTypes.filter((x) => x.is_active);
    setSuppliers(activeSuppliers);
    setLocations(activeLocations);
    setLocationTypes(allTypes);
    setCurrencies(currencyData.items || meta.currencies || []);
    setBrands((meta as any).brands || []);
    setCategories((meta as any).categories || []);
    setGenderTypes((meta as any).genderTypes || []);
    setSupplierBrands((meta as any).supplierBrands || []);
    setBrandColorCodes((meta as any).brandColorCodes || []);
    setColorTypes((meta as any).colorTypes || []);
    setNewLocationType((current) => {
      if (current && activeTypes.some((t) => t.code === current)) return current;
      return activeTypes[0]?.code || "warehouse";
    });
    setSupplierId((current) => (current && activeSuppliers.some((s) => s.id === current) ? current : ""));
    setLocationId((current) => (current && activeLocations.some((l) => l.id === current) ? current : ""));
    setCurrencyCode((current) => {
      const active = (currencyData.items || meta.currencies || []).filter((c) => c.is_active);
      if (current && active.some((c) => c.code === current)) return current;
      return "";
    });
  }

  async function loadBatches() {
    const data = await apiAifListImportBatches(25);
    setBatches(data.items || []);
  }

  async function loadReceptions() {
    const data = await apiAifListReceptions({ limit: 25 });
    setReceptions(data.items || []);
  }

  async function reloadAll() {
    await loadMeta();
    await Promise.all([loadBatches(), loadReceptions()]);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadMeta();
        if (alive) {
          await Promise.all([loadBatches(), loadReceptions()]);
          startNewEmptyReception(false);
        }
      } catch (e: any) {
        if (alive) setMessage(e.message || "Nem sikerült betölteni az adatokat.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onFileChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const parsed = await readAifWorkbookWithAnalysis(file, selectedSupplier);
      const normalizedRows = normalizeImportedRowsWithMeta(parsed.rows);
      setFileName(file.name);
      setRows(normalizedRows);
      setWorkbench(parsed.analysis);
      setWorkbenchOpen(true);
      setPreviewLimit(25);
      setApprovedRows({});
      setMessage(`${normalizedRows.length} sor beolvasva előnézetre. Importáláshoz előbb jelöld ki a valóban használható sorokat.`);
    } catch (e: any) {
      setRows([]);
      setWorkbench(null);
      setApprovedRows({});
      setMessage(e.message || "Nem sikerült beolvasni az XLS/XLSX fájlt.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!supplierId || !locationId || !rows.length) return;
    if (!approvedRowList.length) {
      setMessage("Nincs kijelölt sor. Beolvasás után csak a kijelölt sorok menthetők importként.");
      return;
    }
    if (approvedProblems > 0) {
      setMessage("A kijelölt sorok között hibás vagy hiányos adat van. Javítás vagy kizárás után menthető.");
      return;
    }
    if (!receptionReady) {
      setMessage("A receptió kötelező mezőit ki kell tölteni: számlaszám, dátumok, pénznem, árfolyam, TVA kezelés és számla végösszeg.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const payload: any = {
        supplierId,
        targetLocationId: locationId,
        sourceFileName: fileName || "Manuális bevételezés",
        sourceFormat: fileName && fileName !== "Manuális bevételezés" ? "xls" : "manual",
        note,
        reception: {
          invoiceNumber,
          invoiceDate,
          receptionDate,
          currencyCode,
          exchangeRateToRon: rateValue,
          tvaMode,
          tvaRate: vatRateValue,
          shippingCost: shippingValue,
          goodsValue: approvedGoodsValue,
          invoiceNet: computedReception.net,
          invoiceVat: computedReception.vat,
          invoiceGross: invoiceGrossValue,
          lineCount: approvedCount,
          totalQty: approvedQty,
          note,
        },
        rows: approvedRowList,
      };
      if (selectedReceptionId) payload.receptionId = selectedReceptionId;
      const saved = await apiAifCreateFullImportBatch(payload);
      clearImportedRows();
      resetManualRowForm();
      await Promise.all([loadBatches(), loadReceptions()]);
      const savedReceptionId = selectedReceptionId || saved.receptionId;
      if (savedReceptionId) {
        const detail = await apiAifGetReception(savedReceptionId);
        setSelectedReceptionId(savedReceptionId);
        setReceptionPickerId(savedReceptionId);
        setLoadedReception(detail);
      }
      setMessage(`${selectedReceptionId ? "Receptió folytatása mentve" : "Új receptió mentve"}: ${saved.rowCount} kijelölt sor, ellenőrzendő sor: ${saved.errorCount}. Kizárt sorok: ${excludedCount}.`);
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni az importot.");
    } finally {
      setBusy(false);
    }
  }

  async function commitBatch(batch: AifImportBatchSummary) {
    if (!batch?.id) return;
    if (Number(batch.row_count || 0) <= 0) {
      setMessage("A készletre vétel nem indítható: ehhez az importhoz nincs mentett terméksor.");
      return;
    }
    if (Number(batch.error_count || 0) > 0) {
      setMessage("A készletre vétel nem indítható: az importban ellenőrzendő vagy hibás sor van.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifCommitImportBatch(batch.id);
      await Promise.all([loadBatches(), loadReceptions()]);
      setMessage(`Készletre vétel kész. Létrehozott vagy frissített variánsok: ${result.committed ?? 0}.`);
    } catch (e: any) {
      setMessage(e.message || "A készletre vétel nem sikerült. Ellenőrizd az import sorokat.");
    } finally {
      setBusy(false);
    }
  }

  async function createLocation() {
    if (!newLocationName.trim()) {
      setMessage("A cél hely neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiAifCreateLocation({ name: newLocationName, locationType: newLocationType });
      setNewLocationName("");
      setNewLocationType(locationTypeOptions[0]?.code || "warehouse");
      await loadMeta();
      setLocationId(created.item.id);
      setMessage("Cél hely mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a cél helyet.");
    } finally {
      setBusy(false);
    }
  }

  async function createLocationType() {
    if (!newLocationTypeName.trim()) {
      setMessage("A típus neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiAifCreateLocationType({ name: newLocationTypeName });
      setNewLocationTypeName("");
      await loadMeta();
      setNewLocationType(created.item.code);
      setMessage("Típus mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a típust.");
    } finally {
      setBusy(false);
    }
  }

  function startEditLocationType(type: AifLocationType) {
    setDeleteLocationTypeTarget(null);
    setEditingLocationTypeId(type.id);
    setEditLocationTypeName(type.name || "");
  }

  function cancelEditLocationType() {
    setEditingLocationTypeId("");
    setEditLocationTypeName("");
  }

  async function saveLocationTypeEdit() {
    if (!editingLocationTypeId) return;
    if (!editLocationTypeName.trim()) {
      setMessage("A típus neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateLocationType(editingLocationTypeId, { name: editLocationTypeName });
      await loadMeta();
      cancelEditLocationType();
      setMessage("Típus módosítva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a típust.");
    } finally {
      setBusy(false);
    }
  }

  async function activateLocationType(type: AifLocationType) {
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateLocationType(type.id, { is_active: true });
      await loadMeta();
      setMessage("Típus aktiválva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült aktiválni a típust.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteLocationType() {
    if (!deleteLocationTypeTarget) return;
    const target = deleteLocationTypeTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifDeleteLocationType(target.id);
      setDeleteLocationTypeTarget(null);
      await loadMeta();
      setMessage(result.mode === "deleted" ? "Típus törölve." : "Típus inaktiválva, mert már használatban van.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a típust.");
    } finally {
      setBusy(false);
    }
  }

  function startEditLocation(location: AifLocation) {
    setDeleteLocationTarget(null);
    setEditingLocationId(location.id);
    setEditLocationName(location.name || "");
    setEditLocationType((location.location_type as LocationType) || "warehouse");
  }

  function cancelEditLocation() {
    setEditingLocationId("");
    setEditLocationName("");
    setEditLocationType("warehouse");
  }

  async function saveLocationEdit() {
    if (!editingLocationId) return;
    if (!editLocationName.trim()) {
      setMessage("A cél hely neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await apiAifUpdateLocation(editingLocationId, {
        name: editLocationName,
        locationType: editLocationType,
      });
      await loadMeta();
      setLocationId((current) => current || updated.item.id);
      cancelEditLocation();
      setMessage("Cél hely módosítva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a cél helyet.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteLocation() {
    if (!deleteLocationTarget) return;
    const target = deleteLocationTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifDeleteLocation(target.id);
      setDeleteLocationTarget(null);
      await loadMeta();
      setMessage(result.mode === "deleted" ? "Cél hely törölve." : "Cél hely inaktiválva, mert már kapcsolódik hozzá adat.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a cél helyet.");
    } finally {
      setBusy(false);
    }
  }


  async function createCurrency() {
    const code = newCurrencyCode.trim().toUpperCase();
    if (!code || !newCurrencyName.trim()) {
      setMessage("A pénznem kódja és neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await apiAifCreateCurrency({ code, name: newCurrencyName, symbol: newCurrencySymbol });
      setNewCurrencyCode("");
      setNewCurrencyName("");
      setNewCurrencySymbol("");
      await loadMeta();
      setCurrencyCode(created.item.code);
      setMessage("Pénznem mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a pénznemet.");
    } finally {
      setBusy(false);
    }
  }

  function startEditCurrency(currency: AifCurrency) {
    setDeleteCurrencyTarget(null);
    setEditingCurrencyCode(currency.code);
    setEditCurrencyName(currency.name || "");
    setEditCurrencySymbol(currency.symbol || "");
  }

  function cancelEditCurrency() {
    setEditingCurrencyCode("");
    setEditCurrencyName("");
    setEditCurrencySymbol("");
  }

  async function saveCurrencyEdit() {
    if (!editingCurrencyCode) return;
    if (!editCurrencyName.trim()) {
      setMessage("A pénznem neve kötelező.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateCurrency(editingCurrencyCode, { name: editCurrencyName, symbol: editCurrencySymbol });
      await loadMeta();
      cancelEditCurrency();
      setMessage("Pénznem módosítva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a pénznemet.");
    } finally {
      setBusy(false);
    }
  }

  async function activateCurrency(currency: AifCurrency) {
    setBusy(true);
    setMessage("");
    try {
      await apiAifUpdateCurrency(currency.code, { is_active: true });
      await loadMeta();
      setMessage("Pénznem aktiválva.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült aktiválni a pénznemet.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteCurrency() {
    if (!deleteCurrencyTarget) return;
    const target = deleteCurrencyTarget;
    setBusy(true);
    setMessage("");
    try {
      const result = await apiAifDeleteCurrency(target.code);
      setDeleteCurrencyTarget(null);
      await loadMeta();
      setMessage(result.mode === "deleted" ? "Pénznem törölve." : "Pénznem inaktiválva, mert már használatban van.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a pénznemet.");
    } finally {
      setBusy(false);
    }
  }


  async function saveOpenedReceptionHeader() {
    if (!selectedReceptionId) {
      setMessage("Új receptió fejadatai a kijelölt sorok mentésekor jönnek létre.");
      return;
    }
    if (!invoiceNumber.trim() || !invoiceDate || !receptionDate || !currencyCode || rateValue <= 0 || !tvaMode || !invoiceGrossProvided) {
      setMessage("A mentéshez töltsd ki a receptió kötelező mezőit.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/aif/receptions/${encodeURIComponent(selectedReceptionId)}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          reception: {
            invoiceNumber,
            invoiceDate,
            receptionDate,
            currencyCode,
            exchangeRateToRon: rateValue,
            tvaMode,
            tvaRate: tvaMode === "no_tva" ? 0 : vatRateValue,
            shippingCost: shippingValue,
            invoiceGross: invoiceGrossValue,
            note,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "A receptió fejadatai nem menthetők.");
      await Promise.all([loadReceptions(), loadBatches()]);
      await loadReceptionIntoWorkspace(selectedReceptionId);
      setMessage("A megnyitott receptió fejadatai mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A receptió fejadatai nem menthetők.");
    } finally {
      setBusy(false);
    }
  }

  async function exportOpenedReceptionCheckPdf() {
    if (!selectedReceptionId) {
      setMessage("Előbb válassz vagy ments receptiót az ellenőrző PDF-hez.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const detail = loadedReception || await apiAifGetReception(selectedReceptionId);
      openReceptionVerificationPdf(detail, activeCategories, activeGenderTypes);
    } catch (e: any) {
      setMessage(e?.message || "Az ellenőrző PDF export nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function renderReceptionHeaderEditor() {
    return (
      <section className={card}>
        <SectionTitle
          icon={<FileSpreadsheet size={16} />}
          title={selectedReceptionId ? "Megnyitott receptió adatai" : "Új receptió adatai"}
          right={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedReceptionId ? (
                <>
                  <button className={neutralBtn} onClick={exportOpenedReceptionCheckPdf} disabled={busy} type="button">
                    <FileText size={14} /> Ellenőrző PDF
                  </button>
                  <button className={primaryBtn} onClick={saveOpenedReceptionHeader} disabled={busy} type="button">
                    <Save size={14} /> Fejadatok mentése
                  </button>
                </>
              ) : (
                <span className="text-xs text-white/60">Új receptió a kijelölt sorok mentésekor jön létre</span>
              )}
              {selectedReceptionId && (
                <button className={neutralBtn} onClick={() => (window.location.hash = "#allinreceptions")} type="button">
                  Receptió részletei
                </button>
              )}
            </div>
          }
        />

        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-white/14 bg-[#354153] px-3 py-2 text-sm text-white/76">
            Itt van a megnyitott receptió fejrésze. Előbb ezt ellenőrizd, utána jöhet XLS import vagy kézi terméksor.
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr]">
            <label className={label}>
              Beszállító
              <select className={`${selectInput} w-full`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option style={mutedOptionStyle} value="">Beszállító kiválasztása</option>
                {suppliers.map((s) => (
                  <option style={optionStyle} key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className={label}>
              Cél hely
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select className={`${selectInput} w-full`} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option style={mutedOptionStyle} value="">Cél hely kiválasztása</option>
                  {locations.map((l) => (
                    <option style={optionStyle} key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <button className={neutralBtn} onClick={() => setLocationModalOpen(true)} type="button" title="Cél helyek kezelése">
                  <MapPin size={14} /> Kezelés
                </button>
              </div>
            </label>

            <label className={label}>
              Megjegyzés
              <input className={`${input} w-full`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="pl. Under Armour új lista" />
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            <label className={label}>
              Számlaszám
              <input className={requiredInput(requiredMissing.invoiceNumber)} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Számla száma" />
            </label>
            <label className={label}>
              Számla dátuma
              <input className={requiredInput(requiredMissing.invoiceDate)} type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </label>
            <label className={label}>
              Receptió dátuma
              <input className={requiredInput(requiredMissing.receptionDate)} type="date" value={receptionDate} onChange={(e) => setReceptionDate(e.target.value)} />
            </label>
            <label className={label}>
              Pénznem
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select
                  className={requiredSelectInput(requiredMissing.currencyCode)}
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                >
                  <option style={mutedOptionStyle} value="">Pénznem kiválasztása</option>
                  {activeCurrencies.map((c) => (
                    <option style={optionStyle} key={c.code} value={c.code}>{c.code} • {c.name}</option>
                  ))}
                </select>
                <button className={neutralBtn} onClick={() => setCurrencyModalOpen(true)} type="button">
                  Kezelés
                </button>
              </div>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            <label className={label}>
              Árfolyam RON
              <input className={requiredInput(requiredMissing.exchangeRateToRon)} value={exchangeRateToRon} onChange={(e) => setExchangeRateToRon(e.target.value)} placeholder="pl. 4.97" />
            </label>
            <label className={label}>
              TVA kezelés
              <select className={requiredSelectInput(requiredMissing.tvaMode)} value={tvaMode} onChange={(e) => { const next = e.target.value as any; setTvaMode(next); if (next !== "with_tva") setTvaRate("0"); }}>
                <option style={mutedOptionStyle} value="">TVA kezelés kiválasztása</option>
                <option style={optionStyle} value="without_tva">Árak nettóban</option>
                <option style={optionStyle} value="with_tva">Árak bruttóban</option>
                <option style={optionStyle} value="no_tva">TVA nélkül</option>
              </select>
            </label>
            <label className={label}>
              TVA %
              <input className={`${requiredInput(tvaMode !== "with_tva" ? false : requiredMissing.tvaRate)} ${tvaMode !== "with_tva" ? "opacity-70 cursor-not-allowed" : ""}`} value={tvaMode !== "with_tva" ? "0" : tvaRate} onChange={(e) => setTvaRate(e.target.value)} disabled={tvaMode !== "with_tva"} placeholder={tvaMode !== "with_tva" ? "Nem szükséges" : "pl. 19"} />
            </label>
            <label className={label}>
              Szállítás
              <input className={`${input} w-full`} value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} placeholder="ha nincs, hagyd üresen" />
            </label>
            <label className={label}>
              Számla végösszeg
              <input className={requiredInput(requiredMissing.invoiceGross)} value={invoiceGross} onChange={(e) => setInvoiceGross(e.target.value)} placeholder="Számla végösszege" />
            </label>
          </div>

          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Mentett sorok</p>
              <p className="mt-1 text-sm text-white">{moneyText(savedReceptionGoodsValue, currencyCode)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Új kijelölt sorok</p>
              <p className="mt-1 text-sm text-white">{moneyText(approvedGoodsValue, currencyCode)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Sorok összesen</p>
              <p className="mt-1 text-sm text-white">{moneyText(totalReceptionGoodsValue, currencyCode)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Számított összeg</p>
              <p className="mt-1 text-sm text-white">{moneyText(computedReception.gross, currencyCode)}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Eltérés</p>
              <p className={`mt-1 text-sm ${invoiceGrossProvided && Math.abs(invoiceDifference) > 0.01 ? "text-amber-100" : "text-white"}`}>{invoiceGrossProvided ? moneyText(invoiceDifference, currencyCode) : "-"}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Érték RON</p>
              <p className="mt-1 text-sm text-white">{rateValue > 0 ? moneyText(receptionRonValue, "RON") : "-"}</p>
              {computedReception.vat > 0 && <p className="mt-1 text-[11px] text-white/55">TVA: {moneyText(computedReception.vat, currencyCode)}</p>}
            </div>
          </div>

          {!receptionReady && (
            <div className="rounded-xl border border-amber-200/24 bg-amber-400/10 px-3 py-2 text-sm text-amber-50">
              Mentés előtt töltsd ki a kötelező receptió mezőket. A pirossal jelölt mezők hiányoznak vagy hibásak.
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderLoadedReceptionContent() {
    if (!loadedReception) return null;
    return (
      <section className={card}>
        <SectionTitle
          icon={<CheckCircle size={16} />}
          title="Betöltött receptió tartalma"
          right={<span className="text-xs text-white/60">A már mentett sorok áttekintése</span>}
        />
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/58">Összes sor</p><p className="mt-1 text-sm text-white">{loadedReceptionRowTotals.total}</p></div>
          <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/58">Készleten</p><p className="mt-1 text-sm text-white">{loadedReceptionRowTotals.committed}</p></div>
          <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/58">Még dolgozandó</p><p className="mt-1 text-sm text-white">{loadedReceptionRowTotals.remaining}</p></div>
          <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/58">Darab / érték</p><p className="mt-1 text-sm text-white">{loadedReceptionRowTotals.qty} db • {moneyText(loadedReceptionRowTotals.value, loadedReception.item?.currency_code || currencyCode)}</p></div>
        </div>
        <div className="mt-3 overflow-auto rounded-xl border border-white/14">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-[#303b4e] text-xs uppercase tracking-[0.07em] text-white/76">
              <tr>
                <th className="px-3 py-2 font-normal">Állapot</th>
                <th className="px-3 py-2 font-normal">Termékkód</th>
                <th className="px-3 py-2 font-normal">Név</th>
                <th className="px-3 py-2 font-normal">Márka</th>
                <th className="px-3 py-2 font-normal">Kategória</th>
                <th className="px-3 py-2 font-normal">Nem</th>
                <th className="px-3 py-2 font-normal">Szín</th>
                <th className="px-3 py-2 font-normal">Méret</th>
                <th className="px-3 py-2 text-right font-normal">Darab</th>
                <th className="px-3 py-2 text-right font-normal">Vételár</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loadedReceptionRows.map((row: any) => (
                <tr key={row.id || `${row.batch_id}-${row.row_no}`} className={row.status === "committed" ? "bg-emerald-400/10" : row.status === "error" ? "bg-red-500/10" : "bg-[#445064]"}>
                  <td className="px-3 py-2.5 text-xs text-white/80">{rowStatusText(row.status)}</td>
                  <td className="px-3 py-2.5 text-white/88">{cell(row.supplier_product_code || row.normalized?.supplierProductCode || row.normalized?.modelCode)}</td>
                  <td className="px-3 py-2.5 text-white">{normValue(row, "titleRo")}</td>
                  <td className="px-3 py-2.5 text-white/82">{normValue(row, "brandName", row.normalized?.brandCode)}</td>
                  <td className="px-3 py-2.5 text-white/82">{categoryDisplay(row.normalized?.categoryCode || row.normalized?.categoryName, activeCategories)}</td>
                  <td className="px-3 py-2.5 text-white/82">{genderLabel(row.normalized?.gender, activeGenderTypes)}</td>
                  <td className="px-3 py-2.5 text-white/82">{normValue(row, "colorName")}</td>
                  <td className="px-3 py-2.5 text-white/82">{cell(row.supplier_size || row.normalized?.size)}</td>
                  <td className="px-3 py-2.5 text-right text-white/88">{cell(row.qty || row.normalized?.qty)}</td>
                  <td className="px-3 py-2.5 text-right text-white/88">{moneyText(toNumber(row.buy_price || row.normalized?.buyPrice), loadedReception.item?.currency_code || currencyCode)}</td>
                </tr>
              ))}
              {!loadedReceptionRows.length && (
                <tr>
                  <td className="px-3 py-6 text-center text-white/60" colSpan={10}>Ebben a receptióban még nincs mentett terméksor.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button className={neutralBtn} onClick={exportOpenedReceptionCheckPdf} disabled={busy || !selectedReceptionId} type="button"><FileText size={14} /> Ellenőrző PDF</button>
          <button className={neutralBtn} onClick={() => (window.location.hash = "#allinreceptions")} type="button">Receptió részletei</button>
          <button className={neutralBtn} onClick={() => loadReceptionIntoWorkspace(selectedReceptionId)} disabled={busy || !selectedReceptionId} type="button"><RefreshCw size={14} /> Újratöltés</button>
        </div>
      </section>
    );
  }

  return (
    <main className={page}>
      <style>{`
        select.aif-native-select,
        select.aif-native-select option,
        select.aif-native-select optgroup {
          background-color: #303b4e !important;
          color: #ffffff !important;
          color-scheme: dark;
        }
        select.aif-native-select option:disabled {
          background-color: #303b4e !important;
          color: rgba(255, 255, 255, 0.45) !important;
        }
        select.aif-native-select option:checked {
          background-color: #3b4658 !important;
          color: #ffffff !important;
        }
      `}</style>
      {locationModalOpen && (
        <div className={modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="locations-title">
          <div className={modalCard}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="locations-title" className="text-lg font-normal">Cél helyek kezelése</p>
                <p className="mt-1 text-sm text-white/70">Raktárak, üzletek és egyéb cél helyek felvétele vagy törlése.</p>
              </div>
              <button className={neutralBtn} onClick={() => setLocationModalOpen(false)} type="button">
                <X size={14} /> Bezárás
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/14 bg-[#435064] p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <label className={label}>
                  Név
                  <input
                    className={`${input} w-full`}
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="pl. Csíkszereda üzlet"
                  />
                </label>
                <label className={label}>
                  Típus
                  <select className={`${selectInput} w-full`} value={newLocationType} onChange={(e) => setNewLocationType(e.target.value as LocationType)}>
                    {locationTypeOptions.map((t) => (
                      <option style={optionStyle} key={t.id} value={t.code}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <button className={primaryBtn} onClick={createLocation} disabled={busy} type="button">
                  <Save size={14} /> Mentés
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/14 bg-[#435064] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <label className={label}>
                  Cél hely típus hozzáadása
                  <input
                    className={`${input} w-full sm:w-[280px]`}
                    value={newLocationTypeName}
                    onChange={(e) => setNewLocationTypeName(e.target.value)}
                    placeholder="pl. Bemutatóterem"
                  />
                </label>
                <button className={primaryBtn} onClick={createLocationType} disabled={busy} type="button">
                  <Plus size={14} /> Típus mentése
                </button>
              </div>

              <div className="mt-3 grid gap-2">
                {locationTypes.map((t) => {
                  const isEditingType = editingLocationTypeId === t.id;
                  return (
                    <div key={t.id} className="rounded-lg border border-white/10 bg-[#354153] p-2.5">
                      {isEditingType ? (
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                          <label className={label}>
                            Típus neve
                            <input
                              className={`${input} w-full`}
                              value={editLocationTypeName}
                              onChange={(e) => setEditLocationTypeName(e.target.value)}
                              placeholder="Típus neve"
                            />
                          </label>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button className={primaryBtn} onClick={saveLocationTypeEdit} disabled={busy} type="button">
                              <Save size={14} /> Mentés
                            </button>
                            <button className={neutralBtn} onClick={cancelEditLocationType} disabled={busy} type="button">
                              <X size={14} /> Mégse
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm text-white">{t.name}</p>
                            {!t.is_active && <p className="mt-1 text-xs text-white/58">Inaktív</p>}
                          </div>
                          {deleteLocationTypeTarget?.id === t.id ? (
                            <div className="flex flex-wrap gap-2">
                              <button className={neutralBtn} onClick={() => setDeleteLocationTypeTarget(null)} disabled={busy} type="button">
                                <X size={14} /> Mégse
                              </button>
                              <button className={dangerBtn} onClick={confirmDeleteLocationType} disabled={busy} type="button">
                                <Trash2 size={14} /> Törlés
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              <button className={neutralBtn} onClick={() => startEditLocationType(t)} disabled={busy} type="button">
                                <Edit3 size={14} /> Módosítás
                              </button>
                              {t.is_active ? (
                                <button className={dangerBtn} onClick={() => { cancelEditLocationType(); setDeleteLocationTypeTarget(t); }} disabled={busy} type="button">
                                  <Trash2 size={14} /> Törlés
                                </button>
                              ) : (
                                <button className={primaryBtn} onClick={() => activateLocationType(t)} disabled={busy} type="button">
                                  <CheckCircle size={14} /> Aktiválás
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!locationTypes.length && <p className="rounded-lg border border-white/10 bg-[#354153] px-3 py-3 text-sm text-white/70">Nincs cél hely típus.</p>}
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {locations.map((l) => {
                const isEditing = editingLocationId === l.id;
                return (
                  <div key={l.id} className="rounded-xl border border-white/12 bg-[#354153] p-3">
                    {isEditing ? (
                      <div className="grid gap-3 lg:grid-cols-[1fr_180px_auto] lg:items-end">
                        <label className={label}>
                          Név
                          <input
                            className={`${input} w-full`}
                            value={editLocationName}
                            onChange={(e) => setEditLocationName(e.target.value)}
                            placeholder="Cél hely neve"
                          />
                        </label>
                        <label className={label}>
                          Típus
                          <select
                            className={`${selectInput} w-full`}
                            value={editLocationType}
                            onChange={(e) => setEditLocationType(e.target.value as LocationType)}
                          >
                            {locationTypeOptions.map((t) => (
                              <option style={optionStyle} key={t.id} value={t.code}>{t.name}</option>
                            ))}
                          </select>
                        </label>
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <button className={primaryBtn} onClick={saveLocationEdit} disabled={busy} type="button">
                            <Save size={14} /> Mentés
                          </button>
                          <button className={neutralBtn} onClick={cancelEditLocation} disabled={busy} type="button">
                            <X size={14} /> Mégse
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm text-white">{l.name}</p>
                          <p className="mt-1 text-xs text-white/60">{typeLabel(l.location_type)}</p>
                        </div>
                        {deleteLocationTarget?.id === l.id ? (
                          <div className="flex flex-wrap gap-2">
                            <button className={neutralBtn} onClick={() => setDeleteLocationTarget(null)} disabled={busy} type="button">
                              <X size={14} /> Mégse
                            </button>
                            <button className={dangerBtn} onClick={confirmDeleteLocation} disabled={busy} type="button">
                              <Trash2 size={14} /> Törlés
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button className={neutralBtn} onClick={() => startEditLocation(l)} disabled={busy} type="button">
                              <Edit3 size={14} /> Módosítás
                            </button>
                            <button className={dangerBtn} onClick={() => { cancelEditLocation(); setDeleteLocationTarget(l); }} disabled={busy} type="button">
                              <Trash2 size={14} /> Törlés
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!locations.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-4 text-sm text-white/70">Nincs aktív cél hely.</p>}
            </div>
          </div>
        </div>
      )}

      {currencyModalOpen && (
        <div className={modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="currencies-title">
          <div className={modalCard}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="currencies-title" className="text-lg font-normal">Pénznemek kezelése</p>
                <p className="mt-1 text-sm text-white/70">A receptió és import árfolyamaihoz használt pénznemek.</p>
              </div>
              <button className={neutralBtn} onClick={() => setCurrencyModalOpen(false)} type="button">
                <X size={14} /> Bezárás
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/14 bg-[#435064] p-3">
              <div className="grid gap-3 sm:grid-cols-[110px_1fr_120px_auto] sm:items-end">
                <label className={label}>
                  Kód
                  <input className={`${input} w-full uppercase`} value={newCurrencyCode} onChange={(e) => setNewCurrencyCode(e.target.value.toUpperCase())} placeholder="EUR" maxLength={8} />
                </label>
                <label className={label}>
                  Név
                  <input className={`${input} w-full`} value={newCurrencyName} onChange={(e) => setNewCurrencyName(e.target.value)} placeholder="Euro" />
                </label>
                <label className={label}>
                  Jel
                  <input className={`${input} w-full`} value={newCurrencySymbol} onChange={(e) => setNewCurrencySymbol(e.target.value)} placeholder="€" />
                </label>
                <button className={primaryBtn} onClick={createCurrency} disabled={busy} type="button">
                  <Save size={14} /> Mentés
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {currencies.map((c) => {
                const isEditing = editingCurrencyCode === c.code;
                return (
                  <div key={c.code} className="rounded-xl border border-white/12 bg-[#354153] p-3">
                    {isEditing ? (
                      <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                        <label className={label}>
                          Név
                          <input className={`${input} w-full`} value={editCurrencyName} onChange={(e) => setEditCurrencyName(e.target.value)} />
                        </label>
                        <label className={label}>
                          Jel
                          <input className={`${input} w-full`} value={editCurrencySymbol} onChange={(e) => setEditCurrencySymbol(e.target.value)} />
                        </label>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <button className={primaryBtn} onClick={saveCurrencyEdit} disabled={busy} type="button"><Save size={14} /> Mentés</button>
                          <button className={neutralBtn} onClick={cancelEditCurrency} disabled={busy} type="button"><X size={14} /> Mégse</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm text-white">{c.code} • {c.name}{c.symbol ? ` • ${c.symbol}` : ""}</p>
                          {!c.is_active && <p className="mt-1 text-xs text-white/58">Inaktív</p>}
                        </div>
                        {deleteCurrencyTarget?.code === c.code ? (
                          <div className="flex flex-wrap gap-2">
                            <button className={neutralBtn} onClick={() => setDeleteCurrencyTarget(null)} disabled={busy} type="button"><X size={14} /> Mégse</button>
                            <button className={dangerBtn} onClick={confirmDeleteCurrency} disabled={busy} type="button"><Trash2 size={14} /> Törlés</button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button className={neutralBtn} onClick={() => startEditCurrency(c)} disabled={busy} type="button"><Edit3 size={14} /> Módosítás</button>
                            {c.is_active ? (
                              <button className={dangerBtn} onClick={() => { cancelEditCurrency(); setDeleteCurrencyTarget(c); }} disabled={busy || c.code === "RON"} type="button"><Trash2 size={14} /> Törlés</button>
                            ) : (
                              <button className={primaryBtn} onClick={() => activateCurrency(c)} disabled={busy} type="button"><CheckCircle size={14} /> Aktiválás</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!currencies.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-4 text-sm text-white/70">Nincs pénznem.</p>}
            </div>
          </div>
        </div>
      )}

      <div className={wrap}>
        <header className={topCard}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/82">AllInFashion</p>
              <h1 className="mt-1 text-2xl font-normal tracking-tight text-white sm:text-3xl">Áru bevételezés</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-white/78">Beszállító kiválasztás, XLS előnézet és AIF import.</p>
            </div>
            <button className={neutralBtn} onClick={goHome} type="button">
              <ArrowLeft size={15} /> Vissza
            </button>
          </div>
        </header>

        {message && <div className="rounded-xl border border-emerald-200/30 bg-emerald-400/12 px-3 py-2 text-sm text-white/92">{message}</div>}

        <section className={card}>
          <SectionTitle
            icon={<FileSpreadsheet size={16} />}
            title="Munkafolyamat"
            right={<span className="text-xs text-white/60">Új bevételezés vagy meglévő receptió folytatása</span>}
          />
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_2fr_auto] lg:items-end">
            <div className="rounded-xl border border-white/12 bg-[#354153] px-3 py-2">
              <p className="text-xs uppercase tracking-[0.08em] text-white/58">Aktuális mód</p>
              <p className="mt-1 text-sm text-white">{selectedReceptionId ? "Meglévő receptió folytatása" : "Új üres bevételezés"}</p>
              {selectedReceptionSummary && (
                <p className="mt-1 text-xs text-white/62">
                  {selectedReceptionSummary.invoice_number || "Számlaszám nélkül"} • {receptionStatusLabel(selectedReceptionSummary.status)} • {moneyText(toNumber(selectedReceptionSummary.invoice_gross), selectedReceptionSummary.currency_code || "")}
                </p>
              )}
            </div>
            <label className={label}>
              Receptió kiválasztása listából
              <select className={`${selectInput} w-full`} value={receptionPickerId} onChange={(e) => setReceptionPickerId(e.target.value)}>
                <option style={mutedOptionStyle} value="">Válassz meglévő receptiót</option>
                {receptions.map((r) => (
                  <option style={optionStyle} key={r.id} value={r.id}>
                    {r.invoice_number || "Számlaszám nélkül"} • {r.supplier_name || "-"} • {receptionStatusLabel(r.status)} • {moneyText(toNumber(r.invoice_gross), r.currency_code || "")}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button className={primaryBtn} onClick={() => loadReceptionIntoWorkspace()} disabled={busy || !receptionPickerId} type="button">
                <Edit3 size={14} /> Betöltés / folytatás
              </button>
              <button className={neutralBtn} onClick={startNewEmptyReception} disabled={busy} type="button">
                <Plus size={14} /> Új üres
              </button>
            </div>
          </div>
        </section>

        {renderReceptionHeaderEditor()}

        <section className={card}>
          <SectionTitle icon={<FileSpreadsheet size={16} />} title="XLS import és sormentés" right={<span className="text-xs text-white/60">Fájl, kijelölés, mentés</span>} />

          <div className="mt-3 rounded-xl border border-white/12 bg-[#354153] px-3 py-2 text-sm text-white/72">
            Az XLS vagy kézi sorok mindig a fenti receptió fejadataihoz kerülnek. Beszállítót, cél helyet és számlaadatokat fent módosíts.
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className={fileBtn}>
              <FileSpreadsheet size={15} /> XLS / XLSX kiválasztás
              <input className="hidden" type="file" accept=".xls,.xlsx,.csv" onChange={onFileChange} />
            </label>
            <button className={neutralBtn} onClick={selectCleanRows} disabled={busy || !rows.length} type="button">
              <CheckCircle size={14} /> Hibátlan sorok kijelölése
            </button>
            <button className={neutralBtn} onClick={clearApprovedRows} disabled={busy || !rows.length || !approvedCount} type="button">
              <X size={14} /> Kijelölés törlése
            </button>
            <button className={primaryBtn} onClick={saveDraft} disabled={busy || !canSaveApprovedRows} type="button">
              <UploadCloud size={15} /> Kijelölt sorok mentése
            </button>
            <button className={neutralBtn} onClick={reloadAll} disabled={busy} type="button">
              <RefreshCw size={14} /> Frissítés
            </button>
            <button className={neutralBtn} onClick={() => (window.location.hash = "#allinsuppliers")} type="button">
              <Building2 size={14} /> Beszállítók
            </button>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-5">
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Fájl</p>
              <p className="mt-1 truncate text-sm">{fileName || "-"}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Beolvasott sorok</p>
              <p className="mt-1 text-lg font-normal">{rows.length}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Kijelölt sorok</p>
              <p className="mt-1 text-lg font-normal">{approvedCount}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Kizárt sorok</p>
              <p className="mt-1 text-lg font-normal">{excludedCount}</p>
            </div>
            <div className={statCard}>
              <p className="text-xs uppercase tracking-[0.06em] text-white/62">Ellenőrzendő</p>
              <p className="mt-1 text-lg font-normal">{rowProblems}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/14 bg-[#354153] p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.09em] text-white/90">Import besorolás</p>
                <p className="mt-1 text-xs text-white/62">Márka, kategória és nem az AIF törzsadatokból. Ezek az értékek a mentett sorokkal együtt kerülnek tovább.</p>
              </div>
              <button className={tinyBtn} onClick={() => (window.location.hash = "#allinwarehouse")} type="button">Törzsadatok</button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <label className={label}>
                Márka
                <select className={`${selectInput} w-full`} value={defaultBrandCode} onChange={(e) => setDefaultBrandCode(e.target.value)}>
                  <option style={mutedOptionStyle} value="">Nincs alapértelmezett márka</option>
                  {brandOptionsForSupplier.map((b) => (
                    <option style={optionStyle} key={b.id} value={b.code || b.id}>{b.name || b.code}</option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Kategória
                <select className={`${selectInput} w-full`} value={defaultCategoryCode} onChange={(e) => setDefaultCategoryCode(e.target.value)}>
                  <option style={mutedOptionStyle} value="">Nincs alapértelmezett kategória</option>
                  {activeCategories.map((c) => (
                    <option style={optionStyle} key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Nem
                <select className={`${selectInput} w-full`} value={defaultGender} onChange={(e) => setDefaultGender(e.target.value)}>
                  <option style={mutedOptionStyle} value="">Nincs alapértelmezett nem</option>
                  {activeGenderTypes.map((g) => (
                    <option style={optionStyle} key={g.code} value={g.code}>{g.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={neutralBtn} onClick={() => applyImportDefaults("missing")} disabled={busy || !rows.length} type="button">Hiányzó besorolás kitöltése</button>
              <button className={neutralBtn} onClick={() => applyImportDefaults("approved")} disabled={busy || !approvedCount} type="button">Kijelölt sorokra</button>
              <button className={neutralBtn} onClick={() => applyImportDefaults("all")} disabled={busy || !rows.length} type="button">Minden beolvasott sorra</button>
            </div>
            {supplierId && !brandOptionsForSupplier.length ? (
              <p className="mt-2 rounded-lg border border-amber-200/24 bg-amber-400/10 px-3 py-2 text-xs text-amber-50">A kiválasztott beszállítóhoz nincs aktív márka kapcsolat. Előbb a beszállítói márkakapcsolatot kell beállítani.</p>
            ) : null}
          </div>

          {rows.length ? (
            <div className="mt-3 rounded-xl border border-amber-200/24 bg-amber-400/10 px-3 py-2 text-sm text-amber-50">
              A beolvasás csak előnézet. Importként kizárólag a kijelölt és hibátlan sorok menthetők.
            </div>
          ) : null}
        </section>

        <section className={card}>
          <SectionTitle
            icon={<Plus size={16} />}
            title="Manuális terméksor"
            right={
              <button className={tinyBtn} onClick={() => setManualRowsOpen((v) => !v)} type="button">
                {manualRowsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {manualRowsOpen ? "Bezárás" : "Megnyitás"}
              </button>
            }
          />

          {manualRowsOpen && (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-white/14 bg-[#354153] px-3 py-2 text-sm text-white/74">
                Manuális bevételezéshez tölts ki egy terméksort, majd add hozzá az előnézethez. Mentés előtt ugyanúgy ellenőrizhető és kijelölhető, mint az importált sor.
              </div>
              <div className="grid gap-3 lg:grid-cols-4">
                <label className={label}>Termékkód
                  <input className={`${input} w-full`} value={manualProductCode} onChange={(e) => setManualProductCode(e.target.value)} placeholder="pl. UA-123" />
                </label>
                <label className={label}>Terméknév
                  <input className={`${input} w-full`} value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Termék megnevezése" />
                </label>
                <label className={label}>Márka
                  <select className={`${selectInput} w-full`} value={manualBrandCode || defaultBrandCode} onChange={(e) => setManualBrandCode(e.target.value)}>
                    <option style={mutedOptionStyle} value="">Nincs</option>
                    {brandOptionsForSupplier.map((b) => <option style={optionStyle} key={b.id} value={b.code || b.id}>{b.name || b.code}</option>)}
                  </select>
                </label>
                <label className={label}>Kategória
                  <select className={`${selectInput} w-full`} value={manualCategoryCode || defaultCategoryCode} onChange={(e) => setManualCategoryCode(e.target.value)}>
                    <option style={mutedOptionStyle} value="">Nincs</option>
                    {activeCategories.map((c) => <option style={optionStyle} key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 lg:grid-cols-6">
                <label className={label}>Nem
                  <select className={`${selectInput} w-full`} value={manualGender || defaultGender} onChange={(e) => setManualGender(e.target.value)}>
                    <option style={mutedOptionStyle} value="">Nincs</option>
                    {activeGenderTypes.map((g) => <option style={optionStyle} key={g.code} value={g.code}>{g.name}</option>)}
                  </select>
                </label>
                <label className={label}>Szín
                  <input className={`${input} w-full`} value={manualColorName} onChange={(e) => setManualColorName(e.target.value)} placeholder="pl. fekete" />
                </label>
                <label className={label}>Színkód
                  <input className={`${input} w-full`} value={manualColorCode} onChange={(e) => setManualColorCode(e.target.value)} placeholder="pl. 001" />
                </label>
                <label className={label}>Méret
                  <input className={`${input} w-full`} value={manualSize} onChange={(e) => setManualSize(e.target.value)} placeholder="pl. M vagy 42" />
                </label>
                <label className={label}>Darab
                  <input className={`${input} w-full`} value={manualQty} onChange={(e) => setManualQty(e.target.value)} placeholder="pl. 1" />
                </label>
                <label className={label}>Vételár
                  <input className={`${input} w-full`} value={manualBuyPrice} onChange={(e) => setManualBuyPrice(e.target.value)} placeholder="pénznemben" />
                </label>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button className={neutralBtn} onClick={resetManualRowForm} type="button">Mezők törlése</button>
                <button className={primaryBtn} onClick={addManualRow} type="button"><Plus size={14} /> Sor hozzáadása</button>
              </div>
            </div>
          )}
        </section>

        {!selectedReceptionId && (
        <section className={card}>
          <SectionTitle
            icon={<FileSpreadsheet size={16} />}
            title="Receptió gyorslista"
            right={
              <div className="flex items-center gap-2">
                <button className={tinyBtn} onClick={() => (window.location.hash = "#allinreceptions")} type="button">Összes receptió</button>
                <button className={tinyBtn} onClick={() => setReceptionListOpen((v) => !v)} type="button">
                  {receptionListOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {receptionListOpen ? "Bezárás" : "Megnyitás"}
                </button>
              </div>
            }
          />
          {receptionListOpen && (
            <div className="mt-3 grid gap-2">
              {receptions.map((r) => (
                <div key={r.id} className={`rounded-xl border px-3 py-2 ${String(r.id) === String(selectedReceptionId) ? "border-emerald-200/35 bg-emerald-400/12" : "border-white/12 bg-[#354153]"}`}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-white">{r.invoice_number || "Számlaszám nélkül"}</p>
                      <p className="mt-1 text-xs text-white/62">{r.supplier_name || "-"} • {r.location_name || "-"} • {r.currency_code || "-"}</p>
                    </div>
                    <div className="grid gap-2 text-xs md:grid-cols-3 md:min-w-[360px]">
                      <div className="rounded-lg bg-[#303b4e] px-2 py-1.5"><span className="text-white/55">Terméksor</span><p className="text-white">{r.line_count || 0}</p></div>
                      <div className="rounded-lg bg-[#303b4e] px-2 py-1.5"><span className="text-white/55">Érték</span><p className="text-white">{moneyText(toNumber(r.invoice_gross), r.currency_code || "")}</p></div>
                      <div className="rounded-lg bg-[#303b4e] px-2 py-1.5"><span className="text-white/55">Állapot</span><p className="text-white">{receptionStatusLabel(r.status)}</p></div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button className={tinyBtn} onClick={() => loadReceptionIntoWorkspace(r.id)} disabled={busy} type="button"><Edit3 size={13} /> Betöltés</button>
                      <button className={tinyBtn} onClick={() => (window.location.hash = "#allinreceptions")} type="button"><Download size={13} /> Részletek</button>
                    </div>
                  </div>
                </div>
              ))}
              {!receptions.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-4 text-sm text-white/70">Még nincs receptió.</p>}
            </div>
          )}
        </section>

        )}

        <section className={card}>
          <SectionTitle
            icon={<AlertTriangle size={16} />}
            title="Import ellenőrzés"
            right={
              <button className={tinyBtn} onClick={() => setWorkbenchOpen((v) => !v)} type="button">
                {workbenchOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {workbenchOpen ? "Bezárás" : "Megnyitás"}
              </button>
            }
          />

          {workbenchOpen && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 md:grid-cols-4">
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Munkalap</p>
                  <p className="mt-1 truncate text-sm">{workbench?.sheetName || "-"}</p>
                </div>
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Fejléc sora</p>
                  <p className="mt-1 text-lg font-normal">{workbench?.headerRow || "-"}</p>
                </div>
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Felismerés</p>
                  <p className={`mt-1 text-lg font-normal ${confidenceClass(workbench?.overallConfidence || 0)}`}>{workbench?.overallConfidence ?? 0}%</p>
                </div>
                <div className={statCard}>
                  <p className="text-xs uppercase tracking-[0.06em] text-white/62">Ellenőrzések</p>
                  <p className="mt-1 text-lg font-normal">{columnWarnings + rowProblems}</p>
                </div>
              </div>

              {workbench?.warnings?.length ? (
                <div className="rounded-xl border border-amber-200/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-50">
                  {workbench.warnings.map((w, i) => (
                    <p key={`${w}-${i}`}>{w}</p>
                  ))}
                </div>
              ) : null}

              <div className="overflow-auto rounded-xl border border-white/14">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#303b4e] text-xs uppercase tracking-[0.07em] text-white/76">
                    <tr>
                      <th className="px-3 py-2 font-normal">Excel oszlop</th>
                      <th className="px-3 py-2 font-normal">Felismert mező</th>
                      <th className="px-3 py-2 font-normal">Biztonság</th>
                      <th className="px-3 py-2 font-normal">Minták</th>
                      <th className="px-3 py-2 font-normal">Megjegyzés</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {(workbench?.columns || []).map((c) => {
                      const isIgnored = c.field === "ignore";
                      return (
                      <tr
                        key={`${c.index}-${c.header}`}
                        className={isIgnored ? "bg-red-500/16 hover:bg-red-500/22 ring-1 ring-inset ring-red-300/20" : "bg-[#445064] hover:bg-[#4b596f]"}
                      >
                        <td className="px-3 py-2.5 text-white/90">{c.header}</td>
                        <td className="px-3 py-2.5">
                          <select className={`${selectInput} h-8 w-[190px]`} value={c.field} onChange={(e) => updateColumnField(c.index, e.target.value as AifColumnField)}>
                            {AIF_COLUMN_FIELD_OPTIONS.map((opt) => (
                              <option style={optionStyle} key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          {c.field === "ignore" && <div className="mt-1 inline-flex rounded-full border border-red-300/30 bg-red-500/16 px-2 py-0.5 text-[10px] text-red-50">Kihagyott oszlop</div>}
                        </td>
                        <td className={`px-3 py-2.5 ${confidenceClass(c.confidence)}`}>{confidenceText(c.confidence)} • {c.confidence}%</td>
                        <td className="px-3 py-2.5 text-white/70">{c.samples.length ? c.samples.join(" | ") : "-"}</td>
                        <td className="px-3 py-2.5 text-white/70">{c.warnings.length ? c.warnings.join(" ") : "-"}</td>
                      </tr>
                      );
                    })}
                    {!workbench?.columns?.length && (
                      <tr>
                        <td className="px-3 py-6 text-center text-white/60" colSpan={5}>Nincs beolvasott oszlop.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {rows.length > 0 && (
        <section className={card}>
          <SectionTitle
            icon={<FileSpreadsheet size={16} />}
            title="Soronkénti előnézet"
            right={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs text-white/60">Kompakt, oldalirányú görgetés nélkül</span>
                {approvedCount > 0 && (
                  <button
                    className={compactPrimaryBtn}
                    onClick={saveDraft}
                    disabled={busy || !canSaveApprovedRows}
                    title={!canSaveApprovedRows ? "A mentéshez legyen kitöltve a receptió és ne legyen hibás kijelölt sor." : "Kijelölt sorok mentése"}
                    type="button"
                  >
                    <UploadCloud size={13} /> Kijelölt sorok mentése
                  </button>
                )}
              </div>
            }
          />
          <div className="mt-3 overflow-hidden rounded-xl border border-white/14">
            <div className="hidden grid-cols-[70px_minmax(210px,1.25fr)_minmax(250px,1.35fr)_minmax(220px,1fr)_minmax(135px,0.65fr)] gap-2 bg-[#303b4e] px-2 py-2 text-[10px] uppercase tracking-[0.07em] text-white/62 lg:grid">
              <div>Import</div>
              <div>Termék</div>
              <div>Besorolás</div>
              <div>Variáns</div>
              <div className="text-right">Darab / ár</div>
            </div>
            <div className="divide-y divide-white/10">
              {preview.map((r, idx) => {
                const globalIndex = idx;
                const n = r.normalized || {};
                const errors = aifRowErrors(r);
                const key = rowKey(r, globalIndex);
                const approved = Boolean(approvedRows[key]);
                const rowState = errors.length ? "Ellenőrizni" : "Rendben";
                const categoryValue = categoryValueForRow(r);
                const categoryHint = importedCategoryHint(r);
                const colorMissingHint = brandColorMissingHint(r);
                return (
                  <div
                    key={`${r.rowNo || idx}-${idx}`}
                    className={errors.length ? "bg-red-500/10 px-2 py-2 hover:bg-red-500/15" : approved ? "bg-[#208d8b]/18 px-2 py-2 ring-1 ring-inset ring-[#67d4d1]/25 hover:bg-[#208d8b]/24" : "bg-[#445064] px-2 py-2 hover:bg-[#4b596f]"}
                  >
                    <div className="grid gap-2 lg:grid-cols-[70px_minmax(210px,1.25fr)_minmax(250px,1.35fr)_minmax(220px,1fr)_minmax(135px,0.65fr)] lg:items-start">
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/10 px-2 py-1.5 lg:block lg:bg-transparent lg:border-0 lg:px-0 lg:py-0">
                        <div className="flex items-center gap-2">
                          <input className="h-4 w-4 accent-[#208d8b]" type="checkbox" checked={approved} onChange={(e) => toggleApprovedRow(globalIndex, e.target.checked)} aria-label="Sor kijelölése importhoz" />
                          <span className="text-[11px] text-white/55">#{r.rowNo || idx + 1}</span>
                        </div>
                        <div className={errors.length ? "text-[10px] text-amber-100" : "text-[10px] text-emerald-100"}>{rowState}</div>
                      </div>

                      <div className="grid gap-1.5">
                        <div className="grid grid-cols-[0.45fr,1fr] gap-1.5">
                          <label className="grid gap-1">
                            <span className={compactFieldLabel}>Kód</span>
                            <input className={`${compactInput} w-full`} value={valueString(n.supplierProductCode || n.modelCode)} onChange={(e) => updateRowField(globalIndex, "supplierProductCode", e.target.value)} />
                          </label>
                          <label className="grid gap-1">
                            <span className={compactFieldLabel}>Név</span>
                            <input className={`${compactInput} w-full`} value={valueString(n.titleRo)} onChange={(e) => updateRowField(globalIndex, "titleRo", e.target.value)} />
                          </label>
                        </div>
                        {errors.length ? <p className="rounded-md border border-amber-200/20 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-50">{errors.join(" ")}</p> : null}
                      </div>

                      <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-[1fr,1.15fr,0.8fr]">
                        <label className="grid gap-1">
                          <span className={compactFieldLabel}>Márka</span>
                          <select className={`${compactSelect} w-full`} value={brandValueForRow(n)} onChange={(e) => updateRowField(globalIndex, "brandCode", e.target.value)}>
                            <option style={mutedOptionStyle} value="">Nincs</option>
                            {brandOptionsForSupplier.map((b) => <option style={optionStyle} key={b.id} value={b.code || b.id}>{b.name || b.code}</option>)}
                          </select>
                        </label>
                        <label className="grid gap-1">
                          <span className={compactFieldLabel}>Kategória</span>
                          <select className={`${compactSelect} w-full`} value={categoryValue} onChange={(e) => updateRowField(globalIndex, "categoryCode", e.target.value)}>
                            <option style={mutedOptionStyle} value="">Nincs</option>
                            {activeCategories.map((c) => <option style={optionStyle} key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}
                          </select>
                          {categoryHint && !categoryValue ? <span className="text-[9px] text-amber-100">XLS: {categoryHint}</span> : null}
                        </label>
                        <label className="grid gap-1">
                          <span className={compactFieldLabel}>Nem</span>
                          <select className={`${compactSelect} w-full`} value={valueString(n.gender)} onChange={(e) => updateRowField(globalIndex, "gender", e.target.value)}>
                            <option style={mutedOptionStyle} value="">Nincs</option>
                            {activeGenderTypes.map((g) => <option style={optionStyle} key={g.code} value={g.code}>{g.name}</option>)}
                          </select>
                        </label>
                      </div>

                      <div className="grid grid-cols-[1fr,0.65fr,0.55fr] gap-1.5">
                        <label className="grid gap-1">
                          <span className={compactFieldLabel}>Szín</span>
                          <input className={`${compactInput} w-full`} value={valueString(n.colorName)} onChange={(e) => updateRowField(globalIndex, "colorName", e.target.value)} />
                        </label>
                        <label className="grid gap-1">
                          <span className={`${compactFieldLabel} inline-flex items-center gap-1`}>
                            Színkód
                            {colorMissingHint ? (
                              <span className="group relative inline-flex">
                                <span
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-yellow-300 text-[11px] leading-none text-black shadow-sm ring-1 ring-yellow-100/70"
                                  title={`Nincs mapping: ${colorMissingHint}`}
                                >
                                  !
                                </span>
                                <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 hidden w-max max-w-[240px] -translate-x-1/2 rounded-md border border-yellow-200/70 bg-slate-950 px-2 py-1 text-[10px] normal-case leading-snug tracking-normal text-yellow-50 shadow-xl group-hover:block">
                                  Nincs mapping: {colorMissingHint}
                                </span>
                              </span>
                            ) : null}
                          </span>
                          <input className={`${compactInput} w-full`} value={valueString(n.colorCode)} onChange={(e) => updateRowField(globalIndex, "colorCode", e.target.value)} />
                        </label>
                        <label className="grid gap-1">
                          <span className={compactFieldLabel}>Méret</span>
                          <input className={`${compactInput} w-full`} value={valueString(n.size)} onChange={(e) => updateRowField(globalIndex, "size", e.target.value)} />
                        </label>
                      </div>

                      <div className="grid grid-cols-[0.75fr,1fr] gap-1.5 lg:grid-cols-1">
                        <div className="grid grid-cols-2 gap-1.5">
                          <label className="grid gap-1">
                            <span className={compactFieldLabel}>Darab</span>
                            <input className={`${compactInput} w-full text-right`} value={valueString(n.qty)} onChange={(e) => updateRowField(globalIndex, "qty", e.target.value)} />
                          </label>
                          <label className="grid gap-1">
                            <span className={compactFieldLabel}>Vételár</span>
                            <input className={`${compactInput} w-full text-right`} value={valueString(n.buyPrice)} onChange={(e) => updateRowField(globalIndex, "buyPrice", e.target.value)} />
                          </label>
                        </div>
                        <div className="grid gap-1.5">
                          <div className={approved ? "rounded-md border border-[#67d4d1]/35 bg-[#208d8b]/18 px-2 py-1 text-center text-[10px] text-white" : "rounded-md border border-white/10 bg-black/10 px-2 py-1 text-center text-[10px] text-white/50"}>
                            {approved ? "Mentésre kijelölve" : "Kizárva"}
                          </div>
                          {approved && (
                            <button
                              className={compactPrimaryBtn}
                              onClick={saveDraft}
                              disabled={busy || !canSaveApprovedRows}
                              title={!canSaveApprovedRows ? "A mentéshez legyen kitöltve a receptió és ne legyen hibás kijelölt sor." : "Kijelölt sorok mentése"}
                              type="button"
                            >
                              <UploadCloud size={13} /> Mentés most
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!preview.length && (
                <div className="px-3 py-8 text-center text-white/60">Nincs beolvasott sor.</div>
              )}
            </div>
          </div>
          {rows.length > preview.length && (
            <div className="mt-3 flex justify-end">
              <button className={neutralBtn} onClick={() => setPreviewLimit((n) => Math.min(n + 25, rows.length))} type="button">
                További sorok
              </button>
            </div>
          )}
        </section>
        )}

        <section className={card}>
          <SectionTitle icon={<CheckCircle size={16} />} title="Import előzmények" right={<span className="text-xs text-white/60">Legutóbbi bevételezések</span>} />
          <div className="mt-3 grid gap-2">
            {batches.map((b) => (
              <div key={b.id} className="flex flex-col gap-3 rounded-xl border border-white/12 bg-[#354153] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-white">{b.supplier_name} • {b.source_file_name || "import"}</p>
                  <p className="mt-1 text-xs text-white/60">
                    {new Date(b.created_at).toLocaleString()} • {b.location_name || "-"} • terméksor: {b.row_count || 0} • ellenőrzendő: {b.error_count || 0} • {b.status}
                  </p>
                </div>
                <button
                  className={primaryBtn}
                  disabled={busy || b.status === "committed" || Number(b.row_count || 0) <= 0 || Number(b.error_count || 0) > 0}
                  onClick={() => commitBatch(b)}
                  title={Number(b.row_count || 0) <= 0 ? "Nincs mentett terméksor ehhez az importhoz." : Number(b.error_count || 0) > 0 ? "Az importban ellenőrzendő vagy hibás sor van." : ""}
                  type="button"
                >
                  <CheckCircle size={14} /> Készletre vétel
                </button>
              </div>
            ))}
            {!batches.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-4 text-sm text-white/70">Még nincs import előzmény.</p>}
          </div>
        </section>
        {renderLoadedReceptionContent()}
      </div>
    </main>
  );
}
