import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ImageOff,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  UploadCloud,
  X,
} from "lucide-react";
import { AIF_SHOPIFY_ICON_URL } from "./ShopifyStatusIcon";

type ExportItem = {
  variant_id: string;
  title_ro?: string | null;
  shopify_title?: string | null;
  brand_name?: string | null;
  color_name?: string | null;
  color_code?: string | null;
  size?: string | null;
  barcode?: string | null;
  image_url?: string | null;
  available_qty?: number | string | null;
  total_qty?: number | string | null;
  shopify_mapped?: boolean | null;
};

type PreviewItem = {
  variantId: string;
  modelId: string;
  title?: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  availableQty?: number | string | null;
  mapped?: boolean | null;
  state: "valid" | "invalid" | "skipped_mapped" | string;
  errors: string[];
  warnings: string[];
};

type GroupingMode = "model_colors" | "product_code";

type Preview = {
  ok: true;
  selectionMode: "selected_variants" | "all_model_variants";
  productStatus: "draft" | "active";
  groupingMode: GroupingMode;
  location: { id?: string | null; name: string };
  summary: {
    selectedVariantCount: number;
    groupingMode?: GroupingMode;
    allInModelCount?: number;
    modelCount: number;
    validModelCount: number;
    variantCount: number;
    validVariantCount: number;
    invalidVariantCount: number;
    skippedMappedCount: number;
    warningCount: number;
    totalAvailableQty: number;
    locationName: string;
  };
  items: PreviewItem[];
};

type CreateResult = {
  ok: true;
  exportId: string;
  fileName: string;
  downloadUrl: string;
  summary: Preview["summary"];
  location: Preview["location"];
  productRows: number;
  inventoryRows?: number;
  stockMode?: string;
};

type ExportHistoryItem = {
  id: string;
  status: "prepared" | "downloaded" | "partially_mapped" | "mapped" | "error" | string;
  selection_mode?: string | null;
  product_status?: string | null;
  shopify_location_name?: string | null;
  model_count?: number | string | null;
  variant_count?: number | string | null;
  valid_variant_count?: number | string | null;
  invalid_variant_count?: number | string | null;
  warning_count?: number | string | null;
  created_by?: string | null;
  created_at?: string | null;
  downloaded_at?: string | null;
  reconciled_at?: string | null;
};

const field = "h-10 rounded-xl border border-white/16 bg-[#303a4c] px-3 text-sm text-white outline-none focus:border-[#77d8d4]/55";
const softButton = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/16 bg-white/[0.07] px-3 text-xs text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45";
const primaryButton = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#77d8d4]/45 bg-[#2a8d8b] px-3 text-xs text-white transition hover:bg-[#319c99] disabled:cursor-not-allowed disabled:opacity-45";

function n(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function title(item: ExportItem) {
  return String(item.shopify_title || item.title_ro || "Névtelen termék").trim();
}

function dateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function exportStatusLabel(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "prepared") return "Előkészítve";
  if (status === "downloaded") return "Letöltve, importálásra vár";
  if (status === "partially_mapped") return "Részben párosítva";
  if (status === "mapped") return "Párosítva";
  if (status === "error") return "Hibás";
  return status || "Ismeretlen";
}

function exportStatusClass(value?: string | null) {
  const status = String(value || "").toLowerCase();
  if (status === "mapped") return "border-emerald-300/30 bg-emerald-400/12 text-emerald-50";
  if (status === "partially_mapped" || status === "downloaded" || status === "prepared") return "border-amber-300/30 bg-amber-300/12 text-amber-50";
  if (status === "error") return "border-rose-300/30 bg-rose-400/12 text-rose-50";
  return "border-white/15 bg-white/[0.06] text-white/70";
}

async function requestJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data as T;
}

