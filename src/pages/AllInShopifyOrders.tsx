import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Bug,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  Eye,
  FileText,
  Globe2,
  Info,
  Mail,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  User,
  X,
} from "lucide-react";
import {
  apiAifGetShopifyOrder,
  apiAifListShopifyOrderEvents,
  apiAifListShopifyOrders,
  type AifShopifyOrderDetail,
  type AifShopifyOrderEvent,
  type AifShopifyOrderLine,
  type AifShopifyOrderSummary,
  type AifShopifyRefund,
  type AifShopifyRefundLine,
} from "../lib/aif/api";

type Props = {
  role?: "admin" | "shop";
};


type LooseRecord = Record<string, any>;

type StockLocation = {
  locationId: string;
  locationCode: string;
  locationName: string;
  qty: number;
  reservedQty: number;
  availableQty: number;
  updatedAt?: string | null;
};

type DisplayOrder = {
  source: AifShopifyOrderSummary;
  id: string;
  number: string;
  createdAt: string | null;
  customer: string;
  customerId: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  country: string;
  amount: number | null;
  currency: string;
  status: string;
  financialStatus: string;
  fulfillmentStatus: string;
  lineCount: number;
  itemQty: number;
  mappedLineCount: number;
  unmappedLineCount: number;
  refundCount: number;
  refundedAmount: number;
  sourceName: string;
  paymentMethod: string;
  shippingMethod: string;
  tags: string[];
  isTest: boolean;
};

type DeleteTarget = {
  ids: string[];
  labels: string[];
};

const fieldClass =
  "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#278674] focus:ring-2 focus:ring-[#278674]/15 font-normal";

const buttonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 font-normal";

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#176b5b] bg-[#176b5b] px-3 text-sm text-white transition hover:bg-[#12594d] disabled:cursor-not-allowed disabled:opacity-50 font-normal";

const dangerButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-600 bg-rose-600 px-3 text-sm text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 font-normal";

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as LooseRecord) : {};
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function firstValue<T = any>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function textValue(...values: unknown[]): string {
  const value = firstValue(...values);
  return value === undefined ? "" : String(value).trim();
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === undefined || value === null || String(value).trim() === "") continue;
    const number = Number(String(value).replace(",", "."));
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function integerValue(...values: unknown[]): number {
  const value = numberValue(...values);
  return value === null ? 0 : Math.max(0, Math.round(value));
}

function boolValue(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["1", "true", "yes", "igen", "da"].includes(normalized)) return true;
    if (["0", "false", "no", "nem", "nu"].includes(normalized)) return false;
  }
  return false;
}

function stringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean);
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function rawOrder(order: AifShopifyOrderSummary | LooseRecord): LooseRecord {
  const source = asRecord(order);
  return {
    ...asRecord(source.payload),
    ...asRecord(source.raw),
  };
}

function customerName(order: AifShopifyOrderSummary | LooseRecord): string {
  const source = asRecord(order);
  const raw = rawOrder(source);
  const customer = asRecord(raw.customer || source.customer);
  const joined = [customer.first_name, customer.last_name]
    .map((value) => textValue(value))
    .filter(Boolean)
    .join(" ");
  return textValue(
    source.customer_name,
    source.customerName,
    source.billing_name,
    source.shipping_name,
    customer.name,
    joined,
    raw.email,
    source.customer_email,
    source.email,
    "Nincs megadva"
  );
}

function customerCompany(source: LooseRecord, raw: LooseRecord): string {
  const shipping = asRecord(firstValue(source.shipping_address, source.shippingAddress, raw.shipping_address));
  const billing = asRecord(firstValue(source.billing_address, source.billingAddress, raw.billing_address));
  const customer = asRecord(raw.customer);
  return textValue(shipping.company, billing.company, customer.company);
}

function customerLocality(source: LooseRecord, raw: LooseRecord) {
  const shipping = asRecord(firstValue(source.shipping_address, source.shippingAddress, raw.shipping_address));
  const billing = asRecord(firstValue(source.billing_address, source.billingAddress, raw.billing_address));
  return {
    city: textValue(shipping.city, billing.city),
    country: textValue(shipping.country, shipping.country_code, billing.country, billing.country_code),
  };
}

function normalizeStockLocations(value: unknown): StockLocation[] {
  return asArray<LooseRecord>(value).map((row) => ({
    locationId: textValue(row.locationId, row.location_id),
    locationCode: textValue(row.locationCode, row.location_code),
    locationName: textValue(row.locationName, row.location_name, row.locationCode, row.location_code, "Helyszín"),
    qty: integerValue(row.qty),
    reservedQty: integerValue(row.reservedQty, row.reserved_qty),
    availableQty: integerValue(row.availableQty, row.available_qty, Number(row.qty || 0) - Number(row.reservedQty || row.reserved_qty || 0)),
    updatedAt: textValue(row.updatedAt, row.updated_at) || null,
  }));
}

function normalizeLine(line: AifShopifyOrderLine | LooseRecord) {
  const source = asRecord(line);
  const raw = { ...asRecord(source.raw), ...source };
  const mappedVariantId = textValue(
    raw.aif_variant_id,
    raw.allin_variant_id,
    raw.mapped_variant_id,
    raw.aifVariantId,
    raw.allInVariantId,
    raw.mappedVariantId
  );
  const mapped = boolValue(raw.mapped, raw.is_mapped, raw.isMapped) || Boolean(mappedVariantId);
  const quantity = integerValue(raw.quantity, raw.current_quantity, raw.qty, 1);
  const currentQuantity = integerValue(raw.current_quantity, raw.quantity, raw.qty, 1);
  const price = numberValue(raw.price, raw.unit_price, raw.original_price);
  const discount = numberValue(raw.total_discount, raw.discount, raw.discount_amount) || 0;
  return {
    source,
    id: textValue(raw.id, raw.shopify_line_item_id, raw.shopifyLineItemId),
    title: textValue(raw.title, raw.name, raw.product_title, "Névtelen termék"),
    variantTitle: textValue(raw.variant_title, raw.variantTitle),
    sku: textValue(raw.sku, raw.shopify_sku),
    vendor: textValue(raw.vendor),
    allInTitle: textValue(raw.aif_title, raw.allin_title, raw.allInTitle, raw.title_ro, raw.aif_shopify_title),
    allInSku: textValue(raw.aif_internal_sku, raw.internal_sku),
    barcode: textValue(raw.aif_barcode, raw.barcode),
    brand: textValue(raw.aif_brand, raw.brand_name),
    color: textValue(raw.aif_color, raw.color_name, raw.color, raw.option1),
    colorCode: textValue(raw.aif_color_code, raw.color_code),
    size: textValue(raw.aif_size, raw.size, raw.option2),
    imageUrl: textValue(raw.aif_image_url, raw.image_url, raw.image),
    quantity,
    currentQuantity,
    price,
    discount,
    fulfillmentStatus: textValue(raw.fulfillment_status, raw.fulfillmentStatus, "unfulfilled"),
    mappedVariantId,
    mapped,
    totalQty: integerValue(raw.aif_total_qty, raw.total_qty),
    reservedQty: integerValue(raw.aif_reserved_qty, raw.reserved_qty),
    availableQty: integerValue(raw.aif_available_qty, raw.available_qty),
    stockLocations: normalizeStockLocations(raw.aif_stock_locations || raw.stock_locations),
  };
}

