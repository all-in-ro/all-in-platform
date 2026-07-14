import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Mail,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
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

type DisplayOrder = {
  source: AifShopifyOrderSummary;
  id: string;
  number: string;
  createdAt: string | null;
  customer: string;
  email: string;
  phone: string;
  amount: number | null;
  currency: string;
  status: string;
  financialStatus: string;
  fulfillmentStatus: string;
  lineCount: number;
  mappedLineCount: number;
  unmappedLineCount: number;
  refundCount: number;
  refundedAmount: number;
  isTest: boolean;
};

const fieldClass =
  "h-9 rounded-lg border border-white/15 bg-[#252d3a] px-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#5fc4a7]/70 focus:ring-2 focus:ring-[#5fc4a7]/15 font-normal";

const buttonClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-white/90 transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 font-normal";

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
    if (["1", "true", "yes", "igen"].includes(normalized)) return true;
    if (["0", "false", "no", "nem"].includes(normalized)) return false;
  }
  return false;
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
  const joined = [customer.first_name, customer.last_name].map((x) => textValue(x)).filter(Boolean).join(" ");
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
  const price = numberValue(raw.price, raw.unit_price, raw.original_price);
  const discount = numberValue(raw.total_discount, raw.discount, raw.discount_amount) || 0;
  return {
    source,
    id: textValue(raw.id, raw.shopify_line_item_id, raw.shopifyLineItemId),
    title: textValue(raw.title, raw.name, raw.product_title, "Névtelen termék"),
    variantTitle: textValue(raw.variant_title, raw.variantTitle),
    sku: textValue(raw.sku, raw.shopify_sku, raw.internal_sku),
    allInTitle: textValue(raw.allin_title, raw.allInTitle, raw.title_ro, raw.aif_title),
    allInSku: textValue(raw.internal_sku, raw.aif_internal_sku),
    color: textValue(raw.color_name, raw.color, raw.option1),
    size: textValue(raw.size, raw.option2),
    quantity,
    price,
    discount,
    fulfillmentStatus: textValue(raw.fulfillment_status, raw.fulfillmentStatus, "unfulfilled"),
    mappedVariantId,
    mapped,
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
  const refundedAmount = numberValue(source.total_refunded, source.refunded_amount, raw.total_refunded) || 0;

  return {
    source: order,
    id: textValue(source.id, source.shopify_order_id, source.shopify_graphql_id),
    number: number || "Rendelés",
    createdAt: textValue(source.processed_at, source.created_at, raw.processed_at, raw.created_at) || null,
    customer: customerName(order),
    email: textValue(source.customer_email, source.email, asRecord(raw.customer).email, raw.email),
    phone: textValue(source.customer_phone, source.phone, asRecord(raw.customer).phone, raw.phone),
    amount: numberValue(source.total_price, source.total_amount, source.amount, raw.total_price),
    currency: textValue(source.currency, raw.currency, "RON").toUpperCase(),
    status,
    financialStatus,
    fulfillmentStatus,
    lineCount,
    mappedLineCount,
    unmappedLineCount,
    refundCount: integerValue(source.refund_count, source.refundCount, refunds.length, refundedAmount > 0 ? 1 : 0),
    refundedAmount,
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
    error: "Hiba",
    failed: "Sikertelen",
    unknown: "Ismeretlen",
  };
  return labels[normalized] || normalized.replace(/_/g, " ") || "-";
}

function badgeClass(value?: string | null): string {
  const normalized = textValue(value).toLowerCase();
  if (["paid", "fulfilled", "processed", "closed", "restocked"].includes(normalized)) {
    return "border-emerald-300/30 bg-emerald-400/15 text-emerald-100";
  }
  if (["cancelled", "refunded", "voided", "error", "failed"].includes(normalized)) {
    return "border-rose-300/30 bg-rose-400/15 text-rose-100";
  }
  if (["partial", "partially_fulfilled", "partially_paid", "partially_refunded", "pending", "authorized"].includes(normalized)) {
    return "border-amber-300/30 bg-amber-300/15 text-amber-100";
  }
  return "border-white/15 bg-white/[0.07] text-white/75";
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
    <span className="inline-flex min-h-6 items-center rounded-full border border-sky-300/35 bg-sky-300/15 px-2 py-0.5 text-[11px] text-sky-100 font-normal">
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
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.045] p-3.5">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-white/55">
        {icon}
        <span>{title}</span>
      </div>
      <div className="space-y-1 text-sm text-white/85">{children}</div>
    </section>
  );
}

