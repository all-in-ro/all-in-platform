import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  Boxes,
  ClipboardList,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  Filter,
  ImagePlus,
  MoreVertical,
  Trash2,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";

const page = "min-h-screen bg-[#4b5362] px-3 py-5 text-white font-normal sm:px-4 sm:py-7";
const shell = "mx-auto max-w-7xl space-y-4";
const panel = "rounded-2xl border border-white/14 bg-white/[0.07] shadow-lg";
const panelHead = "flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3";
const btn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/20 bg-[#354153] px-3 text-xs text-white hover:bg-[#3e4d63] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const btnSoft = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-3 text-xs text-white hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const dangerBtn = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-300/35 bg-rose-600 px-3 text-xs text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const input = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45";
const select = "h-10 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-sm text-white outline-none focus:border-white/45";
const label = "grid gap-1.5 text-xs text-white/70";
const chip = "rounded-full border border-white/12 bg-white/[0.08] px-2.5 py-1 text-xs text-white/70";
const selectBox = "h-4 w-4 rounded border-white/30 bg-[#303a4c] accent-[#2a8d8b] focus:ring-2 focus:ring-[#2a8d8b]/45";
const modalWrap = "fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-3 py-4 backdrop-blur-sm sm:items-center";
const modal = "max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl border border-white/16 bg-[#4b5362] shadow-2xl";
const taxonomyModal = "max-h-[92vh] w-full max-w-[1140px] overflow-auto rounded-[26px] border border-white/20 bg-[#4b5362] shadow-2xl";
const taxonomyCard = "rounded-2xl border border-white/18 bg-[#566171] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_24px_rgba(15,23,42,0.10)]";
const taxonomyTabBase = "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs transition-colors font-normal";
const taxonomyTabActive = `${taxonomyTabBase} border-emerald-300/42 bg-emerald-500/18 text-white shadow-[0_0_0_1px_rgba(110,231,183,0.12)]`;
const taxonomyTabIdle = `${taxonomyTabBase} border-white/16 bg-[#3f4959] text-white/78 hover:bg-[#475365]`;
const taxonomySmallBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/18 bg-[#3f4959] px-2.5 text-[11px] text-white/88 hover:bg-[#475365] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const taxonomyPrimaryBtn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/35 bg-[#276454] px-3 text-xs text-white hover:bg-[#2d735f] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const taxonomyDangerBtn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-300/30 bg-[#d31126] px-2.5 text-[11px] text-white shadow-[0_0_0_1px_rgba(248,113,113,0.06)] hover:bg-[#b90f21] disabled:cursor-not-allowed disabled:opacity-50 font-normal";
const taxonomyField = "grid gap-1.5 text-[11px] text-white/72";
const taxonomyInput = "h-9 rounded-xl border border-white/18 bg-[#3f4959] px-3 text-[13px] text-white outline-none placeholder:text-white/42 focus:border-emerald-200/50";
const taxonomyTextarea = "min-h-[74px] rounded-xl border border-white/18 bg-[#3f4959] px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/42 focus:border-emerald-200/50";
const taxonomyRow = "relative flex items-center justify-between gap-3 rounded-xl border border-white/14 bg-[#495466] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

const selectedProductsStorageKey = "allinfashion:warehouse:selectedVariants:v1";
const selectedProductActionsStorageKey = "allinfashion:warehouse:selectedVariantActions:v1";

type SelectedWorkAction = "label" | "order" | "move";

const selectedWorkActionLabels: Record<SelectedWorkAction, string> = {
  label: "Vonalkód / címke",
  order: "Rendelés / PDF",
  move: "Készletmozgatás",
};

function readSavedSelectedVariantActions(): Record<string, SelectedWorkAction> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(selectedProductActionsStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const allowed = new Set(["label", "order", "move"]);
    return Object.entries(parsed).reduce<Record<string, SelectedWorkAction>>((acc, [id, value]) => {
      const key = String(id || "").trim();
      const action = String(value || "") as SelectedWorkAction;
      if (key && allowed.has(action)) acc[key] = action;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function saveSelectedVariantActionsToStorage(actions: Record<string, SelectedWorkAction>) {
  if (typeof window === "undefined") return;
  const clean = Object.entries(actions).reduce<Record<string, SelectedWorkAction>>((acc, [id, action]) => {
    const key = String(id || "").trim();
    if (key && ["label", "order", "move"].includes(action)) acc[key] = action;
    return acc;
  }, {});
  if (!Object.keys(clean).length) {
    window.localStorage.removeItem(selectedProductActionsStorageKey);
    return;
  }
  window.localStorage.setItem(selectedProductActionsStorageKey, JSON.stringify(clean));
}

function readSavedSelectedVariants(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(selectedProductsStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.reduce<Record<string, boolean>>((acc, id) => {
        const key = String(id || "").trim();
        if (key) acc[key] = true;
        return acc;
      }, {});
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed).reduce<Record<string, boolean>>((acc, [id, value]) => {
        const key = String(id || "").trim();
        if (key && value) acc[key] = true;
        return acc;
      }, {});
    }
  } catch {
    return {};
  }
  return {};
}

function saveSelectedVariantsToStorage(selected: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  const ids = Object.keys(selected).filter((id) => selected[id]);
  if (!ids.length) {
    window.localStorage.removeItem(selectedProductsStorageKey);
    return;
  }
  window.localStorage.setItem(selectedProductsStorageKey, JSON.stringify(ids));
}


type InventoryItem = {
  variant_id: string;
  internal_sku?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  supplier_names?: string | null;
  supplier_codes?: string | null;
  supplier_ids?: string | null;
  suppliers?: Array<{ id?: string; code?: string; name?: string }> | null;
  model_id?: string | null;
  model_code?: string | null;
  title_ro?: string | null;
  title_hu?: string | null;
  description_ro?: string | null;
  shopify_title?: string | null;
  gender?: string | null;
  product_type?: string | null;
  season?: string | null;
  material?: string | null;
  model_status?: string | null;
  category_code?: string | null;
  category_name_ro?: string | null;
  category_name_hu?: string | null; aliases?: string[] | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  size?: string | null;
  buy_price?: string | number | null;
  sell_price?: string | number | null;
  compare_at_price?: string | number | null;
  variant_status?: string | null;
  total_qty?: number | string | null;
  total_reserved_qty?: number | string | null;
  available_qty?: number | string | null;
  last_stock_movement_at?: string | null;
  last_incoming_at?: string | null;
};

type MetaItem = { id: string; code?: string; name?: string; name_ro?: string; name_hu?: string | null; aliases?: string[] | null; shopify_collection_handle?: string | null; sort_order?: number | string | null; is_active?: boolean };
type GenderType = { code: string; name: string; aliases?: string[] | null; sort_order?: number | string | null; is_active?: boolean };
type ColorType = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  name_en?: string | null;
  name_de?: string | null;
  aliases?: string[] | null;
  hex?: string | null;
  sort_order?: number | string | null;
  is_active?: boolean;
};
type BrandColorCode = {
  id: string;
  brand_id: string;
  brand_code?: string | null;
  brand_name?: string | null;
  color_code: string;
  color_type_id: string;
  color_type_code?: string | null;
  color_name_ro?: string | null;
  color_name_hu?: string | null;
  color_name_en?: string | null;
  color_name_de?: string | null;
  color_hex?: string | null;
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};
type MaterialType = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  name_en?: string | null;
  name_de?: string | null;
  aliases?: string[] | null;
  sort_order?: number | string | null;
  is_active?: boolean;
};
type SupplierBrandLink = { id: string; supplier_id: string; brand_id: string; supplier_name?: string; brand_name?: string; is_preferred?: boolean; is_active?: boolean };
type StockItem = { variant_id: string; location_id?: string; location_code?: string; location_name?: string; location_type?: string; qty?: number | string; reserved_qty?: number | string; available_qty?: number | string; updated_at?: string };
type StockFilter = "all" | "available" | "out" | "reserved" | "missing" | "watch";
type ImageFilter = "all" | "with" | "missing";
type SortMode = "name" | "brand" | "stock_desc" | "stock_asc" | "value_desc" | "missing";

type DetailResponse = {
  item: any;
  stock: any[];
  supplierCodes: any[];
  movements: any[];
};

type EditForm = {
  titleRo: string;
  titleHu: string;
  descriptionRo: string;
  gender: string;
  productType: string;
  season: string;
  material: string;
  shopifyTitle: string;
  modelStatus: string;
  brandCode: string;
  categoryCode: string;
  barcode: string;
  colorCode: string;
  colorName: string;
  size: string;
  buyPrice: string;
  sellPrice: string;
  compareAtPrice: string;
  imageUrl: string;
  variantStatus: string;
};

function goHome() {
  window.location.hash = "#allin";
}

function goBarcodeManager(variantId?: string, barcode?: string, title?: string) {
  const params = new URLSearchParams();
  if (variantId) params.set("variant", variantId);
  if (barcode) params.set("barcode", barcode);
  if (title) params.set("title", title);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  window.location.hash = `#allinbarcodes${suffix}`;
}

function n(v: unknown) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function money(v: unknown) {
  if (v === null || v === undefined || v === "") return "-";
  const x = Number(v);
  if (!Number.isFinite(x)) return String(v);
  return x.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type WarehouseBarcodeRender = {
  ok: boolean;
  svg: string;
  width: number;
  error?: string;
};

type WarehouseLabelContentKey =
  | "company"
  | "brand"
  | "title"
  | "barcode"
  | "description"
  | "category"
  | "sizeColor"
  | "code"
  | "price";

type WarehouseLabelTemplate = {
  name: string;
  labelWidth: string;
  labelHeight: string;
  labelCols: string;
  labelRows: string;
  labelMarginX: string;
  labelMarginY: string;
  labelCompanyName: string;
  labelCurrency: string;
  labelUnitText: string;
  labelShowBorder: boolean;
  labelContent: Record<WarehouseLabelContentKey, boolean>;
};

type WarehouseLabelPreset = {
  id: string;
  name: string;
  width: string;
  height: string;
  cols: string;
  rows: string;
  marginX: string;
  marginY: string;
};

const WAREHOUSE_LABEL_COMPANY = "TITAN EURO-COM SRL";

const WAREHOUSE_LABEL_PRESETS: WarehouseLabelPreset[] = [
  { id: "40x46", name: "40 × 46 mm, 5 × 6 pe A4", width: "40", height: "46", cols: "5", rows: "6", marginX: "5", marginY: "5" },
  { id: "50x30", name: "50 × 30 mm, 4 × 8 pe A4", width: "50", height: "30", cols: "4", rows: "8", marginX: "5", marginY: "5" },
  { id: "60x40", name: "60 × 40 mm, 3 × 6 pe A4", width: "60", height: "40", cols: "3", rows: "6", marginX: "6", marginY: "6" },
  { id: "70x36", name: "70 × 36 mm, 2 × 7 pe A4", width: "70", height: "36", cols: "2", rows: "7", marginX: "8", marginY: "6" },
];

const WAREHOUSE_LABEL_DEFAULT_CONTENT: Record<WarehouseLabelContentKey, boolean> = {
  company: true,
  brand: true,
  title: true,
  barcode: true,
  description: true,
  category: true,
  sizeColor: true,
  code: true,
  price: true,
};

const WAREHOUSE_LABEL_CONTENT_OPTIONS: { key: WarehouseLabelContentKey; label: string; hint: string }[] = [
  { key: "company", label: "Cég neve", hint: "A címke tetején jelenik meg." },
  { key: "brand", label: "Márka", hint: "A terméknév felett vagy alatt jelenik meg." },
  { key: "title", label: "Terméknév", hint: "A fő terméknév, lehet 1-2 sor." },
  { key: "barcode", label: "Vonalkód", hint: "Code128 belső AllIn / Shopify SKU azonosító." },
  { key: "description", label: "Anyag / összetétel", hint: "Csak az anyagösszetétel kerül a címkére. Ha nincs megadva, üres marad." },
  { key: "category", label: "Kategória", hint: "Póló, pantaloni, pantofi, stb." },
  { key: "sizeColor", label: "Méret / szín", hint: "A variáns gyors azonosításához." },
  { key: "code", label: "Termékkód", hint: "Beszállítói / belső cikkszám." },
  { key: "price", label: "Ár", hint: "Nagy árrész a címke alján." },
];

function readWarehouseLabelTemplates(): WarehouseLabelTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("aifWarehouseLabelTemplates");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWarehouseLabelTemplates(templates: WarehouseLabelTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("aifWarehouseLabelTemplates", JSON.stringify(templates));
}

type WarehouseLabelPrintItem = {
  key: string;
  variantId: string;
  barcode: string;
  title: string;
  brand: string;
  category: string;
  size: string;
  color: string;
  description: string;
  productCode: string;
  price: string;
  stockQty: number;
  copyIndex: number;
  copyTotal: number;
  render: WarehouseBarcodeRender;
};

const WAREHOUSE_CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function labelCleanInternalCode(input: unknown) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function labelCleanText(input: unknown, max = 120) {
  return String(input ?? "").replace(/[<>]/g, "").slice(0, max);
}

function labelShortHashCode(input: string, length = 7) {
  const source = String(input || `${Date.now()}-${Math.random()}`);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(length, "0").slice(-length);
}

function labelMakeInternalCode(seed = "", parts: unknown[] = []) {
  const source = [seed, ...parts]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join("|");
  return labelCleanInternalCode(`AIF${labelShortHashCode(source)}`);
}

function labelInt(v: unknown, fallback: number, min: number, max: number) {
  const n = Number.parseInt(String(v ?? "").replace(",", "."), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function labelMm(v: unknown, fallback: number, min: number, max: number) {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function labelPriceParts(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { major: "", cents: "" };
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return { major: raw, cents: "" };
  const [major, cents] = n.toFixed(2).split(".");
  return { major, cents };
}

function labelCode128Svg(value: string, height = 62): WarehouseBarcodeRender {
  const code = String(value || "").trim();
  if (!code) return { ok: false, svg: "", width: 0, error: "A vonalkód mező üres." };

  const values: number[] = [];
  for (const ch of code) {
    const charCode = ch.charCodeAt(0);
    if (charCode < 32 || charCode > 127) {
      return {
        ok: false,
        svg: "",
        width: 0,
        error: "A Code128 csak latin betűket, számokat és egyszerű jeleket kezel.",
      };
    }
    values.push(charCode - 32);
  }

  const startB = 104;
  let checksum = startB;
  values.forEach((v, index) => {
    checksum += v * (index + 1);
  });
  checksum %= 103;

  const sequence = [startB, ...values, checksum, 106];
  const patterns = sequence.map((v) => WAREHOUSE_CODE128_PATTERNS[v]).filter(Boolean);
  const totalModules = patterns.reduce((sum, p) => sum + p.split("").reduce((a, n) => a + Number(n), 0), 0);
  const quiet = 10;
  const width = totalModules + quiet * 2;
  let x = quiet;
  const bars: string[] = [];

  for (const pattern of patterns) {
    let black = true;
    for (const digit of pattern) {
      const w = Number(digit);
      if (black) bars.push(`<rect x="${x}" y="0" width="${w}" height="${height}" />`);
      x += w;
      black = !black;
    }
  }

  const safeText = code.replace(/[<&>]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[m] || m));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 18}" role="img" aria-label="Vonalkód ${safeText}"><rect width="${width}" height="${height + 18}" fill="#fff"/><g fill="#000">${bars.join("")}</g><text x="${width / 2}" y="${height + 13}" text-anchor="middle" font-family="Arial, sans-serif" font-size="8.5">${safeText}</text></svg>`;
  return { ok: true, svg, width };
}

function dateShort(v: unknown) {
  if (!v) return "-";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ro-RO");
}

function hasMissingData(it: InventoryItem) {
  return !it.image_url || !it.barcode || !it.sell_price || !it.buy_price || !it.title_ro || !it.size;
}

function missingLabels(it: InventoryItem) {
  const out = [];
  if (!it.image_url) out.push("kép");
  if (!it.barcode) out.push("vonalkód");
  if (!it.buy_price) out.push("vételár");
  if (!it.sell_price) out.push("eladási ár");
  if (!it.title_ro) out.push("név");
  if (!it.size) out.push("méret");
  return out;
}

function MissingDataIndicator({ item, openUp = false }: { item: InventoryItem; openUp?: boolean }) {
  const labels = missingLabels(item);
  if (!labels.length) {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#7bd7d4]/45 bg-[#2a8d8b] text-[11px] text-white shadow-[0_0_8px_rgba(42,141,139,0.22)]"
        title="Rendben"
        aria-label="Rendben"
      >
        ✓
      </span>
    );
  }
  const tooltipPosition = openUp ? "bottom-full mb-2" : "top-full mt-2";
  return (
    <span
      className="group relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-200/55 bg-amber-300 text-[12px] leading-none text-slate-900 shadow-[0_0_10px_rgba(251,191,36,0.28)]"
      tabIndex={0}
      aria-label={`Hiányzó adatok: ${labels.join(", ")}`}
    >
      !
      <span className={`pointer-events-none absolute right-0 z-40 hidden w-56 rounded-xl border border-amber-200/30 bg-[#202838] px-3 py-2 text-left text-[11px] leading-snug text-white shadow-2xl group-hover:block group-focus:block ${tooltipPosition}`}>
        <span className="block text-amber-100">Hiányzó adatok</span>
        <span className="mt-1 block text-white/78">{labels.join(", ")}</span>
      </span>
    </span>
  );
}

function normalizeSearch(v: unknown) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function splitCsv(v: unknown) {
  return String(v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

const COLOR_RO_MAP: Record<string, string> = {
  black: "negru", schwarz: "negru", nero: "negru", noir: "negru", fekete: "negru", negru: "negru",
  white: "alb", weiss: "alb", weiß: "alb", blanco: "alb", bianco: "alb", feher: "alb", fehér: "alb", alb: "alb",
  red: "roșu", rot: "roșu", rosso: "roșu", rojo: "roșu", piros: "roșu", rosu: "roșu", roșu: "roșu",
  blue: "albastru", blau: "albastru", bleu: "albastru", blu: "albastru", albastru: "albastru", kek: "albastru", kék: "albastru",
  "dark blue": "bleumarin", navy: "bleumarin", marine: "bleumarin", bleumarin: "bleumarin", sotetkek: "bleumarin", "sotet kek": "bleumarin", "sötét kék": "bleumarin",
  green: "verde", grun: "verde", grün: "verde", verde: "verde", zold: "verde", zöld: "verde",
  yellow: "galben", gelb: "galben", giallo: "galben", galben: "galben", sarga: "galben", sárga: "galben",
  grey: "gri", gray: "gri", grau: "gri", gri: "gri", szurke: "gri", szürke: "gri",
  orange: "portocaliu", portocaliu: "portocaliu", narancs: "portocaliu",
  brown: "maro", braun: "maro", marrone: "maro", maro: "maro", barna: "maro",
  beige: "bej", bej: "bej", bezs: "bej", bézs: "bej",
  purple: "mov", violet: "mov", lila: "mov", mov: "mov",
  pink: "roz", rosa: "roz", roz: "roz",
  gold: "auriu", golden: "auriu", auriu: "auriu", arany: "auriu",
  silver: "argintiu", silber: "argintiu", argintiu: "argintiu", ezust: "argintiu", ezüst: "argintiu",
  cream: "crem", crem: "crem", ivory: "fildeș", fildes: "fildeș",
  turquoise: "turcoaz", turkis: "turcoaz", türkis: "turcoaz", turcoaz: "turcoaz",
  khaki: "kaki", kaki: "kaki",
  multi: "multicolor", multicolor: "multicolor", multicolour: "multicolor",
};

function colorKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function officialColorRo(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = colorKey(raw);
  if (COLOR_RO_MAP[key]) return COLOR_RO_MAP[key];
  const parts = key.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const translated = parts.map((part) => COLOR_RO_MAP[part]).filter(Boolean);
    if (translated.length === parts.length) return Array.from(new Set(translated)).join(" / ");
  }
  return raw;
}

function officialColorFromTypes(value: unknown, colors: ColorType[]) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = colorKey(raw);
  const found = (colors || []).find((c) => {
    const aliases = Array.isArray(c.aliases) ? c.aliases : [];
    return [c.code, c.name_ro, c.name_hu, c.name_en, c.name_de, ...aliases]
      .filter(Boolean)
      .some((x) => colorKey(x) === key);
  });
  if (found?.name_ro) return found.name_ro;

  const parts = key.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const translated = parts.map((part) => {
      const c = (colors || []).find((row) => {
        const aliases = Array.isArray(row.aliases) ? row.aliases : [];
        return [row.code, row.name_ro, row.name_hu, row.name_en, row.name_de, ...aliases]
          .filter(Boolean)
          .some((x) => colorKey(x) === part);
      });
      return c?.name_ro || COLOR_RO_MAP[part];
    }).filter(Boolean);
    if (translated.length === parts.length) return Array.from(new Set(translated)).join(" / ");
  }

  return officialColorRo(raw);
}

function displayColorName(value: unknown, fallback?: unknown) {
  return officialColorRo(value) || String(fallback || "").trim() || "-";
}

function categoryLabel(c: MetaItem) {
  return c.name_hu || c.name_ro || c.name || c.code || "-";
}

function genderLabel(code: unknown, items: GenderType[]) {
  const key = normalizeSearch(code);
  return items.find((g) => normalizeSearch(g.code) === key)?.name || String(code || "-");
}

function itemSupplierText(it: InventoryItem) {
  if (it.supplier_names) return it.supplier_names;
  const names = (it.suppliers || []).map((s) => s.name).filter(Boolean) as string[];
  return names.length ? names.join(", ") : "-";
}

function supplierMatches(it: InventoryItem, selected: string) {
  if (selected === "all") return true;
  const key = normalizeSearch(selected);
  const values = [
    ...splitCsv(it.supplier_ids),
    ...splitCsv(it.supplier_codes),
    ...splitCsv(it.supplier_names),
    ...(it.suppliers || []).flatMap((s) => [s.id, s.code, s.name]),
  ].map(normalizeSearch);
  return values.some((x) => x === key);
}

function itemMatchesSearch(it: InventoryItem, query: string) {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = [
    it.title_ro,
    it.title_hu,
    it.brand_name,
    it.brand_code,
    itemSupplierText(it),
    it.supplier_codes,
    it.internal_sku,
    it.barcode,
    it.model_code,
    it.category_name_ro,
    it.category_name_hu,
    it.color_name,
    it.color_code,
    it.size,
  ].map(normalizeSearch).join(" ");
  return haystack.includes(q);
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiInventory() {
  const qs = new URLSearchParams();
  qs.set("limit", "500");
  return fetchJSON<{ items: InventoryItem[] }>(`/api/aif/inventory?${qs.toString()}`);
}

async function apiMeta() {
  return fetchJSON<{ suppliers: MetaItem[]; brands: MetaItem[]; categories: MetaItem[]; genderTypes?: GenderType[]; colorTypes?: ColorType[]; brandColorCodes?: BrandColorCode[]; materialTypes?: MaterialType[]; locations: MetaItem[]; supplierBrands?: SupplierBrandLink[] }>("/api/aif/meta");
}

async function apiStock() {
  return fetchJSON<{ items: StockItem[] }>("/api/aif/stock");
}

async function apiVariantDetail(id: string) {
  return fetchJSON<DetailResponse>(`/api/aif/variants/${encodeURIComponent(id)}`);
}

async function apiVariantUpdate(id: string, payload: Record<string, unknown>) {
  return fetchJSON<{ ok: true }>(`/api/aif/variants/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiVariantDelete(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/variants/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiVariantStockUpdate(id: string, rows: Array<{ locationId?: string; locationCode?: string; qty: number | string; reservedQty?: number | string }>) {
  return fetchJSON<{ ok: true; stock: StockItem[] }>(`/api/aif/variants/${encodeURIComponent(id)}/stock`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
}


async function apiSaveCategory(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/categories/${encodeURIComponent(id)}` : "/api/aif/categories";
  return fetchJSON<{ item: MetaItem }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteCategory(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiSaveGenderType(code: string, payload: Record<string, unknown>) {
  const url = code ? `/api/aif/gender-types/${encodeURIComponent(code)}` : "/api/aif/gender-types";
  return fetchJSON<{ item: GenderType }>(url, {
    method: code ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteGenderType(code: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/gender-types/${encodeURIComponent(code)}`, { method: "DELETE" });
}

async function apiSaveColorType(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/color-types/${encodeURIComponent(id)}` : "/api/aif/color-types";
  return fetchJSON<{ item: ColorType }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteColorType(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/color-types/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiSaveBrandColorCode(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/brand-color-codes/${encodeURIComponent(id)}` : "/api/aif/brand-color-codes";
  return fetchJSON<{ item: BrandColorCode }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteBrandColorCode(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/brand-color-codes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function apiListBrandColorCodes() {
  return fetchJSON<{ items: BrandColorCode[] }>("/api/aif/brand-color-codes");
}

async function apiSaveMaterialType(id: string, payload: Record<string, unknown>) {
  const url = id ? `/api/aif/material-types/${encodeURIComponent(id)}` : "/api/aif/material-types";
  return fetchJSON<{ item: MaterialType }>(url, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function apiDeleteMaterialType(id: string) {
  return fetchJSON<{ ok: true; mode?: string }>(`/api/aif/material-types/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function uploadImage(file: File, variantId: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", `products/${variantId}`);
  fd.append("name", file.name);
  return fetchJSON<{ key: string; url: string }>("/api/uploads/r2", { method: "POST", body: fd });
}

function emptyForm(): EditForm {
  return {
    titleRo: "",
    titleHu: "",
    descriptionRo: "",
    gender: "unisex",
    productType: "",
    season: "",
    material: "",
    shopifyTitle: "",
    modelStatus: "draft",
    brandCode: "",
    categoryCode: "",
    barcode: "",
    colorCode: "",
    colorName: "",
    size: "",
    buyPrice: "",
    sellPrice: "",
    compareAtPrice: "",
    imageUrl: "",
    variantStatus: "active",
  };
}

function formFromDetail(d: DetailResponse): EditForm {
  const x = d.item || {};
  return {
    titleRo: x.title_ro || "",
    titleHu: x.title_hu || "",
    descriptionRo: x.description_ro || "",
    gender: x.gender || "unisex",
    productType: x.product_type || "",
    season: x.season || "",
    material: x.material || "",
    shopifyTitle: x.shopify_title || "",
    modelStatus: x.model_status || "draft",
    brandCode: x.brand_code || "",
    categoryCode: x.category_code || "",
    barcode: x.barcode || "",
    colorCode: x.color_code || "",
    colorName: officialColorRo(x.color_name || ""),
    size: x.size || "",
    buyPrice: x.buy_price == null ? "" : String(x.buy_price),
    sellPrice: x.sell_price == null ? "" : String(x.sell_price),
    compareAtPrice: x.compare_at_price == null ? "" : String(x.compare_at_price),
    imageUrl: x.image_url || "",
    variantStatus: x.status || "active",
  };
}


function nextSortOrder(rows: Array<{ sort_order?: number | string | null }>) {
  return String(rows.length + 1);
}

export default function AllInWarehouse() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stockRows, setStockRows] = useState<StockItem[]>([]);
  const [suppliers, setSuppliers] = useState<MetaItem[]>([]);
  const [brands, setBrands] = useState<MetaItem[]>([]);
  const [supplierBrands, setSupplierBrands] = useState<SupplierBrandLink[]>([]);
  const [categories, setCategories] = useState<MetaItem[]>([]);
  const [genderTypes, setGenderTypes] = useState<GenderType[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [colorTypes, setColorTypes] = useState<ColorType[]>([]);
  const [brandColorCodes, setBrandColorCodes] = useState<BrandColorCode[]>([]);
  const [locations, setLocations] = useState<MetaItem[]>([]);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("all");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");
  const [gender, setGender] = useState("all");
  const [location, setLocation] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [listOpen, setListOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [edit, setEdit] = useState<EditForm>(emptyForm());
  const [detailBusy, setDetailBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);
  const [taxonomyTab, setTaxonomyTab] = useState<"categories" | "genders" | "colors" | "brandColors" | "materials">("categories");
  const [taxonomyBusy, setTaxonomyBusy] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ id: "", nameRo: "", nameHu: "", aliases: "", sortOrder: "10" });
  const [genderForm, setGenderForm] = useState({ code: "", name: "", aliases: "", sortOrder: "10" });
  const [colorForm, setColorForm] = useState({ id: "", nameRo: "", nameHu: "", nameEn: "", nameDe: "", aliases: "", hex: "", sortOrder: "10" });
  const [brandColorForm, setBrandColorForm] = useState({ id: "", brandId: "", colorCode: "", colorTypeId: "", notes: "" });
  const [materialForm, setMaterialForm] = useState({ id: "", nameRo: "", nameHu: "", nameEn: "", nameDe: "", aliases: "", sortOrder: "10" });
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "category" | "gender" | "color" | "brandColor" | "material"; id: string; name: string } | null>(null);
  const [openTaxonomyMenu, setOpenTaxonomyMenu] = useState<string | null>(null);
  const [productDeleteTarget, setProductDeleteTarget] = useState<InventoryItem | null>(null);
  const [stockEditorTarget, setStockEditorTarget] = useState<InventoryItem | null>(null);
  const [stockEditorRows, setStockEditorRows] = useState<Record<string, string>>({});
  const [stockEditorSaving, setStockEditorSaving] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, boolean>>(() => readSavedSelectedVariants());
  const [selectedPanelOpen, setSelectedPanelOpen] = useState(false);
  const [selectedWorkActions, setSelectedWorkActions] = useState<Record<string, SelectedWorkAction>>(() => readSavedSelectedVariantActions());
  const [selectedActionTarget, setSelectedActionTarget] = useState<InventoryItem | null>(null);
  const [selectedWorkPanel, setSelectedWorkPanel] = useState<SelectedWorkAction | null>(null);
  const [labelComposerOpen, setLabelComposerOpen] = useState(false);
  const [labelCopies, setLabelCopies] = useState<Record<string, string>>({});
  const [labelWidth, setLabelWidth] = useState("40");
  const [labelHeight, setLabelHeight] = useState("46");
  const [labelCols, setLabelCols] = useState("5");
  const [labelRows, setLabelRows] = useState("6");
  const [labelMarginX, setLabelMarginX] = useState("5");
  const [labelMarginY, setLabelMarginY] = useState("5");
  const [labelShowBorder, setLabelShowBorder] = useState(true);
  const [labelCompanyName, setLabelCompanyName] = useState(WAREHOUSE_LABEL_COMPANY);
  const [labelCurrency, setLabelCurrency] = useState("RON");
  const [labelUnitText, setLabelUnitText] = useState("RON");
  const [labelContent, setLabelContent] = useState<Record<WarehouseLabelContentKey, boolean>>(WAREHOUSE_LABEL_DEFAULT_CONTENT);
  const [labelTemplateName, setLabelTemplateName] = useState("Standard 40x46");
  const [labelTemplates, setLabelTemplates] = useState<WarehouseLabelTemplate[]>(() => readWarehouseLabelTemplates());
  const [labelDetailMap, setLabelDetailMap] = useState<Record<string, DetailResponse>>({});
  const [labelDetailsBusy, setLabelDetailsBusy] = useState(false);

  const stockMap = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    for (const s of stockRows) {
      const id = String(s.variant_id || "");
      if (!id) continue;
      const arr = map.get(id) || [];
      arr.push(s);
      map.set(id, arr);
    }
    return map;
  }, [stockRows]);

  const stockLocationRows = useMemo(() => {
    return locations
      .filter((l) => l.is_active !== false)
      .slice()
      .sort((a, b) => String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""), "hu", { sensitivity: "base" }));
  }, [locations]);

  function stockRowsForVariant(variantId?: string | null) {
    return stockMap.get(String(variantId || "")) || [];
  }

  function locationKey(location: MetaItem) {
    return String(location.id || location.code || location.name || "");
  }

  function stockForLocation(rows: StockItem[], location: MetaItem) {
    const lid = String(location.id || "");
    const lcode = String(location.code || "");
    const lname = String(location.name || "");
    return rows.find((s) =>
      (lid && String(s.location_id || "") === lid) ||
      (lcode && String(s.location_code || "") === lcode) ||
      (lname && String(s.location_name || "") === lname)
    ) || null;
  }

  function openStockEditor(item: InventoryItem) {
    const rows = stockRowsForVariant(item.variant_id);
    const next: Record<string, string> = {};
    for (const loc of stockLocationRows) {
      const row = stockForLocation(rows, loc);
      next[locationKey(loc)] = String(n(row?.qty));
    }
    setStockEditorTarget(item);
    setStockEditorRows(next);
  }

  function closeStockEditor() {
    if (stockEditorSaving) return;
    setStockEditorTarget(null);
    setStockEditorRows({});
  }

  function stockEditorReservedQty(location: MetaItem) {
    if (!stockEditorTarget?.variant_id) return 0;
    const current = stockForLocation(stockRowsForVariant(stockEditorTarget.variant_id), location);
    return Math.max(0, Math.floor(n(current?.reserved_qty)));
  }

  function setStockEditorQty(location: MetaItem, value: number) {
    const key = locationKey(location);
    const minQty = stockEditorReservedQty(location);
    const nextQty = Math.max(minQty, Math.floor(Number.isFinite(value) ? value : 0));
    setStockEditorRows((current) => ({ ...current, [key]: String(nextQty) }));
  }

  function adjustStockEditorQty(location: MetaItem, delta: number) {
    const key = locationKey(location);
    const currentQty = Math.floor(n(stockEditorRows[key]));
    setStockEditorQty(location, currentQty + delta);
  }

  async function saveStockEditor() {
    if (!stockEditorTarget?.variant_id) return;
    setStockEditorSaving(true);
    setMessage("");
    try {
      const rows = stockLocationRows.map((loc) => {
        const key = locationKey(loc);
        const reservedQty = stockEditorReservedQty(loc);
        const qty = Math.max(reservedQty, Math.floor(n(stockEditorRows[key])));
        return {
          locationId: String(loc.id || ""),
          locationCode: String(loc.code || ""),
          qty,
          reservedQty,
        };
      });
      await apiVariantStockUpdate(stockEditorTarget.variant_id, rows);
      await load();
      if (detail?.item?.id && String(detail.item.id) === String(stockEditorTarget.variant_id)) {
        const d = await apiVariantDetail(stockEditorTarget.variant_id);
        setDetail(d);
        setEdit(formFromDetail(d));
      }
      setMessage("Készlet mennyiségek frissítve célhelyenként.");
      setStockEditorTarget(null);
      setStockEditorRows({});
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a készletet.");
    } finally {
      setStockEditorSaving(false);
    }
  }

  function StockQtyButton({ item }: { item: InventoryItem }) {
    const rows = stockRowsForVariant(item.variant_id);
    const activeRows = rows.filter((s) => n(s.qty) > 0);
    const label = activeRows.length
      ? activeRows.map((s) => `${s.location_name || s.location_code || "Célhely"}: ${n(s.qty)}`).join(" • ")
      : "Nincs célhelyenkénti készlet";
    return (
      <button
        className="group inline-flex min-w-[72px] items-center justify-end gap-1.5 rounded-full border border-[#5bd0cc]/45 bg-[#203f49] px-2.5 py-1 text-right text-xs text-white shadow-[0_0_0_1px_rgba(42,141,139,0.10)] hover:border-[#79e1de]/70 hover:bg-[#25535c] focus:outline-none focus:ring-2 focus:ring-[#2a8d8b]/45"
        onClick={() => openStockEditor(item)}
        title={`Készlet célhelyenként: ${label}. Kattints a módosításhoz.`}
        type="button"
      >
        <span className="text-sm tabular-nums">{n(item.total_qty)}</span>
        <span className="rounded-full bg-[#2a8d8b]/28 px-1.5 py-0.5 text-[10px] text-[#cffffd] group-hover:bg-[#2a8d8b]/42">
          {activeRows.length || "0"} hely
        </span>
      </button>
    );
  }

  const nextCategorySortOrder = useMemo(() => nextSortOrder(categories), [categories]);
  const nextGenderSortOrder = useMemo(() => nextSortOrder(genderTypes), [genderTypes]);
  const nextColorSortOrder = useMemo(() => nextSortOrder(colorTypes), [colorTypes]);
  const nextMaterialSortOrder = useMemo(() => nextSortOrder(materialTypes), [materialTypes]);

  useEffect(() => {
    if (!taxonomyOpen) return;
    if (taxonomyTab === "categories" && !categoryForm.id && !categoryForm.nameRo.trim() && !categoryForm.nameHu.trim() && !categoryForm.aliases.trim()) {
      setCategoryForm((x) => x.sortOrder === nextCategorySortOrder ? x : { ...x, sortOrder: nextCategorySortOrder });
    }
    if (taxonomyTab === "genders" && !genderForm.code && !genderForm.name.trim()) {
      setGenderForm((x) => x.sortOrder === nextGenderSortOrder ? x : { ...x, sortOrder: nextGenderSortOrder });
    }
    if (taxonomyTab === "colors" && !colorForm.id && !colorForm.nameRo.trim()) {
      setColorForm((x) => x.sortOrder === nextColorSortOrder ? x : { ...x, sortOrder: nextColorSortOrder });
    }
    if (taxonomyTab === "materials" && !materialForm.id && !materialForm.nameRo.trim()) {
      setMaterialForm((x) => x.sortOrder === nextMaterialSortOrder ? x : { ...x, sortOrder: nextMaterialSortOrder });
    }
  }, [
    taxonomyOpen,
    taxonomyTab,
    nextCategorySortOrder,
    nextGenderSortOrder,
    nextColorSortOrder,
    nextMaterialSortOrder,
    categoryForm.id,
    categoryForm.nameRo,
    categoryForm.nameHu,
    categoryForm.aliases,
    genderForm.code,
    genderForm.name,
    colorForm.id,
    colorForm.nameRo,
    materialForm.id,
    materialForm.nameRo,
  ]);

  const selectedSupplier = useMemo(() => {
    if (supplier === "all") return null;
    const selected = normalizeSearch(supplier);
    return suppliers.find((s) => [s.id, s.code, s.name].map(normalizeSearch).some((x) => x === selected)) || null;
  }, [supplier, suppliers]);

  const brandOptions = useMemo(() => {
    if (!selectedSupplier) return brands;
    const linkedBrandIds = new Set(
      supplierBrands
        .filter((x) => x.is_active !== false && normalizeSearch(x.supplier_id) === normalizeSearch(selectedSupplier.id))
        .map((x) => String(x.brand_id))
    );
    return brands.filter((b) => linkedBrandIds.has(String(b.id)));
  }, [brands, supplierBrands, selectedSupplier]);

  useEffect(() => {
    if (brand === "all") return;
    const current = normalizeSearch(brand);
    const valid = brandOptions.some((b) => [b.id, b.code, b.name].map(normalizeSearch).some((x) => x === current));
    if (!valid) setBrand("all");
  }, [brand, brandOptions]);

  const colorDisplay = (value: unknown, fallback?: unknown) => {
    return officialColorFromTypes(value, colorTypes) || String(fallback || "").trim() || "-";
  };

  const normalizeColor = (value: unknown) => officialColorFromTypes(value, colorTypes);

  const filtered = useMemo(() => {
    let out = [...items];
    if (search.trim()) out = out.filter((x) => itemMatchesSearch(x, search));
    if (supplier !== "all") out = out.filter((x) => supplierMatches(x, supplier));
    if (brand !== "all") out = out.filter((x) => (x.brand_code || x.brand_name || "") === brand || x.brand_name === brand);
    if (category !== "all") out = out.filter((x) => (x.category_code || x.category_name_ro || "") === category || x.category_name_ro === category);
    if (gender !== "all") out = out.filter((x) => (x.gender || "") === gender);
    if (imageFilter === "with") out = out.filter((x) => Boolean(x.image_url));
    if (imageFilter === "missing") out = out.filter((x) => !x.image_url);
    if (location !== "all") {
      out = out.filter((x) => (stockMap.get(x.variant_id) || []).some((s) => (s.location_code === location || s.location_name === location) && n(s.qty) > 0));
    }
    if (stockFilter === "available") out = out.filter((x) => n(x.available_qty) > 0);
    if (stockFilter === "out") out = out.filter((x) => n(x.total_qty) <= 0);
    if (stockFilter === "reserved") out = out.filter((x) => n(x.total_reserved_qty) > 0);
    if (stockFilter === "missing") out = out.filter(hasMissingData);
    if (stockFilter === "watch") out = out.filter((x) => n(x.total_qty) > 0 && hasMissingData(x));
    out.sort((a, b) => {
      if (sortMode === "brand") return String(a.brand_name || "").localeCompare(String(b.brand_name || ""), "hu");
      if (sortMode === "stock_desc") return n(b.total_qty) - n(a.total_qty);
      if (sortMode === "stock_asc") return n(a.total_qty) - n(b.total_qty);
      if (sortMode === "value_desc") return n(b.total_qty) * n(b.buy_price) - n(a.total_qty) * n(a.buy_price);
      if (sortMode === "missing") return Number(hasMissingData(b)) - Number(hasMissingData(a));
      return String(a.title_ro || "").localeCompare(String(b.title_ro || ""), "hu");
    });
    return out;
  }, [items, search, supplier, brand, category, gender, location, stockFilter, imageFilter, sortMode, stockMap]);

  const filteredVariantIds = useMemo(
    () => filtered.map((x) => String(x.variant_id || "")).filter(Boolean),
    [filtered]
  );

  const selectedItems = useMemo(() => {
    const selected = new Set(Object.keys(selectedVariants).filter((id) => selectedVariants[id]));
    return items.filter((x) => selected.has(String(x.variant_id || "")));
  }, [items, selectedVariants]);

  const selectedCount = selectedItems.length;
  const selectedUnassignedItems = useMemo(
    () => selectedItems.filter((x) => !selectedWorkActions[String(x.variant_id || "")]),
    [selectedItems, selectedWorkActions]
  );
  const selectedLabelItems = useMemo(
    () => selectedItems.filter((x) => selectedWorkActions[String(x.variant_id || "")] === "label"),
    [selectedItems, selectedWorkActions]
  );
  const selectedOrderItems = useMemo(
    () => selectedItems.filter((x) => selectedWorkActions[String(x.variant_id || "")] === "order"),
    [selectedItems, selectedWorkActions]
  );
  const selectedMoveItems = useMemo(
    () => selectedItems.filter((x) => selectedWorkActions[String(x.variant_id || "")] === "move"),
    [selectedItems, selectedWorkActions]
  );
  const selectedWorkCounts: Record<SelectedWorkAction, number> = {
    label: selectedLabelItems.length,
    order: selectedOrderItems.length,
    move: selectedMoveItems.length,
  };
  const selectedFilteredCount = filteredVariantIds.filter((id) => selectedVariants[id]).length;
  const allFilteredSelected = filteredVariantIds.length > 0 && selectedFilteredCount === filteredVariantIds.length;

  function assignSelectedItemToAction(item: InventoryItem, action: SelectedWorkAction) {
    const id = String(item.variant_id || "");
    if (!id) return;
    setSelectedVariants((current) => ({ ...current, [id]: true }));
    setSelectedWorkActions((current) => ({ ...current, [id]: action }));
    setSelectedActionTarget(null);
    setSelectedWorkPanel(action);
  }

  function returnSelectedItemToMainList(id: string) {
    if (!id) return;
    setSelectedWorkActions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function removeSelectedItemEverywhere(id: string) {
    if (!id) return;
    setSelectedVariants((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSelectedWorkActions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function selectedItemsForAction(action: SelectedWorkAction) {
    if (action === "label") return selectedLabelItems;
    if (action === "order") return selectedOrderItems;
    return selectedMoveItems;
  }

  function labelProductCodeForItem(item: InventoryItem) {
    const raw = String(item.model_code || item.internal_sku || item.barcode || "").trim();
    const clean = raw.includes(":") ? raw.split(":").pop() || raw : raw;
    return labelCleanText(clean, 48);
  }

  function toggleLabelContent(key: WarehouseLabelContentKey) {
    setLabelContent((current) => ({ ...current, [key]: !current[key] }));
  }

  function applyWarehouseLabelPreset(id: string) {
    const preset = WAREHOUSE_LABEL_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setLabelWidth(preset.width);
    setLabelHeight(preset.height);
    setLabelCols(preset.cols);
    setLabelRows(preset.rows);
    setLabelMarginX(preset.marginX);
    setLabelMarginY(preset.marginY);
  }

  function saveCurrentWarehouseLabelTemplate() {
    const name = labelTemplateName.trim() || "Standard 40x46";
    const template: WarehouseLabelTemplate = {
      name,
      labelWidth,
      labelHeight,
      labelCols,
      labelRows,
      labelMarginX,
      labelMarginY,
      labelCompanyName,
      labelCurrency,
      labelUnitText,
      labelShowBorder,
      labelContent,
    };
    const next = [template, ...labelTemplates.filter((x) => x.name !== name)].slice(0, 20);
    setLabelTemplates(next);
    saveWarehouseLabelTemplates(next);
    setMessage("Címke sablon mentve.");
  }

  function loadWarehouseLabelTemplate(name: string) {
    const template = labelTemplates.find((x) => x.name === name);
    if (!template) return;
    setLabelTemplateName(template.name);
    setLabelWidth(template.labelWidth || "40");
    setLabelHeight(template.labelHeight || "46");
    setLabelCols(template.labelCols || "5");
    setLabelRows(template.labelRows || "6");
    setLabelMarginX(template.labelMarginX || "5");
    setLabelMarginY(template.labelMarginY || "5");
    setLabelCompanyName(template.labelCompanyName || WAREHOUSE_LABEL_COMPANY);
    setLabelCurrency(template.labelCurrency || "RON");
    setLabelUnitText(template.labelUnitText || template.labelCurrency || "RON");
    setLabelShowBorder(template.labelShowBorder !== false);
    setLabelContent({ ...WAREHOUSE_LABEL_DEFAULT_CONTENT, ...(template.labelContent || {}) });
  }

  function defaultLabelCopiesForItem(item: InventoryItem) {
    const qty = Math.floor(n(item.total_qty || item.available_qty));
    return String(Math.max(1, qty || 1));
  }

  function barcodeForLabelItem(item: InventoryItem) {
    const existing = labelCleanInternalCode(item.barcode || item.internal_sku || "");
    if (existing) return existing;
    return labelMakeInternalCode("", [
      item.variant_id,
      item.model_id,
      item.title_ro,
      item.brand_name,
      item.category_name_ro,
      item.color_name,
      item.size,
    ]);
  }

  async function openLabelComposer() {
    if (!selectedLabelItems.length) {
      setMessage("Nincs termék a Vonalkód / címke listában.");
      return;
    }
    setLabelCopies((current) => {
      const next = { ...current };
      for (const item of selectedLabelItems) {
        const id = String(item.variant_id || "");
        if (id && !next[id]) next[id] = defaultLabelCopiesForItem(item);
      }
      return next;
    });

    const missingIds = selectedLabelItems
      .map((item) => String(item.variant_id || ""))
      .filter((id) => id && !labelDetailMap[id]);

    if (missingIds.length) {
      setLabelDetailsBusy(true);
      try {
        const loaded = await Promise.all(
          missingIds.map(async (id) => {
            try {
              const detail = await apiVariantDetail(id);
              return { id, detail };
            } catch {
              return { id, detail: null };
            }
          })
        );

        setLabelDetailMap((current) => {
          const next = { ...current };
          for (const row of loaded) {
            if (row.detail) next[row.id] = row.detail;
          }
          return next;
        });
      } finally {
        setLabelDetailsBusy(false);
      }
    }

    setLabelComposerOpen(true);
  }

  function updateLabelCopies(id: string, value: string) {
    const qty = labelInt(value, 1, 0, 999);
    setLabelCopies((current) => ({ ...current, [id]: String(qty) }));
  }

  function adjustLabelCopies(id: string, delta: number) {
    setLabelCopies((current) => {
      const currentQty = labelInt(current[id], 1, 0, 999);
      return { ...current, [id]: String(Math.max(0, currentQty + delta)) };
    });
  }

  const labelW = labelMm(labelWidth, 40, 20, 120);
  const labelH = labelMm(labelHeight, 46, 15, 100);
  const labelColCount = labelInt(labelCols, 5, 1, 8);
  const labelRowCount = labelInt(labelRows, 6, 1, 12);
  const labelMarginXmm = labelMm(labelMarginX, 5, 0, 25);
  const labelMarginYmm = labelMm(labelMarginY, 5, 0, 25);
  const labelsPerPage = Math.max(1, labelColCount * labelRowCount);

  const labelRowsForPrint = useMemo(() => {
    return selectedLabelItems.map((item) => {
      const id = String(item.variant_id || "");
      const detailItem = labelDetailMap[id]?.item || {};
      const barcode = barcodeForLabelItem(item);
      const copies = labelInt(labelCopies[id], labelInt(defaultLabelCopiesForItem(item), 1, 1, 999), 0, 999);
      const color = colorDisplay(item.color_name || detailItem.color_name, item.color_code || detailItem.color_code);
      const price = item.sell_price == null ? "" : String(item.sell_price);
      return {
        item,
        id,
        barcode,
        copies,
        title: detailItem.title_ro || item.title_ro || "-",
        brand: detailItem.brand_name || item.brand_name || "-",
        category: detailItem.category_name_ro || item.category_name_ro || detailItem.category_name_hu || item.category_name_hu || "-",
        size: detailItem.size || item.size || "-",
        color,
        description: detailItem.material || item.material || "",
        productCode: labelProductCodeForItem(item),
        price,
        stockQty: Math.floor(n(item.total_qty)),
        render: labelCode128Svg(barcode, 58),
      };
    });
  }, [selectedLabelItems, labelCopies, colorTypes, labelDetailMap]);

  const labelPrintItems = useMemo<WarehouseLabelPrintItem[]>(() => {
    const out: WarehouseLabelPrintItem[] = [];
    for (const row of labelRowsForPrint) {
      for (let i = 0; i < row.copies; i += 1) {
        out.push({
          key: `${row.id}-${i}`,
          variantId: row.id,
          barcode: row.barcode,
          title: row.title,
          brand: row.brand,
          category: row.category,
          size: row.size,
          color: row.color,
          description: row.description,
          productCode: row.productCode,
          price: row.price,
          stockQty: row.stockQty,
          copyIndex: i + 1,
          copyTotal: row.copies,
          render: row.render,
        });
      }
    }
    return out;
  }, [labelRowsForPrint]);

  const labelPrintPages = useMemo(() => {
    const pages: WarehouseLabelPrintItem[][] = [];
    for (let i = 0; i < labelPrintItems.length; i += labelsPerPage) {
      pages.push(labelPrintItems.slice(i, i + labelsPerPage));
    }
    return pages;
  }, [labelPrintItems, labelsPerPage]);

  const labelPrintStyle = {
    "--aif-label-w": `${labelW}mm`,
    "--aif-label-h": `${labelH}mm`,
    "--aif-label-cols": String(labelColCount),
    "--aif-label-margin-x": `${labelMarginXmm}mm`,
    "--aif-label-margin-y": `${labelMarginYmm}mm`,
  } as React.CSSProperties & Record<string, string>;

  function printGeneratedLabels() {
    if (!labelPrintItems.length) {
      setMessage("Nincs nyomtatható címke. Állíts be legalább egy példányt.");
      return;
    }
    window.requestAnimationFrame(() => window.print());
  }

  function WarehouseLabelContent({ label }: { label: WarehouseLabelPrintItem }) {
    const priceParts = labelPriceParts(label.price);
    return (
      <>
        {labelContent.company && labelCompanyName && <div className="aifWhLabelCompany">{labelCleanText(labelCompanyName, 48)}</div>}
        {labelContent.brand && label.brand && label.brand !== "-" && <div className="aifWhLabelBrand">{labelCleanText(label.brand, 42)}</div>}
        {labelContent.title && <div className="aifWhLabelTitle">{labelCleanText(label.title || "Produs", 72)}</div>}
        {labelContent.sizeColor && (label.size || label.color) && (
          <div className="aifWhLabelMeta">
            {label.size && label.size !== "-" && <span>{labelCleanText(label.size, 16)}</span>}
            {label.color && label.color !== "-" && <span>{labelCleanText(label.color, 24)}</span>}
          </div>
        )}
        {labelContent.barcode && <div className="aifWhBarcodeSvgWrap" dangerouslySetInnerHTML={{ __html: label.render.ok ? label.render.svg : "" }} />}
        {labelContent.description && label.description && <div className="aifWhLabelDescription">{labelCleanText(label.description, 90)}</div>}
        {labelContent.category && label.category && label.category !== "-" && <div className="aifWhLabelCategory">{labelCleanText(label.category, 34)}</div>}
        {labelContent.code && (label.productCode || label.barcode) && <div className="aifWhLabelCode">Cod: {labelCleanText(label.productCode || label.barcode, 44)}</div>}
        {labelContent.price && priceParts.major && (
          <div className="aifWhLabelPrice">
            <span className="aifWhPriceMajor">{priceParts.major}</span>
            {priceParts.cents && <span className="aifWhPriceCents">{priceParts.cents}</span>}
            <span className="aifWhPriceUnit">{labelCleanText(labelUnitText || labelCurrency, 12)}</span>
          </div>
        )}
      </>
    );
  }

  function toggleVariantSelection(id: string, checked: boolean) {
    if (!id) return;
    setSelectedVariants((current) => {
      const next = { ...current };
      if (checked) next[id] = true;
      else delete next[id];
      return next;
    });
    if (!checked) {
      setSelectedWorkActions((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }

  function toggleAllFilteredSelection(checked: boolean) {
    setSelectedVariants((current) => {
      const next = { ...current };
      for (const id of filteredVariantIds) {
        if (checked) next[id] = true;
        else delete next[id];
      }
      return next;
    });
  }

  function clearSelectedVariants() {
    setSelectedVariants({});
    setSelectedWorkActions({});
    setSelectedActionTarget(null);
    setSelectedWorkPanel(null);
    setSelectedPanelOpen(false);
  }

  useEffect(() => {
    if (!items.length) return;
    const valid = new Set(items.map((x) => String(x.variant_id || "")).filter(Boolean));
    setSelectedVariants((current) => {
      const next: Record<string, boolean> = {};
      for (const [id, selected] of Object.entries(current)) {
        if (selected && valid.has(id)) next[id] = true;
      }
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    setSelectedWorkActions((current) => {
      const next: Record<string, SelectedWorkAction> = {};
      for (const [id, action] of Object.entries(current)) {
        if (valid.has(id)) next[id] = action;
      }
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [items]);

  useEffect(() => {
    saveSelectedVariantsToStorage(selectedVariants);
  }, [selectedVariants]);

  useEffect(() => {
    saveSelectedVariantActionsToStorage(selectedWorkActions);
  }, [selectedWorkActions]);

  useEffect(() => {
    if (selectedPanelOpen && selectedCount <= 0) setSelectedPanelOpen(false);
    if (selectedWorkPanel && selectedWorkCounts[selectedWorkPanel] <= 0) setSelectedWorkPanel(null);
  }, [selectedPanelOpen, selectedCount, selectedWorkPanel, selectedWorkCounts.label, selectedWorkCounts.order, selectedWorkCounts.move]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, x) => {
        acc.variants += 1;
        acc.qty += n(x.total_qty);
        acc.reserved += n(x.total_reserved_qty);
        acc.available += n(x.available_qty);
        acc.value += n(x.total_qty) * n(x.buy_price);
        if (hasMissingData(x)) acc.missing += 1;
        if (n(x.total_qty) > 0 && hasMissingData(x)) acc.watch += 1;
        return acc;
      },
      { variants: 0, qty: 0, reserved: 0, available: 0, value: 0, missing: 0, watch: 0 }
    );
  }, [filtered]);

  const brandChart = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; value: number }>();
    for (const x of filtered) {
      const key = x.brand_name || "Nincs márka";
      const row = map.get(key) || { name: key, qty: 0, value: 0 };
      row.qty += n(x.total_qty);
      row.value += n(x.total_qty) * n(x.buy_price);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filtered]);

  const locationChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stockRows) {
      const key = s.location_name || s.location_code || "Ismeretlen";
      map.set(key, (map.get(key) || 0) + n(s.qty));
    }
    return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [stockRows]);

  function resetCategoryForm() {
    setCategoryForm({ id: "", nameRo: "", nameHu: "", aliases: "", sortOrder: nextCategorySortOrder });
  }

  function editCategoryRow(c: MetaItem) {
    setTaxonomyTab("categories");
    setCategoryForm({
      id: String(c.id || c.code || ""),
      nameRo: String(c.name_ro || c.name || ""),
      nameHu: String(c.name_hu || ""),
      aliases: (Array.isArray(c.aliases) ? c.aliases : []).join(", "),
      sortOrder: c.sort_order == null ? nextCategorySortOrder : String(c.sort_order),
    });
  }

  function resetGenderForm() {
    setGenderForm({ code: "", name: "", aliases: "", sortOrder: nextGenderSortOrder });
  }

  function editGenderRow(g: GenderType) {
    setTaxonomyTab("genders");
    setGenderForm({
      code: String(g.code || ""),
      name: String(g.name || ""),
      aliases: (Array.isArray(g.aliases) ? g.aliases : []).join(", "),
      sortOrder: g.sort_order == null ? nextGenderSortOrder : String(g.sort_order),
    });
  }

  function resetColorForm() {
    setColorForm({ id: "", nameRo: "", nameHu: "", nameEn: "", nameDe: "", aliases: "", hex: "", sortOrder: nextColorSortOrder });
  }

  function editColorRow(c: ColorType) {
    setTaxonomyTab("colors");
    setColorForm({
      id: String(c.id || ""),
      nameRo: String(c.name_ro || ""),
      nameHu: String(c.name_hu || ""),
      nameEn: String(c.name_en || ""),
      nameDe: String(c.name_de || ""),
      aliases: (Array.isArray(c.aliases) ? c.aliases : []).join(", "),
      hex: String(c.hex || ""),
      sortOrder: c.sort_order == null ? nextColorSortOrder : String(c.sort_order),
    });
  }

  function colorTypeLabel(c?: ColorType | null) {
    if (!c) return "-";
    return c.name_hu || c.name_ro || c.name_en || c.code || "-";
  }

  function brandLabel(b?: MetaItem | null) {
    return b?.name || b?.code || "-";
  }

  function resetBrandColorForm() {
    setBrandColorForm({ id: "", brandId: brands[0]?.id || "", colorCode: "", colorTypeId: colorTypes[0]?.id || "", notes: "" });
  }

  function editBrandColorRow(row: BrandColorCode) {
    setTaxonomyTab("brandColors");
    setBrandColorForm({
      id: String(row.id || ""),
      brandId: String(row.brand_id || ""),
      colorCode: String(row.color_code || ""),
      colorTypeId: String(row.color_type_id || ""),
      notes: String(row.notes || ""),
    });
  }

  async function saveBrandColorForm() {
    if (!brandColorForm.brandId) {
      setMessage("A márka kiválasztása kötelező.");
      return;
    }
    if (!brandColorForm.colorCode.trim()) {
      setMessage("A gyártói színkód kötelező.");
      return;
    }
    if (!brandColorForm.colorTypeId) {
      setMessage("Az AllIn szín kiválasztása kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveBrandColorCode(brandColorForm.id, {
        brandId: brandColorForm.brandId,
        colorCode: brandColorForm.colorCode.trim().toUpperCase(),
        colorTypeId: brandColorForm.colorTypeId,
        notes: brandColorForm.notes,
      });
      resetBrandColorForm();
      await load();
      setMessage("Márka színkód mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a márka színkódot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  function resetMaterialForm() {
    setMaterialForm({ id: "", nameRo: "", nameHu: "", nameEn: "", nameDe: "", aliases: "", sortOrder: nextMaterialSortOrder });
  }

  function editMaterialRow(m: MaterialType) {
    setTaxonomyTab("materials");
    setMaterialForm({
      id: String(m.id || ""),
      nameRo: String(m.name_ro || ""),
      nameHu: String(m.name_hu || ""),
      nameEn: String(m.name_en || ""),
      nameDe: String(m.name_de || ""),
      aliases: (Array.isArray(m.aliases) ? m.aliases : []).join(", "),
      sortOrder: m.sort_order == null ? nextMaterialSortOrder : String(m.sort_order),
    });
  }

  async function saveCategoryForm() {
    if (!categoryForm.nameRo.trim()) {
      setMessage("A kategória neve kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveCategory(categoryForm.id, {
        nameRo: categoryForm.nameRo,
        nameHu: categoryForm.nameHu,
        aliases: categoryForm.aliases,
        sortOrder: categoryForm.sortOrder,
      });
      resetCategoryForm();
      await load();
      setMessage("Kategória mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a kategóriát.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function saveGenderForm() {
    if (!genderForm.name.trim()) {
      setMessage("A nem megnevezése kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveGenderType(genderForm.code, {
        name: genderForm.name,
        aliases: genderForm.aliases,
        sortOrder: genderForm.sortOrder,
      });
      resetGenderForm();
      await load();
      setMessage("Nem törzsadat mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a nem törzsadatot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function saveColorForm() {
    if (!colorForm.nameRo.trim()) {
      setMessage("A román hivatalos színnév kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveColorType(colorForm.id, {
        nameRo: colorForm.nameRo,
        nameHu: colorForm.nameHu,
        nameEn: colorForm.nameEn,
        nameDe: colorForm.nameDe,
        aliases: colorForm.aliases,
        hex: colorForm.hex,
        sortOrder: colorForm.sortOrder,
      });
      resetColorForm();
      await load();
      setMessage("Szín törzsadat mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a szín törzsadatot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function saveMaterialForm() {
    if (!materialForm.nameRo.trim()) {
      setMessage("A román hivatalos összetevőnév kötelező.");
      return;
    }
    setTaxonomyBusy(true);
    try {
      await apiSaveMaterialType(materialForm.id, {
        nameRo: materialForm.nameRo,
        nameHu: materialForm.nameHu,
        nameEn: materialForm.nameEn,
        nameDe: materialForm.nameDe,
        aliases: materialForm.aliases,
        sortOrder: materialForm.sortOrder,
      });
      resetMaterialForm();
      await load();
      setMessage("Összetevő törzsadat mentve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni az összetevő törzsadatot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function confirmDeleteTaxonomy() {
    if (!deleteTarget) return;
    setTaxonomyBusy(true);
    try {
      if (deleteTarget.kind === "category") await apiDeleteCategory(deleteTarget.id);
      if (deleteTarget.kind === "gender") await apiDeleteGenderType(deleteTarget.id);
      if (deleteTarget.kind === "color") await apiDeleteColorType(deleteTarget.id);
      if (deleteTarget.kind === "brandColor") await apiDeleteBrandColorCode(deleteTarget.id);
      if (deleteTarget.kind === "material") await apiDeleteMaterialType(deleteTarget.id);
      setDeleteTarget(null);
      setOpenTaxonomyMenu(null);
      await load();
      setMessage("Törzsadat frissítve.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült módosítani a törzsadatot.");
    } finally {
      setTaxonomyBusy(false);
    }
  }

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const [inv, meta, stock] = await Promise.all([apiInventory(), apiMeta(), apiStock()]);
      let brandColorRows = meta.brandColorCodes || [];
      if (!brandColorRows.length) {
        try {
          const extra = await apiListBrandColorCodes();
          brandColorRows = extra.items || [];
        } catch {
          brandColorRows = [];
        }
      }
      setItems((inv.items || []).filter((x) => String(x.variant_status || "active") !== "archived" && String(x.model_status || "active") !== "archived"));
      setSuppliers(meta.suppliers || []);
      setBrands(meta.brands || []);
      setSupplierBrands(meta.supplierBrands || []);
      setCategories((meta.categories || []).slice().sort((a: MetaItem, b: MetaItem) => categoryLabel(a).localeCompare(categoryLabel(b), "hu", { sensitivity: "base" })));
      setGenderTypes(meta.genderTypes || []);
      setColorTypes(meta.colorTypes || []);
      setBrandColorCodes(brandColorRows);
      setMaterialTypes((meta.materialTypes || []).slice().sort((a: MaterialType, b: MaterialType) => (a.name_hu || a.name_ro || a.code).localeCompare(b.name_hu || b.name_ro || b.code, "hu", { sensitivity: "base" })));
      setLocations(meta.locations || []);
      setStockRows(stock.items || []);
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült betölteni a raktár adatait.");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setDetailBusy(true);
    setMessage("");
    try {
      const d = await apiVariantDetail(id);
      setDetail(d);
      const nextForm = formFromDetail(d);
      nextForm.colorName = officialColorFromTypes(nextForm.colorName, colorTypes);
      setEdit(nextForm);
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült betölteni a termékadatlapot.");
    } finally {
      setDetailBusy(false);
    }
  }

  async function saveDetail() {
    if (!detail?.item?.id) return;
    setSaving(true);
    setMessage("");
    try {
      await apiVariantUpdate(detail.item.id, {
        titleRo: edit.titleRo,
        titleHu: edit.titleHu,
        descriptionRo: edit.descriptionRo,
        gender: edit.gender,
        productType: edit.productType,
        season: edit.season,
        material: edit.material,
        shopifyTitle: edit.shopifyTitle,
        modelStatus: edit.modelStatus,
        brandCode: edit.brandCode || null,
        categoryCode: edit.categoryCode || null,
        barcode: edit.barcode,
        colorCode: edit.colorCode,
        colorName: normalizeColor(edit.colorName),
        size: edit.size,
        buyPrice: edit.buyPrice,
        sellPrice: edit.sellPrice,
        imageUrl: edit.imageUrl,
        status: edit.variantStatus,
      });
      const d = await apiVariantDetail(detail.item.id);
      setDetail(d);
      setEdit(formFromDetail(d));
      await load();
      setMessage("A termékadatok mentése megtörtént.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült menteni a termékadatokat.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteProduct() {
    if (!productDeleteTarget?.variant_id) return;
    setSaving(true);
    setMessage("");
    try {
      await apiVariantDelete(productDeleteTarget.variant_id);
      setProductDeleteTarget(null);
      if (detail?.item?.id && String(detail.item.id) === String(productDeleteTarget.variant_id)) setDetail(null);
      await load();
      setMessage("Termék törölve a raktárlistából.");
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült törölni a terméket.");
    } finally {
      setSaving(false);
    }
  }

  async function onImageSelected(file: File | null) {
    if (!file || !detail?.item?.id) return;
    setSaving(true);
    setMessage("");
    try {
      const up = await uploadImage(file, detail.item.id);
      setEdit((x) => ({ ...x, imageUrl: up.url }));
    } catch (e: any) {
      setMessage(e.message || "Nem sikerült feltölteni a képet.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxBrandValue = Math.max(1, ...brandChart.map((x) => x.value));
  const maxLocationQty = Math.max(1, ...locationChart.map((x) => x.qty));

  function taxonomyMenuOpensUp(index: number, total: number) {
    if (total <= 3) return false;
    return index >= Math.max(2, total - 2);
  }

  function taxonomyActionMenu(args: {
    menuId: string;
    openUp?: boolean;
    onEdit: () => void;
    onDelete: () => void;
  }) {
    const isOpen = openTaxonomyMenu === args.menuId;
    return (
      <div className="relative shrink-0">
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/18 bg-[#3f4959] text-white/80 hover:bg-[#475365] hover:text-white"
          onClick={() => setOpenTaxonomyMenu(isOpen ? null : args.menuId)}
          type="button"
          aria-label="Műveletek"
        >
          <MoreVertical size={15} />
        </button>
        {isOpen && (
          <div className={`absolute right-0 z-50 w-40 rounded-xl border border-white/18 bg-[#2f394a] p-1.5 shadow-2xl ${args.openUp ? "bottom-full mb-2" : "top-full mt-2"}`}>
            <button
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-white/90 hover:bg-white/10"
              onClick={() => {
                setOpenTaxonomyMenu(null);
                args.onEdit();
              }}
              type="button"
            >
              <Edit3 size={13} /> Szerkesztés
            </button>
            <button
              className="mt-1 flex h-8 w-full items-center gap-2 rounded-lg border border-rose-300/28 bg-[#cf1028] px-2.5 text-left text-xs text-white shadow-[0_0_14px_rgba(207,16,40,0.25)] hover:bg-[#aa0d21]"
              onClick={() => {
                setOpenTaxonomyMenu(null);
                args.onDelete();
              }}
              type="button"
            >
              <Trash2 size={13} /> Törlés
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className={page}>
      <style>{`
        .aifWarehouseLabelPrintRoot { display:none; }
        .aifWhLabelPreviewFrame {
          max-height:68vh;
          overflow:auto;
          border-radius:14px;
          border:1px solid rgba(255,255,255,.14);
          background:#2f394a;
          padding:10px;
        }
        .aifWhLabelPreviewFrame .aifWarehouseLabelPrintPage {
          zoom:.58;
          box-shadow:0 14px 34px rgba(0,0,0,.26);
        }
        .aifWarehouseLabelPrintPage {
          width:210mm;
          min-height:297mm;
          display:grid;
          grid-template-columns:repeat(var(--aif-label-cols), var(--aif-label-w));
          grid-auto-rows:var(--aif-label-h);
          padding:var(--aif-label-margin-y) var(--aif-label-margin-x);
          box-sizing:border-box;
          align-content:start;
          justify-content:start;
          background:#fff;
          color:#111;
          print-color-adjust:exact;
          -webkit-print-color-adjust:exact;
        }
        .aifWarehousePrintLabel {
          width:var(--aif-label-w);
          height:var(--aif-label-h);
          border:1px solid #ddd;
          border-radius:12px;
          padding:2mm;
          color:#111;
          background:#fff;
          overflow:hidden;
          box-sizing:border-box;
          display:flex;
          flex-direction:column;
          justify-content:center;
          font-family:Arial, sans-serif;
          page-break-inside:avoid;
          break-inside:avoid;
          print-color-adjust:exact;
          -webkit-print-color-adjust:exact;
        }
        .aifWarehousePrintLabel.noBorder { border-color:transparent; }
        .aifWhLabelCompany { font-size:10px; text-align:center; text-transform:uppercase; letter-spacing:.08em; color:#333; margin-bottom:2px; }
        .aifWhLabelBrand { font-size:10px; text-align:center; text-transform:uppercase; letter-spacing:.05em; color:#222; margin-bottom:2px; }
        .aifWhLabelTitle { font-size:13px; line-height:1.1; text-align:center; color:#111; margin-bottom:4px; }
        .aifWhLabelMeta { display:flex; justify-content:center; gap:8px; flex-wrap:wrap; color:#333; font-size:10px; margin-bottom:4px; }
        .aifWhLabelDescription { border-top:1px solid #ddd; padding-top:3px; margin-top:3px; text-align:center; font-size:9.5px; line-height:1.08; color:#222; }
        .aifWhBarcodeSvgWrap { width:100%; overflow:hidden; }
        .aifWhBarcodeSvgWrap svg { display:block; width:100%; height:auto; max-height:54px; }
        .aifWhLabelCategory { border-top:1px solid #ddd; padding-top:3px; margin-top:3px; text-align:center; text-transform:uppercase; font-size:10px; color:#111; }
        .aifWhLabelCode { margin-top:3px; font-size:8.5px; color:#444; text-align:center; }
        .aifWhLabelPrice { margin-top:3px; text-align:center; line-height:1; color:#111; white-space:nowrap; }
        .aifWhPriceMajor { font-size:22px; letter-spacing:.08em; }
        .aifWhPriceCents { font-size:12px; vertical-align:top; margin-left:2px; }
        .aifWhPriceUnit { display:inline-block; font-size:8px; margin-left:3px; vertical-align:baseline; }
        @media print {
          @page { size:A4; margin:0; }
          html, body {
            width:210mm !important;
            margin:0 !important;
            padding:0 !important;
            background:#fff !important;
          }
          body * { visibility:hidden !important; }
          .aifWarehouseLabelPrintRoot, .aifWarehouseLabelPrintRoot * { visibility:visible !important; }
          .aifWarehouseLabelPrintRoot {
            display:block !important;
            position:absolute;
            left:0;
            top:0;
            width:210mm;
            margin:0 !important;
            padding:0 !important;
            background:#ffffff;
            color:#111111;
          }
          .aifWarehouseLabelPrintPage {
            page-break-after:always;
            break-after:page;
            box-shadow:none !important;
          }
          .aifWarehouseLabelPrintPage:last-child {
            page-break-after:auto;
            break-after:auto;
          }
        }
      `}</style>
      <div className={shell}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/60">AllInFashion</p>
            <h1 className="text-2xl tracking-tight">Raktár</h1>
            <p className="mt-1 max-w-3xl text-sm text-white/70">Termék- és készletközpont kereséssel, szűréssel, képekkel, készletértékkel és termékadat-szerkesztéssel.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btnSoft} onClick={() => setTaxonomyOpen(true)}><Edit3 size={16} /> Törzsadatok</button>
            <button className={btnSoft} onClick={load} disabled={busy}><RefreshCw size={16} /> Frissítés</button>
            <button className={btn} onClick={goHome}><ArrowLeft size={16} /> Vissza</button>
          </div>
        </header>

        {message && <div className="rounded-xl border border-white/20 bg-[#404a5b] px-4 py-3 text-sm text-white/85">{message}</div>}

        <section className={panel}>
          <div className={panelHead}>
            <div className="flex items-center gap-2"><Filter size={17} /><span>Szűrés és keresés</span></div>
            <button className={btnSoft} onClick={() => setFiltersOpen((x) => !x)}>{filtersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {filtersOpen ? "Bezárás" : "Megnyitás"}</button>
          </div>
          {filtersOpen && (
            <div className="grid gap-3 p-4 md:grid-cols-4">
              <label className={`${label} md:col-span-2`}>
                Keresés
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 text-white/40" size={18} />
                  <input className={`${input} w-full pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Név, beszállító, márka, vonalkód, szín, méret" />
                </div>
              </label>
              <label className={label}>Beszállító
                <select className={select} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                  <option value="all">Összes</option>
                  {suppliers.map((s) => <option key={s.id} value={s.code || s.name || s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className={label}>Márka
                <select className={select} value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="all">{selectedSupplier ? "Összes kapcsolt márka" : "Összes"}</option>
                  {brandOptions.map((b) => <option key={b.id} value={b.code || b.name || b.id}>{b.name}</option>)}
                  {selectedSupplier && !brandOptions.length && <option value="" disabled>Nincs kapcsolt márka</option>}
                </select>
              </label>
              <label className={label}>Kategória
                <select className={select} value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="all">Összes</option>
                  {categories.map((c) => <option key={c.id} value={c.code || c.name_ro || c.id}>{categoryLabel(c)}</option>)}
                </select>
              </label>
              <label className={label}>Nem
                <select className={select} value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="all">Összes</option>
                  {genderTypes.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                </select>
              </label>
              <label className={label}>Cél hely
                <select className={select} value={location} onChange={(e) => setLocation(e.target.value)}>
                  <option value="all">Összes</option>
                  {locations.map((l) => <option key={l.id} value={l.code || l.name || l.id}>{l.name}</option>)}
                </select>
              </label>
              <label className={label}>Készlet állapot
                <select className={select} value={stockFilter} onChange={(e) => setStockFilter(e.target.value as StockFilter)}>
                  <option value="all">Összes</option>
                  <option value="available">Készleten</option>
                  <option value="out">Nincs készleten</option>
                  <option value="reserved">Van foglalás</option>
                  <option value="missing">Hiányzó adat</option>
                  <option value="watch">Figyelendő készlet</option>
                </select>
              </label>
              <label className={label}>Kép
                <select className={select} value={imageFilter} onChange={(e) => setImageFilter(e.target.value as ImageFilter)}>
                  <option value="all">Összes</option>
                  <option value="with">Van kép</option>
                  <option value="missing">Hiányzik kép</option>
                </select>
              </label>
              <label className={label}>Sorrend
                <select className={select} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="name">Terméknév</option>
                  <option value="brand">Márka</option>
                  <option value="stock_desc">Készlet csökkenő</option>
                  <option value="stock_asc">Készlet növekvő</option>
                  <option value="value_desc">Készletérték</option>
                  <option value="missing">Hiányzó adatok</option>
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button className={btn} onClick={load} disabled={busy}><Search size={16} /> Keresés</button>
                <button className={btnSoft} onClick={() => { setSupplier("all"); setBrand("all"); setCategory("all"); setGender("all"); setLocation("all"); setStockFilter("all"); setImageFilter("all"); setSortMode("name"); }}>Alaphelyzet</button>
              </div>
            </div>
          )}
        </section>

        <section className={panel}>
          <div className={panelHead}>
            <div className="flex items-center gap-2"><Boxes size={17} /><span>Áttekintés</span></div>
            <button className={btnSoft} onClick={() => setSummaryOpen((x) => !x)}>{summaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {summaryOpen ? "Bezárás" : "Megnyitás"}</button>
          </div>
          {summaryOpen && (
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Variáns</p><p className="mt-1 text-xl">{totals.variants}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Össz készlet</p><p className="mt-1 text-xl">{totals.qty}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Elérhető</p><p className="mt-1 text-xl">{totals.available}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Foglalt</p><p className="mt-1 text-xl">{totals.reserved}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Készletérték</p><p className="mt-1 text-xl">{money(totals.value)}</p></div>
                <div className="rounded-xl bg-[#3f4959] p-3"><p className="text-xs text-white/55">Figyelendő</p><p className="mt-1 text-xl">{totals.watch}</p></div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/40 bg-white p-4 text-slate-900 shadow-[0_10px_28px_rgba(15,23,42,0.12)]">
                  <p className="mb-3 text-sm text-slate-700">Márkák készletérték szerint</p>
                  <div className="space-y-2">
                    {brandChart.map((x) => (
                      <div key={x.name} className="grid gap-1">
                        <div className="flex justify-between gap-3 text-xs text-slate-600"><span>{x.name}</span><span>{money(x.value)}</span></div>
                        <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-[#276454]" style={{ width: `${Math.max(4, (x.value / maxBrandValue) * 100)}%` }} /></div>
                      </div>
                    ))}
                    {!brandChart.length && <p className="text-sm text-slate-500">Nincs megjeleníthető adat.</p>}
                  </div>
                </div>
                <div className="rounded-xl border border-white/40 bg-white p-4 text-slate-900 shadow-[0_10px_28px_rgba(15,23,42,0.12)]">
                  <p className="mb-3 text-sm text-slate-700">Készlet célhelyenként</p>
                  <div className="space-y-2">
                    {locationChart.map((x) => (
                      <div key={x.name} className="grid gap-1">
                        <div className="flex justify-between gap-3 text-xs text-slate-600"><span>{x.name}</span><span>{x.qty}</span></div>
                        <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-[#276454]" style={{ width: `${Math.max(4, (x.qty / maxLocationQty) * 100)}%` }} /></div>
                      </div>
                    ))}
                    {!locationChart.length && <p className="text-sm text-slate-500">Nincs megjeleníthető adat.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/20 bg-[#515d6e] shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/16 bg-[#303a4c] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-white/95">
              <Eye size={17} />
              <span>Terméklista</span>
              <span className={chip}>{filtered.length} találat</span>
              {selectedCount > 0 && (
                <span className="rounded-full border border-[#2a8d8b]/45 bg-[#2a8d8b]/18 px-2.5 py-1 text-xs text-white">
                  {selectedCount} kijelölve
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedCount > 0 && (
                <>
                  <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] font-normal" onClick={() => setSelectedPanelOpen(true)} type="button">
                    <Eye size={15} /> Kijelöltek megnyitása
                  </button>
                  <button className={btnSoft} onClick={clearSelectedVariants} type="button" title="A mentett kijelölési listát is törli">
                    <X size={15} /> Kijelölés törlése
                  </button>
                </>
              )}
              <button className={btnSoft} onClick={() => setListOpen((x) => !x)}>{listOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {listOpen ? "Bezárás" : "Megnyitás"}</button>
            </div>
          </div>
          {listOpen && (
            <div className="p-4">
              <div className="hidden overflow-auto rounded-xl border border-white/20 bg-[#465163] lg:block">
                <table className="min-w-full text-left text-[13px]">
                  <thead className="bg-[#2f3a4c] text-[11px] uppercase tracking-[0.08em] text-white/72">
                    <tr>
                      <th className="w-10 px-3 py-3 text-center font-normal">
                        <input
                          className={selectBox}
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={(e) => toggleAllFilteredSelection(e.target.checked)}
                          disabled={!filteredVariantIds.length}
                          aria-label="Minden látható termék kijelölése"
                          title="Minden látható termék kijelölése"
                        />
                      </th>
                      <th className="px-3 py-3 font-normal">Kép</th>
                      <th className="px-3 py-3 font-normal">Márka</th>
                      <th className="px-3 py-3 font-normal">Terméknév</th>
                      <th className="px-3 py-3 font-normal">Kategória</th>
                      <th className="px-3 py-3 font-normal">Szín</th>
                      <th className="px-3 py-3 font-normal">Méret</th>
                      <th className="px-3 py-3 text-right font-normal">Készlet</th>
                      <th className="px-3 py-3 text-right font-normal">Elérhető</th>
                      <th className="px-3 py-3 text-right font-normal">Vételár</th>
                      <th className="px-3 py-3 text-right font-normal">Eladási ár</th>
                      <th className="px-3 py-3 text-center font-normal">Állapot</th>
                      <th className="px-3 py-3 text-right font-normal">Művelet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/12">
                    {filtered.map((it, index) => {
                      const isSelected = Boolean(selectedVariants[String(it.variant_id || "")]);
                      return (
                      <tr key={it.variant_id} className={`${isSelected ? "bg-[#2a8d8b]/18 ring-1 ring-inset ring-[#2a8d8b]/45" : "odd:bg-[#526071] even:bg-[#4c5869]"} hover:bg-[#617084]`}>
                        <td className="px-3 py-2.5 text-center align-middle">
                          <input
                            className={selectBox}
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => toggleVariantSelection(String(it.variant_id || ""), e.target.checked)}
                            aria-label={`${it.title_ro || "Termék"} kijelölése`}
                          />
                        </td>
                        <td className="px-3 py-2.5">{it.image_url ? <img src={it.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black/20 text-white/35"><ImagePlus size={18} /></div>}</td>
                        <td className="px-3 py-2.5">{it.brand_name || "-"}</td>
                        <td className="px-3 py-2.5"><div>{it.title_ro || "-"}</div><div className="mt-1 text-xs text-white/45">{it.barcode ? `Vonalkód: ${it.barcode}` : "Nincs vonalkód"}</div></td>
                        <td className="px-3 py-2.5">{it.category_name_hu || it.category_name_ro || "-"}</td>
                        <td className="px-3 py-2.5">{colorDisplay(it.color_name, it.color_code)}</td>
                        <td className="px-3 py-2.5">{it.size || "-"}</td>
                        <td className="px-3 py-2.5 text-right"><StockQtyButton item={it} /></td>
                        <td className="px-3 py-2.5 text-right">{n(it.available_qty)}</td>
                        <td className="px-3 py-2.5 text-right">{money(it.buy_price)}</td>
                        <td className="px-3 py-2.5 text-right">{money(it.sell_price)}</td>
                        <td className="px-3 py-2.5 text-center"><span className="inline-flex w-full justify-center"><MissingDataIndicator item={it} openUp={index >= Math.max(0, filtered.length - 2)} /></span></td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex justify-end gap-2">
                            <button className={btnSoft} onClick={() => openDetail(it.variant_id)}><Edit3 size={15} /> Részletek</button>
                            <button className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-300/35 bg-[#d31126] text-white hover:bg-[#b90f21] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setProductDeleteTarget(it)} title="Törlés" aria-label="Törlés" type="button"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {!filtered.length && <tr><td className="px-3 py-10 text-center text-white/55" colSpan={13}>Nincs megjeleníthető termék az AIF készletben.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {filtered.map((it) => {
                  const isSelected = Boolean(selectedVariants[String(it.variant_id || "")]);
                  return (
                  <article key={it.variant_id} className={`rounded-xl border p-3 ${isSelected ? "border-[#2a8d8b]/65 bg-[#2a8d8b]/14" : "border-white/12 bg-white/[0.05]"}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-xs text-white/76">
                        <input
                          className={selectBox}
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleVariantSelection(String(it.variant_id || ""), e.target.checked)}
                        />
                        Kijelölés
                      </label>
                      {isSelected && <span className="rounded-full border border-[#2a8d8b]/45 bg-[#2a8d8b]/22 px-2 py-0.5 text-[11px] text-white">Kijelölve</span>}
                    </div>
                    <div className="flex gap-3">
                      {it.image_url ? <img src={it.image_url} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-black/20 text-white/35"><ImagePlus size={20} /></div>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{it.title_ro || "-"}</p>
                        <p className="mt-1 text-xs text-white/55">{it.brand_name || "-"} • {it.category_name_hu || it.category_name_ro || "-"} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button className={`${chip} border-[#5bd0cc]/40 bg-[#203f49] text-[#d7fffd] hover:bg-[#25535c]`} onClick={() => openStockEditor(it)} type="button">Készlet: {n(it.total_qty)} • {stockRowsForVariant(it.variant_id).filter((s) => n(s.qty) > 0).length || 0} hely</button>
                          <span className={chip}>Elérhető: {n(it.available_qty)}</span>
                          <MissingDataIndicator item={it} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button className={btnSoft} onClick={() => openDetail(it.variant_id)}><Edit3 size={15} /> Részletek</button>
                      <button className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-300/35 bg-[#d31126] text-white hover:bg-[#b90f21]" onClick={() => setProductDeleteTarget(it)} title="Törlés" aria-label="Törlés" type="button"><Trash2 size={15} /></button>
                    </div>
                  </article>
                  );
                })}
                {!filtered.length && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-6 text-center text-sm text-white/60">Nincs megjeleníthető termék az AIF készletben.</div>}
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedPanelOpen && (
        <div className={modalWrap}>
          <div className="max-h-[88vh] w-full max-w-5xl overflow-auto rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Kijelölt termékek</p>
                <h2 className="mt-1 text-lg text-white">{selectedCount} termék kijelölve</h2>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button className={btnSoft} type="button" disabled={!selectedWorkCounts.label} onClick={() => setSelectedWorkPanel("label")} title="Vonalkód / címke listára tett termékek">
                  <Barcode size={15} /> Vonalkód / címke {selectedWorkCounts.label > 0 ? `(${selectedWorkCounts.label})` : ""}
                </button>
                <button className={btnSoft} type="button" disabled={!selectedWorkCounts.order} onClick={() => setSelectedWorkPanel("order")} title="Rendelés / PDF listára tett termékek">
                  <ClipboardList size={15} /> Rendelés / PDF {selectedWorkCounts.order > 0 ? `(${selectedWorkCounts.order})` : ""}
                </button>
                <button className={btnSoft} type="button" disabled={!selectedWorkCounts.move} onClick={() => setSelectedWorkPanel("move")} title="Készletmozgatás listára tett termékek">
                  <PackageCheck size={15} /> Készletmozgatás {selectedWorkCounts.move > 0 ? `(${selectedWorkCounts.move})` : ""}
                </button>
                <button className={btnSoft} onClick={() => setSelectedPanelOpen(false)} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-[#2a8d8b]/30 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                Ez a kijelölt termékek munkalistája. A kijelölés frissítés után és holnap is megmarad ebben a böngészőben, amíg innen el nem távolítod. A sor eleji pipával választható ki, hogy címkézéshez, rendeléshez vagy készletmozgatáshoz kerüljön.
              </div>

              <div className="grid gap-2">
                {selectedUnassignedItems.map((it) => (
                  <div key={it.variant_id} className="grid gap-3 rounded-xl border border-white/12 bg-[#3f4959] p-3 md:grid-cols-[36px,56px,1fr,auto] md:items-center">
                    <div className="flex justify-center">
                      <input
                        className={selectBox}
                        type="checkbox"
                        checked={false}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedActionTarget(it);
                        }}
                        aria-label="Feladat kiválasztása"
                        title="Feladat kiválasztása"
                      />
                    </div>
                    <div>
                      {it.image_url ? <img src={it.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black/20 text-white/35"><ImagePlus size={18} /></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{it.title_ro || "-"}</p>
                      <p className="mt-1 text-xs text-white/55">
                        {it.brand_name || "-"} • {it.category_name_hu || it.category_name_ro || "-"} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"}
                      </p>
                      <p className="mt-1 text-xs text-white/45">Készlet: {n(it.total_qty)} • Elérhető: {n(it.available_qty)} • SKU: {it.barcode || "-"}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button className={btnSoft} onClick={() => { setSelectedPanelOpen(false); openDetail(it.variant_id); }} type="button"><Edit3 size={14} /> Részletek</button>
                      <button className={btnSoft} onClick={() => { setSelectedPanelOpen(false); openStockEditor(it); }} type="button"><Boxes size={14} /> Készlet</button>
                      <button className={btnSoft} onClick={() => removeSelectedItemEverywhere(String(it.variant_id || ""))} type="button"><X size={14} /> Kivétel</button>
                    </div>
                  </div>
                ))}
                {!selectedUnassignedItems.length && (
                  <p className="rounded-xl border border-white/12 bg-[#3f4959] px-3 py-6 text-center text-sm text-white/60">
                    Nincs szabadon várakozó kijelölt termék. A felső gombokkal megnyithatók a feladatlisták.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap justify-between gap-2 border-t border-white/12 pt-3">
                <button className={btnSoft} onClick={clearSelectedVariants} type="button" title="A mentett kijelölési listát is törli"><X size={15} /> Teljes kijelölés törlése</button>
                <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] font-normal" onClick={() => setSelectedPanelOpen(false)} type="button">Kész</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {labelComposerOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-3 py-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Vonalkód / címke nyomtatás</p>
                <h2 className="mt-1 text-lg text-white">{labelRowsForPrint.length} termék • {labelPrintItems.length} címke</h2>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button className={btnSoft} onClick={() => setLabelComposerOpen(false)} type="button"><ArrowLeft size={15} /> Vissza</button>
                <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50 font-normal" onClick={printGeneratedLabels} disabled={!labelPrintItems.length} type="button"><Barcode size={15} /> Nyomtatás A4</button>
                <button className={btnSoft} onClick={() => setLabelComposerOpen(false)} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded-xl border border-[#2a8d8b]/30 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                A címkék egy közös A4-es ívre kerülnek egymás után, több termék együtt is. A címke a román kategóriát és az anyagösszetételt használja. Ha nincs anyagösszetétel, az a rész üres marad.
              </div>

              <section className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
                <div className="rounded-xl border border-white/12 bg-[#3f4959] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-white">Címke tartalma</p>
                    <span className="text-xs text-white/55">Kapcsold ki, ami nem kell a címkére</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {WAREHOUSE_LABEL_CONTENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        className={`flex min-h-[48px] items-start gap-2 rounded-xl border px-3 py-2 text-left transition ${
                          labelContent[opt.key]
                            ? "border-[#7bd7d4]/60 bg-[#2a8d8b]/20 text-white"
                            : "border-white/16 bg-[#303a4c] text-white/76"
                        }`}
                        onClick={() => toggleLabelContent(opt.key)}
                      >
                        <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                          labelContent[opt.key] ? "border-[#9af4d8]/80 bg-[#6ee7c8] text-[#123328]" : "border-white/35 bg-white/[0.04] text-white/30"
                        }`}>
                          {labelContent[opt.key] ? "✓" : ""}
                        </span>
                        <span className="grid gap-0.5">
                          <span className="text-xs text-white">{opt.label}</span>
                          <span className="text-[11px] leading-snug text-white/55">{opt.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/12 bg-[#3f4959] p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-white">Méret, kiosztás és sablon</p>
                    <span className="rounded-full border border-white/12 bg-white/[0.08] px-2.5 py-1 text-xs text-white/70">
                      {labelColCount} oszlop × {labelRowCount} sor • {labelsPerPage} címke / oldal • {Math.max(1, labelPrintPages.length)} oldal
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className={`${label} min-w-0`}>Gyors sablon
                      <select className={`${select} w-full min-w-0`} onChange={(e) => applyWarehouseLabelPreset(e.target.value)} defaultValue="40x46">
                        {WAREHOUSE_LABEL_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                      </select>
                    </label>
                    <label className={`${label} min-w-0`}>Címke szélesség mm<input className={`${input} w-full min-w-0`} value={labelWidth} onChange={(e) => setLabelWidth(e.target.value)} inputMode="decimal" /></label>
                    <label className={`${label} min-w-0`}>Címke magasság mm<input className={`${input} w-full min-w-0`} value={labelHeight} onChange={(e) => setLabelHeight(e.target.value)} inputMode="decimal" /></label>
                    <label className={`${label} min-w-0`}>Oszlop / A4<input className={`${input} w-full min-w-0`} value={labelCols} onChange={(e) => setLabelCols(e.target.value)} inputMode="numeric" /></label>
                    <label className={`${label} min-w-0`}>Sor / A4<input className={`${input} w-full min-w-0`} value={labelRows} onChange={(e) => setLabelRows(e.target.value)} inputMode="numeric" /></label>
                    <label className={`${label} min-w-0`}>Margó bal-jobb mm<input className={`${input} w-full min-w-0`} value={labelMarginX} onChange={(e) => setLabelMarginX(e.target.value)} inputMode="decimal" /></label>
                    <label className={`${label} min-w-0`}>Margó fent-lent mm<input className={`${input} w-full min-w-0`} value={labelMarginY} onChange={(e) => setLabelMarginY(e.target.value)} inputMode="decimal" /></label>
                    <label className={`${label} min-w-0`}>Cég neve a címkén<input className={`${input} w-full min-w-0`} value={labelCompanyName} onChange={(e) => setLabelCompanyName(e.target.value)} placeholder={WAREHOUSE_LABEL_COMPANY} /></label>
                    <label className={`${label} min-w-0`}>Pénznem
                      <select className={`${select} w-full min-w-0`} value={labelCurrency} onChange={(e) => { setLabelCurrency(e.target.value); if (!labelUnitText.trim() || labelUnitText === labelCurrency) setLabelUnitText(e.target.value); }}>
                        <option value="RON">RON</option>
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                        <option value="HUF">HUF</option>
                      </select>
                    </label>
                    <label className={`${label} min-w-0`}>Ár melletti egység<input className={`${input} w-full min-w-0`} value={labelUnitText} onChange={(e) => setLabelUnitText(e.target.value)} placeholder="RON" /></label>
                    <label className={`${label} min-w-0`}>Sablon neve<input className={`${input} w-full min-w-0`} value={labelTemplateName} onChange={(e) => setLabelTemplateName(e.target.value)} placeholder="Standard 40x46" /></label>
                    <label className={`${label} min-w-0`}>Mentett sablon
                      <select className={`${select} w-full min-w-0`} value="" onChange={(e) => loadWarehouseLabelTemplate(e.target.value)}>
                        <option value="">Betöltés</option>
                        {labelTemplates.map((template) => <option key={template.name} value={template.name}>{template.name}</option>)}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-white/72">
                      <input className={selectBox} type="checkbox" checked={labelShowBorder} onChange={(e) => setLabelShowBorder(e.target.checked)} />
                      Címke keret nyomtatása
                    </label>
                    <button className={btnSoft} type="button" onClick={saveCurrentWarehouseLabelTemplate}><Save size={14} /> Sablon mentése</button>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[1.05fr,0.95fr]">
                <div className="rounded-xl border border-white/12 bg-[#3f4959] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-white">Termékek és példányszám</p>
                    <span className="text-xs text-white/55">A készletnél több címke is kérhető</span>
                  </div>
                  <div className="grid gap-2">
                    {labelRowsForPrint.map((row) => (
                      <div key={row.id} className="grid gap-3 rounded-xl border border-white/12 bg-[#465163] p-3 md:grid-cols-[1fr,148px] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white">{row.title}</p>
                          <p className="mt-1 text-xs text-white/55">{row.brand} • {row.category} • {row.color} • {row.size}</p>
                          <p className="mt-1 text-xs text-white/45">Készlet: {row.stockQty} • Vonalkód: {row.barcode}</p>
                          {!row.render.ok && <p className="mt-1 text-xs text-rose-100">{row.render.error}</p>}
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] uppercase tracking-[0.05em] text-white/55">Címke darab</p>
                          <div className="flex h-9 overflow-hidden rounded-xl border border-white/20 bg-[#303a4c]">
                            <button className="flex h-full w-10 items-center justify-center border-r border-white/14 bg-white/[0.06] text-lg text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onClick={() => adjustLabelCopies(row.id, -1)} disabled={labelInt(labelCopies[row.id], 1, 0, 999) <= 0} type="button">−</button>
                            <input className="h-full min-w-0 flex-1 bg-transparent px-2 text-center text-sm tabular-nums text-white outline-none" value={String(labelInt(labelCopies[row.id], row.copies, 0, 999))} inputMode="numeric" onChange={(e) => updateLabelCopies(row.id, e.target.value)} />
                            <button className="flex h-full w-10 items-center justify-center border-l border-white/14 bg-[#2a8d8b] text-lg text-white transition hover:bg-[#319c99]" onClick={() => adjustLabelCopies(row.id, 1)} type="button">+</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!labelRowsForPrint.length && <p className="rounded-xl border border-white/12 bg-[#465163] px-3 py-5 text-center text-sm text-white/60">Nincs termék a Vonalkód / címke listában.</p>}
                  </div>
                </div>

                <div className="rounded-xl border border-white/12 bg-[#3f4959] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm text-white">Első oldal előnézet</p>
                    <span className="text-xs text-white/55">{Math.min(labelPrintItems.length, labelsPerPage)} / {labelPrintItems.length} címke</span>
                  </div>
                  {labelPrintItems.length ? (
                    <div className="aifWhLabelPreviewFrame" style={labelPrintStyle}>
                      <div className="aifWarehouseLabelPrintPage">
                        {(labelPrintPages[0] || []).map((printLabel) => (
                          <div className={`aifWarehousePrintLabel ${labelShowBorder ? "" : "noBorder"}`} key={printLabel.key}>
                            <WarehouseLabelContent label={printLabel} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/12 bg-[#465163] px-3 py-8 text-center text-sm text-white/60">Nincs előnézet.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {selectedActionTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-3 py-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Feladat kiválasztása</p>
                <h2 className="mt-1 text-lg text-white">{selectedActionTarget.title_ro || "Termék"}</h2>
              </div>
              <button className={btnSoft} onClick={() => setSelectedActionTarget(null)} type="button"><X size={14} /> Bezárás</button>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm text-white/70">Válaszd ki, melyik munkalistára kerüljön a kijelölt termék.</p>
              <div className="grid gap-2">
                <button className="flex items-center justify-between gap-3 rounded-xl border border-[#2a8d8b]/45 bg-[#2a8d8b]/18 px-3 py-3 text-left text-sm text-white hover:bg-[#2a8d8b]/26" onClick={() => assignSelectedItemToAction(selectedActionTarget, "label")} type="button">
                  <span className="inline-flex items-center gap-2"><Barcode size={16} /> Vonalkód / címke</span>
                  <span className="text-xs text-white/55">címkelista</span>
                </button>
                <button className="flex items-center justify-between gap-3 rounded-xl border border-white/16 bg-[#3f4959] px-3 py-3 text-left text-sm text-white hover:bg-[#475365]" onClick={() => assignSelectedItemToAction(selectedActionTarget, "order")} type="button">
                  <span className="inline-flex items-center gap-2"><ClipboardList size={16} /> Rendelés / PDF</span>
                  <span className="text-xs text-white/55">rendelési lista</span>
                </button>
                <button className="flex items-center justify-between gap-3 rounded-xl border border-white/16 bg-[#3f4959] px-3 py-3 text-left text-sm text-white hover:bg-[#475365]" onClick={() => assignSelectedItemToAction(selectedActionTarget, "move")} type="button">
                  <span className="inline-flex items-center gap-2"><PackageCheck size={16} /> Készletmozgatás</span>
                  <span className="text-xs text-white/55">átadási lista</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedWorkPanel && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-5xl overflow-auto rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">{selectedWorkActionLabels[selectedWorkPanel]}</p>
                <h2 className="mt-1 text-lg text-white">{selectedItemsForAction(selectedWorkPanel).length} termék a listában</h2>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {selectedWorkPanel === "label" && (
                  <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#2a8d8b]/55 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#319c99] font-normal" onClick={openLabelComposer} type="button" disabled={!selectedLabelItems.length || labelDetailsBusy}>
                    <Barcode size={15} /> {labelDetailsBusy ? "Termékadatok betöltése..." : "Vonalkódok / címkék generálása"}
                  </button>
                )}
                <button className={btnSoft} onClick={() => setSelectedWorkPanel(null)} type="button"><ArrowLeft size={15} /> Vissza</button>
                <button className={btnSoft} onClick={() => { setSelectedWorkPanel(null); setSelectedPanelOpen(false); }} type="button"><X size={15} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-[#2a8d8b]/30 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
                Itt vannak azok a termékek, amelyeket ehhez a feladathoz soroltál. A pipa levétele csak ebből a feladatlistából veszi ki, a fő Kijelölt termékek listában megmarad.
              </div>
              <div className="grid gap-2">
                {selectedItemsForAction(selectedWorkPanel).map((it) => (
                  <div key={it.variant_id} className="grid gap-3 rounded-xl border border-white/12 bg-[#3f4959] p-3 md:grid-cols-[36px,56px,1fr,auto] md:items-center">
                    <div className="flex justify-center">
                      <input
                        className={selectBox}
                        type="checkbox"
                        checked
                        onChange={(e) => {
                          if (!e.target.checked) returnSelectedItemToMainList(String(it.variant_id || ""));
                        }}
                        aria-label="Kivétel ebből a feladatlistából"
                        title="Kivétel ebből a feladatlistából, a fő kijelölt listában megmarad"
                      />
                    </div>
                    <div>
                      {it.image_url ? <img src={it.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black/20 text-white/35"><ImagePlus size={18} /></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{it.title_ro || "-"}</p>
                      <p className="mt-1 text-xs text-white/55">{it.brand_name || "-"} • {it.category_name_hu || it.category_name_ro || "-"} • {colorDisplay(it.color_name, it.color_code)} • {it.size || "-"}</p>
                      <p className="mt-1 text-xs text-white/45">Készlet: {n(it.total_qty)} • Elérhető: {n(it.available_qty)} • SKU: {it.barcode || "-"}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button className={btnSoft} onClick={() => { setSelectedWorkPanel(null); setSelectedPanelOpen(false); openDetail(it.variant_id); }} type="button"><Edit3 size={14} /> Részletek</button>
                      <button className={btnSoft} onClick={() => returnSelectedItemToMainList(String(it.variant_id || ""))} type="button"><ArrowLeft size={14} /> Vissza a fő listába</button>
                      <button className={btnSoft} onClick={() => removeSelectedItemEverywhere(String(it.variant_id || ""))} type="button" title="A teljes kijelölésből is kiveszi"><X size={14} /> Törlés minden listából</button>
                    </div>
                  </div>
                ))}
                {!selectedItemsForAction(selectedWorkPanel).length && (
                  <p className="rounded-xl border border-white/12 bg-[#3f4959] px-3 py-6 text-center text-sm text-white/60">Nincs termék ebben a listában.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {stockEditorTarget && (
        <div className={modalWrap}>
          <div className="max-h-[88vh] w-full max-w-xl overflow-auto rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3 backdrop-blur">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Készlet célhelyenként</p>
                <h2 className="mt-1 text-lg text-white">{stockEditorTarget.title_ro || "Termék"}</h2>
                <p className="mt-1 text-xs text-white/58">{stockEditorTarget.brand_name || "-"} • {colorDisplay(stockEditorTarget.color_name, stockEditorTarget.color_code)} • {stockEditorTarget.size || "-"}</p>
              </div>
              <button className={btnSoft} onClick={closeStockEditor} disabled={stockEditorSaving} type="button"><X size={14} /> Bezárás</button>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-[#5bd0cc]/30 bg-[#203f49] px-3 py-2 text-xs text-[#d7fffd]">
                A teljes készlet a célhelyek összege. Itt csak a jelenlegi mennyiséget állítjuk, termékadatot nem módosít.
              </div>

              <div className="space-y-2">
                {stockLocationRows.map((loc) => {
                  const key = locationKey(loc);
                  const current = stockForLocation(stockRowsForVariant(stockEditorTarget.variant_id), loc);
                  const reservedQty = Math.max(0, Math.floor(n(current?.reserved_qty)));
                  const qtyValue = Math.max(reservedQty, Math.floor(n(stockEditorRows[key])));
                  const availableDraft = Math.max(0, qtyValue - reservedQty);
                  return (
                    <div key={key} className="grid grid-cols-[1fr_136px] items-center gap-3 rounded-xl border border-white/12 bg-[#3f4959] px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{loc.name || loc.code || "-"}</p>
                        <p className="mt-0.5 text-[11px] text-white/50">
                          Előző: {n(current?.qty)} • Foglalt: {reservedQty} • Új elérhető: {availableDraft}
                        </p>
                      </div>
                      <div className="flex h-9 overflow-hidden rounded-xl border border-white/20 bg-[#303a4c]">
                        <button
                          className="flex h-full w-10 items-center justify-center border-r border-white/14 bg-white/[0.06] text-lg text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
                          onClick={() => adjustStockEditorQty(loc, -1)}
                          disabled={stockEditorSaving || qtyValue <= reservedQty}
                          title={reservedQty > 0 ? `Minimum a foglalt mennyiség miatt: ${reservedQty}` : "Készlet csökkentése"}
                          type="button"
                        >
                          −
                        </button>
                        <input
                          className="h-full min-w-0 flex-1 bg-transparent px-2 text-center text-sm tabular-nums text-white outline-none"
                          inputMode="numeric"
                          value={qtyValue}
                          readOnly
                          aria-label={`${loc.name || loc.code || "Célhely"} készlet`}
                        />
                        <button
                          className="flex h-full w-10 items-center justify-center border-l border-white/14 bg-[#2a8d8b] text-lg text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => adjustStockEditorQty(loc, 1)}
                          disabled={stockEditorSaving}
                          title="Készlet növelése"
                          type="button"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!stockLocationRows.length && <p className="rounded-xl border border-white/12 bg-[#3f4959] px-3 py-4 text-sm text-white/60">Nincs aktív célhely.</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/12 pt-3">
                <div className="text-xs text-white/60">
                  Új összesen: <span className="text-white">{Object.values(stockEditorRows).reduce((sum, x) => sum + n(x), 0)}</span>
                </div>
                <div className="flex gap-2">
                  <button className={btnSoft} onClick={closeStockEditor} disabled={stockEditorSaving} type="button">Mégse</button>
                  <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#7bd7d4]/45 bg-[#2a8d8b] px-3 text-xs text-white hover:bg-[#249b99] disabled:cursor-not-allowed disabled:opacity-50 font-normal" onClick={saveStockEditor} disabled={stockEditorSaving || !stockLocationRows.length} type="button">
                    <Save size={15} /> Készlet mentése
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {productDeleteTarget && (
        <div className={modalWrap}>
          <div className="w-full max-w-md rounded-2xl border border-white/18 bg-[#4b5362] shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/45">Termék törlése</p>
                <h2 className="mt-1 text-lg text-white">Biztosan törlöd?</h2>
              </div>
              <button className={taxonomySmallBtn} onClick={() => setProductDeleteTarget(null)} type="button"><X size={14} /> Bezárás</button>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-rose-200/24 bg-rose-500/10 px-3 py-3 text-sm text-white/86">
                <p className="text-white">{productDeleteTarget.title_ro || "Névtelen termék"}</p>
                <p className="mt-1 text-xs text-white/62">{productDeleteTarget.brand_name || "Nincs márka"} • {productDeleteTarget.category_name_hu || productDeleteTarget.category_name_ro || "Nincs kategória"} • {productDeleteTarget.size || "nincs méret"}</p>
              </div>
              <p className="text-xs leading-relaxed text-white/68">A termék eltűnik a raktárlistából. Készletmozgáshoz kapcsolt terméknél a rendszer archiválja, hogy a korábbi előzmények ne sérüljenek.</p>
              <div className="flex justify-end gap-2 pt-1">
                <button className={btnSoft} onClick={() => setProductDeleteTarget(null)} disabled={saving} type="button">Mégse</button>
                <button className={dangerBtn} onClick={confirmDeleteProduct} disabled={saving} type="button"><Trash2 size={15} /> Törlés</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {taxonomyOpen && (
        <div className={modalWrap}>
          <div className={taxonomyModal}>
            <div className="sticky top-0 z-10 border-b border-white/12 bg-[#404a5b]/98 px-4 py-3 backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/45">Raktár törzsadatok</p>
                  <h2 className="mt-1 text-[22px] leading-tight text-white">Kategóriák, nemek, színek, márka színkódok és összetevők kezelése</h2>
                  <p className="mt-1 text-sm text-white/60">Kompakt törzsadat-kezelés: bal oldalt szerkesztés, jobb oldalt lista.</p>
                </div>
                <button className={taxonomySmallBtn} onClick={() => setTaxonomyOpen(false)}><X size={14} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="inline-flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/10 p-1">
                <button className={taxonomyTab === "categories" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("categories"); setOpenTaxonomyMenu(null); }}>
                  Kategóriák <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{categories.length}</span>
                </button>
                <button className={taxonomyTab === "genders" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("genders"); setOpenTaxonomyMenu(null); }}>
                  Nemek <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{genderTypes.length}</span>
                </button>
                <button className={taxonomyTab === "colors" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("colors"); setOpenTaxonomyMenu(null); }}>
                  Színek <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{colorTypes.length}</span>
                </button>
                <button className={taxonomyTab === "brandColors" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("brandColors"); setOpenTaxonomyMenu(null); }}>
                  Márka színkódok <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{brandColorCodes.length}</span>
                </button>
                <button className={taxonomyTab === "materials" ? taxonomyTabActive : taxonomyTabIdle} onClick={() => { setTaxonomyTab("materials"); setOpenTaxonomyMenu(null); }}>
                  Összetevők <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] text-white/65">{materialTypes.length}</span>
                </button>
              </div>

              {taxonomyTab === "categories" && (
                <div className="grid gap-3 lg:grid-cols-[0.94fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{categoryForm.id ? "Kategória módosítása" : "Új kategória"}</p>
                        <p className="text-[11px] text-white/50">Román és magyar megnevezés, import aliasokkal.</p>
                      </div>
                      {categoryForm.id && <button className={taxonomySmallBtn} onClick={resetCategoryForm}>Új</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={taxonomyField}>Megnevezés románul<input className={taxonomyInput} value={categoryForm.nameRo} onChange={(e) => setCategoryForm((x) => ({ ...x, nameRo: e.target.value }))} /></label>
                      <label className={taxonomyField}>Megnevezés magyarul<input className={taxonomyInput} value={categoryForm.nameHu} onChange={(e) => setCategoryForm((x) => ({ ...x, nameHu: e.target.value }))} /></label>
                      <label className={`${taxonomyField} md:col-span-2`}>Aliasok / import nevek<textarea className={taxonomyTextarea} value={categoryForm.aliases} onChange={(e) => setCategoryForm((x) => ({ ...x, aliases: e.target.value }))} placeholder="TSHIRT, T-Shirt, SHORTS CAS, hoodie, joggers" /></label>
                      <label className={`${taxonomyField} md:max-w-[180px]`}>Sorrend
                        <input className={taxonomyInput} value={categoryForm.sortOrder} onChange={(e) => setCategoryForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!categoryForm.id && <span className="text-[11px] text-white/45">Javasolt következő: {nextCategorySortOrder}</span>}
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveCategoryForm} disabled={taxonomyBusy}><Save size={14} /> Mentés</button>
                    </div>
                  </section>
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Kategória lista</p>
                        <p className="text-[11px] text-white/50">Aktív elemek törzsrendi kezelése.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{categories.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {categories.map((c, index) => (
                        <div key={c.id} className={taxonomyRow}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-white">{categoryLabel(c)}</p>
                              {c.sort_order !== undefined && c.sort_order !== null && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">#{c.sort_order}</span>}
                            </div>
                            <p className="mt-0.5 text-[11px] text-white/50">RO: {c.name_ro || "-"} • HU: {c.name_hu || "-"}</p>
                            {!!c.aliases?.length && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">Alias: {c.aliases.join(", ")}</p>}
                          </div>
                          {taxonomyActionMenu({
                            menuId: `category-${c.id}`,
                            openUp: taxonomyMenuOpensUp(index, categories.length),
                            onEdit: () => editCategoryRow(c),
                            onDelete: () => setDeleteTarget({ kind: "category", id: String(c.id), name: categoryLabel(c) }),
                          })}
                        </div>
                      ))}
                      {!categories.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív kategória.</p>}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "genders" && (
                <div className="grid gap-3 lg:grid-cols-[0.9fr,1.1fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{genderForm.code ? "Nem módosítása" : "Új nem"}</p>
                        <p className="text-[11px] text-white/50">Megnevezés, import aliasok és sorrend.</p>
                      </div>
                      {genderForm.code && <button className={taxonomySmallBtn} onClick={resetGenderForm}>Új</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr,170px]">
                      <label className={taxonomyField}>Megnevezés<input className={taxonomyInput} value={genderForm.name} onChange={(e) => setGenderForm((x) => ({ ...x, name: e.target.value }))} /></label>
                      <label className={taxonomyField}>Sorrend
                        <input className={taxonomyInput} value={genderForm.sortOrder} onChange={(e) => setGenderForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!genderForm.code && <span className="text-[11px] text-white/45">Javasolt következő: {nextGenderSortOrder}</span>}
                      </label>
                      <label className={`${taxonomyField} md:col-span-2`}>Aliasok / import nevek<textarea className={taxonomyTextarea} value={genderForm.aliases} onChange={(e) => setGenderForm((x) => ({ ...x, aliases: e.target.value }))} placeholder="Barbat, Bărbat, Men, Ladies, Dama, Junior" /></label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveGenderForm} disabled={taxonomyBusy}><Save size={14} /> Mentés</button>
                    </div>
                  </section>
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Nemek listája</p>
                        <p className="text-[11px] text-white/50">A termékekhez használható nemek.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{genderTypes.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {genderTypes.map((g, index) => (
                        <div key={g.code} className={taxonomyRow}>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-white">{g.name}</p>
                              {g.sort_order !== undefined && g.sort_order !== null && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">#{g.sort_order}</span>}
                            </div>
                            <p className="mt-0.5 text-[11px] text-white/45">Kód: {g.code}</p>
                            {!!g.aliases?.length && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">Alias: {g.aliases.join(", ")}</p>}
                          </div>
                          {taxonomyActionMenu({
                            menuId: `gender-${g.code}`,
                            openUp: taxonomyMenuOpensUp(index, genderTypes.length),
                            onEdit: () => editGenderRow(g),
                            onDelete: () => setDeleteTarget({ kind: "gender", id: String(g.code), name: g.name }),
                          })}
                        </div>
                      ))}
                      {!genderTypes.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív elem.</p>}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "colors" && (
                <div className="grid gap-3 lg:grid-cols-[0.95fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{colorForm.id ? "Szín módosítása" : "Új szín"}</p>
                        <p className="text-[11px] text-white/50">Hivatalos román név, fordítások és import aliasok.</p>
                      </div>
                      {colorForm.id && <button className={taxonomySmallBtn} onClick={resetColorForm}>Új szín</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={taxonomyField}>Román hivatalos név<input className={taxonomyInput} value={colorForm.nameRo} onChange={(e) => setColorForm((x) => ({ ...x, nameRo: e.target.value }))} placeholder="pl. negru" /></label>
                      <label className={taxonomyField}>Magyar név<input className={taxonomyInput} value={colorForm.nameHu} onChange={(e) => setColorForm((x) => ({ ...x, nameHu: e.target.value }))} placeholder="pl. fekete" /></label>
                      <label className={taxonomyField}>Angol név<input className={taxonomyInput} value={colorForm.nameEn} onChange={(e) => setColorForm((x) => ({ ...x, nameEn: e.target.value }))} placeholder="pl. black" /></label>
                      <label className={taxonomyField}>Német név<input className={taxonomyInput} value={colorForm.nameDe} onChange={(e) => setColorForm((x) => ({ ...x, nameDe: e.target.value }))} placeholder="pl. schwarz" /></label>
                      <label className={`${taxonomyField} md:col-span-2`}>Aliasok / import nevek<textarea className={taxonomyTextarea} value={colorForm.aliases} onChange={(e) => setColorForm((x) => ({ ...x, aliases: e.target.value }))} placeholder="Black, schwarz, fekete, nero, noir" /></label>
                      <label className={taxonomyField}>HEX<input className={taxonomyInput} value={colorForm.hex} onChange={(e) => setColorForm((x) => ({ ...x, hex: e.target.value }))} placeholder="#000000" /></label>
                      <label className={taxonomyField}>Sorrend
                        <input className={taxonomyInput} value={colorForm.sortOrder} onChange={(e) => setColorForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!colorForm.id && <span className="text-[11px] text-white/45">Javasolt következő: {nextColorSortOrder}</span>}
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveColorForm} disabled={taxonomyBusy}><Save size={14} /> Mentés</button>
                    </div>
                  </section>
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Szín lista</p>
                        <p className="text-[11px] text-white/50">Fordításokkal és import aliasokkal együtt.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{colorTypes.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {colorTypes.map((c, index) => (
                        <div key={c.id} className={taxonomyRow}>
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-white/25 bg-white/10 shadow-[0_0_0_3px_rgba(255,255,255,0.03)]" style={c.hex ? { backgroundColor: c.hex } : undefined} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm text-white">{c.name_ro}</p>
                                {c.hex && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">{c.hex}</span>}
                                {c.sort_order !== undefined && c.sort_order !== null && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">#{c.sort_order}</span>}
                              </div>
                              <p className="mt-0.5 text-[11px] text-white/50">HU: {c.name_hu || "-"} • EN: {c.name_en || "-"} • DE: {c.name_de || "-"}</p>
                              {!!c.aliases?.length && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">Alias: {c.aliases.join(", ")}</p>}
                            </div>
                          </div>
                          {taxonomyActionMenu({
                            menuId: `color-${c.id}`,
                            openUp: taxonomyMenuOpensUp(index, colorTypes.length),
                            onEdit: () => editColorRow(c),
                            onDelete: () => setDeleteTarget({ kind: "color", id: String(c.id), name: c.name_ro }),
                          })}
                        </div>
                      ))}
                      {!colorTypes.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív szín.</p>}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "brandColors" && (
                <div className="grid gap-3 lg:grid-cols-[0.95fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{brandColorForm.id ? "Márka színkód módosítása" : "Új márka színkód"}</p>
                        <p className="text-[11px] text-white/50">Gyártói kód fordítása AllIn színre, márkához kötve. Nem globális alias, mert nem szeretnénk Excel-vuduval átkozni a jövőt.</p>
                      </div>
                      {brandColorForm.id && <button className={taxonomySmallBtn} onClick={resetBrandColorForm}>Új színkód</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={taxonomyField}>Márka
                        <select className={taxonomyInput} value={brandColorForm.brandId} onChange={(e) => setBrandColorForm((x) => ({ ...x, brandId: e.target.value }))}>
                          <option value="">Válassz márkát</option>
                          {brands.map((b) => <option key={b.id} value={b.id}>{brandLabel(b)}</option>)}
                        </select>
                      </label>
                      <label className={taxonomyField}>Gyártói színkód
                        <input className={taxonomyInput} value={brandColorForm.colorCode} onChange={(e) => setBrandColorForm((x) => ({ ...x, colorCode: e.target.value.toUpperCase() }))} placeholder="pl. 100 vagy 001" />
                      </label>
                      <label className={taxonomyField}>AllIn szín
                        <select className={taxonomyInput} value={brandColorForm.colorTypeId} onChange={(e) => setBrandColorForm((x) => ({ ...x, colorTypeId: e.target.value }))}>
                          <option value="">Válassz színt</option>
                          {colorTypes.map((c) => <option key={c.id} value={c.id}>{colorTypeLabel(c)}{c.name_ro && c.name_hu ? ` • ${c.name_ro}` : ""}</option>)}
                        </select>
                      </label>
                      <label className={`${taxonomyField} md:col-span-2`}>Megjegyzés
                        <textarea className={taxonomyTextarea} value={brandColorForm.notes} onChange={(e) => setBrandColorForm((x) => ({ ...x, notes: e.target.value }))} placeholder="pl. Under Armour CODPRODUS utolsó része: 100 = fekete/negru" />
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveBrandColorForm} disabled={taxonomyBusy}><Save size={14} /> Mentés</button>
                    </div>
                  </section>

                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Márka színkód lista</p>
                        <p className="text-[11px] text-white/50">Importnál például Under Armour + 100 → fekete/negru.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{brandColorCodes.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {brandColorCodes.map((row, index) => (
                        <div key={row.id} className={taxonomyRow}>
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-white/25 bg-white/10 shadow-[0_0_0_3px_rgba(255,255,255,0.03)]" style={row.color_hex ? { backgroundColor: row.color_hex } : undefined} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm text-white">{row.brand_name || row.brand_code || "-"}</p>
                                <span className="rounded-full border border-[#67d4d1]/25 bg-[#208d8b]/18 px-2 py-0.5 text-[10px] text-white">{row.color_code}</span>
                                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/65">{row.color_name_hu || row.color_name_ro || row.color_type_code || "-"}</span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-white/50">RO: {row.color_name_ro || "-"} • HU: {row.color_name_hu || "-"} • HEX: {row.color_hex || "-"}</p>
                              {row.notes && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">{row.notes}</p>}
                            </div>
                          </div>
                          {taxonomyActionMenu({
                            menuId: `brand-color-${row.id}`,
                            openUp: taxonomyMenuOpensUp(index, brandColorCodes.length),
                            onEdit: () => editBrandColorRow(row),
                            onDelete: () => setDeleteTarget({ kind: "brandColor", id: String(row.id), name: `${row.brand_name || row.brand_code || "-"} / ${row.color_code}` }),
                          })}
                        </div>
                      ))}
                      {!brandColorCodes.length && (
                        <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/60">
                          Nincs aktív márka színkód. Ha az SQL már lefutott, akkor az aif.js backend még nincs frissen deployolva.
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {taxonomyTab === "materials" && (
                <div className="grid gap-3 lg:grid-cols-[0.95fr,1.28fr]">
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">{materialForm.id ? "Összetevő módosítása" : "Új összetevő"}</p>
                        <p className="text-[11px] text-white/50">Hivatalos román név, fordítások és import aliasok.</p>
                      </div>
                      {materialForm.id && <button className={taxonomySmallBtn} onClick={resetMaterialForm}>Új összetevő</button>}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={taxonomyField}>Román hivatalos név<input className={taxonomyInput} value={materialForm.nameRo} onChange={(e) => setMaterialForm((x) => ({ ...x, nameRo: e.target.value }))} placeholder="pl. bumbac" /></label>
                      <label className={taxonomyField}>Magyar név<input className={taxonomyInput} value={materialForm.nameHu} onChange={(e) => setMaterialForm((x) => ({ ...x, nameHu: e.target.value }))} placeholder="pl. pamut" /></label>
                      <label className={taxonomyField}>Angol név<input className={taxonomyInput} value={materialForm.nameEn} onChange={(e) => setMaterialForm((x) => ({ ...x, nameEn: e.target.value }))} placeholder="pl. cotton" /></label>
                      <label className={taxonomyField}>Német név<input className={taxonomyInput} value={materialForm.nameDe} onChange={(e) => setMaterialForm((x) => ({ ...x, nameDe: e.target.value }))} placeholder="pl. baumwolle" /></label>
                      <label className={`${taxonomyField} md:col-span-2`}>Aliasok / import nevek<textarea className={taxonomyTextarea} value={materialForm.aliases} onChange={(e) => setMaterialForm((x) => ({ ...x, aliases: e.target.value }))} placeholder="COTTON, BODY FABRIC COTTON, Baumwolle, pamut" /></label>
                      <label className={taxonomyField}>Sorrend
                        <input className={taxonomyInput} value={materialForm.sortOrder} onChange={(e) => setMaterialForm((x) => ({ ...x, sortOrder: e.target.value }))} />
                        {!materialForm.id && <span className="text-[11px] text-white/45">Javasolt következő: {nextMaterialSortOrder}</span>}
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className={taxonomyPrimaryBtn} onClick={saveMaterialForm} disabled={taxonomyBusy}><Save size={14} /> Mentés</button>
                    </div>
                  </section>
                  <section className={taxonomyCard}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm text-white/88">Összetevő lista</p>
                        <p className="text-[11px] text-white/50">Import nevek hivatalos román összetevőkre fordítva.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/10 px-2 py-1 text-[11px] text-white/55">{materialTypes.length} elem</span>
                    </div>
                    <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
                      {materialTypes.map((m, index) => (
                        <div key={m.id} className={taxonomyRow}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm text-white">{m.name_hu || m.name_ro}</p>
                              {m.sort_order !== undefined && m.sort_order !== null && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/55">#{m.sort_order}</span>}
                            </div>
                            <p className="mt-0.5 text-[11px] text-white/50">RO: {m.name_ro || "-"} • HU: {m.name_hu || "-"} • EN: {m.name_en || "-"} • DE: {m.name_de || "-"}</p>
                            {!!m.aliases?.length && <p className="mt-1 max-w-xl truncate text-[11px] text-white/42">Alias: {m.aliases.join(", ")}</p>}
                          </div>
                          {taxonomyActionMenu({
                            menuId: `material-${m.id}`,
                            openUp: taxonomyMenuOpensUp(index, materialTypes.length),
                            onEdit: () => editMaterialRow(m),
                            onDelete: () => setDeleteTarget({ kind: "material", id: String(m.id), name: m.name_hu || m.name_ro }),
                          })}
                        </div>
                      ))}
                      {!materialTypes.length && <p className="rounded-xl border border-white/10 bg-black/10 px-3 py-5 text-center text-sm text-white/50">Nincs aktív összetevő.</p>}
                    </div>
                  </section>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/64 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/18 bg-[#4b5362] p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rose-300/30 bg-[#cf1028] text-white shadow-[0_0_22px_rgba(207,16,40,0.35)]">
                <Trash2 size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-base text-white">Törlés megerősítése</p>
                <p className="mt-1 text-sm text-white/68">A kiválasztott törzsadat törlésre kerül. Ha már használatban van, a rendszer inaktiválja, hogy a korábbi adatok ne sérüljenek.</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-white/12 bg-[#354153] px-3 py-2 text-sm text-white">
              {deleteTarget.name}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={taxonomySmallBtn} onClick={() => setDeleteTarget(null)} disabled={taxonomyBusy} type="button"><X size={13} /> Mégse</button>
              <button className={taxonomyDangerBtn} onClick={confirmDeleteTaxonomy} disabled={taxonomyBusy} type="button"><Trash2 size={13} /> Törlés</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className={modalWrap}>
          <div className={modal}>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3">
              <div>
                <p className="text-sm text-white/65">Termékadatlap</p>
                <h2 className="text-xl">{detail.item?.title_ro || "Termék"}</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  className={btn}
                  onClick={() => goBarcodeManager(detail.item?.id, edit.barcode, edit.titleRo || detail.item?.title_ro)}
                  disabled={!detail.item?.id}
                  type="button"
                  title="Külön vonalkód- és címkemodul megnyitása"
                >
                  <Barcode size={16} /> Vonalkód / címke
                </button>
                <button className={btnSoft} onClick={() => setDetail(null)}><X size={16} /> Bezárás</button>
              </div>
            </div>
            <div className="space-y-4 p-4">
              {detailBusy && <div className="rounded-xl border border-white/12 bg-white/[0.05] p-4 text-sm text-white/65">Betöltés...</div>}

              <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
                <div className="space-y-3 rounded-xl border border-white/12 bg-white/[0.05] p-3">
                  {edit.imageUrl ? <img src={edit.imageUrl} alt="" className="aspect-square w-full rounded-xl object-cover" /> : <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-black/20 text-white/35"><ImagePlus size={32} /></div>}
                  <label className={label}>Kép feltöltése
                    <input type="file" accept="image/*" className="text-xs text-white/70" onChange={(e) => onImageSelected(e.target.files?.[0] || null)} />
                  </label>
                  <label className={label}>Kép URL
                    <input className={input} value={edit.imageUrl} onChange={(e) => setEdit((x) => ({ ...x, imageUrl: e.target.value }))} placeholder="https://..." />
                  </label>
                  <div className="rounded-xl border border-white/12 bg-black/10 p-3 text-xs text-white/60">
                    <p>Belső azonosító: {detail.item?.internal_sku || "-"}</p>
                    <p className="mt-1">Vonalkód / SKU alap: {edit.barcode || "nincs megadva"}</p>
                    <p className="mt-1">Utolsó módosítás: {dateShort(detail.item?.updated_at)}</p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm"><Edit3 size={16} /> Alapadatok</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={label}>Terméknév románul<input className={input} value={edit.titleRo} onChange={(e) => setEdit((x) => ({ ...x, titleRo: e.target.value }))} /></label>
                      <label className={label}>Terméknév magyarul<input className={input} value={edit.titleHu} onChange={(e) => setEdit((x) => ({ ...x, titleHu: e.target.value }))} /></label>
                      <label className={`${label} md:col-span-2`}>Leírás<textarea className="min-h-[90px] rounded-xl border border-white/18 bg-[#3f4959] px-3 py-2 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/45" value={edit.descriptionRo} onChange={(e) => setEdit((x) => ({ ...x, descriptionRo: e.target.value }))} /></label>
                      <label className={label}>Márka<select className={select} value={edit.brandCode} onChange={(e) => setEdit((x) => ({ ...x, brandCode: e.target.value }))}><option value="">Nincs beállítva</option>{brands.map((b) => <option key={b.id} value={b.code || b.id}>{b.name}</option>)}</select></label>
                      <label className={label}>Kategória<select className={select} value={edit.categoryCode} onChange={(e) => setEdit((x) => ({ ...x, categoryCode: e.target.value }))}><option value="">Nincs beállítva</option>{categories.map((c) => <option key={c.id} value={c.code || c.id}>{categoryLabel(c)}</option>)}</select></label>
                      <label className={label}>Nem<select className={select} value={edit.gender} onChange={(e) => setEdit((x) => ({ ...x, gender: e.target.value }))}>{genderTypes.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}</select></label>
                      <label className={label}>Terméktípus<input className={input} value={edit.productType} onChange={(e) => setEdit((x) => ({ ...x, productType: e.target.value }))} /></label>
                      <label className={label}>Szezon<input className={input} value={edit.season} onChange={(e) => setEdit((x) => ({ ...x, season: e.target.value }))} /></label>
                      <label className={label}>Anyag / összetétel<input className={input} value={edit.material} onChange={(e) => setEdit((x) => ({ ...x, material: e.target.value }))} /></label>
                    </div>
                  </section>

                  <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm"><Boxes size={16} /> Variáns és árak</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className={label}>
                        <span className="flex items-center gap-1.5">
                          <span>Vonalkód / Shopify SKU alap</span>
                          <span
                            className={`group relative inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] leading-none shadow transition ${
                              String(edit.barcode || "").trim()
                                ? "border-[#7bd7d4]/70 bg-[#2a8d8b] text-white shadow-[0_0_10px_rgba(42,141,139,0.38)]"
                                : "border-amber-200/60 bg-amber-300 text-slate-900 shadow-[0_0_10px_rgba(252,211,77,0.32)]"
                            }`}
                            tabIndex={0}
                            aria-label={String(edit.barcode || "").trim() ? "SKU alap megadva" : "Egyedi variánsazonosító információ"}
                          >
                            i
                            <span
                              className={`pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden w-64 -translate-x-1/2 rounded-lg border bg-[#1f2937] px-2 py-1.5 text-[11px] leading-snug tracking-normal text-white shadow-xl group-hover:block group-focus:block ${
                                String(edit.barcode || "").trim() ? "border-[#2a8d8b]/55" : "border-amber-200/35"
                              }`}
                            >
                              {String(edit.barcode || "").trim()
                                ? "SKU alap megadva. Ez kerül a Shopify SKU mezőbe."
                                : "Egyedi variánsazonosító. Később ez kerül a Shopify SKU mezőbe."}
                            </span>
                          </span>
                        </span>
                        <input className={input} value={edit.barcode} onChange={(e) => setEdit((x) => ({ ...x, barcode: e.target.value }))} />
                      </label>
                      <label className={label}>Szín<input className={input} value={edit.colorName} onChange={(e) => setEdit((x) => ({ ...x, colorName: e.target.value }))} onBlur={() => setEdit((x) => ({ ...x, colorName: normalizeColor(x.colorName) }))} placeholder="pl. negru" /></label>
                      <label className={label}>Színkód<input className={input} value={edit.colorCode} onChange={(e) => setEdit((x) => ({ ...x, colorCode: e.target.value }))} /></label>
                      <label className={label}>Méret<input className={input} value={edit.size} onChange={(e) => setEdit((x) => ({ ...x, size: e.target.value }))} /></label>
                      <label className={label}>Vételár<input className={input} value={edit.buyPrice} onChange={(e) => setEdit((x) => ({ ...x, buyPrice: e.target.value }))} /></label>
                      <label className={label}>Eladási ár<input className={input} value={edit.sellPrice} onChange={(e) => setEdit((x) => ({ ...x, sellPrice: e.target.value }))} /></label>
                      <label className={label}>Variáns állapot<select className={select} value={edit.variantStatus} onChange={(e) => setEdit((x) => ({ ...x, variantStatus: e.target.value }))}><option value="active">Aktív</option><option value="inactive">Inaktív</option><option value="archived">Archivált</option></select></label>
                      <label className={label}>Modell állapot<select className={select} value={edit.modelStatus} onChange={(e) => setEdit((x) => ({ ...x, modelStatus: e.target.value }))}><option value="draft">Előkészítés</option><option value="active">Aktív</option><option value="archived">Archivált</option></select></label>
                      <label className={label}>Shopify cím<input className={input} value={edit.shopifyTitle} onChange={(e) => setEdit((x) => ({ ...x, shopifyTitle: e.target.value }))} /></label>
                    </div>
                  </section>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Készlet célhelyenként</p>
                  <div className="space-y-2 text-sm">
                    {(detail.stock || []).map((s) => <div key={s.location_id} className="flex justify-between gap-3 rounded-lg bg-black/10 px-3 py-2"><span>{s.location_name}</span><span>{n(s.qty)} / elérhető {n(s.available_qty)}</span></div>)}
                    {!detail.stock?.length && <p className="text-white/55">Nincs készletadat.</p>}
                  </div>
                </section>
                <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Beszállítói kapcsolatok</p>
                  <div className="space-y-2 text-sm">
                    {(detail.supplierCodes || []).slice(0, 5).map((s) => <div key={s.id} className="rounded-lg bg-black/10 px-3 py-2"><p>{s.supplier_name || "-"}</p><p className="text-xs text-white/55">Termékkód: {s.supplier_product_code || "-"} • Méret: {s.supplier_size || "-"}</p></div>)}
                    {!detail.supplierCodes?.length && <p className="text-white/55">Nincs beszállítói kapcsolat.</p>}
                  </div>
                </section>
                <section className="rounded-xl border border-white/12 bg-white/[0.05] p-4">
                  <p className="mb-3 text-sm text-white/80">Hiányzó adatok</p>
                  <div className="flex flex-wrap gap-2">
                    {missingLabels({ ...detail.item, image_url: edit.imageUrl, barcode: edit.barcode, buy_price: edit.buyPrice, sell_price: edit.sellPrice, title_ro: edit.titleRo, size: edit.size }).map((x) => <span key={x} className="rounded-full border border-amber-200/25 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100">{x}</span>)}
                    {!missingLabels({ ...detail.item, image_url: edit.imageUrl, barcode: edit.barcode, buy_price: edit.buyPrice, sell_price: edit.sellPrice, title_ro: edit.titleRo, size: edit.size }).length && <span className="rounded-full border border-emerald-200/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100">Nincs jelölt hiány</span>}
                  </div>
                </section>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-white/12 pt-4">
                <button className={btnSoft} onClick={() => setDetail(null)}><X size={16} /> Mégse</button>
                <button className={btn} onClick={saveDetail} disabled={saving}><Save size={16} /> Mentés</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {busy && <div className="fixed bottom-4 right-4 rounded-xl border border-white/15 bg-[#404a5b] px-4 py-3 text-sm text-white/80 shadow-xl"><RefreshCw className="mr-2 inline" size={15} /> Betöltés...</div>}
      {totals.watch > 0 && <div className="fixed bottom-4 left-4 hidden rounded-xl border border-amber-200/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-50 shadow-xl lg:block"><AlertTriangle className="mr-2 inline" size={15} /> {totals.watch} figyelendő készleten lévő variáns</div>}
    
      <div className="aifWarehouseLabelPrintRoot" style={labelPrintStyle}>
        {labelPrintPages.map((page, pageIndex) => (
          <div className="aifWarehouseLabelPrintPage" key={`label-page-${pageIndex}`}>
            {page.map((printLabel) => (
              <div className={`aifWarehousePrintLabel ${labelShowBorder ? "" : "noBorder"}`} key={printLabel.key}>
                <WarehouseLabelContent label={printLabel} />
              </div>
            ))}
          </div>
        ))}
      </div>
</main>
  );
}
