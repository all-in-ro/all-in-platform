import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Link2,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { AIF_SHOPIFY_ICON_URL } from "./ShopifyStatusIcon";

type MappingRow = {
  variant_id: string;
  sku?: string | null;
  barcode?: string | null;
  internal_sku?: string | null;
  title_ro?: string | null;
  model_code?: string | null;
  brand_name?: string | null;
  size?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  shopify_product_id?: string | null;
  shopify_variant_id?: string | null;
  shopify_inventory_item_id?: string | null;
  shopify_product_title?: string | null;
  shopify_variant_title?: string | null;
  shopify_product_status?: string | null;
  sync_status?: string | null;
  last_synced_at?: string | null;
  last_error?: string | null;
  outbox_status?: string | null;
  outbox_error?: string | null;
  desired_csikszereda_qty?: number | string | null;
  desired_kezdi_qty?: number | string | null;
  attempts?: number | string | null;
  updated_at?: string | null;
  model_id?: string | null;
  variant_status?: string | null;
  model_status?: string | null;
  total_stock?: number | string | null;
  available_stock?: number | string | null;
  stock_location_count?: number | string | null;
  allin_product_key?: string | null;
  safe_cleanup?: boolean | null;
  cleanup_reason?: "archived" | "zero_stock_broken" | string | null;
  reexport_ready?: boolean | null;
};

type ExportHistoryRow = {
  id: string;
  status?: string | null;
  product_status?: string | null;
  shopify_location_name?: string | null;
  model_count?: number | string | null;
  variant_count?: number | string | null;
  valid_variant_count?: number | string | null;
  invalid_variant_count?: number | string | null;
  warning_count?: number | string | null;
  created_at?: string | null;
  downloaded_at?: string | null;
  reconciled_at?: string | null;
};

type RefreshResult = {
  checked: number;
  valid: number;
  unchanged: number;
  repaired: number;
  broken: number;
  queued: number;
  cleanup?: {
    deleted?: number;
    archived?: number;
    zeroStockBroken?: number;
    productCount?: number;
  } | null;
  processed?: { processed?: number; done?: number; errors?: number } | null;
  items?: Array<{ variantId?: string; state?: string; error?: string }>;
};

type MaintenanceConfirm = {
  kind: "cleanup" | "reexport";
  ids: string[];
};

const softButton = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-700 shadow-sm transition hover:border-[#95BF47]/55 hover:bg-[#F7FAF1] focus:outline-none focus:ring-2 focus:ring-[#95BF47]/30 disabled:cursor-not-allowed disabled:opacity-45";
const primaryButton = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#004C3F] bg-[#004C3F] px-3 text-xs text-white shadow-sm transition hover:border-[#006E52] hover:bg-[#006E52] focus:outline-none focus:ring-2 focus:ring-[#95BF47]/35 disabled:cursor-not-allowed disabled:opacity-45";
const dangerButton = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-600 bg-rose-600 px-3 text-xs text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-45";
const smallButton = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] text-slate-700 transition hover:border-[#95BF47]/55 hover:bg-[#F7FAF1] focus:outline-none focus:ring-2 focus:ring-[#95BF47]/30 disabled:cursor-not-allowed disabled:opacity-45";

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return clean(value).toLowerCase();
}

function dateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function exportStatusLabel(value?: string | null) {
  const status = normalized(value);
  if (status === "prepared") return "Előkészítve";
  if (status === "downloaded") return "Letöltve, importálásra vár";
  if (status === "partially_mapped") return "Részben párosítva";
  if (status === "mapped") return "Párosítva";
  if (status === "error") return "Hibás";
  return status || "Ismeretlen";
}

function mappingState(row: MappingRow) {
  const sync = normalized(row.sync_status);
  const outbox = normalized(row.outbox_status);
  const hasError = Boolean(clean(row.last_error) || clean(row.outbox_error)) || [sync, outbox].some((value) => ["error", "failed", "blocked"].includes(value));
  if (hasError) return "error" as const;
  if (["pending", "processing"].includes(outbox)) return "pending" as const;
  if (["synced", "done"].includes(sync) || outbox === "done") return "synced" as const;
  return "mapped" as const;
}