function eventStatusClass(status?: string | null) {
  const normalized = textValue(status).toLowerCase();
  if (["error", "failed"].includes(normalized)) return "border-rose-400/30 bg-rose-400/10";
  if (normalized === "processed") return "border-emerald-400/25 bg-emerald-400/10";
  return "border-white/10 bg-white/[0.04]";
}

export default function AllInShopifyOrders({ role }: Props) {
  const [orders, setOrders] = useState<AifShopifyOrderSummary[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [limit, setLimit] = useState(100);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  const [selected, setSelected] = useState<DisplayOrder | null>(null);
  const [detail, setDetail] = useState<AifShopifyOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [events, setEvents] = useState<AifShopifyOrderEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");

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
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelected(null);
        setDetail(null);
        setDetailError("");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [selected]);

  useEffect(() => {
    if (!diagnosticsOpen || role !== "admin" || eventsLoading || events.length) return;
    setEventsLoading(true);
    setEventsError("");
    apiAifListShopifyOrderEvents({ limit: 50 })
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
      if (!order.createdAt || (fromTime === null && toTime === null)) return true;
      const created = new Date(order.createdAt).getTime();
      if (!Number.isFinite(created)) return true;
      if (fromTime !== null && created < fromTime) return false;
      if (toTime !== null && created > toTime) return false;
      return true;
    });
  }, [normalizedOrders, onlyProblems, fromDate, toDate]);

  const overview = useMemo(() => {
    return normalizedOrders.reduce(
      (acc, order) => {
        if (order.status.toLowerCase() === "open") acc.open += 1;
        if (order.unmappedLineCount > 0) acc.problem += 1;
        if (order.refundCount > 0 || order.refundedAmount > 0) acc.refund += 1;
        if (order.isTest) acc.test += 1;
        return acc;
      },
      { open: 0, problem: 0, refund: 0, test: 0 }
    );
  }, [normalizedOrders]);

  const diagnostics = useMemo(() => {
    const failed = events.filter((event) => ["error", "failed"].includes(textValue(asRecord(event).status).toLowerCase())).length;
    const pending = events.filter((event) => textValue(asRecord(event).status).toLowerCase() === "pending").length;
    return { failed, pending };
  }, [events]);

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

  const detailData = selected && detail ? normalizeDetail(detail, selected.source) : null;
  const detailOrder = detailData ? normalizeOrder(detailData.order) : selected;
  const detailRaw = detailData ? rawOrder(detailData.order) : selected ? rawOrder(selected.source) : {};
  const shippingAddress = detailData
    ? firstValue(asRecord(detailData.order).shipping_address, asRecord(detailData.order).shippingAddress, detailRaw.shipping_address)
    : null;
  const billingAddress = detailData
    ? firstValue(asRecord(detailData.order).billing_address, asRecord(detailData.order).billingAddress, detailRaw.billing_address)
    : null;
  const detailLines = detailData?.lines.map(normalizeLine) || [];

  return (
    <div className="min-h-screen bg-[#474c59] px-3 py-4 text-white sm:px-5 lg:px-7">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="rounded-2xl border border-white/12 bg-[#303946] px-4 py-3 shadow-lg shadow-black/10">
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
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-[#74d1b5]" />
                  <h1 className="truncate text-lg font-medium tracking-wide sm:text-xl">SHOPIFY RENDELÉSEK</h1>
                </div>
                <p className="mt-0.5 text-xs text-white/50">Rendelések, termékpárosítások és visszatérítések</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {role === "admin" && (
                <button
                  type="button"
                  className={`${buttonClass} ${diagnosticsOpen ? "border-amber-300/35 bg-amber-300/10 text-amber-100" : ""}`}
                  onClick={() => setDiagnosticsOpen((value) => !value)}
                >
                  <Bug className="h-4 w-4" />
                  Diagnosztika
                </button>
              )}
              <button
                type="button"
                className={`${buttonClass} border-[#5fc4a7]/35 bg-[#2f7d69]/55 hover:bg-[#2f7d69]/75`}
                onClick={() => {
                  setRefreshToken((value) => value + 1);
                  if (diagnosticsOpen && role === "admin") {
                    setEvents([]);
                  }
                }}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Frissítés
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-[#303946] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.12em] text-white/45">Betöltött rendelések</div>
            <div className="mt-1 text-2xl font-medium">{normalizedOrders.length}</div>
          </div>
          <div className="rounded-xl border border-emerald-300/15 bg-[#303946] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.12em] text-white/45">Nyitott</div>
            <div className="mt-1 text-2xl font-medium text-emerald-100">{overview.open}</div>
          </div>
          <div className="rounded-xl border border-amber-300/15 bg-[#303946] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.12em] text-white/45">Párosítási hiba</div>
            <div className="mt-1 text-2xl font-medium text-amber-100">{overview.problem}</div>
          </div>
          <div className="rounded-xl border border-sky-300/15 bg-[#303946] px-4 py-3">
            <div className="text-xs uppercase tracking-[0.12em] text-white/45">Refundos / teszt</div>
            <div className="mt-1 flex items-baseline gap-2 text-2xl font-medium">
              <span>{overview.refund}</span>
              <span className="text-sm text-white/40">/ {overview.test}</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#303946] p-3 sm:p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_160px_145px_145px_110px_auto] xl:items-end">
            <label className="relative block md:col-span-2 xl:col-span-1">
              <span className="sr-only">Keresés</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                className={`${fieldClass} w-full pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rendelésszám, vevő, e-mail vagy SKU"
              />
            </label>

            <select className={`${fieldClass} w-full`} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Rendelés állapota">
              <option value="">Minden állapot</option>
              <option value="open">Nyitott</option>
              <option value="closed">Lezárt</option>
              <option value="cancelled">Törölt</option>
            </select>

            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.08em] text-white/35 xl:hidden">Dátumtól</span>
              <input type="date" className={`${fieldClass} w-full`} value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Dátumtól" />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.08em] text-white/35 xl:hidden">Dátumig</span>
              <input type="date" className={`${fieldClass} w-full`} value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Dátumig" />
            </label>

            <select className={`${fieldClass} w-full`} value={limit} onChange={(event) => setLimit(Number(event.target.value))} aria-label="Betöltött sorok száma">
              <option value={50}>50 sor</option>
              <option value={100}>100 sor</option>
              <option value={200}>200 sor</option>
            </select>

            <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white/75">
              <input
                type="checkbox"
                checked={onlyProblems}
                onChange={(event) => setOnlyProblems(event.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-transparent accent-[#5fc4a7]"
              />
              Csak párosítási hibák
            </label>
          </div>
        </section>

        {diagnosticsOpen && role === "admin" && (
          <section className="rounded-2xl border border-amber-300/20 bg-[#303946] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Bug className="h-4 w-4 text-amber-200" />
                  Shopify rendelési webhook diagnosztika
                </div>
                <div className="mt-1 text-xs text-white/45">Az utolsó 50 rendelési esemény</div>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full border border-rose-300/25 bg-rose-300/10 px-2 py-1 text-rose-100">Hiba: {diagnostics.failed}</span>
                <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-amber-100">Függőben: {diagnostics.pending}</span>
              </div>
            </div>

            {eventsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-white/55">
                <RefreshCw className="h-4 w-4 animate-spin" /> Események betöltése...
              </div>
            ) : eventsError ? (
              <div className="rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{eventsError}</div>
            ) : events.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-3 text-sm text-white/50">Nincs megjeleníthető esemény.</div>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {events.map((event, index) => {
                  const item = asRecord(event);
                  const eventStatus = textValue(item.status, "unknown");
                  return (
                    <div key={textValue(item.id, item.webhook_id, index)} className={`grid gap-2 rounded-lg border px-3 py-2 text-xs md:grid-cols-[220px_120px_70px_1fr] ${eventStatusClass(eventStatus)}`}>
                      <div>
                        <div className="text-white/85">{textValue(item.topic, "ismeretlen téma")}</div>
                        <div className="mt-0.5 text-white/35">{dateTime(textValue(item.received_at, item.created_at))}</div>
                      </div>
                      <div><Badge value={eventStatus} /></div>
                      <div className="text-white/55">Próba: {integerValue(item.attempts)}</div>
                      <div className={item.error ? "text-rose-100" : "text-white/45"}>{textValue(item.error, "Nincs hiba")}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#303946]">
          {error && (
            <div className="m-4 flex items-start gap-2 rounded-xl border border-rose-300/25 bg-rose-300/10 px-3 py-3 text-sm text-rose-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-white/55">
              <RefreshCw className="h-5 w-5 animate-spin" /> Shopify rendelések betöltése...
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
              <ShoppingBag className="h-9 w-9 text-white/20" />
              <div className="mt-3 text-sm text-white/65">Nincs a szűrésnek megfelelő rendelés.</div>
              <div className="mt-1 text-xs text-white/35">A lista automatikusan frissül a keresés és a státusz alapján.</div>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                  <thead className="bg-[#252d3a] text-[11px] uppercase tracking-[0.08em] text-white/45">
                    <tr>
                      <th className="px-4 py-3 font-normal">Rendelés</th>
                      <th className="px-3 py-3 font-normal">Dátum</th>
                      <th className="px-3 py-3 font-normal">Vevő</th>
                      <th className="px-3 py-3 text-right font-normal">Összeg</th>
                      <th className="px-3 py-3 font-normal">Fizetés</th>
                      <th className="px-3 py-3 font-normal">Teljesítés</th>
                      <th className="px-3 py-3 text-center font-normal">Tételek</th>
                      <th className="px-3 py-3 text-center font-normal">Refund</th>
                      <th className="px-3 py-3 font-normal">AllIn párosítás</th>
                      <th className="w-12 px-3 py-3 font-normal" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.07]">
                    {visibleOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="cursor-pointer bg-white/[0.015] transition hover:bg-white/[0.06]"
                        onClick={() => void openOrder(order)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-white">{order.number}</span>
                            {order.isTest && <TestBadge />}
                            <Badge value={order.status} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-white/60">{dateTime(order.createdAt)}</td>
                        <td className="max-w-[240px] px-3 py-3">
                          <div className="truncate text-white/85">{order.customer}</div>
                          <div className="truncate text-xs text-white/35">{order.email || order.phone || "-"}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-white/90">{money(order.amount, order.currency)}</td>
                        <td className="px-3 py-3"><Badge value={order.financialStatus} /></td>
                        <td className="px-3 py-3"><Badge value={order.fulfillmentStatus} /></td>
                        <td className="px-3 py-3 text-center text-white/75">{order.lineCount}</td>
                        <td className="px-3 py-3 text-center">
                          {order.refundCount > 0 || order.refundedAmount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-100">
                              <RotateCcw className="h-3.5 w-3.5" /> {order.refundCount || 1}
                            </span>
                          ) : (
                            <span className="text-white/25">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {order.unmappedLineCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">
                              <AlertTriangle className="h-3.5 w-3.5" /> {order.unmappedLineCount} nincs párosítva
                            </span>
                          ) : order.lineCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-100">
                              <CheckCircle2 className="h-4 w-4" /> {order.mappedLineCount}/{order.lineCount}
                            </span>
                          ) : (
                            <span className="text-xs text-white/30">Nincs tétel</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right"><ChevronRight className="h-4 w-4 text-white/30" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-white/[0.07] md:hidden">
                {visibleOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    className="block w-full bg-white/[0.015] p-4 text-left transition hover:bg-white/[0.06]"
                    onClick={() => void openOrder(order)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{order.number}</span>
                          {order.isTest && <TestBadge />}
                          <Badge value={order.status} />
                        </div>
                        <div className="mt-1 truncate text-sm text-white/65">{order.customer}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm text-white/90">{money(order.amount, order.currency)}</div>
                        <div className="mt-1 text-xs text-white/35">{dateTime(order.createdAt)}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge value={order.financialStatus} />
                      <Badge value={order.fulfillmentStatus} />
                      <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/55">{order.lineCount} tétel</span>
                      {order.unmappedLineCount > 0 && (
                        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">{order.unmappedLineCount} nincs párosítva</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-2 backdrop-blur-sm sm:p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDetail();
          }}
        >
          <div className="flex max-h-[94vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#252d3a] shadow-2xl shadow-black/40">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-[#303946] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-[#74d1b5]" />
                  <h2 className="truncate text-lg font-medium">{detailOrder?.number || selected.number}</h2>
                  {detailOrder?.isTest && <TestBadge />}
                  <Badge value={detailOrder?.status} />
                </div>
                <div className="mt-1 text-xs text-white/45">{dateTime(detailOrder?.createdAt)}</div>
              </div>
              <button type="button" className={`${buttonClass} h-8 w-8 px-0`} onClick={closeDetail} aria-label="Bezárás">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 sm:p-5">
              {detailLoading ? (
                <div className="flex min-h-72 items-center justify-center gap-3 text-sm text-white/55">
                  <RefreshCw className="h-5 w-5 animate-spin" /> Rendelés részleteinek betöltése...
                </div>
              ) : detailError ? (
                <div className="flex min-h-48 items-center justify-center">
                  <div className="max-w-xl rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
                    {detailError}
                  </div>
                </div>
              ) : detailData && detailOrder ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <DetailCard icon={<User className="h-4 w-4" />} title="Vevő">
                      <div className="text-white">{detailOrder.customer}</div>
                      {detailOrder.email && <div className="flex items-center gap-2 text-white/60"><Mail className="h-3.5 w-3.5" /> {detailOrder.email}</div>}
                      {detailOrder.phone && <div className="flex items-center gap-2 text-white/60"><Phone className="h-3.5 w-3.5" /> {detailOrder.phone}</div>}
                    </DetailCard>

                    <DetailCard icon={<MapPin className="h-4 w-4" />} title="Szállítási cím">
                      {formatAddress(shippingAddress).length ? formatAddress(shippingAddress).map((line, index) => <div key={`${line}-${index}`}>{line}</div>) : <div className="text-white/35">Nincs megadva</div>}
                    </DetailCard>

                    <DetailCard icon={<MapPin className="h-4 w-4" />} title="Számlázási cím">
                      {formatAddress(billingAddress).length ? formatAddress(billingAddress).map((line, index) => <div key={`${line}-${index}`}>{line}</div>) : <div className="text-white/35">Nincs megadva</div>}
                    </DetailCard>

                    <DetailCard icon={<CreditCard className="h-4 w-4" />} title="Összeg és állapot">
                      <div className="flex items-center justify-between gap-3"><span className="text-white/50">Végösszeg</span><span className="text-white">{money(detailOrder.amount, detailOrder.currency)}</span></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-white/50">Fizetés</span><Badge value={detailOrder.financialStatus} /></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-white/50">Teljesítés</span><Badge value={detailOrder.fulfillmentStatus} /></div>
                      {detailOrder.refundedAmount > 0 && <div className="flex items-center justify-between gap-3"><span className="text-white/50">Visszatérítve</span><span className="text-amber-100">{money(detailOrder.refundedAmount, detailOrder.currency)}</span></div>}
                    </DetailCard>
                  </div>

                  <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium"><Package className="h-4 w-4 text-[#74d1b5]" /> Terméksorok</div>
                      <div className="text-xs text-white/45">{detailLines.length} sor, {detailLines.filter((line) => !line.mapped).length} párosítatlan</div>
                    </div>
                    {detailLines.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-white/40">Nincs terméksor.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[920px] text-left text-sm">
                          <thead className="bg-white/[0.035] text-[11px] uppercase tracking-[0.08em] text-white/40">
                            <tr>
                              <th className="px-4 py-2.5 font-normal">Shopify termék</th>
                              <th className="px-3 py-2.5 font-normal">SKU</th>
                              <th className="px-3 py-2.5 font-normal">AllIn termék</th>
                              <th className="px-3 py-2.5 text-center font-normal">Db</th>
                              <th className="px-3 py-2.5 text-right font-normal">Egységár</th>
                              <th className="px-3 py-2.5 font-normal">Teljesítés</th>
                              <th className="px-3 py-2.5 font-normal">Párosítás</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.07]">
                            {detailLines.map((line, index) => (
                              <tr key={line.id || `${line.sku}-${index}`}>
                                <td className="px-4 py-3">
                                  <div className="text-white/90">{line.title}</div>
                                  <div className="mt-0.5 text-xs text-white/35">{[line.variantTitle, line.color, line.size].filter(Boolean).join(" / ") || "-"}</div>
                                </td>
                                <td className="px-3 py-3 font-mono text-xs text-white/65">{line.sku || "-"}</td>
                                <td className="px-3 py-3">
                                  <div className={line.mapped ? "text-white/80" : "text-amber-100"}>{line.allInTitle || (line.mapped ? line.allInSku || "Párosítva" : "Nincs AllIn termék")}</div>
                                  {line.mappedVariantId && <div className="mt-0.5 max-w-[240px] truncate font-mono text-[10px] text-white/30">{line.mappedVariantId}</div>}
                                </td>
                                <td className="px-3 py-3 text-center text-white/75">{line.quantity}</td>
                                <td className="px-3 py-3 text-right text-white/85">{money(line.price, detailOrder.currency)}</td>
                                <td className="px-3 py-3"><Badge value={line.fulfillmentStatus} /></td>
                                <td className="px-3 py-3">
                                  {line.mapped ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-100"><CheckCircle2 className="h-4 w-4" /> Rendben</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-100"><AlertTriangle className="h-4 w-4" /> Nincs párosítva</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
                    <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-medium"><RotateCcw className="h-4 w-4 text-amber-200" /> Visszatérítések</div>
                      <div className="text-xs text-white/45">{detailData.refunds.length}</div>
                    </div>
                    {detailData.refunds.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-white/40">Ehhez a rendeléshez nincs refund.</div>
                    ) : (
                      <div className="divide-y divide-white/[0.07]">
                        {detailData.refunds.map((refund, index) => {
                          const item = asRecord(refund);
                          const refundLines = asArray<AifShopifyRefundLine>(firstValue(item.lines, item.refund_lines) || []);
                          const refundAmount = numberValue(item.amount, item.total_amount, item.refund_amount);
                          return (
                            <div key={textValue(item.id, item.shopify_refund_id, index)} className="p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm text-white/90">Refund #{textValue(item.shopify_refund_id, item.id, index + 1)}</span>
                                    {item.status && <Badge value={textValue(item.status)} />}
                                    {boolValue(item.restock) && <Badge value="restocked" />}
                                  </div>
                                  <div className="mt-1 text-xs text-white/40">{dateTime(textValue(item.processed_at, item.created_at))}</div>
                                  {textValue(item.reason, item.note) && <div className="mt-2 text-sm text-white/60">{textValue(item.reason, item.note)}</div>}
                                </div>
                                <div className="text-sm text-amber-100">{money(refundAmount, textValue(item.currency, detailOrder.currency))}</div>
                              </div>
                              {refundLines.length > 0 && (
                                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                  {refundLines.map((refundLine, lineIndex) => {
                                    const line = asRecord(refundLine);
                                    return (
                                      <div key={textValue(line.id, line.shopify_refund_line_id, lineIndex)} className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs">
                                        <div className="text-white/75">{textValue(line.title, line.sku, "Terméksor")}</div>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-white/40">
                                          <span>Db: {integerValue(line.quantity)}</span>
                                          {textValue(line.restock_type) && <span>Restock: {textValue(line.restock_type)}</span>}
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

                  {detailData.events.length > 0 && (
                    <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
                      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm font-medium"><Truck className="h-4 w-4 text-sky-200" /> Kapcsolódó webhook események</div>
                      <div className="divide-y divide-white/[0.07]">
                        {detailData.events.map((event, index) => {
                          const item = asRecord(event);
                          return (
                            <div key={textValue(item.id, index)} className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[220px_130px_1fr]">
                              <div><div className="text-white/80">{textValue(item.topic, "ismeretlen")}</div><div className="mt-0.5 text-white/35">{dateTime(textValue(item.received_at, item.created_at))}</div></div>
                              <div><Badge value={textValue(item.status)} /></div>
                              <div className={item.error ? "text-rose-100" : "text-white/40"}>{textValue(item.error, "Nincs hiba")}</div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
