import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  CheckCircle2,
  Barcode,
  Camera,
  ClipboardList,
  Edit3,
  FileText,
  Home,
  ImageOff,
  Keyboard,
  Loader2,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  ShoppingCart,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  AifCurrency,
  AifInventoryItem,
  AifLocation,
  AifPurchaseOrderDetail,
  AifPurchaseOrderInputLine,
  AifPurchaseOrderLine,
  AifPurchaseOrderSettings,
  AifPurchaseOrderStatus,
  AifPurchaseOrderSummary,
  AifSupplier,
  apiAifCancelPurchaseOrder,
  apiAifCreatePurchaseOrder,
  apiAifDeletePurchaseOrder,
  apiAifGetPurchaseOrder,
  apiAifGetPurchaseOrderSettings,
  apiAifInventory,
  apiAifListPurchaseOrders,
  apiAifMarkPurchaseOrderOrdered,
  apiAifMeta,
  apiAifSavePurchaseOrderSettings,
  apiAifUpdatePurchaseOrder,
} from "../lib/aif/api";

type PurchaseOrderDraftLine = AifPurchaseOrderInputLine & {
  key: string;
  qty: number;
  unitPrice: string;
};

type ScannerDetection = { rawValue?: string };
type BarcodeDetectorInstance = { detect(source: CanvasImageSource): Promise<ScannerDetection[]> };
type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

const RECEIVE_HANDOFF_KEY = "allinfashion:purchase-order-receive:v1";
const page = "min-h-screen bg-[#4b5362] px-3 py-4 text-white font-normal sm:px-5 sm:py-6";
const wrap = "mx-auto max-w-[1400px] space-y-4";
const topCard = "rounded-2xl border border-white/20 bg-[#303a4c] px-4 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.06)]";
const card = "rounded-2xl border border-white/18 bg-[#4d5869] shadow-lg shadow-slate-950/15";
const input = "h-9 w-full rounded-lg border border-white/24 bg-[#303b4e] px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-[#67d4d1]/80 focus:ring-1 focus:ring-[#67d4d1]/30 [color-scheme:dark]";
const label = "grid gap-1.5 text-[10px] uppercase tracking-[0.08em] text-white/72";
const btnBase = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs text-white transition disabled:cursor-not-allowed disabled:opacity-45";
const primaryBtn = `${btnBase} border-[#67d4d1]/45 bg-[#2a8d8b] hover:bg-[#319c99]`;
const neutralBtn = `${btnBase} border-white/24 bg-[#354153] hover:bg-[#3e4d63]`;
const dangerBtn = `${btnBase} border-red-300/30 bg-[#c90d22] hover:bg-[#aa0b1d]`;
const modalBackdrop = "fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-950/80 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6";
const modalCard = "my-auto max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl border border-white/22 bg-[#4b5566] text-white shadow-2xl";

function goHome() {
  window.location.hash = "#allin";
}

type CompactSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type CompactSelectProps = {
  value: string;
  options: CompactSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  size?: "compact" | "default";
  menuMinWidth?: number;
};

function CompactSelect({
  value,
  options,
  onChange,
  placeholder = "Válassz",
  className = "",
  disabled = false,
  ariaLabel,
  size = "default",
  menuMinWidth = 220,
}: CompactSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) || null;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const maxWidth = Math.min(360, window.innerWidth - viewportPadding * 2);
    const width = Math.min(Math.max(rect.width, menuMinWidth), maxWidth);
    const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding);
    const roomBelow = window.innerHeight - rect.bottom;
    const openUp = roomBelow < 250 && rect.top > roomBelow;
    setMenuPosition(openUp
      ? { left, width, bottom: Math.max(viewportPadding, window.innerHeight - rect.top + 6) }
      : { left, width, top: Math.min(window.innerHeight - viewportPadding, rect.bottom + 6) });
  }, [menuMinWidth]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reposition = () => updatePosition();

    document.addEventListener("mousedown", closeOnOutside, true);
    window.addEventListener("keydown", closeOnEscape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside, true);
      window.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  const heightClass = size === "compact" ? "h-9 rounded-lg" : "h-10 rounded-xl";

  return (
    <div className={`min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full min-w-0 items-center justify-between gap-2 border border-white/22 bg-[#3f4959] px-3 text-left text-xs text-white outline-none transition hover:bg-[#465264] focus:border-[#7bd7d4]/55 focus:ring-2 focus:ring-[#7bd7d4]/18 disabled:cursor-not-allowed disabled:opacity-45 ${heightClass}`}
        onClick={() => {
          if (disabled) return;
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
      >
        <span className={`truncate ${selected ? "text-white" : "text-white/48"}`}>{selected?.label || placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 text-white/55 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && menuPosition && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="overflow-hidden rounded-xl border shadow-2xl"
          style={{
            position: "fixed",
            zIndex: 500,
            left: menuPosition.left,
            width: menuPosition.width,
            top: menuPosition.top,
            bottom: menuPosition.bottom,
            color: "#ffffff",
            backgroundColor: "#26364c",
            borderColor: "rgba(142, 230, 226, 0.48)",
            boxShadow: "0 18px 46px rgba(2, 6, 23, 0.58)",
          }}
        >
          <div className="max-h-64 overflow-y-auto p-1">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__empty"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={option.disabled}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    color: "#ffffff",
                    backgroundColor: active ? "#2a8d8b" : "#354153",
                  }}
                  onMouseEnter={(event) => {
                    if (!option.disabled) event.currentTarget.style.backgroundColor = active ? "#319c99" : "#415064";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.backgroundColor = active ? "#2a8d8b" : "#354153";
                  }}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="truncate" style={{ color: "#ffffff" }}>{option.label}</span>
                  <CheckCircle2 size={13} color="#ffffff" className={active ? "shrink-0 opacity-100" : "shrink-0 opacity-0"} />
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}


function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown, currency = "RON") {
  const number = toNumber(value);
  return `${number.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function dateText(value?: string | null) {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return "-";
  const [year, month, day] = raw.split("-");
  return year && month && day ? `${year}. ${month}. ${day}.` : raw;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fileSafe(value: unknown) {
  return String(value || "comanda")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "comanda";
}

function statusLabel(status: AifPurchaseOrderStatus | string) {
  if (status === "draft") return "Nyitott";
  if (status === "ordered") return "Rendelve";
  if (status === "partially_received") return "Részben beérkezett";
  if (status === "received") return "Beérkezett";
  if (status === "cancelled") return "Törölt";
  return status || "-";
}

function statusClass(status: AifPurchaseOrderStatus | string) {
  if (status === "draft") return "border-rose-200/55 bg-[#d31126] text-white shadow-[0_6px_16px_rgba(211,17,38,0.26)]";
  if (status === "ordered") return "border-amber-200/35 bg-amber-300/12 text-amber-50";
  if (status === "partially_received") return "border-sky-200/35 bg-sky-300/12 text-sky-50";
  if (status === "received") return "border-emerald-200/35 bg-emerald-300/12 text-emerald-50";
  if (status === "cancelled") return "border-white/18 bg-[#303b4e] text-white/58";
  return "border-white/18 bg-white/8 text-white/70";
}

function newLineKey() {
  return `line:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}

function purchaseOrderPreview(settings: AifPurchaseOrderSettings) {
  const series = cleanText(settings.series || "CMD").toUpperCase().replace(/[^A-Z0-9._-]+/g, "-") || "CMD";
  const digits = Math.max(3, Math.min(10, Number(settings.digits || 6)));
  const sequence = String(Math.max(1, Number(settings.nextNumber || 1))).padStart(digits, "0");
  return settings.includeYear === false ? `${series}/${sequence}` : `${series}/${settings.sequenceYear || new Date().getFullYear()}/${sequence}`;
}

function imageUrlOf(item: AifInventoryItem | AifPurchaseOrderLine | PurchaseOrderDraftLine) {
  return cleanText((item as any).image_url || (item as any).imageUrl);
}

function firstSupplierCode(value: unknown) {
  return String(value || "").split(/[;,|]/).map((part) => part.trim()).find(Boolean) || "";
}

