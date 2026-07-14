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

export function shopifyMappingHasError(item?: ShopifyStatusSource | null) {
  const statuses = [item?.shopify_sync_status, item?.shopify_outbox_status]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
  return Boolean(
    clean(item?.shopify_last_error) ||
      clean(item?.shopify_outbox_error) ||
      statuses.some((status) => ["error", "failed", "blocked"].includes(status))
  );
}

export function shopifyVisualState(item?: ShopifyStatusSource | null): ShopifyVisualState {
  if (!isShopifyMappedItem(item)) return "unmapped";
  if (shopifyMappingHasError(item)) return "error";
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
    label: "Shopify szinkron folyamatban",
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
  const mapped = state !== "unmapped";
  const meta = stateMeta[state];
  const tooltip = useMemo(() => {
    const rows = [meta.label];
    const title = clean(item?.shopify_product_title);
    const variant = clean(item?.shopify_variant_title);
    const productStatus = clean(item?.shopify_product_status);
    const lastSync = dateTime(item?.shopify_last_synced_at);
    const error = clean(item?.shopify_last_error || item?.shopify_outbox_error);
    if (title) rows.push(`Termék: ${title}`);
    if (variant) rows.push(`Variáns: ${variant}`);
    if (productStatus) rows.push(`Shopify állapot: ${productStatus}`);
    if (lastSync) rows.push(`Utolsó szinkron: ${lastSync}`);
    if (error) rows.push(`Hiba: ${error}`);
    return rows.join("\n");
  }, [item, meta.label]);

  if (!mapped && !showWhenUnmapped) return null;

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
