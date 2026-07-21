import React, { useEffect, useMemo, useState } from "react";
import {
  Home,
  CalendarDays,
  CheckCircle,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Save,
  Search,
  MoveRight,
  Trash2,
  X,
} from "lucide-react";
import {
  AifMeta,
  AifReceptionDetail,
  AifReceptionSummary,
  apiAifCommitReceptionRows,
  apiAifDeleteReception,
  apiAifGetReception,
  apiAifIgnoreImportRow,
  apiAifListReceptions,
  apiAifMeta,
  apiAifMoveImportRow,
  apiAifUpdateReception,
  apiAifUpdateImportRow,
  apiAifReceptionExportCsvUrl,
} from "../lib/aif/api";

type Props = { onLogout?: () => void };

type SalesTvaSettings = {
  salesTvaRate?: number | string | null;
  sellPriceCurrency?: string | null;
  sellPriceIncludesTva?: boolean | string | null;
  salesPriceIncludesTva?: boolean | string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  updatedBy?: string | null;
  updated_by?: string | null;
};

const DEFAULT_SALES_TVA_SETTINGS: SalesTvaSettings = {
  salesTvaRate: 21,
  sellPriceCurrency: "RON",
  sellPriceIncludesTva: true,
  salesPriceIncludesTva: true,
  updatedAt: null,
  updatedBy: null,
};

const OPEN_RECEPTION_HANDOFF_KEY = "allinfashion:reception-open:v1";
const OPEN_ORDER_HANDOFF_KEY = "allinfashion:purchase-order-open:v1";