export default function ShopifyProductExportModal({
  open,
  items,
  onClose,
  onChanged,
}: {
  open: boolean;
  items: ExportItem[];
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [selectionMode, setSelectionMode] = useState<"selected_variants" | "all_model_variants">("all_model_variants");
  const [productStatus, setProductStatus] = useState<"draft" | "active">("active");
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("model_colors");
  const [includeMapped, setIncludeMapped] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreateResult | null>(null);
  const [reconcileMessage, setReconcileMessage] = useState("");
  const [exports, setExports] = useState<ExportHistoryItem[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [reconcilingExportId, setReconcilingExportId] = useState("");

  const variantIds = useMemo(
    () => Array.from(new Set((items || []).map((item) => String(item.variant_id || "").trim()).filter(Boolean))),
    [items]
  );
  const variantKey = variantIds.join("|");

  async function loadHistory() {
    setHistoryBusy(true);
    try {
      const result = await requestJSON<{ ok: true; items: ExportHistoryItem[] }>("/api/aif/shopify/product-exports?limit=12");
      setExports(Array.isArray(result?.items) ? result.items : []);
    } catch {
      setExports([]);
    } finally {
      setHistoryBusy(false);
    }
  }

  async function loadPreview() {
    if (!variantIds.length) {
      setPreview(null);
      setError("Nincs Shopify exporthoz kijelölt termék.");
      return;
    }
    setPreviewBusy(true);
    setError("");
    setReconcileMessage("");
    try {
      const result = await requestJSON<Preview>("/api/aif/shopify/product-exports/preview", {
        method: "POST",
        body: JSON.stringify({ variantIds, selectionMode, productStatus, groupingMode, includeMapped }),
      });
      setPreview(result);
    } catch (requestError) {
      setPreview(null);
      setError(requestError instanceof Error ? requestError.message : "Az export ellenőrzése nem sikerült.");
    } finally {
      setPreviewBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setReconcileMessage("");
    void loadHistory();
    const timer = window.setTimeout(() => void loadPreview(), 80);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variantKey, selectionMode, productStatus, groupingMode, includeMapped]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function createExport() {
    if (!preview?.summary.validVariantCount) {
      setError("Nincs hibamentes exportálható variáns.");
      return;
    }
    setCreateBusy(true);
    setError("");
    try {
      const result = await requestJSON<CreateResult>("/api/aif/shopify/product-exports", {
        method: "POST",
        body: JSON.stringify({ variantIds, selectionMode, productStatus, groupingMode, includeMapped }),
      });
      setCreated(result);
      await loadHistory();
      await onChanged?.();
      const link = document.createElement("a");
      link.href = result.downloadUrl;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "A Shopify export létrehozása nem sikerült.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function reconcile(exportId = created?.exportId || "") {
    if (!exportId) return;
    setReconcileBusy(true);
    setReconcilingExportId(exportId);
    setError("");
    setReconcileMessage("");
    try {
      const result = await requestJSON<{
        mapped: number;
        errors: number;
        status: string;
        activatedProducts?: number;
        publishedProducts?: number;
        brandUpdatedProducts?: number;
        brandSkippedProducts?: number;
        errorItems?: Array<{ sku?: string; error?: string }>;
        productErrors?: Array<{ scope?: string; error?: string }>;
      }>(
        `/api/aif/shopify/product-exports/${encodeURIComponent(exportId)}/reconcile`,
        { method: "POST", body: JSON.stringify({ enqueueStock: true }) }
      );
      const productSummary = [
        result.activatedProducts ? `${result.activatedProducts} termék aktiválva` : "",
        result.publishedProducts ? `${result.publishedProducts} termék közzétéve az Online áruházban` : "",
        result.brandUpdatedProducts ? `${result.brandUpdatedProducts} Brand mező kitöltve` : "",
        result.brandSkippedProducts ? `${result.brandSkippedProducts} Brand mező kihagyva` : "",
      ].filter(Boolean).join(" • ");
      setReconcileMessage(
        result.errors
          ? `Párosítva: ${result.mapped}. Javítandó: ${result.errors}.${productSummary ? ` ${productSummary}.` : ""}`
          : `Párosítás kész: ${result.mapped} variáns. ${productSummary || "A termékek aktiválása és az Online áruház közzététele elkészült."} A Miercurea Ciuc induló készlet szinkronja sorba állt.`
      );
      await loadHistory();
      await onChanged?.();
      await loadPreview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Az import utáni párosítás nem sikerült.");
    } finally {
      setReconcileBusy(false);
      setReconcilingExportId("");
    }
  }

  if (!open) return null;

  const validItems = preview?.items.filter((item) => item.state === "valid") || [];
  const invalidItems = preview?.items.filter((item) => item.state === "invalid") || [];
  const skippedItems = preview?.items.filter((item) => item.state === "skipped_mapped") || [];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 px-3 py-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-[1220px] flex-col overflow-hidden rounded-[24px] border border-white/18 bg-[#4b5362] text-white shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/12 bg-[#404a5b] px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#77d8d4]/35 bg-[#203f49]">
              <img src={AIF_SHOPIFY_ICON_URL} alt="" className="h-7 w-7 object-contain" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#cffffd]/65">Shopify termékpublikálás</p>
              <h2 className="mt-0.5 text-xl text-white">Kijelölt termékek exportja</h2>
              <p className="mt-1 text-xs text-white/55">Egyetlen Shopify-kompatibilis termék-CSV. Import és párosítás után az AllIn automatikusan beállítja a Miercurea Ciuc készletet.</p>
            </div>
          </div>
          <button type="button" className={`${softButton} h-9 w-9 px-0`} onClick={onClose} aria-label="Bezárás"><X size={16} /></button>
        </header>

        <div className="overflow-y-auto p-4">
          <div className="grid gap-3 lg:grid-cols-[1.15fr,1.1fr,1fr,auto] lg:items-end">
            <label className="grid gap-1.5 text-xs text-white/65">
              Shopify csoportosítás
              <select
                className={field}
                value={groupingMode}
                onChange={(event) => {
                  const next = event.target.value as GroupingMode;
                  setGroupingMode(next);
                  if (next === "model_colors") setIncludeMapped(true);
                }}
              >
                <option value="model_colors">Egy modell = egy termék, a színek és méretek opciók</option>
                <option value="product_code">Minden termékkód külön Shopify-termék</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs text-white/65">
              Export terjedelme
              <select className={field} value={selectionMode} onChange={(event) => setSelectionMode(event.target.value as typeof selectionMode)}>
                <option value="all_model_variants">A kijelölt modellek minden aktív szín- és méretvariánsa</option>
                <option value="selected_variants">Csak a pontosan kijelölt variánsok</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs text-white/65">
              Shopify termékállapot
              <select className={field} value={productStatus} onChange={(event) => setProductStatus(event.target.value as typeof productStatus)}>
                <option value="active">Aktív, Online áruházban is közzétéve</option>
                <option value="draft">Piszkozat, nem kerül az Online áruházba</option>
              </select>
            </label>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/14 bg-[#303a4c] px-3 text-xs text-white/72">
              <input type="checkbox" checked={includeMapped} onChange={(event) => setIncludeMapped(event.target.checked)} className="h-4 w-4 accent-[#2a8d8b]" />
              Már összekötötteket is exportálja
            </label>
          </div>

          <div className="mt-3 rounded-2xl border border-[#77d8d4]/25 bg-[#203f49] px-3 py-2 text-xs leading-relaxed text-[#d7fffd]">
            {groupingMode === "model_colors"
              ? "Egy AllIn modellből egy Shopify-termék készül. A Culoare az első, a Mărime a második variánsopció, ezért a ciklam / roz / turcoaz ugyanazon terméken belül választható."
              : "A beszállítói termékkódok külön Shopify-termékek maradnak. Ezt csak akkor használd, amikor a színkódos cikkszám valóban külön terméket jelent."}
          </div>

          <div className="mt-2 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-50">
            A már Shopifyhoz kapcsolt színeket modell-csoportosításnál érdemes bent hagyni, különben fél terméket építenénk újra, ami még a CSV-nek is méltatlan. Aktív exportnál a párosítás aktiválja és közzéteszi a terméket, majd sorba állítja a készletszinkront.
          </div>

          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/14 px-3 py-3 text-sm text-rose-50">
              <AlertTriangle className="mt-0.5 shrink-0" size={17} /> {error}
            </div>
          ) : null}
          {reconcileMessage ? (
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#77d8d4]/30 bg-[#203f49] px-3 py-3 text-sm text-[#d7fffd]">
              <CheckCircle2 className="mt-0.5 shrink-0" size={17} /> {reconcileMessage}
            </div>
          ) : null}

          {previewBusy ? (
            <div className="mt-4 flex min-h-40 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.05] text-sm text-white/60">
              <RefreshCw size={18} className="animate-spin" /> Termékek és Shopify helyszín ellenőrzése...
            </div>
          ) : preview ? (
            <>
              <section className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                {[
                  ["Shopify termékek", preview.summary.modelCount],
                  ["Variánsok", preview.summary.variantCount],
                  ["Exportálható", preview.summary.validVariantCount],
                  ["Hibás", preview.summary.invalidVariantCount],
                  ["Már összekötött", preview.summary.skippedMappedCount],
                  ["Készlet összesen", `${preview.summary.totalAvailableQty} db`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border border-white/12 bg-[#3f4959] px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-white/45">{label}</p>
                    <p className="mt-1 text-xl text-white">{value}</p>
                  </div>
                ))}
              </section>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#77d8d4]/25 bg-[#203f49] px-3 py-2 text-xs text-[#d7fffd]">
                <span>Induló Shopify helyszín: <strong>{preview.location.name}</strong></span>
                <span>A párosítás után minden exportált variáns teljes elérhető készlete ide kerül, Kézdi pedig 0-ról indul.</span>
              </div>

              <section className="mt-4 overflow-hidden rounded-2xl border border-white/12 bg-[#3f4959]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
                  <div>
                    <h3 className="text-sm text-white">Exportellenőrzés</h3>
                    <p className="mt-0.5 text-xs text-white/45">A hibás sorok nem kerülnek bele a CSV-be. A részletes ellenőrzés és a hibák itt, az AllIn felületén maradnak meg.</p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-2 py-1 text-emerald-50">Rendben: {validItems.length}</span>
                    <span className="rounded-full border border-rose-300/25 bg-rose-400/12 px-2 py-1 text-rose-50">Hibás: {invalidItems.length}</span>
                    <span className="rounded-full border border-amber-300/25 bg-amber-300/12 px-2 py-1 text-amber-50">Kihagyva: {skippedItems.length}</span>
                  </div>
                </div>
                <div className="max-h-[390px] divide-y divide-white/[0.07] overflow-y-auto">
                  {preview.items.map((item) => (
                    <div key={item.variantId} className="grid gap-3 px-3 py-2.5 md:grid-cols-[52px,1fr,110px,140px] md:items-center">
                      <span className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white text-slate-400">
                        {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain" /> : <ImageOff size={18} />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm text-white">{item.title || "Névtelen termék"}</p>
                          {item.state === "valid" ? <CheckCircle2 size={15} className="text-emerald-200" /> : item.state === "invalid" ? <AlertTriangle size={15} className="text-rose-200" /> : <ShoppingBag size={15} className="text-amber-200" />}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-white/48">{item.brand || "-"} • {item.color || "-"} • {item.size || "-"} • SKU: {item.sku || "-"}</p>
                        {item.errors.length ? <p className="mt-1 text-xs text-rose-100">{item.errors.join(" • ")}</p> : null}
                        {item.warnings.length ? <p className="mt-1 text-[11px] text-amber-100/85">{item.warnings.join(" • ")}</p> : null}
                      </div>
                      <div className="text-right text-sm text-white/75">{n(item.availableQty)} db</div>
                      <div className="text-right">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${item.state === "valid" ? "border-emerald-300/30 bg-emerald-400/12 text-emerald-50" : item.state === "invalid" ? "border-rose-300/30 bg-rose-400/12 text-rose-50" : "border-amber-300/30 bg-amber-300/12 text-amber-50"}`}>
                          {item.state === "valid" ? "Exportálható" : item.state === "invalid" ? "Javítandó" : "Már Shopifyon"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          <section className="mt-4 overflow-hidden rounded-2xl border border-white/12 bg-[#3f4959]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
              <div>
                <h3 className="text-sm text-white">Legutóbbi Shopify exportok</h3>
                <p className="mt-0.5 text-xs text-white/45">A CSV bezárás vagy oldalfrissítés után is újra letölthető és párosítható.</p>
              </div>
              <button type="button" className={softButton} onClick={() => void loadHistory()} disabled={historyBusy}>
                <RefreshCw size={14} className={historyBusy ? "animate-spin" : ""} /> Frissítés
              </button>
            </div>
            {historyBusy && !exports.length ? (
              <div className="px-3 py-5 text-center text-xs text-white/50">Exportelőzmények betöltése...</div>
            ) : exports.length ? (
              <div className="max-h-64 divide-y divide-white/[0.07] overflow-y-auto">
                {exports.map((row) => {
                  const pending = !["mapped"].includes(String(row.status || "").toLowerCase());
                  return (
                    <div key={row.id} className="grid gap-2 px-3 py-2.5 lg:grid-cols-[1fr,160px,150px,auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-white/70">{row.id.slice(0, 8)}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${exportStatusClass(row.status)}`}>{exportStatusLabel(row.status)}</span>
                        </div>
                        <p className="mt-1 text-xs text-white/50">{dateTime(row.created_at)} • {n(row.valid_variant_count)} exportált variáns • {n(row.model_count)} modell</p>
                      </div>
                      <div className="text-xs text-white/55">{row.shopify_location_name || "Miercurea Ciuc"}</div>
                      <div className="text-xs text-white/55">Hibás: {n(row.invalid_variant_count)} • Jelzés: {n(row.warning_count)}</div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <a className={softButton} href={`/api/aif/shopify/product-exports/${encodeURIComponent(row.id)}/download`} download>
                          <Download size={14} /> CSV
                        </a>
                        {pending ? (
                          <button type="button" className={primaryButton} onClick={() => void reconcile(row.id)} disabled={reconcileBusy}>
                            <UploadCloud size={14} className={reconcilingExportId === row.id ? "animate-pulse" : ""} />
                            {reconcilingExportId === row.id ? "Ellenőrzés..." : "Párosítás"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-5 text-center text-xs text-white/45">Még nincs mentett Shopify export.</div>
            )}
          </section>

          {created ? (
            <section className="mt-4 rounded-2xl border border-[#77d8d4]/30 bg-[#203f49] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm text-white"><FileSpreadsheet size={17} /> Shopify CSV elkészült</div>
                  <p className="mt-1 text-xs text-[#d7fffd]/72">{created.fileName}</p>
                  <p className="mt-1 text-xs text-[#d7fffd]/72">{created.productRows} Shopify-terméksor. A készlet a párosítás után automatikusan kerül Miercurea Ciucra.</p>
                </div>
                <a className={softButton} href={created.downloadUrl} download={created.fileName}><Download size={15} /> CSV újbóli letöltése</a>
              </div>
              <ol className="mt-3 grid gap-2 text-xs leading-relaxed text-[#d7fffd]/86 md:grid-cols-3">
                <li className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"><strong>1.</strong> Shopify Admin → Products → Import, majd töltsd fel ezt az egy CSV-t.</li>
                <li className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"><strong>2.</strong> Várd meg, amíg a Shopify termékimport befejeződik.</li>
                <li className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"><strong>3.</strong> Vissza ide, Párosítás. Az AllIn feltölti a készletet Miercurea Ciucra.</li>
              </ol>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" className={primaryButton} onClick={() => void reconcile(created.exportId)} disabled={reconcileBusy}>
                  <UploadCloud size={15} className={reconcileBusy ? "animate-pulse" : ""} />
                  {reconcileBusy ? "Shopify ellenőrzése..." : "Import elkészült, párosítás"}
                </button>
              </div>
            </section>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/12 bg-[#404a5b] px-4 py-3">
          <p className="text-xs text-white/48">A készlet az AllIn teljes elérhető mennyisége, az online_shop hely kihagyásával.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={softButton} onClick={() => void loadPreview()} disabled={previewBusy}><RefreshCw size={15} /> Újraellenőrzés</button>
            <button type="button" className={softButton} onClick={onClose}><X size={15} /> Bezárás</button>
            <button type="button" className={primaryButton} onClick={() => void createExport()} disabled={createBusy || previewBusy || !preview?.summary.validVariantCount}>
              <PackageCheck size={15} /> {createBusy ? "CSV készítése..." : "Shopify CSV elkészítése"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
