import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  Boxes,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Filter,
  Home,
  ImagePlus,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";

type Props = {
  apiBase?: string;
  actor?: string;
  role?: string;
  shopId?: string;
  onLogout?: () => void;
};

type MetaItem = {
  id: string;
  code?: string | null;
  name?: string | null;
  name_ro?: string | null;
  name_hu?: string | null;
  parent_id?: string | null;
  parentId?: string | null;
  aliases?: string[] | null;
  is_active?: boolean;
};

type GenderType = { code: string; name: string; aliases?: string[] | null; is_active?: boolean };

type ColorType = {
  id: string;
  code: string;
  name_ro: string;
  name_hu?: string | null;
  name_en?: string | null;
  name_de?: string | null;
  aliases?: string[] | null;
  hex?: string | null;
  is_active?: boolean;
};

type SizeType = { id: string; code?: string; name?: string; name_hu?: string | null; aliases?: string[] | null; is_active?: boolean };

type StockItem = {
  variant_id: string;
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  qty?: number | string | null;
  reserved_qty?: number | string | null;
  available_qty?: number | string | null;
  updated_at?: string | null;
};

type InventoryItem = {
  variant_id: string;
  id?: string | null;
  internal_sku?: string | null;
  barcode?: string | null;
  display_barcode?: string | null;
  supplier_product_code?: string | null;
  supplierProductCode?: string | null;
  product_code?: string | null;
  productCode?: string | null;
  supplier_codes?: string | null;
  sn_cod?: string | null;
  snCod?: string | null;
  customs_tariff_code?: string | null;
  customsTariffCode?: string | null;
  hs_code?: string | null;
  attributes?: Record<string, unknown> | null;
  image_url?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
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
  category_name_hu?: string | null;
  subcategory_id?: string | null;
  subcategory_code?: string | null;
  subcategory_name_ro?: string | null;
  subcategory_name_hu?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  size?: string | null;
  buy_price?: string | number | null;
  sell_price?: string | number | null;
  compare_at_price?: string | number | null;
  variant_status?: string | null;
  status?: string | null;
  total_qty?: number | string | null;
  total_reserved_qty?: number | string | null;
  available_qty?: number | string | null;
  last_stock_movement_at?: string | null;
  last_incoming_at?: string | null;
};

type DetailResponse = { item: InventoryItem & Record<string, any>; stock?: StockItem[]; supplierCodes?: any[]; movements?: any[] };

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
  subCategoryCode: string;
  barcode: string;
  supplierProductCode: string;
  snCod: string;
  customsTariffCode: string;
  colorCode: string;
  colorName: string;
  size: string;
  buyPrice: string;
  sellPrice: string;
  compareAtPrice: string;
  imageUrl: string;
  variantStatus: string;
};


type SortMode = "name" | "brand" | "stock_desc" | "stock_asc" | "value_desc" | "incoming_desc" | "missing";
type StockFilter = "all" | "available" | "out" | "reserved" | "missing" | "watch";
type ImageFilter = "all" | "with" | "missing";

const WAREHOUSE_SALES_TVA_RATE_PERCENT = 21;
const page = "min-h-screen bg-[#4b5362] pb-28 text-white font-normal";
const sheetPanel = "fixed inset-x-0 bottom-0 z-[70] max-h-[86vh] overflow-auto rounded-t-[28px] border border-white/18 bg-[#303a4c] p-4 shadow-2xl shadow-black/50";
const input = "h-11 w-full rounded-2xl border border-white/16 bg-[#263246] px-3 text-sm text-white outline-none placeholder:text-white/42 focus:border-[#7bd7d4]/65";
const select = `${input} pr-8`;
const label = "grid gap-1.5 text-[11px] uppercase tracking-[0.06em] text-white/62";
const primaryBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[#7bd7d4]/45 bg-[#2a8d8b] px-3 text-xs font-medium text-white shadow-[0_10px_24px_rgba(42,141,139,0.22)] transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50";
const softBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/16 bg-white/[0.08] px-3 text-xs font-medium text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50";
const iconBtn = "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/16 bg-white/[0.08] text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50";
const selectedProductsStorageKey = "allinfashion:warehouse:selectedVariants:v1";
const stockMovesChangedStorageKey = "allinfashion:stockMoves:changed:v1";
const stockMovesChangedEventName = "aif:stock-moves-changed";
const warehouseShowAllAfterIncomingStorageKey = "allinfashion:warehouse:showAllAfterIncoming:v1";
const warehouseShowAllAfterIncomingEventName = "aif:warehouse-show-all-after-incoming";
const WAREHOUSE_BARCODE_SCAN_FORMATS = [
  "code_128",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_39",
  "code_93",
  "itf",
  "codabar",
  "qr_code",
  "data_matrix",
];
const WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};
const WAREHOUSE_ZXING_BROWSER_CDN = "https://unpkg.com/@zxing/browser@0.1.5";
let warehouseZxingBrowserPromise: Promise<any | null> | null = null;

function cleanScannedBarcode(value: unknown) {
  return String(value ?? "").replace(/[\r\n\t]+/g, "").trim();
}

function zxingResultText(result: unknown) {
  const r = result as any;
  if (!r) return "";
  if (typeof r.getText === "function") return cleanScannedBarcode(r.getText());
  return cleanScannedBarcode(r.text || r.rawValue || "");
}

