import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type PageProps = {
  apiBase?: string;
  actor?: string;
  role?: string;
  shopId?: string;
  onLogout?: () => void;
};

type BarcodeRender = {
  ok: boolean;
  svg: string;
  width: number;
  error?: string;
};

type LabelPreset = {
  id: string;
  name: string;
  width: string;
  height: string;
  cols: string;
  rows: string;
  marginX: string;
  marginY: string;
};

type ContentKey =
  | "company"
  | "brand"
  | "title"
  | "barcode"
  | "description"
  | "category"
  | "sizeColor"
  | "code"
  | "price";

type SavedTemplate = {
  name: string;
  labelWidth: string;
  labelHeight: string;
  pageCols: string;
  pageRows: string;
  pageMarginX: string;
  pageMarginY: string;
  companyName: string;
  currency: string;
  unitText: string;
  showBorder: boolean;
  content: Record<ContentKey, boolean>;
};

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

const CODE128_PATTERNS = [
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

const PRESETS: LabelPreset[] = [
  { id: "40x46", name: "40 × 46 mm, 5 × 6 pe A4", width: "40", height: "46", cols: "5", rows: "6", marginX: "5", marginY: "5" },
  { id: "50x30", name: "50 × 30 mm, 4 × 8 pe A4", width: "50", height: "30", cols: "4", rows: "8", marginX: "5", marginY: "5" },
  { id: "60x40", name: "60 × 40 mm, 3 × 6 pe A4", width: "60", height: "40", cols: "3", rows: "6", marginX: "6", marginY: "6" },
  { id: "70x36", name: "70 × 36 mm, 2 × 7 pe A4", width: "70", height: "36", cols: "2", rows: "7", marginX: "8", marginY: "6" },
];

const DEFAULT_CONTENT: Record<ContentKey, boolean> = {
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

const CONTENT_OPTIONS: { key: ContentKey; label: string; hint: string }[] = [
  { key: "company", label: "Cég neve", hint: "A címke tetején jelenik meg." },
  { key: "brand", label: "Márka", hint: "A terméknév felett vagy alatt jelenik meg." },
  { key: "title", label: "Terméknév", hint: "A fő terméknév, lehet 1-2 sor." },
  { key: "barcode", label: "Vonalkód", hint: "Code128 belső AllIn / Shopify SKU azonosító." },
  { key: "description", label: "Összetétel", hint: "Például 80% bumbac, 20% poliester." },
  { key: "category", label: "Kategória", hint: "Póló, pantaloni, pantofi, stb." },
  { key: "sizeColor", label: "Méret / szín", hint: "A variáns gyors azonosításához." },
  { key: "code", label: "Termékkód", hint: "Beszállítói / belső cikkszám." },
  { key: "price", label: "Ár", hint: "Nagy árrész a címke alján." },
];

const DEFAULT_COMPANY_NAME = "TITAN EURO-COM SRL";

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
  cream: "crem", crem: "crem", ivory: "fildeș", fildeş: "fildeș", fildes: "fildeș",
  turquoise: "turcoaz", turkis: "turcoaz", türkis: "turcoaz", turcoaz: "turcoaz",
  khaki: "kaki", kaki: "kaki",
  multi: "multicolor", multicolor: "multicolor", multicolour: "multicolor",
};

function colorKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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

function parseHashParams() {
  const raw = window.location.hash || "";
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

function cleanInternalCode(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function cleanText(input: unknown, max = 120) {
  return String(input ?? "").replace(/[<>]/g, "").slice(0, max);
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const s = String(value ?? "").trim();
    if (s) return s;
  }
  return "";
}

function cleanModelCode(value: unknown) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const last = s.includes(":") ? s.split(":").pop() || s : s;
  return last.trim();
}

function queryValue(params: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const v = params.get(key);
    if (v) return v;
  }
  return "";
}

function displayMoneyValue(value: unknown) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n)) return s;
  return String(n.toFixed(2));
}

function makeInternalCode(seed = "") {
  const base = cleanInternalCode(seed).slice(0, 12) || "AIF";
  const date = new Date();
  const y = String(date.getFullYear()).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const t = String(Date.now()).slice(-6);
  return cleanInternalCode(`${base}-${y}${m}${d}-${t}`);
}

