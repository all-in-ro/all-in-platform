import { ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";

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

const stateMeta: Record<ShopifyVisualState, { label: string; className: string }> = {
  synced: {
    label: "Shopifyhoz kapcsolva és szinkronizálva",
    className: "border-emerald-300/45 bg-emerald-400/18 text-emerald-50",
  },
  mapped: {
    label: "Shopifyhoz kapcsolva",
    className: "border-[#78d9bf]/45 bg-[#2a8d8b]/25 text-[#d7fffd]",
  },
  pending: {
    label: "Shopify export / szinkron folyamatban",
    className: "border-amber-200/50 bg-amber-300/18 text-amber-50",
  },
  error: {
    label: "Shopify szinkronhiba",
    className: "border-rose-300/55 bg-rose-500/20 text-rose-50",
  },
  unmapped: {
    label: "Nincs Shopifyhoz kapcsolva",
    className: "border-white/18 bg-white/[0.06] text-white/45",
  },
};

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
  const [imageFailed, setImageFailed] = useState(false);
  const state = shopifyVisualState(item);
  const visibleState = state !== "unmapped";
  const meta = stateMeta[state];
  const tooltip = useMemo(() => {
    const rows = [meta.label];
    const title = clean(item?.shopify_product_title);
    const variant = clean(item?.shopify_variant_title);
    const productStatus = clean(item?.shopify_product_status);
    const lastSync = dateTime(item?.shopify_last_synced_at);
    const exportedAt = dateTime(item?.shopify_exported_at);
    const exportStatus = clean(item?.shopify_export_item_status || item?.shopify_export_status);
    const exportWarnings = Array.isArray(item?.shopify_export_warnings) ? item.shopify_export_warnings.filter((value) => clean(value)) : [];
    const exportErrors = Array.isArray(item?.shopify_export_errors) ? item.shopify_export_errors.filter((value) => clean(value)) : [];
    const error = clean(item?.shopify_last_error || item?.shopify_outbox_error || exportErrors[0]);
    if (title) rows.push(`Termék: ${title}`);
    if (variant) rows.push(`Variáns: ${variant}`);
    if (productStatus) rows.push(`Shopify állapot: ${productStatus}`);
    if (exportStatus) rows.push(`Export állapot: ${exportStatus}`);
    if (exportedAt) rows.push(`Exportálva: ${exportedAt}`);
    if (lastSync) rows.push(`Utolsó szinkron: ${lastSync}`);
    if (exportWarnings.length) rows.push(`Figyelmeztetés: ${exportWarnings[0]}`);
    if (error) rows.push(`Hiba: ${error}`);
    return rows.join("\n");
  }, [item, meta.label]);

  if (!visibleState && !showWhenUnmapped) return null;

  const dimension = size === "xs" ? "h-5 w-5" : size === "md" ? "h-8 w-8" : "h-6 w-6";
  const iconSize = size === "xs" ? 11 : size === "md" ? 17 : 13;

  return (
    <span
      className={`${dimension} inline-flex shrink-0 items-center justify-center rounded-lg border shadow-sm ${meta.className} ${className}`}
      title={tooltip}
      aria-label={meta.label}
    >
      {!imageFailed ? (
        <img
          src={AIF_SHOPIFY_ICON_URL}
          alt=""
          className="h-[72%] w-[72%] object-contain"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <ShoppingBag size={iconSize} strokeWidth={1.9} />
      )}
    </span>
  );
}
