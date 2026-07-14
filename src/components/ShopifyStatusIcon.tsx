import { ShoppingBag } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

export type ShopifyStatusSource = {
  shopify_mapped?: boolean | null;
  shopify_sync_status?: string | null;
  shopify_outbox_status?: string | null;
  shopify_product_id?: string | null;
  shopify_variant_id?: string | null;
  shopify_inventory_item_id?: string | null;
  shopify_product_title?: string | null;
  shopify_variant_title?: string | null;
  shopify_product_status?: string | null;
  shopify_last_synced_at?: string | null;
  shopify_last_error?: string | null;
  shopify_outbox_error?: string | null;
  shopify_export_id?: string | null;
  shopify_export_item_status?: string | null;
  shopify_export_status?: string | null;
  shopify_exported_at?: string | null;
  shopify_export_reconciled_at?: string | null;
  shopify_export_errors?: string[] | null;
  shopify_export_warnings?: string[] | null;
  shopify_export_pending?: boolean | null;
};

export type ShopifyVisualState = "synced" | "mapped" | "pending" | "error" | "unmapped";

export const AIF_SHOPIFY_ICON_URL =
  "https://pub-7c1132f9a7f148848302a0e037b8080d.r2.dev/smoke/spfyicon.png";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function isShopifyMappedItem(item?: ShopifyStatusSource | null) {
  return Boolean(
    item?.shopify_mapped ||
      clean(item?.shopify_variant_id) ||
      clean(item?.shopify_inventory_item_id) ||
      clean(item?.shopify_product_id)
  );
}

export function isShopifyExportPending(item?: ShopifyStatusSource | null) {
  const itemStatus = clean(item?.shopify_export_item_status).toLowerCase();
  const exportStatus = clean(item?.shopify_export_status).toLowerCase();
  return Boolean(
    item?.shopify_export_pending ||
      (!isShopifyMappedItem(item) && itemStatus === "exported_pending" && ["prepared", "downloaded", "partially_mapped"].includes(exportStatus))
  );
}

export function shopifyMappingHasError(item?: ShopifyStatusSource | null) {
  const statuses = [item?.shopify_sync_status, item?.shopify_outbox_status, item?.shopify_export_item_status]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
  return Boolean(
    clean(item?.shopify_last_error) ||
      clean(item?.shopify_outbox_error) ||
      (Array.isArray(item?.shopify_export_errors) && item.shopify_export_errors.some((value) => clean(value))) ||
      statuses.some((status) => ["error", "failed", "blocked", "invalid"].includes(status))
  );
}

export function shopifyVisualState(item?: ShopifyStatusSource | null): ShopifyVisualState {
  const mapped = isShopifyMappedItem(item);
  if (shopifyMappingHasError(item)) return "error";
  if (!mapped && isShopifyExportPending(item)) return "pending";
  if (!mapped) return "unmapped";
  const outbox = clean(item?.shopify_outbox_status).toLowerCase();
  const sync = clean(item?.shopify_sync_status).toLowerCase();
  if (["pending", "processing", "received"].includes(outbox)) return "pending";
  if (["synced", "done"].includes(sync) || outbox === "done") return "synced";
  return "mapped";
}