function code128Svg(value: string, height = 74): BarcodeRender {
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
        error: "A Code128 ebben a verzióban csak latin betűket, számokat és egyszerű jeleket kezel.",
      };
    }
    values.push(charCode - 32);
  }

  const startB = 104;
  let checksum = startB;
  values.forEach((v, index) => {
    checksum += v * (index + 1);
  });
  checksum = checksum % 103;
  const sequence = [startB, ...values, checksum, 106];
  const patterns = sequence.map((v) => CODE128_PATTERNS[v]).filter(Boolean);
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 20}" role="img" aria-label="Vonalkód ${safeText}"><rect width="${width}" height="${height + 20}" fill="#fff"/><g fill="#000">${bars.join("")}</g><text x="${width / 2}" y="${height + 15}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9">${safeText}</text></svg>`;
  return { ok: true, svg, width };
}

function downloadFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function money(price: string, currency: string) {
  const raw = String(price || "").replace(",", ".").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return price ? `${price} ${currency}` : "";
  return `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatPriceParts(price: string) {
  const raw = String(price || "").replace(",", ".").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return { major: price || "0", cents: "00" };
  const [major, cents = "00"] = n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(",");
  return { major, cents };
}

function mmNumber(v: string, fallback: number, min: number, max: number) {
  const n = Number(String(v || "").replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function intNumber(v: string, fallback: number, min: number, max: number) {
  const n = Number.parseInt(String(v || ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export default function AllInBarcodes(_props: PageProps) {
  const [variantId, setVariantId] = useState("");
  const [title, setTitle] = useState("");
  const [barcode, setBarcode] = useState("");
  const [brand, setBrand] = useState("");
  const [productCode, setProductCode] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("RON");
  const [unitText, setUnitText] = useState("LEI/BUC");
  const [companyName, setCompanyName] = useState(DEFAULT_COMPANY_NAME);
  const [labelWidth, setLabelWidth] = useState("40");
  const [labelHeight, setLabelHeight] = useState("46");
  const [pageCols, setPageCols] = useState("5");
  const [pageRows, setPageRows] = useState("6");
  const [pageMarginX, setPageMarginX] = useState("5");
  const [pageMarginY, setPageMarginY] = useState("5");
  const [copies, setCopies] = useState("1");
  const [showBorder, setShowBorder] = useState(true);
  const [content, setContent] = useState<Record<ContentKey, boolean>>(DEFAULT_CONTENT);
  const [templateName, setTemplateName] = useState("Standard 40x46");
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [status, setStatus] = useState("");
  const [colorTypes, setColorTypes] = useState<ColorType[]>([]);

  useEffect(() => {
    let loadedColors: ColorType[] = [];
    async function loadColorTypes() {
      try {
        const res = await fetch("/api/aif/meta", { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        loadedColors = Array.isArray(data?.colorTypes) ? data.colorTypes : [];
        setColorTypes(loadedColors);
      } catch {
        loadedColors = [];
      }
    }

    const colorPromise = loadColorTypes();

    const params = parseHashParams();
    const initialVariantId = queryValue(params, "variant", "variantId", "variant_id");
    const initialTitle = queryValue(params, "title", "name", "productName");
    const initialBarcode = queryValue(params, "barcode", "ean", "sku");
    const initialBrand = queryValue(params, "brand", "brandName");
    const initialSize = queryValue(params, "size");
    const initialColor = queryValue(params, "color", "colorName");
    const initialPrice = queryValue(params, "price", "sellPrice");
    const initialCode = queryValue(params, "code", "productCode", "supplierProductCode");
    const initialCategory = queryValue(params, "category", "categoryName");
    const initialDescription = queryValue(params, "description", "material");

    setVariantId(initialVariantId);
    setTitle(initialTitle);
    setBarcode(initialBarcode);
    setBrand(initialBrand);
    setSize(initialSize);
    setColor(officialColorRo(initialColor));
    setPrice(initialPrice);
    setProductCode(initialCode);
    setCategory(initialCategory);
    setDescription(initialDescription);

    try {
      const raw = window.localStorage.getItem("aifBarcodeTemplates");
      if (raw) setSavedTemplates(JSON.parse(raw));
    } catch {
      setSavedTemplates([]);
    }

    if (!initialVariantId) return;
    let cancelled = false;

    async function loadVariant() {
      try {
        await colorPromise;
        const res = await fetch(`/api/aif/variants/${encodeURIComponent(initialVariantId)}`, { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "A termékadatok betöltése nem sikerült.");
        if (cancelled) return;

        const item = data?.item || {};
        const supplierCode = Array.isArray(data?.supplierCodes) && data.supplierCodes.length ? data.supplierCodes[0] : {};
        const loadedTitle = firstText(item.title_ro, item.shopify_title, item.title_hu, initialTitle);
        const loadedBrand = firstText(item.brand_name, item.brand_code, initialBrand);
        const loadedProductCode = firstText(
          supplierCode.supplier_variant_code,
          supplierCode.supplier_product_code,
          supplierCode.supplier_sku,
          cleanModelCode(item.model_code),
          item.internal_sku,
          initialCode,
        );
        const loadedBarcode = firstText(item.barcode, supplierCode.supplier_barcode, supplierCode.supplier_sku, item.internal_sku, initialBarcode);
        const loadedCategory = firstText(item.category_name_ro, item.category_name_hu, item.category_code, initialCategory);
        const loadedDescription = firstText(item.material, item.description_ro, initialDescription);
        const loadedSize = firstText(item.size, supplierCode.supplier_size, initialSize);
        const loadedColor = officialColorFromTypes(firstText(item.color_name, supplierCode.supplier_color_name, item.color_code, initialColor), loadedColors);
        const loadedPrice = displayMoneyValue(firstText(item.sell_price, item.compare_at_price, item.buy_price, initialPrice));

        setTitle((prev) => prev || loadedTitle);
        setBrand((prev) => prev || loadedBrand);
        setProductCode((prev) => prev || loadedProductCode);
        setBarcode((prev) => prev || loadedBarcode);
        setCategory((prev) => prev || loadedCategory);
        setDescription((prev) => prev || loadedDescription);
        setSize((prev) => prev || loadedSize);
        setColor((prev) => prev || loadedColor);
        setPrice((prev) => prev || loadedPrice);
        setStatus("Termékadatok betöltve a raktárból.");
      } catch (e: any) {
        if (!cancelled) setStatus(e?.message || "A termékadatok betöltése nem sikerült.");
      }
    }

    loadVariant();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!colorTypes.length) return;
    setColor((prev) => officialColorFromTypes(prev, colorTypes));
  }, [colorTypes]);

  const normalizeColor = (value: unknown) => officialColorFromTypes(value, colorTypes);

  const render = useMemo(() => code128Svg(barcode, 70), [barcode]);
  const copyCount = intNumber(copies, 1, 1, 300);
  const labels = useMemo(() => Array.from({ length: copyCount }), [copyCount]);
  const safeFile = cleanInternalCode(barcode || title || "aif-vonalkod") || "aif-vonalkod";
  const canPrint = Boolean(barcode.trim()) && render.ok;
  const labelW = mmNumber(labelWidth, 40, 20, 120);
  const labelH = mmNumber(labelHeight, 46, 15, 100);
  const cols = intNumber(pageCols, 5, 1, 8);
  const rows = intNumber(pageRows, 6, 1, 12);
  const marginX = mmNumber(pageMarginX, 5, 0, 25);
  const marginY = mmNumber(pageMarginY, 5, 0, 25);
  const maxLabelsPerPage = cols * rows;
  const priceParts = formatPriceParts(price);

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setLabelWidth(p.width);
    setLabelHeight(p.height);
    setPageCols(p.cols);
    setPageRows(p.rows);
    setPageMarginX(p.marginX);
    setPageMarginY(p.marginY);
    setTemplateName(p.name);
    setStatus(`Sablon beállítva: ${p.name}`);
  }

  function toggleContent(key: ContentKey) {
    setContent((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function generateCode() {
    const generated = makeInternalCode(barcode || productCode || variantId || title || brand || "AIF");
    setBarcode(generated);
    setStatus("Belső vonalkód létrehozva. Ez később Shopify SKU-ként is használható.");
  }

  async function copyBarcode() {
    try {
      await navigator.clipboard.writeText(barcode);
      setStatus("Vonalkód másolva.");
    } catch {
      setStatus("A másolás nem sikerült a böngészőben.");
    }
  }

  function saveTemplate() {
    const name = templateName.trim() || `Sablon ${savedTemplates.length + 1}`;
    const nextTemplate: SavedTemplate = {
      name,
      labelWidth,
      labelHeight,
      pageCols,
      pageRows,
      pageMarginX,
      pageMarginY,
      companyName,
      currency,
      unitText,
      showBorder,
      content,
    };
    const next = [nextTemplate, ...savedTemplates.filter((x) => x.name !== name)].slice(0, 12);
    setSavedTemplates(next);
    window.localStorage.setItem("aifBarcodeTemplates", JSON.stringify(next));
    setStatus("Címke sablon mentve ebben a böngészőben.");
  }

  function loadTemplate(name: string) {
    const t = savedTemplates.find((x) => x.name === name);
    if (!t) return;
    setTemplateName(t.name);
    setLabelWidth(t.labelWidth);
    setLabelHeight(t.labelHeight);
    setPageCols(t.pageCols);
    setPageRows(t.pageRows);
    setPageMarginX(t.pageMarginX);
    setPageMarginY(t.pageMarginY);
    setCompanyName(t.companyName);
    setCurrency(t.currency);
    setUnitText(t.unitText);
    setShowBorder(t.showBorder);
    setContent({ ...DEFAULT_CONTENT, ...(t.content || {}) });
    setStatus("Mentett sablon betöltve.");
  }

  function exportCsv() {
    const rows = [
      ["Termeknev", "Marka", "Kod", "Kategoria", "Meret", "Szin", "Leiras", "Vonalkod", "Ar", "Penznem", "Peldany"],
      [title, brand, productCode, category, size, color, description, barcode, price, currency, String(copyCount)],
    ];
    const csv = "\ufeff" + rows.map((r) => r.map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(";")).join("\n");
    downloadFile(`${safeFile}.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportSvg() {
    if (!render.ok) {
      setStatus(render.error || "Nem exportálható vonalkód.");
      return;
    }
    downloadFile(`${safeFile}.svg`, render.svg, "image/svg+xml;charset=utf-8");
  }

  function printLabels() {
    if (!canPrint) {
      setStatus(render.error || "Nyomtatáshoz érvényes vonalkód kell.");
      return;
    }
    window.print();
  }

  const printStyle = {
    "--label-w": `${labelW}mm`,
    "--label-h": `${labelH}mm`,
    "--page-margin-x": `${marginX}mm`,
    "--page-margin-y": `${marginY}mm`,
    gridTemplateColumns: `repeat(${cols}, var(--label-w))`,
  } as CSSProperties & Record<string, string>;

  const previewStyle = {
    width: `${labelW * 6}px`,
    minHeight: `${labelH * 6}px`,
    maxWidth: "100%",
  } as CSSProperties;

  function LabelContent({ print = false }: { print?: boolean }) {
    return (
      <>
        {content.company && companyName && <div className="labelCompany">{cleanText(companyName, 48)}</div>}
        {content.brand && brand && <div className="labelBrand">{cleanText(brand, 42)}</div>}
        {content.title && <div className="labelTitle">{cleanText(title || "Denumire produs", 78)}</div>}
        {content.sizeColor && (size || color) && <div className="labelMeta">{size && <span>{cleanText(size, 16)}</span>}{color && <span>{cleanText(color, 24)}</span>}</div>}
        {content.barcode && <div className="barcodeSvgWrap" dangerouslySetInnerHTML={{ __html: render.ok ? render.svg : "" }} />}
        {content.description && description && <div className="labelDescription">{cleanText(description, 90)}</div>}
        {content.category && category && <div className="labelCategory">{cleanText(category, 36)}</div>}
        {content.code && (productCode || barcode) && <div className="labelCode">Cod: {cleanText(productCode || barcode, 40)}</div>}
        {content.price && price && (
          <div className="labelPrice">
            <span className="priceMajor">{priceParts.major}</span>
            <span className="priceCents">{priceParts.cents}</span>
            <span className="priceUnit">{cleanText(unitText || currency, 12)}</span>
          </div>
        )}
        {!print && !render.ok && <div className="errorBox compactError">{render.error}</div>}
      </>
    );
  }

  return (
    <main className="aifBarcodePage">
      <style>{`
        .aifBarcodePage {
          min-height: 100vh;
          padding: 28px clamp(12px, 4vw, 46px);
          background: #4f5a6b;
          color: #ffffff;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-weight: 400;
        }
        .barcodeShell { max-width: 1260px; margin: 0 auto; }
        .barcodeHeader, .barcodePanel, .barcodeCard {
          border: 1px solid rgba(255,255,255,.72);
          border-radius: 18px;
          background: rgba(58,70,88,.78);
          box-shadow: 0 16px 34px rgba(0,0,0,.12);
        }
        .barcodeHeader { padding: 18px 20px; display:flex; gap:16px; justify-content:space-between; align-items:flex-start; }
        .eyebrow { font-size: 11px; letter-spacing: .13em; text-transform: uppercase; color: #d9f2ef; }
        h1 { margin: 5px 0 6px; font-size: clamp(24px, 3vw, 32px); line-height: 1.05; font-weight: 400; }
        .muted { color: rgba(255,255,255,.72); font-size: 13px; }
        .actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        button, .buttonLike {
          border: 1px solid rgba(255,255,255,.65);
          background: #334056;
          color: #fff;
          border-radius: 10px;
          padding: 8px 11px;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          line-height: 1;
        }
        button:hover { background: #3f4d64; }
        button.primary { background: #23745f; border-color: #8fe6ce; }
        button.warning { background: #6b5520; border-color: #f4d06f; }
        button:disabled { opacity: .45; cursor: not-allowed; }
        .barcodeGrid { display:grid; grid-template-columns: minmax(320px, .9fr) minmax(360px, 1.1fr); gap:14px; margin-top:14px; }
        .barcodePanel { padding: 14px; }
        .panelTitle { display:flex; justify-content:space-between; align-items:center; border-radius: 12px; background:#111a29; padding:10px 12px; border-left:4px solid #6ee7c8; letter-spacing:.12em; text-transform:uppercase; font-size:13px; margin-bottom:12px; }
        .stepLine { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-top:12px; }
        .stepBox { border:1px solid rgba(255,255,255,.22); border-radius:12px; background:rgba(17,26,41,.25); padding:9px 10px; font-size:12px; color:rgba(255,255,255,.78); }
        .stepBox span { display:block; color:#9af4d8; font-size:11px; text-transform:uppercase; letter-spacing:.08em; margin-bottom:2px; }
        .formGrid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .field { display:flex; flex-direction:column; gap:5px; }
        .field.full { grid-column: 1 / -1; }
        label { font-size: 11px; text-transform: uppercase; letter-spacing:.04em; color:#ecf6f5; }
        input, select, textarea {
          background:#2f3a4d;
          color:#fff;
          border:1px solid rgba(255,255,255,.75);
          border-radius:10px;
          padding:9px 10px;
          min-height:36px;
          font: inherit;
          font-size: 13px;
          outline:none;
          color-scheme: dark;
        }
        textarea { min-height: 68px; resize: vertical; }
        input::placeholder, textarea::placeholder { color:rgba(255,255,255,.48); }
        .contentGrid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:8px; }
        .togglePill { display:flex; gap:8px; align-items:flex-start; text-align:left; border:1px solid rgba(255,255,255,.22); border-radius:12px; background:#2f3a4d; padding:9px; color:#fff; }
        .togglePill.active { border-color:#8fe6ce; background:rgba(35,116,95,.25); }
        .toggleDot { width:18px; height:18px; border-radius:50%; border:1px solid rgba(255,255,255,.45); flex: 0 0 auto; margin-top:1px; display:grid; place-items:center; font-size:11px; }
        .togglePill.active .toggleDot { background:#6ee7c8; color:#123328; border-color:#9af4d8; }
        .toggleText { display:grid; gap:2px; font-size:12px; }
        .toggleText small { color:rgba(255,255,255,.58); font-size:11px; line-height:1.2; }
        .helpBox { border:1px solid rgba(244,208,111,.72); border-radius:12px; padding:11px; background:rgba(107,85,32,.22); margin-top:10px; font-size:12.5px; color:rgba(255,255,255,.82); }
        .statusBox { border:1px solid rgba(142,230,206,.65); background:rgba(35,116,95,.18); border-radius:12px; padding:10px; color:#e9fffa; font-size:13px; }
        .errorBox { border:1px solid #ff8da0; background:rgba(207,18,52,.16); color:#ffe2e7; border-radius:12px; padding:10px; font-size:12px; }
        .compactError { margin-top:8px; }
        .previewBox { display:grid; grid-template-columns: 1fr; gap:12px; }
        .labelPreview {
          margin: 0 auto;
          background:#ffffff;
          color:#111;
          border-radius:14px;
          padding:14px;
          display:flex;
          flex-direction:column;
          justify-content:center;
          box-shadow: inset 0 0 0 1px #d6d6d6, 0 18px 34px rgba(0,0,0,.16);
          overflow:hidden;
        }
        .labelPreview.noBorder, .printLabel.noBorder { box-shadow:none; border-color:transparent; }
        .labelCompany { font-size:12px; text-align:center; text-transform:uppercase; letter-spacing:.08em; color:#333; margin-bottom:4px; }
        .labelBrand { font-size:12px; text-align:center; text-transform:uppercase; letter-spacing:.05em; color:#222; margin-bottom:4px; }
        .labelTitle { font-size:17px; line-height:1.12; margin-bottom:6px; }
        .labelMeta { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; color:#333; font-size:12px; margin-bottom:7px; }
        .labelDescription { border-top:1px solid #ddd; padding-top:5px; margin-top:5px; text-align:center; font-size:12px; color:#222; }
        .labelCategory { border-top:1px solid #ddd; padding-top:5px; margin-top:5px; text-align:center; text-transform:uppercase; font-size:13px; color:#111; }
        .labelCode { margin-top:4px; font-size:10.5px; color:#444; text-align:center; }
        .barcodeSvgWrap { width:100%; overflow:hidden; }
        .barcodeSvgWrap svg { display:block; width:100%; height:auto; max-height:82px; }
        .labelPrice { margin-top:6px; text-align:center; line-height:1; color:#111; white-space:nowrap; }
        .priceMajor { font-size:42px; letter-spacing:.12em; }
        .priceCents { font-size:22px; vertical-align:top; margin-left:3px; }
        .priceUnit { display:inline-block; font-size:12px; margin-left:5px; vertical-align:baseline; }
        .summaryGrid { display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; }
        .summaryCard { border:1px solid rgba(255,255,255,.18); border-radius:12px; background:rgba(17,26,41,.24); padding:9px; }
        .summaryCard small { display:block; color:rgba(255,255,255,.58); text-transform:uppercase; font-size:10px; letter-spacing:.06em; }
        .summaryCard span { display:block; margin-top:3px; color:#fff; font-size:13px; }
        .printSheet { display:none; }
        @media (max-width: 980px) { .barcodeGrid { grid-template-columns:1fr; } .barcodeHeader { flex-direction:column; } .formGrid { grid-template-columns:1fr; } .stepLine { grid-template-columns:1fr 1fr; } }
        @media (max-width: 560px) { .contentGrid, .summaryGrid { grid-template-columns:1fr; } .stepLine { grid-template-columns:1fr; } }
        @media print {
          @page { size: A4; margin: 0; }
          body * { visibility:hidden !important; }
          .printSheet, .printSheet * { visibility:visible !important; }
          .printSheet {
            display:grid !important;
            position:absolute;
            inset:0;
            padding:var(--page-margin-y) var(--page-margin-x);
            background:#fff;
            align-content:start;
            justify-content:start;
            gap:0;
          }
          .printLabel {
            width:var(--label-w);
            height:var(--label-h);
            border:1px solid #ddd;
            padding:2mm;
            color:#111;
            background:#fff;
            overflow:hidden;
            font-family:Arial, sans-serif;
            page-break-inside:avoid;
            box-sizing:border-box;
            display:flex;
            flex-direction:column;
            justify-content:center;
          }
          .printLabel .labelCompany { font-size:7.5pt; margin-bottom:.7mm; }
          .printLabel .labelBrand { font-size:7pt; margin-bottom:.7mm; }
          .printLabel .labelTitle { font-size:9.5pt; margin-bottom:1mm; }
          .printLabel .labelMeta { font-size:7.5pt; margin-bottom:1mm; }
          .printLabel .labelDescription { font-size:7pt; padding-top:.8mm; margin-top:.8mm; }
          .printLabel .labelCategory { font-size:8pt; padding-top:.8mm; margin-top:.8mm; }
          .printLabel .labelCode { font-size:6.5pt; }
          .printLabel svg { width:100%; max-height:14mm; }
          .printLabel .labelPrice { margin-top:1mm; }
          .printLabel .priceMajor { font-size:22pt; letter-spacing:.11em; }
          .printLabel .priceCents { font-size:12pt; }
          .printLabel .priceUnit { font-size:7.5pt; }
        }
      `}</style>

      <div className="barcodeShell">
        <section className="barcodeHeader">
          <div>
            <div className="eyebrow">AllInFashion</div>
            <h1>Vonalkód / címke központ</h1>
            <div className="muted">Címkekészítés: termékadat, vonalkód, sablon, előnézet, nyomtatás.</div>
            <div className="stepLine">
              <div className="stepBox"><span>1. adat</span>Termék és vonalkód</div>
              <div className="stepBox"><span>2. tartalom</span>Mi kerüljön rá</div>
              <div className="stepBox"><span>3. sablon</span>Méret és A4 kiosztás</div>
              <div className="stepBox"><span>4. nyomtatás</span>Előnézet és export</div>
            </div>
          </div>
          <div className="actions">
            <button type="button" onClick={() => { window.location.hash = "allinwarehouse"; }}>← Vissza a raktárba</button>
            <button type="button" onClick={printLabels} className="primary" disabled={!canPrint}>Nyomtatás</button>
          </div>
        </section>

        <section className="barcodeGrid">
          <div className="barcodePanel">
            <div className="panelTitle">Termékadatok</div>
            <div className="formGrid">
              <div className="field full">
                <label>Terméknév</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="UA Rival Fleece Joggers 001 L" />
              </div>
              <div className="field">
                <label>Márka</label>
                <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="pl. Under Armour" />
              </div>
              <div className="field">
                <label>Termékkód</label>
                <input value={productCode} onChange={(e) => setProductCode(cleanInternalCode(e.target.value))} placeholder="pl. 1357128-001-L" />
              </div>
              <div className="field full">
                <label>Vonalkód / Shopify SKU alap</label>
                <input value={barcode} onChange={(e) => setBarcode(cleanInternalCode(e.target.value))} placeholder="Egyedi variánsazonosító" />
              </div>
              <div className="field">
                <label>Kategória</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="pl. PANTALONI" />
              </div>
              <div className="field">
                <label>Variáns ID</label>
                <input value={variantId} onChange={(e) => setVariantId(e.target.value)} placeholder="AIF variáns azonosító" />
              </div>
              <div className="field">
                <label>Méret</label>
                <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="pl. L vagy 42" />
              </div>
              <div className="field">
                <label>Szín</label>
                <input value={color} onChange={(e) => setColor(e.target.value)} onBlur={() => setColor((prev) => normalizeColor(prev))} placeholder="pl. negru" />
              </div>
              <div className="field full">
                <label>Összetétel / leírás a címkére</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="80% BUMBAC 20% POLIESTER" />
              </div>
              <div className="field">
                <label>Ár</label>
                <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="pl. 235" inputMode="decimal" />
              </div>
              <div className="field">
                <label>Pénznem</label>
                <select value={currency} onChange={(e) => { setCurrency(e.target.value); if (e.target.value === "RON") setUnitText("LEI/BUC"); }}>
                  <option value="RON">RON</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="HUF">HUF</option>
                </select>
              </div>
              <div className="field">
                <label>Ár melletti egység</label>
                <input value={unitText} onChange={(e) => setUnitText(e.target.value)} placeholder="LEI/BUC" />
              </div>
              <div className="field">
                <label>Cég neve a címkén</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="TITAN EURO-COM SRL" />
              </div>
            </div>

            <div className="actions" style={{ marginTop: 12, justifyContent: "flex-start" }}>
              <button type="button" className="primary" onClick={generateCode}>Belső vonalkód generálása</button>
              <button type="button" onClick={copyBarcode} disabled={!barcode}>Másolás</button>
              <button type="button" onClick={exportSvg} disabled={!render.ok}>SVG export</button>
              <button type="button" onClick={exportCsv}>CSV export</button>
            </div>

            <div className="helpBox">
              Ez belső AllIn / Shopify SKU alapú Code128 címke.
            </div>
            {status && <div className="statusBox" style={{ marginTop: 10 }}>{status}</div>}
          </div>

          <div className="barcodePanel">
            <div className="panelTitle">Címke tartalma</div>
            <div className="contentGrid">
              {CONTENT_OPTIONS.map((opt) => (
                <button key={opt.key} type="button" className={`togglePill ${content[opt.key] ? "active" : ""}`} onClick={() => toggleContent(opt.key)}>
                  <span className="toggleDot">{content[opt.key] ? "✓" : ""}</span>
                  <span className="toggleText">{opt.label}<small>{opt.hint}</small></span>
                </button>
              ))}
            </div>

            <div className="panelTitle" style={{ marginTop: 14 }}>Méret és kiosztás</div>
            <div className="formGrid">
              <div className="field full">
                <label>Gyors sablon</label>
                <select onChange={(e) => applyPreset(e.target.value)} defaultValue="40x46">
                  {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Címke szélesség mm</label>
                <input value={labelWidth} onChange={(e) => setLabelWidth(e.target.value)} inputMode="decimal" />
              </div>
              <div className="field">
                <label>Címke magasság mm</label>
                <input value={labelHeight} onChange={(e) => setLabelHeight(e.target.value)} inputMode="decimal" />
              </div>
              <div className="field">
                <label>Oszlop / A4</label>
                <input value={pageCols} onChange={(e) => setPageCols(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>Sor / A4</label>
                <input value={pageRows} onChange={(e) => setPageRows(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>Margó bal-jobb mm</label>
                <input value={pageMarginX} onChange={(e) => setPageMarginX(e.target.value)} inputMode="decimal" />
              </div>
              <div className="field">
                <label>Margó fent-lent mm</label>
                <input value={pageMarginY} onChange={(e) => setPageMarginY(e.target.value)} inputMode="decimal" />
              </div>
              <div className="field">
                <label>Példány</label>
                <input value={copies} onChange={(e) => setCopies(e.target.value)} inputMode="numeric" />
              </div>
              <div className="field">
                <label>Keret</label>
                <select value={showBorder ? "yes" : "no"} onChange={(e) => setShowBorder(e.target.value === "yes")}>
                  <option value="yes">Keret nyomtatása</option>
                  <option value="no">Keret nélkül</option>
                </select>
              </div>
              <div className="field">
                <label>Sablon neve</label>
                <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              </div>
              <div className="field">
                <label>Mentett sablon</label>
                <select onChange={(e) => loadTemplate(e.target.value)} value="">
                  <option value="">Betöltés</option>
                  {savedTemplates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="actions" style={{ marginTop: 12, justifyContent: "flex-start" }}>
              <button type="button" className="warning" onClick={saveTemplate}>Sablon mentése</button>
            </div>
          </div>
        </section>

        <section className="barcodeGrid">
          <div className="barcodePanel">
            <div className="panelTitle">Előnézet</div>
            <div className="previewBox">
              {!render.ok && <div className="errorBox">{render.error}</div>}
              <div className={`labelPreview ${showBorder ? "" : "noBorder"}`} style={previewStyle}>
                <LabelContent />
              </div>
            </div>
          </div>
          <div className="barcodePanel">
            <div className="panelTitle">Nyomtatási összefoglaló</div>
            <div className="summaryGrid">
              <div className="summaryCard"><small>Címke</small><span>{labelW} × {labelH} mm</span></div>
              <div className="summaryCard"><small>A4 kiosztás</small><span>{cols} oszlop × {rows} sor</span></div>
              <div className="summaryCard"><small>Oldalanként</small><span>{maxLabelsPerPage} címke</span></div>
              <div className="summaryCard"><small>Példány</small><span>{copyCount}</span></div>
              <div className="summaryCard"><small>Vonalkód</small><span>{barcode || "nincs"}</span></div>
              <div className="summaryCard"><small>Ár</small><span>{money(price, currency) || "nincs"}</span></div>
            </div>
            <div className="actions" style={{ marginTop: 14, justifyContent: "flex-start" }}>
              <button type="button" onClick={printLabels} className="primary" disabled={!canPrint}>Nyomtatás</button>
              <button type="button" onClick={exportSvg} disabled={!render.ok}>SVG export</button>
              <button type="button" onClick={exportCsv}>CSV export</button>
            </div>
            <div className="helpBox">
              A nyomtatási nézet A4-re számol. A címke és margó értékek kézzel finomíthatók.
            </div>
          </div>
        </section>
      </div>

      <div className="printSheet" style={printStyle}>
        {labels.map((_, index) => (
          <div className={`printLabel ${showBorder ? "" : "noBorder"}`} key={index}>
            <LabelContent print />
          </div>
        ))}
      </div>
    </main>
  );
}