function normalizeOrder(order: AifShopifyOrderSummary): DisplayOrder {
  const source = asRecord(order);
  const raw = rawOrder(order);
  const lines = asArray<AifShopifyOrderLine>(
    firstValue(source.lines, source.order_lines, source.line_items, raw.line_items, raw.lines) || []
  );
  const normalizedLines = lines.map(normalizeLine);
  const lineCount = integerValue(source.line_count, source.lineCount, source.items_count, normalizedLines.length);
  const derivedMapped = normalizedLines.filter((line) => line.mapped).length;
  const mappedLineCount = integerValue(source.mapped_line_count, source.mappedLineCount, derivedMapped);
  const unmappedLineCount = integerValue(
    source.unmapped_line_count,
    source.unmappedLineCount,
    Math.max(0, lineCount - mappedLineCount)
  );
  const refunds = asArray(firstValue(source.refunds, raw.refunds) || []);
  const number = textValue(source.name, source.order_name, source.order_number, raw.name, raw.order_number, source.id);
  const status = textValue(source.status, raw.cancelled_at ? "cancelled" : raw.closed_at ? "closed" : "open");
  const financialStatus = textValue(source.financial_status, source.financialStatus, raw.financial_status, "unknown");
  const fulfillmentStatus = textValue(
    source.fulfillment_status,
    source.fulfillmentStatus,
    raw.fulfillment_status,
    "unfulfilled"
  );
  const refundedAmount = numberValue(source.refund_total, source.total_refunded, source.refunded_amount, raw.total_refunded) || 0;
  const customer = asRecord(raw.customer);
  const locality = customerLocality(source, raw);
  const paymentGateways = stringArray(raw.payment_gateway_names, raw.payment_gateways);
  const shippingLines = asArray<LooseRecord>(raw.shipping_lines);

  return {
    source: order,
    id: textValue(source.id, source.shopify_order_id, source.shopify_graphql_id),
    number: number || "Rendelés",
    createdAt: textValue(source.shopify_created_at, source.processed_at, source.created_at, raw.processed_at, raw.created_at) || null,
    customer: customerName(order),
    customerId: textValue(customer.admin_graphql_api_id, customer.id),
    email: textValue(source.customer_email, source.email, customer.email, raw.email),
    phone: textValue(source.customer_phone, source.phone, customer.phone, raw.phone),
    company: customerCompany(source, raw),
    city: locality.city,
    country: locality.country,
    amount: numberValue(source.total_price, source.total_amount, source.amount, raw.current_total_price, raw.total_price),
    currency: textValue(source.currency_code, source.currency, raw.currency, "RON").toUpperCase(),
    status,
    financialStatus,
    fulfillmentStatus,
    lineCount,
    itemQty: integerValue(source.item_qty, source.itemQty, normalizedLines.reduce((sum, line) => sum + line.quantity, 0)),
    mappedLineCount,
    unmappedLineCount,
    refundCount: integerValue(source.refund_count, source.refundCount, refunds.length, refundedAmount > 0 ? 1 : 0),
    refundedAmount,
    sourceName: textValue(source.source_name, raw.source_name),
    paymentMethod: paymentGateways.join(", "),
    shippingMethod: shippingLines.map((line) => textValue(line.title, line.code)).filter(Boolean).join(", "),
    tags: stringArray(source.tags, raw.tags),
    isTest:
      boolValue(source.test, source.test_order, raw.test) ||
      /#?AIF-(TEST|LIFE)-/i.test(number),
  };
}

function normalizeDetail(data: AifShopifyOrderDetail, fallback: AifShopifyOrderSummary) {
  const root = asRecord(data);
  const order = (root.item || root.order || root.shopifyOrder || fallback) as AifShopifyOrderSummary;
  const orderRaw = rawOrder(order);
  const lines = asArray<AifShopifyOrderLine>(
    firstValue(root.lines, root.orderLines, root.order_lines, asRecord(order).lines, orderRaw.line_items) || []
  );
  const refundLines = asArray<AifShopifyRefundLine>(firstValue(root.refundLines, root.refund_lines) || []);
  const refunds = asArray<AifShopifyRefund>(
    firstValue(root.refunds, asRecord(order).refunds, orderRaw.refunds) || []
  ).map((refund) => {
    const item = asRecord(refund);
    const ownLines = asArray<AifShopifyRefundLine>(firstValue(item.lines, item.refund_lines) || []);
    return {
      ...item,
      lines: ownLines.length
        ? ownLines
        : refundLines.filter((line) => textValue(asRecord(line).refund_id) === textValue(item.id)),
    } as AifShopifyRefund;
  });
  const events = asArray<AifShopifyOrderEvent>(root.events);
  return { order, lines, refunds, refundLines, events };
}

function dateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dateOnly(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function money(value: number | string | null | undefined, currency = "RON"): string {
  const number = numberValue(value);
  if (number === null) return "-";
  try {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: currency || "RON",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${number.toFixed(2)} ${currency || "RON"}`;
  }
}

function statusLabel(value?: string | null): string {
  const normalized = textValue(value).toLowerCase();
  const labels: Record<string, string> = {
    open: "Nyitott",
    closed: "Lezárt",
    cancelled: "Törölve",
    paid: "Fizetve",
    pending: "Függőben",
    authorized: "Engedélyezve",
    partially_paid: "Részben fizetve",
    partially_refunded: "Részben visszatérítve",
    refunded: "Visszatérítve",
    voided: "Érvénytelenítve",
    fulfilled: "Teljesítve",
    partial: "Részben teljesítve",
    partially_fulfilled: "Részben teljesítve",
    unfulfilled: "Nincs teljesítve",
    restocked: "Visszakészletezve",
    processed: "Feldolgozva",
    received: "Beérkezett",
    ignored: "Kihagyva",
    error: "Hiba",
    failed: "Sikertelen",
    unknown: "Ismeretlen",
  };
  return labels[normalized] || normalized.replace(/_/g, " ") || "-";
}

function badgeClass(value?: string | null): string {
  const normalized = textValue(value).toLowerCase();
  if (["paid", "fulfilled", "processed", "closed", "restocked"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["cancelled", "refunded", "voided", "error", "failed"].includes(normalized)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (["partial", "partially_fulfilled", "partially_paid", "partially_refunded", "pending", "authorized", "received"].includes(normalized)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (["open", "unfulfilled"].includes(normalized)) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }
  return "border-slate-200 bg-white text-slate-600";
}

function Badge({ value, children }: { value?: string | null; children?: string }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[11px] font-normal ${badgeClass(value)}`}>
      {children || statusLabel(value)}
    </span>
  );
}

function TestBadge() {
  return (
    <span className="inline-flex min-h-6 items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 font-normal">
      TESZT
    </span>
  );
}

function formatAddress(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  const address = asRecord(value);
  const name = textValue(address.name, [address.first_name, address.last_name].filter(Boolean).join(" "));
  const street = [textValue(address.address1), textValue(address.address2)].filter(Boolean).join(", ");
  const locality = [textValue(address.zip), textValue(address.city)].filter(Boolean).join(" ");
  const region = [textValue(address.province), textValue(address.country)].filter(Boolean).join(", ");
  return [name, textValue(address.company), street, locality, region, textValue(address.phone)].filter(Boolean);
}

function DetailCard({
  icon,
  title,
  children,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.11em] text-slate-500">
        {icon}
        <span>{title}</span>
      </div>
      <div className="space-y-1.5 text-sm text-slate-700">{children}</div>
    </section>
  );
}

