import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Barcode,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Filter,
  Home,
  ImageIcon,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

type Props = {
  apiBase?: string;
  actor?: string;
  role?: string;
  shopId?: string;
  onLogout?: () => void;
};

type MessageTone = "info" | "error" | "success";
type CountStatus = "draft" | "counting" | "review" | "committed" | "cancelled";
type LineFilter = "all" | "uncounted" | "ok" | "missing" | "extra";
type PrintMode = "sheet" | "result";

type AifLocation = {
  id: string;
  code: string;
  name: string;
  location_type?: string | null;
  is_active?: boolean;
};

type AifMeta = {
  locations?: AifLocation[];
};

type AifStockItem = {
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  variant_id: string;
  internal_sku?: string | null;
  barcode?: string | null;
  display_barcode?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  buy_price?: number | string | null;
  sell_price?: number | string | null;
  model_id?: string | null;
  model_code?: string | null;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  category_name_ro?: string | null;
  category_code?: string | null;
  qty: number | string;
  reserved_qty: number | string;
  available_qty: number | string;
  updated_at?: string | null;
};

type InventoryCountSummary = {
  id: string;
  code: string;
  title: string;
  location_id: string;
  location_code?: string | null;
  location_name?: string | null;
  location_type?: string | null;
  status: CountStatus;
  started_at?: string | null;
  counted_at?: string | null;
  committed_at?: string | null;
  actor?: string | null;
  note?: string | null;
  raw?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  line_count?: number | string | null;
  counted_lines?: number | string | null;
  expected_qty?: number | string | null;
  counted_qty?: number | string | null;
  diff_qty?: number | string | null;
  missing_qty?: number | string | null;
  extra_qty?: number | string | null;
  missing_sell_value?: number | string | null;
  extra_sell_value?: number | string | null;
  diff_sell_value?: number | string | null;
  missing_buy_value?: number | string | null;
  extra_buy_value?: number | string | null;
  diff_buy_value?: number | string | null;
};

type InventoryCountLine = {
  id: string;
  count_id: string;
  variant_id: string;
  expected_qty: number | string;
  expected_reserved_qty?: number | string | null;
  counted_qty?: number | string | null;
  diff_qty?: number | string | null;
  missing_qty?: number | string | null;
  extra_qty?: number | string | null;
  buy_price?: number | string | null;
  sell_price?: number | string | null;
  diff_buy_value?: number | string | null;
  diff_sell_value?: number | string | null;
  note?: string | null;
  location_id?: string | null;
  location_code?: string | null;
  location_name?: string | null;
  internal_sku?: string | null;
  barcode?: string | null;
  display_barcode?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  color_hex?: string | null;
  image_url?: string | null;
  images?: unknown;
  model_id?: string | null;
  model_code?: string | null;
  title_ro: string;
  shopify_title?: string | null;
  brand_name?: string | null;
  brand_code?: string | null;
  category_name_ro?: string | null;
  category_code?: string | null;
  current_qty?: number | string | null;
  current_reserved_qty?: number | string | null;
  current_available_qty?: number | string | null;
};

type InventoryCountDetail = {
  item: InventoryCountSummary;
  lines: InventoryCountLine[];
  totals?: InventoryCountSummary;
};

type DraftLine = {
  countedQty: string;
  note: string;
};

type PendingScan = {
  lineId: string;
  code: string;
  qty: number;
  at: number;
  source: "camera" | "manual";
};

type CountValueSnapshot = {
  countedSellValue: number;
  expectedSellValue: number;
};

type ConfirmDialog = {
  kind: "commit" | "delete";
  title: string;
  description: string;
  confirmLabel: string;
  tone: "green" | "red";
  details?: string[];
};

type ScannerDetectedBarcode = { rawValue?: string; format?: string; displayValue?: string };
type ScannerBarcodeDetectorInstance = { detect(source: CanvasImageSource): Promise<ScannerDetectedBarcode[]> };
type ScannerBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): ScannerBarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

type ZxingControls = { stop?: () => void };
type ZxingResult = { getText?: () => string; text?: string; rawValue?: string };
type ZxingReader = {
  decodeFromConstraints?: (
    constraints: MediaStreamConstraints,
    previewElem: HTMLVideoElement,
    callbackFn: (result?: ZxingResult | null, error?: unknown, controls?: ZxingControls) => void
  ) => Promise<ZxingControls> | ZxingControls;
};
type ZxingBrowserGlobal = {
  BrowserMultiFormatReader?: new () => ZxingReader;
  BrowserMultiFormatOneDReader?: new () => ZxingReader;
};

declare global {
  interface Window {
    BarcodeDetector?: ScannerBarcodeDetectorConstructor;
    ZXingBrowser?: ZxingBrowserGlobal;
  }
}