function dateTime(value?: string | null) {
  const raw = clean(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusText(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";
  const key = raw.toLowerCase();
  const labels: Record<string, string> = {
    active: "Aktív",
    draft: "Piszkozat",
    archived: "Archivált",
    mapped: "Összekötve",
    synced: "Szinkronizálva",
    done: "Kész",
    pending: "Várakozik",
    processing: "Folyamatban",
    prepared: "Előkészítve",
    downloaded: "Letöltve",
    partially_mapped: "Részben párosítva",
    exported_pending: "Exportálva, párosításra vár",
    error: "Hiba",
    failed: "Sikertelen",
    blocked: "Blokkolva",
  };
  return labels[key] || raw;
}

const stateMeta: Record<ShopifyVisualState, { label: string; border: string; badge: string; dot: string }> = {
  synced: {
    label: "Shopifyhoz kapcsolva és szinkronizálva",
    border: "border-[#78a832]",
    badge: "border-[#b8dd82] bg-[#eef8df] text-[#416b14]",
    dot: "bg-[#78a832]",
  },
  mapped: {
    label: "Shopifyhoz kapcsolva",
    border: "border-[#95bf47]",
    badge: "border-[#c7e39c] bg-[#f3f9e9] text-[#4b6f1f]",
    dot: "bg-[#95bf47]",
  },
  pending: {
    label: "Shopify export / szinkron folyamatban",
    border: "border-amber-400",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-400",
  },
  error: {
    label: "Shopify szinkronhiba",
    border: "border-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  unmapped: {
    label: "Nincs Shopifyhoz kapcsolva",
    border: "border-slate-300",
    badge: "border-slate-200 bg-slate-50 text-slate-600",
    dot: "bg-slate-400",
  },
};

type TooltipRow = { label: string; value: string };

export default function ShopifyStatusIcon({
  item,
  size = "sm",
  showWhenUnmapped = false,
  className = "",
}: {
  item?: ShopifyStatusSource | null;
  size?: "xs" | "sm" | "md";
  showWhenUnmapped?: boolean;
  className?: string;
}) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const state = shopifyVisualState(item);
  const visibleState = state !== "unmapped";
  const meta = stateMeta[state];

  const tooltipRows = useMemo<TooltipRow[]>(() => {
    const rows: TooltipRow[] = [];
    const add = (label: string, value: unknown) => {
      const text = clean(value);
      if (text) rows.push({ label, value: text });
    };
    add("Shopify termék", item?.shopify_product_title);
    add("Variáns", item?.shopify_variant_title);
    add("Termékállapot", statusText(item?.shopify_product_status));
    add("Szinkron", statusText(item?.shopify_sync_status));
    add("Feldolgozás", statusText(item?.shopify_outbox_status));
    add("Export", statusText(item?.shopify_export_item_status || item?.shopify_export_status));
    add("Exportálva", dateTime(item?.shopify_exported_at));
    add("Párosítva", dateTime(item?.shopify_export_reconciled_at));
    add("Utolsó szinkron", dateTime(item?.shopify_last_synced_at));
    add("Product ID", item?.shopify_product_id);
    add("Variant ID", item?.shopify_variant_id);
    add("Inventory item", item?.shopify_inventory_item_id);
    return rows;
  }, [item]);

  const warnings = useMemo(
    () => (Array.isArray(item?.shopify_export_warnings) ? item.shopify_export_warnings.map(clean).filter(Boolean) : []),
    [item?.shopify_export_warnings]
  );
  const errors = useMemo(() => {
    const values = [
      clean(item?.shopify_last_error),
      clean(item?.shopify_outbox_error),
      ...(Array.isArray(item?.shopify_export_errors) ? item.shopify_export_errors.map(clean) : []),
    ].filter(Boolean);
    return Array.from(new Set(values));
  }, [item?.shopify_last_error, item?.shopify_outbox_error, item?.shopify_export_errors]);

  if (!visibleState && !showWhenUnmapped) return null;

  const dimension = size === "xs" ? "h-6 w-6" : size === "md" ? "h-9 w-9" : "h-7 w-7";
  const iconSize = size === "xs" ? 13 : size === "md" ? 20 : 16;

  function updateTooltipPosition() {
    if (typeof window === "undefined") return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = Math.min(390, Math.max(310, window.innerWidth - 24));
    const sidePadding = 12;
    const estimatedHeight = Math.min(520, 114 + tooltipRows.length * 38 + (warnings.length ? 58 : 0) + (errors.length ? 70 : 0));
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    left = Math.min(Math.max(sidePadding, left), Math.max(sidePadding, window.innerWidth - tooltipWidth - sidePadding));
    const openUp = rect.bottom + estimatedHeight + 12 > window.innerHeight && rect.top > estimatedHeight + 12;
    setTooltipStyle({
      position: "fixed",
      left,
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      width: tooltipWidth,
      transform: openUp ? "translateY(-100%)" : "none",
    });
  }

  function openTooltip() {
    updateTooltipPosition();
    setTooltipOpen(true);
  }

  useEffect(() => {
    if (!tooltipOpen) return;
    updateTooltipPosition();
    const reposition = () => updateTooltipPosition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [tooltipOpen, tooltipRows.length, warnings.length, errors.length]);

  const tooltip = tooltipOpen && typeof document !== "undefined"
    ? createPortal(
        <div
          className="pointer-events-none z-[9999] overflow-hidden rounded-2xl border border-[#95bf47]/70 bg-white text-left text-[11px] leading-snug text-slate-700 shadow-2xl shadow-black/35"
          style={tooltipStyle}
          role="tooltip"
        >
          <div className="flex items-center gap-3 bg-[#008060] px-3 py-2.5 text-white">
            <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white shadow-sm">
              <ShoppingBag size={19} strokeWidth={1.9} className="absolute text-[#008060]" />
              {!imageFailed ? (
                <img
                  src={AIF_SHOPIFY_ICON_URL}
                  alt=""
                  className="relative h-[78%] w-[78%] object-contain"
                  onError={() => setImageFailed(true)}
                />
              ) : null}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/72">Shopify kapcsolat</div>
              <div className="mt-0.5 truncate text-[13px] text-white">{clean(item?.shopify_product_title) || clean(item?.shopify_variant_title) || "Termékkapcsolat"}</div>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] ${meta.badge}`}>
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {state === "synced" ? "Szinkronban" : state === "mapped" ? "Összekötve" : state === "pending" ? "Folyamatban" : state === "error" ? "Hiba" : "Nincs összekötve"}
            </span>
          </div>

          <div className="p-2.5">
            <div className="mb-2 rounded-xl border border-[#d6e9ba] bg-[#f4f9ec] px-2.5 py-2 text-[11px] text-[#42651c]">
              {meta.label}
            </div>

            <div className="space-y-1.5">
              {tooltipRows.length ? tooltipRows.map((row) => (
                <div key={`${row.label}:${row.value}`} className="grid grid-cols-[112px,minmax(0,1fr)] overflow-hidden rounded-xl border border-slate-200 bg-[#f7f8f8]">
                  <div className="bg-[#eef3e8] px-2.5 py-1.5 text-slate-500">{row.label}</div>
                  <div className="min-w-0 truncate px-2.5 py-1.5 text-right tabular-nums text-slate-900" title={row.value}>{row.value}</div>
                </div>
              )) : (
                <div className="rounded-xl border border-slate-200 bg-[#f7f8f8] px-3 py-2 text-slate-500">Nincs további Shopify-adat.</div>
              )}
            </div>

            {warnings.length ? (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                <div className="text-[10px] uppercase tracking-[0.08em] text-amber-700">Figyelmeztetés</div>
                <div className="mt-1 line-clamp-3">{warnings[0]}</div>
              </div>
            ) : null}

            {errors.length ? (
              <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                <div className="text-[10px] uppercase tracking-[0.08em] text-rose-600">Hiba</div>
                <div className="mt-1 line-clamp-4">{errors[0]}</div>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <span
        ref={anchorRef}
        className={`${dimension} relative inline-flex shrink-0 items-center justify-center rounded-lg border bg-white shadow-[0_2px_8px_rgba(15,23,42,0.24)] transition hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(0,128,96,0.30)] focus:outline-none focus:ring-2 focus:ring-[#95bf47]/60 ${meta.border} ${className}`}
        aria-label={meta.label}
        tabIndex={0}
        onMouseEnter={openTooltip}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={openTooltip}
        onBlur={() => setTooltipOpen(false)}
      >
        <ShoppingBag size={iconSize} strokeWidth={1.9} className="absolute text-[#008060]" />
        {!imageFailed ? (
          <img
            src={AIF_SHOPIFY_ICON_URL}
            alt=""
            className="relative h-[78%] w-[78%] object-contain"
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : null}
        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${meta.dot}`} />
      </span>
      {tooltip}
    </>
  );
}