function DataLine({ label, value, valueClass = "" }: { label: string; value: ReactNode; valueClass?: string }) {
  return (
    <div className="flex min-h-7 items-start justify-between gap-4 border-b border-slate-100 py-1 last:border-b-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className={`min-w-0 text-right text-slate-800 ${valueClass}`}>{value || "-"}</span>
    </div>
  );
}

function eventStatusClass(status?: string | null) {
  const normalized = textValue(status).toLowerCase();
  if (["error", "failed"].includes(normalized)) return "border-rose-200 bg-rose-50";
  if (normalized === "processed") return "border-emerald-200 bg-emerald-50";
  if (normalized === "ignored") return "border-slate-200 bg-slate-50";
  return "border-amber-200 bg-amber-50";
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function copyText(value: string) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }
}

export default function AllInShopifyOrders({ role }: Props) {
  const [orders, setOrders] = useState<AifShopifyOrderSummary[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [financialStatus, setFinancialStatus] = useState("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState("");
  const [testMode, setTestMode] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [limit, setLimit] = useState(200);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<DisplayOrder | null>(null);
  const [detail, setDetail] = useState<AifShopifyOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [events, setEvents] = useState<AifShopifyOrderEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiAifListShopifyOrders({
        limit,
        search: search.trim(),
        status: status || undefined,
      });
      setOrders(Array.isArray(data?.items) ? data.items : []);
    } catch (requestError) {
      setOrders([]);
      setError(requestError instanceof Error ? requestError.message : "A Shopify rendelések betöltése nem sikerült.");
    } finally {
      setLoading(false);
    }
  }, [limit, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOrders();
    }, search.trim() ? 320 : 0);
    return () => window.clearTimeout(timer);
  }, [loadOrders, refreshToken]);

  useEffect(() => {
    if (!selected && !deleteTarget) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (deleteTarget && !deleteLoading) {
        closeDeleteDialog();
        return;
      }
      if (selected) closeDetail();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [selected, deleteTarget, deleteLoading]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!diagnosticsOpen || role !== "admin" || eventsLoading || events.length) return;
    setEventsLoading(true);
    setEventsError("");
    apiAifListShopifyOrderEvents({ limit: 80 })
      .then((data) => setEvents(Array.isArray(data?.items) ? data.items : []))
      .catch((requestError) => {
        setEventsError(requestError instanceof Error ? requestError.message : "Az eseménylista betöltése nem sikerült.");
      })
      .finally(() => setEventsLoading(false));
  }, [diagnosticsOpen, events.length, eventsLoading, role]);

  const normalizedOrders = useMemo(() => orders.map(normalizeOrder), [orders]);

  const visibleOrders = useMemo(() => {
    const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTime = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;
    return normalizedOrders.filter((order) => {
      if (onlyProblems && order.unmappedLineCount <= 0) return false;
      if (financialStatus && order.financialStatus.toLowerCase() !== financialStatus) return false;
      if (fulfillmentStatus && order.fulfillmentStatus.toLowerCase() !== fulfillmentStatus) return false;
      if (testMode === "test" && !order.isTest) return false;
      if (testMode === "real" && order.isTest) return false;
      if (!order.createdAt || (fromTime === null && toTime === null)) return true;
      const created = new Date(order.createdAt).getTime();
      if (!Number.isFinite(created)) return true;
      if (fromTime !== null && created < fromTime) return false;
      if (toTime !== null && created > toTime) return false;
      return true;
    });
  }, [normalizedOrders, onlyProblems, financialStatus, fulfillmentStatus, testMode, fromDate, toDate]);

  const overview = useMemo(() => {
    return visibleOrders.reduce(
      (acc, order) => {
        if (order.status.toLowerCase() === "open") acc.open += 1;
        if (order.financialStatus.toLowerCase() === "paid") acc.paid += 1;
        if (["unfulfilled", "", "unknown"].includes(order.fulfillmentStatus.toLowerCase())) acc.unfulfilled += 1;
        if (order.unmappedLineCount > 0) acc.problem += 1;
        if (order.refundCount > 0 || order.refundedAmount > 0) acc.refund += 1;
        if (order.isTest) acc.test += 1;
        if (order.currency === "RON" && order.amount !== null) acc.ronTotal += order.amount;
        return acc;
      },
      { open: 0, paid: 0, unfulfilled: 0, problem: 0, refund: 0, test: 0, ronTotal: 0 }
    );
  }, [visibleOrders]);

  const diagnostics = useMemo(() => {
    const failed = events.filter((event) => ["error", "failed"].includes(textValue(asRecord(event).status).toLowerCase())).length;
    const pending = events.filter((event) => ["pending", "received", "processing"].includes(textValue(asRecord(event).status).toLowerCase())).length;
    return { failed, pending };
  }, [events]);

  const allVisibleSelected = visibleOrders.length > 0 && visibleOrders.every((order) => selectedIds.has(order.id));

  async function openOrder(order: DisplayOrder) {
    setSelected(order);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const data = await apiAifGetShopifyOrder(order.id);
      setDetail(data);
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : "A rendelés részleteinek betöltése nem sikerült.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelected(null);
    setDetail(null);
    setDetailError("");
  }

  function toggleSelected(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) visibleOrders.forEach((order) => next.delete(order.id));
      else visibleOrders.forEach((order) => next.add(order.id));
      return next;
    });
  }

  function openDeleteDialog(target: DeleteTarget) {
    if (role !== "admin" || !target.ids.length) return;
    setDeleteTarget(target);
    setDeleteReason(target.ids.length > 1 ? "Kijelölt rendelések végleges törlése" : "Rendelés végleges törlése");
    setDeleteConfirmation("");
    setDeleteAcknowledged(false);
    setDeleteError("");
  }

  function closeDeleteDialog() {
    if (deleteLoading) return;
    setDeleteTarget(null);
    setDeleteReason("");
    setDeleteConfirmation("");
    setDeleteAcknowledged(false);
    setDeleteError("");
  }

  async function confirmPermanentDelete() {
    if (!deleteTarget || role !== "admin") return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const response = await fetch("/api/aif/shopify/orders/delete-batch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: deleteTarget.ids,
          confirmation: deleteConfirmation,
          reason: deleteReason,
        }),
      });
      const text = await response.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!response.ok) throw new Error(textValue(data?.error, data?.message, data, `HTTP ${response.status}`));

      const deletedIds = new Set(deleteTarget.ids);
      setOrders((previous) => previous.filter((order) => !deletedIds.has(normalizeOrder(order).id)));
      setSelectedIds((previous) => {
        const next = new Set(previous);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
      if (selected && deletedIds.has(selected.id)) closeDetail();
      setNotice(`${Number(data?.deleted ?? deleteTarget.ids.length)} rendelés végleg törölve az AllInből. A készlet nem változott.`);
      setDeleteTarget(null);
      setRefreshToken((value) => value + 1);
      if (diagnosticsOpen) setEvents([]);
    } catch (requestError) {
      setDeleteError(requestError instanceof Error ? requestError.message : "A végleges törlés nem sikerült.");
    } finally {
      setDeleteLoading(false);
    }
  }

  function exportVisibleCsv() {
    const headers = [
      "Rendelés",
      "Dátum",
      "Vevő",
      "Cég",
      "E-mail",
      "Telefon",
      "Város",
      "Ország",
      "Összeg",
      "Pénznem",
      "Fizetés",
      "Teljesítés",
      "Tételek",
      "Darab",
      "Párosítatlan",
      "Refund",
      "Teszt",
    ];
    const lines = visibleOrders.map((order) => [
      order.number,
      order.createdAt || "",
      order.customer,
      order.company,
      order.email,
      order.phone,
      order.city,
      order.country,
      order.amount ?? "",
      order.currency,
      statusLabel(order.financialStatus),
      statusLabel(order.fulfillmentStatus),
      order.lineCount,
      order.itemQty,
      order.unmappedLineCount,
      order.refundedAmount,
      order.isTest ? "igen" : "nem",
    ]);
    const csv = "\ufeff" + [headers, ...lines].map((row) => row.map(csvCell).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shopify_rendelesek_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  const detailData = selected && detail ? normalizeDetail(detail, selected.source) : null;
  const detailOrder = detailData ? normalizeOrder(detailData.order) : selected;
  const detailRaw = detailData ? rawOrder(detailData.order) : selected ? rawOrder(selected.source) : {};
  const detailSource = detailData ? asRecord(detailData.order) : selected ? asRecord(selected.source) : {};
  const customer = asRecord(detailRaw.customer);
  const shippingAddress = detailData
    ? firstValue(detailSource.shipping_address, detailSource.shippingAddress, detailRaw.shipping_address)
    : null;
  const billingAddress = detailData
    ? firstValue(detailSource.billing_address, detailSource.billingAddress, detailRaw.billing_address)
    : null;
  const defaultAddress = firstValue(customer.default_address, customer.defaultAddress);
  const detailLines = detailData?.lines.map(normalizeLine) || [];
  const paymentGateways = stringArray(detailRaw.payment_gateway_names, detailRaw.payment_gateways);
  const shippingLines = asArray<LooseRecord>(detailRaw.shipping_lines);
  const orderTags = stringArray(detailSource.tags, detailRaw.tags);

  const subtotal = numberValue(detailSource.subtotal_price, detailRaw.current_subtotal_price, detailRaw.subtotal_price);
  const discounts = numberValue(detailSource.total_discounts, detailRaw.current_total_discounts, detailRaw.total_discounts) || 0;
  const shippingTotal = numberValue(
    detailSource.total_shipping,
    asRecord(asRecord(detailRaw.total_shipping_price_set).shop_money).amount,
    detailRaw.total_shipping_price
  ) || 0;
  const tax = numberValue(detailSource.total_tax, detailRaw.current_total_tax, detailRaw.total_tax) || 0;
  const outstanding = numberValue(detailRaw.total_outstanding) || 0;

  const selectedLabels = normalizedOrders.filter((order) => selectedIds.has(order.id)).map((order) => order.number);

  return (
    <div className="min-h-screen bg-[#eef2f5] px-3 py-4 text-slate-800 sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1680px] space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className={buttonClass}
                onClick={() => (window.location.hash = "#allin")}
                aria-label="Vissza a főmenübe"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Vissza</span>
              </button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e5f4f0] text-[#176b5b]">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.13em] text-slate-400">AllInFashion • Shopify</div>
                <h1 className="truncate text-lg font-medium tracking-wide text-slate-900 sm:text-xl">RENDELÉSKEZELŐ</h1>
                <p className="mt-0.5 text-xs text-slate-500">Vevők, tételek, fizetések, teljesítések, refundok és készletkapcsolatok</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={buttonClass} onClick={exportVisibleCsv} disabled={!visibleOrders.length}>
                <Download className="h-4 w-4" />
                Export
              </button>
              {role === "admin" && (
                <button
                  type="button"
                  className={`${buttonClass} ${diagnosticsOpen ? "border-amber-300 bg-amber-50 text-amber-800" : ""}`}
                  onClick={() => setDiagnosticsOpen((value) => !value)}
                >
                  <Bug className="h-4 w-4" />
                  Diagnosztika
                  {(diagnostics.failed > 0 || diagnostics.pending > 0) && (
                    <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">
                      {diagnostics.failed + diagnostics.pending}
                    </span>
                  )}
                </button>
              )}
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => {
                  setRefreshToken((value) => value + 1);
                  if (diagnosticsOpen && role === "admin") setEvents([]);
                }}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Frissítés
              </button>
            </div>
          </div>
        </header>

        {notice && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.11em] text-slate-400">Megjelenítve</div>
            <div className="mt-1 text-2xl font-medium text-slate-900">{visibleOrders.length}</div>
            <div className="mt-1 text-xs text-slate-400">Betöltve: {normalizedOrders.length}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.11em] text-slate-400">Fizetve</div>
            <div className="mt-1 text-2xl font-medium text-emerald-700">{overview.paid}</div>
            <div className="mt-1 text-xs text-slate-400">Nyitott: {overview.open}</div>
          </div>
          <div className="rounded-xl border border-sky-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.11em] text-slate-400">Teljesítésre vár</div>
            <div className="mt-1 text-2xl font-medium text-sky-700">{overview.unfulfilled}</div>
            <div className="mt-1 text-xs text-slate-400">Rendelési sor</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.11em] text-slate-400">Párosítási hiba</div>
            <div className="mt-1 text-2xl font-medium text-amber-700">{overview.problem}</div>
            <div className="mt-1 text-xs text-slate-400">AllIn termékkapcsolat</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.11em] text-slate-400">Refund / teszt</div>
            <div className="mt-1 flex items-baseline gap-2 text-2xl font-medium text-rose-700">
              <span>{overview.refund}</span>
              <span className="text-sm text-slate-400">/ {overview.test}</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">Visszatérítés / tesztadat</div>
          </div>
          <div className="rounded-xl border border-[#b8ded5] bg-white px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-[0.11em] text-slate-400">Forgalom</div>
            <div className="mt-1 text-xl font-medium text-[#176b5b]">{money(overview.ronTotal, "RON")}</div>
            <div className="mt-1 text-xs text-slate-400">Látható RON rendelések</div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_145px_155px_170px_130px_130px_110px_auto] xl:items-end">
            <label className="relative block md:col-span-2 xl:col-span-1">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.09em] text-slate-400">Keresés</span>
              <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-slate-400" />
              <input
                className={`${fieldClass} w-full pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rendelésszám, vevő, cég, e-mail, telefon vagy SKU"
              />
            </label>

            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.09em] text-slate-400">Rendelés</span>
              <select className={`${fieldClass} w-full`} value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Minden</option>
                <option value="open">Nyitott</option>
                <option value="closed">Lezárt</option>
                <option value="cancelled">Törölt</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.09em] text-slate-400">Fizetés</span>
              <select className={`${fieldClass} w-full`} value={financialStatus} onChange={(event) => setFinancialStatus(event.target.value)}>
                <option value="">Minden</option>
                <option value="paid">Fizetve</option>
                <option value="pending">Függőben</option>
                <option value="authorized">Engedélyezve</option>
                <option value="partially_paid">Részben fizetve</option>
                <option value="refunded">Visszatérítve</option>
                <option value="partially_refunded">Részben visszatérítve</option>
                <option value="voided">Érvénytelenítve</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.09em] text-slate-400">Teljesítés</span>
              <select className={`${fieldClass} w-full`} value={fulfillmentStatus} onChange={(event) => setFulfillmentStatus(event.target.value)}>
                <option value="">Minden</option>
                <option value="unfulfilled">Nincs teljesítve</option>
                <option value="partial">Részben teljesítve</option>
                <option value="partially_fulfilled">Részben teljesítve</option>
                <option value="fulfilled">Teljesítve</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.09em] text-slate-400">Dátumtól</span>
              <input type="date" className={`${fieldClass} w-full`} value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </label>

            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.09em] text-slate-400">Dátumig</span>
              <input type="date" className={`${fieldClass} w-full`} value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </label>

            <label>
              <span className="mb-1 block text-[10px] uppercase tracking-[0.09em] text-slate-400">Típus</span>
              <select className={`${fieldClass} w-full`} value={testMode} onChange={(event) => setTestMode(event.target.value)}>
                <option value="">Mind</option>
                <option value="real">Valódi</option>
                <option value="test">Teszt</option>
              </select>
            </label>

            <div className="flex items-end gap-2">
              <label className="min-w-[95px] flex-1">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.09em] text-slate-400">Limit</span>
                <select className={`${fieldClass} w-full`} value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={onlyProblems}
                onChange={(event) => setOnlyProblems(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-[#176b5b]"
              />
              Csak párosítási hibák
            </label>
            <button
              type="button"
              className="h-9 rounded-lg px-3 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              onClick={() => {
                setStatus("");
                setFinancialStatus("");
                setFulfillmentStatus("");
                setTestMode("");
                setFromDate("");
                setToDate("");
                setOnlyProblems(false);
                setSearch("");
              }}
            >
              Szűrők törlése
            </button>
          </div>
        </section>

        {selectedIds.size > 0 && (
          <section className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#a7d5ca] bg-[#edf8f5] px-4 py-3 shadow-lg shadow-slate-300/30">
            <div className="flex items-center gap-3 text-sm text-[#155c50]">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#176b5b] px-2 text-xs text-white">{selectedIds.size}</span>
              <span>Kijelölt rendelés</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={buttonClass} onClick={() => setSelectedIds(new Set())}>Kijelölés megszüntetése</button>
              {role === "admin" && (
                <button
                  type="button"
                  className={dangerButtonClass}
                  onClick={() => openDeleteDialog({ ids: Array.from(selectedIds), labels: selectedLabels })}
                >
                  <Trash2 className="h-4 w-4" />
                  Végleges törlés
                </button>
              )}
            </div>
          </section>
        )}

        {diagnosticsOpen && role === "admin" && (
          <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <Bug className="h-4 w-4 text-amber-600" />
                  Shopify rendelési webhook diagnosztika
                </div>
                <div className="mt-1 text-xs text-slate-500">Az utolsó 80 rendelési esemény és feldolgozási eredmény</div>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">Hiba: {diagnostics.failed}</span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">Folyamatban: {diagnostics.pending}</span>
              </div>
            </div>

            {eventsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                <RefreshCw className="h-4 w-4 animate-spin" /> Események betöltése...
              </div>
            ) : eventsError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{eventsError}</div>
            ) : events.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">Nincs megjeleníthető esemény.</div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {events.map((event, index) => {
                  const item = asRecord(event);
                  const eventStatus = textValue(item.status, "unknown");
                  return (
                    <div key={textValue(item.id, item.webhook_id, item.shopify_webhook_id, index)} className={`grid gap-2 rounded-lg border px-3 py-2 text-xs md:grid-cols-[230px_125px_85px_1fr] ${eventStatusClass(eventStatus)}`}>
                      <div>
                        <div className="text-slate-800">{textValue(item.topic, "ismeretlen téma")}</div>
                        <div className="mt-0.5 text-slate-400">{dateTime(textValue(item.received_at, item.created_at))}</div>
                      </div>
                      <div><Badge value={eventStatus} /></div>
                      <div className="text-slate-500">Próba: {integerValue(item.attempts)}</div>
                      <div className={item.error ? "text-rose-700" : "text-slate-500"}>{textValue(item.error, "Nincs hiba")}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {error && (
            <div className="m-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500">
              <RefreshCw className="h-5 w-5 animate-spin" /> Shopify rendelések betöltése...
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center">
              <ShoppingBag className="h-10 w-10 text-slate-300" />
              <div className="mt-3 text-sm text-slate-600">Nincs a szűrésnek megfelelő rendelés.</div>
              <div className="mt-1 text-xs text-slate-400">Módosítsd a szűrőket, vagy frissítsd a listát.</div>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1440px] border-collapse text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="w-12 px-4 py-3 font-normal">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          className="h-4 w-4 rounded border-slate-300 accent-[#176b5b]"
                          aria-label="Minden látható rendelés kijelölése"
                        />
                      </th>
                      <th className="px-2 py-3 font-normal">Rendelés</th>
                      <th className="px-3 py-3 font-normal">Dátum</th>
                      <th className="px-3 py-3 font-normal">Vevő / kapcsolat</th>
                      <th className="px-3 py-3 font-normal">Hely</th>
                      <th className="px-3 py-3 text-right font-normal">Összeg</th>
                      <th className="px-3 py-3 font-normal">Fizetés</th>
                      <th className="px-3 py-3 font-normal">Teljesítés</th>
                      <th className="px-3 py-3 text-center font-normal">Tételek</th>
                      <th className="px-3 py-3 font-normal">AllIn kapcsolat</th>
                      <th className="w-28 px-3 py-3 text-right font-normal">Művelet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleOrders.map((order) => (
                      <tr
                        key={order.id}
                        className={`group cursor-pointer transition hover:bg-[#f5faf8] ${selectedIds.has(order.id) ? "bg-[#edf8f5]" : "bg-white"}`}
                        onClick={() => void openOrder(order)}
                      >
                        <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(order.id)}
                            onChange={() => toggleSelected(order.id)}
                            className="h-4 w-4 rounded border-slate-300 accent-[#176b5b]"
                            aria-label={`${order.number} kijelölése`}
                          />
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{order.number}</span>
                            {order.isTest && <TestBadge />}
                            <Badge value={order.status} />
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-400">{order.sourceName || order.paymentMethod || "Shopify"}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <div className="text-slate-700">{dateOnly(order.createdAt)}</div>
                          <div className="mt-0.5 text-xs text-slate-400">{order.createdAt ? dateTime(order.createdAt).split(" ").slice(-1)[0] : "-"}</div>
                        </td>
                        <td className="max-w-[275px] px-3 py-3">
                          <div className="truncate text-slate-800">{order.customer}</div>
                          {order.company && <div className="truncate text-xs text-slate-500">{order.company}</div>}
                          <div className="mt-0.5 truncate text-xs text-slate-400">{order.email || order.phone || "Nincs kapcsolati adat"}</div>
                        </td>
                        <td className="max-w-[180px] px-3 py-3">
                          <div className="truncate text-slate-700">{order.city || "-"}</div>
                          <div className="truncate text-xs text-slate-400">{order.country || "-"}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          <div className="text-slate-900">{money(order.amount, order.currency)}</div>
                          {order.refundedAmount > 0 && <div className="mt-0.5 text-xs text-rose-600">Refund: {money(order.refundedAmount, order.currency)}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <Badge value={order.financialStatus} />
                          {order.paymentMethod && <div className="mt-1 max-w-[160px] truncate text-xs text-slate-400">{order.paymentMethod}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <Badge value={order.fulfillmentStatus} />
                          {order.shippingMethod && <div className="mt-1 max-w-[170px] truncate text-xs text-slate-400">{order.shippingMethod}</div>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="text-slate-800">{order.lineCount} sor</div>
                          <div className="text-xs text-slate-400">{order.itemQty} db</div>
                        </td>
                        <td className="px-3 py-3">
                          {order.unmappedLineCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" /> {order.unmappedLineCount} nincs párosítva
                            </span>
                          ) : order.lineCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" /> {order.mappedLineCount}/{order.lineCount} rendben
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Nincs tétel</span>
                          )}
                        </td>
                        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                              onClick={() => void openOrder(order)}
                              title="Részletek"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {role === "admin" && (
                              <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-700"
                                onClick={() => openDeleteDialog({ ids: [order.id], labels: [order.number] })}
                                title="Végleges törlés"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition group-hover:text-slate-700"
                              onClick={() => void openOrder(order)}
                              title="Megnyitás"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 lg:hidden">
                {visibleOrders.map((order) => (
                  <div key={order.id} className={selectedIds.has(order.id) ? "bg-[#edf8f5]" : "bg-white"}>
                    <button
                      type="button"
                      className="block w-full p-4 text-left transition hover:bg-slate-50"
                      onClick={() => void openOrder(order)}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(order.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleSelected(order.id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#176b5b]"
                          aria-label={`${order.number} kijelölése`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{order.number}</span>
                            {order.isTest && <TestBadge />}
                            <Badge value={order.status} />
                          </div>
                          <div className="mt-1 truncate text-sm text-slate-700">{order.customer}</div>
                          <div className="mt-0.5 truncate text-xs text-slate-400">{order.email || order.phone || "Nincs kapcsolati adat"}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm text-slate-900">{money(order.amount, order.currency)}</div>
                          <div className="mt-1 text-xs text-slate-400">{dateOnly(order.createdAt)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
                        <Badge value={order.financialStatus} />
                        <Badge value={order.fulfillmentStatus} />
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">{order.lineCount} sor / {order.itemQty} db</span>
                        {order.unmappedLineCount > 0 ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">{order.unmappedLineCount} nincs párosítva</span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Párosítás rendben</span>
                        )}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-2 backdrop-blur-sm sm:p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDetail();
          }}
        >
          <div className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#f4f7f9] shadow-2xl shadow-slate-900/30">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e5f4f0] text-[#176b5b]">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-medium text-slate-900">{detailOrder?.number || selected.number}</h2>
                      {detailOrder?.isTest && <TestBadge />}
                      <Badge value={detailOrder?.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">{dateTime(detailOrder?.createdAt)}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {role === "admin" && detailOrder && (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm text-rose-700 transition hover:bg-rose-50"
                    onClick={() => openDeleteDialog({ ids: [detailOrder.id], labels: [detailOrder.number] })}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Végleges törlés</span>
                  </button>
                )}
                <button type="button" className={`${buttonClass} h-9 w-9 px-0`} onClick={closeDetail} aria-label="Bezárás">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-3 sm:p-5">
              {detailLoading ? (
                <div className="flex min-h-80 items-center justify-center gap-3 text-sm text-slate-500">
                  <RefreshCw className="h-5 w-5 animate-spin" /> Rendelés részleteinek betöltése...
                </div>
              ) : detailError ? (
                <div className="flex min-h-52 items-center justify-center">
                  <div className="max-w-xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{detailError}</div>
                </div>
              ) : detailData && detailOrder ? (
                <div className="space-y-4">
                  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Végösszeg</div>
                      <div className="mt-1 text-xl text-slate-900">{money(detailOrder.amount, detailOrder.currency)}</div>
                      <div className="mt-2"><Badge value={detailOrder.financialStatus} /></div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Teljesítés</div>
                      <div className="mt-2"><Badge value={detailOrder.fulfillmentStatus} /></div>
                      <div className="mt-2 text-xs text-slate-500">{detailOrder.shippingMethod || "Szállítási mód nincs megadva"}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Tételek</div>
                      <div className="mt-1 text-xl text-slate-900">{detailLines.length} sor / {detailLines.reduce((sum, line) => sum + line.quantity, 0)} db</div>
                      <div className="mt-2 text-xs text-slate-500">{detailLines.filter((line) => !line.mapped).length} párosítatlan</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Visszatérítés</div>
                      <div className="mt-1 text-xl text-slate-900">{money(detailOrder.refundedAmount, detailOrder.currency)}</div>
                      <div className="mt-2 text-xs text-slate-500">{detailData.refunds.length} refund</div>
                    </div>
                    <div className="rounded-xl border border-[#b8ded5] bg-[#f3fbf8] p-4 shadow-sm">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-[#4d8075]">Készletkezelés</div>
                      <div className="mt-2 flex items-center gap-2 text-sm text-[#155c50]"><ShieldCheck className="h-4 w-4" /> Inventory webhook</div>
                      <div className="mt-2 text-xs text-[#4d8075]">A rendelési rekord törlése nem módosít készletet.</div>
                    </div>
                  </section>

                  <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr_1fr]">
                    <DetailCard icon={<User className="h-4 w-4" />} title="Vevő és Shopify ügyféladatok">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base text-slate-900">{detailOrder.customer}</div>
                          {detailOrder.company && <div className="mt-0.5 text-slate-500">{detailOrder.company}</div>}
                        </div>
                        {detailOrder.customerId && (
                          <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => void copyText(detailOrder.customerId)} title="Ügyfélazonosító másolása">
                            <Copy className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {detailOrder.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400" /><a href={`mailto:${detailOrder.email}`} className="break-all text-[#176b5b] hover:underline">{detailOrder.email}</a></div>}
                      {detailOrder.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" /><a href={`tel:${detailOrder.phone}`} className="text-[#176b5b] hover:underline">{detailOrder.phone}</a></div>}
                      <div className="mt-3 border-t border-slate-100 pt-2">
                        <DataLine label="Shopify ügyfél ID" value={detailOrder.customerId || "-"} valueClass="max-w-[230px] truncate font-mono text-xs" />
                        <DataLine label="Korábbi rendelések" value={textValue(customer.orders_count, customer.number_of_orders) || "-"} />
                        <DataLine label="Összes költés" value={customer.total_spent ? money(customer.total_spent, textValue(customer.currency, detailOrder.currency)) : "-"} />
                        <DataLine label="E-mail ellenőrizve" value={customer.verified_email === undefined ? "-" : boolValue(customer.verified_email) ? "Igen" : "Nem"} />
                        <DataLine label="Marketing" value={customer.accepts_marketing === undefined ? "-" : boolValue(customer.accepts_marketing) ? "Hozzájárult" : "Nem járult hozzá"} />
                        <DataLine label="Adómentes" value={customer.tax_exempt === undefined ? "-" : boolValue(customer.tax_exempt) ? "Igen" : "Nem"} />
                        <DataLine label="Ügyfél státusz" value={statusLabel(textValue(customer.state))} />
                      </div>
                    </DetailCard>

                    <DetailCard icon={<MapPin className="h-4 w-4" />} title="Szállítási cím">
                      {formatAddress(shippingAddress).length ? formatAddress(shippingAddress).map((line, index) => <div key={`${line}-${index}`}>{line}</div>) : <div className="text-slate-400">Nincs megadva</div>}
                      {asRecord(shippingAddress).latitude && asRecord(shippingAddress).longitude && (
                        <div className="mt-3 text-xs text-slate-400">GPS: {asRecord(shippingAddress).latitude}, {asRecord(shippingAddress).longitude}</div>
                      )}
                    </DetailCard>

                    <DetailCard icon={<Building2 className="h-4 w-4" />} title="Számlázási cím">
                      {formatAddress(billingAddress).length ? formatAddress(billingAddress).map((line, index) => <div key={`${line}-${index}`}>{line}</div>) : <div className="text-slate-400">Nincs megadva</div>}
                      {formatAddress(defaultAddress).length > 0 && JSON.stringify(defaultAddress) !== JSON.stringify(billingAddress) && (
                        <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <summary className="cursor-pointer text-xs text-slate-600">Shopify alapértelmezett cím</summary>
                          <div className="mt-2 space-y-1 text-xs text-slate-600">{formatAddress(defaultAddress).map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</div>
                        </details>
                      )}
                    </DetailCard>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-3">
                    <DetailCard icon={<CreditCard className="h-4 w-4" />} title="Pénzügyi bontás">
                      <DataLine label="Részösszeg" value={money(subtotal, detailOrder.currency)} />
                      <DataLine label="Kedvezmény" value={money(discounts, detailOrder.currency)} valueClass={discounts > 0 ? "text-rose-600" : ""} />
                      <DataLine label="Szállítás" value={money(shippingTotal, detailOrder.currency)} />
                      <DataLine label="Adó" value={money(tax, detailOrder.currency)} />
                      <DataLine label="Végösszeg" value={money(detailOrder.amount, detailOrder.currency)} valueClass="font-medium" />
                      <DataLine label="Visszatérítve" value={money(detailOrder.refundedAmount, detailOrder.currency)} valueClass={detailOrder.refundedAmount > 0 ? "text-rose-600" : ""} />
                      <DataLine label="Fennmaradó összeg" value={money(outstanding, detailOrder.currency)} />
                      <DataLine label="Fizetési mód" value={paymentGateways.join(", ") || detailOrder.paymentMethod || "-"} />
                    </DetailCard>

                    <DetailCard icon={<Truck className="h-4 w-4" />} title="Szállítás és forrás">
                      <DataLine label="Forrás" value={textValue(detailSource.source_name, detailRaw.source_name, "Shopify")} />
                      <DataLine label="Szállítás" value={shippingLines.map((line) => textValue(line.title, line.code)).filter(Boolean).join(", ") || "-"} />
                      <DataLine label="Szállítási ár" value={shippingLines.length ? money(shippingLines.reduce((sum, line) => sum + Number(line.price || 0), 0), detailOrder.currency) : "-"} />
                      <DataLine label="Nyelv" value={textValue(detailRaw.customer_locale, detailRaw.locale) || "-"} />
                      <DataLine label="Áruház / csatorna" value={textValue(detailRaw.app_id, detailRaw.source_identifier, detailRaw.source_name) || "-"} />
                      <DataLine label="Referencia" value={textValue(detailRaw.referring_site) || "-"} valueClass="max-w-[260px] truncate" />
                    </DetailCard>

                    <DetailCard icon={<CalendarDays className="h-4 w-4" />} title="Rendelési idővonal">
                      <DataLine label="Létrehozva" value={dateTime(textValue(detailSource.shopify_created_at, detailRaw.created_at))} />
                      <DataLine label="Feldolgozva" value={dateTime(textValue(detailSource.processed_at, detailRaw.processed_at))} />
                      <DataLine label="Frissítve" value={dateTime(textValue(detailSource.shopify_updated_at, detailRaw.updated_at))} />
                      <DataLine label="Lezárva" value={dateTime(textValue(detailSource.closed_at, detailRaw.closed_at))} />
                      <DataLine label="Törölve" value={dateTime(textValue(detailSource.cancelled_at, detailRaw.cancelled_at))} />
                      <DataLine label="Törlés oka" value={textValue(detailSource.cancel_reason, detailRaw.cancel_reason) || "-"} />
                    </DetailCard>
                  </div>

                  {(textValue(detailSource.note, detailRaw.note) || orderTags.length > 0) && (
                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.11em] text-slate-500"><FileText className="h-4 w-4" /> Megjegyzések és címkék</div>
                      {textValue(detailSource.note, detailRaw.note) && <div className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{textValue(detailSource.note, detailRaw.note)}</div>}
                      {orderTags.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{orderTags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"><Tag className="h-3 w-3" />{tag}</span>)}</div>}
                    </section>
                  )}

                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-800"><Package className="h-4 w-4 text-[#176b5b]" /> Terméksorok és aktuális AllIn készlet</div>
                        <div className="mt-1 text-xs text-slate-400">A készletadat valós idejű AllIn állapot, nem a rendelési rekordból számolt érték.</div>
                      </div>
                      <div className="text-xs text-slate-500">{detailLines.length} sor, {detailLines.filter((line) => !line.mapped).length} párosítatlan</div>
                    </div>
                    {detailLines.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-slate-400">Nincs terméksor.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1260px] text-left text-sm">
                          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                            <tr>
                              <th className="px-4 py-3 font-normal">Shopify termék</th>
                              <th className="px-3 py-3 font-normal">Shopify SKU</th>
                              <th className="px-3 py-3 font-normal">AllIn termék</th>
                              <th className="px-3 py-3 text-center font-normal">Rendelt</th>
                              <th className="px-3 py-3 text-right font-normal">Egységár</th>
                              <th className="px-3 py-3 font-normal">AllIn készlet</th>
                              <th className="px-3 py-3 font-normal">Helyszínek</th>
                              <th className="px-3 py-3 font-normal">Párosítás</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {detailLines.map((line, index) => (
                              <tr key={line.id || `${line.sku}-${index}`} className="align-top">
                                <td className="px-4 py-3">
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                      {line.imageUrl ? <img src={line.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Box className="h-5 w-5 text-slate-300" />}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="max-w-[260px] text-slate-900">{line.title}</div>
                                      <div className="mt-1 text-xs text-slate-400">{[line.vendor, line.variantTitle].filter(Boolean).join(" • ") || "-"}</div>
                                      {line.discount > 0 && <div className="mt-1 text-xs text-rose-600">Kedvezmény: {money(line.discount, detailOrder.currency)}</div>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="font-mono text-xs text-slate-700">{line.sku || "-"}</div>
                                  <div className="mt-1 text-xs text-slate-400">{line.fulfillmentStatus ? statusLabel(line.fulfillmentStatus) : "-"}</div>
                                </td>
                                <td className="px-3 py-3">
                                  <div className={line.mapped ? "text-slate-800" : "text-amber-700"}>{line.allInTitle || (line.mapped ? line.allInSku || "Párosítva" : "Nincs AllIn termék")}</div>
                                  <div className="mt-1 space-y-0.5 text-xs text-slate-400">
                                    {line.brand && <div>{line.brand}</div>}
                                    <div>{[line.color, line.size].filter(Boolean).join(" / ") || "-"}</div>
                                    {line.allInSku && <div className="font-mono">SKU: {line.allInSku}</div>}
                                    {line.barcode && <div className="font-mono">EAN: {line.barcode}</div>}
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <div className="text-slate-900">{line.quantity} db</div>
                                  {line.currentQuantity !== line.quantity && <div className="mt-1 text-xs text-slate-400">Aktív: {line.currentQuantity}</div>}
                                </td>
                                <td className="px-3 py-3 text-right text-slate-900">{money(line.price, detailOrder.currency)}</td>
                                <td className="px-3 py-3">
                                  {line.mapped ? (
                                    <div className="space-y-1 text-xs">
                                      <div className="flex items-center justify-between gap-3"><span className="text-slate-400">Összes</span><span className="text-slate-800">{line.totalQty}</span></div>
                                      <div className="flex items-center justify-between gap-3"><span className="text-slate-400">Foglalt</span><span className="text-amber-700">{line.reservedQty}</span></div>
                                      <div className="flex items-center justify-between gap-3"><span className="text-slate-400">Elérhető</span><span className={line.availableQty > 0 ? "text-emerald-700" : "text-rose-700"}>{line.availableQty}</span></div>
                                    </div>
                                  ) : <span className="text-xs text-slate-400">Nincs kapcsolat</span>}
                                </td>
                                <td className="px-3 py-3">
                                  {line.stockLocations.length ? (
                                    <div className="flex max-w-[300px] flex-wrap gap-1.5">
                                      {line.stockLocations.map((location) => (
                                        <span key={location.locationId || location.locationCode} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600" title={`Foglalt: ${location.reservedQty}`}>
                                          {location.locationName}: <span className="text-slate-900">{location.qty}</span>
                                        </span>
                                      ))}
                                    </div>
                                  ) : <span className="text-xs text-slate-400">Nincs készletsor</span>}
                                </td>
                                <td className="px-3 py-3">
                                  {line.mapped ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Rendben</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700"><AlertTriangle className="h-4 w-4" /> Nincs párosítva</span>
                                  )}
                                  {line.mappedVariantId && <button type="button" onClick={() => void copyText(line.mappedVariantId)} className="mt-2 flex max-w-[190px] items-center gap-1 truncate font-mono text-[10px] text-slate-400 hover:text-slate-700" title="AllIn variánsazonosító másolása"><Copy className="h-3 w-3 shrink-0" />{line.mappedVariantId}</button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-800"><RotateCcw className="h-4 w-4 text-rose-600" /> Visszatérítések</div>
                      <div className="text-xs text-slate-500">{detailData.refunds.length}</div>
                    </div>
                    {detailData.refunds.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-400">Ehhez a rendeléshez nincs visszatérítés.</div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {detailData.refunds.map((refund, index) => {
                          const item = asRecord(refund);
                          const refundLines = asArray<AifShopifyRefundLine>(firstValue(item.lines, item.refund_lines) || []);
                          const refundAmount = numberValue(item.amount, item.total_amount, item.refund_amount);
                          return (
                            <div key={textValue(item.id, item.shopify_refund_id, index)} className="p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm text-slate-900">Refund #{textValue(item.shopify_refund_legacy_id, item.shopify_refund_id, item.id, index + 1)}</span>
                                    {item.status && <Badge value={textValue(item.status)} />}
                                    {boolValue(item.restock) && <Badge value="restocked" />}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-400">{dateTime(textValue(item.shopify_created_at, item.processed_at, item.created_at))}</div>
                                  {textValue(item.reason, item.note) && <div className="mt-2 text-sm text-slate-600">{textValue(item.reason, item.note)}</div>}
                                </div>
                                <div className="text-sm text-rose-700">{money(refundAmount, textValue(item.currency_code, item.currency, detailOrder.currency))}</div>
                              </div>
                              {refundLines.length > 0 && (
                                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                  {refundLines.map((refundLine, lineIndex) => {
                                    const line = asRecord(refundLine);
                                    return (
                                      <div key={textValue(line.id, line.shopify_refund_line_id, lineIndex)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                        <div className="text-slate-700">{textValue(line.title, line.sku, "Terméksor")}</div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-400">
                                          <span>Db: {integerValue(line.quantity)}</span>
                                          {textValue(line.restock_type) && <span>Restock: {textValue(line.restock_type)}</span>}
                                          {textValue(line.shopify_location_id) && <span className="max-w-[220px] truncate">Hely: {textValue(line.shopify_location_id)}</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-800"><Globe2 className="h-4 w-4 text-sky-600" /> Kapcsolódó Shopify események</div>
                      <div className="text-xs text-slate-500">{detailData.events.length}</div>
                    </div>
                    {detailData.events.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-400">Ehhez a rendeléshez nincs megjeleníthető webhook esemény.</div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {detailData.events.map((event, index) => {
                          const item = asRecord(event);
                          return (
                            <div key={textValue(item.id, item.shopify_webhook_id, index)} className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[240px_125px_80px_1fr]">
                              <div>
                                <div className="text-slate-800">{textValue(item.topic, "ismeretlen")}</div>
                                <div className="mt-0.5 text-slate-400">{dateTime(textValue(item.received_at, item.created_at))}</div>
                              </div>
                              <div><Badge value={textValue(item.status)} /></div>
                              <div className="text-slate-500">Próba: {integerValue(item.attempts)}</div>
                              <div className={item.error ? "text-rose-700" : "text-slate-500"}>{textValue(item.error, "Nincs hiba")}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 text-sm text-slate-800"><ShieldCheck className="h-4 w-4 text-[#176b5b]" /> Adat- és készletbiztonság</div>
                        <div className="mt-1 text-xs text-slate-500">A rendelési modul csak a Shopify rendelés AllIn-másolatát kezeli. A készletet kizárólag az inventory webhook szinkronizálja.</div>
                      </div>
                      <button type="button" className={buttonClass} onClick={() => void copyText(detailOrder.id)}><Copy className="h-4 w-4" /> Rendelés ID másolása</button>
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDeleteDialog(); }}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/30">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700"><Trash2 className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-lg font-medium text-slate-900">Végleges törlés az AllInből</h3>
                  <p className="mt-1 text-sm text-slate-500">{deleteTarget.ids.length} rendelési rekord és kapcsolódó AllIn-rendelési előzmény törlődik.</p>
                </div>
              </div>
              <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={closeDeleteDialog} disabled={deleteLoading}><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-medium">Mit töröl és mit nem?</div><div className="mt-1">Az AllIn rendelésfej, terméksorok, refundok és a hozzájuk tartozó rendelési webhook-előzmények törlődnek. A Shopify eredeti rendelése, az AllIn készlet, a készletmozgások és az inventory webhookok változatlanok maradnak.</div></div></div>
              </div>

              <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {deleteTarget.labels.slice(0, 20).map((label) => <div key={label} className="py-0.5">{label}</div>)}
                {deleteTarget.labels.length > 20 && <div className="mt-1 text-xs text-slate-400">+ {deleteTarget.labels.length - 20} további rendelés</div>}
              </div>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Törlés oka</span>
                <input className={`${fieldClass} w-full`} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Például: tesztadat vagy hibás rekord" />
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                <input type="checkbox" checked={deleteAcknowledged} onChange={(event) => setDeleteAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-rose-600" />
                <span>Tudomásul vettem, hogy ez végleges AllIn-törlés. A készletet a művelet nem módosítja.</span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">Megerősítésként írd be: <span className="font-medium text-slate-800">TÖRLÉS</span></span>
                <input className={`${fieldClass} w-full`} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" />
              </label>

              {deleteError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{deleteError}</div>}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" className={buttonClass} onClick={closeDeleteDialog} disabled={deleteLoading}>Mégse</button>
              <button
                type="button"
                className={dangerButtonClass}
                onClick={() => void confirmPermanentDelete()}
                disabled={deleteLoading || !deleteAcknowledged || !["TÖRLÉS", "TORLES", "DELETE"].includes(deleteConfirmation.trim().toUpperCase()) || !deleteReason.trim()}
              >
                {deleteLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleteLoading ? "Törlés..." : `Végleg törlöm (${deleteTarget.ids.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