function mappingStateLabel(row: MappingRow) {
  const state = mappingState(row);
  if (state === "error") return "Kapcsolati hiba";
  if (state === "pending") return "Szinkron folyamatban";
  if (state === "synced") return "Szinkronban";
  return "Összekötve";
}

async function requestJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload as T;
}

export default function ShopifySyncCenterModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const [tab, setTab] = useState<"connections" | "history">("connections");
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [exports, setExports] = useState<ExportHistoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [mappingFilter, setMappingFilter] = useState<"all" | "synced" | "mapped" | "pending" | "error">("all");
  const [busy, setBusy] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [syncingVariantId, setSyncingVariantId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mappingPage, setMappingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedExportIds, setSelectedExportIds] = useState<Record<string, boolean>>({});
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[]>([]);
  const [selectedMappingIds, setSelectedMappingIds] = useState<Record<string, boolean>>({});
  const [maintenanceConfirm, setMaintenanceConfirm] = useState<MaintenanceConfirm | null>(null);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const pageSize = 50;

  async function loadMappings() {
    const result = await requestJSON<{ ok: true; items: MappingRow[] }>("/api/aif/shopify/mappings?limit=1000");
    setMappings(Array.isArray(result.items) ? result.items : []);
  }

  async function loadExports() {
    const result = await requestJSON<{ ok: true; items: ExportHistoryRow[] }>("/api/aif/shopify/product-exports?limit=500");
    setExports(Array.isArray(result.items) ? result.items : []);
  }

  async function loadAll() {
    setBusy(true);
    setError("");
    try {
      await Promise.all([loadMappings(), loadExports()]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "A Shopify központ betöltése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshMappings(options: { variantIds?: string[]; sync?: boolean; automatic?: boolean } = {}) {
    setAuditBusy(true);
    if (options.variantIds?.length === 1) setSyncingVariantId(options.variantIds[0]);
    setError("");
    if (!options.automatic) setMessage("");
    try {
      const result = await requestJSON<RefreshResult>("/api/aif/shopify/mappings/refresh", {
        method: "POST",
        body: JSON.stringify({
          variantIds: options.variantIds || [],
          sync: Boolean(options.sync),
          syncRepaired: true,
          process: true,
          processLimit: options.variantIds?.length ? 10 : 1000,
          limit: 1000,
        }),
      });
      const parts = [
        `${result.checked} kapcsolat ellenőrizve`,
        result.cleanup?.deleted ? `${result.cleanup.deleted} archivált régi kapcsolat automatikusan törölve` : "",
        result.repaired ? `${result.repaired} új Shopify azonosítóra javítva` : "",
        result.broken ? `${result.broken} megszakadt variáns` : "",
        result.queued ? `${result.queued} érvényes készletszinkron sorba állítva` : "",
      ].filter(Boolean);
      if (!options.automatic || result.repaired || result.broken || result.cleanup?.deleted) setMessage(parts.join(" • "));
      await Promise.all([loadMappings(), loadExports()]);
      await onChanged?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "A Shopify kapcsolatok ellenőrzése nem sikerült.");
    } finally {
      setAuditBusy(false);
      setSyncingVariantId("");
    }
  }

  async function deleteExports(ids: string[]) {
    const cleanIds = Array.from(new Set(ids.map(clean).filter(Boolean)));
    if (!cleanIds.length) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJSON<{ deleted: number; deletedItems: number }>("/api/aif/shopify/product-exports/delete-batch", {
        method: "POST",
        body: JSON.stringify({ ids: cleanIds }),
      });
      setMessage(`${result.deleted} exportelőzmény törölve. A Shopify kapcsolatok és a készlet nem változott.`);
      setSelectedExportIds({});
      setDeleteConfirmIds([]);
      await Promise.all([loadExports(), loadMappings()]);
      await onChanged?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Az exportelőzmények törlése nem sikerült.");
    } finally {
      setBusy(false);
    }
  }


  async function cleanupMappings(ids: string[] = []) {
    const cleanIds = Array.from(new Set(ids.map(clean).filter(Boolean)));
    setMaintenanceBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await requestJSON<{
        deleted: number;
        archived: number;
        zeroStockBroken: number;
        productCount: number;
      }>("/api/aif/shopify/mappings/cleanup", {
        method: "POST",
        body: JSON.stringify({
          variantIds: cleanIds,
          includeArchived: true,
          includeZeroStockBroken: true,
        }),
      });
      setMessage(
        result.deleted
          ? `${result.deleted} régi kapcsolat törölve (${result.productCount} termék): ${result.archived} archivált, ${result.zeroStockBroken} nulla készletű hibás variáns. A termékek és a készlet érintetlen maradt.`
          : "Nem találtam biztonságosan takarítható kapcsolatot."
      );
      setSelectedMappingIds({});
      setMaintenanceConfirm(null);
      await Promise.all([loadMappings(), loadExports()]);
      await onChanged?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "A régi Shopify kapcsolatok takarítása nem sikerült.");
    } finally {
      setMaintenanceBusy(false);
    }
  }

  async function detachMappingsForReexport(ids: string[]) {
    const cleanIds = Array.from(new Set(ids.map(clean).filter(Boolean)));
    if (!cleanIds.length) return;
    setMaintenanceBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await requestJSON<{
        detached: number;
        productCount: number;
        addedToWorklist: number;
        skipped: number;
        message?: string;
      }>("/api/aif/shopify/mappings/reexport", {
        method: "POST",
        body: JSON.stringify({ variantIds: cleanIds }),
      });
      setMessage(
        result.detached
          ? `${result.detached} készletes hibás variáns leválasztva (${result.productCount} termék), és a Shopify exportlistára került. Zárd be ezt az ablakot, majd a kijelölt munkalistában készítsd el az exportot.${result.skipped ? ` ${result.skipped} sor kimaradt, mert nem volt leválasztható.` : ""}`
          : result.message || "A kijelölt sorok között nem volt leválasztható, készletes hibás kapcsolat."
      );
      setSelectedMappingIds({});
      setMaintenanceConfirm(null);
      await Promise.all([loadMappings(), loadExports()]);
      await onChanged?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "A hibás kapcsolatok exportlistára helyezése nem sikerült.");
    } finally {
      setMaintenanceBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setTab("connections");
    setMessage("");
    setError("");
    setSearch("");
    setMappingPage(1);
    setHistoryPage(1);
    setSelectedMappingIds({});
    setSelectedExportIds({});
    setMaintenanceConfirm(null);
    void loadAll().then(() => refreshMappings({ automatic: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (maintenanceConfirm) {
        setMaintenanceConfirm(null);
        return;
      }
      if (deleteConfirmIds.length) {
        setDeleteConfirmIds([]);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, deleteConfirmIds.length, maintenanceConfirm]);

  const mappingSummary = useMemo(() => {
    const errorProducts = new Set<string>();
    return mappings.reduce(
      (acc, row) => {
        const state = mappingState(row);
        acc[state] += 1;
        if (state === "error") {
          errorProducts.add(clean(row.allin_product_key || row.model_id || row.shopify_product_id || row.variant_id));
          if (row.safe_cleanup) acc.safeCleanup += 1;
          if (row.reexport_ready) acc.reexportReady += 1;
        }
        return acc;
      },
      { synced: 0, mapped: 0, pending: 0, error: 0, safeCleanup: 0, reexportReady: 0 }
    ) as { synced: number; mapped: number; pending: number; error: number; safeCleanup: number; reexportReady: number; errorProducts?: number };
  }, [mappings]);

  const errorProductCount = useMemo(
    () => new Set(
      mappings
        .filter((row) => mappingState(row) === "error")
        .map((row) => clean(row.allin_product_key || row.model_id || row.shopify_product_id || row.variant_id))
        .filter(Boolean)
    ).size,
    [mappings]
  );

  const filteredMappings = useMemo(() => {
    const q = normalized(search);
    return mappings.filter((row) => {
      const state = mappingState(row);
      if (mappingFilter !== "all" && state !== mappingFilter) return false;
      if (!q) return true;
      return [
        row.title_ro,
        row.shopify_product_title,
        row.shopify_variant_title,
        row.brand_name,
        row.barcode,
        row.sku,
        row.internal_sku,
        row.model_code,
        row.color_name,
        row.color_code,
        row.size,
      ].some((value) => normalized(value).includes(q));
    });
  }, [mappings, mappingFilter, search]);

  const mappingPages = Math.max(1, Math.ceil(filteredMappings.length / pageSize));
  const safeMappingPage = Math.min(mappingPage, mappingPages);
  const visibleMappings = filteredMappings.slice((safeMappingPage - 1) * pageSize, safeMappingPage * pageSize);
  const selectableVisibleMappings = visibleMappings.filter((row) => mappingState(row) === "error");
  const selectedMappingRows = mappings.filter((row) => selectedMappingIds[row.variant_id]);
  const selectedReexportRows = selectedMappingRows.filter((row) => row.reexport_ready);
  const allSelectableVisibleMappingsSelected = selectableVisibleMappings.length > 0
    && selectableVisibleMappings.every((row) => selectedMappingIds[row.variant_id]);
  const historyPages = Math.max(1, Math.ceil(exports.length / pageSize));
  const safeHistoryPage = Math.min(historyPage, historyPages);
  const visibleExports = exports.slice((safeHistoryPage - 1) * pageSize, safeHistoryPage * pageSize);
  const selectedIds = Object.keys(selectedExportIds).filter((id) => selectedExportIds[id]);
  const allVisibleExportsSelected = visibleExports.length > 0 && visibleExports.every((row) => selectedExportIds[row.id]);
  const oldClosedExportIds = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return exports
      .filter((row) => normalized(row.status) === "mapped" && new Date(String(row.created_at || 0)).getTime() < cutoff)
      .map((row) => row.id);
  }, [exports]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/60 px-3 py-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-[24px] border border-[#C8D6C2] bg-[#F5F7F2] text-slate-900 shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2F6E3F] bg-gradient-to-r from-[#003D32] via-[#004C3F] to-[#2F6E3F] px-4 py-3 text-white">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#D8E8B8] bg-white shadow-sm shadow-black/10">
              <img src={AIF_SHOPIFY_ICON_URL} alt="" className="h-9 w-9 object-contain" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">Shopify központ</p>
              <h2 className="mt-0.5 text-xl text-white">Kapcsolatok, szinkron és exportelőzmények</h2>
              <p className="mt-1 text-xs text-white/75">Megnyitáskor ellenőrzi, hogy a tárolt Shopify variánsok még léteznek-e. Az újraimportált, azonos SKU-jú termékeket automatikusan újrapárosítja.</p>
            </div>
          </div>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/35 bg-white/10 transition hover:border-[#D8E8B8] hover:bg-[#95BF47]/20 focus:outline-none focus:ring-2 focus:ring-[#95BF47]/35" onClick={onClose} aria-label="Bezárás"><X size={17} /></button>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="flex gap-1 rounded-xl bg-[#EDF2E8] p-1">
            <button type="button" className={`h-8 rounded-lg px-3 text-xs transition ${tab === "connections" ? "bg-[#004C3F] text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-[#004C3F]"}`} onClick={() => setTab("connections")}><Link2 size={14} className="mr-1.5 inline" />Kapcsolatok</button>
            <button type="button" className={`h-8 rounded-lg px-3 text-xs transition ${tab === "history" ? "bg-[#004C3F] text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-[#004C3F]"}`} onClick={() => setTab("history")}><Download size={14} className="mr-1.5 inline" />Exportelőzmények</button>
          </div>
          <button type="button" className={softButton} onClick={() => void loadAll()} disabled={busy}><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Frissítés</button>
        </div>

        <div className="overflow-y-auto p-4">
          {error ? <div className="mb-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</div> : null}
          {message ? <div className="mb-3 flex items-start gap-2 rounded-2xl border border-[#CFE3A6] bg-[#F5FAEC] px-3 py-2.5 text-sm text-[#365A25]"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#5E8E3E]" />{message}</div> : null}

          {tab === "connections" ? (
            <>
              <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <button type="button" className="rounded-2xl border border-[#CFE3A6] bg-[#F5FAEC] px-3 py-2.5 text-left text-[#365A25]" onClick={() => { setMappingFilter("synced"); setMappingPage(1); }}>
                  <p className="text-[10px] uppercase tracking-[0.1em] opacity-70">Szinkronban</p>
                  <p className="mt-1 text-2xl">{mappingSummary.synced}</p>
                </button>
                <button type="button" className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-left text-sky-800" onClick={() => { setMappingFilter("mapped"); setMappingPage(1); }}>
                  <p className="text-[10px] uppercase tracking-[0.1em] opacity-70">Összekötve</p>
                  <p className="mt-1 text-2xl">{mappingSummary.mapped}</p>
                </button>
                <button type="button" className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-amber-800" onClick={() => { setMappingFilter("pending"); setMappingPage(1); }}>
                  <p className="text-[10px] uppercase tracking-[0.1em] opacity-70">Folyamatban</p>
                  <p className="mt-1 text-2xl">{mappingSummary.pending}</p>
                </button>
                <button type="button" className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-left text-rose-800" onClick={() => { setMappingFilter("error"); setMappingPage(1); }}>
                  <p className="text-[10px] uppercase tracking-[0.1em] opacity-70">Hibás / megszakadt</p>
                  <p className="mt-1 text-2xl">{mappingSummary.error} <span className="text-sm">variáns</span></p>
                  <p className="mt-0.5 text-[11px] opacity-75">{errorProductCount} termék • {mappingSummary.safeCleanup} takarítható • {mappingSummary.reexportReady} exportálható újra</p>
                </button>
              </section>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  <label className="relative min-w-[240px] flex-1">
                    <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
                    <input className="h-9 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#5E8E3E] focus:ring-2 focus:ring-[#95BF47]/20" value={search} onChange={(event) => { setSearch(event.target.value); setMappingPage(1); }} placeholder="Termék, márka, SKU, méret..." />
                  </label>
                  <select className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-[#5E8E3E] focus:ring-2 focus:ring-[#95BF47]/20" value={mappingFilter} onChange={(event) => { setMappingFilter(event.target.value as typeof mappingFilter); setMappingPage(1); }}>
                    <option value="all">Minden kapcsolat</option>
                    <option value="synced">Szinkronban</option>
                    <option value="mapped">Csak összekötve</option>
                    <option value="pending">Folyamatban</option>
                    <option value="error">Hibás / megszakadt</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mappingSummary.safeCleanup > 0 ? (
                    <button type="button" className={dangerButton} onClick={() => setMaintenanceConfirm({ kind: "cleanup", ids: [] })} disabled={maintenanceBusy}>
                      <Trash2 size={14} /> Biztonságos takarítás ({mappingSummary.safeCleanup})
                    </button>
                  ) : null}
                  {selectedReexportRows.length ? (
                    <button type="button" className={primaryButton} onClick={() => setMaintenanceConfirm({ kind: "reexport", ids: selectedReexportRows.map((row) => row.variant_id) })} disabled={maintenanceBusy}>
                      <UploadCloud size={14} /> Leválasztás + exportlistára ({selectedReexportRows.length})
                    </button>
                  ) : null}
                  <button type="button" className={softButton} onClick={() => void refreshMappings({ sync: false })} disabled={auditBusy || maintenanceBusy}><RefreshCw size={14} className={auditBusy ? "animate-spin" : ""} /> Kapcsolatok ellenőrzése</button>
                  <button type="button" className={primaryButton} onClick={() => void refreshMappings({ sync: true })} disabled={auditBusy || maintenanceBusy}><UploadCloud size={14} /> Minden érvényes készlet szinkronizálása</button>
                </div>
              </div>

              <section className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="grid grid-cols-[36px,1fr,155px,145px,auto] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                  <label className="flex items-center justify-center">
                    <input
                      className="accent-[#5E8E3E]"
                      type="checkbox"
                      disabled={!selectableVisibleMappings.length}
                      checked={allSelectableVisibleMappingsSelected}
                      onChange={(event) => setSelectedMappingIds((current) => {
                        const next = { ...current };
                        selectableVisibleMappings.forEach((row) => {
                          if (event.target.checked) next[row.variant_id] = true;
                          else delete next[row.variant_id];
                        });
                        return next;
                      })}
                      title="A látható hibás variánsok kijelölése"
                    />
                  </label>
                  <span>AllIn / Shopify termék</span><span>Állapot / készlet</span><span>Utolsó szinkron</span><span className="text-right">Művelet</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {visibleMappings.map((row) => {
                    const state = mappingState(row);
                    const errorText = clean(row.outbox_error || row.last_error);
                    const totalStock = numberValue(row.total_stock);
                    return (
                      <div key={row.variant_id} className="grid gap-2 px-3 py-2.5 lg:grid-cols-[36px,1fr,155px,145px,auto] lg:items-center">
                        <label className="flex items-center justify-center">
                          {state === "error" ? (
                            <input
                              className="accent-[#5E8E3E]"
                              type="checkbox"
                              checked={Boolean(selectedMappingIds[row.variant_id])}
                              onChange={(event) => setSelectedMappingIds((current) => {
                                const next = { ...current };
                                if (event.target.checked) next[row.variant_id] = true;
                                else delete next[row.variant_id];
                                return next;
                              })}
                              aria-label="Hibás Shopify variáns kijelölése"
                            />
                          ) : null}
                        </label>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm text-slate-900">{row.title_ro || row.shopify_product_title || "Névtelen termék"}</p>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">{row.brand_name || "-"}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500">Shopify: {row.shopify_product_title || "-"} • {row.shopify_variant_title || row.size || "-"}</p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">SKU: {row.barcode || row.sku || "-"} • {row.color_name || row.color_code || "-"} • {row.size || "-"}</p>
                          {errorText ? <p className="mt-1 break-words text-xs text-rose-600">{errorText}</p> : null}
                        </div>
                        <div>
                          <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] ${state === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : state === "pending" ? "border-amber-200 bg-amber-50 text-amber-700" : state === "synced" ? "border-[#BCD98B] bg-[#F3F8E9] text-[#365A25]" : "border-sky-200 bg-sky-50 text-sky-700"}`}>{mappingStateLabel(row)}</span>
                          <p className="mt-1 text-[10px] text-slate-500">AllIn készlet: {totalStock} db • {numberValue(row.stock_location_count)} hely</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">Csík {numberValue(row.desired_csikszereda_qty)} • Kézdi {numberValue(row.desired_kezdi_qty)}</p>
                          {row.safe_cleanup ? <p className="mt-1 text-[10px] text-rose-600">{row.cleanup_reason === "archived" ? "Archivált kapcsolat" : "0 készlet, biztonságosan takarítható"}</p> : null}
                        </div>
                        <div className="text-xs text-slate-500">{dateTime(row.last_synced_at)}</div>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {state === "error" && row.safe_cleanup ? (
                            <button type="button" className={dangerButton} onClick={() => setMaintenanceConfirm({ kind: "cleanup", ids: [row.variant_id] })} disabled={maintenanceBusy}>
                              <Trash2 size={14} /> Takarítás
                            </button>
                          ) : state === "error" && row.reexport_ready ? (
                            <button type="button" className={primaryButton} onClick={() => setMaintenanceConfirm({ kind: "reexport", ids: [row.variant_id] })} disabled={maintenanceBusy}>
                              <UploadCloud size={14} /> Exportlistára
                            </button>
                          ) : (
                            <button type="button" className={primaryButton} onClick={() => void refreshMappings({ variantIds: [row.variant_id], sync: true })} disabled={auditBusy || maintenanceBusy || syncingVariantId === row.variant_id}>
                              <RefreshCw size={14} className={syncingVariantId === row.variant_id ? "animate-spin" : ""} />
                              {syncingVariantId === row.variant_id ? "Szinkron..." : "Ellenőrzés + szinkron"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!visibleMappings.length ? <div className="px-3 py-10 text-center text-sm text-slate-500">Nincs a szűrésnek megfelelő Shopify kapcsolat.</div> : null}
                </div>
              </section>

              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>{filteredMappings.length} kapcsolat • oldal {safeMappingPage}/{mappingPages}</span>
                <div className="flex gap-2"><button className={smallButton} disabled={safeMappingPage <= 1} onClick={() => setMappingPage((page) => Math.max(1, page - 1))}>Előző</button><button className={smallButton} disabled={safeMappingPage >= mappingPages} onClick={() => setMappingPage((page) => Math.min(mappingPages, page + 1))}>Következő</button></div>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                <div>
                  <h3 className="text-sm text-slate-900">Shopify exportelőzmények</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Az előzmény törlése nem bontja a Shopify mappinget és nem módosít készletet.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {oldClosedExportIds.length ? (
                    <button type="button" className={softButton} onClick={() => setSelectedExportIds((current) => {
                      const next = { ...current };
                      oldClosedExportIds.forEach((id) => { next[id] = true; });
                      return next;
                    })}>
                      <CheckCircle2 size={14} /> 30 napnál régebbi lezártak kijelölése ({oldClosedExportIds.length})
                    </button>
                  ) : null}
                  {selectedIds.length ? <button type="button" className={dangerButton} onClick={() => setDeleteConfirmIds(selectedIds)}><Trash2 size={14} /> Kijelöltek törlése ({selectedIds.length})</button> : null}
                  <button type="button" className={softButton} onClick={() => void loadExports()}><RefreshCw size={14} /> Frissítés</button>
                </div>
              </div>

              <section className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="grid grid-cols-[36px,1fr,150px,140px,auto] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                  <label className="flex items-center justify-center"><input className="accent-[#5E8E3E]" type="checkbox" checked={allVisibleExportsSelected} onChange={(event) => setSelectedExportIds((current) => { const next = { ...current }; visibleExports.forEach((row) => { if (event.target.checked) next[row.id] = true; else delete next[row.id]; }); return next; })} /></label>
                  <span>Export</span><span>Állapot</span><span>Helyszín</span><span className="text-right">Művelet</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {visibleExports.map((row) => (
                    <div key={row.id} className="grid gap-2 px-3 py-2.5 lg:grid-cols-[36px,1fr,150px,140px,auto] lg:items-center">
                      <label className="flex items-center justify-center"><input className="accent-[#5E8E3E]" type="checkbox" checked={Boolean(selectedExportIds[row.id])} onChange={(event) => setSelectedExportIds((current) => { const next = { ...current }; if (event.target.checked) next[row.id] = true; else delete next[row.id]; return next; })} /></label>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-slate-700">{row.id.slice(0, 8)}</span><span className="text-xs text-slate-500">{dateTime(row.created_at)}</span></div>
                        <p className="mt-1 text-xs text-slate-500">{numberValue(row.valid_variant_count)} variáns • {numberValue(row.model_count)} termék • hibás {numberValue(row.invalid_variant_count)} • jelzés {numberValue(row.warning_count)}</p>
                      </div>
                      <span className={`inline-flex w-fit rounded-full border px-2 py-1 text-[11px] ${normalized(row.status) === "mapped" ? "border-[#BCD98B] bg-[#F3F8E9] text-[#365A25]" : normalized(row.status) === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{exportStatusLabel(row.status)}</span>
                      <span className="text-xs text-slate-500">{row.shopify_location_name || "Miercurea Ciuc"}</span>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <a className={smallButton} href={`/api/aif/shopify/product-exports/${encodeURIComponent(row.id)}/download`} download><Download size={13} /> CSV</a>
                        {normalized(row.status) !== "mapped" ? <button type="button" className={smallButton} onClick={() => void requestJSON(`/api/aif/shopify/product-exports/${encodeURIComponent(row.id)}/reconcile`, { method: "POST", body: JSON.stringify({ enqueueStock: true }) }).then(async () => { setMessage("Export újrapárosítva, a készletszinkron sorba állt."); await loadAll(); await onChanged?.(); }).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "A párosítás nem sikerült."))}><UploadCloud size={13} /> Párosítás</button> : null}
                        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={() => setDeleteConfirmIds([row.id])} title="Előzmény törlése"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                  {!visibleExports.length ? <div className="px-3 py-10 text-center text-sm text-slate-500">Még nincs Shopify exportelőzmény.</div> : null}
                </div>
              </section>

              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>{exports.length} export • oldal {safeHistoryPage}/{historyPages}</span>
                <div className="flex gap-2"><button className={smallButton} disabled={safeHistoryPage <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}>Előző</button><button className={smallButton} disabled={safeHistoryPage >= historyPages} onClick={() => setHistoryPage((page) => Math.min(historyPages, page + 1))}>Következő</button></div>
              </div>
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">A takarítás csak a Shopify mappinget és a blokkolt szinkronsort törli. AllIn terméket vagy készletet nem módosít.</p>
          <button type="button" className={softButton} onClick={onClose}><X size={14} /> Bezárás</button>
        </footer>
      </div>

      {maintenanceConfirm ? (
        <div className="fixed inset-0 z-[112] flex items-center justify-center bg-slate-950/60 px-4">
          <div className={`w-full max-w-lg rounded-2xl border bg-white p-4 text-slate-900 shadow-2xl ${maintenanceConfirm.kind === "cleanup" ? "border-rose-200" : "border-[#CFE3A6]"}`}>
            <div className="flex items-start gap-3">
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${maintenanceConfirm.kind === "cleanup" ? "bg-rose-50 text-rose-700" : "bg-[#F3F8E9] text-[#365A25]"}`}>
                {maintenanceConfirm.kind === "cleanup" ? <Trash2 size={19} /> : <UploadCloud size={19} />}
              </span>
              <div>
                <h3 className="text-lg">{maintenanceConfirm.kind === "cleanup" ? "Régi Shopify kapcsolatok takarítása" : "Hibás kapcsolatok exportlistára tétele"}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {maintenanceConfirm.kind === "cleanup"
                    ? maintenanceConfirm.ids.length
                      ? "A kijelölt nulla készletű vagy archivált hibás kapcsolat törlődik. AllIn termék és készlet nem változik."
                      : `${mappingSummary.safeCleanup} biztonságosan takarítható kapcsolat törlődik. AllIn termék és készlet nem változik.`
                    : `${maintenanceConfirm.ids.length} készletes hibás variáns Shopify kapcsolata leválik, majd bekerül a közös Shopify export munkalistába. A készlet nem változik.`}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className={softButton} onClick={() => setMaintenanceConfirm(null)} disabled={maintenanceBusy}>Mégse</button>
              <button
                className={maintenanceConfirm.kind === "cleanup" ? dangerButton : primaryButton}
                onClick={() => maintenanceConfirm.kind === "cleanup"
                  ? void cleanupMappings(maintenanceConfirm.ids)
                  : void detachMappingsForReexport(maintenanceConfirm.ids)}
                disabled={maintenanceBusy}
              >
                {maintenanceBusy ? <RefreshCw size={14} className="animate-spin" /> : maintenanceConfirm.kind === "cleanup" ? <Trash2 size={14} /> : <UploadCloud size={14} />}
                {maintenanceConfirm.kind === "cleanup" ? "Takarítás" : "Leválasztás + exportlistára"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmIds.length ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-4 text-slate-900 shadow-2xl">
            <div className="flex items-start gap-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700"><Trash2 size={19} /></span><div><h3 className="text-lg">Exportelőzmények törlése</h3><p className="mt-1 text-sm text-slate-600">{deleteConfirmIds.length} előzmény és annak ellenőrzési sorai törlődnek. A Shopify mapping és a készlet érintetlen marad.</p></div></div>
            <div className="mt-4 flex justify-end gap-2"><button className={softButton} onClick={() => setDeleteConfirmIds([])}>Mégse</button><button className={dangerButton} onClick={() => void deleteExports(deleteConfirmIds)} disabled={busy}><Trash2 size={14} /> Törlés</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