const page = "min-h-screen bg-[#4b5362] pb-28 text-white font-normal";
const shell = "mx-auto max-w-3xl space-y-3 px-3 py-3";
const card = "rounded-[24px] border border-white/14 bg-white/[0.07] p-3 shadow-lg shadow-black/10";
const input = "h-11 w-full rounded-2xl border border-white/16 bg-[#263246] px-3 text-sm text-white outline-none placeholder:text-white/42 focus:border-[#7bd7d4]/65";
const select = `${input} pr-8`;
const label = "grid gap-1.5 text-[11px] uppercase tracking-[0.06em] text-white/62";
const iconBtn = "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/16 bg-white/[0.08] text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50";
const headerIconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/16 bg-white/[0.08] text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50";
const headerIconBtnActive = "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#7bd7d4]/45 bg-[#2a8d8b] text-white shadow-[0_8px_18px_rgba(42,141,139,0.20)] transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50";
const primaryBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[#7bd7d4]/45 bg-[#2a8d8b] px-3 text-xs font-medium text-white shadow-[0_10px_24px_rgba(42,141,139,0.22)] transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-50";
const softBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/16 bg-white/[0.08] px-3 text-xs font-medium text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50";
const dangerBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[#ff6678] bg-[#e3132c] px-3 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(227,19,44,0.30)] transition hover:bg-[#ff1935] disabled:cursor-not-allowed disabled:opacity-50";
const chipBase = "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2xl border px-3 text-xs transition-colors";
const chipActive = `${chipBase} border-[#7bd7d4]/55 bg-[#2a8d8b] text-white shadow-[0_8px_20px_rgba(42,141,139,0.20)]`;
const chipIdle = `${chipBase} border-white/14 bg-white/[0.06] text-white/72 hover:bg-white/[0.10]`;
const sheetPanel = "fixed inset-x-0 bottom-0 z-[70] max-h-[86vh] overflow-auto rounded-t-[28px] border border-white/18 bg-[#303a4c] p-4 shadow-2xl shadow-black/50";

const stockMovesChangedStorageKey = "allinfashion:stockMoves:changed:v1";
const stockMovesChangedEventName = "aif:stock-moves-changed";
const INVENTORY_BARCODE_SCAN_FORMATS = [
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
const INVENTORY_BARCODE_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
};
const INVENTORY_ZXING_BROWSER_CDN = "https://unpkg.com/@zxing/browser@0.1.5";
let inventoryZxingBrowserPromise: Promise<ZxingBrowserGlobal | null> | null = null;

function cleanScannedBarcode(value: unknown) {
  return String(value ?? "").replace(/[\r\n\t]+/g, "").trim();
}

function zxingResultText(result: unknown) {
  const r = result as ZxingResult | null | undefined;
  if (!r) return "";
  if (typeof r.getText === "function") return cleanScannedBarcode(r.getText());
  return cleanScannedBarcode(r.text || r.rawValue || "");
}

function loadInventoryZxingBrowser(): Promise<ZxingBrowserGlobal | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  if (window.ZXingBrowser?.BrowserMultiFormatReader || window.ZXingBrowser?.BrowserMultiFormatOneDReader) {
    return Promise.resolve(window.ZXingBrowser);
  }
  if (inventoryZxingBrowserPromise) return inventoryZxingBrowserPromise;

  inventoryZxingBrowserPromise = new Promise((resolve) => {
    const finish = () => resolve(window.ZXingBrowser || null);
    const existing = document.querySelector<HTMLScriptElement>('script[data-aif-inventory-zxing="true"]');
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
    script.src = INVENTORY_ZXING_BROWSER_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.aifInventoryZxing = "true";
    script.onload = () => {
      script.dataset.loaded = "true";
      finish();
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return inventoryZxingBrowserPromise;
}

function goHome() {
  window.location.hash = "#allin";
}

function n(value: unknown) {
  const num = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(num) ? num : 0;
}

function formatQty(value: unknown) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(n(value));
}

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(n(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function todayTitle() {
  const d = new Date();
  return `Leltár ${new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d)}`;
}

function getImageSrc(item?: { image_url?: string | null; images?: unknown }) {
  if (!item) return "";
  if (typeof item.image_url === "string" && item.image_url.trim()) return item.image_url.trim();
  const images = item.images;
  if (Array.isArray(images)) {
    const first = images.find(Boolean);
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const obj = first as Record<string, unknown>;
      const src = obj.src || obj.url || obj.image_url;
      if (typeof src === "string") return src;
    }
  }
  if (images && typeof images === "object") {
    const obj = images as Record<string, unknown>;
    const src = obj.src || obj.url || obj.image_url;
    if (typeof src === "string") return src;
  }
  return "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function notifyStockMovesChanged(detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = { at: new Date().toISOString(), ...detail };
  try {
    window.localStorage.setItem(stockMovesChangedStorageKey, JSON.stringify(payload));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(stockMovesChangedEventName, { detail: payload }));
  } catch {}
}

function productTitle(item: { title_ro?: string | null; shopify_title?: string | null }) {
  return item.title_ro || item.shopify_title || "Névtelen termék";
}

function statusLabel(status?: CountStatus) {
  switch (status) {
    case "draft": return "Előkészítve";
    case "counting": return "Számolás alatt";
    case "review": return "Ellenőrzés";
    case "committed": return "Bevezetve";
    case "cancelled": return "Törölve";
    default: return "-";
  }
}

function sourceLabel(location?: AifLocation | null) {
  if (!location) return "Helyszín";
  return location.location_type === "shop" ? "Üzlet" : location.location_type === "warehouse" ? "Raktár" : "Helyszín";
}

function lineDraftFrom(line: InventoryCountLine): DraftLine {
  const countedQty = line.counted_qty === null || line.counted_qty === undefined ? "" : String(Math.trunc(n(line.counted_qty)));
  return { countedQty, note: line.note || "" };
}

function draftCountedValue(draft?: DraftLine) {
  if (!draft || draft.countedQty.trim() === "") return null;
  const value = Number.parseInt(draft.countedQty, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function lineDiff(line: InventoryCountLine, drafts: Record<string, DraftLine>) {
  const counted = draftCountedValue(drafts[line.id]);
  if (counted === null) return null;
  return counted - n(line.expected_qty);
}

function barcodeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[\s\u00a0]+/g, "")
    .toLowerCase();
}

function barcodeLooseKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function barcodeValues(line: InventoryCountLine) {
  return [
    line.display_barcode,
    line.barcode,
    line.internal_sku,
    line.variant_id,
    line.model_code,
  ].filter((x) => String(x ?? "").trim());
}

function signedQty(value: number) {
  return `${value > 0 ? "+" : ""}${formatQty(value)}`;
}

function ProductImage({ src, title, onPreview, size = "normal" }: { src?: string; title?: string; onPreview?: () => void; size?: "normal" | "large" }) {
  const clean = String(src || "").trim();
  const cls = size === "large" ? "h-28 w-24" : "h-[90px] w-[72px]";
  return (
    <button
      type="button"
      onClick={clean ? onPreview : undefined}
      disabled={!clean}
      className={`${cls} grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/20 bg-white text-slate-400 shadow-sm disabled:cursor-default`}
      aria-label={clean ? "Termékkép nagyítása" : "Nincs termékkép"}
    >
      {clean ? <img src={clean} alt={title || ""} className="h-full w-full object-contain p-1" loading="lazy" /> : <ImageIcon size={24} />}
    </button>
  );
}

function MiniStat({ label: labelText, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "neutral" | "green" | "red" | "blue" }) {
  const cls = tone === "green"
    ? "border-[#7bd7d4]/35 bg-[#2a8d8b]/22"
    : tone === "red"
      ? "border-rose-300/35 bg-rose-500/14"
      : tone === "blue"
        ? "border-sky-300/30 bg-sky-500/12"
        : "border-white/14 bg-white/[0.07]";
  return (
    <div className={`rounded-2xl border px-3 py-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-[0.08em] text-white/50">{labelText}</p>
      <p className="mt-1 text-xl leading-none text-white">{value}</p>
      {hint ? <p className="mt-1 truncate text-[10px] text-white/48">{hint}</p> : null}
    </div>
  );
}

function MobileBackdrop({ onClose }: { onClose: () => void }) {
  return <button type="button" aria-label="Bezárás" className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm" onClick={onClose} />;
}

export default function AllInInventoryMobile({ apiBase = "/api" }: Props) {
  const aifBase = `${apiBase.replace(/\/$/, "")}/aif`;
  const [locations, setLocations] = useState<AifLocation[]>([]);
  const [location, setLocation] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lineFilter, setLineFilter] = useState<LineFilter>("all");
  const [stockRows, setStockRows] = useState<AifStockItem[]>([]);
  const [counts, setCounts] = useState<InventoryCountSummary[]>([]);
  const [countsPage, setCountsPage] = useState(1);
  const [countValueCache, setCountValueCache] = useState<Record<string, CountValueSnapshot>>({});
  const [active, setActive] = useState<InventoryCountDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftLine>>({});
  const [title, setTitle] = useState(todayTitle());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: MessageTone; text: string } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [countsOpen, setCountsOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [scannerStatus, setScannerStatus] = useState("");
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);
  const [imagePreview, setImagePreview] = useState<{ src: string; title: string } | null>(null);
  const [linePageSize, setLinePageSize] = useState<20 | 50 | 100>(20);
  const [linePage, setLinePage] = useState(1);
  const [recentScannedLineIds, setRecentScannedLineIds] = useState<string[]>([]);

  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerDetectorRef = useRef<ScannerBarcodeDetectorInstance | null>(null);
  const scannerZxingControlsRef = useRef<ZxingControls | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const scannerHandlingRef = useRef(false);
  const activeRef = useRef<InventoryCountDetail | null>(null);
  const draftsRef = useRef<Record<string, DraftLine>>({});
  const pendingScanRef = useRef<PendingScan | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const manualBarcodeInputRef = useRef<HTMLInputElement | null>(null);
  const countValueLoadingRef = useRef<Set<string>>(new Set());
  const inventoryLinesTopRef = useRef<HTMLElement | null>(null);

  async function fetchAifJSON<T>(path: string, init?: RequestInit): Promise<T> {
    const method = String(init?.method || "GET").toUpperCase();
    const res = await fetch(`${aifBase}${path}`, {
      credentials: "include",
      cache: method === "GET" ? "no-store" : "default",
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      ...init,
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

  const currentLocation = useMemo(() => locations.find((x) => x.id === location || x.code === location) || null, [locations, location]);

  const loadMeta = useCallback(async () => {
    const meta = await fetchAifJSON<AifMeta>("/meta");
    const activeLocations = (meta.locations || []).filter((x) => x.is_active !== false);
    setLocations(activeLocations);
    setLocation((prev) => prev || activeLocations[0]?.id || "");
  }, [aifBase]);

  const loadCount = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const detail = await fetchAifJSON<InventoryCountDetail>(`/inventory-counts/${encodeURIComponent(id)}?_=${Date.now()}`);
      setActive(detail);
      setCountValueCache((prev) => ({ ...prev, [detail.item.id]: valueSnapshotFromLines(detail.lines || []) }));
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setMessage(null);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "A leltár betöltése nem sikerült." });
    } finally {
      setLoading(false);
    }
  }, [aifBase]);

  const loadStockAndCounts = useCallback(async (locationValue: string, searchValue: string, silent = false) => {
    if (!locationValue) return;
    if (!silent) setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("location", locationValue);
      if (searchValue.trim()) q.set("search", searchValue.trim());
      q.set("_", String(Date.now()));
      const [stock, countList] = await Promise.all([
        fetchAifJSON<{ items: AifStockItem[] }>(`/stock?${q.toString()}`),
        fetchAifJSON<{ items: InventoryCountSummary[] }>(`/inventory-counts?location=${encodeURIComponent(locationValue)}&limit=200&_=${Date.now()}`),
      ]);
      setStockRows(stock.items || []);
      setCounts(countList.items || []);
      setMessage(null);
      setActive((prev) => {
        if (prev && String(prev.item.location_id) === String(locationValue)) return prev;
        const open = (countList.items || []).find((x) => !["committed", "cancelled"].includes(x.status));
        if (open) void loadCount(open.id);
        return prev && String(prev.item.location_id) !== String(locationValue) ? null : prev;
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "A leltár adatok betöltése nem sikerült." });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [aifBase, loadCount]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!location) return;
    const handle = window.setTimeout(() => void loadStockAndCounts(location, search), 200);
    return () => window.clearTimeout(handle);
  }, [location, search, loadStockAndCounts]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    setRecentScannedLineIds([]);
  }, [active?.item.id]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    pendingScanRef.current = pendingScan;
  }, [pendingScan]);

  useEffect(() => {
    return () => stopCameraScanner(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!confirmDialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setConfirmDialog(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmDialog, saving]);

  const categories = useMemo(() => {
    const set = new Map<string, string>();
    for (const row of active?.lines || stockRows) {
      const code = row.category_code || row.category_name_ro || "uncat";
      const name = row.category_name_ro || row.category_code || "Kategória nélkül";
      set.set(String(code), String(name));
    }
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1], "hu"));
  }, [active, stockRows]);

  const filteredStockRows = useMemo(() => {
    const searchKey = barcodeLooseKey(search);
    return stockRows.filter((row) => {
      if (categoryFilter !== "all" && row.category_code !== categoryFilter && row.category_name_ro !== categoryFilter) return false;
      if (!searchKey) return true;
      const haystack = [
        productTitle(row), row.brand_name, row.category_name_ro, row.color_name, row.color_code, row.size,
        row.display_barcode, row.barcode, row.internal_sku, row.model_code,
      ].map(barcodeLooseKey).join(" ");
      return haystack.includes(searchKey);
    });
  }, [stockRows, categoryFilter, search]);

  const filteredLines = useMemo(() => {
    const lines = active?.lines || [];
    const searchKey = barcodeLooseKey(search);
    const filtered = lines.filter((line) => {
      if (categoryFilter !== "all" && line.category_code !== categoryFilter && line.category_name_ro !== categoryFilter) return false;
      if (searchKey) {
        const haystack = [
          productTitle(line), line.brand_name, line.category_name_ro, line.color_name, line.color_code, line.size,
          line.display_barcode, line.barcode, line.internal_sku, line.model_code,
        ].map(barcodeLooseKey).join(" ");
        if (!haystack.includes(searchKey)) return false;
      }
      const diff = lineDiff(line, drafts);
      if (lineFilter === "uncounted") return diff === null;
      if (lineFilter === "ok") return diff === 0;
      if (lineFilter === "missing") return diff !== null && diff < 0;
      if (lineFilter === "extra") return diff !== null && diff > 0;
      return true;
    });

    if (!recentScannedLineIds.length) return filtered;
    const rank = new Map(recentScannedLineIds.map((id, index) => [id, index]));
    return filtered.sort((a, b) => {
      const aRank = rank.get(a.id);
      const bRank = rank.get(b.id);
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;
      return 0;
    });
  }, [active, categoryFilter, lineFilter, drafts, search, recentScannedLineIds]);

  const lineTotalPages = Math.max(1, Math.ceil(filteredLines.length / linePageSize));
  const visibleLines = useMemo(() => {
    const start = (linePage - 1) * linePageSize;
    return filteredLines.slice(start, start + linePageSize);
  }, [filteredLines, linePage, linePageSize]);

  useEffect(() => {
    setLinePage(1);
  }, [active?.item.id, search, categoryFilter, lineFilter, linePageSize]);

  useEffect(() => {
    if (linePage > lineTotalPages) setLinePage(lineTotalPages);
  }, [linePage, lineTotalPages]);

  function changeLinePage(nextPage: number) {
    const safePage = Math.max(1, Math.min(lineTotalPages, nextPage));
    setLinePage(safePage);
    window.setTimeout(() => inventoryLinesTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function valueSnapshotFromLines(lines: InventoryCountLine[]): CountValueSnapshot {
    let countedSellValue = 0;
    let expectedSellValue = 0;
    for (const line of lines || []) {
      const sell = n(line.sell_price);
      expectedSellValue += n(line.expected_qty) * sell;
      const countedValue = line.counted_qty === null || line.counted_qty === undefined ? null : n(line.counted_qty);
      if (countedValue !== null) countedSellValue += countedValue * sell;
    }
    return { countedSellValue, expectedSellValue };
  }

  const activeStats = useMemo(() => {
    const lines = active?.lines || [];
    let expected = 0;
    let counted = 0;
    let expectedSellValue = 0;
    let countedSellValue = 0;
    let countedLines = 0;
    let missing = 0;
    let extra = 0;
    let diffSell = 0;
    let missingSell = 0;
    let extraSell = 0;
    let diffBuy = 0;
    for (const line of lines) {
      const expectedQty = n(line.expected_qty);
      const countedValue = draftCountedValue(drafts[line.id]);
      expected += expectedQty;
      const sell = n(line.sell_price);
      expectedSellValue += expectedQty * sell;
      if (countedValue !== null) {
        countedSellValue += countedValue * sell;
        countedLines += 1;
        counted += countedValue;
        const diff = countedValue - expectedQty;
        const buy = n(line.buy_price);
        if (diff < 0) missing += Math.abs(diff);
        if (diff > 0) extra += diff;
        diffSell += diff * sell;
        diffBuy += diff * buy;
        if (diff < 0) missingSell += Math.abs(diff) * sell;
        if (diff > 0) extraSell += diff * sell;
      }
    }
    return {
      lines: lines.length,
      expected,
      counted,
      countedLines,
      missing,
      extra,
      net: counted - expected,
      missingSell,
      extraSell,
      diffSell,
      diffBuy,
      expectedSellValue,
      countedSellValue,
      complete: lines.length > 0 && countedLines === lines.length,
      progress: lines.length ? Math.round((countedLines / lines.length) * 100) : 0,
    };
  }, [active, drafts]);

  const countsPageSize = 10;
  const countsTotalPages = Math.max(1, Math.ceil(counts.length / countsPageSize));
  const visibleCounts = useMemo(() => {
    const start = (countsPage - 1) * countsPageSize;
    return counts.slice(start, start + countsPageSize);
  }, [counts, countsPage]);

  useEffect(() => {
    setCountsPage(1);
  }, [location]);

  useEffect(() => {
    if (countsPage > countsTotalPages) setCountsPage(countsTotalPages);
  }, [countsPage, countsTotalPages]);

  useEffect(() => {
    let cancelled = false;
    const targets = Array.from(new Map([...counts.slice(0, 3), ...visibleCounts].map((count) => [count.id, count])).values());
    const loadValues = async () => {
      for (const count of targets) {
        if (cancelled || countValueCache[count.id] || countValueLoadingRef.current.has(count.id)) continue;
        countValueLoadingRef.current.add(count.id);
        try {
          const detail = await fetchAifJSON<InventoryCountDetail>(`/inventory-counts/${encodeURIComponent(count.id)}?_=${Date.now()}`);
          if (!cancelled) {
            setCountValueCache((prev) => ({ ...prev, [count.id]: valueSnapshotFromLines(detail.lines || []) }));
          }
        } catch {
          // A lista marad használható akkor is, ha egy régi leltár értékét épp nem sikerül betölteni.
        } finally {
          countValueLoadingRef.current.delete(count.id);
        }
      }
    };
    void loadValues();
    return () => { cancelled = true; };
  }, [counts, visibleCounts]);

  const stockStats = useMemo(() => {
    return filteredStockRows.reduce((acc, row) => {
      acc.lines += 1;
      acc.qty += n(row.qty);
      acc.available += n(row.available_qty);
      acc.sellValue += n(row.qty) * n(row.sell_price);
      return acc;
    }, { lines: 0, qty: 0, available: 0, sellValue: 0 });
  }, [filteredStockRows]);

  const pendingLine = useMemo(() => {
    if (!pendingScan || !active) return null;
    return active.lines.find((line) => line.id === pendingScan.lineId) || null;
  }, [active, pendingScan]);

  const canEditActive = Boolean(active && !["committed", "cancelled"].includes(active.item.status));

  async function refresh(showSuccess = false) {
    await loadStockAndCounts(location, search);
    if (showSuccess) setMessage({ tone: "success", text: "Leltár frissítve." });
  }

  async function createCount() {
    if (!location) {
      setMessage({ tone: "error", text: "Előbb válassz üzletet / helyszínt." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const detail = await fetchAifJSON<InventoryCountDetail>("/inventory-counts", {
        method: "POST",
        body: JSON.stringify({ location, title: title.trim() || todayTitle(), note: note.trim() || null, search: search.trim() || null }),
      });
      setActive(detail);
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      setMessage({ tone: "success", text: "Leltár elindítva. A telefonos számolás indulhat." });
      await loadStockAndCounts(location, search, true);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "A leltár indítása nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  async function saveLines(silent = false) {
    if (!active) return;
    setSaving(true);
    if (!silent) setMessage(null);
    try {
      const lines = (Object.entries(drafts) as [string, DraftLine][]).map(([lineId, draft]) => ({
        lineId,
        countedQty: draft.countedQty.trim() === "" ? null : draft.countedQty,
        note: draft.note.trim() || null,
      }));
      const detail = await fetchAifJSON<InventoryCountDetail & { saved?: number }>(`/inventory-counts/${encodeURIComponent(active.item.id)}/lines`, {
        method: "PATCH",
        body: JSON.stringify({ lines }),
      });
      setActive({ item: detail.item, lines: detail.lines });
      setCountValueCache((prev) => ({ ...prev, [detail.item.id]: valueSnapshotFromLines(detail.lines || []) }));
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      if (!silent) setMessage({ tone: "success", text: "Leltár mentve." });
      await loadStockAndCounts(location, search, true);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "A leltár mentése nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  function commitCount() {
    if (!active) return;
    if (!activeStats.complete) {
      setMessage({ tone: "error", text: "Bevezetés előtt minden sorhoz írj talált darabszámot." });
      return;
    }
    setConfirmDialog({
      kind: "commit",
      tone: "green",
      title: "Leltár bevezetése",
      description: "A bevezetés módosítja a készletet, és készletmozgást ír a naplóba.",
      confirmLabel: "Bevezetés",
      details: [
        `Leltár: ${active.item.title}`,
        `Helyszín: ${active.item.location_name || currentLocation?.name || "-"}`,
        `Számolt sor: ${formatQty(activeStats.countedLines)} / ${formatQty(activeStats.lines)}`,
        `Nettó eltérés: ${activeStats.net > 0 ? "+" : ""}${formatQty(activeStats.net)} db`,
      ],
    });
  }

  async function runCommitCount() {
    if (!active) return;
    if (!activeStats.complete) {
      setConfirmDialog(null);
      setMessage({ tone: "error", text: "Bevezetés előtt minden sorhoz írj talált darabszámot." });
      return;
    }
    setConfirmDialog(null);
    setSaving(true);
    try {
      await saveLines(true);
      const detail = await fetchAifJSON<InventoryCountDetail & { changed?: number }>(`/inventory-counts/${encodeURIComponent(active.item.id)}/commit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setActive({ item: detail.item, lines: detail.lines });
      setCountValueCache((prev) => ({ ...prev, [detail.item.id]: valueSnapshotFromLines(detail.lines || []) }));
      const nextDrafts: Record<string, DraftLine> = {};
      for (const line of detail.lines || []) nextDrafts[line.id] = lineDraftFrom(line);
      setDrafts(nextDrafts);
      notifyStockMovesChanged({ source: "inventory_count", inventoryCountId: detail.item.id });
      setMessage({ tone: "success", text: "Leltár bevezetve. A készlet és a mozgásnapló frissült." });
      await loadStockAndCounts(location, search, true);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "A leltár bevezetése nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  function deleteCount() {
    if (!active) return;
    setConfirmDialog({
      kind: "delete",
      tone: "red",
      title: "Leltár törlése",
      description: "A megkezdett leltár törlődik. Bevezetett leltár nem törölhető innen.",
      confirmLabel: "Törlés",
      details: [
        `Leltár: ${active.item.title}`,
        `Helyszín: ${active.item.location_name || currentLocation?.name || "-"}`,
        `Állapot: ${statusLabel(active.item.status)}`,
      ],
    });
  }

  async function runDeleteCount() {
    if (!active) return;
    setConfirmDialog(null);
    setSaving(true);
    try {
      await fetchAifJSON(`/inventory-counts/${encodeURIComponent(active.item.id)}`, { method: "DELETE" });
      setActive(null);
      setDrafts({});
      setMessage({ tone: "success", text: "Leltár törölve." });
      await loadStockAndCounts(location, search, true);
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "A leltár törlése nem sikerült." });
    } finally {
      setSaving(false);
    }
  }

  function confirmDialogAction() {
    if (!confirmDialog || saving) return;
    if (confirmDialog.kind === "commit") void runCommitCount();
    else void runDeleteCount();
  }

  function updateDraft(lineId: string, patch: Partial<DraftLine>) {
    setDrafts((prev) => ({
      ...prev,
      [lineId]: { ...(prev[lineId] || { countedQty: "", note: "" }), ...patch },
    }));
  }

  function incrementLine(lineId: string, delta: number) {
    const current = draftCountedValue(draftsRef.current[lineId]) ?? 0;
    updateDraft(lineId, { countedQty: String(Math.max(0, current + delta)) });
  }

  function setVisibleToExpected() {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const line of filteredLines) next[line.id] = { ...(next[line.id] || { note: "" }), countedQty: String(Math.trunc(n(line.expected_qty))) };
      return next;
    });
  }

  function clearVisible() {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const line of filteredLines) next[line.id] = { ...(next[line.id] || { note: "" }), countedQty: "" };
      return next;
    });
  }

  function findLineByBarcode(code: string) {
    const exact = barcodeKey(code);
    const loose = barcodeLooseKey(code);
    if (!exact && !loose) return null;
    const lines = activeRef.current?.lines || [];
    return lines.find((line) => barcodeValues(line).some((value) => barcodeKey(value) === exact)) ||
      lines.find((line) => barcodeValues(line).some((value) => barcodeLooseKey(value) === loose)) ||
      null;
  }

  function handleBarcodeCandidate(rawCode: string, source: "camera" | "manual" = "camera") {
    const code = cleanScannedBarcode(rawCode);
    if (!code) return;

    const now = Date.now();
    const key = barcodeKey(code);
    const duplicateWindowMs = source === "manual" ? 250 : 950;
    if (lastScanRef.current.code === key && now - lastScanRef.current.at < duplicateWindowMs) return;
    lastScanRef.current = { code: key, at: now };

    if (!activeRef.current) {
      setSearch(code);
      setScannerStatus(`Keresés erre: ${code}`);
      setMessage({ tone: "info", text: `A vonalkód bekerült a keresőbe: ${code}` });
      if (source === "manual") setManualBarcode("");
      searchInputRef.current?.focus();
      return;
    }

    if (!canEditActive) {
      setSearch(code);
      setScannerStatus(`Ez a leltár nem szerkeszthető. Keresés erre: ${code}`);
      setMessage({ tone: "info", text: `A vonalkód bekerült a keresőbe: ${code}` });
      if (source === "manual") setManualBarcode("");
      return;
    }

    if (pendingScanRef.current) return;
    const line = findLineByBarcode(code);
    if (!line) {
      setScannerStatus(`Nem találom ezt a bárkódot ebben a leltárban: ${code}`);
      setMessage({ tone: "error", text: `A bárkód nincs ebben a leltárban: ${code}. Ellenőrizd a helyszínt vagy a vonalkódot.` });
      if (source === "manual") setManualBarcode("");
      return;
    }

    setLineFilter("all");
    setPendingScan({ lineId: line.id, code, qty: 1, at: now, source });
    setScannerStatus(`${productTitle(line)} beolvasva. Alapból 1 db, erősítsd meg.`);
    if (source === "manual") setManualBarcode("");
  }

  function submitManualBarcode() {
    handleBarcodeCandidate(manualBarcode, "manual");
  }

  function handleManualBarcodeInput(value: string) {
    setManualBarcode(value);
    if (pendingScanRef.current) return;
    const code = cleanScannedBarcode(value);
    if (!code || !activeRef.current || !canEditActive) return;
    if (!findLineByBarcode(code)) return;
    handleBarcodeCandidate(code, "manual");
  }

  function changePendingQty(delta: number) {
    setPendingScan((prev) => prev ? { ...prev, qty: Math.max(1, prev.qty + delta) } : prev);
  }

  function focusBarcodeInput() {
    window.setTimeout(() => {
      manualBarcodeInputRef.current?.focus();
      manualBarcodeInputRef.current?.select();
    }, 0);
  }

  function clearPendingScan() {
    const shouldRefocus = pendingScan?.source === "manual";
    setPendingScan(null);
    setScannerStatus("Beolvasás elvetve. Jöhet a következő vonalkód.");
    if (shouldRefocus) focusBarcodeInput();
  }

  function applyPendingScan() {
    if (!pendingScan) return;
    const line = (activeRef.current?.lines || []).find((item) => item.id === pendingScan.lineId);
    if (!line) {
      setPendingScan(null);
      setMessage({ tone: "error", text: "A beolvasott sor nem található. Frissítsd a leltárt." });
      return;
    }
    const current = draftCountedValue(draftsRef.current[pendingScan.lineId]) ?? 0;
    const next = current + pendingScan.qty;
    const shouldRefocus = pendingScan.source === "manual";
    updateDraft(pendingScan.lineId, { countedQty: String(next) });
    setRecentScannedLineIds((currentOrder) => [line.id, ...currentOrder.filter((id) => id !== line.id)]);
    setLinePage(1);
    setPendingScan(null);
    setManualBarcode("");
    setScannerStatus(`${pendingScan.qty} db hozzáadva: ${productTitle(line)}. Új talált mennyiség: ${next} db.`);
    setMessage({ tone: "success", text: `${pendingScan.qty} db hozzáadva ehhez: ${productTitle(line)}. Talált mennyiség: ${next} db.` });
    if (shouldRefocus) focusBarcodeInput();
  }

  function stopCameraScanner(close = true) {
    if (scannerFrameRef.current !== null) {
      window.cancelAnimationFrame(scannerFrameRef.current);
      scannerFrameRef.current = null;
    }
    try { scannerZxingControlsRef.current?.stop?.(); } catch {}
    scannerZxingControlsRef.current = null;
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }
    if (scannerVideoRef.current) scannerVideoRef.current.srcObject = null;
    scannerDetectorRef.current = null;
    scannerHandlingRef.current = false;
    if (close) setScannerOpen(false);
  }

  async function startCameraScanner() {
    if (scannerOpen) return;
    stopCameraScanner(false);
    setScannerOpen(true);
    setScannerStatus("Kamera indítása...");
    setPendingScan(null);
    setManualBarcode("");

    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const videoElement = scannerVideoRef.current;
    if (!videoElement) {
      setScannerStatus("A kamera nézet nem készült el. Zárd be és indítsd újra.");
      return;
    }

    const BarcodeDetectorCtor = window.BarcodeDetector;
    if (BarcodeDetectorCtor && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(INVENTORY_BARCODE_VIDEO_CONSTRAINTS);
        scannerStreamRef.current = stream;
        videoElement.srcObject = stream;
        videoElement.setAttribute("playsinline", "true");
        await videoElement.play().catch(() => undefined);
        try {
          scannerDetectorRef.current = new BarcodeDetectorCtor({ formats: INVENTORY_BARCODE_SCAN_FORMATS });
        } catch {
          scannerDetectorRef.current = new BarcodeDetectorCtor();
        }
        const tick = async () => {
          const video = scannerVideoRef.current;
          const detector = scannerDetectorRef.current;
          if (!scannerStreamRef.current || !video || !detector) return;
          if (!pendingScanRef.current && !scannerHandlingRef.current && video.readyState >= 2) {
            try {
              const detected = await detector.detect(video);
              const first = detected?.[0];
              const raw = first?.rawValue || first?.displayValue;
              if (raw) {
                scannerHandlingRef.current = true;
                handleBarcodeCandidate(String(raw), "camera");
                window.setTimeout(() => { scannerHandlingRef.current = false; }, 700);
              }
            } catch {
              // Egy-egy frame hibája nem érdekel, megyünk tovább. A gépek is pislognak néha.
            }
          }
          scannerFrameRef.current = window.requestAnimationFrame(tick);
        };
        scannerFrameRef.current = window.requestAnimationFrame(tick);
        setScannerStatus(activeRef.current ? "Kamera aktív. Olvasd be a termék bárkódját." : "Kamera aktív. Beolvasás után keresés indul.");
        return;
      } catch (error) {
        stopCameraScanner(false);
        setScannerStatus(error instanceof Error ? error.message : "A kamera indítása nem sikerült.");
      }
    }

    try {
      const zxing = await loadInventoryZxingBrowser();
      const Reader = zxing?.BrowserMultiFormatReader || zxing?.BrowserMultiFormatOneDReader;
      if (!Reader || !videoElement) throw new Error("Ez a böngésző nem támogatja a kamerás bárkódolvasást.");
      const reader = new Reader();
      const controls = await reader.decodeFromConstraints?.(INVENTORY_BARCODE_VIDEO_CONSTRAINTS, videoElement, (result) => {
        const code = zxingResultText(result);
        if (!code || pendingScanRef.current || scannerHandlingRef.current) return;
        scannerHandlingRef.current = true;
        handleBarcodeCandidate(code, "camera");
        window.setTimeout(() => { scannerHandlingRef.current = false; }, 700);
      });
      scannerZxingControlsRef.current = controls || null;
      setScannerStatus(activeRef.current ? "Kamera aktív. Olvasd be a termék bárkódját." : "Kamera aktív. Beolvasás után keresés indul.");
    } catch (error) {
      stopCameraScanner(false);
      setScannerStatus(error instanceof Error ? error.message : "A kamera-bárkódolvasás nem indítható. A kézi mező marad, mert a civilizáció tartalékterve." );
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "A kamera-bárkódolvasás nem indítható. Használd a kézi / bluetooth mezőt." });
    }
  }

  function printPdf(mode: PrintMode) {
    if (!active) return;
    const rows = filteredLines.length ? filteredLines : active.lines;
    const locationName = active.item.location_name || currentLocation?.name || "-";
    const isResult = mode === "result";
    const titleText = isResult ? `Leltár eredmény - ${active.item.code}` : `Leltárív - ${active.item.code}`;
    const subtitle = `${locationName} · ${formatDateTime(active.item.started_at || active.item.created_at)}`;
    const tableRows = rows.map((line, index) => {
      const draft = drafts[line.id];
      const counted = draftCountedValue(draft);
      const diff = counted === null ? null : counted - n(line.expected_qty);
      const image = getImageSrc(line);
      const badge = diff === null ? "" : diff < 0 ? "HIÁNY" : diff > 0 ? "TÖBBLET" : "OK";
      const badgeClass = diff === null ? "" : diff < 0 ? "red" : diff > 0 ? "green" : "ok";
      return `<tr>
        <td class="center">${index + 1}</td>
        <td>${image ? `<img src="${escapeHtml(image)}" />` : ""}</td>
        <td><strong>${escapeHtml(productTitle(line))}</strong><br/><span>${escapeHtml(line.brand_name || "")} ${escapeHtml(line.category_name_ro || "")}</span><br/><span>Vonalkód: ${escapeHtml(line.display_barcode || line.barcode || "-")}</span></td>
        <td>${escapeHtml(line.color_name || line.color_code || "-")}</td>
        <td class="center">${escapeHtml(line.size || "-")}</td>
        ${isResult ? `<td class="right">${formatQty(line.expected_qty)}</td><td class="right">${counted === null ? "-" : formatQty(counted)}</td><td class="right ${diff && diff < 0 ? "neg" : diff && diff > 0 ? "pos" : ""}">${diff === null ? "-" : (diff > 0 ? "+" : "") + formatQty(diff)}</td><td><span class="badge ${badgeClass}">${badge}</span></td><td class="right">${formatMoney((diff || 0) * n(line.sell_price))}</td>` : `<td class="manual"></td><td class="check"></td><td class="note"></td>`}
      </tr>`;
    }).join("");
    const summary = isResult ? `<div class="summary">
      <div><b>Rendszer szerint:</b> ${formatQty(activeStats.expected)} db</div>
      <div><b>Számolt:</b> ${formatQty(activeStats.counted)} db</div>
      <div><b>Hiány:</b> ${formatQty(activeStats.missing)} db</div>
      <div><b>Többlet:</b> ${formatQty(activeStats.extra)} db</div>
      <div><b>Eltérés eladási értéken:</b> ${formatMoney(activeStats.diffSell)} RON</div>
    </div>` : `<div class="summary"><div><b>Sorok:</b> ${rows.length}</div><div><b>Helyszín:</b> ${escapeHtml(locationName)}</div><div><b>Megjegyzés:</b> ${escapeHtml(active.item.note || "")}</div></div>`;

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(titleText)}</title><style>
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
      header { display:flex; justify-content:space-between; gap:16px; border-bottom:2px solid #111827; padding-bottom:10px; margin-bottom:12px; }
      h1 { font-size:20px; margin:0 0 4px; }
      .muted, span { color:#6b7280; font-size:11px; }
      .summary { display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; margin: 10px 0 12px; font-size:11px; }
      .summary div { border:1px solid #d1d5db; border-radius:8px; padding:8px; }
      table { width:100%; border-collapse: collapse; font-size:10px; }
      th { background:#1f2937; color:white; text-align:left; padding:7px; border:1px solid #1f2937; }
      td { padding:6px; border:1px solid #d1d5db; vertical-align:middle; }
      img { width:34px; height:42px; object-fit:contain; border:1px solid #d1d5db; border-radius:6px; background:#fff; }
      .center { text-align:center; } .right { text-align:right; }
      .manual { height:28px; width:62px; } .check { width:48px; } .note { width:120px; }
      .badge { display:inline-block; min-width:45px; border-radius:999px; padding:3px 7px; color:white; font-weight:700; text-align:center; }
      .badge.red { background:#dc2626; } .badge.green { background:#2a8d8b; } .badge.ok { background:#374151; }
      .neg { color:#dc2626; font-weight:700; } .pos { color:#047857; font-weight:700; }
      footer { display:grid; grid-template-columns: repeat(3, 1fr); gap:18px; margin-top:20px; font-size:11px; }
      footer div { border-top:1px solid #111827; padding-top:6px; text-align:center; }
    </style></head><body>
      <header><div><h1>${escapeHtml(titleText)}</h1><div class="muted">${escapeHtml(subtitle)}</div></div><div class="muted">Nyomtatva: ${escapeHtml(formatDateTime(new Date().toISOString()))}</div></header>
      ${summary}
      <table><thead><tr>
        <th>#</th><th>Kép</th><th>Termék</th><th>Szín</th><th>Méret</th>
        ${isResult ? "<th>Rendszer</th><th>Talált</th><th>Eltérés</th><th>Állapot</th><th>Érték RON</th>" : "<th>Talált db</th><th>Pipa</th><th>Megjegyzés</th>"}
      </tr></thead><tbody>${tableRows}</tbody></table>
      <footer><div>Számolta</div><div>Ellenőrizte</div><div>Bevezette</div></footer>
      <script>window.onload = () => { window.focus(); setTimeout(() => window.print(), 250); };</script>
    </body></html>`;
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  const messageClass = message?.tone === "error"
    ? "border-red-300/35 bg-red-500/12 text-red-50"
    : message?.tone === "success"
      ? "border-[#2a8d8b]/45 bg-[#2a8d8b]/14 text-white"
      : "border-white/14 bg-white/[0.06] text-white/78";

  return (
    <div className={page}>
      <div className={shell}>
        <header className="sticky top-2 z-40 rounded-[28px] border border-white/20 bg-[#303a4c]/95 p-3 shadow-[0_16px_36px_rgba(15,23,42,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.05] backdrop-blur">
          <div className="absolute left-3 top-3 bottom-3 w-1 rounded-full bg-[#7bd7d4] opacity-90" />
          <div className="pl-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#9ee4e2]/80">AllInFashion</p>
                <h1 className="mt-0.5 truncate text-lg leading-tight text-white">Leltár mobil</h1>
                <p className="mt-0.5 text-[11px] text-white/78">
                  {active ? `${formatQty(activeStats.countedLines)} / ${formatQty(activeStats.lines)} sor · ${formatQty(activeStats.counted)} / ${formatQty(activeStats.expected)} db` : `${formatQty(stockStats.lines)} készletsor · ${currentLocation?.name || "válassz helyet"}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {active && <button className={headerIconBtn} type="button" onClick={() => printPdf("result")} title="Eredmény PDF"><Download size={16} /></button>}
                {active && <button className={headerIconBtnActive} type="button" onClick={() => void saveLines()} disabled={saving || !canEditActive} title="Mentés"><Save size={16} /></button>}
                <button className={headerIconBtn} type="button" onClick={() => void refresh(true)} disabled={loading || saving} title="Frissítés"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
                <button className={headerIconBtn} type="button" onClick={goHome} title="Kezdőlap"><Home size={16} /></button>
              </div>
            </div>

            {active && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full bg-[#2a8d8b] shadow-[0_0_14px_rgba(42,141,139,0.65)]" style={{ width: `${Math.min(100, Math.max(0, activeStats.progress))}%` }} />
              </div>
            )}

            <div className="mt-3 grid grid-cols-[1fr_44px] gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/42" size={17} />
                <input
                  ref={searchInputRef}
                  className={`${input} pl-10 pr-9`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Termék, márka, vonalkód"
                />
                {search && (
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/48 hover:bg-white/10 hover:text-white" onClick={() => setSearch("")}> <X size={15} /> </button>
                )}
              </div>
              <button className={headerIconBtnActive} type="button" onClick={startCameraScanner} title="Bárkód scanner"><Barcode size={18} /></button>
            </div>
          </div>
        </header>

        {message ? <div className={`rounded-2xl border px-3 py-2 text-sm ${messageClass}`}>{message.text}</div> : null}

        {!active ? (
          <>
            <section className={card}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#9ee4e2]">Leltár előkészítés</p>
                  <h2 className="mt-1 text-base text-white">Indíts vagy folytass leltárt</h2>
                  <p className="mt-1 text-xs text-white/62">Helyszín, keresés, majd indulhat a számolás. Mobilon itt végre nem táblázat-szatyor van.</p>
                </div>
                <span className="rounded-2xl border border-[#7bd7d4]/30 bg-[#2a8d8b]/16 p-2 text-[#d7fffe]"><ClipboardCheck size={20} /></span>
              </div>

              <div className="mt-3 grid gap-3">
                <label className={label}>Üzlet / helyszín
                  <select className={select} value={location} onChange={(event) => { setLocation(event.target.value); setActive(null); setDrafts({}); }}>
                    {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                </label>
                <label className={label}>Leltár címe
                  <input className={input} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Pl. Júliusi üzlet leltár" />
                </label>
                <label className={label}>Megjegyzés
                  <input className={input} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Pl. ellenőrző leltár" />
                </label>
                <button className={primaryBtn} type="button" onClick={createCount} disabled={saving || !location}><ClipboardCheck size={16} /> Új leltár indítása</button>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-2">
              <MiniStat label={sourceLabel(currentLocation)} value={currentLocation?.name || "-"} hint="kiválasztott hely" tone="blue" />
              <MiniStat label="Készletsor" value={formatQty(stockStats.lines)} hint={`${formatQty(stockStats.qty)} db`} />
              <MiniStat label="Elérhető" value={formatQty(stockStats.available)} hint="készlet mínusz foglalt" tone="green" />
              <MiniStat label="Érték" value={`${formatMoney(stockStats.sellValue)} RON`} hint="eladási értéken" />
            </section>

            <section className={card}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">Korábbi leltárak</p>
                  <p className="mt-1 text-sm text-white">{formatQty(counts.length)} leltár ehhez a helyhez</p>
                </div>
                <button className={softBtn} type="button" onClick={() => setCountsOpen(true)}><ClipboardCheck size={15} /> Megnyitás</button>
              </div>
              <div className="mt-3 grid gap-2">
                {counts.slice(0, 3).map((count) => {
                  const selected = active?.item.id === count.id;
                  const valueSnapshot = selected ? { countedSellValue: activeStats.countedSellValue, expectedSellValue: activeStats.expectedSellValue } : countValueCache[count.id];
                  return (
                  <button key={count.id} type="button" onClick={() => loadCount(count.id)} className={`rounded-2xl border p-3 text-left transition ${selected ? "border-[#9ee4e2]/70 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.06] hover:bg-white/[0.10]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{count.title}</p>
                        <p className="mt-1 text-[11px] text-white/52">{count.code} · {formatDateTime(count.created_at)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] ${count.status === "committed" ? "bg-[#2a8d8b] text-white" : "bg-white/[0.10] text-white/75"}`}>{statusLabel(count.status)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-white/64">
                      <span><b className="block text-white">{formatQty(count.line_count)}</b>sor</span>
                      <span><b className="block text-white">{formatQty(count.counted_lines)}</b>számolt</span>
                      <span><b className={selected ? "block text-white" : n(count.diff_qty) < 0 ? "block text-red-200" : n(count.diff_qty) > 0 ? "block text-emerald-200" : "block text-white"}>{n(count.diff_qty) > 0 ? "+" : ""}{formatQty(count.diff_qty)}</b>eltérés</span>
                    </div>
                    <div className={`mt-2 rounded-xl border px-2.5 py-2 ${selected ? "border-white/25 bg-white/12" : "border-[#7bd7d4]/20 bg-[#2a8d8b]/10"}`}>
                      <div className="text-[10px] text-white/50">Számolt eladási érték</div>
                      <div className="mt-0.5 text-sm font-semibold text-white">{valueSnapshot ? `${formatMoney(valueSnapshot.countedSellValue)} RON` : "Betöltés..."}</div>
                    </div>
                  </button>
                  );
                })}
                {!counts.length && <p className="rounded-2xl border border-white/12 bg-white/[0.05] px-3 py-5 text-center text-sm text-white/62">Ehhez a helyszínhez még nincs leltár.</p>}
              </div>
            </section>

            <section className={card}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">Aktuális készlet</p>
                  <p className="mt-1 text-sm text-white">{formatQty(filteredStockRows.length)} sor előnézet</p>
                </div>
                <button className={softBtn} type="button" onClick={() => setFiltersOpen(true)}><Filter size={15} /> Szűrő</button>
              </div>
              <div className="grid gap-2">
                {filteredStockRows.slice(0, 12).map((row) => {
                  const img = getImageSrc(row);
                  return (
                    <div key={`${row.location_id}-${row.variant_id}`} className="rounded-2xl border border-white/12 bg-white/[0.055] p-2.5">
                      <div className="grid grid-cols-[58px_1fr_auto] gap-2">
                        <ProductImage src={img} title={productTitle(row)} onPreview={() => setImagePreview({ src: img, title: productTitle(row) })} />
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9ee4e2]">{row.brand_name || "-"}</p>
                          <p className="mt-0.5 line-clamp-2 text-sm text-white">{productTitle(row)}</p>
                          <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-white/68">
                            <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5">{row.color_name || row.color_code || "-"}</span>
                            <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5">{row.size || "-"}</span>
                            <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5">{row.display_barcode || row.barcode || "-"}</span>
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="text-white/45">Készlet</div>
                          <div className="text-lg text-white">{formatQty(row.qty)}</div>
                          <div className="text-[#9ee4e2]">{formatQty(row.available_qty)} elérhető</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!filteredStockRows.length && <p className="rounded-2xl border border-white/12 bg-white/[0.05] px-3 py-5 text-center text-sm text-white/62">Nincs készlet a szűrés alapján.</p>}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="rounded-[26px] border border-[#7bd7d4]/25 bg-[#2a8d8b]/12 p-3 shadow-lg shadow-black/10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#9ee4e2]">Aktív leltár</p>
                  <h2 className="mt-1 truncate text-lg text-white">{active.item.title}</h2>
                  <p className="mt-1 text-xs text-white/64">{active.item.location_name || currentLocation?.name || "-"} · {statusLabel(active.item.status)}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${active.item.status === "committed" ? "border-[#7bd7d4]/45 bg-[#2a8d8b] text-white" : "border-white/14 bg-white/[0.09] text-white/75"}`}>{activeStats.progress}%</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[11px]">
                <div className="rounded-xl bg-white/[0.07] p-2"><div className="text-white/46">Rendszer</div><div className="font-semibold text-white">{formatQty(activeStats.expected)}</div></div>
                <div className="rounded-xl bg-white/[0.07] p-2"><div className="text-white/46">Talált</div><div className="font-semibold text-white">{formatQty(activeStats.counted)}</div></div>
                <div className="rounded-xl bg-red-500/10 p-2"><div className="text-white/46">Hiány</div><div className="font-semibold text-red-100">{formatQty(activeStats.missing)}</div></div>
                <div className="rounded-xl bg-[#2a8d8b]/14 p-2"><div className="text-white/46">Többlet</div><div className="font-semibold text-emerald-100">{formatQty(activeStats.extra)}</div></div>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-2xl border border-[#7bd7d4]/35 bg-[#2a8d8b]/18 px-3 py-2.5">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-white/55">Számolt eladási érték</p>
                  <p className="mt-0.5 text-xs text-white/46">Rendszerérték: {formatMoney(activeStats.expectedSellValue)} RON</p>
                </div>
                <strong className="text-base text-white">{formatMoney(activeStats.countedSellValue)} RON</strong>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className={primaryBtn} type="button" onClick={startCameraScanner} disabled={!canEditActive}><Barcode size={15} /> Kamera</button>
                <button className={softBtn} type="button" onClick={() => printPdf("sheet")}><Download size={15} /> Leltárív</button>
                <button className={softBtn} type="button" onClick={() => void saveLines()} disabled={saving || !canEditActive}><Save size={15} /> Mentés</button>
                <button className={primaryBtn} type="button" onClick={commitCount} disabled={saving || !canEditActive || !activeStats.complete}><CheckCircle2 size={15} /> Bevezetés</button>
              </div>
            </section>

            <section className={card}>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {([
                  ["all", "Minden"],
                  ["uncounted", "Nincs"],
                  ["ok", "Egyezik"],
                  ["missing", "Hiány"],
                  ["extra", "Többlet"],
                ] as [LineFilter, string][]).map(([key, text]) => (
                  <button key={key} type="button" className={lineFilter === key ? chipActive : chipIdle} onClick={() => setLineFilter(key)}>{text}</button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className={softBtn} type="button" onClick={setVisibleToExpected} disabled={!canEditActive}>Látható = rendszer</button>
                <button className={softBtn} type="button" onClick={clearVisible} disabled={!canEditActive}>Látható ürítés</button>
              </div>
            </section>

            <section ref={inventoryLinesTopRef} className="grid gap-2" style={{ scrollMarginTop: 96 }}>
              {visibleLines.map((line) => {
                const diff = lineDiff(line, drafts);
                const img = getImageSrc(line);
                const counted = drafts[line.id]?.countedQty || "";
                const diffClass = diff === null ? "text-white/45" : diff < 0 ? "text-red-200" : diff > 0 ? "text-emerald-200" : "text-white";
                return (
                  <div key={line.id} className="rounded-[24px] border border-white/14 bg-white/[0.055] p-2.5 shadow-sm shadow-black/10">
                    <div className="grid grid-cols-[76px_1fr_auto] gap-2">
                      <ProductImage src={img} title={productTitle(line)} onPreview={() => setImagePreview({ src: img, title: productTitle(line) })} />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9ee4e2]">{line.brand_name || "-"}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-white">{productTitle(line)}</p>
                        <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-white/68">
                          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5">{line.color_name || line.color_code || "-"}</span>
                          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5">{line.size || "-"}</span>
                          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5">{line.display_barcode || line.barcode || "-"}</span>
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-white/45">Rendszer</div>
                        <div className="text-lg font-semibold text-white">{formatQty(line.expected_qty)}</div>
                        <div className={`font-semibold ${diffClass}`}>{diff === null ? "-" : signedQty(diff)}</div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-[44px_1fr_44px] gap-2">
                      <button className="h-11 rounded-2xl border border-white/14 bg-white/[0.08] text-xl text-white disabled:opacity-40" type="button" disabled={!canEditActive} onClick={() => incrementLine(line.id, -1)}><Minus className="mx-auto" size={16} /></button>
                      <input className="h-11 w-full rounded-2xl border border-white/18 bg-[#202a3a] px-3 text-center text-lg font-semibold text-white outline-none focus:border-[#2a8d8b]/70" disabled={!canEditActive} inputMode="numeric" value={counted} onChange={(event) => updateDraft(line.id, { countedQty: event.target.value.replace(/[^0-9]/g, "") })} placeholder="Talált" />
                      <button className="h-11 rounded-2xl border border-white/14 bg-white/[0.08] text-xl text-white disabled:opacity-40" type="button" disabled={!canEditActive} onClick={() => incrementLine(line.id, 1)}><Plus className="mx-auto" size={16} /></button>
                    </div>

                    <input className="mt-2 h-10 w-full rounded-2xl border border-white/14 bg-white/[0.06] px-3 text-xs text-white outline-none placeholder:text-white/38 focus:border-[#7bd7d4]/55" disabled={!canEditActive} value={drafts[line.id]?.note || ""} onChange={(event) => updateDraft(line.id, { note: event.target.value })} placeholder="Megjegyzés, hiány oka, sérülés..." />
                  </div>
                );
              })}
              {!filteredLines.length ? <div className="rounded-2xl border border-white/14 bg-white/[0.05] p-4 text-center text-sm text-white/62">Nincs találat a jelenlegi szűrésre.</div> : null}
              {filteredLines.length > 0 && (
                <div className="mt-1 rounded-[22px] border border-white/14 bg-[#303a4c] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-white/55">{((linePage - 1) * linePageSize + 1).toLocaleString("hu-HU")}–{Math.min(linePage * linePageSize, filteredLines.length).toLocaleString("hu-HU")} / {filteredLines.length.toLocaleString("hu-HU")}</span>
                    <span className="text-[11px] text-white/55">{linePage} / {lineTotalPages}. oldal</span>
                  </div>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {([20, 50, 100] as const).map((size) => (
                        <button key={size} type="button" className={linePageSize === size ? chipActive : chipIdle} onClick={() => setLinePageSize(size)}>{size}</button>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <button className={iconBtn} type="button" disabled={linePage <= 1} onClick={() => changeLinePage(linePage - 1)}><ChevronLeft size={18} /></button>
                      <button className={iconBtn} type="button" disabled={linePage >= lineTotalPages} onClick={() => changeLinePage(linePage + 1)}><ChevronRight size={18} /></button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-3 z-50 px-3">
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-2 rounded-[24px] border border-white/16 bg-[#303a4c]/95 p-2 shadow-2xl shadow-black/35 backdrop-blur">
          <button className={softBtn} type="button" onClick={() => setFiltersOpen(true)}><Filter size={15} /> Szűrő</button>
          <button className={active ? primaryBtn : softBtn} type="button" onClick={active ? startCameraScanner : createCount} disabled={active ? !canEditActive : saving || !location}>{active ? <Barcode size={15} /> : <ClipboardCheck size={15} />} {active ? "Kamera" : "Új"}</button>
          <button className={softBtn} type="button" onClick={() => active ? void saveLines() : setCountsOpen(true)} disabled={active ? saving || !canEditActive : false}>{active ? <Save size={15} /> : <ClipboardCheck size={15} />} {active ? "Ment" : "Lista"}</button>
          <button className={active ? primaryBtn : softBtn} type="button" onClick={active ? commitCount : () => void refresh(true)} disabled={active ? saving || !canEditActive || !activeStats.complete : loading}>{active ? <CheckCircle2 size={15} /> : <RefreshCw size={15} />} {active ? "Kész" : "Friss"}</button>
        </div>
      </div>

      {filtersOpen && (
        <>
          <MobileBackdrop onClose={() => setFiltersOpen(false)} />
          <div className={sheetPanel}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#9ee4e2]">Szűrés</p>
                <h2 className="mt-1 text-lg text-white">Mit számoljunk?</h2>
              </div>
              <button className={iconBtn} type="button" onClick={() => setFiltersOpen(false)}><X size={18} /></button>
            </div>
            <div className="grid gap-3">
              <label className={label}>Helyszín
                <select className={select} value={location} onChange={(event) => { setLocation(event.target.value); setActive(null); setDrafts({}); }}>
                  {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
              </label>
              <label className={label}>Keresés
                <input className={input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Termék, márka, vonalkód" />
              </label>
              <label className={label}>Kategória
                <select className={select} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">Minden kategória</option>
                  {categories.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </label>
              {active && (
                <label className={label}>Sor állapot
                  <select className={select} value={lineFilter} onChange={(event) => setLineFilter(event.target.value as LineFilter)}>
                    <option value="all">Minden sor</option>
                    <option value="uncounted">Nincs számolva</option>
                    <option value="ok">Egyezik</option>
                    <option value="missing">Hiány</option>
                    <option value="extra">Többlet</option>
                  </select>
                </label>
              )}
              <button className={primaryBtn} type="button" onClick={() => setFiltersOpen(false)}><CheckCircle2 size={15} /> Alkalmaz</button>
              <button className={softBtn} type="button" onClick={() => { setSearch(""); setCategoryFilter("all"); setLineFilter("all"); }}><X size={15} /> Szűrők törlése</button>
              {active && canEditActive && <button className={dangerBtn} type="button" onClick={deleteCount}><Trash2 size={15} /> Aktív leltár törlése</button>}
            </div>
          </div>
        </>
      )}

      {countsOpen && (
        <>
          <MobileBackdrop onClose={() => setCountsOpen(false)} />
          <div className={sheetPanel}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#9ee4e2]">Leltár lista</p>
                <h2 className="mt-1 text-lg text-white">Korábbi / nyitott leltárak</h2>
              </div>
              <button className={iconBtn} type="button" onClick={() => setCountsOpen(false)}><X size={18} /></button>
            </div>
            <div className="grid gap-2">
              {visibleCounts.map((count) => {
                const selected = active?.item.id === count.id;
                const valueSnapshot = selected ? { countedSellValue: activeStats.countedSellValue, expectedSellValue: activeStats.expectedSellValue } : countValueCache[count.id];
                const progress = Math.max(0, Math.min(100, n(count.line_count) ? (n(count.counted_lines) / n(count.line_count)) * 100 : 0));
                return (
                  <button key={count.id} type="button" onClick={() => { setCountsOpen(false); void loadCount(count.id); }} className={`rounded-2xl border p-3 text-left transition ${selected ? "border-[#9ee4e2]/70 bg-[#2a8d8b]" : "border-white/14 bg-white/[0.06] hover:border-[#7bd7d4]/30 hover:bg-white/[0.10]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{count.title}</p>
                        <p className={`mt-1 text-[11px] ${selected ? "text-white/72" : "text-white/52"}`}>{count.code} · {formatDateTime(count.created_at)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${selected ? "border-white/30 bg-white/14 text-white" : count.status === "committed" ? "border-[#7bd7d4]/30 bg-[#2a8d8b]/28 text-white" : "border-white/10 bg-white/[0.10] text-white/75"}`}>{statusLabel(count.status)}</span>
                    </div>
                    <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${selected ? "bg-white/20" : "bg-slate-950/30"}`}><div className={selected ? "h-full rounded-full bg-white" : "h-full rounded-full bg-[#63d8d3]"} style={{ width: `${progress}%` }} /></div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] text-white/60">
                      <span><b className="block text-sm text-white">{formatQty(count.line_count)}</b>sor</span>
                      <span><b className="block text-sm text-white">{formatQty(count.counted_lines)}</b>számolt</span>
                      <span><b className={selected ? "block text-sm text-white" : n(count.diff_qty) < 0 ? "block text-sm text-red-200" : n(count.diff_qty) > 0 ? "block text-sm text-emerald-200" : "block text-sm text-white"}>{n(count.diff_qty) > 0 ? "+" : ""}{formatQty(count.diff_qty)}</b>eltérés</span>
                    </div>
                    <div className={`mt-2 flex items-center justify-between rounded-xl border px-2.5 py-2 ${selected ? "border-white/25 bg-white/12" : "border-[#7bd7d4]/20 bg-[#2a8d8b]/10"}`}>
                      <span className="text-[10px] text-white/52">Számolt érték</span>
                      <strong className="text-sm text-white">{valueSnapshot ? `${formatMoney(valueSnapshot.countedSellValue)} RON` : "Betöltés..."}</strong>
                    </div>
                  </button>
                );
              })}
              {!counts.length && <p className="rounded-2xl border border-white/12 bg-white/[0.05] px-3 py-5 text-center text-sm text-white/62">Nincs mentett leltár ezen a helyen.</p>}
            </div>
            {counts.length > countsPageSize ? (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                <button className={iconBtn} type="button" disabled={countsPage <= 1} onClick={() => setCountsPage((value) => Math.max(1, value - 1))}><ChevronLeft size={18} /></button>
                <span className="text-xs text-white/58">{countsPage} / {countsTotalPages}. oldal · 10 / oldal</span>
                <button className={iconBtn} type="button" disabled={countsPage >= countsTotalPages} onClick={() => setCountsPage((value) => Math.min(countsTotalPages, value + 1))}><ChevronRight size={18} /></button>
              </div>
            ) : null}
          </div>
        </>
      )}

      {scannerOpen && (
        <div className="fixed inset-0 z-[80] overflow-auto bg-[#202838] text-white">
          <div className="sticky top-0 z-10 border-b border-white/12 bg-[#303a4c]/95 p-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#9ee4e2]">Bárkód scanner</p>
                <h2 className="text-lg text-white">{active ? "Leltár számolás" : "Keresés vonalkóddal"}</h2>
              </div>
              <button className={iconBtn} type="button" onClick={() => stopCameraScanner(true)}><X size={18} /></button>
            </div>
          </div>

          <div className="space-y-3 p-3 pb-24">
            <div className="overflow-hidden rounded-[24px] border border-white/14 bg-black/35">
              <video ref={scannerVideoRef} className="aspect-video w-full object-cover" muted playsInline />
              <div className="border-t border-white/10 px-3 py-2 text-xs text-white/62">Tartsd stabilan a kamerát, és igazítsd a vonalkódot középre.</div>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); submitManualBarcode(); }}>
              <input ref={manualBarcodeInputRef} className={`${input} text-base`} value={manualBarcode} onChange={(event) => handleManualBarcodeInput(event.target.value)} placeholder="Olvasd be a bárkódot…" autoComplete="off" inputMode="numeric" />
            </form>

            {pendingLine && pendingScan ? (
              <div className="rounded-[26px] border border-[#7bd7d4]/45 bg-[#2a8d8b]/14 p-3">
                <div className="grid grid-cols-[84px_1fr] gap-3">
                  <ProductImage src={getImageSrc(pendingLine)} title={productTitle(pendingLine)} size="large" onPreview={() => setImagePreview({ src: getImageSrc(pendingLine), title: productTitle(pendingLine) })} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-[#7bd7d4]/35 bg-[#2a8d8b]/22 px-2.5 py-1 text-[11px] text-[#d7fffe]">Találat</span>
                      <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] text-white/65">{pendingScan.code}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-base text-white">{productTitle(pendingLine)}</p>
                    <p className="mt-1 text-xs text-white/64">{pendingLine.brand_name || "-"} · {pendingLine.color_name || pendingLine.color_code || "-"} · {pendingLine.size || "-"}</p>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                      <div className="rounded-xl bg-white/[0.08] p-1.5"><div className="text-white/45">Volt</div><div>{formatQty(draftCountedValue(drafts[pendingLine.id]) ?? 0)}</div></div>
                      <div className="rounded-xl bg-white/[0.08] p-1.5"><div className="text-white/45">+ db</div><div>{formatQty(pendingScan.qty)}</div></div>
                      <div className="rounded-xl bg-white/[0.08] p-1.5"><div className="text-white/45">Utána</div><div>{formatQty((draftCountedValue(drafts[pendingLine.id]) ?? 0) + pendingScan.qty)}</div></div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-[48px_1fr_48px] gap-2">
                  <button className={softBtn} type="button" onClick={() => changePendingQty(-1)} disabled={pendingScan.qty <= 1}><Minus size={16} /></button>
                  <div className="grid place-items-center rounded-2xl border border-white/14 bg-[#202a3a] text-center text-3xl font-semibold text-white">{pendingScan.qty}</div>
                  <button className={softBtn} type="button" onClick={() => changePendingQty(1)}><Plus size={16} /></button>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <button className={primaryBtn} type="button" onClick={applyPendingScan}><CheckCircle2 size={15} /> Hozzáadás</button>
                  <button className={dangerBtn} type="button" onClick={clearPendingScan}><X size={15} /> Mégse</button>
                </div>
              </div>
            ) : (
              <div className="grid min-h-[160px] place-items-center rounded-[24px] border border-dashed border-white/16 bg-white/[0.04] p-4 text-center">
                <div>
                  <Barcode className="mx-auto text-white/38" size={42} />
                  <p className="mt-3 text-base text-white">Várja a beolvasást</p>
                </div>
              </div>
            )}

            {scannerStatus ? <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white/78">{scannerStatus}</div> : null}
          </div>
        </div>
      )}

      {imagePreview && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/72 p-4 backdrop-blur-sm" onClick={() => setImagePreview(null)}>
          <div className="w-full max-w-sm rounded-[28px] border border-white/22 bg-white p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <img src={imagePreview.src} alt="" className="max-h-[72vh] w-full rounded-2xl bg-white object-contain" />
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm text-slate-700">{imagePreview.title}</p>
              <button className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700" type="button" onClick={() => setImagePreview(null)}>Bezárás</button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog ? (
        <div className="fixed inset-0 z-[95] grid place-items-center p-4">
          <button type="button" aria-label="Megerősítés bezárása" className="absolute inset-0 bg-black/62 backdrop-blur-sm" onClick={() => !saving && setConfirmDialog(null)} />
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/18 bg-[#404a5b] text-white shadow-2xl">
            <div className="border-b border-white/12 bg-[#4b5362] px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Megerősítés</p>
              <h2 className="mt-1 text-lg text-white">{confirmDialog.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-white/72">{confirmDialog.description}</p>
            </div>
            {confirmDialog.details?.length ? (
              <div className="m-4 rounded-2xl border border-white/14 bg-[#303a4c] p-3">
                <div className="grid gap-2 text-sm text-white/78">
                  {confirmDialog.details.map((item) => (
                    <div key={item} className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${confirmDialog.tone === "red" ? "bg-red-400" : "bg-[#2a8d8b]"}`} /><span>{item}</span></div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-[#354153] px-4 py-4">
              <button className={softBtn} type="button" onClick={() => setConfirmDialog(null)} disabled={saving}>Mégse</button>
              <button className={confirmDialog.tone === "red" ? dangerBtn : primaryBtn} type="button" onClick={confirmDialogAction} disabled={saving}>{confirmDialog.tone === "red" ? <Trash2 size={15} /> : <CheckCircle2 size={15} />} {confirmDialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/14 bg-[#263247] px-4 py-2 text-xs text-white shadow-lg">Betöltés...</div> : null}
    </div>
  );
}