async function fetchAifJsonLocal<T>(path: string, init?: RequestInit): Promise<T> {
  const requestHeaders = new Headers(init?.headers || {});
  if (!requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
  const res = await fetch(`/api/aif${path}`, {
    ...init,
    credentials: "include",
    headers: requestHeaders,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${res.status} ${res.statusText}`;
    throw new Error(String(msg));
  }
  return data as T;
}

function boolSetting(value: unknown, fallback = true) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string") return !["false", "0", "no", "nem"].includes(value.toLowerCase());
  return Boolean(value);
}

function normalizeSalesTvaSettings(input?: any): SalesTvaSettings {
  const source = input?.settings || input?.item || input || {};
  const rate = Number(String(source.salesTvaRate ?? source.sales_tva_rate ?? source.tvaRate ?? source.tva_rate ?? DEFAULT_SALES_TVA_SETTINGS.salesTvaRate).replace(",", "."));
  const includes = boolSetting(source.salesPriceIncludesTva ?? source.sellPriceIncludesTva ?? source.sell_price_includes_tva, true);
  return {
    salesTvaRate: Number.isFinite(rate) ? Math.max(0, Math.min(99, rate)) : DEFAULT_SALES_TVA_SETTINGS.salesTvaRate,
    sellPriceCurrency: String(source.sellPriceCurrency || source.sell_price_currency || DEFAULT_SALES_TVA_SETTINGS.sellPriceCurrency || "RON").toUpperCase() || "RON",
    sellPriceIncludesTva: includes,
    salesPriceIncludesTva: includes,
    updatedAt: source.updatedAt || source.updated_at || null,
    updatedBy: source.updatedBy || source.updated_by || null,
  };
}

async function apiAifGetSalesTvaSettingsLocal() {
  try {
    return await fetchAifJsonLocal<{ ok: true; item?: SalesTvaSettings; settings?: SalesTvaSettings }>("/settings/sales-tva");
  } catch {
    return fetchAifJsonLocal<{ ok: true; item?: SalesTvaSettings; settings?: SalesTvaSettings }>("/settings/incoming-sales-tva");
  }
}

async function apiAifSaveSalesTvaSettingsLocal(settings: Partial<SalesTvaSettings>) {
  try {
    return await fetchAifJsonLocal<{ ok: true; item?: SalesTvaSettings; settings?: SalesTvaSettings }>("/settings/sales-tva", {
      method: "PATCH",
      body: JSON.stringify({ settings }),
    });
  } catch {
    return fetchAifJsonLocal<{ ok: true; item?: SalesTvaSettings; settings?: SalesTvaSettings }>("/settings/incoming-sales-tva", {
      method: "PATCH",
      body: JSON.stringify({ settings }),
    });
  }
}

async function fetchCentralSalesTvaSettings(): Promise<SalesTvaSettings> {
  const data = await apiAifGetSalesTvaSettingsLocal();
  return normalizeSalesTvaSettings(data);
}

function salesTvaRateOf(settings?: SalesTvaSettings | null) {
  return n(settings?.salesTvaRate ?? DEFAULT_SALES_TVA_SETTINGS.salesTvaRate);
}

function salesIncludesTvaOf(settings?: SalesTvaSettings | null) {
  return boolSetting(settings?.salesPriceIncludesTva ?? settings?.sellPriceIncludesTva, true);
}

function salesTvaLabel(settings?: SalesTvaSettings | null) {
  const rate = salesTvaRateOf(settings);
  return `${rate.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}% ${salesIncludesTvaOf(settings) ? "TVA-val" : "TVA nélkül"}`;
}

function salesTvaShort(settings?: SalesTvaSettings | null) {
  const rate = salesTvaRateOf(settings);
  return `${rate.toLocaleString("ro-RO", { maximumFractionDigits: 2 })}%`;
}

function rowSellEnteredPriceRon(row: any, draft: any) {
  const candidates = [
    draft?.sellPriceRon,
    draft?.sell_price_ron,
    draft?.sellPrice,
    row?.sell_price_ron,
    row?.normalized?.sellPriceRon,
    row?.normalized?.sell_price_ron,
    row?.sell_price,
    row?.normalized?.sellPrice,
  ];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || String(candidate).trim() === "") continue;
    return n(candidate);
  }
  return 0;
}

function salesGrossPriceRon(value: unknown, settings?: SalesTvaSettings | null) {
  const entered = n(value);
  if (entered <= 0) return entered;
  if (salesIncludesTvaOf(settings)) return entered;
  return entered * (1 + salesTvaRateOf(settings) / 100);
}

function salesNetPriceRon(value: unknown, settings?: SalesTvaSettings | null) {
  const entered = n(value);
  if (entered <= 0) return entered;
  if (!salesIncludesTvaOf(settings)) return entered;
  const factor = 1 + salesTvaRateOf(settings) / 100;
  return factor > 0 ? entered / factor : entered;
}

function rowSellGrossPriceRon(row: any, draft: any, settings?: SalesTvaSettings | null) {
  return salesGrossPriceRon(rowSellEnteredPriceRon(row, draft), settings);
}

function rowSellValueRon(row: any, draft: any, settings?: SalesTvaSettings | null) {
  const qty = n(draft?.qty ?? row?.qty ?? row?.normalized?.qty);
  return qty * rowSellGrossPriceRon(row, draft, settings);
}

const page = "min-h-screen bg-[#4b5362] px-3 py-3 text-white font-normal sm:px-4 sm:py-4";
const wrap = "mx-auto max-w-7xl space-y-3";
const card = "rounded-2xl border border-white/18 bg-[#4d5869] p-2.5 shadow-lg shadow-slate-950/15 sm:p-3 font-normal";
const headerCard = "sticky top-2 z-50 rounded-2xl border border-white/20 bg-[#303a4c]/95 px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.05] backdrop-blur";
const sectionHeader = "flex w-full items-center justify-between gap-3 rounded-xl border border-white/22 border-l-4 border-l-[#2a8d8b] bg-[#303b4e] px-3 py-2 text-left shadow-sm shadow-slate-950/20 font-normal";
const label = "grid gap-1 text-[11px] uppercase tracking-[0.05em] text-white/86 font-normal";
const input = "h-8 rounded-lg border border-white/24 bg-[#303b4e] px-2.5 text-xs text-white caret-white outline-none transition placeholder:text-white/50 selection:bg-[#2a8d8b]/35 focus:border-[#2a8d8b]/80 focus:ring-1 focus:ring-[#2a8d8b]/30 [color-scheme:dark] font-normal";
const select = `${input} pr-8`;
const btnBase = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/18 bg-[#354153] px-2.5 text-[11px] text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerBtnSoft = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.08] px-2.5 text-[11px] text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const headerPrimaryBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-2.5 text-[11px] text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const primaryBtn = `${btnBase} border-[#2a8d8b]/55 bg-[#2a8d8b] text-white hover:bg-[#319c99]`;
const neutralBtn = `${btnBase} border-white/24 bg-[#354153] text-white hover:bg-[#3e4d63]`;
const dangerBtn = `${btnBase} border-red-300/24 bg-[#c90d22] hover:bg-[#a90c1d]`;
const tinyBtn = "inline-flex h-6 items-center justify-center gap-1 rounded-md border border-white/20 bg-[#354153] px-2 text-[10.5px] text-white transition hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const tinyDangerBtn = "inline-flex h-6 items-center justify-center gap-1 rounded-md border border-red-300/24 bg-[#c90d22] px-2 text-[10.5px] text-white transition hover:bg-[#a90c1d] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const statCard = "rounded-xl border border-white/18 bg-[#354153] px-2.5 py-1.5";
const lightPanel = "rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg shadow-slate-950/10";
const lightLabel = "grid gap-1 text-[11px] uppercase tracking-[0.05em] text-slate-600 font-normal";
const lightInput = "h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 caret-slate-900 outline-none transition placeholder:text-slate-400 selection:bg-[#2a8d8b]/35 focus:border-[#2a8d8b]/80 focus:ring-1 focus:ring-[#2a8d8b]/20 disabled:bg-slate-100 disabled:text-slate-500 font-normal";
const lightSelect = `${lightInput} pr-8`;
const rowLabel = "grid gap-1 text-[10px] uppercase tracking-[0.05em] text-slate-500 font-normal";
const rowInput = "h-8 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-900 caret-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2a8d8b]/80 focus:ring-1 focus:ring-[#2a8d8b]/20 disabled:bg-slate-100 disabled:text-slate-500 font-normal";
const rowRead = "flex h-8 min-w-0 items-center justify-end rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] tabular-nums text-slate-700 font-normal";
const rowStatusPill = "inline-flex h-6 min-w-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[10px] text-slate-600 font-normal";
const rowActionBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40 font-normal";
const rowPrimaryBtn = `${rowActionBtn} border-[#2a8d8b]/45 bg-[#2a8d8b] text-white hover:bg-[#237f7d]`;
const rowNeutralBtn = `${rowActionBtn} border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-100`;
const rowDangerBtn = `${rowActionBtn} border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100`;
const receptionGridHeader = "grid min-w-[1260px] grid-cols-[34px_64px_118px_122px_minmax(170px,1.5fr)_72px_86px_66px_56px_76px_90px_82px_96px_108px] items-center gap-1 border-b border-slate-300 bg-[#e8eef3] px-2 py-2 text-[9px] uppercase tracking-[0.06em] text-slate-600";
const receptionGridRow = "grid min-w-[1260px] grid-cols-[34px_64px_118px_122px_minmax(170px,1.5fr)_72px_86px_66px_56px_76px_90px_82px_96px_108px] items-center gap-1 border-b border-slate-200 px-2 py-1.5 transition-colors";

function n(v: unknown): number {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function money(v: unknown, currency?: string | null): string {
  const x = n(v);
  return `${x.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
}

function dateText(v?: string | null) {
  if (!v) return "-";
  return String(v).slice(0, 10);
}

function dateOnly(v?: string | null) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

function cell(v: unknown) {
  const s = String(v ?? "").trim();
  return s || "-";
}

function statusText(s?: string | null) {
  const v = String(s || "").toLowerCase();
  if (v === "draft") return "Vázlat";
  if (v === "parsed") return "Ellenőrizve";
  if (v === "needs_review") return "Ellenőrzés szükséges";
  if (v === "review") return "Folyamatban";
  if (v === "committed") return "Készletre véve";
  if (v === "ignored") return "Kihagyva";
  if (v === "cancelled") return "Törölve";
  return s || "-";
}

function tvaModeText(s?: string | null) {
  const v = String(s || "").toLowerCase();
  if (v === "without_tva") return "preturi fara TVA";
  if (v === "with_tva") return "preturi cu TVA inclus";
  if (v === "no_tva") return "fara TVA";
  return s || "-";
}

function rowDraftValue(row: any, drafts: Record<string, Record<string, unknown>>) {
  if (!row || row.status === "ignored") return 0;
  const draft = drafts[row.id] || row.normalized || {};
  const qty = n((draft as any).qty ?? row.qty ?? (row.normalized || {}).qty);
  const buyPrice = n((draft as any).buyPrice ?? row.buy_price ?? (row.normalized || {}).buyPrice);
  return qty * buyPrice;
}

function receptionBalance(
  item: any,
  rows: any[],
  drafts: Record<string, Record<string, unknown>>,
  headerDraft?: Record<string, string>,
) {
  const invoiceGross = n(headerDraft?.invoiceGross ?? item?.invoice_gross);
  const shipping = n(headerDraft?.shippingCost ?? item?.shipping_cost);
  const tvaRate = n(headerDraft?.tvaRate ?? item?.tva_rate);
  const tvaMode = String(headerDraft?.tvaMode ?? item?.tva_mode ?? "no_tva");
  const rowsValue = (rows || []).reduce((sum, row) => sum + rowDraftValue(row, drafts), 0);
  const baseTotal = rowsValue + shipping;
  const grossFromNet = rowsValue + rowsValue * (tvaRate / 100) + shipping;
  let tvaValue = 0;
  let calculatedTotal = baseTotal;

  if (tvaMode === "without_tva" && tvaRate > 0) {
    tvaValue = rowsValue * (tvaRate / 100);
    calculatedTotal = grossFromNet;
  } else if (tvaMode === "with_tva" && tvaRate > 0) {
    tvaValue = rowsValue - rowsValue / (1 + tvaRate / 100);
    calculatedTotal = baseTotal;
  }

  const diff = invoiceGross - calculatedTotal;
  const absDiff = Math.abs(diff);
  const isOk = absDiff < 0.01;
  const noVatWouldMatch = Math.abs(invoiceGross - baseTotal) < 0.01;
  const suggestedNoVat = !isOk && tvaMode === "without_tva" && tvaRate > 0 && noVatWouldMatch;
  const isMissing = diff > 0;
  const status = isOk
    ? "Egyezik"
    : suggestedNoVat
      ? "Csak a beszerzési TVA mód hibás"
      : isMissing
        ? "Hiányzik a sorokból"
        : "Túllépés";
  const className = isOk
    ? "border-[#2a8d8b]/55 bg-[#2a8d8b]/10"
    : suggestedNoVat
      ? "border-amber-300/55 bg-amber-500/12 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]"
      : "border-red-300/55 bg-red-500/14 shadow-[0_0_0_1px_rgba(248,113,113,0.18),0_0_24px_rgba(239,68,68,0.24)]";
  const badgeClassName = isOk
    ? "border-[#2a8d8b]/45 bg-[#2a8d8b]/14 text-white"
    : suggestedNoVat
      ? "border-amber-200/45 bg-amber-500/18 text-amber-50"
      : "border-red-200/35 bg-red-500/18 text-red-50 shadow-[0_0_12px_rgba(239,68,68,0.35)]";
  const amountClassName = isOk ? "text-white" : suggestedNoVat ? "text-amber-50" : "text-red-100";
  const labelClassName = isOk ? "text-white/72" : suggestedNoVat ? "text-amber-50/88" : "text-red-100/88";
  const ledClassName = isOk
    ? "bg-[#2a8d8b] shadow-[0_0_10px_rgba(42,141,139,0.85)]"
    : suggestedNoVat
      ? "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.9)]"
      : "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,1),0_0_24px_rgba(239,68,68,0.8)] animate-pulse";

  return {
    invoiceGross,
    rowsValue,
    shipping,
    tvaRate,
    tvaMode,
    tvaValue,
    baseTotal,
    grossFromNet,
    calculatedTotal,
    diff,
    absDiff,
    status,
    isOk,
    isMissing,
    suggestedNoVat,
    className,
    badgeClassName,
    amountClassName,
    labelClassName,
    ledClassName,
  };
}

function SectionTitle(props: { title: string; icon?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className={sectionHeader}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.11em] text-white/94">
        {props.icon}
        <span>{props.title}</span>
      </div>
      {props.right}
    </div>
  );
}

function exportCsv(id: string) {
  window.open(apiAifReceptionExportCsvUrl(id), "_blank", "noopener,noreferrer");
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
  const x = n(v);
  return x.toLocaleString("ro-RO", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pdfDate(v?: string | null) {
  const s = dateOnly(v);
  return s || "-";
}

function rowDraft(row: any, drafts: Record<string, Record<string, unknown>>) {
  return { ...(row?.normalized || {}), ...(drafts[row?.id] || {}) } as any;
}

function rowSku(row: any, draft: any) {
  return cell(row?.supplier_product_code || draft.supplierProductCode || draft.modelCode || row?.supplier_variant_code || draft.supplierVariantCode);
}

function rowSnCod(row: any, draft: any) {
  return cell(
    row?.sn_cod ||
    draft?.snCod ||
    draft?.sn_cod ||
    row?.normalized?.snCod ||
    row?.normalized?.sn_cod
  );
}

function rowTitle(row: any, draft: any) {
  const name = cell(draft.titleRo || draft.productName || row?.supplier_product_code);
  const color = String(draft.colorName || row?.supplier_color_code || "").trim();
  const size = String(draft.size || row?.supplier_size || "").trim();
  const suffix = [color, size].filter(Boolean).join(" / ");
  return suffix ? `${name} - ${suffix}` : name;
}

function buildOfficialReceptionHtml(detail: AifReceptionDetail, drafts: Record<string, Record<string, unknown>> = {}, salesSettings: SalesTvaSettings = DEFAULT_SALES_TVA_SETTINGS) {
  const item: any = detail.item || {};
  const rows = (detail.rows || []).filter((row: any) => row.status !== "ignored");
  const currency = String(item.currency_code || "").toUpperCase() || "RON";
  const rate = n(item.exchange_rate_to_ron) || 1;
  const shipping = n(item.shipping_cost);
  const shippingRon = shipping * rate;
  const salesTva = normalizeSalesTvaSettings(salesSettings);
  const salesTvaText = salesTvaLabel(salesTva);

  const baseLines = rows.map((row: any) => {
    const draft = rowDraft(row, drafts);
    const qty = n(draft.qty ?? row.qty);
    const price = n(draft.buyPrice ?? row.buy_price ?? draft.buyPriceOriginal);
    const priceRon = price * rate;
    const sellPriceRon = rowSellGrossPriceRon(row, draft, salesTva);
    const sellValueRon = qty * sellPriceRon;
    const value = qty * price;
    return { row, draft, qty, price, priceRon, sellPriceRon, sellValueRon, value };
  });

  const totalValue = baseLines.reduce((sum, x) => sum + x.value, 0);
  const lines = baseLines.map((x) => {
    const share = totalValue > 0 ? x.value / totalValue : 0;
    const transportRonTotal = shippingRon * share;
    const transportPerUnitRon = x.qty > 0 ? transportRonTotal / x.qty : 0;
    const costPerUnitRon = x.priceRon + transportPerUnitRon;
    const valueRon = costPerUnitRon * x.qty;
    return { ...x, transportPerUnitRon, costPerUnitRon, valueRon };
  });

  const totalQty = lines.reduce((sum, x) => sum + x.qty, 0);
  const totalRon = lines.reduce((sum, x) => sum + x.valueRon, 0);
  const totalSellRon = lines.reduce((sum, x) => sum + x.sellValueRon, 0);
  const nrIntern = `REC-${String(item.invoice_number || item.id || "").replace(/[^a-zA-Z0-9-]+/g, "").slice(0, 18) || "-"}`;
  const title = `Receptie ${item.invoice_number || nrIntern}`;
  const today = new Date().toLocaleDateString("ro-RO");

  const tableRows = lines.map((x) => `
    <tr>
      <td>${pdfEscape(rowTitle(x.row, x.draft))}</td>
      <td>${pdfEscape(rowSku(x.row, x.draft))}</td>
      <td>${pdfEscape(rowSnCod(x.row, x.draft))}</td>
      <td class="num">${pdfNumber(x.qty, 0)}</td>
      <td class="num">${pdfNumber(x.price)}</td>
      <td class="num">${pdfNumber(x.priceRon)}</td>
      <td class="num">${pdfNumber(x.transportPerUnitRon)}</td>
      <td class="num">${pdfNumber(x.costPerUnitRon)}</td>
      <td class="num">${pdfNumber(x.sellPriceRon)}</td>
      <td class="num">${pdfEscape(salesTvaShort(salesTva))}</td>
      <td class="num">${pdfNumber(x.value)}</td>
      <td class="num">${pdfNumber(x.valueRon)}</td>
      <td class="num">${pdfNumber(x.sellValueRon)}</td>
    </tr>`).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${pdfEscape(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 10px; }
    .doc { width: 100%; }
    .header { display: grid; grid-template-columns: 1.25fr 1fr; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
    .company { font-size: 10px; line-height: 1.45; }
    .company-name { font-size: 15px; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 3px; }
    .title { text-align: right; }
    .title h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: .05em; text-transform: uppercase; }
    .title .nr { font-size: 12px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
    .box { border: 1px solid #9ca3af; border-radius: 4px; padding: 5px 6px; min-height: 34px; }
    .box .label { color: #6b7280; text-transform: uppercase; font-size: 8px; letter-spacing: .05em; margin-bottom: 2px; }
    .box .value { font-size: 10px; }
    .note { border: 1px solid #d1d5db; background: #f9fafb; padding: 6px 8px; margin: 8px 0 10px; line-height: 1.35; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    th { background: #111827; color: #fff; font-weight: 400; text-transform: uppercase; font-size: 8px; letter-spacing: .03em; padding: 5px 4px; border: 1px solid #111827; }
    td { padding: 4px; border: 1px solid #d1d5db; vertical-align: top; font-size: 9px; line-height: 1.25; overflow-wrap: anywhere; }
    .num { text-align: right; white-space: nowrap; }
    .totals td { font-size: 10px; border-top: 2px solid #111827; background: #f3f4f6; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 18px; font-size: 10px; }
    .sig { padding-top: 22px; border-top: 1px solid #111827; }
    .footer { margin-top: 10px; color: #6b7280; font-size: 8px; display: flex; justify-content: space-between; }
    .screen-actions { margin: 0 0 10px; display: flex; gap: 8px; }
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
        <h1>Receptie marfa</h1>
        <div class="nr">Nr. intern: ${pdfEscape(nrIntern)}</div>
        <div>Data: ${pdfEscape(pdfDate(item.reception_date) || today)}</div>
      </div>
    </div>

    <div class="meta">
      <div class="box"><div class="label">Furnizor</div><div class="value">${pdfEscape(item.supplier_name || "-")}</div></div>
      <div class="box"><div class="label">Factura</div><div class="value">${pdfEscape(item.invoice_number || "-")}</div></div>
      <div class="box"><div class="label">Data factura</div><div class="value">${pdfEscape(pdfDate(item.invoice_date))}</div></div>
      <div class="box"><div class="label">Gestiune</div><div class="value">${pdfEscape(item.location_name || "-")}</div></div>
      <div class="box"><div class="label">Deviza factura</div><div class="value">${pdfEscape(currency)}</div></div>
      <div class="box"><div class="label">Curs RON</div><div class="value">${pdfNumber(rate, 4)}</div></div>
      <div class="box"><div class="label">Transport ${pdfEscape(currency)}</div><div class="value">${pdfNumber(shipping)}</div></div>
      <div class="box"><div class="label">Transport RON</div><div class="value">${pdfNumber(shippingRon)}</div></div>
    </div>

    <div class="note">Repartizare transport: proportional dupa valoarea liniei. TVA achizitie: ${pdfEscape(tvaModeText(item.tva_mode))}. Pret vanzare: ${pdfEscape(salesTvaText)}, moneda ${pdfEscape(salesTva.sellPriceCurrency)}. Document generat din AllInFashion.</div>

    <table>
      <colgroup>
        <col style="width: 22%" />
        <col style="width: 8%" />
        <col style="width: 7%" />
        <col style="width: 4%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
        <col style="width: 6%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
        <col style="width: 5%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
        <col style="width: 6%" />
      </colgroup>
      <thead>
        <tr>
          <th>Denumire</th>
          <th>SKU</th>
          <th>S/N/COD</th>
          <th>Cant.</th>
          <th>Pret ${pdfEscape(currency)}</th>
          <th>Pret RON</th>
          <th>Tr/db RON</th>
          <th>Cost/db RON</th>
          <th>Vanzare/db RON</th>
          <th>TVA</th>
          <th>Val ${pdfEscape(currency)}</th>
          <th>Cost RON</th>
          <th>Val. vanzare RON</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || `<tr><td colspan="13" style="text-align:center;padding:18px;">Nu exista linii de receptie.</td></tr>`}
      </tbody>
      <tfoot>
        <tr class="totals">
          <td colspan="3">TOTAL</td>
          <td class="num">${pdfNumber(totalQty, 0)}</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td class="num">${pdfNumber(totalValue)}</td>
          <td class="num">${pdfNumber(totalRon)}</td>
          <td class="num">${pdfNumber(totalSellRon)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="signatures">
      <div class="sig">Responsabil gestiune</div>
      <div class="sig">Semnatura</div>
      <div class="sig">Data</div>
    </div>

    <div class="footer">
      <span>SC TITAN EURO-COM SRL - receptie marfa</span>
      <span>Generat: ${pdfEscape(today)}</span>
    </div>
  </div>
</body>
</html>`;
}

function openOfficialReceptionPdf(detail: AifReceptionDetail, drafts: Record<string, Record<string, unknown>> = {}, salesSettings: SalesTvaSettings = DEFAULT_SALES_TVA_SETTINGS) {
  const fileName = `receptie_${fileSafe((detail.item as any)?.invoice_number || (detail.item as any)?.id)}.pdf`;
  const html = buildOfficialReceptionHtml(detail, drafts, salesSettings).replace(
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

function normPdfKey(v: unknown) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function categoryPdfLabel(value: unknown, categories?: any[]) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const key = normPdfKey(raw);
  const found = (categories || []).find((c) => {
    const aliases = Array.isArray(c.aliases) ? c.aliases : [];
    return [c.id, c.code, c.name_ro, c.name_hu, c.name, ...aliases]
      .filter(Boolean)
      .some((x) => normPdfKey(x) === key);
  });
  return found ? String(found.name_hu || found.name_ro || found.name || found.code || raw) : raw;
}

function genderPdfLabel(value: unknown, genderTypes?: any[]) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const key = normPdfKey(raw);
  const found = (genderTypes || []).find((g) => {
    const aliases = Array.isArray(g.aliases) ? g.aliases : [];
    return [g.code, g.name, ...aliases]
      .filter(Boolean)
      .some((x) => normPdfKey(x) === key);
  });
  return found ? String(found.name || raw) : raw;
}

function checkRowData(row: any, draft: any, categories?: any[], genderTypes?: any[]) {
  const rawCategory = draft.categoryName || draft.categoryCode || row?.normalized?.categoryName || row?.normalized?.categoryCode;
  const rawGender = draft.gender || row?.normalized?.gender;
  return {
    code: rowSku(row, draft),
    snCod: cell(row?.sn_cod || draft.snCod || draft.sn_cod || row?.normalized?.snCod || row?.normalized?.sn_cod),
    title: cell(draft.titleRo || draft.productName || row?.normalized?.titleRo || row?.supplier_product_code),
    brand: cell(draft.brandName || draft.brandCode || row?.normalized?.brandName || row?.normalized?.brandCode),
    category: categoryPdfLabel(rawCategory, categories),
    gender: genderPdfLabel(rawGender, genderTypes),
    color: cell(draft.colorName || row?.normalized?.colorName),
    colorCode: cell(row?.supplier_color_code || draft.colorCode || row?.normalized?.colorCode),
    size: cell(row?.supplier_size || draft.size || row?.normalized?.size),
    qty: n(draft.qty ?? row?.qty ?? row?.normalized?.qty),
    status: statusText(row?.status),
  };
}

function buildReceptionVerificationHtml(
  detail: AifReceptionDetail,
  drafts: Record<string, Record<string, unknown>> = {},
  categories?: any[],
  genderTypes?: any[]
) {
  const item: any = detail.item || {};
  const rows = (detail.rows || []).filter((row: any) => row.status !== "ignored");
  const title = `Fisa verificare marfa ${item.invoice_number || item.id || ""}`;
  const today = new Date().toLocaleDateString("ro-RO");
  const lines = rows.map((row: any, index: number) => {
    const draft = rowDraft(row, drafts);
    const x = checkRowData(row, draft, categories, genderTypes);
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td>${pdfEscape(x.code)}</td>
        <td>${pdfEscape(x.snCod)}</td>
        <td>${pdfEscape(x.title)}</td>
        <td>${pdfEscape(x.brand)}</td>
        <td>${pdfEscape(x.category)}</td>
        <td>${pdfEscape(x.gender)}</td>
        <td>${pdfEscape(x.color)}</td>
        <td>${pdfEscape(x.colorCode)}</td>
        <td>${pdfEscape(x.size)}</td>
        <td class="num">${pdfNumber(x.qty, 0)}</td>
        <td class="write"></td>
        <td class="check"></td>
        <td class="write"></td>
        <td class="write wide"></td>
      </tr>`;
  }).join("");
  const totalQty = rows.reduce((sum: number, row: any) => {
    const draft = rowDraft(row, drafts);
    return sum + n(draft.qty ?? row.qty ?? row.normalized?.qty);
  }, 0);

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
        <col style="width: 7%" />
        <col style="width: 9%" />
        <col style="width: 15%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
        <col style="width: 5%" />
        <col style="width: 7%" />
        <col style="width: 6%" />
        <col style="width: 5%" />
        <col style="width: 6%" />
        <col style="width: 6%" />
        <col style="width: 3%" />
        <col style="width: 7%" />
        <col style="width: 7%" />
      </colgroup>
      <thead>
        <tr>
          <th>Nr.</th>
          <th>Cod produs</th>
          <th>S/N/COD</th>
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
        ${lines || `<tr><td colspan="15" style="text-align:center;padding:18px;">Nu exista linii de verificat.</td></tr>`}
      </tbody>
      <tfoot>
        <tr class="totals"><td colspan="10">TOTAL</td><td class="num">${pdfNumber(totalQty, 0)}</td><td colspan="4"></td></tr>
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

function openReceptionVerificationPdf(
  detail: AifReceptionDetail,
  drafts: Record<string, Record<string, unknown>> = {},
  categories?: any[],
  genderTypes?: any[]
) {
  const fileName = `verificare_marfa_${fileSafe((detail.item as any)?.invoice_number || (detail.item as any)?.id)}.pdf`;
  const html = buildReceptionVerificationHtml(detail, drafts, categories, genderTypes).replace(
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


export default function AllInReceptions(_props: Props) {
  const [meta, setMeta] = useState<AifMeta | null>(null);
  const [items, setItems] = useState<AifReceptionSummary[]>([]);
  const [detail, setDetail] = useState<AifReceptionDetail | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [rowDrafts, setRowDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [receptionDraft, setReceptionDraft] = useState<Record<string, string>>({});
  const [rowStatusFilter, setRowStatusFilter] = useState("all");
  const [moveTarget, setMoveTarget] = useState<any | null>(null);
  const [moveToReceptionId, setMoveToReceptionId] = useState("");
  const [savingHeader, setSavingHeader] = useState(false);
  const [savingRows, setSavingRows] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [committingRows, setCommittingRows] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AifReceptionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("");
  const [location, setLocation] = useState("");
  const [currency, setCurrency] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [salesTvaSettings, setSalesTvaSettings] = useState<SalesTvaSettings>(DEFAULT_SALES_TVA_SETTINGS);
  const [salesTvaModalOpen, setSalesTvaModalOpen] = useState(false);
  const [salesTvaSettingsLoading, setSalesTvaSettingsLoading] = useState(false);
  const [salesTvaSettingsSaving, setSalesTvaSettingsSaving] = useState(false);
  const [salesTvaRate, setSalesTvaRate] = useState(String(DEFAULT_SALES_TVA_SETTINGS.salesTvaRate ?? 21));
  const [salesPriceIncludesTva, setSalesPriceIncludesTva] = useState(true);
  const [salesTvaUpdatedAt, setSalesTvaUpdatedAt] = useState<string | null>(null);
  const [salesTvaUpdatedBy, setSalesTvaUpdatedBy] = useState<string | null>(null);

  function applySalesTvaSettings(settings: SalesTvaSettings) {
    const normalized = normalizeSalesTvaSettings(settings);
    setSalesTvaSettings(normalized);
    setSalesTvaRate(String(normalized.salesTvaRate ?? DEFAULT_SALES_TVA_SETTINGS.salesTvaRate ?? 21));
    setSalesPriceIncludesTva(salesIncludesTvaOf(normalized));
    setSalesTvaUpdatedAt(String(normalized.updatedAt || normalized.updated_at || "") || null);
    setSalesTvaUpdatedBy(String(normalized.updatedBy || normalized.updated_by || "") || null);
  }

  async function loadSalesTvaSettings() {
    setSalesTvaSettingsLoading(true);
    try {
      applySalesTvaSettings(await fetchCentralSalesTvaSettings());
    } catch {
      applySalesTvaSettings(DEFAULT_SALES_TVA_SETTINGS);
    } finally {
      setSalesTvaSettingsLoading(false);
    }
  }

  async function saveSalesTvaSettings() {
    setSalesTvaSettingsSaving(true);
    setMessage("");
    try {
      const saved = await apiAifSaveSalesTvaSettingsLocal({
        salesTvaRate,
        sellPriceIncludesTva: salesPriceIncludesTva,
        salesPriceIncludesTva,
        sellPriceCurrency: "RON",
      });
      applySalesTvaSettings(normalizeSalesTvaSettings(saved.item || saved.settings || saved));
      setSalesTvaModalOpen(false);
      setMessage("Központi eladási TVA beállítás mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A központi eladási TVA beállítás nem menthető.");
    } finally {
      setSalesTvaSettingsSaving(false);
    }
  }

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const [m, r] = await Promise.all([
        apiAifMeta(),
        apiAifListReceptions({ limit: 200, search, supplier, location, currency, status, from, to }),
      ]);
      setMeta(m);
      setItems(r.items || []);
    } catch (e: any) {
      setMessage(e?.message || "A receptiók betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await Promise.all([load(), loadSalesTvaSettings()]);
      let receptionId = "";
      try {
        receptionId = window.sessionStorage.getItem(OPEN_RECEPTION_HANDOFF_KEY) || "";
        if (receptionId) window.sessionStorage.removeItem(OPEN_RECEPTION_HANDOFF_KEY);
      } catch {}
      if (receptionId) await openDetail(receptionId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    return items.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.qty += Number(r.total_qty || 0);
        acc.lines += Number(r.line_count || 0);
        acc.value += n(r.invoice_gross);
        acc.deletable += r.can_delete ? 1 : 0;
        return acc;
      },
      { count: 0, qty: 0, lines: 0, value: 0, deletable: 0 }
    );
  }, [items]);

  const salesTvaText = useMemo(() => salesTvaLabel(salesTvaSettings), [salesTvaSettings]);

  async function openDetail(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const next = await apiAifGetReception(id);
      setDetail(next);
      setReceptionDraft(buildReceptionDraft(next.item));
      setRowDrafts(buildDrafts(next.rows || []));
      setSelectedRows(new Set((next.rows || []).filter(rowCanWork).map((row: any) => row.id)));
    } catch (e: any) {
      setMessage(e?.message || "A receptió részletei nem tölthetők be.");
    } finally {
      setBusy(false);
    }
  }

  function openLinkedPurchaseOrder(orderId?: string | null) {
    const id = String(orderId || "").trim();
    if (!id) return;
    try { window.sessionStorage.setItem(OPEN_ORDER_HANDOFF_KEY, id); } catch {}
    window.location.hash = "#allinorderhistory";
  }

  async function deleteReception() {
    if (!deleteTarget) return;
    setBusy(true);
    setMessage("");
    try {
      await apiAifDeleteReception(deleteTarget.id);
      setDeleteTarget(null);
      if (detail?.item?.id === deleteTarget.id) setDetail(null);
      await load();
      setMessage("Receptió törölve.");
    } catch (e: any) {
      setMessage(e?.message || "A receptió törlése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function exportReceptionPdf(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const data = detail?.item?.id === id ? detail : await apiAifGetReception(id);
      if (!data) throw new Error("A receptió nem tölthető be PDF exporthoz.");
      const drafts = detail?.item?.id === id ? rowDrafts : buildDrafts(data.rows || []);
      openOfficialReceptionPdf(data, drafts, salesTvaSettings);
    } catch (e: any) {
      setMessage(e?.message || "A PDF export nem sikerült.");
    } finally {
      setBusy(false);
    }
  }


  async function exportReceptionVerificationPdf(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const data = detail?.item?.id === id ? detail : await apiAifGetReception(id);
      if (!data) throw new Error("A receptió nem tölthető be ellenőrző PDF exporthoz.");
      const drafts = detail?.item?.id === id ? rowDrafts : buildDrafts(data.rows || []);
      openReceptionVerificationPdf(data, drafts, (meta?.categories || []) as any[], (meta?.genderTypes || []) as any[]);
    } catch (e: any) {
      setMessage(e?.message || "Az ellenőrző PDF export nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function resetFilters() {
    setSearch("");
    setSupplier("");
    setLocation("");
    setCurrency("");
    setStatus("");
    setFrom("");
    setTo("");
    setTimeout(() => load(), 0);
  }

  function rowCanWork(row: any) {
    return row.status !== "committed" && row.status !== "ignored";
  }

  function rowCanEdit(row: any) {
    return row.status !== "ignored";
  }

  function buildDrafts(rows: any[]) {
    const next: Record<string, Record<string, unknown>> = {};
    for (const row of rows || []) {
      const n: any = row.normalized || {};
      next[row.id] = {
        ...n,
        supplierProductCode: row.supplier_product_code || n.supplierProductCode || n.modelCode || "",
        snCod: row.sn_cod || n.snCod || n.sn_cod || "",
        sn_cod: row.sn_cod || n.snCod || n.sn_cod || "",
        titleRo: n.titleRo || "",
        colorName: n.colorName || "",
        colorCode: row.supplier_color_code || n.colorCode || "",
        size: row.supplier_size || n.size || "",
        qty: row.qty ?? n.qty ?? "",
        buyPrice: row.buy_price ?? n.buyPrice ?? "",
        sellPrice: row.sell_price_ron ?? row.sell_price ?? n.sellPriceRon ?? n.sell_price_ron ?? n.sellPrice ?? "",
        sellPriceCurrency: n.sellPriceCurrency || "RON",
        salesTvaRate: n.salesTvaRate ?? DEFAULT_SALES_TVA_SETTINGS.salesTvaRate,
      };
    }
    return next;
  }

  function buildReceptionDraft(item: AifReceptionSummary) {
    return {
      invoiceNumber: String(item.invoice_number || ""),
      invoiceDate: dateText(item.invoice_date) === "-" ? "" : dateText(item.invoice_date),
      receptionDate: dateText(item.reception_date) === "-" ? "" : dateText(item.reception_date),
      currencyCode: String(item.currency_code || ""),
      exchangeRateToRon: String(item.exchange_rate_to_ron || ""),
      tvaMode: String(item.tva_mode || "without_tva"),
      tvaRate: String(item.tva_rate ?? ""),
      shippingCost: String(item.shipping_cost ?? ""),
      invoiceGross: String(item.invoice_gross ?? ""),
      note: String((item as any).note || ""),
    };
  }

  function updateReceptionDraft(key: string, value: string) {
    setReceptionDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "tvaMode" && value === "no_tva") {
        next.tvaRate = "0";
      } else if (key === "tvaMode" && (value === "without_tva" || value === "with_tva") && n(next.tvaRate) <= 0) {
        next.tvaRate = String(n(detail?.item?.tva_rate) || 21);
      }
      return next;
    });
  }

  const visibleRows = useMemo(() => {
    const rows = detail?.rows || [];
    if (rowStatusFilter === "all") return rows;
    if (rowStatusFilter === "committed") return rows.filter((r) => r.status === "committed");
    if (rowStatusFilter === "ignored") return rows.filter((r) => r.status === "ignored");
    if (rowStatusFilter === "error") return rows.filter((r) => r.status === "error" || (r.error_messages || []).length);
    return rows.filter((r) => r.status !== "committed" && r.status !== "ignored");
  }, [detail, rowStatusFilter]);

  const detailBalance = useMemo(() => {
    if (!detail) return null;
    return receptionBalance(detail.item, detail.rows || [], rowDrafts, receptionDraft);
  }, [detail, rowDrafts, receptionDraft]);

  async function applyNoPurchaseVatAndSave() {
    if (!detail) return;
    setSavingHeader(true);
    setMessage("");
    try {
      const nextDraft = { ...receptionDraft, tvaMode: "no_tva", tvaRate: "0" };
      setReceptionDraft(nextDraft);
      await apiAifUpdateReception(detail.item.id, {
        invoiceNumber: nextDraft.invoiceNumber,
        invoiceDate: nextDraft.invoiceDate,
        receptionDate: nextDraft.receptionDate,
        currencyCode: nextDraft.currencyCode,
        exchangeRateToRon: nextDraft.exchangeRateToRon,
        tvaMode: "no_tva",
        tvaRate: 0,
        shippingCost: nextDraft.shippingCost,
        invoiceGross: nextDraft.invoiceGross,
        note: nextDraft.note,
      });
      await reloadDetail(detail.item.id);
      await load();
      setMessage("A beszerzési TVA mód „Nincs TVA” értékre állítva. A számla most a terméksorokkal egyezik.");
    } catch (e: any) {
      setMessage(e?.message || "A beszerzési TVA mód automatikus javítása nem sikerült.");
    } finally {
      setSavingHeader(false);
    }
  }

  async function saveReceptionHeader() {
    if (!detail) return;
    setSavingHeader(true);
    setMessage("");
    try {
      const saved = await apiAifUpdateReception(detail.item.id, {
        invoiceNumber: receptionDraft.invoiceNumber,
        invoiceDate: receptionDraft.invoiceDate,
        receptionDate: receptionDraft.receptionDate,
        currencyCode: receptionDraft.currencyCode,
        exchangeRateToRon: receptionDraft.exchangeRateToRon,
        tvaMode: receptionDraft.tvaMode,
        tvaRate: receptionDraft.tvaMode === "no_tva" ? 0 : receptionDraft.tvaRate,
        shippingCost: receptionDraft.shippingCost,
        invoiceGross: receptionDraft.invoiceGross,
        note: receptionDraft.note,
      });
      if (saved?.item) {
        setDetail((prev) => prev ? { ...prev, item: { ...prev.item, ...saved.item } } : prev);
        setReceptionDraft((prev) => ({
          ...prev,
          invoiceNumber: String(saved.item?.invoice_number ?? prev.invoiceNumber ?? ""),
          invoiceDate: dateOnly(saved.item?.invoice_date) || prev.invoiceDate,
          receptionDate: dateOnly(saved.item?.reception_date) || prev.receptionDate,
          currencyCode: String(saved.item?.currency_code ?? prev.currencyCode ?? ""),
          exchangeRateToRon: String(saved.item?.exchange_rate_to_ron ?? prev.exchangeRateToRon ?? ""),
          tvaMode: String(saved.item?.tva_mode ?? prev.tvaMode ?? ""),
          tvaRate: String(saved.item?.tva_rate ?? prev.tvaRate ?? ""),
          shippingCost: String(saved.item?.shipping_cost ?? prev.shippingCost ?? ""),
          invoiceGross: String(saved.item?.invoice_gross ?? prev.invoiceGross ?? ""),
          note: String(saved.item?.note ?? prev.note ?? ""),
        }));
      }
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Receptió fejadatai mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A receptió fejadatai nem menthetők.");
    } finally {
      setSavingHeader(false);
    }
  }

  async function moveRowToReception() {
    if (!detail || !moveTarget || !moveToReceptionId) return;
    setBusy(true);
    setMessage("");
    try {
      await apiAifMoveImportRow(moveTarget.id, moveToReceptionId);
      setMoveTarget(null);
      setMoveToReceptionId("");
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Terméksor áthelyezve.");
    } catch (e: any) {
      setMessage(e?.message || "A terméksor áthelyezése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function updateRowDraft(rowId: string, key: string, value: unknown) {
    setRowDrafts((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        [key]: value,
      },
    }));
  }

  function updateRowSellPrice(rowId: string, value: string) {
    setRowDrafts((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || {}),
        sellPrice: value,
        sellPriceGrossRon: value,
        sellPriceCurrency: "RON",
        sellPriceIsRon: true,
        sellPriceIncludesTva: salesTvaSettings.sellPriceIncludesTva,
        salesPriceIncludesTva: salesTvaSettings.salesPriceIncludesTva,
        salesTvaRate: salesTvaSettings.salesTvaRate,
        saleTvaRate: salesTvaSettings.salesTvaRate,
      },
    }));
  }

  function rowPayload(row: any) {
    const draft = rowDrafts[row.id] || row.normalized || {};
    const sellPrice = (draft as any).sellPrice ?? (draft as any).sellPriceGrossRon ?? "";
    const parsedRate = Number(String(salesTvaSettings.salesTvaRate || DEFAULT_SALES_TVA_SETTINGS.salesTvaRate || 0).replace(",", "."));
    const rate = Number.isFinite(parsedRate) ? parsedRate : Number(DEFAULT_SALES_TVA_SETTINGS.salesTvaRate || 21);
    return {
      ...draft,
      snCod: (draft as any).snCod ?? (draft as any).sn_cod ?? "",
      sn_cod: (draft as any).snCod ?? (draft as any).sn_cod ?? "",
      sellPrice,
      sellPriceGrossRon: sellPrice,
      sellPriceCurrency: "RON",
      sellPriceIsRon: true,
      sellPriceIncludesTva: salesTvaSettings.sellPriceIncludesTva,
      salesPriceIncludesTva: salesTvaSettings.salesPriceIncludesTva,
      salesTvaRate: rate,
      saleTvaRate: rate,
    };
  }

  function toggleRow(rowId: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function selectReadyRows() {
    if (!detail) return;
    const ids = detail.rows
      .filter((row) => row.status !== "committed" && row.status !== "ignored" && row.status !== "error")
      .map((row) => row.id);
    setSelectedRows(new Set(ids));
  }

  async function reloadDetail(id?: string) {
    const detailId = id || detail?.item?.id;
    if (!detailId) return;
    const next = await apiAifGetReception(detailId);
    setDetail(next);
    setReceptionDraft(buildReceptionDraft(next.item));
    setRowDrafts(buildDrafts(next.rows || []));
    setSelectedRows(new Set((next.rows || []).filter(rowCanWork).map((row: any) => row.id)));
  }

  async function saveRowEdits() {
    if (!detail) return;
    setSavingRows(true);
    setMessage("");
    try {
      const editable = detail.rows.filter((row) => rowCanEdit(row));
      for (const row of editable) {
        await apiAifUpdateImportRow(row.id, rowPayload(row));
      }
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Terméksorok mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A terméksorok mentése nem sikerült.");
    } finally {
      setSavingRows(false);
    }
  }

  async function saveSingleRow(rowId: string) {
    if (!detail) return;
    setSavingRowId(rowId);
    setMessage("");
    try {
      const row = detail.rows.find((x: any) => x.id === rowId);
      if (row) await apiAifUpdateImportRow(rowId, rowPayload(row));
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Terméksor mentve.");
    } catch (e: any) {
      setMessage(e?.message || "A terméksor mentése nem sikerült.");
    } finally {
      setSavingRowId(null);
    }
  }

  async function commitSelectedRows() {
    if (!detail) return;
    const ids = Array.from(selectedRows);
    if (!ids.length) {
      setMessage("Nincs kijelölt készletre vehető terméksor.");
      return;
    }
    setCommittingRows(true);
    setMessage("");
    try {
      await saveRowEdits();
      await apiAifCommitReceptionRows(detail.item.id, ids);
      await reloadDetail(detail.item.id);
      await load();
      setMessage("A kijelölt terméksorok készletre véve.");
    } catch (e: any) {
      setMessage(e?.message || "A kijelölt terméksorok készletre vétele nem sikerült.");
    } finally {
      setCommittingRows(false);
    }
  }

  async function ignoreRow(rowId: string) {
    if (!detail) return;
    setBusy(true);
    setMessage("");
    try {
      await apiAifIgnoreImportRow(rowId);
      await reloadDetail(detail.item.id);
      await load();
      setMessage("Terméksor kihagyva.");
    } catch (e: any) {
      setMessage(e?.message || "A terméksor kihagyása nem sikerült.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className={page}>
      <div className={wrap}>
        <header className={headerCard}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[220px] border-l-4 border-[#2a8d8b]/70 pl-3">
              <p className="text-[11px] uppercase tracking-[0.18em] leading-none text-white/70">AllInFashion</p>
              <h1 className="mt-1 text-xl leading-tight tracking-tight text-white">Receptiók</h1>
              <p className="mt-0.5 text-[11px] leading-snug text-white/52">Számlás bevételezések, export és részletezés.</p>
            </div>
            <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
              <button className={headerBtnSoft} onClick={load} disabled={busy} type="button"><RefreshCw size={15} /> Frissítés</button>
              <button className={headerBtnSoft} onClick={() => setSalesTvaModalOpen(true)} disabled={salesTvaSettingsLoading} type="button">Eladási TVA {salesTvaShort(salesTvaSettings)}</button>
              <button className={headerPrimaryBtn} onClick={() => (window.location.hash = "#allinincoming")} type="button"><FileText size={15} /> Új bevételezés</button>
              <button className={`${headerBtn} ml-2 border-white/30 bg-[#263246] px-3`} onClick={() => (window.location.hash = "#allin")} type="button" title="Kezdőlap"><Home size={15} /> Kezdőlap</button>
            </div>
          </div>
        </header>

        {message && <div className="rounded-xl border border-white/18 bg-[#354153] px-3 py-2 text-sm text-white/86">{message}</div>}

        <section className={card}>
          <SectionTitle icon={<Search size={16} />} title="Szűrés és keresés" />
          <div className="mt-2 grid gap-2 lg:grid-cols-4">
            <label className={`${label} lg:col-span-2`}>
              Keresés
              <input className={input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="számlaszám, beszállító, cél hely" />
            </label>
            <label className={label}>
              Időszak kezdete
              <input className={input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className={label}>
              Időszak vége
              <input className={input} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className={label}>
              Beszállító
              <select className={select} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">Összes</option>
                {(meta?.suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className={label}>
              Cél hely
              <select className={select} value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">Összes</option>
                {(meta?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className={label}>
              Pénznem
              <select className={select} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="">Összes</option>
                {(meta?.currencies || []).map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
              </select>
            </label>
            <label className={label}>
              Állapot
              <select className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Összes</option>
                <option value="draft">Vázlat</option>
                <option value="parsed">Ellenőrizve</option>
                <option value="needs_review">Ellenőrzés szükséges</option>
                <option value="review">Folyamatban</option>
                <option value="committed">Készletre véve</option>
              </select>
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={primaryBtn} onClick={load} disabled={busy} type="button"><Search size={15} /> Keresés</button>
            <button className={neutralBtn} onClick={resetFilters} type="button"><X size={15} /> Alaphelyzet</button>
          </div>
        </section>

        <section className={card}>
          <SectionTitle icon={<CalendarDays size={16} />} title="Áttekintés" />
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Receptiók</p><p className="mt-0.5 text-lg text-white">{totals.count}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Terméksor</p><p className="mt-0.5 text-lg text-white">{totals.lines}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Darab</p><p className="mt-0.5 text-lg text-white">{totals.qty}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Törölhető</p><p className="mt-0.5 text-lg text-white">{totals.deletable}</p></div>
            <div className={statCard}><p className="text-xs uppercase tracking-[0.06em] text-white/62">Összes érték</p><p className="mt-0.5 text-lg text-white">{money(totals.value)}</p></div>
            <div className="rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-2.5 py-1.5"><p className="text-xs uppercase tracking-[0.06em] text-white/72">Eladási TVA</p><p className="mt-0.5 text-lg text-white">{salesTvaText}</p></div>
          </div>
        </section>

        <section className={card}>
          <SectionTitle title="Receptió lista" right={<span className="text-xs text-white">{items.length} találat</span>} />
          <div className="mt-3 overflow-hidden rounded-xl border border-white/12">
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-[#303b4e] text-xs uppercase tracking-[0.06em] text-white [&_th]:font-normal">
                  <tr>
                    <th className="px-2 py-1.5">Számla</th>
                    <th className="px-2 py-1.5">Beszállító</th>
                    <th className="px-2 py-1.5">Beszerzési rendelés</th>
                    <th className="px-2 py-1.5">Cél hely</th>
                    <th className="px-2 py-1.5">Dátum</th>
                    <th className="px-2 py-1.5">Pénznem</th>
                    <th className="px-2 py-1.5 text-right">Végösszeg</th>
                    <th className="px-2 py-1.5 text-right">Sorszám</th>
                    <th className="px-2 py-1.5 text-right">Darab</th>
                    <th className="px-2 py-1.5">Állapot</th>
                    <th className="px-2 py-1.5 text-right">Művelet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 bg-[#4d5869]">
                  {items.map((r) => (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="px-3 py-2 text-white">{cell(r.invoice_number)}</td>
                      <td className="px-2 py-1.5 text-white/82">{cell(r.supplier_name)}</td>
                      <td className="px-2 py-1.5 text-white/82">{r.purchase_order_id ? <button className="rounded-full border border-orange-200/35 bg-orange-500/16 px-2 py-1 text-[10px] text-orange-50 hover:bg-orange-500/24" onClick={() => openLinkedPurchaseOrder(r.purchase_order_id)} type="button">{r.purchase_order_number || "Kapcsolt rendelés"}</button> : <span className="text-white/35">-</span>}</td>
                      <td className="px-2 py-1.5 text-white/82">{cell(r.location_name)}</td>
                      <td className="px-2 py-1.5 text-white/82">{dateText(r.reception_date)}</td>
                      <td className="px-2 py-1.5 text-white/82">{cell(r.currency_code)}</td>
                      <td className="px-3 py-2 text-right text-white">{money(r.invoice_gross, r.currency_code)}</td>
                      <td className="px-3 py-2 text-right text-white/82">{r.line_count || 0}</td>
                      <td className="px-3 py-2 text-right text-white/82">{r.total_qty || 0}</td>
                      <td className="px-2 py-1.5 text-white/82">{statusText(r.status)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex justify-end gap-1.5">
                          <button className={tinyBtn} onClick={() => openDetail(r.id)} disabled={busy} type="button"><Eye size={13} /> {r.status === "committed" ? "Adatok" : "Folytatás"}</button>
                          <button className={tinyBtn} onClick={() => exportReceptionVerificationPdf(r.id)} disabled={busy} type="button"><CheckCircle size={13} /> Ellenőrző</button>
                          <button className={tinyBtn} onClick={() => exportReceptionPdf(r.id)} disabled={busy} type="button"><FileText size={13} /> PDF</button>
                          <button className={tinyBtn} onClick={() => exportCsv(r.id)} type="button"><Download size={13} /> CSV</button>
                          <button className={tinyDangerBtn} onClick={() => setDeleteTarget(r)} disabled={busy || !r.can_delete} type="button"><Trash2 size={13} /> Törlés</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!items.length && <tr><td className="px-2 py-6 text-center text-white/62" colSpan={11}>Nincs receptió a megadott szűrés szerint.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 bg-[#4d5869] p-2 lg:hidden">
              {items.map((r) => (
                <div key={r.id} className="rounded-xl border border-white/12 bg-[#354153] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-white">{cell(r.invoice_number)}</p>
                      <p className="mt-1 text-xs text-white/62">{cell(r.supplier_name)} • {cell(r.location_name)}</p>
                      {r.purchase_order_id && <button className="mt-2 rounded-full border border-orange-200/35 bg-orange-500/16 px-2 py-1 text-[10px] text-orange-50" onClick={() => openLinkedPurchaseOrder(r.purchase_order_id)} type="button">{r.purchase_order_number || "Kapcsolt rendelés"}</button>}
                    </div>
                    <span className="rounded-full border border-[#2a8d8b]/40 bg-[#2a8d8b]/10 px-2 py-1 text-xs text-white">{statusText(r.status)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Dátum</p><p>{dateText(r.reception_date)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Érték</p><p>{money(r.invoice_gross, r.currency_code)}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Sorszám</p><p>{r.line_count || 0}</p></div>
                    <div className={statCard}><p className="text-[11px] uppercase text-white/56">Darab</p><p>{r.total_qty || 0}</p></div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className={tinyBtn} onClick={() => openDetail(r.id)} disabled={busy} type="button"><Eye size={13} /> {r.status === "committed" ? "Adatok" : "Folytatás"}</button>
                    <button className={tinyBtn} onClick={() => exportReceptionVerificationPdf(r.id)} disabled={busy} type="button"><CheckCircle size={13} /> Ellenőrző</button>
                    <button className={tinyBtn} onClick={() => exportReceptionPdf(r.id)} disabled={busy} type="button"><FileText size={13} /> PDF</button>
                          <button className={tinyBtn} onClick={() => exportCsv(r.id)} type="button"><Download size={13} /> CSV</button>
                    <button className={tinyDangerBtn} onClick={() => setDeleteTarget(r)} disabled={busy || !r.can_delete} type="button"><Trash2 size={13} /> Törlés</button>
                  </div>
                </div>
              ))}
              {!items.length && <p className="rounded-xl border border-white/12 bg-[#354153] px-3 py-5 text-center text-sm text-white/65">Nincs receptió a megadott szűrés szerint.</p>}
            </div>
          </div>
        </section>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-[96vw] overflow-auto rounded-2xl border border-white/24 bg-[#4d5869] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/18 bg-[#303b4e] px-3 py-2">
              <div>
                <p className="text-xs uppercase tracking-[0.1em] text-white">Receptió részletei</p>
                <h2 className="text-base text-white font-normal">{cell(detail.item.invoice_number)}</h2>
              </div>
              <div className="flex gap-2">
                <button className={neutralBtn} onClick={() => exportReceptionVerificationPdf(detail.item.id)} disabled={busy} type="button"><CheckCircle size={15} /> Ellenőrző PDF</button>
                <button className={neutralBtn} onClick={() => exportReceptionPdf(detail.item.id)} disabled={busy} type="button"><FileText size={15} /> PDF</button>
                <button className={neutralBtn} onClick={() => exportCsv(detail.item.id)} type="button"><Download size={15} /> CSV</button>
                <button className={neutralBtn} onClick={() => setDetail(null)} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-3 px-3 pt-3 pb-6">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Beszállító</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.supplier_name)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Beszerzési rendelés</p>{detail.item.purchase_order_id ? <button className="mt-1 rounded-full border border-orange-200/35 bg-orange-500/16 px-2 py-1 text-[10px] text-orange-50 hover:bg-orange-500/24" onClick={() => openLinkedPurchaseOrder(detail.item.purchase_order_id)} type="button">{detail.item.purchase_order_number || "Kapcsolt rendelés"}</button> : <p className="mt-0.5 text-xs text-white/40">-</p>}</div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Cél hely</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.location_name)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Pénznem</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.currency_code)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Árfolyam</p><p className="mt-0.5 text-xs text-white">{cell(detail.item.exchange_rate_to_ron)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Végösszeg</p><p className="mt-0.5 text-xs text-white">{money(detail.item.invoice_gross, detail.item.currency_code)}</p></div>
                <div className={statCard}><p className="text-[11px] uppercase text-white/56">Eladási TVA</p><p className="mt-0.5 text-xs text-white">{salesTvaText}</p></div>
              </div>

              {detailBalance && (
                <div className={`rounded-xl border px-3 py-2 ${detailBalance.className}`}>
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="relative mt-0.5 shrink-0">
                        {!detailBalance.isOk && !detailBalance.suggestedNoVat && <span className="absolute inset-0 rounded-full bg-red-400/55 blur-md animate-pulse" />}
                        <span className={`relative block h-3.5 w-3.5 rounded-full ${detailBalance.ledClassName}`} />
                      </div>
                      <div>
                        <p className={`text-[11px] uppercase tracking-[0.14em] ${detailBalance.labelClassName}`}>Számla egyeztetés</p>
                        <div className="mt-0.5 flex flex-wrap items-end gap-x-3 gap-y-1">
                          <p className={`text-base sm:text-lg ${detailBalance.amountClassName}`}>
                            {detailBalance.suggestedNoVat ? (
                              <>A sorok összege helyes: <span className="text-amber-50">{money(detailBalance.baseTotal, detail.item.currency_code)}</span></>
                            ) : (
                              <>Különbözet: <span className={!detailBalance.isOk ? "text-red-50 [text-shadow:0_0_14px_rgba(248,113,113,0.45)]" : ""}>{money(detailBalance.diff, detail.item.currency_code)}</span></>
                            )}
                          </p>
                          {!detailBalance.isOk && !detailBalance.suggestedNoVat && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200/35 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-50 shadow-[0_0_14px_rgba(239,68,68,0.35)]">
                              <span className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.95)] animate-pulse" />
                              Figyelem: a számla még nem talál
                            </span>
                          )}
                          {detailBalance.suggestedNoVat && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/45 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-50">
                              A sorok összege pontosan egyezik a számlával. Csak a beszerzési TVA mód van rosszul beállítva.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`self-start rounded-full border px-2.5 py-1 text-xs ${detailBalance.badgeClassName}`}>{detailBalance.status}</span>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                    <div className={detailBalance.labelClassName}>Sorok: <span className="text-white">{money(detailBalance.rowsValue, detail.item.currency_code)}</span></div>
                    <div className={detailBalance.labelClassName}>Beszerzési TVA: <span className="text-white">{money(detailBalance.tvaValue, detail.item.currency_code)}</span></div>
                    <div className={detailBalance.labelClassName}>Szállítás: <span className="text-white">{money(detailBalance.shipping, detail.item.currency_code)}</span></div>
                    <div className={detailBalance.labelClassName}>Számított számla: <span className="text-white">{money(detailBalance.calculatedTotal, detail.item.currency_code)}</span></div>
                  </div>
                  {detailBalance.suggestedNoVat && (
                    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-amber-200/35 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-50 sm:flex-row sm:items-center sm:justify-between">
                      <span>
                        {money(detailBalance.rowsValue, detail.item.currency_code)} termék + {money(detailBalance.shipping, detail.item.currency_code)} szállítás = {money(detailBalance.invoiceGross, detail.item.currency_code)} számla.
                        A plusz {money(detailBalance.tvaValue, detail.item.currency_code)} csak a hibás beszerzési TVA-beállításból jön.
                      </span>
                      <button className={primaryBtn} onClick={() => void applyNoPurchaseVatAndSave()} disabled={savingHeader || busy} type="button">
                        Nincs beszerzési TVA • javítás és mentés
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-[#2a8d8b]/35 bg-[#2a8d8b]/10 px-3 py-2 text-white shadow-lg shadow-slate-950/10">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.1em] text-white/70">Eladási ár / TVA</p>
                    <p className="mt-1 text-sm text-white">
                      {salesIncludesTvaOf(salesTvaSettings)
                        ? `A megadott eladási ár már végár, a ${salesTvaShort(salesTvaSettings)} TVA benne van.`
                        : `A megadott eladási ár nettó, a rendszer hozzáadja a ${salesTvaShort(salesTvaSettings)} TVA-t.`}
                    </p>
                    {salesTvaUpdatedAt && <p className="mt-1 text-[11px] text-white/55">Utolsó központi mentés: {String(salesTvaUpdatedAt).slice(0, 16).replace("T", " ")}{salesTvaUpdatedBy ? ` • ${salesTvaUpdatedBy}` : ""}</p>}
                  </div>
                  <button className={neutralBtn} onClick={() => setSalesTvaModalOpen(true)} disabled={salesTvaSettingsLoading} type="button">Beállítás</button>
                </div>
              </div>

              <div className={lightPanel}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Receptió fejadatai</p>
                    <p className="mt-1 text-xs text-slate-600">Számlaszám, árfolyam, beszerzési TVA és végösszeg javítása. Az eladási TVA külön, központi beállításként működik.</p>
                  </div>
                  <button className={primaryBtn} onClick={saveReceptionHeader} disabled={busy || savingHeader} type="button"><Save size={15} /> Fejadatok mentése</button>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-4">
                  <label className={lightLabel}>Számlaszám<input className={lightInput} value={receptionDraft.invoiceNumber || ""} onChange={(e) => updateReceptionDraft("invoiceNumber", e.target.value)} /></label>
                  <label className={lightLabel}>Számla dátuma<input className={lightInput} type="date" value={receptionDraft.invoiceDate || ""} onChange={(e) => updateReceptionDraft("invoiceDate", e.target.value)} /></label>
                  <label className={lightLabel}>Receptió dátuma<input className={lightInput} type="date" value={receptionDraft.receptionDate || ""} onChange={(e) => updateReceptionDraft("receptionDate", e.target.value)} /></label>
                  <label className={lightLabel}>Pénznem<select className={lightSelect} value={receptionDraft.currencyCode || ""} onChange={(e) => updateReceptionDraft("currencyCode", e.target.value)}>{(meta?.currencies || []).map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}</select></label>
                  <label className={lightLabel}>Árfolyam RON<input className={lightInput} value={receptionDraft.exchangeRateToRon || ""} onChange={(e) => updateReceptionDraft("exchangeRateToRon", e.target.value)} /></label>
                  <label className={lightLabel}>Beszerzési TVA kezelése<select className={lightSelect} value={receptionDraft.tvaMode || "no_tva"} onChange={(e) => updateReceptionDraft("tvaMode", e.target.value)}><option value="no_tva">Nincs beszerzési TVA</option><option value="without_tva">Nettó vételár + TVA</option><option value="with_tva">Bruttó vételár, TVA benne van</option></select></label>
                  <label className={lightLabel}>Beszerzési TVA %<input className={lightInput} disabled={receptionDraft.tvaMode === "no_tva"} value={receptionDraft.tvaMode === "no_tva" ? "0" : (receptionDraft.tvaRate || "")} onChange={(e) => updateReceptionDraft("tvaRate", e.target.value)} /></label>
                  <label className={lightLabel}>Szállítás<input className={lightInput} value={receptionDraft.shippingCost || ""} onChange={(e) => updateReceptionDraft("shippingCost", e.target.value)} /></label>
                  <label className={lightLabel}>Számla végösszeg<input className={lightInput} value={receptionDraft.invoiceGross || ""} onChange={(e) => updateReceptionDraft("invoiceGross", e.target.value)} /></label>
                  <label className={`${lightLabel} lg:col-span-3`}>Megjegyzés<input className={lightInput} value={receptionDraft.note || ""} onChange={(e) => updateReceptionDraft("note", e.target.value)} /></label>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg shadow-slate-950/10">
                <div className="flex flex-col gap-2 border-b border-slate-200 bg-[#f8fafc] px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs uppercase tracking-[0.08em] text-slate-700">Terméksorok</p>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600">{visibleRows.length} sor</span>
                      {selectedRows.size ? <span className="rounded-full border border-[#8edbd7] bg-[#effbf9] px-2 py-0.5 text-[10px] text-[#187876]">{selectedRows.size} kijelölve</span> : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">Egy sor egy termékvariáns. A mezők egy vonalban maradnak, az állapot és a műveletek pedig nem foglalnak el fél képernyőt.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select className={`${lightSelect} min-w-[180px]`} value={rowStatusFilter} onChange={(e) => setRowStatusFilter(e.target.value)}>
                      <option value="active">Még dolgozandó sorok</option>
                      <option value="all">Minden sor</option>
                      <option value="committed">Készletre vett</option>
                      <option value="error">Hibás</option>
                      <option value="ignored">Kihagyott</option>
                    </select>
                    <button className={neutralBtn} onClick={selectReadyRows} disabled={busy || savingRows || committingRows} type="button">Kész sorok kijelölése</button>
                    <button className={neutralBtn} onClick={saveRowEdits} disabled={busy || savingRows || committingRows} type="button"><Save size={13} /> Sorok mentése</button>
                    <button className={primaryBtn} onClick={commitSelectedRows} disabled={busy || savingRows || committingRows || !selectedRows.size} type="button"><CheckCircle size={14} /> Kijelöltek készletre</button>
                  </div>
                </div>

                <div className="hidden xl:block">
                  <div className="max-h-[54vh] overflow-auto">
                    <div className={`${receptionGridHeader} sticky top-0 z-10`}>
                      <span className="text-center">✓</span>
                      <span>Sor</span>
                      <span>Termékkód</span>
                      <span>S/N/COD</span>
                      <span>Terméknév</span>
                      <span>Méret</span>
                      <span>Szín</span>
                      <span>Színkód</span>
                      <span className="text-right">Db</span>
                      <span className="text-right">Vételár</span>
                      <span className="text-right">Vételár RON</span>
                      <span className="text-right">{salesIncludesTvaOf(salesTvaSettings) ? "Eladási végár" : "Eladási nettó"}</span>
                      <span className="text-right">Eladás / TVA</span>
                      <span className="text-center">Művelet</span>
                    </div>
                    {visibleRows.map((r) => {
                      const draft: any = rowDrafts[r.id] || r.normalized || {};
                      const editable = rowCanEdit(r);
                      const canCommitOrMove = rowCanWork(r);
                      const checked = canCommitOrMove && selectedRows.has(r.id);
                      const exchangeRate = n(receptionDraft.exchangeRateToRon || detail.item.exchange_rate_to_ron) || 1;
                      const buyPriceRonPreview = n(draft.buyPrice ?? r.buy_price) * exchangeRate;
                      const sellPriceRonPreview = rowSellGrossPriceRon(r, draft, salesTvaSettings);
                      const hasRowError = r.status === "error" || Boolean((r.error_messages || []).length);
                      const rowTone = r.status === "committed"
                        ? "bg-emerald-50/65 hover:bg-emerald-50"
                        : r.status === "ignored"
                          ? "bg-slate-100/80 opacity-70"
                          : hasRowError
                            ? "bg-rose-50/80 hover:bg-rose-50"
                            : checked
                              ? "bg-[#effbf9] hover:bg-[#e7f8f6]"
                              : "bg-white hover:bg-slate-50";
                      const statusDot = r.status === "committed"
                        ? "bg-emerald-500"
                        : r.status === "ignored"
                          ? "bg-slate-400"
                          : hasRowError
                            ? "bg-rose-500"
                            : "bg-amber-400";
                      return (
                        <div key={r.id} className={`${receptionGridRow} ${rowTone}`}>
                          <div className="flex justify-center">
                            <input type="checkbox" className="h-4 w-4 accent-[#2a8d8b]" checked={checked} disabled={!canCommitOrMove || hasRowError} onChange={() => toggleRow(r.id)} aria-label={`Sor ${r.row_no} kijelölése`} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5" title={statusText(r.status)}>
                              <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
                              <span className="truncate text-[11px] tabular-nums text-slate-700">Nr. {r.row_no}</span>
                            </div>
                            <span className="mt-0.5 block truncate text-[9px] text-slate-400">{statusText(r.status)}</span>
                          </div>
                          <input className={rowInput} value={String(draft.supplierProductCode ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "supplierProductCode", e.target.value)} title={String(draft.supplierProductCode ?? "")} />
                          <input className={rowInput} value={String(draft.snCod ?? draft.sn_cod ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "snCod", e.target.value)} title={String(draft.snCod ?? draft.sn_cod ?? "")} />
                          <input className={rowInput} value={String(draft.titleRo ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "titleRo", e.target.value)} title={String(draft.titleRo ?? "")} />
                          <input className={rowInput} value={String(draft.size ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "size", e.target.value)} />
                          <input className={rowInput} value={String(draft.colorName ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorName", e.target.value)} title={String(draft.colorName ?? "")} />
                          <input className={rowInput} value={String(draft.colorCode ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorCode", e.target.value)} />
                          <input className={`${rowInput} text-right tabular-nums`} value={String(draft.qty ?? "")} disabled={!canCommitOrMove} onChange={(e) => updateRowDraft(r.id, "qty", e.target.value)} />
                          <input className={`${rowInput} text-right tabular-nums`} value={String(draft.buyPrice ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "buyPrice", e.target.value)} />
                          <span className={rowRead}>{money(buyPriceRonPreview || r.buy_price_ron, "RON")}</span>
                          <input className={`${rowInput} text-right tabular-nums`} value={String(draft.sellPrice ?? "")} disabled={!editable} onChange={(e) => updateRowSellPrice(r.id, e.target.value)} />
                          <span className={`${rowRead} flex-col items-end justify-center leading-tight`}><span>{money(sellPriceRonPreview, "RON")}</span><span className="text-[9px] text-slate-400">{salesTvaShort(salesTvaSettings)}</span></span>
                          <div className="flex items-center justify-center gap-1">
                            <button className={rowPrimaryBtn} onClick={() => saveSingleRow(r.id)} disabled={!editable || busy || savingRows || committingRows || savingRowId === r.id} type="button" title={savingRowId === r.id ? "Mentés folyamatban" : "Sor mentése"}><Save size={14} /></button>
                            <button className={rowNeutralBtn} onClick={() => { setMoveTarget(r); setMoveToReceptionId(""); }} disabled={!canCommitOrMove || busy || savingRowId === r.id} type="button" title="Áthelyezés másik receptióba"><MoveRight size={14} /></button>
                            <button className={rowDangerBtn} onClick={() => ignoreRow(r.id)} disabled={!canCommitOrMove || busy || savingRowId === r.id} type="button" title="Sor kihagyása"><X size={14} /></button>
                          </div>
                        </div>
                      );
                    })}
                    {!visibleRows.length ? <div className="px-4 py-8 text-center text-sm text-slate-500">Nincs sor ebben a nézetben.</div> : null}
                  </div>
                </div>

                <div className="grid max-h-[54vh] gap-2 overflow-y-auto bg-slate-50 p-2 xl:hidden">
                  {visibleRows.map((r) => {
                    const draft: any = rowDrafts[r.id] || r.normalized || {};
                    const editable = rowCanEdit(r);
                    const canCommitOrMove = rowCanWork(r);
                    const checked = canCommitOrMove && selectedRows.has(r.id);
                    const exchangeRate = n(receptionDraft.exchangeRateToRon || detail.item.exchange_rate_to_ron) || 1;
                    const buyPriceRonPreview = n(draft.buyPrice ?? r.buy_price) * exchangeRate;
                    const sellPriceRonPreview = rowSellGrossPriceRon(r, draft, salesTvaSettings);
                    const hasRowError = r.status === "error" || Boolean((r.error_messages || []).length);
                    return (
                      <div key={r.id} className={`rounded-xl border p-2.5 shadow-sm ${checked ? "border-[#8edbd7] bg-[#effbf9]" : hasRowError ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                          <label className="inline-flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" className="h-4 w-4 accent-[#2a8d8b]" checked={checked} disabled={!canCommitOrMove || hasRowError} onChange={() => toggleRow(r.id)} />Nr. {r.row_no}</label>
                          <span className={rowStatusPill}>{statusText(r.status)}</span>
                          <div className="ml-auto flex gap-1">
                            <button className={rowPrimaryBtn} onClick={() => saveSingleRow(r.id)} disabled={!editable || busy || savingRows || committingRows || savingRowId === r.id} type="button" title="Sor mentése"><Save size={14} /></button>
                            <button className={rowNeutralBtn} onClick={() => { setMoveTarget(r); setMoveToReceptionId(""); }} disabled={!canCommitOrMove || busy || savingRowId === r.id} type="button" title="Áthelyezés"><MoveRight size={14} /></button>
                            <button className={rowDangerBtn} onClick={() => ignoreRow(r.id)} disabled={!canCommitOrMove || busy || savingRowId === r.id} type="button" title="Kihagy"><X size={14} /></button>
                          </div>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className={rowLabel}>Termékkód<input className={rowInput} value={String(draft.supplierProductCode ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "supplierProductCode", e.target.value)} /></label>
                          <label className={rowLabel}>S/N/COD<input className={rowInput} value={String(draft.snCod ?? draft.sn_cod ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "snCod", e.target.value)} /></label>
                          <label className={`${rowLabel} sm:col-span-2`}>Terméknév<input className={rowInput} value={String(draft.titleRo ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "titleRo", e.target.value)} /></label>
                          <label className={rowLabel}>Méret<input className={rowInput} value={String(draft.size ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "size", e.target.value)} /></label>
                          <label className={rowLabel}>Szín<input className={rowInput} value={String(draft.colorName ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorName", e.target.value)} /></label>
                          <label className={rowLabel}>Színkód<input className={rowInput} value={String(draft.colorCode ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "colorCode", e.target.value)} /></label>
                          <label className={rowLabel}>Darab<input className={`${rowInput} text-right`} value={String(draft.qty ?? "")} disabled={!canCommitOrMove} onChange={(e) => updateRowDraft(r.id, "qty", e.target.value)} /></label>
                          <label className={rowLabel}>Vételár<input className={`${rowInput} text-right`} value={String(draft.buyPrice ?? "")} disabled={!editable} onChange={(e) => updateRowDraft(r.id, "buyPrice", e.target.value)} /></label>
                          <label className={rowLabel}>Vételár RON<span className={rowRead}>{money(buyPriceRonPreview || r.buy_price_ron, "RON")}</span></label>
                          <label className={rowLabel}>{salesIncludesTvaOf(salesTvaSettings) ? "Eladási végár RON" : "Eladási nettó RON"}<input className={`${rowInput} text-right`} value={String(draft.sellPrice ?? "")} disabled={!editable} onChange={(e) => updateRowSellPrice(r.id, e.target.value)} /></label>
                          <label className={rowLabel}>Eladás / TVA<span className={rowRead}>{money(sellPriceRonPreview, "RON")} • {salesTvaShort(salesTvaSettings)}</span></label>
                        </div>
                      </div>
                    );
                  })}
                  {!visibleRows.length ? <div className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">Nincs sor ebben a nézetben.</div> : null}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {salesTvaModalOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="sales-tva-title">
          <div className="w-full max-w-lg rounded-2xl border border-white/24 bg-[#4d5869] p-4 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="sales-tva-title" className="text-lg font-normal">Eladási ár / TVA beállítás</p>
                <p className="mt-1 text-sm text-white/70">Ez központi beállítás. Mentés után minden gépen és telefonon ugyanaz lesz.</p>
              </div>
              <button className={neutralBtn} onClick={() => setSalesTvaModalOpen(false)} type="button"><X size={14} /> Bezárás</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={label}>Eladási TVA %<input className={`${input} w-full`} value={salesTvaRate} onChange={(e) => setSalesTvaRate(e.target.value)} placeholder="pl. 21" /></label>
              <label className="flex items-center gap-2 rounded-xl border border-white/14 bg-[#354153] px-3 py-2 text-sm text-white/82">
                <input className="h-4 w-4 accent-[#2a8d8b]" type="checkbox" checked={salesPriceIncludesTva} onChange={(e) => setSalesPriceIncludesTva(e.target.checked)} />
                A megadott eladási ár már tartalmazza a TVA-t
              </label>
            </div>
            <div className="mt-3 rounded-xl border border-[#2a8d8b]/35 bg-[#2a8d8b]/10 px-3 py-2 text-sm text-white/82">
              {salesPriceIncludesTva
                ? `Példa: 100 RON megadva → 100 RON végár, ebből számolja vissza a ${salesTvaRate || 0}% TVA-t.`
                : `Példa: 100 RON megadva → ${money(100 * (1 + n(salesTvaRate) / 100), "RON")} végár, mert a rendszer ráteszi a ${salesTvaRate || 0}% TVA-t.`}
              {salesTvaUpdatedAt && <span className="mt-1 block text-white/45">Utolsó központi mentés: {String(salesTvaUpdatedAt).slice(0, 16).replace("T", " ")}{salesTvaUpdatedBy ? ` • ${salesTvaUpdatedBy}` : ""}</span>}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className={neutralBtn} onClick={() => setSalesTvaModalOpen(false)} type="button">Mégse</button>
              <button className={primaryBtn} onClick={saveSalesTvaSettings} disabled={salesTvaSettingsSaving || salesTvaSettingsLoading} type="button"><Save size={14} /> {salesTvaSettingsSaving ? "Mentés..." : "Központi beállítás mentése"}</button>
            </div>
          </div>
        </div>
      )}

      {moveTarget && detail && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/24 bg-[#4d5869] p-4 shadow-2xl">
            <h2 className="text-base text-white font-normal">Terméksor áthelyezése</h2>
            <p className="mt-2 text-sm text-white/76">Csak még nem készletre vett sor helyezhető át másik nyitott receptióba.</p>
            <div className="mt-2 rounded-xl border border-white/12 bg-[#354153] p-2.5 text-xs text-white">
              {cell((moveTarget.normalized || {}).titleRo)} • {cell(moveTarget.supplier_product_code || (moveTarget.normalized || {}).supplierProductCode)} • S/N/COD: {cell((moveTarget as any).sn_cod || (moveTarget.normalized || {}).snCod || (moveTarget.normalized || {}).sn_cod)}
            </div>
            <label className={`${label} mt-3`}>
              Cél receptió
              <select className={select} value={moveToReceptionId} onChange={(e) => setMoveToReceptionId(e.target.value)}>
                <option value="">Válassz receptiót</option>
                {items.filter((r) => r.id !== detail.item.id && r.status !== "committed" && r.status !== "cancelled").map((r) => (
                  <option key={r.id} value={r.id}>{cell(r.invoice_number)} • {cell(r.supplier_name)} • {dateText(r.reception_date)}</option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button className={neutralBtn} onClick={() => setMoveTarget(null)} disabled={busy} type="button"><X size={15} /> Mégse</button>
              <button className={primaryBtn} onClick={moveRowToReception} disabled={busy || !moveToReceptionId} type="button"><MoveRight size={15} /> Áthelyezés</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/62 p-3 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/24 bg-[#4d5869] p-4 shadow-2xl">
            <h2 className="text-base text-white font-normal">Receptió törlése</h2>
            <p className="mt-2 text-sm text-white/76">A törlés a receptióhoz tartozó mentett import sorokat is eltávolítja, ha még nem történt készletre vétel.</p>
            <div className="mt-2 rounded-xl border border-white/12 bg-[#354153] p-2.5 text-xs text-white">
              {cell(deleteTarget.invoice_number)} • {cell(deleteTarget.supplier_name)} • {money(deleteTarget.invoice_gross, deleteTarget.currency_code)}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={neutralBtn} onClick={() => setDeleteTarget(null)} disabled={busy} type="button"><X size={15} /> Mégse</button>
              <button className={dangerBtn} onClick={deleteReception} disabled={busy} type="button"><Trash2 size={15} /> Törlés</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