function loadWarehouseZxingBrowser(): Promise<any | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  const existingGlobal = (window as any).ZXingBrowser;
  if (existingGlobal?.BrowserMultiFormatReader || existingGlobal?.BrowserMultiFormatOneDReader) return Promise.resolve(existingGlobal);
  if (warehouseZxingBrowserPromise) return warehouseZxingBrowserPromise;

  warehouseZxingBrowserPromise = new Promise((resolve) => {
    const finish = () => resolve((window as any).ZXingBrowser || null);
    const existing = document.querySelector<HTMLScriptElement>('script[data-aif-zxing-browser="true"]');
    if (existing) {
      if (existing.dataset.loaded === "true") {
        finish();
        return;
      }
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = WAREHOUSE_ZXING_BROWSER_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.aifZxingBrowser = "true";
    script.onload = () => {
      script.dataset.loaded = "true";
      finish();
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return warehouseZxingBrowserPromise;
}

function n(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return "-";
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return String(value);
  return parsed.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qty(value: unknown) {
  return Math.floor(n(value)).toLocaleString("hu-HU");
}

function priceNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function sellPriceWithoutTva(value: unknown, tvaRatePercent = WAREHOUSE_SALES_TVA_RATE_PERCENT) {
  const gross = priceNumber(value);
  if (gross === null) return null;
  const divisor = 1 + Math.max(0, Number(tvaRatePercent) || 0) / 100;
  const net = gross / divisor;
  return Number.isFinite(net) ? net : null;
}

function priceMarkupPercentValue(buyPrice: unknown, sellPrice: unknown) {
  const buy = priceNumber(buyPrice);
  const sellNet = sellPriceWithoutTva(sellPrice);
  if (!buy || buy <= 0 || sellNet === null) return null;
  const percent = ((sellNet - buy) / buy) * 100;
  return Number.isFinite(percent) ? percent : null;
}

function priceMarkupPercentText(buyPrice: unknown, sellPrice: unknown) {
  const percent = priceMarkupPercentValue(buyPrice, sellPrice);
  if (percent === null) return "";
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toLocaleString("hu-HU", { maximumFractionDigits: 0 })}%`;
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function firstCsvText(value: unknown) {
  return String(value ?? "").split(",").map((x) => x.trim()).find(Boolean) || "";
}

function splitCsv(value: unknown) {
  return String(value ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

function dateTimeMs(value: unknown) {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function dateShort(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ro-RO");
}

function latestIncomingMs(item: Partial<InventoryItem>) {
  return Math.max(dateTimeMs(item.last_incoming_at), dateTimeMs(item.last_stock_movement_at));
}

function categoryParentId(row?: Partial<MetaItem> | null) {
  return String(row?.parent_id || row?.parentId || "").trim();
}

function isMainCategory(row?: Partial<MetaItem> | null) {
  return !categoryParentId(row);
}

function categoryLabel(row?: Partial<MetaItem> | null) {
  if (!row) return "-";
  return firstText(row.name_hu, row.name_ro, row.name, row.code, row.id) || "-";
}

function metaValues(row?: Partial<MetaItem> | null) {
  if (!row) return [];
  return [row.id, row.code, row.name, row.name_ro, row.name_hu, ...(Array.isArray(row.aliases) ? row.aliases : [])]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function metaMatches(row: Partial<MetaItem> | null | undefined, value: unknown) {
  const key = normalizeSearch(value);
  return Boolean(row && key && metaValues(row).some((x) => normalizeSearch(x) === key));
}

function itemProductCode(item: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (item || {}) as Record<string, any>;
  const direct = firstText(
    source.supplier_product_code,
    source.supplierProductCode,
    source.product_code,
    source.productCode,
    source.import_supplier_product_code,
    source.importSupplierProductCode,
    firstCsvText(source.supplier_codes),
  );
  if (direct) return direct;
  const barcodeLike = firstText(source.display_barcode, source.barcode);
  const internal = firstText(source.internal_sku, source.internalSku);
  if (barcodeLike && barcodeLike !== internal && !/^AIF[-_]/i.test(barcodeLike) && /[-_/]/.test(barcodeLike)) return barcodeLike;
  const model = firstText(source.model_code, source.modelCode);
  if (!model) return "";
  return model.includes(":") ? (model.split(":").pop() || model).trim() : model;
}

function visibleWarehouseBarcode(item: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (item || {}) as Record<string, any>;
  const raw = firstText(source.barcode, source.display_barcode);
  if (!raw) return "";
  const internal = firstText(source.internal_sku, source.internalSku);
  const productCode = itemProductCode(source);
  if (internal && raw === internal) return "";
  if (productCode && normalizeSearch(raw) === normalizeSearch(productCode)) return "";
  if (/^AIF[-_]/i.test(raw)) return "";
  return raw;
}

function itemMatchesScannedBarcode(item: InventoryItem, scannedBarcode: unknown) {
  const q = normalizeSearch(cleanScannedBarcode(scannedBarcode));
  if (!q) return false;
  const values = [
    visibleWarehouseBarcode(item),
    item.barcode,
    item.display_barcode,
    item.internal_sku,
    item.model_code,
    itemProductCode(item),
    item.supplier_product_code,
    item.supplierProductCode,
    item.product_code,
    item.productCode,
    item.sn_cod,
    item.snCod,
    itemCustomsTariffCode(item),
    item.supplier_codes,
    ...splitCsv(item.supplier_codes),
  ];
  return values
    .map((value) => normalizeSearch(cleanScannedBarcode(value)))
    .filter(Boolean)
    .some((value) => value === q);
}

function itemCustomsTariffCode(item: Partial<InventoryItem> | Record<string, any> | null | undefined) {
  const source = (item || {}) as Record<string, any>;
  const attrs = source.attributes && typeof source.attributes === "object" ? source.attributes as Record<string, unknown> : {};
  return firstText(
    source.customs_tariff_code,
    source.customsTariffCode,
    source.hs_code,
    attrs.customsTariffCode,
    attrs.customs_tariff_code,
    attrs.hsCode,
    attrs.hs_code,
    attrs.tariffCode,
    attrs.tariff_code,
  );
}

function itemTitle(item: Partial<InventoryItem>) {
  return firstText(item.title_ro, item.shopify_title, item.title_hu, item.model_code, itemProductCode(item)) || "Névtelen termék";
}

function itemMainCategory(item: Partial<InventoryItem>) {
  return firstText(item.category_name_hu, item.category_name_ro, item.category_code) || "-";
}

function itemSubCategory(item: Partial<InventoryItem>) {
  return firstText(item.subcategory_name_hu, item.subcategory_name_ro, item.subcategory_code, item.product_type);
}

function itemStatus(item: Partial<InventoryItem>) {
  return String(item.variant_status || item.status || "active").toLowerCase();
}

function modelStatus(item: Partial<InventoryItem>) {
  return String(item.model_status || "active").toLowerCase();
}

function needsAttention(item: Partial<InventoryItem>) {
  return !item.image_url || !visibleWarehouseBarcode(item) || !item.buy_price || !item.sell_price || !item.title_ro || !item.size || itemStatus(item) !== "active" || modelStatus(item) !== "active";
}

function colorKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function colorValues(row?: Partial<ColorType> | null) {
  if (!row) return [];
  return [row.id, row.code, row.name_ro, row.name_hu, row.name_en, row.name_de, ...(Array.isArray(row.aliases) ? row.aliases : [])]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

const COLOR_RO_MAP: Record<string, string> = {
  black: "negru", fekete: "negru", negru: "negru",
  white: "alb", feher: "alb", fehér: "alb", alb: "alb",
  blue: "albastru", kek: "albastru", kék: "albastru", albastru: "albastru",
  green: "verde", zold: "verde", zöld: "verde", verde: "verde",
  red: "roșu", rosu: "roșu", roșu: "roșu", piros: "roșu",
  grey: "gri", gray: "gri", szurke: "gri", szürke: "gri", gri: "gri",
  yellow: "galben", sarga: "galben", sárga: "galben", galben: "galben",
  orange: "portocaliu", narancs: "portocaliu", portocaliu: "portocaliu",
  brown: "maro", barna: "maro", maro: "maro",
  beige: "bej", bezs: "bej", bézs: "bej", bej: "bej",
  pink: "roz", roz: "roz", purple: "mov", lila: "mov", mov: "mov",
};

function officialColorRo(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return COLOR_RO_MAP[colorKey(raw)] || raw;
}

function findColorTypeByValue(colors: ColorType[], value: unknown) {
  const key = colorKey(value);
  if (!key) return null;
  return colors.find((row) => colorValues(row).some((candidate) => colorKey(candidate) === key)) || null;
}

function officialColorFromTypes(value: unknown, colors: ColorType[]) {
  const found = findColorTypeByValue(colors, value);
  return found?.name_ro || officialColorRo(value);
}

function normalizeSize(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const key = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[\s._-]+/g, "");
  if (["OSF", "OSFM", "ONESIZEFITSMOST"].includes(key)) return "OSFM";
  if (["OSFA", "ONESIZEFITSALL"].includes(key)) return "OSFA";
  if (["ONESIZE", "UNIVERSAL", "UNI"].includes(key)) return "ONE SIZE";
  return raw.toUpperCase();
}

function normalizeColor(value: unknown) {
  return officialColorRo(value);
}

function goHome() {
  window.location.hash = "#allin";
}


function notifyStockMovesChanged(detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = { at: new Date().toISOString(), ...detail };
  try { window.localStorage.setItem(stockMovesChangedStorageKey, JSON.stringify(payload)); } catch {}
  try { window.dispatchEvent(new CustomEvent(stockMovesChangedEventName, { detail: payload })); } catch {}
}

function selectedVariantIdFromItem(item: Partial<InventoryItem> & Record<string, any>) {
  return String(item.variant_id || item.selected_variant_id || item.variantId || item.id || "").trim();
}

function readSavedSelectedVariants() {
  if (typeof window === "undefined") return {} as Record<string, boolean>;
  try {
    const raw = window.localStorage.getItem(selectedProductsStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.reduce<Record<string, boolean>>((acc, id) => { const key = String(id || "").trim(); if (key) acc[key] = true; return acc; }, {});
    if (parsed && typeof parsed === "object") return Object.entries(parsed).reduce<Record<string, boolean>>((acc, [id, value]) => { if (value) acc[String(id)] = true; return acc; }, {});
  } catch {}
  return {};
}

function saveSelectedVariants(selected: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  const ids = Object.keys(selected).filter((id) => selected[id]);
  if (!ids.length) window.localStorage.removeItem(selectedProductsStorageKey);
  else window.localStorage.setItem(selectedProductsStorageKey, JSON.stringify(ids));
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
    modelStatus: "active",
    brandCode: "",
    categoryCode: "",
    subCategoryCode: "",
    barcode: "",
    supplierProductCode: "",
    snCod: "",
    customsTariffCode: "",
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


function fieldValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function formFromItem(item: Partial<InventoryItem> & Record<string, any>): EditForm {
  return {
    titleRo: fieldValue(item.title_ro),
    titleHu: fieldValue(item.title_hu),
    descriptionRo: fieldValue(item.description_ro),
    gender: fieldValue(item.gender || "unisex"),
    productType: fieldValue(item.product_type),
    season: fieldValue(item.season),
    material: fieldValue(item.material),
    shopifyTitle: fieldValue(item.shopify_title),
    modelStatus: fieldValue(item.model_status || "active"),
    brandCode: fieldValue(item.brand_code || item.brandCode),
    categoryCode: fieldValue(item.category_code || item.categoryCode),
    subCategoryCode: fieldValue(item.subcategory_code || item.subCategoryCode),
    barcode: visibleWarehouseBarcode(item),
    supplierProductCode: itemProductCode(item),
    snCod: fieldValue(item.sn_cod || item.snCod),
    customsTariffCode: itemCustomsTariffCode(item),
    colorCode: fieldValue(item.color_code || item.colorCode),
    colorName: fieldValue(item.color_name || item.colorName),
    size: fieldValue(item.size),
    buyPrice: fieldValue(item.buy_price),
    sellPrice: fieldValue(item.sell_price),
    compareAtPrice: fieldValue(item.compare_at_price),
    imageUrl: fieldValue(item.image_url),
    variantStatus: fieldValue(item.variant_status || item.status || "active"),
  };
}

function MiniStat({ label: labelText, value, hint, tone = "neutral" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "neutral" | "green" | "red" }) {
  const cls = tone === "green" ? "border-[#7bd7d4]/35 bg-[#2a8d8b]/22" : tone === "red" ? "border-rose-300/35 bg-rose-500/14" : "border-white/14 bg-white/[0.07]";
  return (
    <div className={`min-w-[118px] rounded-2xl border px-3 py-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-[0.08em] text-white/50">{labelText}</p>
      <p className="mt-1 text-lg leading-none text-white">{value}</p>
      {hint ? <p className="mt-1 truncate text-[10px] text-white/46">{hint}</p> : null}
    </div>
  );
}

function ProductImage({ src, alt, onPreview, size = "normal" }: { src?: string | null; alt?: string; onPreview?: () => void; size?: "normal" | "large" }) {
  const clean = String(src || "").trim();
  const cls = size === "large" ? "h-28 w-24" : "h-[92px] w-[74px]";
  return (
    <button
      type="button"
      onClick={clean ? onPreview : undefined}
      disabled={!clean}
      className={`${cls} grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/20 bg-white text-slate-400 shadow-sm disabled:cursor-default`}
      aria-label={clean ? "Termékkép nagyítása" : "Nincs termékkép"}
    >
      {clean ? <img src={clean} alt={alt || ""} className="h-full w-full object-contain p-1" loading="lazy" /> : <ImagePlus size={24} />}
    </button>
  );
}

function MobileBackdrop({ onClose }: { onClose: () => void }) {
  return <button type="button" aria-label="Bezárás" className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm" onClick={onClose} />;
}

export default function AllInWarehouseMobile({ apiBase = "/api" }: Props) {
  const aifBase = `${apiBase.replace(/\/$/, "")}/aif`;
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stockRows, setStockRows] = useState<StockItem[]>([]);
  const [brands, setBrands] = useState<MetaItem[]>([]);
  const [categories, setCategories] = useState<MetaItem[]>([]);
  const [genderTypes, setGenderTypes] = useState<GenderType[]>([]);
  const [colorTypes, setColorTypes] = useState<ColorType[]>([]);
  const [sizeTypes, setSizeTypes] = useState<SizeType[]>([]);
  const [locations, setLocations] = useState<MetaItem[]>([]);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [category, setCategory] = useState("all");
  const [subCategory, setSubCategory] = useState("all");
  const [gender, setGender] = useState("all");
  const [color, setColor] = useState("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [buyPricesVisible, setBuyPricesVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(40);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [edit, setEdit] = useState<EditForm>(emptyForm());
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stockEditorTarget, setStockEditorTarget] = useState<InventoryItem | null>(null);
  const [stockEditorRows, setStockEditorRows] = useState<Record<string, string>>({});
  const [stockEditorAllowTotalChange, setStockEditorAllowTotalChange] = useState(false);
  const [stockEditorWarning, setStockEditorWarning] = useState("");
  const [imagePreview, setImagePreview] = useState<{ src: string; title: string } | null>(null);
  const [focusVariantIds, setFocusVariantIds] = useState<string[]>([]);
  const [focusLabel, setFocusLabel] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, boolean>>(() => readSavedSelectedVariants());
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [barcodeScannerStatus, setBarcodeScannerStatus] = useState("");
  const [barcodeScannerManualValue, setBarcodeScannerManualValue] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const barcodeVideoRef = useRef<HTMLVideoElement | null>(null);
  const barcodeStreamRef = useRef<MediaStream | null>(null);
  const barcodeZxingControlsRef = useRef<any | null>(null);
  const barcodeScanRafRef = useRef<number | null>(null);
  const barcodeScannerHandlingRef = useRef(false);

  async function fetchAifJSON<T>(path: string, init?: RequestInit): Promise<T> {
    const method = String(init?.method || "GET").toUpperCase();
    const res = await fetch(`${aifBase}${path}`, {
      credentials: "include",
      cache: method === "GET" ? "no-store" : "default",
      headers: init?.body instanceof FormData ? { ...(init?.headers || {}) } : { "Content-Type": "application/json", ...(init?.headers || {}) },
      ...init,
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new Error(String((data && (data.error || data.message)) || `${res.status} ${res.statusText}`));
    return data as T;
  }

  async function apiInventory() {
    return fetchAifJSON<{ items: InventoryItem[] }>(`/inventory?limit=5000&_=${Date.now()}`);
  }

  async function apiMeta() {
    return fetchAifJSON<{
      suppliers?: MetaItem[];
      brands?: MetaItem[];
      categories?: MetaItem[];
      genderTypes?: GenderType[];
      colorTypes?: ColorType[];
      sizeTypes?: SizeType[];
      locations?: MetaItem[];
    }>(`/meta?_=${Date.now()}`);
  }

  async function apiStock() {
    return fetchAifJSON<{ items: StockItem[] }>(`/stock?_=${Date.now()}`);
  }

  async function apiVariantDetail(id: string) {
    return fetchAifJSON<DetailResponse>(`/variants/${encodeURIComponent(id)}`);
  }

  async function apiVariantUpdate(id: string, payload: Record<string, unknown>) {
    return fetchAifJSON<{ ok: true }>(`/variants/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
  }



  async function apiVariantStockUpdate(id: string, rows: Array<{ locationId?: string; locationCode?: string; qty: number; reservedQty?: number }>, allowTotalChange: boolean) {
    return fetchAifJSON<{ ok: true; stock?: StockItem[] }>(`/variants/${encodeURIComponent(id)}/stock`, {
      method: "PATCH",
      body: JSON.stringify({ rows, mode: allowTotalChange ? "correction" : "redistribute", allowTotalChange }),
    });
  }

  async function uploadImage(file: File, variantId: string) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", `products/${variantId}`);
    fd.append("name", file.name);
    const uploadBase = apiBase.replace(/\/$/, "");
    const res = await fetch(`${uploadBase}/uploads/r2`, { method: "POST", credentials: "include", body: fd });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Nem sikerült feltölteni a képet.");
    return data as { key: string; url: string };
  }

  function stockRowsForVariant(variantId?: string | null) {
    return stockRows.filter((row) => String(row.variant_id || "") === String(variantId || ""));
  }

  function locationKey(location: MetaItem) {
    return String(location.id || location.code || location.name || "");
  }

  function stockForLocation(rows: StockItem[], location: MetaItem) {
    const lid = String(location.id || "");
    const lcode = String(location.code || "");
    const lname = String(location.name || "");
    return rows.find((row) =>
      (lid && String(row.location_id || "") === lid) ||
      (lcode && String(row.location_code || "") === lcode) ||
      (lname && String(row.location_name || "") === lname)
    ) || null;
  }

  const stockLocationRows = useMemo(() => {
    return locations
      .filter((row) => row.is_active !== false)
      .slice()
      .sort((a, b) => String(a.name || a.code || "").localeCompare(String(b.name || b.code || ""), "hu", { sensitivity: "base" }));
  }, [locations]);

  function stockBackedInventoryItems(inventoryItems: InventoryItem[], stockItems: StockItem[]) {
    const aggregate = new Map<string, { total: number; reserved: number; available: number; updatedAt: string }>();
    for (const row of stockItems || []) {
      const id = String(row.variant_id || "");
      if (!id) continue;
      const current = aggregate.get(id) || { total: 0, reserved: 0, available: 0, updatedAt: "" };
      current.total += n(row.qty);
      current.reserved += n(row.reserved_qty);
      current.available += row.available_qty !== undefined && row.available_qty !== null ? n(row.available_qty) : Math.max(0, n(row.qty) - n(row.reserved_qty));
      if (row.updated_at && dateTimeMs(row.updated_at) > dateTimeMs(current.updatedAt)) current.updatedAt = String(row.updated_at);
      aggregate.set(id, current);
    }
    return (inventoryItems || []).map((item) => {
      const id = selectedVariantIdFromItem(item as any) || String(item.variant_id || "");
      const ag = aggregate.get(id);
      return ag ? { ...item, variant_id: id, total_qty: ag.total, total_reserved_qty: ag.reserved, available_qty: ag.available, last_stock_movement_at: item.last_stock_movement_at || ag.updatedAt } : { ...item, variant_id: id };
    });
  }

  async function load(showSuccess = false) {
    setBusy(true);
    setMessage("");
    try {
      const [meta, inventory, stock] = await Promise.all([apiMeta(), apiInventory(), apiStock()]);
      setBrands((meta.brands || []).filter((x) => x.is_active !== false));
      setCategories((meta.categories || []).filter((x) => x.is_active !== false));
      setGenderTypes((meta.genderTypes || []).filter((x) => x.is_active !== false));
      setColorTypes((meta.colorTypes || []).filter((x) => x.is_active !== false));
      setSizeTypes((meta.sizeTypes || []).filter((x) => x.is_active !== false));
      setLocations((meta.locations || []).filter((x) => x.is_active !== false));
      setStockRows(stock.items || []);
      setItems(stockBackedInventoryItems(inventory.items || [], stock.items || []).filter((item) => itemStatus(item) !== "archived" && modelStatus(item) !== "archived"));
      if (showSuccess) setMessage("Raktár frissítve.");
    } catch (error: any) {
      setMessage(error?.message || "A raktár betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveSelectedVariants(selectedVariants);
  }, [selectedVariants]);

  useEffect(() => {
    const refresh = () => void load(false);
    window.addEventListener(stockMovesChangedEventName, refresh as EventListener);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(stockMovesChangedEventName, refresh as EventListener);
      window.removeEventListener("focus", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onIncoming = () => {
      void load(false).then(() => focusLatestIncoming(false));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === warehouseShowAllAfterIncomingStorageKey && event.newValue) onIncoming();
    };
    window.addEventListener(warehouseShowAllAfterIncomingEventName, onIncoming as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(warehouseShowAllAfterIncomingEventName, onIncoming as EventListener);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => stopBarcodeScanner(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mainCategories = useMemo(() => categories.filter(isMainCategory), [categories]);
  const subCategories = useMemo(() => categories.filter((row) => !isMainCategory(row)), [categories]);
  const categoryOptions = mainCategories.length ? mainCategories : categories;
  const subCategoryOptions = useMemo(() => {
    if (category === "all") return subCategories;
    const parent = categoryOptions.find((row) => metaMatches(row, category));
    if (!parent) return subCategories;
    return subCategories.filter((row) => categoryParentId(row) === String(parent.id));
  }, [category, categoryOptions, subCategories]);

  const hasActiveFilters = Boolean(
    search.trim() || brand !== "all" || category !== "all" || subCategory !== "all" || gender !== "all" || color !== "all" || stockFilter !== "all" || imageFilter !== "all" || focusVariantIds.length
  );

  function colorLabel(item: Partial<InventoryItem>) {
    return officialColorFromTypes(firstText(item.color_name, item.color_code), colorTypes) || "-";
  }

  function colorHex(item: Partial<InventoryItem>) {
    const visible = colorLabel(item);
    const colorType = findColorTypeByValue(colorTypes, visible) || findColorTypeByValue(colorTypes, item.color_name) || findColorTypeByValue(colorTypes, item.color_code);
    return firstText(colorType?.hex, item.color_hex);
  }

  function itemMatchesMeta(values: unknown[], selected: string, rows: MetaItem[]) {
    if (selected === "all") return true;
    const selectedRow = rows.find((row) => metaMatches(row, selected));
    const allowed = new Set([normalizeSearch(selected), ...metaValues(selectedRow).map(normalizeSearch)].filter(Boolean));
    return values.map(normalizeSearch).filter(Boolean).some((value) => allowed.has(value));
  }

  function itemMatchesColor(item: InventoryItem) {
    if (color === "all") return true;
    const selectedColor = findColorTypeByValue(colorTypes, color);
    const allowed = new Set([colorKey(color), ...colorValues(selectedColor).map(colorKey)].filter(Boolean));
    const itemValues = [item.color_name, item.color_code, officialColorFromTypes(item.color_name, colorTypes), officialColorFromTypes(item.color_code, colorTypes)].map(colorKey).filter(Boolean);
    return itemValues.some((value) => allowed.has(value));
  }

  const filteredItems = useMemo(() => {
    const q = normalizeSearch(search);
    const focusSet = new Set(focusVariantIds.map(String));
    return items
      .filter((item) => {
        if (focusSet.size && !focusSet.has(String(item.variant_id))) return false;
        if (q) {
          const haystack = [
            itemTitle(item), item.brand_name, item.brand_code, itemSupplierText(item), item.supplier_codes, item.internal_sku,
            visibleWarehouseBarcode(item), item.sn_cod, item.snCod, itemCustomsTariffCode(item), item.model_code,
            itemMainCategory(item), itemSubCategory(item), item.color_name, item.color_code, item.size, itemProductCode(item),
          ].map(normalizeSearch).join(" ");
          if (!haystack.includes(q)) return false;
        }
        if (!itemMatchesMeta([item.brand_code, item.brand_name], brand, brands)) return false;
        if (!itemMatchesMeta([item.category_code, item.category_name_ro, item.category_name_hu], category, categoryOptions)) return false;
        if (!itemMatchesMeta([item.subcategory_id, item.subcategory_code, item.subcategory_name_ro, item.subcategory_name_hu, item.product_type], subCategory, subCategories)) return false;
        if (gender !== "all" && normalizeSearch(item.gender) !== normalizeSearch(gender)) return false;
        if (!itemMatchesColor(item)) return false;
        if (imageFilter === "with" && !item.image_url) return false;
        if (imageFilter === "missing" && item.image_url) return false;
        if (stockFilter === "available" && n(item.available_qty ?? item.total_qty) <= 0) return false;
        if (stockFilter === "out" && n(item.total_qty) > 0) return false;
        if (stockFilter === "reserved" && n(item.total_reserved_qty) <= 0) return false;
        if (stockFilter === "missing" && !needsAttention(item)) return false;
        if (stockFilter === "watch" && itemStatus(item) === "active" && modelStatus(item) === "active" && !needsAttention(item)) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortMode === "stock_desc") return n(b.total_qty) - n(a.total_qty);
        if (sortMode === "stock_asc") return n(a.total_qty) - n(b.total_qty);
        if (sortMode === "value_desc") return n(b.total_qty) * n(b.buy_price) - n(a.total_qty) * n(a.buy_price);
        if (sortMode === "incoming_desc") return latestIncomingMs(b) - latestIncomingMs(a);
        if (sortMode === "missing") return Number(needsAttention(b)) - Number(needsAttention(a));
        if (sortMode === "brand") return firstText(a.brand_name, a.brand_code).localeCompare(firstText(b.brand_name, b.brand_code), "hu", { sensitivity: "base" }) || itemTitle(a).localeCompare(itemTitle(b), "hu", { sensitivity: "base" });
        return itemTitle(a).localeCompare(itemTitle(b), "hu", { sensitivity: "base" });
      });
  }, [items, focusVariantIds, search, brand, brands, category, categoryOptions, subCategory, subCategories, gender, color, colorTypes, stockFilter, imageFilter, sortMode]);

  function itemSupplierText(item: InventoryItem) {
    return firstText((item as any).supplier_names, splitCsv((item as any).supplier_codes).join(" "));
  }

  const totals = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      acc.qty += n(item.total_qty);
      acc.available += n(item.available_qty ?? item.total_qty);
      acc.value += n(item.total_qty) * n(item.buy_price);
      acc.missing += needsAttention(item) ? 1 : 0;
      return acc;
    }, { qty: 0, available: 0, value: 0, missing: 0 });
  }, [filteredItems]);

  const pageItems = filteredItems.slice(0, visibleCount);

  function resetFilters(showMsg = true) {
    setSearch("");
    setBrand("all");
    setCategory("all");
    setSubCategory("all");
    setGender("all");
    setColor("all");
    setStockFilter("all");
    setImageFilter("all");
    setFocusVariantIds([]);
    setFocusLabel("");
    setVisibleCount(40);
    if (showMsg) setMessage("Szűrők törölve.");
  }

  async function focusLatestIncoming(showMessage = true) {
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      qs.set("direction", "in");
      qs.set("limit", "400");
      qs.set("_", String(Date.now()));
      const data = await fetchAifJSON<{ items?: Array<Record<string, any>> }>(`/stock-movements?${qs.toString()}`);
      const rows = (data.items || [])
        .filter((row) => n(row.qty_delta) > 0)
        .filter((row) => {
          const sourceType = normalizeSearch(row.source_type || "");
          const movementType = normalizeSearch(row.movement_type || "");
          const reason = normalizeSearch(row.raw?.reason || "");
          return sourceType.includes("import_batch") || reason.includes("import_batch") || movementType === "incoming";
        })
        .sort((a, b) => dateTimeMs(b.created_at) - dateTimeMs(a.created_at));
      if (!rows.length) {
        setFocusVariantIds([]);
        setFocusLabel("");
        setMessage("Nem találtam friss bejövő import mozgást.");
        return;
      }
      const latest = rows[0];
      const sourceId = firstText(latest.source_id, latest.raw?.importBatchId, latest.raw?.import_batch_id);
      const latestMinute = Math.floor(dateTimeMs(latest.created_at) / 60000);
      const group = rows.filter((row) => {
        const rowSourceId = firstText(row.source_id, row.raw?.importBatchId, row.raw?.import_batch_id);
        if (sourceId && rowSourceId) return rowSourceId === sourceId;
        return Math.floor(dateTimeMs(row.created_at) / 60000) === latestMinute;
      });
      const ids = Array.from(new Set(group.map((row) => String(row.variant_id || row.variantId || "").trim()).filter(Boolean)));
      setFocusVariantIds(ids);
      setSortMode("incoming_desc");
      setVisibleCount(40);
      const labelText = `Utolsó import: ${ids.length} variáns, ${group.reduce((sum, row) => sum + Math.abs(n(row.qty_delta)), 0)} db`;
      setFocusLabel(labelText);
      if (showMessage) setMessage(labelText);
    } catch (error: any) {
      setMessage(error?.message || "Az utolsó import betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(item: InventoryItem) {
    const id = String(item.variant_id || item.id || "").trim();
    if (!id) return;
    setDetailOpen(true);
    setDetailBusy(true);
    setDetail(null);
    setEdit(formFromItem(item as any));
    setMessage("");
    try {
      const data = await apiVariantDetail(id);
      const nextForm = formFromItem({ ...(item as any), ...(data.item || {}) });
      if (!nextForm.brandCode) nextForm.brandCode = findBrandCodeForName(data.item?.brand_name || item.brand_name || "");
      setDetail(data);
      setEdit(nextForm);
    } catch (error: any) {
      setMessage(error?.message || "A termék adatlapja nem tölthető be.");
    } finally {
      setDetailBusy(false);
    }
  }

  function findBrandCodeForName(name: unknown) {
    const key = normalizeSearch(name);
    if (!key) return "";
    const found = brands.find((row) => normalizeSearch(row.name || row.name_ro || row.code) === key || normalizeSearch(row.code) === key);
    return found ? String(found.code || found.id || "") : "";
  }

  async function saveDetail() {
    const id = String(detail?.item?.id || detail?.item?.variant_id || "").trim();
    if (!id) return;
    if (!edit.titleRo.trim()) {
      setMessage("A terméknév kötelező.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await apiVariantUpdate(id, {
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
        subCategoryCode: edit.subCategoryCode || null,
        barcode: edit.barcode,
        supplierProductCode: edit.supplierProductCode,
        productCode: edit.supplierProductCode,
        snCod: edit.snCod,
        customsTariffCode: edit.customsTariffCode,
        colorCode: edit.colorCode,
        colorName: normalizeColor(edit.colorName),
        size: normalizeSize(edit.size),
        buyPrice: edit.buyPrice,
        sellPrice: edit.sellPrice,
        compareAtPrice: edit.compareAtPrice,
        imageUrl: edit.imageUrl,
        status: edit.variantStatus || "active",
      });
      const data = await apiVariantDetail(id);
      setDetail(data);
      setEdit(formFromItem(data.item || {}));
      await load(false);
      setMessage("Termékadatok mentve.");
    } catch (error: any) {
      setMessage(error?.message || "Nem sikerült menteni a terméket.");
    } finally {
      setSaving(false);
    }
  }

  async function onImageSelected(file: File | null) {
    const id = String(detail?.item?.id || detail?.item?.variant_id || "").trim();
    if (!file || !id) return;
    setSaving(true);
    try {
      const uploaded = await uploadImage(file, id);
      setEdit((current) => ({ ...current, imageUrl: uploaded.url }));
      setMessage("Kép feltöltve. Mentés után kerül a termékhez.");
    } catch (error: any) {
      setMessage(error?.message || "Nem sikerült feltölteni a képet.");
    } finally {
      setSaving(false);
    }
  }

  function openStockEditor(item: InventoryItem) {
    const rows = stockRowsForVariant(item.variant_id);
    const next: Record<string, string> = {};
    for (const loc of stockLocationRows) {
      const row = stockForLocation(rows, loc);
      next[locationKey(loc)] = String(Math.max(0, Math.floor(n(row?.qty))));
    }
    setStockEditorTarget(item);
    setStockEditorRows(next);
    setStockEditorAllowTotalChange(false);
    setStockEditorWarning("");
  }

  function stockEditorReservedQty(location: MetaItem) {
    if (!stockEditorTarget?.variant_id) return 0;
    const row = stockForLocation(stockRowsForVariant(stockEditorTarget.variant_id), location);
    return Math.max(0, Math.floor(n(row?.reserved_qty)));
  }

  function stockEditorOriginalTotal() {
    if (!stockEditorTarget?.variant_id) return 0;
    return stockLocationRows.reduce((sum, loc) => sum + Math.floor(n(stockForLocation(stockRowsForVariant(stockEditorTarget.variant_id), loc)?.qty)), 0);
  }

  function stockEditorDraftTotal(rows: Record<string, string> = stockEditorRows) {
    return stockLocationRows.reduce((sum, loc) => sum + Math.max(stockEditorReservedQty(loc), Math.floor(n(rows[locationKey(loc)]))), 0);
  }

  function setStockEditorQty(location: MetaItem, value: string) {
    const key = locationKey(location);
    const minQty = stockEditorReservedQty(location);
    const cleaned = Math.max(minQty, Math.floor(n(value.replace(/[^0-9]/g, ""))));
    const next = { ...stockEditorRows, [key]: String(cleaned) };
    setStockEditorRows(next);
    const delta = stockEditorDraftTotal(next) - stockEditorOriginalTotal();
    setStockEditorWarning(delta !== 0 ? `A teljes készlet ${delta > 0 ? "+" : ""}${delta} db-bal változik. Korrekció mód kell hozzá.` : "");
  }

  async function saveStockEditor() {
    if (!stockEditorTarget?.variant_id) return;
    const totalDelta = stockEditorDraftTotal() - stockEditorOriginalTotal();
    if (totalDelta !== 0 && !stockEditorAllowTotalChange) {
      setStockEditorWarning("A teljes készlet megváltozna. Kapcsold be a készletkorrekció módot, ha ez szándékos.");
      return;
    }
    setSaving(true);
    try {
      const rows = stockLocationRows.map((loc) => ({
        locationId: String(loc.id || ""),
        locationCode: String(loc.code || ""),
        qty: Math.max(stockEditorReservedQty(loc), Math.floor(n(stockEditorRows[locationKey(loc)]))),
        reservedQty: stockEditorReservedQty(loc),
      }));
      await apiVariantStockUpdate(stockEditorTarget.variant_id, rows, stockEditorAllowTotalChange);
      notifyStockMovesChanged({ variantId: stockEditorTarget.variant_id, source: stockEditorAllowTotalChange ? "warehouse_mobile_stock_correction" : "warehouse_mobile_stock_edit" });
      setStockEditorTarget(null);
      setStockEditorRows({});
      await load(false);
      setMessage(stockEditorAllowTotalChange ? `Készletkorrekció mentve: ${totalDelta > 0 ? "+" : ""}${totalDelta} db.` : "Készlet mentve.");
    } catch (error: any) {
      setMessage(error?.message || "Nem sikerült menteni a készletet.");
    } finally {
      setSaving(false);
    }
  }





  function toggleSelected(item: InventoryItem) {
    const id = String(item.variant_id || "");
    if (!id) return;
    setSelectedVariants((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  }


  function stopBarcodeScanner(clearStatus = true) {
    if (barcodeScanRafRef.current !== null) {
      window.cancelAnimationFrame(barcodeScanRafRef.current);
      barcodeScanRafRef.current = null;
    }
    if (barcodeZxingControlsRef.current?.stop) {
      try { barcodeZxingControlsRef.current.stop(); } catch {}
      barcodeZxingControlsRef.current = null;
    }
    if (barcodeStreamRef.current) {
      barcodeStreamRef.current.getTracks().forEach((track) => track.stop());
      barcodeStreamRef.current = null;
    }
    if (barcodeVideoRef.current) barcodeVideoRef.current.srcObject = null;
    setBarcodeScannerOpen(false);
    if (clearStatus) setBarcodeScannerStatus("");
  }

  function applyScannedBarcode(rawCode: unknown, _source: "camera" | "manual" = "camera") {
    const code = cleanScannedBarcode(rawCode);
    if (!code) return;
    if (barcodeScannerHandlingRef.current) return;
    barcodeScannerHandlingRef.current = true;
    window.setTimeout(() => { barcodeScannerHandlingRef.current = false; }, 700);

    const exactMatches = items.filter((item) => itemMatchesScannedBarcode(item, code));
    setSearch(code);
    setVisibleCount(40);
    setFocusVariantIds([]);
    setFocusLabel("");
    setBarcodeScannerManualValue("");
    setMessage(exactMatches.length
      ? `Vonalkód beolvasva: ${code} • ${exactMatches.length} találat.`
      : `Vonalkód beolvasva: ${code}. Ha nincs találat, ellenőrizd a kódot vagy a törzsadatot.`
    );
    stopBarcodeScanner(false);
    window.setTimeout(() => searchInputRef.current?.focus(), 120);
  }

  async function startBarcodeScanner() {
    setBarcodeScannerOpen(true);
    setBarcodeScannerStatus("Kamera indítása...");
    setBarcodeScannerManualValue("");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setBarcodeScannerStatus("Ezen a böngészőn nem érhető el a kamera. Írd be kézzel vagy használj bluetooth olvasót.");
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 90));
    const video = barcodeVideoRef.current;
    if (!video) {
      setBarcodeScannerStatus("A kamera nézet még nem készült el. Zárd be és indítsd újra a scannert.");
      return;
    }

    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (BarcodeDetectorCtor) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS);
        barcodeStreamRef.current = stream;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => undefined);

        let detector: any;
        try {
          detector = new BarcodeDetectorCtor({ formats: WAREHOUSE_BARCODE_SCAN_FORMATS });
        } catch {
          detector = new BarcodeDetectorCtor();
        }

        const tick = async () => {
          if (!barcodeStreamRef.current || !barcodeVideoRef.current || !detector) return;
          if (barcodeVideoRef.current.readyState >= 2 && !barcodeScannerHandlingRef.current) {
            try {
              const detected = await detector.detect(barcodeVideoRef.current);
              const first = detected?.[0];
              const raw = first?.rawValue || first?.raw_value || first?.displayValue;
              if (raw) {
                applyScannedBarcode(raw, "camera");
                return;
              }
            } catch {
              // Egy kamera frame hibája nem ok arra, hogy feladjuk. Sajnos ezt is nekünk kell elviselni.
            }
          }
          barcodeScanRafRef.current = window.requestAnimationFrame(tick);
        };

        barcodeScanRafRef.current = window.requestAnimationFrame(tick);
        setBarcodeScannerStatus("Kamera aktív. Irányítsd a vonalkódra, a keresés automatikusan indul.");
        return;
      } catch (error: any) {
        setBarcodeScannerStatus(error?.message || "A kamera indítása nem sikerült. Próbáld kézi beírással.");
        return;
      }
    }

    const zxing = await loadWarehouseZxingBrowser();
    const Reader = zxing?.BrowserMultiFormatReader || zxing?.BrowserMultiFormatOneDReader;
    if (Reader) {
      try {
        const reader = new Reader();
        const controls = await reader.decodeFromConstraints(
          WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS,
          video,
          (result: unknown, _error: unknown, controlsFromCallback?: any) => {
            if (controlsFromCallback && !barcodeZxingControlsRef.current) barcodeZxingControlsRef.current = controlsFromCallback;
            const text = zxingResultText(result);
            if (text) applyScannedBarcode(text, "camera");
          }
        );
        if (controls) barcodeZxingControlsRef.current = controls;
        setBarcodeScannerStatus("Kamera aktív. Irányítsd a vonalkódra, a keresés automatikusan indul.");
        return;
      } catch (error: any) {
        setBarcodeScannerStatus(error?.message || "A kamera scanner nem indult el. Írd be kézzel vagy használj bluetooth olvasót.");
        return;
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(WAREHOUSE_BARCODE_VIDEO_CONSTRAINTS);
      barcodeStreamRef.current = stream;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => undefined);
      setBarcodeScannerStatus("A kamera megy, de ez a böngésző nem ad automata vonalkódolvasót. Írd be kézzel vagy használj bluetooth olvasót.");
    } catch (error: any) {
      setBarcodeScannerStatus(error?.message || "A kamera indítása nem sikerült. Próbáld kézi beírással.");
    }
  }

  function submitManualBarcode() {
    applyScannedBarcode(barcodeScannerManualValue, "manual");
  }

  function PriceDetails({ item }: { item: Partial<InventoryItem> }) {
    const sellNet = sellPriceWithoutTva(item.sell_price);
    const markup = priceMarkupPercentText(item.buy_price, item.sell_price);
    if (!buyPricesVisible) return <span className="text-white/48">Haszonkulcs rejtve</span>;
    return (
      <div className="grid gap-1 text-[11px] text-white/66">
        <div className="flex justify-between gap-3"><span>Vételi ár:</span><strong className="text-white">{money(item.buy_price)}</strong></div>
        <div className="flex justify-between gap-3"><span>Eladási ár TVA nélkül:</span><strong className="text-white">{sellNet === null ? "-" : money(sellNet)}</strong></div>
        <div className="flex justify-between gap-3"><span>Eladási ár TVA-val:</span><strong className="text-white">{money(item.sell_price)}</strong></div>
        <div className="flex justify-between gap-3"><span>Haszonkulcs TVA nélkül:</span><strong className="text-[#cffffd]">{markup || "-"}</strong></div>
      </div>
    );
  }

  function ColorBadge({ item }: { item: InventoryItem }) {
    const hex = colorHex(item);
    const code = firstText(item.color_code);
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#5bd0cc]/35 bg-[#203f49] px-2 py-1 text-[11px] font-semibold leading-none text-[#cffffd]">
        <span className="h-3 w-3 shrink-0 rounded-full border border-white/35 bg-white/15" style={hex ? { backgroundColor: hex } : undefined} />
        <span className="truncate">{colorLabel(item)}</span>
        {code ? <span className="rounded-full bg-[#2a8d8b]/45 px-1.5 py-0.5 text-[10px]">{code}</span> : null}
      </span>
    );
  }

  return (
    <main className={page}>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#303a4c]/96 px-3 pb-3 pt-2 shadow-[0_16px_34px_rgba(15,23,42,0.32)] backdrop-blur">
        <div className="rounded-b-[26px] border border-white/12 bg-[#303a4c]/92 p-3 shadow-inner shadow-white/[0.03]">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 border-l-4 border-[#7bd7d4] pl-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/70">AllInFashion</p>
              <h1 className="mt-0.5 truncate text-lg leading-tight text-white">Raktár mobil</h1>
              <p className="mt-0.5 text-[11px] text-white/48">{filteredItems.length} találat • {qty(totals.qty)} db</p>
            </div>
            <button className={buyPricesVisible ? "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#7bd7d4]/45 bg-[#2a8d8b] text-white" : iconBtn} onClick={() => setBuyPricesVisible((x) => !x)} type="button" aria-label="Vételár mutatása">
              {buyPricesVisible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <button className={iconBtn} onClick={goHome} type="button" aria-label="Kezdőlap"><Home size={18} /></button>
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/42" size={17} />
              <input
                ref={searchInputRef}
                className={`${input} pl-10 pr-9`}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setVisibleCount(40); }}
                placeholder="Név, márka, vonalkód, szín, méret"
              />
              {search && <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-white/45 hover:bg-white/10 hover:text-white" type="button" onClick={() => setSearch("")}><X size={15} /></button>}
            </div>
            <button className={softBtn} onClick={() => void startBarcodeScanner()} type="button" aria-label="Vonalkód scanner"><Barcode size={16} /></button>
            <button className={primaryBtn} onClick={() => load(true)} disabled={busy} type="button"><RefreshCw size={16} className={busy ? "animate-spin" : ""} /></button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
            <MiniStat label="Készlet" value={qty(totals.qty)} hint={`${qty(totals.available)} elérhető`} tone="green" />
            <MiniStat label="Érték" value={buyPricesVisible ? `${money(totals.value)} RON` : <span className="blur-[3px]">{money(totals.value)}</span>} hint="vételáron" />
            <MiniStat label="Hibás" value={qty(totals.missing)} hint="javítandó adat" tone={totals.missing ? "red" : "neutral"} />
          </div>
        </div>
      </header>

      <div className="space-y-3 px-3 pt-3">
        {message ? <div className="rounded-2xl border border-[#7bd7d4]/30 bg-[#203f49] px-3 py-2 text-sm text-[#d7fffd]">{message}</div> : null}

        {(hasActiveFilters || focusLabel) && (
          <div className="rounded-2xl border border-[#7bd7d4]/25 bg-[#203f49]/75 px-3 py-2 text-xs text-[#d7fffd]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">Aktív nézet</p>
                <p className="mt-0.5 text-[#d7fffd]/72">{focusLabel || "Szűrők / keresés alapján szűrt lista"}</p>
              </div>
              <button className="shrink-0 rounded-xl border border-white/14 bg-white/[0.08] px-2 py-1" onClick={() => resetFilters()} type="button">Szűrők törlése</button>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {pageItems.map((item) => {
            const markup = buyPricesVisible ? priceMarkupPercentText(item.buy_price, item.sell_price) : "";
            return (
              <article key={item.variant_id} className="rounded-[24px] border border-white/14 bg-white/[0.07] p-3 shadow-lg shadow-slate-950/12">
                <div className="flex gap-3">
                  <ProductImage src={item.image_url} alt={itemTitle(item)} onPreview={() => setImagePreview({ src: String(item.image_url), title: itemTitle(item) })} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9fe5e2]">{item.brand_name || item.brand_code || "Márka nélkül"}</p>
                        <h2 className="mt-1 line-clamp-2 text-base leading-tight text-white">{itemTitle(item)}</h2>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-[#5bd0cc]/30 bg-[#203f49] px-2 py-1 text-[11px] text-[#cffffd]">Termékkód: {itemProductCode(item) || "-"}</span>
                      {visibleWarehouseBarcode(item) ? <span className="rounded-full border border-white/12 bg-white/[0.07] px-2 py-1 text-[11px] text-white/72"><Barcode className="mr-1 inline" size={11} />{visibleWarehouseBarcode(item)}</span> : null}
                      {needsAttention(item) ? <span className="rounded-full border border-amber-200/35 bg-amber-300/15 px-2 py-1 text-[11px] text-amber-50"><AlertTriangle className="mr-1 inline" size={11} />Javítandó</span> : null}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-2xl border border-white/12 bg-[#263246] p-2">
                    <p className="text-white/46">Kategória</p>
                    <p className="mt-1 leading-tight text-white">{itemMainCategory(item)}{itemSubCategory(item) ? <span className="block text-white/55">{itemSubCategory(item)}</span> : null}</p>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-[#263246] p-2">
                    <p className="text-white/46">Szín / méret</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5"><ColorBadge item={item} /><span className="rounded-full bg-white/[0.08] px-2 py-1 text-[11px] text-white">{item.size || "-"}</span></div>
                  </div>
                  <button className="rounded-2xl border border-[#7bd7d4]/30 bg-[#203f49] p-2 text-left" onClick={() => openStockEditor(item)} type="button">
                    <p className="text-[#cffffd]/60">Készlet</p>
                    <p className="mt-1 text-lg leading-none text-white">{qty(item.total_qty)} <span className="text-xs text-[#cffffd]/70">db</span></p>
                    <p className="mt-1 text-[11px] text-white/52">{stockRowsForVariant(item.variant_id).filter((row) => n(row.qty) > 0).length || 0} helyen</p>
                  </button>
                  <div className="rounded-2xl border border-white/12 bg-[#263246] p-2">
                    <p className="text-white/46">Eladási ár</p>
                    <p className="mt-1 text-base leading-none text-white">{money(item.sell_price)}</p>
                    {markup ? <p className="mt-1 text-[11px] font-semibold text-[#cffffd]">{markup} TVA nélkül</p> : buyPricesVisible ? <p className="mt-1 text-[11px] text-white/42">Nincs haszonkulcs</p> : null}
                  </div>
                </div>

                {buyPricesVisible ? (
                  <div className="mt-2 rounded-2xl border border-white/10 bg-[#202838] px-3 py-2">
                    <PriceDetails item={item} />
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className={softBtn} onClick={() => openDetail(item)} type="button"><Edit3 size={15} /> Adatok</button>
                  <button className={softBtn} onClick={() => openStockEditor(item)} type="button"><Boxes size={15} /> Készlet</button>
                </div>
              </article>
            );
          })}
        </div>

        {!pageItems.length ? (
          <div className="rounded-[24px] border border-white/14 bg-white/[0.06] px-4 py-8 text-center text-sm text-white/62">
            Nincs találat. Az Excel nyilván most is ártatlan, mint mindig.
          </div>
        ) : null}

        {visibleCount < filteredItems.length ? (
          <button className="w-full rounded-2xl border border-white/16 bg-white/[0.08] px-3 py-3 text-sm text-white" type="button" onClick={() => setVisibleCount((x) => x + 40)}>
            További termékek betöltése ({filteredItems.length - visibleCount})
          </button>
        ) : null}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/12 bg-[#263246]/96 px-3 pb-3 pt-2 shadow-[0_-16px_34px_rgba(15,23,42,0.38)] backdrop-blur">
        <div className="grid grid-cols-3 gap-2">
          <button className={softBtn} onClick={() => setFiltersOpen(true)} type="button"><Filter size={16} /> Szűrő</button>
          <button className={softBtn} onClick={() => focusLatestIncoming(true)} disabled={busy} type="button"><PackageCheck size={16} /> Utolsó</button>
          <button className={softBtn} onClick={() => { searchInputRef.current?.focus(); }} type="button"><Search size={16} /> Keresés</button>
        </div>
      </nav>

      {filtersOpen && (
        <>
          <MobileBackdrop onClose={() => setFiltersOpen(false)} />
          <div className={sheetPanel}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#cffffd]/70">Szűrés</p>
                <h2 className="text-lg text-white">Raktár nézet</h2>
              </div>
              <button className={iconBtn} onClick={() => setFiltersOpen(false)} type="button"><X size={18} /></button>
            </div>
            <div className="grid gap-3">
              <label className={label}>Márka<select className={select} value={brand} onChange={(e) => { setBrand(e.target.value); setVisibleCount(40); }}><option value="all">Összes</option>{brands.map((row) => <option key={row.id} value={row.code || row.id}>{row.name || row.name_ro || row.code}</option>)}</select></label>
              <label className={label}>Főkategória<select className={select} value={category} onChange={(e) => { setCategory(e.target.value); setSubCategory("all"); setVisibleCount(40); }}><option value="all">Összes</option>{categoryOptions.map((row) => <option key={row.id} value={row.code || row.id}>{categoryLabel(row)}</option>)}</select></label>
              <label className={label}>Alkategória<select className={select} value={subCategory} onChange={(e) => { setSubCategory(e.target.value); setVisibleCount(40); }}><option value="all">Összes</option>{subCategoryOptions.map((row) => <option key={row.id} value={row.code || row.id}>{categoryLabel(row)}</option>)}</select></label>
              <label className={label}>Nem<select className={select} value={gender} onChange={(e) => { setGender(e.target.value); setVisibleCount(40); }}><option value="all">Összes</option>{genderTypes.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}</select></label>
              <label className={label}>Szín<select className={select} value={color} onChange={(e) => { setColor(e.target.value); setVisibleCount(40); }}><option value="all">Összes</option>{colorTypes.map((row) => <option key={row.id} value={row.code || row.name_ro}>{row.name_ro}</option>)}</select></label>
              <label className={label}>Készlet<select className={select} value={stockFilter} onChange={(e) => { setStockFilter(e.target.value as StockFilter); setVisibleCount(40); }}><option value="all">Összes</option><option value="available">Van elérhető</option><option value="out">Nulla készlet</option><option value="reserved">Van foglalás</option><option value="missing">Hiányzó adat</option><option value="watch">Aktiválandó / figyelendő</option></select></label>
              <label className={label}>Kép<select className={select} value={imageFilter} onChange={(e) => { setImageFilter(e.target.value as ImageFilter); setVisibleCount(40); }}><option value="all">Összes</option><option value="with">Van kép</option><option value="missing">Nincs kép</option></select></label>
              <label className={label}>Sorrend<select className={select} value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}><option value="name">Terméknév</option><option value="brand">Márka</option><option value="stock_desc">Készlet csökkenő</option><option value="stock_asc">Készlet növekvő</option><option value="value_desc">Érték</option><option value="incoming_desc">Utolsó bevételezés</option><option value="missing">Javítandók előre</option></select></label>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className={softBtn} onClick={() => resetFilters()} type="button">Alaphelyzet</button>
              <button className={primaryBtn} onClick={() => setFiltersOpen(false)} type="button">Alkalmaz</button>
            </div>
          </div>
        </>
      )}

      {detailOpen && (
        <>
          <MobileBackdrop onClose={() => setDetailOpen(false)} />
          <div className={sheetPanel}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#cffffd]/70">Termékadatlap</p>
                <h2 className="mt-1 line-clamp-2 text-lg text-white">{edit.titleRo || itemTitle(detail?.item || {})}</h2>
                {detailBusy ? <p className="mt-1 text-xs text-white/50">Betöltés...</p> : null}
              </div>
              <button className={iconBtn} onClick={() => setDetailOpen(false)} type="button"><X size={18} /></button>
            </div>

            <div className="grid gap-3">
              <div className="flex gap-3 rounded-2xl border border-white/12 bg-white/[0.06] p-3">
                <ProductImage src={edit.imageUrl} alt={edit.titleRo} size="large" onPreview={() => edit.imageUrl && setImagePreview({ src: edit.imageUrl, title: edit.titleRo })} />
                <div className="grid min-w-0 flex-1 gap-2 text-xs">
                  <PriceDetails item={{ buy_price: edit.buyPrice, sell_price: edit.sellPrice }} />
                  <label className="mt-1 inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/16 bg-white/[0.08] px-3 text-xs text-white">
                    <ImagePlus size={14} /> Kép feltöltése
                    <input className="hidden" type="file" accept="image/*" onChange={(e) => void onImageSelected(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>

              <label className={label}>Terméknév románul<input className={input} value={edit.titleRo} onChange={(e) => setEdit((x) => ({ ...x, titleRo: e.target.value }))} /></label>
              <label className={label}>Terméknév magyarul<input className={input} value={edit.titleHu} onChange={(e) => setEdit((x) => ({ ...x, titleHu: e.target.value }))} /></label>
              <label className={label}>Márka<select className={select} value={edit.brandCode} onChange={(e) => setEdit((x) => ({ ...x, brandCode: e.target.value }))}><option value="">Nincs</option>{brands.map((row) => <option key={row.id} value={row.code || row.id}>{row.name || row.name_ro || row.code}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Főkategória<select className={select} value={edit.categoryCode} onChange={(e) => setEdit((x) => ({ ...x, categoryCode: e.target.value, subCategoryCode: "" }))}><option value="">Nincs</option>{categoryOptions.map((row) => <option key={row.id} value={row.code || row.id}>{categoryLabel(row)}</option>)}</select></label>
                <label className={label}>Alkategória<select className={select} value={edit.subCategoryCode} onChange={(e) => setEdit((x) => ({ ...x, subCategoryCode: e.target.value }))}><option value="">Nincs</option>{subCategories.map((row) => <option key={row.id} value={row.code || row.id}>{categoryLabel(row)}</option>)}</select></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Nem<select className={select} value={edit.gender} onChange={(e) => setEdit((x) => ({ ...x, gender: e.target.value }))}><option value="unisex">Unisex</option>{genderTypes.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}</select></label>
                <label className={label}>Méret<input className={input} value={edit.size} onChange={(e) => setEdit((x) => ({ ...x, size: e.target.value }))} list="warehouse-mobile-size-options" /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Szín<input className={input} value={edit.colorName} onChange={(e) => setEdit((x) => ({ ...x, colorName: e.target.value }))} list="warehouse-mobile-color-options" /></label>
                <label className={label}>Színkód<input className={input} value={edit.colorCode} onChange={(e) => setEdit((x) => ({ ...x, colorCode: e.target.value }))} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Vételár<input className={input} value={edit.buyPrice} onChange={(e) => setEdit((x) => ({ ...x, buyPrice: e.target.value }))} inputMode="decimal" /></label>
                <label className={label}>Eladási ár TVA-val<input className={input} value={edit.sellPrice} onChange={(e) => setEdit((x) => ({ ...x, sellPrice: e.target.value }))} inputMode="decimal" /></label>
              </div>
              <label className={label}>Fotó URL<input className={input} value={edit.imageUrl} onChange={(e) => setEdit((x) => ({ ...x, imageUrl: e.target.value }))} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Termékkód<input className={input} value={edit.supplierProductCode} onChange={(e) => setEdit((x) => ({ ...x, supplierProductCode: e.target.value }))} /></label>
                <label className={label}>Vonalkód<input className={input} value={edit.barcode} onChange={(e) => setEdit((x) => ({ ...x, barcode: e.target.value }))} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>S/N/COD<input className={input} value={edit.snCod} onChange={(e) => setEdit((x) => ({ ...x, snCod: e.target.value }))} /></label>
                <label className={label}>Vámtarifa kód<input className={input} value={edit.customsTariffCode} onChange={(e) => setEdit((x) => ({ ...x, customsTariffCode: e.target.value }))} /></label>
              </div>
              <label className={label}>Anyag / összetétel<input className={input} value={edit.material} onChange={(e) => setEdit((x) => ({ ...x, material: e.target.value }))} /></label>
              <label className={label}>Leírás<textarea className={`${input} h-24 py-3`} value={edit.descriptionRo} onChange={(e) => setEdit((x) => ({ ...x, descriptionRo: e.target.value }))} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>Modell állapot<select className={select} value={edit.modelStatus} onChange={(e) => setEdit((x) => ({ ...x, modelStatus: e.target.value }))}><option value="active">Aktív</option><option value="draft">Előkészítés</option><option value="inactive">Inaktív</option><option value="archived">Archivált</option></select></label>
                <label className={label}>Variáns állapot<select className={select} value={edit.variantStatus} onChange={(e) => setEdit((x) => ({ ...x, variantStatus: e.target.value }))}><option value="active">Aktív</option><option value="draft">Előkészítés</option><option value="inactive">Inaktív</option><option value="archived">Archivált</option></select></label>
              </div>
              <div className="grid gap-2 pt-1">
                <button className={softBtn} onClick={() => detail?.item && openStockEditor(detail.item)} type="button"><Boxes size={15} /> Készlet</button>
              </div>
              <button className={`${primaryBtn} h-12`} onClick={saveDetail} disabled={saving || detailBusy} type="button"><Save size={16} /> {saving ? "Mentés..." : "Mentés"}</button>
            </div>
          </div>
        </>
      )}

      {stockEditorTarget && (
        <>
          <MobileBackdrop onClose={() => setStockEditorTarget(null)} />
          <div className={sheetPanel}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#cffffd]/70">Készlet</p>
                <h2 className="line-clamp-2 text-lg text-white">{itemTitle(stockEditorTarget)}</h2>
                <p className="mt-1 text-xs text-white/52">Eredeti összesen: {qty(stockEditorOriginalTotal())} db • Új összesen: {qty(stockEditorDraftTotal())} db</p>
              </div>
              <button className={iconBtn} onClick={() => setStockEditorTarget(null)} type="button"><X size={18} /></button>
            </div>
            <div className="grid gap-2">
              {stockLocationRows.map((loc) => {
                const key = locationKey(loc);
                const reserved = stockEditorReservedQty(loc);
                return (
                  <div key={key} className="rounded-2xl border border-white/12 bg-white/[0.06] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm text-white">{loc.name || loc.code}</p>
                      {reserved > 0 ? <span className="rounded-full bg-white/[0.08] px-2 py-1 text-[11px] text-white/58">foglalt {reserved}</span> : null}
                    </div>
                    <div className="grid grid-cols-[44px_1fr_44px] gap-2">
                      <button className={softBtn} type="button" onClick={() => setStockEditorQty(loc, String(Math.max(reserved, n(stockEditorRows[key]) - 1)))}>-</button>
                      <input className={`${input} text-center text-lg`} value={stockEditorRows[key] || "0"} inputMode="numeric" onChange={(e) => setStockEditorQty(loc, e.target.value)} />
                      <button className={softBtn} type="button" onClick={() => setStockEditorQty(loc, String(n(stockEditorRows[key]) + 1))}>+</button>
                    </div>
                  </div>
                );
              })}
              {stockEditorWarning ? <div className="rounded-2xl border border-amber-200/28 bg-amber-300/12 px-3 py-2 text-sm text-amber-50">{stockEditorWarning}</div> : null}
              <label className="flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-3 text-sm text-white/78">
                <input type="checkbox" className="h-4 w-4 accent-[#2a8d8b]" checked={stockEditorAllowTotalChange} onChange={(e) => setStockEditorAllowTotalChange(e.target.checked)} />
                Készletkorrekció mód, a teljes darabszám változhat
              </label>
              <button className={`${primaryBtn} h-12`} onClick={saveStockEditor} disabled={saving} type="button"><Save size={16} /> Készlet mentése</button>
            </div>
          </div>
        </>
      )}

      {barcodeScannerOpen && (
        <>
          <MobileBackdrop onClose={() => stopBarcodeScanner()} />
          <div className={sheetPanel}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#cffffd]/70">Vonalkód scanner</p>
                <h2 className="text-lg text-white">Keresés telefon kamerával</h2>
                <p className="mt-1 text-xs leading-5 text-white/58">Olvasás után a kód automatikusan bekerül a keresőbe.</p>
              </div>
              <button className={iconBtn} onClick={() => stopBarcodeScanner()} type="button"><X size={18} /></button>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/14 bg-black/35">
              <video ref={barcodeVideoRef} className="aspect-video w-full bg-black object-cover" muted playsInline />
              <div className="border-t border-white/10 px-3 py-2 text-xs text-white/58">Tartsd stabilan a kamerát, és igazítsd a vonalkódot a kép közepére. Igen, a technika ennyit kér az emberiségtől.</div>
            </div>

            {barcodeScannerStatus ? <div className="mt-3 rounded-2xl border border-[#7bd7d4]/25 bg-[#203f49] px-3 py-2 text-sm text-[#d7fffd]">{barcodeScannerStatus}</div> : null}

            <form className="mt-3 grid grid-cols-[1fr_auto] gap-2" onSubmit={(event) => { event.preventDefault(); submitManualBarcode(); }}>
              <input
                className={input}
                value={barcodeScannerManualValue}
                onChange={(event) => setBarcodeScannerManualValue(event.target.value)}
                placeholder="Kézi / bluetooth vonalkód"
                inputMode="numeric"
                autoComplete="off"
              />
              <button className={primaryBtn} disabled={!barcodeScannerManualValue.trim()} type="submit"><Search size={16} /> Keres</button>
            </form>
          </div>
        </>
      )}

      {imagePreview && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/72 p-4 backdrop-blur-sm" onClick={() => setImagePreview(null)}>
          <div className="w-full max-w-sm rounded-[28px] border border-white/40 bg-white p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={imagePreview.src} alt="" className="max-h-[70vh] w-full rounded-2xl bg-white object-contain" />
            <div className="mt-2 flex items-center justify-between gap-2"><p className="line-clamp-2 text-sm text-slate-800">{imagePreview.title}</p><button className="rounded-xl bg-slate-900 px-3 py-2 text-xs text-white" onClick={() => setImagePreview(null)} type="button">Bezárás</button></div>
          </div>
        </div>
      )}

      <datalist id="warehouse-mobile-size-options">{sizeTypes.map((row) => <option key={row.id} value={row.name || row.code}>{row.name_hu || row.code}</option>)}</datalist>
      <datalist id="warehouse-mobile-color-options">{colorTypes.map((row) => <option key={row.id} value={row.name_ro}>{row.name_hu || row.code}</option>)}</datalist>
    </main>
  );
}