function ProductImage({ src, title, size = "md" }: { src?: string | null; title?: string | null; size?: "sm" | "md" | "lg" }) {
  const boxClass = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-20 w-20" : "h-12 w-12";
  if (!src) {
    return <span className={`${boxClass} inline-flex shrink-0 items-center justify-center rounded-xl border border-white/14 bg-[#303b4e] text-white/35`}><ImageOff size={size === "sm" ? 15 : 19} /></span>;
  }
  return (
    <span className="group relative inline-flex shrink-0">
      <img className={`${boxClass} rounded-xl border border-white/18 bg-white object-contain`} src={src} alt={title || "Termék"} />
      <span className="pointer-events-none fixed left-1/2 top-1/2 z-[220] hidden max-h-[72vh] max-w-[72vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/30 bg-white p-2 shadow-2xl group-hover:block">
        <img className="max-h-[68vh] max-w-[68vw] object-contain" src={src} alt={title || "Termék"} />
      </span>
    </span>
  );
}


function PurchaseOrderLineEditor({
  line,
  index,
  currencyCode,
  expanded,
  onToggle,
  onChange,
  onRemove,
}: {
  line: PurchaseOrderDraftLine;
  index: number;
  currencyCode: string;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PurchaseOrderDraftLine>) => void;
  onRemove: () => void;
}) {
  const lineValue = Math.max(0, toNumber(line.qty)) * Math.max(0, toNumber(line.unitPrice));
  const compactMeta = [line.brandName, line.colorName, line.size, line.barcode || line.modelCode]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" • ");

  return (
    <article className="overflow-hidden rounded-2xl border border-white/14 bg-[#354153]">
      <div className="grid gap-3 p-3 lg:grid-cols-[auto_minmax(260px,1.6fr)_minmax(150px,.8fr)_120px_130px_auto] lg:items-end">
        <div className="self-center">
          <ProductImage src={imageUrlOf(line)} title={String(line.productTitle || "")} />
        </div>

        <div className="min-w-0">
          <label className={label}>
            Terméknév
            <input
              className={input}
              value={String(line.productTitle || "")}
              onChange={(event) => onChange({ productTitle: event.target.value })}
            />
          </label>
          <p className="mt-1.5 truncate text-xs normal-case tracking-normal text-white/50">
            {compactMeta || `Rendelési sor ${index + 1}`}
          </p>
        </div>

        <label className={label}>
          Beszállítói kód
          <input
            className={input}
            value={String(line.supplierProductCode || "")}
            onChange={(event) => onChange({ supplierProductCode: event.target.value })}
          />
        </label>

        <label className={label}>
          Darab
          <div className="grid grid-cols-[32px_1fr_32px]">
            <button className={neutralBtn} onClick={() => onChange({ qty: Math.max(1, toNumber(line.qty) - 1) })} type="button"><Minus size={13} /></button>
            <input
              className={`${input} rounded-none text-center`}
              value={line.qty}
              onChange={(event) => onChange({ qty: Math.max(1, Math.floor(toNumber(event.target.value) || 1)) })}
              inputMode="numeric"
            />
            <button className={primaryBtn} onClick={() => onChange({ qty: Math.max(1, toNumber(line.qty)) + 1 })} type="button"><Plus size={13} /></button>
          </div>
        </label>

        <label className={label}>
          Vételár
          <input
            className={input}
            value={line.unitPrice}
            onChange={(event) => onChange({ unitPrice: event.target.value })}
            inputMode="decimal"
          />
        </label>

        <div className="flex min-w-[190px] flex-col gap-2 lg:items-end">
          <p className="text-xs text-white/65">
            Beszerzési érték: {lineValue > 0 ? money(lineValue, currencyCode) : "-"}
          </p>
          <div className="flex gap-1.5">
            <button className={neutralBtn} onClick={onToggle} type="button">
              <Edit3 size={13} /> {expanded ? "Kevesebb adat" : "Minden adat"}
            </button>
            <button className={dangerBtn} onClick={onRemove} type="button" title="Rendelési sor törlése"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/12 bg-[#303b4e]/55 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-[0.14em] text-[#bff8f5]/70">Részletes soradatok</p>
              <p className="mt-1 text-xs text-white/55">A rendelésbe mentett pillanatkép minden mezője módosítható.</p>
            </div>
            {line.variantId && <span className="rounded-full border border-white/14 bg-white/[0.05] px-2 py-1 text-[10px] text-white/50">Kapcsolt raktári termék</span>}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className={label}>Beszállítói variánskód<input className={input} value={String(line.supplierVariantCode || "")} onChange={(event) => onChange({ supplierVariantCode: event.target.value })} /></label>
            <label className={label}>Modellkód<input className={input} value={String(line.modelCode || "")} onChange={(event) => onChange({ modelCode: event.target.value })} /></label>
            <label className={label}>Márka<input className={input} value={String(line.brandName || "")} onChange={(event) => onChange({ brandName: event.target.value })} /></label>
            <label className={label}>Kategória / alkategória<input className={input} value={String(line.categoryName || "")} onChange={(event) => onChange({ categoryName: event.target.value })} /></label>

            <label className={label}>Vonalkód<input className={input} value={String(line.barcode || "")} onChange={(event) => onChange({ barcode: event.target.value })} /></label>
            <label className={label}>S/N/COD<input className={input} value={String(line.snCod || "")} onChange={(event) => onChange({ snCod: event.target.value })} /></label>
            <label className={label}>Vámtarifakód<input className={input} value={String(line.customsTariffCode || "")} onChange={(event) => onChange({ customsTariffCode: event.target.value })} /></label>

            <label className={label}>Szín<input className={input} value={String(line.colorName || "")} onChange={(event) => onChange({ colorName: event.target.value })} /></label>
            <label className={label}>Színkód<input className={input} value={String(line.colorCode || "")} onChange={(event) => onChange({ colorCode: event.target.value })} /></label>
            <label className={label}>Méret<input className={input} value={String(line.size || "")} onChange={(event) => onChange({ size: event.target.value })} /></label>
            <label className={label}>Nem<input className={input} value={String(line.gender || "")} onChange={(event) => onChange({ gender: event.target.value })} /></label>

            <label className={label}>Terméktípus<input className={input} value={String(line.productType || "")} onChange={(event) => onChange({ productType: event.target.value })} /></label>
            <label className={`${label} xl:col-span-3`}>Anyagösszetétel<input className={input} value={String(line.material || "")} onChange={(event) => onChange({ material: event.target.value })} /></label>

            <label className={`${label} md:col-span-2 xl:col-span-4`}>Fotó URL<input className={input} value={String(line.imageUrl || "")} onChange={(event) => onChange({ imageUrl: event.target.value })} /></label>
            <label className={`${label} md:col-span-2 xl:col-span-4`}>
              Román termékleírás
              <textarea
                className={`${input} min-h-[88px] resize-y py-2`}
                value={String(line.descriptionRo || "")}
                onChange={(event) => onChange({ descriptionRo: event.target.value })}
              />
            </label>
          </div>

          {line.variantId && (
            <p className="mt-3 rounded-xl border border-amber-200/16 bg-amber-300/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-50/70">
              Ezek a módosítások csak a beszerzési rendelés sorát írják át. A raktári termék törzsadatait nem módosítják.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function buildPurchaseOrderPdf(detail: AifPurchaseOrderDetail, settings: AifPurchaseOrderSettings | null) {
  const item = detail.item;
  const lines = detail.lines || [];
  const title = settings?.documentTitle || "COMANDĂ CĂTRE FURNIZOR";
  const subtitle = settings?.documentSubtitle || "Comandă de aprovizionare";
  const totalQty = lines.reduce((sum, line) => sum + toNumber(line.qty_ordered), 0);
  const totalValue = lines.reduce((sum, line) => sum + toNumber(line.line_total), 0);
  const rows = lines.map((line, index) => {
    const image = line.image_url
      ? `<img src="${escapeHtml(line.image_url)}" alt="" />`
      : `<div class="no-image">-</div>`;
    return `<tr>
      <td class="center">${index + 1}</td>
      <td class="image">${image}</td>
      <td><strong>${escapeHtml(line.product_title)}</strong><div class="muted">${escapeHtml([line.brand_name, line.category_name, line.color_name, line.size].filter(Boolean).join(" • "))}</div></td>
      <td>${escapeHtml(line.supplier_product_code || line.model_code || "-")}</td>
      <td>${escapeHtml(line.barcode || "-")}</td>
      <td class="num">${toNumber(line.qty_ordered)}</td>
      <td class="num">${line.unit_price === null || line.unit_price === undefined ? "-" : money(line.unit_price, item.currency_code)}</td>
      <td class="num">${line.line_total === null || line.line_total === undefined ? "-" : money(line.line_total, item.currency_code)}</td>
    </tr>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(fileSafe(item.order_number))}.pdf</title>
  <style>
    @page { size:A4 portrait; margin:12mm; }
    * { box-sizing:border-box; }
    body { margin:0; color:#1f2937; font-family:Arial,Helvetica,sans-serif; font-size:9px; }
    .actions { display:flex; gap:8px; margin-bottom:8px; }
    .actions button { border:0; border-radius:7px; background:#245f55; color:#fff; padding:8px 11px; cursor:pointer; }
    .head { display:grid; grid-template-columns:1fr 1fr; gap:18px; border-bottom:2px solid #245f55; padding-bottom:9px; }
    .company h2 { margin:0 0 4px; font-size:15px; }
    .company div { line-height:1.45; }
    .doc-title { text-align:right; }
    .doc-title h1 { margin:0; font-size:19px; letter-spacing:.035em; }
    .doc-title p { margin:4px 0 0; color:#52606d; }
    .meta { display:grid; grid-template-columns:repeat(2,1fr); gap:6px 12px; margin:10px 0; }
    .meta .box { border:1px solid #cfd8dc; border-radius:6px; padding:6px 8px; }
    .label { color:#6b7280; font-size:7px; text-transform:uppercase; letter-spacing:.06em; }
    .value { margin-top:2px; font-size:9px; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    th { background:#26384b; color:#fff; padding:6px 4px; border:1px solid #26384b; font-size:7px; text-transform:uppercase; }
    td { border:1px solid #d6dde1; padding:5px 4px; vertical-align:middle; overflow-wrap:anywhere; }
    tbody tr:nth-child(even) td { background:#f7f9fa; }
    td.image { width:40px; text-align:center; }
    td.image img { width:34px; height:34px; object-fit:contain; background:#fff; border:1px solid #d6dde1; border-radius:5px; }
    .no-image { color:#a1a1aa; }
    .muted { margin-top:2px; color:#64748b; font-size:7px; }
    .center { text-align:center; }
    .num { text-align:right; white-space:nowrap; }
    .total { margin-top:8px; display:flex; justify-content:flex-end; }
    .total-box { min-width:250px; border:1px solid #245f55; border-radius:8px; overflow:hidden; }
    .total-row { display:flex; justify-content:space-between; padding:6px 9px; border-bottom:1px solid #d6dde1; }
    .total-row:last-child { border:0; background:#245f55; color:#fff; font-size:11px; }
    .note { margin-top:9px; border:1px solid #d6dde1; border-radius:7px; padding:8px; min-height:42px; }
    .sign { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:30px; }
    .sign div { border-top:1px solid #1f2937; padding-top:5px; text-align:center; }
    @media print { .actions { display:none; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body>
    <div class="actions"><button onclick="window.print()">Tipărire / Salvare PDF</button><button onclick="window.close()">Închide</button></div>
    <div class="head">
      <div class="company"><h2>SC TITAN EURO-COM SRL</h2><div>CUI: RO1749562</div><div>Nr. Reg. Com.: J19/420/2005</div><div>Str. Mihail Sadoveanu 33/c/17, Miercurea-Ciuc, Harghita</div></div>
      <div class="doc-title"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><p><strong>${escapeHtml(item.order_number)}</strong></p></div>
    </div>
    <div class="meta">
      <div class="box"><div class="label">Furnizor</div><div class="value">${escapeHtml(item.supplier_name || "-")}</div></div>
      <div class="box"><div class="label">Gestiune destinatară</div><div class="value">${escapeHtml(item.location_name || "-")}</div></div>
      <div class="box"><div class="label">Data comenzii</div><div class="value">${escapeHtml(dateText(item.order_date))}</div></div>
      <div class="box"><div class="label">Termen estimat</div><div class="value">${escapeHtml(dateText(item.expected_date))}</div></div>
    </div>
    <table><colgroup><col style="width:4%"><col style="width:7%"><col style="width:31%"><col style="width:15%"><col style="width:15%"><col style="width:7%"><col style="width:10%"><col style="width:11%"></colgroup>
      <thead><tr><th>Nr.</th><th>Foto</th><th>Denumire produs / variantă</th><th>Cod produs</th><th>Cod de bare</th><th>Cant.</th><th>P.U. achiziție</th><th>Valoare</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="center">Nu există produse.</td></tr>`}</tbody>
    </table>
    <div class="total"><div class="total-box"><div class="total-row"><span>Total poziții / buc.</span><strong>${lines.length} / ${totalQty}</strong></div><div class="total-row"><span>Valoare totală</span><strong>${totalValue > 0 ? money(totalValue, item.currency_code) : "Fără prețuri"}</strong></div></div></div>
    <div class="note"><strong>Observații:</strong><br>${escapeHtml(item.note || "-")}</div>
    <div class="sign"><div>Întocmit de</div><div>Confirmare furnizor</div></div>
  </body></html>`;
}

function openPurchaseOrderPdf(detail: AifPurchaseOrderDetail, settings: AifPurchaseOrderSettings | null) {
  const html = buildPurchaseOrderPdf(detail, settings).replace("</head>", `<script>window.addEventListener('load',()=>setTimeout(()=>{try{window.focus();window.print()}catch(e){}},450));</script></head>`);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const popup = window.open(url, "_blank", "width=1150,height=850,scrollbars=yes,resizable=yes");
  if (!popup) {
    URL.revokeObjectURL(url);
    throw new Error("A böngésző blokkolta a PDF előnézeti ablakot.");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export default function AllInOrderHistory() {
  const [suppliers, setSuppliers] = useState<AifSupplier[]>([]);
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [currencies, setCurrencies] = useState<AifCurrency[]>([]);
  const [orders, setOrders] = useState<AifPurchaseOrderSummary[]>([]);
  const [summary, setSummary] = useState({ total: 0, draft: 0, ordered: 0, partiallyReceived: 0, received: 0, cancelled: 0, totalQty: 0, receivedQty: 0, remainingQty: 0, totalValue: 0 });
  const [settings, setSettings] = useState<AifPurchaseOrderSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AifPurchaseOrderStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [detail, setDetail] = useState<AifPurchaseOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingOrderNumber, setEditingOrderNumber] = useState("");
  const [formSupplierId, setFormSupplierId] = useState("");
  const [formLocationId, setFormLocationId] = useState("");
  const [formCurrencyCode, setFormCurrencyCode] = useState("RON");
  const [formOrderDate, setFormOrderDate] = useState(todayIso());
  const [formExpectedDate, setFormExpectedDate] = useState("");
  const [formExternalReference, setFormExternalReference] = useState("");
  const [formNote, setFormNote] = useState("");
  const [draftLines, setDraftLines] = useState<PurchaseOrderDraftLine[]>([]);
  const [expandedLineKeys, setExpandedLineKeys] = useState<Record<string, boolean>>({});
  const [inventory, setInventory] = useState<AifInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [manualColor, setManualColor] = useState("");
  const [manualSize, setManualSize] = useState("");
  const [manualImage, setManualImage] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [manualPrice, setManualPrice] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<AifPurchaseOrderSettings | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("");
  const [scannerValue, setScannerValue] = useState("");
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerRafRef = useRef<number | null>(null);
  const scannerHandlingRef = useRef(false);
  const scannerInputRef = useRef<HTMLInputElement | null>(null);

  const filteredInventory = useMemo(() => {
    const q = cleanText(productSearch).toLowerCase();
    if (!q) return [];
    return inventory.filter((item) => {
      const supplierIds = String(item.supplier_ids || "").split(/[;,|]/).map((value) => value.trim()).filter(Boolean);
      if (formSupplierId && supplierIds.length && !supplierIds.includes(formSupplierId)) return false;
      return [
        item.title_ro,
        item.brand_name,
        item.internal_sku,
        item.barcode,
        item.sn_cod,
        item.model_code,
        item.color_name,
        item.size,
        item.supplier_names,
        item.supplier_codes,
        item.supplier_source_codes,
      ].some((value) => String(value || "").toLowerCase().includes(q));
    }).slice(0, 40);
  }, [inventory, productSearch, formSupplierId]);

  const draftTotals = useMemo(() => {
    const qty = draftLines.reduce((sum, line) => sum + Math.max(0, toNumber(line.qty)), 0);
    const value = draftLines.reduce((sum, line) => sum + Math.max(0, toNumber(line.qty)) * Math.max(0, toNumber(line.unitPrice)), 0);
    return { qty, value: Math.round((value + Number.EPSILON) * 100) / 100 };
  }, [draftLines]);

  const allDraftLinesExpanded = draftLines.length > 0 && draftLines.every((line) => expandedLineKeys[line.key]);

  async function loadMeta() {
    const meta = await apiAifMeta();
    setSuppliers((meta.suppliers || []).filter((item) => item.is_active));
    setLocations((meta.locations || []).filter((item) => item.is_active));
    setCurrencies((meta.currencies || []).filter((item) => item.is_active));
  }

  async function loadSettings() {
    const response = await apiAifGetPurchaseOrderSettings();
    setSettings(response.settings || response.item || null);
  }

  async function loadOrders() {
    setBusy(true);
    try {
      const response = await apiAifListPurchaseOrders({
        search,
        supplier: supplierFilter,
        location: locationFilter,
        status: statusFilter,
        from: fromDate,
        to: toDate,
        limit: 1000,
      });
      setOrders(response.items || []);
      setSummary(response.summary || summary);
    } catch (error: any) {
      setMessage(error?.message || "A rendelések betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void (async () => {
      setBusy(true);
      try {
        await Promise.all([loadMeta(), loadSettings()]);
        const response = await apiAifListPurchaseOrders({ limit: 1000 });
        setOrders(response.items || []);
        setSummary(response.summary || summary);
      } catch (error: any) {
        setMessage(error?.message || "A beszerzési rendelések nem tölthetők be.");
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  useEffect(() => {
    const anyModal = editorOpen || Boolean(detail) || settingsOpen || scannerOpen;
    if (!anyModal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (scannerOpen) closeScanner();
      else if (settingsOpen) setSettingsOpen(false);
      else if (detail) setDetail(null);
      else if (editorOpen) setEditorOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previous;
    };
  }, [editorOpen, detail, settingsOpen, scannerOpen]);

  async function ensureInventory() {
    if (inventory.length || inventoryLoading) return inventory;
    setInventoryLoading(true);
    try {
      const response = await apiAifInventory("", 5000);
      const items = response.items || [];
      setInventory(items);
      return items;
    } finally {
      setInventoryLoading(false);
    }
  }

  function resetEditor() {
    setEditingId("");
    setEditingOrderNumber("");
    setFormSupplierId("");
    setFormLocationId(locations[0]?.id || "");
    setFormCurrencyCode(currencies.some((item) => item.code === "RON") ? "RON" : (currencies[0]?.code || "RON"));
    setFormOrderDate(todayIso());
    setFormExpectedDate("");
    setFormExternalReference("");
    setFormNote("");
    setDraftLines([]);
    setExpandedLineKeys({});
    setProductSearch("");
    setManualOpen(false);
    setManualTitle("");
    setManualCode("");
    setManualBarcode("");
    setManualColor("");
    setManualSize("");
    setManualImage("");
    setManualQty("1");
    setManualPrice("");
  }

  async function openNewOrder() {
    resetEditor();
    setEditorOpen(true);
    await ensureInventory();
  }

  async function openEditOrder(order: AifPurchaseOrderSummary) {
    setDetailLoading(true);
    try {
      const response = await apiAifGetPurchaseOrder(order.id);
      if (response.item.status !== "draft") throw new Error("Csak nyitott rendelés szerkeszthető.");
      setEditingId(response.item.id);
      setEditingOrderNumber(response.item.order_number || "");
      setFormSupplierId(response.item.supplier_id);
      setFormLocationId(response.item.target_location_id || "");
      setFormCurrencyCode(response.item.currency_code || "RON");
      setFormOrderDate(String(response.item.order_date || todayIso()).slice(0, 10));
      setFormExpectedDate(String(response.item.expected_date || "").slice(0, 10));
      setFormExternalReference(response.item.external_reference || "");
      setFormNote(response.item.note || "");
      const mappedLines = (response.lines || []).map((line) => ({
        key: line.id || newLineKey(),
        variantId: line.variant_id || null,
        supplierProductCode: line.supplier_product_code || "",
        supplierVariantCode: line.supplier_variant_code || "",
        modelCode: line.model_code || "",
        productTitle: line.product_title,
        brandName: line.brand_name || "",
        categoryName: line.category_name || "",
        barcode: line.barcode || "",
        snCod: line.sn_cod || "",
        customsTariffCode: line.customs_tariff_code || "",
        colorName: line.color_name || "",
        colorCode: line.color_code || "",
        size: line.size || "",
        gender: line.gender || "",
        productType: line.product_type || "",
        material: line.material || "",
        descriptionRo: line.description_ro || "",
        imageUrl: line.image_url || "",
        qty: Math.max(1, toNumber(line.qty_ordered)),
        unitPrice: line.unit_price === null || line.unit_price === undefined ? "" : String(line.unit_price),
      }));
      setDraftLines(mappedLines);
      const initiallyExpanded = mappedLines.length <= 5 ? mappedLines : mappedLines.slice(0, 1);
      setExpandedLineKeys(Object.fromEntries(initiallyExpanded.map((line) => [line.key, true])));
      setEditorOpen(true);
      await ensureInventory();
    } catch (error: any) {
      setMessage(error?.message || "A rendelés nem tölthető szerkesztésre.");
    } finally {
      setDetailLoading(false);
    }
  }

  function addInventoryLine(item: AifInventoryItem) {
    const existing = draftLines.find((line) => String(line.variantId || "") === String(item.variant_id));
    if (existing) {
      setDraftLines((current) => current.map((line) => line.key === existing.key ? { ...line, qty: Math.max(1, toNumber(line.qty)) + 1 } : line));
      setExpandedLineKeys((expanded) => ({ ...expanded, [existing.key]: true }));
      setProductSearch("");
      return;
    }

    const newKey = newLineKey();
    setDraftLines((current) => [...current, {
      key: newKey,
      variantId: item.variant_id,
      supplierProductCode: firstSupplierCode(item.supplier_source_codes) || item.model_code || item.internal_sku || "",
      modelCode: item.model_code || "",
      productTitle: item.title_ro,
      brandName: item.brand_name || "",
      categoryName: item.subcategory_name_ro || item.category_name_ro || "",
      barcode: item.barcode || "",
      snCod: item.sn_cod || "",
      colorName: item.color_name || "",
      colorCode: item.color_code || "",
      size: item.size || "",
      gender: item.gender || "",
      productType: item.product_type || "",
      material: item.material || "",
      imageUrl: item.image_url || "",
      qty: 1,
      unitPrice: item.buy_price === null || item.buy_price === undefined ? "" : String(item.buy_price),
    }]);
    setExpandedLineKeys((expanded) => ({ ...expanded, [newKey]: true }));
    setProductSearch("");
  }

  function addManualLine() {
    if (!manualTitle.trim()) {
      setMessage("A manuális terméksornál a terméknév kötelező.");
      return;
    }
    const qty = Math.max(1, Math.floor(toNumber(manualQty) || 1));
    const key = newLineKey();
    setDraftLines((current) => [...current, {
      key,
      variantId: null,
      supplierProductCode: manualCode.trim(),
      modelCode: manualCode.trim(),
      productTitle: manualTitle.trim(),
      barcode: manualBarcode.trim(),
      colorName: manualColor.trim(),
      size: manualSize.trim(),
      imageUrl: manualImage.trim(),
      qty,
      unitPrice: manualPrice.trim(),
    }]);
    setExpandedLineKeys((expanded) => ({ ...expanded, [key]: true }));
    setManualTitle("");
    setManualCode("");
    setManualBarcode("");
    setManualColor("");
    setManualSize("");
    setManualImage("");
    setManualQty("1");
    setManualPrice("");
    setManualOpen(false);
  }

  function updateDraftLine(key: string, patch: Partial<PurchaseOrderDraftLine>) {
    setDraftLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function toggleDraftLine(key: string) {
    setExpandedLineKeys((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleAllDraftLines() {
    if (allDraftLinesExpanded) {
      setExpandedLineKeys({});
      return;
    }
    setExpandedLineKeys(Object.fromEntries(draftLines.map((line) => [line.key, true])));
  }

  function removeDraftLine(key: string) {
    setDraftLines((current) => current.filter((line) => line.key !== key));
    setExpandedLineKeys((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function saveOrder() {
    if (!formSupplierId) return setMessage("Beszállító kiválasztása kötelező.");
    if (!draftLines.length) return setMessage("A rendeléshez legalább egy terméksor kell.");
    if (draftLines.some((line) => !cleanText(line.productTitle) || toNumber(line.qty) <= 0)) return setMessage("Minden sorban legyen terméknév és pozitív mennyiség.");
    setBusy(true);
    setMessage("");
    try {
      const payload = {
        supplierId: formSupplierId,
        targetLocationId: formLocationId || null,
        currencyCode: formCurrencyCode || "RON",
        orderDate: formOrderDate,
        expectedDate: formExpectedDate || null,
        externalReference: formExternalReference || null,
        note: formNote || null,
        lines: draftLines.map((line) => ({
          ...line,
          sellPrice: null,
          sell_price: null,
          qtyOrdered: Math.max(1, Math.floor(toNumber(line.qty))),
          unitPrice: line.unitPrice === "" ? null : toNumber(line.unitPrice),
        })),
      };
      const response = editingId
        ? await apiAifUpdatePurchaseOrder(editingId, payload)
        : await apiAifCreatePurchaseOrder(payload);
      setEditorOpen(false);
      resetEditor();
      setMessage(`${response.item.order_number} nyitott rendelésként mentve.`);
      await loadOrders();
      await openDetail(response.item.id);
    } catch (error: any) {
      setMessage(error?.message || "A rendelés mentése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      setDetail(await apiAifGetPurchaseOrder(id));
    } catch (error: any) {
      setMessage(error?.message || "A rendelés részletei nem tölthetők be.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function markOrdered(id: string) {
    if (!window.confirm("Biztosan elküldöttnek jelölöd ezt a rendelést? Ezután a terméksorok nem szerkeszthetők.")) return;
    setBusy(true);
    try {
      await apiAifMarkPurchaseOrderOrdered(id);
      setMessage("A rendelés Rendelve állapotba került.");
      await loadOrders();
      setDetail(await apiAifGetPurchaseOrder(id));
    } catch (error: any) {
      setMessage(error?.message || "Az állapot módosítása nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(id: string) {
    if (!window.confirm("Biztosan törölt állapotba teszed ezt a rendelést?")) return;
    setBusy(true);
    try {
      await apiAifCancelPurchaseOrder(id);
      setMessage("A rendelés törölt állapotba került.");
      await loadOrders();
      setDetail(await apiAifGetPurchaseOrder(id));
    } catch (error: any) {
      setMessage(error?.message || "A rendelés törlése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteOrder(id: string) {
    if (!window.confirm("A rendelést és a terméksorait véglegesen törlöd. Folytatod?")) return;
    setBusy(true);
    try {
      await apiAifDeletePurchaseOrder(id);
      setDetail(null);
      setMessage("A rendelés véglegesen törölve.");
      await loadOrders();
    } catch (error: any) {
      setMessage(error?.message || "A rendelés végleges törlése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function startReception(detailValue: AifPurchaseOrderDetail) {
    const remaining = detailValue.lines.reduce((sum, line) => sum + Math.max(0, toNumber(line.qty_remaining ?? (toNumber(line.qty_ordered) - toNumber(line.qty_received)))), 0);
    if (remaining <= 0) {
      setMessage("Ehhez a rendeléshez nincs hátralévő bevételezendő mennyiség.");
      return;
    }
    try {
      window.sessionStorage.setItem(RECEIVE_HANDOFF_KEY, JSON.stringify({ id: detailValue.item.id, orderNumber: detailValue.item.order_number }));
    } catch {}
    window.location.hash = "#allinincoming";
  }

  async function printOrder(id: string) {
    try {
      const value = detail?.item.id === id ? detail : await apiAifGetPurchaseOrder(id);
      openPurchaseOrderPdf(value, settings);
    } catch (error: any) {
      setMessage(error?.message || "A PDF előnézet nem készíthető el.");
    }
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setBusy(true);
    try {
      const response = await apiAifSavePurchaseOrderSettings(settingsDraft);
      setSettings(response.settings || response.item || null);
      setSettingsOpen(false);
      setMessage("A rendelésszámozás beállítása mentve.");
    } catch (error: any) {
      setMessage(error?.message || "A számozási beállítás mentése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  function stopScanner() {
    if (scannerRafRef.current !== null) window.cancelAnimationFrame(scannerRafRef.current);
    scannerRafRef.current = null;
    scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
    scannerStreamRef.current = null;
    if (scannerVideoRef.current) scannerVideoRef.current.srcObject = null;
    scannerHandlingRef.current = false;
  }

  function closeScanner() {
    stopScanner();
    setScannerOpen(false);
    setScannerStatus("");
    setScannerValue("");
  }

  async function handleScannedCode(rawValue: unknown) {
    const code = cleanText(rawValue);
    if (!code || scannerHandlingRef.current) return;
    scannerHandlingRef.current = true;
    const items = await ensureInventory();
    const key = code.toLowerCase();
    const found = items.find((item) => [item.barcode, item.internal_sku, item.sn_cod, item.model_code, item.supplier_source_codes]
      .some((value) => String(value || "").trim().toLowerCase() === key));
    if (!found) {
      scannerHandlingRef.current = false;
      setScannerStatus(`A ${code} kódhoz nem találtam terméket. Kereshetsz név vagy beszállítói kód alapján.`);
      setProductSearch(code);
      return;
    }
    addInventoryLine(found);
    closeScanner();
    setMessage(`${found.title_ro} hozzáadva a rendeléshez.`);
  }

  function openScanner() {
    setScannerOpen(true);
    setScannerStatus("Kamera indítása. USB-s olvasóval szkenneld be a kódot, majd Enter.");
    window.setTimeout(() => scannerInputRef.current?.focus(), 120);
  }

  useEffect(() => {
    if (!scannerOpen) return;
    let cancelled = false;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setScannerStatus("A kamera ezen az eszközön nem érhető el. Az USB-s olvasó továbbra is használható.");
          return;
        }
        const Detector = (window as any).BarcodeDetector as BarcodeDetectorConstructor | undefined;
        if (!Detector) {
          setScannerStatus("A böngésző nem támogatja az automatikus kameraolvasást. Használd az USB-s olvasót vagy írd be a kódot.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        scannerStreamRef.current = stream;
        const video = scannerVideoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({ formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39", "itf"] });
        setScannerStatus("Kamera aktív. Tartsd a vonalkódot a keretbe.");
        const loop = async () => {
          if (cancelled || scannerHandlingRef.current) return;
          if (video.readyState >= 2) {
            try {
              const rows = await detector.detect(video);
              const code = rows.find((row) => cleanText(row.rawValue))?.rawValue;
              if (code) return void handleScannedCode(code);
            } catch {}
          }
          scannerRafRef.current = window.requestAnimationFrame(loop);
        };
        scannerRafRef.current = window.requestAnimationFrame(loop);
      } catch (error: any) {
        setScannerStatus(error?.name === "NotAllowedError" ? "A kamera nincs engedélyezve. Engedélyezd, vagy használd az USB-s olvasót." : "A kamera nem indítható. Az USB-s olvasó használható.");
      }
    };
    void start();
    return () => { cancelled = true; stopScanner(); };
  }, [scannerOpen]);

  return (
    <main className={page}>
      <div className={wrap}>
        <header className={topCard}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[250px] items-center gap-3 border-l-4 border-[#7bd7d4]/70 pl-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#67d4d1]/35 bg-[#253447] text-[#8ee6e2]"><ShoppingCart size={22} /></span>
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/70">AllInFashion</p>
                <h1 className="mt-0.5 text-xl tracking-tight">Beszerzési rendelések</h1>
                <p className="mt-0.5 text-[11px] text-white/55">Beszállítói rendelések, PDF és bevételezési követés</p>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <button className={neutralBtn} onClick={() => { setSettingsDraft(settings); setSettingsOpen(true); }} type="button"><Settings size={14} /> Beállítás</button>
              <button className={primaryBtn} onClick={() => void openNewOrder()} type="button"><Plus size={15} /> Új rendelés</button>
              <button className={neutralBtn} onClick={() => void loadOrders()} disabled={busy} type="button"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Frissítés</button>
              <button className={neutralBtn} onClick={goHome} type="button"><Home size={14} /> Kezdőlap</button>
            </div>
          </div>
        </header>

        {message && <div className="rounded-xl border border-[#67d4d1]/35 bg-[#17434b] px-3 py-2 text-sm text-white/90">{message}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Összes rendelés", summary.total, <ClipboardList size={16} />],
            ["Nyitott", summary.draft, <Edit3 size={16} />],
            ["Rendelve", summary.ordered, <Send size={16} />],
            ["Részben beérkezett", summary.partiallyReceived, <Truck size={16} />],
            ["Beérkezett", summary.received, <PackageCheck size={16} />],
          ].map(([title, value, icon]) => (
            <div key={String(title)} className="rounded-2xl border border-white/18 bg-[#4d5869] px-4 py-3 shadow-lg shadow-slate-950/12">
              <div className="flex items-center justify-between text-white/55"><span className="text-[9px] uppercase tracking-[0.12em]">{title}</span>{icon}</div>
              <p className="mt-2 text-2xl">{String(value)}</p>
            </div>
          ))}
        </section>

        <section className={`${card} p-4`}>
          <div className="mb-3 flex items-center gap-2"><Search size={16} className="text-[#8ee6e2]" /><h2 className="text-base">Szűrés és gyors visszakeresés</h2></div>
          <div className="grid gap-3 lg:grid-cols-[1.7fr_1fr_1fr_1fr_0.85fr_0.85fr_auto]">
            <input className={input} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadOrders(); }} placeholder="Rendelésszám, termék, kód, beszállító..." />
            <CompactSelect size="compact" value={supplierFilter} onChange={setSupplierFilter} placeholder="Minden beszállító" options={[{ value: "", label: "Minden beszállító" }, ...suppliers.map((item) => ({ value: item.id, label: item.name }))]} />
            <CompactSelect size="compact" value={locationFilter} onChange={setLocationFilter} placeholder="Minden célhely" options={[{ value: "", label: "Minden célhely" }, ...locations.map((item) => ({ value: item.id, label: item.name }))]} />
            <CompactSelect size="compact" value={statusFilter} onChange={(next) => setStatusFilter(next as "all" | AifPurchaseOrderStatus)} options={[{ value: "all", label: "Minden állapot" }, { value: "draft", label: "Nyitott" }, { value: "ordered", label: "Rendelve" }, { value: "partially_received", label: "Részben beérkezett" }, { value: "received", label: "Beérkezett" }, { value: "cancelled", label: "Törölt" }]} />
            <input className={input} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <input className={input} type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            <button className={primaryBtn} onClick={() => void loadOrders()} disabled={busy} type="button"><Search size={14} /> Keresés</button>
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/14 bg-[#303b4e] px-4 py-3">
            <div><p className="text-[9px] uppercase tracking-[0.14em] text-white/48">Rendelési archívum</p><h2 className="mt-1 text-base">Beszállítói rendelések</h2></div>
            <div className="text-xs text-white/65">{orders.length} találat • Hátralévő: {summary.remainingQty} db</div>
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-[#26364c] text-[9px] uppercase tracking-[0.08em] text-white/70"><tr><th className="px-4 py-3 text-left">Rendelés</th><th className="px-3 py-3 text-left">Beszállító / célhely</th><th className="px-3 py-3 text-left">Dátum</th><th className="px-3 py-3 text-center">Sor / db</th><th className="px-3 py-3 text-center">Beérkezés</th><th className="px-3 py-3 text-right">Érték</th><th className="px-4 py-3 text-right">Művelet</th></tr></thead>
              <tbody>{orders.map((order) => {
                const total = toNumber(order.total_qty);
                const received = toNumber(order.received_qty);
                const progress = total > 0 ? Math.min(100, Math.round(received / total * 100)) : 0;
                return <tr key={order.id} className="border-t border-white/12 hover:bg-white/[0.035]">
                  <td className="px-4 py-3"><p className="text-white">{order.order_number}</p><span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${statusClass(order.status)}`}>{statusLabel(order.status)}</span></td>
                  <td className="px-3 py-3"><p>{order.supplier_name || "-"}</p><p className="mt-1 text-xs text-white/50">{order.location_name || "Nincs célhely"}</p></td>
                  <td className="px-3 py-3"><p>{dateText(order.order_date)}</p><p className="mt-1 text-xs text-white/50">Várható: {dateText(order.expected_date)}</p></td>
                  <td className="px-3 py-3 text-center"><span className="rounded-full border border-white/20 bg-[#354153] px-2 py-1 text-xs">{order.line_count || 0} sor • {total} db</span></td>
                  <td className="px-3 py-3"><div className="mx-auto w-28"><div className="mb-1 flex justify-between text-[10px] text-white/55"><span>{received}/{total}</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#303b4e]"><div className="h-full rounded-full bg-[#2a8d8b]" style={{ width: `${progress}%` }} /></div></div></td>
                  <td className="px-3 py-3 text-right">{toNumber(order.total_value) > 0 ? money(order.total_value, order.currency_code) : "-"}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1.5"><button className={neutralBtn} onClick={() => void openDetail(order.id)} type="button"><FileText size={13} /> Részletek</button>{order.status === "draft" && <button className={neutralBtn} onClick={() => void openEditOrder(order)} type="button"><Edit3 size={13} /></button>}<button className={neutralBtn} onClick={() => void printOrder(order.id)} type="button"><FileText size={13} /> PDF</button></div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 lg:hidden">{orders.map((order) => <article key={order.id} className="rounded-2xl border border-white/16 bg-[#354153] p-3"><div className="flex items-start justify-between gap-3"><div><p>{order.order_number}</p><p className="mt-1 text-xs text-white/55">{order.supplier_name || "-"} • {order.location_name || "-"}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] ${statusClass(order.status)}`}>{statusLabel(order.status)}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-[#303b4e] p-2"><span className="text-white/45">Sor</span><p className="mt-1">{order.line_count || 0}</p></div><div className="rounded-xl bg-[#303b4e] p-2"><span className="text-white/45">Rendelt</span><p className="mt-1">{order.total_qty || 0}</p></div><div className="rounded-xl bg-[#303b4e] p-2"><span className="text-white/45">Hátra</span><p className="mt-1">{order.remaining_qty || 0}</p></div></div><div className="mt-3 flex justify-end gap-2"><button className={neutralBtn} onClick={() => void openDetail(order.id)} type="button"><FileText size={13} /> Részletek</button>{order.status === "draft" && <button className={neutralBtn} onClick={() => void openEditOrder(order)} type="button"><Edit3 size={13} /> Szerkesztés</button>}</div></article>)}</div>
          {!orders.length && <div className="px-4 py-16 text-center text-white/55"><ShoppingCart className="mx-auto mb-3" size={34} /><p>Nincs a szűrésnek megfelelő beszerzési rendelés.</p></div>}
        </section>
      </div>

      {editorOpen && (
        <div className={modalBackdrop} role="dialog" aria-modal="true">
          <div className={`${modalCard} max-w-[1320px]`}>
            <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/14 bg-[#303b4e] px-4 py-3">
              <div><p className="text-[9px] uppercase tracking-[0.14em] text-white/50">{editingId ? "Rendelés szerkesztése" : "Új beszerzési rendelés"}</p><h2 className="mt-1 text-lg">{editingOrderNumber || editingId || settings?.previewNumber || "Új rendelés"}</h2></div>
              <div className="flex gap-2"><button className={primaryBtn} onClick={() => void saveOrder()} disabled={busy} type="button">{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Mentés</button><button className={neutralBtn} onClick={() => setEditorOpen(false)} type="button"><X size={14} /> Bezárás</button></div>
            </div>
            <div className="space-y-4 p-4">
              <section className="rounded-2xl border border-white/16 bg-[#4d5869] p-3">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
                  <label className={`${label} lg:col-span-2`}>Beszállító<CompactSelect size="compact" value={formSupplierId} onChange={setFormSupplierId} placeholder="Válassz beszállítót" options={[{ value: "", label: "Válassz beszállítót" }, ...suppliers.map((item) => ({ value: item.id, label: item.name }))]} /></label>
                  <label className={`${label} lg:col-span-2`}>Célhely<CompactSelect size="compact" value={formLocationId} onChange={setFormLocationId} placeholder="Nincs megadva" options={[{ value: "", label: "Nincs megadva" }, ...locations.map((item) => ({ value: item.id, label: item.name }))]} /></label>
                  <label className={label}>Pénznem<CompactSelect size="compact" menuMinWidth={150} value={formCurrencyCode} onChange={setFormCurrencyCode} placeholder={formCurrencyCode || "RON"} options={currencies.map((item) => ({ value: item.code, label: item.code }))} /></label>
                  <label className={label}>Rendelés dátuma<input className={input} type="date" value={formOrderDate} onChange={(event) => setFormOrderDate(event.target.value)} /></label>
                  <label className={label}>Várható érkezés<input className={input} type="date" value={formExpectedDate} onChange={(event) => setFormExpectedDate(event.target.value)} /></label>
                  <label className={`${label} lg:col-span-2`}>Beszállítói hivatkozás<input className={input} value={formExternalReference} onChange={(event) => setFormExternalReference(event.target.value)} placeholder="opcionális" /></label>
                  <label className={`${label} lg:col-span-3`}>Megjegyzés<input className={input} value={formNote} onChange={(event) => setFormNote(event.target.value)} placeholder="a rendeléshez és a PDF-re" /></label>
                </div>
              </section>

              <section className="rounded-2xl border border-white/16 bg-[#4d5869] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/48">Termék hozzáadása</p><h3 className="mt-1">Raktári termék vagy új beszállítói sor</h3></div><div className="flex gap-2"><button className={neutralBtn} onClick={openScanner} type="button"><Barcode size={14} /> Vonalkód</button><button className={neutralBtn} onClick={() => setManualOpen((value) => !value)} type="button"><Plus size={14} /> Új terméksor</button></div></div>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-2.5 text-white/40" size={16} />
                  <input className={`${input} pl-9`} value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Terméknév, vonalkód, SKU, S/N/COD, beszállítói kód..." />
                  {productSearch && <div className="absolute left-0 right-0 top-11 z-30 max-h-80 overflow-y-auto rounded-2xl border border-white/20 bg-[#263246] p-2 shadow-2xl">{inventoryLoading && <p className="p-3 text-sm text-white/60">Termékek betöltése...</p>}{filteredInventory.map((item) => <button key={item.variant_id} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/8" onClick={() => addInventoryLine(item)} type="button"><ProductImage src={item.image_url} title={item.title_ro} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{item.title_ro}</span><span className="mt-1 block truncate text-xs text-white/50">{item.brand_name || "-"} • {item.color_name || "-"} • {item.size || "-"} • {item.barcode || item.internal_sku || "-"}</span></span><Plus size={15} /></button>)}{!inventoryLoading && !filteredInventory.length && <p className="p-3 text-sm text-white/55">Nincs találat. Új terméksorként is hozzáadható.</p>}</div>}
                </div>

                {manualOpen && <div className="mt-3 rounded-2xl border border-[#67d4d1]/30 bg-[#303b4e] p-3"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-8"><label className={`${label} lg:col-span-2`}>Terméknév<input className={input} value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} /></label><label className={label}>Termékkód<input className={input} value={manualCode} onChange={(event) => setManualCode(event.target.value)} /></label><label className={label}>Vonalkód<input className={input} value={manualBarcode} onChange={(event) => setManualBarcode(event.target.value)} /></label><label className={label}>Szín<input className={input} value={manualColor} onChange={(event) => setManualColor(event.target.value)} /></label><label className={label}>Méret<input className={input} value={manualSize} onChange={(event) => setManualSize(event.target.value)} /></label><label className={label}>Darab<input className={input} value={manualQty} onChange={(event) => setManualQty(event.target.value)} inputMode="numeric" /></label><label className={label}>Vételár<input className={input} value={manualPrice} onChange={(event) => setManualPrice(event.target.value)} inputMode="decimal" /></label><label className={`${label} sm:col-span-2 lg:col-span-7`}>Fotó URL, ha van<input className={input} value={manualImage} onChange={(event) => setManualImage(event.target.value)} /></label><div className="flex items-end"><button className={`${primaryBtn} w-full`} onClick={addManualLine} type="button"><Plus size={14} /> Hozzáadás</button></div></div></div>}
              </section>

              <section className="overflow-hidden rounded-2xl border border-white/16 bg-[#4d5869]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/14 bg-[#303b4e] px-4 py-3">
                  <div>
                    <h3>Rendelési sorok</h3>
                    <p className="mt-1 text-xs text-white/50">{draftLines.length} sor • {draftTotals.qty} db • minden rendelési adat szerkeszthető</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {draftLines.length > 0 && <button className={neutralBtn} onClick={toggleAllDraftLines} type="button"><Edit3 size={13} /> {allDraftLinesExpanded ? "Minden sor összecsukása" : "Minden sor kibontása"}</button>}
                    <p className="text-sm">Összesen: {draftTotals.value > 0 ? money(draftTotals.value, formCurrencyCode) : "ár nélkül"}</p>
                  </div>
                </div>
                <div className="grid gap-2 p-3">
                  {draftLines.map((line, index) => (
                    <PurchaseOrderLineEditor
                      key={line.key}
                      line={line}
                      index={index}
                      currencyCode={formCurrencyCode}
                      expanded={Boolean(expandedLineKeys[line.key])}
                      onToggle={() => toggleDraftLine(line.key)}
                      onChange={(patch) => updateDraftLine(line.key, patch)}
                      onRemove={() => removeDraftLine(line.key)}
                    />
                  ))}
                  {!draftLines.length && <div className="py-12 text-center text-white/50"><ShoppingCart className="mx-auto mb-3" size={32} /><p>Még nincs termék a rendelésben.</p></div>}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className={modalBackdrop} role="dialog" aria-modal="true">
          <div className={`${modalCard} max-w-[1280px]`}>
            <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/14 bg-[#303b4e] px-4 py-3"><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/50">Beszerzési rendelés</p><h2 className="mt-1 text-xl">{detail.item.order_number}</h2><p className="mt-1 text-xs text-white/55">{detail.item.supplier_name || "-"}</p></div><div className="flex flex-wrap gap-2"><button className={neutralBtn} onClick={() => printOrder(detail.item.id)} type="button"><FileText size={14} /> PDF</button>{detail.item.status === "draft" && <button className={neutralBtn} onClick={() => { setDetail(null); void openEditOrder(detail.item); }} type="button"><Edit3 size={14} /> Szerkesztés</button>}{detail.item.status === "draft" && <button className={primaryBtn} onClick={() => void markOrdered(detail.item.id)} type="button"><Send size={14} /> Rendelés elküldve</button>}{["ordered", "partially_received"].includes(detail.item.status) && <button className={primaryBtn} onClick={() => startReception(detail)} type="button"><Truck size={14} /> Bevételezés indítása</button>}<button className={neutralBtn} onClick={() => setDetail(null)} type="button"><X size={14} /> Bezárás</button></div></div>
            <div className="space-y-4 p-4">
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{[["Állapot", statusLabel(detail.item.status)], ["Rendelés dátuma", dateText(detail.item.order_date)], ["Várható", dateText(detail.item.expected_date)], ["Célhely", detail.item.location_name || "-"], ["Rendelt", `${detail.item.total_qty || 0} db`], ["Hátralévő", `${detail.item.remaining_qty || 0} db`]].map(([key, value]) => <div key={String(key)} className="rounded-2xl border border-white/16 bg-[#354153] px-3 py-2"><p className="text-[9px] uppercase tracking-[0.1em] text-white/45">{key}</p><p className="mt-1 text-sm">{value}</p></div>)}</section>
              <section className="overflow-hidden rounded-2xl border border-white/16"><div className="border-b border-white/14 bg-[#303b4e] px-4 py-3"><h3>Rendelt termékek</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-sm"><thead className="bg-[#26364c] text-[9px] uppercase tracking-[0.08em] text-white/65"><tr><th className="px-3 py-3 text-left">#</th><th className="px-3 py-3 text-left">Kép</th><th className="px-3 py-3 text-left">Termék</th><th className="px-3 py-3 text-left">Azonosító</th><th className="px-3 py-3 text-center">Rendelt</th><th className="px-3 py-3 text-center">Beérkezett</th><th className="px-3 py-3 text-center">Hátra</th><th className="px-3 py-3 text-right">Vételár</th><th className="px-3 py-3 text-right">Érték</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id} className="border-t border-white/12"><td className="px-3 py-3">{line.line_no}</td><td className="px-3 py-3"><ProductImage src={line.image_url} title={line.product_title} size="sm" /></td><td className="px-3 py-3"><p>{line.product_title}</p><p className="mt-1 text-xs text-white/48">{[line.brand_name, line.color_name, line.size].filter(Boolean).join(" • ")}</p></td><td className="px-3 py-3"><p className="font-mono text-xs">{line.supplier_product_code || line.model_code || "-"}</p><p className="mt-1 font-mono text-[10px] text-white/45">{line.barcode || "-"}</p></td><td className="px-3 py-3 text-center">{line.qty_ordered}</td><td className="px-3 py-3 text-center text-emerald-100">{line.qty_received}</td><td className="px-3 py-3 text-center text-amber-100">{line.qty_remaining}</td><td className="px-3 py-3 text-right">{line.unit_price === null || line.unit_price === undefined ? "-" : money(line.unit_price, detail.item.currency_code)}</td><td className="px-3 py-3 text-right">{line.line_total === null || line.line_total === undefined ? "-" : money(line.line_total, detail.item.currency_code)}</td></tr>)}</tbody></table></div></section>
              {detail.item.note && <section className="rounded-2xl border border-white/16 bg-[#354153] p-3"><p className="text-[9px] uppercase tracking-[0.1em] text-white/45">Megjegyzés</p><p className="mt-2 text-sm text-white/85">{detail.item.note}</p></section>}
              <div className="flex flex-wrap justify-between gap-2 border-t border-white/12 pt-3"><div>{detail.item.status !== "received" && detail.item.status !== "partially_received" && detail.item.status !== "cancelled" && <button className={dangerBtn} onClick={() => void cancelOrder(detail.item.id)} type="button"><X size={14} /> Törölt állapot</button>}</div><div className="flex gap-2">{toNumber(detail.item.received_qty) <= 0 && <button className={dangerBtn} onClick={() => void deleteOrder(detail.item.id)} type="button"><Trash2 size={14} /> Végleges törlés</button>}<button className={neutralBtn} onClick={() => setDetail(null)} type="button">Bezárás</button></div></div>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && settingsDraft && (
        <div className={modalBackdrop} role="dialog" aria-modal="true"><div className={`${modalCard} max-w-2xl`}><div className="flex items-center justify-between border-b border-white/14 bg-[#303b4e] px-4 py-3"><div><p className="text-[9px] uppercase tracking-[0.14em] text-white/50">Admin settings</p><h2 className="mt-1 text-lg">Rendelésszámozás</h2></div><button className={neutralBtn} onClick={() => setSettingsOpen(false)} type="button"><X size={14} /> Bezárás</button></div><div className="space-y-4 p-4"><div className="grid gap-3 sm:grid-cols-2"><label className={label}>Sorozat<input className={input} value={settingsDraft.series} onChange={(event) => setSettingsDraft({ ...settingsDraft, series: event.target.value })} /></label><label className={label}>Következő szám<input className={input} type="number" min={1} value={settingsDraft.nextNumber} onChange={(event) => setSettingsDraft({ ...settingsDraft, nextNumber: Math.max(1, Number(event.target.value || 1)) })} /></label><label className={label}>Számjegyek<input className={input} type="number" min={3} max={10} value={settingsDraft.digits} onChange={(event) => setSettingsDraft({ ...settingsDraft, digits: Math.max(3, Math.min(10, Number(event.target.value || 6))) })} /></label><label className={label}>Év<input className={input} type="number" value={settingsDraft.sequenceYear} onChange={(event) => setSettingsDraft({ ...settingsDraft, sequenceYear: Number(event.target.value || new Date().getFullYear()) })} /></label><label className={`${label} sm:col-span-2`}>Dokumentum címe<input className={input} value={settingsDraft.documentTitle} onChange={(event) => setSettingsDraft({ ...settingsDraft, documentTitle: event.target.value })} /></label><label className={`${label} sm:col-span-2`}>Alcím<input className={input} value={settingsDraft.documentSubtitle} onChange={(event) => setSettingsDraft({ ...settingsDraft, documentSubtitle: event.target.value })} /></label></div><div className="rounded-2xl border border-[#67d4d1]/30 bg-[#173f48] p-3"><p className="text-[9px] uppercase tracking-[0.12em] text-white/50">Következő rendelésszám</p><p className="mt-1 text-xl">{purchaseOrderPreview(settingsDraft)}</p></div><div className="flex justify-end gap-2"><button className={neutralBtn} onClick={() => setSettingsOpen(false)} type="button">Mégse</button><button className={primaryBtn} onClick={() => void saveSettings()} type="button"><Save size={14} /> Mentés</button></div></div></div></div>
      )}

      {scannerOpen && (
        <div className={modalBackdrop} role="dialog" aria-modal="true"><div className={`${modalCard} max-w-2xl`}><div className="flex items-center justify-between border-b border-white/14 bg-[#303b4e] px-4 py-3"><div className="flex items-center gap-3"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#2a8d8b]"><Barcode size={20} /></span><div><h2 className="text-lg">Termék hozzáadása vonalkóddal</h2><p className="mt-1 text-xs text-white/55">Kamera vagy USB-s olvasó</p></div></div><button className={neutralBtn} onClick={closeScanner} type="button"><X size={14} /> Bezárás</button></div><div className="grid gap-3 p-4 lg:grid-cols-[1.15fr_.85fr]"><div className="relative min-h-[280px] overflow-hidden rounded-2xl border border-white/16 bg-[#202838]"><video ref={scannerVideoRef} className="h-[300px] w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-28 w-[82%] rounded-2xl border-2 border-[#7bd7d4] shadow-[0_0_0_999px_rgba(2,6,23,.28)]" /></div><div className="absolute bottom-2 left-2 right-2 rounded-xl bg-slate-950/75 px-3 py-2 text-xs text-white/80"><Camera size={14} className="mr-1 inline" />{scannerStatus}</div></div><div className="rounded-2xl border border-white/14 bg-[#354153] p-3"><div className="flex items-center gap-2"><Keyboard size={16} /> USB-s olvasó / kézi kód</div><input ref={scannerInputRef} className={`${input} mt-3 font-mono`} value={scannerValue} onChange={(event) => setScannerValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleScannedCode(event.currentTarget.value); } }} placeholder="EAN / barcode" /><button className={`${primaryBtn} mt-3 w-full`} onClick={() => void handleScannedCode(scannerValue)} type="button"><Barcode size={14} /> Azonosítás</button></div></div></div></div>
      )}

      {detailLoading && <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/45"><Loader2 size={32} className="animate-spin text-[#8ee6e2]" /></div>}
    </main>
  );
}
